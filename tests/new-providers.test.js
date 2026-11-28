'use strict';
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
const { resolveAdapter } = require('../electron/adapters/registry');
const { NvidiaAdapter } = require('../electron/adapters/nvidia-adapter');
const { PollinationsAdapter, modelParam } = require('../electron/adapters/pollinations-adapter');
const { PuterAdapter } = require('../electron/adapters/puter-adapter');
const { mapHttpError } = require('../electron/adapters/base-adapter');
const { parseWorkbook } = require('../electron/services/excel-importer');
const { ConfigManager } = require('../electron/services/config-manager');
const { pickVisionTarget, describeReference } = require('../electron/services/vision-service');
const { row, workbookBuffer, PNG_1PX } = require('./workbook-helper');
import { rankCandidates, candidatesWithPreferred, costTier } from '../src/utils/modelRank.js';
import { applyMode, sizeForAspect } from '../src/utils/modes.js';

function fakeFetch(handler) { return async (url, opts) => handler(url, opts); }
function res({ ok = true, status = 200, ctype = 'image/png', body, jsonBody, textBody }) {
  return {
    ok, status,
    headers: { get: (h) => (h === 'content-type' ? ctype : null) },
    arrayBuffer: async () => (body ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) : new ArrayBuffer(0)),
    json: async () => jsonBody,
    text: async () => textBody || (jsonBody ? JSON.stringify(jsonBody) : ''),
  };
}

describe('new provider resolution (EdenAI / Pollinations / Puter)', () => {
  it('routes by host: edenai -> openai-compatible, pollinations, puter', () => {
    expect(resolveAdapter({ adapterRaw: 'OpenAI', baseUrl: 'https://api.edenai.run/v3' }).adapterId).toBe('openai-compatible');
    expect(resolveAdapter({ adapterRaw: 'Pollinations AI', baseUrl: 'https://gen.pollinations.ai' }).adapterId).toBe('pollinations');
    expect(resolveAdapter({ adapterRaw: 'Puter.js SDK', baseUrl: 'https://puter.com SDK managed' }).adapterId).toBe('puter');
  });
  it('routes by workbook column when the host is unknown', () => {
    expect(resolveAdapter({ adapterRaw: 'Pollinations AI', baseUrl: '' }).adapterId).toBe('pollinations');
    expect(resolveAdapter({ adapterRaw: 'Puter.js SDK', baseUrl: '' }).adapterId).toBe('puter');
  });
});

