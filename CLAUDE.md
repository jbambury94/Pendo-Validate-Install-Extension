# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Chrome browser extension (Manifest V3)** that validates Pendo installations on web pages. It runs `pendo.validateInstall()` in the page context, captures console output, checks visitor/account identity, detects API key presence, and provides remediation advice. The UI is delivered as a draggable iframe overlay injected into the active tab — not as a Chrome toolbar popup.

There is no build system. The `extension/` folder is loaded directly by Chrome as an unpacked extension. There is a Vitest + jsdom test suite at the repo root (`npm install && npm test`).

## Running the Extension

Load it in Chrome:
1. Navigate to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `extension/` folder

To apply code changes: click the refresh icon on the extension card in `chrome://extensions`, then click the extension icon to reopen the floating panel.

## Architecture

### Entry Points

- **`extension/manifest.json`** — MV3 manifest. No `default_popup`; the icon click is handled by the background service worker. Declares `background.service_worker`, `content_scripts`, and `web_accessible_resources` so `popup.html` can be loaded as a `chrome-extension://` iframe on any host page.
- **`extension/background.js`** — Service worker. Listens for `chrome.action.onClicked`, ensures `content.js` is injected into pre-existing tabs (new navigations get it automatically), then sends a `pendo-validate-toggle` message.
- **`extension/content.js`** — Content script. Owns the overlay lifecycle: creates/destroys an iframe (`#pendo-validate-overlay-iframe`) pointing at `popup.html`, and tracks drag + resize state via `postMessage` from the iframe (`pendo-validate-dragstart` / `-drag` / `-dragend` for dragging; `pendo-validate-resizestart` / `-resize` / `-resizeend` for resizing). Width and height are clamped to configurable min/max bounds. Guards against double-injection via `window.__pendoValidateInjected`.
- **`extension/popup.html`** — Panel UI loaded inside the iframe. Three-tab strip: *Status* (status hero, quick stats, checks & recommendations, related reading, identity, metadata), *Logs* (filtered console output with level chips + text search), and *Settings* (page snapshot, AI advice configuration). The panel is user-resizable via a corner drag handle. References `pendo-kb.js`, `pendo-loader.js` (runs first), and `popup.js`.
- **`extension/pendo-kb.js`** — Bundled knowledge base: 24 curated support.pendo.io install articles as a flat `PENDO_KB` array (each with `slug`, `title`, `url`, `topics[]`, `summary`, `bullets[]`). Exposes `findKbByTopics(topics, max)` which returns deduped entries ordered by topic-match count. Also defines `PENDO_KB_MIN_AGENT_VERSION` used by the agent-version detection signal. Loaded via `<script>` before `popup.js` and exposed in `web_accessible_resources`.
- **`extension/pendo-loader.js`** — Immediately queues Pendo API calls, then defers loading `vendor/pendo.js` via `requestIdleCallback`/`setTimeout` to avoid blocking panel responsiveness.
- **`extension/popup.js`** — All validation, advice, export, debug, AI, and tab-switching logic (~1,727 lines). Runs in the iframe's own context (not injected into the host page); detects iframe context via `window !== window.parent` and wires the close button, hero drag handle, and resize handle to relay events to `content.js`.

### Validation Flow (Three Phases)

When the user clicks "Validate Pendo Install", `popup.js` runs `runInPage()`:

