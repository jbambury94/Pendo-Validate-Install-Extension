/**
 * Pendo Validate — popup script.
 * Runs validation in the active tab (or Pendo Launcher fallback), shows status/advice/logs,
 * and supports export/copy. Render layer is grouped (status hero, quick stats, check groups,
 * identity/metadata cards, logs filter, page snapshot, export menu, toast).
 */

// ========== Pendo visitor ID (persistent UUID in extension storage) ==========
const PENDO_VISITOR_ID_KEY = 'pendoVisitorId';

/** Chrome Web Store extension IDs — Launcher tabs use chrome-extension://<id>/…; URL path rarely matches title/regex-only search. */
const PENDO_LAUNCHER_EXTENSION_IDS = {
  stable: 'epnhoepnmfjdbjjfanpjklemanhkjgil',
  beta: 'pndmgfbnmbbgkikpcnndoeknbmlkhgmj'
};

/** Launcher often has no open tab (toolbar popup only). Detect install via chrome.management when tab search finds nothing. Returns { variant, id } with the real extension ID, or null. */
function detectInstalledPendoLauncherExtension() {
  return new Promise((resolve) => {
    try {
      if (!chrome.management || typeof chrome.management.getAll !== 'function') return resolve(null);
      chrome.management.getAll((exts) => {
        if (chrome.runtime.lastError || !exts) return resolve(null);
        const enabled = exts.filter(e => e.enabled);
        const byBetaId = enabled.find(e => e.id === PENDO_LAUNCHER_EXTENSION_IDS.beta);
        if (byBetaId) return resolve({ variant: 'launcher-beta', id: byBetaId.id });
        const byStableId = enabled.find(e => e.id === PENDO_LAUNCHER_EXTENSION_IDS.stable);
        if (byStableId) return resolve({ variant: 'launcher', id: byStableId.id });
        const launcherNamed = enabled.filter(e => /pendo\s*launcher/i.test(e.name || ''));
        const betaNamed = launcherNamed.find(e => /\bbeta\b/i.test(e.name || ''));
        if (betaNamed) return resolve({ variant: 'launcher-beta', id: betaNamed.id });
        const stableNamed = launcherNamed.find(e => !/\bbeta\b/i.test(e.name || ''));
        if (stableNamed) return resolve({ variant: 'launcher', id: stableNamed.id });
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

/** Get or create a persistent visitor UUID; store in chrome.storage.local and return it. */
function getOrCreateVisitorId() {
  return new Promise((resolve) => {
    try {
      if (!chrome.storage || !chrome.storage.local) {
        resolve(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '');
        return;
      }
      chrome.storage.local.get([PENDO_VISITOR_ID_KEY], (result) => {
        let id = result && result[PENDO_VISITOR_ID_KEY];
        if (!id || typeof id !== 'string') {
          id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '';
          if (id) chrome.storage.local.set({ [PENDO_VISITOR_ID_KEY]: id });
        }
        resolve(id);
      });
    } catch (e) {
      resolve(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '');
    }
  });
}

/** Initialize Pendo with stored visitor UUID (runs as soon as script loads). */
(async function initPendoWithStoredVisitor() {
  const visitorId = await getOrCreateVisitorId();
  if (typeof window.pendo !== 'undefined' && visitorId) {
    window.pendo.initialize({ visitor: { id: visitorId } });
  }
})();

// ========== Misc helpers ==========
function toIso(dt=new Date()) { return dt.toISOString(); }

// ========== Pendo support base URLs (for report links) ==========
/** Support article URLs for report links and advice; keys match supportKey in advice items. */
const PENDO_SUPPORT = {
  installGuide: 'https://support.pendo.io/hc/en-us/articles/360046272771',
  installComponents: 'https://support.pendo.io/hc/en-us/articles/21362607464987-Components-of-the-install-script',
  agentSettings: 'https://support.pendo.io/hc/en-us/articles/360031832152-Pendo-agent-settings',
  identifyVisitors: 'https://support.pendo.io/hc/en-us/articles/22764466082715-Identify-visitors-and-metadata-through-browser-scripting',
  chooseIdsMetadata: 'https://support.pendo.io/hc/en-us/articles/21326198721563-Choose-IDs-and-metadata',
  csp: 'https://support.pendo.io/hc/en-us/articles/360032209131-Content-Security-Policy-CSP',
  spa: 'https://support.pendo.io/hc/en-us/articles/360031862272-Install-Pendo-on-a-single-page-web-application',
  helpCenter: 'https://support.pendo.io/hc/en-us',
  technicalSupport: 'https://support.pendo.io/hc/en-us/articles/360034163971-Get-help-with-Pendo-from-Technical-Support',
  gtm: 'https://support.pendo.io/hc/en-us/articles/360032201711',
  segment: 'https://support.pendo.io/hc/en-us/articles/360031870352',
  iframe: 'https://support.pendo.io/hc/en-us/articles/17606930575387',
  multiDomain: 'https://support.pendo.io/hc/en-us/articles/14090652290587',
  sandbox: 'https://support.pendo.io/hc/en-us/articles/360031862352',
  agentDebug: 'https://support.pendo.io/hc/en-us/articles/360034229512',
  configureMetadata: 'https://support.pendo.io/hc/en-us/articles/360031832072',
  signedMetadata: 'https://support.pendo.io/hc/en-us/articles/360039616892',
  hostnameAllowlist: 'https://support.pendo.io/hc/en-us/articles/16101373319707',
  launcherPlan: 'https://support.pendo.io/hc/en-us/articles/21163862516507',
  troubleshooting: 'https://support.pendo.io/hc/en-us/articles/10033806003483'
};

/** Friendly labels for documentation links shown next to check items. */
const SUPPORT_LABELS = {
  installGuide: 'Install guide',
  installComponents: 'Snippet components',
  agentSettings: 'Pendo agent settings',
  identifyVisitors: 'Identify visitors & metadata',
  chooseIdsMetadata: 'Choose IDs & metadata',
  csp: 'Content Security Policy',
  spa: 'SPA install guide',
  helpCenter: 'Pendo Help Center',
  technicalSupport: 'Pendo Technical Support',
  gtm: 'Google Tag Manager install',
  segment: 'Twilio Segment install',
  iframe: 'Iframe install options',
  multiDomain: 'Multi-domain install',
  sandbox: 'Dev & testing environments',
  agentDebug: 'Web SDK debugger',
  configureMetadata: 'Configure metadata',
  signedMetadata: 'Signed metadata (JWT)',
  hostnameAllowlist: 'Hostname allowlist',
  launcherPlan: 'Launcher planning guide',
  troubleshooting: 'Pendo not displaying'
};

/** supportKeys that indicate an error-severity advice item (blocking install/snippet/agent issues). */
const ERR_SUPPORT_KEYS = new Set(['installGuide', 'installComponents', 'agentSettings']);

// ========== Advice normalization ==========
/** Normalize advice items to { text, source, supportUrl, supportKey, relatedSupportUrls } and filter empty. Resolves supportKey (and optional supportKeys array) to URLs. */
function normalizeAdviceList(advice = []) {
  return advice.map(a => {
    let text, source, supportUrl, supportKey, relatedSupportUrls = [];
    if (typeof a === 'string') { text = a; source = 'builtin'; supportUrl = PENDO_SUPPORT.helpCenter; supportKey = null; }
    else if (a && typeof a === 'object') {
      text = a.text || '';
      source = a.source || 'builtin';
      supportKey = a.supportKey || null;
      supportUrl = a.supportUrl || (supportKey && PENDO_SUPPORT[supportKey]) || (source === 'ai' ? PENDO_SUPPORT.technicalSupport : PENDO_SUPPORT.helpCenter);
      if (Array.isArray(a.supportKeys)) {
        for (const k of a.supportKeys) {
          if (k === supportKey) continue;
          const url = PENDO_SUPPORT[k];
          if (url) relatedSupportUrls.push({ url, label: SUPPORT_LABELS[k] || k });
        }
      }
    } else { text = String(a); source = 'builtin'; supportUrl = PENDO_SUPPORT.helpCenter; supportKey = null; }
    return { text, source, supportUrl, supportKey, relatedSupportUrls };
  }).filter(a => a.text);
}

// ========== Related reading selection ==========
/**
 * Map validation signals to KB topics, then return the most relevant
 * knowledge-base entries via findKbByTopics (from pendo-kb.js).
 * @param {object} signals - validation result fields used for topic inference
 * @param {number} [max=6]
 * @returns {Array} KB entries (empty when pendo-kb.js is not loaded)
 */
function selectRelatedReading(signals, max) {
  if (typeof findKbByTopics !== 'function') return [];
  if (!signals) return [];
  if (max === undefined || max === null) max = 6;
  const topics = [];
  if (!signals.pendoPresent)                       topics.push('install', 'snippet', 'troubleshooting');
  if (signals.pendoPresent && !signals.validatePresent) topics.push('agent', 'troubleshooting');
  if (!signals.visitorId)                          topics.push('identity');
  if (signals.accountId == null)                   topics.push('identity', 'account');
  if (!signals.hasVisitorMeta)                     topics.push('metadata');
  if (!signals.hasAccountMeta && signals.hasVisitorMeta) topics.push('metadata', 'account');
  if (signals.cspIssue)                            topics.push('csp', 'security', 'network');
  if (signals.noResourceHits && signals.pendoPresent)  topics.push('network', 'csp');
  if (signals.isSpa)                               topics.push('spa');
  if (signals.frameworkHint)                        topics.push('spa', 'framework-' + signals.frameworkHint);
  if (signals.isIframe)                            topics.push('iframe');
  if (signals.hasGtm)                              topics.push('gtm', 'tag-manager');
  if (signals.hasSegment)                          topics.push('segment', 'tag-manager');
  if (signals.isSandbox)                           topics.push('sandbox', 'testing');
  if (signals.launcherPresent)                     topics.push('launcher');
  if (signals.agentVersionOld)                     topics.push('agent', 'configuration');
  if (signals.apiKeyMissing)                       topics.push('api-key', 'install');
  return findKbByTopics(topics, max);
}

// ========== Report building and download ==========
/** Build a single human-readable Markdown report: overview, metadata, errors (with support links), advice (with support links), captured output. */
function buildMarkdownReport(context) {
  const { pageUrl, timestamp, status, captured, advice, checks, cspMeta, apiKeyFound, origin, snippetOnPage, launcherPresent, launcherAttempted, launcherDataValidated, validatedIn, launcherUrl } = context;
  const adviceList = normalizeAdviceList(advice || []);
  const errors = (captured || []).filter(l => l.level === 'error');
  const hasError = errors.length > 0 || (context.hasError === true);
  const hasWarn = (captured || []).some(l => l.level === 'warn') || (context.hasWarn === true);
  let statusLine = 'Looks healthy';
  if (!status.pendoPresent) statusLine = 'Pendo not found';
  else if (!status.validatePresent) statusLine = 'No validateInstall()';
  else if (hasError) statusLine = 'Errors found';
  else if (hasWarn) statusLine = 'Warnings found';
  const effectiveOrigin = validatedIn || origin;
  if (effectiveOrigin === 'launcher') statusLine += ' (via Pendo Launcher)';
  else if (effectiveOrigin === 'launcher-beta') statusLine += ' (via Pendo Launcher Beta)';

  const lines = [];
  lines.push(`# Pendo Validate Report`);
  lines.push("");
  lines.push(`Share this file with support or use the links below for official Pendo guidance.`);
  lines.push("");
  lines.push(`- **Page URL:** ${pageUrl}`);
  if (validatedIn === 'launcher' || validatedIn === 'launcher-beta') {
    lines.push(`- **Validated in URL:** ${launcherUrl || '—'}`);
  }
  lines.push(`- **Timestamp:** ${timestamp}`);
  lines.push(`- **Status:** ${statusLine}`);
  lines.push("");
  lines.push(`## Metadata`);
  const meta = {
    pageUrl,
    timestamp,
    snippetOnPage: !!snippetOnPage,
    launcherPresent: launcherAttempted ? !!launcherPresent : undefined,
    launcherDataValidated: launcherAttempted ? !!launcherDataValidated : undefined,
    launcherAttempted: !!launcherAttempted,
    validatedIn: validatedIn || origin || 'page',
    pendoPresent: status.pendoPresent,
    validateInstallPresent: status.validatePresent,
    agentVersion: status.version || 'unknown',
    apiKeyFound: !!apiKeyFound,
    detectedApiKey: status.detectedApiKey || 'unknown',
    visitorId: status.visitorId || 'not set',
    accountId: status.accountId == null ? 'not set' : status.accountId,
    resourceHitCount: (status.resourceHits && status.resourceHits.length) || 0,
    capturedLineCount: (captured && captured.length) || 0
  };
  if (status.visitorMetadata) meta.visitorMetadata = status.visitorMetadata;
  if (status.accountMetadata) meta.accountMetadata = status.accountMetadata;
  if (status.resourceHits && status.resourceHits.length) {
    meta.observedPendoResources = status.resourceHits.map(r => ({ initiatorType: r.initiatorType || 'resource', name: r.name }));
  }
  if (cspMeta) meta.cspMeta = cspMeta;
  if (launcherUrl) meta.validatedInUrl = launcherUrl;
  lines.push("```json");
  lines.push(JSON.stringify(meta, null, 2));
  lines.push("```");
  lines.push("");

  lines.push(`## Errors`);
  if (errors.length === 0 && !hasError) {
    lines.push(`No errors detected.`);
  } else {
    errors.forEach(l => {
      lines.push(`- ${l.text} — [Pendo Help: Installation & troubleshooting](${PENDO_SUPPORT.installGuide})`);
    });
    if (errors.length === 0 && hasError) {
      lines.push(`- Validation reported issues. See Advice and Captured Output below. — [Pendo Help Center](${PENDO_SUPPORT.helpCenter})`);
    }
  }
  lines.push("");

  lines.push(`## Advice`);
  if (checks && checks.length) {
    lines.push(`### Checks passed`);
    checks.forEach(c => lines.push(`- ${c}`));
    lines.push("");
  }
  if (adviceList.length) {
    lines.push(`### Recommendations`);
    adviceList.forEach(a => {
      const prefix = a.source === 'ai' ? '[AI] ' : '';
      lines.push(`- ${prefix}${a.text} — [Pendo Help](${a.supportUrl})`);
    });
  }
  if (!adviceList.length && (!checks || !checks.length)) lines.push(`No advice items.`);
  lines.push("");

  if (typeof selectRelatedReading === 'function') {
    const signals = {
      pendoPresent: status.pendoPresent,
      validatePresent: status.validatePresent,
      visitorId: status.visitorId,
      accountId: status.accountId,
      cspIssue: adviceList.some(a => a.supportKey === 'csp'),
      noResourceHits: status.resourceHits && status.resourceHits.length === 0,
      apiKeyMissing: !apiKeyFound,
    };
    const reading = selectRelatedReading(signals, 6);
    if (reading && reading.length) {
      lines.push(`## Related reading`);
      reading.forEach(r => lines.push(`- [${r.title}](${r.url})`));
      lines.push("");
    }
  }

  lines.push(`## Captured Output`);
  if (!captured || !captured.length) lines.push(`No output captured.`);
  else captured.forEach(l => lines.push(`- [${l.level}] ${l.text}`));
  lines.push("");
  return lines.join("\n");
}
/** Serialize full context as pretty-printed JSON (still used by some report flows). */
function buildJsonReport(context) { return JSON.stringify(context, null, 2); }

/** Build a plain-text summary suitable for clipboard (status + counts + advice + checks). */
function buildPlainSummary(context) {
  const { pageUrl, timestamp, status, captured, advice, checks, snippetOnPage, launcherPresent, launcherAttempted, launcherDataValidated, validatedIn } = context;
  const errCount = (captured || []).filter(l => l.level === 'error').length;
  const warnCount = (captured || []).filter(l => l.level === 'warn').length;
  const okCount = (checks || []).length;
  let statusLine = 'Looks healthy';
  if (!snippetOnPage && launcherAttempted && launcherPresent === false) statusLine = 'Pendo not found (snippet and Launcher)';
  else if (!snippetOnPage && launcherPresent === true && launcherDataValidated === false) statusLine = 'Launcher installed (no data on this tab)';
  else if (!status.pendoPresent) statusLine = 'Pendo not found';
  else if (!status.validatePresent) statusLine = 'No validateInstall()';
  else if (errCount > 0) statusLine = 'Errors found';
  else if (warnCount > 0) statusLine = 'Warnings found';

  const lines = [];
  lines.push(`Pendo Validate — ${statusLine}`);
  lines.push(`Page: ${pageUrl || 'unknown'}`);
  lines.push(`Timestamp: ${timestamp}`);
  lines.push(`Validated in: ${validatedIn || 'page'}`);
  lines.push(`Errors: ${errCount}   Warnings: ${warnCount}   Passing: ${okCount}`);
  lines.push('');
  if (checks && checks.length) {
    lines.push('Passing:');
    checks.forEach(c => lines.push(`  • ${c}`));
    lines.push('');
  }
  const adviceList = normalizeAdviceList(advice || []);
  if (adviceList.length) {
    lines.push('Recommendations:');
    adviceList.forEach(a => {
      const prefix = a.source === 'ai' ? '[AI] ' : '';
      lines.push(`  • ${prefix}${a.text}`);
    });
  }
  return lines.join('\n');
}

/** Trigger browser download of a blob (report file). */
function downloadBlob(filename, mime, text) {
  const blob = new Blob([text], {type: mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

// ========== Pendo debugger / VDS (run in page via executeScript) ==========
function enableDebuggingInPage() {
  const pendo = (typeof window !== 'undefined' && (window.pendo || window.Pendo)) || null;
  if (!pendo || typeof pendo.enableDebugging !== 'function') return { ok: false, message: 'Pendo not found or enableDebugging not available on this page.' };
  try {
    pendo.enableDebugging();
    return { ok: true };
  } catch (e) { return { ok: false, message: (e && e.message) || String(e) }; }
}

// ========== Page validation: inject and run in tab ==========
/**
 * Three-phase validation:
 *   1. Run in active tab — checks window.pendo (standard snippet).
 *   1.5. If no snippet, re-run in same tab — checks window.Pendo (Launcher-injected agent).
 *   2. If still absent, search other open tabs for a web-based Pendo Launcher window and run there.
 * Returns: pageUrl (always the active tab URL), snippetOnPage, launcherPresent, launcherAttempted, validatedIn, launcherUrl (optional), plus status/captured/advice/checks.
 */
async function runInPage() {
  /** Runs in the page context (or Launcher). Phases: capture console → resolve agent/validate fn → run validateInstall → build status/advice/checks. */
  function captureAndInspect(variant = 'page') {
    const captured = [];
    const original = { log: console.log, warn: console.warn, error: console.error, info: console.info };
    function push(level, args) {
      try {
        const text = Array.from(args).map(a => {
          try {
            if (typeof a === 'string') return a;
            if (a instanceof Error) return a.stack || a.message || String(a);
            if (typeof a === 'function') return a.toString();
            return JSON.stringify(a);
          } catch { return String(a); }
        }).join(' ');
        captured.push({ level, text });
      } catch {}
    }
    console.log = (...a) => { push('log', a); original.log(...a); };
    console.warn = (...a) => { push('warn', a); original.warn(...a); };
    console.error = (...a) => { push('error', a); original.error(...a); };
    console.info = (...a) => { push('info', a); original.info(...a); };

    // window.Pendo (capital P) is the Launcher-specific global; window.pendo is the standard snippet.
    const isLauncher = variant === 'launcher' || variant === 'launcher-beta';
    let agent, pendoGlobal;
    if (isLauncher) {
      if (window && window.Pendo) { agent = window.Pendo; pendoGlobal = 'Pendo'; }
      else if (window && window.pendo) { agent = window.pendo; pendoGlobal = 'pendo'; }
      else { agent = null; pendoGlobal = null; }
    } else {
      agent = (window && window.pendo) || null;
      pendoGlobal = agent ? 'pendo' : null;
    }
    const validateFn = (agent && agent.validateInstall) || null;

    const status = {
      pendoPresent: !!agent,
      pendoGlobal,
      validatePresent: typeof validateFn === 'function',
      version: null,
      detectedApiKey: null,
      visitorId: null,
      accountId: null,
      visitorMetadata: null,
      accountMetadata: null,
      resourceHits: []
    };

    function extractKeyFromUrl(url) {
      try {
        const m = url.match(/agent\/(?:static|production|beta)\/([a-f0-9\-]{8,})/i);
        if (m) return m[1];
      } catch {}
      return null;
    }

    try {
      if (status.pendoPresent) {
        status.version = (agent.getVersion && agent.getVersion()) || agent.VERSION || null;
        const opt = (agent._ && (agent._.options || agent._.apiKey)) || null;
        if (opt && typeof opt === 'object' && opt.apiKey) status.detectedApiKey = opt.apiKey;
        if (typeof agent.apiKey === 'string') status.detectedApiKey = agent.apiKey;
        const state = agent && agent._ && agent._.state;
        if (state && state.visitorId) status.visitorId = state.visitorId;
        if (state && state.accountId) status.accountId = state.accountId;
        if (!status.visitorId && agent.getVisitorId) { try { status.visitorId = agent.getVisitorId(); } catch {} }
        if (!status.accountId && agent.getAccountId) { try { status.accountId = agent.getAccountId(); } catch {} }

        function safeCloneFields(src, maxKeys, maxLen) {
          if (!src || typeof src !== 'object') return null;
          try {
            const keys = Object.keys(src).slice(0, maxKeys || 50);
            if (!keys.length) return null;
            const out = {};
            for (const k of keys) {
              const v = src[k];
              if (v === undefined || typeof v === 'function') continue;
              const s = typeof v === 'string' ? v : JSON.stringify(v);
              out[k] = s && s.length > (maxLen || 500) ? s.slice(0, maxLen || 500) + '…' : v;
            }
            return Object.keys(out).length ? out : null;
          } catch { return null; }
        }
        // Newer Pendo agents (v2.3xx) expose visitor/account metadata via
        // pendo.getSerializedMetadata(). Older agents stored it on agent._.options
        // or agent._.state. In newer agents, agent._ is the underscore.js library
        // (a function), so the legacy paths return undefined.
        let serialized = null;
        try {
          if (typeof agent.getSerializedMetadata === 'function') {
            serialized = agent.getSerializedMetadata();
          }
        } catch {}
        const opts = agent._ && typeof agent._ === 'object' ? agent._.options : null;
        const legacyState = agent._ && typeof agent._ === 'object' ? agent._.state : null;
        const visitorSrc = (serialized && serialized.visitor) || (opts && opts.visitor) || (legacyState && legacyState.visitor);
        const accountSrc = (serialized && serialized.account) || (opts && opts.account) || (legacyState && legacyState.account);
        status.visitorMetadata = safeCloneFields(visitorSrc);
        status.accountMetadata = safeCloneFields(accountSrc);
      }
    } catch {}

    try {
      const res = performance.getEntriesByType('resource') || [];
      res.forEach(r => {
        const name = r.name || "";
        if (/pendo(io)?\.com|pendo\.io|cdn\.pendo|pendo-io/.test(name) || /agent\/(static|production)/.test(name)) {
          status.resourceHits.push({ name, initiatorType: r.initiatorType || "unknown" });
          if (!status.detectedApiKey) {
            const k = extractKeyFromUrl(name);
            if (k) status.detectedApiKey = k;
          }
        }
      });
    } catch {}

    let cspMeta = "";
    try {
      const metas = document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]');
      cspMeta = Array.from(metas).map(m => m.getAttribute('content') || '').join(' | ');
    } catch {}

    try {
      if (status.validatePresent) {
        try {
          validateFn.call(agent);
        } catch (e) {
          captured.push({ level: 'error', text: e && e.message ? e.message : String(e) });
        }
      } else if (isLauncher) {
        captured.push({ level: 'warn', text: 'Pendo Launcher found but validateInstall() is unavailable.' });
      }
    } catch (e) {
      captured.push({ level: 'error', text: e && e.message ? e.message : String(e) });
    } finally {
      console.log = original.log; console.warn = original.warn;
      console.error = original.error; console.info = original.info;
    }

    const all = captured.map(m => m.text).join('\n');
    const keyRegex = /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i;
    const apiKeyFound = keyRegex.test(all) || !!status.detectedApiKey;

    const hasError = captured.some(m => m.level === 'error' || /error|failed|not found|blocked/i.test(m.text));
    const hasWarn = captured.some(m => m.level === 'warn' || /warn|missing|no visitor|not initiali[sz]ed/i.test(m.text));

    const advice = [];
    const checks = [];

    if (!status.pendoPresent) {
      advice.push({ text: "Pendo agent not detected. Ensure the snippet is installed and loads on this URL. Verify CSP and network allow Pendo domains.", source: 'builtin', supportKey: 'installGuide' });
    } else if (!status.validatePresent) {
      advice.push({ text: "Pendo found, but validateInstall() is unavailable. The agent may be customised or outdated. Update to a supported agent.", source: 'builtin', supportKey: 'agentSettings' });
    }

    if (apiKeyFound) checks.push("API key found in output or agent data.");
    else advice.push({ text: "No API key detected. Verify the correct agent is loading and that the snippet references your subscription key.", source: 'builtin', supportKey: 'installComponents' });

    if (status.pendoPresent) {
      if (!status.visitorId) advice.push({ text: "Visitor identity is not set. Call pendo.initialize with a visitorId after authentication.", source: 'builtin', supportKey: 'identifyVisitors' });
      else checks.push("visitorId present.");
      if (status.accountId == null) advice.push({ text: "accountId not found. If you use accounts, provide accountId in pendo.initialize.", source: 'builtin', supportKey: 'identifyVisitors' });
      else checks.push("accountId present.");
      const hasFieldsBeyondId = (meta) => !!meta && typeof meta === 'object' && Object.keys(meta).some(k => k !== 'id');
      if (hasFieldsBeyondId(status.visitorMetadata)) checks.push("Visitor metadata fields detected.");
      if (hasFieldsBeyondId(status.accountMetadata)) checks.push("Account metadata fields detected.");
      if (status.visitorId && !hasFieldsBeyondId(status.visitorMetadata)) {
        advice.push({ text: "No visitor metadata fields detected beyond the ID. Consider passing name, email, and role for better segmentation.", source: 'builtin', supportKey: 'chooseIdsMetadata' });
      }
    }

    const needsDomains = ["pendo.io", "cdn.pendo.io", "data.pendo.io"];
    if (cspMeta) {
      const lc = cspMeta.toLowerCase();
      needsDomains.forEach(d => {
        if (!lc.includes(d)) {
          advice.push({ text: `CSP meta tag may be missing '${d}'. Ensure script-src and connect-src allow required Pendo domains.`, source: 'builtin', supportKey: 'csp' });
        }
      });
    } else if (/content security policy|refused to connect|blocked by csp/i.test(all)) {
      advice.push({ text: "CSP is blocking Pendo. Add required Pendo domains to script-src and connect-src.", source: 'builtin', supportKey: 'csp' });
    }

    if (status.resourceHits.length === 0 && status.pendoPresent) {
      advice.push({ text: "No Pendo network resources observed. If using a deferred or self-hosted setup, ensure agent requests are not blocked.", source: 'builtin', supportKey: 'spa' });
    }

    // --- Extended detection signals (additive) ---
    try {
      if (status.pendoPresent && status.resourceHits.length > 0) {
        const hitNames = status.resourceHits.map(r => (r.name || '').toLowerCase());
        if (!hitNames.some(n => n.includes('data.pendo.io'))) {
          advice.push({ text: "No requests to data.pendo.io observed. Analytics data may not be reaching Pendo. Check CSP connect-src and network filters.", source: 'builtin', supportKey: 'csp', supportKeys: ['csp', 'hostnameAllowlist'] });
        }
      }
      const isIframe = (typeof window !== 'undefined') && window.top !== window;
      if (isIframe) {
        advice.push({ text: "Page is running inside an iframe. Ensure the Pendo snippet is installed in this frame with matching API key and IDs.", source: 'builtin', supportKey: 'iframe' });
      }
      const pageHref = (typeof location !== 'undefined' && location.href) || '';
      if (/\b(staging|preview|dev\.|qa\.)/i.test(pageHref)) {
        advice.push({ text: "This appears to be a staging or development environment. Use unique Visitor/Account ID prefixes and configure an Exclude List to keep test data separate.", source: 'builtin', supportKey: 'sandbox' });
      }
      if (typeof window !== 'undefined' && window.google_tag_manager) {
        checks.push("Google Tag Manager detected.");
        if (!status.pendoPresent) {
          advice.push({ text: "Google Tag Manager is present but Pendo was not found. If installing Pendo via GTM, check your Custom HTML tag fires on all pages.", source: 'builtin', supportKey: 'gtm' });
        }
      }
      if (typeof window !== 'undefined' && window.utag) {
        checks.push("Tealium iQ (utag) detected.");
      }
      const spaGlobals = typeof window !== 'undefined'
        ? { react: !!window.React || !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__, vue: !!window.Vue || !!window.__VUE__, angular: !!window.angular || !!window.ng, next: !!window.next || !!window.__NEXT_DATA__, nuxt: !!window.__NUXT__ }
        : {};
      const detectedFramework = spaGlobals.react ? 'react' : spaGlobals.vue ? 'vue' : spaGlobals.angular ? 'angular' : spaGlobals.next ? 'next' : spaGlobals.nuxt ? 'nuxt' : null;
      if (detectedFramework) {
        checks.push(`SPA framework detected: ${detectedFramework}.`);
      }
      if (status.pendoPresent && status.version) {
        const minVersion = (typeof PENDO_KB_MIN_AGENT_VERSION !== 'undefined') ? PENDO_KB_MIN_AGENT_VERSION : '2.17.0';
        const curr = String(status.version).split('.').map(Number);
        const min = String(minVersion).split('.').map(Number);
        const outdated = (curr[0] < min[0]) || (curr[0] === min[0] && curr[1] < min[1]) || (curr[0] === min[0] && curr[1] === min[1] && (curr[2] || 0) < (min[2] || 0));
        if (outdated) {
          advice.push({ text: `Agent version ${status.version} is older than the recommended minimum (${minVersion}). Consider updating to access recent fixes and features.`, source: 'builtin', supportKey: 'agentSettings', supportKeys: ['agentSettings', 'agentDebug'] });
        }
      }
      if (status.pendoPresent && status.visitorId) {
        const hasVFields = status.visitorMetadata && typeof status.visitorMetadata === 'object' && Object.keys(status.visitorMetadata).some(k => k !== 'id');
        const hasAFields = status.accountMetadata && typeof status.accountMetadata === 'object' && Object.keys(status.accountMetadata).some(k => k !== 'id');
        if (hasVFields && !hasAFields && status.accountId != null) {
          advice.push({ text: "Visitor metadata is populated but account metadata is empty. Consider passing account-level fields (name, plan, industry) for richer segmentation.", source: 'builtin', supportKey: 'configureMetadata', supportKeys: ['configureMetadata', 'chooseIdsMetadata'] });
        }
      }
    } catch {}

    if (status.validatePresent && !hasError && !hasWarn && captured.length > 0) {
      checks.push("validateInstall() produced no warnings or errors.");
    }

    if (advice.length === 0 && checks.length > 0) checks.push("Installation looks healthy based on current checks.");
    else if (advice.length === 0) advice.push({ text: "Review the output below and compare with a known-good page. Check initialise timing and data mapping.", source: 'builtin', supportKey: 'spa' });

    if (variant === 'launcher') {
      captured.unshift({ level: 'info', text: 'Validated via Pendo Launcher window.' });
    } else if (variant === 'launcher-beta') {
      captured.unshift({ level: 'info', text: 'Validated via Pendo Launcher (Beta) window.' });
    }

    return { status, captured, advice, checks, cspMeta, apiKeyFound, hasError, hasWarn };
  }

  /**
   * Use the Chrome DevTools Protocol (chrome.debugger) to run captureAndInspect
   * inside the Pendo Launcher extension's content-script isolated world.
   */
  async function runValidationInLauncherWorld(tabId, launcher) {
    const target = { tabId };
    const launcherId = launcher.id;
    const expectedOrigin = `chrome-extension://${launcherId}`;

    try {
      await chrome.debugger.attach(target, '1.3');
    } catch (e) {
      return null;
    }

    try {
      const contexts = [];
      const handler = (source, method, params) => {
        if (source.tabId === tabId && method === 'Runtime.executionContextCreated') {
          contexts.push(params.context);
        }
      };
      chrome.debugger.onEvent.addListener(handler);
      await chrome.debugger.sendCommand(target, 'Runtime.enable');
      // CDP delivers all existing executionContextCreated events after Runtime.enable;
      // a brief yield lets the event queue flush before we read the collected contexts.
      await new Promise(r => setTimeout(r, 60));
      chrome.debugger.onEvent.removeListener(handler);

      const launcherCtx = contexts.find(ctx =>
        (ctx.origin || '').toLowerCase() === expectedOrigin
      );
      if (!launcherCtx) return null;

      const variant = launcher.variant;
      const expression = `(${captureAndInspect.toString()})('${variant}')`;

      const evalResult = await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
        expression,
        contextId: launcherCtx.id,
        returnByValue: true
      });

      if (evalResult?.result?.value) {
        return { result: evalResult.result.value, variant };
      }
      return null;
    } finally {
      try { await chrome.debugger.detach(target); } catch {}
    }
  }

  const EMPTY_RESULT = {
    status: { pendoPresent: false, validatePresent: false, version: null, detectedApiKey: null, visitorId: null, accountId: null, visitorMetadata: null, accountMetadata: null, resourceHits: [] },
    captured: [], advice: [], checks: [], cspMeta: '', apiKeyFound: false, hasError: true, hasWarn: false
  };

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error('No active tab found.');
  const [{ result: pageResult }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: captureAndInspect
  });

  const snippetOnPage = !!(pageResult && pageResult.status && pageResult.status.pendoPresent);
  const basePageUrl = tab && tab.url ? tab.url : 'unknown';

  // Phase 1.5: Always check for the Launcher in the same tab. Launcher and snippet can coexist.
  let launcherInPageResult = null;
  try {
    const [{ result: p15result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: captureAndInspect,
      args: ['launcher']
    });
    if (p15result && p15result.status && p15result.status.pendoPresent) {
      if (!snippetOnPage || p15result.status.pendoGlobal === 'Pendo') {
        launcherInPageResult = p15result;
      }
    }
  } catch (e) {
    console.warn('Phase 1.5 launcher-in-page check failed:', e);
  }
  const launcherInPage = launcherInPageResult !== null;

  if (snippetOnPage) {
    return {
      ...pageResult,
      pageUrl: basePageUrl,
      snippetOnPage: true,
      launcherAttempted: true,
      launcherPresent: launcherInPage,
      launcherDataValidated: false,
      validatedIn: 'page',
      origin: 'page'
    };
  }

  if (launcherInPage) {
    const lStatus = launcherInPageResult.status;
    const launcherDataValidated = !!(lStatus.pendoPresent && lStatus.validatePresent && (lStatus.visitorId || lStatus.visitorMetadata));
    return {
      ...launcherInPageResult,
      pageUrl: basePageUrl,
      snippetOnPage: false,
      launcherAttempted: true,
      launcherPresent: true,
      launcherDataValidated,
      validatedIn: 'launcher',
      launcherUrl: basePageUrl,
      origin: 'launcher'
    };
  }

  // Phase 1.75: Launcher extension installed — use chrome.debugger (CDP) to run
  // validation inside the Launcher's content-script isolated world.
  const installedLauncher = await detectInstalledPendoLauncherExtension();

  if (installedLauncher) {
    const cdpResult = await runValidationInLauncherWorld(tab.id, installedLauncher);
    if (cdpResult && cdpResult.result && cdpResult.result.status && cdpResult.result.status.pendoPresent) {
      const lStatus = cdpResult.result.status;
      const launcherDataValidated = !!(lStatus.pendoPresent && lStatus.validatePresent && (lStatus.visitorId || lStatus.visitorMetadata));
      return {
        ...cdpResult.result,
        pageUrl: basePageUrl,
        snippetOnPage: false,
        launcherAttempted: true,
        launcherPresent: true,
        launcherDataValidated,
        validatedIn: cdpResult.variant,
        launcherUrl: basePageUrl,
        origin: cdpResult.variant
      };
    }

    const base = pageResult || EMPTY_RESULT;
    base.captured = (base.captured || []).concat([
      { level: 'warn', text: 'Pendo Launcher extension is installed but its agent is not active on this tab. Open the application where the Launcher is configured to inject Pendo, then re-run validation from that tab.' }
    ]);
    base.advice = (base.advice || []).concat([
      { text: 'Navigate to the application where the Pendo Launcher is configured, then re-run validation. The Launcher must inject its agent into the page before data can be validated.', source: 'builtin', supportKey: 'installGuide' }
    ]);
    return {
      ...base,
      pageUrl: basePageUrl,
      snippetOnPage: false,
      launcherAttempted: true,
      launcherPresent: true,
      launcherDataValidated: false,
      validatedIn: 'page',
      origin: 'page'
    };
  }

  const base = pageResult || EMPTY_RESULT;
  base.captured = (base.captured || []).concat([
    { level: 'info', text: 'Pendo snippet not found and Pendo Launcher extension is not installed.' }
  ]);
  return {
    ...base,
    pageUrl: basePageUrl,
    snippetOnPage: false,
    launcherAttempted: true,
    launcherPresent: false,
    launcherDataValidated: false,
    validatedIn: 'page',
    origin: 'page'
  };
}

// ========== AI advice (optional) ==========
/** Read AI config from chrome.storage.local: aiEndpoint, aiApiKey, aiModel. Used for optional ChatGPT-powered advice. */
async function getAiConfig() {
  return new Promise(resolve => {
    try {
      if (!chrome.storage || !chrome.storage.local) return resolve({});
      chrome.storage.local.get({ aiProvider: 'openai', aiEndpoint: '', aiClaudeEndpoint: '', aiApiKey: '', aiModel: '' }, resolve);
    } catch (e) {
      console.error(e);
      resolve({});
    }
  });
}

/** Build prompt for AI from validation context (URL, status, logs, CSP). */
function buildAiPrompt(context) {
  const lines = [];
  lines.push('You are a Pendo installation assistant. Suggest concise, actionable remediation steps.');
  lines.push('Base your guidance solely on official Pendo sources (pendo.io domains such as support.pendo.io, help.pendo.io, academy.pendo.io). If unsure, say so.');
  lines.push(`Page URL: ${context.pageUrl}`);
  lines.push(`Agent version: ${context.status.version || 'unknown'}`);
  lines.push(`validateInstall available: ${context.status.validatePresent}`);
  lines.push(`Pendo present: ${context.status.pendoPresent}`);
  lines.push(`API key detected: ${context.status.detectedApiKey || 'unknown'}`);
  lines.push(`API key found flag: ${context.apiKeyFound}`);
  lines.push(`VisitorId: ${context.status.visitorId || 'not set'}`);
  lines.push(`AccountId: ${context.status.accountId == null ? 'not set' : context.status.accountId}`);
  lines.push(`CSP meta: ${context.cspMeta || 'none'}`);
  lines.push('Captured logs (level:message):');
  const trimmed = (context.captured || []).slice(0, 30);
  trimmed.forEach(l => lines.push(`[${l.level}] ${l.text}`));
  if ((context.captured || []).length > trimmed.length) lines.push('...truncated...');

  if (typeof selectRelatedReading === 'function') {
    const signals = {
      pendoPresent: context.status.pendoPresent,
      validatePresent: context.status.validatePresent,
      visitorId: context.status.visitorId,
      accountId: context.status.accountId,
      cspIssue: !!(context.cspMeta || '').length || (context.captured || []).some(l => /csp|content.security/i.test(l.text)),
      noResourceHits: context.status.resourceHits && context.status.resourceHits.length === 0,
      apiKeyMissing: !context.apiKeyFound,
    };
    const kbEntries = selectRelatedReading(signals, 6);
    if (kbEntries && kbEntries.length) {
      lines.push('');
      lines.push('Reference excerpts from official Pendo documentation (cite these where applicable; do not invent URLs):');
      let charBudget = 800;
      for (const entry of kbEntries) {
        if (charBudget <= 0) break;
        const block = `- ${entry.title} (${entry.url}): ${entry.bullets.slice(0, 3).join('; ')}`;
        lines.push(block);
        charBudget -= block.length;
      }
    }
  }

  lines.push('Respond with a short bullet list of concrete fixes.');
  return lines.join('\n');
}

/** Rewrite known provider errors into clearer guidance (e.g. Anthropic org blocks browser API). */
function friendlyAiFailureDetail(provider, rawDetail) {
  const s = String(rawDetail || '');
  if (provider === 'claude' && /cors requests are not allowed for this organization/i.test(s)) {
    return 'Anthropic returned an organization policy error: client-side (browser) API access is disabled for your workspace, and Chrome extensions are treated as client-side. Use OpenAI or Google Gemini in Settings, use an API key from a workspace that allows browser access, ask an Anthropic org admin to update that policy, or set storage key aiClaudeEndpoint to an HTTPS URL of a proxy you run that forwards to Anthropic’s Messages API (same request/response shape as /v1/messages).';
  }
  return null;
}

/** Call configured AI API for remediation suggestions; returns array of { text, source: 'ai' }. */
async function requestAiAdvice(context) {
  const cfg = await getAiConfig();
  const apiKey = String((cfg && cfg.aiApiKey) || '').trim();
  if (!apiKey) return [];

  const provider = cfg.aiProvider || 'openai';
  const prompt = buildAiPrompt(context);
  const systemMsg = 'You are a concise Pendo install troubleshooting assistant. Only rely on official Pendo documentation and avoid speculative advice.';

  let endpoint, headers, body;

  if (provider === 'claude') {
    const model = cfg.aiModel || 'claude-haiku-4-5-20251001';
    const claudeUrl = String((cfg && cfg.aiClaudeEndpoint) || '').trim();
    endpoint = claudeUrl || 'https://api.anthropic.com/v1/messages';
    const directAnthropic = /anthropic\.com/i.test(endpoint);
    headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
    if (directAnthropic) headers['anthropic-dangerous-direct-browser-access'] = 'true';
    body = { model, max_tokens: 1024, system: systemMsg, messages: [{ role: 'user', content: prompt }] };
  } else if (provider === 'gemini') {
    const model = cfg.aiModel || 'gemini-2.0-flash';
    endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    headers = { 'Content-Type': 'application/json' };
    body = { contents: [{ parts: [{ text: systemMsg + '\n\n' + prompt }] }], generationConfig: { temperature: 0.1 } };
  } else {
    const model = cfg.aiModel || 'gpt-4o-mini';
    endpoint = cfg.aiEndpoint || 'https://api.openai.com/v1/chat/completions';
    headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
    body = { model, messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: prompt }], temperature: 0.1 };
  }

  const controller = new AbortController();
  const timeoutMs = cfg.timeoutMs || 8000;
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    let data;
    if (provider === 'claude') {
      clearTimeout(timer);
      let bg;
      try {
        bg = await chrome.runtime.sendMessage({
          type: 'pendo-validate-ai-fetch',
          endpoint,
          headers,
          body: JSON.stringify(body),
          timeoutMs,
        });
      } catch (e) {
        throw new Error((e && e.message) || 'Background AI proxy failed');
      }
      if (!bg || typeof bg.ok !== 'boolean') {
        throw new Error('AI proxy unavailable: extension background did not respond.');
      }
      if (bg.error === 'timeout' || bg.error === 'network') {
        throw new DOMException(bg.message || (bg.error === 'timeout' ? 'Aborted' : 'Network error'), bg.error === 'timeout' ? 'AbortError' : 'Error');
      }
      if (!bg.ok) {
        const errBody = bg.json;
        let apiErr = '';
        const m = errBody && errBody.error && (errBody.error.message || errBody.error.type);
        if (m) apiErr = String(m).slice(0, 200);
        const parts = [`AI request failed with status ${bg.status}`];
        if (apiErr) parts.push(apiErr);
        if (bg.status === 401) parts.push('Use an API key from the same provider you selected (e.g. Anthropic console for Claude).');
        throw new Error(parts.join('. '));
      }
      data = bg.json;
    } else {
      const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        let apiErr = '';
        try {
          const errBody = await res.json();
          const m = errBody && errBody.error && (errBody.error.message || errBody.error.type);
          if (m) apiErr = String(m).slice(0, 200);
        } catch (_) {}
        const parts = [`AI request failed with status ${res.status}`];
        if (apiErr) parts.push(apiErr);
        if (res.status === 401) parts.push('Use an API key from the same provider you selected (e.g. Anthropic console for Claude).');
        throw new Error(parts.join('. '));
      }
      data = await res.json();
    }
    let content = '';
    if (provider === 'claude') content = data?.content?.[0]?.text || '';
    else if (provider === 'gemini') content = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    else content = data?.choices?.[0]?.message?.content || '';
    if (!content) {
      return [];
    }
    return content.split(/\n+/).map(t => t.replace(/^[-*]\s*/, '').trim()).filter(Boolean)
      .map(text => ({ text, source: 'ai', supportUrl: PENDO_SUPPORT.technicalSupport }));
  } catch (e) {
    clearTimeout(timer);
    console.error('AI request failed', e);
    const isAbort = e && (e.name === 'AbortError' || (e.message && String(e.message).includes('aborted')));
    let detail = isAbort
      ? 'Request timed out. Check your network or increase timeoutMs in storage.'
      : (e && e.message ? String(e.message) : String(e));
    const friendly = friendlyAiFailureDetail(provider, detail);
    if (friendly) detail = friendly;
    return [{ text: `AI suggestion unavailable: ${detail}`, source: 'ai', supportUrl: PENDO_SUPPORT.technicalSupport }];
  }
}

// ========== Tiny inline SVG helpers (no remote icon fonts) ==========
const SVG_NS = 'http://www.w3.org/2000/svg';
/** Build an inline SVG icon for the design's iconography (Lucide-styled). */
function makeIcon(name, size = 16) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const append = (tag, attrs) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.appendChild(el);
  };
  switch (name) {
    case 'check':
      append('polyline', { points: '20 6 9 17 4 12' });
      break;
    case 'alert':
      append('circle', { cx: '12', cy: '12', r: '10' });
      append('line', { x1: '12', y1: '8', x2: '12', y2: '12' });
      append('line', { x1: '12', y1: '16', x2: '12.01', y2: '16' });
      break;
    case 'x':
      append('line', { x1: '18', y1: '6', x2: '6', y2: '18' });
      append('line', { x1: '6', y1: '6', x2: '18', y2: '18' });
      break;
    case 'zap':
      append('polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' });
      break;
    case 'chevron':
      append('polyline', { points: '9 18 15 12 9 6' });
      break;
    case 'copy':
      append('rect', { x: '9', y: '9', width: '13', height: '13', rx: '2' });
      append('path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' });
      break;
    case 'external':
      append('path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' });
      append('polyline', { points: '15 3 21 3 21 9' });
      append('line', { x1: '10', y1: '14', x2: '21', y2: '3' });
      break;
    case 'code':
      append('polyline', { points: '16 18 22 12 16 6' });
      append('polyline', { points: '8 6 2 12 8 18' });
      break;
  }
  return svg;
}

