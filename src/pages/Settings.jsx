import React, { useEffect, useState } from 'react';
import { Upload, KeyRound, Plus, Trash2, X } from 'lucide-react';
import { api, testStateBadge } from '../services/api';
import { useToast } from '../components/Toasts';
import { Confirm } from '../components/Modal';
import Modal from '../components/Modal';

export default function Settings({ config, settings, onSettings, onRefresh }) {
  const toast = useToast();
  const [backups, setBackups] = useState([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [keyInputs, setKeyInputs] = useState({});
  const [keySaved, setKeySaved] = useState({});
  const [addForms, setAddForms] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [preview, setPreview] = useState(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [applying, setApplying] = useState(false);

  const providers = config.providers || [];

  useEffect(() => { api.listBackups().then(setBackups).catch(() => {}); }, [config]);
  useEffect(() => {
    let live = true;
    (async () => {
      const map = {};
      for (const p of providers) {
        try { const s = await api.credentialStatus(p.id); map[p.id] = !!s.hasApiKey; } catch { map[p.id] = !!p.hasApiKey; }
      }
      if (live) setKeySaved(map);
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const set = async (patch) => { const next = await api.setSettings(patch); onSettings(next); };

  async function saveKey(providerId) {
    const key = (keyInputs[providerId] || '').trim();
    if (!key) { toast('Paste the new API key first.', 'warn'); return; }
    try {
      const r = await api.setApiKey(providerId, key);
      setKeySaved((m) => ({ ...m, [providerId]: !!r.hasApiKey }));
      setKeyInputs((m) => ({ ...m, [providerId]: '' }));
      toast('API key saved securely on this computer.', 'success');
    } catch (e) { toast(e.message || 'Could not save the key.', 'error'); }
  }

  async function addModel(providerId) {
    const f = addForms[providerId] || {};
    if (!f.vendorModelId || !f.vendorModelId.trim()) { toast('Enter the vendor model ID.', 'warn'); return; }
    try {
      await api.addModel(providerId, { name: f.name || '', vendorModelId: f.vendorModelId.trim(), description: f.description || '' });
      setAddForms((m) => ({ ...m, [providerId]: { open: false, name: '', vendorModelId: '', description: '' } }));
      toast('Model added. It joins the auto pool right away — generate or test it to confirm it works.', 'success');
      onRefresh();
    } catch (e) { toast(e.message || 'Could not add the model.', 'error'); }
  }

  async function startImport() {
    try {
      const p = await api.importPreview();
      if (p.cancelled) return;
      setPreview(p);
      setConfirmDeactivate(false);
    } catch (e) { toast(e.message || 'Could not read that workbook.', 'error'); }
  }

  async function applyImport() {
    setApplying(true);
    try {
      const r = await api.importCommit(preview.previewId, confirmDeactivate);
      setPreview(null);
      toast('Workbook applied — providers and models are up to date.', 'success');
      if (r.deactivatedModels && r.deactivatedModels.length) toast(`${r.deactivatedModels.length} removed model(s) deactivated. History was kept.`, 'info');
      onRefresh();
    } catch (e) { toast(e.message || 'Import failed.', 'error'); }
    setApplying(false);
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="card p-5 space-y-4">
        <h3 className="font-semibold">Defaults</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Image save folder (blank = Documents\PixAi Images)</label>
            <input className="input" placeholder="Documents\PixAi Images" value={settings.saveDirectory || ''} onChange={(e) => set({ saveDirectory: e.target.value })} />
          </div>
          <div>
            <label className="label">Model selection</label>
            <p className="text-xs text-mute leading-relaxed py-1">Automatic — the app tries the cheapest working model first and switches by itself when a model hits a limit or fails. There is nothing to pick.</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={settings.animations !== false} onChange={(e) => set({ animations: e.target.checked })} /> Enable animations
        </label>
      </div>

      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="font-semibold">Providers &amp; models</h3>
          <button className="btn-primary !py-2 !px-4 text-xs ml-auto" onClick={startImport}>
            <Upload size={14} /> Upload Excel workbook
          </button>
        </div>
        <p className="text-xs text-mute leading-relaxed">
          Uploading a workbook shows a preview first — nothing changes until you apply it, and the previous configuration is backed up.
          You can also keep using the terminal: <span className="font-mono text-cy">npm run import -- .\FabrixAPI1.xlsx</span>
        </p>

        {providers.length === 0 && <p className="text-sm text-amber-200">No providers yet — upload your Excel workbook to add them.</p>}

        {providers.map((p) => {
          const f = addForms[p.id] || { open: false, name: '', vendorModelId: '', description: '' };
          return (
            <div key={p.id} className="rounded-2xl bg-navy border border-line p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{p.name}</span>
                <span className="badge-info">{p.adapter || p.adapterRaw || 'no adapter'}</span>
                {p.adapterSupported === false && <span className="badge-warn">adapter not supported</span>}
                <span className={keySaved[p.id] ? 'badge-ok' : 'badge-bad'}>{keySaved[p.id] ? 'API key saved' : 'No API key'}</span>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
                  <input className="input !pl-9" type="password" autoComplete="off" placeholder={keySaved[p.id] ? 'Paste a new key to replace the saved one…' : 'Paste this provider\u2019s API key…'}
                    value={keyInputs[p.id] || ''} onChange={(e) => setKeyInputs((m) => ({ ...m, [p.id]: e.target.value }))} />
                </div>
                <button className="btn-ghost !py-2 text-xs" onClick={() => saveKey(p.id)}>Save key</button>
              </div>

              <div className="space-y-1.5">
                {(p.models || []).map((m) => {
                  const badge = testStateBadge(m.testState);
                  return (
                    <div key={m.id} className="flex items-center gap-2 text-sm rounded-xl bg-panel2 border border-line px-3 py-2">
                      <span className="font-medium truncate">{m.name}</span>
                      <span className="text-[11px] text-mute font-mono truncate hidden md:block">{m.vendorModelId}</span>
                      <span className={`${badge.cls} ml-auto shrink-0`}>{badge.label}</span>
                      <button className="btn-ghost !p-1.5 !border-rose-500/40 !text-rose-300 shrink-0" title="Delete this model"
                        onClick={() => setConfirmDelete({ providerId: p.id, modelId: m.id, modelName: m.name })}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
                {(p.models || []).length === 0 && <p className="text-xs text-mute">No image models under this provider.</p>}
              </div>

              {f.open ? (
                <div className="rounded-xl border border-line p-3 space-y-2 anim-fade">
                  <div className="grid grid-cols-2 gap-2">
                    <input className="input" placeholder="Model name (e.g. FLUX.1 Schnell)" value={f.name}
                      onChange={(e) => setAddForms((s) => ({ ...s, [p.id]: { ...f, name: e.target.value } }))} />
                    <input className="input font-mono" placeholder="Vendor model ID (exact)" value={f.vendorModelId}
                      onChange={(e) => setAddForms((s) => ({ ...s, [p.id]: { ...f, vendorModelId: e.target.value } }))} />
                  </div>
                  <input className="input" placeholder="Description (optional)" value={f.description}
                    onChange={(e) => setAddForms((s) => ({ ...s, [p.id]: { ...f, description: e.target.value } }))} />
                  <div className="flex gap-2">
                    <button className="btn-primary !py-1.5 !px-3.5 text-xs" onClick={() => addModel(p.id)}>Add model</button>
                    <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setAddForms((s) => ({ ...s, [p.id]: { ...f, open: false } }))}><X size={13} /> Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setAddForms((s) => ({ ...s, [p.id]: { ...f, open: true } }))}>
                  <Plus size={13} /> Add model
                </button>
              )}
            </div>
          );
        })}
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

      {preview && (
        <Modal title={`Import ${preview.sourceFile || 'workbook'}`} onClose={() => { api.importCancel(preview.previewId).catch(() => {}); setPreview(null); }} wide>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
              {[
                ['Providers found', preview.summary.providersFound],
                ['New models', preview.summary.newModels],
                ['Updated models', preview.summary.updatedModels],
                ['Keys updated', preview.summary.credentialsUpdated],
                ['Removed / inactive', preview.summary.removedOrInactiveModels],
                ['Non-image excluded', preview.summary.nonImageModelsExcluded],
                ['Unsupported', preview.summary.unsupportedProviders],
                ['Warnings', preview.summary.validationWarnings],
              ].map(([label, v]) => (
                <div key={label} className="rounded-xl bg-navy border border-line py-2.5">
                  <div className="text-lg font-bold">{v}</div>
                  <div className="text-[11px] text-mute">{label}</div>
                </div>
              ))}
            </div>
            {preview.sections.warnings && preview.sections.warnings.length > 0 && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-3.5 py-2.5 space-y-1 max-h-32 overflow-y-auto">
                {preview.sections.warnings.slice(0, 8).map((w, i) => <p key={i} className="text-xs text-amber-200">{w}</p>)}
              </div>
            )}
            {preview.hasRemovals && (
              <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={confirmDeactivate} onChange={(e) => setConfirmDeactivate(e.target.checked)} />
                Also deactivate models that are no longer in this workbook (they stay in history; without this they are kept as-is).
              </label>
            )}
            <div className="flex gap-2 justify-end pt-1">
              <button className="btn-ghost" onClick={() => { api.importCancel(preview.previewId).catch(() => {}); setPreview(null); }}>Cancel</button>
              <button className="btn-primary" disabled={applying} onClick={applyImport}>{applying ? 'Applying…' : 'Apply import'}</button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Confirm title="Delete this model?" danger confirmLabel="Delete model"
          message={`"${confirmDelete.modelName}" will be removed from the app. Past generations and their images stay untouched. You can add the model again any time, or re-import the workbook.`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            try {
              await api.deleteModel(confirmDelete.providerId, confirmDelete.modelId);
              toast('Model deleted.', 'success');
              onRefresh();
            } catch (e) { toast(e.message || 'Could not delete the model.', 'error'); }
            setConfirmDelete(null);
          }} />
      )}
      {confirmClear && (
        <Confirm title="Clear all history?" danger confirmLabel="Clear history"
          message="This deletes all generation history records from this computer. The image files themselves (in Documents\PixAi Images) are not deleted."
          onCancel={() => setConfirmClear(false)}
          onConfirm={async () => { await api.historyClear(); setConfirmClear(false); toast('History cleared.', 'success'); }} />
      )}
    </div>
  );
}
