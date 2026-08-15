import React, { useState } from 'react';
import {
  Check,
  X,
  RotateCcw,
  CheckCheck,
  Copy,
  Lock,
  Stamp,
  History,
  FileCheck,
  Sparkles,
} from 'lucide-react';
import { DiffSegment, HumanEditSession } from '../types/transformation';
import { reconstructTextFromSegments } from '../services/diffEngine';
import { validateTransformation } from '../services/semanticValidator';
import { SemanticValidationCard } from './SemanticValidationCard';

interface HumanInTheLoopEditorProps {
  session: HumanEditSession | null;
  onUpdateSession: (updated: HumanEditSession) => void;
  onSaveToVault: (title: string, orig: string, trans: string, op: string, model: string, sim: number, validation: any, watermark: string) => void;
  isVaultUnlocked: boolean;
}

export const HumanInTheLoopEditor: React.FC<HumanInTheLoopEditorProps> = ({
  session,
  onUpdateSession,
  onSaveToVault,
  isVaultUnlocked,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  if (!session) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center text-zinc-400 space-y-3">
        <FileCheck className="w-10 h-10 text-zinc-700 mx-auto" />
        <h3 className="text-sm font-semibold text-zinc-200">No Active Human Review Session</h3>
        <p className="text-xs text-zinc-400 max-w-md mx-auto">
          Execute a text transformation in the Transform workbench, then click &ldquo;Send to Human Review&rdquo;
          to inspect diffs, toggle word-level substitutions, and generate signed provenance audits.
        </p>
      </div>
    );
  }

  const handleToggleSegment = (segId: string) => {
    const updatedSegments = session.segments.map(seg => {
      if (seg.id === segId) {
        const nextAccepted = !seg.accepted;
        return { ...seg, accepted: nextAccepted };
      }
      return seg;
    });

    const newText = reconstructTextFromSegments(updatedSegments);
    const targetSeg = session.segments.find(s => s.id === segId);

    const updatedSession: HumanEditSession = {
      ...session,
      segments: updatedSegments,
      currentText: newText,
      provenance: {
        ...session.provenance,
        revisionCount: session.provenance.revisionCount + 1,
      },
      auditTrail: [
        {
          timestamp: Date.now(),
          action: targetSeg?.accepted ? 'reject' : 'accept',
          segmentId: segId,
          details: `Changed token decision: "${targetSeg?.value}" -> ${!targetSeg?.accepted ? 'ACCEPTED' : 'REVERTED'}`,
        },
        ...session.auditTrail,
      ],
    };

    onUpdateSession(updatedSession);
  };

  const handleAcceptAll = () => {
    const updatedSegments = session.segments.map(seg => ({ ...seg, accepted: true }));
    const newText = reconstructTextFromSegments(updatedSegments);
    onUpdateSession({
      ...session,
      segments: updatedSegments,
      currentText: newText,
      provenance: { ...session.provenance, revisionCount: session.provenance.revisionCount + 1 },
      auditTrail: [
        {
          timestamp: Date.now(),
          action: 'accept',
          details: 'Accepted all proposed substitutions across entire text',
        },
        ...session.auditTrail,
      ],
    });
  };

  const handleResetToOriginal = () => {
    const updatedSegments = session.segments.map(seg => ({ ...seg, accepted: false }));
    const newText = reconstructTextFromSegments(updatedSegments);
    onUpdateSession({
      ...session,
      segments: updatedSegments,
      currentText: newText,
      provenance: { ...session.provenance, revisionCount: session.provenance.revisionCount + 1 },
      auditTrail: [
        {
          timestamp: Date.now(),
          action: 'reset',
          details: 'Reverted all substitutions back to original source text',
        },
        ...session.auditTrail,
      ],
    });
  };

  const validationReport = validateTransformation(session.originalText, session.currentText);

  const handleCopy = () => {
    navigator.clipboard.writeText(session.currentText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    onSaveToVault(
      `Reviewed (${session.provenance.transformationType})`,
      session.originalText,
      session.currentText,
      session.provenance.transformationType,
      session.provenance.baseModel,
      validationReport.similarityScore,
      validationReport,
      session.provenance.watermarkId
    );
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const changesCount = session.segments.filter(s => s.type !== 'unchanged').length;
  const acceptedCount = session.segments.filter(s => s.type !== 'unchanged' && s.accepted).length;

  return (
    <div className="space-y-6">
      {/* Top Session Metadata Bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-950/60 border border-indigo-800/50 text-indigo-400">
            <Stamp className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-100">Human-in-the-Loop Review Session</h2>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-950 border border-zinc-800 text-indigo-300">
                {session.provenance.watermarkId}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Model: {session.provenance.baseModel} • Revisions: {session.provenance.revisionCount} • Proposed shifts:{' '}
              {changesCount} (Accepted: {acceptedCount})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleAcceptAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Accept All</span>
          </button>
          <button
            onClick={handleResetToOriginal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Interactive Review Split Screen */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Interactive Token Diff with Click-to-Toggle */}
        <div className="flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
            <span className="text-xs font-semibold text-zinc-200">
              Interactive Diff (Click words to accept / reject)
            </span>
            <span className="text-xs text-zinc-400">
              <span className="text-emerald-400 font-semibold">Green:</span> Accepted •{' '}
              <span className="text-rose-400 font-semibold">Red/Strike:</span> Rejected
            </span>
          </div>

          <div className="p-4 flex-1 font-mono text-xs sm:text-sm leading-relaxed overflow-y-auto max-h-[380px] bg-zinc-950 border border-zinc-800/80 rounded-lg m-4 select-none">
            {session.segments.map(seg => {
              if (seg.type === 'unchanged') {
                return (
                  <span key={seg.id} className="text-zinc-300">
                    {seg.value}
                  </span>
                );
              }

              if (seg.type === 'added' || seg.type === 'modified') {
                const isAcc = seg.accepted;
                return (
                  <button
                    key={seg.id}
                    onClick={() => handleToggleSegment(seg.id)}
                    className={`inline-flex items-center gap-0.5 mx-0.5 px-1.5 py-0.5 rounded cursor-pointer transition-colors text-xs font-semibold ${
                      isAcc
                        ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-700/80 hover:bg-emerald-900/60'
                        : 'bg-zinc-900 text-zinc-500 line-through border border-zinc-800 hover:bg-zinc-800'
                    }`}
                    title={`Click to ${isAcc ? 'revert/reject' : 'accept'}`}
                  >
                    <span>{seg.value}</span>
                    {isAcc ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                  </button>
                );
              }

              if (seg.type === 'removed') {
                const isAcc = seg.accepted; // if true, removal accepted
                return (
                  <button
                    key={seg.id}
                    onClick={() => handleToggleSegment(seg.id)}
                    className={`inline-flex items-center gap-0.5 mx-0.5 px-1.5 py-0.5 rounded cursor-pointer transition-colors text-xs ${
                      isAcc
                        ? 'bg-rose-950/70 text-rose-300 line-through border border-rose-900/80 hover:bg-rose-900/60'
                        : 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700'
                    }`}
                    title={`Click to ${isAcc ? 'restore original word' : 'accept deletion'}`}
                  >
                    <span>{seg.value}</span>
                    {isAcc ? <X className="w-2.5 h-2.5" /> : <Check className="w-2.5 h-2.5" />}
                  </button>
                );
              }
              return null;
            })}
          </div>
        </div>

        {/* Right: Real-Time Reconstructed Text & Validation */}
        <div className="flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
            <span className="text-xs font-semibold text-zinc-200">Reconstructed Clean Output</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                onClick={handleSave}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors"
              >
                <Lock className="w-3 h-3 text-amber-400" />
                <span>{savedSuccess ? 'Saved' : 'Save Encrypted'}</span>
              </button>
            </div>
          </div>

          <div className="p-4 flex-1 flex flex-col space-y-4">
            <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg p-3.5 text-xs sm:text-sm font-mono text-zinc-200 leading-relaxed overflow-y-auto max-h-[280px] whitespace-pre-wrap select-text">
              {session.currentText}
            </div>

            {/* Validation breakdown of current state */}
            <SemanticValidationCard
              report={validationReport}
              modelUsed={session.provenance.baseModel}
            />
          </div>
        </div>
      </div>

      {/* Human Decision Audit Trail */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200 border-b border-zinc-800 pb-2">
          <History className="w-4 h-4 text-zinc-400" />
          <span>Session Audit Trail & Provenance Log</span>
        </div>

        <div className="max-h-36 overflow-y-auto space-y-1.5 font-mono text-xs pr-1">
          {session.auditTrail.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between px-3 py-1.5 rounded bg-zinc-950 border border-zinc-800/80 text-zinc-300"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="text-zinc-500 text-[11px]">
                  {new Date(item.timestamp).toISOString().split('T')[1].slice(0, 8)}
                </span>
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-zinc-800 text-zinc-300 uppercase">
                  {item.action}
                </span>
                <span className="truncate text-zinc-300">{item.details}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
