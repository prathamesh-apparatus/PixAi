'use strict';
/** Validate a saved/exported image-providers.json: node scripts/validate-config.js <path> */
const fs = require('fs');
const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/validate-config.js <image-providers.json>'); process.exit(2); }
const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
const problems = [];
if (!Array.isArray(cfg.providers)) problems.push('providers is not an array');
for (const p of cfg.providers || []) {
  if (!p.id || !p.name) problems.push(`provider missing id/name: ${JSON.stringify(p).slice(0, 80)}`);
  if ('apiKey' in p) problems.push(`provider ${p.id} contains a raw apiKey — credentials must never be in this file`);
  for (const m of p.models || []) {
    if (!m.id || !m.vendorModelId) problems.push(`model missing id/vendorModelId under ${p.id}`);
  }
}
if (problems.length) { console.error('INVALID:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log(`OK: ${cfg.providers.length} providers, ${cfg.providers.reduce((n, p) => n + (p.models || []).length, 0)} models, no credentials present.`);
