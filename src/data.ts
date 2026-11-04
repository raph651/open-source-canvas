import { MarkerType, type Edge } from '@xyflow/react';
import type { CanvasNode, ModelDef, ModelId, NodeKind, TemplateDef } from './types';
import { asset, STATIC_DEMO } from './lib/staticDemo';

export const MODELS: ModelDef[] = [
  {
    id: 'sd-turbo',
    name: 'SD-Turbo',
    family: 'image',
    runtime: 'comfyui',
    blurb: 'Fast local stills. SD-Turbo, 4 steps, running through ComfyUI.',
    accent: '#ff7a3d',
    resolutions: ['512', '768', '1k'],
    eta: { label: '~3 s', note: 'About 3 seconds per 512 image, measured on an Apple M4.' },
  },
  {
    id: 'ltx-video-2b',
    name: 'LTX-Video 2B',
    family: 'video',
    runtime: 'comfyui',
    blurb: 'Local draft video via LTX 2B distilled. Short clips on 24 GB.',
    accent: '#ffb27a',
    resolutions: ['480p', '720p'],
  },
  {
    id: 'wan-2.2-ti2v-5b',
    name: 'Wan 2.2 TI2V 5B',
    family: 'video',
    runtime: 'comfyui',
    blurb: 'Local text and image to video. Wan 2.2 5B at up to 720p and 24 fps. About 18 GB of downloads.',
    accent: '#7ad7ff',
    resolutions: ['480p', '720p'],
    eta: { label: 'up to 9 min', note: 'Alibaba reports a 5 s 720p clip in under 9 minutes on an RTX 4090.' },
    install: {
      docs: 'https://docs.comfy.org/tutorials/video/wan/wan2_2',
      files: [
        {
          node: 'UNETLoader',
          field: 'unet_name',
          file: 'wan2.2_ti2v_5B_fp16.safetensors',
          folder: 'models/diffusion_models',
          url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors',
          size: '10 GB',
        },
        {
          node: 'CLIPLoader',
          field: 'clip_name',
          file: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
          folder: 'models/text_encoders',
          url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
          size: '6.7 GB',
        },
        {
          node: 'VAELoader',
          field: 'vae_name',
          file: 'wan2.2_vae.safetensors',
          folder: 'models/vae',
          url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors',
          size: '1.4 GB',
        },
      ],
      note: 'Needs a recent ComfyUI (the Wan 2.2 5B nodes) and roughly 16 GB of VRAM for 720p. Restart ComfyUI after copying the files.',
    },
  },
  {
    id: 'pika-h3-flex',
    name: 'Pika H3 Flex',
    family: 'video',
    runtime: 'comfyui',
    blurb: 'Local video with synchronized audio from Pika Labs (built on MiniMax-H3). Runs in ComfyUI 0.43.2 or newer from its built-in templates; about 42 GB of files for text to video.',
    accent: '#ff7ad9',
    resolutions: ['480p', '768p'],
    workflow: false,
    install: {
      docs: 'https://docs.comfy.org/tutorials/video/pika/pika-h3-flex',
      files: [
        {
          node: 'UNETLoader',
          field: 'unet_name',
          file: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
          folder: 'models/diffusion_models',
          url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors',
          size: '21 GB',
        },
        {
          node: 'LoraLoaderModelOnly',
          field: 'lora_name',
          file: 'pika_h3_flex_fl2va_v1_bf16.safetensors',
          folder: 'models/loras',
          url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/loras/pika_h3_flex_fl2va_v1_bf16.safetensors',
          size: '2 GB',
        },
        {
          node: 'CLIPLoader',
          field: 'clip_name',
          file: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
          folder: 'models/text_encoders',
          url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
          size: '16 GB',
        },
        {
          node: 'VAELoader',
          field: 'vae_name',
          file: 'minimax_h3_video_vae_int8_convrot.safetensors',
          folder: 'models/vae',
          url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_int8_convrot.safetensors',
          size: '2.8 GB',
        },
        {
          node: 'VAELoader',
          field: 'vae_name',
          file: 'minimax_h3_audio_vae_fp32.safetensors',
          folder: 'models/vae',
          url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors',
          size: '0.6 GB',
        },
      ],
      note: 'No custom node. Copy the files, restart ComfyUI, then open Template Library > Video > Pika H3 Flex. Reference to video also needs minimax_h3_ref2va_pruned_int8_convrot.safetensors (21 GB) and pika_h3_flex_ref2va_v1_bf16.safetensors (2 GB) from the same repo. This app lists the model and checks these files, but has no workflow for it yet: render it from ComfyUI\'s template.',
    },
  },
  {
    id: 'nano-banana-pro',
    name: 'Nano Banana Pro',
    family: 'image',
    runtime: 'api',
    blurb: 'Editorial stills and precise edits through an external API wrapper.',
    accent: '#8bd3ff',
  },
  {
    id: 'soul-2.0',
    name: 'Soul 2.0',
    family: 'image',
    runtime: 'api',
    blurb: 'Character and portrait generation through an external API wrapper.',
    accent: '#ff9bea',
  },
  {
    id: 'ltx-2.3',
    name: 'LTX-2.3',
    family: 'video',
    runtime: 'api',
    blurb: 'Full LTX video generation through the LTX API wrapper.',
    accent: '#f4d9a4',
  },
  {
    id: 'seedream-5.0-pro',
    name: 'Seedream 5.0 Pro',
    family: 'image',
    runtime: 'api',
    blurb: 'ByteDance Seedream 5.0 Pro through ComfyUI\'s ByteDance partner nodes. Up to 4K, multi-reference.',
    accent: '#ff9bb5',
  },
  {
    id: 'ltx-2.5',
    name: 'LTX-2.5',
    family: 'video',
    runtime: 'api',
    blurb: 'Lightricks LTX-2.5 (Fast and Pro) through ComfyUI\'s LTX API partner nodes. Up to 4K, with synchronized sound.',
    accent: '#d7ff3f',
    resolutions: ['720p', '1080p'],
  },
  {
    id: 'seedance-2.0',
    name: 'Seedance 2.0',
    family: 'video',
    runtime: 'api',
    blurb: 'ByteDance Seedance 2.0 through an external API wrapper.',
    accent: '#b49bff',
    resolutions: ['480p', '720p', '1080p'],
  },
  {
    id: 'seedance-2.5',
    name: 'Seedance 2.5',
    family: 'video',
    runtime: 'api',
    blurb: 'ByteDance Seedance 2.5 through an external API wrapper.',
    accent: '#a8ff9e',
    resolutions: ['480p', '720p', '1080p'],
  },
];

