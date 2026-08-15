export type ParaphraseStyle = 'academic' | 'natural' | 'concise' | 'creative' | 'formal';

export interface PreservedItem {
  type: 'number' | 'url' | 'code' | 'named_entity';
  value: string;
  countOriginal: number;
  countTransformed: number;
  preserved: boolean;
}

export interface SemanticValidationReport {
  isValid: boolean;
  numbersPreserved: boolean;
  codePreserved: boolean;
  urlsPreserved: boolean;
  namedEntitiesPreserved: boolean;
  structuralPreserved: boolean;
  lengthRatio: number;
  lexicalOverlapScore: number; // 0.0 - 1.0 token overlap
  similarityScore: number; // alias for backwards compatibility
  entitiesDetectedByValidatorV1: string[];
  items: PreservedItem[];
  violations: string[];
}

export interface ParaphrasePayload {
  text: string;
  style: ParaphraseStyle;
  intensity: number; // 1 to 5
  preserveEntities: boolean;
  preserveCode: boolean;
  preserveNumbers: boolean;
  preserveUrls: boolean;
}

export interface ParaphraseResult {
  originalText: string;
  rewrittenText: string;
  similarityScore: number;
  validation: SemanticValidationReport;
  tokenCountOriginal: number;
  tokenCountTransformed: number;
  processingTimeMs: number;
  modelIdUsed: string;
}

export type IntermediateLanguage = 'fr' | 'es' | 'de' | 'it' | 'ja' | 'zh';

export interface TranslateLoopPayload {
  text: string;
  sourceLang: string;
  intermediateLang: IntermediateLanguage;
  targetLang: string;
  roundtripHops: number; // 1 (en->fr->en) or 2 (en->fr->de->en)
}

export interface TranslateLoopResult {
  originalText: string;
  intermediateTexts: Array<{ lang: string; text: string }>;
  finalText: string;
  roundtripSimilarity: number;
  validation: SemanticValidationReport;
  processingTimeMs: number;
  modelIdUsed: string;
}

export interface SemanticChunkPayload {
  text: string;
  maxChunkSizeTokens: number;
  overlapTokens: number;
  preserveHeadings: boolean;
  preserveCodeBlocks: boolean;
}

export interface TextChunk {
  id: string;
  index: number;
  rawText: string;
  transformedText?: string;
  tokenCount: number;
  type: 'heading' | 'paragraph' | 'code' | 'list';
  status: 'pending' | 'transformed' | 'validated' | 'rejected';
  validation?: SemanticValidationReport;
}

export interface SemanticChunkResult {
  chunks: TextChunk[];
  totalChunks: number;
  totalTokens: number;
}

export type DiffChangeType = 'unchanged' | 'added' | 'removed' | 'modified';

export interface DiffSegment {
  id: string;
  type: DiffChangeType;
  value: string;
  originalValue?: string;
  accepted?: boolean;
  wordIndex: number;
}

export interface HumanEditSession {
  id: string;
  originalText: string;
  proposedText: string;
  currentText: string;
  segments: DiffSegment[];
  provenance: {
    baseModel: string;
    transformationType: string;
    timestamp: number;
    watermarkId: string;
    revisionCount: number;
  };
  auditTrail: Array<{
    timestamp: number;
    action: 'accept' | 'reject' | 'manual_edit' | 'reset';
    segmentId?: string;
    details: string;
  }>;
}
