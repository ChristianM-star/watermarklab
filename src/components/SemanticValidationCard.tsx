import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Code2,
  Hash,
  Link2,
  UserCheck,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { SemanticValidationReport } from '../types/transformation';

interface SemanticValidationCardProps {
  report?: SemanticValidationReport;
  processingTimeMs?: number;
  modelUsed?: string;
}

export const SemanticValidationCard: React.FC<SemanticValidationCardProps> = ({
  report,
  processingTimeMs,
  modelUsed,
}) => {
  if (!report) return null;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          {report.isValid ? (
            <div className="p-1 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/50">
              <ShieldCheck className="w-4 h-4" />
            </div>
          ) : (
            <div className="p-1 rounded bg-amber-950/60 text-amber-400 border border-amber-800/50">
              <ShieldAlert className="w-4 h-4" />
            </div>
          )}
          <div>
            <div className="text-xs font-semibold text-zinc-200">
              {report.isValid ? 'Semantic Invariants Certified' : 'Validation Issues Detected'}
            </div>
            <div className="text-[11px] text-zinc-400">
              {modelUsed ? `Model: ${modelUsed}` : 'Verified by independent validation layer'}
              {processingTimeMs !== undefined && ` • ${processingTimeMs}ms`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="text-right">
            <span className="text-zinc-400">Similarity: </span>
            <span className="font-semibold text-emerald-400">
              {(report.similarityScore * 100).toFixed(1)}%
            </span>
          </div>
          <div className="text-right">
            <span className="text-zinc-400">Ratio: </span>
            <span className="text-zinc-300 font-semibold">{report.lengthRatio}x</span>
          </div>
        </div>
      </div>

      {/* Preservation Checklist Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div
          className={`flex items-center justify-between px-2.5 py-1.5 rounded border text-xs ${
            report.numbersPreserved
              ? 'bg-zinc-950/60 border-zinc-800 text-zinc-200'
              : 'bg-rose-950/30 border-rose-800 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            <Hash className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="truncate">Numbers</span>
          </div>
          {report.numbersPreserved ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          )}
        </div>

        <div
          className={`flex items-center justify-between px-2.5 py-1.5 rounded border text-xs ${
            report.codePreserved
              ? 'bg-zinc-950/60 border-zinc-800 text-zinc-200'
              : 'bg-rose-950/30 border-rose-800 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            <Code2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">Code Blocks</span>
          </div>
          {report.codePreserved ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          )}
        </div>

        <div
          className={`flex items-center justify-between px-2.5 py-1.5 rounded border text-xs ${
            report.urlsPreserved
              ? 'bg-zinc-950/60 border-zinc-800 text-zinc-200'
              : 'bg-rose-950/30 border-rose-800 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            <Link2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="truncate">URLs & Links</span>
          </div>
          {report.urlsPreserved ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          )}
        </div>

        <div
          className={`flex items-center justify-between px-2.5 py-1.5 rounded border text-xs ${
            report.namedEntitiesPreserved
              ? 'bg-zinc-950/60 border-zinc-800 text-zinc-200'
              : 'bg-rose-950/30 border-rose-800 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            <UserCheck className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="truncate">Entities / Names</span>
          </div>
          {report.namedEntitiesPreserved ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          )}
        </div>
      </div>

      {/* Extracted Invariant Tags */}
      {report.items && report.items.length > 0 && (
        <div className="pt-1">
          <div className="text-[11px] font-medium text-zinc-400 mb-1.5">
            Preserved Invariant Elements ({report.items.length}):
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {report.items.map((item, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-950 border border-zinc-800 text-zinc-300"
              >
                <span className="text-zinc-500">{item.type}:</span>
                <span className="font-semibold text-zinc-200">{item.value}</span>
                {item.preserved ? (
                  <span className="text-emerald-400">✓</span>
                ) : (
                  <span className="text-rose-400">✗</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Violations Warning list */}
      {report.violations && report.violations.length > 0 && (
        <div className="rounded border border-rose-900/60 bg-rose-950/20 p-2.5 text-xs text-rose-300 space-y-1">
          <div className="font-semibold text-rose-200 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Semantic Invariant Violations:
          </div>
          <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
            {report.violations.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
