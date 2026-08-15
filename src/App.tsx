/**
 * WatermarkLab — Privacy-First Desktop Application for Local Text Transformation
 * Master Architecture: React + TypeScript + Tauri 2.x + Rust Core + Python AI Sidecar
 * @license Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Navbar, ActiveTab } from './components/Navbar';
import { TransformWorkbench } from './components/TransformWorkbench';
import { HumanInTheLoopEditor } from './components/HumanInTheLoopEditor';
import { EncryptedVaultView } from './components/EncryptedVaultView';
import { ModelRegistryView } from './components/ModelRegistryView';
import { SecurityTestRunner } from './components/SecurityTestRunner';
import { ArchitectureViewer } from './components/ArchitectureViewer';
import { IpcInspectorModal } from './components/IpcInspectorModal';

import { encryptedVault } from './services/encryptedVault';
import { modelRegistry } from './services/modelRegistry';
import { ipcBridge } from './services/ipcBridge';
import { createHumanEditSession } from './services/diffEngine';
import { HumanEditSession } from './types/transformation';
import { IPCWireLog } from './types/ipc';
import { VaultState } from './types/storage';
import { ModelRegistryState } from './types/models';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('transform');
  const [vaultState, setVaultState] = useState<VaultState>(encryptedVault.getState());
  const [modelState, setModelState] = useState<ModelRegistryState>(modelRegistry.getState());
  const [wireLogs, setWireLogs] = useState<IPCWireLog[]>([]);
  const [isIpcInspectorOpen, setIsIpcInspectorOpen] = useState<boolean>(false);
  const [networkIsolated, setNetworkIsolated] = useState<boolean>(false);
  const [humanSession, setHumanSession] = useState<HumanEditSession | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Subscribe to real-time IPC wire traffic
  useEffect(() => {
    const unsubscribe = ipcBridge.onWireTraffic((logs) => {
      setWireLogs(logs);
    });
    return () => unsubscribe();
  }, []);

  // Refresh model registry from Rust on initial load
  useEffect(() => {
    const refreshModels = async () => {
      const state = await modelRegistry.refresh();
      setModelState(state);
    };
    void refreshModels();
  }, []);

  useEffect(() => {
    const refreshSecurityStatus = async () => {
      if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
        setNetworkIsolated(false);
        return;
      }
      try {
        const invoke = (window as any).__TAURI_INTERNALS__.invoke;
        const status = await invoke('get_security_status');
        setNetworkIsolated(status?.network?.status === 'enforced');
      } catch {
        setNetworkIsolated(false);
      }
    };
    void refreshSecurityStatus();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleToggleVaultLock = () => {
    if (vaultState.isUnlocked) {
      encryptedVault.lock();
      setVaultState(encryptedVault.getState());
      showToast('Encrypted vault locked. In-memory keys cleared.');
    } else {
      setActiveTab('vault');
    }
  };

  const handleUnlockVault = async (passphrase: string) => {
    const res = await encryptedVault.unlock(passphrase);
    setVaultState(encryptedVault.getState());
    if (res.success) {
      showToast('Vault unlocked successfully with AES-256-GCM.');
    }
    return res;
  };

  const handleSaveToVault = async (
    title: string,
    orig: string,
    trans: string,
    op: string,
    model: string,
    sim: number,
    validation: any,
    watermark: string
  ) => {
    if (!vaultState.isUnlocked) {
      // Auto prompt user to open vault
      setActiveTab('vault');
      showToast('Please unlock the Encrypted Vault to store persistent records.');
      return;
    }
    const res = await encryptedVault.saveTransformation(
      title,
      orig,
      trans,
      op,
      model,
      sim,
      ['local_inference', op],
      validation,
      watermark
    );
    if (res.success) {
      setVaultState(encryptedVault.getState());
      showToast('Record encrypted and saved to local vault.');
    } else {
      showToast(res.error || 'Failed saving to vault');
    }
  };

  const handleSendToHumanEdit = (
    original: string,
    proposed: string,
    model: string,
    op: string,
    watermark: string
  ) => {
    const session = createHumanEditSession(original, proposed, model, op, watermark);
    setHumanSession(session);
    setActiveTab('human_edit');
    showToast('Transformation loaded into Human-in-the-Loop review.');
  };

  const handleToggleNetworkIsolation = () => {
    showToast(
      networkIsolated
        ? 'Privacy Mode is enforced by the native OS process boundary.'
        : 'Privacy Mode is not OS-enforced on this host. Network isolation must be provided by the runtime sandbox.'
    );
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* 3-Zone Strict Top Bar Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        vaultState={vaultState}
        onToggleVaultLock={handleToggleVaultLock}
        onOpenIpcInspector={() => setIsIpcInspectorOpen(true)}
        networkIsolated={networkIsolated}
        wireLogCount={wireLogs.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'transform' && (
          <TransformWorkbench
            onSendToHumanEdit={handleSendToHumanEdit}
            onSaveToVault={handleSaveToVault}
            isVaultUnlocked={vaultState.isUnlocked}
          />
        )}

        {activeTab === 'human_edit' && (
          <HumanInTheLoopEditor
            session={humanSession}
            onUpdateSession={setHumanSession}
            onSaveToVault={handleSaveToVault}
            isVaultUnlocked={vaultState.isUnlocked}
          />
        )}

        {activeTab === 'vault' && (
          <EncryptedVaultView
            vaultState={vaultState}
            onRefreshVault={() => setVaultState(encryptedVault.getState())}
            onUnlockVault={handleUnlockVault}
            onLockVault={() => {
              encryptedVault.lock();
              setVaultState(encryptedVault.getState());
            }}
          />
        )}

        {activeTab === 'models' && (
          <ModelRegistryView
            registryState={modelState}
            onRefreshRegistry={() => setModelState(modelRegistry.getState())}
          />
        )}

        {activeTab === 'security' && (
          <SecurityTestRunner
            networkIsolated={networkIsolated}
            onToggleNetworkIsolation={handleToggleNetworkIsolation}
          />
        )}

        {activeTab === 'architecture' && <ArchitectureViewer />}
      </main>

      {/* Footer Status Bar */}
      <footer className="border-t border-zinc-900 bg-zinc-950 py-3 text-xs text-zinc-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="font-semibold text-zinc-300">WatermarkLab v1.0.0</span>
            <span>•</span>
            <span>Tauri 2.x Offline-First Runtime</span>
          </div>

          <div className="flex items-center gap-4 font-mono text-[11px]">
            <span>IPC Protocol v1</span>
            <span>•</span>
            <span>AES-256-GCM / PBKDF2</span>
            <span>•</span>
            <span className="text-emerald-400">Zero Telemetry Invariant Active</span>
          </div>
        </div>
      </footer>

      {/* IPC Inspector Modal */}
      <IpcInspectorModal
        isOpen={isIpcInspectorOpen}
        onClose={() => setIsIpcInspectorOpen(false)}
        logs={wireLogs}
        onClearLogs={() => ipcBridge.clearWireLogs()}
      />

      {/* Global Notification Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-medium shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
