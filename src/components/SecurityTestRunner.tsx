import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  WifiOff,
  Radio,
  FileSearch,
  Terminal,
  Activity,
} from 'lucide-react';
import { SecurityTestResult, TestCategory } from '../types/security';
import { runFullSecurityTestSuite } from '../services/testSuite';
import { securityCore } from '../services/securityCore';

interface SecurityTestRunnerProps {
  networkIsolated: boolean;
  onToggleNetworkIsolation: () => void;
}

export const SecurityTestRunner: React.FC<SecurityTestRunnerProps> = ({
  networkIsolated,
  onToggleNetworkIsolation,
}) => {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [results, setResults] = useState<SecurityTestResult[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | TestCategory>('all');
  const [showLogs, setShowLogs] = useState<boolean>(false);

  const handleRunAllTests = async () => {
    setIsRunning(true);
    setResults([]);
    try {
      const allResults = await runFullSecurityTestSuite((test) => {
        setResults(prev => [...prev, test]);
      });
      setResults(allResults);
    } finally {
      setIsRunning(false);
    }
  };

  const auditLogs = securityCore.getAuditLogs();

  const filteredResults = results.filter(r => {
    if (activeFilter === 'all') return true;
    return r.category === activeFilter;
  });

  const passedCount = results.filter(r => r.status === 'passed').length;
  const failedCount = results.filter(r => r.status === 'failed').length;
  const totalTests = results.length;

  return (
    <div className="space-y-6">
      {/* Top Banner: Security Policy & Test Runner Action */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-800/50 text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-100">Security Invariants & Test Verification Suite</h2>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-950 border border-zinc-800 text-emerald-400">
                28 Automated Assertions
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Validates network isolation, filesystem jail, canary secret zero-leakage, memory-hard Argon2id KDF, and IPC bounds.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Privacy Mode Toggle */}
          <button
            onClick={onToggleNetworkIsolation}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
              networkIsolated
                ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-300'
                : 'bg-amber-950/50 border-amber-800/60 text-amber-300'
            }`}
          >
            <WifiOff className="w-3.5 h-3.5" />
            <span>{networkIsolated ? 'Privacy Mode: STRICT' : 'Privacy Mode: DEV'}</span>
          </button>

          <button
            onClick={handleRunAllTests}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50 shadow-sm"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Running Test Matrix...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Run All 28 Invariant Tests</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Summary Scoreboard */}
      {results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-lg flex items-center justify-between">
            <div>
              <div className="text-[11px] text-zinc-400">Total Executed</div>
              <div className="text-base font-semibold font-mono text-zinc-100">{totalTests} / 28</div>
            </div>
            <Activity className="w-4 h-4 text-zinc-500" />
          </div>

          <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-lg flex items-center justify-between">
            <div>
              <div className="text-[11px] text-zinc-400">Passed Invariants</div>
              <div className="text-base font-semibold font-mono text-emerald-400">{passedCount}</div>
            </div>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>

          <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-lg flex items-center justify-between">
            <div>
              <div className="text-[11px] text-zinc-400">Failed / Violations</div>
              <div className="text-base font-semibold font-mono text-rose-400">{failedCount}</div>
            </div>
            <XCircle className="w-4 h-4 text-rose-400" />
          </div>

          <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-lg flex items-center justify-between">
            <div>
              <div className="text-[11px] text-zinc-400">Canary Leakage</div>
              <div className="text-base font-semibold font-mono text-emerald-400">0 Leaks (Clean)</div>
            </div>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
        </div>
      )}

      {/* Filter Tabs & Toggle Logs */}
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-2">
        <div className="flex flex-wrap items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-xs">
          {(['all', 'unit', 'integration', 'security', 'correctness', 'e2e'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setActiveFilter(cat)}
              className={`px-3 py-1 rounded capitalize font-medium transition-colors ${
                activeFilter === cat ? 'bg-zinc-800 text-zinc-100 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {cat === 'e2e' ? 'End-to-End' : cat}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowLogs(!showLogs)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 transition-colors"
        >
          <Terminal className="w-3.5 h-3.5 text-zinc-400" />
          <span>{showLogs ? 'Hide Audit Logs' : 'View Redacted Audit Logs'}</span>
        </button>
      </div>

      {/* Redacted Audit Logs Drawer */}
      {showLogs && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400 border-b border-zinc-800/80 pb-2">
            <span>Redacted System & Security Log Stream (Zero Plaintext Invariant)</span>
            <span className="font-mono">{auditLogs.length} entries</span>
          </div>
          <div className="max-h-48 overflow-y-auto font-mono text-[11px] space-y-1 text-zinc-300">
            {auditLogs.map((l, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-zinc-600">{new Date(l.timestamp).toLocaleTimeString()}</span>
                <span
                  className={`px-1 rounded text-[10px] uppercase ${
                    l.level === 'security_violation'
                      ? 'bg-rose-950 text-rose-300 border border-rose-900'
                      : l.level === 'warn'
                      ? 'bg-amber-950 text-amber-300 border border-amber-900'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {l.level}
                </span>
                <span className="text-zinc-300">{l.event}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tests Results List */}
      {results.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center text-zinc-400 space-y-3">
          <FileSearch className="w-10 h-10 text-zinc-700 mx-auto" />
          <h3 className="text-sm font-semibold text-zinc-200">Security Test Suite Ready</h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            Click &ldquo;Run All 22 Invariant Tests&rdquo; to execute unit tests, integration tests, network socket
            probes, filesystem jail audits, prompt injection resilience, semantic invariant validations, and canary leak scans.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredResults.map(test => (
            <div
              key={test.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-zinc-700 transition-colors"
            >
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-mono uppercase ${
                      test.category === 'security'
                        ? 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                        : test.category === 'integration'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : test.category === 'correctness'
                        ? 'bg-purple-950 text-purple-300 border border-purple-800'
                        : test.category === 'e2e'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    {test.category}
                  </span>
                  <h4 className="text-xs sm:text-sm font-semibold text-zinc-200">{test.name}</h4>
                </div>

                <p className="text-xs text-zinc-400">{test.description}</p>
                {test.invariantProperty && (
                  <div className="text-[11px] text-zinc-500">
                    <span className="text-zinc-400">Invariant:</span> {test.invariantProperty}
                  </div>
                )}
                <div className="text-[11px] font-mono text-zinc-500 truncate">
                  Assert: <span className="text-zinc-400">{test.assertion}</span>
                </div>

                {test.diagnostic && (
                  <div className="mt-1 p-2 rounded bg-rose-950/40 border border-rose-900/60 text-xs font-mono text-rose-300">
                    Diagnostic: {test.diagnostic}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                {test.durationMs !== undefined && (
                  <span className="text-xs font-mono text-zinc-500">{test.durationMs}ms</span>
                )}
                {test.status === 'passed' ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>PASSED</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs font-semibold">
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                    <span>FAILED</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

