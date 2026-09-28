/** Injected into every frame of the page (MAIN world, allFrames) via scripting.executeScript. Reports whether this frame hosts a Pendo agent, its identity, and whether it is sending data — read-only, no page mutation. Assigned as a function expression behind a revision guard, like capture-inspect.js, so re-injection never redeclares a page global. */
if (globalThis.__pendoValidateFrameProbeRevision !== 1 || typeof globalThis.__pendoValidateFrameProbe !== 'function') {
globalThis.__pendoValidateFrameProbeRevision = 1;
globalThis.__pendoValidateFrameProbe = function frameProbe(opts) {
  const o = opts || {}
  const selfApiKey = String(o.selfApiKey || '').toLowerCase()
  const overlayId = o.overlayIframeId || ''
  const out = {
    url: '',
    isTop: false,
    skipped: null,
    agent: null,
    version: null,
    apiKey: null,
    visitorId: null,
    accountId: null,
    anonymous: false,
    ready: null,
    dataRequests: 0,
    childFrames: 0,
  }
  try { out.isTop = window.top === window } catch {}
  try {
    const proto = location.protocol
    if (proto === 'chrome-extension:' || proto === 'moz-extension:') { out.skipped = 'extension'; return out }
    out.url = proto === 'about:' ? location.href : location.origin + location.pathname
  } catch {}
  try {
    out.childFrames = Array.from(document.querySelectorAll('iframe, frame')).filter(f => !overlayId || f.id !== overlayId).length
  } catch {}

  const agent = window.pendo || window.Pendo || null
  if (agent) {
    let apiKey = null
    try {
      if (typeof agent.apiKey === 'string' && agent.apiKey) apiKey = agent.apiKey
      else if (agent._ && agent._.options && typeof agent._.options.apiKey === 'string') apiKey = agent._.options.apiKey
    } catch {}
    // The extension's own self-instrumentation agent is never reported as the customer's.
    if (apiKey && selfApiKey && String(apiKey).toLowerCase() === selfApiKey) { out.skipped = 'self'; return out }
    out.agent = window.pendo ? 'pendo' : 'Pendo'
    out.apiKey = apiKey
    try { out.version = (typeof agent.getVersion === 'function' && agent.getVersion()) || agent.VERSION || null } catch {}
    try { if (typeof agent.getVisitorId === 'function') out.visitorId = agent.getVisitorId() } catch {}
    try { if (typeof agent.getAccountId === 'function') out.accountId = agent.getAccountId() } catch {}
    try {
      const tempPrefix = (typeof agent.TEMP_PREFIX === 'string' && agent.TEMP_PREFIX) || '_PENDO_T_'
      out.anonymous = out.visitorId != null && String(out.visitorId).indexOf(tempPrefix) === 0
    } catch {}
    // isSendingEvents() is not called: it logs a warning on subscriptions without Pendo Core.
    try { if (typeof agent.isReady === 'function') out.ready = !!agent.isReady() } catch {}
  }

  try {
    const entries = (typeof performance !== 'undefined' && performance.getEntriesByType && performance.getEntriesByType('resource')) || []
    for (const r of entries) {
      const name = (r && r.name) || ''
      if (!/\/data\/(?:ptm|guide|poll|agentic)\.gif\//.test(name)) continue
      if (selfApiKey && name.toLowerCase().indexOf(selfApiKey) !== -1) continue
      out.dataRequests++
    }
  } catch {}
  return out
};
}
