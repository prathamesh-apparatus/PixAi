'use strict';
const { CloudflareAdapter } = require('./cloudflare-adapter');
const { OpenRouterAdapter } = require('./openrouter-adapter');
const { OpenAICompatibleAdapter } = require('./openai-compatible-adapter');
const { NvidiaAdapter } = require('./nvidia-adapter');
const { PollinationsAdapter } = require('./pollinations-adapter');
const { PuterAdapter } = require('./puter-adapter');

const ADAPTERS = {
  cloudflare: new CloudflareAdapter(),
  openrouter: new OpenRouterAdapter(),
  'openai-compatible': new OpenAICompatibleAdapter(),
  nvidia: new NvidiaAdapter(),
  pollinations: new PollinationsAdapter(),
  puter: new PuterAdapter(),
};

/**
 * Known API hosts. The real FabrixAPI1.xlsx labels both OpenRouter and NVIDIA
 * NIM simply as "OpenAI" in the Vendor/adapter column (meaning Bearer-auth,
 * OpenAI-style) — but their endpoints are NOT the OpenAI Images API, so the
 * Base URL host must win for these providers. Matching the host is factual:
 * openrouter.ai only serves the OpenRouter API, ai.api.nvidia.com only NIM.
 */
function adapterForHost(url) {
  const u = String(url || '').toLowerCase();
  if (u.includes('openrouter.ai')) return 'openrouter';
  if (u.includes('ai.api.nvidia.com') || u.includes('integrate.api.nvidia.com')) return 'nvidia';
  if (u.includes('cloudflare.com')) return 'cloudflare';
  // Eden AI's v3 API is OpenAI-compatible, images included:
  // POST {baseUrl}/images/generations with model "provider/model".
  if (u.includes('edenai.run')) return 'openai-compatible';
  if (u.includes('pollinations.ai')) return 'pollinations';
  if (u.includes('puter.com')) return 'puter';
  if (u.includes('api.openai.com')) return 'openai-compatible';
  return null;
}

/**
 * Resolve which adapter a provider uses.
 * Order: (1) known Base URL host, (2) the workbook's Vendor/adapter column,
 * (3) unsupported — we never pretend an unknown API format will work.
 * @returns {{adapterId: string|null, supported: boolean, source: 'base-url'|'workbook'|null}}
 */
function resolveAdapter(provider) {
  const byHost = adapterForHost(provider && provider.baseUrl);
  if (byHost) return { adapterId: byHost, supported: true, source: 'base-url' };
  const raw = String((provider && (provider.adapterRaw || provider.adapter)) || '').toLowerCase();
  if (/cloudflare|workers\s*ai/.test(raw)) return { adapterId: 'cloudflare', supported: true, source: 'workbook' };
  if (/openrouter/.test(raw)) return { adapterId: 'openrouter', supported: true, source: 'workbook' };
  if (/nvidia|nim\b/.test(raw)) return { adapterId: 'nvidia', supported: true, source: 'workbook' };
  if (/pollinations/.test(raw)) return { adapterId: 'pollinations', supported: true, source: 'workbook' };
  if (/puter/.test(raw)) return { adapterId: 'puter', supported: true, source: 'workbook' };
  if (/edenai|eden\s*ai/.test(raw)) return { adapterId: 'openai-compatible', supported: true, source: 'workbook' };
  if (/openai/.test(raw)) return { adapterId: 'openai-compatible', supported: true, source: 'workbook' };
  return { adapterId: null, supported: false, source: null };
}

function getAdapter(adapterId) { return ADAPTERS[adapterId] || null; }
function listAdapters() { return Object.values(ADAPTERS).map((a) => ({ id: a.id, displayName: a.displayName })); }

module.exports = { resolveAdapter, getAdapter, listAdapters, ADAPTERS, adapterForHost };
