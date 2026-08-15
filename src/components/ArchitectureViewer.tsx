import React, { useState } from 'react';
import {
  FileCode2,
  Copy,
  Check,
  Shield,
  Layers,
  Terminal,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  FileCheck2,
  Lock,
} from 'lucide-react';
import { ARCHITECTURE_GAP_ITEMS, CAPABILITY_MATRIX, PLATFORM_PROFILES } from '../services/architectureReport';

export interface CodeFile {
  path: string;
  title: string;
  language: string;
  description: string;
}

export const REAL_PROJECT_FILES: CodeFile[] = [
  {
    path: 'src-tauri/Cargo.toml',
    title: 'Cargo.toml (Tauri 2.x Workspace Manifest)',
    language: 'toml',
    description: 'Declares Argon2, AES-GCM, Tokio, and zero-telemetry native dependencies.',
  },
  {
    path: 'src-tauri/src/main.rs',
    title: 'main.rs (Tauri 2.x Supervisor Entrypoint)',
    language: 'rust',
    description: 'Registers command handlers for vault encryption, model integrity, and IPC dispatch.',
  },
  {
    path: 'src-tauri/src/storage.rs',
    title: 'storage.rs (Argon2id + AES-256-GCM Vault)',
    language: 'rust',
    description: 'Authoritative memory-hard key derivation and authenticated GMAC tag encryption.',
  },
  {
    path: 'src-tauri/src/ipc.rs',
    title: 'ipc.rs (Anonymous Pipe Supervisor & Replay Filter)',
    language: 'rust',
    description: 'Pipes stdio to child Python sidecar with 256-bit token authentication and ±30s clock drift checks.',
  },
  {
    path: 'src-tauri/src/security.rs',
    title: 'security.rs (Path Canonicalizer & Sandbox Inspector)',
    language: 'rust',
    description: 'Validates canonical filesystem paths and probes OS network sandboxing capabilities.',
  },
  {
    path: 'src-tauri/src/models.rs',
    title: 'models.rs (Streaming SHA-256 Model Verification)',
    language: 'rust',
    description: 'Streams physical files on disk in 64 KB chunks to verify immutable SHA-256 digests.',
  },
  {
    path: 'sidecar/sidecar.py',
    title: 'sidecar.py (Authoritative Offline Python Daemon)',
    language: 'python',
    description: 'Listens on anonymous stdin pipe, performs local text transforms, and terminates on parent EOF.',
  },
  {
    path: 'sidecar/requirements.lock',
    title: 'requirements.lock (Pinned Offline Dependencies)',
    language: 'text',
    description: 'Zero telemetry, zero cloud SDKs, fully local NLP and tensor runtimes.',
  },
];

