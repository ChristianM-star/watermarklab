# WatermarkLab Runtime Verification — Remediation Update

## Verified in this environment

- Python sidecar launches as a real child process over anonymous stdin/stdout pipes.
- 14/14 sidecar protocol/lifecycle tests pass.
- Session authentication fails closed when no token is configured.
- Nonce replay cache is bounded and ordered; it no longer clears the entire history.
- Cross-process timestamp checks use UTC wall-clock freshness, not an incorrect monotonic-clock claim.
- Model verification is Rust-authoritative; the sidecar cannot be used to hash arbitrary filesystem paths.
- Frontend cryptography no longer silently falls back to browser PBKDF2.
- Fabricated model digests have been removed from the client registry.
- Browser localStorage is no longer used for the encrypted vault. Native persistence is now routed through Tauri Rust commands.
- Vite development server is bound to loopback.
- The sidecar only uses deterministic transformations in explicitly enabled demo mode; production inference requires configured local model artifacts.

## Runtime limitations

- This execution environment does not provide Cargo/Rust, so native Rust compilation could not be executed here.
- npm dependencies are not installed and outbound registry access is unavailable, so a full TypeScript/Vite build could not be executed here.
- Linux `unshare --net` is unavailable in this container (`Operation not permitted`); therefore the current environment does not receive a kernel-level network-isolation guarantee.
- Filesystem confinement remains application-level canonical-path allowlisting rather than a kernel filesystem sandbox.
- Actual neural paraphrase/translation requires local model artifacts configured through `WATERMARKLAB_PARAPHRASE_MODEL` and `WATERMARKLAB_TRANSLATION_MODEL`.
