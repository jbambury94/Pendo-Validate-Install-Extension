/**
 * Test helpers — pure functions extracted verbatim from extension/popup.js.
 * Keep these in sync when popup.js changes.
 */

export const PENDO_VISITOR_ID_KEY = 'pendoVisitorId'

export const PENDO_SUPPORT = {
  installGuide:     'https://support.pendo.io/hc/en-us/articles/360046272771',
  installComponents:'https://support.pendo.io/hc/en-us/articles/21362607464987-Components-of-the-install-script',
  agentSettings:    'https://support.pendo.io/hc/en-us/articles/360031832152-Pendo-agent-settings',
  identifyVisitors: 'https://support.pendo.io/hc/en-us/articles/22764466082715-Identify-visitors-and-metadata-through-browser-scripting',
  chooseIdsMetadata: 'https://support.pendo.io/hc/en-us/articles/21326198721563-Choose-IDs-and-metadata',
  csp:              'https://support.pendo.io/hc/en-us/articles/360032209131-Content-Security-Policy-CSP',
  spa:              'https://support.pendo.io/hc/en-us/articles/360031862272-Install-Pendo-on-a-single-page-web-application',
  helpCenter:       'https://support.pendo.io/hc/en-us',
  technicalSupport: 'https://support.pendo.io/hc/en-us/articles/360034163971-Get-help-with-Pendo-from-Technical-Support',
}

export function normalizeAdviceList(advice = []) {
  return advice.map(a => {
    let text, source, supportUrl
    if (typeof a === 'string') {
      text = a; source = 'builtin'; supportUrl = PENDO_SUPPORT.helpCenter
    } else if (a && typeof a === 'object') {
      text = a.text || ''
      source = a.source || 'builtin'
      supportUrl = a.supportUrl
        || (a.supportKey && PENDO_SUPPORT[a.supportKey])
        || (source === 'ai' ? PENDO_SUPPORT.technicalSupport : PENDO_SUPPORT.helpCenter)
    } else {
      text = String(a); source = 'builtin'; supportUrl = PENDO_SUPPORT.helpCenter
    }
    return { text, source, supportUrl }
  }).filter(a => a.text)
}

export function buildMarkdownReport(context) {
  const { pageUrl, timestamp, status, captured, advice, checks, cspMeta, apiKeyFound, origin, snippetOnPage, launcherPresent, launcherAttempted, launcherDataValidated, validatedIn, launcherUrl } = context
  const adviceList = normalizeAdviceList(advice || [])
  const errors = (captured || []).filter(l => l.level === 'error')
  const hasError = errors.length > 0 || (context.hasError === true)
  const hasWarn = (captured || []).some(l => l.level === 'warn') || (context.hasWarn === true)
  let statusLine = 'Looks healthy'
  if (!status.pendoPresent) statusLine = 'Pendo not found'
  else if (!status.validatePresent) statusLine = 'No validateInstall()'
  else if (hasError) statusLine = 'Errors found'
  else if (hasWarn) statusLine = 'Warnings found'
  const effectiveOrigin = validatedIn || origin
  if (effectiveOrigin === 'launcher') statusLine += ' (via Pendo Launcher)'
  else if (effectiveOrigin === 'launcher-beta') statusLine += ' (via Pendo Launcher Beta)'

  const lines = []
  lines.push(`# Pendo Validate Report`)
  lines.push("")
  lines.push(`Share this file with support or use the links below for official Pendo guidance.`)
  lines.push("")
  lines.push(`- **Page URL:** ${pageUrl}`)
  if (validatedIn === 'launcher' || validatedIn === 'launcher-beta') {
    lines.push(`- **Validated in URL:** ${launcherUrl || '—'}`)
  }
  lines.push(`- **Timestamp:** ${timestamp}`)
  lines.push(`- **Status:** ${statusLine}`)
  lines.push("")
  lines.push(`## Metadata`)
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
    capturedLineCount: (captured && captured.length) || 0,
  }
  if (status.visitorMetadata) meta.visitorMetadata = status.visitorMetadata
  if (status.accountMetadata) meta.accountMetadata = status.accountMetadata
  if (status.resourceHits && status.resourceHits.length) {
    meta.observedPendoResources = status.resourceHits.map(r => ({ initiatorType: r.initiatorType || 'resource', name: r.name }))
  }
  if (cspMeta) meta.cspMeta = cspMeta
  if (launcherUrl) meta.validatedInUrl = launcherUrl
  lines.push("```json")
  lines.push(JSON.stringify(meta, null, 2))
  lines.push("```")
  lines.push("")

  lines.push(`## Errors`)
  if (errors.length === 0 && !hasError) {
    lines.push(`No errors detected.`)
  } else {
    errors.forEach(l => {
      lines.push(`- ${l.text} — [Pendo Help: Installation & troubleshooting](${PENDO_SUPPORT.installGuide})`)
    })
    if (errors.length === 0 && hasError) {
      lines.push(`- Validation reported issues. See Advice and Captured Output below. — [Pendo Help Center](${PENDO_SUPPORT.helpCenter})`)
    }
  }
  lines.push("")

  lines.push(`## Advice`)
  if (checks && checks.length) {
    lines.push(`### Checks passed`)
    checks.forEach(c => lines.push(`- ${c}`))
    lines.push("")
  }
  if (adviceList.length) {
    lines.push(`### Recommendations`)
    adviceList.forEach(a => {
      const prefix = a.source === 'ai' ? '[AI] ' : ''
      lines.push(`- ${prefix}${a.text} — [Pendo Help](${a.supportUrl})`)
    })
  }
  if (!adviceList.length && (!checks || !checks.length)) lines.push(`No advice items.`)
  lines.push("")

  lines.push(`## Captured Output`)
  if (!captured || !captured.length) lines.push(`No output captured.`)
  else captured.forEach(l => lines.push(`- [${l.level}] ${l.text}`))
  lines.push("")
  return lines.join("\n")
}

