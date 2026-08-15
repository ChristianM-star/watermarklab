export type KdfType = 'Argon2id' | 'PBKDF2-SHA256';

export interface Argon2Params {
  memoryCostKiB: number; // e.g. 65536 KiB (64 MB)
  timeCost: number; // e.g. 3 iterations
  parallelism: number; // e.g. 4 threads
}

export interface Pbkdf2Params {
  iterations: number; // e.g. 100000+
  hash: 'SHA-256';
}

export interface EncryptedVaultItem {
  id: string;
  title: string;
  tags: string[];
  ciphertext: string; // Base64 encoded AES-256-GCM ciphertext
  iv: string; // Base64 encoded 12-byte initialization vector (unique per operation)
  salt: string; // Base64 encoded salt
  algorithm: 'AES-256-GCM';
  kdf: KdfType;
  kdfParams: Argon2Params | Pbkdf2Params;
  authTagVerified: boolean;
  createdAt: number;
  updatedAt: number;
  previewByteLength: number;
  provenanceRecord?: StructuredProvenance;
}

export interface StructuredProvenance {
  provenance_version: 'WMLAB-V1';
  document_id: string;
  revision_id: string;
  parent_revision_id: string | null;
  operation: string;
  model_id: string;
  model_version: string;
  model_sha256: string;
  validator_version: string;
  timestamp: string;
  human_edits: Array<{
    timestamp: number;
    action: string;
    segmentId?: string;
    details: string;
  }>;
  watermark_id: string;
}

export interface DecryptedVaultContent {
  id: string;
  title: string;
  tags: string[];
  originalText: string;
  transformedText: string;
  operation: string;
  modelUsed: string;
  similarityScore: number;
  watermarkSignature?: string;
  validationReport?: any;
  provenance?: StructuredProvenance;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface VaultState {
  isUnlocked: boolean;
  itemCount: number;
  items: EncryptedVaultItem[];
  decryptedCache: Map<string, DecryptedVaultContent>;
  lastUnlockedAt?: number;
  autoLockTimeoutMinutes: number;
  activeKdf: KdfType;
}