export const MODEL_BY_ID: Record<ModelId, ModelDef> = Object.fromEntries(
  MODELS.map((model) => [model.id, model]),
) as Record<ModelId, ModelDef>;

export const OPEN_MODELS = MODELS.filter((model) => model.runtime === 'comfyui');

/**
 * What the model pickers offer. Normally only the models that run through a local ComfyUI. The online demo has no
 * ComfyUI at all and draws placeholder artwork for everything, so it lists every model, API ones included.
 */
export const LISTED_MODELS = STATIC_DEMO ? MODELS : OPEN_MODELS;

export const NODE_META: Record<
  NodeKind,
  { label: string; hint: string; color: string; short: string }
> = {
  prompt: { label: 'Prompt', hint: 'Write the direction', color: '#a78bfa', short: 'TXT' },
  model: { label: 'Model', hint: 'Render a frame', color: '#8bd3ff', short: 'MDL' },
  reference: { label: 'Image', hint: 'Upload a reference', color: '#c4b5fd', short: 'IMG' },
  output: { label: 'Output', hint: 'Collect the final', color: '#f3f1e8', short: 'OUT' },
  note: { label: 'Note', hint: 'Leave a director note', color: '#c4b5fd', short: 'NOTE' },
  group: { label: 'Group', hint: 'Frame a cluster', color: '#8bd3ff', short: 'GRP' },
  shape: { label: 'Shape', hint: 'Mark up the board', color: '#a78bfa', short: 'SHP' },
  table: { label: 'Table', hint: 'Plan the shot list', color: '#c4b5fd', short: 'TBL' },
  page: { label: 'Page', hint: 'Open a nested canvas', color: '#7ee0b8', short: 'PAGE' },
};

export const NAV_ITEMS = ['Studio', 'Templates', 'Models', 'Community', 'Docs'];

export const ASPECTS = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] as const;

const EDGE_COLOR = 'rgba(167, 139, 250, 0.72)';

export function makeEdge(source: string, target: string): Edge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    type: 'default',
    style: { stroke: EDGE_COLOR, strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#a78bfa', width: 16, height: 16 },
  };
}

