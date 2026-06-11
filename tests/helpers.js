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
  gtm:              'https://support.pendo.io/hc/en-us/articles/360032201711',
  segment:          'https://support.pendo.io/hc/en-us/articles/360031870352',
  iframe:           'https://support.pendo.io/hc/en-us/articles/17606930575387',
  multiDomain:      'https://support.pendo.io/hc/en-us/articles/14090652290587',
  sandbox:          'https://support.pendo.io/hc/en-us/articles/360031862352',
  agentDebug:       'https://support.pendo.io/hc/en-us/articles/360034229512',
  configureMetadata:'https://support.pendo.io/hc/en-us/articles/360031832072',
  signedMetadata:   'https://support.pendo.io/hc/en-us/articles/360039616892',
  hostnameAllowlist:'https://support.pendo.io/hc/en-us/articles/16101373319707',
  launcherPlan:     'https://support.pendo.io/hc/en-us/articles/21163862516507',
  troubleshooting:  'https://support.pendo.io/hc/en-us/articles/10033806003483',
  vds:              'https://support.pendo.io/hc/en-us/articles/360031864732-Help-launching-the-Visual-Design-Studio',
  agentConfig:            'https://web-sdk.pendo.io/config/',
  agentConfigCore:        'https://web-sdk.pendo.io/config/core',
  agentConfigAnalytics:   'https://web-sdk.pendo.io/config/analytics',
  agentConfigGuides:      'https://web-sdk.pendo.io/config/guides',
  agentConfigNetworkLogs: 'https://web-sdk.pendo.io/config/network-logs',
  agentConfigReplay:      'https://web-sdk.pendo.io/config/replay',
}

export const SUPPORT_LABELS = {
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
  agentConfigReplay: 'Config: Replay',
}

export const ERR_SUPPORT_KEYS = new Set(['installGuide', 'installComponents', 'agentSettings'])

export function stripEmbeddedHelpUrl(text) {
  if (!text) return text
  return String(text)
    .replace(/\s*(?:[A-Z][a-z]+\s+more[^.:]*?:\s*)?https?:\/\/help\.pendo\.io\/\S+/gi, '')
    .replace(/\s+$/, '')
}

export function inferSupportKeyFromText(text) {
  if (!text) return null
  const s = String(text)
  const rules = [
    { re: /visual\s+design\s+studio|pendo-designer|launchInAppDesigner|designer\s+launch\s+url\s+token|url\s+token|sanitiz/i, key: 'vds' },
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
  ]
  for (const r of rules) {
    if (r.re.test(s)) return r.key
  }
  return null
}

export function normalizeAdviceList(advice = []) {
  return advice.map(a => {
    let text, source, supportUrl, supportKey, relatedSupportUrls = []
    if (typeof a === 'string') {
      text = a; source = 'builtin'; supportUrl = PENDO_SUPPORT.helpCenter; supportKey = null
    } else if (a && typeof a === 'object') {
      text = a.text || ''
      source = a.source || 'builtin'
      supportKey = a.supportKey || null
      const resolvedFromKey = supportKey && PENDO_SUPPORT[supportKey]
      if (a.supportUrl && !(source === 'ai' && a.supportUrl === PENDO_SUPPORT.technicalSupport)) {
        supportUrl = a.supportUrl
      } else if (resolvedFromKey) {
        supportUrl = resolvedFromKey
      } else {
        const inferred = inferSupportKeyFromText(text)
        if (inferred && PENDO_SUPPORT[inferred]) {
          supportKey = inferred
          supportUrl = PENDO_SUPPORT[inferred]
        } else if (source === 'ai') {
          supportUrl = PENDO_SUPPORT.technicalSupport
        } else {
          supportUrl = PENDO_SUPPORT.troubleshooting
        }
      }
      if (Array.isArray(a.supportKeys)) {
        for (const k of a.supportKeys) {
          if (k === supportKey) continue
          const url = PENDO_SUPPORT[k]
          if (url) relatedSupportUrls.push({ url, label: SUPPORT_LABELS[k] || k })
        }
      }
    } else {
      text = String(a); source = 'builtin'; supportUrl = PENDO_SUPPORT.helpCenter; supportKey = null
    }
    return { text, source, supportUrl, supportKey, relatedSupportUrls }
  }).filter(a => a.text)
}

export function selectRelatedReading(signals, max, findKbByTopicsFn) {
  if (typeof findKbByTopicsFn !== 'function') return []
  if (!signals) return []
  if (max === undefined || max === null) max = 6
  const topics = []
  if (!signals.pendoPresent)                       topics.push('install', 'snippet', 'troubleshooting')
  if (signals.pendoPresent && !signals.validatePresent) topics.push('agent', 'troubleshooting')
  if (!signals.visitorId)                          topics.push('identity')
  if (signals.accountId == null)                   topics.push('identity', 'account')
  if (!signals.hasVisitorMeta)                     topics.push('metadata')
  if (!signals.hasAccountMeta && signals.hasVisitorMeta) topics.push('metadata', 'account')
  if (signals.cspIssue)                            topics.push('csp', 'security', 'network')
  if (signals.noResourceHits && signals.pendoPresent)  topics.push('network', 'csp')
  if (signals.isSpa)                               topics.push('spa')
  if (signals.frameworkHint)                        topics.push('spa', 'framework-' + signals.frameworkHint)
  if (signals.isIframe)                            topics.push('iframe')
  if (signals.hasGtm)                              topics.push('gtm', 'tag-manager')
  if (signals.hasSegment)                          topics.push('segment', 'tag-manager')
  if (signals.isSandbox)                           topics.push('sandbox', 'testing')
  if (signals.launcherPresent)                     topics.push('launcher')
  if (signals.agentVersionOld)                     topics.push('agent', 'configuration')
  if (signals.apiKeyMissing)                       topics.push('api-key', 'install')
  if (signals.urlSanitized)                        topics.push('vds', 'designer', 'guides')
  return findKbByTopicsFn(topics, max)
}

