import { ModelRecord, ModelRegistryState, ResourceUsage } from '../types/models';

/**
 * Model Registry Service (Stage 2)
 * All model operations route through Rust. The frontend never owns
 * model verification, loading, or path handling.
 */
class ModelRegistryService {
  private state: ModelRegistryState = {
    models: [],
    activeParaphraseModel: '',
    activeTranslationModel: '',
    loadingModelId: null,
    errorMessage: null,
    resourceUsage: [],
  };

  getState(): ModelRegistryState {
    return { ...this.state, models: [...this.state.models], resourceUsage: [...this.state.resourceUsage] };
  }

  /**
   * Refresh model registry from Rust
   */
  async refresh(): Promise<ModelRegistryState> {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
      this.state.errorMessage = 'NATIVE_RUNTIME_REQUIRED';
      return this.getState();
    }

    const invoke = (window as any).__TAURI_INTERNALS__.invoke;
    try {
      const [models, resourceUsage] = await Promise.all([
        invoke('list_models'),
        invoke('get_resource_usage'),
      ]);
      this.state.models = models as ModelRecord[];
      this.state.resourceUsage = resourceUsage as ResourceUsage[];
      this.state.errorMessage = null;

      // Auto-select active models based on first available
      if (!this.state.activeParaphraseModel) {
        const paraphraseModel = this.state.models.find(m => m.supported_operations.includes('paraphrase'));
        if (paraphraseModel) this.state.activeParaphraseModel = paraphraseModel.logical_id;
      }
      if (!this.state.activeTranslationModel) {
        const translationModel = this.state.models.find(m => m.supported_operations.includes('translation'));
        if (translationModel) this.state.activeTranslationModel = translationModel.logical_id;
      }
    } catch (err: any) {
      this.state.errorMessage = err?.message || 'Failed to refresh model registry';
    }
    return this.getState();
  }

  /**
   * Import a model file from a user-selected source path
   */
  async importModel(params: {
    sourcePath: string;
    expectedSha256: string;
    logicalId: string;
    modelId: string;
    version: string;
    format: string;
    quantization: string;
    license: string;
    supportedOperations: string[];
    supportedLanguages: string[];
    contextLength: number;
    ramRequirementMb: number;
    vramRequirementMb: number;
    description: string;
  }): Promise<{ success: boolean; model?: ModelRecord; error?: string }> {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
      return { success: false, error: 'NATIVE_RUNTIME_REQUIRED: Importing models requires the Tauri runtime' };
    }
    const invoke = (window as any).__TAURI_INTERNALS__.invoke;
    try {
      const model = await invoke('import_model', {
        sourcePath: params.sourcePath,
        expectedSha256: params.expectedSha256,
        logicalId: params.logicalId,
        modelId: params.modelId,
        version: params.version,
        format: params.format,
        quantization: params.quantization,
        license: params.license,
        supportedOperations: params.supportedOperations,
        supportedLanguages: params.supportedLanguages,
        contextLength: params.contextLength,
        ramRequirementMb: params.ramRequirementMb,
        vramRequirementMb: params.vramRequirementMb,
        description: params.description,
      }) as ModelRecord;
      await this.refresh();
      return { success: true, model };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Model import failed' };
    }
  }

  /**
   * Verify a model's physical file against its registered digest (Rust-authoritative)
   */
  async verifyModel(logicalId: string): Promise<{ success: boolean; error?: string }> {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
      return { success: false, error: 'NATIVE_RUNTIME_REQUIRED' };
    }
    const invoke = (window as any).__TAURI_INTERNALS__.invoke;
    try {
      await invoke('verify_model', { logicalId });
      await this.refresh();
      return { success: true };
    } catch (err: any) {
      await this.refresh();
      return { success: false, error: err?.message || 'Model verification failed' };
    }
  }

  /**
   * Load a model into the inference runtime
   */
  async loadModel(logicalId: string): Promise<{ success: boolean; error?: string }> {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
      return { success: false, error: 'NATIVE_RUNTIME_REQUIRED' };
    }
    this.state.loadingModelId = logicalId;
    const invoke = (window as any).__TAURI_INTERNALS__.invoke;
    try {
      await invoke('load_model', { logicalId });
      this.state.loadingModelId = null;
      await this.refresh();
      return { success: true };
    } catch (err: any) {
      this.state.loadingModelId = null;
      await this.refresh();
      return { success: false, error: err?.message || 'Model load failed' };
    }
  }

  /**
   * Unload a model from the memory runtime
   */
  async unloadModel(logicalId: string): Promise<{ success: boolean; error?: string }> {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
      return { success: false, error: 'NATIVE_RUNTIME_REQUIRED' };
    }
    const invoke = (window as any).__TAURI_INTERNALS__.invoke;
    try {
      await invoke('unload_model', { logicalId });
      await this.refresh();
      return { success: true };
    } catch (err: any) {
      await this.refresh();
      return { success: false, error: err?.message || 'Model unload failed' };
    }
  }

  /**
   * Get a model's current runtime status
   */
  async getModelStatus(logicalId: string): Promise<ModelRecord | null> {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
      return null;
    }
    const invoke = (window as any).__TAURI_INTERNALS__.invoke;
    try {
      return await invoke('model_status', { logicalId }) as ModelRecord;
    } catch {
      return null;
    }
  }

  setActiveParaphraseModel(modelId: string): void {
    this.state.activeParaphraseModel = modelId;
  }

  setActiveTranslationModel(modelId: string): void {
    this.state.activeTranslationModel = modelId;
  }
}

export const modelRegistry = new ModelRegistryService();