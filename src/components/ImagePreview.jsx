import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, Copy, Heart, Maximize2, ImageIcon, Sparkles } from 'lucide-react';
import Modal from './Modal';
import { api } from '../services/api';
import { useToast } from './Toasts';

/** Centre stage, modelled on the DigiArts reference: title bar on top of one
 *  big soft-rounded image card, action bar underneath — favorite pill left,
 *  Preview ghost button, solid blue Download on the right. */
export default function ImagePreview({ record, onRegenerate, onFavoriteChanged, busy = false, statusText = '' }) {
  const toast = useToast();
  const [full, setFull] = useState(false);
  const [fav, setFav] = useState(false);
  useEffect(() => { setFav(!!(record && record.favorite)); }, [record]);

  if (busy) {
    return (
      <div className="card h-full min-h-[380px] flex flex-col items-center justify-center text-center p-6 overflow-hidden relative">
        <span className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(420px 220px at 50% 42%, rgba(47,123,255,0.16), transparent 70%)' }} />
        <div className="relative w-24 h-24 flex items-center justify-center">
          <span className="gen-ring absolute inset-0 rounded-full border border-cyan-400/50" />
          <span className="gen-ring absolute inset-0 rounded-full border border-blue-500/40" style={{ animationDelay: '0.6s' }} />
          <span className="gen-ring absolute inset-0 rounded-full border border-violet-500/30" style={{ animationDelay: '1.2s' }} />
          <div className="gen-float w-14 h-14 flex items-center justify-center text-white relative"
            style={{ borderRadius: 18, background: 'linear-gradient(140deg,#38e1ff,#2f7bff 55%,#8b5cf6)', boxShadow: '0 12px 30px rgba(47,123,255,0.5), inset 0 1px 0 rgba(255,255,255,0.5)' }}>
            <Sparkles size={24} />
          </div>
        </div>
        <p className="mt-5 font-semibold text-sm relative">
          Generating your image
          <span className="gen-dot">.</span><span className="gen-dot" style={{ animationDelay: '0.2s' }}>.</span><span className="gen-dot" style={{ animationDelay: '0.4s' }}>.</span>
        </p>
        {statusText && <p className="mt-1 text-xs text-mute relative">{statusText}</p>}
        <div className="skeleton h-1.5 w-56 rounded-full mt-5 relative" />
        <p className="mt-3 text-[11px] text-mute relative">Painting pixels — this usually takes a few seconds.</p>
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
        <Modal title={record.model_name} wide onClose={() => setFull(false)}>
          <img src={url} alt={record.prompt} className="w-full object-contain max-h-[72vh]" style={{ borderRadius: 16 }} />
          <p className="text-sm text-mute mt-3 leading-relaxed">{record.prompt}</p>
        </Modal>
      )}
    </div>
  );
}
