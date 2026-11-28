// Auto model engine v13 — capability-first scoring router (text-to-image).
//
// Pipeline per request:
//   1. HARD FILTERS — inactive/unsupported/not-found models are out; under
//      Free-Only, anything not confirmed free is out (fail closed: a paid
//      model is NEVER called, even as a last resort); models in cooldown
//      (rate-limited, or free quota ended for today) are benched until
//      their cooldown expires and only rejoin as a last-resort tail.
//   2. SCORING — survivors are scored for THIS prompt's category:
//        score = quality-prior(category) .30 + success history .25
//              + cost .20 + health .15 + speed .10
//      Success history comes from real generation outcomes recorded on the
//      model (stats.ok/fail, per-category too), so the ranking learns:
//      the model that actually works for posters stops being tried last
//      for posters. Quality priors are heuristics from the model family
//      (Recraft = text/posters, FLUX = photoreal/product, SDXL = cartoon,
//      weak at rendered text) until real stats take over.
//   3. EXPLORATION — for roughly 1 request in 10 (deterministic hash of
//      the prompt), candidates #2 and #3 swap so a rising model can prove
//      itself instead of the ranking freezing forever.

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

/** Pollinations gateway model name for a workbook vendor ID (mirrors the
 *  adapter's mapping — the renderer cannot import the main-process code). */
function pollinationsParam(vendorModelId) {
  const v = String(vendorModelId || '').toLowerCase();
  if (v.includes('gptimage') || v.includes('gpt-image')) return 'gptimage';
  if (v.includes('kontext')) return 'kontext';
  if (v.includes('seedream')) return 'seedream';
  if (v.includes('nanobanana') || v.includes('nano-banana')) return 'nanobanana';
  if (v.includes('zimage')) return 'zimage';
  if (v.includes('turbo')) return 'turbo';
  return 'flux';
}
const POLLINATIONS_FREE = new Set(['flux', 'kontext', 'klein', 'zimage']);
const POLLINATIONS_PAID = new Set(['gptimage', 'seedream', 'nanobanana']);

/**
 * Is this model confirmed free, confirmed paid, or unpriced?
 * 'unknown' is treated as NOT free by Free-Only (fail closed).
 */
export function priceClass(provider, model) {
  const v = String((model && model.vendorModelId) || '');
  if (/:free$/i.test(v)) return 'free';
  const pid = (provider && provider.id) || '';
  const adapter = (provider && provider.adapter) || '';
  if (pid === 'openrouter-main' || adapter === 'openrouter') return 'paid';
  if (pid === 'edenai-main' || adapter === 'edenai') {
    // Only the OVHcloud SDXL model is proven free on Eden (live cost 0);
    // every other Eden model bills per image.
    return /ovhcloud\/stable-diffusion-xl/i.test(v) ? 'free' : 'paid';
  }
  if (pid === 'pollinations' || adapter === 'pollinations') {
    const mp = pollinationsParam(v);
    if (POLLINATIONS_FREE.has(mp)) return 'free';
    if (POLLINATIONS_PAID.has(mp)) return 'paid';
    return 'unknown';
  }
  if (pid === 'puter' || adapter === 'puter') return 'free';
  if (pid === 'nvidia-nim-main' || adapter === 'nvidia') return 'free';
  if (pid === 'cloudflare-workers-ai-main' || adapter === 'cloudflare') return 'free';
  return 'unknown';
}

