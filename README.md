<p align="center">
  <img src="extension/icons/icon128.png" width="96" alt="Pendo Install Validator icon" />
</p>

<h1 align="center">Pendo Install Validator</h1>

<p align="center">
  A browser extension for Chrome, Edge, and Firefox that tells you in one click whether Pendo is installed correctly&nbsp;&mdash; and what to fix if it isn't.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-MV3-blue" alt="Chrome MV3" />
  <img src="https://img.shields.io/badge/Edge-MV3-blue" alt="Edge MV3" />
  <img src="https://img.shields.io/badge/Firefox-MV3%20(128%2B)-orange" alt="Firefox MV3 (128+)" />
  <img src="https://img.shields.io/badge/version-1.9.0-FF4876" alt="Version 1.9.0" />
  <img src="https://img.shields.io/badge/AI%20(preview)-OpenAI%20%7C%20Claude%20%7C%20Gemini-lightgrey" alt="AI (preview): OpenAI | Claude | Gemini" />
</p>

<p align="center">
  <img src="docs/screenshots/hero.png" width="800" alt="Pendo Install Validator floating panel on a web page" />
</p>

---

## The problem

Debugging a Pendo installation today means juggling browser DevTools, running `pendo.validateInstall()` by hand, guessing whether the snippet or the Pendo Launcher loaded, hunting for a missing API key, and cross-referencing CSP headers — all before you can even tell whether visitor identity is flowing. This extension collapses all of that into a single button click. One codebase ships to Chrome, Edge, and Firefox — install from the [Chrome Web Store](https://chromewebstore.google.com/detail/Pendo%20Install%20Validator/ihcmfkfdfpoiadcpleapkjeppmephpfa) on Chromium browsers, or grab the Firefox zip from [Releases](../../releases).

## Why you'll like it

- **One click, three-phase detection** — finds the Pendo agent whether it comes from a snippet on the page, the Pendo Launcher injecting into the same tab, or a Launcher running in a separate tab.
- **Identity and metadata at a glance** — reads `visitorId`, `accountId`, and visitor/account metadata fields directly from the agent state.
- **CSP and API key checks** — flags missing Pendo domains in `Content-Security-Policy` meta tags and confirms whether an API key is present.
- **Curated support links** — every validation surfaces a *Related reading* card with hand-picked entries from a built-in knowledge base of 25 Pendo support articles.
- **Extended page signals** — detects iframe / sandbox embedding, Google Tag Manager, common SPA frameworks (React / Vue / Angular / Next / Nuxt), the bundled Pendo agent version, and URL sanitization that can strip Pendo's Visual Design Studio token — both load-time redirects and client-side logic (inline-script scan plus history-API instrumentation).
- **Light / Dark / System theme.** Theme selector in Settings persists locally and applies before first paint, so there's no flash of unstyled content.
- **Shareable results** — export a Markdown report with support links and related reading, or copy a Slack-ready summary to your clipboard.
- **AI remediation (preview, off by default)** — get fix-it suggestions from OpenAI, Anthropic Claude, or Google Gemini. Prompts are enriched with up to 6 KB excerpts so the advice is grounded in official Pendo guidance. Ships behind a [feature gate](#preview-features).

---

## Install in 30 seconds

**Chrome:** [Add Pendo Install Validator from the Chrome Web Store](https://chromewebstore.google.com/detail/Pendo%20Install%20Validator/ihcmfkfdfpoiadcpleapkjeppmephpfa) — click **Add to Chrome**, then pin the toolbar icon. Updates arrive automatically.

| Browser | Install |
|---|---|
| **Chrome** | [Chrome Web Store listing](https://chromewebstore.google.com/detail/Pendo%20Install%20Validator/ihcmfkfdfpoiadcpleapkjeppmephpfa) — **Add to Chrome**. |
| **Edge** | Open `edge://extensions`, turn on **Allow extensions from other stores**, then use the same [Chrome Web Store listing](https://chromewebstore.google.com/detail/Pendo%20Install%20Validator/ihcmfkfdfpoiadcpleapkjeppmephpfa). Updates arrive automatically. |
| **Firefox** (128+) | Download `pendo-validate-install-<version>-firefox.zip` from the [latest GitHub Release](../../releases/latest). Open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, and select the zip (no need to unzip). |

> **Firefox note:** the zip is unsigned, so Firefox loads it as a *temporary* add-on that is removed when the browser restarts — reload it from `about:debugging`. A permanent install would require Mozilla (AMO) signing.

**From source** (development): clone this repo and **Load unpacked** → select the `extension/` folder (Chrome or Edge). To apply code changes after editing: click the refresh icon on the extension card, then click the toolbar icon to reopen the panel. For Firefox, build first (`npm install && npm run build:firefox`) since the source manifest is Chrome-flavoured.

---

## Use it

1. Navigate to the page where Pendo should be present.
2. Click the extension icon in the toolbar — a floating, draggable, resizable panel appears on the page.
3. Hit **Validate Pendo Install**.

<p align="center">
  <img src="docs/screenshots/panel-status.png" width="480" alt="Status tab showing checks, identity, and metadata" />
</p>

The panel has three tabs:

| Tab | What you'll find |
|-----|-----------------|
| **Status** | Pass/warn/error hero, quick stats (Errors / Warnings / Passing), prioritised checks & recommendations, *Related reading* (curated Pendo KB links), identity, and metadata cards. |
| **Logs** | Colour-coded captured console output with level filter chips (Err / Warn / Info), text search, one-click copy, and a Page facts panel. |
| **Settings** | Appearance (System / Light / Dark theme), page snapshot summary, and — once the `aiAdvice` [gate](#preview-features) is open — AI advice configuration (provider picker, API key with show/hide toggle, save). |

The action bar at the bottom gives you **Validate Pendo Install**, **Debugger** (`pendo.enableDebugging()`), and **Export** (Markdown report or Copy summary).

---

## Optional: AI advice

> AI advice is a preview feature and is **off by default**. Open the `aiAdvice` gate first — see [Preview features](#preview-features) — and the **AI advice** card appears in Settings.

1. Open **Settings** and pick a provider — OpenAI (`gpt-4o-mini`), Anthropic Claude (`claude-haiku-4-5`), or Google Gemini (`gemini-3.5-flash`).
2. Paste your API key (use the **Show / Hide** toggle to confirm it) and click **Save**.
3. Re-run validation — when warnings or errors are found, the extension requests AI-powered remediation advice grounded in official Pendo sources, with up to 6 curated KB excerpts injected into the prompt for context.

Your key is stored locally in `chrome.storage.local` and is only sent when validation surfaces an issue.

> **Claude behind a corporate policy?** Some orgs disable client-side Anthropic API access. If Claude returns a policy error, switch to OpenAI / Gemini, or point `aiClaudeEndpoint` (in `chrome.storage.local`) at your own HTTPS proxy that forwards to `https://api.anthropic.com/v1/messages`.

---

## Preview features

Some features are still being baked, so they ship switched off and have to be opted into per install. A closed gate hides the UI *and* makes the underlying capability unreachable — the service worker refuses to attach the debugger for a HAR capture or to proxy an AI request — so nothing half-built can be reached by accident.

| Gate | What it unlocks | Status |
|---|---|---|
| `harDownload` | The **HAR** button on the Logs tab | Preview |
| `aiAdvice` | The **AI advice** card in Settings and the provider request after a failing validation | Preview |
| `cspProbe` | Active CSP probing against real response headers | Not implemented yet; needs CDP, so it stays off on Firefox |

**Change the default for a build** by editing [`extension/feature-flags.json`](extension/feature-flags.json) and reloading the unpacked extension. Store-installed copies are read-only, so use the console instead.

**Flip a gate on an installed copy** from the panel console. The panel runs as an iframe on the page, so pick the extension context first:

1. Open DevTools on a page where the panel is showing.
2. In the **Console** tab, change the context dropdown (top-left, usually reading `top`) to the `Pendo Install Validator` entry.
3. Run one of:

```js
__pendoValidateFeatures.list()               // current state, and where each value came from
__pendoValidateFeatures.enable('harDownload')
__pendoValidateFeatures.disable('aiAdvice')
__pendoValidateFeatures.reset()              // drop all overrides, back to the shipped defaults
```

Overrides are stored in `chrome.storage.local` under `featureOverrides` and take effect immediately — no extension reload. Anything unreadable, malformed, or unrecognised leaves the gate closed rather than guessing.

---

## Your data stays yours

- **AI is opt-in only.** Calls happen only when the `aiAdvice` gate is open, only when you've saved a key, only after validation finds a problem, and only the page URL, agent metadata, and up to 30 captured log lines are sent. Logs may contain user IDs or application details — use the feature only on pages where you're comfortable sharing that context.

---

## For developers

- Release notes — see [CHANGELOG.md](CHANGELOG.md).
- Run the test suite: `npm install && npm test` (Vitest + jsdom).
- Build release packages: `npm run build` (Chrome + Firefox) or `npm run build:chrome` / `build:firefox`. Output lands in `dist/` — the Chrome zip is the artifact uploaded to the Chrome Web Store; the Firefox zip is attached to GitHub Releases. Per-target manifest transforms live in `scripts/browser-targets.mjs`.
- UI element / `data-action` reference — see [extension/popup-actions.md](extension/popup-actions.md).
- Feature gates — defaults in [extension/feature-flags.json](extension/feature-flags.json), resolution in `extension/feature-flags.js`. See [Preview features](#preview-features).

---

<p align="center">
  <sub>v1.9.0 &middot; Manifest V3 &middot; Chrome + Edge + Firefox &middot; Built with the Pendo Web SDK &middot; John Bambury (Pendo Professional Services)</sub>
</p>