/**
 * Pendo Install Validator — popup script.
 * Runs validation in the active tab (or Pendo Launcher fallback), shows status/advice/logs,
 * and supports export/copy. Render layer is grouped (status hero, quick stats, check groups,
 * identity/metadata cards, logs filter, page snapshot, export menu, toast).
 */

// Firefox embeds popup.html as a web_accessible_resource iframe where tabs/scripting
// are unavailable; route privileged calls through the background script. Firefox exposes
// both namespaces, but only browser.* is promise-based (chrome.* is callback-based there and
// resolves to undefined when awaited), so prefer browser.* wherever we await a result.
const _chromeApi = typeof chrome !== 'undefined' ? chrome : null;
const _browserApi = typeof browser !== 'undefined' ? browser : null;

function _extRuntime() {
  return _browserApi?.runtime ?? _chromeApi?.runtime ?? null;
}

function _localPrivilegedApi() {
  if (_browserApi?.tabs?.query && _browserApi?.scripting?.executeScript) return _browserApi;
  if (_chromeApi?.tabs?.query && _chromeApi?.scripting?.executeScript) return _chromeApi;
  return null;
}

function _hasLocalTabsApi() {
  const api = _localPrivilegedApi();
  return !!(api?.tabs && typeof api.tabs.query === 'function');
}

function _hasLocalScriptingApi() {
  const api = _localPrivilegedApi();
  return !!(api?.scripting && typeof api.scripting.executeScript === 'function');
}

async function sendExtMessage(message) {
  // Prefer the promise-based browser.runtime (Firefox). Otherwise promisify the
  // chrome.runtime callback form, which Chromium MV3 also supports — awaiting
  // chrome.runtime.sendMessage directly on Firefox yields undefined, not the response.
  const browserRuntime = _browserApi?.runtime;
  if (browserRuntime?.sendMessage) return browserRuntime.sendMessage(message);

  const chromeRuntime = _chromeApi?.runtime;
  if (!chromeRuntime?.sendMessage) throw new Error('Extension messaging unavailable');
  return new Promise((resolve, reject) => {
    chromeRuntime.sendMessage(message, (response) => {
      const err = chromeRuntime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(response);
    });
  });
}

async function tabsQuery(queryInfo) {
  if (_hasLocalTabsApi()) return _localPrivilegedApi().tabs.query(queryInfo);
  const res = await sendExtMessage({ type: 'pendo-validate-tabs-query', queryInfo });
  if (!res?.ok) throw new Error(res?.error || 'tabs.query failed');
  return res.tabs;
}

async function injectScriptFileAndRun(api, { target, world, file, func, args, invokeOnly }) {
  // Firefox forbids func/args on the same executeScript call as files — inject, then invoke.
  // invokeOnly skips the (idempotent) file step when the injected global already exists in
  // this world — e.g. a repeat validation on the same tab — so the file isn't re-parsed.
  if (!invokeOnly) await api.scripting.executeScript({ target, world, files: [file] });
  return api.scripting.executeScript({ target, world, func, args });
}

// File + invoke wrapper per injected script. Keep func bodies trivial: they only forward to
// the global the file defines (so the heavy logic lives in one place — the .js file).
const _INJECTED_SCRIPTS = {
  // revision must match PENDO_VALIDATE_CAPTURE_INSPECT_REVISION in capture-inspect.js
  'capture-inspect': { file: 'capture-inspect.js', revision: 2, func: (variant) => globalThis.__pendoValidateCaptureAndInspect(variant) },
  'enable-debugging': { file: 'enable-debugging.js', func: () => globalThis.__pendoValidateEnableDebugging() },
};

function _isStaleCombinedCaptureResult(result, injectedScript, args) {
  if (injectedScript !== 'capture-inspect' || args[0] !== 'combined') return false;
  const status = result?.status;
  if (!status || typeof status !== 'object') return false;
  return !('snippetGlobalPresent' in status) || !('launcherGlobalPresent' in status);
}

// MAIN worlds known to already hold the injected global this panel session, keyed by
// `${tabId}:${injectedScript}:${world}`. Repeat runs invoke directly; a navigation resets
// the world, so the invoke-only attempt self-heals by falling back to a full re-injection.
const _injectedWorlds = new Set();

async function executeScript(details) {
  const target = details.target;
  const world = details.world || 'MAIN';
  const spec = _INJECTED_SCRIPTS[details.injectedScript];

  if (spec) {
    const args = details.injectedScript === 'capture-inspect' ? (details.args || []) : [];

    const runOnce = async (invokeOnly) => {
      if (_hasLocalScriptingApi()) {
        return injectScriptFileAndRun(_localPrivilegedApi(), { target, world, file: spec.file, func: spec.func, args, invokeOnly });
      }
      const res = await sendExtMessage({
        type: 'pendo-validate-execute-script',
        injectedScript: details.injectedScript,
        target,
        world,
        args,
        invokeOnly,
      });
      if (!res?.ok) throw new Error(res?.error || 'executeScript failed');
      return res.results;
    };

    const revision = spec.revision ?? 0;
    const key = `${target?.tabId}:${details.injectedScript}:${world}:${revision}`;
    if (_injectedWorlds.has(key)) {
      try {
        const results = await runOnce(true);
        if (results && results[0] && results[0].result !== undefined) {
          if (_isStaleCombinedCaptureResult(results[0].result, details.injectedScript, args)) {
            _injectedWorlds.delete(key);
          } else {
            return results;
          }
        }
      } catch {
        // World was reset (navigation) or the global went missing — re-inject below.
      }
    }
    const results = await runOnce(false);
    _injectedWorlds.add(key);
    return results;
  }

  if (_hasLocalScriptingApi()) return _localPrivilegedApi().scripting.executeScript(details);
  throw new Error('executeScript bridge requires injectedScript');
}

async function managementGetAll() {
  const api = _localPrivilegedApi();
  if (api?.management && typeof api.management.getAll === 'function') {
    return new Promise((resolve) => {
      api.management.getAll((exts) => {
        const rt = _extRuntime();
        if (rt?.lastError || !exts) return resolve(null);
        resolve(exts);
      });
    });
  }
  try {
    const res = await sendExtMessage({ type: 'pendo-validate-management-get-all' });
    return res?.ok ? res.extensions : null;
  } catch {
    return null;
  }
}

// ========== Pendo visitor ID (persistent UUID in extension storage) ==========
const PENDO_VISITOR_ID_KEY = 'pendoVisitorId';

/** Chrome Web Store extension IDs — Launcher tabs use chrome-extension://<id>/…; URL path rarely matches title/regex-only search. */
const PENDO_LAUNCHER_EXTENSION_IDS = {
  stable: 'epnhoepnmfjdbjjfanpjklemanhkjgil',
  beta: 'pndmgfbnmbbgkikpcnndoeknbmlkhgmj'
};

/** Launcher often has no open tab (toolbar popup only). Detect install via chrome.management when tab search finds nothing. Returns { variant, id } with the real extension ID, or null. */
function detectInstalledPendoLauncherExtension() {
  return managementGetAll().then((exts) => {
    if (!exts) return null;
    try {
      const enabled = exts.filter(e => e.enabled);
      const byBetaId = enabled.find(e => e.id === PENDO_LAUNCHER_EXTENSION_IDS.beta);
      if (byBetaId) return { variant: 'launcher-beta', id: byBetaId.id };
      const byStableId = enabled.find(e => e.id === PENDO_LAUNCHER_EXTENSION_IDS.stable);
      if (byStableId) return { variant: 'launcher', id: byStableId.id };
      const launcherNamed = enabled.filter(e => /pendo\s*launcher/i.test(e.name || ''));
      const betaNamed = launcherNamed.find(e => /\bbeta\b/i.test(e.name || ''));
      if (betaNamed) return { variant: 'launcher-beta', id: betaNamed.id };
      const stableNamed = launcherNamed.find(e => !/\bbeta\b/i.test(e.name || ''));
      if (stableNamed) return { variant: 'launcher', id: stableNamed.id };
      return null;
    } catch {
      return null;
    }
  }).catch(() => null);
}

