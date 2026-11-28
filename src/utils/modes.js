// Creation modes (Magnific-style), built as smart prompt-craft: every image
// model in the workbook is text-to-image, so each mode shapes the prompt
// (and, for Edit / reference images, first runs it through a vision model).
// The transforms are pure so they can be unit-tested.

export const ASPECTS = [
  { id: 'Auto', label: 'Auto' },
  { id: '1:1', label: '1:1 Square' },
  { id: '16:9', label: '16:9 Widescreen' },
  { id: '9:16', label: '9:16 Social story' },
  { id: '4:5', label: '4:5 Social post' },
  { id: '3:4', label: '3:4 Portrait' },
  { id: '4:3', label: '4:3 Classic' },
  { id: '3:2', label: '3:2 Standard' },
  { id: '2:3', label: '2:3 Portrait' },
  { id: '21:9', label: '21:9 Ultrawide' },
];

export function sizeForAspect(aspect) {
  return {
    '16:9': '1536x1024', '21:9': '1536x1024',
    '9:16': '1024x1536', '3:4': '1024x1536', '4:5': '1024x1536', '2:3': '1024x1536',
    '3:2': '1536x1024', '4:3': '1536x1024',
    '1:1': '1024x1024',
  }[aspect] || '1024x1024';
}

export const MODES = [
  { id: 'generate', label: 'Generate', hint: 'Plain text-to-image generation.' },
  { id: 'edit', label: 'Edit', needsRef: true, hint: 'Attach a reference image and describe the change — the edited result is generated fresh from a vision-written prompt.' },
  { id: 'upscale', label: 'Upscale', hint: 'Maximum detail and sharpness wording, generated at the largest size.' },
  { id: 'skin', label: 'Skin', hint: 'Portrait skin enhancement — natural, flawless skin texture and beauty lighting.' },
  { id: 'variation', label: 'Variation', hint: 'A fresh take on the same prompt — new random result every time.' },
  {
    id: 'background', label: 'Background', usesBackgroundText: true,
    hint: 'Describe the background separately; it is composed into the prompt.',
  },
  {
    id: 'cinematic', label: 'Cinematic',
    options: [
      { id: 'film', label: 'Film still', suffix: 'cinematic film still, anamorphic lens, dramatic cinematic lighting, film grain, moody colour grade' },
      { id: 'noir', label: 'Noir', suffix: 'film noir style, high-contrast black and white, dramatic shadows, moody atmosphere' },
      { id: 'epic', label: 'Epic', suffix: 'epic cinematic composition, sweeping scale, volumetric light, blockbuster movie look' },
      { id: 'vintage', label: 'Vintage film', suffix: 'vintage 35mm film look, warm faded colours, soft grain, nostalgic mood' },
    ],
  },
  {
    id: 'angle', label: 'Angle',
    options: [
      { id: 'low', label: 'Low angle', suffix: 'shot from a dramatic low angle, looking up at the subject' },
      { id: 'top', label: 'Top view', suffix: 'top-down aerial view, seen directly from above' },
      { id: 'closeup', label: 'Close-up', suffix: 'extreme close-up shot, fine details in sharp focus' },
      { id: 'wide', label: 'Wide shot', suffix: 'wide establishing shot, full scene in frame' },
      { id: 'dutch', label: 'Dutch angle', suffix: 'dutch angle, tilted camera, dynamic diagonal composition' },
      { id: 'ots', label: 'Over-the-shoulder', suffix: 'over-the-shoulder shot, subject seen past a foreground shoulder' },
    ],
  },
  {
    id: 'relight', label: 'Relight',
    options: [
      { id: 'golden', label: 'Golden hour', suffix: 'warm golden-hour sunlight, long soft shadows, glowing rim light' },
      { id: 'neon', label: 'Neon night', suffix: 'neon-lit night scene, colourful reflections, cyberpunk glow' },
      { id: 'studio', label: 'Soft studio', suffix: 'soft studio lighting, diffused key light, clean professional look' },
      { id: 'moonlight', label: 'Moonlight', suffix: 'cool blue moonlight, silvery highlights, quiet night mood' },
      { id: 'spotlight', label: 'Spotlight', suffix: 'dramatic spotlight from above, dark background, theatrical contrast' },
    ],
  },
  {
    id: 'mockup', label: 'Mockup',
    options: [
      { id: 'phone', label: 'Phone in hand', suffix: 'shown on a smartphone screen held in a hand, realistic product mockup photo' },
      { id: 'billboard', label: 'Billboard', suffix: 'displayed on a large city billboard, realistic outdoor advertising mockup' },
      { id: 'tshirt', label: 'T-shirt', suffix: 'printed on a t-shirt worn by a model, realistic apparel mockup' },
      { id: 'laptop', label: 'Laptop screen', suffix: 'shown on a laptop screen on a clean desk, realistic workspace mockup photo' },
      { id: 'packaging', label: 'Packaging', suffix: 'as a premium product packaging design, studio product photography' },
    ],
  },
];

export function getMode(id) {
  return MODES.find((m) => m.id === id) || MODES[0];
}

function appendSuffix(prompt, suffix) {
  const p = String(prompt || '').trim().replace(/[.\s]+$/, '');
  return suffix ? `${p}, ${suffix}` : p;
}

/**
 * Apply a mode to a (possibly vision-enhanced) prompt.
 * ctx: { optionId, backgroundText }
 * Returns { prompt, forceLargeSize }
 */
export function applyMode(modeId, prompt, ctx = {}) {
  const mode = getMode(modeId);
  switch (mode.id) {
    case 'upscale':
      return { prompt: appendSuffix(prompt, 'ultra detailed, 8k uhd, extremely sharp focus, intricate fine details, high resolution'), forceLargeSize: true };
    case 'skin':
      return { prompt: appendSuffix(prompt, 'flawless natural skin texture, smooth clear skin, professional beauty retouch, soft studio lighting, high-end portrait photography'), forceLargeSize: false };
    case 'background': {
      const bg = String(ctx.backgroundText || '').trim();
      return { prompt: bg ? appendSuffix(prompt, `background: ${bg}, clean seamless backdrop, subject clearly in front`) : String(prompt || ''), forceLargeSize: false };
    }
    case 'cinematic':
    case 'angle':
    case 'relight':
    case 'mockup': {
      const opt = (mode.options || []).find((o) => o.id === ctx.optionId) || (mode.options || [])[0];
      return { prompt: opt ? appendSuffix(prompt, opt.suffix) : String(prompt || ''), forceLargeSize: false };
    }
    default: // generate, edit, variation — prompt unchanged
      return { prompt: String(prompt || ''), forceLargeSize: false };
  }
}
