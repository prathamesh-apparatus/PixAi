import React from 'react';

/** Renders ONLY the settings the selected model's adapter declares. */
export default function GenerationSettings({ capabilities, values, onChange, inline = false }) {
  if (!capabilities || !capabilities.length) {
    return inline ? null : <p className="text-xs text-mute">Select a model to see its generation settings.</p>;
  }
  return (
    <div className={inline ? 'flex flex-wrap items-end gap-2.5' : 'grid grid-cols-2 gap-3'}>
      {capabilities.map((cap) => (
        <div key={cap.key} className={inline ? 'w-[128px]' : ''}>
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
