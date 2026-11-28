import React, { useEffect, useRef, useState } from 'react';
import { Wand2, Square, Pencil, ChevronsUp, Sparkles, Shuffle, Image as ImageIcon, Clapperboard, Camera, Sun, Shirt, Paperclip, X } from 'lucide-react';
import PromptEditor from '../components/PromptEditor';
import ImagePreview from '../components/ImagePreview';
import { api } from '../services/api';
import { useToast } from '../components/Toasts';
import { rankCandidates, candidatesWithPreferred } from '../utils/modelRank';
import { MODES, getMode, applyMode, ASPECTS, sizeForAspect } from '../utils/modes';

const MODE_ICONS = {
  generate: Wand2, edit: Pencil, upscale: ChevronsUp, skin: Sparkles,
  variation: Shuffle, background: ImageIcon, cinematic: Clapperboard,
  angle: Camera, relight: Sun, mockup: Shirt,
};

/**
 * Create layout (DigiArts stage + Magnific-style composer): the generated
 * image is the hero stage, recent generations run down the right rail, and
 * the composer carries mode tabs, the prompt, a reference-image attach, size
 * and count. Model choice defaults to Auto — the engine tries the cheapest
 * working model first and switches on any failure. A Manual override brings
 * back provider/model selectors for testing one exact model (no switching).
 */
