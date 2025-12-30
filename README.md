# Pendo Validate Install Extension

A tiny Chrome extension that runs `pendo.validateInstall()` on the current tab and surfaces the results in a popup.

## Repo structure

- `extension/` – the unpacked Chrome extension (Manifest V3)
  - `manifest.json`
  - `popup.html`, `popup.js`
  - `icons/`

## Run locally (unpacked extension)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` folder from this repo
5. Visit a site where Pendo is installed, click the extension, and run the validation


## Notes

- Manifest version: 3
- Permissions: `activeTab`, `scripting`, `storage`
- Host permissions: `<all_urls>`

## ChatGPT-powered advice (optional) WIP

The popup can request remediation advice from the ChatGPT API when validation uncovers warnings or errors. To enable it:

- Store your API configuration in extension storage (e.g. via DevTools > Extensions > Inspect views > Application > Storage > Local):
  - `aiEndpoint` – Chat Completions endpoint (e.g. `https://api.openai.com/v1/chat/completions`)
  - `aiApiKey` – bearer token for the endpoint
  - `aiModel` – optional model name (defaults to `gpt-4o-mini`)
- Ensure the `storage` permission is present (already in `manifest.json`).

When enabled, the extension sends a concise context payload (page URL, agent version, visitor/account IDs, API key presence, CSP meta tag text, and captured validation logs) to the ChatGPT endpoint. Use this feature only on pages where you are comfortable sharing this metadata. Logs may contain user IDs or other application details; protect secrets and disable the feature if that is a concern. The prompt instructs ChatGPT to ground suggestions in official Pendo sources (pendo.io, support.pendo.io, help.pendo.io, academy.pendo.io) and to avoid speculative advice.
