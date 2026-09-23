# Updating the Pendo Install Validator Extension

You're here because a notification told you there's a new version available. On **Chrome** and **Edge**, the extension is distributed through the [Chrome Web Store](https://chromewebstore.google.com/detail/Pendo%20Install%20Validator/ihcmfkfdfpoiadcpleapkjeppmephpfa) and updates automatically — you usually do not need to do anything. **Firefox** still uses a manual zip from GitHub Releases; see below.

---

## Chrome and Edge (Chrome Web Store)

Updates roll out through the store in the background. Your settings (AI key, theme, visitor ID) are preserved.

### Check for an update now

1. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge).
2. Turn on **Developer mode** (Chrome: top-right toggle; Edge: bottom-left toggle).
3. Click **Update** at the top of the page.
4. Find **Pendo Install Validator** and confirm the version on the card matches the latest release.

### Verify in the panel

Open the extension on any page and check the version in the panel footer. It should match the current release. If it does not, wait a few hours for the store rollout or try **Update** again.

> **Edge:** if you have not installed from the store yet, open `edge://extensions`, enable **Allow extensions from other stores**, then install from the [Chrome Web Store listing](https://chromewebstore.google.com/detail/Pendo%20Install%20Validator/ihcmfkfdfpoiadcpleapkjeppmephpfa). After that, updates work the same as on Chrome.

> **New permissions.** Occasionally a release adds a browser permission; Chrome or Edge may prompt you to accept it when the update applies. That is expected behaviour, not cause for alarm.

---

## Firefox (GitHub Release zip)

Firefox loads unsigned builds as *temporary* add-ons, so they do not persist across browser restarts and do not auto-update from the Chrome Web Store.

### Step 1 — Download the latest version

1. Go to the [Releases page](https://github.com/jbambury94/Pendo-Validate-Install-Extension/releases).
2. Under the latest release, download `pendo-validate-install-<version>-firefox.zip`.

### Step 2 — Reload the add-on

1. Navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select the Firefox zip from the release (no need to unzip).

You will need to repeat this after each browser restart — a Firefox limitation, not a character flaw on anyone's part.

### Step 3 — Verify the update

Open the extension panel and check the version in the footer. It should match the release you downloaded.

---

## A note on your AI settings

If you have configured an AI provider (OpenAI, Anthropic, or Gemini) via the Settings panel, your credentials are stored in `chrome.storage.local` and will survive an update without needing to be re-entered.

One exception: if a model you had configured has since been deprecated, the extension will automatically clear the stale model ID and fall back to the current default. Check the **Settings** tab after updating if AI advice suddenly stops working.

---

## Preview features

AI advice, HAR download, and CSP probing ship switched off and are opted into per install. If the **AI advice** card or the **HAR** button is missing after an update, that is the gate, not a bug — see [Preview features](README.md#preview-features) for how to switch one on from the panel console. Your choices are stored locally and survive updates; a saved AI key is kept even while the AI gate is closed.

---

## Keeping up with changes

The full version history is in [CHANGELOG.md](https://github.com/jbambury94/Pendo-Validate-Install-Extension/blob/Stable/CHANGELOG.md). Worth a quick read before updating on Firefox — and occasionally on Chrome or Edge when a release note mentions new permissions.
