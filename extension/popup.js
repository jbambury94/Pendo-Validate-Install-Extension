/**
 * Pendo Validate — popup script.
 * Runs validation in the active tab (or Pendo Launcher fallback), shows advice, and supports export/copy.
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

// ========== UI helpers ==========
function setStatus(el, cls, text) {
  el.className = `badge ${cls}`;
  el.textContent = text;
}
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
  technicalSupport: 'https://support.pendo.io/hc/en-us/articles/360034163971-Get-help-with-Pendo-from-Technical-Support'
};

// ========== Advice normalization ==========
/** Normalize advice items to { text, source, supportUrl } and filter empty. Resolves supportKey to supportUrl. */
function normalizeAdviceList(advice = []) {
  return advice.map(a => {
    let text, source, supportUrl;
    if (typeof a === 'string') { text = a; source = 'builtin'; supportUrl = PENDO_SUPPORT.helpCenter; }
    else if (a && typeof a === 'object') {
      text = a.text || '';
      source = a.source || 'builtin';
      supportUrl = a.supportUrl || (a.supportKey && PENDO_SUPPORT[a.supportKey]) || (source === 'ai' ? PENDO_SUPPORT.technicalSupport : PENDO_SUPPORT.helpCenter);
    } else { text = String(a); source = 'builtin'; supportUrl = PENDO_SUPPORT.helpCenter; }
    return { text, source, supportUrl };
  }).filter(a => a.text);
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

  lines.push(`## Captured Output`);
  if (!captured || !captured.length) lines.push(`No output captured.`);
  else captured.forEach(l => lines.push(`- [${l.level}] ${l.text}`));
  lines.push("");
  return lines.join("\n");
}
/** Serialize full context as pretty-printed JSON. */
function buildJsonReport(context) { return JSON.stringify(context, null, 2); }
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
    // Intercept console so we can capture validateInstall() output
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

    // Resolve Pendo agent; track which global was found for Launcher detection.
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

    /** Try to extract API key from Pendo agent/static URL. */
    function extractKeyFromUrl(url) {
      try {
        const m = url.match(/agent\/(?:static|production|beta)\/([a-f0-9\-]{8,})/i);
        if (m) return m[1];
      } catch {}
      return null;
    }

    // Populate version, API key, visitorId, accountId from agent if present
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

        /** Extract visitor/account metadata objects (per Pendo "Choose IDs and metadata" docs). */
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

    // Collect Pendo-related resource requests from Performance API
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

    // Read CSP from meta tags for advice
    let cspMeta = "";
    try {
      const metas = document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]');
      cspMeta = Array.from(metas).map(m => m.getAttribute('content') || '').join(' | ');
    } catch {}

    // Run validateInstall() (or Launcher equivalent) and capture output; restore console when done
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

    // Determine API key presence: from output text OR detected data
    const all = captured.map(m => m.text).join('\n');
    const keyRegex = /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i;
    const apiKeyFound = keyRegex.test(all) || !!status.detectedApiKey;

    const hasError = captured.some(m => m.level === 'error' || /error|failed|not found|blocked/i.test(m.text));
    const hasWarn = captured.some(m => m.level === 'warn' || /warn|missing|no visitor|not initiali[sz]ed/i.test(m.text));

    // Build built-in advice and checks from status and captured output
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
   * This is the programmatic equivalent of switching the DevTools console context
   * to "Pendo Launcher (Beta)" and running pendo.validateInstall().
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

  // Phase 1: Always run in the active tab (top window)
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error('No active tab found.');
  const [{ result: pageResult }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: captureAndInspect
  });

  const snippetOnPage = !!(pageResult && pageResult.status && pageResult.status.pendoPresent);
  const basePageUrl = tab && tab.url ? tab.url : 'unknown';

  // Phase 1.5: Always check for the Launcher in the same tab.
  // Runs even when a snippet was found — Launcher and snippet can coexist on the same page.
  // When no snippet was found: any pendo agent found here is from the Launcher.
  // When a snippet was found: only window.Pendo (capital P) counts as Launcher — prevents
  // the snippet's own window.pendo from being double-counted as a Launcher detection.
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

    // CDP didn't find agent — fall through to installed-but-no-data message
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

  // Phase 2: No snippet, no Launcher extension installed
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
        chrome.storage.local.get({ aiProvider: 'openai', aiEndpoint: '', aiApiKey: '', aiModel: '' }, resolve);
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
    lines.push('Respond with a short bullet list of concrete fixes.');
    return lines.join('\n');
  }

  /** Call configured AI API for remediation suggestions; returns array of { text, source: 'ai' }. */
  async function requestAiAdvice(context) {
    const cfg = await getAiConfig();
    if (!cfg.aiApiKey) return [];

    const provider = cfg.aiProvider || 'openai';
    const prompt = buildAiPrompt(context);
    const systemMsg = 'You are a concise Pendo install troubleshooting assistant. Only rely on official Pendo documentation and avoid speculative advice.';

    let endpoint, headers, body;

    if (provider === 'claude') {
      const model = cfg.aiModel || 'claude-haiku-4-5-20251001';
      endpoint = 'https://api.anthropic.com/v1/messages';
      headers = { 'Content-Type': 'application/json', 'x-api-key': cfg.aiApiKey, 'anthropic-version': '2023-06-01' };
      body = { model, max_tokens: 1024, system: systemMsg, messages: [{ role: 'user', content: prompt }] };
    } else if (provider === 'gemini') {
      const model = cfg.aiModel || 'gemini-2.0-flash';
      endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.aiApiKey}`;
      headers = { 'Content-Type': 'application/json' };
      body = { contents: [{ parts: [{ text: systemMsg + '\n\n' + prompt }] }], generationConfig: { temperature: 0.1 } };
    } else {
      const model = cfg.aiModel || 'gpt-4o-mini';
      endpoint = cfg.aiEndpoint || 'https://api.openai.com/v1/chat/completions';
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.aiApiKey}` };
      body = { model, messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: prompt }], temperature: 0.1 };
    }

    const controller = new AbortController();
    const timeoutMs = cfg.timeoutMs || 8000;
    const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
    try {
      const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`AI request failed with status ${res.status}`);
      const data = await res.json();
      let content = '';
      if (provider === 'claude') content = data?.content?.[0]?.text || '';
      else if (provider === 'gemini') content = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      else content = data?.choices?.[0]?.message?.content || '';
      if (!content) return [];
      return content.split(/\n+/).map(t => t.replace(/^[-*]\s*/, '').trim()).filter(Boolean)
        .map(text => ({ text, source: 'ai', supportUrl: PENDO_SUPPORT.technicalSupport }));
    } catch (e) {
      clearTimeout(timer);
      console.error('AI request failed', e);
      return [{ text: 'AI suggestion unavailable: request failed or timed out. Check your API key and provider selection.', source: 'ai', supportUrl: PENDO_SUPPORT.technicalSupport }];
    }
  }

