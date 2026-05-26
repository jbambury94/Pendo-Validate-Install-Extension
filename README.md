<p align="center">
  <img src="extension/icons/icon128.png" width="96" alt="Pendo Validate Install icon" />
</p>

<h1 align="center">Pendo Validate Install</h1>

<p align="center">
  A Chrome extension that tells you in one click whether Pendo is installed correctly&nbsp;&mdash; and what to fix if it isn't.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome%20Extension-MV3-blue" alt="Chrome Extension MV3" />
  <img src="https://img.shields.io/badge/version-1.6.0-FF4876" alt="Version 1.6.0" />
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

Debugging a Pendo installation today means juggling browser DevTools, running `pendo.validateInstall()` by hand, guessing whether the snippet or the Pendo Launcher loaded, hunting for a missing API key, and cross-referencing CSP headers — all before you can even tell whether visitor identity is flowing. This extension collapses all of that into a single button click.

## Why you'll like it

- **One click, three-phase detection** — finds the Pendo agent whether it comes from a snippet on the page, the Pendo Launcher injecting into the same tab, or a Launcher running in a separate tab.
- **Identity and metadata at a glance** — reads `visitorId`, `accountId`, and visitor/account metadata fields directly from the agent state.
- **CSP and API key checks** — flags missing Pendo domains in `Content-Security-Policy` meta tags and confirms whether an API key is present.
- **Shareable results** — export a Markdown report with support links, or copy a Slack-ready summary to your clipboard.
- **Optional AI remediation** — get fix-it suggestions from OpenAI, Anthropic Claude, or Google Gemini when validation surfaces warnings or errors.

---

## Install in 30 seconds

<!-- Mockup — replace with a real Chrome capture. See docs/screenshots/README.md -->
<p align="center">
  <img src="docs/screenshots/install.png" width="600" alt="Loading the extension from chrome://extensions" />
</p>

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `extension/` folder from this repo.
4. Pin the extension icon in the toolbar for quick access.

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
| **Status** | Pass/warn/error hero, quick stats (Errors / Warnings / Passing), prioritised checks & recommendations, identity, and metadata cards. |
| **Logs** | Colour-coded captured console output with level filter chips (Err / Warn / Info), text search, and one-click copy. |
| **Settings** | Page snapshot summary and AI advice configuration (provider picker, API key, save). |

The action bar at the bottom gives you **Validate Pendo Install**, **Debugger** (`pendo.enableDebugging()`), and **Export** (Markdown report or Copy summary).

---

## Optional: AI advice

1. Open **Settings** and pick a provider — OpenAI (`gpt-4o-mini`), Anthropic Claude (`claude-haiku-4-5`), or Google Gemini (`gemini-2.0-flash`).
2. Paste your API key and click **Save**.
3. Re-run validation — when warnings or errors are found, the extension requests AI-powered remediation advice grounded in official Pendo sources.

Your key is stored locally in `chrome.storage.local` and is only sent when validation surfaces an issue.

---

## Your data stays yours

- **No remote scripts.** The Pendo Web SDK is bundled locally in `extension/vendor/pendo.js` — no external fetches at load time.
- **No external fonts.** Inter and Sora are shipped in `extension/fonts/`.
- **AI is opt-in only.** Calls happen only when you've saved a key, only after validation finds a problem, and only the page URL, agent metadata, and up to 30 captured log lines are sent. Logs may contain user IDs or application details — use the feature only on pages where you're comfortable sharing that context.

---

## For developers

- Architecture, validation phases, and AI internals — see [CLAUDE.md](CLAUDE.md).
- Release notes — see [CHANGELOG.md](CHANGELOG.md).
- Run the test suite: `npm install && npm test` (Vitest + jsdom, ~127 tests).
- UI element / `data-action` reference — see [extension/popup-actions.md](extension/popup-actions.md).

---

<p align="center">
  <sub>v1.6.0 &middot; Manifest V3 &middot; Built with the Pendo Web SDK</sub>
</p>
