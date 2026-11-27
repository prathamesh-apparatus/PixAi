'use strict';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseWorkbook } = require('../electron/services/excel-importer');
const { ConfigManager } = require('../electron/services/config-manager');
const { CredentialManager } = require('../electron/services/credential-manager');
const { HistoryService } = require('../electron/services/history-service');
const { ImageService } = require('../electron/services/image-service');
const { GenerationService } = require('../electron/services/generation-service');
const { row, workbookBuffer, PNG_1PX } = require('./workbook-helper');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixai-gen-')); });
afterEach(() => { global.fetch = undefined; });

function setup() {
  const configManager = new ConfigManager(dir);
  const credentialManager = new CredentialManager(path.join(dir, 'credentials'), null);
  const parsed = parseWorkbook(workbookBuffer([
    row({ provider: 'GenAI', adapter: 'OpenAI', baseUrl: 'https://api.example.com/v1', apiKey: 'gen-key', providerStatus: 'Active', model: 'Gen Img', vendorId: 'img-1', modelStatus: 'Active', type: 'Image Generation' }),
  ]));
  for (const [pid, key] of Object.entries(parsed.credentials)) credentialManager.setKey(pid, key);
  configManager.commitImport(parsed, {});
  const historyService = new HistoryService(dir);
  const imageService = new ImageService(dir);
  const generationService = new GenerationService({ configManager, credentialManager, historyService, imageService });
  return { configManager, historyService, generationService };
}

describe('history service', () => {
  it('adds, searches, filters, favorites and deletes records (files untouched by record delete)', () => {
    const h = new HistoryService(dir);
    const img = new ImageService(dir);
    const f = img.save(PNG_1PX, 'Gen Img', 'a red apple on a table', 'png');
    h.add({ id: '1', prompt: 'a red apple on a table', provider_id: 'genai', provider_name: 'GenAI', model_id: 'genai::img-1', model_name: 'Gen Img', created_at: new Date().toISOString(), image_path: f.path, width: 1, height: 1, format: 'png', status: 'success', settings: {} });
    expect(h.count()).toBe(1);
    expect(h.list({ search: 'apple' })).toHaveLength(1);
    expect(h.list({ search: 'banana' })).toHaveLength(0);
    expect(h.list({ providerId: 'genai' })).toHaveLength(1);
    h.toggleFavorite('1');
    expect(h.list({ favoritesOnly: true })).toHaveLength(1);
    const removed = h.remove('1');
    expect(removed.id).toBe('1');
    expect(fs.existsSync(f.path)).toBe(true); // record delete does not delete the file by itself
    expect(f.name).toMatch(/^gen-img-a-red-apple-on-\d{4}-\d{2}-\d{2}\.png$/);
    expect(f.width).toBe(1); expect(f.height).toBe(1);
  });
});

describe('generation service (end-to-end with a mocked provider)', () => {
  it('generates, saves the image locally, records history, and only then marks the model tested-ok', async () => {
    const { configManager, historyService, generationService } = setup();
    const before = configManager.load().providers[0].models[0];
    expect(before.testState).toBe('not-tested');
    global.fetch = async (url, opts) => {
      expect(url).toBe('https://api.example.com/v1/images/generations');
      expect(opts.headers.Authorization).toBe('Bearer gen-key');
      return {
        ok: true, status: 200, headers: { get: () => 'application/json' },
        json: async () => ({ data: [{ b64_json: PNG_1PX.toString('base64') }] }),
        text: async () => '', arrayBuffer: async () => new ArrayBuffer(0),
      };
    };
    const cfg = configManager.load();
    const out = await generationService.generate({
      requestId: 'r1', providerId: cfg.providers[0].id, modelId: cfg.providers[0].models[0].id,
      prompt: 'a lighthouse at dawn', settings: { size: '1024x1024', bogusSetting: 1 },
    });
    expect(out.images).toHaveLength(1);
    expect(fs.existsSync(out.images[0].image_path)).toBe(true);
    expect(historyService.count()).toBe(1);
    expect(historyService.list({ search: 'lighthouse' })).toHaveLength(1);
    expect(configManager.load().providers[0].models[0].testState).toBe('tested-ok');
    // unsupported settings are never sent upstream — covered by adapter body construction
  });

  it('a 401 marks the model auth-failed and surfaces the real reason, with no fake history', async () => {
    const { configManager, historyService, generationService } = setup();
    global.fetch = async () => ({
      ok: false, status: 401, headers: { get: () => 'application/json' },
      text: async () => '{"error":{"message":"invalid api key"}}',
      json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0),
    });
    const cfg = configManager.load();
    await expect(generationService.generate({
      requestId: 'r2', providerId: cfg.providers[0].id, modelId: cfg.providers[0].models[0].id, prompt: 'x', settings: {},
    })).rejects.toMatchObject({ code: 'AUTH_FAILED' });
    expect(historyService.count()).toBe(0);
    expect(configManager.load().providers[0].models[0].testState).toBe('auth-failed');
  });

  it('an unsupported-adapter provider fails loudly instead of pretending', async () => {
    const configManager = new ConfigManager(dir);
    const credentialManager = new CredentialManager(path.join(dir, 'credentials'), null);
    const parsed = parseWorkbook(workbookBuffer([
      row({ provider: 'Odd', adapter: 'OddAPI', baseUrl: 'https://odd.example', apiKey: 'k', providerStatus: 'Active', model: 'Odd Img', vendorId: 'odd/1', modelStatus: 'Active', type: 'Image Generation' }),
    ]));
    configManager.commitImport(parsed, {});
    const gs = new GenerationService({ configManager, credentialManager, historyService: new HistoryService(dir), imageService: new ImageService(dir) });
    const cfg = configManager.load();
    await expect(gs.generate({ requestId: 'r3', providerId: cfg.providers[0].id, modelId: cfg.providers[0].models[0].id, prompt: 'x', settings: {} }))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_ADAPTER' });
  });
});
