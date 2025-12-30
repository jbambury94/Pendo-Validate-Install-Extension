
function setStatus(el, cls, text) {
  el.className = `badge ${cls}`;
  el.textContent = text;
}
function toIso(dt=new Date()) { return dt.toISOString(); }

function normalizeAdviceList(advice = []) {
  return advice.map(a => {
    if (typeof a === 'string') return { text: a, source: 'builtin' };
    if (a && typeof a === 'object') return { text: a.text || '', source: a.source || 'builtin' };
    return { text: String(a), source: 'builtin' };
  }).filter(a => a.text);
}

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
  const adviceList = normalizeAdviceList(advice);
  if (adviceList && adviceList.length) {
    lines.push(`## Advice`);
    adviceList.forEach(a => {
      const prefix = a.source === 'ai' ? '[AI] ' : '';
      lines.push(`- ${prefix}${a.text}`);
    });
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

    const advice = [];
    const checks = [];

    if (!status.pendoPresent) {
      advice.push({ text: "Pendo agent not detected. Ensure the snippet is installed and loads on this URL. Verify CSP and network allow Pendo domains.", source: 'builtin' });
    } else if (!status.validatePresent) {
      advice.push({ text: "Pendo found, but validateInstall() is unavailable. The agent may be customised or outdated. Update to a supported agent.", source: 'builtin' });
    }

    if (apiKeyFound) checks.push("API key found in output or agent data.");
    else advice.push({ text: "No API key detected. Verify the correct agent is loading and that the snippet references your subscription key.", source: 'builtin' });

    if (status.pendoPresent) {
      if (!status.visitorId) advice.push({ text: "Visitor identity is not set. Call pendo.initialize with a visitorId after authentication.", source: 'builtin' });
      else checks.push("visitorId present.");
      if (status.accountId == null) advice.push({ text: "accountId not found. If you use accounts, provide accountId in pendo.initialize.", source: 'builtin' });
      else checks.push("accountId present.");
    }

    const needsDomains = ["pendo.io", "cdn.pendo.io", "data.pendo.io"];
    if (cspMeta) {
      const lc = cspMeta.toLowerCase();
      needsDomains.forEach(d => {
        if (!lc.includes(d)) {
          advice.push({ text: `CSP meta tag may be missing '${d}'. Ensure script-src and connect-src allow required Pendo domains.`, source: 'builtin' });
        }
      });
    } else if (/content security policy|refused to connect|blocked by csp/i.test(all)) {
      advice.push({ text: "CSP is blocking Pendo. Add required Pendo domains to script-src and connect-src.", source: 'builtin' });
    }

    if (status.resourceHits.length === 0 && status.pendoPresent) {
      advice.push({ text: "No Pendo network resources observed. If using a deferred or self-hosted setup, ensure agent requests are not blocked.", source: 'builtin' });
    }

    if (status.validatePresent && !hasError && !hasWarn && captured.length > 0) {
      checks.push("validateInstall() produced no warnings or errors.");
    }

    if (advice.length === 0 && checks.length > 0) advice.push({ text: "Installation looks healthy based on current checks.", source: 'builtin' });
    else if (advice.length === 0) advice.push({ text: "Review the output below and compare with a known-good page. Check initialise timing and data mapping.", source: 'builtin' });

    if (variant === 'launcher') {
      captured.unshift({ level: 'info', text: 'Validated via Pendo Launcher window.' });
    }

    return { status, captured, advice, checks, cspMeta, apiKeyFound, hasError, hasWarn };
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [{ result: pageResult }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: captureAndInspect
  });

  if (pageResult && pageResult.status && pageResult.status.pendoPresent) {
    return { ...pageResult, origin: 'page', pageUrl: tab && tab.url ? tab.url : 'unknown', launcherAttempted: false };
  }

  async function findLauncherTab() {
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
      return content.split(/\n+/).map(t => t.replace(/^[-*]\s*/, '').trim()).filter(Boolean).map(text => ({ text, source: 'ai' }));
    } catch (e) {
      clearTimeout(timer);
      console.error('AI request failed', e);
      return [{ text: 'AI suggestion unavailable: request failed or timed out. Check API key/endpoint configuration.', source: 'ai' }];
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const statusEl = document.getElementById('status');
    const logsEl = document.getElementById('logs');
    const adviceEl = document.getElementById('advice');

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
      const { status, captured, advice, checks, cspMeta, apiKeyFound, hasError, hasWarn, origin, pageUrl } = res;

      const originNote = origin === 'launcher' ? ' (via Pendo Launcher)' : origin === 'launcher-beta' ? ' (via Pendo Launcher Beta)' : '';

      if (!status.pendoPresent) setStatus(statusEl, 'err', 'Pendo not found' + originNote);
      else if (!status.validatePresent) setStatus(statusEl, 'warn', 'No validateInstall()' + originNote);
      else if (captured.some(l => l.level === 'error')) setStatus(statusEl, 'err', 'Errors found' + originNote);
      else if (captured.some(l => l.level === 'warn')) setStatus(statusEl, 'warn', 'Warnings found' + originNote);
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
        status, captured, advice: adviceList, checks, cspMeta: cspMeta || '', apiKeyFound, origin: origin || 'page'
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
