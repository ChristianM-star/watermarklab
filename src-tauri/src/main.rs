// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ipc;
mod models;
mod security;
mod storage;

use ipc::ProcessSupervisor;
use models::{ModelManager, ModelRecord, ModelStatus, ResourceUsage};
use parking_lot::Mutex;
use security::{RuntimeSecurityStatus, SecurityManager};
use std::path::PathBuf;
use std::sync::Arc;
use std::fs;
use std::io::Write as IoWrite;
use tauri::Manager;
use storage::{EncryptedRecord, KdfParams, VaultEngine};

struct AppState {
    security: SecurityManager,
    models: Mutex<ModelManager>,
    supervisor: Mutex<ProcessSupervisor>,
}

#[tauri::command]
fn get_security_status(state: tauri::State<Arc<AppState>>) -> RuntimeSecurityStatus {
    let supervisor = state.supervisor.lock();
    state.security.get_runtime_security_status(supervisor.network_isolated())
}

// ============================================================================
// Model Management Commands
// ============================================================================

#[tauri::command]
fn list_models(state: tauri::State<Arc<AppState>>) -> Result<Vec<ModelRecord>, String> {
    let models = state.models.lock();
    Ok(models.list_models().into_iter().cloned().collect())
}

#[tauri::command]
fn model_status(logical_id: String, state: tauri::State<Arc<AppState>>) -> Result<ModelRecord, String> {
    let models = state.models.lock();
    models.get_model(&logical_id)
        .cloned()
        .ok_or_else(|| format!("MODEL_NOT_INSTALLED: Model '{logical_id}' is not registered"))
}

#[tauri::command]
fn import_model(
    source_path: String,
    expected_sha256: String,
    logical_id: String,
    model_id: String,
    version: String,
    format: String,
    quantization: String,
    license: String,
    supported_operations: Vec<String>,
    supported_languages: Vec<String>,
    context_length: u32,
    ram_requirement_mb: u32,
    vram_requirement_mb: u32,
    description: String,
    state: tauri::State<Arc<AppState>>,
) -> Result<ModelRecord, String> {
    // Rust-authoritative path handling: validate the source path is a real file
    let source = PathBuf::from(&source_path);
    if !source.exists() {
        return Err(format!("MODEL_NOT_FOUND: Source file {:?} does not exist", source_path));
    }
    if !source.is_file() {
        return Err("MODEL_IMPORT_FAILED: Source path is not a regular file".into());
    }

    let mut models = state.models.lock();
    models.import_model(
        &source,
        &expected_sha256,
        &logical_id,
        &model_id,
        &version,
        &format,
        &quantization,
        &license,
        supported_operations,
        supported_languages,
        context_length,
        ram_requirement_mb,
        vram_requirement_mb,
        &description,
    )
}

#[tauri::command]
fn verify_model(
    logical_id: String,
    state: tauri::State<Arc<AppState>>,
) -> Result<String, String> {
    let mut models = state.models.lock();
    models.verify_and_mark(&logical_id)
}

#[tauri::command]
fn load_model(
    logical_id: String,
    state: tauri::State<Arc<AppState>>,
) -> Result<serde_json::Value, String> {
    // 1. Verify model is registered and hash-verified
    {
        let models = state.models.lock();
        if !models.is_verified(&logical_id) {
            return Err("MODEL_NOT_VERIFIED: Model must be hash-verified before loading".into());
        }
    }

    // 2. Resolve the canonical model path (Rust-authoritative)
    let model_path = {
        let models = state.models.lock();
        models.resolve_model_path(&logical_id)?
    };

    // 3. Mark as loaded in Rust registry (checks resource limits)
    {
        let mut models = state.models.lock();
        models.mark_loaded(&logical_id)?;
    }

    // 4. Dispatch load_model to sidecar with the canonical path
    let mut supervisor = state.supervisor.lock();
    let result: serde_json::Value = supervisor.dispatch(
        "load_model",
        serde_json::json!({
            "logical_id": logical_id,
            "model_path": model_path.to_string_lossy().to_string(),
        }),
        std::time::Duration::from_secs(120),
    ).map_err(|e| {
        // Mark load failed in registry
        let mut models = state.models.lock();
        models.mark_load_failed(&logical_id);
        e
    })?;

    Ok(result)
}

