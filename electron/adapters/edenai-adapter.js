'use strict';
const { BaseAdapter, AdapterError, mapHttpError, fetchWithTimeout } = require('./base-adapter');

/**
 * Eden AI image adapter — the "universal-ai" endpoint.
 *
 * Eden has two image surfaces and they take DIFFERENT model strings:
 *  - POST /v3/images/generations (OpenAI-shaped) only accepts the models in
 *    the /v3/images/models catalog ("provider/model").
 *  - POST /v3/universal-ai (sync) takes model strings of the form
 *    "image/generation/{provider}[/{model}]" — which is exactly the format
 *    the Fabrix workbook carries (e.g.
 *    "image/generation/ovhcloud/stable-diffusion-xl-base-v10") — and answers
 *    with { image, image_resource_url } fields somewhere in the JSON.
 * The workbook model lives on universal-ai, so this adapter posts there.
 * VERIFIED LIVE 2026-11-28 with the workbook key + model string: the
 * feature inputs must be nested under an "input" object — a flat body is
 * rejected with HTTP 422 {"field":"input","message":"Field required"}.
 *   body { model, input: { text, resolution, num_images } }
 * Success answers HTTP 200:
 *   { status: "success", cost: "0E-9", provider: "ovhcloud",
 *     output: { items: [ { image: "<base64 PNG>", image_resource_url }] } }
 * The image is located by a recursive search for image_resource_url /
 * image, the same extraction Ray's own working PowerShell test performs.
 */
