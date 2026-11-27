import React, { useCallback, useEffect, useState } from 'react';
import MainLayout from './layouts/MainLayout';
import CreateImage from './pages/CreateImage';
import HistoryPage from './pages/History';
import Favorites from './pages/Favorites';
import Providers from './pages/Providers';
import ImportExcel from './pages/ImportExcel';
import Settings from './pages/Settings';
import About from './pages/About';
import { ToastProvider, useToast } from './components/Toasts';
import { api, isDesktop } from './services/api';

function Shell() {
  const toast = useToast();
  const [page, setPage] = useState('create');
  const [collapsed, setCollapsed] = useState(false);
  const [config, setConfig] = useState({ providers: [] });
  const [settings, setSettings] = useState({});
  const [version, setVersion] = useState('1.0.0');
  const [prefill, setPrefill] = useState(null);
  const [watchPreview, setWatchPreview] = useState(null);

  const refreshConfig = useCallback(() => { api.getConfig().then(setConfig).catch(() => {}); }, []);
  useEffect(() => {
    refreshConfig();
    api.getSettings().then(setSettings).catch(() => {});
    api.appVersion().then(setVersion).catch(() => {});
  }, [refreshConfig]);

  useEffect(() => api.onWatchChanged(async ({ path }) => {
    toast('The watched Excel file changed. Review the import preview to apply it.', 'info');
    try {
      const preview = await api.importPreviewPath(path);
      if (preview && !preview.cancelled) { setWatchPreview(preview); setPage('import'); }
    } catch (e) { toast(`Watched workbook could not be read: ${e.message}`, 'error'); }
  }), [toast]);

  const regenerate = (record) => { setPrefill(record); setPage('create'); };
  const firstProvider = (config.providers || [])[0];

  return (
    <MainLayout page={page} onNavigate={setPage} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)}
      providerName={firstProvider && firstProvider.name} modelName="" version={version}>
      {!isDesktop && (
        <div className="rounded-xl border border-line bg-panel px-4 py-2.5 text-xs text-mute mb-4">
          Browser preview mode — install and run the desktop app for importing, generation and history.
        </div>
      )}
      {page === 'create' && <CreateImage config={config} settings={settings} onConfigRefresh={refreshConfig} prefill={prefill} onPrefillUsed={() => setPrefill(null)} />}
      {page === 'history' && <HistoryPage config={config} favoritesOnly={false} onRegenerate={regenerate} />}
      {page === 'favorites' && <Favorites config={config} onRegenerate={regenerate} />}
      {page === 'providers' && <Providers config={config} onRefresh={refreshConfig} onImport={() => setPage('import')} />}
      {page === 'import' && <ImportExcel onImported={refreshConfig} externalPreview={watchPreview} onExternalHandled={() => setWatchPreview(null)} />}
      {page === 'settings' && <Settings config={config} settings={settings} onSettings={setSettings} onRefresh={refreshConfig} />}
      {page === 'about' && <About version={version} config={config} />}
    </MainLayout>
  );
}

export default function App() {
  return <ToastProvider><Shell /></ToastProvider>;
}