/** Read the signed-in Chrome profile email (passive, no OAuth prompt). */
function getProfileEmail() {
  return new Promise((resolve) => {
    try {
      if (!chrome.identity || typeof chrome.identity.getProfileUserInfo !== 'function') return resolve('');
      chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (info) => {
        if (chrome.runtime.lastError) return resolve('');
        resolve((info && info.email) ? String(info.email).trim().toLowerCase() : '');
      });
    } catch { resolve(''); }
  });
}

/** Get or create a persistent visitor UUID; store in chrome.storage.local and return it. */
async function getOrCreateVisitorId() {
  const email = await getProfileEmail();
  if (email && email.endsWith('@pendo.io')) return email;

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

/** Read the IVA extension version from the manifest (for self-instrumentation metadata). */
function getIvaVersion() {
  try {
    return (chrome.runtime && typeof chrome.runtime.getManifest === 'function')
      ? (chrome.runtime.getManifest().version || '')
      : '';
  } catch { return ''; }
}

/** Initialize Pendo with stored visitor UUID (runs as soon as script loads). */
(async function initPendoWithStoredVisitor() {
  const visitorId = await getOrCreateVisitorId();
  if (typeof window.pendo !== 'undefined' && visitorId) {
    const visitor = { id: visitorId };
    const ivaVersion = getIvaVersion();
    if (ivaVersion) visitor.ivaVersion = ivaVersion;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(visitorId)) visitor.email = visitorId;
    window.pendo.initialize({ visitor });
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
  troubleshooting: 'https://support.pendo.io/hc/en-us/articles/10033806003483',
  vds: 'https://support.pendo.io/hc/en-us/articles/360031864732-Help-launching-the-Visual-Design-Studio',
  agentConfig: 'https://web-sdk.pendo.io/config/',
  agentConfigCore: 'https://web-sdk.pendo.io/config/core',
  agentConfigAnalytics: 'https://web-sdk.pendo.io/config/analytics',
  agentConfigGuides: 'https://web-sdk.pendo.io/config/guides',
  agentConfigNetworkLogs: 'https://web-sdk.pendo.io/config/network-logs',
  agentConfigReplay: 'https://web-sdk.pendo.io/config/replay'
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
  troubleshooting: 'Pendo not displaying',
  vds: 'Launching the Visual Design Studio',
  agentConfig: 'Web SDK configuration',
  agentConfigCore: 'Config: Core',
  agentConfigAnalytics: 'Config: Analytics',
  agentConfigGuides: 'Config: Guides',
  agentConfigNetworkLogs: 'Config: Network logs',
  agentConfigReplay: 'Config: Replay'
};

/** supportKeys that indicate an error-severity advice item (blocking install/snippet/agent issues). */
const ERR_SUPPORT_KEYS = new Set(['installGuide', 'installComponents', 'agentSettings']);

/**
 * Strip outdated embedded URLs (and the surrounding "Learn more …:" phrase) from
 * captured advice text so we don't show dead help.pendo.io links alongside the
 * correct support URL that's already attached to the advice item.
 */
function stripEmbeddedHelpUrl(text) {
  if (!text) return text;
  return String(text)
    .replace(/\s*(?:[A-Z][a-z]+\s+more[^.:]*?:\s*)?https?:\/\/help\.pendo\.io\/\S+/gi, '')
    .replace(/\s+$/, '');
}

/**
 * Map a free-form advice / captured-log message to the most specific PENDO_SUPPORT key.
 * Patterns target the canonical strings emitted by pendo.validateInstall() and common
 * AI / built-in advice phrasing. Returns null when no rule matches so callers can
 * apply their own safe default (e.g. troubleshooting for warnings, installGuide for errors).
 */
function inferSupportKeyFromText(text) {
  if (!text) return null;
  const s = String(text);
  const rules = [
    { re: /visual\s+design\s+studio|pendo-designer|launchInAppDesigner|designer\s+launch\s+url\s+token|url\s+token|sanitiz\w*\s+(?:\w+\s+){0,2}(?:url|quer\w*)|(?:url|quer\w*)\s+(?:\w+\s+){0,2}sanitiz/i, key: 'vds' },
    { re: /no\s+matching\s+api\s+key/i,                                               key: 'installComponents' },
    { re: /api\s+key/i,                                                               key: 'installComponents' },
    { re: /VISITOR[-\s_]?UNIQUE[-\s_]?ID|treated as "?anonymous"?|not identified/i,    key: 'chooseIdsMetadata' },
    { re: /not associated with an account|account(?:Id)? (?:is )?(?:not set|missing|not found)/i, key: 'chooseIdsMetadata' },
    { re: /no\s+account\s+metadata/i,                                                 key: 'configureMetadata' },
    { re: /no\s+visitor\s+metadata|visitor metadata fields|metadata field/i,          key: 'chooseIdsMetadata' },
    { re: /jwt|signed metadata/i,                                                     key: 'signedMetadata' },
    { re: /content\s*security\s*policy|\bcsp\b|refused to connect.*pendo|blocked by csp/i, key: 'csp' },
    { re: /iframe|frame-src|child frame/i,                                            key: 'iframe' },
    { re: /single[-\s]?page|spa|route change|router/i,                                key: 'spa' },
    { re: /google tag manager|\bgtm\b/i,                                              key: 'gtm' },
    { re: /\bsegment\b|twilio/i,                                                      key: 'segment' },
    { re: /staging|sandbox|dev environment|test environment|exclude list/i,           key: 'sandbox' },
    { re: /pendo\.enableDebugging|sdk debugger|debug(?:ger|ging)/i,                   key: 'agentDebug' },
    { re: /pendo is not defined|pendo\.validateInstall is not a function|isn['’]t displaying/i, key: 'troubleshooting' },
    { re: /pendo\.initialize|initialize\(\) (?:was )?not called|initialize is not called/i, key: 'installGuide' },
    { re: /agent version|outdated agent|update.*agent/i,                              key: 'agentSettings' },
    { re: /launcher/i,                                                                key: 'launcherPlan' },
    { re: /firewall|allow ?list|whitelist|hostname/i,                                 key: 'hostnameAllowlist' },
    { re: /multi[-\s]?domain|subdomain/i,                                             key: 'multiDomain' },
  ];
  for (const r of rules) {
    if (r.re.test(s)) return r.key;
  }
  return null;
}

// ========== Advice normalization ==========
/** Normalize advice items to { text, source, supportUrl, supportKey, relatedSupportUrls } and filter empty. Resolves supportKey (and optional supportKeys array) to URLs. */
function normalizeAdviceList(advice = []) {
  return advice.map(a => {
    let text, source, supportUrl, supportKey, relatedSupportUrls = [];
    if (typeof a === 'string') {
      text = a; source = 'builtin'; supportUrl = PENDO_SUPPORT.helpCenter; supportKey = null;
    }
    else if (a && typeof a === 'object') {
      text = a.text || '';
      source = a.source || 'builtin';
      supportKey = a.supportKey || null;
      const resolvedFromKey = supportKey && PENDO_SUPPORT[supportKey];
      // Skip AI items' generic technicalSupport URL so inferSupportKeyFromText can choose a topic-specific link.
      if (a.supportUrl && !(source === 'ai' && a.supportUrl === PENDO_SUPPORT.technicalSupport)) {
        supportUrl = a.supportUrl;
      } else if (resolvedFromKey) {
        supportUrl = resolvedFromKey;
      } else {
        const inferred = inferSupportKeyFromText(text);
        if (inferred && PENDO_SUPPORT[inferred]) {
          supportKey = inferred;
          supportUrl = PENDO_SUPPORT[inferred];
        } else if (source === 'ai') {
          supportUrl = PENDO_SUPPORT.technicalSupport;
        } else {
          supportUrl = PENDO_SUPPORT.troubleshooting;
        }
      }
      if (Array.isArray(a.supportKeys)) {
        for (const k of a.supportKeys) {
          if (k === supportKey) continue;
          const url = PENDO_SUPPORT[k];
          if (url) relatedSupportUrls.push({ url, label: SUPPORT_LABELS[k] || k });
        }
      }
    } else {
      text = String(a); source = 'builtin'; supportUrl = PENDO_SUPPORT.helpCenter; supportKey = null;
    }
    return { text, source, supportUrl, supportKey, relatedSupportUrls };
  }).filter(a => a.text);
}

// ========== Install quality assessment ==========
// Common anonymous/guest/test literals — not stable per-user identities (graded poor).
const PLACEHOLDER_IDS = /^(anonymous|guest|unknown|undefined|null|0|test|demo|user|visitor)$/i;

/** Grade visitorId, accountId, metadata coverage, and environment into good/weak/poor tiers; consumed by appendQualityAdviceToResult and buildAiPrompt. */
function assessInstallQuality(context) {
  const status = context.status || {};
  const pageUrl = context.pageUrl || '';
  const result = {
    visitorId: { present: false, value: null, quality: 'good', issues: [] },
    accountId: { present: false, value: null, quality: 'good', issues: [] },
    visitorMetadata: { fields: [], missingRecommended: [], quality: 'good' },
    accountMetadata: { fields: [], missingRecommended: [], quality: 'good' },
    environment: { isStaging: false, issues: [] },
  };

  const vid = status.visitorId;
  if (vid) {
    result.visitorId.present = true;
    result.visitorId.value = vid;
    if (PLACEHOLDER_IDS.test(String(vid).trim())) {
      result.visitorId.quality = 'poor';
      result.visitorId.issues.push(`visitorId "${vid}" is a placeholder value.`);
    } else if (String(vid).length < 3) {
      result.visitorId.quality = 'weak';
      result.visitorId.issues.push(`visitorId "${vid}" is very short (fewer than 3 characters).`);
    } else if (/^\d+$/.test(String(vid)) && Number(vid) < 100) {
      result.visitorId.quality = 'weak';
      result.visitorId.issues.push(`visitorId "${vid}" looks like a low numeric counter.`);
    }
  }

  const aid = status.accountId;
  if (aid != null) {
    result.accountId.present = true;
    result.accountId.value = aid;
    if (PLACEHOLDER_IDS.test(String(aid).trim())) {
      result.accountId.quality = 'poor';
      result.accountId.issues.push(`accountId "${aid}" is a placeholder value.`);
    // accountId identical to visitorId usually means it was copied from the visitor — a misconfiguration.
    } else if (vid && String(aid) === String(vid)) {
      result.accountId.quality = 'weak';
      result.accountId.issues.push('accountId is identical to visitorId (likely misconfiguration).');
    }
  }

  const vmeta = status.visitorMetadata;
  if (vmeta && typeof vmeta === 'object') {
    const fields = Object.keys(vmeta).filter(k => k !== 'id');
    result.visitorMetadata.fields = fields;
    const has = fields.map(f => f.toLowerCase());
    // Recommended visitor metadata: email, name/fullName, role/title (per Choose IDs & metadata).
    const hasName = has.some(h => /^(name|fullname|full_name)$/.test(h));
    const hasRole = has.some(h => /^(role|title)$/.test(h));
    const missingGroups = [];
    if (!has.includes('email')) missingGroups.push('email');
    if (!hasName) missingGroups.push('name/fullName');
    if (!hasRole) missingGroups.push('role/title');
    result.visitorMetadata.missingRecommended = missingGroups;
    // poor = no metadata fields; weak = two or more recommended groups missing.
    if (fields.length === 0) result.visitorMetadata.quality = 'poor';
    else if (missingGroups.length >= 2) result.visitorMetadata.quality = 'weak';
  } else if (vid) {
    result.visitorMetadata.quality = 'poor';
    result.visitorMetadata.missingRecommended = ['email', 'name/fullName', 'role/title'];
  }

  const ameta = status.accountMetadata;
  if (ameta && typeof ameta === 'object') {
    const fields = Object.keys(ameta).filter(k => k !== 'id');
    result.accountMetadata.fields = fields;
    const missingGroups = [];
    // Recommended account metadata: name and plan/tier.
    if (!fields.some(f => f.toLowerCase() === 'name')) missingGroups.push('name');
    if (!fields.some(f => /^(plan|tier)$/i.test(f))) missingGroups.push('plan/tier');
    result.accountMetadata.missingRecommended = missingGroups;
    if (fields.length === 0) result.accountMetadata.quality = 'poor';
    else if (missingGroups.length >= 2) result.accountMetadata.quality = 'weak';
  } else if (aid != null) {
    result.accountMetadata.quality = 'poor';
    result.accountMetadata.missingRecommended = ['name', 'plan/tier'];
  }

  // Lower environments (staging/dev/localhost) should use test-prefixed IDs to keep production analytics clean.
  const isStaging = /\b(staging|preview|dev\.|qa\.|localhost)\b/i.test(pageUrl);
  result.environment.isStaging = isStaging;
  if (isStaging && vid) {
    const hasPrefix = /^(dev_|staging_|test_|qa_)/i.test(String(vid));
    if (!hasPrefix) {
      result.environment.issues.push('Staging/dev URL detected but visitorId lacks a test prefix (dev_, staging_, test_, qa_).');
    }
  }

  return result;
}

/** Append install-quality advice in extension context (not injectable into page). */
function appendQualityAdviceToResult(result, pageUrl) {
  if (!result?.status?.pendoPresent) return result;
  const quality = assessInstallQuality({ status: result.status, pageUrl: pageUrl || '' });
  result.advice = result.advice || [];
  const { status } = result;
  if (quality.visitorId.quality === 'poor') {
    result.advice.push({ text: `visitorId is set to a placeholder value ("${status.visitorId}"). Use a stable authenticated identifier.`, source: 'builtin', supportKey: 'chooseIdsMetadata' });
  } else if (quality.visitorId.quality === 'weak') {
    result.advice.push({ text: quality.visitorId.issues[0] || 'visitorId may not be a stable identifier.', source: 'builtin', supportKey: 'chooseIdsMetadata' });
  }
  if (quality.accountId.quality === 'poor') {
    result.advice.push({ text: `accountId is set to a placeholder value ("${status.accountId}"). Use a stable organisation identifier.`, source: 'builtin', supportKey: 'chooseIdsMetadata' });
  } else if (quality.accountId.quality === 'weak' && quality.accountId.issues.length) {
    result.advice.push({ text: quality.accountId.issues[0], source: 'builtin', supportKey: 'chooseIdsMetadata' });
  }
  // captureAndInspect already emits a sandbox/staging recommendation when the page URL
  // looks like a lower environment, so only add this one when none exists yet (e.g.
  // localhost, which captureAndInspect's URL pattern does not match) to avoid two
  // overlapping sandbox recommendations.
  const hasSandboxAdvice = result.advice.some(a => a && a.supportKey === 'sandbox');
  if (quality.environment.issues.length && !hasSandboxAdvice) {
    result.advice.push({ text: quality.environment.issues[0] + ' Consider test prefixes and an Exclude List to keep analytics clean.', source: 'builtin', supportKey: 'sandbox' });
  }
  return result;
}

// ========== Configuration flag detection ==========
/** Standard pendo.initialize keys that do NOT count as customisation "flags". */
const STANDARD_INIT_KEYS = new Set(['visitor', 'account', 'apiKey', 'publicAppId']);

/** Known top-level pendo.initialize options mapped to their Web SDK config doc category. */
const CONFIG_FLAG_CATEGORY = {
  // Core (https://web-sdk.pendo.io/config/core)
  additionalPublicAppIds: 'core', additionalApiKeys: 'core', annotateUrl: 'core', autoFrameInstall: 'core',
  contentHost: 'core', cookieDomain: 'core', crossAppGuideStorageSuffix: 'core', dataHost: 'core',
  disableCookies: 'core', disableFeedback: 'core', disablePendo: 'core', disablePersistence: 'core',
  enableCrossOriginIsolation: 'core', eventPropertyTimeout: 'core', forceAnonymous: 'core', forcedLeader: 'core',
  frameIdentitySync: 'core', frameIdentityTopDownOnly: 'core', ignoreHashRouting: 'core', initializeImmediately: 'core',
  initializeWhenVisible: 'core', localStorageOnly: 'core', location: 'core', observeShadowRoots: 'core',
  preferBroadcastChannel: 'core', preferMutationObserver: 'core', preventUnloadListener: 'core',
  queryStringWhitelist: 'core', sanitizeUrl: 'core', secureDesignerConnect: 'core', selfHostedWebSDKUrl: 'core',
  selfHostedAgentUrl: 'core', sendEventsWithPostOnly: 'core',
  // Analytics (https://web-sdk.pendo.io/config/analytics)
  allowedText: 'analytics', analytics: 'analytics', enableDebugEvents: 'analytics', eventPropertyMatchParents: 'analytics',
  excludeAllText: 'analytics', excludeNonGuideAnalytics: 'analytics', interceptPreventDefault: 'analytics',
  interceptStopPropagation: 'analytics', syntheticClicks: 'analytics', interceptElementRemoval: 'analytics',
  // Guides (https://web-sdk.pendo.io/config/guides)
  appAutoOrdering: 'guides', cacheGuides: 'guides', cacheGuidesTimeout: 'guides', disableDesigner: 'guides',
  disableGlobalCSS: 'guides', disableGuidePseudoStyles: 'guides', disablePrefetch: 'guides',
  enableDesignerKeyboardShortcut: 'guides', enableGuideTimeout: 'guides', guideSeenTimeoutLength: 'guides',
  guideValidation: 'guides', guides: 'guides', inlineStyleNonce: 'guides', leaderApplication: 'guides',
  leaderKey: 'guides', preventCodeInjection: 'guides', delayGuides: 'guides', disableGuides: 'guides', guideTimeout: 'guides',
  // Network logs (https://web-sdk.pendo.io/config/network-logs)
  networkLogs: 'networkLogs',
  // Replay (https://web-sdk.pendo.io/config/replay)
  recording: 'replay'
};

/** Config doc category -> support link key. */
const CONFIG_CATEGORY_SUPPORT_KEY = {
  core: 'agentConfigCore', analytics: 'agentConfigAnalytics', guides: 'agentConfigGuides',
  networkLogs: 'agentConfigNetworkLogs', replay: 'agentConfigReplay'
};

/** Config doc category -> human label used inside the warning text. */
const CONFIG_CATEGORY_LABEL = {
  core: 'Core', analytics: 'Analytics', guides: 'Guides', networkLogs: 'Network logs', replay: 'Replay'
};

/**
 * Identify non-standard configuration flags from the options passed to pendo.initialize().
 * Reads status.configKeys (captured from the snippet queue). Returns { detected, flags },
 * where `detected` indicates the init options were readable and `flags` lists each
 * non-standard key with its config-doc category (null for unrecognised/custom keys).
 */
function assessConfigFlags(status) {
  const keys = status && Array.isArray(status.configKeys) ? status.configKeys : null;
  if (!keys) return { detected: false, flags: [] };
  const flags = keys
    .filter(k => !STANDARD_INIT_KEYS.has(k))
    .map(k => ({ key: k, category: CONFIG_FLAG_CATEGORY[k] || null }));
  return { detected: true, flags };
}

/**
 * Append a single grouped warning when pendo.initialize() uses options beyond a standard
 * install (visitor + account, plus the required apiKey/publicAppId). Each flag is named with
 * its config category and the warning links to the Web SDK configuration docs. No-op when the
 * init options were not readable; adds a passing check when only standard keys are present.
 */
function appendConfigFlagsAdviceToResult(result) {
  if (!result || !result.status || !result.status.pendoPresent) return result;
  const { detected, flags } = assessConfigFlags(result.status);
  if (!detected) return result;
  result.advice = result.advice || [];
  result.checks = result.checks || [];
  if (!flags.length) {
    result.checks.push('Standard configuration detected (visitor + account only).');
    return result;
  }
  const labelList = flags
    .map(f => `${f.key} (${f.category ? CONFIG_CATEGORY_LABEL[f.category] : 'other'})`)
    .join(', ');
  const categories = [];
  for (const f of flags) {
    if (f.category && !categories.includes(f.category)) categories.push(f.category);
  }
  const supportKeys = categories.map(c => CONFIG_CATEGORY_SUPPORT_KEY[c]).filter(Boolean);
  result.advice.push({
    text: `Non-standard configuration flags detected in pendo.initialize(): ${labelList}. `
      + 'A standard install passes only visitor and account. Confirm each flag is intentional and '
      + 'review it against the Pendo Web SDK configuration docs.',
    source: 'builtin',
    supportKey: 'agentConfig',
    supportKeys
  });
  return result;
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
  if (signals.urlSanitized)                        topics.push('vds', 'designer', 'guides');
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
  lines.push(`# Pendo Install Validator Report`);
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
    redirectCount: status.redirectCount || 0,
    urlSanitizationPatterns: (status.urlSanitization && status.urlSanitization.inlinePatterns) || [],
    urlObservedStrips: (status.urlSanitization && status.urlSanitization.observedStrips) || 0,
    urlLoadTimeStrip: !!(status.urlSanitization && (status.urlSanitization.navQueryStripped || status.urlSanitization.navPendoTokenStripped)),
    capturedLineCount: (captured && captured.length) || 0
  };
  if (status.visitorMetadata) meta.visitorMetadata = status.visitorMetadata;
  if (status.accountMetadata) meta.accountMetadata = status.accountMetadata;
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
      lines.push(`- Validation reported issues. See Advice and Captured Output below. — [Pendo isn't displaying — troubleshooting](${PENDO_SUPPORT.troubleshooting})`);
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
      urlSanitized: adviceList.some(a => a.supportKey === 'vds'),
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
  lines.push(`Pendo Install Validator — ${statusLine}`);
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
// Extension script files are static at runtime; cache their text so repeated CDP runs and
// the Debugger button don't re-fetch the same file.
const _scriptTextCache = new Map();
/** Load an extension script file as text (for CDP evaluate expressions). */
async function loadExtensionScriptText(filename) {
  const cached = _scriptTextCache.get(filename);
  if (cached !== undefined) return cached;
  const runtime = _extRuntime();
  if (!runtime?.getURL) throw new Error('Extension runtime unavailable');
  const res = await fetch(runtime.getURL(filename));
  if (!res.ok) throw new Error(`Failed to load ${filename}`);
  const text = await res.text();
  _scriptTextCache.set(filename, text);
  return text;
}

/**
 * Build a CDP Runtime.evaluate expression that defines an injected script's global
 * exactly once, then invokes it. The Launcher content-script world is persistent, so
 * evaluating the raw source (which has top-level declarations) on every validation is
 * wasteful and risks redeclaration errors on re-runs. The typeof guard runs the body
 * only when the global is not yet defined, then always re-invokes the existing global.
 */
function buildLauncherInvokeExpression(src, globalName, argsExpr = '') {
  return `if (typeof globalThis.${globalName} !== 'function') {\n${src}\n}\nglobalThis.${globalName}(${argsExpr});`;
}

/**
 * Evaluate a JS expression inside the Pendo Launcher extension's content-script world via CDP.
 * Returns { ok: true, value } or { ok: false, reason, message? }.
 */
async function evaluateInLauncherWorld(tabId, launcherId, expression) {
  if (typeof chrome === 'undefined' || !chrome.debugger || typeof chrome.debugger.attach !== 'function') {
    return { ok: false, reason: 'no-debugger-api' };
  }
  const target = { tabId };
  const expectedOrigin = `chrome-extension://${launcherId}`;

  try {
    await chrome.debugger.attach(target, '1.3');
  } catch (e) {
    return { ok: false, reason: 'attach-failed', message: e && e.message ? e.message : String(e) };
  }

  try {
    // Resolve as soon as the Launcher's execution context appears (Runtime.enable emits
    // executionContextCreated for existing contexts). Arm the safety-net timer only after
    // Runtime.enable settles — otherwise a slow enable can outlive the cap and yield a
    // false no-launcher-context even when the Launcher world is present.
    const launcherCtx = await new Promise((resolve, reject) => {
      let settled = false, timer = null;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        try { chrome.debugger.onEvent.removeListener(handler); } catch {}
      };
      const finish = (ctx) => { if (!settled) { settled = true; cleanup(); resolve(ctx || null); } };
      const fail = (err) => { if (!settled) { settled = true; cleanup(); reject(err); } };
      const handler = (source, method, params) => {
        if (source.tabId !== tabId || method !== 'Runtime.executionContextCreated') return;
        const ctx = params.context;
        if ((ctx.origin || '').toLowerCase() === expectedOrigin) finish(ctx);
      };
      chrome.debugger.onEvent.addListener(handler);
      chrome.debugger.sendCommand(target, 'Runtime.enable')
        .then(() => { if (!settled) timer = setTimeout(() => finish(null), 250); })
        .catch(fail);
    });
    if (!launcherCtx) return { ok: false, reason: 'no-launcher-context' };

    const evalResult = await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
      expression,
      contextId: launcherCtx.id,
      returnByValue: true
    });

    if (evalResult?.exceptionDetails) {
      const text = evalResult.exceptionDetails.text || evalResult.exceptionDetails.exception?.description || 'Evaluation failed';
      return { ok: false, reason: 'eval-exception', message: text };
    }
    return { ok: true, value: evalResult?.result?.value };
  } finally {
    try { await chrome.debugger.detach(target); } catch {}
  }
}

/** Enable pendo.enableDebugging() inside the Launcher content-script world (Phase 1.75 path). */
async function enableDebuggingViaLauncherCdp(tabId, launcher) {
  let expression;
  try {
    const src = await loadExtensionScriptText('enable-debugging.js');
    expression = buildLauncherInvokeExpression(src, '__pendoValidateEnableDebugging');
  } catch (e) {
    return { ok: false, message: (e && e.message) || String(e) };
  }
  const cdp = await evaluateInLauncherWorld(tabId, launcher.id, expression);
  if (!cdp.ok) {
    if (cdp.reason === 'no-debugger-api') {
      return { ok: false, message: 'Launcher debugger requires Chrome or Edge (CDP not available in this browser).' };
    }
    if (cdp.reason === 'no-launcher-context') {
      return { ok: false, message: 'Pendo Launcher agent context not found on this tab. Re-run validation first.' };
    }
    return { ok: false, message: cdp.message || 'Failed to enable debugger in Launcher context.' };
  }
  return cdp.value || { ok: false, message: 'No result from Launcher debugger.' };
}

// ========== Page validation: inject and run in tab ==========
/**
 * Validation phases:
 *   1 + 1.5. One MAIN-world injection (variant 'combined') detects the snippet (window.pendo)
 *            and the Launcher-injected agent (window.Pendo) and runs validateInstall() once
 *            on the primary agent — no second full pass on snippet-only pages.
 *   1.75.    If neither is present and the Launcher extension is installed, run validation in
 *            the Launcher's content-script world via CDP.
 * Returns: pageUrl (always the active tab URL), snippetOnPage, launcherPresent, launcherAttempted, validatedIn, launcherUrl (optional), plus status/captured/advice/checks.
 */
async function runInPage() {
  /**
   * Use the Chrome DevTools Protocol (chrome.debugger) to run captureAndInspect
   * inside the Pendo Launcher extension's content-script isolated world.
   */
  async function runValidationInLauncherWorld(tabId, launcher) {
    const variant = launcher.variant;
    let expression;
    try {
      const src = await loadExtensionScriptText('capture-inspect.js');
      expression = buildLauncherInvokeExpression(src, '__pendoValidateCaptureAndInspect', JSON.stringify(variant));
    } catch {
      return null;
    }
    const cdp = await evaluateInLauncherWorld(tabId, launcher.id, expression);
    if (!cdp.ok || cdp.value == null) return null;
    return { result: cdp.value, variant };
  }

  const EMPTY_RESULT = {
    status: { pendoPresent: false, validatePresent: false, version: null, detectedApiKey: null, visitorId: null, accountId: null, visitorMetadata: null, accountMetadata: null, configKeys: null, configSource: null, resourceHits: [] },
    captured: [], advice: [], checks: [], cspMeta: '', apiKeyFound: false, hasError: true, hasWarn: false
  };

  const [tab] = await tabsQuery({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error('No active tab found.');

  // Phase 1 + 1.5 combined: a single MAIN-world injection detects both the snippet
  // (window.pendo) and the Launcher-injected agent (window.Pendo) and runs
  // validateInstall() once on the primary agent — avoiding a second full pass.
  const [{ result: pageResult }] = await executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    injectedScript: 'capture-inspect',
    args: ['combined']
  });

  const basePageUrl = tab && tab.url ? tab.url : 'unknown';
  if (pageResult) { appendQualityAdviceToResult(pageResult, basePageUrl); appendConfigFlagsAdviceToResult(pageResult); }

  const pageStatus = (pageResult && pageResult.status) || {};
  const snippetOnPage = !!pageStatus.snippetGlobalPresent;
  // Only window.Pendo (capital P) counts as a Launcher detection; the snippet's own
  // window.pendo is reported separately via snippetGlobalPresent.
  const launcherInPage = !!pageStatus.launcherGlobalPresent;

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
    const lStatus = pageResult.status;
    // "Launcher validated" = the agent ran validateInstall and returned at least visitor identity or metadata on this tab.
    const launcherDataValidated = !!(lStatus.pendoPresent && lStatus.validatePresent && (lStatus.visitorId || lStatus.visitorMetadata));
    return {
      ...pageResult,
      pageUrl: basePageUrl,
      snippetOnPage: false,
      launcherAttempted: true,
      launcherPresent: true,
      launcherDataValidated,
      validatedIn: 'launcher',
      launcherUrl: basePageUrl,
      origin: 'launcher',
      validationPath: 'launcher-main',
      validationTabId: tab.id
    };
  }

  // Phase 1.75: Launcher extension installed — use chrome.debugger (CDP) to run
  // validation inside the Launcher's content-script isolated world.
  const installedLauncher = await detectInstalledPendoLauncherExtension();

  if (installedLauncher) {
    const cdpResult = await runValidationInLauncherWorld(tab.id, installedLauncher);
    if (cdpResult && cdpResult.result && cdpResult.result.status && cdpResult.result.status.pendoPresent) {
      appendQualityAdviceToResult(cdpResult.result, basePageUrl);
      appendConfigFlagsAdviceToResult(cdpResult.result);
      const lStatus = cdpResult.result.status;
      // "Launcher validated" = the agent ran validateInstall and returned at least visitor identity or metadata on this tab.
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
        origin: cdpResult.variant,
        validationPath: 'launcher-cdp',
        validationTabId: tab.id,
        launcherExtensionId: installedLauncher.id
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
const AI_DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  claude: 'claude-haiku-4-5-20251001',
  gemini: 'gemini-3.5-flash',
};

const DEPRECATED_AI_MODELS = new Set([
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-lite-001',
  'gemini-3-flash-preview',
]);

/** Resolve a stored aiModel to the provider default; silently migrate deprecated Gemini model IDs. */
function resolveAiModel(provider, aiModel) {
  const p = provider || 'openai';
  const custom = String(aiModel || '').trim();
  if (!custom || DEPRECATED_AI_MODELS.has(custom)) {
    return AI_DEFAULT_MODELS[p] || AI_DEFAULT_MODELS.openai;
  }
  return custom;
}

/** Read AI config from chrome.storage.local: aiEndpoint, aiApiKey, aiModel. Used for optional ChatGPT-powered advice. */
async function getAiConfig() {
  return new Promise(resolve => {
    try {
      if (!chrome.storage || !chrome.storage.local) return resolve({});
      chrome.storage.local.get({ aiProvider: 'openai', aiEndpoint: '', aiClaudeEndpoint: '', aiApiKey: '', aiModel: '' }, cfg => {
        if (cfg.aiModel && DEPRECATED_AI_MODELS.has(cfg.aiModel)) {
          try { chrome.storage.local.remove('aiModel'); } catch (_) {}
          cfg.aiModel = '';
        }
        resolve(cfg);
      });
    } catch (e) {
      console.error(e);
      resolve({});
    }
  });
}

/** Build prompt for AI from validation context (URL, status, logs, CSP). */
function buildAiPrompt(context) {
  const lines = [];
  lines.push(`Page URL: ${context.pageUrl}`);
  lines.push(`Agent version: ${context.status.version || 'unknown'}`);
  lines.push(`validateInstall available: ${context.status.validatePresent}`);
  lines.push(`Pendo present: ${context.status.pendoPresent}`);
  lines.push(`API key detected: ${context.status.detectedApiKey || 'unknown'}`);
  lines.push(`API key found flag: ${context.apiKeyFound}`);
  lines.push(`VisitorId: ${context.status.visitorId || 'not set'}`);
  lines.push(`AccountId: ${context.status.accountId == null ? 'not set' : context.status.accountId}`);
  lines.push(`CSP meta: ${context.cspMeta || 'none'}`);

  // Include metadata fields
  if (context.status.visitorMetadata && typeof context.status.visitorMetadata === 'object') {
    const keys = Object.keys(context.status.visitorMetadata).slice(0, 20);
    lines.push(`Visitor metadata fields: ${keys.join(', ') || 'none'}`);
  } else {
    lines.push('Visitor metadata fields: none');
  }
  if (context.status.accountMetadata && typeof context.status.accountMetadata === 'object') {
    const keys = Object.keys(context.status.accountMetadata).slice(0, 20);
    lines.push(`Account metadata fields: ${keys.join(', ') || 'none'}`);
  } else {
    lines.push('Account metadata fields: none');
  }

  // Include quality assessment
  const quality = assessInstallQuality(context);
  lines.push(`Install quality: ${JSON.stringify(quality)}`);

  lines.push('Captured logs (level:message):');
  const trimmed = (context.captured || []).slice(0, 30);
  trimmed.forEach(l => lines.push(`[${l.level}] ${l.text}`));
  if ((context.captured || []).length > trimmed.length) lines.push('...truncated...');

  // Include existing advice so AI does not repeat it
  const existingAdvice = context.advice || [];
  if (existingAdvice.length) {
    lines.push('');
    lines.push('Existing advice already shown to the user (DO NOT repeat or paraphrase these):');
    existingAdvice.forEach(a => {
      const text = typeof a === 'string' ? a : (a.text || '');
      if (text) lines.push(`- ${text}`);
    });
  }

  if (typeof selectRelatedReading === 'function') {
    const signals = {
      pendoPresent: context.status.pendoPresent,
      validatePresent: context.status.validatePresent,
      visitorId: context.status.visitorId,
      accountId: context.status.accountId,
      cspIssue: !!(context.cspMeta || '').length || (context.captured || []).some(l => /csp|content.security/i.test(l.text)),
      noResourceHits: context.status.resourceHits && context.status.resourceHits.length === 0,
      apiKeyMissing: !context.apiKeyFound,
      urlSanitized: !!(context.status.pendoPresent && ((context.status.redirectCount || 0) > 0 || (context.status.urlSanitization && (context.status.urlSanitization.inlinePatterns.length || context.status.urlSanitization.observedStrips || context.status.urlSanitization.navQueryStripped || context.status.urlSanitization.navPendoTokenStripped)))),
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

  // Quality guide excerpt (passed from popup.js when available)
  if (context._qualityGuide) {
    lines.push('');
    lines.push('Quality guide reference:');
    lines.push(String(context._qualityGuide).slice(0, 1200));
  }

  lines.push('');
  lines.push('Respond ONLY with a JSON array. Each element: {"text":"one plain sentence","supportKey":"chooseIdsMetadata"}');
  lines.push('Rules: text must be one plain sentence with no markdown, no URLs, no numbering. supportKey must be one of: installGuide, chooseIdsMetadata, configureMetadata, csp, spa, gtm, segment, iframe, sandbox, agentSettings, agentDebug, troubleshooting, hostnameAllowlist, multiDomain, launcherPlan, signedMetadata, installComponents, vds, agentConfig.');
  lines.push('Max 3 items. Skip anything already covered in "Existing advice" above.');
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

/** Strip all URLs from a string. */
function stripAllUrls(text) {
  return String(text || '').replace(/https?:\/\/\S+/gi, '').replace(/\s{2,}/g, ' ').trim();
}

/** Parse AI response content into clean advice items with dedup against existing advice. */
function parseAiAdviceResponse(content, existingAdvice) {
  const existing = (existingAdvice || []).map(a => {
    const t = typeof a === 'string' ? a : (a.text || '');
    return t.toLowerCase().replace(/[^\w\s]/g, '').trim();
  }).filter(Boolean);

  let items = [];

  // Try JSON parse first (preferred contract)
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        items = parsed.filter(i => i && typeof i.text === 'string' && i.text.trim())
          .map(i => ({ text: i.text.trim(), supportKey: i.supportKey || null }));
      }
    } catch {}
  }

  // Fallback: strip markdown and split on newlines
  if (!items.length) {
    items = content.split(/\n+/)
      .map(line => line
        .replace(/^#{1,6}\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .replace(/^[-*]\s*/, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .trim()
      )
      .filter(Boolean)
      .map(text => ({ text, supportKey: null }));
  }

  // Strip URLs and deduplicate
  const results = [];
  for (const item of items) {
    let text = stripAllUrls(item.text);
    if (!text || text.length < 5) continue;

    const normalized = text.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const tokens = normalized.split(/\s+/);

    // Check overlap with existing advice
    let isDuplicate = false;
    for (const ex of existing) {
      if (!ex) continue;
      if (normalized.includes(ex) || ex.includes(normalized)) { isDuplicate = true; break; }
      const exTokens = ex.split(/\s+/);
      const overlap = tokens.filter(t => exTokens.includes(t)).length;
      // >70% token overlap with an existing item is treated as a duplicate paraphrase and dropped.
      if (overlap / Math.max(tokens.length, 1) > 0.7) { isDuplicate = true; break; }
    }
    if (isDuplicate) continue;

    // Infer supportKey if not provided
    let supportKey = item.supportKey;
    if (!supportKey || !PENDO_SUPPORT[supportKey]) {
      supportKey = inferSupportKeyFromText(text);
    }

    results.push({ text, source: 'ai', supportKey });
    if (results.length >= 3) break;
  }

  return results;
}

/** Call configured AI API for remediation suggestions; returns array of { text, source: 'ai' }. */
async function requestAiAdvice(context) {
  const cfg = await getAiConfig();
  const apiKey = String((cfg && cfg.aiApiKey) || '').trim();
  if (!apiKey) return [];

  const provider = cfg.aiProvider || 'openai';
  const prompt = buildAiPrompt(context);
  const systemMsg = 'You are a concise Pendo install troubleshooting assistant. Only rely on official Pendo documentation. Respond ONLY with a JSON array of objects, each with "text" (one plain sentence, no markdown/URLs/numbering) and "supportKey". Max 3 items. Do not repeat advice already provided.';

  const model = resolveAiModel(provider, cfg.aiModel);
  let endpoint, headers, body;

  if (provider === 'claude') {
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
    endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    headers = { 'Content-Type': 'application/json' };
    // Gemini 3.x is tuned for default sampling, so temperature/top_p/top_k are omitted. Thinking is
    // pinned to LOW because the default (medium) effort can exceed timeoutMs on this short prompt.
    body = { contents: [{ parts: [{ text: systemMsg + '\n\n' + prompt }] }], generationConfig: { thinkingConfig: { thinkingLevel: 'LOW' } } };
  } else {
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
        // Route Claude requests through the background service worker to avoid extension-page fetch/CORS limits.
        bg = await sendExtMessage({
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
    else if (provider === 'gemini') {
      const parts = data?.candidates?.[0]?.content?.parts || [];
      content = parts.filter(p => p && typeof p.text === 'string' && !p.thought).map(p => p.text).join('');
    }
    else content = data?.choices?.[0]?.message?.content || '';
    if (!content) {
      return [];
    }
    return parseAiAdviceResponse(content, context.advice);
  } catch (e) {
    clearTimeout(timer);
    console.error('AI request failed', e);
    const isAbort = e && (e.name === 'AbortError' || (e.message && String(e.message).includes('aborted')));
    let detail = isAbort
      ? 'Request timed out. Check your network or increase timeoutMs in storage.'
      : (e && e.message ? String(e.message) : String(e));
    const friendly = friendlyAiFailureDetail(provider, detail);
    if (friendly) detail = friendly;
    // Mark with explicit supportKey so classifyAdvice routes this to the warn bucket.
    // Without it, normalizeAdviceList falls back to inferSupportKeyFromText, which can
    // match phrases like "API key" inside the failure detail and incorrectly route the
    // item to the error bucket — but this is an extension-side AI failure, not a
    // snippet/Launcher install error.
    return [{ text: `AI suggestion unavailable: ${detail}`, source: 'ai', supportKey: 'technicalSupport', supportUrl: PENDO_SUPPORT.technicalSupport }];
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
function initPopup() {
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
  const runBtnLabel = runBtn?.querySelector('.btn__label');
  const launchDebuggerBtn = document.getElementById('launchDebugger');
  const exportMenuBtn = document.getElementById('exportMenuBtn');
  const exportMenu = document.getElementById('exportMenu');
  const exportMdBtn = document.getElementById('exportMd');
  const exportCopyBtn = document.getElementById('exportCopy');

  const toastEl = document.getElementById('toast');

  const themeSelect = document.getElementById('themeSelect');

  const aiProviderSelect = document.getElementById('aiProviderSelect');
  const aiApiKeyInput = document.getElementById('aiApiKeyInput');
  const aiKeyToggle = document.getElementById('aiKeyToggleVisibility');
  const aiSaveBtn = document.getElementById('aiSettingsSave');
  const aiSaveStatus = document.getElementById('aiSettingsStatus');

  // ── State ───────────────────────────────────────────────────────────────
  let lastContext = null;
  let runState = 'idle'; // 'idle' | 'running' | 'done'
  let validationSeq = 0; // incremented per Validate click; stale AI callbacks compare before mutating UI
  let logFilters = { error: true, warn: true, info: true };
  let logQuery = '';
  let toastTimer = null;
  let qualityGuideCache = null;

  // Prefetch quality guide for AI prompt enrichment
  try {
    fetch(chrome.runtime.getURL('pendo-install-quality.md'))
      .then(r => r.ok ? r.text() : '')
      .then(t => { qualityGuideCache = t; })
      .catch(() => {});
  } catch {}


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

  /** Mirror the active panel tab in Pendo self-instrumentation's page URL; failures are swallowed so telemetry never blocks tab switching. */
  function notifyPendoTabChange(id) {
    const pendo = window.pendo;
    if (!pendo || !pendo.location || typeof pendo.location.setUrl !== 'function') return;
    try {
      const url = new URL(window.location.href);
      url.pathname = url.pathname.replace(/\/+$/, '') + '/' + id;
      pendo.location.setUrl(url.toString());
    } catch (_) { /* telemetry must never break tab switching */ }
  }

  /** Activate a tab by id ('status' | 'logs' | 'settings'). */
  function activateTab(id) {
    const targetPanelId = id === 'logs' ? 'tabLogsPanel'
      : id === 'settings' ? 'tabSettingsPanel'
      : 'tabStatusPanel';
    const targetBtn = id === 'logs' ? tabLogsBtn : id === 'settings' ? tabSettingsBtn : tabStatusBtn;
    tabBtns.forEach(b => b.setAttribute('aria-selected', b === targetBtn ? 'true' : 'false'));
    tabPanels.forEach(p => { p.hidden = p.id !== targetPanelId; });
    notifyPendoTabChange(id);
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
      const displayText = stripEmbeddedHelpUrl(l.text);
      if (l.level === 'error') {
        const inferred = inferSupportKeyFromText(l.text);
        const supportKey = inferred || 'installGuide';
        const supportUrl = PENDO_SUPPORT[supportKey] || PENDO_SUPPORT.installGuide;
        errItems.push({ text: displayText, source: 'captured', supportKey, supportUrl });
      } else if (l.level === 'warn') {
        const inferred = inferSupportKeyFromText(l.text);
        const supportKey = inferred || 'troubleshooting';
        const supportUrl = PENDO_SUPPORT[supportKey] || PENDO_SUPPORT.troubleshooting;
        warnItems.push({ text: displayText, source: 'captured', supportKey, supportUrl });
      }
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
      head.id = 'checkGroupHead' + g.kind.charAt(0).toUpperCase() + g.kind.slice(1);
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
        const displayText = it.source === 'ai' ? stripAllUrls(stripEmbeddedHelpUrl(it.text)) : it.text;
        cell.appendChild(document.createTextNode(displayText));
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
  function appendKvRow(container, { label, value, mono = true, wrap = false, top = false, copyId }) {
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
      if (copyId) btn.id = copyId;
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
    appendKvRow(identityBody, { label: 'VisitorId', value: visitorId || '—', copyId: 'identityCopyVisitorId' });
    appendKvRow(identityBody, { label: 'AccountId', value: accountId == null ? '—' : String(accountId), copyId: 'identityCopyAccountId' });
    appendKvRow(identityBody, { label: 'API key', value: detectedApiKey || '—', copyId: 'identityCopyApiKey' });
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
        btn.id = 'metadataCopy' + label;
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

    appendKvRow(pageSnapshotBody, { label: 'Pendo present', value: yn(status.pendoPresent), mono: false, copyId: 'pageSnapshotCopyPendoPresent' });
    appendKvRow(pageSnapshotBody, { label: 'validateInstall', value: yn(status.validatePresent), mono: false, copyId: 'pageSnapshotCopyValidateInstall' });
    appendKvRow(pageSnapshotBody, { label: 'Agent version', value: status.version || 'unknown', copyId: 'pageSnapshotCopyAgentVersion' });
    appendKvRow(pageSnapshotBody, { label: 'API key found', value: yn(apiKeyFound), mono: false, copyId: 'pageSnapshotCopyApiKeyFound' });
    appendKvRow(pageSnapshotBody, { label: 'Detected key', value: status.detectedApiKey || '—', copyId: 'pageSnapshotCopyDetectedKey' });
    appendKvRow(pageSnapshotBody, { label: 'Snippet on page', value: yn(snippetOnPage), mono: false, copyId: 'pageSnapshotCopySnippetOnPage' });
    appendKvRow(pageSnapshotBody, { label: 'Pendo Launcher', value: launcherDisplay, mono: false, copyId: 'pageSnapshotCopyPendoLauncher' });
    appendKvRow(pageSnapshotBody, { label: 'Launcher validated', value: yn(launcherDataValidated), mono: false, copyId: 'pageSnapshotCopyLauncherValidated' });
    appendKvRow(pageSnapshotBody, { label: 'Validated in', value: validatedInDisplay, mono: false, copyId: 'pageSnapshotCopyValidatedIn' });
    appendKvRow(pageSnapshotBody, { label: 'Resource hits', value: String(status.resourceHits.length), mono: false, copyId: 'pageSnapshotCopyResourceHits' });
    pageSnapshotCard.hidden = false;
  }

  /** Render the optional Page facts card on the Logs tab. */
  function renderPageFacts(res) {
    pageFactsBody.replaceChildren();
    const { snippetOnPage, validatedIn } = res;
    const validatedInDisplay = validatedIn === 'launcher' ? 'Pendo Launcher'
      : validatedIn === 'launcher-beta' ? 'Pendo Launcher Beta'
      : validatedIn === 'page' ? 'Active tab' : '—';
    appendKvRow(pageFactsBody, { label: 'Snippet', value: snippetOnPage ? 'Found' : 'Not found', mono: false, copyId: 'pageFactsCopySnippet' });
    appendKvRow(pageFactsBody, { label: 'Validated in', value: validatedInDisplay, mono: false, copyId: 'pageFactsCopyValidatedIn' });
    appendKvRow(pageFactsBody, { label: 'Lines captured', value: String((res.captured || []).length), copyId: 'pageFactsCopyLinesCaptured' });
    pageFactsCard.hidden = false;
  }

  /** Render the logs list using the current filter + query state. */
  function renderLogs() {
    const captured = (lastContext && lastContext.captured) || [];
    const q = (logQuery || '').toLowerCase();

    // Single pass: tally per-level counts and collect the visible lines together.
    let errCount = 0, warnCount = 0, infoCount = 0;
    const visible = [];
    for (const l of captured) {
      const lev = l.level === 'error' ? 'error' : l.level === 'warn' ? 'warn' : 'info';
      if (lev === 'error') errCount++; else if (lev === 'warn') warnCount++; else infoCount++;
      if (lev === 'error' && !logFilters.error) continue;
      if (lev === 'warn' && !logFilters.warn) continue;
      if (lev === 'info' && !logFilters.info) continue;
      if (q && !(l.text || '').toLowerCase().includes(q)) continue;
      visible.push(l);
    }

    logCountErr.textContent = String(errCount);
    logCountWarn.textContent = String(warnCount);
    logCountInfo.textContent = String(infoCount);

    logFilterErr.setAttribute('aria-pressed', logFilters.error ? 'true' : 'false');
    logFilterWarn.setAttribute('aria-pressed', logFilters.warn ? 'true' : 'false');
    logFilterInfo.setAttribute('aria-pressed', logFilters.info ? 'true' : 'false');

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
  // Debounce search: avoid rebuilding the whole log list on every keystroke for large output.
  let logSearchTimer = null;
  logsSearch.addEventListener('input', (e) => {
    const value = e.target.value;
    if (logSearchTimer) clearTimeout(logSearchTimer);
    logSearchTimer = setTimeout(() => { logQuery = value; renderLogs(); }, 150);
  });

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
    if (!runBtn) return;
    if (running) {
      runBtn.disabled = true;
      runBtn.classList.add('btn--primary--running');
      if (runBtnLabel) {
        runBtnLabel.replaceChildren();
        const dots = document.createElement('span');
        dots.className = 'dots';
        dots.appendChild(document.createElement('span'));
        dots.appendChild(document.createElement('span'));
        dots.appendChild(document.createElement('span'));
        runBtnLabel.appendChild(dots);
        runBtnLabel.appendChild(document.createTextNode(' Validating'));
      }
    } else {
      runBtn.disabled = false;
      runBtn.classList.remove('btn--primary--running');
      if (runBtnLabel) runBtnLabel.textContent = 'Validate Pendo Install';
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

  runBtn?.addEventListener('click', async () => {
    const runId = ++validationSeq;
    activateTab('status');
    runState = 'running';
    setRunningVisual(true);
    resetStatusUi();
    setStatusHero({ state: 'running', title: 'Validating…', sub: 'Running pendo.validateInstall() in the active tab.' });
    renderStatusHeroTime(null);

    try {
      const res = await runInPage();
      if (!res || !res.status) {
        if (runId === validationSeq) {
          setStatusHero({ state: 'err', title: 'Failed', sub: 'Validation did not return a result.' });
        }
        return;
      }

      if (runId !== validationSeq) return;

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
        urlSanitized: adviceList.some(a => a.supportKey === 'vds'),
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

      lastContext = {
        pageUrl: pageUrl || 'unknown',
        timestamp: toIso(now),
        status, captured, advice: adviceList, checks: checksToRender, cspMeta: cspMeta || '', apiKeyFound, origin: validatedIn || origin || 'page',
        hasError: !!hasError, hasWarn: !!hasWarn,
        snippetOnPage, launcherPresent, launcherAttempted, launcherDataValidated: !!launcherDataValidated, validatedIn: validatedIn || 'page', launcherUrl: res.launcherUrl,
        validationPath: res.validationPath || (validatedIn === 'page' ? 'page' : 'unknown'),
        validationTabId: res.validationTabId,
        launcherExtensionId: res.launcherExtensionId
      };
      renderLogs();

      exportMenuBtn.disabled = false;
      exportMenuBtn.title = 'Export results';

      const failureDetected = !status.validatePresent || hasError || hasWarn;
      if (failureDetected) {
        // Core results are already rendered; end the running spinner before the (possibly
        // slow) AI request so the button returns to idle instead of spinning up to timeoutMs.
        runState = 'done';
        setRunningVisual(false);
        const aiContext = Object.assign({}, lastContext);
        if (qualityGuideCache) aiContext._qualityGuide = qualityGuideCache;
        const aiAdvice = await requestAiAdvice(aiContext);
        if (runId !== validationSeq) return;
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
      if (runId === validationSeq) {
        setStatusHero({ state: 'err', title: 'Validation failed', sub: (e && e.message) || 'Unknown error.' });
      }
    } finally {
      if (runId === validationSeq) {
        runState = 'done';
        setRunningVisual(false);
      }
    }
  });

  /** Run enable-debugging.js in the active tab (MAIN world) and return its result. */
  async function runInActiveTab() {
    const [tab] = await tabsQuery({ active: true, currentWindow: true });
    if (!tab || !tab.id) return { ok: false, message: 'No active tab' };
    try {
      const [{ result }] = await executeScript({ target: { tabId: tab.id }, world: 'MAIN', injectedScript: 'enable-debugging' });
      return result || { ok: false, message: 'No result' };
    } catch (e) {
      return { ok: false, message: e && e.message ? e.message : String(e) };
    }
  }

  /** Enable Pendo Debugger: calls pendo.enableDebugging() in the validated agent context. */
  launchDebuggerBtn.addEventListener('click', async () => {
    const useLauncherCdp = !!(lastContext && lastContext.validationPath === 'launcher-cdp' && lastContext.validationTabId);
    let res;
    if (useLauncherCdp) {
      const launcher = lastContext.launcherExtensionId
        ? { id: lastContext.launcherExtensionId, variant: lastContext.validatedIn || 'launcher' }
        : await detectInstalledPendoLauncherExtension();
      if (!launcher) {
        res = { ok: false, message: 'Pendo Launcher extension not found.' };
      } else {
        res = await enableDebuggingViaLauncherCdp(lastContext.validationTabId, launcher);
      }
    } else {
      res = await runInActiveTab();
    }
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
      const fname = `pendo-install-validator-report_${host}_${Date.now()}.md`;
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

  // ── Theme preference ─────────────────────────────────────────────────────
  /** Force light/dark by setting data-theme on <html>; remove the attribute to follow the system preference. */
  function applyTheme(pref) {
    if (pref === 'light' || pref === 'dark') {
      document.documentElement.dataset.theme = pref;
    } else {
      delete document.documentElement.dataset.theme;
    }
  }

  chrome.storage.local.get({ themePreference: 'system' }, ({ themePreference }) => {
    themeSelect.value = themePreference;
    applyTheme(themePreference);
  });

  themeSelect.addEventListener('change', () => {
    const pref = themeSelect.value;
    applyTheme(pref);
    try {
      if (pref === 'system') localStorage.removeItem('pendoValidateTheme');
      else localStorage.setItem('pendoValidateTheme', pref);
    } catch (e) {}
    chrome.storage.local.set({ themePreference: pref }, () => showToast('Theme updated'));
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
    aiKeyToggle.setAttribute('aria-label', isPassword ? 'Hide API key' : 'Show API key');
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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPopup);
} else {
  initPopup();
}
