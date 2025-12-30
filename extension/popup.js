
function setStatus(el, cls, text) {
  el.className = `badge ${cls}`;
  el.textContent = text;
}
function toIso(dt=new Date()) { return dt.toISOString(); }

function buildMarkdownReport(context) {
  const { pageUrl, timestamp, status, captured, advice, checks, cspMeta, apiKeyFound } = context;
  const lines = [];
  lines.push(`# Pendo Validate Report`);
  lines.push("");
  lines.push(`- **Page URL:** ${pageUrl}`);
  lines.push(`- **Timestamp:** ${timestamp}`);
  lines.push("");
  lines.push(`## Summary`);
  lines.push(`- Pendo present: ${status.pendoPresent}`);
  lines.push(`- validateInstall present: ${status.validatePresent}`);
  lines.push(`- Agent version: ${status.version || 'unknown'}`);
  lines.push(`- API key found: ${apiKeyFound}`);
  lines.push(`- Detected API key: ${status.detectedApiKey || 'unknown'}`);
  lines.push(`- VisitorId: ${status.visitorId || 'not set'}`);
  lines.push(`- AccountId: ${status.accountId==null?'not set':status.accountId}`);
  lines.push(`- Pendo resource hits: ${status.resourceHits ? status.resourceHits.length : 0}`);
  lines.push("");
  if (status.resourceHits && status.resourceHits.length) {
    lines.push(`### Observed Pendo resources`);
    status.resourceHits.forEach((r,i)=>{
      lines.push(`- [${i+1}] ${r.initiatorType || 'resource'}: ${r.name}`);
    });
    lines.push("");
  }
  if (cspMeta) {
    lines.push(`### Meta CSP`);
    lines.push("```");
    lines.push(cspMeta);
    lines.push("```");
    lines.push("");
  }
  if (checks && checks.length) {
    lines.push(`## Checks Passed`);
    checks.forEach(c => lines.push(`- ${c}`));
    lines.push("");
  }
  if (advice && advice.length) {
    lines.push(`## Advice`);
    advice.forEach(a => lines.push(`- ${a}`));
    lines.push("");
  }
  lines.push(`## Captured Output`);
  if (!captured || !captured.length) lines.push(`No output captured.`);
  else captured.forEach(l => lines.push(`- [${l.level}] ${l.text}`));
  lines.push("");
  return lines.join("\n");
}
function buildJsonReport(context) { return JSON.stringify(context, null, 2); }
function downloadBlob(filename, mime, text) {
  const blob = new Blob([text], {type: mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

async function runInPage() {
  function captureAndInspect() {
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

    const status = {
      pendoPresent: !!(window && window.pendo),
      validatePresent: !!(window && window.pendo && typeof window.pendo.validateInstall === 'function'),
      version: null,
      detectedApiKey: null,
      visitorId: null,
      accountId: null,
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
        status.version = (window.pendo.getVersion && window.pendo.getVersion()) || window.pendo.VERSION || null;
        const opt = (window.pendo._ && (window.pendo._.options || window.pendo._.apiKey)) || null;
        if (opt && typeof opt === 'object' && opt.apiKey) status.detectedApiKey = opt.apiKey;
        if (typeof window.pendo.apiKey === 'string') status.detectedApiKey = window.pendo.apiKey;
        const state = window.pendo && window.pendo._ && window.pendo._.state;
        if (state && state.visitorId) status.visitorId = state.visitorId;
        if (state && state.accountId) status.accountId = state.accountId;
        if (!status.visitorId && window.pendo.getVisitorId) { try { status.visitorId = window.pendo.getVisitorId(); } catch {} }
        if (!status.accountId && window.pendo.getAccountId) { try { status.accountId = window.pendo.getAccountId(); } catch {} }
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
      if (status.validatePresent) window.pendo.validateInstall();
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

    const advice = [];
    const checks = [];

    if (!status.pendoPresent) {
      advice.push("Pendo agent not detected. Ensure the snippet is installed and loads on this URL. Verify CSP and network allow Pendo domains.");
    } else if (!status.validatePresent) {
      advice.push("Pendo found, but validateInstall() is unavailable. The agent may be customised or outdated. Update to a supported agent.");
    }

    if (apiKeyFound) checks.push("API key found in output or agent data.");
    else advice.push("No API key detected. Verify the correct agent is loading and that the snippet references your subscription key.");

    if (status.pendoPresent) {
      if (!status.visitorId) advice.push("Visitor identity is not set. Call pendo.initialize with a visitorId after authentication.");
      else checks.push("visitorId present.");
      if (status.accountId == null) advice.push("accountId not found. If you use accounts, provide accountId in pendo.initialize.");
      else checks.push("accountId present.");
    }

    const needsDomains = ["pendo.io", "cdn.pendo.io", "data.pendo.io"];
    if (cspMeta) {
      const lc = cspMeta.toLowerCase();
      needsDomains.forEach(d => {
        if (!lc.includes(d)) {
          advice.push(`CSP meta tag may be missing '${d}'. Ensure script-src and connect-src allow required Pendo domains.`);
        }
      });
    } else if (/content security policy|refused to connect|blocked by csp/i.test(all)) {
      advice.push("CSP is blocking Pendo. Add required Pendo domains to script-src and connect-src.");
    }

    if (status.resourceHits.length === 0 && status.pendoPresent) {
      advice.push("No Pendo network resources observed. If using a deferred or self-hosted setup, ensure agent requests are not blocked.");
    }

    if (status.validatePresent && !hasError && !hasWarn && captured.length > 0) {
      checks.push("validateInstall() produced no warnings or errors.");
    }

    if (advice.length === 0 && checks.length > 0) advice.push("Installation looks healthy based on current checks.");
    else if (advice.length === 0) advice.push("Review the output below and compare with a known-good page. Check initialise timing and data mapping.");

    return { status, captured, advice, checks, cspMeta, apiKeyFound };
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: captureAndInspect
  });
  return result;
}

document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  const logsEl = document.getElementById('logs');
  const adviceEl = document.getElementById('advice');

  function setKV(id, value) {
    document.getElementById(id).textContent = value == null || value === "" ? "—" : String(value);
  }

  let lastContext = null;

  document.getElementById('run').addEventListener('click', async () => {
    setStatus(statusEl, '', 'Running…');
    adviceEl.innerHTML = '';
    logsEl.innerHTML = '';

    try {
      const res = await runInPage();
      const { status, captured, advice, checks, cspMeta, apiKeyFound } = res;

      if (!status.pendoPresent) setStatus(statusEl, 'err', 'Pendo not found');
      else if (!status.validatePresent) setStatus(statusEl, 'warn', 'No validateInstall()');
      else if (captured.some(l => l.level === 'error')) setStatus(statusEl, 'err', 'Errors found');
      else if (captured.some(l => l.level === 'warn')) setStatus(statusEl, 'warn', 'Warnings found');
      else setStatus(statusEl, 'ok', 'Looks healthy');

      setKV('kv_pendo', status.pendoPresent);
      setKV('kv_validate', status.validatePresent);
      setKV('kv_version', status.version || 'unknown');
      setKV('kv_keyfound', apiKeyFound);
      setKV('kv_detected', status.detectedApiKey || 'unknown');
      setKV('kv_visitor', status.visitorId || 'not set');
      setKV('kv_account', (status.accountId==null?'not set':status.accountId));
      setKV('kv_hits', status.resourceHits.length);
      setKV('kv_lines', captured.length);

      // Advice and checks
      checks && checks.forEach(c => {
        const li = document.createElement('li');
        li.className = 'advice-item advice-item--check';
        li.innerHTML = `<span class="advice-item__icon" aria-hidden="true">✔</span><span>${c}</span>`;
        adviceEl.appendChild(li);
      });
      advice.forEach(a => {
        const li = document.createElement('li');
        li.className = 'advice-item advice-item--note';
        li.innerHTML = `<span class="advice-item__icon" aria-hidden="true">•</span><span>${a}</span>`;
        adviceEl.appendChild(li);
      });

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
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      lastContext = {
        pageUrl: tab && tab.url ? tab.url : 'unknown',
        timestamp: toIso(new Date()),
        status, captured, advice, checks, cspMeta: cspMeta || '', apiKeyFound
      };
    } catch (e) {
      setStatus(statusEl, 'err', 'Failed');
      console.error(e);
    }
  });

  // Export buttons
  document.getElementById('exportMd').addEventListener('click', async () => {
    if (!lastContext) return;
    try {
      const md = buildMarkdownReport(lastContext);
      const host = (()=>{ try { return (new URL(lastContext.pageUrl)).host; } catch { return 'page'; } })().replace(/[^a-z0-9\.-]/gi,'_');
      const fname = `pendo-validate-report_${host}_${Date.now()}.md`;
      downloadBlob(fname, 'text/markdown', md);
    } catch (e) { console.error(e); }
  });
  document.getElementById('exportJson').addEventListener('click', async () => {
    if (!lastContext) return;
    try {
      const j = buildJsonReport(lastContext);
      const host = (()=>{ try { return (new URL(lastContext.pageUrl)).host; } catch { return 'page'; } })().replace(/[^a-z0-9\.-]/gi,'_');
      const fname = `pendo-validate-report_${host}_${Date.now()}.json`;
      downloadBlob(fname, 'application/json', j);
    } catch (e) { console.error(e); }
  });

  // Copy buttons
  document.getElementById('copyAdvice').onclick = () => {
    const items = Array.from(adviceEl.querySelectorAll('li')).map(li => `• ${li.textContent}`).join('\\n');
    navigator.clipboard.writeText(items || 'No advice.');
  };
  document.getElementById('copyLogs').onclick = () => {
    const all = Array.from(document.querySelectorAll('#logs .log-line')).map(div => div.textContent.trim()).join('\\n');
    navigator.clipboard.writeText(all || 'No logs captured.');
  };
});
