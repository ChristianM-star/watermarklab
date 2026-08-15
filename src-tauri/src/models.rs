//! Model Registry, Streaming SHA-256 Digest Verification, and Resource Management

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufReader, Read, Write};
use std::path::{Path, PathBuf};

// ============================================================================
// Model Status
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ModelStatus {
    NotInstalled,
    Found,
    HashVerified,
    Incompatible,
    LoadFailed,
    Loaded,
    Unloaded,
}

impl ModelStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::NotInstalled => "NOT_INSTALLED",
            Self::Found => "FOUND",
            Self::HashVerified => "HASH_VERIFIED",
            Self::Incompatible => "INCOMPATIBLE",
            Self::LoadFailed => "LOAD_FAILED",
            Self::Loaded => "LOADED",
            Self::Unloaded => "UNLOADED",
        }
    }
}

// ============================================================================
// Model Record
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelRecord {
    pub logical_id: String,
    pub model_id: String,
    pub version: String,
    pub format: String,
    pub quantization: String,
    pub sha256: String,
    pub file_path: String,
    pub size_bytes: u64,
    pub license: String,
    pub supported_operations: Vec<String>,
    pub supported_languages: Vec<String>,
    pub context_length: u32,
    pub ram_requirement_mb: u32,
    pub vram_requirement_mb: u32,
    pub status: ModelStatus,
    pub verified_digest: Option<String>,
    pub description: String,
}

impl ModelRecord {
    pub fn new(
        logical_id: String,
        model_id: String,
        version: String,
        format: String,
        quantization: String,
        sha256: String,
        file_path: String,
        size_bytes: u64,
        license: String,
        supported_operations: Vec<String>,
        supported_languages: Vec<String>,
        context_length: u32,
        ram_requirement_mb: u32,
        vram_requirement_mb: u32,
        description: String,
    ) -> Self {
        Self {
            logical_id,
            model_id,
            version,
            format,
            quantization,
            sha256,
            file_path,
            size_bytes,
            license,
            supported_operations,
            supported_languages,
            context_length,
            ram_requirement_mb,
            vram_requirement_mb,
            status: ModelStatus::NotInstalled,
            verified_digest: None,
            description,
        }
    }
}

