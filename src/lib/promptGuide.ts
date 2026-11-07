import type { ModelId } from '../types';

export interface PromptTips {
  /** one line: what this model is good at */
  bestFor: string;
  /** the few rules that matter most, shortest first */
  rules: string[];
  /** a prompt that follows the rules */
  example: string;
  /** common mistakes */
  avoid: string[];
}

/** Quick prompt rules for each model, shown in the Prompt guide drawer. Keep every entry short enough to read in a minute. */
export const PROMPT_TIPS: Partial<Record<ModelId, PromptTips>> = {
  'sd-turbo': {
    bestFor: 'Quick sketches and ideas at 512 px.',
    rules: [
      'Keep it short: subject, style, light. 10 to 25 words.',
      'Comma-separated keywords work well.',
      'Put the most important thing first.',
      'Use it to test ideas, then render the keeper at 768 or 1k.',
    ],
    example: 'red vintage motorcycle, desert road at sunset, cinematic photo, warm light, 35mm',
    avoid: ['Long paragraphs: it ignores most of them.', 'Text or logos in the image.', 'Hands and faces in close-up.'],
  },
  'ltx-video-2b': {
    bestFor: 'Short, fast drafts. Much better from an image than from text only.',
    rules: [
      'Connect an image: it becomes the first frame and quality jumps.',
      'Write long: 3 to 6 sentences, in English, in the order things happen.',
      'Say the camera move: "static camera", "slow pan left", "dolly in".',
      'Keep clips short (2 to 4 s) and turn Fast local video off (ComfyUI panel) for real takes.',
    ],
    example:
      'A woman with short black hair stands on a rooftop at dusk, looking at the city. Wind moves her hair and coat. She slowly turns her head toward the camera and smiles. The camera stays still. Warm orange sky, city lights in the background, cinematic.',
    avoid: ['Short prompts like "a cat running".', 'Fast or complex action.', 'Long clips.'],
  },
  'wan-2.2-ti2v-5b': {
    bestFor: 'Good local video from text alone, or from an image.',
    rules: [
      'Order: subject → action → place → light → camera → style.',
      'One clear action per clip. Describe how it moves, not just what it is.',
      'Name the camera: "handheld", "aerial shot", "slow zoom in".',
      'Connect an image to use it as the first frame.',
    ],
    example:
      'A red fox trots through fresh snow in a pine forest, stops and looks up. Soft morning light, snow falling. Low tracking shot following the fox. Realistic, natural colors.',
    avoid: ['Several actions or scene changes.', 'Text in the video.'],
  },
  'pika-h3-flex': {
    bestFor: 'Video with synchronized audio. Runs from ComfyUI\'s template, not from this app yet.',
    rules: [
      'Same idea as MiniMax H3: one shot, who, action, camera, sound.',
      'Dialogue goes in quotes.',
      'Open it in ComfyUI: Template Library > Video > Pika H3 Flex.',
    ],
    example: 'A street musician plays violin under a bridge at night. Slow orbit around him. We hear the violin and distant traffic.',
    avoid: ['Several scenes in one prompt.'],
  },
  'nano-banana-pro': {
    bestFor: 'Editorial stills and precise edits.',
    rules: [
      'Write it like a brief to a photographer: subject, place, light, framing.',
      'For edits, say what changes and what stays.',
      'Text in the image goes in quotes.',
    ],
    example: 'Magazine cover photo of a chef in a white jacket holding a lemon, black background, hard side light. Title at the top: "FRESH".',
    avoid: ['Vague words like "beautiful" or "amazing".'],
  },
  'soul-2.0': {
    bestFor: 'Characters and portraits.',
    rules: [
      'Describe the person: age, hair, clothes, expression.',
      'Then the framing and light: "head and shoulders, soft studio light".',
      'Reuse the same description to keep the character consistent.',
    ],
    example: 'Portrait of a woman in her 30s with curly red hair and freckles, denim jacket, slight smile. Head and shoulders, soft window light.',
    avoid: ['Changing the description between shots of the same character.'],
  },
  'seedream-5.0-pro': {
    bestFor: 'High-resolution stills with several references.',
    rules: [
      'Full sentences: subject, action, place, light, style.',
      'Say which reference gives what: "the face from image 1, the dress from image 2".',
      'Text in the image goes in quotes.',
    ],
    example: 'The model from image 1 wearing the dress from image 2, walking on a beach at golden hour. Full body, fashion photo.',
    avoid: ['Mixing many styles in one prompt.'],
  },
  'ltx-2.3': {
    bestFor: 'Full-quality LTX video.',
    rules: [
      'Write 3 to 6 sentences in the order things happen.',
      'Describe the camera move and the light.',
      'Start from an image when you need a precise look.',
    ],
    example: 'A cyclist rides down a mountain road at sunrise. The camera follows from behind, then rises above. Long shadows, mist in the valley.',
    avoid: ['One-line prompts.', 'Cuts inside one clip.'],
  },
  'ltx-2.5': {
    bestFor: 'High-res video with sound.',
    rules: [
      'Write 3 to 6 sentences in the order things happen.',
      'Add the sound: dialogue in quotes, ambient noise, music.',
      'Say the camera move and the light.',
    ],
    example:
      'A drummer plays on a dark stage, lit by one red spotlight. The camera slowly circles him. We hear the drums and the crowd cheering.',
    avoid: ['One-line prompts.', 'Several scenes in one clip.'],
  },
  'seedance-2.0': {
    bestFor: 'Cinematic video, including multi-shot.',
    rules: [
      'Subject → action → camera → style.',
      'For more than one shot, number them: "Shot 1: … Shot 2: …".',
      'Connect an image to fix the first frame.',
    ],
    example: 'Shot 1: wide shot of a lighthouse in a storm. Shot 2: close-up of the keeper lighting the lamp. Dramatic, cinematic.',
    avoid: ['Vague action like "something happens".'],
  },
  'seedance-2.5': {
    bestFor: 'Cinematic video, including multi-shot.',
    rules: [
      'Subject → action → camera → style.',
      'For more than one shot, number them: "Shot 1: … Shot 2: …".',
      'Use @ references to keep a character or product the same.',
    ],
    example: 'Shot 1: the sneaker from @Image spins on a white table. Shot 2: someone laces it up, close-up. Clean studio light.',
    avoid: ['Too many shots in a short clip.'],
  },
};

/** Applies to every model. */
export const GENERAL_TIPS = [
  'Be specific: what you would tell a photographer or a camera operator.',
  'Change one thing at a time between runs so you know what helped.',
  'Keep the seed when you only want to tweak the prompt.',
];
