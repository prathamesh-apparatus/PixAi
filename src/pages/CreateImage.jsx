import React, { useEffect, useRef, useState } from 'react';
import { Wand2, Square } from 'lucide-react';
import PromptEditor from '../components/PromptEditor';
import GenerationSettings from '../components/GenerationSettings';
import ImagePreview from '../components/ImagePreview';
import { api } from '../services/api';
import { useToast } from '../components/Toasts';

/**
 * Create layout (DigiArts-style, per Ray's reference): the generated image is
 * the hero in one big centre stage card, the prompt + provider/model/settings
 * live in one composer bar directly under the stage, and recent generations
 * run down the right rail. No left control column, no bulky panels.
 */
export default function CreateImage({ config, settings, onConfigRefresh, prefill, onPrefillUsed }) {
  const toast = useToast();
  const providers = config.providers || [];
  const [providerId, setProviderId] = useState(settings.defaultProviderId || '');
  const [modelId, setModelId] = useState(settings.defaultModelId || '');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [caps, setCaps] = useState({ capabilities: [], supportsNegativePrompt: false, supported: false });
  const [settingValues, setSettingValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState(null);
  const [stageRecord, setStageRecord] = useState(null);
  const [recent, setRecent] = useState([]);
  const requestRef = useRef(null);

  const provider = providers.find((p) => p.id === providerId) || null;
  const activeProviders = providers.filter((p) => p.enabled !== false && p.status === 'active');
  const models = provider ? (provider.models || []).filter((m) => m.enabled !== false && m.status === 'active') : [];
  const model = models.find((m) => m.id === modelId) || null;

  useEffect(() => { api.historyList({}).then(setRecent).catch(() => {}); }, [result]);
  useEffect(() => {
    if (prefill) {
      setProviderId(prefill.provider_id); setModelId(prefill.model_id);
      setPrompt(prefill.prompt); setNegativePrompt(prefill.negative_prompt || '');
      onPrefillUsed && onPrefillUsed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);
  // No silent "first available" auto-selection: the user explicitly picks a
  // provider and a model (or sets defaults in Settings). Only clear a stale
  // model selection when the provider changes underneath it.
  useEffect(() => {
    if (modelId && !models.find((m) => m.id === modelId)) setModelId('');
    if (!provider) setModelId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, modelId]);
  useEffect(() => {
    if (providerId && modelId) {
      api.modelCapabilities(providerId, modelId).then((c) => {
        setCaps(c);
        const defaults = {};
        (c.capabilities || []).forEach((cap) => { defaults[cap.key] = cap.default; });
        if (settings.defaultAspectRatio && defaults.aspectRatio !== undefined) defaults.aspectRatio = settings.defaultAspectRatio;
        setSettingValues(defaults);
      }).catch(() => setCaps({ capabilities: [], supportsNegativePrompt: false, supported: false }));
    } else setCaps({ capabilities: [], supportsNegativePrompt: false, supported: false });
  }, [providerId, modelId]);

  async function generate() {
    if (!provider || !model) { toast('Select a provider and a model first.', 'warn'); return; }
    if (provider.adapterSupported === false) { toast('This provider\u2019s adapter is not implemented yet.', 'error'); return; }
    if (!prompt.trim()) { toast('Write a prompt first.', 'warn'); return; }
    const requestId = `req-${Date.now()}`;
    requestRef.current = requestId;
    setBusy(true); setStatus(`Generating with ${provider.name} · ${model.name}…`);
    const res = await api.generate({ requestId, providerId, modelId, prompt, negativePrompt, settings: settingValues });
    setBusy(false); setStatus('');
    if (res.ok) {
      setResult(res.images[0]);
      setStageRecord(res.images[0]);
      toast(`Image generated with ${res.modelName}.`, 'success');
      onConfigRefresh && onConfigRefresh();
    } else {
      toast(res.error || 'Generation failed.', 'error');
      if (res.diagnostic) setStatus(`Diagnostic: ${res.diagnostic}`);
      onConfigRefresh && onConfigRefresh();
    }
  }

  const stage = stageRecord || result;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
      <div className="flex flex-col gap-4 min-w-0">
        <ImagePreview record={stage} busy={busy} statusText={status} onRegenerate={(r) => { setProviderId(r.provider_id); setModelId(r.model_id); setPrompt(r.prompt); }} />

        <div className="card p-4 space-y-3">
          {model && (
            <div className="flex items-center gap-2 min-w-0 anim-fade">
              <span className="badge-info shrink-0">{provider.adapter || provider.adapterRaw || 'no adapter'}</span>
              {model.vendorModelId && <span className="badge-mute shrink-0">{model.vendorModelId}</span>}
              {model.description && <span className="text-xs text-mute truncate">{model.description}</span>}
            </div>
          )}
          {provider && provider.adapterSupported === false && (
            <p className="text-xs text-amber-300">This provider's adapter is not implemented yet — its configuration is imported, but generation needs a new adapter module.</p>
          )}
          {model && model.testState === 'quota-exhausted' && (
            <p className="text-xs text-amber-300">Free limit ended for this model — it can't generate until the provider's free quota resets. Pick another model.</p>
          )}

          <PromptEditor value={prompt} onChange={setPrompt} history={recent} compact />
          {caps.supportsNegativePrompt && (
            <div>
              <label className="label">Negative prompt</label>
              <textarea className="input min-h-[44px] resize-y" placeholder="What to avoid in the image…"
                value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} maxLength={2000} />
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2.5">
            <div className="w-[210px]">
              <label className="label">Provider</label>
              <select className="input" value={providerId} onChange={(e) => { setProviderId(e.target.value); setModelId(''); }}>
                <option value="">Select a provider…</option>
                {activeProviders.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.adapterSupported === false ? ' (unsupported adapter)' : ''}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[210px]">
              <label className="label">Model</label>
              <select className="input" value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={!provider}>
                <option value="">{provider ? 'Select a model…' : 'Select a provider first'}</option>
                {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <GenerationSettings inline capabilities={caps.capabilities} values={settingValues}
              onChange={(k, v) => setSettingValues((s) => ({ ...s, [k]: v }))} />
            <button className="btn-primary !px-6 !py-3 ml-auto" onClick={generate} disabled={busy}>
              <Wand2 size={16} /> {busy ? 'Generating…' : 'Generate Image'}
            </button>
            {busy && (
              <button className="btn-ghost !py-3" onClick={() => requestRef.current && api.cancelGenerate(requestRef.current)}>
                <Square size={14} /> Cancel
              </button>
            )}
          </div>
          {provider && models.length === 0 && (
            <p className="text-xs text-amber-300">This provider has no active image models in the imported workbook.</p>
          )}
          {busy && <div className="skeleton h-1.5 rounded-full" />}
          {status && <p className={`text-xs ${busy ? 'text-mute generating-pulse' : 'text-rose-300'}`}>{status}</p>}
          {providers.length === 0 && (
            <div className="border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200" style={{ borderRadius: 16 }}>
              No providers imported yet. Save your workbook as <b>FabrixAPI1.xlsx</b> in the project folder and run
              <span className="block font-mono text-xs mt-1.5 text-amber-100">npm run import -- .\FabrixAPI1.xlsx</span>
              then restart the app to start generating.
            </div>
          )}
        </div>
      </div>

      <aside className="hidden xl:block card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Recent generations</h3>
          <span className="badge-mute">local</span>
        </div>
        <div className="space-y-4">
          {recent.slice(0, 5).map((r, i) => (
            <button key={r.id} onClick={() => setStageRecord(r)} className="block w-full text-left group">
              <div className="relative overflow-hidden" style={{ borderRadius: 16 }}>
                <img src={api.imageUrl(r.image_path)} alt={r.prompt} className="w-full h-28 object-cover img-hover" loading="lazy" />
                <span className="absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-black/65 text-white">#{i + 1}</span>
                {r.favorite ? <span className="absolute top-2 right-2 text-rose-400 text-xs">♥</span> : null}
              </div>
              <div className="mt-1.5 px-0.5">
                <span className="text-xs font-semibold truncate block">{r.model_name}</span>
                <span className="text-[11px] text-mute truncate block">{r.prompt}</span>
              </div>
            </button>
          ))}
          {recent.length === 0 && <p className="text-xs text-mute leading-relaxed">Nothing generated yet. Your latest images will show up here, saved on this computer.</p>}
        </div>
      </aside>
    </div>
  );
}
