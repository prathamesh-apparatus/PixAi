import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, Copy, Heart, Maximize2, ImageIcon, X } from 'lucide-react';
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
    // Ray's pick: colourful dots travelling up and down in a zigzag wave.
    // Kept smooth — a slow eased sine-style wave with staggered phases,
    // not a sharp bounce — over a soft glow, with the gradient progress bar.
    const DOTS = ['#ffc107', '#ff5252', '#f472b6', '#7c4dff', '#40c4ff', '#69f0ae', '#fb923c'];
    return (
      <div className="card h-full min-h-[380px] flex flex-col items-center justify-center text-center p-6 overflow-hidden relative">
        <span className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(420px 220px at 50% 42%, rgba(124,58,237,0.13), transparent 70%)' }} />
        <div className="relative flex items-center gap-[9px] h-12">
          {DOTS.map((c, i) => (
            <span key={i} className="gen-zig block w-3 h-3 rounded-full"
              style={{ background: c, animationDelay: `${i * 0.14}s`, boxShadow: `0 5px 16px ${c}59, inset 0 1px 0 rgba(255,255,255,0.45)` }} />
          ))}
        </div>
        <p className="mt-5 font-semibold text-sm relative">Generating your image…</p>
        {statusText && <p className="mt-1 text-xs text-mute relative">{statusText}</p>}
        <div className="w-56 h-1.5 rounded-full bg-panel2 overflow-hidden mt-5 relative">
          <div className="gen-bar absolute inset-y-0 w-1/2 rounded-full" style={{ background: 'linear-gradient(90deg,#38bdf8,#8b5cf6,#f472b6)' }} />
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