export function buildMarkdownReport(context, selectRelatedReadingFn) {
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
    redirectCount: status.redirectCount || 0,
    urlSanitizationPatterns: (status.urlSanitization && status.urlSanitization.inlinePatterns) || [],
    urlObservedStrips: (status.urlSanitization && status.urlSanitization.observedStrips) || 0,
    urlLoadTimeStrip: !!(status.urlSanitization && (status.urlSanitization.navQueryStripped || status.urlSanitization.navPendoTokenStripped)),
    capturedLineCount: (captured && captured.length) || 0,
  }
  if (status.visitorMetadata) meta.visitorMetadata = status.visitorMetadata
  if (status.accountMetadata) meta.accountMetadata = status.accountMetadata
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
      lines.push(`- Validation reported issues. See Advice and Captured Output below. — [Pendo isn't displaying — troubleshooting](${PENDO_SUPPORT.troubleshooting})`)
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

  if (typeof selectRelatedReadingFn === 'function') {
    const signals = {
      pendoPresent: status.pendoPresent,
      validatePresent: status.validatePresent,
      visitorId: status.visitorId,
      accountId: status.accountId,
      cspIssue: adviceList.some(a => a.supportKey === 'csp'),
      noResourceHits: status.resourceHits && status.resourceHits.length === 0,
      apiKeyMissing: !apiKeyFound,
      urlSanitized: adviceList.some(a => a.supportKey === 'vds'),
    }
    const reading = selectRelatedReadingFn(signals, 6)
    if (reading && reading.length) {
      lines.push(`## Related reading`)
      reading.forEach(r => lines.push(`- [${r.title}](${r.url})`))
      lines.push("")
    }
  }

  lines.push(`## Captured Output`)
  if (!captured || !captured.length) lines.push(`No output captured.`)
  else captured.forEach(l => lines.push(`- [${l.level}] ${l.text}`))
  lines.push("")
  return lines.join("\n")
}

export function buildJsonReport(context) {
  return JSON.stringify(context, null, 2)
}

export function buildPlainSummary(context) {
  const { pageUrl, timestamp, status, captured, advice, checks, snippetOnPage, launcherPresent, launcherAttempted, launcherDataValidated, validatedIn } = context
  const errCount = (captured || []).filter(l => l.level === 'error').length
  const warnCount = (captured || []).filter(l => l.level === 'warn').length
  const okCount = (checks || []).length
  let statusLine = 'Looks healthy'
  if (!snippetOnPage && launcherAttempted && launcherPresent === false) statusLine = 'Pendo not found (snippet and Launcher)'
  else if (!snippetOnPage && launcherPresent === true && launcherDataValidated === false) statusLine = 'Launcher installed (no data on this tab)'
  else if (!status.pendoPresent) statusLine = 'Pendo not found'
  else if (!status.validatePresent) statusLine = 'No validateInstall()'
  else if (errCount > 0) statusLine = 'Errors found'
  else if (warnCount > 0) statusLine = 'Warnings found'

  const lines = []
  lines.push(`Pendo Validate — ${statusLine}`)
  lines.push(`Page: ${pageUrl || 'unknown'}`)
  lines.push(`Timestamp: ${timestamp}`)
  lines.push(`Validated in: ${validatedIn || 'page'}`)
  lines.push(`Errors: ${errCount}   Warnings: ${warnCount}   Passing: ${okCount}`)
  lines.push('')
  if (checks && checks.length) {
    lines.push('Passing:')
    checks.forEach(c => lines.push(`  • ${c}`))
    lines.push('')
  }
  const adviceList = normalizeAdviceList(advice || [])
  if (adviceList.length) {
    lines.push('Recommendations:')
    adviceList.forEach(a => {
      const prefix = a.source === 'ai' ? '[AI] ' : ''
      lines.push(`  • ${prefix}${a.text}`)
    })
  }
  return lines.join('\n')
}

export function classifyAdvice(rawAdvice, captured, checks) {
  const adviceList = normalizeAdviceList(rawAdvice || [])
  const errItems = []
  const warnItems = []

  const seenTexts = new Set()
  adviceList.forEach(a => {
    const item = {
      text: a.text,
      source: a.source,
      supportKey: a.supportKey,
      supportUrl: a.supportUrl,
    }
    if (a.supportKey && ERR_SUPPORT_KEYS.has(a.supportKey)) errItems.push(item)
    else warnItems.push(item)
    seenTexts.add(a.text)
  })

  ;(captured || []).forEach(l => {
    if (!l || !l.text) return
    if (seenTexts.has(l.text)) return
    const displayText = stripEmbeddedHelpUrl(l.text)
    if (l.level === 'error') {
      const inferred = inferSupportKeyFromText(l.text)
      const supportKey = inferred || 'installGuide'
      const supportUrl = PENDO_SUPPORT[supportKey] || PENDO_SUPPORT.installGuide
      errItems.push({ text: displayText, source: 'captured', supportKey, supportUrl })
    } else if (l.level === 'warn') {
      const inferred = inferSupportKeyFromText(l.text)
      const supportKey = inferred || 'troubleshooting'
      const supportUrl = PENDO_SUPPORT[supportKey] || PENDO_SUPPORT.troubleshooting
      warnItems.push({ text: displayText, source: 'captured', supportKey, supportUrl })
    }
  })

  const okItems = (checks || []).map(c => ({ text: String(c), source: 'builtin' }))
  return { err: errItems, warn: warnItems, ok: okItems }
}

