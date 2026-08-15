export type ModelOperation = 'paraphrase' | 'translation' | 'embeddings' | 'semantic_chunk';

export type ModelLoadStatus =
  | 'unverified'
  | 'verified'
  | 'offline_cached'
  | 'loaded_in_memory'
  | 'unloaded'
  | 'verifying'
  | 'tampered'
  | 'unavailable';

export interface ModelEntry {
  logical_id: string;
  exact_model_identifier: string;
  model_name: string;
  model_version: string;
  format: 'GGUF' | 'ONNX' | 'BIN' | 'SAFE_TENSORS';
  quantization: string;
  sha256: string; // 64-char lowercase hex digest
  actual_sha256?: string;
  size_bytes: number;
  size_human: string;
  license: string;
  supported_languages: string[];
  supported_operations: ModelOperation[];
  context_length: number;
  ram_requirement_mb: number;
  vram_requirement_mb: number;
  tokenizer_identifier: string;
  validator_compatibility: string[];
  status: ModelLoadStatus;
  isBundled: boolean;
  filename: string;
  source: string;
  description: string;
}

export interface ModelRegistryState {
  models: ModelEntry[];
  activeParaphraseModel: string;
  activeTranslationModel: string;
  activeEmbeddingModel: string;
  totalVramAllocatedMb: number;
  maxVramBudgetMb: number;
}
