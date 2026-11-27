import React from 'react';

const TITLES = {
  create: 'Create Image', history: 'Image History', favorites: 'Favorites',
  providers: 'Providers & Models', settings: 'Settings',
};

export default function Header({ page, providerName, modelName, version }) {
  return (
    <header className="h-14 flex items-center gap-4 px-5 border-b border-line glass shrink-0">
      <h1 className="text-base font-semibold">{TITLES[page] || 'PixAi'}</h1>
      <div className="ml-auto flex items-center gap-3 text-xs text-mute min-w-0">
        {(providerName || modelName) && (
          <span className="hidden md:inline truncate">
            {providerName}{modelName ? ` · ${modelName}` : ''}
          </span>
        )}
        <span className="badge-mute">v{version}</span>
      </div>
    </header>
  );
}
