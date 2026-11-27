import React, { useCallback, useEffect, useState } from 'react';
import MainLayout from './layouts/MainLayout';
import CreateImage from './pages/CreateImage';
import HistoryPage from './pages/History';
import Favorites from './pages/Favorites';
import Providers from './pages/Providers';
import Settings from './pages/Settings';
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

  const refreshConfig = useCallback(() => { api.getConfig().then(setConfig).catch(() => {}); }, []);
  useEffect(() => {
    refreshConfig();
    api.getSettings().then(setSettings).catch(() => {});
    api.appVersion().then(setVersion).catch(() => {});
  }, [refreshConfig]);

  useEffect(() => api.onWatchChanged(() => {
    toast('Your Excel workbook changed. Run: npm run import -- .\\FabrixAPI1.xlsx — then restart the app to use the updated providers and models.', 'info');
  }), [toast]);

  const regenerate = (record) => { setPrefill(record); setPage('create'); };
  const firstProvider = (config.providers || [])[0];

  return (
    <MainLayout page={page} onNavigate={setPage} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)}
      providerName={firstProvider && firstProvider.name} modelName="" version={version}>
      {!isDesktop && (
        <div className="border border-line bg-panel px-4 py-2.5 text-xs text-mute mb-4" style={{ borderRadius: 14 }}>
          Browser preview mode — run the desktop app for generation and history.
        </div>
      )}
      {page === 'create' && <CreateImage config={config} settings={settings} onConfigRefresh={refreshConfig} prefill={prefill} onPrefillUsed={() => setPrefill(null)} />}
      {page === 'history' && <HistoryPage config={config} favoritesOnly={false} onRegenerate={regenerate} />}
      {page === 'favorites' && <Favorites config={config} onRegenerate={regenerate} />}
      {page === 'providers' && <Providers config={config} onRefresh={refreshConfig} />}
      {page === 'settings' && <Settings config={config} settings={settings} onSettings={setSettings} onRefresh={refreshConfig} />}
    </MainLayout>
  );
}

export default function App() {
  return <ToastProvider><Shell /></ToastProvider>;
}
