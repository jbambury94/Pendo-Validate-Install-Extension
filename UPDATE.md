# Updating the Pendo Install Validator Extension

You're here because a notification told you there's a new version available. The extension is distributed through the [Chrome Web Store](https://chromewebstore.google.com/detail/Pendo%20Install%20Validator/ihcmfkfdfpoiadcpleapkjeppmephpfa) and updates automatically — you usually do not need to do anything.

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

## A note on your AI settings

If you have configured an AI provider (OpenAI, Anthropic, or Gemini) via the Settings panel, your credentials are stored in `chrome.storage.local` and will survive an update without needing to be re-entered.

One exception: if a model you had configured has since been deprecated, the extension will automatically clear the stale model ID and fall back to the current default. Check the **Settings** tab after updating if AI advice suddenly stops working.

---

## Keeping up with changes

The full version history is in [CHANGELOG.md](https://github.com/jbambury94/Pendo-Validate-Install-Extension/blob/Stable/CHANGELOG.md). Worth a quick read when a release note mentions new permissions.
