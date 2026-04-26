# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Chrome browser extension (Manifest V3)** that validates Pendo installations on web pages. It runs `pendo.validateInstall()` in the page context, captures console output, checks visitor/account identity, detects API key presence, and provides remediation advice.

There is no build system, package manager, or test framework. All source files are loaded directly by Chrome — the `extension/` folder is loaded as an unpacked extension.

## Running the Extension

Load it in Chrome:
1. Navigate to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `extension/` folder

To apply code changes: click the refresh icon on the extension card in `chrome://extensions`, then reopen the popup.

## Architecture

### Entry Points

- **`extension/popup.html`** — Extension popup UI; loaded when the user clicks the extension icon. References `pendo-loader.js` (runs first) and `popup.js`.
- **`extension/pendo-loader.js`** — Immediately queues Pendo API calls, then defers loading `vendor/pendo.js` via `requestIdleCallback`/`setTimeout` to avoid blocking popup responsiveness.
- **`extension/popup.js`** — All validation logic (~737 lines). Runs in the popup's own context (not injected into the page).

### Two-Phase Validation Flow

When the user clicks "Validate Pendo Install", `popup.js` runs `runInPage()`:

1. **Phase 1**: Injects `captureAndInspect('page')` into the active tab using `chrome.scripting.executeScript()` with `world: "MAIN"` to access `window.pendo`.
   - Intercepts `console.log/warn/error`
   - Checks for `window.pendo` and `pendo.validateInstall()`
   - Extracts version, API key, visitorId, accountId from agent state
   - Collects Pendo resource hits from the Performance API
   - Reads CSP meta tags

2. **Phase 2** (if Pendo snippet absent on the active tab): Searches for an open Pendo Launcher or Pendo Launcher (Beta) extension tab via `findLauncherTab()`, then re-runs `captureAndInspect('launcher' | 'launcher-beta')` in that tab instead.

Results flow back to popup context → `renderAdvice()` + `renderLogs()` populate the UI.

### Key Subsystems in `popup.js`

| Subsystem | What it does |
|---|---|
| `captureAndInspect()` | Injected into page; captures all validation data |
| `runInPage()` | Orchestrates two-phase injection logic |
| `findLauncherTab()` | Searches windows/tabs for Pendo Launcher |
| `renderAdvice()` | Renders key-value summary + advice list |
| `renderLogs()` | Renders color-coded captured console output |
| `requestAiAdvice()` | Optional ChatGPT call for dynamic recommendations |
| `buildMarkdownReport()` / `buildJsonReport()` | Generates downloadable reports |
| Debug buttons | Calls `pendo.enableDebugging()` / `pendo.designerv2.launchInAppDesigner()` via injection |

### MV3 CSP Compliance

Chrome's Manifest V3 prohibits remotely-hosted scripts. The Pendo Web SDK (`vendor/pendo.js`, ~540KB, v2.314.1) is bundled locally. The manifest's `content_security_policy` allows `script-src 'self'` only. `pendo-loader.js` loads the agent via `chrome.runtime.getURL('vendor/pendo.js')`.

### Optional AI Integration

If the validation detects failures, `requestAiAdvice()` optionally calls a ChatGPT-compatible endpoint. Credentials are stored in `chrome.storage.local` under keys `aiEndpoint`, `aiApiKey`, and `aiModel`. The feature degrades gracefully when these are absent.

### Persistent Visitor ID

The extension instruments itself with Pendo. A UUID is generated on first run and stored in `chrome.storage.local` under a stable key, so the extension user is consistently identified across sessions.

## Permissions

Declared in `manifest.json`:
- `scripting` — inject scripts into tabs
- `activeTab` — access the currently active tab
- `storage` — persist visitor UUID and optional AI credentials
- `tabs` — enumerate tabs when searching for Launcher
- `host_permissions: <all_urls>` — run scripts on any page

## Updating the Bundled Pendo Agent

`vendor/pendo.js` is not managed by npm. To update: replace the file with a new production build of the Pendo Web SDK and update the version comment at the top of `vendor/README.md`.

## UI Reference

`extension/popup-actions.md` is a reference table mapping every popup UI element to its `data-action` attribute — useful when adding new buttons or event bindings in `popup.js`.

## Design Tokens (CSS)

Defined in `popup.css`:
- Pendo pink: `#FF4876`
- Ink blue: `#0b2239`
- Success green: `#0f9d58`
- Warning yellow: `#b38600`
- Error red: `#b42318`

Fonts (Inter body, Sora headings) are loaded from `extension/fonts/` — no external network requests.