#[tauri::command]
fn unload_model(
    logical_id: String,
    state: tauri::State<Arc<AppState>>,
) -> Result<serde_json::Value, String> {
    // Dispatch unload to sidecar
    let mut supervisor = state.supervisor.lock();
    let result: serde_json::Value = supervisor.dispatch(
        "unload_model",
        serde_json::json!({ "logical_id": logical_id }),
        std::time::Duration::from_secs(30),
    )?;

    // Mark as unloaded in Rust registry
    let mut models = state.models.lock();
    models.mark_unloaded(&logical_id)?;

    Ok(result)
}

#[tauri::command]
fn get_resource_usage(state: tauri::State<Arc<AppState>>) -> Result<Vec<ResourceUsage>, String> {
    let models = state.models.lock();
    Ok(models.get_resource_usage())
}

// ============================================================================
// Vault Commands
// ============================================================================

#[tauri::command]
fn vault_encrypt(
    plaintext: String,
    passphrase: String,
    params: Option<KdfParams>,
) -> Result<EncryptedRecord, String> {
    VaultEngine::encrypt(plaintext.as_bytes(), &passphrase, params)
}

#[tauri::command]
fn vault_decrypt(
    ciphertext_b64: String,
    iv_b64: String,
    salt_b64: String,
    auth_tag_b64: String,
    passphrase: String,
    params: KdfParams,
) -> Result<String, String> {
    let decrypted_bytes = VaultEngine::decrypt(
        &ciphertext_b64,
        &iv_b64,
        &salt_b64,
        &auth_tag_b64,
        &passphrase,
        &params,
    )?;
    String::from_utf8(decrypted_bytes).map_err(|e| format!("Invalid UTF-8 plaintext: {}", e))
}

fn vault_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| format!("STORAGE_FAILURE: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("STORAGE_FAILURE: {e}"))?;
    Ok(dir.join("vault-items.json"))
}

#[tauri::command]
fn vault_load(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let path = vault_path(&app)?;
    if !path.exists() { return Ok(Vec::new()); }
    let raw = fs::read_to_string(&path).map_err(|e| format!("STORAGE_FAILURE: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("STORAGE_FAILURE: invalid vault metadata: {e}"))
}

#[tauri::command]
fn vault_save(app: tauri::AppHandle, items: Vec<serde_json::Value>) -> Result<(), String> {
    let path = vault_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec(&items).map_err(|e| format!("STORAGE_FAILURE: {e}"))?;
    let mut file = fs::File::create(&tmp).map_err(|e| format!("STORAGE_FAILURE: {e}"))?;
    file.write_all(&bytes).map_err(|e| format!("STORAGE_FAILURE: {e}"))?;
    file.sync_all().map_err(|e| format!("STORAGE_FAILURE: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("STORAGE_FAILURE: {e}"))?;
    Ok(())
}

#[tauri::command]
fn vault_raw_dump(app: tauri::AppHandle) -> Result<String, String> {
    let path = vault_path(&app)?;
    if !path.exists() { return Ok(String::new()); }
    fs::read_to_string(&path).map_err(|e| format!("STORAGE_FAILURE: {e}"))
}

// ============================================================================
// Transformation Commands
// ============================================================================

#[tauri::command]
fn transform_text(
    operation: String,
    payload: serde_json::Value,
    state: tauri::State<Arc<AppState>>,
) -> Result<serde_json::Value, String> {
    // Extract model_id from payload if present
    let model_id = payload.get("model_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    // If a model is specified, verify it's loaded and begin a request
    if !model_id.is_empty() {
        let mut models = state.models.lock();
        models.begin_request(model_id)?;
    }

    let mut supervisor = state.supervisor.lock();
    let result = supervisor.dispatch(&operation, payload, std::time::Duration::from_secs(60));

    // End request tracking
    if !model_id.is_empty() {
        let mut models = state.models.lock();
        models.end_request(model_id);
    }

    result
}

fn main() {
    let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let models_dir = current_dir.join("models");
    let sidecar_path = current_dir.join("sidecar").join("sidecar.py");

    let security_mgr = SecurityManager::new();
    let model_mgr = ModelManager::new(models_dir);
    let supervisor = Mutex::new(ProcessSupervisor::new(sidecar_path));

    let app_state = Arc::new(AppState {
        security: security_mgr,
        models: Mutex::new(model_mgr),
        supervisor,
    });

    tauri::Builder::default()
        .manage(app_state.clone())
        .invoke_handler(tauri::generate_handler![
            get_security_status,
            list_models,
            model_status,
            import_model,
            verify_model,
            load_model,
            unload_model,
            get_resource_usage,
            vault_encrypt,
            vault_decrypt,
            vault_load,
            vault_save,
            vault_raw_dump,
            transform_text,
        ])
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                eprintln!("[WatermarkLab] Window closed, cleaning child sidecar processes.");
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}