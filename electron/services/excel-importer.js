'use strict';
/**
 * Excel importer for PixAi.
 *
 * Reads a provider/model inventory workbook (e.g. FabrixAPI1.xlsx) and turns it
 * into a normalized provider + image-model inventory. The inventory is NEVER
 * hardcoded: whatever providers/models the workbook contains is what the app
 * shows, as long as the model type is an image type and the provider adapter
 * is understood (see adapters/registry.js).
 *
 * Workbook realities handled here:
 *  - Header names are matched flexibly (case / spaces / punctuation tolerant).
 *  - The inventory sheet is found by its headers, not by a fixed sheet name,
 *    and the header row may not be row 1.
 *  - Merged cells: the top-left value is propagated across the merge range.
 *  - Blank provider cells inherit provider data from the preceding row(s)
 *    (the common "provider block" layout).
 *  - Missing optional columns are fine; missing values are never invented.
 */
const XLSX = require('xlsx');
const { resolveAdapter } = require('../adapters/registry');

const HEADER_ALIASES = {
  providerAccount: ['provideraccount', 'provider', 'account', 'providername', 'provideraccountname'],
  adapter: ['vendoradapter', 'adapter', 'vendor', 'vendortype', 'provideradapter', 'vendoradaptertype'],
  baseUrl: ['baseurl', 'apiurl', 'url', 'endpoint', 'baseapiurl', 'providerurl', 'apiendpoint'],
  apiKey: ['apikey', 'key', 'apitoken', 'token', 'apikeys', 'secretkey'],
  accountId: ['accountid', 'cloudflareaccountid', 'provideraccountid'],
  quota: ['onetimemonthlyrecurringquota', 'onetimemonthlyquota', 'quota', 'monthlyquota', 'recurringquota', 'onetimequota'],
  rpm: ['rpm', 'requestsminute', 'requestsperminute', 'requestminute'],
  tpm: ['tpm', 'tokensminute', 'tokensperminute', 'tokenminute'],
  providerStatus: ['providerstatus'],
  modelName: ['modelnamefx1', 'modelname', 'fx1modelname', 'fx1name', 'model', 'displayname'],
  vendorModelId: ['vendormodelid', 'vendormodel', 'modelid', 'vendorid'],
  modelStatus: ['modelstatus'],
  description: ['description', 'desc', 'modeldescription', 'notes'],
  modelType: ['modeltype', 'type', 'category'],
  status: ['status'],
};

function normalizeHeader(h) {
  return String(h == null ? '' : h).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cellText(v) {
  if (v == null) return '';
  return String(v).trim();
}

function isActiveStatus(statusText) {
  const t = String(statusText || '').toLowerCase().trim();
  if (!t) return true; // blank status = not disabled; never invent a disable
  if (/inactive|disabled|removed|deprecated|suspended|off|blocked/.test(t)) return false;
  return true;
}

/** Classify a Model Type cell. Returns 'image' | 'non-image' | 'unknown'. */
function classifyModelType(rawType) {
  const t = String(rawType || '').toLowerCase().replace(/[\s_\-]+/g, '');
  if (!t) return 'unknown';
  if (t.includes('image')) return 'image'; // Image Generation, Text to Image generation, Text-to-Image, Image Generation API, ...
  if (
    t.includes('text') || t.includes('chat') || t.includes('llm') || t.includes('embedding') ||
    t.includes('audio') || t.includes('speech') || t.includes('video') || t.includes('translation') ||
    t === 'other'
  ) return 'non-image';
  return 'unknown';
}

function mapHeaders(headerRow) {
  const map = {}; // field -> column index
  headerRow.forEach((h, idx) => {
    const n = normalizeHeader(h);
    if (!n) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(n) && map[field] === undefined) map[field] = idx;
    }
  });
  // A bare "Status" column: if there is no dedicated model/provider status, treat as model status.
  if (map.status !== undefined) {
    if (map.modelStatus === undefined) map.modelStatus = map.status;
    else if (map.providerStatus === undefined) map.providerStatus = map.status;
    delete map.status;
  }
  return map;
}

function sheetToRows(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  // Propagate merged-cell values across their ranges.
  const merges = ws['!merges'] || [];
  for (const m of merges) {
    const v = rows[m.s.r] ? rows[m.s.r][m.s.c] : '';
    if (v === '' || v == null) continue;
    for (let r = m.s.r; r <= m.e.r; r++) {
      if (!rows[r]) rows[r] = [];
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (rows[r][c] === '' || rows[r][c] == null) rows[r][c] = v;
      }
    }
  }
  return rows;
}

