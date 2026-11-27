# PixAi — AI Creative Studio

A local **Electron + React + Vite + Tailwind CSS** desktop application for the
internal media / social media / graphic design team. One interface to generate
images with multiple AI providers — with **no login, no hosted backend, no
cloud database**. Providers and models are **never hardcoded**: they are
imported from an Excel workbook (e.g. `FabrixAPI1.xlsx`) and can be updated at
any time by importing a newer workbook, without reinstalling the app.

## Quick start (development)

```bash
npm install
npm run dev        # Vite + Electron together — the desktop app opens
npm run dev:web    # UI only in a browser (preview mode, no generation)
npm test           # automated tests (importer, diff, adapters, history, generation)
npm run build      # production renderer build into dist/
```

## Import the provider workbook (command line)

There is deliberately **no Import page inside the app**. Save the workbook as
`FabrixAPI1.xlsx` in the project folder (it is git-ignored — it contains API
keys) and import it from the terminal:

```bash
npm run import -- .\FabrixAPI1.xlsx               # import + save
npm run import -- .\FabrixAPI1.xlsx --dry-run     # preview the changes only
npm run import -- .\FabrixAPI1.xlsx --deactivate  # also deactivate models removed from the workbook
```

The command prints a full summary (new / updated / removed providers and
models, credential changes, warnings, unsupported providers), backs up the
previous configuration, stores API keys encrypted with the OS credential
store, and writes the same local configuration the app uses. Restart the app
after importing.

## Build the Windows installer

Run on Windows (Electron Builder / NSIS):

```bash
npm install
npm run dist:win   # produces release/AI-Creative-Studio-Setup.exe
```

The installer creates desktop + Start-menu shortcuts and an uninstaller.
User data (imported configuration, encrypted credentials, generated images,
history, settings) lives in the OS app-data folder for *AI Creative Studio*
and is **not** removed by upgrades or uninstall of the program files.

> Packaging configuration was validated on Linux with
> `npx electron-builder --dir`; the NSIS `.exe` itself must be produced on
> Windows (or a Windows CI runner).

## How it works

1. **Import from the command line** — `npm run import -- .\FabrixAPI1.xlsx`
   (see above). PixAi finds the inventory sheet by its headers (flexible
   header matching, merged-cell and blank-provider inheritance handled),
   filters to image models only (`Image Generation`, `Text to Image
   generation`, `Text-to-Image`, `Image Generation API`, …), prints the full
   diff before saving with `--dry-run`, backs up the previous configuration
   (restorable in Settings), and never creates duplicates on re-import.
2. **Providers & Models** — see every imported provider/model, enable or
   disable them, replace an API key, run a *connection test* (key/endpoint
   only) or a *model test* (a real minimal generation). A model is only ever
   marked “Tested successfully” after a real generation succeeds.
3. **Create Image** — provider/model dropdowns are driven entirely by the
   imported inventory. The settings shown (aspect ratio, size, seed, steps,
   guidance, quality, count, negative prompt) come from the selected model's
   adapter capabilities — unsupported parameters are never sent.
4. **History / Favorites** — every generation is stored locally (SQLite) with
   prompt, provider, model, settings and the image file in the local
   `generated-images` folder. Search, filter, re-download, regenerate,
   favorite, or delete records (deleting a record never deletes the file
   unless you explicitly choose that too).

### Supported adapters

| Workbook “Vendor / adapter” | Adapter | Notes |
| --- | --- | --- |
| Cloudflare Workers AI | `cloudflare` | `POST /accounts/{id}/ai/run/{model}`; binary or base64 JSON responses; account ID taken from the workbook Base URL / Account ID column — never guessed |
| OpenRouter | `openrouter` | Image models via chat completions with `modalities: ["image"]`; text-only replies are treated as errors, never as images |
| OpenAI / OpenAI-compatible | `openai-compatible` | `POST {baseUrl}/images/generations` |

A provider with any other adapter value is imported and displayed with an
explicit **unsupported adapter** warning. Importing its API key does not
pretend its API works — a new adapter module in `electron/adapters/` is the
only thing needed to support it, and new *models* on supported adapters need
no code changes at all.

### Security

- All provider calls are made from the Electron **main process** through a
  restricted preload bridge (`contextIsolation: true`, `nodeIntegration:
  false`, sandboxed renderer, allowlisted + validated IPC).
- API keys live only in OS-backed encrypted storage (Electron `safeStorage`)
  under the app-data `credentials/` folder — never in `image-providers.json`,
  never in the renderer, logs, exports or this repository.
- Config exports and backups contain no credentials.

### Local data layout (app-data folder)

```
config/image-providers.json        non-secret provider/model inventory
config/configuration-backups/      one backup per import
credentials/credentials.json       safeStorage-encrypted API keys
database/history.sqlite            generation history (JSON fallback if SQLite unavailable)
generated-images/                  downloaded/generated image files
settings/settings.json             preferences
```

## Project structure

```
electron/
  main.js  preload.js  security.js
  ipc/        config-ipc.js · generation-ipc.js · file-ipc.js
  services/   excel-importer.js · config-manager.js · credential-manager.js
              generation-service.js · history-service.js · image-service.js
              settings-manager.js
  adapters/   base-adapter.js · cloudflare-adapter.js · openrouter-adapter.js
              openai-compatible-adapter.js · registry.js
src/
  components/ Sidebar · Header · ProviderSelector · ModelSelector ·
              PromptEditor · GenerationSettings · ImagePreview ·
              ImageGallery · ImportPreview · Toasts · Modal
  pages/      CreateImage · History · Favorites · Providers · Settings
  layouts/    MainLayout.jsx
tests/        vitest suites + synthetic workbook builder
config/       image-providers.example.json (shape reference, no real data)
scripts/      validate-config.js
```

## Status / honest gaps

- The importer, diffing, adapters, history and end-to-end generation flow are
  covered by automated tests using synthetic workbooks that mirror the
  specified workbook columns, plus mocked provider responses. The Electron app
  itself was launched and verified headlessly (UI loads, SQLite history
  database created), and the CLI import was run end-to-end against a test
  workbook (dry-run + real import into the app's real data folder, with the
  API key verified absent in plaintext from both config and credentials
  files).
- **The real `FabrixAPI1.xlsx` has not been supplied yet.** As soon as it is
  available, drop it next to the project (it is git-ignored — it contains
  credentials) and import it in the app; any header/layout surprises in the
  real file can then be verified against the importer directly.
- Live generation with real provider keys has not been run yet (no keys
  supplied). Use **Providers & Models → Test model** with a real key for the
  first live check — it performs an actual minimal generation.
- The Windows `.exe` installer must be built on Windows as described above.
