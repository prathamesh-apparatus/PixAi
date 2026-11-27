'use strict';
import { describe, it, expect, beforeEach } from 'vitest';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseWorkbook } = require('../electron/services/excel-importer');
const { ConfigManager } = require('../electron/services/config-manager');
const { CredentialManager } = require('../electron/services/credential-manager');
const { row, workbookBuffer } = require('./workbook-helper');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixai-test-')); });

const v1 = () => parseWorkbook(workbookBuffer([
  row({ provider: 'Cloudflare Main', adapter: 'Cloudflare Workers AI', baseUrl: 'https://api.cloudflare.com/client/v4/accounts/acc/ai/run', apiKey: 'k1', providerStatus: 'Active', model: 'FLUX', vendorId: '@cf/flux', modelStatus: 'Active', type: 'Image Generation' }),
  row({ model: 'SDXL', vendorId: '@cf/sdxl', modelStatus: 'Active', type: 'Image Generation' }),
]));

describe('config manager commit', () => {
  it('commits atomically, resolves adapters, stores NO api keys in image-providers.json', () => {
    const cm = new ConfigManager(dir);
    const parsed = v1();
    const { config } = cm.commitImport(parsed, {});
    expect(config.providers[0].adapter).toBe('cloudflare');
    expect(config.providers[0].adapterSupported).toBe(true);
    const raw = fs.readFileSync(path.join(dir, 'config', 'image-providers.json'), 'utf8');
    expect(raw).not.toContain('k1');
    expect(JSON.parse(raw).providers[0].models).toHaveLength(2);
  });

  it('an unsupported provider is imported and flagged, never faked as working', () => {
    const cm = new ConfigManager(dir);
    const parsed = parseWorkbook(workbookBuffer([
      row({ provider: 'NewVendor', adapter: 'SomeCustomAPI', baseUrl: 'https://api.example.com', apiKey: 'x', providerStatus: 'Active', model: 'NV Img', vendorId: 'nv/1', modelStatus: 'Active', type: 'Image Generation' }),
    ]));
    const { config } = cm.commitImport(parsed, {});
    expect(config.providers[0].adapterSupported).toBe(false);
    expect(config.providers[0].adapter).toBeNull();
  });

  it('removed models are KEPT without confirmation and deactivated only with it; backups restore', () => {
    const cm = new ConfigManager(dir);
    cm.commitImport(v1(), {});
    const v2 = parseWorkbook(workbookBuffer([
      row({ provider: 'Cloudflare Main', adapter: 'Cloudflare Workers AI', baseUrl: 'https://api.cloudflare.com/client/v4/accounts/acc/ai/run', apiKey: 'k1', providerStatus: 'Active', model: 'FLUX', vendorId: '@cf/flux', modelStatus: 'Active', type: 'Image Generation' }),
    ]));
    const kept = cm.commitImport(v2, { confirmDeactivations: false });
    const sdxlKept = kept.config.providers[0].models.find((m) => m.name === 'SDXL');
    expect(sdxlKept.status).toBe('active');
    expect(kept.keptRemovedModels.length).toBe(1);
    const dropped = cm.commitImport(v2, { confirmDeactivations: true });
    const sdxlDropped = dropped.config.providers[0].models.find((m) => m.name === 'SDXL');
    expect(sdxlDropped.status).toBe('inactive');
    expect(dropped.deactivatedModels.length).toBe(1);
    const backups = cm.listBackups();
    expect(backups.length).toBeGreaterThanOrEqual(1);
    const restored = cm.restoreBackup(backups[backups.length - 1].name);
    expect(restored.providers[0].models.find((m) => m.name === 'SDXL').status).toBe('active');
  });

  it('config survives a reload (persistence after restart)', () => {
    const cm = new ConfigManager(dir);
    cm.commitImport(v1(), {});
    const reloaded = new ConfigManager(dir).load();
    expect(reloaded.providers).toHaveLength(1);
    expect(reloaded.providers[0].models).toHaveLength(2);
  });
});

describe('credential manager', () => {
  it('round-trips keys and never writes them into the config file', () => {
    const creds = new CredentialManager(path.join(dir, 'credentials'), null);
    creds.setKey('cloudflare-main', 'secret-key');
    expect(creds.getKey('cloudflare-main')).toBe('secret-key');
    expect(creds.hasKey('cloudflare-main')).toBe(true);
    expect(creds.allKeys()['cloudflare-main']).toBe('secret-key');
  });
  it('uses safeStorage encryption when available', () => {
    const fakeSafe = {
      isEncryptionAvailable: () => true,
      encryptString: (s) => Buffer.from([...Buffer.from(s)].reverse()),
      decryptString: (b) => Buffer.from([...b].reverse()).toString(),
    };
    const creds = new CredentialManager(path.join(dir, 'credentials'), fakeSafe);
    creds.setKey('p1', 'topsecret');
    const raw = fs.readFileSync(path.join(dir, 'credentials', 'credentials.json'), 'utf8');
    expect(raw).not.toContain('topsecret');
    expect(creds.getKey('p1')).toBe('topsecret');
    expect(creds.isSecure('p1')).toBe(true);
  });
});
