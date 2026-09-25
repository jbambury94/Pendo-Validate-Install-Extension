/**
 * Panel-side analysis of the extra validation data: the agent environment check, duplicate installs
 * and API keys, the frame map, and the network capture. Pure functions over data already returned by
 * capture-inspect.js, frame-probe.js and the background CDP capture — nothing here calls a Pendo agent.
 * Loaded before popup.js; tests load it via vm.runInThisContext. The top level holds only function
 * declarations and DIAG_-prefixed vars, so it can be loaded twice in one realm and never collides
 * with popup.js's top-level consts.
 */

var DIAG_OVERLAY_IFRAME_ID = 'pendo-validate-overlay-iframe';
var DIAG_HEALTHY_CHECK = 'Installation looks healthy based on current checks.';
var DIAG_NO_RESOURCES_PREFIX = 'No Pendo network resources observed';
var DIAG_NOT_DETECTED_PREFIX = 'Pendo agent not detected.';
var DIAG_NO_API_KEY_PREFIX = 'No API key detected.';
var DIAG_NETWORK_NOT_RUN = 'Network capture not run (turn on in Settings; Chrome/Edge only).';

// Built-ins the agent relies on to serialize and send data. Keys are validateNativeMethods()
// type labels; null means any wrapped method of that type. Promise and XMLHttpRequest are left
// out on purpose: zone.js and monitoring tools wrap them on many healthy sites.
var DIAG_CRITICAL_METHODS = {
  'JSON': null,
  'Object': null,
  'Object | Prototype': null,
  'Array | Prototype': ['toJSON'],
};

var DIAG_REQUEST_KIND_LABELS = {
  agent: 'agent script',
  events: 'event data',
  guides: 'guide',
  polls: 'poll',
  replay: 'session replay',
  other: 'other Pendo',
};

var DIAG_CONFIG_SOURCE_LABELS = {
  snippet: 'snippet',
  pendoconfig: 'hosted config',
  global: 'window.pendo',
};

/** Default values from ConfigReader.initializeOptions in the pinned @pendo/web-sdk (drift-tested). */
var DIAG_CONFIG_DEFAULTS = {
  allowMixedApplicationFrames: true,
  allowMixedApiKeyFrames: true,
  autoFrameInstall: false,
  blockWebSDKMetadata: false,
  initializeWhenVisible: false,
  disablePendo: false,
  enableSignedMetadata: false,
  forceAnonymous: false,
  forcedLeader: false,
  frameIdentitySync: false,
  frameIdentityTopDownOnly: true,
  initializeImmediately: false,
  'location.pushState': true,
  maxCookieTTLDays: Infinity,
  observeShadowRoots: false,
  pendoCore: true,
  preferBroadcastChannel: false,
  preferMutationObserver: false,
  preventUnloadListener: false,
  requireSignedMetadata: false,
  sendEventsWithPostOnly: false,
  allowedText: [],
  'analytics.excludeEvents': [],
  'analytics.localStorageUnload': false,
  eventPropertyMatchParents: true,
  excludeAllText: false,
  excludeNonGuideAnalytics: false,
  interceptPreventDefault: true,
  interceptStopPropagation: true,
  'syntheticClicks.elementRemoval': false,
  'syntheticClicks.targetChanged': true,
  cacheGuides: false,
  cacheGuidesTimeout: 600000,
  disableDesigner: false,
  disableDesignerKeyboardShortcut: false,
  disableGlobalCSS: false,
  disableGuidePseudoStyles: false,
  disableImportantStyleAttributes: false,
  enableGuideTimeout: false,
  guideSeenTimeoutLength: 10000,
  guideValidation: false,
  'guides.delay': false,
  'guides.disabled': false,
  'guides.ejectOnTimeout': false,
  'guides.globalScripts': [],
  leaderApplication: [],
  leaderKey: [],
  preventCodeInjection: false,
  useAssetHostForDesigner: false,
  'storage.allowKeys': '*',
  feedbackSettings: {},
  pendoFeedback: false,
  enableCrossOriginIsolation: false,
  secureDesignerConnect: false,
  allowPartnerAnalyticsForwarding: false,
  adoptPrioritizeAdoptGuides: false,
  errorClickLogging: false,
  enableAllEmbeddedGuideEvents: false,
  formValidation: false,
  performanceMetricsEnabled: true,
  performanceMetricsSampleRate: 10,
};

function diagExpectedConfigSerialized(defVal) {
  try {
    const s = JSON.stringify(defVal);
    return s === undefined ? String(defVal) : s;
  } catch {
    return String(defVal);
  }
}