export function deriveHeroState(res) {
  const { status, captured, snippetOnPage, launcherPresent, launcherAttempted, launcherDataValidated, validatedIn } = res
  const originNote = validatedIn === 'launcher' ? ' (via Pendo Launcher)'
    : validatedIn === 'launcher-beta' ? ' (via Pendo Launcher Beta)' : ''
  if (!snippetOnPage && launcherAttempted && launcherPresent === false) {
    return { state: 'err', title: 'Install not detected', sub: 'Snippet and Pendo Launcher are both missing on this page.' }
  }
  if (!snippetOnPage && launcherPresent === true && launcherDataValidated === false) {
    return { state: 'warn', title: 'Launcher installed', sub: 'No agent data on this tab. Open the application where the Launcher injects Pendo.' }
  }
  if (!status.pendoPresent) {
    return { state: 'err', title: 'Pendo not found', sub: 'window.pendo is missing' + originNote + '.' }
  }
  if (!status.validatePresent) {
    return { state: 'warn', title: 'No validateInstall()', sub: 'Agent found but the validateInstall() helper is unavailable' + originNote + '.' }
  }
  const errCount = captured.filter(l => l.level === 'error').length
  const warnCount = captured.filter(l => l.level === 'warn').length
  if (errCount > 0) return { state: 'err', title: `${errCount} error${errCount === 1 ? '' : 's'}`, sub: 'validateInstall() reported errors' + originNote + '.' }
  if (warnCount > 0) return { state: 'warn', title: `${warnCount} warning${warnCount === 1 ? '' : 's'}`, sub: 'Install works, but there are recommendations' + originNote + '.' }
  return { state: 'ok', title: 'Install validated', sub: 'All checks passed' + originNote + '.' }
}

