'use strict';
const fs = require('fs');
const path = require('path');
const { resolveAdapter } = require('../adapters/registry');

/**
 * Owns image-providers.json (non-secret provider/model inventory) inside the
 * Electron user-data directory:
 *   config/image-providers.json
 *   config/configuration-backups/<timestamp>.json
 * Imports are committed atomically (write temp + rename) after a backup of the
 * previous configuration, so a failed or bad import never destroys a working
 * configuration.
 */
class ConfigManager {
  constructor(userDataDir) {
    this.configDir = path.join(userDataDir, 'config');
    this.backupDir = path.join(this.configDir, 'configuration-backups');
    this.file = path.join(this.configDir, 'image-providers.json');
  }
  load() {
    try {
      const cfg = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (cfg && Array.isArray(cfg.providers)) return cfg;
    } catch { /* no config yet */ }
    return { version: 1, updatedAt: null, sourceFile: null, providers: [] };
  }
  _writeAtomic(cfg) {
    fs.mkdirSync(this.configDir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
    fs.renameSync(tmp, this.file);
  }
  backup() {
    const current = this.load();
    if (!current.providers.length) return null;
    fs.mkdirSync(this.backupDir, { recursive: true });
    const name = `config-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.writeFileSync(path.join(this.backupDir, name), JSON.stringify(current, null, 2));
    return name;
  }
  listBackups() {
    try {
      return fs.readdirSync(this.backupDir).filter((f) => f.endsWith('.json')).sort().reverse()
        .map((name) => ({ name, at: name.replace('config-', '').replace('.json', '') }));
    } catch { return []; }
  }
  restoreBackup(name) {
    const safe = path.basename(name);
    const data = JSON.parse(fs.readFileSync(path.join(this.backupDir, safe), 'utf8'));
    if (!data || !Array.isArray(data.providers)) throw new Error('That backup file is not a valid configuration.');
    this.backup();
    this._writeAtomic(data);
    return this.load();
  }
  /**
   * Commit a parsed workbook inventory.
   * - Existing enabled/test state is preserved for records that still exist.
   * - Models missing from the workbook (or marked inactive) are only
   *   deactivated when confirmDeactivations is true; otherwise they are kept
   *   untouched and reported back.
   */
  commitImport(parsed, { confirmDeactivations = false } = {}) {
    this.backup();
    const current = this.load();
    const curProviders = new Map(current.providers.map((p) => [p.id, p]));
    const result = { deactivatedModels: [], keptRemovedModels: [] };
    const providers = parsed.providers.map((p) => {
      const resolution = resolveAdapter(p);
      const cur = curProviders.get(p.id);
      const curModels = new Map(((cur && cur.models) || []).map((m) => [m.id, m]));
      const models = p.models.map((m) => {
        const cm = curModels.get(m.id);
        return {
          ...m,
          adapter: resolution.adapterId,
          adapterSupported: resolution.supported,
          enabled: cm ? cm.enabled !== false : true,
          testState: cm ? (cm.testState || 'not-tested') : 'not-tested',
          lastTestedAt: cm ? (cm.lastTestedAt || null) : null,
        };
      });
      // Previously known models that are gone from this workbook.
      if (cur) {
        const newIds = new Set(models.map((m) => m.id));
        for (const cm of cur.models || []) {
          if (newIds.has(cm.id)) continue;
          if (confirmDeactivations) {
            models.push({ ...cm, status: 'inactive', enabled: false, removedFromWorkbook: true });
            result.deactivatedModels.push(cm.id);
          } else {
            models.push(cm);
            result.keptRemovedModels.push(cm.id);
          }
        }
      }
      return {
        ...p,
        adapter: resolution.adapterId,
        adapterSupported: resolution.supported,
        adapterSource: resolution.source,
        enabled: cur ? cur.enabled !== false : true,
        models,
      };
    });
    const cfg = {
      version: 1, updatedAt: new Date().toISOString(), sourceFile: parsed.sourceFile, providers,
      // Chat/vision providers (Gemini & friends) ride along in the same file —
      // they power the reference-image → prompt conversion, never image gen.
      chatProviders: parsed.chatProviders !== undefined ? parsed.chatProviders : (current.chatProviders || []),
    };
    this._writeAtomic(cfg);
    return { config: cfg, ...result };
  }
  /** Add one image model to a provider from inside the app (Settings). */
  addModel(providerId, { name, vendorModelId, description = '' } = {}) {
    const vendor = String(vendorModelId || '').trim();
    if (!vendor) throw new Error('Enter the vendor model ID (exactly as the provider names it).');
    return this.update((cfg) => {
      const p = cfg.providers.find((x) => x.id === providerId);
      if (!p) throw new Error('Provider not found in the configuration.');
      const modelId = `${providerId}::${vendor.toLowerCase()}`;
      if ((p.models || []).some((m) => m.id === modelId)) throw new Error('That model already exists under this provider.');
      const resolution = resolveAdapter(p);
      p.models = p.models || [];
      p.models.push({
        id: modelId, providerId,
        name: String(name || '').trim() || vendor,
        vendorModelId: vendor,
        description: String(description || '').trim(),
        modelType: 'Text to Image generation',
        status: 'active', statusRaw: 'live', enabled: true,
        testState: 'not-tested', lastTestedAt: null,
        adapter: resolution.adapterId, adapterSupported: resolution.supported,
        addedManually: true,
      });
    });
  }
  /** Remove one model from a provider (Settings). History records keep their
   *  own copy of the model name, so past generations are unaffected. */
  deleteModel(providerId, modelId) {
    return this.update((cfg) => {
      const p = cfg.providers.find((x) => x.id === providerId);
      if (!p) throw new Error('Provider not found in the configuration.');
      const before = (p.models || []).length;
      p.models = (p.models || []).filter((m) => m.id !== modelId);
      if (p.models.length === before) throw new Error('Model not found under this provider.');
    });
  }
  /** Persist small mutations (enable/disable, test state) made outside imports. */
  update(mutator) {
    const cfg = this.load();
    mutator(cfg);
    cfg.updatedAt = new Date().toISOString();
    this._writeAtomic(cfg);
    return cfg;
  }
  /** Strip anything that must never reach the renderer/logs (defensive: config holds no keys by design). */
  static publicConfig(cfg) {
    return JSON.parse(JSON.stringify(cfg, (k, v) => (k === 'apiKey' || k === 'credentials' ? undefined : v)));
  }
}
module.exports = { ConfigManager };
