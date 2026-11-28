// Prompt compiler v13 — the last step before a prompt reaches a model.
// Design rule learned the hard way: the USER'S words are the spec. The
// compiler never invents style, never reorders the user's core prompt and
// never lets a mode recipe outrank it. It only:
//   1. Locks quoted text for poster/text work — models that render text
//      get an explicit "exact readable text" instruction (SDXL excluded:
//      meta-instructions make its text worse, and the router already
//      ranks SDXL last for poster-text via its quality prior).
//   2. Supplies a negative prompt for the dialects that accept one.

export function extractQuotedText(prompt) {
  const out = [];
  const re = /"([^"]{2,})"|“([^”]{2,})”/g;
  let m;
  while ((m = re.exec(String(prompt || ''))) !== null) out.push(m[1] || m[2]);
  return out;
}

export function dialectFor(candidate) {
  const v = String((candidate && candidate.vendorModelId) || '');
  if (/stable-diffusion|sdxl/i.test(v)) return 'sdxl';
  if ((candidate && candidate.adapter) === 'pollinations' || (candidate && candidate.providerId) === 'pollinations') return 'pollinations';
  return 'generic';
}

/**
 * compilePrompt({ prompt, category, candidate })
 *   -> { prompt, negativePrompt }
 */
export function compilePrompt({ prompt, category = 'general', candidate = {} }) {
  let out = String(prompt || '').trim();
  const dialect = dialectFor(candidate);
  if (category === 'poster-text' && dialect !== 'sdxl' && !/exact text/i.test(out)) {
    const quoted = extractQuotedText(out);
    if (quoted.length) {
      out += `, with the exact readable text ${quoted.map((q) => `"${q}"`).join(' and ')}, clean typography, sharp legible lettering`;
    }
  }
  if (dialect === 'sdxl') {
    return { prompt: out, negativePrompt: 'blurry, low quality, deformed, distorted, watermark, garbled text, oversaturated' };
  }
  if (dialect === 'pollinations') {
    return { prompt: out, negativePrompt: 'blurry, low quality, watermark, deformed' };
  }
  return { prompt: out, negativePrompt: '' };
}
