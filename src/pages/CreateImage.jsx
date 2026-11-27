import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Wand2, Square } from 'lucide-react';
import PromptEditor from '../components/PromptEditor';
import GenerationSettings from '../components/GenerationSettings';
import ImagePreview from '../components/ImagePreview';
import { api } from '../services/api';
import { useToast } from '../components/Toasts';

/**
 * Create page for the media team: NO provider/model pickers. The app chooses
 * the working model itself — Settings default first, then models that have
 * already generated successfully, then any active model; models whose free
 * limit has ended are tried last, and if the chosen model reports its free
 * limit ended mid-generation, the next model is tried automatically.
 * Layout (DigiArts-style): stage hero on top, one composer bar under it,
 * recent generations as a tile grid down the right rail.
 */
export default function CreateImage({ config, settings, onConfigRefresh, prefill, onPrefillUsed }) {
  const toast = useToast();
  const providers = config.providers || [];
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [override, setOverride] = useState(null); // {providerId, modelId} from Regenerate
  const [caps, setCaps] = useState({ capabilities: [], supportsNegativePrompt: false, supported: false });
  const [settingValues, setSettingValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState(null);
  const [stageRecord, setStageRecord] = useState(null);
  const [recent, setRecent] = useState([]);
  const requestRef = useRef(null);

  const candidates = useMemo(() => {
    const all = [];
    for (const p of providers) {
      if (p.enabled === false || p.status !== 'active' || p.adapterSupported === false) continue;
      for (const m of p.models || []) {
        if (m.enabled === false || m.status !== 'active') continue;
        all.push({ provider: p, model: m });
      }
    }
    const rank = (c) => {
      if (override && c.provider.id === override.providerId && c.model.id === override.modelId) return 0;
      if (settings.defaultProviderId && settings.defaultModelId &&
          c.provider.id === settings.defaultProviderId && c.model.id === settings.defaultModelId) return 1;
      if (c.model.testState === 'tested-ok') return 2;
      if (c.model.testState === 'quota-exhausted') return 4;
      return 3;
    };
    return all.sort((a, b) => rank(a) - rank(b));
  }, [providers, settings.defaultProviderId, settings.defaultModelId, override]);

  const chosen = candidates[0] || null;
  const providerId = chosen ? chosen.provider.id : '';
  const modelId = chosen ? chosen.model.id : '';

  useEffect(() => { api.historyList({}).then(setRecent).catch(() => {}); }, [result]);
  useEffect(() => {
    if (prefill) {
      setOverride({ providerId: prefill.provider_id, modelId: prefill.model_id });
      setPrompt(prefill.prompt); setNegativePrompt(prefill.negative_prompt || '');
      onPrefillUsed && onPrefillUsed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, modelId]);

  async function generate() {
    if (!candidates.length) { toast('No working model is available yet. Import the workbook first (see Settings).', 'warn'); return; }
    if (!prompt.trim()) { toast('Write a prompt first.', 'warn'); return; }
    const requestId = `req-${Date.now()}`;
    requestRef.current = requestId;
    setBusy(true);
    let lastError = null;
    let fellBack = false;
    for (const cand of candidates) {
      setStatus(`Generating with ${cand.model.name}…`);
      const res = await api.generate({
        requestId, providerId: cand.provider.id, modelId: cand.model.id,
        prompt, negativePrompt, settings: settingValues,
      });
      if (res.ok) {
        setBusy(false); setStatus('');
        setResult(res.images[0]);
        setStageRecord(res.images[0]);
        toast(fellBack
          ? `The previous model's free limit had ended — image generated with ${res.modelName} instead.`
          : `Image generated with ${res.modelName}.`, 'success');
        onConfigRefresh && onConfigRefresh();
        return;
      }
      lastError = res;
      if (res.code === 'QUOTA_EXHAUSTED') { fellBack = true; continue; } // free limit ended → try the next model
      break; // any other error: report it, don't burn other models' quota
    }
    setBusy(false); setStatus('');
    if (lastError) {
      toast(lastError.error || 'Generation failed.', 'error');
      if (lastError.diagnostic) setStatus(`Diagnostic: ${lastError.diagnostic}`);
    }
    onConfigRefresh && onConfigRefresh();
  }

  const stage = stageRecord || result;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_308px] gap-5 items-start">
      <div className="flex flex-col gap-4 min-w-0">
        <ImagePreview record={stage} busy={busy} statusText={status}
          onRegenerate={(r) => { setOverride({ providerId: r.provider_id, modelId: r.model_id }); setPrompt(r.prompt); }} />

        <div className="card p-4 space-y-3">
          <PromptEditor value={prompt} onChange={setPrompt} history={recent} compact />
          {caps.supportsNegativePrompt && (
            <div>
              <label className="label">Negative prompt</label>
              <textarea className="input min-h-[44px] resize-y" placeholder="What to avoid in the image…"
                value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} maxLength={2000} />
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2.5">
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
          {status && !busy && <p className="text-xs text-rose-300">{status}</p>}
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
        {recent.length === 0 && <p className="text-xs text-mute leading-relaxed">Nothing generated yet. Your latest images will appear here as a gallery — every image is saved in your Documents\PixAi Images folder.</p>}
        <div className="grid grid-cols-2 gap-3">
          {recent.slice(0, 6).map((r, i) => (
            <button key={r.id} onClick={() => setStageRecord(r)}
              className="group relative overflow-hidden text-left anim-fade" style={{ borderRadius: 16 }}>
              <img src={api.imageUrl(r.image_path)} alt={r.prompt} loading="lazy"
                className="w-full aspect-[4/3] object-cover img-hover" />
              <span className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, transparent 46%, rgba(0,0,0,0.78))' }} />
              <span className="absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-black/65 text-white">#{i + 1}</span>
              {r.favorite ? <span className="absolute top-2 right-2 text-rose-400 text-xs drop-shadow">♥</span> : null}
              <span className="absolute bottom-0 inset-x-0 p-2">
                <span className="block text-[11px] font-semibold text-white truncate">{r.model_name}</span>
                <span className="block text-[10px] text-slate-300 truncate">{r.prompt}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
