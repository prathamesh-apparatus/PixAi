'use strict';
const { BaseAdapter, AdapterError, mapHttpError, fetchWithTimeout } = require('./base-adapter');

/**
 * Generic OpenAI-compatible Images adapter.
 * Endpoint: POST {baseUrl}/images/generations
 * Body: { model, prompt, n, size, response_format: 'b64_json' }
 * Covers any provider whose workbook adapter column says OpenAI / OpenAI-compatible
 * and whose API follows the OpenAI Images contract.
 */
class OpenAICompatibleAdapter extends BaseAdapter {
  constructor() { super(); this.id = 'openai-compatible'; this.displayName = 'OpenAI-compatible Images API'; }

  capabilities() {
    return [
      { key: 'size', label: 'Size', type: 'select', options: ['1024x1024', '1792x1024', '1024x1792', '1536x1024', '1024x1536'], default: '1024x1024' },
      { key: 'count', label: 'Number of images', type: 'number', min: 1, max: 4, default: 1 },
      { key: 'quality', label: 'Quality', type: 'select', options: ['standard', 'hd'], default: 'standard' },
    ];
  }
  supportsNegativePrompt() { return false; }

  async generate({ provider, model, apiKey, prompt, settings = {}, fetchImpl = fetch, signal, timeoutMs }) {
    if (!apiKey) throw new AdapterError('No API key saved for this provider. Import a workbook with the key or add it in Provider Settings.', { code: 'AUTH_FAILED' });
    const base = (provider.baseUrl || '').replace(/\/+$/, '');
    if (!base) throw new AdapterError('This provider has no Base URL in the workbook — re-import with the URL filled in.', { code: 'CONFIG_MISSING' });
    const url = base.endsWith('/images/generations') ? base : `${base}/images/generations`;
    const body = {
      model: model.vendorModelId,
      prompt,
      n: Math.min(4, Math.max(1, Number(settings.count) || 1)),
      size: settings.size || '1024x1024',
      response_format: 'b64_json',
    };
    if (settings.quality) body.quality = settings.quality;
    const res = await fetchWithTimeout(fetchImpl, url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, timeoutMs, signal);
    if (!res.ok) throw mapHttpError(res.status, await res.text());
    const j = await res.json();
    const items = j.data || [];
    if (!items.length) throw new AdapterError('The provider returned no image data.', { code: 'BAD_RESPONSE', diagnostic: JSON.stringify(j).slice(0, 200) });
    const out = [];
    for (const it of items) {
      if (it.b64_json) out.push({ buffer: Buffer.from(it.b64_json, 'base64'), format: 'png' });
      else if (it.url) out.push({ remoteUrl: it.url, format: 'png' });
    }
    if (!out.length) throw new AdapterError('The provider response contained no usable image.', { code: 'BAD_RESPONSE' });
    return out;
  }

  async testConnection({ provider, apiKey, fetchImpl = fetch }) {
    if (!apiKey) return { ok: false, message: 'No API key saved for this provider.' };
    try {
      const base = (provider.baseUrl || '').replace(/\/+$/, '');
      const res = await fetchWithTimeout(fetchImpl, `${base}/models`, { headers: { Authorization: `Bearer ${apiKey}` } }, 20000);
      if (res.ok) return { ok: true, message: 'Provider reachable and API key accepted.' };
      const err = mapHttpError(res.status, await res.text());
      return { ok: false, message: err.message };
    } catch (e) { return { ok: false, message: e.message }; }
  }
}
module.exports = { OpenAICompatibleAdapter };
