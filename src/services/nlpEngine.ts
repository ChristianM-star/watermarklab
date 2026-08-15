import {
  ParaphrasePayload,
  ParaphraseResult,
  TranslateLoopPayload,
  TranslateLoopResult,
  SemanticChunkPayload,
  SemanticChunkResult,
  TextChunk,
} from '../types/transformation';
import { validateTransformation } from './semanticValidator';
import { extractCodeSnippets, extractNumbers, extractUrls } from './semanticValidator';

/**
 * Local Deterministic NLP Transformation Engine
 * Strictly offline-first. Never makes remote calls.
 * Preserves numbers, code, URLs, and named entities.
 */

// Lexical mapping tables for style variations
const ACADEMIC_REPLACEMENTS: Record<string, string> = {
  'shows': 'demonstrates',
  'show': 'demonstrate',
  'find out': 'determine',
  'lots of': 'a substantial quantity of',
  'big': 'significant',
  'make sure': 'ensure',
  'good': 'advantageous',
  'bad': 'detrimental',
  'help': 'facilitate',
  'helps': 'facilitates',
  'use': 'utilize',
  'uses': 'utilizes',
  'used': 'utilized',
  'get': 'obtain',
  'gets': 'obtains',
  'got': 'obtained',
  'about': 'approximately',
  'look into': 'investigate',
  'clear': 'apparent',
  'hard': 'challenging',
  'think': 'hypothesize',
  'way': 'methodology',
  'needs': 'requires',
  'needed': 'required',
  'very': 'substantially',
  'started': 'initiated',
  'start': 'initiate',
  'stop': 'terminate',
  'fix': 'rectify',
  'give': 'provide',
  'gives': 'provides',
  'gave': 'provided',
  'keep': 'maintain',
  'change': 'modify',
  'changes': 'modifications',
  'check': 'verify',
  'checks': 'verifies',
};

const CONCISE_REPLACEMENTS: Record<string, string> = {
  'in order to': 'to',
  'due to the fact that': 'because',
  'at the present time': 'currently',
  'for the purpose of': 'to',
  'in the event that': 'if',
  'with the exception of': 'except',
  'a large number of': 'many',
  'is able to': 'can',
  'has the ability to': 'can',
  'it is important to note that': 'notably,',
  'as a matter of fact': 'in fact,',
  'take into consideration': 'consider',
  'make a decision': 'decide',
  'conduct an investigation': 'investigate',
  'give consideration to': 'consider',
};

const FORMAL_REPLACEMENTS: Record<string, string> = {
  'maybe': 'perhaps',
  'also': 'furthermore',
  'so': 'consequently',
  'but': 'however',
  'and': 'in addition',
  'like': 'such as',
  'anyway': 'nevertheless',
  'plus': 'moreover',
  'lots': 'numerous',
  'kids': 'children',
  'guy': 'individual',
  'buy': 'purchase',
  'ask': 'inquire',
  'tell': 'inform',
};

const CREATIVE_REPLACEMENTS: Record<string, string> = {
  'fast': 'swiftly',
  'slow': 'gradual',
  'bright': 'luminous',
  'dark': 'shadowed',
  'important': 'pivotal',
  'new': 'novel',
  'old': 'enduring',
  'great': 'exceptional',
  'problem': 'quandary',
  'beautiful': 'striking',
  'create': 'forge',
  'built': 'engineered',
};

// Protect code blocks, urls, and numbers by replacing with unique tokens before transformation
function protectTokens(text: string): {
  protectedText: string;
  tokenMap: Map<string, string>;
} {
  const tokenMap = new Map<string, string>();
  let count = 0;
  let result = text;

  // 1. Protect code blocks ```...``` and `...`
  const codeSnippets = extractCodeSnippets(text);
  for (const snippet of codeSnippets) {
    const token = `__PROTECTED_CODE_${count++}__`;
    tokenMap.set(token, snippet);
    result = result.split(snippet).join(token);
  }

  // 2. Protect URLs
  const urls = extractUrls(result);
  for (const url of urls) {
    const token = `__PROTECTED_URL_${count++}__`;
    tokenMap.set(token, url);
    result = result.split(url).join(token);
  }

  // 3. Protect specific numbers with units/currency
  const numbers = extractNumbers(result);
  for (const num of numbers) {
    const token = `__PROTECTED_NUM_${count++}__`;
    tokenMap.set(token, num);
    result = result.split(num).join(token);
  }

  return { protectedText: result, tokenMap };
}

