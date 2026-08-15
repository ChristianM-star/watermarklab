/**
 * WatermarkLab Architecture Gap Report & Defense Model
 * @author Principal Software Architect & Security Engineering Lead
 */

export interface ArchitectureGapItem {
  id: string;
  category: 'trust_boundary' | 'cryptography' | 'ipc' | 'model_integrity' | 'validation' | 'process_isolation';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  previousDefect: string;
  enforceableInvariant: string;
  enforcementMechanism: string;
  automatedTestId: string;
  guaranteeStatus: 'ENFORCED' | 'PARTIAL';
  documentedLimitation?: string;
}

export const ARCHITECTURE_GAP_ITEMS: ArchitectureGapItem[] = [
  {
    id: 'GAP-01',
    category: 'trust_boundary',
    severity: 'HIGH',
    title: 'Frontend-to-Core Authority & Tauri Capabilities',
    previousDefect: 'Frontend previously used generic abstractions without strict deny-by-default capability scoping and explicit boundary commands.',
    enforceableInvariant: 'Frontend is strictly presentation-only. Zero direct filesystem, process, or network access. Scoped Tauri 2.x commands validate all authorization tokens inside Rust.',
    enforcementMechanism: 'Tauri 2 capabilities file (deny-all by default) + Rust command authorization filter with session token verification.',
    automatedTestId: 'sec-auth-09',
    guaranteeStatus: 'ENFORCED',
    documentedLimitation: 'WebView XSS can only manipulate UI memory, never escape to OS shell or read unauthorized files.',
  },
  {
    id: 'GAP-02',
    category: 'cryptography',
    severity: 'HIGH',
    title: 'Modern KDF Architecture (Argon2id + PBKDF2 Benchmark)',
    previousDefect: 'Fixed single KDF (PBKDF2 100k rounds) without parameter benchmarking, memory-hardness, or KDF metadata storage.',
    enforceableInvariant: 'Argon2id (memory=64MB, t=3, p=4) with benchmarked PBKDF2 compatibility path. Zero nonce reuse with AES-256-GCM authenticated tags.',
    enforcementMechanism: 'Configurable KDF policy storing full non-secret KDF parameters in each vault envelope. Cryptographically unique 96-bit IV per encryption.',
    automatedTestId: 'unit-crypto-04',
    guaranteeStatus: 'ENFORCED',
    documentedLimitation: 'Memory wiping in JavaScript runtime is best-effort due to garbage collector string immutability; native Rust core uses Zeroize.',
  },
  {
    id: 'GAP-03',
    category: 'ipc',
    severity: 'HIGH',
    title: 'Authenticated Versioned IPC with Request Correlation & Bounded Limits',
    previousDefect: 'Lack of explicit replay rejection counters, uncalibrated payload caps, and missing error hierarchy.',
    enforceableInvariant: 'Protocol v1 frames enforce 512 KB payload size caps, session token verification, UUID correlation, bounded timeout deadlines, and error taxonomy.',
    enforcementMechanism: 'Rust IPC broker with strict JSON schema validator, token comparator, and timer deadline abort controller.',
    automatedTestId: 'unit-proto-01',
    guaranteeStatus: 'ENFORCED',
    documentedLimitation: 'Subprocess communication relies on pipe stdio; sidecar crash triggers immediate Rust supervision cleanup.',
  },
  {
    id: 'GAP-04',
    category: 'model_integrity',
    severity: 'HIGH',
    title: 'Model Registry Cryptographic Checksums & Tamper Resistance',
    previousDefect: 'Models could be matched by filename without full SHA-256 binary validation before memory loading.',
    enforceableInvariant: 'Full 64-hex SHA-256 checksum recalculation. Corrupted or tampered binaries are blocked from entering isolated execution memory.',
    enforcementMechanism: 'Pre-flight SHA-256 digest computation against immutable registry manifest before instantiating ONNX/GGUF runtime.',
    automatedTestId: 'unit-model-03',
    guaranteeStatus: 'ENFORCED',
    documentedLimitation: 'Offline bundles require initial explicit user installation with authentic hash verification.',
  },
  {
    id: 'GAP-05',
    category: 'validation',
    severity: 'HIGH',
    title: 'Authoritative Independent Semantic Validation Layer',
    previousDefect: 'Transformation models could claim success without independent post-generation invariant assertions.',
    enforceableInvariant: 'Generation never declares itself correct. An independent validator asserts retention of numbers, code blocks, URLs, and named entities.',
    enforcementMechanism: 'Post-generation extraction and comparison engine with violation reporting and similarity score floor.',
    automatedTestId: 'unit-semantic-05',
    guaranteeStatus: 'ENFORCED',
    documentedLimitation: 'Semantic similarity is computed via token-level weighted overlap and embedding cosine distances, not mathematical equivalence proof.',
  },
  {
    id: 'GAP-06',
    category: 'process_isolation',
    severity: 'MEDIUM',
    title: 'Network & Filesystem Sandbox Policy Realization',
    previousDefect: 'Privacy mode previously operated without multi-layer socket firewall and OS-level platform documentation.',
    enforceableInvariant: 'Layered network restrictions: WebView CSP, Rust supervisor network denials, and Sidecar socket interceptor. Path canonicalization against jail escape.',
    enforcementMechanism: 'Rust security supervisor with path canonicalization (blocking symlinks, junctions, and .. traversal) and socket firewall.',
    automatedTestId: 'sec-fs-11',
    guaranteeStatus: 'PARTIAL',
    documentedLimitation: 'Linux uses landlock/seccomp, macOS uses sandbox-exec/App Sandbox, Windows uses AppContainer. Platform differences are explicitly documented.',
  },
];

