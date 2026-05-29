# Changelog

## 1.6.1
- **Theme preference.** New theme selector in the Settings panel lets users choose System default / Light / Dark. Preference persists in `chrome.storage.local` (`themePreference`) and is mirrored to `localStorage('pendoValidateTheme')` so a synchronous `<head>` script can apply the theme before first paint, preventing flash of unstyled content (FOUC).
- **Smarter advice classification.** `classifyAdvice` / `normalizeAdviceList` now infer relevant `supportKeys` from captured log messages, improving the Related reading links and AI prompt context for advice items that didn't carry explicit topic tags.
- Added `tests/theme.test.js` covering `applyTheme`, `loadThemePreference`, and `saveThemePreference`; extended `classifyAdvice`, `normalizeAdviceList`, and `requestAiAdvice` suites for the new support-key inference. Test count is now 252 across 12 suites.

## 1.6.0
- **Three-tab UI.** Status / Logs / Settings replaces the previous Output / Settings split. Status auto-activates after a validation run.
  - Status tab: status hero with pass/warn/error states, quick-stats row (Errors / Warnings / Passing), Checks & recommendations card with grouped accordion items, Identity card, and Metadata card.
  - Logs tab: log-level filter chips (Err / Warn / Info), text search input, Copy logs button.
  - Settings tab: Page snapshot card + AI advice card.
- **Resizable panel.** Corner resize handle (`#resizeHandle`) with `pendo-validate-resizestart`/`-resize`/`-resizeend` postMessage events handled by `content.js`; width and height clamped to min/max bounds.
- **Action bar redesign.** Validate Pendo Install (primary CTA) · Debugger (ghost) · Export menu (ghost). Export offers Markdown report and Copy summary (Slack-ready plain text). JSON download removed from the UI; `buildJsonReport` remains in code.
- **Docs refresh.** README.md fully rewritten as a marketing landing page; CLAUDE.md refreshed to match the three-tab UI, resize handle, Export menu, and current `popup.js` size.
- New `docs/screenshots/` folder with a README and three stand-in mockup PNGs (to be replaced with real Chrome captures).

## 1.5.2
- "Enable Pendo Debugger" promoted from Settings → Debug panel to the action row as a secondary CTA next to "Validate Pendo Install". `id` and `data-action` preserved for Pendo auto-tagging stability.
- Debug panel removed from Settings tab (along with the "Docs" link and "Start VDS" button). `launchVisualDesignStudioInPage` function and `#launchVds` handler/tests deleted.

## 1.5.1
- Output / Settings tabbed UI: replaces the inline section labels and the collapsible "AI Advice Settings" toggle. The Output tab shows checks/recommendations + captured logs; the Settings tab consolidates Page status, Debug, Export, and AI provider configuration.
- Activating "Validate Pendo Install" auto-switches to the Output tab so results are immediately visible.
- `popup-actions.md` reference table extended with element ids and new tab actions (`tab-output`, `tab-settings`).

## 1.5.0
- **Architecture: floating modal overlay.** The extension no longer opens as a Chrome toolbar popup. Clicking the icon now toggles a draggable iframe (`popup.html`) injected into the active tab — same UX as the Pendo Tagging Aid.
  - New `background.js` service worker handles `chrome.action.onClicked` and ensures `content.js` is present in pre-existing tabs.
  - New `content.js` content script creates/destroys the overlay iframe and owns drag state via `postMessage` from the iframe.
  - `popup.html` gains a draggable hero with close button; `popup.js` detects iframe context and relays drag/close events to the parent.
  - `manifest.json` adds `background.service_worker`, `content_scripts`, and `web_accessible_resources` for `popup.html`/`popup.js`/`popup.css`/`pendo-loader.js`/`vendor/pendo.js`/fonts/icons.
