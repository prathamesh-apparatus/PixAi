'use strict';
import { describe, it, expect } from 'vitest';
import { rankCandidates, priceClass, classifyCategory, qualityPrior, coolingUntil } from '../src/utils/modelRank.js';
import { compilePrompt, extractQuotedText } from '../src/utils/promptCompiler.js';

const P = (id, adapter, models) => ({ id, name: id, status: 'active', adapter, adapterSupported: true, models });
const M = (id, vendorModelId, extra = {}) => ({ id, name: id, vendorModelId, status: 'active', testState: 'not-tested', ...extra });

describe('priceClass — Free-Only classification', () => {
  it('classifies the real workbook pool correctly', () => {
    expect(priceClass(P('openrouter-main', 'openrouter', []), M('m', 'recraft/recraft-v4.1-flash-v2:free'))).toBe('free');
    expect(priceClass(P('openrouter-main', 'openrouter', []), M('m', 'recraft/recraft-v4.1-flash-v2'))).toBe('paid');
    expect(priceClass(P('edenai-main', 'edenai', []), M('m', 'image/generation/ovhcloud/stable-diffusion-xl-base-v10'))).toBe('free');
    expect(priceClass(P('edenai-main', 'edenai', []), M('m', 'image/generation/google/gemini-2.5-flash-image'))).toBe('paid');
    expect(priceClass(P('pollinations', 'pollinations', []), M('m', 'black-forest-labs/flux.1-schnell'))).toBe('free');
    expect(priceClass(P('pollinations', 'pollinations', []), M('m', 'nanobanana'))).toBe('paid');
    expect(priceClass(P('nvidia-nim-main', 'nvidia', []), M('m', 'black-forest-labs/flux.2-klein-4b'))).toBe('free');
    expect(priceClass(P('cloudflare-workers-ai-main', 'cloudflare', []), M('m', '@cf/black-forest-labs/flux-1-schnell'))).toBe('free');
    expect(priceClass(P('puter', 'puter', []), M('m', 'black-forest-labs/flux-schnell'))).toBe('free');
    expect(priceClass(P('mystery', 'mystery', []), M('m', 'some/model'))).toBe('unknown');
  });
});

describe('classifyCategory', () => {
  it('routes prompts to the right category', () => {
    expect(classifyCategory('wedding poster with "Happy Wedding" written on it')).toBe('poster-text');
    expect(classifyCategory('make a bill board of doremon cartoon')).toBe('cartoon');
    expect(classifyCategory('a perfume bottle on a marble table')).toBe('product');
    expect(classifyCategory('portrait of a bride, headshot')).toBe('portrait');
    expect(classifyCategory('a lighthouse at sunset')).toBe('general');
    expect(classifyCategory('anything', 'mockup')).toBe('product');
    expect(classifyCategory('anything', 'skin')).toBe('portrait');
  });
});

describe('rankCandidates v13', () => {
  const providers = [
    P('openrouter-main', 'openrouter', [M('o::paid', 'recraft/recraft-v4.1-flash-v2', { testState: 'tested-ok' })]),
    P('pollinations', 'pollinations', [M('p::flux', 'black-forest-labs/flux.1-schnell')]),
    P('edenai-main', 'edenai', [M('e::sdxl', 'image/generation/ovhcloud/stable-diffusion-xl-base-v10')]),
  ];
  it('freeOnly excludes paid models entirely and reports the block count', () => {
    const ranked = rankCandidates(providers, { freeOnly: true, prompt: 'a dog' });
    expect(ranked.map((c) => c.modelId)).not.toContain('o::paid');
    expect(ranked.blockedPaid).toBe(1);
    expect(ranked.length).toBe(2);
  });
  it('without freeOnly the paid model is present but scored below free ones', () => {
    const ranked = rankCandidates(providers, { prompt: 'a dog' });
    expect(ranked[0].modelId).toBe('p::flux');
    expect(ranked.map((c) => c.modelId)).toContain('o::paid');
  });
  it('real success history beats a cold prior: a proven SDXL wins cartoon work', () => {
    const learned = [
      P('pollinations', 'pollinations', [M('p::flux', 'black-forest-labs/flux.1-schnell')]),
      P('edenai-main', 'edenai', [M('e::sdxl', 'image/generation/ovhcloud/stable-diffusion-xl-base-v10', {
        testState: 'tested-ok',
        stats: { ok: 12, fail: 0, avgMs: 6000, byCategory: { cartoon: { ok: 12, fail: 0 } } },
      })]),
    ];
    const ranked = rankCandidates(learned, { freeOnly: true, category: 'cartoon', prompt: 'a cartoon cat' });
    expect(ranked[0].modelId).toBe('e::sdxl');
  });
  it('a model in cooldown is benched behind available ones', () => {
    const future = new Date(Date.now() + 3600000).toISOString();
    const withCooldown = [
      P('pollinations', 'pollinations', [M('p::flux', 'black-forest-labs/flux.1-schnell', { testState: 'tested-ok', cooldownUntil: future })]),
      P('edenai-main', 'edenai', [M('e::sdxl', 'image/generation/ovhcloud/stable-diffusion-xl-base-v10')]),
    ];
    const ranked = rankCandidates(withCooldown, { freeOnly: true, prompt: 'a dog' });
    expect(ranked[0].modelId).toBe('e::sdxl');
    expect(ranked[1].modelId).toBe('p::flux'); // still present, as last resort
  });
  it('quality priors: Recraft tops poster-text, SDXL trails it', () => {
    expect(qualityPrior(providers[0], providers[0].models[0], 'poster-text')).toBeGreaterThan(0.9);
    expect(qualityPrior(providers[2], providers[2].models[0], 'poster-text')).toBeLessThan(0.4);
    expect(qualityPrior(providers[2], providers[2].models[0], 'cartoon')).toBeGreaterThan(0.75);
  });
  it('coolingUntil: quota marked yesterday has expired (retry allowed)', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    expect(coolingUntil({ testState: 'quota-exhausted', lastTestedAt: yesterday }, Date.now())).toBeLessThan(Date.now());
    const today = new Date().toISOString();
    expect(coolingUntil({ testState: 'quota-exhausted', lastTestedAt: today }, Date.now())).toBeGreaterThan(Date.now());
  });
});

describe('prompt compiler', () => {
  it('extracts quoted text in both quote styles', () => {
    expect(extractQuotedText('poster saying "Happy Wedding" and “Sale”')).toEqual(['Happy Wedding', 'Sale']);
  });
  it('locks quoted text for a generic-dialect model on poster work', () => {
    const out = compilePrompt({ prompt: 'wedding poster "Happy Wedding"', category: 'poster-text', candidate: { vendorModelId: 'black-forest-labs/flux.2-klein-4b', adapter: 'nvidia' } });
    expect(out.prompt).toContain('exact readable text "Happy Wedding"');
    expect(out.negativePrompt).toBe('');
  });
  it('SDXL gets a negative prompt and NO meta text instruction', () => {
    const out = compilePrompt({ prompt: 'wedding poster "Happy Wedding"', category: 'poster-text', candidate: { vendorModelId: 'image/generation/ovhcloud/stable-diffusion-xl-base-v10', adapter: 'edenai' } });
    expect(out.prompt).not.toContain('exact readable text');
    expect(out.negativePrompt).toContain('garbled text');
  });
  it('a plain prompt passes through untouched for generic models', () => {
    const out = compilePrompt({ prompt: 'a dog in a park', category: 'general', candidate: { vendorModelId: 'black-forest-labs/flux-schnell', adapter: 'puter' } });
    expect(out.prompt).toBe('a dog in a park');
  });
});
