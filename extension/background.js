/**
 * Proxy Claude API calls from the panel through the service worker. Anthropic still
 * classifies extension fetch as a browser client (requires dangerous-direct-browser-access);
 * some orgs block that entirely — see friendly messaging in popup.js requestAiAdvice catch.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'pendo-validate-ai-fetch') return;
  if (sender.id !== chrome.runtime.id) return;

  (async () => {
    const { endpoint, headers, body, timeoutMs } = message;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort('timeout'), timeoutMs || 8000);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(t);
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch (_) {}
      sendResponse({ ok: res.ok, status: res.status, json });
    } catch (e) {
      clearTimeout(t);
      const aborted = e && (e.name === 'AbortError' || (e.message && String(e.message).includes('aborted')));
      sendResponse({
        ok: false,
        status: 0,
        error: aborted ? 'timeout' : 'network',
        message: e && e.message ? String(e.message) : String(e),
      });
    }
  })();

  return true;
});

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
