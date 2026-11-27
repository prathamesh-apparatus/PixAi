import React, { useState } from 'react';
import { Heart, Download, Trash2, Copy, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from './Toasts';
import Modal from './Modal';

export default function ImageGallery({ records, onChanged, onRegenerate, onPreview }) {
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteFileToo, setDeleteFileToo] = useState(false);
  if (!records.length) {
    return <div className="card p-10 text-center text-sm text-mute">No images here yet. Generate your first image from the Create page.</div>;
  }
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {records.map((r) => (
          <div key={r.id} className="card overflow-hidden group">
            <button className="block w-full overflow-hidden" onClick={() => onPreview && onPreview(r)}>
              <img src={api.imageUrl(r.image_path)} alt={r.prompt} className="w-full h-44 object-cover img-hover" loading="lazy" />
            </button>
            <div className="p-3">
              <p className="text-xs leading-relaxed line-clamp-2 min-h-[32px]">{r.prompt}</p>
              <div className="flex items-center gap-1 mt-1 text-[11px] text-mute">
                <span className="truncate">{r.provider_name} · {r.model_name}</span>
              </div>
              <div className="flex items-center gap-1 mt-2">
                <button className="btn-ghost !px-2 !py-1" title={r.favorite ? 'Remove from favorites' : 'Add to favorites'}
                  onClick={async () => { await api.historyFavorite(r.id); onChanged && onChanged(); }}>
                  <Heart size={14} className={r.favorite ? 'text-rose-400 fill-rose-400' : ''} />
                </button>
                <button className="btn-ghost !px-2 !py-1" title="Download" onClick={async () => { const x = await api.downloadImage(r.id); if (x.ok) toast('Image saved.', 'success'); }}><Download size={14} /></button>
                <button className="btn-ghost !px-2 !py-1" title="Copy prompt" onClick={() => { navigator.clipboard.writeText(r.prompt); toast('Prompt copied.', 'success'); }}><Copy size={14} /></button>
                <button className="btn-ghost !px-2 !py-1" title="Regenerate" onClick={() => onRegenerate && onRegenerate(r)}><RefreshCw size={14} /></button>
                <button className="btn-ghost !px-2 !py-1 ml-auto" title="Delete" onClick={() => { setDeleteFileToo(false); setConfirmDelete(r); }}><Trash2 size={14} className="text-rose-300" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {confirmDelete && (
        <Modal title="Delete this image?" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-slate-300 leading-relaxed">
            This removes the image from PixAi's history. Choose what happens to the image file on this computer:
          </p>
          <label className="flex items-start gap-2.5 mt-4 rounded-xl border border-line bg-navy px-3.5 py-3 cursor-pointer hover:border-slate-500 transition-colors">
            <input type="checkbox" className="mt-0.5" checked={deleteFileToo} onChange={(e) => setDeleteFileToo(e.target.checked)} />
            <span className="text-sm leading-snug">
              Also delete the image file from this computer
              <span className="block text-xs text-mute mt-0.5">Leave this unticked to <b className="text-slate-200">preserve the file locally</b> (in Documents\PixAi Images) and only delete it from here.</span>
            </span>
          </label>
          <div className="flex justify-end gap-2 mt-5">
            <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn-ghost !border-rose-500/60 !text-rose-200" onClick={async () => {
              await api.historyDelete(confirmDelete.id, deleteFileToo);
              setConfirmDelete(null);
              toast(deleteFileToo ? 'Image and its file deleted.' : 'Removed from history — image file kept on this computer.', 'success');
              onChanged && onChanged();
            }}>Delete</button>
          </div>
        </Modal>
      )}
    </>
  );
}
