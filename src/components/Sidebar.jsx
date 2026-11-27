import React from 'react';
import { Sparkles, History, Heart, Server, FileSpreadsheet, Settings, Info, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

const ITEMS = [
  { key: 'create', label: 'Create Image', icon: Sparkles },
  { key: 'history', label: 'Image History', icon: History },
  { key: 'favorites', label: 'Favorites', icon: Heart },
  { key: 'providers', label: 'Providers & Models', icon: Server },
  { key: 'import', label: 'Import Excel', icon: FileSpreadsheet },
  { key: 'settings', label: 'Settings', icon: Settings },
  { key: 'about', label: 'About Application', icon: Info },
];

export default function Sidebar({ page, onNavigate, collapsed, onToggle }) {
  return (
    <aside className={`flex flex-col border-r border-line bg-navy/80 transition-all duration-300 ${collapsed ? 'w-[68px]' : 'w-60'}`}>
      <div className="flex items-center gap-3 px-4 h-16 border-b border-line">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg,#7c5cff,#3b82f6)' }}>
          <Sparkles size={19} color="#fff" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-bold leading-tight truncate">AI Creative Studio</div>
            <div className="text-[11px] text-mute leading-tight">PixAi · internal</div>
          </div>
        )}
      </div>
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {ITEMS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => onNavigate(key)} title={label}
            className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${page === key ? 'bg-panel2 text-white border border-line' : 'text-slate-300 hover:bg-panel hover:text-white border border-transparent'}`}>
            <Icon size={18} className={page === key ? 'text-cy' : ''} />
            {!collapsed && <span className="truncate">{label}</span>}
            {!collapsed && page === key && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-cy" />}
          </button>
        ))}
      </nav>
      <button onClick={onToggle} className="m-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-mute hover:text-white hover:bg-panel transition-all">
        {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        {!collapsed && 'Collapse'}
      </button>
    </aside>
  );
}
