'use strict';
const { BaseAdapter, AdapterError, mapHttpError, fetchWithTimeout } = require('./base-adapter');

/**
 * Cloudflare Workers AI adapter.
 * Endpoint: POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{vendorModelId}
 * Auth: Authorization: Bearer <api token>
 * If the workbook Base URL already contains a full run URL template it is used as-is
 * ({model} placeholder supported). The account ID comes from the workbook's
 * Account ID column or from the Base URL — it is never invented.
 * Responses: binary image bytes, or JSON { result: { image: <base64> } } (FLUX.2 etc.),
 * or JSON { result: <base64> } depending on the model.
 *
 * FLUX.2 models (flux-2-dev, flux-2-klein-*) are the exception: per Cloudflare's
 * own docs they accept ONLY multipart/form-data — even for a prompt-only call —
 * with fields prompt/steps/width/height/seed/guidance. A JSON body gets HTTP 400
 * "invalid parameters" (the exact error seen in the app), so those models are
 * sent as FormData. All other models keep the JSON body.
 */
class CloudflareAdapter extends BaseAdapter {
  constructor() { super(); this.id = 'cloudflare'; this.displayName = 'Cloudflare Workers AI'; }

  capabilities(model) {
    const mid = (model && model.vendorModelId) || '';
    const caps = [
      { key: 'aspectRatio', label: 'Aspect ratio', type: 'select', options: ['1:1', '16:9', '9:16', '4:3', '3:4'], default: '1:1' },
      { key: 'seed', label: 'Seed (optional)', type: 'number', min: 0, max: 999999999, default: '' },
    ];
    if (/flux/.test(mid) && !/schnell/.test(mid)) {
      caps.push({ key: 'steps', label: 'Steps', type: 'number', min: 1, max: 50, default: 20 });
    }
    if (/flux-2/.test(mid)) {
      caps.push({ key: 'guidance', label: 'Guidance scale', type: 'number', min: 0, max: 20, default: 3.5 });
    }
    if (/sdxl|stable-diffusion/.test(mid)) {
      caps.push({ key: 'steps', label: 'Steps', type: 'number', min: 1, max: 20, default: 20 });
      caps.push({ key: 'guidance', label: 'Guidance scale', type: 'number', min: 0, max: 20, default: 7.5 });
    }
    return caps;
  }
  supportsNegativePrompt(model) {
    const mid = (model && model.vendorModelId) || '';
    return /sdxl|stable-diffusion|dreamshaper/.test(mid); // FLUX models take no negative prompt
  }

  buildUrl(provider, model) {
    const base = (provider.baseUrl || '').replace(/\/+$/, '');
    if (base.includes('{model}')) return base.replace('{model}', encodeURIComponent(model.vendorModelId));
    if (/\/ai\/run\//.test(base)) return `${base}/${encodeURIComponent(model.vendorModelId)}`.replace(/([^:])\/\//g, '$1/');
    const accountId = provider.accountId || (base.match(/accounts\/([^/]+)/) || [])[1];
    if (accountId) {
      return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model.vendorModelId}`;
    }
    if (base && /cloudflare\.com/.test(base)) return `${base}/ai/run/${model.vendorModelId}`;
    if (base) return `${base}/${model.vendorModelId}`;
    throw new AdapterError('Cloudflare account ID / Base URL is missing for this provider. Add it to the workbook and re-import — it cannot be guessed.', { code: 'CONFIG_MISSING' });
  }

  sizeFor(aspect) {
    return { '1:1': [1024, 1024], '16:9': [1344, 768], '9:16': [768, 1344], '4:3': [1152, 896], '3:4': [896, 1152] }[aspect] || [1024, 1024];
  }

  isMultipartModel(model) {
    return /flux-2/.test((model && model.vendorModelId) || '');
  }

  async generate({ provider, model, apiKey, prompt, negativePrompt, settings = {}, fetchImpl = fetch, signal, timeoutMs }) {
    if (!apiKey) throw new AdapterError('No API key saved for this provider. Import a workbook with the key or add it in Provider Settings.', { code: 'AUTH_FAILED' });
    const url = this.buildUrl(provider, model);
    const [width, height] = this.sizeFor(settings.aspectRatio);
    let fetchOptions;
    if (this.isMultipartModel(model)) {
      // FLUX.2: multipart/form-data only (Cloudflare docs) — field is "steps",
      // not the JSON API's "num_steps". FormData sets the Content-Type itself.
      const form = new FormData();
      form.append('prompt', prompt);
      form.append('width', String(width));
      form.append('height', String(height));
      if (settings.steps) form.append('steps', String(Number(settings.steps)));
      if (settings.seed !== '' && settings.seed != null) form.append('seed', String(Number(settings.seed)));
      if (settings.guidance) form.append('guidance', String(Number(settings.guidance)));
      fetchOptions = { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form };
    } else {
      const body = { prompt, width, height };
      if (settings.seed !== '' && settings.seed != null) body.seed = Number(settings.seed);
      if (settings.steps) body.num_steps = Number(settings.steps);
      if (settings.guidance) body.guidance = Number(settings.guidance);
      if (negativePrompt && this.supportsNegativePrompt(model)) body.negative_prompt = negativePrompt;
      fetchOptions = {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      };
    }
    const res = await fetchWithTimeout(fetchImpl, url, fetchOptions, timeoutMs, signal);
    const ctype = res.headers.get('content-type') || '';
    if (!res.ok) throw mapHttpError(res.status, await res.text());
    if (ctype.includes('application/json')) {
      const j = await res.json();
      const b64 = (j.result && j.result.image) || (typeof j.result === 'string' ? j.result : null) || j.image || null;
      if (!b64) throw new AdapterError('Cloudflare returned JSON without image data — the model response format is not supported yet.', { code: 'BAD_RESPONSE', diagnostic: JSON.stringify(j).slice(0, 200) });
      return [{ buffer: Buffer.from(b64, 'base64'), format: 'png' }];
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new AdapterError('Cloudflare returned an empty image response.', { code: 'BAD_RESPONSE' });
    return [{ buffer: buf, format: ctype.includes('jpeg') || ctype.includes('jpg') ? 'jpg' : 'png' }];
  }

  async testConnection({ provider, apiKey, fetchImpl = fetch }) {
    if (!apiKey) return { ok: false, message: 'No API key saved for this provider.' };
    try {
      const accountId = provider.accountId || ((provider.baseUrl || '').match(/accounts\/([^/]+)/) || [])[1];
      const url = accountId ? `https://api.cloudflare.com/client/v4/accounts/${accountId}/tokens/verify` : 'https://api.cloudflare.com/client/v4/user/tokens/verify';
      const res = await fetchWithTimeout(fetchImpl, url, { headers: { Authorization: `Bearer ${apiKey}` } }, 20000);
      if (res.ok) return { ok: true, message: 'API token verified with Cloudflare.' };
      const err = mapHttpError(res.status, await res.text());
      return { ok: false, message: err.message };
    } catch (e) { return { ok: false, message: e.message }; }
  }
}
module.exports = { CloudflareAdapter };