function node(
  id: string,
  kind: NodeKind,
  x: number,
  y: number,
  extra: Partial<CanvasNode['data']> = {},
): CanvasNode {
  const defaults: Record<NodeKind, Partial<CanvasNode['data']>> = {
    prompt: { title: 'Prompt', prompt: '' },
    model: { title: 'SD-Turbo', model: 'sd-turbo', aspect: '1:1', duration: 4 },
    reference: { title: 'Reference', label: 'ANCHOR / 01' },
    output: { title: 'Output' },
    note: { title: 'Note', note: '' },
    group: { title: 'Group' },
    shape: { title: 'Shape', shape: 'rect' },
    table: {
      title: 'Table',
      table: {
        columns: ['Beat', 'Shot', 'Note'],
        rows: [
          ['01', 'Wide', 'Dusk, hard side light'],
          ['02', 'Close', 'Rider enters frame'],
          ['03', 'Cutaway', 'Hands on the bars'],
        ],
      },
    },
    page: { title: 'Page' },
  };

  return {
    id,
    type: 'canvas',
    position: { x, y },
    data: {
      kind,
      status: 'idle',
      ...defaults[kind],
      ...extra,
    } as CanvasNode['data'],
  };
}

function buildProductFilm() {
  const p = Math.random().toString(36).slice(2, 7);
  const ref = node(`${p}-ref`, 'reference', 20, 210, {
    title: 'Product shot',
    label: 'PRODUCT',
    previewUrl: undefined,
  });
  const image = node(`${p}-img`, 'model', 320, 160, {
    title: 'SD-Turbo',
    model: 'sd-turbo',
    prompt:
      'A single silver aluminium soda can with an abstract orange and purple colour-block design and condensation droplets on a pastel studio set. Soft studio light, glossy reflections. No readable text.',
    aspect: '4:5',
  });
  const video = node(`${p}-vid`, 'model', 620, 160, {
    title: 'LTX-2.5',
    model: 'ltx-2.5',
    prompt:
      'Product commercial. The can levitates and slowly spins in a pastel studio. A slow-motion ring of splash, floating ice cubes and citrus slices orbits it, macro condensation droplets, glossy reflections; the camera pushes in with a smooth motion-control move.',
    duration: 6,
    outputUrl: asset('templates/product-film/preview.mp4'),
    outputKind: 'video',
    status: 'done',
  });
  const out = node(`${p}-out`, 'output', 920, 240, { title: 'Launch cut' });
  return {
    nodes: [ref, image, video, out],
    edges: [makeEdge(ref.id, image.id), makeEdge(image.id, video.id), makeEdge(video.id, out.id)],
  };
}

function buildMotionStudy() {
  const p = Math.random().toString(36).slice(2, 7);
  const prompt = node(`${p}-prompt`, 'prompt', 20, 280, {
    title: 'Motion brief',
    prompt:
      'A translucent ribbon of light folds through a dark room, catching on brushed metal. Restrained, tactile, no text.',
  });
  const key = node(`${p}-key`, 'model', 320, 130, {
    title: 'SD-Turbo',
    model: 'sd-turbo',
    prompt: 'Key art: a ribbon of light folding through a dark architectural void.',
    aspect: '16:9',
  });
  const motion = node(`${p}-motion`, 'model', 620, 230, {
    title: 'LTX-2.5',
    model: 'ltx-2.5',
    prompt:
      'A team stands before a wall of glowing lime nodes and connections; one person drags a node across the wall and a finished film frame blooms on it. Slow push-in, cinematic.',
    resolution: '1080p',
    aspect: '16:9',
    duration: 5,
    outputUrl: asset('templates/motion-study/preview.mp4'),
    outputKind: 'video',
    status: 'done',
  });
  const out = node(`${p}-out`, 'output', 920, 300, { title: 'Loop master' });
  return {
    nodes: [prompt, key, motion, out],
    edges: [
      makeEdge(prompt.id, key.id),
      makeEdge(prompt.id, motion.id),
      makeEdge(key.id, motion.id),
      makeEdge(motion.id, out.id),
    ],
  };
}