export function buildJsonReport(context) {
  return JSON.stringify(context, null, 2)
}

export function buildAiPrompt(context) {
  const lines = []
  lines.push('You are a Pendo installation assistant. Suggest concise, actionable remediation steps.')
  lines.push('Base your guidance solely on official Pendo sources (pendo.io domains such as support.pendo.io, help.pendo.io, academy.pendo.io). If unsure, say so.')
  lines.push(`Page URL: ${context.pageUrl}`)
  lines.push(`Agent version: ${context.status.version || 'unknown'}`)
  lines.push(`validateInstall available: ${context.status.validatePresent}`)
  lines.push(`Pendo present: ${context.status.pendoPresent}`)
  lines.push(`API key detected: ${context.status.detectedApiKey || 'unknown'}`)
  lines.push(`API key found flag: ${context.apiKeyFound}`)
  lines.push(`VisitorId: ${context.status.visitorId || 'not set'}`)
  lines.push(`AccountId: ${context.status.accountId == null ? 'not set' : context.status.accountId}`)
  lines.push(`CSP meta: ${context.cspMeta || 'none'}`)
  lines.push('Captured logs (level:message):')
  const trimmed = (context.captured || []).slice(0, 30)
  trimmed.forEach(l => lines.push(`[${l.level}] ${l.text}`))
  if ((context.captured || []).length > trimmed.length) lines.push('...truncated...')
  lines.push('Respond with a short bullet list of concrete fixes.')
  return lines.join('\n')
}

export function getOrCreateVisitorId() {
  return new Promise((resolve) => {
    try {
      if (!chrome.storage || !chrome.storage.local) {
        resolve(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '')
        return
      }
      chrome.storage.local.get([PENDO_VISITOR_ID_KEY], (result) => {
        let id = result && result[PENDO_VISITOR_ID_KEY]
        if (!id || typeof id !== 'string') {
          id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : ''
          if (id) chrome.storage.local.set({ [PENDO_VISITOR_ID_KEY]: id })
        }
        resolve(id)
      })
    } catch (e) {
      resolve(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '')
    }
  })
}

export function enableDebuggingInPage() {
  const pendo = (typeof window !== 'undefined' && (window.pendo || window.Pendo)) || null
  if (!pendo || typeof pendo.enableDebugging !== 'function') {
    return { ok: false, message: 'Pendo not found or enableDebugging not available on this page.' }
  }
  try {
    pendo.enableDebugging()
    return { ok: true }
  } catch (e) {
    return { ok: false, message: (e && e.message) || String(e) }
  }
}


export async function getAiConfig() {
  return new Promise(resolve => {
    try {
      if (!chrome.storage || !chrome.storage.local) return resolve({})
      chrome.storage.local.get({ aiProvider: 'openai', aiEndpoint: '', aiApiKey: '', aiModel: '' }, resolve)
    } catch (e) {
      resolve({})
    }
  })
}

