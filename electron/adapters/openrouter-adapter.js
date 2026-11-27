'use strict';
const { BaseAdapter, AdapterError, mapHttpError, fetchWithTimeout } = require('./base-adapter');

/**
 * OpenRouter adapter — uses the OpenRouter Images API.
 * The workbook Base URL for OpenRouter is https://openrouter.ai/api/v1/images,
 * so generation posts to {baseUrl}/generations with an OpenAI-style body
 * { model, prompt, size, n } and reads data[].b64_json / data[].url.
 * (A generic OpenAI adapter appending /images/generations to that base URL
 * produced ".../images/images/generations" and the "404 Model not found"
 * error seen in the app — this adapter normalises the endpoint instead.)
 * A chat-completions style image payload is also decoded if one is returned.
 */
class OpenRouterAdapter extends BaseAdapter {
  constructor() { super(); this.id = 'openrouter'; this.displayName = 'OpenRouter'; }

  capabilities() {
    return [
      { key: 'size', label: 'Size', type: 'select', options: ['1024x1024', '1024x1792', '1792x1024', '1536x1024', '1024x1536'], default: '1024x1024' },
      { key: 'count', label: 'Number of images', type: 'number', min: 1, max: 4, default: 1 },
    ];
  }
  supportsNegativePrompt() { return false; }

  endpoint(provider) {
    const base = (provider.baseUrl || 'https://openrouter.ai/api/v1/images').replace(/\/+$/, '');
    if (base.endsWith('/images/generations')) return base;
    if (base.endsWith('/images')) return `${base}/generations`;
    if (base.endsWith('/v1')) return `${base}/images/generations`;
    return `${base}/images/generations`;
  }
  apiRoot(provider) {
    return this.endpoint(provider).replace(/\/images\/generations$/, '');
  }

  async generate({ provider, model, apiKey, prompt, settings = {}, fetchImpl = fetch, signal, timeoutMs }) {
    if (!apiKey) throw new AdapterError('No API key saved for this provider. Re-run the import command with a workbook that contains the key, or add it in Provider Settings.', { code: 'AUTH_FAILED' });
    const body = {
      model: model.vendorModelId,
      prompt,
      size: settings.size || '1024x1024',
      n: Math.min(4, Math.max(1, Number(settings.count) || 1)),
    };
    const res = await fetchWithTimeout(fetchImpl, this.endpoint(provider), {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'PixAi AI Creative Studio' },
      body: JSON.stringify(body),
    }, timeoutMs, signal);
    if (!res.ok) throw mapHttpError(res.status, await res.text());
    const j = await res.json();
    const out = [];
    for (const it of j.data || []) {
      if (it.b64_json) out.push({ buffer: Buffer.from(it.b64_json, 'base64'), format: 'png' });
      else if (it.url) out.push({ remoteUrl: it.url, format: 'png' });
    }
    if (!out.length) {
      // Defensive: some OpenRouter image models answer in chat-completions shape.
      const msg = j.choices && j.choices[0] && j.choices[0].message;
      for (const im of (msg && msg.images) || []) {
        const url = (im.image_url && im.image_url.url) || im.url || '';
        const m = url.match(/^data:image\/(\w+);base64,(.+)$/);
        if (m) out.push({ buffer: Buffer.from(m[2], 'base64'), format: m[1] === 'jpeg' ? 'jpg' : m[1] });
        else if (url.startsWith('http')) out.push({ remoteUrl: url, format: 'png' });
      }
    }
    if (!out.length) {
      throw new AdapterError('OpenRouter returned no image data for this model. The model may be unavailable on the Images API right now — try Test model again or check the model status in the workbook.', { code: 'BAD_RESPONSE', diagnostic: JSON.stringify(j).slice(0, 200) });
    }
    return out;
  }

  async testConnection({ provider, apiKey, fetchImpl = fetch }) {
    if (!apiKey) return { ok: false, message: 'No API key saved for this provider.' };
    try {
      const res = await fetchWithTimeout(fetchImpl, `${this.apiRoot(provider)}/auth/key`, { headers: { Authorization: `Bearer ${apiKey}` } }, 20000);
      if (res.ok) return { ok: true, message: 'API key verified with OpenRouter.' };
      const err = mapHttpError(res.status, await res.text());
      return { ok: false, message: err.message };
    } catch (e) { return { ok: false, message: e.message }; }
  }
}
module.exports = { OpenRouterAdapter };