function findImage(value, depth = 0) {
  if (value == null || depth > 8) return null;
  if (Array.isArray(value)) {
    for (const v of value) { const hit = findImage(v, depth + 1); if (hit) return hit; }
    return null;
  }
  if (typeof value === 'object') {
    if (typeof value.image_resource_url === 'string' && /^https?:\/\//i.test(value.image_resource_url)) {
      return { remoteUrl: value.image_resource_url, format: 'png' };
    }
    if (typeof value.image === 'string' && value.image) {
      const s = value.image;
      if (s.startsWith('data:image/')) {
        return { buffer: Buffer.from(s.slice(s.indexOf(',') + 1), 'base64'), format: s.includes('image/png') ? 'png' : 'jpg' };
      }
      if (/^https?:\/\//i.test(s)) return { remoteUrl: s, format: 'png' };
      // Raw base64: accept only if it actually decodes to image magic bytes
      // (PNG / JPEG / WebP) — a length guess misfires on small images.
      if (s.length >= 40 && /^[A-Za-z0-9+/=\r\n ]+$/.test(s)) {
        const buf = Buffer.from(s, 'base64');
        const isPng = buf.length > 3 && buf[0] === 0x89 && buf[1] === 0x50;
        const isJpg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;
        const isWebp = buf.length > 11 && buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57 && buf[9] === 0x45;
        if (isPng || isJpg || isWebp) return { buffer: buf, format: isJpg ? 'jpg' : 'png' };
      }
    }
    for (const v of Object.values(value)) { const hit = findImage(v, depth + 1); if (hit) return hit; }
  }
  return null;
}

function findFailure(value, depth = 0) {
  if (value == null || depth > 8 || typeof value !== 'object') return '';
  if (value.status === 'fail' || value.status === 'failed' || value.status === 'error') {
    const msg = value.message || value.error || value.detail ||
      (value.provider_response && value.provider_response.error) || 'the provider reported a failure';
    return typeof msg === 'string' ? msg : JSON.stringify(msg).slice(0, 200);
  }
  for (const v of Object.values(value)) { const hit = findFailure(v, depth + 1); if (hit) return hit; }
  return '';
}

/**
 * The workbook's Eden Base URL is the FULL endpoint
 * ("https://api.edenai.run/v3/universal-ai"), not the API root — appending
 * "/universal-ai" again produced /v3/universal-ai/universal-ai and Eden's
 * FastAPI 404 {"detail":"Not Found"} (reproduced live 2026-11-28). Accept
 * both forms: root → append, full endpoint → use as-is.
 */
function universalAiUrl(baseUrl) {
  const base = (String(baseUrl || 'https://api.edenai.run/v3')).replace(/\/+$/, '');
  return base.endsWith('/universal-ai') ? base : `${base}/universal-ai`;
}
function apiRoot(baseUrl) {
  return (String(baseUrl || 'https://api.edenai.run/v3')).replace(/\/+$/, '').replace(/\/universal-ai$/, '');
}

class EdenAiAdapter extends BaseAdapter {
  constructor() { super(); this.id = 'edenai'; this.displayName = 'Eden AI'; }

  capabilities() {
    return [
      { key: 'aspectRatio', label: 'Aspect ratio', type: 'select', options: ['1:1', '16:9', '9:16', '4:3', '3:4'], default: '1:1' },
      { key: 'size', label: 'Size', type: 'select', options: ['1024x1024', '1792x1024', '1024x1792'], default: '1024x1024' },
    ];
  }
  supportsNegativePrompt() { return false; }

  resolutionFor(settings = {}) {
    if (settings.size && /^\d+x\d+$/.test(settings.size)) return settings.size;
    return { '1:1': '1024x1024', '16:9': '1792x1024', '9:16': '1024x1792', '4:3': '1152x896', '3:4': '896x1152' }[settings.aspectRatio] || '1024x1024';
  }

  async generate({ provider, model, apiKey, prompt, settings = {}, fetchImpl = fetch, signal, timeoutMs }) {
    if (!apiKey) throw new AdapterError('No API key saved for this provider. Re-run the import command with a workbook that contains the key, or add it in Settings.', { code: 'AUTH_FAILED' });
    const url = universalAiUrl(provider.baseUrl);
    const body = {
      model: model.vendorModelId,
      input: {
        text: prompt,
        resolution: this.resolutionFor(settings),
        num_images: 1,
      },
    };
    const res = await fetchWithTimeout(fetchImpl, url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, timeoutMs, signal);
    const text = await res.text();
    if (!res.ok) {
      // Eden's validation errors carry { detail, errors: [{field, message}] }
      // — surface those words instead of a generic failure.
      try {
        const j = JSON.parse(text);
        if (j && (j.detail || Array.isArray(j.errors))) {
          const parts = (j.errors || []).map((e) => `${e.field || 'request'}: ${e.message || ''}`.trim());
          const msg = parts.length ? parts.join('; ') : String(j.detail);
          throw new AdapterError(`Eden AI rejected the request (${msg}).`, { code: 'INVALID_REQUEST', status: res.status, diagnostic: `HTTP ${res.status}: ${msg}` });
        }
      } catch (e) { if (e instanceof AdapterError) throw e; }
      throw mapHttpError(res.status, text);
    }
    let j;
    try { j = JSON.parse(text); } catch {
      throw new AdapterError('Eden AI returned a non-JSON response.', { code: 'BAD_RESPONSE', diagnostic: text.slice(0, 200) });
    }
    const failure = findFailure(j);
    if (failure) {
      if (/not found|inactive|does not exist|unknown model/i.test(failure)) {
        throw new AdapterError(`Model not found at Eden AI: ${failure}`, { code: 'MODEL_NOT_FOUND', diagnostic: failure.slice(0, 200) });
      }
      if (/quota|insufficient|credit|balance/i.test(failure)) {
        throw new AdapterError(`Free limit ended for this model — ${failure}`, { code: 'QUOTA_EXHAUSTED', diagnostic: failure.slice(0, 200) });
      }
      throw new AdapterError(`Eden AI could not generate the image: ${failure}`, { code: 'PROVIDER_ERROR', diagnostic: failure.slice(0, 200) });
    }
    const img = findImage(j);
    if (!img) {
      throw new AdapterError('Eden AI answered without image data — the response format is not recognised yet.', { code: 'BAD_RESPONSE', diagnostic: text.slice(0, 300) });
    }
    return [img];
  }

  async testConnection({ provider, apiKey, fetchImpl = fetch }) {
    if (!apiKey) return { ok: false, message: 'No API key saved for this provider.' };
    try {
      const res = await fetchWithTimeout(fetchImpl, `${apiRoot(provider.baseUrl)}/images/models`, { headers: { Authorization: `Bearer ${apiKey}` } }, 20000);
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'Authentication failed — the Eden AI key was rejected.' };
      if (res.ok) return { ok: true, message: 'Eden AI key accepted. Use Test model for a real generation check.' };
      return { ok: false, message: `Eden AI answered HTTP ${res.status}.` };
    } catch (e) { return { ok: false, message: e.message }; }
  }
}
module.exports = { EdenAiAdapter, findImage, findFailure, universalAiUrl };
