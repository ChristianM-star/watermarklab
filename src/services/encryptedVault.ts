import { DecryptedVaultContent, EncryptedVaultItem, KdfType, StructuredProvenance, VaultState } from '../types/storage';
import { createStructuredProvenance, decryptData, encryptData, generateUuid } from './crypto';
import { securityCore } from './securityCore';


export class EncryptedVaultService {
  private passphrase?: string;
  private state: VaultState = {
    isUnlocked: false,
    itemCount: 0,
    items: [],
    decryptedCache: new Map<string, DecryptedVaultContent>(),
    autoLockTimeoutMinutes: 15,
    activeKdf: 'Argon2id',
  };

  private autoLockTimer: any = null;

  constructor() {
    void this.loadFromNativeStorage();
  }

  private async loadFromNativeStorage(): Promise<void> {
    if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) return;
    try {
      const invoke = (window as any).__TAURI_INTERNALS__.invoke;
      const parsed = await invoke('vault_load');
      if (Array.isArray(parsed)) {
        this.state.items = parsed;
        this.state.itemCount = parsed.length;
      }
    } catch (e) {
      securityCore.logEvent('warn', 'Native encrypted vault load failed');
    }
  }

  private async persistItemsToStorage(): Promise<void> {
    if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
      throw new Error('NATIVE_STORAGE_REQUIRED: encrypted vault persistence is native-only');
    }
    const invoke = (window as any).__TAURI_INTERNALS__.invoke;
    const diskItems = this.state.items.map(item => ({
      ...item,
      title: '',
      tags: [],
      provenanceRecord: undefined,
    }));
    await invoke('vault_save', { items: diskItems });
  }

  getState(): VaultState {
    return {
      isUnlocked: this.state.isUnlocked,
      itemCount: this.state.items.length,
      items: [...this.state.items],
      decryptedCache: new Map(this.state.decryptedCache),
      lastUnlockedAt: this.state.lastUnlockedAt,
      autoLockTimeoutMinutes: this.state.autoLockTimeoutMinutes,
      activeKdf: this.state.activeKdf,
    };
  }

  setKdf(kdf: KdfType): void {
    this.state.activeKdf = kdf;
    securityCore.logEvent('info', `Vault active KDF changed to ${kdf}`);
  }

  // Attempt to unlock vault with user passphrase
  async unlock(passphrase: string): Promise<{ success: boolean; error?: string }> {
    if (!passphrase || passphrase.length < 6) {
      return { success: false, error: 'Passphrase must be at least 6 characters' };
    }

    try {
      this.state.decryptedCache.clear();

      // If items exist, test decrypting the first item to verify passphrase validity
      if (this.state.items.length > 0) {
        const first = this.state.items[0];
        try {
          const decryptedJson = await decryptData(
            first.ciphertext,
            first.iv,
            first.salt,
            passphrase,
            first.kdf || 'Argon2id',
            first.kdfParams
          );
          const parsed = JSON.parse(decryptedJson);
          this.state.decryptedCache.set(first.id, parsed);
          this.state.items[0] = { ...this.state.items[0], title: parsed.title, tags: parsed.tags };
        } catch (err) {
          securityCore.logEvent('security_violation', 'Vault unlock failed: Invalid cryptographic passphrase authentication');
          return { success: false, error: 'INCORRECT_PASSPHRASE: AES-GCM authentication tag verification failed' };
        }

        // Decrypt remaining items into transient memory cache
        for (let i = 1; i < this.state.items.length; i++) {
          const item = this.state.items[i];
          try {
            const rawJson = await decryptData(
              item.ciphertext,
              item.iv,
              item.salt,
              passphrase,
              item.kdf || 'Argon2id',
              item.kdfParams
            );
            const parsed = JSON.parse(rawJson) as DecryptedVaultContent;
            this.state.decryptedCache.set(item.id, parsed);
            this.state.items[i] = { ...this.state.items[i], title: parsed.title, tags: parsed.tags };
          } catch (e) {
            console.error('Failed decrypting item', item.id);
          }
        }
      }

      this.passphrase = passphrase;
      this.state.isUnlocked = true;
      this.state.lastUnlockedAt = Date.now();
      this.resetAutoLockTimer();
      securityCore.logEvent('info', `Encrypted vault unlocked successfully into isolated memory (${this.state.activeKdf})`);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Vault unlock error' };
    }
  }

  lock(): void {
    // Clear all in-memory keys and decrypted plaintext
    this.passphrase = undefined;
    this.state.decryptedCache.clear();
    this.state.isUnlocked = false;
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }
    securityCore.logEvent('info', 'Encrypted vault locked. Memory buffers sanitized.');
  }

  private resetAutoLockTimer(): void {
    if (this.autoLockTimer) clearTimeout(this.autoLockTimer);
    this.autoLockTimer = setTimeout(() => {
      this.lock();
    }, this.state.autoLockTimeoutMinutes * 60 * 1000);
  }

  // Encrypt and save a new transformation item with structured provenance
  async saveTransformation(
    title: string,
    originalText: string,
    transformedText: string,
    operation: string,
    modelUsed: string,
    similarityScore: number,
    tags: string[] = ['paraphrase', 'offline'],
    validationReport?: any,
    watermarkSignature?: string,
    provenance?: StructuredProvenance
  ): Promise<{ success: boolean; item?: EncryptedVaultItem; error?: string }> {
    if (!this.state.isUnlocked || !this.passphrase) {
      return { success: false, error: 'STORAGE_FAILURE: Vault must be unlocked to persist encrypted records' };
    }

    const id = generateUuid();
    const now = Date.now();

    const provRecord =
      provenance ||
      (await createStructuredProvenance(
        originalText,
        transformedText,
        modelUsed,
        '1.0.0',
        'unverified',
        operation
      ));

    const payload: DecryptedVaultContent = {
      id,
      title: title || `Transformation ${new Date().toLocaleTimeString()}`,
      tags,
      originalText,
      transformedText,
      operation,
      modelUsed,
      similarityScore,
      watermarkSignature: watermarkSignature || provRecord.watermark_id,
      validationReport,
      provenance: provRecord,
      createdAt: now,
      updatedAt: now,
    };

    const payloadJson = JSON.stringify(payload);
    const encrypted = await encryptData(payloadJson, this.passphrase, this.state.activeKdf);

    const vaultItem: EncryptedVaultItem = {
      id,
      title: payload.title,
      tags,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      salt: encrypted.salt,
      algorithm: 'AES-256-GCM',
      kdf: encrypted.kdf,
      kdfParams: encrypted.kdfParams,
      authTagVerified: encrypted.authTagVerified,
      createdAt: now,
      updatedAt: now,
      previewByteLength: encrypted.ciphertext.length,
      provenanceRecord: provRecord,
    };

    this.state.items.unshift(vaultItem);
    this.state.itemCount = this.state.items.length;
    this.state.decryptedCache.set(id, payload);
    await this.persistItemsToStorage();

    securityCore.logEvent('info', `Encrypted record [${id.slice(0, 8)}] written with AES-256-GCM (${encrypted.kdf})`);
    return { success: true, item: vaultItem };
  }

  async deleteItem(id: string): Promise<boolean> {
    this.state.items = this.state.items.filter(i => i.id !== id);
    this.state.itemCount = this.state.items.length;
    this.state.decryptedCache.delete(id);
    await this.persistItemsToStorage();
    securityCore.logEvent('info', `Encrypted record [${id.slice(0, 8)}] deleted from storage`);
    return true;
  }

  getDecryptedItem(id: string): DecryptedVaultContent | undefined {
    return this.state.decryptedCache.get(id);
  }

  // Get raw underlying storage payload for leak verification inspection
  async getRawDiskDump(): Promise<string> {
    if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) return '[NATIVE STORAGE UNAVAILABLE]';
    const invoke = (window as any).__TAURI_INTERNALS__.invoke;
    return await invoke('vault_raw_dump');
  }
}

export const encryptedVault = new EncryptedVaultService();

