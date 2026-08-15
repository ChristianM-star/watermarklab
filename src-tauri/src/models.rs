//! Model Registry and Streaming SHA-256 Digest Verification

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisteredModel {
    pub logical_id: String,
    pub name: String,
    pub filename: String,
    pub expected_sha256: String,
    pub size_bytes: u64,
    pub quantization: String,
    pub task_type: String,
    pub memory_required_mb: u32,
    pub is_available: bool,
    pub verified_digest: Option<String>,
}

pub struct ModelManager {
    models_dir: PathBuf,
}

impl ModelManager {
    pub fn new(models_dir: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&models_dir);
        Self { models_dir }
    }

    /// Stream a real file from disk through SHA-256 in 64 KB chunks
    pub fn compute_file_sha256<P: AsRef<Path>>(path: P) -> Result<String, String> {
        let file = File::open(path.as_ref())
            .map_err(|e| format!("Cannot open model file: {}", e))?;
        let mut reader = BufReader::with_capacity(65536, file);
        let mut hasher = Sha256::new();
        let mut buffer = [0u8; 65536];

        loop {
            let bytes_read = reader
                .read(&mut buffer)
                .map_err(|e| format!("Error reading model binary: {}", e))?;
            if bytes_read == 0 {
                break;
            }
            hasher.update(&buffer[..bytes_read]);
        }

        let hash_result = hasher.finalize();
        Ok(hex::encode(hash_result))
    }

    pub fn model_path_for(&self, filename: &str) -> Result<PathBuf, String> {
        if filename.contains('\\') || filename.contains('/') || filename == "." || filename == ".." {
            return Err("FILESYSTEM_BLOCKED: model filename must be a simple file name".into());
        }
        Ok(self.models_dir.join(filename))
    }

    pub fn verify_model_integrity_path(
        &self,
        model_path_str: &str,
        expected_sha256: &str,
    ) -> Result<String, String> {
        if expected_sha256.len() != 64 || !expected_sha256.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err("MODEL_DIGEST_NOT_CONFIGURED: expected SHA-256 must be a 64-character hexadecimal digest".into());
        }
        let model_path = PathBuf::from(model_path_str);
        if !model_path.exists() {
            return Err(format!(
                "MODEL_NOT_FOUND: Model file {:?} is not present on disk. Please import the verified model binary.",
                model_path.display()
            ));
        }

        let computed_digest = Self::compute_file_sha256(&model_path)?;

        if !computed_digest.eq_ignore_ascii_case(expected_sha256) {
            return Err(format!(
                "MODEL_INTEGRITY_VIOLATION: SHA-256 digest mismatch for model {:?}. Expected: {}, Computed: {}. Model will not be loaded.",
                filename, expected_sha256, computed_digest
            ));
        }

        Ok(computed_digest)
    }
}
