# Privacy Policy — Pendo Validate Install

**Last updated:** 11 June 2026
**Extension version:** 1.8.4

---

## What the extension does

Pendo Validate Install is a browser extension for Chrome, Edge, and Firefox that checks whether the Pendo Web SDK is correctly installed on a web page. It inspects the active tab's JavaScript environment, captures console output from `pendo.validateInstall()`, and presents the results in a floating panel.

> **Firefox build:** the Firefox package omits the `debugger`, `identity`, and `identity.email` permissions (Firefox does not implement those APIs). On Firefox the visitor ID is therefore always the anonymous UUID — the `@pendo.io` profile-email identification described below applies to Chrome and Edge only — and the CDP-based Launcher introspection is skipped.

---

## Data collected and stored locally

All data below is stored in `chrome.storage.local`, which is isolated to this extension and **never synced** to a Google account or any external server (unless explicitly noted in the sections that follow).

| Item | Storage key | Purpose |
|---|---|---|
| Visitor ID | `pendoVisitorId` | If the Chrome profile is signed in to a `@pendo.io` Google account, the visitor ID is that email address (read passively via `chrome.identity.getProfileUserInfo`, not cached). Otherwise a randomly generated UUID (via `crypto.randomUUID()`) is used to identify this extension installation for product analytics. |
| Theme preference | `themePreference` | `"system"`, `"light"`, or `"dark"`. Purely cosmetic. Also mirrored to `localStorage('pendoValidateTheme')` for flash-free page loads. |
| AI provider | `aiProvider` | `"openai"`, `"claude"`, or `"gemini"`. Stored only when you save AI settings. |
| AI API key | `aiApiKey` | Your API key for the selected AI provider. Stored only when you save AI settings. |

No cookies are set. No data is written to files on disk.

---

## Data sent off-device

### 1. Product analytics (Pendo self-instrumentation) — always on

The extension bundles the Pendo Web SDK (`extension/vendor/pendo.js`) and initialises it each time the panel opens. The agent sends the following to **Pendo servers** (`data.pendo.io`, `app.pendo.io`):

- The persistent visitor ID described above (for `@pendo.io` Chrome profiles this is the work email; for everyone else it is a random UUID with no personal information).
- Interaction events within the panel (button clicks, tab switches).
- Standard browser metadata: user agent string, viewport size, locale, extension version.

This telemetry covers **only the extension's own panel UI**. It does **not** capture or transmit the content of the pages you visit, your browsing history, or any data from the Pendo installation you are validating.

### 2. AI remediation advice — opt-in only

If you save an API key in Settings and a validation run surfaces warnings or errors, the extension sends a single request to the provider you selected:

| Provider | Endpoint |
|---|---|
| OpenAI | `https://api.openai.com/v1/chat/completions` |
| Anthropic Claude | `https://api.anthropic.com/v1/messages` (or a custom proxy URL you configure) |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` |

The request body includes:

- The page URL of the tab you validated.
- Pendo agent version, API key presence, visitor/account IDs, and CSP metadata from the validated page.
- Up to 30 captured console log lines (which may contain application-specific identifiers).
- Up to 6 KB of excerpts from the built-in Pendo knowledge base (bundled locally, not fetched).

**No AI request is made unless** you have saved an API key **and** the validation run detects at least one issue. Your API key is sent only to the provider you selected and only in the request's authentication header.

### 3. Validation injection — never leaves the browser

When you click "Validate Pendo Install", the extension injects a read-only inspection function (`captureAndInspect`) into the active tab (or, in the Launcher case, into the Pendo Launcher extension's isolated world via the Chrome DevTools Protocol). This function reads `window.pendo` state and console output. **All results stay in the browser**; nothing from this step is sent to any server.

---

## Extension detectability

Because `web_accessible_resources` in the manifest matches `<all_urls>` (required for the floating panel to load on any page), websites can detect that this extension is installed by probing for `chrome-extension://<extension-id>/popup.html`. This does not expose any user data, but it does reveal that the extension is present.

---

## Permissions and why they are needed

| Permission | Reason |
|---|---|
| `scripting` | Inject the validation function into the active tab. |
| `storage` | Persist the visitor UUID, theme preference, and AI settings locally. |
| `tabs` | Search open tabs for a Pendo Launcher window (Phase 2 detection). |
| `management` | Detect whether the Pendo Launcher / Launcher (Beta) extension is installed and enabled. |
| `debugger` | Run the validation function inside the Pendo Launcher extension's isolated world via CDP when the Launcher injects the Pendo agent into a tab. This causes Chrome to show a "this extension started debugging this browser" banner while the debugger is attached (typically under one second). |
| `identity.email` | Read the Chrome profile email (passively, no OAuth prompt) to identify `@pendo.io` employees in self-instrumentation telemetry. Shows "Know your email address" at install. |
| `host_permissions: <all_urls>` | Allow the content script and floating panel iframe to operate on any page. |

---

## User controls

- **Clear AI key.** Open Settings, delete the API key field, and click Save.
- **Disable analytics.** There is currently no in-extension toggle to disable Pendo self-instrumentation. You can block requests to `data.pendo.io` and `app.pendo.io` via a network-level ad blocker or firewall rule.
- **Uninstall.** Removing the extension from `chrome://extensions` deletes all `chrome.storage.local` data (visitor UUID, theme, AI key) permanently. No residual data remains.

---

## Third-party services

| Service | Data received | Privacy policy |
|---|---|---|
| Pendo (product analytics) | Visitor ID (work email for `@pendo.io` profiles, random UUID otherwise), panel interaction events, browser metadata | [pendo.io/legal/privacy](https://www.pendo.io/legal/privacy/) |
| OpenAI (opt-in AI advice) | Validation context as described above | [openai.com/policies/privacy-policy](https://openai.com/policies/privacy-policy/) |
| Anthropic (opt-in AI advice) | Validation context as described above | [anthropic.com/privacy](https://www.anthropic.com/privacy) |
| Google (opt-in AI advice) | Validation context as described above | [policies.google.com/privacy](https://policies.google.com/privacy) |

---

## Contact

For questions about this privacy policy or the extension's data practices, open an issue in the GitHub repository or contact the maintainer directly.
