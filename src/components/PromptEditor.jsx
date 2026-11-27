import React, { useState } from 'react';
import { Copy, Eraser, Lightbulb } from 'lucide-react';
import { useToast } from './Toasts';

const EXAMPLES = [
  'Premium commercial product photography of a green wheatgrass juice bottle placed on a natural wooden surface, fresh green wheatgrass surrounding the product, soft studio lighting, realistic textures, clean composition, professional advertising photography.',
  'Modern office interior with floor-to-ceiling windows, warm evening light, plants and minimalist furniture, architectural photography.',
  'Festive Diwali social media creative, marigold flowers and brass diyas on a deep navy background, elegant gold typography space at the top, premium look.',
];

export default function PromptEditor({ value, onChange, history, compact = false }) {
  const toast = useToast();
  const [showExamples, setShowExamples] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="label !mb-0">Prompt</label>
        <div className="flex gap-1">
          <button className="btn-ghost !px-2 !py-1 !text-xs" title="Copy prompt" onClick={() => { navigator.clipboard.writeText(value || ''); toast('Prompt copied.', 'success'); }}><Copy size={13} /></button>
          <button className="btn-ghost !px-2 !py-1 !text-xs" title="Clear prompt" onClick={() => onChange('')}><Eraser size={13} /></button>
          <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => setShowExamples((s) => !s)}><Lightbulb size={13} /> Examples</button>
        </div>
      </div>
      <textarea className={`input resize-y ${compact ? 'min-h-[72px]' : 'min-h-[110px]'}`} placeholder="Describe the image you want to create..."
        value={value} onChange={(e) => onChange(e.target.value)} maxLength={4000} />
      <div className="flex justify-between mt-1">
        <div className="text-[11px] text-mute">
          {history && history.length > 0 && (
            <select className="bg-transparent text-mute outline-none cursor-pointer" value="" onChange={(e) => e.target.value && onChange(e.target.value)}>
              <option value="">Recent prompts…</option>
              {history.slice(0, 8).map((h) => <option key={h.id} value={h.prompt}>{h.prompt.slice(0, 60)}</option>)}
            </select>
          )}
        </div>
        <span className="text-[11px] text-mute">{(value || '').length} / 4000</span>
      </div>
      {showExamples && (
        <div className="mt-2 space-y-2 anim-fade">
          {EXAMPLES.map((ex, i) => (
            <button key={i} onClick={() => { onChange(ex); setShowExamples(false); }}
              className="block w-full text-left text-xs leading-relaxed rounded-xl border border-line bg-navy px-3 py-2 hover:border-accent transition-colors">
              {ex}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
