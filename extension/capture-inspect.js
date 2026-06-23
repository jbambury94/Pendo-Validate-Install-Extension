/** Injected into page MAIN world via scripting.executeScript. This file is the single source of truth for captureAndInspect — tests/helpers.js loads and runs it directly (via vm) rather than mirroring it. Re-assigns when revision changes so upgrades/re-injection replace a stale page global. Assigned as a function expression (not a top-level declaration) so it never creates a page-global `captureAndInspect` binding that could collide with the host page. Keep revision (2) in sync with popup.js _INJECTED_SCRIPTS['capture-inspect'].revision. */
if (globalThis.__pendoValidateCaptureAndInspectRevision !== 2 || typeof globalThis.__pendoValidateCaptureAndInspect !== 'function') {
globalThis.__pendoValidateCaptureAndInspectRevision = 2;
globalThis.__pendoValidateCaptureAndInspect = function captureAndInspect(variant = 'page') {
  const captured = []
  const original = { log: console.log, warn: console.warn, error: console.error, info: console.info }
  function push(level, args) {
    try {
      const text = Array.from(args).map(a => {
        try {
          if (typeof a === 'string') return a
          if (a instanceof Error) return a.stack || a.message || String(a)
          if (typeof a === 'function') return a.toString()
          return JSON.stringify(a)
        } catch { return String(a) }
      }).join(' ')
      captured.push({ level, text })
    } catch {}
  }
  console.log   = (...a) => { push('log',   a); original.log(...a) }
  console.warn  = (...a) => { push('warn',  a); original.warn(...a) }
  console.error = (...a) => { push('error', a); original.error(...a) }
  console.info  = (...a) => { push('info',  a); original.info(...a) }

  const snippetGlobalPresent = !!(typeof window !== 'undefined' && window.pendo)
  const launcherGlobalPresent = !!(typeof window !== 'undefined' && window.Pendo)

  const isLauncher = variant === 'launcher' || variant === 'launcher-beta'
  let agent, pendoGlobal
  if (variant === 'combined') {
    // Single-injection detection: the snippet (window.pendo) is the primary agent when
    // present, otherwise the Launcher-injected window.Pendo. validateInstall() then runs
    // once instead of once per phase, while both globals are still reported via status.
    if (snippetGlobalPresent) { agent = window.pendo; pendoGlobal = 'pendo' }
    else if (launcherGlobalPresent) { agent = window.Pendo; pendoGlobal = 'Pendo' }
    else { agent = null; pendoGlobal = null }
  } else if (isLauncher) {
    if (window && window.Pendo) { agent = window.Pendo; pendoGlobal = 'Pendo' }
    else if (window && window.pendo) { agent = window.pendo; pendoGlobal = 'pendo' }
    else { agent = null; pendoGlobal = null }
  } else {
    agent = (window && window.pendo) || null
    pendoGlobal = agent ? 'pendo' : null
  }
  // When the combined pass validates the Launcher (no snippet on the page), treat it like
  // the dedicated launcher variant for messaging/warnings.
  const launcherPrimary = variant === 'combined' && pendoGlobal === 'Pendo'
  const validateFn = (agent && agent.validateInstall) || null

  const status = {
    pendoPresent: !!agent,
    pendoGlobal,
    snippetGlobalPresent,
    launcherGlobalPresent,
    validatePresent: typeof validateFn === 'function',
    version: null,
    detectedApiKey: null,
    visitorId: null,
    accountId: null,
    visitorMetadata: null,
    accountMetadata: null,
    configKeys: null,
    configSource: null,
    resourceHits: [],
  }

  function extractKeyFromUrl(url) {
    try {
      const m = url.match(/agent\/(?:static|production|beta)\/([a-f0-9\-]{8,})/i)
      if (m) return m[1]
    } catch {}
    return null
  }

  try {
    if (status.pendoPresent) {
      status.version = (agent.getVersion && agent.getVersion()) || agent.VERSION || null
      const opt = (agent._ && (agent._.options || agent._.apiKey)) || null
      if (opt && typeof opt === 'object' && opt.apiKey) status.detectedApiKey = opt.apiKey
      if (typeof agent.apiKey === 'string') status.detectedApiKey = agent.apiKey
      const state = agent && agent._ && agent._.state
      if (state && state.visitorId) status.visitorId = state.visitorId
      if (state && state.accountId) status.accountId = state.accountId
      if (!status.visitorId && agent.getVisitorId) { try { status.visitorId = agent.getVisitorId() } catch {} }
      if (!status.accountId && agent.getAccountId) { try { status.accountId = agent.getAccountId() } catch {} }

      function safeCloneFields(src, maxKeys, maxLen) {
        if (!src || typeof src !== 'object') return null
        try {
          const keys = Object.keys(src).slice(0, maxKeys || 50)
          if (!keys.length) return null
          const out = {}
          for (const k of keys) {
            const v = src[k]
            if (v === undefined || typeof v === 'function') continue
            const s = typeof v === 'string' ? v : JSON.stringify(v)
            out[k] = s && s.length > (maxLen || 500) ? s.slice(0, maxLen || 500) + '…' : v
          }
          return Object.keys(out).length ? out : null
        } catch { return null }
      }
      let serialized = null
      try {
        if (typeof agent.getSerializedMetadata === 'function') {
          serialized = agent.getSerializedMetadata()
        }
      } catch {}
      const opts = agent._ && typeof agent._ === 'object' ? agent._.options : null
      const legacyState = agent._ && typeof agent._ === 'object' ? agent._.state : null
      const visitorSrc = (serialized && serialized.visitor) || (opts && opts.visitor) || (legacyState && legacyState.visitor)
      const accountSrc = (serialized && serialized.account) || (opts && opts.account) || (legacyState && legacyState.account)
      status.visitorMetadata = safeCloneFields(visitorSrc)
      status.accountMetadata = safeCloneFields(accountSrc)
    }
  } catch {}

  // Detect the options passed to pendo.initialize().
  // The async snippet stubs queue calls onto pendo._q as ['initialize', { ...config }],
  // but the loaded agent drains that queue once it replays the call — so on-demand
  // validation usually sees an empty _q. We therefore read the queue first (fast path
  // when validating before the agent finishes loading), then fall back to parsing the
  // inline install snippet's pendo.initialize({ ... }) object literal for its top-level keys.
  function extractInitConfigKeys(text) {
    if (typeof text !== 'string' || !text) return null
    const call = /\bpendo\s*\.\s*initialize\s*\(/.exec(text)
    if (!call) return null
    let i = call.index + call[0].length
    while (i < text.length && /\s/.test(text[i])) i++
    if (text[i] !== '{') return null // config passed as a variable/expression — keys not statically readable
    const keys = []
    let depth = 0, str = null, expectKey = false
    for (; i < text.length; i++) {
      const ch = text[i]
      if (str) {
        if (ch === '\\') { i++; continue }
        if (ch === str) str = null
        continue
      }
      if (ch === '/' && text[i + 1] === '/') { i += 2; while (i < text.length && text[i] !== '\n') i++; continue }
      if (ch === '/' && text[i + 1] === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i++; continue }
      if (ch === '"' || ch === "'" || ch === '`') {
        if (depth === 1 && expectKey) {
          let k = '', j = i + 1
          for (; j < text.length; j++) { const c = text[j]; if (c === '\\') { j++; continue } if (c === ch) break; k += c }
          let n = j + 1; while (n < text.length && /\s/.test(text[n])) n++
          if (text[n] === ':') { keys.push(k); expectKey = false }
          i = j; continue
        }
        str = ch; continue
      }
      if (ch === '{' || ch === '[' || ch === '(') { depth++; if (ch === '{' && depth === 1) expectKey = true; continue }
      if (ch === '}' || ch === ']' || ch === ')') { depth--; if (depth === 0) break; continue }
      if (depth === 1) {
        if (ch === ',') { expectKey = true; continue }
        if (expectKey && /[A-Za-z_$]/.test(ch)) {
          let k = ch, j = i + 1
          for (; j < text.length; j++) { const c = text[j]; if (/[\w$]/.test(c)) k += c; else break }
          let n = j; while (n < text.length && /\s/.test(text[n])) n++
          if (text[n] === ':') { keys.push(k); expectKey = false }
          i = j - 1; continue
        }
      }
    }
    return keys.length ? keys : null
  }
  try {
    const q = (agent && Array.isArray(agent._q)) ? agent._q : null
    if (q) {
      let cfg = null
      for (const entry of q) {
        if (Array.isArray(entry) && entry[0] === 'initialize' && entry[1] && typeof entry[1] === 'object') cfg = entry[1]
      }
      if (cfg) { status.configKeys = Object.keys(cfg); status.configSource = 'snippet-queue' }
    }
  } catch {}
  if (!status.configKeys) {
    try {
      const scripts = Array.from(document.scripts || [])
      for (const s of scripts) {
        // indexOf('pendo') is a cheap necessary condition for the regex below — skip the
        // full-text regex scan on inline bundles that can't contain pendo.initialize.
        if (s.src || !s.textContent || s.textContent.indexOf('pendo') === -1) continue
        if (!/pendo\s*\.\s*initialize\s*\(/.test(s.textContent)) continue
        const keys = extractInitConfigKeys(s.textContent)
        if (keys && keys.length) { status.configKeys = keys; status.configSource = 'inline-script'; break }
      }
    } catch {}
  }

  try {
    const res = performance.getEntriesByType('resource') || []
    res.forEach(r => {
      const name = r.name || ""
      // Cheap necessary-condition pre-filter so the regexes below run only for the few
      // entries that could be Pendo resources, not every asset on long-lived tabs.
      if (name.indexOf('pendo') === -1 && name.indexOf('agent/static') === -1 && name.indexOf('agent/production') === -1) return
      if (/pendo(io)?\.com|pendo\.io|cdn\.pendo|pendo-io/.test(name) || /agent\/(static|production)/.test(name)) {
        status.resourceHits.push({ name, initiatorType: r.initiatorType || "unknown" })
        if (!status.detectedApiKey) {
          const k = extractKeyFromUrl(name)
          if (k) status.detectedApiKey = k
        }
      }
    })
  } catch {}

  let cspMeta = ""
  try {
    const metas = document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')
    cspMeta = Array.from(metas).map(m => m.getAttribute('content') || '').join(' | ')
  } catch {}

  try {
    if (status.validatePresent) {
      try {
        validateFn.call(agent)
      } catch (e) {
        captured.push({ level: 'error', text: e && e.message ? e.message : String(e) })
      }
    } else if (isLauncher || launcherPrimary) {
      captured.push({ level: 'warn', text: 'Pendo Launcher found but validateInstall() is unavailable.' })
    }
  } catch (e) {
    captured.push({ level: 'error', text: e && e.message ? e.message : String(e) })
  } finally {
    console.log = original.log; console.warn = original.warn
    console.error = original.error; console.info = original.info
  }

  const all = captured.map(m => m.text).join('\n')
  const keyRegex = /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i
  const apiKeyFound = keyRegex.test(all) || !!status.detectedApiKey

  const hasError = captured.some(m => m.level === 'error' || /error|failed|not found|blocked/i.test(m.text))
  const hasWarn  = captured.some(m => m.level === 'warn'  || /warn|missing|no visitor|not initiali[sz]ed/i.test(m.text))

  const advice = []
  const checks = []

  if (!status.pendoPresent) {
    advice.push({ text: "Pendo agent not detected. Ensure the snippet is installed and loads on this URL. Verify CSP and network allow Pendo domains.", source: 'builtin', supportKey: 'installGuide' })
  } else if (!status.validatePresent) {
    advice.push({ text: "Pendo found, but validateInstall() is unavailable. The agent may be customised or outdated. Update to a supported agent.", source: 'builtin', supportKey: 'agentSettings' })
  }

  if (apiKeyFound) checks.push("API key found in output or agent data.")
  else advice.push({ text: "No API key detected. Verify the correct agent is loading and that the snippet references your subscription key.", source: 'builtin', supportKey: 'installComponents' })

  if (status.pendoPresent) {
    if (!status.visitorId) advice.push({ text: "Visitor identity is not set. Call pendo.initialize with a visitorId after authentication.", source: 'builtin', supportKey: 'chooseIdsMetadata' })
    else checks.push("visitorId present.")
    if (status.accountId == null) advice.push({ text: "accountId not found. If you use accounts, provide accountId in pendo.initialize.", source: 'builtin', supportKey: 'chooseIdsMetadata' })
    else checks.push("accountId present.")
    const hasFieldsBeyondId = (meta) => !!meta && typeof meta === 'object' && Object.keys(meta).some(k => k !== 'id')
    if (hasFieldsBeyondId(status.visitorMetadata)) checks.push("Visitor metadata fields detected.")
    if (hasFieldsBeyondId(status.accountMetadata)) checks.push("Account metadata fields detected.")
    if (status.visitorId && !hasFieldsBeyondId(status.visitorMetadata)) {
      advice.push({ text: "No visitor metadata fields detected beyond the ID. Consider passing name, email, and role for better segmentation.", source: 'builtin', supportKey: 'chooseIdsMetadata' })
    }
  }

  const needsDomains = ["pendo.io", "cdn.pendo.io", "data.pendo.io"]
  if (cspMeta) {
    const lc = cspMeta.toLowerCase()
    needsDomains.forEach(d => {
      if (!lc.includes(d)) {
        advice.push({ text: `CSP meta tag may be missing '${d}'. Ensure script-src and connect-src allow required Pendo domains.`, source: 'builtin', supportKey: 'csp' })
      }
    })
  } else if (/content security policy|refused to connect|blocked by csp/i.test(all)) {
    advice.push({ text: "CSP is blocking Pendo. Add required Pendo domains to script-src and connect-src.", source: 'builtin', supportKey: 'csp' })
  }

  if (status.resourceHits.length === 0 && status.pendoPresent) {
    advice.push({ text: "No Pendo network resources observed. If using a deferred or self-hosted setup, ensure agent requests are not blocked.", source: 'builtin', supportKey: 'spa' })
  }

  // --- Extended detection signals (additive) ---
  try {
    const isIframe = (typeof window !== 'undefined') && window.top !== window
    if (isIframe) {
      advice.push({ text: "Page is running inside an iframe. Ensure the Pendo snippet is installed in this frame with matching API key and IDs.", source: 'builtin', supportKey: 'iframe' })
    }
    const pageHref = (typeof location !== 'undefined' && location.href) || ''
    if (/\b(staging|preview|dev\.|qa\.)/i.test(pageHref)) {
      advice.push({ text: "This appears to be a staging or development environment. Use unique Visitor/Account ID prefixes and configure an Exclude List to keep test data separate.", source: 'builtin', supportKey: 'sandbox' })
    }
    if (typeof window !== 'undefined' && window.google_tag_manager) {
      checks.push("Google Tag Manager detected.")
      if (!status.pendoPresent) {
        advice.push({ text: "Google Tag Manager is present but Pendo was not found. If installing Pendo via GTM, check your Custom HTML tag fires on all pages.", source: 'builtin', supportKey: 'gtm' })
      }
    }
    if (typeof window !== 'undefined' && window.utag) {
      checks.push("Tealium iQ (utag) detected.")
    }
    const spaGlobals = typeof window !== 'undefined'
      ? { react: !!window.React || !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__, vue: !!window.Vue || !!window.__VUE__, angular: !!window.angular || !!window.ng, next: !!window.next || !!window.__NEXT_DATA__, nuxt: !!window.__NUXT__ }
      : {}
    const detectedFramework = spaGlobals.react ? 'react' : spaGlobals.vue ? 'vue' : spaGlobals.angular ? 'angular' : spaGlobals.next ? 'next' : spaGlobals.nuxt ? 'nuxt' : null
    if (detectedFramework) {
      checks.push(`SPA framework detected: ${detectedFramework}.`)
    }
    if (status.pendoPresent && status.version) {
      const minVersion = (typeof PENDO_KB_MIN_AGENT_VERSION !== 'undefined') ? PENDO_KB_MIN_AGENT_VERSION : '2.17.0'
      const curr = String(status.version).split('.').map(Number)
      const min = String(minVersion).split('.').map(Number)
      const outdated = (curr[0] < min[0]) || (curr[0] === min[0] && curr[1] < min[1]) || (curr[0] === min[0] && curr[1] === min[1] && (curr[2] || 0) < (min[2] || 0))
      if (outdated) {
        advice.push({ text: `Agent version ${status.version} is older than the recommended minimum (${minVersion}). Consider updating to access recent fixes and features.`, source: 'builtin', supportKey: 'agentSettings', supportKeys: ['agentSettings', 'agentDebug'] })
      }
    }
    if (status.pendoPresent && status.visitorId) {
      const hasVFields = status.visitorMetadata && typeof status.visitorMetadata === 'object' && Object.keys(status.visitorMetadata).some(k => k !== 'id')
      const hasAFields = status.accountMetadata && typeof status.accountMetadata === 'object' && Object.keys(status.accountMetadata).some(k => k !== 'id')
      if (hasVFields && !hasAFields && status.accountId != null) {
        advice.push({ text: "Visitor metadata is populated but account metadata is empty. Consider passing account-level fields (name, plan, industry) for richer segmentation.", source: 'builtin', supportKey: 'configureMetadata', supportKeys: ['configureMetadata', 'chooseIdsMetadata'] })
      }
    }
    // Load-time redirect detection (Navigation Timing). A same-origin redirect
    // during load strips query parameters, which is the documented cause of the
    // Visual Design Studio dropping Pendo's "pendo-designer" URL token.
    let redirectCount = 0
    try {
      const navEntries = (typeof performance !== 'undefined' && performance.getEntriesByType && performance.getEntriesByType('navigation')) || []
      if (navEntries[0] && typeof navEntries[0].redirectCount === 'number') redirectCount = navEntries[0].redirectCount
      if (!redirectCount && typeof performance !== 'undefined' && performance.navigation && performance.navigation.redirectCount) redirectCount = performance.navigation.redirectCount
    } catch {}
    status.redirectCount = redirectCount
    if (status.pendoPresent && redirectCount > 0) {
      advice.push({ text: "This page redirected during load, which can strip query parameters from the URL. If the Visual Design Studio won't launch over your app, the application may be sanitizing the URL and dropping Pendo's \"pendo-designer\" token. Enable \"Disable Designer Launch URL Token\" in the app's Tagging & Guide Settings, or launch the designer manually with pendo.designerv2.launchInAppDesigner().", source: 'builtin', supportKey: 'vds' })
    }
    // --- Client-side URL-sanitization detection (DOM + runtime) ---
    try {
      const urlSan = { historyApiPatched: false, inlinePatterns: [], inlineScripts: 0, externalScripts: 0, observedStrips: 0, navQueryStripped: false, navPendoTokenStripped: false }
      try {
        const fnStr = (fn) => { try { return Function.prototype.toString.call(fn) } catch { return '' } }
        const isNative = (fn) => /\{\s*\[native code\]\s*\}/.test(fnStr(fn))
        urlSan.historyApiPatched = !(isNative(history.pushState) && isNative(history.replaceState))
      } catch {}
      try {
        if (status.pendoPresent && !window.__pendoValidateHistoryHooked) {
          window.__pendoValidateUrlStrips = []
          const histMethods = ['pushState', 'replaceState']
          histMethods.forEach((name) => {
            const orig = history[name]
            if (typeof orig !== 'function') return
            history[name] = function () {
              const before = location.search
              const ret = orig.apply(this, arguments)
              try {
                const after = location.search
                if (before && before.length > 1 && (!after || after.length <= 1)) {
                  window.__pendoValidateUrlStrips.push({ method: name, before, hadPendoToken: /pendo-?designer|[?&]pendo/i.test(before) })
                }
              } catch {}
              return ret
            }
          })
          window.__pendoValidateHistoryHooked = true
        }
        urlSan.observedStrips = (window.__pendoValidateUrlStrips || []).length
      } catch {}
      try {
        // Single walk: count external/inline scripts and build a capped scan corpus so a
        // huge inline bundle can't make the pattern regexes O(total inline bytes).
        const MAX_PER_SCRIPT = 16384
        const MAX_TOTAL = 262144
        let externalScripts = 0, inlineScripts = 0, totalScanned = 0
        const parts = []
        for (const s of Array.from(document.scripts || [])) {
          if (s.src) { externalScripts++; continue }
          const text = s.textContent
          if (!text) continue
          inlineScripts++
          if (totalScanned >= MAX_TOTAL) continue
          const slice = text.length > MAX_PER_SCRIPT ? text.slice(0, MAX_PER_SCRIPT) : text
          parts.push(slice)
          totalScanned += slice.length
        }
        urlSan.externalScripts = externalScripts
        urlSan.inlineScripts = inlineScripts
        const src = parts.join('\n')
        const patterns = [
          { name: 'replaceState/pushState to pathname', re: /\.(?:replace|push)State\((?![^;)]*\.search)[^;)]*location\.pathname/ },
          { name: 'location.search cleared',            re: /location\.search\s*=\s*(['"`])\1/ },
          { name: 'searchParams.delete',                re: /searchParams\.delete\s*\(/ },
          { name: 'pendo-designer reference',           re: /pendo-?designer/i },
          { name: 'sanitize/strip URL',                 re: /(sanitiz|strip|clean)\w*\s*(url|query|param)/i },
        ]
        for (const p of patterns) { try { if (p.re.test(src)) urlSan.inlinePatterns.push(p.name) } catch {} }
      } catch {}
      // Load-time query strip (Navigation Timing). The originally-requested document URL
      // retains its query even after the app rewrites it client-side, so comparing it to
      // the current location detects a strip that happened during load — before the
      // observe-only history hook was installed, and from external bundles the inline scan
      // cannot read. Gated on redirectCount === 0 so HTTP redirects (handled above) are not
      // double-counted.
      try {
        const navEntries = (typeof performance !== 'undefined' && performance.getEntriesByType && performance.getEntriesByType('navigation')) || []
        const navName = (navEntries[0] && navEntries[0].name) || ''
        // Defaults (false) are set in the urlSan initializer above, so the else/catch
        // paths need no reassignment — they simply leave the upfront defaults in place.
        if (navName && redirectCount === 0) {
          const navSearch = (new URL(navName)).search || ''
          const curSearch = (typeof location !== 'undefined' && location.search) || ''
          const tokenRe = /pendo-?designer|[?&]pendo/i
          urlSan.navQueryStripped = navSearch.length > 1 && curSearch.length <= 1
          urlSan.navPendoTokenStripped = tokenRe.test(navName) && !tokenRe.test((typeof location !== 'undefined' && location.href) || '')
        }
      } catch {}
      status.urlSanitization = urlSan
      const hasClientSignal = urlSan.inlinePatterns.length > 0 || urlSan.observedStrips > 0 || urlSan.navQueryStripped || urlSan.navPendoTokenStripped
      if (status.pendoPresent && hasClientSignal) {
        const detail = urlSan.navPendoTokenStripped
          ? 'the "pendo-designer" URL token present when the page was requested is no longer in the address bar — it was stripped during load'
          : urlSan.navQueryStripped
            ? 'the query string present when the page was requested was dropped during load'
            : urlSan.observedStrips > 0
              ? 'the query string was observed being removed from the URL'
              : ('inline scripts contain: ' + urlSan.inlinePatterns.join(', '))
        advice.push({ text: `Client-side code on this page modifies the URL (${detail}). This can strip Pendo's "pendo-designer" token and prevent the Visual Design Studio from launching. If VDS won't open, enable "Disable Designer Launch URL Token" in the app's Tagging & Guide Settings.`, source: 'builtin', supportKey: 'vds' })
      } else if (status.pendoPresent && urlSan.inlineScripts > 0) {
        checks.push('No URL-sanitization patterns found in inline scripts (external bundles not scanned).')
      }
    } catch {}
  } catch {}

  if (status.validatePresent && !hasError && !hasWarn && captured.length > 0) {
    checks.push("validateInstall() produced no warnings or errors.")
  }

  if (advice.length === 0 && checks.length > 0) checks.push("Installation looks healthy based on current checks.")
  else if (advice.length === 0) advice.push({ text: "Review the output below and compare with a known-good page. Check initialise timing and data mapping.", source: 'builtin', supportKey: 'spa' })

  if (variant === 'launcher' || launcherPrimary) {
    captured.unshift({ level: 'info', text: 'Validated via Pendo Launcher window.' })
  } else if (variant === 'launcher-beta') {
    captured.unshift({ level: 'info', text: 'Validated via Pendo Launcher (Beta) window.' })
  }

  return { status, captured, advice, checks, cspMeta, apiKeyFound, hasError, hasWarn }
};
}
