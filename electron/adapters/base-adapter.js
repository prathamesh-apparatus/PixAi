'use strict';
/** Base adapter: every provider adapter implements this contract. */

class AdapterError extends Error {
  constructor(message, { code = 'PROVIDER_ERROR', status = null, diagnostic = '' } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.diagnostic = diagnostic; // safe technical detail, never contains credentials
  }
}

function mapHttpError(status, bodyText) {
  let detail = '';
  try {
    const j = JSON.parse(bodyText);
    detail = (j.error && (j.error.message || j.error.code)) || j.message || j.msg || '';
  } catch { detail = String(bodyText || '').slice(0, 200); }
  const diag = `HTTP ${status}${detail ? `: ${detail}` : ''}`;
  if (status === 401 || status === 403) return new AdapterError('Authentication failed — the API key for this provider was rejected. Check the key in Provider Settings.', { code: 'AUTH_FAILED', status, diagnostic: diag });
  if (status === 429) return new AdapterError('Rate limit exceeded for this provider. Wait a moment and try again.', { code: 'RATE_LIMITED', status, diagnostic: diag });
  if (status === 402) return new AdapterError('Insufficient balance / quota exhausted for this provider account.', { code: 'QUOTA_EXHAUSTED', status, diagnostic: diag });
  if (status === 404) return new AdapterError('Model not found at this provider. The vendor model ID may have changed — re-import the workbook.', { code: 'MODEL_NOT_FOUND', status, diagnostic: diag });
  if (status === 400) return new AdapterError(`The provider rejected the request: ${detail || 'invalid parameters'}`, { code: 'INVALID_REQUEST', status, diagnostic: diag });
  if (status >= 500) return new AdapterError('The provider is unavailable right now (server error). Try again later.', { code: 'PROVIDER_UNAVAILABLE', status, diagnostic: diag });
  return new AdapterError(`Provider request failed (${diag}).`, { code: 'PROVIDER_ERROR', status, diagnostic: diag });
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs = 120000, signal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), timeoutMs);
  const onAbort = () => ctrl.abort(signal.reason);
  if (signal) {
    if (signal.aborted) ctrl.abort(signal.reason);
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    return await fetchImpl(url, { ...options, signal: ctrl.signal });
  } catch (e) {
    if (e && e.name === 'AbortError') {
      if (signal && signal.aborted) throw new AdapterError('Generation cancelled.', { code: 'CANCELLED' });
      throw new AdapterError('The provider request timed out. Try again, or choose a faster model.', { code: 'TIMEOUT' });
    }
    throw new AdapterError(`Network error while contacting the provider: ${e.message}`, { code: 'NETWORK_ERROR', diagnostic: e.message });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

class BaseAdapter {
  constructor() {
    this.id = 'base';
    this.displayName = 'Base';
  }
  /** Settings this adapter can send. The UI shows only these. */
  capabilities(/* model */) {
    return [
      { key: 'aspectRatio', label: 'Aspect ratio', type: 'select', options: ['1:1', '16:9', '9:16', '4:3', '3:4'], default: '1:1' },
      { key: 'count', label: 'Number of images', type: 'number', min: 1, max: 4, default: 1 },
    ];
  }
  supportsNegativePrompt() { return false; }
  // eslint-disable-next-line no-unused-vars
  async generate(ctx) { throw new Error('generate() not implemented'); }
  /** Lightweight connectivity test (auth check only — does NOT prove a model works). */
  // eslint-disable-next-line no-unused-vars
  async testConnection(ctx) { return { ok: false, message: 'No connectivity test for this adapter.' }; }
}

module.exports = { BaseAdapter, AdapterError, mapHttpError, fetchWithTimeout };
