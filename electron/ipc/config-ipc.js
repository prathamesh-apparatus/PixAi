'use strict';
const fs = require('fs');
const path = require('path');
const { ipcMain, dialog } = require('electron');
const { parseWorkbook, diffInventory } = require('../services/excel-importer');
const { ConfigManager } = require('../services/config-manager');
const { str, id, bool, obj } = require('../security');

/**
 * Config + Excel import IPC.
 * Import flow (safe, two-phase): preview parses + diffs WITHOUT touching the
 * stored configuration; the parsed inventory is kept in main-process memory
 * under a preview id. Commit backs up the old config, stores any new
 * credentials in the credential manager, then atomically writes the new
 * config. API keys are never included in anything returned to the renderer.
 */
function registerConfigIpc(ctx) {
  const { configManager, credentialManager, settingsManager, getWindow } = ctx;
  const pending = new Map(); // previewId -> parsed

  function makePreview(parsed) {
    const previewId = `pv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pending.set(previewId, parsed);
    const existingKeys = credentialManager.allKeys();
    const diff = diffInventory(configManager.load(), parsed, existingKeys);
    return {
      previewId,
      sourceFile: parsed.sourceFile,
      sheetName: parsed.sheetName,
      summary: diff.summary,
      sections: {
        newProviders: diff.newProviders, updatedProviders: diff.updatedProviders,
        newModels: diff.newModels, updatedModels: diff.updatedModels,
        removedModels: diff.removedModels, unchangedModels: diff.unchangedModels,
        unsupportedProviders: diff.unsupportedProviders, credentialsUpdated: diff.credentialsUpdated,
        warnings: diff.warnings,
      },
      hasRemovals: diff.removedModels.length > 0,
    };
  }

  ipcMain.handle('config:get', () => ConfigManager.publicConfig(configManager.load()));

  ipcMain.handle('config:importPreview', async () => {
    const win = getWindow();
    const res = await dialog.showOpenDialog(win, {
      title: 'Import provider workbook',
      properties: ['openFile'],
      filters: [{ name: 'Excel workbooks', extensions: ['xlsx', 'xls'] }],
    });
    if (res.canceled || !res.filePaths.length) return { cancelled: true };
    const file = res.filePaths[0];
    const parsed = parseWorkbook(fs.readFileSync(file), path.basename(file));
    return makePreview(parsed);
  });

  ipcMain.handle('config:importPreviewPath', (_e, payload) => {
    obj(payload);
    const file = str(payload.path, { max: 1000, name: 'path' });
    const parsed = parseWorkbook(fs.readFileSync(file), path.basename(file));
    return makePreview(parsed);
  });

  ipcMain.handle('config:importCommit', (_e, payload) => {
    obj(payload);
    const previewId = id(payload.previewId, 'previewId');
    const parsed = pending.get(previewId);
    if (!parsed) throw new Error('This import preview has expired. Please import the workbook again.');
    const confirmDeactivations = payload.confirmDeactivations === true;
    // Credentials first (empty workbook key never erases a saved key: the
    // parser only yields credentials that were actually present).
    for (const [providerId, key] of Object.entries(parsed.credentials)) {
      if (key) credentialManager.setKey(providerId, key);
    }
    const { config, deactivatedModels, keptRemovedModels } = configManager.commitImport(parsed, { confirmDeactivations });
    pending.delete(previewId);
    return { config: ConfigManager.publicConfig(config), deactivatedModels, keptRemovedModels };
  });

  ipcMain.handle('config:importCancel', (_e, payload) => {
    obj(payload); pending.delete(id(payload.previewId, 'previewId')); return { ok: true };
  });

  ipcMain.handle('config:backups', () => configManager.listBackups());
  ipcMain.handle('config:restore', (_e, payload) => {
    obj(payload);
    return ConfigManager.publicConfig(configManager.restoreBackup(str(payload.name, { max: 200, name: 'name' })));
  });
  ipcMain.handle('config:export', async () => {
    const win = getWindow();
    const res = await dialog.showSaveDialog(win, {
      title: 'Export provider configuration (no credentials)',
      defaultPath: 'image-providers-export.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePath) return { cancelled: true };
    fs.writeFileSync(res.filePath, JSON.stringify(ConfigManager.publicConfig(configManager.load()), null, 2));
    return { ok: true, path: res.filePath };
  });

  ipcMain.handle('providers:setEnabled', (_e, payload) => {
    obj(payload);
    const pid = id(payload.providerId, 'providerId'); const enabled = bool(payload.enabled, 'enabled');
    return ConfigManager.publicConfig(configManager.update((cfg) => {
      const p = cfg.providers.find((x) => x.id === pid); if (p) p.enabled = enabled;
    }));
  });
  ipcMain.handle('models:setEnabled', (_e, payload) => {
    obj(payload);
    const pid = id(payload.providerId, 'providerId'); const mid = id(payload.modelId, 'modelId'); const enabled = bool(payload.enabled, 'enabled');
    return ConfigManager.publicConfig(configManager.update((cfg) => {
      const p = cfg.providers.find((x) => x.id === pid);
      const m = p && (p.models || []).find((x) => x.id === mid); if (m) m.enabled = enabled;
    }));
  });
  ipcMain.handle('providers:setApiKey', (_e, payload) => {
    obj(payload);
    const pid = id(payload.providerId, 'providerId');
    const key = str(payload.apiKey, { max: 2000, name: 'apiKey' });
    if (key) credentialManager.setKey(pid, key);
    return { ok: true, hasApiKey: credentialManager.hasKey(pid), secure: credentialManager.isSecure(pid) };
  });
  ipcMain.handle('providers:credentialStatus', (_e, payload) => {
    obj(payload);
    const pid = id(payload.providerId, 'providerId');
    return { hasApiKey: credentialManager.hasKey(pid), secure: credentialManager.isSecure(pid) };
  });
  ipcMain.handle('settings:get', () => settingsManager.getAll());
  ipcMain.handle('settings:set', (_e, payload) => {
    obj(payload);
    const allowed = ['defaultProviderId', 'defaultModelId', 'defaultAspectRatio', 'saveDirectory', 'theme', 'animations', 'watchExcelEnabled', 'watchExcelPath'];
    const patch = {};
    for (const k of allowed) if (k in payload) patch[k] = payload[k];
    return settingsManager.set(patch);
  });
}
module.exports = { registerConfigIpc };