// ============================================================================
// Resource Usage Tracking
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceUsage {
    pub loaded_model: Option<String>,
    pub ram_estimate_mb: u32,
    pub vram_estimate_mb: u32,
    pub context_size: u32,
    pub active_requests: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceLimits {
    pub max_ram_mb: u32,
    pub max_vram_mb: u32,
    pub max_active_requests: u32,
}

impl Default for ResourceLimits {
    fn default() -> Self {
        Self {
            max_ram_mb: 16 * 1024,   // 16 GB
            max_vram_mb: 16 * 1024,  // 16 GB
            max_active_requests: 4,
        }
    }
}

// ============================================================================
// Model Registry
// ============================================================================

pub struct ModelManager {
    models_dir: PathBuf,
    registry_path: PathBuf,
    records: HashMap<String, ModelRecord>,
    loaded_models: HashMap<String, ResourceUsage>,
    resource_limits: ResourceLimits,
}

impl ModelManager {
    pub fn new(models_dir: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&models_dir);
        let registry_path = models_dir.join("model_registry.json");
        let mut mgr = Self {
            models_dir,
            registry_path,
            records: HashMap::new(),
            loaded_models: HashMap::new(),
            resource_limits: ResourceLimits::default(),
        };
        mgr.load_registry();
        mgr
    }

    fn load_registry(&mut self) {
        if !self.registry_path.exists() {
            return;
        }
        if let Ok(raw) = std::fs::read_to_string(&self.registry_path) {
            if let Ok(records) = serde_json::from_str::<Vec<ModelRecord>>(&raw) {
                for rec in records {
                    // Re-derive status from actual disk state
                    let mut rec = rec;
                    let path = PathBuf::from(&rec.file_path);
                    if !path.exists() {
                        rec.status = ModelStatus::NotInstalled;
                        rec.verified_digest = None;
                    } else if rec.verified_digest.is_some() {
                        rec.status = ModelStatus::HashVerified;
                    } else {
                        rec.status = ModelStatus::Found;
                    }
                    self.records.insert(rec.logical_id.clone(), rec);
                }
            }
        }
    }

    fn save_registry(&self) -> Result<(), String> {
        let records: Vec<&ModelRecord> = self.records.values().collect();
        let bytes = serde_json::to_vec_pretty(&records)
            .map_err(|e| format!("MODEL_REGISTRY_WRITE_FAILED: {e}"))?;
        let tmp = self.registry_path.with_extension("json.tmp");
        let mut file = File::create(&tmp)
            .map_err(|e| format!("MODEL_REGISTRY_WRITE_FAILED: {e}"))?;
        file.write_all(&bytes)
            .map_err(|e| format!("MODEL_REGISTRY_WRITE_FAILED: {e}"))?;
        file.sync_all()
            .map_err(|e| format!("MODEL_REGISTRY_WRITE_FAILED: {e}"))?;
        std::fs::rename(&tmp, &self.registry_path)
            .map_err(|e| format!("MODEL_REGISTRY_WRITE_FAILED: {e}"))
    }

    pub fn models_dir(&self) -> &PathBuf {
        &self.models_dir
    }

    pub fn resource_limits(&self) -> &ResourceLimits {
        &self.resource_limits
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

    /// Validate that a filename is a simple file name (no path separators)
    pub fn validate_filename(&self, filename: &str) -> Result<(), String> {
        if filename.is_empty()
            || filename.contains('\\')
            || filename.contains('/')
            || filename == "."
            || filename == ".."
            || filename.contains('\0')
        {
            return Err("FILESYSTEM_BLOCKED: model filename must be a simple file name".into());
        }
        Ok(())
    }

    /// Resolve a logical model ID to its canonical file path.
    /// This is the ONLY way the sidecar receives model paths.
    pub fn resolve_model_path(&self, logical_id: &str) -> Result<PathBuf, String> {
        let rec = self.records.get(logical_id)
            .ok_or_else(|| format!("MODEL_NOT_INSTALLED: Model '{logical_id}' is not registered"))?;
        let path = PathBuf::from(&rec.file_path);
        if !path.exists() {
            return Err(format!("MODEL_NOT_INSTALLED: Model file for '{logical_id}' is not present on disk"));
        }
        Ok(path)
    }

    /// Register a new model record (metadata only; does not verify hash)
    pub fn register_model(&mut self, record: ModelRecord) -> Result<(), String> {
        // Validate filename is safe
        let filename = Path::new(&record.file_path)
            .file_name()
            .and_then(|f| f.to_str())
            .ok_or_else(|| "MODEL_REGISTRY_ERROR: Invalid file path".to_string())?;
        self.validate_filename(filename)?;

        // Ensure the file path is inside the models directory
        let canonical_models = std::fs::canonicalize(&self.models_dir)
            .unwrap_or_else(|_| self.models_dir.clone());
        let file_path = PathBuf::from(&record.file_path);
        let canonical_file = std::fs::canonicalize(&file_path)
            .unwrap_or_else(|_| file_path.clone());
        if !canonical_file.starts_with(&canonical_models) {
            return Err("FILESYSTEM_BLOCKED: Model file must be inside the approved models directory".into());
        }

        self.records.insert(record.logical_id.clone(), record);
        self.save_registry()
    }

    /// Import a model file from a user-selected source path into the models directory.
    /// Computes SHA-256, compares against expected digest, and records verification.
    pub fn import_model(
        &mut self,
        source_path: &Path,
        expected_sha256: &str,
        logical_id: &str,
        model_id: &str,
        version: &str,
        format: &str,
        quantization: &str,
        license: &str,
        supported_operations: Vec<String>,
        supported_languages: Vec<String>,
        context_length: u32,
        ram_requirement_mb: u32,
        vram_requirement_mb: u32,
        description: &str,
    ) -> Result<ModelRecord, String> {
        // Validate expected digest format
        if expected_sha256.len() != 64 || !expected_sha256.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err("MODEL_DIGEST_NOT_CONFIGURED: expected SHA-256 must be a 64-character hexadecimal digest".into());
        }

        // Validate source path exists
        if !source_path.exists() {
            return Err(format!("MODEL_NOT_FOUND: Source file {:?} does not exist", source_path.display()));
        }

        // Get source filename (must be simple)
        let filename = source_path.file_name()
            .and_then(|f| f.to_str())
            .ok_or_else(|| "FILESYSTEM_BLOCKED: Source path has no valid filename".to_string())?;
        self.validate_filename(filename)?;

        // Compute SHA-256 of source file
        let computed_digest = Self::compute_file_sha256(source_path)?;

        // Compare against expected digest
        if !computed_digest.eq_ignore_ascii_case(expected_sha256) {
            return Err(format!(
                "MODEL_HASH_MISMATCH: SHA-256 digest mismatch for {:?}. Expected: {}, Computed: {}. Model will not be imported.",
                filename, expected_sha256, computed_digest
            ));
        }

        // Copy into models directory
        let dest_path = self.models_dir.join(filename);
        if dest_path.exists() {
            // If destination exists, verify it matches too
            let dest_digest = Self::compute_file_sha256(&dest_path)?;
            if !dest_digest.eq_ignore_ascii_case(expected_sha256) {
                return Err(format!(
                    "MODEL_HASH_MISMATCH: Existing file in models directory has different digest. Refusing to overwrite."
                ));
            }
        } else {
            std::fs::copy(source_path, &dest_path)
                .map_err(|e| format!("MODEL_IMPORT_FAILED: Cannot copy model file: {e}"))?;
        }

        // Get file size
        let size_bytes = std::fs::metadata(&dest_path)
            .map_err(|e| format!("MODEL_IMPORT_FAILED: Cannot stat model file: {e}"))?
            .len();

        // Create record
        let record = ModelRecord::new(
            logical_id.to_string(),
            model_id.to_string(),
            version.to_string(),
            format.to_string(),
            quantization.to_string(),
            expected_sha256.to_string(),
            dest_path.to_string_lossy().to_string(),
            size_bytes,
            license.to_string(),
            supported_operations,
            supported_languages,
            context_length,
            ram_requirement_mb,
            vram_requirement_mb,
            description.to_string(),
        );

        // Mark as verified
        let mut record = record;
        record.status = ModelStatus::HashVerified;
        record.verified_digest = Some(computed_digest);

        self.records.insert(logical_id.to_string(), record.clone());
        self.save_registry()?;

        Ok(record)
    }

    /// Verify a model's physical file against its registered digest.
    /// Returns the computed digest on success.
    pub fn verify_model_integrity(&self, logical_id: &str) -> Result<String, String> {
        let rec = self.records.get(logical_id)
            .ok_or_else(|| format!("MODEL_NOT_INSTALLED: Model '{logical_id}' is not registered"))?;

        let path = PathBuf::from(&rec.file_path);
        if !path.exists() {
            return Err(format!(
                "MODEL_NOT_FOUND: Model file {:?} is not present on disk. Please import the verified model binary.",
                path.display()
            ));
        }

        let computed_digest = Self::compute_file_sha256(&path)?;

        if !computed_digest.eq_ignore_ascii_case(&rec.sha256) {
            return Err(format!(
                "MODEL_HASH_MISMATCH: SHA-256 digest mismatch for model '{logical_id}'. Expected: {}, Computed: {}. Model will not be loaded.",
                rec.sha256, computed_digest
            ));
        }

        Ok(computed_digest)
    }

    /// Verify and update model status to HASH_VERIFIED
    pub fn verify_and_mark(&mut self, logical_id: &str) -> Result<String, String> {
        let digest = self.verify_model_integrity(logical_id)?;
        if let Some(rec) = self.records.get_mut(logical_id) {
            rec.status = ModelStatus::HashVerified;
            rec.verified_digest = Some(digest.clone());
        }
        self.save_registry()?;
        Ok(digest)
    }

    /// Check if a model is verified (HASH_VERIFIED or LOADED)
    pub fn is_verified(&self, logical_id: &str) -> bool {
        self.records.get(logical_id)
            .map(|r| matches!(r.status, ModelStatus::HashVerified | ModelStatus::Loaded))
            .unwrap_or(false)
    }

    /// Mark a model as LOADED
    pub fn mark_loaded(&mut self, logical_id: &str) -> Result<(), String> {
        let rec = self.records.get(logical_id)
            .ok_or_else(|| format!("MODEL_NOT_INSTALLED: Model '{logical_id}' is not registered"))?;
        if !self.is_verified(logical_id) {
            return Err("MODEL_NOT_VERIFIED: Model must be hash-verified before loading".into());
        }

        // Check resource limits
        let current_ram: u32 = self.loaded_models.values().map(|u| u.ram_estimate_mb).sum();
        let current_vram: u32 = self.loaded_models.values().map(|u| u.vram_estimate_mb).sum();
        let current_requests: u32 = self.loaded_models.values().map(|u| u.active_requests).sum();

        if current_ram + rec.ram_requirement_mb > self.resource_limits.max_ram_mb {
            return Err("MODEL_RESOURCE_LIMIT: RAM budget exceeded".into());
        }
        if current_vram + rec.vram_requirement_mb > self.resource_limits.max_vram_mb {
            return Err("MODEL_RESOURCE_LIMIT: VRAM budget exceeded".into());
        }
        if current_requests >= self.resource_limits.max_active_requests {
            return Err("MODEL_RESOURCE_LIMIT: Maximum active requests reached".into());
        }

        self.loaded_models.insert(logical_id.to_string(), ResourceUsage {
            loaded_model: Some(logical_id.to_string()),
            ram_estimate_mb: rec.ram_requirement_mb,
            vram_estimate_mb: rec.vram_requirement_mb,
            context_size: rec.context_length,
            active_requests: 0,
        });

        if let Some(rec) = self.records.get_mut(logical_id) {
            rec.status = ModelStatus::Loaded;
        }
        self.save_registry()?;
        Ok(())
    }

    /// Mark a model as UNLOADED
    pub fn mark_unloaded(&mut self, logical_id: &str) -> Result<(), String> {
        self.loaded_models.remove(logical_id);
        if let Some(rec) = self.records.get_mut(logical_id) {
            rec.status = ModelStatus::Unloaded;
        }
        self.save_registry()?;
        Ok(())
    }

    /// Mark a model as LOAD_FAILED
    pub fn mark_load_failed(&mut self, logical_id: &str) {
        if let Some(rec) = self.records.get_mut(logical_id) {
            rec.status = ModelStatus::LoadFailed;
        }
        let _ = self.save_registry();
    }

    /// Get a model record
    pub fn get_model(&self, logical_id: &str) -> Option<&ModelRecord> {
        self.records.get(logical_id)
    }

    /// List all model records
    pub fn list_models(&self) -> Vec<&ModelRecord> {
        self.records.values().collect()
    }

    /// Get current resource usage summary
    pub fn get_resource_usage(&self) -> Vec<ResourceUsage> {
        self.loaded_models.values().cloned().collect()
    }

    /// Increment active request count for a loaded model
    pub fn begin_request(&mut self, logical_id: &str) -> Result<(), String> {
        let usage = self.loaded_models.get_mut(logical_id)
            .ok_or_else(|| format!("MODEL_NOT_LOADED: Model '{logical_id}' is not loaded"))?;
        if usage.active_requests >= self.resource_limits.max_active_requests {
            return Err("MODEL_RESOURCE_LIMIT: Maximum concurrent requests reached".into());
        }
        usage.active_requests += 1;
        Ok(())
    }

    /// Decrement active request count for a loaded model
    pub fn end_request(&mut self, logical_id: &str) {
        if let Some(usage) = self.loaded_models.get_mut(logical_id) {
            usage.active_requests = usage.active_requests.saturating_sub(1);
        }
    }
}