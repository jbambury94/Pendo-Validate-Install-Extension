/**
 * Proxy Claude API calls from the panel through the service worker. Anthropic still
 * classifies extension fetch as a browser client (requires dangerous-direct-browser-access);
 * some orgs block that entirely — see friendly messaging in popup.js requestAiAdvice catch.
 *
 * Also handles toolbar icon clicks: injects content.js into pre-existing tabs, then sends
 * pendo-validate-toggle to show/hide the overlay panel.
 *
 * HAR capture (CDP + reload) runs here so it survives tab reload — the panel iframe is
 * destroyed when the validated page reloads.
 *
 * Feature gates are enforced here as well as in the panel. The worker owns HAR capture and the
 * Claude proxy outright, so a closed gate has to make the capability unreachable rather than
 * merely hidden.
 */
importScripts('feature-flags.js', 'har-capture.js');

const HAR_POST_LOAD_SETTLE_MS = 2000;
const HAR_CAPTURE_MAX_MS = 15000;
const PENDING_HAR_STORAGE_KEY = 'pendingHarDownload';
const REOPEN_PANEL_STORAGE_KEY = 'ivaReopenPanel';
const REOPEN_PANEL_TTL_MS = 120000;

// The registry file is static for the life of the build, so it is cached; overrides are not, so
// they are re-read per check. The worker is torn down often, which keeps both honest.
let featureRegistryPromise = null;

function loadWorkerFeatureRegistry() {
  if (!featureRegistryPromise) featureRegistryPromise = loadFeatureRegistry(chrome.runtime, fetch);
  return featureRegistryPromise;
}

async function isWorkerFeatureEnabled(key) {
  try {
    const registry = await loadWorkerFeatureRegistry();
    const overrides = await readFeatureOverrides(chrome.storage?.local);
    const state = resolveFeatureState(registry, overrides, detectFeatureCapabilities(chrome));
    return isFeatureEnabled(state, key);
  } catch (_) {
    return false;
  }
}

async function requestOpenPanelOnTab(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'pendo-validate-open-panel' });
  } catch (_) { /* content script not ready yet — page-load check handles it */ }
}

function debuggerSendCommand(target, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, params || {}, (result) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(result);
    });
  });
}

function getExtensionOriginForHar() {
  try {
    return chrome.runtime.getURL('').replace(/\/$/, '');
  } catch {
    return '';
  }
}

function readExtensionVersion() {
  try {
    return String(chrome.runtime.getManifest().version || '');
  } catch {
    return '';
  }
}

