'use strict';
const { BaseAdapter, AdapterError, mapHttpError, fetchWithTimeout } = require('./base-adapter');

/**
 * NVIDIA NIM / build.nvidia.com image adapter (ai.api.nvidia.com).
 * Each model has its own endpoint under /v1/genai/{vendorModelId}; the
 * workbook Base URL points at one model's endpoint, so the adapter swaps the
 * trailing vendor-model segment for the selected model.
 * Request:  { prompt, width, height, seed? }
 * Response: { artifacts: [{ base64 }] } (some models return { image } / b64_json).
 */
class NvidiaAdapter extends BaseAdapter {
  constructor() { super(); this.id = 'nvidia'; this.displayName = 'NVIDIA NIM'; }

  capabilities() {
    return [
      { key: 'aspectRatio', label: 'Aspect ratio', type: 'select', options: ['1:1', '16:9', '9:16', '4:3', '3:4'], default: '1:1' },
      { key: 'seed', label: 'Seed (optional)', type: 'number', min: 0, max: 999999999, default: '' },
    ];
  }
  supportsNegativePrompt() { return false; }

  buildUrl(provider, model) {
    const base = (provider.baseUrl || '').replace(/\/+$/, '');
    if (!base) throw new AdapterError('This NVIDIA provider has no Base URL in the workbook — re-import with the URL filled in.', { code: 'CONFIG_MISSING' });
    if (base.endsWith(model.vendorModelId)) return base;
    const marker = '/genai/';
    const idx = base.indexOf(marker);
    if (idx >= 0) return `${base.slice(0, idx + marker.length)}${model.vendorModelId}`;
    // The workbook may carry the account's general API root instead of a
    // per-model endpoint (the new sheet uses https://integrate.api.nvidia.com/v1,
    // which is NVIDIA's chat-completions base). The hosted image endpoint each
    // FLUX model actually requires lives on ai.api.nvidia.com under
    // /v1/genai/{vendorModelId} — build it from the model id.
    return `https://ai.api.nvidia.com/v1/genai/${model.vendorModelId}`;
  }

  sizeFor(aspect) {
    return { '1:1': [1024, 1024], '16:9': [1344, 768], '9:16': [768, 1344], '4:3': [1152, 896], '3:4': [896, 1152] }[aspect] || [1024, 1024];
  }

  async generate({ provider, model, apiKey, prompt, settings = {}, fetchImpl = fetch, signal, timeoutMs }) {
    if (!apiKey) throw new AdapterError('No API key saved for this provider. Re-run the import command with a workbook that contains the key, or add it in Provider Settings.', { code: 'AUTH_FAILED' });
    const url = this.buildUrl(provider, model);
    const [width, height] = this.sizeFor(settings.aspectRatio);
    const body = { prompt, width, height };
    if (settings.seed !== '' && settings.seed != null) body.seed = Number(settings.seed);
    const res = await fetchWithTimeout(fetchImpl, url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    }, timeoutMs, signal);
    if (!res.ok) throw mapHttpError(res.status, await res.text());
    const j = await res.json();
    const b64 = (j.artifacts && j.artifacts[0] && (j.artifacts[0].base64 || j.artifacts[0].b64_json)) ||
      j.image || j.b64_json || (j.data && j.data[0] && j.data[0].b64_json) || null;
    const remote = (j.data && j.data[0] && j.data[0].url) || null;
    if (b64) return [{ buffer: Buffer.from(b64, 'base64'), format: 'png' }];
    if (remote) return [{ remoteUrl: remote, format: 'png' }];
    throw new AdapterError('NVIDIA returned a response without image data — the model response format is not supported yet.', { code: 'BAD_RESPONSE', diagnostic: JSON.stringify(j).slice(0, 200) });
  }

  async testConnection({ provider, apiKey, fetchImpl = fetch }) {
    if (!apiKey) return { ok: false, message: 'No API key saved for this provider.' };
    try {
      const res = await fetchWithTimeout(fetchImpl, 'https://ai.api.nvidia.com/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } }, 20000);
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'Authentication failed — the NVIDIA API key was rejected.' };
      return { ok: true, message: 'NVIDIA endpoint reachable. Use Test model for a real generation check.' };
    } catch (e) { return { ok: false, message: e.message }; }
  }
}
module.exports = { NvidiaAdapter };
