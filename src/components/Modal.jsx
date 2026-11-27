import React from 'react';
import { X } from 'lucide-react';

export default function Modal({ title, children, onClose, wide }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60 anim-fade" onClick={onClose}>
      <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[88vh] flex flex-col anim-page`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-mute hover:text-white transition-colors"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Confirm({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-slate-300 leading-relaxed">{message}</p>
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className={danger ? 'btn-ghost !border-rose-500/60 !text-rose-200' : 'btn-primary'} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}