/** Find the inventory sheet + header row by scoring header matches. */
function findInventorySheet(workbook) {
  let best = null;
  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    const rows = sheetToRows(ws);
    for (let r = 0; r < Math.min(rows.length, 8); r++) {
      const map = mapHeaders(rows[r] || []);
      const fields = Object.keys(map).length;
      const hasModel = map.modelName !== undefined || map.vendorModelId !== undefined;
      const hasProvider = map.providerAccount !== undefined;
      const score = fields + (hasModel ? 3 : 0) + (hasProvider ? 3 : 0) + (/inventory/i.test(name) ? 2 : 0);
      if (hasModel && hasProvider && (!best || score > best.score)) {
        best = { sheetName: name, rows, headerRowIndex: r, map, score };
      }
    }
  }
  return best;
}

/**
 * Parse a workbook buffer into a normalized inventory.
 * @param {Buffer} buffer
 * @param {string} sourceFileName
 * @returns {{providers:Array, credentials:Object, warnings:string[], stats:Object}}
 */
function parseWorkbook(buffer, sourceFileName = 'workbook.xlsx') {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch (e) {
    const err = new Error(`The file could not be read as an Excel workbook (${e.message}).`);
    err.code = 'INVALID_WORKBOOK';
    throw err;
  }
  const found = findInventorySheet(workbook);
  if (!found) {
    const err = new Error('No inventory worksheet was found. A sheet must have provider and model columns (e.g. "Provider account", "Model name (fx1)", "Vendor model ID").');
    err.code = 'INVALID_WORKBOOK';
    throw err;
  }
  const { rows, headerRowIndex, map, sheetName } = found;
  const warnings = [];
  const providersById = new Map();
  const chatProvidersById = new Map(); // non-image (chat/vision) providers — kept for the reference-image prompt converter
  const credentials = {}; // providerId -> apiKey (main-process only, never sent to renderer)
  const seenModelKeys = new Set();
  const seenChatModelKeys = new Set();
  let lastProviderFields = null;
  let totalModelRows = 0;
  let nonImageModels = 0;

  const get = (row, field) => (map[field] === undefined ? '' : cellText(row[map[field]]));

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (row.every((c) => cellText(c) === '')) continue;

    // Provider fields: inherit from preceding rows when blank (provider blocks / merged cells).
    const providerFields = {
      providerAccount: get(row, 'providerAccount'),
      adapter: get(row, 'adapter'),
      baseUrl: get(row, 'baseUrl'),
      apiKey: get(row, 'apiKey'),
      accountId: get(row, 'accountId'),
      quota: get(row, 'quota'),
      rpm: get(row, 'rpm'),
      tpm: get(row, 'tpm'),
      providerStatus: get(row, 'providerStatus'),
    };
    const hasOwnProvider = providerFields.providerAccount !== '';
    if (hasOwnProvider) {
      lastProviderFields = { ...providerFields };
    } else if (lastProviderFields) {
      for (const k of Object.keys(providerFields)) {
        if (!providerFields[k]) providerFields[k] = lastProviderFields[k];
      }
      // A new provider block's key/url must not leak from the previous block when the row itself starts a block.
    }

    const modelName = get(row, 'modelName');
    const vendorModelId = get(row, 'vendorModelId');
    const modelType = get(row, 'modelType');
    if (!modelName && !vendorModelId) continue; // provider-only or spacer row
    totalModelRows++;

    if (!providerFields.providerAccount) {
      warnings.push(`Row ${r + 1}: model "${modelName || vendorModelId}" has no provider account — skipped.`);
      continue;
    }

    const kind = classifyModelType(modelType);
    if (kind === 'non-image') {
      // Not an image model — but chat/vision models (e.g. Google Gemini) are
      // stored as utility providers so the app can turn a user's reference
      // image into a generation prompt. Their credentials are stored too.
      nonImageModels++;
      const cpId = slugify(providerFields.providerAccount);
      if (providerFields.apiKey) credentials[cpId] = providerFields.apiKey;
      if (!chatProvidersById.has(cpId)) {
        chatProvidersById.set(cpId, {
          id: cpId,
          name: providerFields.providerAccount,
          adapterRaw: providerFields.adapter || '',
          baseUrl: providerFields.baseUrl || '',
          status: isActiveStatus(providerFields.providerStatus) ? 'active' : 'inactive',
          models: [],
        });
      }
      const cp = chatProvidersById.get(cpId);
      if (!cp.baseUrl && providerFields.baseUrl) cp.baseUrl = providerFields.baseUrl;
      const chatKey = `${cpId}::${(vendorModelId || modelName).toLowerCase()}`;
      if (!seenChatModelKeys.has(chatKey)) {
        seenChatModelKeys.add(chatKey);
        cp.models.push({
          id: chatKey,
          providerId: cpId,
          name: modelName || vendorModelId,
          vendorModelId: vendorModelId || '',
          description: get(row, 'description'),
          modelType: modelType || '',
          status: isActiveStatus(get(row, 'modelStatus')) ? 'active' : 'inactive',
        });
      }
      continue;
    }
    if (kind === 'unknown') {
      warnings.push(`Row ${r + 1}: model "${modelName || vendorModelId}" has an unrecognized Model Type "${modelType || '(blank)'}" — not imported as an image model. Please review.`);
      continue;
    }

    const providerId = slugify(providerFields.providerAccount);
    if (!providersById.has(providerId)) {
      providersById.set(providerId, {
        id: providerId,
        name: providerFields.providerAccount,
        adapterRaw: providerFields.adapter || '',
        baseUrl: providerFields.baseUrl || '',
        accountId: providerFields.accountId || '',
        quota: providerFields.quota || '',
        rpm: providerFields.rpm || '',
        tpm: providerFields.tpm || '',
        status: isActiveStatus(providerFields.providerStatus) ? 'active' : 'inactive',
        statusRaw: providerFields.providerStatus || '',
        enabled: true,
        hasApiKey: false,
        models: [],
      });
    }
    const provider = providersById.get(providerId);
    // Later rows in the same block may fill fields the first row left blank.
    for (const k of ['adapterRaw', 'baseUrl', 'accountId', 'quota', 'rpm', 'tpm']) {
      const srcKey = k === 'adapterRaw' ? 'adapter' : k;
      if (!provider[k] && providerFields[srcKey]) provider[k] = providerFields[srcKey];
    }
    if (providerFields.apiKey) {
      credentials[providerId] = providerFields.apiKey;
      provider.hasApiKey = true;
    }

    const modelKey = `${providerId}::${(vendorModelId || modelName).toLowerCase()}`;
    if (seenModelKeys.has(modelKey)) {
      warnings.push(`Row ${r + 1}: duplicate model "${vendorModelId || modelName}" for provider "${provider.name}" — duplicate ignored.`);
      continue;
    }
    seenModelKeys.add(modelKey);

    provider.models.push({
      id: modelKey,
      providerId,
      name: modelName || vendorModelId,
      vendorModelId: vendorModelId || '',
      description: get(row, 'description'),
      modelType: modelType || '',
      status: isActiveStatus(get(row, 'modelStatus')) ? 'active' : 'inactive',
      statusRaw: get(row, 'modelStatus'),
      enabled: true,
      testState: 'not-tested', // never claim a model works until it is actually tested
      lastTestedAt: null,
    });
  }

  const providers = [...providersById.values()];
  for (const p of providers) {
    const resolution = resolveAdapter(p);
    p.adapter = resolution.adapterId;
    p.adapterSupported = resolution.supported;
    if (!p.baseUrl) warnings.push(`Provider "${p.name}" has no Base URL in the workbook.`);
    if (!p.hasApiKey) warnings.push(`Provider "${p.name}" has no API key in the workbook.`);
  }
  const chatProviders = [...chatProvidersById.values()].filter((p) => p.models.length > 0);
  return {
    sourceFile: sourceFileName,
    sheetName,
    providers,
    chatProviders,
    credentials,
    warnings,
    stats: {
      providerCount: providers.length,
      imageModelCount: providers.reduce((n, p) => n + p.models.length, 0),
      nonImageModelCount: nonImageModels,
      chatProviderCount: chatProviders.length,
      chatModelCount: chatProviders.reduce((n, p) => n + p.models.length, 0),
      totalModelRows,
    },
  };
}

