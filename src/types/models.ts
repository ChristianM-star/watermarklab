export type ModelOperation = 'paraphrase' | 'translation' | 'embeddings' | 'semantic_chunk';

export type ModelStatus =
  | 'NOT_INSTALLED'
  | 'FOUND'
  | 'HASH_VERIFIED'
  | 'INCOMPATIBLE'
  | 'LOAD_FAILED'
  | 'LOADED'
  | 'UNLOADED';

export interface ModelRecord {
  logical_id: string;
  model_id: string;
  version: string;
  format: string;
  quantization: string;
  sha256: string;
  file_path: string;
  size_bytes: number;
  license: string;
  supported_operations: string[];
  supported_languages: string[];
  context_length: number;
  ram_requirement_mb: number;
  vram_requirement_mb: number;
  status: ModelStatus;
  verified_digest?: string;
  description: string;
}

export interface ResourceUsage {
  loaded_model: string | null;
  ram_estimate_mb: number;
  vram_estimate_mb: number;
  context_size: number;
  active_requests: number;
}

export interface ModelRegistryState {
  models: ModelRecord[];
  activeParaphraseModel: string;
  activeTranslationModel: string;
  loadingModelId: string | null;
  errorMessage: string | null;
  resourceUsage: ResourceUsage[];
}