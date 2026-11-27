import React from 'react';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';

export default function MainLayout({ page, onNavigate, collapsed, onToggle, providerName, modelName, version, children }) {
  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar page={page} onNavigate={onNavigate} collapsed={collapsed} onToggle={onToggle} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header page={page} providerName={providerName} modelName={modelName} version={version} />
        <main className="flex-1 overflow-y-auto p-5 lg:p-6">
          <div key={page} className="anim-page max-w-[1500px] mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