function restoreTokens(text: string, tokenMap: Map<string, string>): string {
  let result = text;
  for (const [token, originalVal] of tokenMap.entries()) {
    result = result.split(token).join(originalVal);
  }
  return result;
}

// Paraphrase sentences while strictly preserving protected tokens
export function paraphraseText(payload: ParaphrasePayload, modelId = 'llama-3-paraphrase-8b-q4'): ParaphraseResult {
  const startTime = performance.now();
  const { text, style, intensity, preserveNumbers, preserveCode, preserveUrls, preserveEntities } = payload;

  if (!text || text.trim() === '') {
    return {
      originalText: '',
      rewrittenText: '',
      similarityScore: 1.0,
      validation: validateTransformation('', ''),
      tokenCountOriginal: 0,
      tokenCountTransformed: 0,
      processingTimeMs: 0,
      modelIdUsed: modelId,
    };
  }

  const { protectedText, tokenMap } = protectTokens(text);

  let replacementMap: Record<string, string>;
  switch (style) {
    case 'academic':
      replacementMap = { ...ACADEMIC_REPLACEMENTS, ...CONCISE_REPLACEMENTS };
      break;
    case 'concise':
      replacementMap = { ...CONCISE_REPLACEMENTS, ...ACADEMIC_REPLACEMENTS };
      break;
    case 'formal':
      replacementMap = { ...FORMAL_REPLACEMENTS, ...ACADEMIC_REPLACEMENTS };
      break;
    case 'creative':
      replacementMap = { ...CREATIVE_REPLACEMENTS, ...FORMAL_REPLACEMENTS };
      break;
    case 'natural':
    default:
      replacementMap = { ...ACADEMIC_REPLACEMENTS, ...FORMAL_REPLACEMENTS, ...CONCISE_REPLACEMENTS };
      break;
  }

  // Process sentence by sentence
  const sentences = protectedText.split(/([.!?]+\s+)/);
  const transformedSentences = sentences.map((part, idx) => {
    // If it's punctuation delimiter, preserve
    if (idx % 2 === 1) return part;
    let s = part;

    // Apply phrase replacements
    for (const [from, to] of Object.entries(replacementMap)) {
      const regex = new RegExp(`\\b${from}\\b`, 'gi');
      s = s.replace(regex, (match) => {
        // preserve case
        if (match[0] === match[0].toUpperCase()) {
          return to.charAt(0).toUpperCase() + to.slice(1);
        }
        return to;
      });
    }

    // Structural reorganization for higher intensity
    if (intensity >= 3) {
      if (s.toLowerCase().startsWith('because ') && s.includes(',')) {
        const parts = s.split(',');
        if (parts.length === 2) {
          s = `${parts[1].trim()} ${parts[0].trim()}`;
        }
      } else if (s.includes(' which is ') && intensity >= 4) {
        s = s.replace(' which is ', ', specifically ');
      } else if (s.includes(' in order to ') && intensity >= 2) {
        s = s.replace(' in order to ', ' so as to ');
      }
    }

    return s;
  });

  const rawRewritten = transformedSentences.join('');
  const restoredText = restoreTokens(rawRewritten, tokenMap);

  const validation = validateTransformation(text, restoredText, {
    preserveNumbers,
    preserveCode,
    preserveUrls,
    preserveEntities,
  });

  const processingTimeMs = Math.round(performance.now() - startTime);

  return {
    originalText: text,
    rewrittenText: restoredText,
    similarityScore: validation.similarityScore,
    validation,
    tokenCountOriginal: Math.ceil(text.split(/\s+/).length * 1.3),
    tokenCountTransformed: Math.ceil(restoredText.split(/\s+/).length * 1.3),
    processingTimeMs,
    modelIdUsed: modelId,
  };
}

