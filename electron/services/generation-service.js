'use strict';
const crypto = require('crypto');
const { getAdapter } = require('../adapters/registry');
const { AdapterError } = require('../adapters/base-adapter');

const ERROR_TO_TEST_STATE = {
  AUTH_FAILED: 'auth-failed', RATE_LIMITED: 'rate-limited', QUOTA_EXHAUSTED: 'quota-exhausted',
  MODEL_NOT_FOUND: 'model-not-found',
};

/**
 * Orchestrates one generation: validates selection against the imported
 * config, resolves the adapter, fetches the credential (main process only),
 * calls the provider, saves image files locally, records history, and updates
 * the model's tested state from the REAL outcome. A model is only ever marked
 * "tested successfully" after an actual successful generation or test.
 */
class GenerationService {
  constructor({ configManager, credentialManager, historyService, imageService }) {
    this.configManager = configManager;
    this.credentialManager = credentialManager;
    this.history = historyService;
    this.images = imageService;
    this.inFlight = new Map(); // requestId -> AbortController
  }
  _find(config, providerId, modelId) {
    const provider = config.providers.find((p) => p.id === providerId);
    if (!provider) throw new AdapterError('The selected provider is no longer in the configuration. Re-import the workbook.', { code: 'CONFIG_MISSING' });
    const model = (provider.models || []).find((m) => m.id === modelId);
    if (!model) throw new AdapterError('The selected model is no longer in the configuration. Re-import the workbook.', { code: 'CONFIG_MISSING' });
    return { provider, model };
  }
  _setTestState(providerId, modelId, state) {
    this.configManager.update((cfg) => {
      const p = cfg.providers.find((x) => x.id === providerId);
      const m = p && (p.models || []).find((x) => x.id === modelId);
      if (m) { m.testState = state; m.lastTestedAt = new Date().toISOString(); }
    });
  }
  /**
   * Record a real generation outcome on the model (v13 learning loop):
   * success/failure counts overall and per prompt category, an EWMA of
   * latency, and a cooldown after rate-limit (90 s) or free-quota
   * exhaustion (until local midnight — free tiers reset daily). The
   * renderer's scoring router reads these on the next run.
   */
  _recordOutcome(providerId, modelId, { ok, ms, code, category }) {
    this.configManager.update((cfg) => {
      const p = cfg.providers.find((x) => x.id === providerId);
      const m = p && (p.models || []).find((x) => x.id === modelId);
      if (!m) return;
      const s = m.stats || (m.stats = { ok: 0, fail: 0, avgMs: 0, byCategory: {} });
      if (ok) s.ok++; else s.fail++;
      if (ms > 0) s.avgMs = s.avgMs ? Math.round(s.avgMs * 0.7 + ms * 0.3) : Math.round(ms);
      if (category) {
        const c = s.byCategory[category] || (s.byCategory[category] = { ok: 0, fail: 0 });
        if (ok) c.ok++; else c.fail++;
      }
      if (ok) m.cooldownUntil = null;
      else if (code === 'RATE_LIMITED') m.cooldownUntil = new Date(Date.now() + 90000).toISOString();
      else if (code === 'QUOTA_EXHAUSTED') { const d = new Date(); d.setHours(24, 0, 0, 0); m.cooldownUntil = d.toISOString(); }
    });
  }
  cancel(requestId) {
    const ctrl = this.inFlight.get(requestId);
    if (ctrl) { ctrl.abort(); return true; }
    return false;
  }
  async generate({ requestId, providerId, modelId, prompt, negativePrompt = '', settings = {}, category = '' }) {
    if (!prompt || !String(prompt).trim()) throw new AdapterError('Enter a prompt first.', { code: 'INVALID_REQUEST' });
    const config = this.configManager.load();
    const { provider, model } = this._find(config, providerId, modelId);
    if (provider.enabled === false || provider.status !== 'active') throw new AdapterError(`Provider "${provider.name}" is disabled or inactive.`, { code: 'INVALID_REQUEST' });
    if (model.enabled === false || model.status !== 'active') throw new AdapterError(`Model "${model.name}" is disabled or inactive.`, { code: 'INVALID_REQUEST' });
    const adapter = getAdapter(provider.adapter || model.adapter);
    if (!adapter) {
      throw new AdapterError(`Provider "${provider.name}" uses an adapter ("${provider.adapterRaw || 'unknown'}") that is not implemented yet. Its configuration was imported, but a new adapter module is required before it can generate images.`, { code: 'UNSUPPORTED_ADAPTER' });
    }
    // Only send settings the adapter actually supports.
    const supported = new Set(adapter.capabilities(model).map((c) => c.key));
    const cleanSettings = {};
    for (const [k, v] of Object.entries(settings || {})) if (supported.has(k)) cleanSettings[k] = v;
    const apiKey = this.credentialManager.getKey(provider.id);
    const ctrl = new AbortController();
    if (requestId) this.inFlight.set(requestId, ctrl);
    const startedAt = Date.now();
    try {
      const results = await adapter.generate({
        provider, model, apiKey, prompt: String(prompt).trim(),
        negativePrompt: adapter.supportsNegativePrompt(model) ? negativePrompt : '',
        settings: cleanSettings, signal: ctrl.signal,
      });
      const saved = [];
      for (const r of results) {
        const file = r.buffer ? this.images.save(r.buffer, model.name, prompt, r.format) : await this.images.downloadRemote(r.remoteUrl, model.name, prompt);
        const rec = this.history.add({
          id: crypto.randomUUID(),
          prompt: String(prompt).trim(), negative_prompt: negativePrompt || '',
          provider_id: provider.id, provider_name: provider.name,
          model_id: model.id, model_name: model.name,
          created_at: new Date().toISOString(), image_path: file.path,
          width: file.width, height: file.height, format: file.format,
          status: 'success', settings: cleanSettings,
        });
        saved.push({ ...rec, fileName: file.name });
      }
      this._setTestState(provider.id, model.id, 'tested-ok');
      this._recordOutcome(provider.id, model.id, { ok: true, ms: Date.now() - startedAt, category });
      return { images: saved, providerName: provider.name, modelName: model.name };
    } catch (e) {
      const state = ERROR_TO_TEST_STATE[e.code];
      if (state) this._setTestState(provider.id, model.id, state);
      // A content-filter refusal says nothing about the model's health —
      // the prompt was refused, not the model — so it is not recorded.
      if (e.code !== 'CONTENT_FILTERED' && e.code !== 'CANCELLED') {
        this._recordOutcome(provider.id, model.id, { ok: false, ms: Date.now() - startedAt, code: e.code, category });
      }
      throw e;
    } finally {
      if (requestId) this.inFlight.delete(requestId);
    }
  }
  /** Real per-model test: performs an actual minimal generation. */
  async testModel(providerId, modelId) {
    try {
      const out = await this.generate({
        requestId: `test-${Date.now()}`, providerId, modelId,
        prompt: 'A simple red circle centered on a plain white background, minimal test image.',
        settings: {},
      });
      return { ok: true, message: `Model generated a test image successfully (${out.images.length} image).`, images: out.images };
    } catch (e) {
      return { ok: false, message: e.message, code: e.code, diagnostic: e.diagnostic || '' };
    }
  }
  /** Connectivity test only — verifies credentials/endpoint, NOT model health. */
  async testProvider(providerId) {
    const config = this.configManager.load();
    const provider = config.providers.find((p) => p.id === providerId);
    if (!provider) return { ok: false, message: 'Provider not found in configuration.' };
    const adapter = getAdapter(provider.adapter);
    if (!adapter) return { ok: false, message: `Adapter "${provider.adapterRaw || 'unknown'}" is not implemented yet.` };
    const apiKey = this.credentialManager.getKey(provider.id);
    const res = await adapter.testConnection({ provider, apiKey });
    this.configManager.update((cfg) => {
      const p = cfg.providers.find((x) => x.id === providerId);
      if (p) p.lastTestedAt = new Date().toISOString();
    });
    return res;
  }
}
module.exports = { GenerationService };
