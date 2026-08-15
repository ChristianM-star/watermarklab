import React, { useState } from 'react';
import {
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  Lock,
  ArrowRight,
  Layers,
  FileText,
  Sliders,
  Shield,
  Eye,
  Columns,
  Cpu,
  Terminal,
} from 'lucide-react';
import {
  ParaphrasePayload,
  ParaphraseResult,
  ParaphraseStyle,
  TranslateLoopPayload,
  TranslateLoopResult,
  IntermediateLanguage,
  SemanticChunkResult,
} from '../types/transformation';
import { ipcBridge } from '../services/ipcBridge';
import { SemanticValidationCard } from './SemanticValidationCard';
import { DiffView } from './DiffView';
import { createWatermarkProvenance } from '../services/crypto';

interface TransformWorkbenchProps {
  onSendToHumanEdit: (original: string, proposed: string, model: string, op: string, watermark: string) => void;
  onSaveToVault: (title: string, orig: string, trans: string, op: string, model: string, sim: number, validation: any, watermark: string) => void;
  isVaultUnlocked: boolean;
}

const PRESET_VECTORS = [
  {
    title: 'Research Abstract (Stats & Citations)',
    text: `In 2026, 48.7% of local edge nodes at https://watermarklab.internal/api require encrypted data storage. The application demonstrates that when utilizing SHA-256 integrity verification, memory leakage drops by 94.2%. Researchers Dr. Jane Vance and Alan Turing confirmed this methodology preserves 100% of numerical claims and prevents unauthorized data exfiltration.`,
  },
  {
    title: 'Technical Specs (Code & Ports)',
    text: `The Rust core binds to port 3000 and spawns a Python sidecar with command: \`python3 sidecar/sidecar.py --auth wl_sec_99\`. It allocates 5120MB of VRAM for Llama-3-8B-Q4. Ensure that \`process.exit(0)\` is called when destroying window instances at https://tauri.app/v2/guides.`,
  },
  {
    title: 'Legal & Privacy Clause',
    text: `Due to the fact that user privacy is paramount, in order to maintain zero telemetry, the software application is designed to operate completely offline. As a matter of fact, with the exception of local model files, no data packets shall be transmitted across TCP/IP sockets.`,
  },
];

