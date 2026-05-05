# Pendo Validate Install Extension

A Chrome extension for validating Pendo installations. Click the extension icon and a draggable panel appears on the page; it runs `pendo.validateInstall()` in the active tab, captures console output, checks identity and CSP, confirms API key presence, and provides built-in remediation advice — with optional AI-powered suggestions from OpenAI, Anthropic Claude, or Google Gemini.

## Features

- **Floating modal overlay**: clicking the icon toggles a draggable iframe panel injected into the active tab — no Chrome toolbar popup, so the panel persists while you navigate and inspect.
- **Three-phase validation**: runs `pendo.validateInstall()` against the page's `window.pendo` first; falls back to a same-tab Launcher detection (Phase 1.5, for `window.Pendo` injected by the Pendo Launcher extension); finally searches other windows for an open Pendo Launcher / Pendo Launcher (Beta) tab and runs validation there.
- **Tabbed UI** — *Output* (checks, recommendations, captured logs) and *Settings* (page status summary, debug tools, export, AI configuration).
- **Console interception**: captures all `console.log`, `warn`, `error`, and `info` output produced during validation and displays it colour-coded.
- **Agent and identity inspection**: reads agent version, detected API key, `visitorId`, `accountId`, and visitor/account metadata fields directly from the Pendo agent state.
- **Performance API resource tracking**: collects Pendo-related network resource hits from the browser's Performance API.
- **CSP meta tag inspection**: reads `Content-Security-Policy` meta tags from the page and flags missing Pendo domains.
- **Built-in advice**: generates prioritised, check-based recommendations with links to official Pendo support articles.
- **Optional multi-provider AI advice**: sends validation context to OpenAI, Anthropic Claude, or Google Gemini and surfaces remediation suggestions (requires you to paste an API key in Settings).
- **Debug tools**: "Enable Pendo Debugger" calls `pendo.enableDebugging()`; "Start VDS" launches the Visual Design Studio via `pendo.designerv2.launchInAppDesigner()`.
- **Export**: download results as a Markdown report (with support links) or raw JSON; copy advice or captured logs to clipboard.
- **Self-contained**: all fonts (Inter, Sora) and the Pendo agent are bundled locally — no external network requests at panel load time.
- **Persistent visitor ID**: instruments itself with Pendo using a UUID stored in `chrome.storage.local` for consistent session tracking.

## How it works

When you click **Validate Pendo Install**, the extension runs in up to three phases:

1. **Phase 1 — Active tab snippet.** Injects a script into the current tab and calls `pendo.validateInstall()` against `window.pendo`. Console output is intercepted and captured before the call and restored afterwards.
2. **Phase 1.5 — Active tab Launcher.** If Phase 1 finds no `window.pendo`, re-runs the inspection looking for `window.Pendo` (capital P) — the global the Pendo Launcher / Pendo Launcher (Beta) extension injects into the host page.
3. **Phase 2 — Separate Launcher tab.** If neither global is present on the active tab, searches all open windows for a Pendo Launcher tab (web-origin only — `chrome://` and `chrome-extension://` tabs are skipped because cross-extension injection is blocked) and runs validation there without switching focus.

Results — status, agent metadata, captured logs, and advice — are shown in the floating panel. The extension never stores page content or sends data anywhere unless the optional AI feature is configured.

## Repo structure

```
Install-Validate-Agent/
├── CHANGELOG.md              – version history
├── CLAUDE.md                 – developer/agent reference
├── README.md
├── package.json              – Vitest dev dependencies + npm test scripts
├── vitest.config.js
├── tests/                    – Vitest + jsdom test suite (127 tests)
└── extension/                – unpacked Chrome extension (Manifest V3)
    ├── manifest.json
    ├── background.js         – service worker; toggles the overlay on icon click
    ├── content.js            – injects the draggable iframe overlay into the active tab
    ├── popup.html            – panel UI (loaded inside the iframe)
    ├── popup.js              – validation, advice, export, debug, AI logic
    ├── popup.css             – UI styles and design tokens
    ├── pendo-loader.js       – queues Pendo API calls; defers loading vendor/pendo.js
    ├── popup-actions.md      – reference table of UI element ids and data-actions
    ├── fonts/                – locally bundled Inter (body) and Sora (heading) fonts
    ├── icons/
    └── vendor/
        ├── pendo.js          – bundled Pendo Web SDK agent (MV3 CSP compliance)
        └── README.md
```

The panel loads the Pendo agent from `extension/vendor/pendo.js` to comply with MV3's `script-src 'self'` policy — no remote script fetches.

## Run locally (unpacked extension)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` folder from this repo
5. Visit a site where Pendo is installed, click the extension icon to open the floating panel, and press **Validate Pendo Install**

To apply code changes after editing: click the refresh icon on the extension card in `chrome://extensions`, then click the icon to reopen the panel.

## Tests

A Vitest + jsdom test suite covers the pure helper logic extracted from `popup.js` and `content.js` (advice normalisation, Markdown/JSON report generation, agent detection, console interception, metadata extraction, API key extraction, visitor-ID storage branches, AI request shaping for all three providers, and overlay drag-clamping).

```bash
npm install
npm test            # one-shot
npm run test:watch  # watch mode
npm run test:coverage
```

## Notes

- **Version**: 1.5.1 (see [CHANGELOG.md](CHANGELOG.md))
- **Manifest version**: 3
- **Permissions**: `activeTab`, `scripting`, `storage`, `tabs`, `management`, `debugger`
- **Host permissions**: `<all_urls>`

## AI-powered advice (optional)

The extension can request remediation advice from OpenAI, Anthropic Claude, or Google Gemini when validation uncovers warnings or errors. The feature is **disabled by default** and only activates after you save an API key in Settings.

Configure it from the panel's **Settings → AI Advice Configuration**:

1. Pick a **Provider** — OpenAI (`gpt-4o-mini`), Anthropic Claude (`claude-haiku-4-5`), or Google Gemini (`gemini-2.0-flash`).
2. Paste your **API key** (use the *Show* / *Hide* toggle to verify the value).
3. Click **Save**.

Advanced overrides (custom endpoint URL, model name, request timeout) can still be set directly in `chrome.storage.local` under `aiEndpoint`, `aiModel`, and `timeoutMs`. The provider selection and key live under `aiProvider` and `aiApiKey`.

When enabled, the extension sends a concise context payload to the chosen provider: page URL, agent version, visitor/account IDs, API key presence flag, CSP meta tag text, and up to 30 captured validation log lines. Use this feature only on pages where you are comfortable sharing this metadata — logs may contain user IDs or other application details. The system prompt instructs the model to ground suggestions in official Pendo sources (`pendo.io`, `support.pendo.io`, `help.pendo.io`, `academy.pendo.io`) and to avoid speculative advice.
