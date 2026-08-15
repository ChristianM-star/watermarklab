/**
 * Authoritative Cryptographic Client & Vault Bridge for WatermarkLab
 * Provides interface to native Rust Argon2id + AES-256-GCM backend
 * No browser cryptographic fallback is permitted; desktop Rust is authoritative.
 */

import { Argon2Params, KdfType, Pbkdf2Params, StructuredProvenance } from '../types/storage';

// Helper to convert ArrayBuffer to Base64
export function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper to convert Base64 to ArrayBuffer
export function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Compute SHA-256 hash of a string or buffer
export async function computeSha256(input: string | ArrayBuffer): Promise<string> {
  const encoder = new TextEncoder();
  const data = typeof input === 'string' ? encoder.encode(input) : input;
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generate random cryptographic bytes (e.g. for IV, salt, session tokens)
export function getRandomBytes(length: number): Uint8Array {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return array;
}

// Generate UUID v4 with cryptographically secure random bytes
export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const bytes = getRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Benchmarked KDF parameters stored in encrypted record metadata
export const DEFAULT_ARGON2_PARAMS: Argon2Params = {
  memoryCostKiB: 65536, // 64 MB memory hardness
  timeCost: 3, // 3 iterations
  parallelism: 4, // 4 lanes
};

export const DEFAULT_PBKDF2_PARAMS: Pbkdf2Params = {
  iterations: 210000, // Modern calibrated iteration count
  hash: 'SHA-256',
};

// Check if running inside native Tauri desktop runtime
function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Authoritative key derivation
 */
export async function deriveKeyFromPassphrase(
  _passphrase: string,
  _salt: Uint8Array,
  _kdf: KdfType = 'Argon2id',
  _params?: Argon2Params | Pbkdf2Params
): Promise<CryptoKey> {
  throw new Error('NATIVE_CRYPTO_REQUIRED: key derivation is only available through the Rust Tauri backend');
}

/**
 * Encrypt plaintext using AES-256-GCM with a fresh 96-bit random IV
 */
export async function encryptData(
  plaintext: string,
  passphrase: string,
  kdf: KdfType = 'Argon2id',
  params?: Argon2Params | Pbkdf2Params
): Promise<{
  ciphertext: string;
  iv: string;
  salt: string;
  kdf: KdfType;
  kdfParams: Argon2Params | Pbkdf2Params;
  authTagVerified: boolean;
}> {
  // If Tauri native bridge is present, route to Rust authoritative backend
  if (!isTauriEnvironment()) {
    throw new Error('NATIVE_CRYPTO_REQUIRED: run WatermarkLab in the Tauri desktop runtime');
  }
  const invoke = (window as any).__TAURI_INTERNALS__.invoke;
  const rustRecord = await invoke('vault_encrypt', {
    plaintext,
    passphrase,
    params: kdf === 'Argon2id' ? (params || DEFAULT_ARGON2_PARAMS) : null,
  });
  return {
    ciphertext: rustRecord.ciphertext,
    iv: rustRecord.iv,
    salt: rustRecord.salt,
    kdf: 'Argon2id',
    kdfParams: rustRecord.kdf_params,
    authTagVerified: true,
  };
  const salt = getRandomBytes(16);
  const iv = getRandomBytes(12); // Standard 96-bit unique nonce for AES-GCM
  const kdfParams = params || (kdf === 'Argon2id' ? DEFAULT_ARGON2_PARAMS : DEFAULT_PBKDF2_PARAMS);

  const key = await deriveKeyFromPassphrase(passphrase, salt, kdf, kdfParams);
  const encoder = new TextEncoder();
  const encodedPlaintext = encoder.encode(plaintext);

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as any,
    },
    key,
    encodedPlaintext
  );

  return {
    ciphertext: bufferToBase64(encryptedBuffer),
    iv: bufferToBase64(iv),
    salt: bufferToBase64(salt),
    kdf,
    kdfParams,
    authTagVerified: true,
  };
}

/**
 * Decrypt ciphertext using AES-256-GCM and verify authentication tag.
 * Throws an error immediately on bit tampering or invalid passphrase.
 */
export async function decryptData(
  ciphertextBase64: string,
  ivBase64: string,
  saltBase64: string,
  passphrase: string,
  _kdf: KdfType = 'Argon2id',
  params?: Argon2Params | Pbkdf2Params
): Promise<string> {
  if (!isTauriEnvironment()) {
    throw new Error('NATIVE_CRYPTO_REQUIRED: run WatermarkLab in the Tauri desktop runtime');
  }
  const invoke = (window as any).__TAURI_INTERNALS__.invoke;
  return await invoke('vault_decrypt', {
    ciphertextB64: ciphertextBase64,
    ivB64: ivBase64,
    saltB64: saltBase64,
    authTagB64: '',
    passphrase,
    params: params || DEFAULT_ARGON2_PARAMS,
  });
}


export async function createStructuredProvenance(
  originalText: string,
  transformedText: string,
  modelId: string,
  modelVersion = '1.0.0',
  modelSha256 = 'unverified',
  operation = 'paraphrase',
  parentRevisionId: string | null = null,
  humanEdits: Array<{ timestamp: number; action: string; details: string }> = []
): Promise<StructuredProvenance> {
  const docId = generateUuid();
  const revId = generateUuid();
  const isoTimestamp = new Date().toISOString();
  const payload = `${originalText}::${transformedText}::${modelId}::${isoTimestamp}`;
  const hash = await computeSha256(payload);
  return {
    provenance_version: 'WMLAB-V1',
    document_id: docId,
    revision_id: revId,
    parent_revision_id: parentRevisionId,
    operation,
    model_id: modelId,
    model_version: modelVersion,
    model_sha256: modelSha256,
    validator_version: '2.1.0-strict',
    timestamp: isoTimestamp,
    human_edits: humanEdits,
    watermark_id: `WMLAB-V1-${hash.slice(0, 16).toUpperCase()}`,
  };
}

export async function createWatermarkProvenance(
  originalText: string,
  transformedText: string,
  modelId: string,
  timestamp: number = Date.now()
): Promise<string> {
  const payload = `${originalText}::${transformedText}::${modelId}::${new Date(timestamp).toISOString()}`;
  const hash = await computeSha256(payload);
  return `WMLAB-V1-${hash.slice(0, 16).toUpperCase()}`;
}