export default function CreateImage({ config, settings, onConfigRefresh, prefill, onPrefillUsed }) {
  const toast = useToast();
  const providers = config.providers || [];
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState('generate');
  const [modeOption, setModeOption] = useState('');
  const [backgroundText, setBackgroundText] = useState('');
  const [refImage, setRefImage] = useState(null); // { dataUrl, name }
  const [aspect, setAspect] = useState('Auto');
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState(null);
  const [stageRecord, setStageRecord] = useState(null);
  const [recent, setRecent] = useState([]);
  const [lastUsed, setLastUsed] = useState('');
  // Manual override (Ray's testing mode): pick an exact provider + model and
  // generate with ONLY that model — no auto-switch — so each model's real
  // result or real error is visible. Auto stays the default.
  const [selectionMode, setSelectionMode] = useState('auto');
  const [providerId, setProviderId] = useState('');
  const [modelId, setModelId] = useState('');
  const requestRef = useRef(null);
  const cancelRef = useRef(false);
  const fileRef = useRef(null);

  const modeDef = getMode(mode);
  const activeProviders = providers.filter((p) => p.enabled !== false && p.status === 'active');
  const manualProvider = activeProviders.find((p) => p.id === providerId) || null;
  const manualModels = manualProvider ? (manualProvider.models || []).filter((m) => m.enabled !== false && m.status === 'active') : [];
  const manualModel = manualModels.find((m) => m.id === modelId) || null;

  useEffect(() => { api.historyList({}).then(setRecent).catch(() => {}); }, [result]);
  useEffect(() => {
    if (prefill) {
      onPrefillUsed && onPrefillUsed();
      regenerateRecord(prefill);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);
  useEffect(() => {
    const m = getMode(mode);
    setModeOption(m.options && m.options.length ? m.options[0].id : '');
  }, [mode]);
  useEffect(() => {
    if (modelId && !manualModels.find((m) => m.id === modelId)) setModelId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, modelId]);

  function pickRefImage(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast('Please choose an image file.', 'warn'); return; }
    if (f.size > 8 * 1024 * 1024) { toast('Reference image is too large — please use one under 8 MB.', 'warn'); return; }
    const reader = new FileReader();
    reader.onload = () => setRefImage({ dataUrl: String(reader.result), name: f.name });
    reader.onerror = () => toast('Could not read that image file.', 'error');
    reader.readAsDataURL(f);
  }

  /** Try candidates in auto order until one generates. Returns a result
   *  object, { cancelled: true }, or { failures: [...] } when all failed. */
  async function runAuto(finalPrompt, genSettings, preferred) {
    const candidates = preferred
      ? candidatesWithPreferred(providers, preferred.providerId, preferred.modelId)
      : rankCandidates(providers);
    if (!candidates.length) {
      toast('No model is configured yet — import the workbook (Settings → Upload Excel, or the import command) first.', 'warn');
      return null;
    }
    const failures = [];
    for (let i = 0; i < candidates.length; i++) {
      if (cancelRef.current) return { cancelled: true };
      const c = candidates[i];
      setStatus(candidates.length > 1 ? `Trying ${c.modelName} — attempt ${i + 1} of ${candidates.length}…` : `Generating with ${c.modelName}…`);
      const requestId = `req-${Date.now()}-${i}`;
      requestRef.current = requestId;
      const res = await api.generate({ requestId, providerId: c.providerId, modelId: c.modelId, prompt: finalPrompt, negativePrompt: '', settings: genSettings });
      if (res.ok && res.images && res.images.length) return { res, candidate: c, attempts: i + 1, failures };
      if (res.code === 'CANCELLED') return { cancelled: true };
      failures.push({ candidate: c, error: res.error || 'Generation failed.', diagnostic: res.diagnostic || '' });
    }
    return { failures };
  }

  function reportSuccess(out, madeCount) {
    const c = out.candidate;
    setLastUsed(`${c.providerName} · ${c.modelName}`);
    let msg = `Generated with ${c.modelName}.`;
    if (out.attempts > 1) msg = `${c.modelName} generated it — auto-switched after ${out.failures.length} model(s) failed.`;
    if (madeCount > 1) msg += ` (${madeCount} images)`;
    toast(msg, 'success');
  }

  function reportAllFailed(failures) {
    if (!failures || !failures.length) return;
    toast(`No model could generate this — tried ${failures.length} model(s). ${failures[0].error}`, 'error');
    const last = failures[failures.length - 1];
    if (last.diagnostic) setStatus(`Diagnostic: ${last.diagnostic}`);
  }

  /** Manual test path: exactly the chosen model, no fallback — its real
   *  result or real error is what gets reported. */
  async function runManual(finalPrompt, genSettings) {
    const made = [];
    for (let n = 0; n < count; n++) {
      if (cancelRef.current) break;
      setStatus(`Generating with ${manualModel.name} (manual test)…`);
      const requestId = `req-${Date.now()}-m${n}`;
      requestRef.current = requestId;
      const res = await api.generate({ requestId, providerId, modelId, prompt: finalPrompt, negativePrompt: '', settings: genSettings });
      if (res.ok && res.images && res.images.length) { made.push(...res.images); continue; }
      if (res.code === 'CANCELLED') break;
      toast(res.error || 'Generation failed.', 'error');
      if (res.diagnostic) setStatus(`Diagnostic: ${res.diagnostic}`);
      break;
    }
    if (made.length) {
      setResult(made[0]);
      setStageRecord(made[0]);
      setLastUsed(`${manualProvider.name} · ${manualModel.name}`);
      toast(`Generated with ${manualModel.name} (manual test).`, 'success');
      onConfigRefresh && onConfigRefresh();
    }
  }

  async function generate() {
    if (busy) return;
    if (!prompt.trim() && !refImage) { toast('Write a prompt first.', 'warn'); return; }
    if (mode === 'edit' && !refImage) { toast('Edit mode needs a reference image — attach one with the clip button.', 'warn'); return; }
    if (selectionMode === 'manual' && (!manualProvider || !manualModel)) { toast('In Manual mode, select a provider and a model to test first.', 'warn'); return; }
    setBusy(true); cancelRef.current = false; setStatus('');
    try {
      let basePrompt = prompt;
      if (refImage) {
        setStatus('Reading your reference image…');
        const v = await api.describeReference({ imageDataUrl: refImage.dataUrl, prompt, mode: mode === 'edit' ? 'edit' : 'describe' });
        if (!v.ok) { toast(v.error || 'Could not read the reference image.', 'error'); if (v.diagnostic) setStatus(`Diagnostic: ${v.diagnostic}`); return; }
        basePrompt = v.prompt;
        toast(`Prompt built from your reference image by ${v.visionModelName}.`, 'info');
      }
      const { prompt: finalPrompt } = applyMode(mode, basePrompt, { optionId: modeOption, backgroundText });
      const genSettings = {};
      if (aspect !== 'Auto') { genSettings.aspectRatio = aspect; genSettings.size = sizeForAspect(aspect); }
      if (selectionMode === 'manual') { await runManual(finalPrompt, genSettings); return; }
      const made = [];
      let firstOut = null;
      for (let n = 0; n < count; n++) {
        const out = await runAuto(finalPrompt, genSettings, null);
        if (!out) break;
        if (out.cancelled) break;
        if (out.failures) { if (n === 0) reportAllFailed(out.failures); break; }
        if (!firstOut) firstOut = out;
        made.push(...out.res.images);
      }
      if (made.length) {
        setResult(made[0]);
        setStageRecord(made[0]);
        if (firstOut) reportSuccess(firstOut, made.length);
        onConfigRefresh && onConfigRefresh();
      }
    } finally {
      setBusy(false);
      setStatus((s) => (s.startsWith('Diagnostic:') ? s : ''));
    }
  }

  /** Regenerate = run it again right now, with the record's own model first
   *  and the auto order as fallback. */
  async function regenerateRecord(r) {
    if (busy || !r) return;
    setPrompt(r.prompt);
    let s = {};
    try { s = typeof r.settings === 'string' ? JSON.parse(r.settings || '{}') : (r.settings || {}); } catch { s = {}; }
    setBusy(true); cancelRef.current = false; setStatus('');
    try {
      const out = await runAuto(r.prompt, s, { providerId: r.provider_id, modelId: r.model_id });
      if (out && out.res) {
        setResult(out.res.images[0]);
        setStageRecord(out.res.images[0]);
        reportSuccess(out, out.res.images.length);
        onConfigRefresh && onConfigRefresh();
      } else if (out && out.failures) {
        reportAllFailed(out.failures);
        onConfigRefresh && onConfigRefresh();
      }
    } finally {
      setBusy(false);
      setStatus((st) => (st.startsWith('Diagnostic:') ? st : ''));
    }
  }

  function cancel() {
    cancelRef.current = true;
    if (requestRef.current) api.cancelGenerate(requestRef.current);
  }

  function clearStage() { setStageRecord(null); setResult(null); }

  const stage = stageRecord || result;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
      <div className="flex flex-col gap-4 min-w-0">
        <ImagePreview record={stage} busy={busy} statusText={status} onRegenerate={regenerateRecord} onClear={clearStage} />

        <div className="card p-4 space-y-3">
          {/* Mode tabs — Magnific-style, horizontally scrollable. */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {MODES.map((m) => {
              const Icon = MODE_ICONS[m.id] || Wand2;
              const active = mode === m.id;
              return (
                <button key={m.id} onClick={() => setMode(m.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${active ? 'bg-white text-black shadow' : 'bg-white/5 text-slate-300 hover:bg-white/10 ring-1 ring-white/10'}`}>
                  <Icon size={13} /> {m.label}
                </button>
              );
            })}
          </div>

          {modeDef.options && (
            <div className="flex flex-wrap gap-1.5 anim-fade">
              {modeDef.options.map((o) => (
                <button key={o.id} onClick={() => setModeOption(o.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${modeOption === o.id ? 'bg-cy/20 text-cy ring-1 ring-cy/50' : 'bg-white/5 text-mute hover:text-slate-200 ring-1 ring-white/10'}`}>
                  {o.label}
                </button>
              ))}
            </div>
          )}
          {modeDef.usesBackgroundText && (
            <input className="input anim-fade" placeholder="Describe the background — e.g. sunset beach with palm trees…"
              value={backgroundText} onChange={(e) => setBackgroundText(e.target.value)} maxLength={500} />
          )}
          {modeDef.hint && <p className="text-[11px] text-mute anim-fade">{modeDef.hint}</p>}

          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <PromptEditor value={prompt} onChange={setPrompt} history={recent} compact />
            </div>
            <button className="btn-ghost !px-3 !py-2.5 shrink-0" title="Attach a reference image — the app turns it into a proper prompt" onClick={() => fileRef.current && fileRef.current.click()}>
              <Paperclip size={15} />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickRefImage} />
          </div>

          {refImage && (
            <div className="flex items-center gap-2.5 rounded-xl bg-navy border border-line px-3 py-2 anim-fade">
              <img src={refImage.dataUrl} alt="Reference" className="w-10 h-10 rounded-lg object-cover ring-1 ring-white/15" />
              <div className="min-w-0 flex-1">
                <span className="text-xs font-semibold block truncate">Reference image attached</span>
                <span className="text-[11px] text-mute block truncate">{refImage.name} — a vision model will turn it + your prompt into the generation prompt.</span>
              </div>
              <button className="btn-ghost !p-1.5" title="Remove reference image" onClick={() => setRefImage(null)}><X size={14} /></button>
            </div>
          )}

          {selectionMode === 'manual' && (
            <div className="anim-fade space-y-1.5">
              <div className="flex flex-wrap gap-2.5">
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
                  <select className="input" value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={!manualProvider}>
                    <option value="">{manualProvider ? 'Select a model…' : 'Select a provider first'}</option>
                    {manualModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-mute">Manual test — Generate uses exactly this model, no auto-switch, so you see its real result or real error.{manualModel && manualModel.vendorModelId ? ` Vendor ID: ${manualModel.vendorModelId}` : ''}</p>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2.5">
            <div className="w-[196px]">
              <label className="label">Size</label>
              <select className="input" value={aspect} onChange={(e) => setAspect(e.target.value)}>
                {ASPECTS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Images</label>
              <div className="flex rounded-xl overflow-hidden ring-1 ring-white/10">
                {[1, 2, 4].map((n) => (
                  <button key={n} onClick={() => setCount(n)}
                    className={`px-3 py-2.5 text-xs font-bold transition-all ${count === n ? 'bg-white text-black' : 'bg-white/5 text-mute hover:text-slate-200'}`}>
                    ×{n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Model choice</label>
              <div className="flex rounded-xl overflow-hidden ring-1 ring-white/10">
                {[['auto', 'Auto'], ['manual', 'Manual']].map(([v, label]) => (
                  <button key={v} onClick={() => setSelectionMode(v)}
                    className={`px-3 py-2.5 text-xs font-bold transition-all ${selectionMode === v ? 'bg-white text-black' : 'bg-white/5 text-mute hover:text-slate-200'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-w-0">
              <label className="label">{selectionMode === 'manual' ? 'Testing' : 'Auto engine'}</label>
              <p className="text-xs text-mute py-2.5 truncate" title={lastUsed || ''}>
                {selectionMode === 'manual'
                  ? (manualModel ? manualModel.name : 'Pick a provider + model above')
                  : (lastUsed ? `Last: ${lastUsed}` : 'Cheapest working model first — switches automatically if one fails.')}
              </p>
            </div>
            <button className="btn-primary !px-6 !py-3 ml-auto" onClick={generate} disabled={busy}>
              <Wand2 size={16} /> {busy ? 'Generating…' : 'Generate Image'}
            </button>
            {busy && (
              <button className="btn-ghost !py-3" onClick={cancel}>
                <Square size={14} /> Cancel
              </button>
            )}
          </div>
          {busy && <div className="skeleton h-1.5 rounded-full" />}
          {status && <p className={`text-xs ${busy ? 'text-mute generating-pulse' : 'text-rose-300'}`}>{status}</p>}
          {providers.length === 0 && (
            <div className="border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200" style={{ borderRadius: 16 }}>
              No providers imported yet. Upload your workbook in <b>Settings → Providers &amp; models</b>, or run
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
        {recent.length === 0 && <p className="text-xs text-mute leading-relaxed">Nothing generated yet. Your latest images will show up here as a film reel, saved on this computer.</p>}
        {recent.length > 0 && (
          <div className="relative">
            <div className="absolute left-0 top-0 bottom-0 w-[13px]" style={{ backgroundColor: '#08080a', backgroundImage: 'radial-gradient(circle at 50% 50%, #35373f 2.3px, transparent 3.1px)', backgroundSize: '13px 19px', backgroundRepeat: 'repeat-y', borderRadius: '8px 0 0 8px' }} />
            <div className="absolute right-0 top-0 bottom-0 w-[13px]" style={{ backgroundColor: '#08080a', backgroundImage: 'radial-gradient(circle at 50% 50%, #35373f 2.3px, transparent 3.1px)', backgroundSize: '13px 19px', backgroundRepeat: 'repeat-y', borderRadius: '0 8px 8px 0' }} />
            <div className="mx-[13px] px-2 py-2 space-y-3 max-h-[548px] overflow-y-auto scroll-smooth"
              style={{ background: '#101114', maskImage: 'linear-gradient(180deg, transparent, black 5%, black 95%, transparent)', WebkitMaskImage: 'linear-gradient(180deg, transparent, black 5%, black 95%, transparent)' }}>
              {recent.slice(0, 8).map((r, i) => (
                <button key={r.id} onClick={() => setStageRecord(r)} className="block w-full text-left group anim-fade">
                  <div className="relative overflow-hidden ring-1 ring-white/10" style={{ borderRadius: 10 }}>
                    <img src={api.imageUrl(r.image_path)} alt={r.prompt} className="w-full h-[104px] object-cover img-hover" loading="lazy" />
                    <span className="absolute top-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-black/65 text-white">#{i + 1}</span>
                    {r.favorite ? <span className="absolute top-1.5 right-1.5 text-rose-400 text-xs drop-shadow">♥</span> : null}
                  </div>
                  <div className="px-1 pt-1.5">
                    <span className="text-[11px] font-semibold truncate block">{r.model_name}</span>
                    <span className="text-[10px] text-mute truncate block">{r.prompt}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
