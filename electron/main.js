'use strict';
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, protocol, safeStorage, dialog, net } = require('electron');
const { pathToFileURL } = require('url');
const { ConfigManager } = require('./services/config-manager');
const { CredentialManager } = require('./services/credential-manager');
const { HistoryService } = require('./services/history-service');
const { ImageService } = require('./services/image-service');
const { SettingsManager } = require('./services/settings-manager');
const { GenerationService } = require('./services/generation-service');
const { registerConfigIpc } = require('./ipc/config-ipc');
const { registerGenerationIpc } = require('./ipc/generation-ipc');
const { registerFileIpc } = require('./ipc/file-ipc');
const { ipcMain } = require('electron');

protocol.registerSchemesAsPrivileged([
  { scheme: 'pixai-img', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let win = null;
let services = null;
let watcher = null;
let watchDebounce = null;

function buildServices() {
  const userData = app.getPath('userData');
  for (const sub of ['config', 'credentials', 'database', 'generated-images', 'logs', 'settings']) {
    fs.mkdirSync(path.join(userData, sub), { recursive: true });
  }
  const configManager = new ConfigManager(userData);
  const credentialManager = new CredentialManager(path.join(userData, 'credentials'), safeStorage);
  const historyService = new HistoryService(userData);
  const imageService = new ImageService(userData);
  const settingsManager = new SettingsManager(userData);
  const generationService = new GenerationService({ configManager, credentialManager, historyService, imageService });
  return { userData, configManager, credentialManager, historyService, imageService, settingsManager, generationService };
}

/** Serve generated images to the renderer from the local folder only. */
function registerImageProtocol(imageDir) {
  protocol.handle('pixai-img', (request) => {
    const name = decodeURIComponent(new URL(request.url).pathname.replace(/^\//, ''));
    const full = path.join(imageDir, path.basename(name));
    if (!full.startsWith(imageDir) || !fs.existsSync(full)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(full).toString());
  });
}

/** Optional: watch a chosen workbook file and ask (never auto-apply) on change. */
function setupWatcher(settingsManager) {
  if (watcher) { watcher.close(); watcher = null; }
  const s = settingsManager.getAll();
  if (!s.watchExcelEnabled || !s.watchExcelPath || !fs.existsSync(s.watchExcelPath)) return;
  let lastSize = fs.statSync(s.watchExcelPath).size;
  watcher = fs.watch(s.watchExcelPath, () => {
    clearTimeout(watchDebounce);
    watchDebounce = setTimeout(() => {
      try {
        const size = fs.statSync(s.watchExcelPath).size;
        if (size === lastSize) return; // still being written / no real change
        lastSize = size;
        if (win && !win.isDestroyed()) win.webContents.send('watch:changed', { path: s.watchExcelPath });
      } catch { /* file mid-save; the next event will fire */ }
    }, 900);
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1500, height: 950, minWidth: 1100, minHeight: 700,
    backgroundColor: '#140d08',
    autoHideMenuBar: true,
    title: 'PixAi — AI Creative Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const devUrl = process.env.PIXAI_DEV_URL || (app.isPackaged ? null : 'http://localhost:5173');
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  services = buildServices();
  registerImageProtocol(path.join(services.userData, 'generated-images'));
  const ctx = { ...services, getWindow: () => win };
  registerConfigIpc(ctx);
  registerGenerationIpc(ctx);
  registerFileIpc(ctx);
  ipcMain.handle('watch:configure', () => { setupWatcher(services.settingsManager); return { ok: true }; });
  ipcMain.handle('watch:pickFile', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose the workbook to watch',
      properties: ['openFile'],
      filters: [{ name: 'Excel workbooks', extensions: ['xlsx', 'xls'] }],
    });
    if (res.canceled || !res.filePaths.length) return { cancelled: true };
    return { ok: true, path: res.filePaths[0] };
  });
  ipcMain.handle('app:version', () => app.getVersion());
  setupWatcher(services.settingsManager);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
