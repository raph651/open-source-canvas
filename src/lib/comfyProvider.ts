import type { GenerationRequest, GenerationResult, Provider, ProviderProgress } from './providers';
import { ComfyClient, type ComfyProgress } from './comfy';
import {
  framesForDuration,
  framesForWan,
  ltxImageToVideoWorkflow,
  ltxVideoWorkflow,
  sdTurboImg2ImgWorkflow,
  sdTurboWorkflow,
  sizeForImageTier,
  sizeForVideoTier,
  wan22Ti2vWorkflow,
} from './comfyWorkflows';

interface ComfyProviderConfig {
  baseUrl: string;
  apiKey?: string;
  checkpoint: string;
  videoCheckpoint: string;
  textEncoder: string;
  videoDraft: boolean;
}

function mapProgress(progress: ComfyProgress): ProviderProgress {
  const { promptId, percent } = progress;
  if (progress.stage === 'queued') return { stage: 'queued', promptId, detail: progress.detail ?? 'Waiting in queue' };
  if (progress.stage === 'done') return { stage: 'done', promptId, percent: 1, detail: 'Fetching output' };
  if (progress.stage === 'downloading') return { stage: 'running', promptId, detail: 'Downloading output' };
  return { stage: 'running', promptId, percent, detail: progress.detail ?? 'Rendering' };
}

export class ComfyProvider implements Provider {
  id = 'comfyui';
  label = 'ComfyUI';
  private readonly client: ComfyClient;
  private readonly checkpoint: string;
  private readonly videoCheckpoint: string;
  private readonly textEncoder: string;
  private readonly videoDraft: boolean;

  constructor(config: ComfyProviderConfig) {
    this.client = new ComfyClient({ baseUrl: config.baseUrl, apiKey: config.apiKey });
    this.checkpoint = config.checkpoint;
    this.videoCheckpoint = config.videoCheckpoint;
    this.textEncoder = config.textEncoder;
    this.videoDraft = config.videoDraft;
  }

  private async prepareImage(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`image fetch ${response.status}`);
    const blob = await response.blob();
    const extension = blob.type.includes('jpeg')
      ? 'jpg'
      : blob.type.includes('webp')
        ? 'webp'
        : 'png';
    const filename = `osc-reference.${extension}`;
    const file = new File([blob], filename, { type: blob.type || `image/${extension}` });
    const uploaded = await this.client.uploadImage(file, filename);
    return uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name;
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    if (request.model.runtime !== 'comfyui') {
      throw new Error(`${request.model.name} is an API model and cannot run on the local ComfyUI workflow.`);
    }
    if (request.model.family === 'audio') {
      throw new Error(`${request.model.name} is an audio model. Add a matching ComfyUI audio workflow first.`);
    }
    if (request.model.workflow === false) {
      throw new Error(
        `${request.model.name} has no workflow in this app yet. Install it (see the Install panel), then run it from its own ComfyUI template.`,
      );
    }
    const started = performance.now();
    const baseSeed = request.seed ?? Math.floor(Math.random() * 1_000_000_000);
    // "Number of generations": one ComfyUI job per render, each with its own seed, so they differ.
    const count = Math.max(1, Math.min(4, Math.round(request.batch ?? 1)));
    request.onProgress?.({ stage: 'queued', detail: 'Submitting to ComfyUI' });

    // A resolution this model does not offer (an old node, or a switch from a bigger model) falls back to its first one.
    const tierOf = (tiers: string[]) => (request.resolution && tiers.includes(request.resolution) ? request.resolution : tiers[0]);

    let build: (seed: number) => Record<string, unknown>;
    let outputPattern: RegExp;
    let kind: 'image' | 'video';

