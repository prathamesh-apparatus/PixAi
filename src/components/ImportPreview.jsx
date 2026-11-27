import React, { useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';

function Section({ title, items, render, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  if (!items || !items.length) return null;
  return (
    <div className="border border-line rounded-xl overflow-hidden">
      <button className="w-full flex items-center gap-2 px-3.5 py-2.5 bg-panel2 text-sm font-medium" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />} {title}
        <span className="ml-auto badge-mute">{items.length}</span>
      </button>
      {open && <div className="px-3.5 py-2.5 space-y-1.5 text-sm">{items.map(render)}</div>}
    </div>
  );
}

export default function ImportPreview({ preview, onConfirm, onCancel, busy }) {
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const s = preview.summary;
  const rows = [
    ['Providers found', s.providersFound], ['New providers', s.newProviders], ['Updated providers', s.updatedProviders],
    ['New image models', s.newModels], ['Updated models', s.updatedModels], ['Removed or inactive models', s.removedOrInactiveModels],
    ['API credentials updated', s.credentialsUpdated], ['Unchanged models', s.unchangedModels],
    ['Unsupported providers', s.unsupportedProviders], ['Validation warnings', s.validationWarnings],
    ['Text/non-image models excluded', s.nonImageModelsExcluded],
  ];
  const sec = preview.sections;
  return (
    <div className="space-y-4 anim-page">
      <div className="card p-5">
        <h3 className="font-semibold mb-1">Import summary</h3>
        <p className="text-xs text-mute mb-4">{preview.sourceFile} · sheet “{preview.sheetName}” — nothing has been changed yet. API keys are never shown here.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
          {rows.map(([label, v]) => (
            <div key={label} className="rounded-xl bg-navy border border-line px-3.5 py-2.5">
              <div className="text-xl font-bold">{v}</div>
              <div className="text-[11px] text-mute">{label}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2.5">
        <Section title="New Providers" items={sec.newProviders} defaultOpen render={(p, i) => <div key={i}>{p.name} <span className="text-mute">· {p.modelCount} models</span></div>} />
        <Section title="Updated Providers" items={sec.updatedProviders} render={(p, i) => <div key={i}>{p.name} <span className="text-mute">· changed: {p.changedFields.join(', ')}</span></div>} />
        <Section title="New Models" items={sec.newModels} defaultOpen render={(m, i) => <div key={i}>{m.name} <span className="text-mute">· {m.providerName} · {m.vendorModelId}</span></div>} />
        <Section title="Updated Models" items={sec.updatedModels} render={(m, i) => <div key={i}>{m.name} <span className="text-mute">· {m.providerName} · changed: {m.changedFields.join(', ')}</span></div>} />
        <Section title="Removed Models" items={sec.removedModels} render={(m, i) => <div key={i}>{m.name} <span className="text-mute">· {m.providerName} · {m.reason}</span></div>} />
        <Section title="Unchanged Models" items={sec.unchangedModels} render={(m, i) => <div key={i}>{m.name} <span className="text-mute">· {m.providerName}</span></div>} />
        <Section title="Unsupported Providers" items={sec.unsupportedProviders} defaultOpen render={(p, i) => <div key={i} className="text-amber-200">{p.name} <span className="text-mute">· adapter “{p.adapterRaw || 'unknown'}” is not implemented yet</span></div>} />
        <Section title="Validation Warnings" items={sec.warnings} defaultOpen render={(w, i) => <div key={i} className="flex gap-2 text-amber-200"><AlertTriangle size={14} className="shrink-0 mt-0.5" />{w}</div>} />
      </div>
      {preview.hasRemovals && (
        <label className="flex items-start gap-2.5 card p-4 cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={confirmDeactivate} onChange={(e) => setConfirmDeactivate(e.target.checked)} />
          <span className="text-sm">Deactivate models that were removed from this workbook or marked inactive.
            <span className="block text-xs text-mute mt-0.5">Their history and downloaded images are always kept. If you leave this off, removed models stay as they are.</span>
          </span>
        </label>
      )}
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onCancel} disabled={busy}>Cancel Import</button>
        <button className="btn-primary" onClick={() => onConfirm(confirmDeactivate)} disabled={busy}>{busy ? 'Updating…' : 'Confirm and Update'}</button>
      </div>
    </div>
  );
}
