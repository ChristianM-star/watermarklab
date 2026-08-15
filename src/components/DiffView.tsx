import React from 'react';
import { computeWordDiff } from '../services/diffEngine';

interface DiffViewProps {
  originalText: string;
  transformedText: string;
}

export const DiffView: React.FC<DiffViewProps> = ({ originalText, transformedText }) => {
  const segments = React.useMemo(() => {
    return computeWordDiff(originalText, transformedText);
  }, [originalText, transformedText]);

  return (
    <div className="font-mono text-xs sm:text-sm leading-relaxed p-4 rounded-lg bg-zinc-950 border border-zinc-800 overflow-y-auto max-h-[420px] whitespace-pre-wrap select-text">
      {segments.map((seg, idx) => {
        if (seg.type === 'unchanged') {
          return (
            <span key={idx} className="text-zinc-300">
              {seg.value}
            </span>
          );
        }
        if (seg.type === 'added') {
          return (
            <span
              key={idx}
              className="bg-emerald-950/80 text-emerald-300 px-1 py-0.5 rounded border border-emerald-800/60 font-semibold"
              title="Added / Transformed"
            >
              {seg.value}
            </span>
          );
        }
        if (seg.type === 'removed') {
          return (
            <span
              key={idx}
              className="bg-rose-950/70 text-rose-300 line-through px-1 py-0.5 rounded border border-rose-900/60 mr-1"
              title="Removed original"
            >
              {seg.value}
            </span>
          );
        }
        if (seg.type === 'modified') {
          return (
            <span key={idx} className="inline-flex items-center gap-1">
              <span className="bg-rose-950/70 text-rose-300 line-through px-1 py-0.5 rounded border border-rose-900/60 text-xs">
                {seg.originalValue}
              </span>
              <span className="bg-emerald-950/80 text-emerald-300 px-1 py-0.5 rounded border border-emerald-800/60 font-semibold">
                {seg.value}
              </span>
            </span>
          );
        }
        return null;
      })}
    </div>
  );
};
