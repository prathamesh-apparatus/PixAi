'use strict';
/**
 * Command-line Excel import for PixAi — no UI involved.
 *
 *   npm run import -- <path-to-workbook.xlsx> [--dry-run] [--deactivate]
 *
 * Runs as a headless Electron main process so the import lands in the SAME
 * user-data folder the desktop app uses, and API keys are stored with the
 * same safeStorage encryption as in-app imports. The previous configuration
 * is backed up before anything changes; --dry-run only prints the diff.
 * --deactivate also deactivates models that disappeared from the workbook
 * (without it they are kept, exactly like the old UI confirmation).
 */
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

// The app's user-data folder is keyed by the package name; pin it explicitly
// because this entry point lives in a subfolder.
app.setName('pixai-ai-creative-studio');
app.setPath('userData', path.join(app.getPath('appData'), 'pixai-ai-creative-studio'));

const { parseWorkbook, diffInventory } = require('./services/excel-importer');
const { ConfigManager } = require('./services/config-manager');
const { CredentialManager } = require('./services/credential-manager');

function fail(msg) {
  console.error(`\nImport failed: ${msg}`);
  app.exit(1);
}

app.whenReady().then(() => {
  try {
    const argv = process.argv.slice(2);
    const file = argv.find((a) => /\.xlsx?$/i.test(a));
    const dryRun = argv.includes('--dry-run');
    const deactivate = argv.includes('--deactivate');
    if (!file) fail('No workbook given. Usage: npm run import -- <path-to-workbook.xlsx> [--dry-run] [--deactivate]');
    if (!fs.existsSync(file)) fail(`File not found: ${file}`);

    const userData = app.getPath('userData');
    for (const sub of ['config', 'credentials', 'database', 'generated-images', 'logs', 'settings']) {
      fs.mkdirSync(path.join(userData, sub), { recursive: true });
    }
    const configManager = new ConfigManager(userData);
    const credentialManager = new CredentialManager(path.join(userData, 'credentials'), safeStorage);

    const parsed = parseWorkbook(fs.readFileSync(file), path.basename(file));
    const diff = diffInventory(configManager.load(), parsed, credentialManager.allKeys());
    const s = diff.summary;
    console.log(`\nPixAi workbook import — ${path.basename(file)} (sheet: ${parsed.sheetName})`);
    console.log(`  Providers found:            ${s.providersFound} (new ${s.newProviders}, updated ${s.updatedProviders})`);
    console.log(`  Image models:               new ${s.newModels}, updated ${s.updatedModels}, unchanged ${s.unchangedModels}`);
    console.log(`  Removed/inactive models:    ${s.removedOrInactiveModels}`);
    console.log(`  API credentials updated:    ${s.credentialsUpdated}`);
    console.log(`  Unsupported providers:      ${s.unsupportedProviders}`);
    console.log(`  Non-image models excluded:  ${s.nonImageModelsExcluded}`);
    if (parsed.stats.chatProviderCount) console.log(`  Vision/chat providers kept: ${parsed.stats.chatProviderCount} (${parsed.stats.chatModelCount} models — used for reference-image prompts, e.g. Gemini)`);
    for (const w of diff.warnings) console.log(`  Warning: ${w}`);
    for (const p of diff.unsupportedProviders) console.log(`  Unsupported: ${p.name} (adapter "${p.adapterRaw || 'unknown'}") — imported, but a new adapter module is needed before it can generate.`);

    if (dryRun) {
      console.log('\nDry run — nothing was saved.\n');
      app.exit(0);
      return;
    }
    for (const [providerId, key] of Object.entries(parsed.credentials)) {
      if (key) credentialManager.setKey(providerId, key);
    }
    const { config, deactivatedModels, keptRemovedModels } = configManager.commitImport(parsed, { confirmDeactivations: deactivate });
    const modelCount = config.providers.reduce((n, p) => n + (p.models || []).length, 0);
    console.log(`\nSaved. ${config.providers.length} providers, ${modelCount} image models now configured.`);
    if (keptRemovedModels.length) console.log(`Kept ${keptRemovedModels.length} model(s) that are no longer in the workbook (re-run with --deactivate to deactivate them).`);
    if (deactivatedModels.length) console.log(`Deactivated ${deactivatedModels.length} removed model(s). History and images were kept.`);
    console.log(`Config: ${path.join(userData, 'config', 'image-providers.json')}`);
    console.log('Restart the PixAi app to use the updated providers and models.\n');
    app.exit(0);
  } catch (e) {
    fail(e.message);
  }
});
