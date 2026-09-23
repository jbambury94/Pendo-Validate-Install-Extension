/**
 * HAR 1.2 builders for Pendo network capture (validated page only — not IVA self-instrumentation).
 * Loaded in the panel before popup.js; mirrored in tests via vm.runInThisContext.
 */

/** IVA self-instrumentation subscription key — exclude from customer HAR exports. */
const IVA_SELF_INSTRUMENTATION_API_KEY = '928b3d0d-8a3b-48b1-bf35-a6af3565dcc5';

function isPendoNetworkUrl(url) {
  const name = String(url || '');
  if (!name) return false;
  if (name.indexOf('pendo') === -1 && name.indexOf('agent/static') === -1 && name.indexOf('agent/production') === -1) {
    return false;
  }
  return /pendo(io)?\.com|pendo\.io|cdn\.pendo|pendo-io|data\.eu\.pendo|app\.eu\.pendo|cdn\.eu\.pendo/i.test(name)
    || /agent\/(static|production)/.test(name);
}

function urlStartsWithOrigin(url, originPrefix) {
  if (!url || !originPrefix) return false;
  return String(url).toLowerCase().startsWith(String(originPrefix).toLowerCase());
}

/**
 * Drop requests initiated from the extension panel (self-instrumentation) or carrying the IVA API key.
 * @param {object} evt - Normalized { url, documentURL, frameUrl, initiatorUrl }
 * @param {{ extensionOrigin?: string, selfApiKey?: string }} opts
 */
function isSelfInstrumentationRequest(evt, opts) {
  const o = opts || {};
  const extOrigin = o.extensionOrigin || '';
  const selfKey = (o.selfApiKey != null ? o.selfApiKey : IVA_SELF_INSTRUMENTATION_API_KEY).toLowerCase();
  const url = String(evt.url || '');
  if (selfKey && url.toLowerCase().includes(selfKey)) return true;
  const candidates = [evt.documentURL, evt.frameUrl, evt.initiatorUrl];
  for (const u of candidates) {
    if (extOrigin && urlStartsWithOrigin(u, extOrigin)) return true;
  }
  return false;
}

const REDACTED_HEADER_NAMES = new Set(['cookie', 'set-cookie', 'authorization']);

function redactHarHeaders(headers) {
  if (!Array.isArray(headers)) return [];
  return headers
    .filter((h) => h && h.name && !REDACTED_HEADER_NAMES.has(String(h.name).toLowerCase()))
    .map((h) => ({ name: String(h.name), value: String(h.value != null ? h.value : '') }));
}

function cdpHeadersToHar(headers) {
  if (!headers) return [];
  const out = [];
  if (typeof headers === 'object' && !Array.isArray(headers)) {
    for (const [name, value] of Object.entries(headers)) {
      out.push({ name, value: String(value) });
    }
  }
  return redactHarHeaders(out);
}

function isoFromCdpTimestamp(wallTime, timestamp) {
  if (typeof wallTime === 'number' && wallTime > 0) {
    return new Date(wallTime * 1000).toISOString();
  }
  if (typeof timestamp === 'number') {
    return new Date(timestamp).toISOString();
  }
  return new Date().toISOString();
}

function bucketHarEntries(count) {
  const n = Number(count) || 0;
  if (n === 0) return '0';
  if (n <= 10) return '1-10';
  if (n <= 50) return '11-50';
  if (n <= 200) return '51-200';
  return '200+';
}

/**
 * Build HAR 1.2 from CDP Network.* events collected during a reload capture.
 * @param {Array<{ method: string, params: object }>} events
 * @param {{ pageUrl?: string, creatorName?: string, creatorVersion?: string, comment?: string }} meta
 */
