'use strict';
const path = require('path');
const { ipcMain, dialog, shell } = require('electron');
const { str, id, obj } = require('../security');

function registerFileIpc(ctx) {
  const { historyService, imageService, getWindow } = ctx;

  ipcMain.handle('history:list', (_e, payload = {}) => {
    const p = payload && typeof payload === 'object' ? payload : {};
    return historyService.list({
      search: p.search ? str(p.search, { max: 300, name: 'search' }) : '',
      providerId: p.providerId ? id(p.providerId, 'providerId') : '',
      modelId: p.modelId ? id(p.modelId, 'modelId') : '',
      favoritesOnly: p.favoritesOnly === true,
    });
  });
  ipcMain.handle('history:delete', (_e, payload) => {
    obj(payload);
    const rec = historyService.remove(id(payload.recordId, 'recordId'));
    if (rec && payload.deleteFile === true) imageService.deleteFile(rec.image_path);
    return { ok: true, record: rec };
  });
  ipcMain.handle('history:favorite', (_e, payload) => {
    obj(payload);
    return historyService.toggleFavorite(id(payload.recordId, 'recordId'));
  });
  ipcMain.handle('history:clear', () => { historyService.clear(); return { ok: true }; });

  ipcMain.handle('file:download', async (_e, payload) => {
    obj(payload);
    const rec = historyService.get(id(payload.recordId, 'recordId'));
    if (!rec) throw new Error('That history record no longer exists.');
    const win = getWindow();
    const res = await dialog.showSaveDialog(win, {
      title: 'Save image',
      defaultPath: path.basename(rec.image_path),
    });
    if (res.canceled || !res.filePath) return { cancelled: true };
    imageService.copyTo(rec.image_path, res.filePath);
    return { ok: true, path: res.filePath };
  });
  ipcMain.handle('file:showInFolder', (_e, payload) => {
    obj(payload);
    const rec = historyService.get(id(payload.recordId, 'recordId'));
    if (rec) shell.showItemInFolder(rec.image_path);
    return { ok: true };
  });
}
module.exports = { registerFileIpc };
