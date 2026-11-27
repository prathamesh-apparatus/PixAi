import React from 'react';
import { Sparkles, History, Heart, Server, Settings, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

const ITEMS = [
  { key: 'create', label: 'Create Image', icon: Sparkles },
  { key: 'history', label: 'Image History', icon: History },
  { key: 'favorites', label: 'Favorites', icon: Heart },
  { key: 'providers', label: 'Providers & Models', icon: Server },
  { key: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ page, onNavigate, collapsed, onToggle }) {
  return (
    <aside className={`flex flex-col bg-navy transition-all duration-300 ${collapsed ? 'w-[72px]' : 'w-60'}`}>
      <div className="flex items-center gap-3 px-4 h-[72px]">
        <div className="w-10 h-10 flex items-center justify-center shrink-0 text-white font-black text-lg"
          style={{ background: 'linear-gradient(135deg,#2f7bff,#7c5cff)', borderRadius: 14, boxShadow: '0 8px 20px rgba(47,123,255,0.35)' }}>
          P
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-bold leading-tight truncate">PixAi</div>
            <div className="text-[11px] text-mute leading-tight">AI Creative Studio</div>
          </div>
        )}
      </div>
      <nav className="flex-1 py-2 px-3 space-y-1.5 overflow-y-auto">
        {ITEMS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => onNavigate(key)} title={label}
            className={`w-full flex items-center gap-3 px-3.5 py-3 text-sm ${page === key ? 'bg-panel2 text-white shadow-card' : 'text-slate-300 hover:bg-panel hover:text-white'}`}
            style={{ borderRadius: 16 }}>
            <Icon size={19} className={page === key ? 'text-cy' : 'text-mute'} />
            {!collapsed && <span className="truncate font-medium">{label}</span>}
          </button>
        ))}
      </nav>
      <div className="p-3">
        {!collapsed && (
          <div className="px-3.5 py-3 text-[11px] leading-relaxed text-mute" style={{ borderRadius: 16, background: '#161a22' }}>
            Providers & models come from your Excel workbook. Update it any time with:<br />
            <span className="text-slate-300 font-mono text-[10.5px]">npm run import -- .\FabrixAPI1.xlsx</span>
          </div>
        )}
        <button onClick={onToggle} className="mt-2 w-full flex items-center gap-2 px-3 py-2 text-xs text-mute hover:text-white hover:bg-panel" style={{ borderRadius: 14 }}>
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </aside>
  );
}
