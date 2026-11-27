import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useToast } from '../components/Toasts';
import { Confirm } from '../components/Modal';

export default function Settings({ config, settings, onSettings, onRefresh }) {
  const toast = useToast();
  const [backups, setBackups] = useState([]);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => { api.listBackups().then(setBackups).catch(() => {}); }, [config]);

  const set = async (patch) => { const next = await api.setSettings(patch); onSettings(next); };
  const providers = config.providers || [];
  const models = (providers.find((p) => p.id === settings.defaultProviderId) || {}).models || [];

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="card p-5 space-y-4">
        <h3 className="font-semibold">Defaults</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Default provider</label>
            <select className="input" value={settings.defaultProviderId || ''} onChange={(e) => set({ defaultProviderId: e.target.value, defaultModelId: '' })}>
              <option value="">Select a provider</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Default model</label>
            <select className="input" value={settings.defaultModelId || ''} onChange={(e) => set({ defaultModelId: e.target.value })}>
              <option value="">Select a model</option>
              {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Default aspect ratio</label>
            <select className="input" value={settings.defaultAspectRatio || '1:1'} onChange={(e) => set({ defaultAspectRatio: e.target.value })}>
              {['1:1', '16:9', '9:16', '4:3', '3:4'].map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Default image save location</label>
            <input className="input" placeholder="App data folder (set when downloading)" value={settings.saveDirectory || ''} onChange={(e) => set({ saveDirectory: e.target.value })} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={settings.animations !== false} onChange={(e) => set({ animations: e.target.checked })} /> Enable animations
        </label>
      </div>

      <div className="card p-5 space-y-3">
        <h3 className="font-semibold">Provider workbook</h3>
        <p className="text-sm text-mute leading-relaxed">Providers and models are imported from the command line, not from inside the app. Save your workbook as <b className="text-slate-300">FabrixAPI1.xlsx</b> in the project folder and run:</p>
        <p className="font-mono text-sm text-cy">npm run import -- .\FabrixAPI1.xlsx</p>
        <p className="text-xs text-mute">Add <span className="font-mono">--dry-run</span> to preview changes without saving, or <span className="font-mono">--deactivate</span> to also deactivate models removed from the workbook. Restart the app after importing.</p>
      </div>

      <div className="card p-5 space-y-3">
        <h3 className="font-semibold">Configuration</h3>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={async () => { const r = await api.exportConfig(); if (r.ok) toast('Configuration exported (no credentials included).', 'success'); }}>Export configuration</button>
          <button className="btn-ghost !border-rose-500/50 !text-rose-200" onClick={() => setConfirmClear(true)}>Clear history</button>
        </div>
        <div>
          <label className="label">Restore previous configuration</label>
          {backups.length === 0 && <p className="text-xs text-mute">No backups yet — a backup is saved automatically before every import.</p>}
          <div className="space-y-1.5">
            {backups.map((b) => (
              <div key={b.name} className="flex items-center gap-2 text-sm rounded-xl bg-navy border border-line px-3.5 py-2">
                <span className="truncate">{b.name}</span>
                <button className="btn-ghost !py-1 !px-2.5 text-xs ml-auto" onClick={async () => { await api.restoreBackup(b.name); toast('Configuration restored from backup.', 'success'); onRefresh(); }}>Restore</button>
              </div>
            ))}
          </div>
        </div>
      </div>
      {confirmClear && (
        <Confirm title="Clear all history?" danger confirmLabel="Clear history"
          message="This deletes all generation history records from this computer. Image files in the generated-images folder are not deleted."
          onCancel={() => setConfirmClear(false)}
          onConfirm={async () => { await api.historyClear(); setConfirmClear(false); toast('History cleared.', 'success'); }} />
      )}
    </div>
  );
}