function diagConfigValueIsDefault(name, serializedValue) {
  const val = serializedValue == null ? '' : String(serializedValue);
  if (DIAG_CONFIG_DEFAULTS[name] === undefined) {
    return val === '' || val === 'null' || val === 'false' || val === '""' || val === '[]' || val === '{}' || val === 'undefined';
  }
  const def = DIAG_CONFIG_DEFAULTS[name];
  if (def === Infinity) return val === 'null' || val === 'Infinity';
  return val === diagExpectedConfigSerialized(def);
}

/** Non-default agent config options from capture-inspect (Validate Config options). */
function summarizeAgentConfig(config) {
  if (!config || config.reported !== true) {
    return { reported: false, options: [], hiddenAsDefault: 0, conflicts: [] };
  }
  let hiddenAsDefault = 0;
  const options = [];
  for (const opt of config.options || []) {
    if (diagConfigValueIsDefault(opt.name, opt.value)) { hiddenAsDefault++; continue; }
    options.push({
      name: opt.name,
      value: opt.value,
      source: opt.source,
      sourceLabel: DIAG_CONFIG_SOURCE_LABELS[opt.source] || opt.source,
    });
  }
  const conflicts = (config.conflicts || []).map((c) => ({
    name: c.name,
    detail: (c.values || []).map((v) => `${v.value} (${DIAG_CONFIG_SOURCE_LABELS[v.source] || v.source})`).join('; '),
  }));
  return { reported: true, options, hiddenAsDefault, conflicts };
}

