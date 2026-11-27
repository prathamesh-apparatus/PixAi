import React from 'react';
import { Sparkles } from 'lucide-react';

/** PixAi logo: glossy gradient aperture tile + wordmark. */
export default function Logo({ collapsed = false }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="relative w-9 h-9 shrink-0 flex items-center justify-center text-white"
        style={{
          borderRadius: 12,
          background: 'linear-gradient(140deg,#38e1ff 0%,#2f7bff 48%,#8b5cf6 100%)',
          boxShadow: '0 8px 22px rgba(47,123,255,0.45), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -8px 14px rgba(0,0,0,0.18)',
        }}>
        <Sparkles size={18} strokeWidth={2.4} />
        <span className="absolute inset-0 pointer-events-none" style={{ borderRadius: 12, background: 'linear-gradient(180deg, rgba(255,255,255,0.28), transparent 55%)' }} />
      </div>
      {!collapsed && (
        <div className="min-w-0 leading-none">
          <div className="font-extrabold text-[17px] tracking-tight truncate">
            Pix<span className="grad-text">Ai</span>
          </div>
          <div className="text-[10px] text-mute mt-1 tracking-wide truncate">AI CREATIVE STUDIO</div>
        </div>
      )}
    </div>
  );
}
