# WatermarkLab Remediation Pass

This pass fixes the remaining issues identified during native-runtime review.

## Fixed

- Rust IPC now uses a dedicated stdout reader with `recv_timeout` and kills the sidecar on timeout/EOF.
- IPC nonce tracking uses a bounded ordered cache rather than clearing the entire set.
- Sidecar authentication is fail-closed if the session token is missing.
- Cross-process timestamps are explicitly treated as UTC wall-clock freshness values, not monotonic values.
- Model verification is Rust-authoritative; the sidecar rejects arbitrary file hashing requests.
- Rust model verification rejects missing/unconfigured SHA-256 digests and validates model paths through the filesystem allowlist.
- Browser/Web Crypto fallback for vault encryption/decryption has been removed; the desktop Rust backend is authoritative.
- Fabricated model SHA-256 values were removed from the TypeScript registry.
- Vite development host is loopback-only.
- Security status no longer claims filesystem or network enforcement that is not actually established.
- Linux sidecar startup attempts a real network namespace with `unshare`; when unavailable the runtime reports `partial` rather than `enforced`.
- Sidecar model verification operations are explicitly unsupported.

## Remaining architectural limitation

The Python transformation engine still requires actual local model artifacts for true LLM/translation inference. The current sidecar keeps deterministic structural fallbacks but labels them as such; those fallbacks are not represented as production-quality neural inference.