function buildCharacterLoop() {
  const p = Math.random().toString(36).slice(2, 7);
  const ref = node(`${p}-ref`, 'reference', 20, 170, {
    title: 'Character anchor',
    label: 'MIRA / FRONT',
  });
  const prompt = node(`${p}-prompt`, 'prompt', 20, 440, {
    title: 'Performance',
    prompt:
      'Mira steps out of a doorway, pauses, and looks back over her shoulder. Sodium light, wet pavement, quiet confidence.',
  });
  const image = node(`${p}-img`, 'model', 320, 190, {
    title: 'SD-Turbo',
    model: 'sd-turbo',
    prompt: 'Mira in a doorway, sodium light, cinematic still, 35mm grain.',
    aspect: '9:16',
  });
  const video = node(`${p}-vid`, 'model', 620, 190, {
    title: 'LTX-2.5',
    model: 'ltx-2.5',
    prompt:
      'Night, rain on wet asphalt. She stands against a black sports car under neon light, then looks to camera. Slow push-in, shallow depth of field, film grain.',
    resolution: '1080p',
    aspect: '16:9',
    duration: 6,
    outputUrl: asset('templates/character-loop/preview.mp4'),
    outputKind: 'video',
    status: 'done',
  });
  const out = node(`${p}-out`, 'output', 920, 270, { title: 'Scene 04' });
  return {
    nodes: [ref, prompt, image, video, out],
    edges: [
      makeEdge(ref.id, image.id),
      makeEdge(prompt.id, image.id),
      makeEdge(image.id, video.id),
      makeEdge(video.id, out.id),
    ],
  };
}


function buildObjectsSwap() {
  const p = Math.random().toString(36).slice(2, 7);
  const actor = node(`${p}-actor`, 'reference', 20, 80, {
    title: 'Actor',
    label: 'ACTOR',
    previewUrl: asset('templates/objects-swap/actor.jpg'),
    mediaKind: 'image',
  });
  const car = node(`${p}-car`, 'reference', 20, 360, {
    title: 'Car',
    label: 'CAR',
    previewUrl: asset('templates/objects-swap/car.jpg'),
    mediaKind: 'image',
  });
  const source = node(`${p}-source`, 'reference', 20, 640, {
    title: 'Scene',
    label: 'SCENE',
    previewUrl: asset('templates/objects-swap/scene.jpg'),
    mediaKind: 'image',
  });
  const swap = node(`${p}-swap`, 'model', 420, 260, {
    title: 'LTX-2.5',
    model: 'ltx-2.5',
    prompt:
      'Music video, night. @Actor leans against the hood of @Car on a rain-soaked neon street, matching the mood of @Scene, wind lifting her hair in slow motion. Headlights flare through the rain, anamorphic lens flares, teal and magenta neon reflections. The camera orbits slowly around her.',
    resolution: '1080p',
    aspect: '16:9',
    duration: 6,
    outputUrl: asset('templates/objects-swap/generation.mp4'),
    outputKind: 'video',
    status: 'done',
  });
  const out = node(`${p}-out`, 'output', 860, 360, { title: 'Music Video' });
  return {
    nodes: [actor, car, source, swap, out],
    edges: [
      makeEdge(actor.id, swap.id),
      makeEdge(car.id, swap.id),
      makeEdge(source.id, swap.id),
      makeEdge(swap.id, out.id),
    ],
  };
}


function buildMarketingStudio() {
  const p = Math.random().toString(36).slice(2, 7);
  const reference = node(`${p}-reference`, 'reference', 20, 80, {
    title: 'Scene reference',
    label: 'REFERENCE',
    previewUrl: asset('templates/marketing-studio/reference.jpg'),
    mediaKind: 'image',
  });
  const product = node(`${p}-product`, 'reference', 20, 360, {
    title: 'Product',
    label: 'PRODUCT',
    previewUrl: asset('templates/marketing-studio/product.jpg'),
    mediaKind: 'image',
  });
  const avatar = node(`${p}-avatar`, 'reference', 20, 640, {
    title: 'Avatar',
    label: 'AVATAR',
    previewUrl: asset('templates/marketing-studio/avatar.jpg'),
    mediaKind: 'image',
  });
  const image = node(`${p}-image`, 'model', 420, 260, {
    title: 'Seedream 5.0 Pro',
    model: 'seedream-5.0-pro',
    prompt:
      'Place the woman from @Avatar in the street scene from @Reference, holding the silver soda can from @Product up toward the camera with a bright smile. Keep her white oval sunglasses and green jacket, the can\'s orange and purple colour-block design and the scene\'s pastel colours and golden light. Editorial lifestyle advertising photograph.',
    resolution: '2k',
    aspect: '3:4',
    outputUrl: asset('templates/marketing-studio/output.jpg'),
    outputKind: 'image',
    status: 'done',
  });
  const out = node(`${p}-out`, 'output', 860, 360, { title: 'Image Output' });
  return {
    nodes: [reference, product, avatar, image, out],
    edges: [
      makeEdge(reference.id, image.id),
      makeEdge(product.id, image.id),
      makeEdge(avatar.id, image.id),
      makeEdge(image.id, out.id),
    ],
  };
}


