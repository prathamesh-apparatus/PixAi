// Renderer-side access to the Electron preload bridge (window.pixai).
// In a plain browser (dev:web) every call resolves to a safe empty value so
// the UI can still be previewed; real work happens in the desktop app.
const bridge = typeof window !== 'undefined' ? window.pixai : null;

export const isDesktop = !!bridge;

const emptyConfig = { version: 1, updatedAt: null, sourceFile: null, providers: [] };

function fallback(value) {
  return async () => value;
}

export const api = bridge || {
  getConfig: fallback(emptyConfig),
  importPreview: fallback({ cancelled: true }),
  importPreviewPath: fallback({ cancelled: true }),
  importCommit: fallback({ config: emptyConfig }),
  importCancel: fallback({ ok: true }),
  listBackups: fallback([]),
  restoreBackup: fallback(emptyConfig),
  exportConfig: fallback({ cancelled: true }),
  setProviderEnabled: fallback(emptyConfig),
  setModelEnabled: fallback(emptyConfig),
  addModel: fallback(emptyConfig),
  deleteModel: fallback(emptyConfig),
  describeReference: fallback({ ok: false, error: 'Reference images are available in the desktop app.' }),
  setApiKey: fallback({ ok: false }),
  credentialStatus: fallback({ hasApiKey: false, secure: false }),
  testProvider: fallback({ ok: false, message: 'Available in the desktop app.' }),
  testModel: fallback({ ok: false, message: 'Available in the desktop app.' }),
  modelCapabilities: fallback({ capabilities: [], supportsNegativePrompt: false, supported: false }),
  generate: fallback({ ok: false, error: 'Image generation is available in the desktop app.' }),
  cancelGenerate: fallback({ cancelled: false }),
  historyList: fallback([]),
  historyDelete: fallback({ ok: true }),
  historyFavorite: fallback(null),
  historyClear: fallback({ ok: true }),
  downloadImage: fallback({ cancelled: true }),
  showInFolder: fallback({ ok: true }),
  getSettings: fallback({}),
  setSettings: fallback({}),
  watchConfigure: fallback({ ok: true }),
  watchPickFile: fallback({ cancelled: true }),
  appVersion: fallback('1.0.0'),
  imageUrl: () => '',
  onWatchChanged: () => () => {},
};

export function testStateBadge(state) {
  switch (state) {
    case 'tested-ok': return { label: 'Tested successfully', cls: 'badge-ok' };
    case 'auth-failed': return { label: 'Authentication failed', cls: 'badge-bad' };
    case 'rate-limited': return { label: 'Rate limited', cls: 'badge-warn' };
    case 'quota-exhausted': return { label: 'Free limit ended', cls: 'badge-warn' };
    case 'model-not-found': return { label: 'Model not found', cls: 'badge-bad' };
    default: return { label: 'Not tested', cls: 'badge-mute' };
  }
}