1. **Phase 1 — Active tab snippet.** Injects `captureAndInspect('page')` into the active tab via `chrome.scripting.executeScript({ world: "MAIN" })` so it can read `window.pendo`.
   - Intercepts `console.log/warn/error/info`
   - Calls `pendo.validateInstall()`
   - Extracts version, API key, `visitorId`, `accountId` from agent state
   - Reads visitor/account **metadata** fields (name, email, role, plan, etc.) per [Choose IDs and metadata](https://support.pendo.io/hc/en-us/articles/21326198721563-Choose-IDs-and-metadata). Metadata can only be read when the agent is reachable from the active tab; Chrome blocks reading state from other extensions' pages, so Launcher metadata is only available when the agent runs on the active tab.
   - Collects Pendo resource hits from the Performance API
   - Reads CSP meta tags
   - Reports `pendoGlobal` (`'Pendo' | 'pendo' | null`) so callers can distinguish snippet from Launcher.

2. **Phase 1.5 — Active tab Launcher.** Re-runs `captureAndInspect('launcher')` on the same tab to catch `window.Pendo` (capital P) injected by the Pendo Launcher / Pendo Launcher (Beta) extension into the host page. This is the most common Launcher scenario.
   - When a snippet was found in Phase 1, only `pendoGlobal === 'Pendo'` counts as a Launcher detection (avoids double-counting the snippet's own `window.pendo`).
   - When no snippet was found in Phase 1, any agent detected in Phase 1.5 is from the Launcher.

3. **Phase 2 — Separate Launcher tab.** If neither phase finds an agent, `findLauncherTab()` searches all open windows for a Pendo Launcher / Pendo Launcher (Beta) tab and re-runs `captureAndInspect('launcher' | 'launcher-beta')` there. `chrome-extension://`, `chrome://`, and `about:` URLs are filtered out — `executeScript({ world: 'MAIN' })` cannot inject into another extension's pages regardless of `host_permissions`. The injection is wrapped in `try/catch` so a failure degrades to the Phase 1 fallback.

Results flow back to the panel context → `renderAdvice()` + `renderLogs()` populate the UI. Activating "Validate Pendo Install" auto-switches the tab strip to *Status*.

### Key Subsystems in `popup.js`

| Subsystem | What it does |
|---|---|
| `captureAndInspect()` | Injected into page; captures all validation data + reports `pendoGlobal`. Extended with detection signals for iframe, sandbox, GTM, SPA framework, agent version, `data.pendo.io` connectivity, and account metadata gaps. |
| `runInPage()` | Orchestrates Phase 1 → Phase 1.5 → Phase 2 |
| `findLauncherTab()` | Searches windows/tabs for Pendo Launcher; filters non-web origins |
| `renderAdvice()` | Renders key-value summary + advice list |
| `renderLogs()` | Renders color-coded captured console output |
| `buildAiPrompt()` / `requestAiAdvice()` | Build provider-specific request body, call OpenAI / Claude / Gemini, parse response. Prompt enriched with up to 6 KB excerpts from `selectRelatedReading`. |
| `getAiConfig()` | Reads `aiProvider`, `aiApiKey`, `aiEndpoint`, `aiModel`, `timeoutMs` from `chrome.storage.local` |
| `buildMarkdownReport()` / `buildJsonReport()` | Generates downloadable/copyable reports. Markdown report includes a `## Related reading` section with contextually relevant KB links. |
| `setExportMenuOpen()` | Toggles the Export fly-out menu (Markdown report + Copy summary) |
| `getOrCreateVisitorId()` | Persistent UUID in `chrome.storage.local` for self-instrumentation |
| `activateTab()` | Switches the *Status* / *Logs* / *Settings* tabs |
| `bindResizeHandle()` | Wires the corner resize handle; relays `pendo-validate-resizestart` / `-resize` / `-resizeend` to `content.js` |
| Iframe wiring | When `window !== window.parent`, shows the close button and relays `pendo-validate-close` / `-dragstart` / `-drag` / `-dragend` / `-resizestart` / `-resize` / `-resizeend` messages |
| Debug button | Calls `pendo.enableDebugging()` via injection |
| `PENDO_KB` / `findKbByTopics()` | Bundled in `extension/pendo-kb.js`; 24 curated support.pendo.io install articles with topic tags, summaries, and bullets. `findKbByTopics(topics, max)` returns deduped entries ordered by topic match count. |
| `selectRelatedReading()` | Maps validation signals (pendoPresent, cspIssue, isSpa, etc.) to KB topics and returns relevant entries via `findKbByTopics`. Consumed by the Related reading card, AI prompt, and Markdown report. |
| `renderRelatedReading()` | Populates the `#relatedReadingCard` on the Status panel with up to 6 deduped article links from `selectRelatedReading`. |
| `normalizeAdviceList()` | Normalizes advice items; extended to accept `supportKeys: string[]` producing `relatedSupportUrls` on output. |

### MV3 CSP Compliance

Chrome's Manifest V3 prohibits remotely-hosted scripts. The Pendo Web SDK (`vendor/pendo.js`, ~540KB, v2.314.1) is bundled locally. The manifest's `content_security_policy` allows `script-src 'self'` only. `pendo-loader.js` loads the agent via `chrome.runtime.getURL('vendor/pendo.js')`.

`web_accessible_resources` exposes `popup.html`, `popup.css`, `popup.js`, `pendo-kb.js`, `pendo-loader.js`, `vendor/pendo.js`, and the fonts/icons folders so the iframe can load them on any host origin.

### Optional Multi-provider AI

If the user has saved an API key in Settings, `requestAiAdvice()` calls one of three providers when validation detects failures:

| Provider | Endpoint | Default model |
|---|---|---|
| OpenAI | `https://api.openai.com/v1/chat/completions` | `gpt-4o-mini` |
| Anthropic Claude | `https://api.anthropic.com/v1/messages` | `claude-haiku-4-5-20251001` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | `gemini-2.0-flash` |

The endpoint URL, model, and request shape vary per provider; response parsing also branches per provider. Credentials live in `chrome.storage.local` under `aiProvider`, `aiApiKey`, and (optional overrides) `aiEndpoint`, `aiModel`, `timeoutMs`. The feature degrades gracefully when no key is set.

### Persistent Visitor ID

The extension instruments itself with Pendo. A UUID is generated on first run and stored in `chrome.storage.local` under a stable key, so the extension user is consistently identified across sessions.

## Permissions

Declared in `manifest.json`:
- `scripting` — inject scripts into tabs
- `activeTab` — access the currently active tab
- `storage` — persist visitor UUID and AI credentials
- `tabs` — enumerate tabs when searching for a Launcher tab in Phase 2
- `management` — recognise the Pendo Launcher / Launcher (Beta) extensions when present
- `debugger` — reserved for future debug tooling
- `host_permissions: <all_urls>` — run scripts on any page

## Tests

Vitest + jsdom test suite at the repo root. Pure functions are extracted into `tests/helpers.js` so they can run without a build step.

- `npm test` — single run
- `npm run test:watch` — watch mode
- `npm run test:coverage` — v8 coverage

Suites: `normalizeAdviceList`, `buildMarkdownReport`/`buildJsonReport`, `captureAndInspect`, `getOrCreateVisitorId`, `requestAiAdvice` (all three providers + timeout/error paths + buildAiPrompt KB enrichment), `content.js` drag-clamping, `content.test.js` resize-clamping, `pendoKb` (findKbByTopics + selectRelatedReading), `classifyAdvice`, `deriveHeroState`, `buildPlainSummary`, and `formatRelative`. ~227 tests.

## Updating the Bundled Pendo Agent

`vendor/pendo.js` is not managed by npm. To update: replace the file with a new production build of the Pendo Web SDK and update the version comment in `vendor/README.md`.

## UI Reference

`extension/popup-actions.md` is a reference table mapping every panel UI element to its `data-action` attribute and DOM `id` — useful when adding new buttons or event bindings in `popup.js`.

## Design Tokens (CSS)

Defined in `popup.css`:
- Pendo pink: `#FF4876`
- Ink blue: `#0b2239`
- Success green: `#0f9d58`
- Warning yellow: `#b38600`
- Error red: `#b42318`

Fonts (Inter body, Sora headings) are loaded from `extension/fonts/` — no external network requests.