// ========== Popup UI: bind elements and event handlers ==========
document.addEventListener('DOMContentLoaded', async () => {
  // ── DOM refs ─────────────────────────────────────────────────────────────
  const ivaHeader = document.getElementById('ivaHeader');
  const resizeHandle = document.getElementById('resizeHandle');
  const closeBtn = document.getElementById('closeBtn');

  const tabStatusBtn = document.getElementById('tabStatusBtn');
  const tabLogsBtn = document.getElementById('tabLogsBtn');
  const tabSettingsBtn = document.getElementById('tabSettingsBtn');
  const tabBtns = [tabStatusBtn, tabLogsBtn, tabSettingsBtn];
  const tabPanels = Array.from(document.querySelectorAll('.tab-panel'));
  const statusTabCount = document.getElementById('statusTabCount');
  const logsTabCount = document.getElementById('logsTabCount');

  const statusHero = document.getElementById('statusHero');
  const statusHeroIcon = document.getElementById('statusHeroIcon');
  const statusHeroTitle = document.getElementById('statusHeroTitle');
  const statusHeroSub = document.getElementById('statusHeroSub');
  const statusHeroTime = document.getElementById('statusHeroTime');

  const quickStats = document.getElementById('quickStats');
  const qsErrNum = document.getElementById('qsErrNum');
  const qsWarnNum = document.getElementById('qsWarnNum');
  const qsOkNum = document.getElementById('qsOkNum');

  const checksCard = document.getElementById('checksCard');
  const checkGroupsEl = document.getElementById('checkGroups');
  const copyAdviceBtn = document.getElementById('copyAdvice');

  const relatedReadingCard = document.getElementById('relatedReadingCard');
  const relatedReadingBody = document.getElementById('relatedReadingBody');
  const identityCard = document.getElementById('identityCard');
  const identityBody = document.getElementById('identityBody');
  const metadataCard = document.getElementById('metadataCard');
  const metadataBody = document.getElementById('metadataBody');
  const statusEmpty = document.getElementById('statusEmpty');

  const logsListEl = document.getElementById('logsList');
  const logsSearch = document.getElementById('logsSearch');
  const logCountErr = document.getElementById('logCountErr');
  const logCountWarn = document.getElementById('logCountWarn');
  const logCountInfo = document.getElementById('logCountInfo');
  const logFilterErr = document.getElementById('logFilterErr');
  const logFilterWarn = document.getElementById('logFilterWarn');
  const logFilterInfo = document.getElementById('logFilterInfo');
  const copyLogsBtn = document.getElementById('copyLogs');
  const pageFactsCard = document.getElementById('pageFactsCard');
  const pageFactsBody = document.getElementById('pageFactsBody');

  const pageSnapshotCard = document.getElementById('pageSnapshotCard');
  const pageSnapshotBody = document.getElementById('pageSnapshotBody');

  const runBtn = document.getElementById('run');
  const runBtnLabel = runBtn.querySelector('.btn__label');
  const launchDebuggerBtn = document.getElementById('launchDebugger');
  const exportMenuBtn = document.getElementById('exportMenuBtn');
  const exportMenu = document.getElementById('exportMenu');
  const exportMdBtn = document.getElementById('exportMd');
  const exportCopyBtn = document.getElementById('exportCopy');

  const toastEl = document.getElementById('toast');

  const aiProviderSelect = document.getElementById('aiProviderSelect');
  const aiApiKeyInput = document.getElementById('aiApiKeyInput');
  const aiKeyToggle = document.getElementById('aiKeyToggleVisibility');
  const aiSaveBtn = document.getElementById('aiSettingsSave');
  const aiSaveStatus = document.getElementById('aiSettingsStatus');

  // ── State ───────────────────────────────────────────────────────────────
  let lastContext = null;
  let runState = 'idle'; // 'idle' | 'running' | 'done'
  let logFilters = { error: true, warn: true, info: true };
  let logQuery = '';
  let toastTimer = null;

  // Seed hero icon
  setStatusHero({ state: 'idle', title: 'Ready to validate', sub: 'Click Validate Pendo Install to begin.' });
  renderStatusHeroTime(null);

  // ── Iframe / overlay wiring: close + drag + resize via postMessage ──────
  const inIframe = window !== window.parent;
  if (inIframe) {
    if (closeBtn) {
      closeBtn.style.display = '';
      closeBtn.addEventListener('click', () => {
        window.parent.postMessage({ type: 'pendo-validate-close' }, '*');
      });
    }
    bindHeaderDrag(ivaHeader);
    bindResizeHandle(resizeHandle);
  }

  /**
   * Header drag: pointer capture in the iframe; parent (content.js) applies the deltas.
   * screenX/screenY are stable even when the parent moves the iframe under the pointer.
   */
  function bindHeaderDrag(handle) {
    if (!handle) return;
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      const startScreenX = e.screenX;
      const startScreenY = e.screenY;
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
      window.parent.postMessage({ type: 'pendo-validate-dragstart' }, '*');

      function onMove(ev) {
        const dx = ev.screenX - startScreenX;
        const dy = ev.screenY - startScreenY;
        window.parent.postMessage({ type: 'pendo-validate-drag', dx, dy }, '*');
      }
      function teardown(ev) {
        try { handle.releasePointerCapture(ev.pointerId); } catch (_) {}
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', teardown);
        handle.removeEventListener('pointercancel', teardown);
        window.parent.postMessage({ type: 'pendo-validate-dragend' }, '*');
      }
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', teardown);
      handle.addEventListener('pointercancel', teardown);
    });
  }

  /** Corner resize: posts {dw, dh} deltas; content.js clamps and applies width/height. */
  function bindResizeHandle(handle) {
    if (!handle) return;
    handle.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const startScreenX = e.screenX;
      const startScreenY = e.screenY;
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
      window.parent.postMessage({ type: 'pendo-validate-resizestart' }, '*');

      function onMove(ev) {
        const dw = ev.screenX - startScreenX;
        const dh = ev.screenY - startScreenY;
        window.parent.postMessage({ type: 'pendo-validate-resize', dw, dh }, '*');
      }
      function teardown(ev) {
        try { handle.releasePointerCapture(ev.pointerId); } catch (_) {}
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', teardown);
        handle.removeEventListener('pointercancel', teardown);
        window.parent.postMessage({ type: 'pendo-validate-resizeend' }, '*');
      }
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', teardown);
      handle.addEventListener('pointercancel', teardown);
    });
  }

  // ── Tab strip ────────────────────────────────────────────────────────────
  /** Activate a tab by id ('status' | 'logs' | 'settings'). */
  function activateTab(id) {
    const targetPanelId = id === 'logs' ? 'tabLogsPanel'
      : id === 'settings' ? 'tabSettingsPanel'
      : 'tabStatusPanel';
    const targetBtn = id === 'logs' ? tabLogsBtn : id === 'settings' ? tabSettingsBtn : tabStatusBtn;
    tabBtns.forEach(b => b.setAttribute('aria-selected', b === targetBtn ? 'true' : 'false'));
    tabPanels.forEach(p => { p.hidden = p.id !== targetPanelId; });
  }
  tabStatusBtn.addEventListener('click', () => activateTab('status'));
  tabLogsBtn.addEventListener('click', () => activateTab('logs'));
  tabSettingsBtn.addEventListener('click', () => activateTab('settings'));

  // ── Render helpers ───────────────────────────────────────────────────────

  /** Severity icon used in status hero / check group heads. Matches the design's 16px default. */
  function severityIcon(state) {
    if (state === 'ok') return makeIcon('check', 16);
    if (state === 'warn') return makeIcon('alert', 16);
    if (state === 'err') return makeIcon('x', 16);
    return makeIcon('zap', 16);
  }

  /** Set the hero state, icon, title, sub. */
  function setStatusHero({ state, title, sub }) {
    statusHero.dataset.state = state;
    statusHeroIcon.replaceChildren(severityIcon(state));
    statusHeroTitle.textContent = title;
    statusHeroSub.textContent = sub;
  }

  /** Format last-run time relative to now. */
  function formatRelative(date) {
    if (!date) return 'NEVER';
    const ms = Date.now() - date.getTime();
    if (ms < 5_000) return 'JUST NOW';
    if (ms < 60_000) return `${Math.floor(ms / 1000)}s AGO`;
    if (ms < 60 * 60 * 1000) return `${Math.floor(ms / 60_000)}m AGO`;
    return `${Math.floor(ms / 3_600_000)}h AGO`;
  }
  function renderStatusHeroTime(date) {
    statusHeroTime.textContent = formatRelative(date);
  }

  /** Update the quick stats row and surface counts on the status/logs tab badges. */
  function renderQuickStats({ errCount, warnCount, okCount, logCount }) {
    qsErrNum.textContent = String(errCount);
    qsWarnNum.textContent = String(warnCount);
    qsOkNum.textContent = String(okCount);
    quickStats.hidden = false;

    const issueCount = errCount + warnCount;
    if (issueCount > 0) {
      statusTabCount.hidden = false;
      statusTabCount.textContent = String(issueCount);
    } else {
      statusTabCount.hidden = true;
    }
    if (logCount > 0) {
      logsTabCount.hidden = false;
      logsTabCount.textContent = String(logCount);
    } else {
      logsTabCount.hidden = true;
    }
  }

  /**
   * Bucket advice + captured + checks into err/warn/ok groups for the render layer.
   * Severity is decided here, NOT in captureAndInspect, so its shape is unchanged.
   */
  function classifyAdvice(rawAdvice, captured, checks) {
    const adviceList = normalizeAdviceList(rawAdvice || []);
    const errItems = [];
    const warnItems = [];

    const seenTexts = new Set();
    adviceList.forEach(a => {
      const item = {
        text: a.text,
        source: a.source,
        supportKey: a.supportKey,
        supportUrl: a.supportUrl
      };
      if (a.supportKey && ERR_SUPPORT_KEYS.has(a.supportKey)) errItems.push(item);
      else warnItems.push(item);
      seenTexts.add(a.text);
    });

    (captured || []).forEach(l => {
      if (!l || !l.text) return;
      if (seenTexts.has(l.text)) return;
      if (l.level === 'error') errItems.push({ text: l.text, source: 'captured', supportKey: 'installGuide', supportUrl: PENDO_SUPPORT.installGuide });
      else if (l.level === 'warn') warnItems.push({ text: l.text, source: 'captured', supportKey: null, supportUrl: PENDO_SUPPORT.helpCenter });
    });

    const okItems = (checks || []).map(c => ({ text: String(c), source: 'builtin' }));
    return { err: errItems, warn: warnItems, ok: okItems };
  }

  /** Render the collapsible check groups card. Returns the count of err+warn items. */
  function renderCheckGroups(buckets) {
    checkGroupsEl.replaceChildren();
    const total = buckets.err.length + buckets.warn.length + buckets.ok.length;
    if (total === 0) { checksCard.hidden = true; return; }
    checksCard.hidden = false;

    const groups = [
      { kind: 'err',  label: 'Errors',   items: buckets.err,  defaultOpen: true },
      { kind: 'warn', label: 'Warnings', items: buckets.warn, defaultOpen: buckets.err.length === 0 },
      { kind: 'ok',   label: 'Passing',  items: buckets.ok,   defaultOpen: false },
    ];

    for (const g of groups) {
      if (!g.items.length) continue;
      const wrap = document.createElement('div');
      wrap.className = `check-group check-group--${g.kind}`;
      wrap.dataset.open = g.defaultOpen ? 'true' : 'false';

      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'check-group__head';
      head.dataset.action = 'toggle-check-group';
      head.setAttribute('aria-expanded', g.defaultOpen ? 'true' : 'false');

      const chev = document.createElement('span');
      chev.className = 'check-group__chev';
      chev.appendChild(makeIcon('chevron', 14));
      head.appendChild(chev);

      const iconWrap = document.createElement('span');
      iconWrap.className = 'check-group__icon';
      iconWrap.appendChild(severityIcon(g.kind));
      head.appendChild(iconWrap);

      const label = document.createElement('span');
      label.className = 'check-group__label';
      label.textContent = g.label;
      head.appendChild(label);

      const count = document.createElement('span');
      count.className = 'check-group__count';
      count.textContent = String(g.items.length);
      head.appendChild(count);

      head.addEventListener('click', () => {
        const open = wrap.dataset.open === 'true';
        wrap.dataset.open = open ? 'false' : 'true';
        head.setAttribute('aria-expanded', open ? 'false' : 'true');
      });
      wrap.appendChild(head);

      const items = document.createElement('div');
      items.className = 'check-group__items';
      for (const it of g.items) {
        const cell = document.createElement('div');
        cell.className = 'check-item';
        if (it.source === 'ai') {
          const tag = document.createElement('span');
          tag.className = 'check-item__source';
          tag.textContent = 'AI';
          cell.appendChild(tag);
        }
        cell.appendChild(document.createTextNode(it.text));
        if (it.supportUrl) {
          const docWrap = document.createElement('div');
          const a = document.createElement('a');
          a.className = 'check-item__doc';
          a.href = it.supportUrl;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = SUPPORT_LABELS[it.supportKey] || 'Read more';
          a.appendChild(document.createTextNode(' '));
          a.appendChild(makeIcon('external', 11));
          docWrap.appendChild(a);
          cell.appendChild(docWrap);
        }
        items.appendChild(cell);
      }
      wrap.appendChild(items);
      checkGroupsEl.appendChild(wrap);
    }
  }

  /** Render the Related reading card with KB articles selected by validation signals. */
  function renderRelatedReading(signals) {
    if (!relatedReadingBody) return;
    relatedReadingBody.replaceChildren();
    const entries = selectRelatedReading(signals);
    if (!entries || entries.length === 0) {
      relatedReadingCard.hidden = true;
      return;
    }
    relatedReadingCard.hidden = false;
    for (const entry of entries) {
      const row = document.createElement('div');
      row.className = 'kv-row';
      const a = document.createElement('a');
      a.href = entry.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'check-item__doc';
      a.textContent = entry.title;
      a.appendChild(document.createTextNode(' '));
      a.appendChild(makeIcon('external', 11));
      row.appendChild(a);
      const sub = document.createElement('div');
      sub.className = 'kv-row__v kv-row__v--sans kv-row__v--wrap';
      sub.style.fontSize = '11px';
      sub.style.color = 'var(--ink-3)';
      sub.textContent = entry.summary;
      row.appendChild(sub);
      relatedReadingBody.appendChild(row);
    }
  }

  /** Build a `.kv-row` (label / value / copy button) and append to a container. */
  function appendKvRow(container, { label, value, mono = true, wrap = false, top = false }) {
    const row = document.createElement('div');
    row.className = 'kv-row' + (top ? ' kv-row--top' : '');

    const k = document.createElement('div');
    k.className = 'kv-row__k';
    k.textContent = label;
    row.appendChild(k);

    const v = document.createElement('div');
    const empty = value == null || value === '' || value === '—';
    v.className = 'kv-row__v'
      + (empty ? ' kv-row__v--muted' : '')
      + (!mono && !empty ? ' kv-row__v--sans' : '')
      + (wrap ? ' kv-row__v--wrap' : '');
    v.textContent = empty ? '—' : String(value);
    row.appendChild(v);

    if (!empty) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kv-row__copy';
      btn.dataset.action = 'copy-kv';
      btn.title = `Copy ${label}`;
      btn.setAttribute('aria-label', `Copy ${label}`);
      btn.appendChild(makeIcon('copy', 13));
      btn.addEventListener('click', () => {
        copyTextToClipboard(String(value)).then(() => showToast(`${label} copied`)).catch(() => {});
      });
      row.appendChild(btn);
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'kv-row__copy-spacer';
      row.appendChild(spacer);
    }
    container.appendChild(row);
    return row;
  }

  /** Render Identity card (visitor, account, API key). */
  function renderIdentityCard({ visitorId, accountId, detectedApiKey }) {
    identityBody.replaceChildren();
    appendKvRow(identityBody, { label: 'VisitorId', value: visitorId || '—' });
    appendKvRow(identityBody, { label: 'AccountId', value: accountId == null ? '—' : String(accountId) });
    appendKvRow(identityBody, { label: 'API key', value: detectedApiKey || '—' });
    identityCard.hidden = false;
  }

  /** Render the Metadata card (visitor + account JSON previews). */
  function renderMetadataCard({ visitorMetadata, accountMetadata }) {
    metadataBody.replaceChildren();
    const fields = (meta) => meta && typeof meta === 'object' ? Object.keys(meta).length : 0;
    const renderSection = (label, meta) => {
      const count = fields(meta);
      const row = document.createElement('div');
      row.className = 'kv-row kv-row--top';
      const k = document.createElement('div');
      k.className = 'kv-row__k';
      k.textContent = label;
      row.appendChild(k);
      const v = document.createElement('div');
      v.className = 'kv-row__v kv-row__v--sans kv-row__v--wrap';
      if (count === 0) {
        v.classList.add('kv-row__v--muted');
        v.textContent = 'none supplied';
      } else {
        v.textContent = `${count} field${count === 1 ? '' : 's'}`;
      }
      row.appendChild(v);
      if (count > 0) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'kv-row__copy';
        btn.dataset.action = 'copy-kv';
        btn.title = `Copy ${label} metadata`;
        btn.setAttribute('aria-label', `Copy ${label} metadata`);
        btn.appendChild(makeIcon('copy', 13));
        btn.addEventListener('click', () => {
          copyTextToClipboard(JSON.stringify(meta, null, 2)).then(() => showToast(`${label} metadata copied`)).catch(() => {});
        });
        row.appendChild(btn);
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'kv-row__copy-spacer';
        row.appendChild(spacer);
      }
      metadataBody.appendChild(row);

      if (count > 0) {
        const pre = document.createElement('pre');
        pre.className = 'kv-json';
        pre.textContent = JSON.stringify(meta, null, 2);
        metadataBody.appendChild(pre);
      }
    };
    renderSection('Visitor', visitorMetadata);
    renderSection('Account', accountMetadata);
    metadataCard.hidden = false;
  }

  /** Render the page-snapshot section in the Settings tab. */
  function renderPageSnapshot(res) {
    pageSnapshotBody.replaceChildren();
    const { status, apiKeyFound, snippetOnPage, launcherPresent, launcherAttempted, launcherDataValidated, validatedIn } = res;
    const yn = (v) => v === true ? 'Yes' : v === false ? 'No' : '—';
    const launcherDisplay = !launcherAttempted ? 'Not checked' : launcherPresent === true ? 'Found' : 'Not found';
    const validatedInDisplay = validatedIn === 'launcher' ? 'Pendo Launcher'
      : validatedIn === 'launcher-beta' ? 'Pendo Launcher Beta'
      : validatedIn === 'page' ? 'Page' : '—';

    appendKvRow(pageSnapshotBody, { label: 'Pendo present', value: yn(status.pendoPresent), mono: false });
    appendKvRow(pageSnapshotBody, { label: 'validateInstall', value: yn(status.validatePresent), mono: false });
    appendKvRow(pageSnapshotBody, { label: 'Agent version', value: status.version || 'unknown' });
    appendKvRow(pageSnapshotBody, { label: 'API key found', value: yn(apiKeyFound), mono: false });
    appendKvRow(pageSnapshotBody, { label: 'Detected key', value: status.detectedApiKey || '—' });
    appendKvRow(pageSnapshotBody, { label: 'Snippet on page', value: yn(snippetOnPage), mono: false });
    appendKvRow(pageSnapshotBody, { label: 'Pendo Launcher', value: launcherDisplay, mono: false });
    appendKvRow(pageSnapshotBody, { label: 'Launcher validated', value: yn(launcherDataValidated), mono: false });
    appendKvRow(pageSnapshotBody, { label: 'Validated in', value: validatedInDisplay, mono: false });
    appendKvRow(pageSnapshotBody, { label: 'Resource hits', value: String(status.resourceHits.length), mono: false });
    pageSnapshotCard.hidden = false;
  }

  /** Render the optional Page facts card on the Logs tab. */
  function renderPageFacts(res) {
    pageFactsBody.replaceChildren();
    const { snippetOnPage, validatedIn } = res;
    const validatedInDisplay = validatedIn === 'launcher' ? 'Pendo Launcher'
      : validatedIn === 'launcher-beta' ? 'Pendo Launcher Beta'
      : validatedIn === 'page' ? 'Active tab' : '—';
    appendKvRow(pageFactsBody, { label: 'Snippet', value: snippetOnPage ? 'Found' : 'Not found', mono: false });
    appendKvRow(pageFactsBody, { label: 'Validated in', value: validatedInDisplay, mono: false });
    appendKvRow(pageFactsBody, { label: 'Lines captured', value: String((res.captured || []).length) });
    pageFactsCard.hidden = false;
  }

  /** Render the logs list using the current filter + query state. */
  function renderLogs() {
    const captured = (lastContext && lastContext.captured) || [];
    const errCount = captured.filter(l => l.level === 'error').length;
    const warnCount = captured.filter(l => l.level === 'warn').length;
    const infoCount = captured.filter(l => l.level === 'info' || l.level === 'log').length;
    logCountErr.textContent = String(errCount);
    logCountWarn.textContent = String(warnCount);
    logCountInfo.textContent = String(infoCount);

    logFilterErr.setAttribute('aria-pressed', logFilters.error ? 'true' : 'false');
    logFilterWarn.setAttribute('aria-pressed', logFilters.warn ? 'true' : 'false');
    logFilterInfo.setAttribute('aria-pressed', logFilters.info ? 'true' : 'false');

    const q = (logQuery || '').toLowerCase();
    const visible = captured.filter(l => {
      const lev = l.level === 'error' ? 'error' : l.level === 'warn' ? 'warn' : 'info';
      if (lev === 'error' && !logFilters.error) return false;
      if (lev === 'warn' && !logFilters.warn) return false;
      if (lev === 'info' && !logFilters.info) return false;
      if (q && !(l.text || '').toLowerCase().includes(q)) return false;
      return true;
    });

    logsListEl.replaceChildren();
    if (!captured.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      const ic = document.createElement('div');
      ic.className = 'empty__icon';
      ic.appendChild(makeIcon('code', 28));
      empty.appendChild(ic);
      const msg = document.createElement('div');
      msg.textContent = 'No output captured. If you’re on a SPA, try a page where Pendo loads, or reload and run again.';
      empty.appendChild(msg);
      logsListEl.appendChild(empty);
      return;
    }
    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      const ic = document.createElement('div');
      ic.className = 'empty__icon';
      ic.appendChild(makeIcon('code', 28));
      empty.appendChild(ic);
      const msg = document.createElement('div');
      msg.textContent = 'No log lines match your filter.';
      empty.appendChild(msg);
      logsListEl.appendChild(empty);
      return;
    }

    for (const l of visible) {
      const div = document.createElement('div');
      const lev = l.level === 'error' ? 'err' : l.level === 'warn' ? 'warn' : 'info';
      div.className = `log-line log-line--${lev}`;
      const lvl = document.createElement('span');
      lvl.className = 'log-line__lvl';
      lvl.textContent = lev === 'err' ? '✕' : lev === 'warn' ? '!' : '·';
      div.appendChild(lvl);
      const msg = document.createElement('span');
      msg.className = 'log-line__msg';
      msg.textContent = l.text;
      div.appendChild(msg);
      logsListEl.appendChild(div);
    }
  }

  // ── Filters ──────────────────────────────────────────────────────────────
  function toggleFilter(level) {
    if (level === 'error') logFilters.error = !logFilters.error;
    else if (level === 'warn') logFilters.warn = !logFilters.warn;
    else if (level === 'info') logFilters.info = !logFilters.info;
    renderLogs();
  }
  logFilterErr.addEventListener('click', () => toggleFilter('error'));
  logFilterWarn.addEventListener('click', () => toggleFilter('warn'));
  logFilterInfo.addEventListener('click', () => toggleFilter('info'));
  logsSearch.addEventListener('input', (e) => { logQuery = e.target.value; renderLogs(); });

  // ── Toast ────────────────────────────────────────────────────────────────
  function showToast(message) {
    if (!message) return;
    toastEl.textContent = message;
    toastEl.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 1800);
  }

  // ── Run validation ───────────────────────────────────────────────────────
  /** Toggle the primary button between idle and running visuals. */
  function setRunningVisual(running) {
    if (running) {
      runBtn.disabled = true;
      runBtn.classList.add('btn--primary--running');
      runBtnLabel.replaceChildren();
      const dots = document.createElement('span');
      dots.className = 'dots';
      dots.appendChild(document.createElement('span'));
      dots.appendChild(document.createElement('span'));
      dots.appendChild(document.createElement('span'));
      runBtnLabel.appendChild(dots);
      runBtnLabel.appendChild(document.createTextNode(' Validating'));
    } else {
      runBtn.disabled = false;
      runBtn.classList.remove('btn--primary--running');
      runBtnLabel.textContent = 'Validate Pendo Install';
    }
  }

  /** Build the hero state from a completed validation result. */
  function deriveHeroState(res) {
    const { status, captured, snippetOnPage, launcherPresent, launcherAttempted, launcherDataValidated, validatedIn } = res;
    const originNote = validatedIn === 'launcher' ? ' (via Pendo Launcher)'
      : validatedIn === 'launcher-beta' ? ' (via Pendo Launcher Beta)' : '';
    if (!snippetOnPage && launcherAttempted && launcherPresent === false) {
      return { state: 'err', title: 'Install not detected', sub: 'Snippet and Pendo Launcher are both missing on this page.' };
    }
    if (!snippetOnPage && launcherPresent === true && launcherDataValidated === false) {
      return { state: 'warn', title: 'Launcher installed', sub: 'No agent data on this tab. Open the application where the Launcher injects Pendo.' };
    }
    if (!status.pendoPresent) {
      return { state: 'err', title: 'Pendo not found', sub: 'window.pendo is missing' + originNote + '.' };
    }
    if (!status.validatePresent) {
      return { state: 'warn', title: 'No validateInstall()', sub: 'Agent found but the validateInstall() helper is unavailable' + originNote + '.' };
    }
    const errCount = captured.filter(l => l.level === 'error').length;
    const warnCount = captured.filter(l => l.level === 'warn').length;
    if (errCount > 0) return { state: 'err', title: `${errCount} error${errCount === 1 ? '' : 's'}`, sub: 'validateInstall() reported errors' + originNote + '.' };
    if (warnCount > 0) return { state: 'warn', title: `${warnCount} warning${warnCount === 1 ? '' : 's'}`, sub: 'Install works, but there are recommendations' + originNote + '.' };
    return { state: 'ok', title: 'Install validated', sub: 'All checks passed' + originNote + '.' };
  }

  /** Reset Status tab UI before a new run. */
  function resetStatusUi() {
    quickStats.hidden = true;
    checksCard.hidden = true;
    identityCard.hidden = true;
    metadataCard.hidden = true;
    pageFactsCard.hidden = true;
    pageSnapshotCard.hidden = true;
    statusEmpty.hidden = true;
    statusTabCount.hidden = true;
    logsTabCount.hidden = true;
    checkGroupsEl.replaceChildren();
    identityBody.replaceChildren();
    metadataBody.replaceChildren();
    pageFactsBody.replaceChildren();
    pageSnapshotBody.replaceChildren();
    logsListEl.replaceChildren();
  }

  runBtn.addEventListener('click', async () => {
    activateTab('status');
    runState = 'running';
    setRunningVisual(true);
    resetStatusUi();
    setStatusHero({ state: 'running', title: 'Validating…', sub: 'Running pendo.validateInstall() in the active tab.' });
    renderStatusHeroTime(null);

    try {
      const res = await runInPage();
      if (!res || !res.status) {
        setStatusHero({ state: 'err', title: 'Failed', sub: 'Validation did not return a result.' });
        return;
      }

      const { status, captured, advice, checks, cspMeta, apiKeyFound, hasError, hasWarn, origin, pageUrl, snippetOnPage, launcherPresent, launcherAttempted, launcherDataValidated, validatedIn } = res;

      const hero = deriveHeroState(res);
      setStatusHero(hero);
      const now = new Date();
      renderStatusHeroTime(now);

      let checksToRender = (checks || []).slice();
      if (validatedIn === 'launcher' || validatedIn === 'launcher-beta') {
        checksToRender.push('Pendo Launcher (browser extension) present and validated.');
      }
      let adviceList = advice || [];
      if (snippetOnPage === false && launcherPresent === false && launcherAttempted) {
        adviceList = adviceList.concat([{ text: 'Ensure the snippet is installed on this page, or open the Pendo Launcher (or Beta) extension in a tab.', source: 'builtin', supportKey: 'installGuide' }]);
      }

      const buckets = classifyAdvice(adviceList, captured, checksToRender);
      renderCheckGroups(buckets);

      const hasVFields = status.visitorMetadata && typeof status.visitorMetadata === 'object' && Object.keys(status.visitorMetadata).some(k => k !== 'id');
      const hasAFields = status.accountMetadata && typeof status.accountMetadata === 'object' && Object.keys(status.accountMetadata).some(k => k !== 'id');
      const readingSignals = {
        pendoPresent: status.pendoPresent,
        validatePresent: status.validatePresent,
        visitorId: status.visitorId,
        accountId: status.accountId,
        hasVisitorMeta: !!hasVFields,
        hasAccountMeta: !!hasAFields,
        cspIssue: adviceList.some(a => a.supportKey === 'csp'),
        noResourceHits: status.resourceHits && status.resourceHits.length === 0,
        isSpa: false,
        isIframe: false,
        hasGtm: false,
        isSandbox: false,
        launcherPresent: !!launcherPresent,
        agentVersionOld: false,
        apiKeyMissing: !apiKeyFound,
      };
      renderRelatedReading(readingSignals);

      renderQuickStats({
        errCount: buckets.err.length,
        warnCount: buckets.warn.length,
        okCount: buckets.ok.length,
        logCount: captured.length
      });

      renderIdentityCard({
        visitorId: status.visitorId,
        accountId: status.accountId,
        detectedApiKey: status.detectedApiKey
      });
      renderMetadataCard({
        visitorMetadata: status.visitorMetadata,
        accountMetadata: status.accountMetadata
      });

      renderPageSnapshot(res);
      renderPageFacts(res);
      renderLogs();

      lastContext = {
        pageUrl: pageUrl || 'unknown',
        timestamp: toIso(now),
        status, captured, advice: adviceList, checks: checksToRender, cspMeta: cspMeta || '', apiKeyFound, origin: validatedIn || origin || 'page',
        hasError: !!hasError, hasWarn: !!hasWarn,
        snippetOnPage, launcherPresent, launcherAttempted, launcherDataValidated: !!launcherDataValidated, validatedIn: validatedIn || 'page', launcherUrl: res.launcherUrl
      };

      exportMenuBtn.disabled = false;
      exportMenuBtn.title = 'Export results';

      const failureDetected = !status.validatePresent || hasError || hasWarn;
      if (failureDetected) {
        const aiAdvice = await requestAiAdvice(lastContext);
        if (aiAdvice && aiAdvice.length) {
          adviceList = adviceList.concat(aiAdvice);
          lastContext.advice = adviceList;
          const newBuckets = classifyAdvice(adviceList, captured, checksToRender);
          renderCheckGroups(newBuckets);
          renderQuickStats({
            errCount: newBuckets.err.length,
            warnCount: newBuckets.warn.length,
            okCount: newBuckets.ok.length,
            logCount: captured.length
          });
        }
      }
    } catch (e) {
      console.error(e);
      setStatusHero({ state: 'err', title: 'Validation failed', sub: (e && e.message) || 'Unknown error.' });
    } finally {
      runState = 'done';
      setRunningVisual(false);
    }
  });

  /** Run a function in the active tab (MAIN world) and return its result. */
  async function runInActiveTab(fn) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return { ok: false, message: 'No active tab' };
    try {
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: fn });
      return result || { ok: false, message: 'No result' };
    } catch (e) {
      return { ok: false, message: e && e.message ? e.message : String(e) };
    }
  }

  /** Enable Pendo Debugger: calls pendo.enableDebugging() in the page. */
  launchDebuggerBtn.addEventListener('click', async () => {
    const res = await runInActiveTab(enableDebuggingInPage);
    if (res.ok) showToast('Debugger enabled');
    else showToast(res.message || 'Debugger failed');
  });

  // ── Export menu ──────────────────────────────────────────────────────────
  /** Toggle the export dropdown, only when a validation result exists. */
  function setExportMenuOpen(open) {
    exportMenu.hidden = !open;
    exportMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  exportMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (exportMenuBtn.disabled) return;
    setExportMenuOpen(exportMenu.hidden);
  });
  document.addEventListener('click', (e) => {
    if (exportMenu.hidden) return;
    if (e.target.closest('#exportMenu') || e.target.closest('#exportMenuBtn')) return;
    setExportMenuOpen(false);
  });

  exportMdBtn.addEventListener('click', () => {
    setExportMenuOpen(false);
    if (!lastContext) return;
    try {
      const md = buildMarkdownReport(lastContext);
      const host = (() => { try { return (new URL(lastContext.pageUrl)).host; } catch { return 'page'; } })().replace(/[^a-z0-9\.-]/gi, '_');
      const fname = `pendo-validate-report_${host}_${Date.now()}.md`;
      downloadBlob(fname, 'text/markdown', md);
      showToast('Markdown report downloaded');
    } catch (e) { console.error(e); showToast('Export failed'); }
  });

  exportCopyBtn.addEventListener('click', async () => {
    setExportMenuOpen(false);
    if (!lastContext) return;
    try {
      const text = buildPlainSummary(lastContext);
      await copyTextToClipboard(text);
      showToast('Summary copied');
    } catch (e) { console.error(e); showToast('Copy failed'); }
  });

  // ── Clipboard ────────────────────────────────────────────────────────────
  /** Clipboard API is blocked by Permissions Policy in some extension contexts; execCommand fallback works with user gesture. */
  async function copyTextToClipboard(text) {
    const payload = text ?? '';
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(payload);
        return 'clipboard-api';
      }
    } catch (_) { /* fall through to execCommand */ }
    const ta = document.createElement('textarea');
    ta.value = payload;
    ta.setAttribute('readonly', '');
    ta.setAttribute('aria-hidden', 'true');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, payload.length);
    try {
      const ok = document.execCommand('copy');
      if (!ok) throw new Error('execCommand copy returned false');
      return 'execCommand';
    } finally {
      document.body.removeChild(ta);
    }
  }

  copyAdviceBtn.addEventListener('click', () => {
    let items = '';
    if (lastContext) {
      const lines = [];
      (lastContext.checks || []).forEach(c => lines.push(`${c}`));
      normalizeAdviceList(lastContext.advice || []).forEach(a => lines.push(a.text));
      items = lines.join('\n');
    } else {
      items = Array.from(checkGroupsEl.querySelectorAll('.check-item')).map(el => el.innerText.trim()).join('\n');
    }
    copyTextToClipboard(items || 'No advice.')
      .then(() => showToast('Advice copied'))
      .catch(err => { console.warn('Copy advice failed:', err); showToast('Copy failed'); });
  });

  copyLogsBtn.addEventListener('click', () => {
    const captured = (lastContext && lastContext.captured) || [];
    const text = captured.length
      ? captured.map(({ level, text }) => `[${level}] ${text}`).join('\n')
      : 'No logs captured.';
    copyTextToClipboard(text)
      .then(() => showToast('Logs copied'))
      .catch(err => { console.warn('Copy logs failed:', err); showToast('Copy failed'); });
  });

  // ── AI Settings panel ────────────────────────────────────────────────────
  getAiConfig().then(cfg => {
    if (cfg.aiProvider) aiProviderSelect.value = cfg.aiProvider;
    if (cfg.aiApiKey) aiApiKeyInput.value = cfg.aiApiKey;
  });

  aiKeyToggle.addEventListener('click', () => {
    const isPassword = aiApiKeyInput.type === 'password';
    aiApiKeyInput.type = isPassword ? 'text' : 'password';
    aiKeyToggle.textContent = isPassword ? 'Hide' : 'Show';
  });

  aiSaveBtn.addEventListener('click', () => {
    const provider = aiProviderSelect.value;
    const apiKey = aiApiKeyInput.value.trim();
    chrome.storage.local.set({ aiProvider: provider, aiApiKey: apiKey }, () => {
      aiSaveStatus.textContent = 'Saved.';
      showToast('AI settings saved');
      setTimeout(() => { aiSaveStatus.textContent = ''; }, 2000);
    });
  });

  // Show the empty state on the Status tab until a run completes.
  if (runState === 'idle') statusEmpty.hidden = false;
});
