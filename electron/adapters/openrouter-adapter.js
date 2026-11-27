'use strict';
const { BaseAdapter, AdapterError, mapHttpError, fetchWithTimeout } = require('./base-adapter');

/**
 * OpenRouter adapter (image models).
 * Endpoint: POST https://openrouter.ai/api/v1/chat/completions with
 * modalities:["image","text"]; image results arrive in
 * choices[0].message.images[].image_url.url (usually a data: URL).
 * Text-only chat responses are treated as an error — never as an image.
 */
class OpenRouterAdapter extends BaseAdapter {
  constructor() { super(); this.id = 'openrouter'; this.displayName = 'OpenRouter'; }

  capabilities() {
    return [
      { key: 'aspectRatio', label: 'Aspect ratio', type: 'select', options: ['1:1', '16:9', '9:16', '4:3', '3:4'], default: '1:1' },
      { key: 'seed', label: 'Seed (optional)', type: 'number', min: 0, max: 999999999, default: '' },
    ];
  }
  supportsNegativePrompt() { return false; }

  endpoint(provider) {
    const base = (provider.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
    return `${base}/chat/completions`;
  }

  async generate({ provider, model, apiKey, prompt, settings = {}, fetchImpl = fetch, signal, timeoutMs }) {
    if (!apiKey) throw new AdapterError('No API key saved for this provider. Import a workbook with the key or add it in Provider Settings.', { code: 'AUTH_FAILED' });
    const body = {
      model: model.vendorModelId,
      modalities: ['image', 'text'],
      messages: [{ role: 'user', content: prompt }],
      image_config: { aspect_ratio: settings.aspectRatio || '1:1' },
    };
    if (settings.seed !== '' && settings.seed != null) body.seed = Number(settings.seed);
    const res = await fetchWithTimeout(fetchImpl, this.endpoint(provider), {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'PixAi AI Creative Studio' },
      body: JSON.stringify(body),
    }, timeoutMs, signal);
    if (!res.ok) throw mapHttpError(res.status, await res.text());
    const j = await res.json();
    const msg = j.choices && j.choices[0] && j.choices[0].message;
    const images = (msg && msg.images) || [];
    if (!images.length) {
      throw new AdapterError('OpenRouter returned no image for this model. The model may be text-only or does not support image output via chat completions.', { code: 'BAD_RESPONSE', diagnostic: JSON.stringify(j).slice(0, 200) });
    }
    const out = [];
    for (const im of images) {
      const url = (im.image_url && im.image_url.url) || im.url || '';
      const m = url.match(/^data:image\/(\w+);base64,(.+)$/);
      if (m) out.push({ buffer: Buffer.from(m[2], 'base64'), format: m[1] === 'jpeg' ? 'jpg' : m[1] });
      else if (url.startsWith('http')) out.push({ remoteUrl: url, format: 'png' });
    }
    if (!out.length) throw new AdapterError('OpenRouter image payload could not be decoded.', { code: 'BAD_RESPONSE' });
    return out;
  }

  async testConnection({ provider, apiKey, fetchImpl = fetch }) {
    if (!apiKey) return { ok: false, message: 'No API key saved for this provider.' };
    try {
      const base = (provider.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
      const res = await fetchWithTimeout(fetchImpl, `${base}/auth/key`, { headers: { Authorization: `Bearer ${apiKey}` } }, 20000);
      if (res.ok) return { ok: true, message: 'API key verified with OpenRouter.' };
      const err = mapHttpError(res.status, await res.text());
      return { ok: false, message: err.message };
    } catch (e) { return { ok: false, message: e.message }; }
  }
}
module.exports = { OpenRouterAdapter };