- **Multi-provider AI advice.** Adds an AI provider selector covering OpenAI (`gpt-4o-mini`), Anthropic Claude (`claude-haiku-4-5`), and Google Gemini (`gemini-2.0-flash`). `requestAiAdvice()` builds the correct request shape and parses each provider's response. API key is stored in `chrome.storage.local` with a show/hide toggle.
- **Pendo Launcher detection rebuilt.**
  - New **Phase 1.5**: after Phase 1 finds no `window.pendo`, re-runs `captureAndInspect('launcher')` in the same active tab to catch `window.Pendo` (capital P) injected by the Pendo Launcher extension — the most common previously-undetected case.
  - `captureAndInspect()` now reports `pendoGlobal` (`'Pendo' | 'pendo' | null`) so callers can distinguish Launcher from snippet correctly.
  - `findLauncherTab()` filters out `chrome-extension://`, `chrome://`, and `about:` URLs (cannot inject into other extensions' pages); removes dead `betaIdPattern` regex.
  - Phase 2 `executeScript` is wrapped in `try/catch` so a failing injection degrades gracefully to the Phase 1 fallback.
- **Visitor and account metadata extraction.** `captureAndInspect()` now reads visitor/account metadata fields (name, email, role, plan, etc.) from the agent state per [Choose IDs and metadata](https://support.pendo.io/hc/en-us/articles/21326198721563-Choose-IDs-and-metadata) and surfaces them in the Page status panel.
- **Launcher data validation status** (`launcherDataValidated`) added to the Page status summary and Markdown report.
- **API surface aligned with documented Pendo Web SDK.** Removed undocumented `validateInstallation` fallback; all paths use `validateInstall`.
- **New permissions:** `management` (better extension recognition for Launcher / Launcher Beta) and `debugger` (enables future debug tooling).
- **Test scaffold (Vitest + jsdom).** Adds 127 tests across 6 suites covering `normalizeAdviceList`, `buildMarkdownReport`/`buildJsonReport`, `captureAndInspect`, `getOrCreateVisitorId`, `requestAiAdvice` (all three providers + timeout/error paths), and `content.js` drag-clamping. Pure functions extracted to `tests/helpers.js`. Run with `npm test`.
- `.gitignore` excludes `node_modules/`, `coverage/`, `.vitest-cache/`, and `*.zip`.

## 1.4.4
- Add CLAUDE.md with codebase overview, architecture guide, two-phase validation flow, MV3 CSP compliance details, permissions, and UI conventions.
- Fix regex escaping in popup.js: `\n` join and `\b` word boundaries were literal backslash sequences, breaking UUID detection in captured console output.
- Add null guard after `chrome.tabs.query` to handle restricted pages (`chrome://`) without crashing.
- Fix XSS: replace `innerHTML` assignments with DOM construction for log lines and advice items.
- Remove duplicate `else` branch in status badge logic (dead code); extract repeated fallback result into `EMPTY_RESULT` constant.
- README overhaul: expanded description, new Features and How it works sections, corrected permissions list (added `tabs`), updated repo structure tree, removed WIP label from AI advice section.

## 1.4.3
- Popup UI redesign: section labels (Page status, Advice, Tools, Captured output), action block, tools two-column layout (Debug | Export), scrollable content and logs, Pendo spacing scale and hierarchy.

## 1.4.2
- MV3 compatibility improvements in `pendo-loader.js`; `PendoConfig.useAssetHostForDesigner` for asset host usage in extension context.

## 1.4.0
- Bundled Pendo agent in `vendor/pendo.js`; improved loading and CSS integration in popup.

## 1.3.3
- Pendo snippet loader (`pendo-loader.js`); popup refactored to use loader; supports self-hosted agent in popup.

## 1.3.2
- Improved error handling in `getAiConfig` (optional AI advice).

## 1.3.1
- Visitor debugging refactor: launch Visual Design Studio (VDS) from popup; status updates for debug actions.

## 1.3.0
- Pendo integration in popup: Pendo agent script, persistent visitor ID in `chrome.storage.local`, visitor ID management in popup.

## 1.2.0
- Updated branding.
- Updated to check window and run validation on Pendo Launcher (browser extension).
- Logo updated.
- Added optional ChatGPT integration for advice on failure - WIP.

## 1.1.0
- Initial repo version from local beta build.

## 1.0.0
- Initial extension (Init).
