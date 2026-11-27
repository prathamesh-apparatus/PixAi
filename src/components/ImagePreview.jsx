import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, Copy, Heart, Maximize2, ImageIcon } from 'lucide-react';
import Modal from './Modal';
import { api } from '../services/api';
import { useToast } from './Toasts';

/** Centre stage, modelled on the reference: one big soft-rounded image card,
 *  with an action bar underneath — favorite pill left, Preview ghost button,
 *  solid blue Download on the right. */
export default function ImagePreview({ record, onRegenerate, onFavoriteChanged }) {
  const toast = useToast();
  const [full, setFull] = useState(false);
  const [fav, setFav] = useState(false);
  useEffect(() => { setFav(!!(record && record.favorite)); }, [record]);

  if (!record) {
    return (
      <div className="card h-full min-h-[340px] flex flex-col items-center justify-center text-center p-6">
        <div className="w-12 h-12 flex items-center justify-center text-cy" style={{ borderRadius: 16, background: '#2c1e12', boxShadow: 'inset 0 1px 0 rgba(255,190,120,0.15)' }}>
          <ImageIcon size={22} />
        </div>
        <p className="mt-3 text-xs text-mute max-w-[280px] leading-relaxed">Your generated image will appear here. Choose a provider and model, write a prompt, and hit Generate.</p>
      </div>
    );
  }
  const url = api.imageUrl(record.image_path);
  return (
    <div className="card overflow-hidden anim-zoom">
      <div className="relative bg-black/40">
        <img src={url} alt={record.prompt} className="w-full max-h-[560px] object-contain anim-fade" key={record.id} />
        <button className="btn-ghost !px-2.5 !py-2 absolute top-3.5 right-3.5" onClick={() => setFull(true)} title="Full screen preview"><Maximize2 size={15} /></button>
      </div>
      <div className="px-4 pt-3">
        <p className="text-sm leading-relaxed line-clamp-2">{record.prompt}</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <span className="badge-info">{record.provider_name}</span>
          <span className="badge-mute">{record.model_name}</span>
          {record.width && <span className="badge-mute">{record.width} × {record.height}</span>}
          <span className="badge-mute">{new Date(record.created_at).toLocaleString()}</span>
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
        <button className="btn-ghost ml-auto !px-6 !py-3 !bg-[#2c1e12]" onClick={() => setFull(true)}>Preview</button>
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