export async function requestAiAdvice(context) {
  const cfg = await getAiConfig()
  if (!cfg.aiApiKey) return []

  const provider = cfg.aiProvider || 'openai'
  const prompt = buildAiPrompt(context)
  const systemMsg = 'You are a concise Pendo install troubleshooting assistant. Only rely on official Pendo documentation and avoid speculative advice.'

  let endpoint, headers, body

  if (provider === 'claude') {
    const model = cfg.aiModel || 'claude-haiku-4-5-20251001'
    endpoint = 'https://api.anthropic.com/v1/messages'
    headers = { 'Content-Type': 'application/json', 'x-api-key': cfg.aiApiKey, 'anthropic-version': '2023-06-01' }
    body = { model, max_tokens: 1024, system: systemMsg, messages: [{ role: 'user', content: prompt }] }
  } else if (provider === 'gemini') {
    const model = cfg.aiModel || 'gemini-2.0-flash'
    endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.aiApiKey}`
    headers = { 'Content-Type': 'application/json' }
    body = { contents: [{ parts: [{ text: systemMsg + '\n\n' + prompt }] }], generationConfig: { temperature: 0.1 } }
  } else {
    const model = cfg.aiModel || 'gpt-4o-mini'
    endpoint = cfg.aiEndpoint || 'https://api.openai.com/v1/chat/completions'
    headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.aiApiKey}` }
    body = { model, messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: prompt }], temperature: 0.1 }
  }

  const controller = new AbortController()
  const timeoutMs = cfg.timeoutMs || 8000
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
  try {
    const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`AI request failed with status ${res.status}`)
    const data = await res.json()
    let content = ''
    if (provider === 'claude') content = data?.content?.[0]?.text || ''
    else if (provider === 'gemini') content = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    else content = data?.choices?.[0]?.message?.content || ''
    if (!content) return []
    return content.split(/\n+/).map(t => t.replace(/^[-*]\s*/, '').trim()).filter(Boolean)
      .map(text => ({ text, source: 'ai', supportUrl: PENDO_SUPPORT.technicalSupport }))
  } catch (e) {
    clearTimeout(timer)
    return [{ text: 'AI suggestion unavailable: request failed or timed out. Check your API key and provider selection.', source: 'ai', supportUrl: PENDO_SUPPORT.technicalSupport }]
  }
}

/**
 * captureAndInspect — extracted from the inner function inside runInPage().
 * Designed to run in a browser page context; uses window, document, console, performance.
 */
export function captureAndInspect(variant = 'page') {
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

  const isLauncher = variant === 'launcher' || variant === 'launcher-beta'
  const agent = isLauncher
    ? ((window && (window.Pendo || window.pendo)) || null)
    : ((window && window.pendo) || null)
  const validateFn = (agent && agent.validateInstall) || null

  const status = {
    pendoPresent: !!agent,
    validatePresent: typeof validateFn === 'function',
    version: null,
    detectedApiKey: null,
    visitorId: null,
    accountId: null,
    visitorMetadata: null,
    accountMetadata: null,
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
      const opts = agent._ && agent._.options
      status.visitorMetadata = safeCloneFields(opts && opts.visitor) || safeCloneFields(agent._ && agent._.state && agent._.state.visitor)
      status.accountMetadata = safeCloneFields(opts && opts.account) || safeCloneFields(agent._ && agent._.state && agent._.state.account)
    }
  } catch {}

  try {
    const res = performance.getEntriesByType('resource') || []
    res.forEach(r => {
      const name = r.name || ""
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
    } else if (isLauncher) {
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
    if (!status.visitorId) advice.push({ text: "Visitor identity is not set. Call pendo.initialize with a visitorId after authentication.", source: 'builtin', supportKey: 'identifyVisitors' })
    else checks.push("visitorId present.")
    if (status.accountId == null) advice.push({ text: "accountId not found. If you use accounts, provide accountId in pendo.initialize.", source: 'builtin', supportKey: 'identifyVisitors' })
    else checks.push("accountId present.")
    if (status.visitorMetadata) checks.push("Visitor metadata fields detected.")
    if (status.accountMetadata) checks.push("Account metadata fields detected.")
    if (status.visitorId && !status.visitorMetadata) {
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

  if (status.validatePresent && !hasError && !hasWarn && captured.length > 0) {
    checks.push("validateInstall() produced no warnings or errors.")
  }

  if (advice.length === 0 && checks.length > 0) advice.push({ text: "Installation looks healthy based on current checks.", source: 'builtin', supportKey: 'helpCenter' })
  else if (advice.length === 0) advice.push({ text: "Review the output below and compare with a known-good page. Check initialise timing and data mapping.", source: 'builtin', supportKey: 'spa' })

  if (variant === 'launcher') {
    captured.unshift({ level: 'info', text: 'Validated via Pendo Launcher window.' })
  } else if (variant === 'launcher-beta') {
    captured.unshift({ level: 'info', text: 'Validated via Pendo Launcher (Beta) window.' })
  }

  return { status, captured, advice, checks, cspMeta, apiKeyFound, hasError, hasWarn }
}

/** Pure drag-clamp logic extracted from content.js onDragMove. */
export function clampDragPosition({ clientX, clientY, offsetX, offsetY, innerWidth, innerHeight, iframeWidth }) {
  const newLeft = clientX - offsetX
  const newTop  = clientY - offsetY
  const maxLeft = innerWidth - iframeWidth
  const maxTop  = innerHeight - 60
  return {
    left: Math.max(0, Math.min(newLeft, maxLeft)),
    top:  Math.max(0, Math.min(newTop,  maxTop)),
  }
}