export const CAPABILITY_MATRIX = [
  {
    component: 'React / WebView',
    filesystem: 'None (Direct Denied)',
    network: 'Blocked by CSP & Scopes',
    secrets: 'None (Zero In-Memory Keys)',
    models: 'None',
    userText: 'Temporary UI Buffer',
    processControl: 'None',
  },
  {
    component: 'Rust Core Supervisor',
    filesystem: 'Scoped App Data & Jail',
    network: 'Explicit Policy Enforcement',
    secrets: 'Master Key / Keychain / Vault',
    models: 'Indirect (Hash Verification)',
    userText: 'Controlled Stream',
    processControl: 'Supervised Lifecycle Only',
  },
  {
    component: 'Python Sidecar',
    filesystem: 'Allowlisted Model & Temp',
    network: 'Denied by Default (Offline)',
    secrets: 'None',
    models: 'Verified Binaries Only',
    userText: 'Transient Execution Memory',
    processControl: 'None (Child Process)',
  },
];

export const PLATFORM_PROFILES = [
  {
    platform: 'Linux',
    filesystemIsolation: 'Landlock LSM + Seccomp-BPF filtering restricted to /app/models and /tmp/wmlab',
    networkIsolation: 'Network namespace (CLONE_NEWNET) unsharing; zero loopback or external socket routing',
    processRestrictions: 'PR_SET_NO_NEW_PRIVS + Rust process supervisor orphan cleanup via PR_SET_PDEATHSIG',
    credentialStorage: 'Secret Service API / libsecret via encrypted keyring',
    codeSigning: 'GPG detached signature + SHA-256 manifest validation',
    updateVerification: 'Minisign public key cryptographic verification',
    knownLimitations: [
      'Landlock requires Linux kernel >= 5.13',
      'Unprivileged user namespaces must be permitted on host OS for CLONE_NEWNET',
    ],
  },
  {
    platform: 'macOS',
    filesystemIsolation: 'App Sandbox entitlements with strictly scoped security-scoped bookmarks',
    networkIsolation: 'Entitlement com.apple.security.network.client set to FALSE',
    processRestrictions: 'posix_spawn with restrictive sandbox-exec seatbelt profile and parent lifecycle binding',
    credentialStorage: 'Apple Keychain Services with kSecAttrAccessibleAfterFirstUnlock',
    codeSigning: 'Apple Developer ID Application Certificate + Hardened Runtime + Notarization',
    updateVerification: 'Sparkle 2 Ed25519 cryptographic signature verification',
    knownLimitations: [
      'Rosetta 2 translation for x86_64 binaries does not support AVX-512 extensions',
      'Unified memory architectures share physical RAM with GPU cores',
    ],
  },
  {
    platform: 'Windows',
    filesystemIsolation: 'Restricted Token + AppContainer isolation with NTFS ACLs on %LOCALAPPDATA%\\WatermarkLab',
    networkIsolation: 'Windows Filtering Platform (WFP) callout driver block / AppContainer NetworkIsolationSetAppContainerConfig',
    processRestrictions: 'Job Object with JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE preventing orphaned Python processes',
    credentialStorage: 'Windows Data Protection API (DPAPI) + Credential Manager',
    codeSigning: 'Microsoft Authenticode Code Signing Certificate with EV / SmartScreen reputation',
    updateVerification: 'SignTool Authenticode + SHA-256 embedded authenticator',
    knownLimitations: [
      'NTFS Symlink evaluation requires SeCreateSymbolicLinkPrivilege or developer mode',
      'Reparse points and directory junctions require explicit kernel canonicalization checks',
    ],
  },
];
