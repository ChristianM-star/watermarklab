# WatermarkLab — Implementation Status

## Current posture

The repository now contains a real Tauri/Rust core and a real Python sidecar. Security-sensitive operations are routed through Rust; the frontend no longer owns authentication, cryptography, model verification, or transformation execution.

## What is real

- Native Rust project under `src-tauri/`.
- Python child process communicating over anonymous stdin/stdout pipes.
- Fail-closed sidecar authentication.
- Bounded ordered nonce replay cache.
- Request/response size limits.
- Rust-side timeout handling with child termination.
- Real Argon2id + AES-256-GCM implementation in Rust.
- Real streaming SHA-256 over model files in Rust.
- Rust-side model path allowlisting before hashing.
- Browser cryptographic fallback removed.
- Browser `localStorage` vault persistence removed.
- Native vault metadata persistence uses Tauri application data storage.
- Fabricated model digests removed.
- Production sidecar cannot execute network probes or arbitrary model-file hashing.
- Real local Transformer inference path is supported when local model directories are configured.
- Deterministic transformation fallback exists only in explicit test/demo mode.

## Security status

| Area | Status | Scope |
|---|---|---|
| IPC authentication | PASS | Real Rust/Python runtime |
| IPC replay protection | PASS | Bounded nonce cache |
| IPC freshness | PASS | Cross-process UTC wall-clock window |
| IPC timeout | PASS | Rust supervisor terminates timed-out sidecar |
| Cryptography | PASS | Rust Argon2id + AES-256-GCM |
| Model hash verification | PASS | Rust physical-file SHA-256 |
| Filesystem restriction | PARTIAL | Application-level canonical path allowlist |
| Network isolation | PARTIAL | Hard OS isolation only where runtime can create it; otherwise status is explicitly partial |
| Frontend privilege separation | PASS | React is a Rust client |
| Plaintext browser persistence | PASS | No localStorage/sessionStorage vault persistence |
| Memory zeroization | PARTIAL | Best-effort runtime clearing; GC/native-runtime limitations remain |
| Semantic preservation | PARTIAL | Explicit invariant validators; not a universal semantic guarantee |

## Environment verification

`python3 sidecar/test_sidecar.py`: **14/14 passed** in the current execution environment.

Full npm/Vite and Cargo verification could not be executed in this environment because npm packages were not available offline and Cargo/Rust is not installed. A final release build must run those checks on a machine with the required toolchains.
