# Changelog

## 1.8.7

## 1.8.6
- **Knowledge base refresh.** Audited the bundled `support.pendo.io` articles and added six current ones (31 total), led by *Validate your Pendo installation*.
- **Smarter Related reading.** The Status panel, Markdown report, and AI prompt now derive suggestions from what validation actually detected (SPA, iframe, GTM, sandbox, old agent, CSP, Launcher, visitor/account metadata) via a shared `deriveDetectionSignals()` helper, and surface a "what good looks like" reference on a genuinely clean pass.
- **Tests.** New knowledge-base, Markdown-report, and AI-advice coverage. 573 tests across 26 suites.

## 1.8.5
- **Pendo self-instrumentation migrated to the official `@pendo/web-sdk` package.** The agent is no longer a manually `curl`-ed CDN bundle (`vendor/pendo.js`) loaded by a hand-written async-stub loader (`pendo-loader.js`). It is now built by esbuild from `src/pendo-agent-entry.js` — which imports `initialize`/`TextCapture` from the version-pinned `@pendo/web-sdk` — into `extension/vendor/pendo-agent.bundle.js`, and initialised with `assets.localOnly: true`. `localOnly` sets `preventCodeInjection`, so the agent (and the Visual Design Studio) loads **no remotely-hosted code** — closing the latent MV3/Chrome-Web-Store-review gap where the old bundle could fetch remote designer/guide code at runtime.
- **Self-hosted agent, guide, and designer assets.** All runtime assets are served from the extension origin under `extension/pendo/` (populated by the `pendo copy`/`pendo designer` CLI); `manifest.json` `web_accessible_resources` now exposes `vendor/pendo-agent.bundle.js` and `pendo/*` instead of `pendo-loader.js`/`vendor/pendo.js`. Bundled SDK version 2.330.2 (was 2.327.0).
- **Panel paints before the agent loads.** The self-instrumentation bundle is no longer loaded synchronously in `<head>`; a small `pendo-agent-loader.js` appended after `popup.js` idle-loads `vendor/pendo-agent.bundle.js` (via `requestIdleCallback` with a `setTimeout` fallback), and initialization inside the bundle stays idle-deferred — so the panel UI renders first and self-instrumentation never blocks first paint.
- **Self-instrumentation failures are contained.** `startPendo()` is now wrapped so a failed agent `initialize()` logs a warning instead of surfacing an unhandled promise rejection.
- **Live status timestamp.** The Status hero's relative "validated … ago" label now refreshes every 5 seconds while the panel is open instead of freezing at the moment validation finished.
- **Build tooling.** Added `scripts/build-agent.mjs` and `npm run build:agent` (bundle + copy static assets, offline) / `build:agent:refresh` (also re-download config + designer files); `npm run build` runs it before packaging. Visitor-identity logic moved to `src/pendo-visitor.js` (single source of truth; re-exported by `tests/helpers.js`). New `tests/pendoAgentEntry.test.js` guards the `localOnly`/self-hosting configuration and the `popup.html` idle-load order, and `tests/pendoAgentBundle.test.js` fails if the committed agent outputs drift from a fresh `npm run build:agent`. 558 tests across 26 suites.

