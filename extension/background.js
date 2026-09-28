/**
 * Proxy Claude API calls from the panel through the service worker. Anthropic still
 * classifies extension fetch as a browser client (requires dangerous-direct-browser-access);
 * some orgs block that entirely — see friendly messaging in popup.js requestAiAdvice catch.
 *
 * Also handles toolbar icon clicks: injects content.js into pre-existing tabs, then sends
 * pendo-validate-toggle to show/hide the overlay panel.
 *
 * HAR capture (CDP + reload) runs here so it survives tab reload — the panel iframe is
 * destroyed when the validated page reloads. On Chrome (service worker), load via
 * importScripts; on Firefox (event page), har-capture.js is listed before this file
 * in the transformed manifest (see scripts/browser-targets.mjs).
 */
if (typeof importScripts === 'function') {
  importScripts('har-capture.js');
}

const HAR_POST_LOAD_SETTLE_MS = 2000;
const HAR_CAPTURE_MAX_MS = 15000;
const PENDING_HAR_STORAGE_KEY = 'pendingHarDownload';
const PENDING_NETWORK_STORAGE_KEY = 'pendingNetworkCapture';
const REOPEN_PANEL_STORAGE_KEY = 'ivaReopenPanel';
const REOPEN_PANEL_TTL_MS = 120000;

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

/**
 * Attach CDP, reload the tab, and build a HAR once the page settles.
 * `beforeReload` runs only after the debugger is attached and Network/Page are enabled;
 * `afterReload` runs once the reload has been issued. `reloadStarted` on the result tells the
 * caller whether the panel iframe was torn down (true) or is still open to show the error (false).
 * @param {{ beforeReload?: () => Promise<void>|void, afterReload?: () => void }} [hooks]
 */
async function captureNetworkHarInServiceWorker(tabId, pageUrl, hooks) {
  const { beforeReload, afterReload } = hooks || {};
  if (!chrome.debugger?.attach) {
    return { ok: false, message: 'CDP not available.', reloadStarted: false };
  }
  const target = { tabId };
  const events = [];
  let resolveWait;
  let settleTimer = null;
  let maxTimer = null;
  let captureSettled = false;
  let reloadStarted = false;
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
    return { ok: false, message: e.message || String(e), reloadStarted };
  }

  try {
    chrome.debugger.onEvent.addListener(handler);
    await debuggerSendCommand(target, 'Network.enable', { maxPostDataSize: 65536 });
    await debuggerSendCommand(target, 'Page.enable');
    if (beforeReload) await beforeReload();
    maxTimer = setTimeout(() => finish('maxTimer'), HAR_CAPTURE_MAX_MS);
    await new Promise((resolve, reject) => {
      chrome.tabs.reload(tabId, {}, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      });
    });
    reloadStarted = true;
    if (afterReload) afterReload();
    await waitDone;

    const extensionOrigin = getExtensionOriginForHar();
    const har = buildHarFromCdpEvents(events, {
      pageUrl,
      extensionOrigin,
      creatorVersion: readExtensionVersion(),
    });
    const entryCount = har.log.entries.length;
    const summary = summarizePendoNetworkFromCdp(events, { extensionOrigin });
    return { ok: true, har, summary, mode: 'cdp', entryCount, reloadStarted };
  } catch (e) {
    return { ok: false, message: e?.message || String(e), reloadStarted };
  } finally {
    if (maxTimer) clearTimeout(maxTimer);
    if (settleTimer) clearTimeout(settleTimer);
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
          if (!invokeOnly) await chrome.scripting.executeScript({ target, world, files: ['har-timings.js'] });
          const results = await chrome.scripting.executeScript({
            target,
            world,
            func: () => globalThis.__pendoValidateHarTimings(),
            args: [],
          });
          sendResponse({ ok: true, results });
        } else if (injectedScript === 'frame-probe') {
          // target may carry allFrames; new frames never hold the global, so always inject.
          await chrome.scripting.executeScript({ target, world, files: ['frame-probe.js'] });
          const results = await chrome.scripting.executeScript({
            target,
            world,
            func: (opts) => globalThis.__pendoValidateFrameProbe(opts),
            args,
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

  if (message?.type === 'pendo-validate-host-tab-id') {
    sendResponse({ ok: true, tabId: sender.tab?.id ?? null });
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
    const tabId = message.tabId;
    const pageUrl = message.pageUrl || 'unknown';
    // Carried through the reload for har_downloaded: the reopened panel starts without lastContext.
    const outcome = typeof message.outcome === 'string' ? message.outcome : undefined;
    let reopenMarkerSet = false;
    (async () => {
      const result = await captureNetworkHarInServiceWorker(tabId, pageUrl, {
        beforeReload: async () => {
          try {
            await chrome.storage.local.set({
              [REOPEN_PANEL_STORAGE_KEY]: { tabId, expires: Date.now() + REOPEN_PANEL_TTL_MS },
            });
            reopenMarkerSet = true;
          } catch (_) { /* ignore */ }
        },
        afterReload: () => sendResponse({ ok: true, started: true }),
      });
      if (!result.reloadStarted) {
        // The panel was never torn down: report the failure to it directly and leave no marker
        // behind that would reopen the panel on a later, unrelated navigation in this tab.
        if (reopenMarkerSet) {
          try { await chrome.storage.local.remove(REOPEN_PANEL_STORAGE_KEY); } catch (_) { /* ignore */ }
        }
        sendResponse({ ok: false, error: result.message || 'HAR capture failed' });
        return;
      }
      const payload = result.ok
        ? { har: result.har, entryCount: result.entryCount, mode: result.mode, outcome, ts: Date.now(), tabId }
        : { error: result.message || 'HAR capture failed', ts: Date.now(), tabId };
      try {
        await chrome.storage.local.set({ [PENDING_HAR_STORAGE_KEY]: payload });
      } catch (_) { /* ignore */ }
      await requestOpenPanelOnTab(tabId);
    })();
    return true;
  }

  // Validate with network capture: the reopened panel shows "capturing" until the state
  // becomes done/error, then validates with the summary (and never reloads again).
  if (message?.type === 'pendo-validate-network-validate') {
    const tabId = message.tabId;
    const pageUrl = message.pageUrl || 'unknown';
    let markersSet = false;
    (async () => {
      const result = await captureNetworkHarInServiceWorker(tabId, pageUrl, {
        beforeReload: async () => {
          try {
            await chrome.storage.local.set({
              [REOPEN_PANEL_STORAGE_KEY]: { tabId, expires: Date.now() + REOPEN_PANEL_TTL_MS },
              [PENDING_NETWORK_STORAGE_KEY]: { tabId, state: 'capturing', startedAt: Date.now() },
            });
            markersSet = true;
          } catch (_) { /* ignore */ }
        },
        afterReload: () => sendResponse({ ok: true, started: true }),
      });
      if (!result.reloadStarted) {
        if (markersSet) {
          try { await chrome.storage.local.remove([REOPEN_PANEL_STORAGE_KEY, PENDING_NETWORK_STORAGE_KEY]); } catch (_) { /* ignore */ }
        }
        sendResponse({ ok: false, error: result.message || 'Network capture failed' });
        return;
      }
      const payload = result.ok
        ? { tabId, state: 'done', ts: Date.now(), har: result.har, entryCount: result.entryCount, summary: result.summary }
        : { tabId, state: 'error', ts: Date.now(), error: result.message || 'Network capture failed' };
      try {
        await chrome.storage.local.set({ [PENDING_NETWORK_STORAGE_KEY]: payload });
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
