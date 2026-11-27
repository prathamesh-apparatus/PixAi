'use strict';
import { describe, it, expect } from 'vitest';
const { CloudflareAdapter } = require('../electron/adapters/cloudflare-adapter');
const { OpenRouterAdapter } = require('../electron/adapters/openrouter-adapter');
const { OpenAICompatibleAdapter } = require('../electron/adapters/openai-compatible-adapter');
const { NvidiaAdapter } = require('../electron/adapters/nvidia-adapter');
const { resolveAdapter } = require('../electron/adapters/registry');
const { mapHttpError } = require('../electron/adapters/base-adapter');
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
  it('known hosts win over a generic "OpenAI" workbook label (real FabrixAPI1.xlsx regression)', () => {
    // The real workbook labels OpenRouter and NVIDIA NIM simply "OpenAI".
    expect(resolveAdapter({ adapterRaw: 'OpenAI', baseUrl: 'https://openrouter.ai/api/v1/images' }).adapterId).toBe('openrouter');
    expect(resolveAdapter({ adapterRaw: 'OpenAI', baseUrl: 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux-3-image-klein' }).adapterId).toBe('nvidia');
    expect(resolveAdapter({ adapterRaw: 'Cloudflare Workers AI', baseUrl: 'https://api.cloudflare.com/client/v4/accounts/x/ai/run' }).adapterId).toBe('cloudflare');
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
  it('FLUX.2 models are sent as multipart/form-data with a "steps" field (Cloudflare docs)', async () => {
    let seenOpts = null;
    const fetchImpl = fakeFetch(async (url, opts) => {
      seenOpts = opts;
      return res({ ctype: 'application/json', body: Buffer.alloc(0), jsonBody: { result: { image: PNG_1PX.toString('base64') } } });
    });
    const out = await new CloudflareAdapter().generate({
      provider, model: { vendorModelId: '@cf/black-forest-labs/flux-2-dev' },
      apiKey: 'tok', prompt: 'a cycle', settings: { aspectRatio: '1:1', steps: 20, seed: 5 }, fetchImpl,
    });
    expect(seenOpts.body).toBeInstanceOf(FormData);
    expect(seenOpts.body.get('prompt')).toBe('a cycle');
    expect(seenOpts.body.get('steps')).toBe('20');
    expect(seenOpts.body.get('width')).toBe('1024');
    expect(seenOpts.headers['Content-Type']).toBeUndefined(); // FormData sets it
    expect(out[0].buffer.equals(PNG_1PX)).toBe(true);
  });
  it('non-FLUX.2 models keep the JSON body with num_steps', async () => {
    let seenOpts = null;
    const fetchImpl = fakeFetch(async (url, opts) => { seenOpts = opts; return res({ body: PNG_1PX }); });
    await new CloudflareAdapter().generate({ provider, model, apiKey: 'tok', prompt: 'x', settings: { steps: 4 }, fetchImpl });
    expect(JSON.parse(seenOpts.body).num_steps).toBe(4);
    expect(seenOpts.headers['Content-Type']).toBe('application/json');
  });
});

describe('free-tier error handling', () => {
  it('402 maps to QUOTA_EXHAUSTED with free-limit wording', () => {
    const e = mapHttpError(402, '{"error":{"message":"Insufficient credits"}}');
    expect(e.code).toBe('QUOTA_EXHAUSTED');
    expect(e.message).toMatch(/Free limit ended/);
  });
  it('a Cloudflare free-allocation (neurons) error at HTTP 400 maps to QUOTA_EXHAUSTED', () => {
    const e = mapHttpError(400, JSON.stringify({ errors: [{ code: 4006, message: 'You have used up your daily free allocation of 10,000 neurons' }], success: false }));
    expect(e.code).toBe('QUOTA_EXHAUSTED');
    expect(e.diagnostic).toContain('neurons');
  });
  it('an OpenRouter free-models-per-day 429 maps to QUOTA_EXHAUSTED, a plain 429 stays RATE_LIMITED', () => {
    expect(mapHttpError(429, '{"error":{"message":"Rate limit exceeded: free-models-per-day"}}').code).toBe('QUOTA_EXHAUSTED');
    expect(mapHttpError(429, '{"error":{"message":"Too many requests"}}').code).toBe('RATE_LIMITED');
  });
  it('a plain 400 keeps the provider detail', () => {
    const e = mapHttpError(400, '{"error":{"message":"prompt is required"}}');
    expect(e.code).toBe('INVALID_REQUEST');
    expect(e.message).toContain('prompt is required');
  });
});

describe('openrouter adapter (Images API)', () => {
  const provider = { baseUrl: 'https://openrouter.ai/api/v1/images' };
  const model = { vendorModelId: 'recraft/recraft-v4.1-flash-v2:free' };
  it('posts to {baseUrl}/generations (never /images/images/generations) and decodes b64_json', async () => {
    let seenUrl = ''; let sentBody = null;
    const fetchImpl = fakeFetch(async (url, opts) => {
      seenUrl = url; sentBody = JSON.parse(opts.body);
      return res({ ctype: 'application/json', body: Buffer.alloc(0), jsonBody: { data: [{ b64_json: PNG_1PX.toString('base64') }] } });
    });
    const out = await new OpenRouterAdapter().generate({ provider, model, apiKey: 'k', prompt: 'draw', settings: {}, fetchImpl });
    expect(seenUrl).toBe('https://openrouter.ai/api/v1/images/generations');
    expect(sentBody.model).toBe('recraft/recraft-v4.1-flash-v2:free');
    expect(sentBody.prompt).toBe('draw');
    expect(out[0].buffer.equals(PNG_1PX)).toBe(true);
  });
  it('normalises a /v1 base URL to the images endpoint', () => {
    const a = new OpenRouterAdapter();
    expect(a.endpoint({ baseUrl: 'https://openrouter.ai/api/v1' })).toBe('https://openrouter.ai/api/v1/images/generations');
    expect(a.endpoint({ baseUrl: 'https://openrouter.ai/api/v1/images/generations' })).toBe('https://openrouter.ai/api/v1/images/generations');
  });
  it('a response without image data is an error, never a fake image', async () => {
    const fetchImpl = fakeFetch(async () => res({ ctype: 'application/json', body: Buffer.alloc(0), jsonBody: { choices: [{ message: { content: 'just text' } }] } }));
    await expect(new OpenRouterAdapter().generate({ provider, model, apiKey: 'k', prompt: 'draw', settings: {}, fetchImpl })).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });
  it('maps a 404 to MODEL_NOT_FOUND with the provider message', async () => {
    const fetchImpl = fakeFetch(async () => res({ ok: false, status: 404, ctype: 'application/json', body: Buffer.alloc(0), textBody: '{"error":{"message":"No endpoints found"}}' }));
    await expect(new OpenRouterAdapter().generate({ provider, model, apiKey: 'k', prompt: 'draw', settings: {}, fetchImpl })).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' });
  });
});

describe('nvidia adapter', () => {
  const provider = { baseUrl: 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux-3-image-klein' };
  it('swaps the trailing model segment in the per-model endpoint and decodes artifacts', async () => {
    let seenUrl = ''; let sentBody = null;
    const fetchImpl = fakeFetch(async (url, opts) => {
      seenUrl = url; sentBody = JSON.parse(opts.body);
      return res({ ctype: 'application/json', body: Buffer.alloc(0), jsonBody: { artifacts: [{ base64: PNG_1PX.toString('base64'), finishReason: 'SUCCESS' }] } });
    });
    const out = await new NvidiaAdapter().generate({ provider, model: { vendorModelId: 'black-forest-labs/flux.1-schnell' }, apiKey: 'k', prompt: 'draw', settings: {}, fetchImpl });
    expect(seenUrl).toBe('https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell');
    expect(sentBody.prompt).toBe('draw');
    expect(sentBody.width).toBe(1024);
    expect(out[0].buffer.equals(PNG_1PX)).toBe(true);
  });
  it('uses the base URL unchanged when it already targets the selected model', async () => {
    let seenUrl = '';
    const fetchImpl = fakeFetch(async (url) => { seenUrl = url; return res({ ctype: 'application/json', body: Buffer.alloc(0), jsonBody: { artifacts: [{ base64: PNG_1PX.toString('base64') }] } }); });
    await new NvidiaAdapter().generate({ provider, model: { vendorModelId: 'black-forest-labs/flux-3-image-klein' }, apiKey: 'k', prompt: 'x', settings: {}, fetchImpl });
    expect(seenUrl).toBe(provider.baseUrl);
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
