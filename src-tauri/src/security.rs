//! Real Security Policies, Path Canonicalization, and Sandboxing Checks

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeSecurityStatus {
    pub network: NetworkStatus,
    pub filesystem: FilesystemStatus,
    pub cryptography: CryptoStatus,
    pub platform: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkStatus {
    pub status: String,
    pub mechanism: String,
    pub sockets_allowed: bool,
    pub details: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilesystemStatus {
    pub status: String,
    pub mechanism: String,
    pub allowed_roots: Vec<String>,
    pub details: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CryptoStatus {
    pub kdf: String,
    pub memory_cost_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
    pub cipher: String,
}

pub struct SecurityManager {
    allowed_roots: Vec<PathBuf>,
}

impl SecurityManager {
    pub fn new() -> Self {
        let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let models_dir = current_dir.join("models");
        let cache_dir = current_dir.join("cache");
        let sidecar_dir = current_dir.join("sidecar");

        let _ = std::fs::create_dir_all(&models_dir);
        let _ = std::fs::create_dir_all(&cache_dir);

        Self {
            allowed_roots: vec![
                std::fs::canonicalize(&models_dir).unwrap_or(models_dir),
                std::fs::canonicalize(&cache_dir).unwrap_or(cache_dir),
                std::fs::canonicalize(&sidecar_dir).unwrap_or(sidecar_dir),
            ],
        }
    }

    /// Canonicalize path and verify it stays inside allowed roots
    pub fn validate_and_canonicalize_path<P: AsRef<Path>>(&self, path: P) -> Result<PathBuf, String> {
        let p = path.as_ref();
        
        // Disallow null bytes
        if p.to_string_lossy().contains('\0') {
            return Err("FILESYSTEM_BLOCKED: Null byte detected in path".to_string());
        }

        // Canonicalize path to resolve symlinks and '..' components
        let canonical = match std::fs::canonicalize(p) {
            Ok(c) => c,
            Err(_) => {
                // If file doesn't exist yet, canonicalize parent and join
                if let Some(parent) = p.parent() {
                    let canon_parent = std::fs::canonicalize(parent)
                        .map_err(|e| format!("FILESYSTEM_BLOCKED: Cannot resolve parent directory: {}", e))?;
                    if let Some(filename) = p.file_name() {
                        canon_parent.join(filename)
                    } else {
                        canon_parent
                    }
                } else {
                    return Err("FILESYSTEM_BLOCKED: Path could not be resolved".to_string());
                }
            }
        };

        // Check if canonical path starts with any allowed root
        let is_allowed = self.allowed_roots.iter().any(|root| canonical.starts_with(root));

        if !is_allowed {
            return Err(format!(
                "FILESYSTEM_BLOCKED: Path {:?} is outside approved sandbox roots: {:?}",
                canonical, self.allowed_roots
            ));
        }

        Ok(canonical)
    }

    /// Query actual runtime security status based on OS platform capabilities
    pub fn get_runtime_security_status(&self, network_isolated: bool) -> RuntimeSecurityStatus {
        let platform = std::env::consts::OS.to_string();

        let network = if network_isolated {
            NetworkStatus {
                status: "enforced".to_string(),
                mechanism: "linux network namespace + stdio IPC".to_string(),
                sockets_allowed: false,
                details: "The sidecar process was launched inside an isolated network namespace.".to_string(),
            }
        } else {
            NetworkStatus {
                status: "partial".to_string(),
                mechanism: "CSP + stdio IPC; OS network isolation unavailable".to_string(),
                sockets_allowed: true,
                details: "The application does not claim kernel-level network isolation on this host. An OS firewall/sandbox is required for a hard no-network guarantee.".to_string(),
            }
        };

        let filesystem = FilesystemStatus {
            status: "partial".to_string(),
            mechanism: "canonical-path-allowlist".to_string(),
            allowed_roots: self.allowed_roots.iter().map(|p| p.to_string_lossy().to_string()).collect(),
            details: "All filesystem operations are resolved to absolute canonical paths and validated against allowlisted roots.".to_string(),
        };

        let cryptography = CryptoStatus {
            kdf: "Argon2id".to_string(),
            memory_cost_kib: 65536, // 64 MB
            iterations: 3,
            parallelism: 4,
            cipher: "AES-256-GCM (96-bit nonce)".to_string(),
        };

        RuntimeSecurityStatus {
            network,
            filesystem,
            cryptography,
            platform,
        }
    }
}
