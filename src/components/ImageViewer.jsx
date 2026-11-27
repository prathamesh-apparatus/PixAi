import React, { useEffect } from 'react';
import { X, RefreshCw, Download } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from './Toasts';

/** Proper full-screen preview: covers the whole app window, image shown
 *  contain-fit at maximum size, slim header (model + close) and the prompt
 *  as a caption at the bottom. Esc or the X closes it. */
export default function ImageViewer({ record, onClose, onRegenerate }) {
  const toast = useToast();
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  if (!record) return null;
  return (
    <div className="fixed inset-0 z-[95] bg-black/[0.97] flex flex-col anim-fade" onClick={onClose}>
      <div className="flex items-center gap-3 px-5 h-14 shrink-0" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{record.model_name}</div>
          <div className="text-[11px] text-mute truncate">{record.provider_name} · {new Date(record.created_at).toLocaleString()}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {onRegenerate && (
            <button className="pill hover:border-slate-500" onClick={() => onRegenerate(record)}>
              <RefreshCw size={14} /> <span className="text-xs font-medium">Regenerate</span>
            </button>
          )}
          <button className="pill hover:border-slate-500" onClick={async () => { const r = await api.downloadImage(record.id); if (r.ok) toast('Image saved.', 'success'); }}>
            <Download size={14} /> <span className="text-xs font-medium">Download</span>
          </button>
          <button className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" onClick={onClose} title="Close (Esc)">
            <X size={17} />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center px-6" onClick={(e) => e.stopPropagation()}>
        <img src={api.imageUrl(record.image_path)} alt={record.prompt} className="max-w-full max-h-full object-contain anim-zoom" style={{ borderRadius: 12 }} />
      </div>
      <p className="px-6 py-4 text-center text-xs text-slate-400 leading-relaxed max-w-3xl mx-auto shrink-0" onClick={(e) => e.stopPropagation()}>{record.prompt}</p>
    </div>
  );
}
