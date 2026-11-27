'use strict';
import { describe, it, expect } from 'vitest';
const { parseWorkbook, diffInventory, classifyModelType } = require('../electron/services/excel-importer');
const { row, workbookBuffer } = require('./workbook-helper');

const cfRow = (over = {}) => row({
  provider: 'Cloudflare Main', adapter: 'Cloudflare Workers AI',
  baseUrl: 'https://api.cloudflare.com/client/v4/accounts/acc123/ai/run', apiKey: 'cf-key-1',
  quota: 'monthly', rpm: '100', providerStatus: 'Active',
  model: 'FLUX Schnell', vendorId: '@cf/black-forest-labs/flux-1-schnell',
  modelStatus: 'Active', description: 'Fast flux', type: 'Image Generation', ...over,
});

describe('excel importer', () => {
  it('parses providers/models and inherits blank provider cells from preceding rows', () => {
    const buf = workbookBuffer([
      cfRow(),
      row({ model: 'SDXL', vendorId: '@cf/stabilityai/stable-diffusion-xl-base-1.0', modelStatus: 'Active', type: 'Text to Image generation' }),
    ]);
    const parsed = parseWorkbook(buf, 'FabrixAPI1.xlsx');
    expect(parsed.providers).toHaveLength(1);
    expect(parsed.providers[0].name).toBe('Cloudflare Main');
    expect(parsed.providers[0].models.map((m) => m.name)).toEqual(['FLUX Schnell', 'SDXL']);
    expect(parsed.providers[0].models[1].providerId).toBe('cloudflare-main');
    expect(parsed.credentials['cloudflare-main']).toBe('cf-key-1');
    expect(parsed.providers[0].accountId).toBe('');
    expect(parsed.stats.imageModelCount).toBe(2);
  });

  it('excludes text-only models and warns (not silently imports) unknown model types', () => {
    const buf = workbookBuffer([
      cfRow(),
      row({ model: 'Llama Chat', vendorId: '@cf/meta/llama', modelStatus: 'Active', type: 'Text Generation' }),
      row({ model: 'Mystery', vendorId: 'vendor/mystery', modelStatus: 'Active', type: 'Quantum Generation' }),
    ]);
    const parsed = parseWorkbook(buf);
    expect(parsed.providers[0].models).toHaveLength(1);
    expect(parsed.stats.nonImageModelCount).toBe(1);
    expect(parsed.warnings.some((w) => /unrecognized Model Type/i.test(w))).toBe(true);
  });

  it('classifies the workbook image labels case/space/hyphen tolerantly', () => {
    expect(classifyModelType('Image Generation')).toBe('image');
    expect(classifyModelType('Text to Image generation')).toBe('image');
    expect(classifyModelType('Text-to-Image')).toBe('image');
    expect(classifyModelType('IMAGE GENERATION API')).toBe('image');
    expect(classifyModelType('Chat')).toBe('non-image');
    expect(classifyModelType('Something Else')).toBe('unknown');
  });

  it('detects duplicates inside one workbook and keeps the first', () => {
    const parsed = parseWorkbook(workbookBuffer([cfRow(), cfRow()]));
    expect(parsed.providers[0].models).toHaveLength(1);
    expect(parsed.warnings.some((w) => /duplicate/i.test(w))).toBe(true);
  });

  it('rejects an invalid workbook with INVALID_WORKBOOK', () => {
    expect(() => parseWorkbook(Buffer.from('not an excel file'))).toThrowError(/could not be read|No inventory/);
    try { parseWorkbook(Buffer.from('not an excel file')); } catch (e) { expect(e.code).toBe('INVALID_WORKBOOK'); }
  });

  it('works when optional columns are missing entirely', () => {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Provider account', 'Model name (fx1)', 'Vendor model ID', 'Model Type'],
      ['Solo Provider', 'Solo Img', 'solo/img-1', 'Image Generation'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    const parsed = parseWorkbook(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    expect(parsed.providers).toHaveLength(1);
    expect(parsed.providers[0].models[0].vendorModelId).toBe('solo/img-1');
    expect(parsed.warnings.some((w) => /no Base URL/.test(w))).toBe(true);
  });
});

describe('import diff', () => {
  const base = () => parseWorkbook(workbookBuffer([cfRow()]), 'v1.xlsx');

  it('re-importing the same workbook produces no new/updated records (duplicate prevention)', () => {
    const first = base();
    const cfg = { providers: first.providers.map((p) => ({ ...p, adapterSupported: true })) };
    const again = base();
    const d = diffInventory(cfg, again, { 'cloudflare-main': 'cf-key-1' });
    expect(d.summary.newProviders).toBe(0);
    expect(d.summary.newModels).toBe(0);
    expect(d.summary.updatedModels).toBe(0);
    expect(d.summary.unchangedModels).toBe(1);
    expect(d.summary.credentialsUpdated).toBe(0);
  });

  it('detects a new provider, new models, an updated model ID change via new vendor id, and a rotated API key', () => {
    const cfg = { providers: base().providers };
    const v2 = parseWorkbook(workbookBuffer([
      cfRow({ apiKey: 'cf-key-2' }),
      row({ model: 'New Img', vendorId: '@cf/new/img', modelStatus: 'Active', type: 'Image Generation' }),
      row({ provider: 'OpenRouter Team', adapter: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'or-key', providerStatus: 'Active', model: 'OR Image', vendorId: 'vendor/or-img', modelStatus: 'Active', type: 'Text-to-Image' }),
    ]), 'v2.xlsx');
    const d = diffInventory(cfg, v2, { 'cloudflare-main': 'cf-key-1' });
    expect(d.summary.newProviders).toBe(1);
    expect(d.summary.newModels).toBe(2);
    expect(d.summary.credentialsUpdated).toBe(2); // rotated CF key + new provider key
  });

  it('reports removed models and warns instead of erasing a key when the workbook key is empty', () => {
    const cfg = { providers: base().providers };
    const v2 = parseWorkbook(workbookBuffer([
      row({ provider: 'Other', adapter: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'X', vendorId: 'x/1', modelStatus: 'Active', type: 'Image Generation' }),
    ]));
    const d = diffInventory(cfg, v2, { 'cloudflare-main': 'cf-key-1' });
    expect(d.removedModels.some((m) => m.name === 'FLUX Schnell')).toBe(true);
    const v3 = parseWorkbook(workbookBuffer([cfRow({ apiKey: '' })]));
    const d3 = diffInventory(cfg, v3, { 'cloudflare-main': 'cf-key-1' });
    expect(d3.warnings.some((w) => /empty API key/.test(w))).toBe(true);
  });

  it('marks models set inactive in the workbook as removed/inactive', () => {
    const cfg = { providers: base().providers };
    const v2 = parseWorkbook(workbookBuffer([cfRow({ modelStatus: 'Inactive' })]));
    const d = diffInventory(cfg, v2, { 'cloudflare-main': 'cf-key-1' });
    expect(d.summary.removedOrInactiveModels).toBeGreaterThanOrEqual(1);
  });
});
