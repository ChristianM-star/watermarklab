//! Authoritative Cryptographic Vault and Key Derivation (Argon2id + AES-256-GCM)

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::{
    password_hash::SaltString,
    Algorithm, Argon2, Params, Version,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use rand::RngCore;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedRecord {
    pub id: String,
    pub original_text: String, // Masked or ciphertext reference
    pub transformed_text: String,
    pub model_id: String,
    pub provenance_id: String,
    pub ciphertext: String,
    pub iv: String,
    pub salt: String,
    pub auth_tag: String,
    pub kdf: String,
    pub kdf_params: KdfParams,
    pub algorithm: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KdfParams {
    pub memory_cost_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
}

impl Default for KdfParams {
    fn default() -> Self {
        Self {
            memory_cost_kib: 65536, // 64 MB
            iterations: 3,
            parallelism: 4,
        }
    }
}

pub struct VaultEngine;

impl VaultEngine {
    /// Derive a 256-bit encryption key using real Argon2id
    pub fn derive_key_argon2id(passphrase: &str, salt: &[u8], params: &KdfParams) -> Result<[u8; 32], String> {
        let argon2_params = Params::new(
            params.memory_cost_kib,
            params.iterations,
            params.parallelism,
            Some(32),
        )
        .map_err(|e| format!("Invalid Argon2id parameters: {}", e))?;

        let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, argon2_params);

        let mut output_key = [0u8; 32];
        argon2
            .hash_password_into(passphrase.as_bytes(), salt, &mut output_key)
            .map_err(|e| format!("Argon2id derivation failed: {}", e))?;

        Ok(output_key)
    }

    /// Encrypt plaintext using AES-256-GCM with a unique 96-bit nonce
    pub fn encrypt(
        plaintext: &[u8],
        passphrase: &str,
        params: Option<KdfParams>,
    ) -> Result<EncryptedRecord, String> {
        let kdf_params = params.unwrap_or_default();

        // 1. Generate 16 bytes cryptographically secure random salt
        let mut salt_bytes = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut salt_bytes);

        // 2. Derive key via Argon2id
        let derived_key = Self::derive_key_argon2id(passphrase, &salt_bytes, &kdf_params)?;

        // 3. Generate 12 bytes (96 bits) unique IV/nonce
        let mut iv_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut iv_bytes);
        let nonce = Nonce::from_slice(&iv_bytes);

        // 4. Encrypt with AES-256-GCM
        let cipher = Aes256Gcm::new_from_slice(&derived_key)
            .map_err(|e| format!("Cipher initialization error: {}", e))?;

        let ciphertext_with_tag = cipher
            .encrypt(nonce, plaintext)
            .map_err(|e| format!("Encryption failed: {}", e))?;

        // In aes-gcm crate, the 16-byte GMAC tag is appended at the end of the ciphertext
        let tag_len = 16;
        if ciphertext_with_tag.len() < tag_len {
            return Err("Invalid ciphertext length".to_string());
        }

        let split_idx = ciphertext_with_tag.len() - tag_len;
        let ct_bytes = &ciphertext_with_tag[..split_idx];
        let tag_bytes = &ciphertext_with_tag[split_idx..];

        let id = uuid::Uuid::new_v4().to_string();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        Ok(EncryptedRecord {
            id: id.clone(),
            original_text: "[PROTECTED]".to_string(),
            transformed_text: "[PROTECTED]".to_string(),
            model_id: "local-runtime".to_string(),
            provenance_id: format!("WMLAB-V1-{}", &id[..8].to_uppercase()),
            ciphertext: BASE64.encode(ct_bytes),
            iv: BASE64.encode(iv_bytes),
            salt: BASE64.encode(salt_bytes),
            auth_tag: BASE64.encode(tag_bytes),
            kdf: "Argon2id".to_string(),
            kdf_params,
            algorithm: "AES-256-GCM".to_string(),
            created_at: timestamp,
        })
    }

    /// Decrypt ciphertext with AES-256-GCM, verifying GMAC authentication tag
    pub fn decrypt(
        ciphertext_b64: &str,
        iv_b64: &str,
        salt_b64: &str,
        auth_tag_b64: &str,
        passphrase: &str,
        params: &KdfParams,
    ) -> Result<Vec<u8>, String> {
        let salt_bytes = BASE64
            .decode(salt_b64)
            .map_err(|e| format!("Invalid salt encoding: {}", e))?;
        let iv_bytes = BASE64
            .decode(iv_b64)
            .map_err(|e| format!("Invalid IV encoding: {}", e))?;
        let ct_bytes = BASE64
            .decode(ciphertext_b64)
            .map_err(|e| format!("Invalid ciphertext encoding: {}", e))?;
        let tag_bytes = BASE64
            .decode(auth_tag_b64)
            .map_err(|e| format!("Invalid auth tag encoding: {}", e))?;

        if iv_bytes.len() != 12 {
            return Err("Invalid IV length: expected 12 bytes (96 bits)".to_string());
        }

        if tag_bytes.len() != 16 {
            return Err("Invalid GMAC tag length: expected 16 bytes".to_string());
        }

        // Derive key
        let derived_key = Self::derive_key_argon2id(passphrase, &salt_bytes, params)?;

        // Reconstruct ciphertext + tag for AES-GCM decryption
        let mut full_payload = ct_bytes;
        full_payload.extend_from_slice(&tag_bytes);

        let cipher = Aes256Gcm::new_from_slice(&derived_key)
            .map_err(|e| format!("Cipher initialization error: {}", e))?;
        let nonce = Nonce::from_slice(&iv_bytes);

        let decrypted = cipher
            .decrypt(nonce, full_payload.as_ref())
            .map_err(|_| "AUTHENTICATION_FAILED: Decryption failed or ciphertext/tag was tampered with".to_string())?;

        Ok(decrypted)
    }
}
