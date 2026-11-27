'use strict';
import { describe, it, expect } from 'vitest';
const { CloudflareAdapter } = require('../electron/adapters/cloudflare-adapter');
const { OpenRouterAdapter } = require('../electron/adapters/openrouter-adapter');
const { OpenAICompatibleAdapter } = require('../electron/adapters/openai-compatible-adapter');
const { resolveAdapter } = require('../electron/adapters/registry');
const { PNG_1PX } = require('./workbook-helper');

function fakeFetch(handler) {
  return async (url, opts) => handler(url, opts);
}
function res({ ok = true, status = 200, ctype = 'image/png', body, jsonBody, textBody }) {
  return {
    ok, status,
    headers: { get: (h) => (h === 'content-type' ? ctype : null) },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    json: async () => jsonBody,
    text: async () => textBody || (jsonBody ? JSON.stringify(jsonBody) : ''),
  };
}

describe('adapter resolution', () => {
  it('resolves from the workbook adapter column and from base URL hosts', () => {
    expect(resolveAdapter({ adapterRaw: 'Cloudflare Workers AI' }).adapterId).toBe('cloudflare');
    expect(resolveAdapter({ adapterRaw: 'OpenRouter' }).adapterId).toBe('openrouter');
    expect(resolveAdapter({ adapterRaw: 'OpenAI' }).adapterId).toBe('openai-compatible');
    expect(resolveAdapter({ adapterRaw: '', baseUrl: 'https://openrouter.ai/api/v1' }).adapterId).toBe('openrouter');
    expect(resolveAdapter({ adapterRaw: 'BrandNewAPI', baseUrl: 'https://x.example' }).supported).toBe(false);
  });
});

describe('cloudflare adapter', () => {
  const provider = { baseUrl: 'https://api.cloudflare.com/client/v4/accounts/acc123/ai/run', accountId: '' };
  const model = { vendorModelId: '@cf/black-forest-labs/flux-1-schnell' };
  it('builds the account run URL from the base URL and returns binary images', async () => {
    let seenUrl = ''; let seenAuth = '';
    const fetchImpl = fakeFetch(async (url, opts) => { seenUrl = url; seenAuth = opts.headers.Authorization; return res({ body: PNG_1PX }); });
    const out = await new CloudflareAdapter().generate({ provider, model, apiKey: 'tok', prompt: 'a cat', settings: {}, fetchImpl });
    expect(seenUrl).toBe('https://api.cloudflare.com/client/v4/accounts/acc123/ai/run/@cf/black-forest-labs/flux-1-schnell');
    expect(seenAuth).toBe('Bearer tok');
    expect(out[0].buffer.equals(PNG_1PX)).toBe(true);
  });
  it('decodes JSON base64 image results', async () => {
    const fetchImpl = fakeFetch(async () => res({ ctype: 'application/json', jsonBody: { result: { image: PNG_1PX.toString('base64') } }, body: Buffer.alloc(0) }));
    const out = await new CloudflareAdapter().generate({ provider, model, apiKey: 'tok', prompt: 'x', settings: {}, fetchImpl });
    expect(out[0].buffer.equals(PNG_1PX)).toBe(true);
  });
  it('maps 401 to AUTH_FAILED and 429 to RATE_LIMITED', async () => {
    const f401 = fakeFetch(async () => res({ ok: false, status: 401, ctype: 'application/json', textBody: '{"error":"bad key"}', body: Buffer.alloc(0) }));
    await expect(new CloudflareAdapter().generate({ provider, model, apiKey: 'tok', prompt: 'x', settings: {}, fetchImpl: f401 })).rejects.toMatchObject({ code: 'AUTH_FAILED' });
    const f429 = fakeFetch(async () => res({ ok: false, status: 429, ctype: 'application/json', textBody: '{}', body: Buffer.alloc(0) }));
    await expect(new CloudflareAdapter().generate({ provider, model, apiKey: 'tok', prompt: 'x', settings: {}, fetchImpl: f429 })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
  it('refuses to guess a missing account/base URL', async () => {
    await expect(new CloudflareAdapter().generate({ provider: { baseUrl: '', accountId: '' }, model, apiKey: 'tok', prompt: 'x', settings: {}, fetchImpl: fakeFetch(async () => res({ body: PNG_1PX })) }))
      .rejects.toMatchObject({ code: 'CONFIG_MISSING' });
  });
  it('capabilities: FLUX schnell has no negative prompt, SDXL does', () => {
    const a = new CloudflareAdapter();
    expect(a.supportsNegativePrompt(model)).toBe(false);
    expect(a.supportsNegativePrompt({ vendorModelId: '@cf/stabilityai/stable-diffusion-xl-base-1.0' })).toBe(true);
  });
});

describe('openrouter adapter', () => {
  const provider = { baseUrl: 'https://openrouter.ai/api/v1' };
  const model = { vendorModelId: 'vendor/image-model' };
  it('extracts data-url images from chat completions and sends modalities', async () => {
    let sentBody = null;
    const fetchImpl = fakeFetch(async (url, opts) => {
      sentBody = JSON.parse(opts.body);
      return res({ ctype: 'application/json', body: Buffer.alloc(0), jsonBody: { choices: [{ message: { images: [{ image_url: { url: `data:image/png;base64,${PNG_1PX.toString('base64')}` } }] } }] } });
    });
    const out = await new OpenRouterAdapter().generate({ provider, model, apiKey: 'k', prompt: 'draw', settings: {}, fetchImpl });
    expect(sentBody.modalities).toContain('image');
    expect(out[0].buffer.equals(PNG_1PX)).toBe(true);
  });
  it('a text-only response is an error, never a fake image', async () => {
    const fetchImpl = fakeFetch(async () => res({ ctype: 'application/json', body: Buffer.alloc(0), jsonBody: { choices: [{ message: { content: 'just text' } }] } }));
    await expect(new OpenRouterAdapter().generate({ provider, model, apiKey: 'k', prompt: 'draw', settings: {}, fetchImpl })).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });
});

describe('openai-compatible adapter', () => {
  it('posts to /images/generations and decodes b64_json', async () => {
    let seenUrl = '';
    const fetchImpl = fakeFetch(async (url) => { seenUrl = url; return res({ ctype: 'application/json', body: Buffer.alloc(0), jsonBody: { data: [{ b64_json: PNG_1PX.toString('base64') }] } }); });
    const out = await new OpenAICompatibleAdapter().generate({ provider: { baseUrl: 'https://api.example.com/v1' }, model: { vendorModelId: 'img-1' }, apiKey: 'k', prompt: 'x', settings: {}, fetchImpl });
    expect(seenUrl).toBe('https://api.example.com/v1/images/generations');
    expect(out[0].buffer.equals(PNG_1PX)).toBe(true);
  });
});
