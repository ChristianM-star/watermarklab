# WatermarkLab — Threat Model & Security Architecture

**Document Version:** 1.0.0  
**Target System:** WatermarkLab Privacy-First Text Transformation Platform  
**Methodology:** STRIDE Threat Modeling & Trust Boundary Analysis  

---

## 1. System Overview & Trust Boundaries

```text
+-------------------------------------------------------------------------+
|                              HOST OS                                    |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  |                    TRUST BOUNDARY 1 (UI Webview)                 |  |
|  |  +-------------------------------------------------------------+  |  |
|  |  |  React SPA (Transform Workbench, Vault, Invariant Viewer)  |  |  |
|  |  |  CSP: connect-src 'self' ipc:; default-src 'self'           |  |  |
|  |  +-------------------------------------------------------------+  |  |
|  +-----------------------------------|-------------------------------+  |
|                                      | (Tauri IPC Commands)             |
|  +-----------------------------------|-------------------------------+  |
|  |                    TRUST BOUNDARY 2 (Rust Core Supervisor)       |  |
|  |  +-------------------------------------------------------------+  |  |
|  |  |  Security Sandbox & Path Validator (Pre-flight Canonicalizer)|  |  |
|  |  |  IPC Broker (Constant-Time Token Check, Nonce Cache, Clock) |  |  |
|  |  |  Encrypted Vault Store (Argon2id + AES-256-GCM)              |  |  |
|  |  +-------------------------------------------------------------+  |  |
|  +-----------------------------------|-------------------------------+  |
|                                      | (Anonymous Stdio Pipes)          |
|  +-----------------------------------|-------------------------------+  |
|  |                    TRUST BOUNDARY 3 (Python AI Sidecar)          |  |
|  |  +-------------------------------------------------------------+  |  |
|  |  |  Offline NLP Engines (Llama-3, NLLB, BART, MarianMT)        |  |  |
|  |  |  AST Invariant Extractor & Boundary Validator               |  |  |
|  |  +-------------------------------------------------------------+  |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+
```

---

## 2. Attacker Personas & Capabilities

| Attacker Persona | Capabilities | Primary Goal | Mitigating Layer |
|---|---|---|---|
| **Remote Network Exfiltrator** | Controls external network infrastructure and command-and-control servers. | Intercept or receive leaked user text or cryptographic keys. | Strict CSP in Webview + Stdio-only IPC + Offline sidecar execution. |
| **Malicious Input / Prompt Injector** | Submits crafted adversarial prompts containing jailbreaks or filter bypasses. | Escape data context, alter policy, or manipulate invariants. | Data-only template framing + Independent post-inference AST validator. |
| **Local Nonce Replayer / Sniffer** | Inspects IPC traffic on local machine or replays captured frames. | Re-execute transformation commands or forge supervisor messages. | Ephemeral session tokens, constant-time verification, LRU nonce cache, ±30s monotonic window. |
| **Disk / Cold-Storage Inspector** | Gains physical or filesystem read access to local application data directory. | Read confidential transformed documents or provenance trails. | AES-256-GCM encrypted persistence with Argon2id memory-hard key derivation. |
| **Model Weight Tamperer** | Modifies weights on disk (e.g. backdoored model checkpoint). | Induce subtle hallucinations or leak private identifiers. | Pre-flight 64-hex SHA-256 integrity verification against immutable manifest. |

---

## 3. STRIDE Threat Analysis

### S — Spoofing
- **Threat:** Malicious process sends forged IPC commands to the Rust supervisor or sidecar.
- **Mitigation:** Authenticated with 256-bit random session token (`wl_sec_*`) generated at runtime and verified with constant-time equality.

### T — Tampering
- **Threat:** Modifying ciphertext stored in the encrypted vault or altering IPC frames in transit.
- **Mitigation:** AES-256-GCM GMAC authentication tags reject tampered ciphertexts. Protocol frames include length bounds and SHA-256 digests.

### R — Repudiation
- **Threat:** Disputing origin, model version, or edits made to transformed text.
- **Mitigation:** Every transformation generates a `WMLAB-V1-*` structured provenance record containing document UUIDs, model SHA-256, timestamps, and edit lineage.

### I — Information Disclosure
- **Threat:** Sensitive text or session keys leaking into system logs, diagnostic outputs, or error traces.
- **Mitigation:** Automated log sanitizer redacts session tokens, canary tokens, and bearer keys; canary scanner certifies zero leakage.

### D — Denial of Service
- **Threat:** Oversized payloads or infinite transformation loops hanging the supervisor.
- **Mitigation:** 512 KB payload size limit enforced at IPC ingress; 15,000 ms execution deadline timer terminates stuck workers.

### E — Elevation of Privilege
- **Threat:** Prompt injection instructing the sidecar to execute arbitrary OS commands or escape filesystem sandbox.
- **Mitigation:** Sidecar parses JSON data only; no shell execution (`eval`/`os.system`) is used; paths are canonicalized against allowlisted directories.

---

## 4. Residual Risks & Security Recommendations

1. **Host-Level Root Compromise:** If an attacker gains kernel-level or root access on the host operating system, memory inspection tools (`ptrace`, core dumps) can inspect active process memory.
2. **Platform Sandboxing Parity:** Linux systems benefit from kernel Landlock and network namespaces (`CLONE_NEWNET`); Windows and macOS deployments should configure AppContainer and Seatbelt profiles respectively in production packaging.
3. **Passphrase Strength:** The security of the AES-256-GCM vault depends on user passphrase entropy; passphrase complexity enforcement is recommended for enterprise deployments.