function buildRecreate() {
  const p = Math.random().toString(36).slice(2, 7);
  const source = node(`${p}-source`, 'reference', 20, 80, {
    title: 'Source clip',
    label: 'SOURCE',
    previewUrl: asset('templates/recreate/source.mp4'),
    mediaKind: 'video',
  });
  const product = node(`${p}-product`, 'reference', 20, 360, {
    title: 'Product',
    label: 'PRODUCT',
    previewUrl: asset('templates/recreate/product.jpg'),
    mediaKind: 'image',
  });
  const avatar = node(`${p}-avatar`, 'reference', 20, 640, {
    title: 'Avatar',
    label: 'AVATAR',
    previewUrl: asset('templates/recreate/avatar.jpg'),
    mediaKind: 'image',
  });
  const video = node(`${p}-video`, 'model', 420, 260, {
    title: 'LTX-2.5',
    model: 'ltx-2.5',
    prompt:
      'Recreate the product film from @Source as a new take: @Avatar, in a blue shirt and a cap, cracks open the aluminium soda can from @Product. A controlled slow-motion ring of orange fizz, ice crystals and citrus slices lifts gently around the can and orbits past his head, never covering his face. Keep the camera move and pacing of @Source. Bright pop-art studio, saturated candy colours.',
    resolution: '1080p',
    aspect: '16:9',
    duration: 6,
    outputUrl: asset('templates/recreate/preview.mp4'),
    outputKind: 'video',
    status: 'done',
  });
  const out = node(`${p}-out`, 'output', 860, 360, { title: 'Video Output' });
  return {
    nodes: [source, product, avatar, video, out],
    edges: [
      makeEdge(source.id, video.id),
      makeEdge(product.id, video.id),
      makeEdge(avatar.id, video.id),
      makeEdge(video.id, out.id),
    ],
  };
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'product-film',
    name: 'Product film',
    description: 'Still → motion → delivery. A four-node launch pipeline.',
    tag: 'Commerce',
    accent: '#ff7a3d',
    previewSeed: 'product film can',
    previewUrl: asset('templates/product-film/preview.mp4'),
    previewKind: 'video',
    previewPoster: asset('templates/product-film/poster.jpg'),
    nodeCount: 4,
    build: buildProductFilm,
  },
  {
    id: 'motion-study',
    name: 'Motion study',
    description: 'Key art and motion generated in parallel from one brief.',
    tag: 'Motion',
    accent: '#8bd3ff',
    previewSeed: 'ribbon of light',
    previewUrl: asset('templates/motion-study/preview.mp4'),
    previewKind: 'video',
    previewPoster: asset('templates/motion-study/poster.jpg'),
    nodeCount: 4,
    build: buildMotionStudy,
  },
  {
    id: 'character-loop',
    name: 'Character loop',
    description: 'Hold a face and wardrobe consistent across a scene.',
    tag: 'Character',
    accent: '#ffb27a',
    previewSeed: 'mira doorway sodium',
    previewUrl: asset('templates/character-loop/preview.mp4'),
    previewKind: 'video',
    previewPoster: asset('templates/character-loop/poster.jpg'),
    nodeCount: 5,
    build: buildCharacterLoop,
  },
  {
    id: 'objects-swap',
    name: 'Music Video',
    description: 'Frame an actor, a car and a scene, then direct the shot as a music video with LTX-2.5.',
    tag: 'References',
    accent: '#ff9bb5',
    previewSeed: 'objects swap actor car',
    previewUrl: asset('templates/objects-swap/preview.mp4'),
    previewKind: 'video',
    previewPoster: asset('templates/objects-swap/preview.jpg'),
    nodeCount: 5,
    build: buildObjectsSwap,
  },
  {
    id: 'marketing-studio',
    name: 'Marketing Studio',
    description: 'Compose a product and a talent into a reference scene with Seedream 5.0 Pro.',
    tag: 'Marketing',
    accent: '#8bd3ff',
    previewSeed: 'marketing studio product talent',
    previewUrl: asset('templates/marketing-studio/output.jpg'),
    previewKind: 'image',
    nodeCount: 5,
    build: buildMarketingStudio,
  },
  {
    id: 'recreate',
    name: 'Recreate',
    description: 'Start from a product film, a product shot and an avatar, and direct a new take with LTX-2.5.',
    tag: 'Video',
    accent: '#ff8aa5',
    previewSeed: 'recreate source clip avatar product',
    previewUrl: asset('templates/recreate/preview.mp4'),
    previewKind: 'video',
    previewPoster: asset('templates/recreate/poster.jpg'),
    nodeCount: 5,
    build: buildRecreate,
  },
];
