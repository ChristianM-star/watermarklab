import React from 'react';
import {
  ShieldCheck,
  Cpu,
  Lock,
  Unlock,
  Radio,
  FileCode2,
  ListFilter,
  CheckCircle2,
} from 'lucide-react';
import { VaultState } from '../types/storage';

export type ActiveTab =
  | 'transform'
  | 'human_edit'
  | 'vault'
  | 'models'
  | 'security'
  | 'architecture';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  vaultState: VaultState;
  onToggleVaultLock: () => void;
  onOpenIpcInspector: () => void;
  networkIsolated: boolean;
  wireLogCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  vaultState,
  onToggleVaultLock,
  onOpenIpcInspector,
  networkIsolated,
  wireLogCount,
}) => {
  const navItems: Array<{ id: ActiveTab; label: string; icon: React.ReactNode }> = [
    { id: 'transform', label: 'Transform', icon: <Cpu className="w-4 h-4" /> },
    { id: 'human_edit', label: 'Human Edit', icon: <CheckCircle2 className="w-4 h-4" /> },
    { id: 'vault', label: 'Vault', icon: <Lock className="w-4 h-4" /> },
    { id: 'models', label: 'Models', icon: <ListFilter className="w-4 h-4" /> },
    { id: 'security', label: 'Security & Tests', icon: <ShieldCheck className="w-4 h-4" /> },
    { id: 'architecture', label: 'Tauri Architecture', icon: <FileCode2 className="w-4 h-4" /> },
  ];

  return (
    <header className="border-b border-zinc-800 bg-zinc-950 text-zinc-100 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Zone 1: Brand Title (Single text element with strict styling) */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono font-bold text-sm">
              W
            </div>
            <span className="font-semibold text-base tracking-tight text-zinc-100">
              WatermarkLab
            </span>
          </div>
          <div className="hidden md:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-800/50">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            {networkIsolated ? 'Isolated Offline' : 'Network Active'}
          </div>
        </div>

        {/* Zone 2: Navigation Links (4-6 single line items) */}
        <nav className="flex items-center gap-1 overflow-x-auto py-1">
          {navItems.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.id === 'vault' && vaultState.itemCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 bg-zinc-800 text-zinc-300 rounded text-xs">
                    {vaultState.itemCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary Actions (1-2 single-line controls) */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onOpenIpcInspector}
            title="Inspect real-time authenticated IPC wire traffic"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 transition-colors whitespace-nowrap"
          >
            <Radio className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">IPC Wire</span>
            <span className="px-1.5 py-0.2 bg-zinc-800 text-zinc-400 rounded text-xs">
              {wireLogCount}
            </span>
          </button>

          <button
            onClick={onToggleVaultLock}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
              vaultState.isUnlocked
                ? 'bg-amber-950/40 text-amber-300 border-amber-800/60 hover:bg-amber-900/40'
                : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800'
            }`}
          >
            {vaultState.isUnlocked ? (
              <>
                <Unlock className="w-3.5 h-3.5 text-amber-400" />
                <span>Unlocked</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 text-zinc-400" />
                <span>Vault Locked</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