async function captureNetworkHarInServiceWorker(tabId, pageUrl) {
  if (!chrome.debugger?.attach) {
    return { ok: false, message: 'CDP not available.' };
  }
  const target = { tabId };
  const events = [];
  let resolveWait;
  let settleTimer = null;
  let captureSettled = false;
  const waitDone = new Promise((resolve) => { resolveWait = resolve; });
  const finish = (reason) => {
    if (captureSettled) return;
    captureSettled = true;
    if (settleTimer) clearTimeout(settleTimer);
    resolveWait();
  };

  const handler = (source, method, params) => {
    if (source.tabId !== tabId) return;
    if (method && method.startsWith('Network.')) {
      events.push({ method, params: params || {} });
    }
    if (method === 'Page.loadEventFired') {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => finish('loadEventFired'), HAR_POST_LOAD_SETTLE_MS);
    }
  };

  try {
    await new Promise((resolve, reject) => {
      chrome.debugger.attach(target, '1.3', () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      });
    });
  } catch (e) {
    return { ok: false, message: e.message || String(e) };
  }

  try {
    chrome.debugger.onEvent.addListener(handler);
    await debuggerSendCommand(target, 'Network.enable', { maxPostDataSize: 65536 });
    await debuggerSendCommand(target, 'Page.enable');
    const maxTimer = setTimeout(() => finish('maxTimer'), HAR_CAPTURE_MAX_MS);
    await new Promise((resolve, reject) => {
      chrome.tabs.reload(tabId, {}, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      });
    });
    await waitDone;
    clearTimeout(maxTimer);

    const har = buildHarFromCdpEvents(events, {
      pageUrl,
      extensionOrigin: getExtensionOriginForHar(),
      creatorVersion: readExtensionVersion(),
    });
    const entryCount = har.log.entries.length;
    return { ok: true, har, mode: 'cdp', entryCount };
  } catch (e) {
    return { ok: false, message: e?.message || String(e) };
  } finally {
    try { chrome.debugger.onEvent.removeListener(handler); } catch {}
    try {
      await new Promise((resolve) => {
        chrome.debugger.detach(target, () => resolve());
      });
    } catch {}
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'pendo-validate-tabs-query') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query(message.queryInfo);
        sendResponse({ ok: true, tabs });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || String(e) });
      }
    })();
    return true;
  }

  if (message?.type === 'pendo-validate-execute-script') {
    (async () => {
      try {
        const { target, world = 'MAIN', args = [], injectedScript, invokeOnly = false } = message;
        // invokeOnly skips the (idempotent) file injection when the panel already saw the
        // global defined in this world, so the file isn't re-parsed on repeat runs.
        if (injectedScript === 'capture-inspect') {
          if (!invokeOnly) await chrome.scripting.executeScript({ target, world, files: ['capture-inspect.js'] });
          const results = await chrome.scripting.executeScript({
            target,
            world,
            func: (variant) => globalThis.__pendoValidateCaptureAndInspect(variant),
            args,
          });
          sendResponse({ ok: true, results });
        } else if (injectedScript === 'enable-debugging') {
          if (!invokeOnly) await chrome.scripting.executeScript({ target, world, files: ['enable-debugging.js'] });
          const results = await chrome.scripting.executeScript({
            target,
            world,
            func: () => globalThis.__pendoValidateEnableDebugging(),
            args: [],
          });
          sendResponse({ ok: true, results });
        } else if (injectedScript === 'har-timings') {
          if (!(await isWorkerFeatureEnabled('harDownload'))) {
            sendResponse({ ok: false, error: 'HAR download is not enabled' });
            return;
          }
          if (!invokeOnly) await chrome.scripting.executeScript({ target, world, files: ['har-timings.js'] });
          const results = await chrome.scripting.executeScript({
            target,
            world,
            func: () => globalThis.__pendoValidateHarTimings(),
            args: [],
          });
          sendResponse({ ok: true, results });
        } else {
          sendResponse({ ok: false, error: `Unknown injectedScript: ${injectedScript}` });
        }
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || String(e) });
      }
    })();
    return true;
  }

  if (message?.type === 'pendo-validate-check-reopen-panel') {
    (async () => {
      const tabId = sender.tab?.id;
      try {
        const data = await chrome.storage.local.get({ [REOPEN_PANEL_STORAGE_KEY]: null });
        const pending = data[REOPEN_PANEL_STORAGE_KEY];
        const reopen = !!(pending && pending.tabId === tabId && Date.now() < pending.expires);
        if (reopen) await chrome.storage.local.remove(REOPEN_PANEL_STORAGE_KEY);
        sendResponse({ ok: true, reopen });
      } catch (e) {
        sendResponse({ ok: false, reopen: false, error: e?.message || String(e) });
      }
    })();
    return true;
  }

  if (message?.type === 'pendo-validate-har-capture') {
    // Attaching the debugger and reloading the user's tab is the most invasive thing this worker
    // does, so it is restricted to our own panel the way the AI proxy below already is.
    if (sender.id !== chrome.runtime.id) return;
    const tabId = message.tabId;
    const pageUrl = message.pageUrl || 'unknown';
    (async () => {
      if (!(await isWorkerFeatureEnabled('harDownload'))) {
        sendResponse({ ok: false, error: 'HAR download is not enabled' });
        return;
      }
      sendResponse({ ok: true, started: true });
      try {
        await chrome.storage.local.set({
          [REOPEN_PANEL_STORAGE_KEY]: { tabId, expires: Date.now() + REOPEN_PANEL_TTL_MS },
        });
      } catch (_) { /* ignore */ }
      const result = await captureNetworkHarInServiceWorker(tabId, pageUrl);
      const payload = result.ok
        ? { har: result.har, entryCount: result.entryCount, mode: result.mode, ts: Date.now() }
        : { error: result.message || 'HAR capture failed', ts: Date.now() };
      try {
        await chrome.storage.local.set({ [PENDING_HAR_STORAGE_KEY]: payload });
      } catch (_) { /* ignore */ }
      await requestOpenPanelOnTab(tabId);
    })();
    return true;
  }

  if (message?.type === 'pendo-validate-management-get-all') {
    try {
      chrome.management.getAll((extensions) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse({ ok: true, extensions });
      });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
    return true;
  }

  if (message?.type !== 'pendo-validate-ai-fetch') return;
  if (sender.id !== chrome.runtime.id) return;

  (async () => {
    if (!(await isWorkerFeatureEnabled('aiAdvice'))) {
      sendResponse({ ok: false, status: 0, error: 'disabled', message: 'AI advice is not enabled' });
      return;
    }
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
