<p align="center">
  <img src="extension/icons/icon128.png" width="96" alt="Pendo Validate Install icon" />
</p>

<h1 align="center">Pendo Validate Install</h1>

<p align="center">
  A Chrome and Firefox extension that tells you in one click whether Pendo is installed correctly&nbsp;&mdash; and what to fix if it isn't.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-MV3-blue" alt="Chrome MV3" />
  <img src="https://img.shields.io/badge/Firefox-MV3-FF7139" alt="Firefox MV3" />
  <img src="https://img.shields.io/badge/version-1.7.1-FF4876" alt="Version 1.7.1" />
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

**Chrome / Edge**

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `extension/` folder from this repo.
4. Pin the extension icon in the toolbar for quick access.

To apply code changes after editing: click the refresh icon on the extension card, then click the toolbar icon to reopen the panel.

**Firefox** (this branch)

Requires Firefox 128+ (the minimum for `scripting.executeScript` MAIN-world support).

*Temporary load (development):*

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `extension/manifest.json`.
3. The add-on stays loaded until you restart Firefox.

*Signed install:* run `npm run build:firefox` for an unsigned `.zip`, or `npm run sign:firefox` for an AMO-signed `.xpi` (see [Firefox build & signing](#firefox-build--signing)), then open the file in Firefox.

> **What's different on Firefox:** `@pendo.io` employee detection (which needs the Chrome-only `chrome.identity` API) falls back to an anonymous UUID, and the Launcher-introspection path that relies on the Chrome DevTools Protocol (`chrome.debugger`) is skipped. Snippet and same-tab Launcher detection work fully.

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

1. Open **Settings** and pick a provider — OpenAI (`gpt-4o-mini`), Anthropic Claude (`claude-haiku-4-5`), or Google Gemini (`gemini-3.5-flash`).
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
- Run the test suite: `npm install && npm test` (Vitest + jsdom, 411 tests across 17 suites).
- Lint the extension for Firefox/AMO: `npm run lint:ext` (web-ext).
- Run it in a throwaway Firefox profile: `npm run start:firefox` (web-ext).
- UI element / `data-action` reference — see [extension/popup-actions.md](extension/popup-actions.md).

### Firefox build & signing

The Firefox package is built with [`web-ext`](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/) — no bundler. Dev-only files are excluded via [`web-ext-config.cjs`](web-ext-config.cjs).

| Command | What it does |
|---|---|
| `npm run lint:ext` | Validates the manifest and sources with `addons-linter` (0 errors expected). |
| `npm run start:firefox` | Launches Firefox with the extension loaded for live development. |
| `npm run build:firefox` | Produces an unsigned package in `dist/` (e.g. `pendo_validate_install_ext-1.7.1.zip`). |
| `npm run sign:firefox` | Produces an AMO-signed `.xpi` in `dist/` (self-distribution channel). |

**Signing prerequisites**

1. The add-on id is fixed in the manifest: `browser_specific_settings.gecko.id` = `pendo-validate-install@pendo.io`.
2. Create AMO API credentials at [addons.mozilla.org → Developer Hub → Manage API Keys](https://addons.mozilla.org/developers/addon/api/key/).
3. Export them, then sign:

```bash
export WEB_EXT_API_KEY="user:xxxxxxxx:xxx"
export WEB_EXT_API_SECRET="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
npm run sign:firefox            # --channel unlisted -> self-hosted .xpi
```

Use `--channel listed` to publish on AMO instead. Listed review may request a **source-code upload** because `extension/vendor/pendo.js` is a minified third-party build (the Pendo Web SDK; provenance and version are in `extension/vendor/README.md`). The extension ships **no remote code** (MV3-compliant), which satisfies AMO policy.

> `web-ext lint` reports non-blocking warnings for the Chrome-only APIs the extension feature-detects at runtime (`chrome.identity`, `chrome.debugger`) and for the ignored `service_worker` key (Firefox uses the `background.scripts` fallback). Before a **listed** AMO submission, also declare `browser_specific_settings.gecko.data_collection_permissions` to match the [privacy policy](PRIVACY.md).

---

<p align="center">
  <sub>v1.7.1 &middot; Manifest V3 &middot; Chrome + Firefox &middot; Built with the Pendo Web SDK</sub>
</p>
