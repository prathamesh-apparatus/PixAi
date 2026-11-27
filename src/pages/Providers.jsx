import React, { useEffect, useState } from 'react';
import { Plug, FlaskConical, KeyRound, ChevronDown, ChevronRight } from 'lucide-react';
import { api, testStateBadge } from '../services/api';
import { useToast } from '../components/Toasts';

function ProviderCard({ provider, onRefresh, onImport }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [cred, setCred] = useState({ hasApiKey: false, secure: false });
  const [busy, setBusy] = useState('');
  useEffect(() => { api.credentialStatus(provider.id).then(setCred).catch(() => {}); }, [provider.id]);

  async function testProvider() {
    setBusy('provider'); const r = await api.testProvider(provider.id); setBusy('');
    toast(r.message, r.ok ? 'success' : 'error'); onRefresh();
  }
  async function testModel(m) {
    setBusy(m.id); const r = await api.testModel(provider.id, m.id); setBusy('');
    toast(`${m.name}: ${r.message}`, r.ok ? 'success' : 'error'); onRefresh();
  }
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start gap-3">
        <button className="flex items-center gap-2 text-left" onClick={() => setOpen((o) => !o)}>
          {open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
          <span className="font-semibold text-base">{provider.name}</span>
        </button>
        <div className="flex flex-wrap gap-1.5">
          <span className="badge-info">{provider.adapter || provider.adapterRaw || 'no adapter'}</span>
          {provider.adapterSupported === false && <span className="badge-warn">Unsupported adapter</span>}
          <span className={provider.status === 'active' ? 'badge-ok' : 'badge-bad'}>{provider.status}</span>
          <span className={cred.hasApiKey ? 'badge-ok' : 'badge-warn'}>{cred.hasApiKey ? 'API key saved' : 'No API key'}</span>
          <span className="badge-mute">{(provider.models || []).length} models</span>
          {provider.rpm && <span className="badge-mute">RPM {provider.rpm}</span>}
          {provider.tpm && <span className="badge-mute">TPM {provider.tpm}</span>}
          {provider.lastTestedAt && <span className="badge-mute">Tested {new Date(provider.lastTestedAt).toLocaleString()}</span>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-mute cursor-pointer">
            <input type="checkbox" checked={provider.enabled !== false}
              onChange={async (e) => { await api.setProviderEnabled(provider.id, e.target.checked); onRefresh(); }} />
            Enabled
          </label>
          <button className="btn-ghost !py-1.5 text-xs" onClick={testProvider} disabled={busy === 'provider'}><Plug size={13} /> {busy === 'provider' ? 'Testing…' : 'Test connection'}</button>
          <button className="btn-ghost !py-1.5 text-xs" onClick={onImport}>Import Excel</button>
        </div>
      </div>
      {provider.adapterSupported === false && (
        <p className="text-xs text-amber-300 mt-2">This provider was imported from Excel, but its API adapter (“{provider.adapterRaw || 'unknown'}”) is not implemented yet. A new adapter module is required before it can generate images — importing a key alone does not implement an unknown API.</p>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <KeyRound size={14} className="text-mute" />
        <input type="password" className="input !w-64" placeholder={cred.hasApiKey ? 'Replace API key (hidden)' : 'Paste API key'}
          value={keyInput} onChange={(e) => setKeyInput(e.target.value)} autoComplete="off" />
        <button className="btn-ghost !py-1.5 text-xs" disabled={!keyInput}
          onClick={async () => { const r = await api.setApiKey(provider.id, keyInput); setKeyInput(''); setCred({ hasApiKey: r.hasApiKey, secure: r.secure }); toast('API key saved to secure local storage.', 'success'); }}>
          Save key
        </button>
        <span className="text-[11px] text-mute">Keys are stored encrypted on this computer and never shown.</span>
      </div>
      {open && (
        <div className="mt-4 border-t border-line pt-3 space-y-2 anim-fade">
          {(provider.models || []).map((m) => {
            const badge = testStateBadge(m.testState);
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-navy border border-line px-3.5 py-2.5">
                <span className="text-sm font-medium">{m.name}</span>
                <span className="badge-mute">{m.vendorModelId}</span>
                <span className={m.status === 'active' ? 'badge-ok' : 'badge-bad'}>{m.status}</span>
                <span className={badge.cls}>{badge.label}</span>
                {m.description && <span className="text-xs text-mute truncate max-w-[380px]">{m.description}</span>}
                <span className="ml-auto flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-mute cursor-pointer">
                    <input type="checkbox" checked={m.enabled !== false}
                      onChange={async (e) => { await api.setModelEnabled(provider.id, m.id, e.target.checked); onRefresh(); }} /> On
                  </label>
                  <button className="btn-ghost !py-1 !px-2.5 text-xs" disabled={busy === m.id} onClick={() => testModel(m)}>
                    <FlaskConical size={13} /> {busy === m.id ? 'Testing…' : 'Test model'}
                  </button>
                </span>
              </div>
            );
          })}
          {(provider.models || []).length === 0 && <p className="text-xs text-mute">No image models imported for this provider.</p>}
          <p className="text-[11px] text-mute pt-1">“Test connection” only verifies the API key/endpoint. “Test model” runs a real, minimal image generation — a model is only marked tested successfully after a real generation succeeds.</p>
        </div>
      )}
    </div>
  );
}

export default function Providers({ config, onRefresh, onImport }) {
  const providers = config.providers || [];
  if (!providers.length) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm text-mute mb-4">No providers imported yet. Import your Excel workbook to load providers and models dynamically — nothing is hardcoded.</p>
        <button className="btn-primary" onClick={onImport}>Import Excel</button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-mute">{providers.length} providers · {providers.reduce((n, p) => n + (p.models || []).length, 0)} image models{config.sourceFile ? ` · source: ${config.sourceFile}` : ''}{config.updatedAt ? ` · updated ${new Date(config.updatedAt).toLocaleString()}` : ''}</p>
        <button className="btn-primary !py-2 text-sm" onClick={onImport}>Import Excel</button>
      </div>
      {providers.map((p) => <ProviderCard key={p.id} provider={p} onRefresh={onRefresh} onImport={onImport} />)}
    </div>
  );
}
