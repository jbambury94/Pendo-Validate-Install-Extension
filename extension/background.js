chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  try {
    // Ensure content.js is present in tabs that were open before the extension was installed/updated.
    // New navigations get it automatically via content_scripts in the manifest.
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch (_) {
    // Already injected — the guard in content.js prevents double-init.
  }
  try {
    chrome.tabs.sendMessage(tab.id, { type: 'pendo-validate-toggle' });
  } catch (_) {
    // Non-injectable tab (chrome://, pdf viewer, etc.) — silent fail.
  }
});