// ========== Popup UI: bind elements and event handlers ==========
  document.addEventListener('DOMContentLoaded', async () => {
    const statusEl = document.getElementById('status');
    const logsEl = document.getElementById('logs');
    const adviceEl = document.getElementById('advice');

    // ── Overlay mode: wire close button and hero drag handle ──────────────────
    // When popup.html runs inside the content.js iframe (not as a Chrome popup),
    // show the close button and relay drag/close events to the parent page via postMessage.
    // The parent (content.js) listens for these messages and manages the iframe lifecycle.
    const inIframe = window !== window.parent;
    if (inIframe) {
      const closeBtn = document.getElementById('closeBtn');
      if (closeBtn) {
        closeBtn.style.display = 'block';
        closeBtn.addEventListener('click', () => {
          // '*' is required — parent origin is an arbitrary host page
          window.parent.postMessage({ type: 'pendo-validate-close' }, '*');
        });
      }
      const heroEl = document.getElementById('hero');
      if (heroEl) {
        // Pointer capture keeps delivering pointermove/up to the hero even when the cursor
        // leaves the iframe. We use screenX/screenY (absolute screen coords) for deltas
        // because clientX/clientY shift when the parent moves the iframe under the pointer.
        heroEl.addEventListener('pointerdown', (e) => {
          if (e.target?.id === 'closeBtn') return;
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          e.preventDefault();
          const startScreenX = e.screenX;
          const startScreenY = e.screenY;
          try { heroEl.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
          window.parent.postMessage({ type: 'pendo-validate-dragstart' }, '*');

          function onMove(ev) {
            const dx = ev.screenX - startScreenX;
            const dy = ev.screenY - startScreenY;
            window.parent.postMessage({ type: 'pendo-validate-drag', dx, dy }, '*');
          }

          function teardown(ev) {
            try { heroEl.releasePointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
            heroEl.removeEventListener('pointermove', onMove);
            heroEl.removeEventListener('pointerup', teardown);
            heroEl.removeEventListener('pointercancel', teardown);
            window.parent.postMessage({ type: 'pendo-validate-dragend' }, '*');
          }

          heroEl.addEventListener('pointermove', onMove);
          heroEl.addEventListener('pointerup', teardown);
          heroEl.addEventListener('pointercancel', teardown);
        });
      }
    }

    /** Render checks (passed) and advice items into the advice list. */
    function renderAdvice(checks, adviceList) {
      adviceEl.innerHTML = '';
      (checks || []).forEach(c => {
        const li = document.createElement('li');
        li.className = 'advice-item advice-item--check';
        const icon = document.createElement('span');
        icon.className = 'advice-item__icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '✔';
        const body = document.createElement('span');
        body.textContent = c;
        li.appendChild(icon);
        li.appendChild(body);
        adviceEl.appendChild(li);
      });
      normalizeAdviceList(adviceList).forEach(a => {
        const li = document.createElement('li');
        li.className = 'advice-item advice-item--note';
        const icon = document.createElement('span');
        icon.className = 'advice-item__icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '•';
        const body = document.createElement('span');
        if (a.source === 'ai') {
          const strong = document.createElement('strong');
          strong.textContent = 'AI suggestion: ';
          body.appendChild(strong);
        }
        body.appendChild(document.createTextNode(a.text));
        li.appendChild(icon);
        li.appendChild(body);
        adviceEl.appendChild(li);
      });
    }

    /** Set text of a key-value cell by id; use "—" for null/empty. No-op if element is missing. */
    function setKV(id, value) {
      const el = document.getElementById(id);
      if (el) el.textContent = value == null || value === "" ? "—" : String(value);
    }

  let lastContext = null;

  /** Run validation on current tab (or Launcher), update status/summary/advice/logs, optionally fetch AI advice. */
  document.getElementById('run').addEventListener('click', async () => {
    activateTab(document.getElementById('tabOutputBtn'));
    setStatus(statusEl, '', 'Running…');
    adviceEl.innerHTML = '';
    logsEl.innerHTML = '';

    try {
      const res = await runInPage();
      if (!res || !res.status) {
        setStatus(statusEl, 'err', 'Failed');
        return;
      }
      const { status, captured, advice, checks, cspMeta, apiKeyFound, hasError, hasWarn, origin, pageUrl, snippetOnPage, launcherPresent, launcherAttempted, launcherDataValidated, validatedIn } = res;

      const originNote = validatedIn === 'launcher' ? ' (via Pendo Launcher)' : validatedIn === 'launcher-beta' ? ' (via Pendo Launcher Beta)' : '';

      // Status badge: explicit when snippet and Launcher both absent
      if (!snippetOnPage && launcherAttempted && launcherPresent === false) {
        setStatus(statusEl, 'err', 'Pendo not found (snippet and Launcher)');
      } else if (!snippetOnPage && launcherPresent === true && launcherDataValidated === false) {
        setStatus(statusEl, 'warn', 'Launcher installed (no data on this tab)');
      } else if (!status.pendoPresent) {
        setStatus(statusEl, 'err', 'Pendo not found' + originNote);
      } else if (!status.validatePresent) setStatus(statusEl, 'warn', 'No validateInstall()' + originNote);
      else if (captured.some(l => l.level === 'error')) setStatus(statusEl, 'err', 'Errors found' + originNote);
      else if (captured.some(l => l.level === 'warn')) setStatus(statusEl, 'warn', 'Warnings found' + originNote);
      else setStatus(statusEl, 'ok', 'Looks healthy' + originNote);

      // Page status: snippet, Launcher, validated-in context
      setKV('kv_snippet', snippetOnPage === true ? 'Yes' : snippetOnPage === false ? 'No' : '—');
      const launcherDisplay = !launcherAttempted ? 'Not checked' : launcherPresent === true ? 'Found' : 'Not found';
      setKV('kv_launcher', launcherDisplay);
      setKV('kv_launcher_validated', launcherDataValidated === true ? 'Yes' : launcherAttempted ? 'No' : '—');
      const validatedInDisplay = validatedIn === 'launcher' ? 'Pendo Launcher' : validatedIn === 'launcher-beta' ? 'Pendo Launcher Beta' : validatedIn === 'page' ? 'Page' : '—';
      setKV('kv_validated_in', validatedInDisplay);
      setKV('kv_pendo', status.pendoPresent);
      setKV('kv_validate', status.validatePresent);
      setKV('kv_version', status.version || 'unknown');
      setKV('kv_keyfound', apiKeyFound);
      setKV('kv_detected', status.detectedApiKey || 'unknown');
      setKV('kv_visitor', status.visitorId || 'not set');
      setKV('kv_account', (status.accountId==null?'not set':status.accountId));
      setKV('kv_visitor_meta', status.visitorMetadata ? JSON.stringify(status.visitorMetadata, null, 1) : '—');
      setKV('kv_account_meta', status.accountMetadata ? JSON.stringify(status.accountMetadata, null, 1) : '—');
      setKV('kv_hits', status.resourceHits.length);
      setKV('kv_lines', captured.length);

      let adviceList = normalizeAdviceList(advice);
      let checksToRender = (checks || []).slice();
      if (validatedIn === 'launcher' || validatedIn === 'launcher-beta') {
        checksToRender.push('Pendo Launcher (browser extension) present and validated.');
      }
      if (snippetOnPage === false && launcherPresent === false && launcherAttempted) {
        adviceList = adviceList.concat([{ text: 'Ensure the snippet is installed on this page, or open the Pendo Launcher (or Beta) extension in a tab.', source: 'builtin', supportKey: 'installGuide' }]);
      }
      renderAdvice(checksToRender, adviceList);

      if (captured.length === 0) {
        logsEl.innerHTML = `<div class="muted">No output captured. If you’re on a SPA, try a page where Pendo loads, or reload and run again.</div>`;
      } else {
        captured.forEach(({ level, text }) => {
          const div = document.createElement('div');
          const badgeClass = level === 'error' ? 'err' : level === 'warn' ? 'warn' : 'ok';
          div.className = `log-line ${badgeClass}`;
          const badge = document.createElement('span');
          badge.className = `badge ${badgeClass}`;
          badge.textContent = level;
          const msg = document.createElement('span');
          msg.className = 'log-text';
          msg.textContent = text;
          div.appendChild(badge);
          div.appendChild(msg);
          logsEl.appendChild(div);
        });
      }

      // Build report context (include two-phase fields for export)
      lastContext = {
        pageUrl: pageUrl || 'unknown',
        timestamp: toIso(new Date()),
        status, captured, advice: adviceList, checks: checksToRender, cspMeta: cspMeta || '', apiKeyFound, origin: validatedIn || origin || 'page',
        hasError: !!hasError, hasWarn: !!hasWarn,
        snippetOnPage, launcherPresent, launcherAttempted, launcherDataValidated: !!launcherDataValidated, validatedIn: validatedIn || 'page', launcherUrl: res.launcherUrl
      };

      const failureDetected = !status.validatePresent || hasError || hasWarn;
      if (failureDetected) {
        const aiAdvice = await requestAiAdvice(lastContext);
        if (aiAdvice && aiAdvice.length) {
          adviceList = adviceList.concat(aiAdvice);
          lastContext.advice = adviceList;
          renderAdvice(checksToRender, adviceList);
        }
      }
    } catch (e) {
      setStatus(statusEl, 'err', 'Failed');
      console.error(e);
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

  /** Enable Pendo Debugger: calls pendo.enableDebugging() in the page. See https://web-sdk.pendo.io/public/debugging/ */
  document.getElementById('launchDebugger').addEventListener('click', async () => {
    const statusEl = document.getElementById('status');
    setStatus(statusEl, '', '…');
    const res = await runInActiveTab(enableDebuggingInPage);
    if (res.ok) setStatus(statusEl, 'ok', 'Debugger enabled');
    else setStatus(statusEl, 'err', res.message || 'Failed');
  });


  /** Export last run as Markdown report file. */
  document.getElementById('exportMd').addEventListener('click', async () => {
    if (!lastContext) return;
    try {
      const md = buildMarkdownReport(lastContext);
      const host = (()=>{ try { return (new URL(lastContext.pageUrl)).host; } catch { return 'page'; } })().replace(/[^a-z0-9\.-]/gi,'_');
      const fname = `pendo-validate-report_${host}_${Date.now()}.md`;
      downloadBlob(fname, 'text/markdown', md);
    } catch (e) { console.error(e); }
  });
  /** Export last run as raw JSON file. */
  document.getElementById('exportJson').addEventListener('click', async () => {
    if (!lastContext) return;
    try {
      const j = buildJsonReport(lastContext);
      const host = (()=>{ try { return (new URL(lastContext.pageUrl)).host; } catch { return 'page'; } })().replace(/[^a-z0-9\.-]/gi,'_');
      const fname = `pendo-validate-report_${host}_${Date.now()}.json`;
      downloadBlob(fname, 'application/json', j);
    } catch (e) { console.error(e); }
  });

  /** Clipboard API is blocked by Permissions Policy in some extension contexts (see crbug.com/414348233); execCommand fallback works with user gesture. */
  async function copyTextToClipboard(text) {
    const payload = text ?? '';
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(payload);
        return 'clipboard-api';
      }
    } catch (_) {
      // Fall through to execCommand fallback
    }
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

  /** Copy advice list text to clipboard (prefer structured data; DOM li.textContent can merge icon + body). */
  document.getElementById('copyAdvice').onclick = () => {
    let items = '';
    if (lastContext) {
      const lines = [];
      (lastContext.checks || []).forEach((c) => lines.push(`${c}`));
      normalizeAdviceList(lastContext.advice || []).forEach((a) => lines.push(a.text));
      items = lines.join('\n');
    } else {
      items = Array.from(adviceEl.querySelectorAll('li')).map((li) => li.innerText.trim()).join('\n\n');
    }
    copyTextToClipboard(items || 'No advice.').catch((err) => console.warn('Copy advice failed:', err));
  };
  /** Copy captured log lines to clipboard (explicit [level] lines — parent textContent merges badge+body into "infoMessage"). */
  document.getElementById('copyLogs').onclick = () => {
    let all = '';
    if (lastContext && Array.isArray(lastContext.captured) && lastContext.captured.length) {
      all = lastContext.captured.map(({ level, text }) => `[${level}] ${text}`).join('\n');
    } else {
      all = Array.from(document.querySelectorAll('#logs .log-line')).map((div) => {
        const levEl = div.querySelector(':scope > .badge');
        const msgEl = div.querySelector(':scope > .log-text');
        const level = levEl ? levEl.textContent.trim() : 'log';
        const text = msgEl ? msgEl.textContent.trim() : div.textContent.trim();
        return `[${level}] ${text}`;
      }).join('\n');
    }
    copyTextToClipboard(all || 'No logs captured.').catch((err) => console.warn('Copy logs failed:', err));
  };

  // --- Tab strip controller ---
  const tabBtns = Array.from(document.querySelectorAll('.tabs__btn'));
  const tabPanels = Array.from(document.querySelectorAll('.tab-panel'));
  function activateTab(btn) {
    if (!btn) return;
    const targetId = btn.getAttribute('aria-controls');
    tabBtns.forEach(b => b.setAttribute('aria-selected', b === btn ? 'true' : 'false'));
    tabPanels.forEach(p => { p.hidden = p.id !== targetId; });
  }
  tabBtns.forEach(btn => btn.addEventListener('click', () => activateTab(btn)));

  // --- AI Settings panel ---
  const aiPanel = document.getElementById('aiSettingsPanel');
  const aiProviderSelect = document.getElementById('aiProviderSelect');
  const aiApiKeyInput = document.getElementById('aiApiKeyInput');
  const aiKeyToggle = document.getElementById('aiKeyToggleVisibility');
  const aiSaveBtn = document.getElementById('aiSettingsSave');
  const aiSaveStatus = document.getElementById('aiSettingsStatus');

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
      setTimeout(() => { aiSaveStatus.textContent = ''; }, 2000);
    });
  });
});