## 1.8.4
- **Renamed to Pendo Install Validator.** The extension, panel title, Markdown/plain-text exports, and docs now use **Pendo Install Validator** (formerly *Pendo Validate Install* / *Pendo Validate Install Ext*). Refreshing the unpacked extension keeps AI settings, theme, and visitor ID intact (`UPDATE.md` explains the rename).
- **Firefox runtime bridge fix.** The 1.8.3 background bridge preferred the callback-based `chrome.*` namespace, but on Firefox only `browser.*` is promise-based — so awaiting `chrome.runtime.sendMessage` returned `undefined` and the panel iframe threw `tabs.query failed` before validation could start. The bridge now prefers `browser.*` and promisifies the `chrome.*` callback form as a fallback, so **Validate Pendo Install**, Launcher detection, and the Claude AI proxy work in the Firefox panel; Chrome and Edge are unchanged.
- **Page-world injection no longer collides with host globals.** `extension/capture-inspect.js` and `extension/enable-debugging.js` declared top-level `function captureAndInspect` / `enableDebuggingInPage`, creating page-global bindings that could throw `Identifier 'captureAndInspect' has already been declared` when the host page already defined the same name — aborting validation. Both now assign a named function expression directly to their private `__pendoValidate*` global, so no host-page binding is created.
- **Combined snippet + Launcher detection in one injection.** Phase 1 and 1.5 are merged into a single MAIN-world pass (`combined` variant) that reports `snippetGlobalPresent` and `launcherGlobalPresent` separately and runs `validateInstall()` once on the primary agent — faster on snippet-only pages and clearer Launcher vs snippet routing.
- **Stale inject self-heal after extension upgrades.** `capture-inspect.js` uses a revision marker so re-injection replaces an outdated page global (including when the callable was cleared but the marker remained). The invoke-only injection cache detects pre-revision result shapes and falls back to a full re-inject instead of reporting “Install not detected” on a working page.
- **Invoke-only script injection.** Repeat validations on the same tab skip re-parsing injection files when the world is already warm (including via the Firefox background bridge); navigation or a missing global triggers automatic full re-injection.
- **Validation race guard.** Rapid re-clicks on **Validate Pendo Install** no longer let a superseded run overwrite the status hero with a stale error.
- **Manifest `web_accessible_resources`.** Exposes `capture-inspect.js`, `enable-debugging.js`, and `pendo-install-quality.md` required by the panel iframe.
- **Tests.** New `tests/executeScript.test.js` for invoke-only caching and stale-shape self-heal; expanded `captureAndInspect`, `injectedScripts`, and `background` coverage. 550 tests across 24 suites.

## 1.8.3
- **Firefox validation fix.** On Firefox the panel runs inside a `web_accessible_resource` iframe where the `tabs`, `scripting`, and `management` APIs are unavailable. Privileged calls (`tabs.query`, `scripting.executeScript`, `management.getAll`) now route through the background script via `chrome.runtime.sendMessage`, so **Validate Pendo Install** and Launcher detection work in Firefox; Chrome and Edge call the same APIs directly when available.
- **Firefox script injection.** Firefox forbids combining `files` with `func`/`args` in a single `scripting.executeScript` call. Validation and the **Debugger** button now inject dedicated extension files in a two-step inject-then-invoke flow, and the same path is used on Chrome and Edge for consistency.
- **Extracted page-injection scripts.** Moved `captureAndInspect` and `enableDebuggingInPage` out of `popup.js` into `extension/capture-inspect.js` and `extension/enable-debugging.js` (kept in sync with `tests/helpers.js`). The CDP Launcher paths now load these files as text to evaluate instead of serializing inline functions, and the evaluated expression is guarded so the injected global is defined once and simply re-invoked on repeat validations — re-running validation in the Launcher's persistent isolated world no longer redeclares top-level bindings.
- **Docs.** The README Firefox note no longer repeats the profile-email caveat (already documented in `PRIVACY.md`).
- **Tests.** New `tests/background.test.js` coverage for the Firefox background-bridge handlers (`pendo-validate-tabs-query`, `pendo-validate-execute-script`, `pendo-validate-management-get-all`), a shared `chrome.management` mock in `tests/setup.js`, idempotent CDP re-evaluation coverage in `tests/evaluateInLauncherWorld.test.js`, and the manifest version assertion bumped to 1.8.3. 510 tests across 22 suites.