    if (request.model.family === 'video') {
      const videoPrompt = request.prompt?.trim() || 'A subtle cinematic camera move with natural motion. Keep the subject stable.';
      const tiers = request.model.resolutions ?? ['480p'];
      let firstFrame: string | undefined;
      if (request.inputImageUrl) {
        request.onProgress?.({ stage: 'uploading', detail: 'Uploading first frame to ComfyUI' });
        try {
          firstFrame = await this.prepareImage(request.inputImageUrl);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Could not prepare the upstream image for ${request.model.name}: ${message}`);
        }
      }

      if (request.model.id === 'wan-2.2-ti2v-5b') {
        const size = sizeForVideoTier(request.aspect, tierOf(tiers), tiers[0], 32);
        const files = Object.fromEntries((request.model.install?.files ?? []).map((item) => [item.field, item.file]));
        build = (seed) =>
          wan22Ti2vWorkflow({
            prompt: videoPrompt,
            negative: 'text, watermark, logo, blurry, low quality, distorted, static, still image',
            seed,
            width: size.width,
            height: size.height,
            frames: framesForWan(request.duration ?? 4),
            unet: files.unet_name,
            textEncoder: files.clip_name,
            vae: files.vae_name,
            image: firstFrame,
          });
      } else {
        const size = this.videoDraft ? { width: 256, height: 256 } : sizeForVideoTier(request.aspect, tierOf(tiers), tiers[0], 32);
        const common = {
          prompt: videoPrompt,
          negative: 'text, watermark, logo, blurry, low quality, distorted',
          width: size.width,
          height: size.height,
          frames: this.videoDraft ? 17 : framesForDuration(request.duration ?? 2),
          steps: this.videoDraft ? 4 : 8,
          checkpoint: this.videoCheckpoint,
          textEncoder: this.textEncoder,
        };
        build = (seed) =>
          firstFrame
            ? ltxImageToVideoWorkflow({ ...common, seed, image: firstFrame, strength: 1 })
            : ltxVideoWorkflow({ ...common, seed });
      }
      outputPattern = /\.(mp4|webm|mov|webp|gif)$/i;
      kind = 'video';
    } else {
      const tiers = request.model.resolutions ?? ['512'];
      const size = request.width && request.height
        ? { width: request.width, height: request.height }
        : sizeForImageTier(request.aspect, tierOf(tiers), tiers[0]);
      let reference: string | undefined;
      if (request.inputImageUrl) {
        request.onProgress?.({ stage: 'uploading', detail: 'Uploading reference to ComfyUI' });
        try {
          reference = await this.prepareImage(request.inputImageUrl);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Could not prepare the reference image for SD-Turbo: ${message}`);
        }
      }
      const negative = 'text, watermark, logo, blurry, low quality';
      build = (seed) =>
        reference
          ? sdTurboImg2ImgWorkflow({
              prompt: request.prompt,
              negative,
              seed,
              width: size.width,
              height: size.height,
              checkpoint: this.checkpoint,
              image: reference,
              denoise: request.strength ?? 0.55,
            })
          : sdTurboWorkflow({
              prompt: request.prompt,
              negative,
              seed,
              width: size.width,
              height: size.height,
              checkpoint: this.checkpoint,
            });
      outputPattern = /\.(png|jpe?g|webp)$/i;
      kind = 'image';
    }

    const renders: Array<{ url: string; seed: number }> = [];
    for (let index = 0; index < count; index += 1) {
      const seed = baseSeed + index;
      const label = count > 1 ? ` (${index + 1} of ${count})` : '';
      const result = await this.client.run(build(seed), {
        signal: request.signal,
        meta: { title: `${request.title ?? request.model.name}${label}`, model: request.model.name, nodeId: request.nodeId },
        onProgress: (progress) => {
          const mapped = mapProgress(progress);
          request.onProgress?.({ ...mapped, detail: `${mapped.detail ?? ''}${label}` });
        },
      });
      const output = result.outputs.find((item) => outputPattern.test(item.filename)) ?? result.outputs[0];
      if (!output) throw new Error('ComfyUI did not return an output file');
      renders.push({ url: this.client.viewUrl(output), seed });
    }

    return {
      url: renders[0].url,
      kind,
      provider: 'comfyui',
      latencyMs: Math.round(performance.now() - started),
      seed: renders[0].seed,
      alternates: renders.slice(1).map((item) => ({ url: item.url, kind, seed: item.seed })),
    };
  }

  async cancel(): Promise<void> {
    await this.client.interrupt();
  }
}