/**
 * Compare a parsed inventory against the currently stored config.
 * existingKeys: { providerId: apiKey|null } — main process only, used solely
 * to count credential changes; keys never leave the main process.
 */
function diffInventory(currentConfig, parsed, existingKeys = {}) {
  const curProviders = new Map(((currentConfig && currentConfig.providers) || []).map((p) => [p.id, p]));
  const newProviders = new Map(parsed.providers.map((p) => [p.id, p]));
  const d = {
    newProviders: [], updatedProviders: [], unchangedProviders: [],
    newModels: [], updatedModels: [], removedModels: [], unchangedModels: [],
    unsupportedProviders: [], credentialsUpdated: [], warnings: [...parsed.warnings],
  };
  const providerChangedFields = (a, b) => {
    const fields = [];
    const cmp = [['name', 'name'], ['adapter', 'adapter'], ['baseUrl', 'baseUrl'], ['accountId', 'accountId'], ['quota', 'quota'], ['rpm', 'rpm'], ['tpm', 'tpm'], ['status', 'status']];
    for (const [label, key] of cmp) {
      const av = key === 'adapter' ? (a.adapterRaw || '') : (a[key] || '');
      const bv = key === 'adapter' ? (b.adapterRaw || '') : (b[key] || '');
      if (String(av) !== String(bv)) fields.push(label);
    }
    return fields;
  };

  for (const p of parsed.providers) {
    const cur = curProviders.get(p.id);
    if (p.adapterSupported === false) d.unsupportedProviders.push({ id: p.id, name: p.name, adapterRaw: p.adapterRaw });
    if (!cur) d.newProviders.push({ id: p.id, name: p.name, modelCount: p.models.length });
    else {
      const changed = providerChangedFields(cur, p);
      if (changed.length) d.updatedProviders.push({ id: p.id, name: p.name, changedFields: changed });
      else d.unchangedProviders.push({ id: p.id, name: p.name });
    }
    const newKey = parsed.credentials[p.id];
    if (newKey && existingKeys[p.id] !== newKey) {
      d.credentialsUpdated.push({ id: p.id, name: p.name });
    } else if (!newKey && cur && existingKeys[p.id]) {
      d.warnings.push(`Provider "${p.name}": the workbook has an empty API key — the existing saved key will be kept unless you confirm replacing it.`);
    }
    const curModels = new Map(((cur && cur.models) || []).map((m) => [m.id, m]));
    for (const m of p.models) {
      const cm = curModels.get(m.id);
      if (!cm) d.newModels.push({ id: m.id, name: m.name, providerName: p.name, vendorModelId: m.vendorModelId });
      else {
        const changed = [];
        if (cm.name !== m.name) changed.push('name');
        if (cm.vendorModelId !== m.vendorModelId) changed.push('vendorModelId');
        if ((cm.description || '') !== (m.description || '')) changed.push('description');
        if (cm.status !== m.status) changed.push('status');
        if ((cm.modelType || '') !== (m.modelType || '')) changed.push('modelType');
        if (changed.length) d.updatedModels.push({ id: m.id, name: m.name, providerName: p.name, changedFields: changed });
        else d.unchangedModels.push({ id: m.id, name: m.name, providerName: p.name });
      }
      if (m.status === 'inactive') d.removedModels.push({ id: m.id, name: m.name, providerName: p.name, reason: 'marked inactive in workbook' });
    }
  }
  // Models present before but absent from the new workbook.
  for (const [pid, cur] of curProviders) {
    const np = newProviders.get(pid);
    const newIds = new Set(((np && np.models) || []).map((m) => m.id));
    for (const m of cur.models || []) {
      if (!newIds.has(m.id) && m.status !== 'inactive') {
        d.removedModels.push({ id: m.id, name: m.name, providerName: cur.name, reason: 'not present in new workbook' });
      }
    }
  }
  d.summary = {
    providersFound: parsed.providers.length,
    newProviders: d.newProviders.length,
    updatedProviders: d.updatedProviders.length,
    newModels: d.newModels.length,
    updatedModels: d.updatedModels.length,
    removedOrInactiveModels: d.removedModels.length,
    credentialsUpdated: d.credentialsUpdated.length,
    unchangedModels: d.unchangedModels.length,
    unsupportedProviders: d.unsupportedProviders.length,
    validationWarnings: d.warnings.length,
    nonImageModelsExcluded: parsed.stats.nonImageModelCount,
  };
  return d;
}

module.exports = { parseWorkbook, diffInventory, classifyModelType, slugify, isActiveStatus, normalizeHeader };