export function formatRelative(date) {
  if (!date) return 'NEVER'
  const ms = Date.now() - date.getTime()
  if (ms < 5_000) return 'JUST NOW'
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s AGO`
  if (ms < 60 * 60 * 1000) return `${Math.floor(ms / 60_000)}m AGO`
  return `${Math.floor(ms / 3_600_000)}h AGO`
}

export function clampResizeSize({ originWidth, originHeight, dw, dh, innerWidth, innerHeight }) {
  const MAX_RATIO = 0.92
  const MIN_WIDTH = 360
  const MIN_HEIGHT = 480
  const maxW = Math.floor(innerWidth * MAX_RATIO)
  const maxH = Math.floor(innerHeight * MAX_RATIO)
  return {
    width: Math.max(MIN_WIDTH, Math.min(originWidth + (dw || 0), maxW)),
    height: Math.max(MIN_HEIGHT, Math.min(originHeight + (dh || 0), maxH)),
  }
}

export function buildAiPrompt(context, selectRelatedReadingFn) {
  const lines = []
  lines.push(`Page URL: ${context.pageUrl}`)
  lines.push(`Agent version: ${context.status.version || 'unknown'}`)
  lines.push(`validateInstall available: ${context.status.validatePresent}`)
  lines.push(`Pendo present: ${context.status.pendoPresent}`)
  lines.push(`API key detected: ${context.status.detectedApiKey || 'unknown'}`)
  lines.push(`API key found flag: ${context.apiKeyFound}`)
  lines.push(`VisitorId: ${context.status.visitorId || 'not set'}`)
  lines.push(`AccountId: ${context.status.accountId == null ? 'not set' : context.status.accountId}`)
  lines.push(`CSP meta: ${context.cspMeta || 'none'}`)

  // Include metadata fields
  if (context.status.visitorMetadata && typeof context.status.visitorMetadata === 'object') {
    const keys = Object.keys(context.status.visitorMetadata).slice(0, 20)
    lines.push(`Visitor metadata fields: ${keys.join(', ') || 'none'}`)
  } else {
    lines.push('Visitor metadata fields: none')
  }
  if (context.status.accountMetadata && typeof context.status.accountMetadata === 'object') {
    const keys = Object.keys(context.status.accountMetadata).slice(0, 20)
    lines.push(`Account metadata fields: ${keys.join(', ') || 'none'}`)
  } else {
    lines.push('Account metadata fields: none')
  }

  // Include quality assessment
  const quality = assessInstallQuality(context)
  lines.push(`Install quality: ${JSON.stringify(quality)}`)

  lines.push('Captured logs (level:message):')
  const trimmed = (context.captured || []).slice(0, 30)
  trimmed.forEach(l => lines.push(`[${l.level}] ${l.text}`))
  if ((context.captured || []).length > trimmed.length) lines.push('...truncated...')

  // Include existing advice so AI does not repeat it
  const existingAdvice = context.advice || []
  if (existingAdvice.length) {
    lines.push('')
    lines.push('Existing advice already shown to the user (DO NOT repeat or paraphrase these):')
    existingAdvice.forEach(a => {
      const text = typeof a === 'string' ? a : (a.text || '')
      if (text) lines.push(`- ${text}`)
    })
  }

  if (typeof selectRelatedReadingFn === 'function') {
    const signals = {
      pendoPresent: context.status.pendoPresent,
      validatePresent: context.status.validatePresent,
      visitorId: context.status.visitorId,
      accountId: context.status.accountId,
      cspIssue: !!(context.cspMeta || '').length || (context.captured || []).some(l => /csp|content.security/i.test(l.text)),
      noResourceHits: context.status.resourceHits && context.status.resourceHits.length === 0,
      apiKeyMissing: !context.apiKeyFound,
      urlSanitized: !!(context.status.pendoPresent && ((context.status.redirectCount || 0) > 0 || (context.status.urlSanitization && (context.status.urlSanitization.inlinePatterns.length || context.status.urlSanitization.observedStrips || context.status.urlSanitization.navQueryStripped || context.status.urlSanitization.navPendoTokenStripped)))),
    }
    const kbEntries = selectRelatedReadingFn(signals, 6)
    if (kbEntries && kbEntries.length) {
      lines.push('')
      lines.push('Reference excerpts from official Pendo documentation (cite these where applicable; do not invent URLs):')
      let charBudget = 800
      for (const entry of kbEntries) {
        if (charBudget <= 0) break
        const block = `- ${entry.title} (${entry.url}): ${entry.bullets.slice(0, 3).join('; ')}`
        lines.push(block)
        charBudget -= block.length
      }
    }
  }

  // Quality guide excerpt (passed from popup.js when available)
  if (context._qualityGuide) {
    lines.push('')
    lines.push('Quality guide reference:')
    lines.push(String(context._qualityGuide).slice(0, 1200))
  }

  lines.push('')
  lines.push('Respond ONLY with a JSON array. Each element: {"text":"one plain sentence","supportKey":"chooseIdsMetadata"}')
  lines.push('Rules: text must be one plain sentence with no markdown, no URLs, no numbering. supportKey must be one of: installGuide, chooseIdsMetadata, configureMetadata, csp, spa, gtm, segment, iframe, sandbox, agentSettings, agentDebug, troubleshooting, hostnameAllowlist, multiDomain, launcherPlan, signedMetadata, installComponents, vds, agentConfig.')
  lines.push('Max 3 items. Skip anything already covered in "Existing advice" above.')
  return lines.join('\n')
}

export function getProfileEmail() {
  return new Promise((resolve) => {
    try {
      if (!chrome.identity || typeof chrome.identity.getProfileUserInfo !== 'function') return resolve('')
      chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (info) => {
        if (chrome.runtime.lastError) return resolve('')
        resolve((info && info.email) ? String(info.email).trim().toLowerCase() : '')
      })
    } catch { resolve('') }
  })
}

export async function getOrCreateVisitorId() {
  const email = await getProfileEmail()
  if (email && email.endsWith('@pendo.io')) return email

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

/**
 * Evaluate a JS expression inside the Pendo Launcher extension's content-script world via CDP.
 * Returns { ok: true, value } or { ok: false, reason, message? }.
 */
export async function evaluateInLauncherWorld(tabId, launcherId, expression) {
  if (typeof chrome === 'undefined' || !chrome.debugger || typeof chrome.debugger.attach !== 'function') {
    return { ok: false, reason: 'no-debugger-api' }
  }
  const target = { tabId }
  const expectedOrigin = `chrome-extension://${launcherId}`

  try {
    await chrome.debugger.attach(target, '1.3')
  } catch (e) {
    return { ok: false, reason: 'attach-failed', message: e && e.message ? e.message : String(e) }
  }

  try {
    const contexts = []
    const handler = (source, method, params) => {
      if (source.tabId === tabId && method === 'Runtime.executionContextCreated') {
        contexts.push(params.context)
      }
    }
    chrome.debugger.onEvent.addListener(handler)
    await chrome.debugger.sendCommand(target, 'Runtime.enable')
    await new Promise(r => setTimeout(r, 60))
    chrome.debugger.onEvent.removeListener(handler)

    const launcherCtx = contexts.find(ctx =>
      (ctx.origin || '').toLowerCase() === expectedOrigin
    )
    if (!launcherCtx) return { ok: false, reason: 'no-launcher-context' }

    const evalResult = await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
      expression,
      contextId: launcherCtx.id,
      returnByValue: true
    })

    if (evalResult?.exceptionDetails) {
      const text = evalResult.exceptionDetails.text || evalResult.exceptionDetails.exception?.description || 'Evaluation failed'
      return { ok: false, reason: 'eval-exception', message: text }
    }
    return { ok: true, value: evalResult?.result?.value }
  } finally {
    try { await chrome.debugger.detach(target) } catch {}
  }
}

/** Enable pendo.enableDebugging() inside the Launcher content-script world (Phase 1.75 path). */
export async function enableDebuggingViaLauncherCdp(tabId, launcher) {
  const expression = `(${enableDebuggingInPage.toString()})()`
  const cdp = await evaluateInLauncherWorld(tabId, launcher.id, expression)
  if (!cdp.ok) {
    if (cdp.reason === 'no-debugger-api') {
      return { ok: false, message: 'Launcher debugger requires Chrome or Edge (CDP not available in this browser).' }
    }
    if (cdp.reason === 'no-launcher-context') {
      return { ok: false, message: 'Pendo Launcher agent context not found on this tab. Re-run validation first.' }
    }
    return { ok: false, message: cdp.message || 'Failed to enable debugger in Launcher context.' }
  }
  return cdp.value || { ok: false, message: 'No result from Launcher debugger.' }
}

