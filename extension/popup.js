/**
 * Pendo Validate — popup script.
 * Runs validation in the active tab (or Pendo Launcher fallback), shows advice, and supports export/copy.
 */

// ========== Pendo visitor ID (persistent UUID in extension storage) ==========
const PENDO_VISITOR_ID_KEY = 'pendoVisitorId';

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
  const { pageUrl, timestamp, status, captured, advice, checks, cspMeta, apiKeyFound, origin, snippetOnPage, launcherPresent, launcherAttempted, validatedIn, launcherUrl } = context;
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
/** Launch Visual Design Studio (VDS) via pendo.designerv2.launchInAppDesigner(). See https://support.pendo.io/hc/en-us/articles/360031864732 */
function launchVisualDesignStudioInPage() {
  const pendo = (typeof window !== 'undefined' && (window.pendo || window.Pendo)) || null;
  if (!pendo) return { ok: false, message: 'Pendo not found on this page.' };
  const designer = pendo.designerv2 || pendo.designer;
  if (!designer || typeof designer.launchInAppDesigner !== 'function') {
    return { ok: false, message: 'Visual Design Studio (designerv2.launchInAppDesigner) not available on this agent.' };
  }
  try {
    designer.launchInAppDesigner();
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

    // Resolve Pendo agent and validate function (page uses pendo.validateInstall; Launcher/Beta may use validateInstallation or validateInstall)
    const isLauncher = variant === 'launcher' || variant === 'launcher-beta';
    const agent = isLauncher ? ((window && (window.Pendo || window.pendo)) || null) : ((window && window.pendo) || null);
    const validateFn = isLauncher
      ? (agent && (agent.validateInstall || agent.validateInstallation)) || null
      : (agent && agent.validateInstall) || null;

    const status = {
      pendoPresent: !!agent,
      validatePresent: typeof validateFn === 'function',
      version: null,
      detectedApiKey: null,
      visitorId: null,
      accountId: null,
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
        captured.push({ level: 'warn', text: 'Pendo Launcher found but validateInstall/validateInstallation is unavailable.' });
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

    if (advice.length === 0 && checks.length > 0) advice.push({ text: "Installation looks healthy based on current checks.", source: 'builtin', supportKey: 'helpCenter' });
    else if (advice.length === 0) advice.push({ text: "Review the output below and compare with a known-good page. Check initialise timing and data mapping.", source: 'builtin', supportKey: 'spa' });

    if (variant === 'launcher') {
      captured.unshift({ level: 'info', text: 'Validated via Pendo Launcher window.' });
    } else if (variant === 'launcher-beta') {
      captured.unshift({ level: 'info', text: 'Validated via Pendo Launcher (Beta) window.' });
    }

    return { status, captured, advice, checks, cspMeta, apiKeyFound, hasError, hasWarn };
  }

  async function findLauncherTab() {
    const hasTabsPermission = !chrome.permissions || !chrome.permissions.contains
      ? true
      : await chrome.permissions.contains({ permissions: ['tabs'] });
    if (!hasTabsPermission) {
      console.warn('Tabs permission unavailable; skipping launcher search.');
      return null;
    }
    async function searchWithPatterns(patterns = []) {
      try {
        const wins = await chrome.windows.getAll({ populate: true });
        for (const w of wins) {
          for (const t of (w.tabs || [])) {
            const title = (t.title || '').toLowerCase();
            const url = (t.url || '').toLowerCase();
            if (patterns.some(re => re.test(title) || re.test(url))) {
              // Skip chrome-extension:// and chrome:// URLs — executeScript cannot inject into other extensions' pages
              if (!url.startsWith('chrome-extension://') && !url.startsWith('chrome://') && !url.startsWith('about:')) {
                return t;
              }
            }
          }
        }
      } catch (e) {
        console.error('Failed to search for launcher window', e);
      }
      return null;
    }
    // Pendo Launcher (Beta) extension ID — used as a title/URL pattern for any web-based tab opened by the extension
    const PENDO_LAUNCHER_BETA_EXTENSION_ID = 'ggbfghmbjlgbagomdlifpdflpeafbekl';
    const betaIdPattern = new RegExp(PENDO_LAUNCHER_BETA_EXTENSION_ID, 'i');
    // Prefer Beta first so "Pendo Launcher (Beta)" is not matched as standard
    const beta = await searchWithPatterns([
      betaIdPattern,
      /pendo launcher\s*\(\s*beta\s*\)/i,
      /pendo launcher beta/i,
      /pendo-launcher-beta/i,
      /launcher beta/i,
      /pendo.*beta.*launcher/i,
      /launcher.*beta/i
    ]);
    if (beta) return { tab: beta, variant: 'launcher-beta' };
    const standard = await searchWithPatterns([/pendo launcher/i, /pendo-launcher/i]);
    if (standard) return { tab: standard, variant: 'launcher' };
    return null;
  }

  const EMPTY_RESULT = {
    status: { pendoPresent: false, validatePresent: false, version: null, detectedApiKey: null, visitorId: null, accountId: null, resourceHits: [] },
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

  if (snippetOnPage) {
    return {
      ...pageResult,
      pageUrl: basePageUrl,
      snippetOnPage: true,
      launcherAttempted: false,
      launcherPresent: undefined,
      validatedIn: 'page',
      origin: 'page'
    };
  }

  // Phase 1.5: Snippet absent — check same active tab for window.Pendo injected by the Launcher extension
  try {
    const [{ result: launcherInPageResult }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: captureAndInspect,
      args: ['launcher']
    });
    if (launcherInPageResult && launcherInPageResult.status && launcherInPageResult.status.pendoPresent) {
      return {
        ...launcherInPageResult,
        pageUrl: basePageUrl,
        snippetOnPage: false,
        launcherAttempted: true,
        launcherPresent: true,
        validatedIn: 'launcher',
        launcherUrl: basePageUrl,
        origin: 'launcher'
      };
    }
  } catch (e) {
    console.warn('Phase 1.5 launcher-in-page check failed:', e);
  }

  // Phase 2: Snippet absent and no Launcher agent on active tab — search for a separate Launcher tab
  const launcherLookup = await findLauncherTab();
  const launcherTab = launcherLookup && launcherLookup.tab;
  const launcherVariant = launcherLookup && launcherLookup.variant ? launcherLookup.variant : 'launcher';

  if (!launcherTab) {
    const base = pageResult || EMPTY_RESULT;
    base.captured = (base.captured || []).concat([{ level: 'info', text: 'Pendo Launcher window not found. Also checked the Pendo Launcher (Beta) extension.' }]);
    return {
      ...base,
      pageUrl: basePageUrl,
      snippetOnPage: false,
      launcherAttempted: true,
      launcherPresent: false,
      validatedIn: 'page',
      origin: 'page'
    };
  }

  // Run in Launcher tab without changing focus (no chrome.windows.update / chrome.tabs.update)
  let launcherResult = null;
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: launcherTab.id },
      world: 'MAIN',
      func: captureAndInspect,
      args: [launcherVariant]
    });
    launcherResult = result;
  } catch (e) {
    console.warn('Phase 2 launcher tab injection failed:', e);
  }

  const fallback = launcherResult || pageResult || EMPTY_RESULT;
  return {
    ...fallback,
    pageUrl: basePageUrl,
    snippetOnPage: false,
    launcherAttempted: true,
    launcherPresent: true,
    validatedIn: launcherResult ? launcherVariant : 'page',
    launcherUrl: launcherTab.url,
    origin: launcherResult ? launcherVariant : 'page'
  };
}

