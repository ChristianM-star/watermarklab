import { ModelEntry, ModelRegistryState } from '../types/models';

export const INITIAL_MODELS: ModelEntry[] = [
  {
    logical_id: 'llama-3-paraphrase-8b-q4',
    exact_model_identifier: 'meta-llama/Meta-Llama-3-8B-Instruct-GGUF',
    model_name: 'Llama 3 8B Paraphrase (Q4_K_M)',
    model_version: '3.1.4',
    format: 'GGUF',
    quantization: 'Q4_K_M (4-bit)',
    filename: 'llama-3-8b-paraphrase-q4_k_m.gguf',
    source: 'local://bundled/models/llama-3-8b-paraphrase-q4_k_m.gguf',
    sha256: '',
    size_bytes: 4920000000,
    size_human: '4.58 GB',
    license: 'Meta Llama 3 Community License',
    supported_languages: ['en', 'es', 'fr', 'de', 'it', 'pt'],
    supported_operations: ['paraphrase', 'semantic_chunk'],
    context_length: 8192,
    ram_requirement_mb: 5120,
    vram_requirement_mb: 6144,
    tokenizer_identifier: 'meta-llama/Meta-Llama-3-8B-Tokenizer',
    validator_compatibility: ['validator-v2-strict', 'entity-preservation-v1'],
    status: 'unavailable',
    isBundled: false,
    description: 'High-fidelity local rewrite model with strict semantic preservation and invariant constraints.',
  },
  {
    logical_id: 'nllb-200-distilled-600m',
    exact_model_identifier: 'facebook/nllb-200-distilled-600M-onnx',
    model_name: 'NLLB-200 Distilled 600M (ONNX INT8)',
    model_version: '2.0.0',
    format: 'ONNX',
    quantization: 'INT8 Quantized',
    filename: 'nllb-200-600m-quantized.onnx',
    source: 'local://bundled/models/nllb-200-600m-quantized.onnx',
    sha256: '',
    size_bytes: 630000000,
    size_human: '600 MB',
    license: 'CC-BY-NC-4.0',
    supported_languages: ['en', 'fr', 'de', 'es', 'it', 'zh', 'ja', 'pt', 'nl', 'ru', 'ar'],
    supported_operations: ['translation'],
    context_length: 2048,
    ram_requirement_mb: 1024,
    vram_requirement_mb: 1536,
    tokenizer_identifier: 'facebook/nllb-spm-flores200',
    validator_compatibility: ['validator-v2-strict', 'roundtrip-parity-v1'],
    status: 'unavailable',
    isBundled: false,
    description: 'Local translation engine supporting 200 languages for roundtrip back-translation loops.',
  },
  {
    logical_id: 'bge-small-en-v1.5',
    exact_model_identifier: 'BAAI/bge-small-en-v1.5-onnx',
    model_name: 'BGE Small English v1.5 (Embeddings)',
    model_version: '1.5.0',
    format: 'ONNX',
    quantization: 'FP16 ONNX',
    filename: 'bge-small-en-v1.5.onnx',
    source: 'local://bundled/models/bge-small-en-v1.5.onnx',
    sha256: '',
    size_bytes: 133000000,
    size_human: '133 MB',
    license: 'MIT',
    supported_languages: ['en'],
    supported_operations: ['embeddings', 'semantic_chunk'],
    context_length: 512,
    ram_requirement_mb: 384,
    vram_requirement_mb: 512,
    tokenizer_identifier: 'BAAI/bge-small-tokenizer',
    validator_compatibility: ['validator-v2-strict'],
    status: 'unavailable',
    isBundled: false,
    description: 'Dense vector embeddings engine for semantic chunk similarity and cluster verification.',
  },
  {
    logical_id: 'flan-t5-large-grammar-q8',
    exact_model_identifier: 'google/flan-t5-large-grammar-inversion',
    model_name: 'Flan-T5 Large Grammar & Inversion (Q8)',
    model_version: '1.2.1',
    format: 'BIN',
    quantization: 'Q8_0',
    filename: 'flan-t5-large-q8.bin',
    source: 'local://bundled/models/flan-t5-large-q8.bin',
    sha256: '',
    size_bytes: 780000000,
    size_human: '780 MB',
    license: 'Apache-2.0',
    supported_languages: ['en'],
    supported_operations: ['paraphrase'],
    context_length: 1024,
    ram_requirement_mb: 1536,
    vram_requirement_mb: 2048,
    tokenizer_identifier: 'google/t5-v1_1-large',
    validator_compatibility: ['validator-v2-strict'],
    status: 'unavailable',
    isBundled: false,
    description: 'Deterministic grammatical restructurer for academic style transformation.',
  },
];

export class ModelRegistryService {
  private state: ModelRegistryState = {
    models: [...INITIAL_MODELS],
    activeParaphraseModel: 'llama-3-paraphrase-8b-q4',
    activeTranslationModel: 'nllb-200-distilled-600m',
    activeEmbeddingModel: 'bge-small-en-v1.5',
    totalVramAllocatedMb: 0,
    maxVramBudgetMb: 16384,
  };

  getState(): ModelRegistryState {
    return { ...this.state, models: [...this.state.models] };
  }