function diagClip(text, max) {
  const s = String(text == null ? '' : text);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function diagPlural(n, one, many) {
  return n === 1 ? one : (many || one + 's');
}

function diagOrigin(url) {
  try {
    const u = new URL(String(url || ''));
    return u.protocol === 'about:' ? u.href : u.origin;
  } catch {
    return String(url || '') || 'unknown';
  }
}

function diagListWithMore(items, max) {
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  return shown.join(', ') + (rest > 0 ? `, and ${rest} more` : '');
}

/** Same registrable domain, approximated by the last two host labels (no public-suffix list). */
function diagSameSite(a, b) {
  try {
    const ha = new URL(a).hostname.toLowerCase();
    const hb = new URL(b).hostname.toLowerCase();
    if (!ha || !hb) return false;
    if (ha === hb) return true;
    if (/^[\d.]+$/.test(ha) || /^[\d.]+$/.test(hb)) return false;
    const site = (h) => h.split('.').slice(-2).join('.');
    return site(ha) === site(hb);
  } catch {
    return false;
  }
}

/** Split validateEnvironment() wrapped methods into the ones that break Pendo and the rest. */
function diagSplitWrappedMethods(methods) {
  const critical = [];
  const other = [];
  for (const m of Array.isArray(methods) ? methods : []) {
    const type = String((m && m.type) || '').trim();
    const names = Array.isArray(m && m.names) ? m.names : [];
    const rule = Object.prototype.hasOwnProperty.call(DIAG_CRITICAL_METHODS, type) ? DIAG_CRITICAL_METHODS[type] : undefined;
    for (const name of names) {
      const label = `${type.replace(' | Prototype', '.prototype')}.${name}`;
      if (rule === null || (Array.isArray(rule) && rule.indexOf(name) !== -1)) critical.push(label);
      else other.push(label);
    }
  }
  return { critical, other };
}

function diagRemoveHealthyCheck(result) {
  if (Array.isArray(result.checks) && Array.isArray(result.advice) && result.advice.length) {
    result.checks = result.checks.filter(c => c !== DIAG_HEALTHY_CHECK);
  }
}

function diagAgentScriptBasename(src) {
  const path = String(src || '').split(/[?#]/)[0];
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(i + 1).toLowerCase() : path.toLowerCase();
}

/** Group agent script tags by subscription (apiKey), or by src when apiKey is missing. */
function diagGroupAgentScripts(scripts) {
  const groups = new Map();
  for (const s of Array.isArray(scripts) ? scripts : []) {
    if (!s) continue;
    const key = (s.apiKey && String(s.apiKey).toLowerCase()) || String(s.src || '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  return groups;
}

/**
 * Loads for one subscription: pendo.js plus pendo-staging.js on the same key is one install;
 * two pendo.js tags (or two staging tags) on the same key are duplicate loads.
 */
function diagAgentScriptLoadCount(group) {
  let prod = 0;
  let staging = 0;
  for (const s of group) {
    const base = diagAgentScriptBasename(s.src);
    if (base === 'pendo-staging.js') staging++;
    else if (base === 'pendo.js') prod++;
    else prod++;
  }
  let n = prod + staging;
  if (prod > 0 && staging > 0) n -= 1;
  return n;
}

/** True when any subscription has more than one effective agent load (not prod + staging pair). */
function hasDuplicateAgentScriptInstalls(status) {
  const groups = diagGroupAgentScripts(status && status.agentScripts);
  for (const group of groups.values()) {
    if (diagAgentScriptLoadCount(group) > 1) return true;
  }
  return false;
}

/**
 * Advice for the environment check, duplicate installs and multiple API keys, from the raw status
 * fields capture-inspect.js returns. Runs for the page and the Launcher CDP result alike.
 */
function appendDiagnosticsAdviceToResult(result) {
  if (!result || !result.status || !result.status.pendoPresent) return result;
  const status = result.status;
  result.advice = result.advice || [];
  result.checks = result.checks || [];
  const env = status.environment;
  const agentLabel = status.version ? `agent ${status.version}` : 'this agent';

  if (env && env.available === false) {
    result.checks.push(`Environment check not available on ${agentLabel} (no validateEnvironment()).`);
  } else if (env && env.failed) {
    result.checks.push(`Environment check could not run: ${diagClip(env.failed, 200)}`);
  } else if (env && env.available) {
    const errorCount = env.errorCount || 0;
    if (errorCount > 0) {
      const latest = (env.errors || []).slice(-3).reverse().map(e => `"${diagClip(e, 160)}"`);
      result.advice.push({
        text: `The agent logged ${errorCount} ${diagPlural(errorCount, 'error')} since this page loaded. `
          + (latest.length ? `Most recent: ${latest.join('; ')}. ` : '')
          + 'The full error history is in Install details and the Markdown report.',
        source: 'builtin', supportKey: 'agentDebug', severity: 'warn',
      });
    }
    const wrapped = diagSplitWrappedMethods(env.methods);
    if (wrapped.critical.length) {
      result.advice.push({
        text: `Built-in methods the agent relies on have been replaced on this page: ${diagListWithMore(wrapped.critical, 5)}. `
          + 'Libraries such as Prototype.js or MooTools do this, and it can break how Pendo serializes and sends data. '
          + 'Restore the native methods, or load a version of the library that leaves them alone.',
        source: 'builtin', supportKey: 'troubleshooting', severity: 'warn',
      });
    }
    if (wrapped.other.length) {
      result.checks.push(`${wrapped.other.length} other built-in ${diagPlural(wrapped.other.length, 'method is', 'methods are')} wrapped (${diagListWithMore(wrapped.other, 4)}). This is common with polyfills and monitoring tools and is usually harmless.`);
    }
    for (const g of env.globals || []) {
      if (/window\.Event\b/.test(g)) {
        result.advice.push({
          text: `Pendo's environment check reports: "${diagClip(g, 200)}". The agent relies on the native Event object to track clicks and guide interactions.`,
          source: 'builtin', supportKey: 'troubleshooting', severity: 'warn',
        });
      } else {
        result.checks.push(`Pendo's environment check reports: "${diagClip(g, 200)}". Iframes inside shadow DOM or <object> elements cause this, and it is usually harmless.`);
      }
    }
    const urlTypes = new Set((env.url || []).map(u => u && u.type));
    if (urlTypes.has('customizedUrl')) {
      result.checks.push('Pendo reports a customized URL for this page (location API or URL settings), which changes page matching and guide targeting.');
    }
    if (urlTypes.has('sanitizedUrl')) {
      result.checks.push('Pendo sanitizes the URL before sending it (for example, query parameters removed by URL settings).');
    }
  }

  const scripts = Array.isArray(status.agentScripts) ? status.agentScripts : [];
  for (const group of diagGroupAgentScripts(scripts).values()) {
    const loads = diagAgentScriptLoadCount(group);
    if (loads <= 1) continue;
    const srcs = [];
    for (const s of group) if (s && s.src && srcs.indexOf(s.src) === -1) srcs.push(s.src);
    result.advice.push({
      text: `The Pendo agent script is included ${loads} times on this page (${diagListWithMore(srcs, 3)}). `
        + 'Loading the agent more than once can double-count events and make guides misbehave. Keep a single install snippet.',
      source: 'builtin', supportKey: 'installComponents', severity: 'warn',
    });
  }

  const keys = Array.isArray(status.apiKeysSeen) ? status.apiKeysSeen : [];
  const primaryKey = status.detectedApiKey ? String(status.detectedApiKey).toLowerCase() : null;
  const otherKey = status.otherAgentApiKey ? String(status.otherAgentApiKey).toLowerCase() : null;
  if (status.snippetGlobalPresent && status.launcherGlobalPresent && primaryKey && otherKey && primaryKey !== otherKey) {
    result.advice.push({
      text: 'Both the install snippet (window.pendo) and the Pendo Launcher (window.Pendo) are active on this page, with different API keys. '
        + 'Data may be split across subscriptions. Remove one of them, or confirm this is intentional.',
      source: 'builtin', supportKey: 'installComponents', severity: 'warn',
    });
  } else if (keys.length > 1) {
    const intent = Array.isArray(status.configKeys) && status.configKeys.indexOf('additionalApiKeys') !== -1
      ? 'The install sets additionalApiKeys, so this may be intentional.'
      : 'If this is not intentional, data may go to the wrong subscription.';
    result.advice.push({
      text: `Agents for ${keys.length} different Pendo API keys are loading on this page. ${intent}`,
      source: 'builtin', supportKey: 'installComponents', severity: 'warn',
    });
  }

  return result;
}

/** frame-probe.js InjectionResults -> inspected frames (skipped and empty results dropped). */
function summarizeFrameProbeResults(results) {
  if (!Array.isArray(results)) return null;
  const frames = [];
  for (const r of results) {
    const f = r && r.result;
    if (!f || typeof f !== 'object' || f.skipped) continue;
    frames.push({
      frameId: typeof r.frameId === 'number' ? r.frameId : null,
      url: String(f.url || ''),
      isTop: !!f.isTop,
      agent: f.agent || null,
      version: f.version || null,
      apiKey: f.apiKey || null,
      visitorId: f.visitorId != null ? f.visitorId : null,
      accountId: f.accountId != null ? f.accountId : null,
      anonymous: !!f.anonymous,
      ready: typeof f.ready === 'boolean' ? f.ready : null,
      dataRequests: Number(f.dataRequests) || 0,
      childFrames: Number(f.childFrames) || 0,
    });
  }
  frames.sort((a, b) => (b.isTop - a.isTop) || ((a.frameId == null ? 1e9 : a.frameId) - (b.frameId == null ? 1e9 : b.frameId)));
  return frames;
}

/**
 * Frame map summary plus its advice and checks. Mismatched identity in a subframe and Pendo present
 * only in subframes are warnings; same-site frames without Pendo and uninspectable frames are
 * informational; third-party frames without Pendo are listed only.
 * @param {Array<object>|null} frames - from summarizeFrameProbeResults (null when the probe failed)
 * @param {{ validationPath?: string }} [opts]
 */
function analyzeFrameMap(frames, opts) {
  const o = opts || {};
  const advice = [];
  const checks = [];
  if (!Array.isArray(frames) || !frames.length) {
    return { frameMap: { available: false, frames: [], inspected: 0, notInspectable: 0, subframeCount: 0, subframePendoCount: 0, topHasAgent: null, note: null }, advice, checks };
  }
  const top = frames.find(f => f.isTop) || null;
  const subs = frames.filter(f => f !== top);
  const expected = 1 + frames.reduce((n, f) => n + (f.childFrames || 0), 0);
  const notInspectable = Math.max(0, expected - frames.length);
  const withAgent = subs.filter(f => f.agent);
  const topHasAgent = !!(top && top.agent);
  const note = /^launcher/.test(o.validationPath || '')
    ? 'The frame map lists agents in the page itself. The Pendo Launcher runs in an isolated world, so its agent is not listed here.'
    : null;

  if (subs.length) {
    if (!topHasAgent && withAgent.length) {
      advice.push({
        text: `Pendo isn't on the top page but is running in ${withAgent.length} ${diagPlural(withAgent.length, 'subframe')} (${diagListWithMore(withAgent.map(f => diagOrigin(f.url)), 3)}). `
          + "Open the frame's own page and validate there for the full checks.",
        source: 'builtin', supportKey: 'iframe', severity: 'warn',
      });
    } else if (topHasAgent) {
      const lc = (v) => (v == null || v === '' ? null : String(v).toLowerCase());
      const differs = (a, b) => a != null && b != null && String(a) !== String(b);
      let consistent = 0;
      for (const f of withAgent) {
        const parts = [];
        if (lc(f.apiKey) && lc(top.apiKey) && lc(f.apiKey) !== lc(top.apiKey)) parts.push('uses a different API key');
        if (differs(f.visitorId, top.visitorId)) parts.push('identifies a different visitor');
        if (differs(f.accountId, top.accountId)) parts.push('identifies a different account');
        if (!parts.length) { consistent++; continue; }
        advice.push({
          text: `The subframe at ${diagOrigin(f.url)} ${parts.join(' and ')} than the top page. `
            + 'Use the same API key, visitor ID and account ID in every frame so activity is attributed to one visitor.',
          source: 'builtin', supportKey: 'iframe', severity: 'warn',
        });
      }
      if (consistent) {
        checks.push(`Pendo is also running in ${consistent} ${diagPlural(consistent, 'subframe')} with the same API key and identity as the top page.`);
      }
      const sameSiteBare = subs.filter(f => !f.agent && top.url && diagSameSite(f.url, top.url));
      if (sameSiteBare.length) {
        checks.push(`${sameSiteBare.length} same-site ${diagPlural(sameSiteBare.length, 'subframe has', 'subframes have')} no Pendo agent (${diagListWithMore(sameSiteBare.map(f => diagOrigin(f.url)), 3)}). If users work inside ${diagPlural(sameSiteBare.length, 'it', 'them')}, install Pendo there too.`);
      }
    }
  }
  if (notInspectable > 0) {
    checks.push(`${notInspectable} ${diagPlural(notInspectable, 'frame')} could not be inspected (sandboxed, restricted or still loading).`);
  }

  return {
    frameMap: {
      available: true,
      frames,
      inspected: frames.length,
      notInspectable,
      subframeCount: subs.length,
      subframePendoCount: withAgent.length,
      topHasAgent,
      note,
    },
    advice,
    checks,
  };
}

/** Kind of Pendo request, from the Web SDK route list (see PENDO_CUSTOM_DOMAIN_PATH_RE in har-capture.js). */
function classifyPendoRequest(url) {
  let path = '';
  try {
    path = new URL(String(url || '')).pathname.toLowerCase();
  } catch {
    return 'other';
  }
  if (/\/agent\/static\/[0-9a-f-]{36}\/pendo(?:-staging)?\.js$/.test(path)) return 'agent';
  if (/^\/data\/ptm\.gif\//.test(path)) return 'events';
  if (/^\/data\/(?:guide\.js|guide\.json|guide\.gif)\//.test(path) || path.indexOf('/guide-content/') !== -1) return 'guides';
  if (/^\/data\/poll\.gif\//.test(path)) return 'polls';
  if (/^\/data\/(?:rec|recordingconf|live-replay)(?:\/|$)/.test(path)) return 'replay';
  return 'other';
}

/** Why a captured request failed, or null when it succeeded (canceled requests are not failures). */
function describeNetworkFailure(req) {
  if (!req) return null;
  const blocked = String(req.blockedReason || '').toLowerCase();
  const errorText = String(req.errorText || '');
  if (blocked === 'csp' || /ERR_BLOCKED_BY_CSP/i.test(errorText)) return { code: 'csp', text: "blocked by the page's Content Security Policy" };
  if (blocked === 'mixed-content') return { code: 'mixed-content', text: 'blocked as mixed content (an HTTP request from an HTTPS page)' };
  if (/ERR_BLOCKED_BY_CLIENT/i.test(errorText)) return { code: 'client', text: 'blocked by the browser or an extension such as an ad blocker' };
  if (blocked) return { code: 'blocked', text: `blocked (${blocked})` };
  if (req.corsError) return { code: 'cors', text: `blocked by CORS (${req.corsError})` };
  if (req.canceled) return null;
  if (errorText) return { code: 'failed', text: `failed (${errorText})` };
  if (typeof req.status === 'number' && req.status >= 400) return { code: 'http', text: `returned HTTP ${req.status}` };
  return null;
}

/** Requests grouped by kind, in display order, each with its failures. */
function groupNetworkRequests(summary) {
  const order = ['agent', 'events', 'guides', 'polls', 'replay', 'other'];
  const groups = {};
  for (const req of (summary && Array.isArray(summary.requests) ? summary.requests : [])) {
    const kind = classifyPendoRequest(req.url);
    const g = groups[kind] || (groups[kind] = { kind, label: DIAG_REQUEST_KIND_LABELS[kind], total: 0, failures: [] });
    g.total++;
    const failure = describeNetworkFailure(req);
    if (failure) g.failures.push({ url: req.url, status: req.status, code: failure.code, text: failure.text });
  }
  return order.filter(k => groups[k]).map(k => groups[k]);
}

/** Advice and checks for a network capture summary (from summarizePendoNetworkFromCdp). */
function buildNetworkFindings(summary) {
  const advice = [];
  const checks = [];
  if (!summary) return { advice, checks };
  const groups = groupNetworkRequests(summary);
  const byKind = {};
  groups.forEach(g => { byKind[g.kind] = g; });

  for (const g of groups) {
    if (!g.failures.length) continue;
    const counts = {};
    for (const f of g.failures) counts[f.code] = (counts[f.code] || 0) + 1;
    const top = g.failures.slice().sort((a, b) => counts[b.code] - counts[a.code])[0];
    const supportKey = top.code === 'csp' ? 'csp' : g.kind === 'agent' ? 'installGuide' : 'troubleshooting';
    if (g.kind === 'agent') {
      advice.push({
        text: `The Pendo agent script was ${top.text} (${top.url}). Pendo can't run on this page until it loads.`,
        source: 'builtin', supportKey, severity: 'error',
      });
    } else {
      const n = g.failures.length;
      advice.push({
        text: `${n} of ${g.total} ${g.label} ${diagPlural(g.total, 'request')} ${n === 1 ? 'was' : 'were'} ${top.text}, for example ${top.url}.`,
        source: 'builtin', supportKey, severity: 'warn',
      });
    }
  }

  const failed = groups.reduce((n, g) => n + g.failures.length, 0);
  const total = groups.reduce((n, g) => n + g.total, 0);
  if (total && !failed) {
    checks.push(`Network capture: all ${total} Pendo ${diagPlural(total, 'request')} completed (${groups.map(g => `${g.total} ${g.label}`).join(', ')}).`);
  }
  if (!total) {
    checks.push('Network capture: no Pendo requests were made while the page reloaded.');
  } else if (!byKind.events) {
    checks.push('Network capture: no event data (ptm.gif) was sent in the capture window, about 2 seconds after the page loaded. Pendo batches events, so this can be normal.');
  }
  if (summary.truncated) {
    checks.push(`Network capture: only the first ${summary.requests.length} of ${summary.requestCount} Pendo requests were kept.`);
  }
  return { advice, checks };
}

/**
 * Attach the frame map and network capture to a validation result and fold their findings, plus
 * the environment and duplicate-install advice, into result.advice / result.checks.
 * @param {object} result - runInPage result
 * @param {{ frames?: Array<object>|null, networkCapture?: object|null, networkCaptureAvailable?: boolean }} [opts]
 */
function appendDiagnosticsToResult(result, opts) {
  if (!result) return result;
  const o = opts || {};
  result.advice = result.advice || [];
  result.checks = result.checks || [];
  appendDiagnosticsAdviceToResult(result);

  const frames = analyzeFrameMap(o.frames, { validationPath: result.validationPath });
  result.frameMap = frames.frameMap;
  const subframeOnly = frames.frameMap.subframePendoCount > 0 && !frames.frameMap.topHasAgent
    && !(result.status && result.status.pendoPresent);
  if (subframeOnly) {
    // The subframe finding explains the missing top-page agent (and its key) better than the generic advice.
    result.advice = result.advice.filter(a => !(a && typeof a.text === 'string'
      && (a.text.indexOf(DIAG_NOT_DETECTED_PREFIX) === 0 || a.text.indexOf(DIAG_NO_API_KEY_PREFIX) === 0)));
  }
  result.advice.push(...frames.advice);
  result.checks.push(...frames.checks);

  const nc = o.networkCapture;
  if (nc && nc.summary) {
    result.networkCapture = {
      summary: nc.summary,
      har: nc.har || null,
      entryCount: typeof nc.entryCount === 'number' ? nc.entryCount : null,
      capturedAt: nc.ts || Date.now(),
    };
    const found = buildNetworkFindings(nc.summary);
    result.advice.push(...found.advice);
    result.checks.push(...found.checks);
  } else if (o.networkCaptureAvailable) {
    result.advice = result.advice.map(a => (a && typeof a.text === 'string' && a.text.indexOf(DIAG_NO_RESOURCES_PREFIX) === 0)
      ? { ...a, text: `${a.text} Turn on Network capture in Settings to see whether requests were blocked.` }
      : a);
  }

  diagRemoveHealthyCheck(result);
  return result;
}

/** Advice carrying an explicit severity (the checks above); older advice has none and is not counted. */
function countSeverityAdvice(advice) {
  const out = { error: 0, warn: 0 };
  for (const a of Array.isArray(advice) ? advice : []) {
    if (a && a.severity === 'error') out.error++;
    else if (a && a.severity === 'warn') out.warn++;
  }
  return out;
}

/** A capture only describes the page it reloaded: same origin as the tab now, or unknown document URL. */
function networkCaptureMatchesPage(networkCapture, pageUrl) {
  const docUrl = networkCapture && networkCapture.summary && networkCapture.summary.documentUrl;
  if (!docUrl) return !!(networkCapture && networkCapture.summary);
  const a = diagOrigin(docUrl);
  const b = diagOrigin(pageUrl);
  return !!a && a === b;
}

/** Top frame has no agent (and no Launcher data), but at least one subframe does. */
function hasSubframeOnlyPendo(res) {
  if (!res) return false;
  const status = res.status || {};
  const fm = res.frameMap;
  return !status.pendoPresent && res.launcherDataValidated !== true && !!fm && fm.subframePendoCount > 0;
}

function deriveSubframeHeroState(res) {
  if (!hasSubframeOnlyPendo(res)) return null;
  const n = res.frameMap.subframePendoCount;
  return { state: 'warn', title: 'Pendo found in a subframe', sub: `Not on the top page; found in ${n} ${diagPlural(n, 'subframe')}.` };
}

/** Console errors/warnings plus advice carrying an explicit severity (same basis as the Status hero). */
function countValidationSeverity(res) {
  const captured = (res && res.captured) || [];
  const flagged = countSeverityAdvice(res && res.advice);
  const logErrCount = captured.filter((l) => l && l.level === 'error').length;
  return {
    error: logErrCount + flagged.error,
    warn: captured.filter((l) => l && l.level === 'warn').length + flagged.warn,
    logErrCount,
  };
}

/** Markdown / Share status when Pendo is only in a subframe; severity wins over the subframe-only label. */
function deriveSubframeStatusLine(res) {
  if (!hasSubframeOnlyPendo(res)) return null;
  const s = countValidationSeverity(res);
  if (s.error > 0) return 'Errors found';
  if (s.warn > 0) return 'Warnings found';
  return 'Pendo found in a subframe';
}

/** Subframe hero unless errors or warnings from checks should drive the hero instead. */
function resolveSubframeHeroState(res, originNote) {
  const subframeHero = deriveSubframeHeroState(res);
  if (!subframeHero) return null;
  const note = originNote || '';
  const s = countValidationSeverity(res);
  if (s.error > 0) {
    return {
      state: 'err',
      title: `${s.error} error${s.error === 1 ? '' : 's'}`,
      sub: (s.logErrCount ? 'validateInstall() reported errors' : 'Validation found errors') + note + `. ${subframeHero.sub}`,
    };
  }
  if (s.warn > 0) {
    return {
      state: 'warn',
      title: `${s.warn} warning${s.warn === 1 ? '' : 's'}`,
      sub: 'Install works, but there are recommendations' + note + `. ${subframeHero.sub}`,
    };
  }
  return subframeHero;
}

/** Values the Share summary must redact when identity is off (frame IDs, API keys, frame hosts). */
function collectDiagnosticsSecrets(context) {
  const out = [];
  const add = (v) => { if (v != null && v !== '') out.push(String(v)); };
  const status = (context && context.status) || {};
  (status.apiKeysSeen || []).forEach(add);
  add(status.otherAgentApiKey);
  const fm = context && context.frameMap;
  for (const f of (fm && Array.isArray(fm.frames) ? fm.frames : [])) {
    add(f.visitorId);
    add(f.accountId);
    add(f.apiKey);
    try { add(new URL(f.url).host); } catch { /* about:blank etc. */ }
  }
  return out;
}

/** New keys for the Markdown report's Metadata JSON. */
function buildDiagnosticsMetadata(context) {
  const status = (context && context.status) || {};
  const env = status.environment;
  const fm = context && context.frameMap;
  const scripts = Array.isArray(status.agentScripts) ? status.agentScripts : [];
  return {
    visitorAnonymous: !!status.visitorAnonymous,
    agentScriptCount: scripts.length,
    agentScripts: scripts.map(s => s.src),
    apiKeysSeen: Array.isArray(status.apiKeysSeen) ? status.apiKeysSeen : [],
    environmentCheck: env && env.available && !env.failed ? 'available' : 'unavailable',
    agentErrorCount: (env && env.errorCount) || 0,
    agentPlugins: (env && Array.isArray(env.plugins)) ? env.plugins : [],
    framesInspected: fm && fm.available ? fm.inspected : 0,
    framesNotInspectable: fm && fm.available ? fm.notInspectable : 0,
    subframePendo: fm && fm.available ? fm.subframePendoCount : 0,
    networkCapture: !!(context && context.networkCapture && context.networkCapture.summary),
    agentConfigNonDefault: summarizeAgentConfig(env && env.config).options.length,
  };
}

/** One display line per frame (Frames card and report). */
function describeFrame(f) {
  const where = f.url || 'unknown';
  if (!f.agent) return { where, detail: 'No Pendo' };
  const parts = [`${f.agent}${f.version ? ' ' + f.version : ''}`];
  if (f.apiKey) parts.push(`key ${f.apiKey}`);
  parts.push(f.visitorId != null ? `visitor ${f.visitorId}${f.anonymous ? ' (anonymous)' : ''}` : 'no visitor');
  if (f.accountId != null) parts.push(`account ${f.accountId}`);
  if (f.ready === true) parts.push('ready');
  else if (f.ready === false) parts.push('not ready');
  parts.push(`${f.dataRequests} data ${diagPlural(f.dataRequests, 'request')}`);
  return { where, detail: parts.join(' · ') };
}

/** Markdown lines for the report's Agent environment, Frames and Network sections. */
function buildDiagnosticsMarkdownSections(context) {
  const lines = [];
  const status = (context && context.status) || {};
  const env = status.environment;

  lines.push('## Agent environment');
  if (!env) {
    lines.push('Environment check not run (no agent on the page).');
  } else if (env.available === false) {
    lines.push(`Environment check not available on agent ${status.version || 'unknown'}.`);
  } else if (env.failed) {
    lines.push(`Environment check failed: ${env.failed}`);
  } else {
    const cfgSum = summarizeAgentConfig(env.config);
    lines.push('### Config options (non-default)');
    if (!cfgSum.reported) {
      lines.push('Not reported by this agent version.');
    } else if (!cfgSum.options.length) {
      lines.push('All config options are at their defaults.');
    } else {
      lines.push('| Option | Value | Source |');
      lines.push('| --- | --- | --- |');
      cfgSum.options.forEach((o) => {
        const safeVal = String(o.value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
        lines.push(`| ${o.name} | ${safeVal} | ${o.sourceLabel} |`);
      });
      cfgSum.conflicts.forEach((c) => {
        if (c.detail) lines.push(`- **Config conflict — ${c.name}:** ${c.detail}`);
      });
    }
    lines.push('');
    lines.push(`### Error history (${env.errorCount || 0})`);
    if (env.errors && env.errors.length) {
      if (env.errorCount > env.errors.length) lines.push(`Showing the ${env.errors.length} most recent.`);
      env.errors.forEach(e => lines.push(`- ${e}`));
    } else {
      lines.push('No errors logged by the agent.');
    }
    lines.push('### Wrapped built-in methods');
    const wrapped = diagSplitWrappedMethods(env.methods);
    if (!wrapped.critical.length && !wrapped.other.length) lines.push('None. All checked built-ins are native.');
    wrapped.critical.forEach(m => lines.push(`- ${m} **(can break Pendo)**`));
    wrapped.other.forEach(m => lines.push(`- ${m}`));
    lines.push('### Global variables');
    if (env.globals && env.globals.length) env.globals.forEach(g => lines.push(`- ${g}`));
    else lines.push('No modified globals.');
    lines.push('### URL');
    if (env.url && env.url.length) env.url.forEach(u => lines.push(`- ${u.type || 'url'}: ${u.msg}${u.value ? ` \`${u.value}\`` : ''}`));
    else lines.push('The URL is not customized or sanitized.');
    lines.push('### Plugins');
    if (env.plugins && env.plugins.length) lines.push(env.plugins.join(', '));
    else lines.push('None reported.');
  }
  lines.push('');

  lines.push('## Frames');
  const fm = context && context.frameMap;
  if (!fm || !fm.available) {
    lines.push('Frame map unavailable.');
  } else {
    fm.frames.forEach(f => {
      const d = describeFrame(f);
      lines.push(`- **${f.isTop ? 'Top' : 'Subframe'}** ${d.where} — ${d.detail}`);
    });
    if (fm.notInspectable) lines.push(`${fm.notInspectable} ${diagPlural(fm.notInspectable, 'frame')} could not be inspected.`);
    if (fm.note) lines.push(fm.note);
  }
  lines.push('');

  lines.push('## Network');
  const nc = context && context.networkCapture;
  if (!nc || !nc.summary) {
    lines.push(DIAG_NETWORK_NOT_RUN);
  } else {
    const summary = nc.summary;
    const reqs = Array.isArray(summary.requests) ? summary.requests : [];
    const count = summary.requestCount != null ? summary.requestCount : reqs.length;
    lines.push(`${count} Pendo ${diagPlural(count, 'request')} captured while the page reloaded.`);
    const MAX_LINES = 100;
    reqs.slice(0, MAX_LINES).forEach(r => {
      const failure = describeNetworkFailure(r);
      const outcome = failure ? failure.text : (r.canceled ? 'canceled' : (r.status != null ? String(r.status) : 'no response'));
      lines.push(`- **${classifyPendoRequest(r.url)}** ${r.method || 'GET'} ${r.url} — ${outcome}`);
    });
    if (reqs.length > MAX_LINES) lines.push(`…and ${reqs.length - MAX_LINES} more (see the HAR download).`);
    lines.push('### Content-Security-Policy');
    const csp = summary.documentCsp || {};
    const enforce = csp.enforce || [];
    const reportOnly = csp.reportOnly || [];
    if (!enforce.length && !reportOnly.length) {
      lines.push('No Content-Security-Policy header on the page response.');
    } else {
      lines.push('```text');
      enforce.forEach(p => lines.push(`enforced: ${p}`));
      reportOnly.forEach(p => lines.push(`report-only: ${p}`));
      lines.push('```');
    }
  }
  lines.push('');
  return lines;
}
