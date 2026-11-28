'use strict';
const { contextBridge, ipcRenderer } = require('electron');

/**
 * The ONLY bridge between renderer and main. Allowlisted methods only —
 * the renderer never gets Node access and never sees API keys.
 */
const api = {
  getConfig: () => ipcRenderer.invoke('config:get'),
  importPreview: () => ipcRenderer.invoke('config:importPreview'),
  importPreviewPath: (path) => ipcRenderer.invoke('config:importPreviewPath', { path }),
  importCommit: (previewId, confirmDeactivations) => ipcRenderer.invoke('config:importCommit', { previewId, confirmDeactivations }),
  importCancel: (previewId) => ipcRenderer.invoke('config:importCancel', { previewId }),
  listBackups: () => ipcRenderer.invoke('config:backups'),
  restoreBackup: (name) => ipcRenderer.invoke('config:restore', { name }),
  exportConfig: () => ipcRenderer.invoke('config:export'),
  setProviderEnabled: (providerId, enabled) => ipcRenderer.invoke('providers:setEnabled', { providerId, enabled }),
  setModelEnabled: (providerId, modelId, enabled) => ipcRenderer.invoke('models:setEnabled', { providerId, modelId, enabled }),
  addModel: (providerId, data) => ipcRenderer.invoke('models:add', { providerId, ...data }),
  deleteModel: (providerId, modelId) => ipcRenderer.invoke('models:delete', { providerId, modelId }),
  describeReference: (payload) => ipcRenderer.invoke('vision:describe', payload),
  setApiKey: (providerId, apiKey) => ipcRenderer.invoke('providers:setApiKey', { providerId, apiKey }),
  credentialStatus: (providerId) => ipcRenderer.invoke('providers:credentialStatus', { providerId }),
  testProvider: (providerId) => ipcRenderer.invoke('providers:test', { providerId }),
  testModel: (providerId, modelId) => ipcRenderer.invoke('models:test', { providerId, modelId }),
  modelCapabilities: (providerId, modelId) => ipcRenderer.invoke('models:capabilities', { providerId, modelId }),
  generate: (payload) => ipcRenderer.invoke('generate:start', payload),
  cancelGenerate: (requestId) => ipcRenderer.invoke('generate:cancel', { requestId }),
  historyList: (query) => ipcRenderer.invoke('history:list', query || {}),
  historyDelete: (recordId, deleteFile) => ipcRenderer.invoke('history:delete', { recordId, deleteFile }),
  historyFavorite: (recordId) => ipcRenderer.invoke('history:favorite', { recordId }),
  historyClear: () => ipcRenderer.invoke('history:clear'),
  downloadImage: (recordId) => ipcRenderer.invoke('file:download', { recordId }),
  showInFolder: (recordId) => ipcRenderer.invoke('file:showInFolder', { recordId }),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  watchConfigure: () => ipcRenderer.invoke('watch:configure'),
  watchPickFile: () => ipcRenderer.invoke('watch:pickFile'),
  appVersion: () => ipcRenderer.invoke('app:version'),
  imageUrl: (imagePath) => `pixai-img://local/${encodeURIComponent(String(imagePath).split(/[\\/]/).pop())}`,
  onWatchChanged: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('watch:changed', handler);
    return () => ipcRenderer.removeListener('watch:changed', handler);
  },
};

contextBridge.exposeInMainWorld('pixai', api);