  async verifyModelIntegrity(modelId: string): Promise<{ valid: boolean; hash: string; error?: string }> {
    const model = this.state.models.find(m => m.logical_id === modelId);
    if (!model) {
      return { valid: false, hash: '', error: `Model ID "${modelId}" not found in local registry` };
    }

    let computedHash: string | null = null;

    if (!/^[0-9a-fA-F]{64}$/.test(model.sha256)) {
      return { valid: false, hash: '', error: `MODEL_DIGEST_NOT_CONFIGURED: import this model with an immutable SHA-256 digest before use` };
    }

    // Check if running in Tauri native desktop environment
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const invoke = (window as any).__TAURI_INTERNALS__.invoke;
        computedHash = await invoke('verify_model', {
          filename: model.filename,
          expectedSha256: model.sha256,
        });
      } catch (err: any) {
        // Report native verification failure
        this.state.models = this.state.models.map(m =>
          m.logical_id === modelId ? { ...m, status: 'tampered', actual_sha256: undefined } : m
        );
        return {
          valid: false,
          hash: '',
          error: `NATIVE_VERIFY_ERROR: ${err?.message || err}`,
        };
      }
    }

    // If no native runtime and no physical file was hashed
    if (!computedHash) {
      // In web preview without native disk access, report unverified/offline
      return {
        valid: false,
        hash: '',
        error: `MODEL_NOT_FOUND_ON_DISK: Model "${model.filename}" must be verified by native Rust supervisor streaming bytes from disk.`,
      };
    }

    const valid = computedHash.toLowerCase() === model.sha256.toLowerCase();

    // Update model status
    this.state.models = this.state.models.map(m => {
      if (m.logical_id === modelId) {
        return {
          ...m,
          status: valid ? 'verified' : 'tampered',
          actual_sha256: computedHash || undefined,
        };
      }
      return m;
    });

    if (!valid) {
      return {
        valid: false,
        hash: computedHash,
        error: `MODEL_HASH_MISMATCH: expected ${model.sha256.slice(0, 16)}..., computed ${computedHash.slice(0, 16)}...`,
      };
    }

    return { valid: true, hash: computedHash };
  }

  toggleModelLoad(modelId: string): { success: boolean; message: string } {
    const model = this.state.models.find(m => m.logical_id === modelId);
    if (!model) return { success: false, message: 'Model not found' };

    if (model.status === 'tampered') {
      return { success: false, message: 'Cannot load tampered model. SHA-256 verification failed.' };
    }

    if (model.status === 'loaded_in_memory') {
      // Unload model
      this.state.models = this.state.models.map(m =>
        m.logical_id === modelId ? { ...m, status: 'verified' } : m
      );
      this.recalculateVram();
      return { success: true, message: `Model "${model.model_name}" unloaded from memory` };
    } else {
      // Must be verified before loading
      if (model.status !== 'verified') {
        return { success: false, message: `Cannot load unverified model. Stream SHA-256 digest verification first.` };
      }

      // Check VRAM budget
      const targetVram = (this.state.totalVramAllocatedMb || 0) + model.vram_requirement_mb;
      if (targetVram > this.state.maxVramBudgetMb) {
        return {
          success: false,
          message: `VRAM Budget Exceeded: Required ${targetVram}MB exceeds budget limit of ${this.state.maxVramBudgetMb}MB.`,
        };
      }

      this.state.models = this.state.models.map(m =>
        m.logical_id === modelId ? { ...m, status: 'loaded_in_memory' } : m
      );
      this.recalculateVram();
      return { success: true, message: `Model "${model.model_name}" loaded into isolated memory space` };
    }
  }

  private recalculateVram(): void {
    const loaded = this.state.models.filter(m => m.status === 'loaded_in_memory');
    this.state.totalVramAllocatedMb = loaded.reduce((acc, m) => acc + m.vram_requirement_mb, 0);
  }

  setActiveModel(typeOrModelId: string, maybeModelId?: string): boolean {
    if (maybeModelId) {
      const type = typeOrModelId;
      const modelId = maybeModelId;
      const m = this.state.models.find(x => x.logical_id === modelId);
      if (!m) return false;
      if (type === 'paraphrase') this.state.activeParaphraseModel = modelId;
      if (type === 'translation') this.state.activeTranslationModel = modelId;
      if (type === 'embeddings') this.state.activeEmbeddingModel = modelId;
      return true;
    } else {
      const modelId = typeOrModelId;
      const m = this.state.models.find(x => x.logical_id === modelId);
      if (!m) return false;
      if (m.supported_operations.includes('paraphrase')) {
        this.state.activeParaphraseModel = modelId;
      }
      if (m.supported_operations.includes('translation')) {
        this.state.activeTranslationModel = modelId;
      }
      if (m.supported_operations.includes('embeddings')) {
        this.state.activeEmbeddingModel = modelId;
      }
      return true;
    }
  }

  setActiveParaphraseModel(modelId: string): boolean {
    const m = this.state.models.find(x => x.logical_id === modelId);
    if (m && m.supported_operations.includes('paraphrase')) {
      this.state.activeParaphraseModel = modelId;
      return true;
    }
    return false;
  }

  setActiveTranslationModel(modelId: string): boolean {
    const m = this.state.models.find(x => x.logical_id === modelId);
    if (m && m.supported_operations.includes('translation')) {
      this.state.activeTranslationModel = modelId;
      return true;
    }
    return false;
  }
}

export const modelRegistry = new ModelRegistryService();
