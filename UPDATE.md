# Updating the Pendo Validate Install Extension

You're here because a notification told you there's a new version available. Unlike Chrome Web Store extensions, this one won't update itself — but it takes about 60 seconds. Here's how.

---

## Step 1 — Download the latest version

1. Go to the [Releases page](https://github.com/jbambury94/Pendo-Validate-Install-Extension/releases)
2. Under the latest release, download the zip that matches your browser:
   - `pendo-validate-install-<version>-chrome.zip` for Chrome
   - `pendo-validate-install-<version>-edge.zip` for Edge
   - `pendo-validate-install-<version>-firefox.zip` for Firefox
3. Extract the zip to a folder on your machine — ideally the same location as your previous install, so you're not hunting for it next time

---

## Step 2 — Reload the extension in your browser

### Chrome / Edge

1. Navigate to `chrome://extensions` (Chrome) or `edge://extensions` (Edge)
2. Find **Pendo Validate Install** in the list
3. Click the **refresh icon** (circular arrow) on the extension card
4. Done. The updated version is now active

> If you extracted to a **different folder** than your previous install, click **Remove** on the old extension card first, then click **Load unpacked** and select the `extension/` folder from your newly extracted files.

### Firefox

Firefox loads unpacked extensions as temporary add-ons, which means they do not persist across browser restarts. To update:

1. Navigate to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Navigate to your extracted folder and select `manifest.json`

Firefox will load the updated version. Note that you will need to repeat this process each time Firefox restarts — this is a Firefox limitation, not a character flaw on anyone's part.

---

## Step 3 — Verify the update

Open the extension popup and check the version number in the footer. It should match the release you just downloaded. If it does not, try hard-refreshing the extension card or closing and reopening your browser entirely.

---

## A note on your AI settings

If you have configured an AI provider (OpenAI, Anthropic, or Gemini) via the Settings panel, your credentials are stored in `chrome.storage.local` and will survive an update without needing to be re-entered.

One exception: if a model you had configured has since been deprecated, the extension will automatically clear the stale model ID and fall back to the current default. Check the **Settings** tab after updating if AI advice suddenly stops working.

---

## Keeping up with changes

The full version history is in [CHANGELOG.md](https://github.com/jbambury94/Pendo-Validate-Install-Extension/blob/Stable/CHANGELOG.md). Worth a quick read before updating — occasionally a release adds a new browser permission, which Chrome will flag with a prompt on reload. This is expected behaviour, not cause for alarm.
