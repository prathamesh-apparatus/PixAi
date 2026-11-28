'use strict';
const { BaseAdapter, AdapterError, mapHttpError, fetchWithTimeout } = require('./base-adapter');

/**
 * Puter image adapter.
 * Puter has no separate developer API key: the workbook "API key" for Puter is
 * the account auth token, and image generation runs through Puter's driver
 * dispatch — the same call puter.js makes (and the same one that works from
 * PowerShell):
 *   POST https://api.puter.com/drivers/call
 *   Authorization: Bearer <account token>
 *   { interface: 'puter-image-generation', driver: 'ai-image',
 *     method: 'generate', args: { prompt, model } }
 * ("ai-chat" is the CHAT interface's driver — pairing it with the image
 * interface makes Puter answer "Driver not found: puter-image-generation:
 * ai-chat", confirmed live 2026-11-28. The workbook model
 * black-forest-labs/flux-schnell is Puter's Replicate-route default model
 * per Puter's own txt2img docs.)
 * The workbook Base URL ("https://puter.com SDK managed") is informational
 * only; the endpoint is fixed by Puter's platform.
 */
const DRIVERS_CALL_URL = 'https://api.puter.com/drivers/call';

function extractImage(result) {
  if (result == null) return null;
  if (typeof result === 'string') {
    if (result.startsWith('data:image/')) {
      const b64 = result.slice(result.indexOf(',') + 1);
      return { buffer: Buffer.from(b64, 'base64'), format: result.includes('image/png') ? 'png' : 'jpg' };
    }
    if (/^https?:\/\//i.test(result)) return { remoteUrl: result, format: 'png' };
    return null;
  }
  if (typeof result === 'object') {
    for (const key of ['src', 'url', 'image', 'image_url', 'data']) {
      const hit = extractImage(result[key]);
      if (hit) return hit;
    }
    for (const key of ['base64', 'b64_json', 'b64']) {
      if (typeof result[key] === 'string' && result[key]) {
        return { buffer: Buffer.from(result[key], 'base64'), format: 'png' };
      }
    }
    if (Array.isArray(result.images) && result.images.length) return extractImage(result.images[0]);
  }
  return null;
}

class PuterAdapter extends BaseAdapter {
  constructor() { super(); this.id = 'puter'; this.displayName = 'Puter'; }

  capabilities() { return []; }
  supportsNegativePrompt() { return false; }

  async generate({ provider, model, apiKey, prompt, fetchImpl = fetch, signal, timeoutMs }) {
    if (!apiKey) {
      throw new AdapterError('No Puter auth token saved. Puter uses your account token as the "API key" — re-import the workbook with the token filled in, or paste it in Settings.', { code: 'AUTH_FAILED' });
    }
    const body = {
      interface: 'puter-image-generation',
      driver: 'ai-image',
      test_mode: false,
      method: 'generate',
      args: { prompt, model: model.vendorModelId },
    };
    const res = await fetchWithTimeout(fetchImpl, DRIVERS_CALL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Origin: 'https://docs.puter.com',
        Referer: 'https://docs.puter.com/',
      },
      body: JSON.stringify(body),
    }, timeoutMs, signal);
    const text = await res.text();
    if (!res.ok) throw mapHttpError(res.status, text);
    let j;
    try { j = JSON.parse(text); } catch {
      throw new AdapterError('Puter returned a non-JSON response.', { code: 'BAD_RESPONSE', diagnostic: text.slice(0, 200) });
    }
    if (j && j.success === false) {
      const msg = (j.error && (j.error.message || j.error.code)) || 'Puter reported a failure.';
      if (/quota|allowance|insufficient|credit/i.test(String(msg))) {
        throw new AdapterError(`Free limit ended for this model — ${msg}`, { code: 'QUOTA_EXHAUSTED', diagnostic: String(msg).slice(0, 200) });
      }
      throw new AdapterError(`Puter could not generate the image: ${msg}`, { code: 'PROVIDER_ERROR', diagnostic: String(msg).slice(0, 200) });
    }
    const img = extractImage(j && (j.result !== undefined ? j.result : j));
    if (!img) {
      throw new AdapterError('Puter answered without image data — the response format is not recognised yet.', { code: 'BAD_RESPONSE', diagnostic: text.slice(0, 200) });
    }
    return [img];
  }

  async testConnection({ apiKey, fetchImpl = fetch }) {
    if (!apiKey) return { ok: false, message: 'No Puter auth token saved for this provider.' };
    try {
      const res = await fetchWithTimeout(fetchImpl, 'https://api.puter.com/metering/usage', { headers: { Authorization: `Bearer ${apiKey}` } }, 20000);
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'Authentication failed — the Puter auth token was rejected.' };
      if (res.ok) return { ok: true, message: 'Puter token accepted. Use Test model for a real generation check.' };
      return { ok: false, message: `Puter answered HTTP ${res.status}.` };
    } catch (e) { return { ok: false, message: e.message }; }
  }
}
module.exports = { PuterAdapter, extractImage, DRIVERS_CALL_URL };
