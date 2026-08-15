// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ipc;
mod models;
mod security;
mod storage;

use ipc::ProcessSupervisor;
use models::ModelManager;
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
    models: ModelManager,
    supervisor: Mutex<ProcessSupervisor>,
}

#[tauri::command]
fn get_security_status(state: tauri::State<Arc<AppState>>) -> RuntimeSecurityStatus {
    let supervisor = state.supervisor.lock();
    state.security.get_runtime_security_status(supervisor.network_isolated())
}

#[tauri::command]
fn verify_model(
    filename: String,
    expected_sha256: String,
    state: tauri::State<Arc<AppState>>,
) -> Result<String, String> {
    let canonical = state.security.validate_and_canonicalize_path(state.models.model_path_for(&filename)?)?;
    let canonical_name = canonical.to_string_lossy().to_string();
    state.models.verify_model_integrity_path(&canonical_name, &expected_sha256)
}

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

#[tauri::command]
fn transform_text(
    operation: String,
    payload: serde_json::Value,
    state: tauri::State<Arc<AppState>>,
) -> Result<serde_json::Value, String> {
    let mut supervisor = state.supervisor.lock();
    supervisor.dispatch(&operation, payload, std::time::Duration::from_secs(15))
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
        models: model_mgr,
        supervisor,
    });

    tauri::Builder::default()
        .manage(app_state.clone())
        .invoke_handler(tauri::generate_handler![
            get_security_status,
            verify_model,
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
