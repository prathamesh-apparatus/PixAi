import React from 'react';

/** Renders ONLY the settings the selected model's adapter declares. */
export default function GenerationSettings({ capabilities, values, onChange }) {
  if (!capabilities || !capabilities.length) {
    return <p className="text-xs text-mute">Select a model to see its generation settings.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      {capabilities.map((cap) => (
        <div key={cap.key}>
          <label className="label">{cap.label}</label>
          {cap.type === 'select' ? (
            <select className="input" value={values[cap.key] ?? cap.default}
              onChange={(e) => onChange(cap.key, e.target.value)}>
              {cap.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input className="input" type="number" min={cap.min} max={cap.max}
              value={values[cap.key] ?? cap.default}
              onChange={(e) => onChange(cap.key, e.target.value === '' ? '' : Number(e.target.value))} />
          )}
        </div>
      ))}
    </div>
  );
}
