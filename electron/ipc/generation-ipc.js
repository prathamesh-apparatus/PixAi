'use strict';
const { ipcMain } = require('electron');
const { getAdapter } = require('../adapters/registry');
const { str, id, obj } = require('../security');

function registerGenerationIpc(ctx) {
  const { generationService, configManager } = ctx;

  ipcMain.handle('models:capabilities', (_e, payload) => {
    obj(payload);
    const pid = id(payload.providerId, 'providerId'); const mid = id(payload.modelId, 'modelId');
    const cfg = configManager.load();
    const provider = cfg.providers.find((p) => p.id === pid);
    const model = provider && (provider.models || []).find((m) => m.id === mid);
    if (!provider || !model) return { capabilities: [], supportsNegativePrompt: false, supported: false };
    const adapter = getAdapter(provider.adapter);
    if (!adapter) return { capabilities: [], supportsNegativePrompt: false, supported: false };
    return {
      capabilities: adapter.capabilities(model),
      supportsNegativePrompt: !!adapter.supportsNegativePrompt(model),
      supported: true,
    };
  });

  ipcMain.handle('generate:start', async (_e, payload) => {
    obj(payload);
    const requestId = id(payload.requestId, 'requestId');
    const providerId = id(payload.providerId, 'providerId');
    const modelId = id(payload.modelId, 'modelId');
    const prompt = str(payload.prompt, { max: 4000, name: 'prompt' });
    const negativePrompt = payload.negativePrompt ? str(payload.negativePrompt, { max: 2000, name: 'negativePrompt' }) : '';
    const settings = payload.settings && typeof payload.settings === 'object' ? payload.settings : {};
    try {
      const out = await generationService.generate({ requestId, providerId, modelId, prompt, negativePrompt, settings });
      return { ok: true, ...out };
    } catch (e) {
      return { ok: false, error: e.message, code: e.code || 'ERROR', diagnostic: e.diagnostic || '' };
    }
  });
  ipcMain.handle('generate:cancel', (_e, payload) => {
    obj(payload);
    return { cancelled: generationService.cancel(id(payload.requestId, 'requestId')) };
  });
  ipcMain.handle('providers:test', async (_e, payload) => {
    obj(payload);
    return generationService.testProvider(id(payload.providerId, 'providerId'));
  });
  ipcMain.handle('models:test', async (_e, payload) => {
    obj(payload);
    return generationService.testModel(id(payload.providerId, 'providerId'), id(payload.modelId, 'modelId'));
  });
}
module.exports = { registerGenerationIpc };
