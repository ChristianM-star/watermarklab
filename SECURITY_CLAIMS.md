# WatermarkLab — Security Claims

These are the claims the implementation currently supports. They deliberately distinguish application-level controls from OS-level guarantees.

| Claim | Status | Supported scope |
|---|---|---|
| IPC token authentication | PASS | Rust/Python session token, fail-closed, constant-time comparison |
| Replay resistance | PASS | Bounded ordered nonce cache per sidecar session |
| Timestamp freshness | PASS | UTC wall-clock freshness window across processes |
| IPC timeout | PASS | Rust supervisor terminates the sidecar on deadline |
| Argon2id key derivation | PASS | Real Rust `argon2` implementation |
| AES-256-GCM | PASS | Real Rust `aes-gcm` implementation with 96-bit nonces |
| Model integrity | PASS | Rust hashes physical model bytes before verification succeeds |
| Arbitrary sidecar file hashing | BLOCKED | Sidecar rejects model verification requests; Rust owns this capability |
| Browser crypto downgrade | BLOCKED | No Web Crypto fallback for vault encryption/decryption |
| Browser persistent vault | BLOCKED | No localStorage/sessionStorage persistence |
| Filesystem confinement | PARTIAL | Canonical-path allowlist; not a kernel filesystem jail |
| Network confinement | PARTIAL | Linux namespace attempted when available; other platforms require OS sandboxing/firewall support |
| Memory erasure | PARTIAL | Best-effort clearing only; GC/allocator/GPU limitations remain |
| Semantic preservation | PARTIAL | Numeric/code/URL/entity-detection invariants validated; no universal meaning guarantee |
| Production ML inference | CONDITIONAL | Requires verified local Transformer-compatible model artifacts |
| Demo transformations | TEST-ONLY | Enabled only with both `WATERMARKLAB_TEST_MODE=1` and `WATERMARKLAB_DEMO_MODE=1` |
