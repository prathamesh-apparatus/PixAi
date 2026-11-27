import React from 'react';
import { Sparkles, History, Heart, Server, Settings, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Logo from './Logo';

const ITEMS = [
  { key: 'create', label: 'Create Image', icon: Sparkles },
  { key: 'history', label: 'Image History', icon: History },
  { key: 'favorites', label: 'Favorites', icon: Heart },
  { key: 'providers', label: 'Providers & Models', icon: Server },
];

function NavButton({ item, active, collapsed, onNavigate }) {
  const Icon = item.icon;
  return (
    <button onClick={() => onNavigate(item.key)} title={item.label}
      className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm ${active ? 'text-white' : 'text-slate-300 hover:bg-panel hover:text-white hover:translate-x-0.5'}`}
      style={active
        ? { borderRadius: 14, background: '#26282f', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), 0 6px 18px rgba(0,0,0,0.35)' }
        : { borderRadius: 14 }}>
      <Icon size={18} className={active ? 'text-cy' : 'text-mute'} />
      {!collapsed && <span className="truncate font-medium">{item.label}</span>}
    </button>
  );
}

export default function Sidebar({ page, onNavigate, collapsed, onToggle }) {
  return (
    <aside className={`flex flex-col bg-navy transition-all duration-300 ${collapsed ? 'w-[72px]' : 'w-60'}`}>
      {collapsed ? (
        <div className="flex flex-col items-center gap-2 py-3.5">
          <Logo collapsed />
          <button onClick={onToggle} title="Expand sidebar"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-mute hover:text-white hover:bg-panel transition-colors">
            <PanelLeftOpen size={16} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 h-16">
          <Logo collapsed={false} />
          <button onClick={onToggle} title="Collapse sidebar"
            className="ml-auto w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-mute hover:text-white hover:bg-panel transition-colors">
            <PanelLeftClose size={16} />
          </button>
        </div>
      )}
      <nav className="flex-1 py-2 px-3 space-y-1.5 overflow-y-auto">
        {ITEMS.map((item) => (
          <NavButton key={item.key} item={item} active={page === item.key} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </nav>
      <div className="p-3 border-t border-line">
        <NavButton item={{ key: 'settings', label: 'Settings', icon: Settings }}
          active={page === 'settings'} collapsed={collapsed} onNavigate={onNavigate} />
      </div>
    </aside>
  );
}