function buildHarFromCdpEvents(events, meta) {
  const m = meta || {};
  const byId = new Map();

  for (const ev of events || []) {
    const method = ev.method;
    const params = ev.params || {};
    const requestId = params.requestId;
    if (!requestId) continue;

    if (method === 'Network.requestWillBeSent') {
      const req = params.request || {};
      byId.set(requestId, {
        requestId,
        startedDateTime: isoFromCdpTimestamp(params.wallTime, params.timestamp),
        request: {
          method: req.method || 'GET',
          url: req.url || '',
          httpVersion: 'HTTP/1.1',
          headers: cdpHeadersToHar(req.headers),
          queryString: [],
          cookies: [],
          headersSize: -1,
          bodySize: req.postData ? String(req.postData).length : 0,
        },
        response: null,
        encodedDataLength: 0,
        failed: null,
        type: params.type || '',
        documentURL: params.documentURL || '',
        initiator: params.initiator || null,
      });
    } else if (method === 'Network.responseReceived') {
      const slot = byId.get(requestId) || { requestId, request: { url: '', method: 'GET', headers: [] } };
      const res = params.response || {};
      slot.response = {
        status: res.status || 0,
        statusText: res.statusText || '',
        httpVersion: res.protocol || 'HTTP/1.1',
        headers: cdpHeadersToHar(res.headers),
        cookies: [],
        content: { size: -1, mimeType: res.mimeType || 'application/octet-stream' },
        redirectURL: '',
        headersSize: -1,
        bodySize: -1,
      };
      if (!slot.request.url) slot.request.url = res.url || '';
      byId.set(requestId, slot);
    } else if (method === 'Network.loadingFinished') {
      const slot = byId.get(requestId);
      if (slot) slot.encodedDataLength = params.encodedDataLength || 0;
    } else if (method === 'Network.loadingFailed') {
      const slot = byId.get(requestId) || { requestId, request: { url: '', method: 'GET', headers: [] } };
      slot.failed = params.errorText || 'loading failed';
      byId.set(requestId, slot);
    }
  }

  const entries = [];
  for (const slot of byId.values()) {
    const url = slot.request.url || '';
    if (!isPendoNetworkUrl(url)) continue;

    const initiatorUrl = slot.initiator && (slot.initiator.url || (slot.initiator.requestId ? '' : ''));
    const frameUrl = slot.documentURL || '';
    if (isSelfInstrumentationRequest({
      url,
      documentURL: slot.documentURL,
      frameUrl,
      initiatorUrl,
    }, { extensionOrigin: m.extensionOrigin, selfApiKey: m.selfApiKey })) continue;

    const wait = 0;
    const receive = 0;
    entries.push({
      startedDateTime: slot.startedDateTime || new Date().toISOString(),
      time: wait + receive,
      request: slot.request,
      response: slot.response || {
        status: slot.failed ? 0 : 0,
        statusText: slot.failed || '',
        httpVersion: 'HTTP/1.1',
        headers: [],
        cookies: [],
        content: { size: slot.encodedDataLength || -1, mimeType: 'application/octet-stream' },
        redirectURL: '',
        headersSize: -1,
        bodySize: slot.encodedDataLength || -1,
      },
      cache: {},
      timings: { blocked: -1, dns: -1, ssl: -1, connect: -1, send: 0, wait, receive },
      comment: slot.failed || undefined,
    });
  }

  entries.sort((a, b) => (a.startedDateTime < b.startedDateTime ? -1 : 1));

  const pageUrl = m.pageUrl || 'about:blank';
  return {
    log: {
      version: '1.2',
      creator: {
        name: m.creatorName || 'Pendo Install Validator',
        version: m.creatorVersion || '1.0',
      },
      comment: m.comment || 'Pendo network requests from validated page (IVA self-instrumentation excluded).',
      pages: [{
        startedDateTime: entries[0]?.startedDateTime || new Date().toISOString(),
        id: 'page_1',
        title: pageUrl,
        pageTimings: { onContentLoad: -1, onLoad: -1 },
      }],
      entries,
    },
  };
}

/**
 * Partial HAR from Performance Resource Timing (no status/headers; no reload).
 * @param {Array<object>} entries - MAIN-world resource timing objects
 * @param {{ pageUrl?: string, creatorName?: string, creatorVersion?: string }} meta
 */
function buildHarFromResourceTimings(entries, meta) {
  const m = meta || {};
  const harEntries = [];

  for (const r of entries || []) {
    const url = r.name || '';
    if (!isPendoNetworkUrl(url)) continue;
    if (isSelfInstrumentationRequest({ url }, { extensionOrigin: m.extensionOrigin, selfApiKey: m.selfApiKey })) continue;

    const duration = typeof r.duration === 'number' ? r.duration : 0;
    const start = typeof r.startTime === 'number' ? r.startTime : 0;
    const timeOrigin = typeof m.timeOrigin === 'number' ? m.timeOrigin : Date.now() - start;
    const startedDateTime = new Date(timeOrigin + start).toISOString();

    harEntries.push({
      startedDateTime,
      time: duration,
      _partial: true,
      request: {
        method: 'GET',
        url,
        httpVersion: 'HTTP/1.1',
        headers: [],
        queryString: [],
        cookies: [],
        headersSize: -1,
        bodySize: -1,
      },
      response: {
        status: 0,
        statusText: '',
        httpVersion: 'HTTP/1.1',
        headers: [],
        cookies: [],
        content: {
          size: typeof r.transferSize === 'number' ? r.transferSize : (r.encodedBodySize || -1),
          mimeType: 'application/octet-stream',
        },
        redirectURL: '',
        headersSize: -1,
        bodySize: typeof r.transferSize === 'number' ? r.transferSize : -1,
      },
      cache: {},
      timings: {
        blocked: -1,
        dns: -1,
        ssl: -1,
        connect: -1,
        send: 0,
        wait: duration,
        receive: 0,
      },
      comment: r.initiatorType ? `initiatorType=${r.initiatorType}` : undefined,
    });
  }

  const pageUrl = m.pageUrl || 'about:blank';
  return {
    log: {
      version: '1.2',
      creator: {
        name: m.creatorName || 'Pendo Install Validator',
        version: m.creatorVersion || '1.0',
      },
      comment: 'Partial HAR from Resource Timing (no reload; status codes unavailable).',
      _partial: true,
      pages: [{
        startedDateTime: harEntries[0]?.startedDateTime || new Date().toISOString(),
        id: 'page_1',
        title: pageUrl,
        pageTimings: { onContentLoad: -1, onLoad: -1 },
      }],
      entries: harEntries,
    },
  };
}
