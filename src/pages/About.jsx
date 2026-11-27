import React from 'react';

export default function About({ version, config }) {
  return (
    <div className="card p-8 max-w-2xl anim-page">
      <h3 className="text-xl font-bold mb-1">AI Creative Studio</h3>
      <p className="text-sm text-mute mb-5">PixAi · version {version} · internal tool for the media, social media and graphic design team.</p>
      <div className="space-y-3 text-sm leading-relaxed text-slate-300">
        <p>One desktop app for generating images with multiple AI providers. Providers and models are not built into the app — they come from your Excel workbook and can be updated at any time from <b>Import Excel</b>, without reinstalling.</p>
        <p>Everything is local: no login, no hosted backend, no cloud database. API requests go directly from this computer to the provider you select. Generated images, history and settings stay in the app's local data folder on this computer, and API keys are stored encrypted using your operating system's credential protection.</p>
        <p>Currently imported: <b>{(config.providers || []).length} providers</b> and <b>{(config.providers || []).reduce((n, p) => n + (p.models || []).length, 0)} image models</b>{config.sourceFile ? <> from <b>{config.sourceFile}</b></> : ''}.</p>
        <p className="text-mute text-xs">Supported provider adapters: Cloudflare Workers AI, OpenRouter, and OpenAI-compatible Images APIs. A provider with a different API format will be imported and shown with an “unsupported adapter” notice until an adapter is built for it.</p>
      </div>
    </div>
  );
}