/** Rewrite known provider errors into clearer guidance (kept in sync with popup.js). */
export function friendlyAiFailureDetail(provider, rawDetail) {
  const s = String(rawDetail || '')
  if (provider === 'claude' && /cors requests are not allowed for this organization/i.test(s)) {
    return 'Anthropic returned an organization policy error: client-side (browser) API access is disabled for your workspace, and Chrome extensions are treated as client-side. Use OpenAI or Google Gemini in Settings, use an API key from a workspace that allows browser access, ask an Anthropic org admin to update that policy, or set storage key aiClaudeEndpoint to an HTTPS URL of a proxy you run that forwards to Anthropic’s Messages API (same request/response shape as /v1/messages).'
  }
  return null
}

export const AI_DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  claude: 'claude-haiku-4-5-20251001',
  gemini: 'gemini-3.5-flash',
}

export const DEPRECATED_AI_MODELS = new Set([
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-lite-001',
  'gemini-3-flash-preview',
])

export function resolveAiModel(provider, aiModel) {
  const p = provider || 'openai'
  const custom = String(aiModel || '').trim()
  if (!custom || DEPRECATED_AI_MODELS.has(custom)) {
    return AI_DEFAULT_MODELS[p] || AI_DEFAULT_MODELS.openai
  }
  return custom
}

export async function getAiConfig() {
  return new Promise(resolve => {
    try {
      if (!chrome.storage || !chrome.storage.local) return resolve({})
      chrome.storage.local.get({ aiProvider: 'openai', aiEndpoint: '', aiClaudeEndpoint: '', aiApiKey: '', aiModel: '' }, cfg => {
        if (cfg.aiModel && DEPRECATED_AI_MODELS.has(cfg.aiModel)) {
          try { chrome.storage.local.remove('aiModel') } catch (_) {}
          cfg.aiModel = ''
        }
        resolve(cfg)
      })
    } catch (e) {
      resolve({})
    }
  })
}

export function stripAllUrls(text) {
  return String(text || '').replace(/https?:\/\/\S+/gi, '').replace(/\s{2,}/g, ' ').trim()
}

export function parseAiAdviceResponse(content, existingAdvice) {
  const existing = (existingAdvice || []).map(a => {
    const t = typeof a === 'string' ? a : (a.text || '')
    return t.toLowerCase().replace(/[^\w\s]/g, '').trim()
  }).filter(Boolean)

  let items = []

  const jsonMatch = content.match(/\[[\s\S]*\]/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      if (Array.isArray(parsed)) {
        items = parsed.filter(i => i && typeof i.text === 'string' && i.text.trim())
          .map(i => ({ text: i.text.trim(), supportKey: i.supportKey || null }))
      }
    } catch {}
  }

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
      .map(text => ({ text, supportKey: null }))
  }

  const results = []
  for (const item of items) {
    let text = stripAllUrls(item.text)
    if (!text || text.length < 5) continue

    const normalized = text.toLowerCase().replace(/[^\w\s]/g, '').trim()
    const tokens = normalized.split(/\s+/)

    let isDuplicate = false
    for (const ex of existing) {
      if (!ex) continue
      if (normalized.includes(ex) || ex.includes(normalized)) { isDuplicate = true; break }
      const exTokens = ex.split(/\s+/)
      const overlap = tokens.filter(t => exTokens.includes(t)).length
      if (overlap / Math.max(tokens.length, 1) > 0.7) { isDuplicate = true; break }
    }
    if (isDuplicate) continue

    let supportKey = item.supportKey
    if (!supportKey || !PENDO_SUPPORT[supportKey]) {
      supportKey = inferSupportKeyFromText(text)
    }

    results.push({ text, source: 'ai', supportKey })
    if (results.length >= 3) break
  }

  return results
}

