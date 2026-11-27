import React, { useState } from 'react';
import { Heart, Download, Trash2, Copy, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from './Toasts';
import { Confirm } from './Modal';

export default function ImageGallery({ records, onChanged, onRegenerate, onPreview }) {
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(null);
  if (!records.length) {
    return <div className="card p-10 text-center text-sm text-mute">No images here yet. Generate your first image from the Create page.</div>;
  }
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {records.map((r) => (
          <div key={r.id} className="card overflow-hidden group">
            <button className="block w-full" onClick={() => onPreview && onPreview(r)}>
              <img src={api.imageUrl(r.image_path)} alt={r.prompt} className="w-full h-44 object-cover" loading="lazy" />
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
                <button className="btn-ghost !px-2 !py-1 ml-auto" title="Delete" onClick={() => setConfirmDelete(r)}><Trash2 size={14} className="text-rose-300" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {confirmDelete && (
        <Confirm title="Delete this image record?" danger confirmLabel="Delete record"
          message="This removes the history record. The image file itself is kept unless you also choose to delete it — use Download first if you want a copy."
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            const alsoFile = window.confirm('Also delete the image file from this computer? OK = delete file too, Cancel = keep the file.');
            await api.historyDelete(confirmDelete.id, alsoFile);
            setConfirmDelete(null); toast('History record deleted.', 'success'); onChanged && onChanged();
          }} />
      )}
    </>
  );
}