export const ArchitectureViewer: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'topology' | 'gaps' | 'matrix' | 'platforms' | 'code'>('gaps');
  const [selectedFile, setSelectedFile] = useState<CodeFile>(REAL_PROJECT_FILES[0]);
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Sub-Nav Bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 pb-3">
        <button
          onClick={() => setActiveTab('gaps')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'gaps'
              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
          }`}
        >
          Architecture Gap Report & Invariants
        </button>
        <button
          onClick={() => setActiveTab('topology')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'topology'
              ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
          }`}
        >
          Process Topology & Boundaries
        </button>
        <button
          onClick={() => setActiveTab('matrix')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'matrix'
              ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
          }`}
        >
          Capability Matrix
        </button>
        <button
          onClick={() => setActiveTab('platforms')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'platforms'
              ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
          }`}
        >
          Platform OS Sandboxes & Limitations
        </button>
        <button
          onClick={() => setActiveTab('code')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'code'
              ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
          }`}
        >
          Tauri 2.x & Rust Source Code
        </button>
      </div>

      {/* TAB 1: ARCHITECTURE GAP REPORT */}
      {activeTab === 'gaps' && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-emerald-400" />
                  Hardened Architecture Gap Audit & Enforceable Invariants
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Comparison between previous baseline weaknesses and refined, test-backed security invariants.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono bg-emerald-950 border border-emerald-800/80 text-emerald-400">
                Audit Status: 6 / 6 Hardened & Enforced
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5">
            {ARCHITECTURE_GAP_ITEMS.map(gap => (
              <div
                key={gap.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4.5 space-y-3 transition-colors hover:border-zinc-700"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-zinc-950 border border-zinc-800 text-zinc-300">
                      {gap.id}
                    </span>
                    <span className="text-sm font-semibold text-zinc-100">{gap.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                        gap.severity === 'HIGH'
                          ? 'bg-rose-950 text-rose-400 border border-rose-800/60'
                          : 'bg-amber-950 text-amber-400 border border-amber-800/60'
                      }`}
                    >
                      {gap.severity} Impact
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                      {gap.guaranteeStatus}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="bg-zinc-950/70 border border-rose-950/50 rounded-lg p-3 space-y-1">
                    <div className="text-[11px] font-semibold text-rose-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Previous Vulnerability / Overstated Claim:
                    </div>
                    <p className="text-zinc-400 leading-relaxed">{gap.previousDefect}</p>
                  </div>

                  <div className="bg-zinc-950/70 border border-emerald-950/50 rounded-lg p-3 space-y-1">
                    <div className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Refined Enforceable Invariant:
                    </div>
                    <p className="text-zinc-300 leading-relaxed">{gap.enforceableInvariant}</p>
                  </div>
                </div>

                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-zinc-400 font-mono text-[11px]">
                      <span className="text-zinc-500">Enforcement:</span> {gap.enforcementMechanism}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-850 text-indigo-400 border border-zinc-700">
                      Test Assertion: {gap.automatedTestId}
                    </span>
                  </div>
                  {gap.documentedLimitation && (
                    <p className="text-[11px] text-zinc-500 italic">
                      <span className="text-zinc-400 not-italic font-semibold">Honest Limitation:</span>{' '}
                      {gap.documentedLimitation}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: PROCESS TOPOLOGY */}
      {activeTab === 'topology' && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-indigo-400">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">Multi-Process Trust Isolation Architecture</h3>
                <p className="text-xs text-zinc-400">
                  Three isolated tiers with strict unidirectional control flow and pipe-only stdio IPC.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 font-mono text-xs pt-2">
              <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between text-indigo-400 font-semibold border-b border-zinc-850 pb-2">
                  <span className="flex items-center gap-1.5">
                    <Terminal className="w-4 h-4" />
                    Tier 1: React UI
                  </span>
                  <span className="text-[10px] text-zinc-500">Untrusted Domain</span>
                </div>
                <ul className="text-[11px] text-zinc-400 space-y-1.5 list-disc list-inside">
                  <li>Presentation and user interaction only</li>
                  <li>Zero direct OS filesystem or process access</li>
                  <li>Zero persistence of cryptographic keys</li>
                  <li>Strict CSP prevents network socket egress</li>
                </ul>
              </div>

              <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between text-emerald-400 font-semibold border-b border-zinc-850 pb-2">
                  <span className="flex items-center gap-1.5">
                    <Shield className="w-4 h-4" />
                    Tier 2: Rust Core
                  </span>
                  <span className="text-[10px] text-zinc-500">Security Supervisor</span>
                </div>
                <ul className="text-[11px] text-zinc-400 space-y-1.5 list-disc list-inside">
                  <li>Enforces session token authorization</li>
                  <li>Manages Argon2id / AES-256-GCM vault</li>
                  <li>Spawns, monitors, and terminates sidecars</li>
                  <li>Guarantees clean orphan process cleanup</li>
                </ul>
              </div>

              <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between text-amber-400 font-semibold border-b border-zinc-850 pb-2">
                  <span className="flex items-center gap-1.5">
                    <Cpu className="w-4 h-4" />
                    Tier 3: Python Sidecar
                  </span>
                  <span className="text-[10px] text-zinc-500">Isolated AI Inference</span>
                </div>
                <ul className="text-[11px] text-zinc-400 space-y-1.5 list-disc list-inside">
                  <li>Executes ONNX / GGUF local model weights</li>
                  <li>Pipe-only stdio communication with Rust</li>
                  <li>Zero network sockets or outbound requests</li>
                  <li>Runs in restricted filesystem sandbox jail</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CAPABILITY MATRIX */}
      {activeTab === 'matrix' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-400" />
              Component Authority & Capability Scoping Matrix
            </h3>
            <span className="text-xs text-zinc-400 font-mono">Principle of Least Privilege</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-zinc-950 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="p-3.5 font-semibold">Component</th>
                  <th className="p-3.5 font-semibold">Filesystem Authority</th>
                  <th className="p-3.5 font-semibold">Network Egress</th>
                  <th className="p-3.5 font-semibold">Cryptographic Secrets</th>
                  <th className="p-3.5 font-semibold">Model Execution</th>
                  <th className="p-3.5 font-semibold">Process Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 text-zinc-300">
                {CAPABILITY_MATRIX.map((row, i) => (
                  <tr key={i} className="hover:bg-zinc-850/50">
                    <td className="p-3.5 font-bold text-zinc-100">{row.component}</td>
                    <td className="p-3.5 text-zinc-400">{row.filesystem}</td>
                    <td className="p-3.5 text-zinc-400">{row.network}</td>
                    <td className="p-3.5 text-zinc-400">{row.secrets}</td>
                    <td className="p-3.5 text-zinc-400">{row.models}</td>
                    <td className="p-3.5 text-zinc-400">{row.processControl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: PLATFORM OS SANDBOXES & LIMITATIONS */}
      {activeTab === 'platforms' && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-2">
            <h3 className="text-sm font-semibold text-zinc-100">
              Cross-Platform Security Isolation & Documented OS Limitations
            </h3>
            <p className="text-xs text-zinc-400">
              Honest architectural documentation of platform-specific sandbox primitives, code signing, and kernel boundaries.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {PLATFORM_PROFILES.map(prof => (
              <div key={prof.platform} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3.5">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                  <h4 className="text-sm font-bold text-zinc-100 font-mono">{prof.platform} Security Profile</h4>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-950 border border-zinc-800 text-indigo-400">
                    Target Architecture
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                  <div className="space-y-1">
                    <span className="text-zinc-500">Filesystem Jail:</span>
                    <p className="text-zinc-300 font-sans text-[12px]">{prof.filesystemIsolation}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-zinc-500">Network Isolation:</span>
                    <p className="text-zinc-300 font-sans text-[12px]">{prof.networkIsolation}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-zinc-500">Process Lifecycle:</span>
                    <p className="text-zinc-300 font-sans text-[12px]">{prof.processRestrictions}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-zinc-500">Key Storage & Signing:</span>
                    <p className="text-zinc-300 font-sans text-[12px]">
                      {prof.credentialStorage} | {prof.codeSigning}
                    </p>
                  </div>
                </div>

                <div className="bg-zinc-950 border border-zinc-850 rounded-lg p-3 space-y-1.5">
                  <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1.5 font-mono">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Documented OS Limitations & Mitigations:
                  </span>
                  <ul className="text-xs text-zinc-400 space-y-1 list-disc list-inside">
                    {prof.knownLimitations.map((lim, i) => (
                      <li key={i}>{lim}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: TAURI 2.X & SIDECAR PROJECT STRUCTURE */}
      {activeTab === 'code' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          <div className="lg:col-span-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
            <div className="p-3 border-b border-zinc-800 bg-zinc-950/60 text-xs font-semibold text-zinc-200">
              Workspace Files
            </div>
            <div className="p-2 space-y-1 overflow-y-auto">
              {REAL_PROJECT_FILES.map(file => {
                const isSelected = selectedFile.path === file.path;
                return (
                  <button
                    key={file.path}
                    onClick={() => setSelectedFile(file)}
                    className={`w-full text-left p-2.5 rounded-lg text-xs font-mono transition-colors flex items-center gap-2 ${
                      isSelected
                        ? 'bg-zinc-800 text-zinc-100 font-semibold border border-zinc-700'
                        : 'text-zinc-400 hover:bg-zinc-850 hover:text-zinc-200'
                    }`}
                  >
                    <FileCode2 className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-emerald-400' : 'text-zinc-500'}`} />
                    <span className="truncate">{file.path}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-3 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col min-h-[400px]">
            <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-zinc-200">{selectedFile.title}</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-zinc-850 text-zinc-400">
                    {selectedFile.language}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5">{selectedFile.description}</p>
              </div>

              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy File Path'}</span>
              </button>
            </div>

            <div className="p-5 flex-1 bg-zinc-950 font-mono text-xs space-y-4">
              <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-lg space-y-2">
                <div className="text-zinc-400 text-xs flex items-center justify-between">
                  <span className="text-emerald-400 font-semibold">Physical File on Disk:</span>
                  <span className="text-zinc-500 text-[11px]">{selectedFile.path}</span>
                </div>
                <p className="text-zinc-300 font-sans text-xs">{selectedFile.description}</p>
              </div>
              <div className="text-xs text-zinc-500 italic">
                Compiled into native desktop binary during <code className="text-zinc-400 font-mono">cargo build</code> and packaged into release bundle.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