export async function requestAiAdvice(context) {
  const cfg = await getAiConfig()
  const apiKey = String((cfg && cfg.aiApiKey) || '').trim()
  if (!apiKey) return []

  const provider = cfg.aiProvider || 'openai'
  const prompt = buildAiPrompt(context)
  const systemMsg = 'You are a concise Pendo install troubleshooting assistant. Only rely on official Pendo documentation. Respond ONLY with a JSON array of objects, each with "text" (one plain sentence, no markdown/URLs/numbering) and "supportKey". Max 3 items. Do not repeat advice already provided.'

  const model = resolveAiModel(provider, cfg.aiModel)
  let endpoint, headers, body

  if (provider === 'claude') {
    const claudeUrl = String((cfg && cfg.aiClaudeEndpoint) || '').trim()
    endpoint = claudeUrl || 'https://api.anthropic.com/v1/messages'
    const directAnthropic = /anthropic\.com/i.test(endpoint)
    headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }
    if (directAnthropic) headers['anthropic-dangerous-direct-browser-access'] = 'true'
    body = { model, max_tokens: 1024, system: systemMsg, messages: [{ role: 'user', content: prompt }] }
  } else if (provider === 'gemini') {
    endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
    headers = { 'Content-Type': 'application/json' }
    // Gemini 3.x is tuned for default sampling, so temperature/top_p/top_k are omitted. Thinking is
    // pinned to LOW because the default (medium) effort can exceed timeoutMs on this short prompt.
    body = { contents: [{ parts: [{ text: systemMsg + '\n\n' + prompt }] }], generationConfig: { thinkingConfig: { thinkingLevel: 'LOW' } } }
  } else {
    endpoint = cfg.aiEndpoint || 'https://api.openai.com/v1/chat/completions'
    headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }
    body = { model, messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: prompt }], temperature: 0.1 }
  }

  const controller = new AbortController()
  const timeoutMs = cfg.timeoutMs || 8000
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
  try {
    let data
    if (provider === 'claude') {
      clearTimeout(timer)
      let bg
      try {
        bg = await chrome.runtime.sendMessage({
          type: 'pendo-validate-ai-fetch',
          endpoint,
          headers,
          body: JSON.stringify(body),
          timeoutMs,
        })
      } catch (e) {
        throw new Error((e && e.message) || 'Background AI proxy failed')
      }
      if (!bg || typeof bg.ok !== 'boolean') {
        throw new Error('AI proxy unavailable: extension background did not respond.')
      }
      if (bg.error === 'timeout' || bg.error === 'network') {
        throw new DOMException(bg.message || (bg.error === 'timeout' ? 'Aborted' : 'Network error'), bg.error === 'timeout' ? 'AbortError' : 'Error')
      }
      if (!bg.ok) {
        const errBody = bg.json
        let apiErr = ''
        const m = errBody && errBody.error && (errBody.error.message || errBody.error.type)
        if (m) apiErr = String(m).slice(0, 200)
        const parts = [`AI request failed with status ${bg.status}`]
        if (apiErr) parts.push(apiErr)
        if (bg.status === 401) parts.push('Use an API key from the same provider you selected (e.g. Anthropic console for Claude).')
        throw new Error(parts.join('. '))
      }
      data = bg.json
    } else {
      const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })
      clearTimeout(timer)
      if (!res.ok) {
        let apiErr = ''
        try {
          const errBody = await res.json()
          const m = errBody && errBody.error && (errBody.error.message || errBody.error.type)
          if (m) apiErr = String(m).slice(0, 200)
        } catch (_) {}
        const parts = [`AI request failed with status ${res.status}`]
        if (apiErr) parts.push(apiErr)
        if (res.status === 401) parts.push('Use an API key from the same provider you selected (e.g. Anthropic console for Claude).')
        throw new Error(parts.join('. '))
      }
      data = await res.json()
    }
    let content = ''
    if (provider === 'claude') content = data?.content?.[0]?.text || ''
    else if (provider === 'gemini') {
      const parts = data?.candidates?.[0]?.content?.parts || []
      content = parts.filter(p => p && typeof p.text === 'string' && !p.thought).map(p => p.text).join('')
    }
    else content = data?.choices?.[0]?.message?.content || ''
    if (!content) return []
    return parseAiAdviceResponse(content, context.advice)
  } catch (e) {
    clearTimeout(timer)
    const isAbort = e && (e.name === 'AbortError' || (e.message && String(e.message).includes('aborted')))
    let detail = isAbort
      ? 'Request timed out. Check your network or increase timeoutMs in storage.'
      : (e && e.message ? String(e.message) : String(e))
    const friendly = friendlyAiFailureDetail(provider, detail)
    if (friendly) detail = friendly
    return [{ text: `AI suggestion unavailable: ${detail}`, source: 'ai', supportKey: 'technicalSupport', supportUrl: PENDO_SUPPORT.technicalSupport }]
  }
}

