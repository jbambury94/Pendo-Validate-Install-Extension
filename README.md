# Pendo Validate Install Extension

A Chrome extension (Manifest V3) for validating Pendo installations. It injects into the active tab, runs `pendo.validateInstall()`, captures console output, checks identity and CSP, confirms API key presence, and provides built-in remediation advice — with optional AI-powered suggestions.

## Features

- **Two-phase validation**: runs `pendo.validateInstall()` in the active tab; if Pendo is absent, automatically falls back to an open Pendo Launcher or Pendo Launcher (Beta) extension tab
- **Console interception**: captures all `console.log`, `warn`, `error`, and `info` output produced during validation and displays it colour-coded in the popup
- **Agent and identity inspection**: reads agent version, detected API key, `visitorId`, and `accountId` directly from the Pendo agent state
- **Performance API resource tracking**: collects Pendo-related network resource hits from the browser's Performance API
- **CSP meta tag inspection**: reads `Content-Security-Policy` meta tags from the page and flags missing Pendo domains
- **Built-in advice**: generates prioritised, check-based recommendations with links to official Pendo support articles
- **Optional AI-powered advice**: sends validation context to a ChatGPT-compatible endpoint and surfaces remediation suggestions (requires configuration — see below)
- **Debug tools**: "Enable Pendo Debugger" calls `pendo.enableDebugging()`; "Start VDS" launches the Visual Design Studio via `pendo.designerv2.launchInAppDesigner()`
- **Export**: download results as a Markdown report (with support links) or raw JSON; copy advice or captured logs to clipboard
- **Self-contained**: all fonts (Inter, Sora) and the Pendo agent are bundled locally — no external network requests at popup load time
- **Persistent visitor ID**: instruments itself with Pendo using a UUID stored in `chrome.storage.local` for consistent session tracking

## How it works

When you click **Validate Pendo Install**, the extension runs in two phases:

1. **Phase 1 — Active tab**: The extension injects a script into the current tab and calls `pendo.validateInstall()` in the page's own JavaScript context (`window.pendo`). Console output is intercepted and captured before the call and restored afterwards.

2. **Phase 2 — Launcher fallback**: If `window.pendo` is not found on the active tab (e.g. you are on a page where Pendo is not installed), the extension searches all open windows for a Pendo Launcher or Pendo Launcher (Beta) tab and runs validation there instead, without switching focus.

Results — status, agent metadata, captured logs, and advice — are shown in the popup. The extension never stores page content or sends data anywhere unless the optional AI feature is configured.

## Repo structure

```
Pendo-Validate-Install-Extension/
├── CHANGELOG.md              – version history
├── CLAUDE.md                 – developer/agent reference
├── README.md
└── extension/                – unpacked Chrome extension (Manifest V3)
    ├── manifest.json
    ├── popup.html
    ├── popup.js              – all validation, advice, export, and debug logic
    ├── popup.css             – UI styles and design tokens
    ├── pendo-loader.js       – queues Pendo API calls; defers loading vendor/pendo.js
    ├── popup-actions.md      – reference table of UI element data-action values
    ├── fonts/                – locally bundled Inter (body) and Sora (heading) fonts
    ├── icons/
    └── vendor/
        ├── pendo.js          – bundled Pendo Web SDK agent (MV3 CSP compliance)
        └── README.md         – notes on the bundled agent version
```

The popup loads the Pendo agent from `extension/vendor/pendo.js` to comply with MV3's `script-src 'self'` policy — no remote script fetches.

## Run locally (unpacked extension)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` folder from this repo
5. Visit a site where Pendo is installed, click the extension icon, and press **Validate Pendo Install**

To apply code changes after editing: click the refresh icon on the extension card in `chrome://extensions`, then reopen the popup.

## Notes

- **Version**: 1.4.4 (see [CHANGELOG.md](CHANGELOG.md))
- **Manifest version**: 3
- **Permissions**: `activeTab`, `scripting`, `storage`, `tabs`
- **Host permissions**: `<all_urls>`

## AI-powered advice (optional)

The extension can request remediation advice from a ChatGPT-compatible API when validation uncovers warnings or errors. The feature is **disabled by default** and only activates when you supply credentials in extension storage.

To enable it, store the following keys in extension storage (e.g. via Chrome DevTools → Application → Storage → Local Storage, scoped to the extension):

- `aiEndpoint` – Chat Completions endpoint (e.g. `https://api.openai.com/v1/chat/completions`)
- `aiApiKey` – bearer token for the endpoint
- `aiModel` – model name (optional; defaults to `gpt-4o-mini`)

The `storage` permission is already declared in `manifest.json`.

When enabled, the extension sends a concise context payload to the endpoint: page URL, agent version, visitor/account IDs, API key presence flag, CSP meta tag text, and up to 30 captured validation log lines. Use this feature only on pages where you are comfortable sharing this metadata. Logs may contain user IDs or other application details — protect secrets and disable the feature if that is a concern. The system prompt instructs the model to ground suggestions in official Pendo sources (pendo.io, support.pendo.io, help.pendo.io, academy.pendo.io) and to avoid speculative advice.
