'use strict';
const { CloudflareAdapter } = require('./cloudflare-adapter');
const { OpenRouterAdapter } = require('./openrouter-adapter');
const { OpenAICompatibleAdapter } = require('./openai-compatible-adapter');

const ADAPTERS = {
  cloudflare: new CloudflareAdapter(),
  openrouter: new OpenRouterAdapter(),
  'openai-compatible': new OpenAICompatibleAdapter(),
};

/**
 * Resolve which adapter a provider uses, from the workbook's Vendor/adapter
 * column. A factual fallback: if the column is blank, the Base URL host can
 * identify Cloudflare / OpenRouter. Anything else is unsupported — we never
 * pretend an unknown API format will work.
 * @returns {{adapterId: string|null, supported: boolean, source: 'workbook'|'base-url'|null}}
 */
function resolveAdapter(provider) {
  const raw = String((provider && (provider.adapterRaw || provider.adapter)) || '').toLowerCase();
  if (/cloudflare|workers\s*ai/.test(raw)) return { adapterId: 'cloudflare', supported: true, source: 'workbook' };
  if (/openrouter/.test(raw)) return { adapterId: 'openrouter', supported: true, source: 'workbook' };
  if (/openai/.test(raw)) return { adapterId: 'openai-compatible', supported: true, source: 'workbook' };
  if (!raw) {
    const url = String((provider && provider.baseUrl) || '').toLowerCase();
    if (url.includes('cloudflare.com')) return { adapterId: 'cloudflare', supported: true, source: 'base-url' };
    if (url.includes('openrouter.ai')) return { adapterId: 'openrouter', supported: true, source: 'base-url' };
    if (url.includes('api.openai.com')) return { adapterId: 'openai-compatible', supported: true, source: 'base-url' };
  }
  return { adapterId: null, supported: false, source: null };
}

function getAdapter(adapterId) { return ADAPTERS[adapterId] || null; }
function listAdapters() { return Object.values(ADAPTERS).map((a) => ({ id: a.id, displayName: a.displayName })); }

module.exports = { resolveAdapter, getAdapter, listAdapters, ADAPTERS };