/**
 * captureAndInspect — extracted from the inner function inside runInPage().
 * Designed to run in a browser page context; uses window, document, console, performance.
 * Keep in sync with the production copy in extension/popup.js.
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
  let agent, pendoGlobal
  if (isLauncher) {
    if (window && window.Pendo) { agent = window.Pendo; pendoGlobal = 'Pendo' }
    else if (window && window.pendo) { agent = window.pendo; pendoGlobal = 'pendo' }
    else { agent = null; pendoGlobal = null }
  } else {
    agent = (window && window.pendo) || null
    pendoGlobal = agent ? 'pendo' : null
  }
  const validateFn = (agent && agent.validateInstall) || null

  const status = {
    pendoPresent: !!agent,
    pendoGlobal,
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
        if (s.src || !s.textContent || !/pendo\s*\.\s*initialize\s*\(/.test(s.textContent)) continue
        const keys = extractInitConfigKeys(s.textContent)
        if (keys && keys.length) { status.configKeys = keys; status.configSource = 'inline-script'; break }
      }
    } catch {}
  }

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
        const scripts = Array.from(document.scripts || [])
        urlSan.externalScripts = scripts.filter(s => s.src).length
        const inlineScripts = scripts.filter(s => !s.src && s.textContent)
        urlSan.inlineScripts = inlineScripts.length
        const src = inlineScripts.map(s => s.textContent).join('\n')
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

  if (variant === 'launcher') {
    captured.unshift({ level: 'info', text: 'Validated via Pendo Launcher window.' })
  } else if (variant === 'launcher-beta') {
    captured.unshift({ level: 'info', text: 'Validated via Pendo Launcher (Beta) window.' })
  }

  return { status, captured, advice, checks, cspMeta, apiKeyFound, hasError, hasWarn }
}

// ========== Install quality assessment ==========
const PLACEHOLDER_IDS = /^(anonymous|guest|unknown|undefined|null|0|test|demo|user|visitor)$/i

export function assessInstallQuality(context) {
  const status = context.status || {}
  const pageUrl = context.pageUrl || ''
  const result = {
    visitorId: { present: false, value: null, quality: 'good', issues: [] },
    accountId: { present: false, value: null, quality: 'good', issues: [] },
    visitorMetadata: { fields: [], missingRecommended: [], quality: 'good' },
    accountMetadata: { fields: [], missingRecommended: [], quality: 'good' },
    environment: { isStaging: false, issues: [] },
  }

  // Visitor ID
  const vid = status.visitorId
  if (vid) {
    result.visitorId.present = true
    result.visitorId.value = vid
    if (PLACEHOLDER_IDS.test(String(vid).trim())) {
      result.visitorId.quality = 'poor'
      result.visitorId.issues.push(`visitorId "${vid}" is a placeholder value.`)
    } else if (String(vid).length < 3) {
      result.visitorId.quality = 'weak'
      result.visitorId.issues.push(`visitorId "${vid}" is very short (fewer than 3 characters).`)
    } else if (/^\d+$/.test(String(vid)) && Number(vid) < 100) {
      result.visitorId.quality = 'weak'
      result.visitorId.issues.push(`visitorId "${vid}" looks like a low numeric counter.`)
    }
  }

  // Account ID
  const aid = status.accountId
  if (aid != null) {
    result.accountId.present = true
    result.accountId.value = aid
    if (PLACEHOLDER_IDS.test(String(aid).trim())) {
      result.accountId.quality = 'poor'
      result.accountId.issues.push(`accountId "${aid}" is a placeholder value.`)
    } else if (vid && String(aid) === String(vid)) {
      result.accountId.quality = 'weak'
      result.accountId.issues.push('accountId is identical to visitorId (likely misconfiguration).')
    }
  }

  // Visitor metadata
  const vmeta = status.visitorMetadata
  if (vmeta && typeof vmeta === 'object') {
    const fields = Object.keys(vmeta).filter(k => k !== 'id')
    result.visitorMetadata.fields = fields
    const recommended = ['email', 'name', 'fullName', 'full_name', 'role', 'title']
    const has = recommended.filter(r => fields.some(f => f.toLowerCase() === r.toLowerCase()))
    const missing = recommended.filter(r => !fields.some(f => f.toLowerCase() === r.toLowerCase()))
    // Group name variants
    const hasName = has.some(h => /^(name|fullName|full_name)$/i.test(h))
    const hasRole = has.some(h => /^(role|title)$/i.test(h))
    const missingGroups = []
    if (!has.includes('email')) missingGroups.push('email')
    if (!hasName) missingGroups.push('name/fullName')
    if (!hasRole) missingGroups.push('role/title')
    result.visitorMetadata.missingRecommended = missingGroups
    if (fields.length === 0) result.visitorMetadata.quality = 'poor'
    else if (missingGroups.length >= 2) result.visitorMetadata.quality = 'weak'
  } else if (vid) {
    result.visitorMetadata.quality = 'poor'
    result.visitorMetadata.missingRecommended = ['email', 'name/fullName', 'role/title']
  }

  // Account metadata
  const ameta = status.accountMetadata
  if (ameta && typeof ameta === 'object') {
    const fields = Object.keys(ameta).filter(k => k !== 'id')
    result.accountMetadata.fields = fields
    const recommended = ['name', 'plan', 'tier', 'industry']
    const missingGroups = []
    const hasName = fields.some(f => f.toLowerCase() === 'name')
    const hasPlan = fields.some(f => /^(plan|tier)$/i.test(f))
    if (!hasName) missingGroups.push('name')
    if (!hasPlan) missingGroups.push('plan/tier')
    result.accountMetadata.missingRecommended = missingGroups
    if (fields.length === 0) result.accountMetadata.quality = 'poor'
    else if (missingGroups.length >= 2) result.accountMetadata.quality = 'weak'
  } else if (aid != null) {
    result.accountMetadata.quality = 'poor'
    result.accountMetadata.missingRecommended = ['name', 'plan/tier']
  }

  // Environment
  const isStaging = /\b(staging|preview|dev\.|qa\.|localhost)\b/i.test(pageUrl)
  result.environment.isStaging = isStaging
  if (isStaging && vid) {
    const hasPrefix = /^(dev_|staging_|test_|qa_)/i.test(String(vid))
    if (!hasPrefix) {
      result.environment.issues.push('Staging/dev URL detected but visitorId lacks a test prefix (dev_, staging_, test_, qa_).')
    }
  }

  return result
}

/**
 * Mirror of popup.js appendQualityAdviceToResult. Appends install-quality advice to a
 * result already produced by captureAndInspect. The environment/sandbox advice is only
 * added when captureAndInspect did not already emit a sandbox recommendation, so a
 * staging URL with a non-prefixed visitorId yields a single sandbox recommendation.
 */
export function appendQualityAdviceToResult(result, pageUrl) {
  if (!result?.status?.pendoPresent) return result
  const quality = assessInstallQuality({ status: result.status, pageUrl: pageUrl || '' })
  result.advice = result.advice || []
  const { status } = result
  if (quality.visitorId.quality === 'poor') {
    result.advice.push({ text: `visitorId is set to a placeholder value ("${status.visitorId}"). Use a stable authenticated identifier.`, source: 'builtin', supportKey: 'chooseIdsMetadata' })
  } else if (quality.visitorId.quality === 'weak') {
    result.advice.push({ text: quality.visitorId.issues[0] || 'visitorId may not be a stable identifier.', source: 'builtin', supportKey: 'chooseIdsMetadata' })
  }
  if (quality.accountId.quality === 'poor') {
    result.advice.push({ text: `accountId is set to a placeholder value ("${status.accountId}"). Use a stable organisation identifier.`, source: 'builtin', supportKey: 'chooseIdsMetadata' })
  } else if (quality.accountId.quality === 'weak' && quality.accountId.issues.length) {
    result.advice.push({ text: quality.accountId.issues[0], source: 'builtin', supportKey: 'chooseIdsMetadata' })
  }
  const hasSandboxAdvice = result.advice.some(a => a && a.supportKey === 'sandbox')
  if (quality.environment.issues.length && !hasSandboxAdvice) {
    result.advice.push({ text: quality.environment.issues[0] + ' Consider test prefixes and an Exclude List to keep analytics clean.', source: 'builtin', supportKey: 'sandbox' })
  }
  return result
}

