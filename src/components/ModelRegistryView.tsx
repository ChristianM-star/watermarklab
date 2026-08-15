import React, { useState } from 'react';
import {
  ListFilter,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  Cpu,
  ShieldCheck,
  RefreshCw,
  Power,
  Info,
} from 'lucide-react';
import { ModelRegistryState } from '../types/models';
import { modelRegistry } from '../services/modelRegistry';

interface ModelRegistryViewProps {
  registryState: ModelRegistryState;
  onRefreshRegistry: () => void;
}

export const ModelRegistryView: React.FC<ModelRegistryViewProps> = ({
  registryState,
  onRefreshRegistry,
}) => {
  const [verifyingModelId, setVerifyingModelId] = useState<string | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<Record<string, { valid: boolean; hash: string; msg?: string }>>({});

  const handleVerify = async (modelId: string) => {
    setVerifyingModelId(modelId);
    const res = await modelRegistry.verifyModelIntegrity(modelId);
    setVerifyingModelId(null);
    setVerifyStatus(prev => ({
      ...prev,
      [modelId]: { valid: res.valid, hash: res.hash, msg: res.error },
    }));
    onRefreshRegistry();
  };

  const handleToggleLoad = (modelId: string) => {
    modelRegistry.toggleModelLoad(modelId);
    onRefreshRegistry();
  };

  const handleSelectActive = (type: 'paraphrase' | 'translation', modelId: string) => {
    modelRegistry.setActiveModel(type, modelId);
    onRefreshRegistry();
  };

  const vramPercentage = Math.round(
    (registryState.totalVramAllocatedMb / registryState.maxVramBudgetMb) * 100
  );

  return (
    <div className="space-y-6">
      {/* Header Banner with VRAM Budget Bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-emerald-400">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-100">Local Model Registry & Integrity</h2>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-950 border border-zinc-800 text-emerald-400">
                Offline Verified
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              All models are pre-bundled or explicitly loaded with mandatory SHA-256 cryptographic verification.
            </p>
          </div>
        </div>

        {/* VRAM Budget Indicator */}
        <div className="w-full sm:w-64 bg-zinc-950 border border-zinc-800 p-2.5 rounded-lg space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400">Isolated RAM / VRAM:</span>
            <span className="font-mono text-zinc-200 font-semibold">
              {(registryState.totalVramAllocatedMb / 1024).toFixed(1)} GB / {(registryState.maxVramBudgetMb / 1024).toFixed(0)} GB
            </span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                vramPercentage > 85 ? 'bg-amber-400' : 'bg-emerald-400'
              }`}
              style={{ width: `${vramPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Model Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {registryState.models.map(model => {
          const isVerifying = verifyingModelId === model.logical_id;
          const status = verifyStatus[model.logical_id];
          const isParaphraseActive = registryState.activeParaphraseModel === model.logical_id;
          const isTranslationActive = registryState.activeTranslationModel === model.logical_id;

          return (
            <div
              key={model.logical_id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-4 hover:border-zinc-700 transition-colors"
            >
              <div className="space-y-3">
                {/* Header with Title & Status Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                      <span>{model.model_name}</span>
                      {model.isBundled && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700">
                          Bundled
                        </span>
                      )}
                    </h3>
                    <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                      v{model.model_version} • {model.format} • {model.quantization}
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                      model.status === 'loaded_in_memory'
                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                        : model.status === 'tampered'
                        ? 'bg-rose-950/60 text-rose-300 border-rose-800/60'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                    }`}
                  >
                    {model.status === 'loaded_in_memory'
                      ? 'In Memory'
                      : model.status === 'tampered'
                      ? 'Tampered / Hash Mismatch'
                      : 'Offline Cached'}
                  </span>
                </div>

                <p className="text-xs text-zinc-400 leading-relaxed">{model.description}</p>

                {/* Specs Grid */}
                <div className="grid grid-cols-3 gap-2 bg-zinc-950 border border-zinc-800/80 p-2.5 rounded-lg text-xs font-mono">
                  <div>
                    <div className="text-[10px] text-zinc-500">Disk Size</div>
                    <div className="text-zinc-200 font-semibold">{model.size_human}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500">RAM Needed</div>
                    <div className="text-zinc-200 font-semibold">{model.ram_requirement_mb} MB</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500">License</div>
                    <div className="text-zinc-300 truncate" title={model.license}>
                      {model.license.split(' ')[0]}
                    </div>
                  </div>
                </div>

                {/* SHA-256 Digest Box */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500">Expected SHA-256:</span>
                    <span className="text-zinc-400 font-mono text-[10px]">
                      {model.sha256.slice(0, 16)}...{model.sha256.slice(-8)}
                    </span>
                  </div>
                  {status && (
                    <div
                      className={`p-2 rounded text-[11px] font-mono border ${
                        status.valid
                          ? 'bg-emerald-950/30 border-emerald-800 text-emerald-300'
                          : 'bg-rose-950/30 border-rose-800 text-rose-300'
                      }`}
                    >
                      {status.valid ? '✓ SHA-256 Integrity Verified' : `✗ ${status.msg}`}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-zinc-800/80">
                <button
                  onClick={() => handleVerify(model.logical_id)}
                  disabled={isVerifying}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
                  <span>{isVerifying ? 'Hashing Binary...' : 'Verify SHA-256'}</span>
                </button>

                <div className="flex items-center gap-2">
                  {model.supported_operations.includes('paraphrase') && (
                    <button
                      onClick={() => handleSelectActive('paraphrase', model.logical_id)}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        isParaphraseActive
                          ? 'bg-emerald-600 text-white font-semibold'
                          : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                      }`}
                    >
                      {isParaphraseActive ? 'Active Paraphrase' : 'Set Active'}
                    </button>
                  )}

                  {model.supported_operations.includes('translation') && (
                    <button
                      onClick={() => handleSelectActive('translation', model.logical_id)}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        isTranslationActive
                          ? 'bg-indigo-600 text-white font-semibold'
                          : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                      }`}
                    >
                      {isTranslationActive ? 'Active Translation' : 'Set Active'}
                    </button>
                  )}

                  <button
                    onClick={() => handleToggleLoad(model.logical_id)}
                    className={`p-1.5 rounded-md border transition-colors ${
                      model.status === 'loaded_in_memory'
                        ? 'bg-rose-950/40 text-rose-300 border-rose-900 hover:bg-rose-900/50'
                        : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                    }`}
                    title={model.status === 'loaded_in_memory' ? 'Unload from memory' : 'Load into memory'}
                  >
                    <Power className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

