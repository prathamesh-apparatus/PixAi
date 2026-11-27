import React, { useEffect, useRef, useState } from 'react';
import { Wand2, Square } from 'lucide-react';
import ProviderSelector from '../components/ProviderSelector';
import ModelSelector from '../components/ModelSelector';
import PromptEditor from '../components/PromptEditor';
import GenerationSettings from '../components/GenerationSettings';
import ImagePreview from '../components/ImagePreview';
import { api } from '../services/api';
import { useToast } from '../components/Toasts';

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
  const model = provider && (provider.models || []).find((m) => m.id === modelId);

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
    const models = provider ? (provider.models || []).filter((m) => m.enabled !== false && m.status === 'active') : [];
    if (modelId && !models.find((m) => m.id === modelId)) setModelId('');
    if (!provider) setModelId('');
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
    <div className="grid grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)_290px] gap-5 items-start">
      <div className="card p-5 space-y-5 lg:sticky lg:top-0 lg:max-h-[calc(100vh-130px)] lg:overflow-y-auto">
        <ProviderSelector providers={providers} value={providerId} onChange={(v) => { setProviderId(v); setModelId(''); }} />
        <ModelSelector provider={provider} value={modelId} onChange={setModelId} />
        <PromptEditor value={prompt} onChange={setPrompt} history={recent} />
        {caps.supportsNegativePrompt && (
          <div>
            <label className="label">Negative prompt</label>
            <textarea className="input min-h-[56px] resize-y" placeholder="What to avoid in the image…"
              value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} maxLength={2000} />
          </div>
        )}
        <div>
          <label className="label">Generation settings</label>
          <GenerationSettings capabilities={caps.capabilities} values={settingValues}
            onChange={(k, v) => setSettingValues((s) => ({ ...s, [k]: v }))} />
        </div>
        <div className="flex gap-2 pt-1">
          <button className="btn-primary flex-1 !py-3" onClick={generate} disabled={busy}>
            <Wand2 size={17} /> {busy ? 'Generating…' : 'Generate Image'}
          </button>
          {busy && (
            <button className="btn-ghost" onClick={() => requestRef.current && api.cancelGenerate(requestRef.current)}>
              <Square size={15} /> Cancel
            </button>
          )}
        </div>
        {busy && <div className="skeleton h-2 rounded-full" />}
        {status && <p className={`text-xs ${busy ? 'text-mute generating-pulse' : 'text-rose-300'}`}>{status}</p>}
        {providers.length === 0 && (
          <div className="border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200" style={{ borderRadius: 16 }}>
            No providers imported yet. Save your workbook as <b>FabrixAPI1.xlsx</b> in the project folder and run
            <span className="block font-mono text-xs mt-1.5 text-amber-100">npm run import -- .\FabrixAPI1.xlsx</span>
            then restart the app to start generating.
          </div>
        )}
      </div>
      <ImagePreview record={stage} onRegenerate={(r) => { setProviderId(r.provider_id); setModelId(r.model_id); setPrompt(r.prompt); }} />
      <aside className="hidden 2xl:block card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Recent generations</h3>
          <span className="badge-mute">local</span>
        </div>
        <div className="space-y-3">
          {recent.slice(0, 5).map((r) => (
            <button key={r.id} onClick={() => setStageRecord(r)} className="block w-full text-left group">
              <div className="overflow-hidden" style={{ borderRadius: 16 }}>
                <img src={api.imageUrl(r.image_path)} alt={r.prompt} className="w-full h-32 object-cover img-hover" loading="lazy" />
              </div>
              <div className="flex items-center gap-2 mt-1.5 px-0.5">
                <span className="text-xs font-medium truncate flex-1">{r.model_name}</span>
                {r.favorite ? <span className="text-rose-400 text-xs">♥</span> : null}
              </div>
              <p className="text-[11px] text-mute truncate px-0.5">{r.prompt}</p>
            </button>
          ))}
          {recent.length === 0 && <p className="text-xs text-mute leading-relaxed">Nothing generated yet. Your latest images will show up here, saved on this computer.</p>}
        </div>
      </aside>
    </div>
  );
}
