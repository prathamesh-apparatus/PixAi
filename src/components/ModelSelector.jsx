import React from 'react';
import { testStateBadge } from '../services/api';

export default function ModelSelector({ provider, value, onChange }) {
  const models = provider ? (provider.models || []).filter((m) => m.enabled !== false && m.status === 'active') : [];
  const selected = models.find((m) => m.id === value);
  return (
    <div>
      <label className="label">Model</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={!provider}>
        <option value="">{provider ? 'Select a model…' : 'Select a provider first'}</option>
        {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      {selected && (
        <div className="mt-2.5 space-y-1.5">
          {selected.description && <p className="text-xs text-slate-300 leading-relaxed">{selected.description}</p>}
          <div className="flex flex-wrap gap-1.5">
            <span className="badge-info">{provider.adapter || provider.adapterRaw || 'no adapter'}</span>
            <span className={testStateBadge(selected.testState).cls}>{testStateBadge(selected.testState).label}</span>
            {selected.vendorModelId && <span className="badge-mute">{selected.vendorModelId}</span>}
          </div>
          {provider.adapterSupported === false && (
            <p className="text-xs text-amber-300">This provider's adapter is not implemented yet — its configuration is imported, but generation needs a new adapter module.</p>
          )}
        </div>
      )}
      {provider && models.length === 0 && (
        <p className="text-xs text-amber-300 mt-1.5">This provider has no active image models in the imported workbook.</p>
      )}
    </div>
  );
}
