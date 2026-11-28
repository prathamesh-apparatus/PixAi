'use strict';
const { BaseAdapter, AdapterError, mapHttpError, fetchWithTimeout } = require('./base-adapter');

/**
 * Pollinations (gen.pollinations.ai) image adapter.
 * Endpoint: GET {base}/image/{url-encoded prompt}?model=flux&width&height&seed
 * with the account key as a Bearer token. The response IS the image bytes
 * (content-type image/jpeg|png|webp), not JSON.
 * Workbook vendor ids are full model paths (e.g. black-forest-labs/flux.1-schnell);
 * the gateway takes short model names (flux, turbo, gptimage, kontext, ...).
 */
function modelParam(vendorModelId) {
  const v = String(vendorModelId || '').toLowerCase();
  if (v.includes('gptimage') || v.includes('gpt-image')) return 'gptimage';
  if (v.includes('kontext')) return 'kontext';
  if (v.includes('seedream')) return 'seedream';
  if (v.includes('nanobanana') || v.includes('nano-banana')) return 'nanobanana';
  if (v.includes('zimage')) return 'zimage';
  if (v.includes('turbo')) return 'turbo';
  return 'flux'; // flux / flux.1-schnell / any FLUX variant
}

class PollinationsAdapter extends BaseAdapter {
  constructor() { super(); this.id = 'pollinations'; this.displayName = 'Pollinations'; }

  capabilities() {
    return [
      { key: 'aspectRatio', label: 'Aspect ratio', type: 'select', options: ['1:1', '16:9', '9:16', '4:3', '3:4'], default: '1:1' },
      { key: 'seed', label: 'Seed (optional)', type: 'number', min: 0, max: 999999999, default: '' },
    ];
  }
  supportsNegativePrompt() { return true; }

  sizeFor(aspect) {
    return { '1:1': [1024, 1024], '16:9': [1344, 768], '9:16': [768, 1344], '4:3': [1152, 896], '3:4': [896, 1152] }[aspect] || [1024, 1024];
  }

  async generate({ provider, model, apiKey, prompt, negativePrompt = '', settings = {}, fetchImpl = fetch, signal, timeoutMs }) {
    const base = (provider.baseUrl || 'https://gen.pollinations.ai').replace(/\/+$/, '');
    const [width, height] = this.sizeFor(settings.aspectRatio);
    const params = new URLSearchParams({ model: modelParam(model.vendorModelId), width: String(width), height: String(height) });
    if (settings.seed !== '' && settings.seed != null) params.set('seed', String(Number(settings.seed)));
    if (negativePrompt) params.set('negative_prompt', negativePrompt);
    const url = `${base}/image/${encodeURIComponent(prompt)}?${params.toString()}`;
    const headers = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const res = await fetchWithTimeout(fetchImpl, url, { method: 'GET', headers }, timeoutMs, signal);
    const ctype = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
    if (!res.ok) throw mapHttpError(res.status, await res.text());
    if (/json/i.test(ctype)) {
      const t = await res.text();
      throw new AdapterError('Pollinations returned a message instead of an image.', { code: 'BAD_RESPONSE', diagnostic: t.slice(0, 200) });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new AdapterError('Pollinations returned an empty image.', { code: 'BAD_RESPONSE' });
    const format = /png/i.test(ctype) ? 'png' : /webp/i.test(ctype) ? 'webp' : 'jpg';
    return [{ buffer: buf, format }];
  }

  async testConnection({ provider, apiKey, fetchImpl = fetch }) {
    const base = (provider.baseUrl || 'https://gen.pollinations.ai').replace(/\/+$/, '');
    try {
      const headers = {};
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      const res = await fetchWithTimeout(fetchImpl, `${base}/image/models`, { headers }, 20000);
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'Authentication failed — the Pollinations API key was rejected.' };
      if (res.ok) return { ok: true, message: 'Pollinations reachable. Use Test model for a real generation check.' };
      return { ok: false, message: `Pollinations answered HTTP ${res.status}.` };
    } catch (e) { return { ok: false, message: e.message }; }
  }
}
module.exports = { PollinationsAdapter, modelParam };
