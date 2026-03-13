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
  const { pageUrl, timestamp, status, captured, advice, checks, cspMeta, apiKeyFound, origin } = context;
  const adviceList = normalizeAdviceList(advice || []);
  const errors = (captured || []).filter(l => l.level === 'error');
  const hasError = errors.length > 0 || (context.hasError === true);
  const hasWarn = (captured || []).some(l => l.level === 'warn') || (context.hasWarn === true);
  let statusLine = 'Looks healthy';
  if (!status.pendoPresent) statusLine = 'Pendo not found';
  else if (!status.validatePresent) statusLine = 'No validateInstall()';
  else if (hasError) statusLine = 'Errors found';
  else if (hasWarn) statusLine = 'Warnings found';
  if (origin === 'launcher') statusLine += ' (via Pendo Launcher)';
  else if (origin === 'launcher-beta') statusLine += ' (via Pendo Launcher Beta)';

  const lines = [];
  lines.push(`# Pendo Validate Report`);
  lines.push("");
  lines.push(`Share this file with support or use the links below for official Pendo guidance.`);
  lines.push("");
  lines.push(`- **Page URL:** ${pageUrl}`);
  lines.push(`- **Timestamp:** ${timestamp}`);
  lines.push(`- **Status:** ${statusLine}`);
  lines.push("");
  lines.push(`## Metadata`);
  const meta = {
    pageUrl,
    timestamp,
    origin: origin || 'page',
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
 * Run validation: execute captureAndInspect in the active tab (MAIN world).
 * Step 1: run in active tab. Step 2: if Pendo not present, find Pendo Launcher (or Beta) tab and run there; merge result back.
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

    // Resolve Pendo agent and validate function (page uses pendo.validateInstall; Launcher may use validateInstallation)
    const agent = variant === 'launcher' ? ((window && (window.Pendo || window.pendo)) || null) : ((window && window.pendo) || null);
    const validateFn = variant === 'launcher' ? (agent && agent.validateInstallation) : (agent && agent.validateInstall);

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
      } else if (variant === 'launcher') {
        captured.push({ level: 'warn', text: 'Pendo Launcher found but validateInstallation() is unavailable.' });
      }
    } catch (e) {
      captured.push({ level: 'error', text: e && e.message ? e.message : String(e) });
    } finally {
      console.log = original.log; console.warn = original.warn;
      console.error = original.error; console.info = original.info;
    }

    // Determine API key presence: from output text OR detected data
    const all = captured.map(m => m.text).join('\\n');
    const keyRegex = /\\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\\b/i;
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
    }

    return { status, captured, advice, checks, cspMeta, apiKeyFound, hasError, hasWarn };
  }

  // 1) Run captureAndInspect in the current tab (MAIN world)
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [{ result: pageResult }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: captureAndInspect
  });

  if (pageResult && pageResult.status && pageResult.status.pendoPresent) {
    return { ...pageResult, origin: 'page', pageUrl: tab && tab.url ? tab.url : 'unknown', launcherAttempted: false };
  }

  // 2) Pendo not on current page: try to find a Pendo Launcher (or Beta) tab and run there
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
              return t;
            }
          }
        }
      } catch (e) {
        console.error('Failed to search for launcher window', e);
      }
      return null;
    }

    const standard = await searchWithPatterns([/pendo launcher/, /pendo-launcher/]);
    if (standard) return { tab: standard, variant: 'launcher' };
    const beta = await searchWithPatterns([/pendo launcher \(beta\)/, /pendo-launcher-beta/, /launcher beta/]);
    if (beta) return { tab: beta, variant: 'launcher-beta' };

    return null;
  }

  const launcherLookup = await findLauncherTab();
    const launcherTab = launcherLookup && launcherLookup.tab;
    const launcherVariant = launcherLookup && launcherLookup.variant ? launcherLookup.variant : 'launcher';
    if (!launcherTab) {
      const base = pageResult || { status: { pendoPresent: false, validatePresent: false, version: null, detectedApiKey: null, visitorId: null, accountId: null, resourceHits: [] }, captured: [], advice: [], checks: [], cspMeta: '', apiKeyFound: false, hasError: true, hasWarn: false };
      base.captured = (base.captured || []).concat([{ level: 'info', text: 'Pendo Launcher window not found. Also checked the Pendo Launcher (Beta) extension.' }]);
      return { ...base, origin: 'page', pageUrl: tab && tab.url ? tab.url : 'unknown', launcherAttempted: true, launcherFound: false };
    }

  try {
    if (launcherTab.windowId) await chrome.windows.update(launcherTab.windowId, { focused: true });
    await chrome.tabs.update(launcherTab.id, { active: true });
  } catch (e) {
    console.warn('Could not focus launcher tab', e);
  }

  const [{ result: launcherResult }] = await chrome.scripting.executeScript({
    target: { tabId: launcherTab.id },
    world: "MAIN",
      func: captureAndInspect,
      args: [launcherVariant === 'launcher-beta' ? 'launcher' : launcherVariant]
    });

  const fallback = launcherResult || pageResult || { status: { pendoPresent: false, validatePresent: false, version: null, detectedApiKey: null, visitorId: null, accountId: null, resourceHits: [] }, captured: [], advice: [], checks: [], cspMeta: '', apiKeyFound: false, hasError: true, hasWarn: false };
  return { ...fallback, origin: launcherResult ? launcherVariant : 'page', pageUrl: launcherTab && launcherTab.url ? launcherTab.url : (tab && tab.url ? tab.url : 'unknown'), launcherAttempted: true, launcherFound: !!launcherResult };
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
        li.innerHTML = `<span class="advice-item__icon" aria-hidden="true">✔</span><span>${c}</span>`;
        adviceEl.appendChild(li);
      });
      normalizeAdviceList(adviceList).forEach(a => {
        const li = document.createElement('li');
        li.className = 'advice-item advice-item--note';
        const label = a.source === 'ai' ? '<strong>AI suggestion:</strong> ' : '';
        li.innerHTML = `<span class="advice-item__icon" aria-hidden="true">•</span><span>${label}${a.text}</span>`;
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
      const { status, captured, advice, checks, cspMeta, apiKeyFound, hasError, hasWarn, origin, pageUrl } = res;

      const originNote = origin === 'launcher' ? ' (via Pendo Launcher)' : origin === 'launcher-beta' ? ' (via Pendo Launcher Beta)' : '';
      const hasPositiveSignals = !!(status.visitorId || apiKeyFound || (status.detectedApiKey && status.pendoPresent));

      if (!status.pendoPresent) setStatus(statusEl, 'err', 'Pendo not found' + originNote);
      else if (!status.validatePresent) setStatus(statusEl, 'warn', 'No validateInstall()' + originNote);
      else if (captured.some(l => l.level === 'error')) setStatus(statusEl, 'err', 'Errors found' + originNote);
      else if (captured.some(l => l.level === 'warn')) setStatus(statusEl, 'warn', 'Warnings found' + originNote);
      else if (hasPositiveSignals) setStatus(statusEl, 'ok', 'Looks healthy' + originNote);
      else setStatus(statusEl, 'ok', 'Looks healthy' + originNote);

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
      renderAdvice(checks, adviceList);

      if (captured.length === 0) {
        logsEl.innerHTML = `<div class="muted">No output captured. If you’re on a SPA, try a page where Pendo loads, or reload and run again.</div>`;
      } else {
        captured.forEach(({ level, text }) => {
          const div = document.createElement('div');
          const badgeClass = level === 'error' ? 'err' : level === 'warn' ? 'warn' : 'ok';
          div.className = `log-line ${badgeClass}`;
          div.innerHTML = `<span class="badge ${badgeClass}">${level}</span><span class="log-text">${text}</span>`;
          logsEl.appendChild(div);
        });
      }

      // Build report context
      lastContext = {
        pageUrl: pageUrl || 'unknown',
        timestamp: toIso(new Date()),
        status, captured, advice: adviceList, checks, cspMeta: cspMeta || '', apiKeyFound, origin: origin || 'page',
        hasError: !!hasError, hasWarn: !!hasWarn
      };

      const failureDetected = !status.validatePresent || hasError || hasWarn;
      if (failureDetected) {
        const aiAdvice = await requestAiAdvice(lastContext);
        if (aiAdvice && aiAdvice.length) {
          adviceList = adviceList.concat(aiAdvice);
          lastContext.advice = adviceList;
          renderAdvice(checks, adviceList);
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
