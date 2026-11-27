import React from 'react';

export default function ProviderSelector({ providers, value, onChange }) {
  const active = providers.filter((p) => p.enabled !== false && p.status === 'active');
  return (
    <div>
      <label className="label">Provider</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select a provider…</option>
        {active.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}{p.adapterSupported === false ? ' (unsupported adapter)' : ''}
          </option>
        ))}
      </select>
      {providers.length > 0 && active.length === 0 && (
        <p className="text-xs text-amber-300 mt-1.5">All imported providers are disabled or inactive.</p>
      )}
    </div>
  );
}
