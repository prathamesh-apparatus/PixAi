import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, Copy, Heart, Maximize2, ImageIcon, Sparkles, X } from 'lucide-react';
import ImageViewer from './ImageViewer';
import { api } from '../services/api';
import { useToast } from './Toasts';

/** Centre stage, modelled on the DigiArts reference: title bar on top of one
 *  big soft-rounded image card, action bar underneath — favorite pill left,
 *  Preview ghost button, solid blue Download on the right. */
export default function ImagePreview({ record, onRegenerate, onFavoriteChanged, onClear, busy = false, statusText = '' }) {
  const toast = useToast();
  const [full, setFull] = useState(false);
  const [fav, setFav] = useState(false);
  useEffect(() => { setFav(!!(record && record.favorite)); }, [record]);

  if (busy) {
    // Soft, smooth generating visual (Ray: the bouncing dots felt glitchy /
    // vibrating): a breathing glow, one slow-spinning dashed ring and a
    // gently floating logo tile, plus a smooth sliding progress bar.
    return (
      <div className="card h-full min-h-[380px] flex flex-col items-center justify-center text-center p-6 overflow-hidden relative">
        <div className="relative w-[92px] h-[92px] flex items-center justify-center">
          <span className="gen-breathe absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, rgba(56,225,255,0.26), rgba(47,123,255,0.12) 55%, transparent 72%)' }} />
          <span className="gen-spin-slow absolute inset-0 rounded-full border border-dashed border-slate-500/40" />
          <div className="gen-float-soft w-14 h-14 flex items-center justify-center text-white relative"
            style={{ borderRadius: 18, background: 'linear-gradient(140deg,#38e1ff,#2f7bff 55%,#8b5cf6)', boxShadow: '0 12px 30px rgba(47,123,255,0.45), inset 0 1px 0 rgba(255,255,255,0.5)' }}>
            <Sparkles size={24} />
          </div>
        </div>
        <p className="mt-5 font-semibold text-sm">Generating your image…</p>
        {statusText && <p className="mt-1 text-xs text-mute">{statusText}</p>}
        <div className="w-56 h-1.5 rounded-full bg-panel2 overflow-hidden mt-5 relative">
          <div className="gen-bar absolute inset-y-0 w-1/3 rounded-full" style={{ background: 'linear-gradient(90deg,#38e1ff,#2f7bff,#8b5cf6)' }} />
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="card h-full min-h-[340px] flex flex-col items-center justify-center text-center p-6">
        <div className="w-12 h-12 flex items-center justify-center text-cy" style={{ borderRadius: 16, background: '#1e2025', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)' }}>
          <ImageIcon size={22} />
        </div>
        <p className="mt-3 text-xs text-mute max-w-[280px] leading-relaxed">Your generated image will appear here. Write a prompt in the bar below and hit Generate.</p>
      </div>
    );
  }
  const url = api.imageUrl(record.image_path);
  return (
    <div className="card overflow-hidden anim-zoom">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
        <h3 className="font-semibold text-sm truncate flex-1">{record.model_name}</h3>
        <span className="badge-mute hidden sm:inline-flex">{new Date(record.created_at).toLocaleString()}</span>
        <button className="btn-ghost !px-2.5 !py-1.5" onClick={() => setFull(true)} title="Full screen preview"><Maximize2 size={14} /></button>
        {onClear && (
          <button className="btn-ghost !px-2.5 !py-1.5" onClick={onClear} title="Clear the stage (the image stays in History and Documents)">
            <X size={14} />
          </button>
        )}
      </div>
      <div className="relative bg-black/40">
        <img src={url} alt={record.prompt} className="w-full max-h-[520px] object-contain anim-fade" key={record.id} />
      </div>
      <div className="px-4 pt-3">
        <p className="text-sm leading-relaxed line-clamp-2">{record.prompt}</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <span className="badge-info">{record.provider_name}</span>
          {record.width && <span className="badge-mute">{record.width} × {record.height}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2.5 p-4">
        <button className="pill hover:border-rose-400/60" title={fav ? 'Remove from favorites' : 'Add to favorites'}
          onClick={async () => { const r = await api.historyFavorite(record.id); const next = r ? !!r.favorite : !fav; setFav(next); onFavoriteChanged && onFavoriteChanged(); }}>
          <Heart size={16} className={fav ? 'text-rose-400 fill-rose-400' : 'text-slate-300'} />
          <span className="text-xs font-medium">{fav ? 'Favorited' : 'Favorite'}</span>
        </button>
        <button className="pill hover:border-slate-500" title="Copy prompt"
          onClick={() => { navigator.clipboard.writeText(record.prompt); toast('Prompt copied.', 'success'); }}>
          <Copy size={15} /> <span className="text-xs font-medium">Prompt</span>
        </button>
        <button className="pill hover:border-slate-500" title="Regenerate with the same prompt"
          onClick={() => onRegenerate && onRegenerate(record)}>
          <RefreshCw size={15} /> <span className="text-xs font-medium">Regenerate</span>
        </button>
        <button className="btn-ghost ml-auto !px-6 !py-3 !bg-[#23252c]" onClick={() => setFull(true)}>Preview</button>
        <button className="btn-primary !px-6 !py-3"
          onClick={async () => { const r = await api.downloadImage(record.id); if (r.ok) toast('Image saved.', 'success'); }}>
          <Download size={16} /> Download
        </button>
      </div>
      {full && (
        <ImageViewer record={record} onClose={() => setFull(false)}
          onRegenerate={onRegenerate ? (r) => { setFull(false); onRegenerate(r); } : undefined} />
      )}
    </div>
  );
}