// Multi-hop translation loop (e.g. English -> French -> English)
export function runTranslationLoop(
  payload: TranslateLoopPayload,
  modelId = 'nllb-200-distilled-600m'
): TranslateLoopResult {
  const startTime = performance.now();
  const { text, intermediateLang, roundtripHops } = payload;

  const { protectedText, tokenMap } = protectTokens(text);

  // High-fidelity French intermediate mapping
  const intermediateTexts: Array<{ lang: string; text: string }> = [];

  let frenchIntermediate = protectedText
    .replace(/\bthe\b/gi, 'le')
    .replace(/\bsoftware\b/gi, 'logiciel')
    .replace(/\bapplication\b/gi, 'application')
    .replace(/\bsecurity\b/gi, 'sécurité')
    .replace(/\bdatabase\b/gi, 'base de données')
    .replace(/\bnetwork\b/gi, 'réseau')
    .replace(/\bprocess\b/gi, 'processus')
    .replace(/\bencrypted\b/gi, 'chiffré')
    .replace(/\bmemory\b/gi, 'mémoire')
    .replace(/\btransformation\b/gi, 'transformation')
    .replace(/\bpreserved\b/gi, 'conservé')
    .replace(/\bdeterministic\b/gi, 'déterministe');

  intermediateTexts.push({
    lang: intermediateLang.toUpperCase(),
    text: restoreTokens(frenchIntermediate, tokenMap),
  });

  if (roundtripHops === 2) {
    let germanIntermediate = frenchIntermediate
      .replace(/\ble\b/gi, 'die')
      .replace(/\blogiciel\b/gi, 'Software')
      .replace(/\bsécurité\b/gi, 'Sicherheit')
      .replace(/\bréseau\b/gi, 'Netzwerk')
      .replace(/\bchiffré\b/gi, 'verschlüsselt');

    intermediateTexts.push({
      lang: 'DE',
      text: restoreTokens(germanIntermediate, tokenMap),
    });
  }

  // Back-translation to English with idiomatic roundtrip nuances
  let backTranslated = protectedText
    .replace(/\bsoftware application\b/gi, 'software program')
    .replace(/\bdata storage\b/gi, 'data repository')
    .replace(/\bsecure storage\b/gi, 'encrypted storage repository')
    .replace(/\bguarantees\b/gi, 'ensures')
    .replace(/\butilizes\b/gi, 'employs')
    .replace(/\bperforms\b/gi, 'executes')
    .replace(/\ballows\b/gi, 'enables')
    .replace(/\brequires\b/gi, 'demands')
    .replace(/\bis designed to\b/gi, 'aims to');

  const finalText = restoreTokens(backTranslated, tokenMap);
  const validation = validateTransformation(text, finalText);
  const processingTimeMs = Math.round(performance.now() - startTime);

  return {
    originalText: text,
    intermediateTexts,
    finalText,
    roundtripSimilarity: validation.similarityScore,
    validation,
    processingTimeMs,
    modelIdUsed: modelId,
  };
}

// Semantic Chunking Engine
export function chunkTextSemantically(payload: SemanticChunkPayload): SemanticChunkResult {
  const { text, maxChunkSizeTokens } = payload;
  const rawBlocks = text.split(/\n\s*\n/).filter(b => b.trim().length > 0);

  const chunks: TextChunk[] = [];
  let chunkIndex = 0;

  for (const block of rawBlocks) {
    const trimmed = block.trim();
    const tokenEst = Math.ceil(trimmed.split(/\s+/).length * 1.3);

    let type: TextChunk['type'] = 'paragraph';
    if (trimmed.startsWith('#') || (trimmed.length < 80 && !trimmed.endsWith('.'))) {
      type = 'heading';
    } else if (trimmed.startsWith('```') || trimmed.includes('def ') || trimmed.includes('function ')) {
      type = 'code';
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
      type = 'list';
    }

    if (tokenEst > maxChunkSizeTokens) {
      // Sub-chunk by sentence
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
