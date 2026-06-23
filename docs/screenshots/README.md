# Screenshots

This folder contains images referenced by the project [README](../../README.md).

The current PNGs are **generated mockups** styled with the project's design tokens. Replace them with real Chrome captures when available.

## Images

| File | Dimensions | What it should show |
|------|-----------|---------------------|
| `hero.png` | ~1600 x 900 | Wide marketing hero: a web page in the background with the floating IVA panel in the foreground showing a successful validation (Status tab, green hero, quick stats, checks list, action bar). |
| `install.png` | ~1200 x 700 | Chrome `chrome://extensions` page with Developer mode enabled, "Load unpacked" highlighted, and the Pendo Install Validator card visible. |
| `panel-status.png` | ~1000 x 1100 | Close-up of the IVA panel's Status tab: status hero, quick stats row, Checks & recommendations card, Identity card, Metadata card, action bar (Validate / Debugger / Export). |

## How to recapture

1. Load the extension in Chrome (`chrome://extensions` → Load unpacked → `extension/`).
2. Navigate to a page with Pendo installed and click the extension icon.
3. Run validation, then take a screenshot of the panel / page.
4. Crop and save over the corresponding file in this folder.