/** What kind of image is this prompt asking for? Drives quality priors. */
export function classifyCategory(prompt, modeId = '') {
  const t = String(prompt || '');
  if (/["“][^"”]{2,}["”]/.test(t)) return 'poster-text';
  if (/\b(cartoon|anime|mascot|illustration|comic|sticker|doraemon|pokemon|pixar)\b/i.test(t)) return 'cartoon';
  if (/\b(product|bottle|perfume|packaging|sneaker|watch|cosmetic|jar|candle|mockup|label design)\b/i.test(t)) return 'product';
  if (/\b(portrait|headshot|face|selfie|bride|groom)\b/i.test(t)) return 'portrait';
  if (/\b(poster|banner|logo|invitation|flyer|thumbnail|book cover|typography|advertisement)\b/i.test(t)) return 'poster-text';
  if (/\b(photorealistic|photograph|dslr|shot on|realistic photo)\b/i.test(t)) return 'photoreal';
  if (modeId === 'mockup') return 'product';
  if (modeId === 'skin') return 'portrait';
  return 'general';
}

const QUALITY_RULES = [
  { test: /recraft/i, scores: { 'poster-text': 0.95, cartoon: 0.8, photoreal: 0.75, product: 0.7, portrait: 0.7, general: 0.7 } },
  { test: /flux[-. ]?2|flux-2/i, scores: { photoreal: 0.9, product: 0.85, portrait: 0.85, general: 0.8, cartoon: 0.7, 'poster-text': 0.55 } },
  { test: /kontext/i, scores: { general: 0.45, photoreal: 0.45, product: 0.45, portrait: 0.45, cartoon: 0.45, 'poster-text': 0.4 } },
  { test: /stable-diffusion|sdxl/i, scores: { cartoon: 0.8, general: 0.65, portrait: 0.65, photoreal: 0.6, product: 0.55, 'poster-text': 0.3 } },
  { test: /lucid-origin|phoenix|leonardo/i, scores: { photoreal: 0.85, portrait: 0.85, product: 0.75, general: 0.75, cartoon: 0.6, 'poster-text': 0.4 } },
  { test: /seedream|gpt-image|gemini.*image|nano-?banana/i, scores: { 'poster-text': 0.85, general: 0.75, photoreal: 0.75, cartoon: 0.75, product: 0.75, portrait: 0.75 } },
  { test: /flux/i, scores: { photoreal: 0.8, product: 0.8, portrait: 0.75, general: 0.7, cartoon: 0.65, 'poster-text': 0.5 } },
];

/** Heuristic quality of a model family for a category, 0..1. Real outcome
 *  stats progressively outweigh this prior via the success term. */
export function qualityPrior(provider, model, category) {
  const v = String((model && model.vendorModelId) || '');
  for (const rule of QUALITY_RULES) {
    if (rule.test.test(v)) return rule.scores[category] ?? rule.scores.general ?? 0.5;
  }
  return 0.5;
}

const HEALTH = { 'tested-ok': 1, 'not-tested': 0.8, 'rate-limited': 0.35, 'quota-exhausted': 0.15, 'auth-failed': 0.05 };

/** When is this model benched until? 0 = not benched. */
export function coolingUntil(model, now) {
  if (model.cooldownUntil) {
    const t = Date.parse(model.cooldownUntil);
    if (!Number.isNaN(t)) return t;
  }
  if (model.testState === 'quota-exhausted') {
    // Legacy rows marked before explicit cooldowns existed: benched for
    // the rest of the day they were marked; after that day, retry them.
    const marked = model.lastTestedAt ? Date.parse(model.lastTestedAt) : now;
    const end = new Date(Number.isNaN(marked) ? now : marked);
    end.setHours(24, 0, 0, 0);
    return end.getTime();
  }
  return 0;
}

function scoreCandidate(provider, model, category, price) {
  const stats = model.stats || {};
  const ok = stats.ok || 0;
  const fail = stats.fail || 0;
  let success = (ok + 1) / (ok + fail + 2); // Laplace-smoothed real history
  if (!ok && !fail) success = model.testState === 'tested-ok' ? 0.75 : 0.5;
  const cat = stats.byCategory && stats.byCategory[category];
  if (cat && (cat.ok + cat.fail) >= 2) {
    const cs = (cat.ok + 1) / (cat.ok + cat.fail + 2);
    success = (success + cs) / 2; // this category's record counts double-weight
  }
  const speed = stats.avgMs
    ? Math.min(1, Math.max(0.05, 1 - (stats.avgMs - 4000) / 110000))
    : (/schnell/i.test(model.vendorModelId || '') ? 0.85 : 0.6);
  const health = HEALTH[model.testState || 'not-tested'] ?? 0.8;
  const cost = price === 'free' ? 1 : price === 'unknown' ? 0.45 : 0.15;
  const quality = qualityPrior(provider, model, category);
  return quality * 0.30 + success * 0.25 + cost * 0.20 + health * 0.15 + speed * 0.10;
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Ordered candidate list across all providers:
 * [{ providerId, modelId, providerName, modelName, vendorModelId, adapter,
 *    priceClass, score, testState }]
 * The returned array carries `.blockedPaid` — how many models Free-Only
 * excluded — so the UI can explain an empty pool honestly.
 * opts: { freeOnly, category, prompt, now }
 */
export function rankCandidates(providers, opts = {}) {
  const { freeOnly = false, category = 'general', prompt = '', now = Date.now() } = opts;
  const scored = [];
  const cooling = [];
  let blockedPaid = 0;
  for (const p of providers || []) {
    if (p.enabled === false || p.status !== 'active') continue;
    if (p.adapterSupported === false) continue;
    for (const m of p.models || []) {
      if (m.enabled === false || m.status !== 'active') continue;
      // A model the provider already told us does not exist can never
      // succeed — skipped entirely; a re-import or a successful Manual
      // test (which clears the state) brings it back.
      if (m.testState === 'model-not-found') continue;
      const price = priceClass(p, m);
      if (freeOnly && price !== 'free') { blockedPaid++; continue; }
      const entry = {
        providerId: p.id, modelId: m.id,
        providerName: p.name, modelName: m.name,
        vendorModelId: m.vendorModelId || '', adapter: p.adapter || '',
        priceClass: price, testState: m.testState || 'not-tested',
        score: scoreCandidate(p, m, category, price),
      };
      const until = coolingUntil(m, now);
      if (until > now) cooling.push({ ...entry, cooldownUntil: until });
      else scored.push(entry);
    }
  }
  scored.sort((a, b) => (b.score - a.score) || a.providerName.localeCompare(b.providerName) || a.modelName.localeCompare(b.modelName));
  // Exploration: ~1 prompt in 10, swap #2 and #3 so the ranking keeps
  // learning. Deterministic per prompt — the same prompt always routes
  // the same way, different prompts explore different models.
  if (prompt && scored.length >= 3 && hashStr(`${category}:${prompt}`) % 10 === 0) {
    [scored[1], scored[2]] = [scored[2], scored[1]];
  }
  cooling.sort((a, b) => a.cooldownUntil - b.cooldownUntil);
  const out = [...scored, ...cooling];
  out.blockedPaid = blockedPaid;
  return out;
}

/** Put one specific model first (Regenerate keeps its original model),
 *  followed by the normal auto order for fallback. If Free-Only filtered
 *  the preferred model out, it stays out — the policy wins. */
export function candidatesWithPreferred(providers, providerId, modelId, opts = {}) {
  const ranked = rankCandidates(providers, opts);
  const idx = ranked.findIndex((c) => c.providerId === providerId && c.modelId === modelId);
  if (idx <= 0) return ranked;
  const [first] = ranked.splice(idx, 1);
  const out = [first, ...ranked];
  out.blockedPaid = ranked.blockedPaid;
  return out;
}
