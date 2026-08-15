import React, { useEffect, useState } from 'react';
import {
  Lock,
  Unlock,
  KeyRound,
  Trash2,
  Eye,
  EyeOff,
  ShieldCheck,
  FileText,
  Search,
  HardDrive,
  Copy,
  Check,
  Stamp,
  CheckCircle2,
  Cpu,
  Layers,
} from 'lucide-react';
import { DecryptedVaultContent, EncryptedVaultItem, VaultState } from '../types/storage';
import { encryptedVault } from '../services/encryptedVault';

interface EncryptedVaultViewProps {
  vaultState: VaultState;
  onRefreshVault: () => void;
  onUnlockVault: (passphrase: string) => Promise<{ success: boolean; error?: string }>;
  onLockVault: () => void;
}

export const EncryptedVaultView: React.FC<EncryptedVaultViewProps> = ({
  vaultState,
  onRefreshVault,
  onUnlockVault,
  onLockVault,
}) => {
  const [passphraseInput, setPassphraseInput] = useState<string>('');
  const [unlockError, setUnlockError] = useState<string>('');
  const [isUnlocking, setIsUnlocking] = useState<boolean>(false);
  const [selectedItem, setSelectedItem] = useState<DecryptedVaultContent | null>(null);
  const [showDiskDump, setShowDiskDump] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [rawDiskDump, setRawDiskDump] = useState<string>('');

  useEffect(() => {
    let active = true;
    void encryptedVault.getRawDiskDump().then(value => { if (active) setRawDiskDump(value); }).catch(() => { if (active) setRawDiskDump('[UNAVAILABLE]'); });
    return () => { active = false; };
  }, [vaultState.itemCount]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphraseInput) return;
    setIsUnlocking(true);
    setUnlockError('');

    const res = await onUnlockVault(passphraseInput);
    setIsUnlocking(false);
    if (!res.success) {
      setUnlockError(res.error || 'Failed unlocking vault');
    } else {
      setPassphraseInput('');
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await encryptedVault.deleteItem(id);
    if (selectedItem?.id === id) setSelectedItem(null);
    onRefreshVault();
  };

  const handleSelectItem = (item: EncryptedVaultItem) => {
    const decrypted = encryptedVault.getDecryptedItem(item.id);
    if (decrypted) {
      setSelectedItem(decrypted);
    }
  };

  const filteredItems = vaultState.items.filter(i => {
    if (!searchQuery) return true;
    return (
      i.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });


  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-lg border ${
              vaultState.isUnlocked
                ? 'bg-amber-950/60 border-amber-800/60 text-amber-400'
                : 'bg-zinc-950 border-zinc-800 text-zinc-400'
            }`}
          >
            {vaultState.isUnlocked ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-100">
                AES-256-GCM Encrypted Local Storage Vault
              </h2>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-950 border border-zinc-800 text-emerald-400">
                Argon2id (64MB memory, 3 passes)
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              {vaultState.isUnlocked
                ? `Decrypted in isolated memory (${vaultState.itemCount} items) • Auto-locks in ${vaultState.autoLockTimeoutMinutes}m`
                : `Vault locked • All ${vaultState.itemCount} records encrypted with AES-256-GCM`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDiskDump(!showDiskDump)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors"
          >
            <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
            <span>{showDiskDump ? 'Hide Storage Dump' : 'Inspect Raw Storage'}</span>
          </button>

          {vaultState.isUnlocked && (
            <button
              onClick={onLockVault}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 hover:bg-rose-950/60 hover:text-rose-300 text-zinc-300 border border-zinc-700 transition-colors"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Lock Vault</span>
            </button>
          )}
        </div>
      </div>

      {/* Raw Storage / Zero-Plaintext Audit Inspection Drawer */}
      {showDiskDump && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-zinc-200">
                Zero-Plaintext Storage Verification Inspector
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-400">
              Raw disk footprint: {rawDiskDump.length} bytes
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            This live inspector dumps the underlying persistent storage. Notice there is zero plaintext user data:
            only high-entropy Base64 ciphertext, IVs, Argon2id salts, and cryptographic parameters.
          </p>
          <pre className="bg-zinc-900 border border-zinc-850 p-3 rounded-lg text-[11px] font-mono text-emerald-300 max-h-40 overflow-y-auto whitespace-pre-wrap select-all">
            {rawDiskDump}
          </pre>
        </div>
      )}

      {/* Vault Unlocking Gate */}
      {!vaultState.isUnlocked ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 max-w-md mx-auto text-center space-y-4 shadow-lg">
          <div className="w-12 h-12 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
            <KeyRound className="w-6 h-6" />
          </div>

          <div>
            <h3 className="text-base font-semibold text-zinc-100">Unlock Encrypted Vault</h3>
            <p className="text-xs text-zinc-400 mt-1">
              Enter your master passphrase to derive the 256-bit AES-GCM key with Argon2id and decrypt cached records.
            </p>
          </div>

          <form onSubmit={handleUnlock} className="space-y-3 text-left">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Master Passphrase</label>
              <input
                type="password"
                value={passphraseInput}
                onChange={e => setPassphraseInput(e.target.value)}
                placeholder="Enter passphrase (min 6 characters)..."
                className="w-full bg-zinc-950 border border-zinc-800 text-zinc-100 px-3 py-2 rounded-md text-xs focus:outline-none focus:border-zinc-600 font-mono"
              />
            </div>

            {unlockError && (
              <div className="p-2 rounded bg-rose-950/40 border border-rose-900/60 text-xs text-rose-300">
                {unlockError}
              </div>
            )}

            <button
              type="submit"
              disabled={isUnlocking || !passphraseInput}
              className="w-full py-2 px-4 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isUnlocking ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Deriving Argon2id Key...</span>
                </>
              ) : (
                <>
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Unlock Vault</span>
                </>
              )}
            </button>
          </form>
        </div>
      ) : (
        /* Unlocked Vault: Items Table & Detail Split */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left: Items List */}
          <div className="lg:col-span-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col min-h-[480px]">
            <div className="p-3 border-b border-zinc-800 bg-zinc-950/60 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-200">
                <span>Encrypted Records ({vaultState.itemCount})</span>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Filter records..."
                  className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 pl-8 pr-3 py-1.5 rounded-md text-xs focus:outline-none focus:border-zinc-700"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60">
              {filteredItems.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">No saved transformations found</div>
              ) : (
                filteredItems.map(item => {
                  const isSelected = selectedItem?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectItem(item)}
                      className={`p-3 cursor-pointer transition-colors text-xs space-y-1.5 ${
                        isSelected ? 'bg-zinc-800/90 border-l-2 border-emerald-400' : 'hover:bg-zinc-850/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-zinc-200 truncate">{item.title}</span>
                        <button
                          onClick={e => handleDelete(item.id, e)}
                          className="text-zinc-500 hover:text-rose-400 p-1 rounded transition-colors"
                          title="Delete record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                        <span className="text-zinc-500">{item.kdf || 'Argon2id'}</span>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {item.tags.map((t, idx) => (
                          <span
                            key={idx}
                            className="px-1.5 py-0.2 rounded text-[10px] bg-zinc-950 text-zinc-400 border border-zinc-800"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Decrypted Item Inspection Detail */}
          <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col min-h-[480px]">
            {selectedItem ? (
              <div className="space-y-4 flex-1 flex flex-col">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100">{selectedItem.title}</h3>
                    <div className="text-xs text-zinc-400 flex items-center gap-2 mt-0.5">
                      <span>Op: {selectedItem.operation}</span>
                      <span>•</span>
                      <span>Model: {selectedItem.modelUsed}</span>
                      {selectedItem.watermarkSignature && (
                        <>
                          <span>•</span>
                          <span className="font-mono text-indigo-400">{selectedItem.watermarkSignature}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(selectedItem.transformedText);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy Output'}</span>
                  </button>
                </div>

                {/* Side-by-side or stacked decrypted view */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                  <div className="flex flex-col space-y-1.5">
                    <span className="text-xs font-medium text-zinc-400">Original Text:</span>
                    <div className="flex-1 p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 whitespace-pre-wrap overflow-y-auto max-h-[220px]">
                      {selectedItem.originalText}
                    </div>
                  </div>

                  <div className="flex flex-col space-y-1.5">
                    <span className="text-xs font-medium text-zinc-400">Transformed Result:</span>
                    <div className="flex-1 p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-emerald-300 whitespace-pre-wrap overflow-y-auto max-h-[220px]">
                      {selectedItem.transformedText}
                    </div>
                  </div>
                </div>

                {/* Structured Provenance Record Box if available */}
                {selectedItem.provenance && (
                  <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs space-y-2 font-mono">
                    <div className="flex items-center justify-between text-indigo-400 font-semibold border-b border-zinc-850 pb-1.5">
                      <span className="flex items-center gap-1.5">
                        <Stamp className="w-3.5 h-3.5" />
                        Structured Provenance Record ({selectedItem.provenance.provenance_version})
                      </span>
                      <span className="text-[10px] text-zinc-500">Document ID: {selectedItem.provenance.document_id}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
                      <div>
                        <span className="text-zinc-500">Input SHA-256:</span>{' '}
                        <span className="text-zinc-300">{selectedItem.provenance.source_text_sha256.slice(0, 16)}...</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Output SHA-256:</span>{' '}
                        <span className="text-zinc-300">{selectedItem.provenance.output_text_sha256.slice(0, 16)}...</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Model Digest:</span>{' '}
                        <span className="text-zinc-300">{selectedItem.provenance.model_sha256.slice(0, 16)}...</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Tamper Digest:</span>{' '}
                        <span className="text-emerald-400">{selectedItem.provenance.tamper_digest.slice(0, 16)}...</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Cryptographic metadata badge */}
                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs flex items-center justify-between text-zinc-400 font-mono">
                  <span>Record ID: {selectedItem.id}</span>
                  <span className="text-emerald-400">AES-256-GCM Verified ✓</span>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-400">
                <FileText className="w-10 h-10 text-zinc-700 mb-2" />
                <p className="text-xs font-medium text-zinc-300">Select a record from the vault</p>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Decryption occurs strictly in-memory and is never written to disk unencrypted.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

