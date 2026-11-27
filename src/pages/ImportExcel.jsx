import React, { useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import ImportPreview from '../components/ImportPreview';
import { api } from '../services/api';
import { useToast } from '../components/Toasts';

export default function ImportExcel({ onImported, externalPreview, onExternalHandled }) {
  const toast = useToast();
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => { if (externalPreview) { setPreview(externalPreview); onExternalHandled && onExternalHandled(); } }, [externalPreview]);

  async function pick() {
    setError('');
    try {
      const res = await api.importPreview();
      if (res && !res.cancelled) setPreview(res);
    } catch (e) {
      setError(e.message || 'That workbook could not be imported. Your current configuration was not changed.');
    }
  }
  async function confirm(confirmDeactivations) {
    setBusy(true);
    try {
      await api.importCommit(preview.previewId, confirmDeactivations);
      setPreview(null);
      toast('Configuration updated from the workbook. Providers and models are refreshed.', 'success');
      onImported && onImported();
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  }
  async function cancel() {
    if (preview) await api.importCancel(preview.previewId).catch(() => {});
    setPreview(null);
  }

  if (preview) return <ImportPreview preview={preview} onConfirm={confirm} onCancel={cancel} busy={busy} />;
  return (
    <div className="card p-8 max-w-2xl anim-page">
      <div className="w-12 h-12 rounded-2xl bg-panel2 border border-line flex items-center justify-center mb-4"><FileSpreadsheet size={22} className="text-cy" /></div>
      <h3 className="font-semibold text-lg mb-2">Import provider workbook</h3>
      <p className="text-sm text-slate-300 leading-relaxed mb-2">
        Choose an updated Excel workbook (for example <b>FabrixAPI1.xlsx</b>). PixAi reads the inventory sheet,
        detects new, updated and removed providers and image models, and shows you a full preview before anything changes.
      </p>
      <ul className="text-sm text-mute space-y-1 mb-5 list-disc pl-5">
        <li>New providers and models appear automatically — no reinstall, no code changes.</li>
        <li>Your previous configuration is backed up before every update and can be restored from Settings.</li>
        <li>A failed or invalid import never touches your working configuration.</li>
        <li>API keys go to secure local storage and are never displayed.</li>
      </ul>
      {error && <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 mb-4">{error}</div>}
      <button className="btn-primary" onClick={pick}><Upload size={16} /> Choose Excel file…</button>
    </div>
  );
}