// ========== Configuration flag detection ==========
/** Standard pendo.initialize keys that do NOT count as customisation "flags". */
export const STANDARD_INIT_KEYS = new Set(['visitor', 'account', 'apiKey', 'publicAppId'])

/** Known top-level pendo.initialize options mapped to their Web SDK config doc category. */
export const CONFIG_FLAG_CATEGORY = {
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
  recording: 'replay',
}

/** Config doc category -> support link key. */
export const CONFIG_CATEGORY_SUPPORT_KEY = {
  core: 'agentConfigCore', analytics: 'agentConfigAnalytics', guides: 'agentConfigGuides',
  networkLogs: 'agentConfigNetworkLogs', replay: 'agentConfigReplay',
}

/** Config doc category -> human label used inside the warning text. */
export const CONFIG_CATEGORY_LABEL = {
  core: 'Core', analytics: 'Analytics', guides: 'Guides', networkLogs: 'Network logs', replay: 'Replay',
}

/**
 * Identify non-standard configuration flags from the options passed to pendo.initialize().
 * Reads status.configKeys (captured from the snippet queue). Returns { detected, flags },
 * where `detected` indicates the init options were readable and `flags` lists each
 * non-standard key with its config-doc category (null for unrecognised/custom keys).
 */
export function assessConfigFlags(status) {
  const keys = status && Array.isArray(status.configKeys) ? status.configKeys : null
  if (!keys) return { detected: false, flags: [] }
  const flags = keys
    .filter(k => !STANDARD_INIT_KEYS.has(k))
    .map(k => ({ key: k, category: CONFIG_FLAG_CATEGORY[k] || null }))
  return { detected: true, flags }
}

/**
 * Append a single grouped warning when pendo.initialize() uses options beyond a standard
 * install (visitor + account, plus the required apiKey/publicAppId). Each flag is named with
 * its config category and the warning links to the Web SDK configuration docs. No-op when the
 * init options were not readable; adds a passing check when only standard keys are present.
 */
export function appendConfigFlagsAdviceToResult(result) {
  if (!result || !result.status || !result.status.pendoPresent) return result
  const { detected, flags } = assessConfigFlags(result.status)
  if (!detected) return result
  result.advice = result.advice || []
  result.checks = result.checks || []
  if (!flags.length) {
    result.checks.push('Standard configuration detected (visitor + account only).')
    return result
  }
  const labelList = flags
    .map(f => `${f.key} (${f.category ? CONFIG_CATEGORY_LABEL[f.category] : 'other'})`)
    .join(', ')
  const categories = []
  for (const f of flags) {
    if (f.category && !categories.includes(f.category)) categories.push(f.category)
  }
  const supportKeys = categories.map(c => CONFIG_CATEGORY_SUPPORT_KEY[c]).filter(Boolean)
  result.advice.push({
    text: `Non-standard configuration flags detected in pendo.initialize(): ${labelList}. `
      + 'A standard install passes only visitor and account. Confirm each flag is intentional and '
      + 'review it against the Pendo Web SDK configuration docs.',
    source: 'builtin',
    supportKey: 'agentConfig',
    supportKeys,
  })
  return result
}

/** Pure drag-clamp logic (absolute pointer model, used by older tests). */
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

/** Delta-based drag clamp matching production content.js applyDrag(). */
export function clampDragDelta({ originLeft, originTop, dx, dy, innerWidth, innerHeight, iframeWidth }) {
  const newLeft = originLeft + (dx || 0)
  const newTop  = originTop  + (dy || 0)
  const maxLeft = innerWidth - iframeWidth
  const maxTop  = innerHeight - 60
  return {
    left: Math.max(0, Math.min(newLeft, maxLeft)),
    top:  Math.max(0, Math.min(newTop,  maxTop)),
  }
}

// ========== Theme preference helpers (mirrored from popup.js) ==========

export const PENDO_THEME_KEY = 'pendoValidateTheme'
export const THEME_STORAGE_KEY = 'themePreference'

export function applyTheme(pref, root = document.documentElement) {
  if (pref === 'light' || pref === 'dark') root.dataset.theme = pref
  else delete root.dataset.theme
}

export function loadThemePreference() {
  return new Promise((resolve) => {
    try {
      if (!chrome.storage || !chrome.storage.local) return resolve('system')
      chrome.storage.local.get({ [THEME_STORAGE_KEY]: 'system' }, (result) => {
        const v = result && result[THEME_STORAGE_KEY]
        resolve(v === 'light' || v === 'dark' ? v : 'system')
      })
    } catch (_) { resolve('system') }
  })
}

export function saveThemePreference(pref) {
  return new Promise((resolve) => {
    try {
      if (pref === 'system') localStorage.removeItem(PENDO_THEME_KEY)
      else if (pref === 'light' || pref === 'dark') localStorage.setItem(PENDO_THEME_KEY, pref)
    } catch (_) {}
    try {
      if (!chrome.storage || !chrome.storage.local) return resolve()
      chrome.storage.local.set({ [THEME_STORAGE_KEY]: pref }, () => resolve())
    } catch (_) { resolve() }
  })
}
