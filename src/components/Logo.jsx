import React from 'react';

/**
 * PixAi logo mark, modelled on Ray's reference: a photo-frame card with
 * mountains and a sun on a violet→pink→orange gradient, a blue card tilted
 * behind it, an orbit swoosh around the pair, and pixel squares escaping
 * the top-right corner. Drawn as SVG so it stays crisp at any size.
 */
export function LogoMark({ size = 38 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 76 72" fill="none" aria-label="PixAi logo" style={{ filter: 'drop-shadow(0 6px 14px rgba(124,58,237,0.35))' }}>
      <defs>
        <linearGradient id="px-back" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id="px-front" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6d28d9" />
          <stop offset="0.45" stopColor="#d946ef" />
          <stop offset="0.75" stopColor="#fb7185" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id="px-ring" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="0.5" stopColor="#a855f7" />
          <stop offset="1" stopColor="#fb923c" />
        </linearGradient>
        <linearGradient id="px-sun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fef08a" />
          <stop offset="1" stopColor="#fbbf24" />
        </linearGradient>
        <clipPath id="px-clip">
          <rect x="24" y="19" width="34" height="34" rx="8" />
        </clipPath>
      </defs>

      {/* orbit swoosh behind the cards */}
      <ellipse cx="37" cy="40" rx="33" ry="11.5" transform="rotate(-14 37 40)" stroke="url(#px-ring)" strokeWidth="3.4" opacity="0.9" />

      {/* tilted blue back card */}
      <rect x="12" y="17" width="42" height="42" rx="11" transform="rotate(-9 33 38)" fill="url(#px-back)" />

      {/* front photo card: white frame + gradient scene */}
      <g transform="rotate(-4 41 36)">
        <rect x="19" y="14" width="44" height="44" rx="11" fill="#f8fafc" />
        <rect x="24" y="19" width="34" height="34" rx="8" fill="url(#px-front)" />
        <g clipPath="url(#px-clip)">
          <circle cx="47" cy="29" r="5" fill="url(#px-sun)" />
          <path d="M22 50 L34 34 L42 43 L47 37.5 L60 50 L60 55 L22 55 Z" fill="rgba(255,255,255,0.95)" />
          <path d="M22 53 L38 40 L47 48 L53 43 L60 50 L60 55 L22 55 Z" fill="rgba(255,255,255,0.55)" />
        </g>
      </g>

      {/* pixel squares escaping the top-right */}
      <rect x="57" y="3" width="9" height="9" rx="2.5" fill="#7c3aed" />
      <rect x="67" y="10" width="7" height="7" rx="2" fill="#ec4899" />
      <rect x="59" y="14" width="5.5" height="5.5" rx="1.6" fill="#fb923c" />
    </svg>
  );
}

/** Sidebar logo: the mark + wordmark (mark only when collapsed). */
export default function Logo({ collapsed = false }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <LogoMark size={collapsed ? 36 : 38} />
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
