//! Process supervision and authenticated stdio IPC.

use serde::{Deserialize, Serialize};
use std::collections::{HashSet, VecDeque};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const PROTOCOL_VERSION: u32 = 1;
const MAX_PAYLOAD_BYTES: usize = 512 * 1024;
const MAX_CLOCK_DRIFT_MS: u64 = 30_000;
const MAX_NONCE_CACHE_SIZE: usize = 5_000;

/// Rust-authoritative operation allowlist.
/// Only these operations may be dispatched to the sidecar.
const ALLOWED_OPERATIONS: &[&str] = &[
    "ping",
    "paraphrase",
    "translate",
    "translate_loop",
    "semantic_chunk",
    "load_model",
    "unload_model",
    "model_status",
    "embed",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IPCRequest<T> {
    pub protocol_version: u32,
    pub request_id: String,
    pub auth_token: String,
    pub timestamp_ms: u64,
    pub nonce: String,
    pub operation: String,
    pub payload: T,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IPCResponse<R> {
    pub protocol_version: u32,
    pub request_id: String,
    pub ok: bool,
    pub payload: Option<R>,
    pub error: Option<IPCError>,
    pub execution_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IPCError {
    pub code: String,
    pub message: String,
}

type ResponseReader = Receiver<Result<String, String>>;

pub struct ProcessSupervisor {
    session_token: String,
    child_process: Option<Child>,
    child_stdin: Option<ChildStdin>,
    response_reader: Option<ResponseReader>,
    seen_nonces: HashSet<String>,
    nonce_order: VecDeque<String>,
    sidecar_path: std::path::PathBuf,
    network_isolated: bool,
}

impl ProcessSupervisor {
    pub fn new(sidecar_path: std::path::PathBuf) -> Self {
        let mut token_bytes = [0u8; 32];
        rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut token_bytes);
        let session_token = format!("wl_sec_{}", hex::encode(token_bytes));
        Self {
            session_token,
            child_process: None,
            child_stdin: None,
            response_reader: None,
            seen_nonces: HashSet::with_capacity(MAX_NONCE_CACHE_SIZE),
            nonce_order: VecDeque::with_capacity(MAX_NONCE_CACHE_SIZE),
            sidecar_path,
            network_isolated: false,
        }
    }

    pub fn session_token(&self) -> &str { &self.session_token }
    pub fn network_isolated(&self) -> bool { self.network_isolated }

    fn build_command(&self) -> (Command, bool) {
        let mut isolated = false;
        let mut cmd: Command;

        #[cfg(target_os = "linux")]
        {
            // Attempt a real network namespace by default. If the host refuses unshare,
            // fall back to the normal interpreter but report the weaker status honestly.
            let use_unshare = std::process::Command::new("unshare")
                .args(["--net", "--fork", "true"])
                .status()
                .map(|s| s.success())
                .unwrap_or(false);
            if use_unshare {
                cmd = Command::new("unshare");
                cmd.args(["--net", "--fork", "python3"])
                    .arg(&self.sidecar_path);
                isolated = true;
            } else {
                cmd = Command::new("python3");
                cmd.arg(&self.sidecar_path);
            }
        }

        #[cfg(not(target_os = "linux"))]
        {
            cmd = Command::new("python3");
            cmd.arg(&self.sidecar_path);
        }

        (cmd, isolated)
    }

    pub fn spawn_sidecar(&mut self) -> Result<(), String> {
        if self.child_process.is_some() { return Ok(()); }

        let (mut cmd, isolated) = self.build_command();
        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .env("WATERMARKLAB_SESSION_TOKEN", &self.session_token)
            .env("PYTHONUNBUFFERED", "1")
            .env("WATERMARKLAB_NETWORK_ISOLATED", if isolated { "1" } else { "0" });

        let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn Python sidecar: {e}"))?;
        let stdin = child.stdin.take().ok_or("Failed to acquire sidecar stdin")?;
        let stdout = child.stdout.take().ok_or("Failed to acquire sidecar stdout")?;

        let (tx, rx) = mpsc::channel::<Result<String, String>>();
        thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            loop {
                let mut line = String::new();
                match reader.read_line(&mut line) {
                    Ok(0) => { let _ = tx.send(Err("SIDECAR_EOF".into())); break; }
                    Ok(_) => { let _ = tx.send(Ok(line)); }
                    Err(e) => { let _ = tx.send(Err(format!("SIDECAR_READ_ERROR: {e}"))); break; }
                }
            }
        });

        self.child_stdin = Some(stdin);
        self.response_reader = Some(rx);
        self.child_process = Some(child);
        self.network_isolated = isolated;
        Ok(())
    }

    fn remember_nonce(&mut self, nonce: &str) -> bool {
        if self.seen_nonces.contains(nonce) { return false; }
        self.seen_nonces.insert(nonce.to_string());
        self.nonce_order.push_back(nonce.to_string());
        while self.nonce_order.len() > MAX_NONCE_CACHE_SIZE {
            if let Some(old) = self.nonce_order.pop_front() { self.seen_nonces.remove(&old); }
        }
        true
    }

    pub fn dispatch<T: Serialize, R: for<'de> Deserialize<'de>>(
        &mut self,
        operation: &str,
        payload: T,
        timeout_duration: Duration,
    ) -> Result<R, String> {
        // Rust-authoritative operation allowlist enforcement
        if !ALLOWED_OPERATIONS.contains(&operation) {
            return Err(format!("UNSUPPORTED_OPERATION: '{operation}' is not in the Rust operation allowlist"));
        }

        self.spawn_sidecar()?;

        let now_ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64;
        let request_id = uuid::Uuid::new_v4().to_string();
        let nonce = format!("nonce_{}", uuid::Uuid::new_v4());
        if !self.remember_nonce(&nonce) { return Err("REPLAY_DETECTED: nonce collision".into()); }

        let request = IPCRequest {
            protocol_version: PROTOCOL_VERSION,
            request_id: request_id.clone(),
            auth_token: self.session_token.clone(),
            timestamp_ms: now_ms,
            nonce,
            operation: operation.to_string(),
            payload,
        };
        let req_json = serde_json::to_string(&request).map_err(|e| format!("Serialization error: {e}"))?;
        if req_json.len() > MAX_PAYLOAD_BYTES { return Err("RESOURCE_LIMIT: request exceeds 512 KB".into()); }

        if let Some(child) = self.child_process.as_mut() {
            if let Ok(Some(status)) = child.try_wait() {
                self.terminate();
                return Err(format!("SIDECAR_CRASHED: {status}"));
            }
        }

        let stdin = self.child_stdin.as_mut().ok_or("Sidecar stdin unavailable")?;
        writeln!(stdin, "{req_json}").map_err(|e| format!("Pipe write error: {e}"))?;
        stdin.flush().map_err(|e| format!("Pipe flush error: {e}"))?;

        let receiver = self.response_reader.as_ref().ok_or("Sidecar response reader unavailable")?;
        let response_line = match receiver.recv_timeout(timeout_duration) {
            Ok(Ok(line)) => line,
            Ok(Err(e)) => { self.terminate(); return Err(e); }
            Err(RecvTimeoutError::Timeout) => {
                self.terminate();
                return Err("TIMEOUT: sidecar response exceeded configured deadline".into());
            }
            Err(RecvTimeoutError::Disconnected) => {
                self.terminate();
                return Err("SIDECAR_CRASHED: response channel disconnected".into());
            }
        };

        if response_line.len() > MAX_PAYLOAD_BYTES { self.terminate(); return Err("RESOURCE_LIMIT: response exceeds 512 KB".into()); }
        let resp: IPCResponse<R> = serde_json::from_str(response_line.trim())
            .map_err(|e| format!("Malformed sidecar response: {e}"))?;
        if resp.protocol_version != PROTOCOL_VERSION { return Err("VERSION_MISMATCH: sidecar protocol version mismatch".into()); }
        if !resp.ok {
            return Err(resp.error.map(|e| format!("{}: {}", e.code, e.message)).unwrap_or_else(|| "SIDECARE_ERROR".into()));
        }
        resp.payload.ok_or_else(|| "Missing payload in sidecar response".into())
    }

    pub fn terminate(&mut self) {
        if let Some(mut child) = self.child_process.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.child_stdin = None;
        self.response_reader = None;
        self.network_isolated = false;
    }
}

impl Drop for ProcessSupervisor { fn drop(&mut self) { self.terminate(); } }