## 1.8.2
- **Visual Design Studio URL-token sanitization warning.** When a Pendo snippet is present and the page redirected during load (Navigation Timing `redirectCount > 0`), the validator now warns that the application may be sanitizing the URL and dropping Pendo's `pendo-designer` token — the documented cause of the Visual Design Studio (VDS) failing to launch. The recommendation links to *Help launching the Visual Design Studio* and suggests enabling **Disable Designer Launch URL Token** in the app's Tagging & Guide Settings (or launching the designer manually via `pendo.designerv2.launchInAppDesigner()`). The warning only surfaces when a redirect is actually detected — it is not always-on.
- **New `vds` support key + KB article.** Added the VDS article to `PENDO_SUPPORT`, `SUPPORT_LABELS`, the `inferSupportKeyFromText` rules, and the bundled knowledge base (now 25 articles, topics `vds` / `designer` / `guides`). It appears as Related reading when URL sanitization is detected, and `captureAndInspect()` now reports `status.redirectCount`, which is included in the Markdown report metadata.
- **Client-side URL-sanitization detection.** Beyond redirects, `captureAndInspect()` now inspects the page itself for logic that strips the URL query string: it scans inline `<script>` contents for high-confidence query-stripping patterns (e.g. `location.search = ''`, `searchParams.delete`, `replaceState`/`pushState` to `location.pathname`) and installs an observe-only `history.pushState`/`replaceState` wrapper that records when the query string is dropped. When a snippet is present and a signal is found, an advisory note (`supportKey: vds`) explains the VDS impact; when inline scripts are clean it records an honest check (external/bundled JS is not scanned). Findings are reported on `status.urlSanitization` and in the Markdown report metadata.
- **Web SDK configuration flag detection.** When `pendo.initialize()` options are readable from the page snippet (`status.configKeys`, parsed from inline scripts), the validator lists non-standard flags beyond visitor/account/apiKey/publicAppId, categorises each against the Web SDK config docs (Core / Analytics / Guides / Network logs / Replay), and links to the matching configuration articles via new `agentConfig*` support keys. A passing check is recorded when only standard keys are present.
- **Install quality assessment.** New `assessInstallQuality()` / `appendQualityAdviceToResult()` grade visitorId, accountId, visitor/account metadata coverage, and staging/dev environment prefixes into good/weak/poor tiers, surfacing actionable advice for placeholder or very short IDs, missing recommended metadata, and staging/dev URLs without test prefixes.
- **API key fallback from CDN resources.** When agent state does not expose the subscription API key, `captureAndInspect()` now attempts to extract the UUID from a Pendo agent CDN resource URL via the Performance API.
- **Bundled Pendo agent updated to 2.327.0.** Self-hosted `vendor/pendo.js` and `vendor/README.md` bumped; `pendo-loader.js` documents the standard MV3 async install stub that queues API calls until the agent loads.
- **Self-instrumentation metadata.** The extension version (`ivaVersion`) is now sent in Pendo visitor metadata, and when the visitor ID is email-shaped, `visitor.email` is set for valid formats.
- **Support-key inference improvements.** `inferSupportKeyFromText` now matches "URL sanitization" phrasing in either word order while avoiding false positives on unrelated "sanitize" usage (e.g. an API key context).
- **Developer tooling.** The local development harness directory (`dev/`) is now excluded via `.gitignore`.
- **Tests.** New `tests/configFlags.test.js` suite for Web SDK configuration-flag detection, plus expanded coverage for redirect and client-side URL-sanitization and install-quality grading in `tests/captureAndInspect.test.js`, reverse-order and false-positive `vds` cases in `tests/inferSupportKeyFromText.test.js`, KB coverage in `tests/pendoKb.test.js`, an AI-prompt case in `tests/requestAiAdvice.test.js`, and the manifest version assertion bumped to 1.8.2; helpers synced in `tests/helpers.js`. 496 tests across 21 suites.

## 1.8.1
- **Launcher debugger fix.** When validation detects Pendo via the Launcher content-script world (Phase 1.75 / CDP), the **Debugger** button now calls `pendo.enableDebugging()` in that same isolated context instead of only the page MAIN world (where no agent exists).
- **CDP helper refactor.** Extracted `evaluateInLauncherWorld()` shared by validation and debugger; validation stores `validationPath`, `validationTabId`, and `launcherExtensionId` for routing.
- **Tests.** New `tests/evaluateInLauncherWorld.test.js` suite (mocked `chrome.debugger`); manifest version assertion in `tests/manifest.test.js`; helpers synced in `tests/helpers.js`. 447 tests across 20 suites.
- **Docs.** `CLAUDE.md` removed from version control (added to `.gitignore`); README no longer links to it. File remains locally for agent guidance.

