<p align="center">
  <img src="extension/icons/icon128.png" width="96" alt="Pendo Validate Install icon" />
</p>

<h1 align="center">Pendo Validate Install</h1>

<p align="center">
  A browser extension for Chrome and Edge that tells you in one click whether Pendo is installed correctly&nbsp;&mdash; and what to fix if it isn't.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-MV3-blue" alt="Chrome MV3" />
  <img src="https://img.shields.io/badge/Edge-MV3-blue" alt="Edge MV3" />
  <img src="https://img.shields.io/badge/version-1.7.0-FF4876" alt="Version 1.7.0" />
  <img src="https://img.shields.io/badge/Pendo%20Agent-v2.314.1%20bundled-0b2239" alt="Pendo Agent v2.314.1 bundled" />
  <img src="https://img.shields.io/badge/tests-Vitest%20%2B%20jsdom-0f9d58" alt="Tests: Vitest + jsdom" />
  <img src="https://img.shields.io/badge/AI-OpenAI%20%7C%20Claude%20%7C%20Gemini-lightgrey" alt="AI: OpenAI | Claude | Gemini" />
</p>

<!-- Mockup — replace with a real Chrome capture when available. See docs/screenshots/README.md -->
<p align="center">
  <img src="docs/screenshots/hero.png" width="800" alt="Pendo Validate Install floating panel on a web page" />
</p>

---

## The problem

Debugging a Pendo installation today means juggling browser DevTools, running `pendo.validateInstall()` by hand, guessing whether the snippet or the Pendo Launcher loaded, hunting for a missing API key, and cross-referencing CSP headers — all before you can even tell whether visitor identity is flowing. This extension collapses all of that into a single button click. It works in any Chromium-based browser (Chrome and Edge).

## Why you'll like it

- **One click, three-phase detection** — finds the Pendo agent whether it comes from a snippet on the page, the Pendo Launcher injecting into the same tab, or a Launcher running in a separate tab.
- **Identity and metadata at a glance** — reads `visitorId`, `accountId`, and visitor/account metadata fields directly from the agent state.
- **CSP and API key checks** — flags missing Pendo domains in `Content-Security-Policy` meta tags and confirms whether an API key is present.
- **Curated support links** — every validation surfaces a *Related reading* card with hand-picked entries from a built-in knowledge base of 24 Pendo support articles.
- **Extended page signals** — detects iframe / sandbox embedding, Google Tag Manager, common SPA frameworks (React / Vue / Angular / Next / Nuxt) and the bundled Pendo agent version.
- **Light / Dark / System theme.** Theme selector in Settings persists locally and applies before first paint, so there's no flash of unstyled content.
- **Shareable results** — export a Markdown report with support links and related reading, or copy a Slack-ready summary to your clipboard.
- **Optional AI remediation** — get fix-it suggestions from OpenAI, Anthropic Claude, or Google Gemini. Prompts are enriched with up to 6 KB excerpts so the advice is grounded in official Pendo guidance.

---

## Install in 30 seconds

<!-- Mockup — replace with a real Chrome capture. See docs/screenshots/README.md -->
<p align="center">
  <img src="docs/screenshots/install.png" width="600" alt="Loading the extension from chrome://extensions" />
</p>

**Chrome**

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `extension/` folder from this repo.
4. Pin the extension icon in the toolbar for quick access.

**Edge**

1. Open Edge and navigate to `edge://extensions`.
2. Enable **Developer mode** (bottom-left toggle).
3. Click **Load unpacked** and select the `extension/` folder from this repo.
4. Pin the extension icon in the toolbar for quick access.

> **Firefox** is not currently supported. The extension relies on Manifest V3 APIs (`chrome.debugger`, `chrome.identity.email`) that Firefox does not implement.

To apply code changes after editing: click the refresh icon on the extension card, then click the toolbar icon to reopen the panel.

---

## Use it

1. Navigate to the page where Pendo should be present.
2. Click the extension icon in the toolbar — a floating, draggable, resizable panel appears on the page.
3. Hit **Validate Pendo Install**.

<!-- Mockup — replace with a real Chrome capture. See docs/screenshots/README.md -->
<p align="center">
  <img src="docs/screenshots/panel-status.png" width="480" alt="Status tab showing checks, identity, and metadata" />
</p>

The panel has three tabs:

| Tab | What you'll find |
|-----|-----------------|
| **Status** | Pass/warn/error hero, quick stats (Errors / Warnings / Passing), prioritised checks & recommendations, *Related reading* (curated Pendo KB links), identity, and metadata cards. |
| **Logs** | Colour-coded captured console output with level filter chips (Err / Warn / Info), text search, one-click copy, and a Page facts panel. |
| **Settings** | Appearance (System / Light / Dark theme), page snapshot summary, and AI advice configuration (provider picker, API key with show/hide toggle, save). |

The action bar at the bottom gives you **Validate Pendo Install**, **Debugger** (`pendo.enableDebugging()`), and **Export** (Markdown report or Copy summary).

---

## Optional: AI advice

1. Open **Settings** and pick a provider — OpenAI (`gpt-4o-mini`), Anthropic Claude (`claude-haiku-4-5`), or Google Gemini (`gemini-2.0-flash`).
2. Paste your API key (use the **Show / Hide** toggle to confirm it) and click **Save**.
3. Re-run validation — when warnings or errors are found, the extension requests AI-powered remediation advice grounded in official Pendo sources, with up to 6 curated KB excerpts injected into the prompt for context.

Your key is stored locally in `chrome.storage.local` and is only sent when validation surfaces an issue.

> **Claude behind a corporate policy?** Some orgs disable client-side Anthropic API access. If Claude returns a policy error, switch to OpenAI / Gemini, or point `aiClaudeEndpoint` (in `chrome.storage.local`) at your own HTTPS proxy that forwards to `https://api.anthropic.com/v1/messages`.

---

## Your data stays yours

- **No remote scripts.** The Pendo Web SDK is bundled locally in `extension/vendor/pendo.js` — no external fetches at load time.
- **No external fonts.** Inter and Sora are shipped in `extension/fonts/`.
- **AI is opt-in only.** Calls happen only when you've saved a key, only after validation finds a problem, and only the page URL, agent metadata, and up to 30 captured log lines are sent. Logs may contain user IDs or application details — use the feature only on pages where you're comfortable sharing that context.

---

## For developers

- Architecture, validation phases, and AI internals — see [CLAUDE.md](CLAUDE.md).
- Release notes — see [CHANGELOG.md](CHANGELOG.md).
- Run the test suite: `npm install && npm test` (Vitest + jsdom, 252 tests across 12 suites).
- UI element / `data-action` reference — see [extension/popup-actions.md](extension/popup-actions.md).

---

<p align="center">
  <sub>v1.7.0 &middot; Manifest V3 &middot; Chrome + Edge &middot; Built with the Pendo Web SDK</sub>
</p>
