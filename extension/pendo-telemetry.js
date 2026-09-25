/**
 * Pendo self-instrumentation Track Events for the Install Validator panel.
 * Client-side pendo.track() only — no server-side Track secret.
 * Property names use the iva prefix; values are strings or booleans per Pendo Group By rules.
 */

/** Bucket log line count for low-cardinality reporting. */
function bucketIvaLogLines(count) {
  const n = Number(count) || 0;
  if (n === 0) return '0';
  if (n <= 10) return '1-10';
  if (n <= 50) return '11-50';
  if (n <= 200) return '51-200';
  return '200+';
}

/** Map validation result to ivaOutcome (aligned with Status hero semantics). */
function deriveIvaOutcome(res) {
  const status = res.status || {};
  const captured = res.captured || [];
  const snippetOnPage = res.snippetOnPage;
  const launcherPresent = res.launcherPresent;
  const launcherAttempted = res.launcherAttempted;
  const launcherDataValidated = res.launcherDataValidated;

  if (!snippetOnPage && launcherAttempted && launcherPresent === false) return 'notDetected';
  if (!status.pendoPresent) return 'notDetected';
  if (!snippetOnPage && launcherPresent === true && launcherDataValidated === false) return 'warn';
  if (!status.validatePresent) return 'warn';
  const errCount = captured.filter((l) => l.level === 'error').length;
  const warnCount = captured.filter((l) => l.level === 'warn').length;
  if (errCount > 0) return 'err';
  if (warnCount > 0) return 'warn';
  return 'ok';
}

function serializeIvaLauncherValidated(value) {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return 'unknown';
}

/** Detect browser family for telemetry (chrome / edge / firefox). */
function detectIvaBrowser() {
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (/Firefox/i.test(ua)) return 'firefox';
    if (/Edg\//i.test(ua)) return 'edge';
  } catch (_) { /* ignore */ }
  return 'chrome';
}

function readIvaExtensionVersion() {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getManifest === 'function') {
      return String(chrome.runtime.getManifest().version || '');
    }
  } catch (_) { /* ignore */ }
  return '';
}

/**
 * Build property map for validation_completed. No page URL, IDs, or console text.
 * @param {object} res - Validation result or lastContext-shaped object
 * @param {{ aiAdviceUsed?: boolean, ivaVersion?: string, browser?: string }} meta
 */
function buildValidationCompletedProps(res, meta) {
  const captured = res.captured || [];
  const checks = res.checks || [];
  const advice = res.advice || [];
  const errCount = captured.filter((l) => l.level === 'error').length;
  const warnCount = captured.filter((l) => l.level === 'warn').length;
  const opts = meta || {};

  return {
    ivaOutcome: deriveIvaOutcome(res),
    ivaValidationPath: String(res.validationPath || 'unknown'),
    ivaValidatedIn: String(res.validatedIn || 'page'),
    ivaSnippetOnPage: !!res.snippetOnPage,
    ivaLauncherPresent: !!res.launcherPresent,
    ivaLauncherValidated: serializeIvaLauncherValidated(res.launcherDataValidated),
    ivaErrCount: String(errCount),
    ivaWarnCount: String(warnCount),
    ivaOkCount: String(checks.length),
    ivaAdviceCount: String(Array.isArray(advice) ? advice.length : 0),
    ivaLogLines: bucketIvaLogLines(captured.length),
    ivaAiUsed: !!opts.aiAdviceUsed,
    ivaVersion: String(opts.ivaVersion != null ? opts.ivaVersion : readIvaExtensionVersion()),
    ivaBrowser: String(opts.browser != null ? opts.browser : detectIvaBrowser()),
  };
}

/** Fire a Track Event; never throws. Uses pendo.track(name, props). */
function trackIvaEvent(name, props) {
  if (!name || typeof name !== 'string') return;
  try {
    const pendo = typeof window !== 'undefined' ? window.pendo : null;
    if (!pendo || typeof pendo.track !== 'function') return;
    pendo.track(name, props || {});
  } catch (_) { /* telemetry must never break the panel */ }
}

function isIvaAgentReady() {
  try {
    const pendo = typeof window !== 'undefined' ? window.pendo : null;
    if (!pendo || typeof pendo.track !== 'function') return false;
    return typeof pendo.isReady !== 'function' || !!pendo.isReady();
  } catch (_) {
    return false;
  }
}

/**
 * trackIvaEvent for events that can fire as the panel opens, before pendo-agent-loader.js has
 * idle-loaded and initialized the agent. Polls until ready; drops the event after maxWaitMs.
 * @param {{ intervalMs?: number, maxWaitMs?: number }} [opts]
 */
function trackIvaEventWhenReady(name, props, opts) {
  const o = opts || {};
  const intervalMs = o.intervalMs > 0 ? o.intervalMs : 500;
  const maxWaitMs = o.maxWaitMs >= 0 ? o.maxWaitMs : 30000;
  const deadline = Date.now() + maxWaitMs;
  const attempt = () => {
    if (isIvaAgentReady()) {
      trackIvaEvent(name, props);
      return;
    }
    if (Date.now() >= deadline) return;
    setTimeout(attempt, intervalMs);
  };
  attempt();
}
