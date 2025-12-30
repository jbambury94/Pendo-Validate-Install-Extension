# Pendo Validate Install Lite (Chrome Extension)

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

## Package a zip for distribution

From the repo root:

```bash
cd extension
zip -r ../pendo-validate-install-lite.zip .
```

(Chrome Web Store packaging has its own requirements, but this gives you a simple distributable zip.)

## Notes

- Manifest version: 3
- Permissions: `activeTab`, `scripting`
- Host permissions: `<all_urls>`