export const TransformWorkbench: React.FC<TransformWorkbenchProps> = ({
  onSendToHumanEdit,
  onSaveToVault,
  isVaultUnlocked,
}) => {
  const [activeOp, setActiveOp] = useState<'paraphrase' | 'translate_loop' | 'semantic_chunk'>('paraphrase');
  const [inputText, setInputText] = useState<string>(PRESET_VECTORS[0].text);
  const [style, setStyle] = useState<ParaphraseStyle>('academic');
  const [intensity, setIntensity] = useState<number>(3);
  const [preserveNumbers, setPreserveNumbers] = useState<boolean>(true);
  const [preserveCode, setPreserveCode] = useState<boolean>(true);
  const [preserveUrls, setPreserveUrls] = useState<boolean>(true);
  const [preserveEntities, setPreserveEntities] = useState<boolean>(true);

  // Translation loop options
  const [intermediateLang, setIntermediateLang] = useState<IntermediateLanguage>('fr');
  const [roundtripHops, setRoundtripHops] = useState<number>(1);

  // Chunking options
  const [maxTokensPerChunk, setMaxTokensPerChunk] = useState<number>(200);

  // Results state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [paraphraseResult, setParaphraseResult] = useState<ParaphraseResult | null>(null);
  const [translateResult, setTranslateResult] = useState<TranslateLoopResult | null>(null);
  const [chunkResult, setChunkResult] = useState<SemanticChunkResult | null>(null);
  const [viewMode, setViewMode] = useState<'side_by_side' | 'diff'>('side_by_side');
  const [copied, setCopied] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Estimated token counts
  const inputTokenEst = Math.ceil(inputText.trim().split(/\s+/).filter(Boolean).length * 1.3);

  const handleExecute = async () => {
    if (!inputText.trim()) return;
    setIsProcessing(true);
    setCopied(false);
    setSavedSuccess(false);

    try {
      if (activeOp === 'paraphrase') {
        const payload: ParaphrasePayload = {
          text: inputText,
          style,
          intensity,
          preserveNumbers,
          preserveCode,
          preserveUrls,
          preserveEntities,
        };
        const resp = await ipcBridge.send<ParaphrasePayload, ParaphraseResult>('paraphrase', payload);
        if (resp.ok) {
          setParaphraseResult(resp.result);
        }
      } else if (activeOp === 'translate_loop') {
        const payload: TranslateLoopPayload = {
          text: inputText,
          sourceLang: 'EN',
          intermediateLang,
          targetLang: 'EN',
          roundtripHops,
        };
        const resp = await ipcBridge.send<TranslateLoopPayload, TranslateLoopResult>('translate_loop', payload);
        if (resp.ok) {
          setTranslateResult(resp.result);
        }
      } else if (activeOp === 'semantic_chunk') {
        const payload = {
          text: inputText,
          maxChunkSizeTokens: maxTokensPerChunk,
          overlapTokens: 20,
          preserveHeadings: true,
          preserveCodeBlocks: true,
        };
        const resp = await ipcBridge.send('semantic_chunk', payload);
        if (resp.ok) {
          setChunkResult(resp.result);
        }
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const getActiveOutputText = (): string => {
    if (activeOp === 'paraphrase' && paraphraseResult) return paraphraseResult.rewrittenText;
    if (activeOp === 'translate_loop' && translateResult) return translateResult.finalText;
    return '';
  };

  const handleCopy = () => {
    const text = getActiveOutputText();
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendToHumanReview = async () => {
    const output = getActiveOutputText();
    if (!output) return;
    const model = activeOp === 'paraphrase' ? 'llama-3-paraphrase-8b-q4' : 'nllb-200-distilled-600m';
    const watermark = await createWatermarkProvenance(inputText, output, model, Date.now());
    onSendToHumanEdit(inputText, output, model, activeOp, watermark);
  };

  const handleSaveToEncryptedVault = async () => {
    const output = getActiveOutputText();
    if (!output) return;
    const model = activeOp === 'paraphrase' ? 'llama-3-paraphrase-8b-q4' : 'nllb-200-distilled-600m';
    const sim = activeOp === 'paraphrase' ? paraphraseResult?.similarityScore || 0.85 : translateResult?.roundtripSimilarity || 0.8;
    const validation = activeOp === 'paraphrase' ? paraphraseResult?.validation : translateResult?.validation;
    const watermark = await createWatermarkProvenance(inputText, output, model, Date.now());

    onSaveToVault(
      `Transform ${new Date().toLocaleTimeString()}`,
      inputText,
      output,
      activeOp,
      model,
      sim,
      validation,
      watermark
    );
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Top Controls & Operation Selector */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          {/* Operation Selector */}
          <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
            <button
              onClick={() => setActiveOp('paraphrase')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                activeOp === 'paraphrase'
                  ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Paraphrase
            </button>
            <button
              onClick={() => setActiveOp('translate_loop')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                activeOp === 'translate_loop'
                  ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Translation Loop
            </button>
            <button
              onClick={() => setActiveOp('semantic_chunk')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                activeOp === 'semantic_chunk'
                  ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Semantic Chunker
            </button>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-zinc-400 font-medium hidden sm:inline">Presets:</span>
            {PRESET_VECTORS.map((vec, idx) => (
              <button
                key={idx}
                onClick={() => setInputText(vec.text)}
                className="px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 transition-colors truncate max-w-[140px]"
                title={vec.title}
              >
                {vec.title.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic Controls based on operation */}
        {activeOp === 'paraphrase' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Style Mode</label>
              <select
                value={style}
                onChange={e => setStyle(e.target.value as ParaphraseStyle)}
                className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-md px-3 py-1.5 text-xs focus:outline-none focus:border-zinc-600"
              >
                <option value="academic">Academic / Formal Inversion</option>
                <option value="natural">Natural & Fluid</option>
                <option value="concise">Concise & Direct</option>
                <option value="formal">Formal Institutional</option>
                <option value="creative">Creative & Expressive</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
                <span>Intensity / Shift</span>
                <span className="font-mono text-zinc-200">{intensity}/5</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                value={intensity}
                onChange={e => setIntensity(Number(e.target.value))}
                className="w-full accent-emerald-500 bg-zinc-950 cursor-pointer h-2 rounded-lg"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Strict Semantic Invariants (Zero Modification)
              </label>
              <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-1.5 text-xs text-zinc-300 bg-zinc-950 px-2.5 py-1 rounded border border-zinc-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preserveNumbers}
                    onChange={e => setPreserveNumbers(e.target.checked)}
                    className="accent-emerald-500 rounded"
                  />
                  <span>Numbers & Stats</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-zinc-300 bg-zinc-950 px-2.5 py-1 rounded border border-zinc-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preserveCode}
                    onChange={e => setPreserveCode(e.target.checked)}
                    className="accent-emerald-500 rounded"
                  />
                  <span>Code Blocks</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-zinc-300 bg-zinc-950 px-2.5 py-1 rounded border border-zinc-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preserveUrls}
                    onChange={e => setPreserveUrls(e.target.checked)}
                    className="accent-emerald-500 rounded"
                  />
                  <span>URLs</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-zinc-300 bg-zinc-950 px-2.5 py-1 rounded border border-zinc-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preserveEntities}
                    onChange={e => setPreserveEntities(e.target.checked)}
                    className="accent-emerald-500 rounded"
                  />
                  <span>Named Entities</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {activeOp === 'translate_loop' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Intermediate Language (Hop 1)
              </label>
              <select
                value={intermediateLang}
                onChange={e => setIntermediateLang(e.target.value as IntermediateLanguage)}
                className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-md px-3 py-1.5 text-xs focus:outline-none focus:border-zinc-600"
              >
                <option value="fr">French (Français)</option>
                <option value="de">German (Deutsch)</option>
                <option value="es">Spanish (Español)</option>
                <option value="it">Italian (Italiano)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Roundtrip Scheme</label>
              <select
                value={roundtripHops}
                onChange={e => setRoundtripHops(Number(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-md px-3 py-1.5 text-xs focus:outline-none focus:border-zinc-600"
              >
                <option value={1}>1 Hop (EN → FR → EN)</option>
                <option value={2}>2 Hops (EN → FR → DE → EN)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Inference Model</label>
              <div className="px-3 py-1.5 rounded-md bg-zinc-950 border border-zinc-800 text-xs font-mono text-emerald-400 truncate">
                nllb-200-distilled-600m
              </div>
            </div>
          </div>
        )}

        {activeOp === 'semantic_chunk' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Target Chunk Size (Tokens)
              </label>
              <input
                type="number"
                min="50"
                max="500"
                step="25"
                value={maxTokensPerChunk}
                onChange={e => setMaxTokensPerChunk(Number(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-md px-3 py-1.5 text-xs focus:outline-none focus:border-zinc-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Boundary Preservation Strategy
              </label>
              <div className="px-3 py-1.5 rounded-md bg-zinc-950 border border-zinc-800 text-xs text-zinc-300">
                Paragraph, Code Fence & Sentence Intact
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Dual-Pane Transformation Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left Pane: Original Input */}
        <div className="flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-zinc-400" />
              <span className="text-xs font-semibold text-zinc-200">Source Input (Untrusted)</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
              <span>{inputText.length} chars</span>
              <span>•</span>
              <span>~{inputTokenEst} tokens</span>
            </div>
          </div>

          <div className="p-4 flex-1 flex flex-col min-h-[340px]">
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder="Paste or type text for privacy-first local transformation..."
              className="w-full flex-1 bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs sm:text-sm font-mono text-zinc-200 focus:outline-none focus:border-zinc-700 resize-none leading-relaxed"
            />

            <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-zinc-800/80">
              <div className="text-[11px] text-zinc-400 flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span>Isolated memory buffer</span>
              </div>

              <button
                onClick={handleExecute}
                disabled={isProcessing || !inputText.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing Locally...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Transform Text</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Pane: Transformed Output & Invariant Breakdown */}
        <div className="flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-zinc-200">
                {activeOp === 'semantic_chunk' ? 'Semantic Chunks' : 'Transformed Output'}
              </span>
            </div>

            {/* View Mode Switcher */}
            {activeOp !== 'semantic_chunk' && getActiveOutputText() && (
              <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded border border-zinc-800 text-xs">
                <button
                  onClick={() => setViewMode('side_by_side')}
                  className={`px-2 py-0.5 rounded flex items-center gap-1 ${
                    viewMode === 'side_by_side' ? 'bg-zinc-800 text-zinc-200 font-semibold' : 'text-zinc-400'
                  }`}
                >
                  <Columns className="w-3 h-3" />
                  <span>Text</span>
                </button>
                <button
                  onClick={() => setViewMode('diff')}
                  className={`px-2 py-0.5 rounded flex items-center gap-1 ${
                    viewMode === 'diff' ? 'bg-zinc-800 text-zinc-200 font-semibold' : 'text-zinc-400'
                  }`}
                >
                  <Eye className="w-3 h-3" />
                  <span>Word Diff</span>
                </button>
              </div>
            )}
          </div>

          <div className="p-4 flex-1 flex flex-col min-h-[340px] space-y-3">
            {activeOp === 'semantic_chunk' && chunkResult ? (
              <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                <div className="flex items-center justify-between text-xs text-zinc-400 pb-1">
                  <span>Total Chunks: {chunkResult.totalChunks}</span>
                  <span>Total Tokens: {chunkResult.totalTokens}</span>
                </div>
                {chunkResult.chunks.map(chunk => (
                  <div
                    key={chunk.id}
                    className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono space-y-1"
                  >
                    <div className="flex items-center justify-between text-[11px] text-zinc-400 border-b border-zinc-800/80 pb-1">
                      <span className="font-semibold text-emerald-400">
                        Chunk #{chunk.index + 1} ({chunk.type})
                      </span>
                      <span>{chunk.tokenCount} tokens</span>
                    </div>
                    <div className="text-zinc-300 leading-relaxed pt-1 whitespace-pre-wrap">
                      {chunk.rawText}
                    </div>
                  </div>
                ))}
              </div>
            ) : getActiveOutputText() ? (
              <>
                {viewMode === 'diff' ? (
                  <DiffView originalText={inputText} transformedText={getActiveOutputText()} />
                ) : (
                  <div className="w-full flex-1 bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs sm:text-sm font-mono text-zinc-200 leading-relaxed overflow-y-auto max-h-[300px] whitespace-pre-wrap select-text">
                    {getActiveOutputText()}
                  </div>
                )}

                {/* Translation intermediate breakdown */}
                {activeOp === 'translate_loop' && translateResult?.intermediateTexts && (
                  <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-2.5 text-xs space-y-1">
                    <div className="text-[11px] font-semibold text-zinc-400">Intermediate Hops:</div>
                    {translateResult.intermediateTexts.map((hop, i) => (
                      <div key={i} className="text-zinc-300 font-mono text-[11px]">
                        <span className="text-indigo-400 font-bold">[{hop.lang}]: </span>
                        {hop.text}
                      </div>
                    ))}
                  </div>
                )}

                {/* Semantic Validation Card */}
                <SemanticValidationCard
                  report={activeOp === 'paraphrase' ? paraphraseResult?.validation : translateResult?.validation}
                  processingTimeMs={
                    activeOp === 'paraphrase'
                      ? paraphraseResult?.processingTimeMs
                      : translateResult?.processingTimeMs
                  }
                  modelUsed={
                    activeOp === 'paraphrase'
                      ? paraphraseResult?.modelIdUsed
                      : translateResult?.modelIdUsed
                  }
                />

                {/* Bottom Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied' : 'Copy Output'}</span>
                    </button>

                    <button
                      onClick={handleSaveToEncryptedVault}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                    >
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      <span>{savedSuccess ? 'Saved in Vault' : 'Save Encrypted'}</span>
                    </button>
                  </div>

                  <button
                    onClick={handleSendToHumanReview}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-indigo-600/90 hover:bg-indigo-600 text-white transition-colors shadow-sm"
                  >
                    <span>Send to Human Review</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-zinc-400">
                <Sparkles className="w-8 h-8 text-zinc-700 mb-2" />
                <p className="text-xs font-medium text-zinc-400">
                  Select style parameters and click &ldquo;Transform Text&rdquo;
                </p>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Inference executes locally with zero outbound network transmissions.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
