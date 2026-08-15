import {
  ParaphrasePayload,
  ParaphraseResult,
  TranslateLoopPayload,
  TranslateLoopResult,
  SemanticChunkPayload,
  SemanticChunkResult,
  SemanticValidationReport,
} from '../types/transformation';
import { ipcBridge } from './ipcBridge';

/**
 * Convert sidecar validation payload to the frontend SemanticValidationReport format
 */
function convertSidecarValidation(raw: any): SemanticValidationReport {
  if (!raw) {
    return {
      isValid: false,
      numbersPreserved: false,
      codePreserved: false,
      urlsPreserved: false,
      namedEntitiesPreserved: false,
      structuralPreserved: false,
      lengthRatio: 1,
      lexicalOverlapScore: 0,
      similarityScore: 0,
      entitiesDetectedByValidatorV1: [],
      items: [],
      violations: ['Validation report missing from sidecar'],
    };
  }

  const violations: string[] = (raw.violations || []).map((v: any) =>
    typeof v === 'string' ? v : `${v.type}: ${v.details}`
  );

  return {
    isValid: raw.status === 'PASS',
    numbersPreserved: !violations.some(v => v.includes('NUMBER_CHANGED')),
    codePreserved: !violations.some(v => v.includes('CODE_MODIFIED')),
    urlsPreserved: !violations.some(v => v.includes('URL_CHANGED')),
    namedEntitiesPreserved: !violations.some(v => v.includes('ENTITY_CHANGED') || v.includes('IDENTIFIER_CHANGED')),
    structuralPreserved: !violations.some(v => v.includes('STRUCTURAL_CORRUPTION')),
    lengthRatio: raw.length_ratio ?? 1,
    lexicalOverlapScore: raw.lexical_overlap_score ?? 0,
    similarityScore: raw.lexical_overlap_score ?? 0,
    entitiesDetectedByValidatorV1: [],
    items: [],
    violations,
  };
}

/**
 * NLP Transformation Engine (Stage 2)
 * All inference routes through Rust → Python local model runtime.
 * No deterministic word-replacement dictionaries in production mode.
 */

/**
 * Paraphrase via the local model runtime.
 * Returns ParaphraseResult with independent validation from the sidecar.
 */
export async function paraphraseText(
  payload: ParaphrasePayload,
  modelId = '',
  modelSha256 = '',
  modelVersion = '',
): Promise<ParaphraseResult> {
  const startTime = performance.now();
  const result = await ipcBridge.send<ParaphrasePayload & { model_id: string; model_sha256: string; model_version: string }, any>(
    'paraphrase',
    {
      ...payload,
      model_id: modelId,
      model_sha256: modelSha256,
      model_version: modelVersion,
    },
  );

  if (!result.ok) {
    throw new Error(result.error?.message || 'Paraphrase failed');
  }

  const data = result.result;
  const rawValidation = data.validation;
  const validation = convertSidecarValidation(rawValidation);
  const processingTimeMs = Math.round(performance.now() - startTime);

  return {
    originalText: payload.text,
    rewrittenText: data.transformed_text,
    similarityScore: validation.similarityScore,
    validation,
    tokenCountOriginal: Math.ceil(payload.text.split(/\s+/).length * 1.3),
    tokenCountTransformed: Math.ceil((data.transformed_text || '').split(/\s+/).length * 1.3),
    processingTimeMs,
    modelIdUsed: modelId,
  };
}

/**
 * Multi-hop translation loop through the local model runtime
 * Supports EN → FR → EN and EN → FR → DE → EN
 */
export async function runTranslationLoop(
  payload: TranslateLoopPayload,
  modelId = '',
  modelSha256?: string,
  modelVersion?: string,
): Promise<TranslateLoopResult> {
  const startTime = performance.now();

  const result = await ipcBridge.send<
    TranslateLoopPayload & {
      model_id: string;
      model_sha256: string;
      model_version: string;
      source_lang: string;
      intermediate_lang: string;
      target_lang: string;
      roundtrip_hops: number;
    },
    any
  >(
    'translate_loop',
    {
      ...payload,
      model_id: modelId,
      model_sha256: modelSha256 || '',
      model_version: modelVersion || '',
      source_lang: payload.sourceLang,
      intermediate_lang: payload.intermediateLang,
      target_lang: payload.targetLang,
      roundtrip_hops: payload.roundtripHops,
    },
  );

  if (!result.ok) {
    throw new Error(result.error?.message || 'Translation loop failed');
  }

  const data = result.result;
  const rawValidation = data.validation;
  const validation = convertSidecarValidation(rawValidation);
  const processingTimeMs = Math.round(performance.now() - startTime);

  return {
    originalText: data.original || payload.text,
    intermediateTexts: (data.hops || []).map((hop: any) => ({
      lang: hop.target_language.toUpperCase(),
      text: hop.text,
    })),
    finalText: data.final,
    roundtripSimilarity: validation.similarityScore,
    validation,
    processingTimeMs,
    modelIdUsed: modelId,
  };
}

/**
 * Semantic chunking is a non-model utility and remains local.
 */
export function chunkTextSemantically(payload: SemanticChunkPayload): SemanticChunkResult {
  const { text, maxChunkSizeTokens } = payload;
  const rawBlocks = text.split(/\n\s*\n/).filter(b => b.trim().length > 0);

  const chunks: SemanticChunkResult['chunks'] = [];
  let chunkIndex = 0;

  for (const block of rawBlocks) {
    const trimmed = block.trim();
    const tokenEst = Math.ceil(trimmed.split(/\s+/).length * 1.3);

    let type: 'heading' | 'paragraph' | 'code' | 'list' = 'paragraph';
    if (trimmed.startsWith('#') || (trimmed.length < 80 && !trimmed.endsWith('.'))) {
      type = 'heading';
    } else if (trimmed.startsWith('```') || trimmed.includes('def ') || trimmed.includes('function ')) {
      type = 'code';
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
      type = 'list';
    }

    if (tokenEst > maxChunkSizeTokens) {
      const sentences = trimmed.split(/(?<=[.!?])\s+/);
      let currentSub = '';
      let currentTokens = 0;

      for (const sent of sentences) {
        const sentTokens = Math.ceil(sent.split(/\s+/).length * 1.3);
        if (currentTokens + sentTokens > maxChunkSizeTokens && currentSub) {
          chunks.push({
            id: `chk-${chunkIndex}`,
            index: chunkIndex++,
            rawText: currentSub.trim(),
            tokenCount: currentTokens,
            type,
            status: 'pending',
          });
          currentSub = sent;
          currentTokens = sentTokens;
        } else {
          currentSub += (currentSub ? ' ' : '') + sent;
          currentTokens += sentTokens;
        }
      }

      if (currentSub) {
        chunks.push({
          id: `chk-${chunkIndex}`,
          index: chunkIndex++,
          rawText: currentSub.trim(),
          tokenCount: currentTokens,
          type,
          status: 'pending',
        });
      }
    } else {
      chunks.push({
        id: `chk-${chunkIndex}`,
        index: chunkIndex++,
        rawText: trimmed,
        tokenCount: tokenEst,
        type,
        status: 'pending',
      });
    }
  }

  const totalTokens = chunks.reduce((acc, c) => acc + c.tokenCount, 0);

  return {
    chunks,
    totalChunks: chunks.length,
    totalTokens,
  };
}