## 1.8.0
- **Multi-browser release packaging.** New `scripts/build.mjs` builds one zip per browser target from the single `extension/` source: `pendo-validate-install-<version>-chrome.zip`, `-edge.zip`, and `-firefox.zip` (npm scripts `build`, `build:chrome`, `build:edge`, `build:firefox`; output in `dist/`). Per-target manifest transforms live in `scripts/browser-targets.mjs`.
- **Firefox support (128+).** The Firefox package drops the `debugger` / `identity` / `identity.email` permissions (not implemented in Firefox), runs `background.js` as an event page instead of a service worker, and adds `browser_specific_settings.gecko`. `runValidationInLauncherWorld()` now returns `null` when `chrome.debugger` is unavailable, so the CDP Launcher-introspection phase degrades quietly; visitor identification falls back to the anonymous UUID. Zips are unsigned — Firefox loads them as a temporary add-on via `about:debugging`.
- **Theme FOUC script externalized.** The inline `<head>` theme script in `popup.html` moved to `extension/theme-init.js` (now in `web_accessible_resources`) because Firefox's MV3 CSP silently drops inline scripts. Behaviour is identical in Chrome and Edge.
- **Automated releases.** New `.github/workflows/release.yml`: pushing a `v*` tag runs the test suite, builds all three zips, lints the Firefox build with `web-ext`, and attaches the zips to a GitHub Release. Manual `workflow_dispatch` runs produce workflow artifacts without publishing.
- **Single-branch development.** The separate `Edge` and `Firefox` branches are deprecated; all browser targets now build from one branch. Their adaptations have been folded into the main source.
- **Version sync.** `manifest.json`, `package.json`, and the README badges/footer previously drifted (1.7.1 / 1.7.0 / 1.7.0); all now read 1.8.0.
- New `tests/browserTargets.test.js` suite covering the per-browser manifest transforms; `tests/manifest.test.js` extended to assert `web_accessible_resources` completeness.

## 1.7.2
- **Deprecated AI model auto-migration.** `getAiConfig()` now detects retired model IDs stored in `chrome.storage.local` (e.g. `gemini-2.0-flash`, shut down June 1 2026) and clears them on read so the current provider default is used instead. Legitimate custom model overrides are unaffected.

## 1.7.1
- **Gemini model updated to `gemini-3.5-flash`.** Default Google Gemini model bumped from `gemini-2.0-flash` to the latest GA Flash release (Settings dropdown label and docs updated to match). Users with a custom `aiModel` saved in `chrome.storage.local` are unaffected.
- **Gemini 3.x request compatibility.** `requestAiAdvice()` now drops the `temperature` sampling param (Google recommends defaults for Gemini 3.x) and pins `generationConfig.thinkingConfig.thinkingLevel` to `LOW` so the default medium-effort thinking does not exceed the request `timeoutMs`. Response parsing now joins all non-thought text parts instead of reading only `parts[0]`, guarding against multi-part responses.

## 1.7.0
- **Pendo employee identification.** When the Chrome profile is signed in to a `@pendo.io` Google account, the extension uses the profile email as the Pendo visitor ID for self-instrumentation telemetry. Non-Pendo users continue to use an anonymous UUID. Email is read passively via `chrome.identity.getProfileUserInfo` (no OAuth prompt) and is not cached — signing out immediately reverts to the UUID fallback.
- **New permission: `identity.email`.** Required for the profile-email feature above. Shows "Know your email address" in the Chrome install prompt.
- **Privacy policy update.** Visitor-ID description, permissions table, and third-party data rows updated to reflect the new email-based identification for `@pendo.io` profiles.
- **Accessibility & UI improvements.** Popup UI updated for improved accessibility and functionality.
- **Bug fix: Logs panel first render.** Fixed an issue where the Logs panel was empty on first view because rendering ran before `lastContext` was set.
- Test count is now 263 across 12 suites (new `getProfileEmail` and email-path tests added to `getOrCreateVisitorId` suite).

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
