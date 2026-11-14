import { makeArtwork } from './artwork';
import type { Aspect, ModelDef, OutputKind } from '../types';
import { useSettingsStore } from '../store/useSettingsStore';
import { ComfyProvider } from './comfyProvider';
import { getModelWrapper } from './modelWrappers';

export interface ProviderProgress {
  stage: 'queued' | 'running' | 'done' | 'uploading';
  detail?: string;
  /** 0..1 when the backend reports steps */
  percent?: number;
  /** the ComfyUI job, once queued */
  promptId?: string;
}

export interface GenerationRequest {
  model: ModelDef;
  prompt: string;
  seed?: number;
  strength?: number;
  aspect?: Aspect;
  duration?: number;
  resolution?: string;
  batch?: number;
  generateAudio?: boolean;
  width?: number;
  height?: number;
  referenceCount: number;
  inputImageUrl?: string;
  runIndex: number;
  /** the canvas node and its title, shown in the ComfyUI queue */
  nodeId?: string;
  title?: string;
  signal?: AbortSignal;
  onProgress?: (progress: ProviderProgress) => void;
}

export interface GenerationResult {
  url: string;
  kind: OutputKind;
  provider: string;
  latencyMs: number;
  seed?: number;
  /** the other renders of a batch (the first one is `url`); they go to the node's History strip */
  alternates?: Array<{ url: string; kind: OutputKind; seed?: number }>;
}

export interface Provider {
  id: string;
  label: string;
  generate: (request: GenerationRequest) => Promise<GenerationResult>;
  cancel?: () => Promise<void>;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Deterministic demo provider. Used when ComfyUI is disabled or unavailable.
 * It renders self-contained SVG artwork so the graph is always testable.
 */
export const mockProvider: Provider = {
  id: 'mock',
  label: 'Local mock',
  async generate({ model, prompt, seed = 0, referenceCount, runIndex, batch }) {
    const started = performance.now();
    await wait(900 + ((seed + runIndex * 137) % 700));
    const url = makeArtwork(`${prompt}:${model.id}:${seed}:${referenceCount}`, runIndex);
    const count = Math.max(1, Math.min(4, batch ?? 1));
    return {
      url,
      kind: model.family,
      provider: 'mock',
      latencyMs: Math.round(performance.now() - started),
      alternates: Array.from({ length: count - 1 }, (_, index) => ({
        url: makeArtwork(`${prompt}:${model.id}:${seed}:${referenceCount}`, runIndex + index + 1),
        kind: model.family,
      })),
    };
  },
};

class ModelRouter implements Provider {
  id = 'router';
  label = 'Model router';
  private readonly comfy: ComfyProvider;

  constructor(config: ConstructorParameters<typeof ComfyProvider>[0]) {
    this.comfy = new ComfyProvider(config);
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    if (request.model.runtime === 'api') {
      const wrapper = getModelWrapper(request.model.id);
      if (!wrapper) {
        throw new Error(
          `${request.model.name} is an API model. Add its wrapper in src/lib/modelWrappers.ts and point it at your proxy.`,
        );
      }
      return wrapper.generate(request);
    }
    return this.comfy.generate(request);
  }

  async cancel(): Promise<void> {
    await this.comfy.cancel();
  }
}

export function getRuntimeProvider(): Provider {
  const settings = useSettingsStore.getState();
  if (!settings.useComfy) return mockProvider;
  return new ModelRouter({
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    checkpoint: settings.checkpoint,
    videoCheckpoint: settings.videoCheckpoint,
    textEncoder: settings.textEncoder,
    videoDraft: settings.videoDraft,
  });
}
