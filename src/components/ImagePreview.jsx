import React, { useState } from 'react';
import { Download, RefreshCw, Copy, Maximize2, FolderOpen } from 'lucide-react';
import Modal from './Modal';
import { api } from '../services/api';
import { useToast } from './Toasts';

export default function ImagePreview({ record, onRegenerate }) {
  const toast = useToast();
  const [full, setFull] = useState(false);
  if (!record) {
    return (
      <div className="card h-full min-h-[320px] flex flex-col items-center justify-center text-center p-8">
        <div className="w-14 h-14 rounded-2xl bg-panel2 border border-line flex items-center justify-center text-mute text-2xl">✦</div>
        <p className="mt-4 text-sm text-mute max-w-[280px]">Your generated image will appear here. Pick a provider and model, write a prompt, and hit Generate.</p>
      </div>
    );
  }
  const url = api.imageUrl(record.image_path);
  return (
    <div className="card overflow-hidden anim-fade">
      <div className="relative bg-black/30">
        <img src={url} alt={record.prompt} className="w-full max-h-[520px] object-contain" />
        <button className="btn-ghost !px-2 !py-1.5 absolute top-3 right-3" onClick={() => setFull(true)} title="Full screen"><Maximize2 size={15} /></button>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-sm leading-relaxed line-clamp-3">{record.prompt}</p>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <span className="badge-info">{record.provider_name}</span>
          <span className="badge-mute">{record.model_name}</span>
          {record.width && <span className="badge-mute">{record.width} × {record.height}</span>}
          <span className="badge-mute">{new Date(record.created_at).toLocaleString()}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary !px-4 !py-2 text-sm" onClick={async () => { const r = await api.downloadImage(record.id); if (r.ok) toast('Image saved.', 'success'); }}><Download size={15} /> Download</button>
          <button className="btn-ghost text-sm" onClick={() => onRegenerate && onRegenerate(record)}><RefreshCw size={15} /> Regenerate</button>
          <button className="btn-ghost text-sm" onClick={() => { navigator.clipboard.writeText(record.prompt); toast('Prompt copied.', 'success'); }}><Copy size={15} /> Copy prompt</button>
          <button className="btn-ghost text-sm" onClick={() => api.showInFolder(record.id)}><FolderOpen size={15} /> Folder</button>
        </div>
      </div>
      {full && (
        <Modal title={record.model_name} wide onClose={() => setFull(false)}>
          <img src={url} alt={record.prompt} className="w-full object-contain max-h-[70vh]" />
        </Modal>
      )}
    </div>
  );
}
