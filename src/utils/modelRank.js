// Auto model engine ordering (media-team mode: the user never picks a
// provider or model — the app tries models in this order and switches
// automatically on ANY failure: rate limit, free quota ended, auth, timeout).
//
// "Least credit first": the workbook has no per-model price column, so cost
// is ranked by the account type each provider runs on:
//   0 — explicitly free models (":free" variants) and free-allowance
//       providers (Pollinations credits, Puter monthly allowance)
//   1 — free daily tiers (Cloudflare free neurons, NVIDIA free tier)
//   2 — anything else / unknown
//   3 — paid credit accounts (OpenRouter prepaid, Eden AI subscription)
// Inside a cost tier, models that already generated successfully rank first,
// then untested ones, then rate-limited ones. Models whose free limit ended,
// whose key failed, or that were not found are still tried — last — because
// quotas reset and workbooks get fixed.

const FREE_PROVIDERS = new Set(['pollinations', 'puter']);
const FREE_TIER_PROVIDERS = new Set(['cloudflare-workers-ai-main', 'nvidia-nim-main']);
const PAID_PROVIDERS = new Set(['openrouter-main', 'edenai-main']);

export function costTier(provider, model) {
  if (/:free$/i.test(model.vendorModelId || '')) return 0;
  if (FREE_PROVIDERS.has(provider.id)) return 0;
  if (FREE_TIER_PROVIDERS.has(provider.id)) return 1;
  if (PAID_PROVIDERS.has(provider.id)) return 3;
  return 2;
}

const STATE_RANK = {
  'tested-ok': 0,
  'not-tested': 1,
  'rate-limited': 2,
  'quota-exhausted': 3,
  'auth-failed': 4,
  'model-not-found': 5,
};

/**
 * Ordered candidate list across all providers:
 * [{ providerId, modelId, providerName, modelName, costTier, testState }]
 */
export function rankCandidates(providers) {
  const out = [];
  for (const p of providers || []) {
    if (p.enabled === false || p.status !== 'active') continue;
    if (p.adapterSupported === false) continue;
    for (const m of p.models || []) {
      if (m.enabled === false || m.status !== 'active') continue;
      // A model the provider has already told us does not exist (retired /
      // wrong vendor ID) can never succeed — Auto skips it entirely instead
      // of wasting an attempt on it every run. It comes back automatically
      // when a re-import or a successful Manual test clears the state.
      if (m.testState === 'model-not-found') continue;
      out.push({
        providerId: p.id, modelId: m.id,
        providerName: p.name, modelName: m.name,
        costTier: costTier(p, m),
        testState: m.testState || 'not-tested',
      });
    }
  }
  out.sort((a, b) =>
    (a.costTier - b.costTier) ||
    ((STATE_RANK[a.testState] ?? 1) - (STATE_RANK[b.testState] ?? 1)) ||
    a.providerName.localeCompare(b.providerName) ||
    a.modelName.localeCompare(b.modelName));
  return out;
}

/** Put one specific model first (Regenerate keeps its original model),
 *  followed by the normal auto order for fallback. */
export function candidatesWithPreferred(providers, providerId, modelId) {
  const ranked = rankCandidates(providers);
  const idx = ranked.findIndex((c) => c.providerId === providerId && c.modelId === modelId);
  if (idx <= 0) return ranked;
  const [first] = ranked.splice(idx, 1);
  return [first, ...ranked];
}