describe('nvidia adapter with the new workbook base URL', () => {
  const adapter = new NvidiaAdapter();
  it('builds the per-model genai endpoint when the base is the integrate root', () => {
    const url = adapter.buildUrl({ baseUrl: 'https://integrate.api.nvidia.com/v1' }, { vendorModelId: 'black-forest-labs/flux.2-klein-4b' });
    expect(url).toBe('https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b');
  });
  it('still swaps the model segment on a per-model genai base', () => {
    const url = adapter.buildUrl({ baseUrl: 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux-3-image-klein' }, { vendorModelId: 'black-forest-labs/flux.1-schnell' });
    expect(url).toBe('https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell');
  });
});

describe('pollinations adapter', () => {
  it('maps workbook vendor ids to gateway model names', () => {
    expect(modelParam('black-forest-labs/flux.1-schnell')).toBe('flux');
    expect(modelParam('some/turbo-thing')).toBe('turbo');
  });
  it('GETs the image endpoint and returns the raw bytes', async () => {
    let seenUrl = ''; let seenAuth = '';
    const fetchImpl = fakeFetch(async (url, opts) => { seenUrl = url; seenAuth = opts.headers.Authorization; return res({ body: PNG_1PX }); });
    const out = await new PollinationsAdapter().generate({
      provider: { baseUrl: 'https://gen.pollinations.ai' },
      model: { vendorModelId: 'black-forest-labs/flux.1-schnell' },
      apiKey: 'sk_test', prompt: 'a red apple', settings: { aspectRatio: '16:9' }, fetchImpl,
    });
    expect(seenUrl).toContain('https://gen.pollinations.ai/image/a%20red%20apple');
    expect(seenUrl).toContain('model=flux');
    expect(seenUrl).toContain('width=1344');
    expect(seenAuth).toBe('Bearer sk_test');
    expect(out[0].buffer.equals(PNG_1PX)).toBe(true);
    expect(out[0].format).toBe('png');
  });
});

describe('puter adapter', () => {
  const provider = { baseUrl: 'https://puter.com SDK managed' };
  const model = { vendorModelId: 'black-forest-labs/flux-schnell' };
  it('calls drivers/call with the image-generation driver envelope and decodes a data URI result', async () => {
    let seenUrl = ''; let seenBody = null; let seenAuth = '';
    const dataUri = `data:image/png;base64,${PNG_1PX.toString('base64')}`;
    const fetchImpl = fakeFetch(async (url, opts) => {
      seenUrl = url; seenAuth = opts.headers.Authorization; seenBody = JSON.parse(opts.body);
      return res({ ctype: 'application/json', jsonBody: { success: true, result: dataUri } });
    });
    const out = await new PuterAdapter().generate({ provider, model, apiKey: 'token123', prompt: 'a cat', settings: {}, fetchImpl });
    expect(seenUrl).toBe('https://api.puter.com/drivers/call');
    expect(seenAuth).toBe('Bearer token123');
    expect(seenBody.interface).toBe('puter-image-generation');
    expect(seenBody.method).toBe('generate');
    expect(seenBody.args).toEqual({ prompt: 'a cat', model: 'black-forest-labs/flux-schnell' });
    expect(out[0].buffer.equals(PNG_1PX)).toBe(true);
  });
  it('maps a quota failure inside a 200 envelope to QUOTA_EXHAUSTED', async () => {
    const fetchImpl = fakeFetch(async () => res({ ctype: 'application/json', jsonBody: { success: false, error: { message: 'monthly allowance exhausted — insufficient credits' } } }));
    await expect(new PuterAdapter().generate({ provider, model, apiKey: 't', prompt: 'x', settings: {}, fetchImpl })).rejects.toMatchObject({ code: 'QUOTA_EXHAUSTED' });
  });
  it('without a token it fails with AUTH_FAILED and a clear message', async () => {
    await expect(new PuterAdapter().generate({ provider, model, apiKey: '', prompt: 'x', settings: {}, fetchImpl: fakeFetch(async () => res({})) })).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });
});

describe('error mapping', () => {
  it('a 400 "model not found" (Eden AI style) maps to MODEL_NOT_FOUND', () => {
    const err = mapHttpError(400, JSON.stringify({ error: { message: 'Model(s) not found or inactive: ovhcloud/stable-diffusion-xl-base-v10' } }));
    expect(err.code).toBe('MODEL_NOT_FOUND');
  });
});

describe('importer keeps vision/chat providers', () => {
  it('stores Gemini as a chat provider with its credential, image models stay image-only', () => {
    const buf = workbookBuffer([
      row({ provider: 'google-gemini', adapter: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', apiKey: 'gem-key', providerStatus: 'active', model: 'fx1-gemini-flash', vendorId: 'gemini-3.1-flash-lite', modelStatus: 'live', type: 'Text based' }),
      row({ provider: 'Pollinations', adapter: 'Pollinations AI', baseUrl: 'https://gen.pollinations.ai', apiKey: 'sk_pol', providerStatus: 'Active', model: 'fx1-pollinations-flux', vendorId: 'black-forest-labs/flux.1-schnell', modelStatus: 'Live', type: 'Image Generation' }),
    ]);
    const parsed = parseWorkbook(buf, 'test.xlsx');
    expect(parsed.providers.map((p) => p.id)).toEqual(['pollinations']);
    expect(parsed.providers[0].adapterSupported).toBe(true);
    expect(parsed.chatProviders).toHaveLength(1);
    expect(parsed.chatProviders[0].id).toBe('google-gemini');
    expect(parsed.chatProviders[0].models[0].vendorModelId).toBe('gemini-3.1-flash-lite');
    expect(parsed.credentials['google-gemini']).toBe('gem-key');
    expect(parsed.credentials.pollinations).toBe('sk_pol');
    expect(JSON.stringify(parsed.chatProviders)).not.toContain('gem-key');
  });
});

describe('vision service', () => {
  const cfg = {
    chatProviders: [
      { id: 'kilo-gateway', name: 'kilo', status: 'active', baseUrl: 'https://ai-gateway.kilo.ai/api/v1', models: [{ id: 'k::1', name: 'Nemotron VL', vendorModelId: 'nvidia/nemotron-3.5-super-vl:free', status: 'active' }] },
      { id: 'google-gemini', name: 'google-gemini', status: 'active', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', models: [{ id: 'g::1', name: 'Gemini Flash', vendorModelId: 'gemini-3.1-flash-lite', status: 'active' }] },
    ],
  };
  it('prefers Google Gemini for reference images', () => {
    const t = pickVisionTarget(cfg);
    expect(t.provider.id).toBe('google-gemini');
    expect(t.model.vendorModelId).toBe('gemini-3.1-flash-lite');
  });
  it('posts the image to chat/completions and returns the prompt', async () => {
    let seenUrl = ''; let seenBody = null;
    const fetchImpl = fakeFetch(async (url, opts) => {
      seenUrl = url; seenBody = JSON.parse(opts.body);
      return res({ ctype: 'application/json', jsonBody: { choices: [{ message: { content: '"a red apple on a wooden table, studio light"' } }] } });
    });
    const out = await describeReference({ config: cfg, getKey: () => 'k', imageDataUrl: 'data:image/png;base64,AAAA', userPrompt: 'make it shiny', fetchImpl });
    expect(seenUrl).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect(seenBody.model).toBe('gemini-3.1-flash-lite');
    expect(seenBody.messages[0].content[1].image_url.url).toBe('data:image/png;base64,AAAA');
    expect(out.prompt).toBe('a red apple on a wooden table, studio light');
  });
});

describe('config manager manual model management', () => {
  it('adds and deletes models; commitImport persists chatProviders', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixai-cfg-'));
    const cm = new ConfigManager(dir);
    const parsed = {
      sourceFile: 't.xlsx',
      providers: [{ id: 'edenai-main', name: 'edenai-main', adapterRaw: 'OpenAI', baseUrl: 'https://api.edenai.run/v3', models: [] }],
      chatProviders: [{ id: 'google-gemini', name: 'google-gemini', models: [] }],
      credentials: {}, warnings: [],
      stats: { nonImageModelCount: 0 },
    };
    cm.commitImport(parsed, {});
    expect(cm.load().chatProviders).toHaveLength(1);
    const after = cm.addModel('edenai-main', { name: 'SD Core', vendorModelId: 'stabilityai/stable-image-core', description: '' });
    const prov = after.providers.find((p) => p.id === 'edenai-main');
    expect(prov.models).toHaveLength(1);
    expect(prov.models[0].id).toBe('edenai-main::stabilityai/stable-image-core');
    expect(prov.models[0].adapterSupported).toBe(true);
    expect(() => cm.addModel('edenai-main', { vendorModelId: 'stabilityai/stable-image-core' })).toThrow(/already exists/);
    const afterDelete = cm.deleteModel('edenai-main', prov.models[0].id);
    expect(afterDelete.providers.find((p) => p.id === 'edenai-main').models).toHaveLength(0);
  });
});

describe('auto model ranking', () => {
  const providers = [
    { id: 'openrouter-main', name: 'openrouter', status: 'active', adapterSupported: true, models: [{ id: 'o::paid', name: 'Paid', vendorModelId: 'recraft/recraft-v4.1', status: 'active', testState: 'tested-ok' }] },
    { id: 'pollinations', name: 'Pollinations', status: 'active', adapterSupported: true, models: [{ id: 'p::flux', name: 'Flux', vendorModelId: 'black-forest-labs/flux.1-schnell', status: 'active', testState: 'not-tested' }] },
    { id: 'cloudflare-workers-ai-main', name: 'cloudflare', status: 'active', adapterSupported: true, models: [{ id: 'c::flux', name: 'CF Flux', vendorModelId: '@cf/flux', status: 'active', testState: 'quota-exhausted' }] },
    { id: 'puter', name: 'Puter', status: 'active', adapterSupported: false, models: [{ id: 'pu::flux', name: 'Puter Flux', vendorModelId: 'black-forest-labs/flux-schnell', status: 'active', testState: 'not-tested' }] },
  ];
  it('orders free first, paid last, and skips unsupported providers', () => {
    const ranked = rankCandidates(providers);
    expect(ranked.map((c) => c.modelId)).toEqual(['p::flux', 'c::flux', 'o::paid']);
    expect(costTier(providers[0], providers[0].models[0])).toBe(3);
  });
  it('preferred model goes first for regenerate, rest stay in auto order', () => {
    const ranked = candidatesWithPreferred(providers, 'openrouter-main', 'o::paid');
    expect(ranked[0].modelId).toBe('o::paid');
    expect(ranked[1].modelId).toBe('p::flux');
  });
});

describe('creation modes (prompt-craft)', () => {
  it('cinematic applies the chosen look, background composes the backdrop', () => {
    expect(applyMode('cinematic', 'a city street', { optionId: 'noir' }).prompt).toContain('film noir');
    expect(applyMode('background', 'a red car', { backgroundText: 'sunset beach' }).prompt).toContain('background: sunset beach');
    expect(applyMode('upscale', 'a cat', {}).prompt).toContain('8k uhd');
    expect(applyMode('generate', 'a cat', {}).prompt).toBe('a cat');
    expect(sizeForAspect('9:16')).toBe('1024x1536');
  });
});