// ========== AI advice (optional) ==========
/** Read AI config from chrome.storage.local: aiEndpoint, aiApiKey, aiModel. Used for optional ChatGPT-powered advice. */
async function getAiConfig() {
    return new Promise(resolve => {
      try {
        if (!chrome.storage || !chrome.storage.local) return resolve({});
        chrome.storage.local.get({ aiEndpoint: '', aiApiKey: '', aiModel: 'gpt-4o-mini' }, resolve);
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
    if (!cfg.aiEndpoint || !cfg.aiApiKey) return [];

    const body = {
      model: cfg.aiModel || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a concise Pendo install troubleshooting assistant. Only rely on official Pendo documentation and avoid speculative advice.' },
        { role: 'user', content: buildAiPrompt(context) }
      ],
      temperature: 0.1
    };

    const controller = new AbortController();
    const timeoutMs = cfg.timeoutMs || 8000;
    const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
    try {
      const res = await fetch(cfg.aiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.aiApiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`AI request failed with status ${res.status}`);
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content || '';
      if (!content) return [];
      return content.split(/\n+/).map(t => t.replace(/^[-*]\s*/, '').trim()).filter(Boolean).map(text => ({ text, source: 'ai', supportUrl: PENDO_SUPPORT.technicalSupport }));
    } catch (e) {
      clearTimeout(timer);
      console.error('AI request failed', e);
      return [{ text: 'AI suggestion unavailable: request failed or timed out. Check API key/endpoint configuration.', source: 'ai', supportUrl: PENDO_SUPPORT.technicalSupport }];
    }
  }

// ========== Popup UI: bind elements and event handlers ==========
  document.addEventListener('DOMContentLoaded', async () => {
    const statusEl = document.getElementById('status');
    const logsEl = document.getElementById('logs');
    const adviceEl = document.getElementById('advice');

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
    setStatus(statusEl, '', 'Running…');
    adviceEl.innerHTML = '';
    logsEl.innerHTML = '';

    try {
      const res = await runInPage();
      if (!res || !res.status) {
        setStatus(statusEl, 'err', 'Failed');
        return;
      }
      const { status, captured, advice, checks, cspMeta, apiKeyFound, hasError, hasWarn, origin, pageUrl, snippetOnPage, launcherPresent, launcherAttempted, validatedIn } = res;

      const originNote = validatedIn === 'launcher' ? ' (via Pendo Launcher)' : validatedIn === 'launcher-beta' ? ' (via Pendo Launcher Beta)' : '';
      const hasPositiveSignals = !!(status.visitorId || apiKeyFound || (status.detectedApiKey && status.pendoPresent));

      // Status badge: explicit when snippet and Launcher both absent
      if (!snippetOnPage && launcherAttempted && launcherPresent === false) {
        setStatus(statusEl, 'err', 'Pendo not found (snippet and Launcher)');
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
      const validatedInDisplay = validatedIn === 'launcher' ? 'Pendo Launcher' : validatedIn === 'launcher-beta' ? 'Pendo Launcher Beta' : validatedIn === 'page' ? 'Page' : '—';
      setKV('kv_validated_in', validatedInDisplay);
      setKV('kv_pendo', status.pendoPresent);
      setKV('kv_validate', status.validatePresent);
      setKV('kv_version', status.version || 'unknown');
      setKV('kv_keyfound', apiKeyFound);
      setKV('kv_detected', status.detectedApiKey || 'unknown');
      setKV('kv_visitor', status.visitorId || 'not set');
      setKV('kv_account', (status.accountId==null?'not set':status.accountId));
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
        snippetOnPage, launcherPresent, launcherAttempted, validatedIn: validatedIn || 'page', launcherUrl: res.launcherUrl
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

  /** Launch Visual Design Studio (VDS): calls pendo.designerv2.launchInAppDesigner() in the page. */
  document.getElementById('launchVds').addEventListener('click', async () => {
    const statusEl = document.getElementById('status');
    setStatus(statusEl, '', '…');
    const res = await runInActiveTab(launchVisualDesignStudioInPage);
    if (res.ok) setStatus(statusEl, 'ok', 'VDS launched');
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

  /** Copy advice list text to clipboard. */
  document.getElementById('copyAdvice').onclick = () => {
    const items = Array.from(adviceEl.querySelectorAll('li')).map(li => `• ${li.textContent}`).join('\\n');
    navigator.clipboard.writeText(items || 'No advice.');
  };
  /** Copy captured log lines to clipboard. */
  document.getElementById('copyLogs').onclick = () => {
    const all = Array.from(document.querySelectorAll('#logs .log-line')).map(div => div.textContent.trim()).join('\\n');
    navigator.clipboard.writeText(all || 'No logs captured.');
  };
});
