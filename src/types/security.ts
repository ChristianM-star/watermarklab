export type SandboxLevel = 'strict_isolated' | 'enforced_offline' | 'permissive_dev';

export interface SecurityPolicy {
  networkIsolationEnforced: boolean;
  blockDnsResolution: boolean;
  blockTcpSockets: boolean;
  blockUdpSockets: boolean;
  blockHttpRequests: boolean;
  blockHttpsRequests: boolean;
  filesystemJailEnforced: boolean;
  allowedFsRoots: string[];
  deniedFsPaths: string[];
  maxPayloadBytes: number;
  maxExecutionTimeoutMs: number;
  memoryLimitMb: number;
  sanitizeLogs: boolean;
  banTelemetry: boolean;
  kdfAlgorithm: 'Argon2id' | 'PBKDF2-SHA256';
  enforceNonceUniqueness: boolean;
}

export type TestCategory = 'unit' | 'integration' | 'security' | 'correctness' | 'e2e';

export interface SecurityTestResult {
  id: string;
  category: TestCategory;
  name: string;
  description: string;
  status: 'passed' | 'failed' | 'running' | 'idle';
  durationMs?: number;
  assertion: string;
  invariantProperty?: string;
  enforcementMechanism?: string;
  documentedLimitation?: string;
  diagnostic?: string;
  canaryLeakDetected?: boolean;
}

export interface CanaryScanReport {
  timestamp: number;
  scannedLocations: string[];
  canaryTokensInjected: number;
  canaryTokensDetected: number;
  zeroLeakageVerified: boolean;
  cleanLogBytesScanned: number;
  memoryScannedBytes: number;
}

export interface PlatformSecurityProfile {
  platform: 'linux' | 'macos' | 'windows';
  filesystemIsolation: string;
  networkIsolation: string;
  processRestrictions: string;
  credentialStorage: string;
  codeSigning: string;
  updateVerification: string;
  knownLimitations: string[];
}
