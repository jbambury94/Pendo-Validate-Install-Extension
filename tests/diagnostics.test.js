import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  appendDiagnosticsAdviceToResult,
  appendDiagnosticsToResult,
  analyzeFrameMap,
  summarizeFrameProbeResults,
  classifyPendoRequest,
  describeNetworkFailure,
  groupNetworkRequests,
  buildNetworkFindings,
  networkCaptureMatchesPage,
  hasSubframeOnlyPendo,
  deriveSubframeHeroState,
  collectDiagnosticsSecrets,
  buildDiagnosticsMetadata,
  describeFrame,
  buildDiagnosticsMarkdownSections,
  summarizeAgentConfig,
  DIAG_CONFIG_DEFAULTS,
} from './helpers.js'

const SDK_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '@pendo', 'web-sdk', 'dist', 'pendo.module.js')

function parseSdkConfigDefaults() {
  const s = readFileSync(SDK_PATH, 'utf8')
  const m = s.match(/function initializeOptions\(\) \{([\s\S]*?)\n    \}/)
  const block = m ? m[1] : ''
  const re = /addOption\('([^']+)'(?:,\s*\[[^\]]*\])?(?:,\s*([^,)]+))?/g
  const out = {}
  let x
  while ((x = re.exec(block))) {
    const name = x[1]
    if (out[name] !== undefined) continue
    const raw = x[2]
    if (raw === undefined) continue
    const d = raw.trim()
    if (d === 'undefined') continue
    out[name] = d
  }
  return out
}

function sdkDefaultLiteralToJs(raw) {
  const d = raw.trim()
  if (d === 'Infinity') return Infinity
  if (d === 'true') return true
  if (d === 'false') return false
  if (d === '[]') return []
  if (d === '{}') return {}
  if (/^\d+$/.test(d)) return Number(d)
  if (d.startsWith("'") && d.endsWith("'")) return d.slice(1, -1)
  return JSON.parse(d)
}

const KEY_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const KEY_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
const HEALTHY = 'Installation looks healthy based on current checks.'

function envOk(overrides) {
  return { available: true, errorCount: 0, errors: [], methods: [], globals: [], url: [], plugins: [], ...overrides }
}

function pageResult(statusOverrides, rest) {
  return {
    status: { pendoPresent: true, validatePresent: true, version: '2.341.0', detectedApiKey: KEY_A, ...statusOverrides },
    advice: [],
    checks: [],
    captured: [],
    ...rest,
  }
}

function frame(overrides) {
  return {
    frameId: 0, url: 'https://app.example.com/home', isTop: true, agent: 'pendo', version: '2.341.0',
    apiKey: KEY_A, visitorId: 'v1', accountId: 'a1', anonymous: false, ready: true, dataRequests: 3, childFrames: 0,
    ...overrides,
  }
}

describe('appendDiagnosticsAdviceToResult', () => {
  it('does nothing when Pendo is not on the page', () => {
    const res = { status: { pendoPresent: false }, advice: [], checks: [] }
    appendDiagnosticsAdviceToResult(res)
    expect(res.advice).toEqual([])
    expect(res.checks).toEqual([])
  })

  it('reports an agent without validateEnvironment() as a check', () => {
    const res = appendDiagnosticsAdviceToResult(pageResult({ environment: { available: false } }))
    expect(res.checks).toContain('Environment check not available on agent 2.341.0 (no validateEnvironment()).')
    expect(res.advice).toEqual([])
  })

  it('reports a failed environment check as a check', () => {
    const res = appendDiagnosticsAdviceToResult(pageResult({ environment: { available: true, failed: 'boom' } }))
    expect(res.checks).toContain('Environment check could not run: boom')
  })

  it('warns about the agent error history with the three most recent errors, newest first', () => {
    const errors = ['e1', 'e2', 'e3', 'e4']
    const res = appendDiagnosticsAdviceToResult(pageResult({ environment: envOk({ errorCount: 4, errors }) }))
    expect(res.advice).toHaveLength(1)
    const [a] = res.advice
    expect(a.severity).toBe('warn')
    expect(a.supportKey).toBe('agentDebug')
    expect(a.text).toContain('The agent logged 4 errors')
    expect(a.text).toContain('"e4"; "e3"; "e2"')
    expect(a.text).not.toContain('"e1"')
  })

  it('warns only about wrapped methods that can break Pendo and lists the rest as a check', () => {
    const methods = [
      { type: 'JSON', names: ['stringify'] },
      { type: 'Array | Prototype', names: ['toJSON', 'includes'] },
      { type: 'Promise | Prototype', names: ['then'] },
    ]
    const res = appendDiagnosticsAdviceToResult(pageResult({ environment: envOk({ methods }) }))
    const warn = res.advice.find(a => /Built-in methods/.test(a.text))
    expect(warn.text).toContain('JSON.stringify')
    expect(warn.text).toContain('Array.prototype.toJSON')
    expect(warn.text).not.toContain('Promise')
    const check = res.checks.find(c => /other built-in methods are wrapped/.test(c))
    expect(check).toContain('Array.prototype.includes')
    expect(check).toContain('Promise.prototype.then')
  })

  it('does not warn when only Promise or XMLHttpRequest style methods are wrapped', () => {
    const methods = [{ type: 'Promise | Prototype', names: ['then', 'catch'] }]
    const res = appendDiagnosticsAdviceToResult(pageResult({ environment: envOk({ methods }) }))
    expect(res.advice).toEqual([])
    expect(res.checks.some(c => /2 other built-in methods are wrapped/.test(c))).toBe(true)
  })

  it('warns about a modified window.Event but treats frames.length as informational', () => {
    const globals = [
      'Pendo has detected that window.Event has been modified',
      'Pendo has detected that window.frames.length has been modified',
    ]
    const res = appendDiagnosticsAdviceToResult(pageResult({ environment: envOk({ globals }) }))
    expect(res.advice).toHaveLength(1)
    expect(res.advice[0].text).toContain('window.Event')
    expect(res.checks.some(c => c.includes('window.frames.length'))).toBe(true)
  })

  it('adds checks for customized and sanitized URLs', () => {
    const url = [{ type: 'customizedUrl', msg: 'm', value: 'x' }, { type: 'sanitizedUrl', msg: 'm', value: 'y' }]
    const res = appendDiagnosticsAdviceToResult(pageResult({ environment: envOk({ url }) }))
    expect(res.checks.some(c => /customized URL/.test(c))).toBe(true)
    expect(res.checks.some(c => /sanitizes the URL/.test(c))).toBe(true)
  })

  it('warns when the agent script is included more than once', () => {
    const src = `https://cdn.pendo.io/agent/static/${KEY_A}/pendo.js`
    const res = appendDiagnosticsAdviceToResult(pageResult({ agentScripts: [{ src, apiKey: KEY_A }, { src, apiKey: KEY_A }] }))
    const a = res.advice.find(x => /included 2 times/.test(x.text))
    expect(a).toBeTruthy()
    expect(a.supportKey).toBe('installComponents')
    expect(a.severity).toBe('warn')
    expect(a.text.split(src).length - 1).toBe(1)
  })

  it('does not warn when pendo.js and pendo-staging.js share the same API key', () => {
    const prod = `https://cdn.eu.pendo.io/agent/static/${KEY_A}/pendo.js`
    const staging = `https://cdn.eu.pendo.io/agent/static/${KEY_A}/pendo-staging.js`
    const res = appendDiagnosticsAdviceToResult(pageResult({
      agentScripts: [{ src: prod, apiKey: KEY_A }, { src: staging, apiKey: KEY_A }],
      apiKeysSeen: [KEY_A],
    }))
    expect(res.advice.some(a => /included .* times/.test(a.text))).toBe(false)
  })

  it('warns when the snippet and the Launcher use different API keys', () => {
    const res = appendDiagnosticsAdviceToResult(pageResult({
      snippetGlobalPresent: true, launcherGlobalPresent: true, otherAgentApiKey: KEY_B, apiKeysSeen: [KEY_A, KEY_B],
    }))
    expect(res.advice).toHaveLength(1)
    expect(res.advice[0].text).toContain('window.pendo')
    expect(res.advice[0].text).toContain('window.Pendo')
  })

  it('notes additionalApiKeys when more than one API key is seen', () => {
    const plain = appendDiagnosticsAdviceToResult(pageResult({ apiKeysSeen: [KEY_A, KEY_B] }))
    expect(plain.advice[0].text).toContain('2 different Pendo API keys')
    expect(plain.advice[0].text).toContain('If this is not intentional')
    const intended = appendDiagnosticsAdviceToResult(pageResult({ apiKeysSeen: [KEY_A, KEY_B], configKeys: ['additionalApiKeys'] }))
    expect(intended.advice[0].text).toContain('additionalApiKeys')
  })

  it('stays quiet for a clean environment with one script and one key', () => {
    const res = appendDiagnosticsAdviceToResult(pageResult({
      environment: envOk(), agentScripts: [{ src: 'x', apiKey: KEY_A }], apiKeysSeen: [KEY_A],
    }))
    expect(res.advice).toEqual([])
    expect(res.checks).toEqual([])
  })
})

describe('summarizeFrameProbeResults', () => {
  it('returns null when the probe failed', () => {
    expect(summarizeFrameProbeResults(null)).toBeNull()
  })

  it('drops skipped and empty results and sorts the top frame first', () => {
    const frames = summarizeFrameProbeResults([
      { frameId: 7, result: { url: 'https://b.example.com/', isTop: false, agent: null, dataRequests: 0, childFrames: 0 } },
      { frameId: 3, result: { url: 'chrome-extension://x/', skipped: 'extension' } },
      { frameId: 9, result: null },
      { frameId: 0, result: { url: 'https://a.example.com/', isTop: true, agent: 'pendo', apiKey: KEY_A, visitorId: 'v', dataRequests: '4', childFrames: 1, ready: true } },
    ])
    expect(frames.map(f => f.frameId)).toEqual([0, 7])
    expect(frames[0]).toMatchObject({ isTop: true, agent: 'pendo', dataRequests: 4, childFrames: 1, ready: true })
    expect(frames[1]).toMatchObject({ agent: null, ready: null, visitorId: null })
  })
})

describe('analyzeFrameMap', () => {
  it('is unavailable without frames', () => {
    const { frameMap, advice, checks } = analyzeFrameMap(null)
    expect(frameMap.available).toBe(false)
    expect(advice).toEqual([])
    expect(checks).toEqual([])
  })

  it('warns when Pendo is only in a subframe', () => {
    const frames = [
      frame({ agent: null, apiKey: null, visitorId: null, accountId: null, childFrames: 1 }),
      frame({ frameId: 4, isTop: false, url: 'https://embed.example.com/app' }),
    ]
    const { frameMap, advice } = analyzeFrameMap(frames)
    expect(frameMap).toMatchObject({ available: true, inspected: 2, subframePendoCount: 1, topHasAgent: false, notInspectable: 0 })
    expect(advice).toHaveLength(1)
    expect(advice[0]).toMatchObject({ supportKey: 'iframe', severity: 'warn' })
    expect(advice[0].text).toContain('https://embed.example.com')
  })

  it('warns when a subframe uses a different API key or identity', () => {
    const frames = [
      frame({ childFrames: 1 }),
      frame({ frameId: 2, isTop: false, url: 'https://other.example.com/', apiKey: KEY_B.toUpperCase(), visitorId: 'v2' }),
    ]
    const { advice, checks } = analyzeFrameMap(frames)
    expect(advice).toHaveLength(1)
    expect(advice[0].text).toContain('uses a different API key and identifies a different visitor')
    expect(checks.some(c => /same API key and identity/.test(c))).toBe(false)
  })

  it('compares API keys case-insensitively and reports consistent subframes as a check', () => {
    const frames = [frame({ childFrames: 1 }), frame({ frameId: 2, isTop: false, apiKey: KEY_A.toUpperCase() })]
    const { advice, checks } = analyzeFrameMap(frames)
    expect(advice).toEqual([])
    expect(checks).toContain('Pendo is also running in 1 subframe with the same API key and identity as the top page.')
  })

  it('lists same-site subframes without Pendo but ignores third-party ones', () => {
    const frames = [
      frame({ childFrames: 2 }),
      frame({ frameId: 2, isTop: false, url: 'https://reports.example.com/r', agent: null, apiKey: null, visitorId: null, accountId: null }),
      frame({ frameId: 3, isTop: false, url: 'https://www.youtube.com/embed/x', agent: null, apiKey: null, visitorId: null, accountId: null }),
    ]
    const { checks } = analyzeFrameMap(frames)
    const sameSite = checks.find(c => /same-site subframe/.test(c))
    expect(sameSite).toContain('https://reports.example.com')
    expect(sameSite).not.toContain('youtube')
  })

  it('counts frames that could not be inspected', () => {
    const { frameMap, checks } = analyzeFrameMap([frame({ childFrames: 3 })])
    expect(frameMap.notInspectable).toBe(3)
    expect(checks).toContain('3 frames could not be inspected (sandboxed, restricted or still loading).')
  })

  it('adds a note on the Launcher routes', () => {
    expect(analyzeFrameMap([frame()], { validationPath: 'launcher-cdp' }).frameMap.note).toMatch(/isolated world/)
    expect(analyzeFrameMap([frame()], { validationPath: 'page' }).frameMap.note).toBeNull()
  })
})

describe('network classification', () => {
  it('classifies Pendo request kinds', () => {
    expect(classifyPendoRequest(`https://cdn.pendo.io/agent/static/${KEY_A}/pendo.js`)).toBe('agent')
    expect(classifyPendoRequest(`https://data.pendo.io/data/ptm.gif/${KEY_A}`)).toBe('events')
    expect(classifyPendoRequest(`https://data.pendo.io/data/guide.js/${KEY_A}`)).toBe('guides')
    expect(classifyPendoRequest(`https://data.pendo.io/data/poll.gif/${KEY_A}`)).toBe('polls')
    expect(classifyPendoRequest(`https://data.pendo.io/data/recordingconf/${KEY_A}`)).toBe('replay')
    expect(classifyPendoRequest('https://app.pendo.io/whatever')).toBe('other')
    expect(classifyPendoRequest('not a url')).toBe('other')
  })

  it('describes why a request failed', () => {
    expect(describeNetworkFailure({ blockedReason: 'csp' }).code).toBe('csp')
    expect(describeNetworkFailure({ errorText: 'net::ERR_BLOCKED_BY_CSP' }).code).toBe('csp')
    expect(describeNetworkFailure({ blockedReason: 'mixed-content' }).code).toBe('mixed-content')
    expect(describeNetworkFailure({ errorText: 'net::ERR_BLOCKED_BY_CLIENT', canceled: true }).code).toBe('client')
    expect(describeNetworkFailure({ corsError: 'MissingAllowOriginHeader' }).code).toBe('cors')
    expect(describeNetworkFailure({ errorText: 'net::ERR_ABORTED', canceled: true })).toBeNull()
    expect(describeNetworkFailure({ errorText: 'net::ERR_NAME_NOT_RESOLVED' }).code).toBe('failed')
    expect(describeNetworkFailure({ status: 403 }).text).toBe('returned HTTP 403')
    expect(describeNetworkFailure({ status: 200 })).toBeNull()
  })

  it('groups requests by kind in display order', () => {
    const groups = groupNetworkRequests({ requests: [
      { url: `https://data.pendo.io/data/ptm.gif/${KEY_A}`, status: 200 },
      { url: `https://cdn.pendo.io/agent/static/${KEY_A}/pendo.js`, status: 200 },
      { url: `https://data.pendo.io/data/ptm.gif/${KEY_A}`, status: 500 },
    ] })
    expect(groups.map(g => g.kind)).toEqual(['agent', 'events'])
    expect(groups[1]).toMatchObject({ total: 2, label: 'event data' })
    expect(groups[1].failures).toHaveLength(1)
  })
})

describe('buildNetworkFindings', () => {
  it('reports a blocked agent script as an error', () => {
    const { advice } = buildNetworkFindings({ requests: [
      { url: `https://cdn.pendo.io/agent/static/${KEY_A}/pendo.js`, blockedReason: 'csp' },
    ] })
    expect(advice).toHaveLength(1)
    expect(advice[0]).toMatchObject({ severity: 'error', supportKey: 'csp' })
    expect(advice[0].text).toContain("blocked by the page's Content Security Policy")
  })

  it('reports other failed requests as warnings', () => {
    const { advice } = buildNetworkFindings({ requests: [
      { url: `https://cdn.pendo.io/agent/static/${KEY_A}/pendo.js`, status: 200 },
      { url: `https://data.pendo.io/data/ptm.gif/${KEY_A}`, errorText: 'net::ERR_BLOCKED_BY_CLIENT' },
      { url: `https://data.pendo.io/data/ptm.gif/${KEY_A}`, status: 200 },
    ] })
    expect(advice).toHaveLength(1)
    expect(advice[0]).toMatchObject({ severity: 'warn', supportKey: 'troubleshooting' })
    expect(advice[0].text).toMatch(/^1 of 2 event data requests was blocked by the browser or an extension/)
  })

  it('passes when every request succeeded', () => {
    const { advice, checks } = buildNetworkFindings({ requests: [
      { url: `https://cdn.pendo.io/agent/static/${KEY_A}/pendo.js`, status: 200 },
      { url: `https://data.pendo.io/data/ptm.gif/${KEY_A}`, status: 200 },
    ] })
    expect(advice).toEqual([])
    expect(checks[0]).toContain('all 2 Pendo requests completed')
  })

  it('treats no event data in the capture window as informational', () => {
    const { advice, checks } = buildNetworkFindings({ requests: [
      { url: `https://cdn.pendo.io/agent/static/${KEY_A}/pendo.js`, status: 200 },
    ] })
    expect(advice).toEqual([])
    expect(checks.some(c => /no event data/.test(c))).toBe(true)
  })

  it('notes an empty or truncated capture', () => {
    expect(buildNetworkFindings({ requests: [] }).checks).toContain('Network capture: no Pendo requests were made while the page reloaded.')
    const truncated = buildNetworkFindings({ requests: [{ url: `https://data.pendo.io/data/ptm.gif/${KEY_A}`, status: 200 }], requestCount: 250, truncated: true })
    expect(truncated.checks.some(c => /only the first 1 of 250/.test(c))).toBe(true)
  })
})

describe('appendDiagnosticsToResult', () => {
  const subframeOnlyFrames = [
    frame({ agent: null, apiKey: null, visitorId: null, accountId: null, childFrames: 1 }),
    frame({ frameId: 4, isTop: false, url: 'https://embed.example.com/app' }),
  ]

  it('attaches the frame map and replaces "not detected" advice when Pendo is only in a subframe', () => {
    const res = {
      status: { pendoPresent: false },
      advice: [
        { text: 'Pendo agent not detected. Check the install snippet.', source: 'builtin', supportKey: 'installGuide' },
        { text: 'No API key detected. Verify the correct agent is loading and that the snippet references your subscription key.', source: 'builtin', supportKey: 'installComponents' },
      ],
      checks: [],
    }
    appendDiagnosticsToResult(res, { frames: subframeOnlyFrames })
    expect(res.frameMap.subframePendoCount).toBe(1)
    expect(res.advice.some(a => a.text.startsWith('Pendo agent not detected.'))).toBe(false)
    expect(res.advice.some(a => a.text.startsWith('No API key detected.'))).toBe(false)
    expect(res.advice.some(a => a.supportKey === 'iframe')).toBe(true)
    expect(hasSubframeOnlyPendo(res)).toBe(true)
  })

  it('stores the network capture and folds in its findings', () => {
    const res = pageResult()
    const nc = { summary: { requests: [{ url: `https://cdn.pendo.io/agent/static/${KEY_A}/pendo.js`, status: 404 }] }, har: { log: {} }, entryCount: 1, ts: 123 }
    appendDiagnosticsToResult(res, { frames: [frame()], networkCapture: nc })
    expect(res.networkCapture).toEqual({ summary: nc.summary, har: nc.har, entryCount: 1, capturedAt: 123 })
    expect(res.advice.some(a => a.severity === 'error' && /HTTP 404/.test(a.text))).toBe(true)
  })

  it('points to the Settings toggle from the no-resources advice when capture is available', () => {
    const res = pageResult({}, { advice: [{ text: 'No Pendo network resources observed yet.', source: 'builtin', supportKey: 'csp' }] })
    appendDiagnosticsToResult(res, { frames: [frame()], networkCaptureAvailable: true })
    expect(res.advice[0].text).toContain('Turn on Network capture in Settings')
    expect(res.networkCapture).toBeUndefined()
  })

  it('removes the healthy check once any advice exists', () => {
    const res = pageResult({ apiKeysSeen: [KEY_A, KEY_B] }, { checks: [HEALTHY, 'visitorId present.'] })
    appendDiagnosticsToResult(res, { frames: [frame()] })
    expect(res.checks).not.toContain(HEALTHY)
    expect(res.checks).toContain('visitorId present.')
  })

  it('keeps the healthy check when nothing was found', () => {
    const res = pageResult({}, { checks: [HEALTHY] })
    appendDiagnosticsToResult(res, { frames: [frame()] })
    expect(res.checks).toContain(HEALTHY)
  })
})

describe('summarizeAgentConfig', () => {
  it('lists only options whose value differs from the SDK default', () => {
    const sum = summarizeAgentConfig({
      reported: true,
      options: [
        { name: 'excludeAllText', value: 'true', source: 'snippet' },
        { name: 'excludeAllText', value: 'false', source: 'pendoconfig' },
        { name: 'annotateUrl', value: 'null', source: 'snippet' },
      ],
      conflicts: [],
    })
    expect(sum.options).toEqual([{ name: 'excludeAllText', value: 'true', source: 'snippet', sourceLabel: 'snippet' }])
    expect(sum.hiddenAsDefault).toBe(2)
  })

  it('formats conflict lines with human-readable sources', () => {
    const sum = summarizeAgentConfig({
      reported: true,
      options: [{ name: 'disableCookies', value: 'true', source: 'pendoconfig' }],
      conflicts: [{
        name: 'disableCookies',
        values: [{ value: 'true', source: 'snippet' }, { value: 'false', source: 'pendoconfig' }],
      }],
    })
    expect(sum.conflicts[0].detail).toContain('(snippet)')
    expect(sum.conflicts[0].detail).toContain('(hosted config)')
  })

  it('returns reported false when capture did not produce a config audit', () => {
    expect(summarizeAgentConfig({ reported: false })).toEqual({ reported: false, options: [], hiddenAsDefault: 0, conflicts: [] })
  })
})

describe('DIAG_CONFIG_DEFAULTS drift', () => {
  it('matches the pinned @pendo/web-sdk ConfigReader defaults', () => {
    const sdk = parseSdkConfigDefaults()
    expect(Object.keys(DIAG_CONFIG_DEFAULTS).sort()).toEqual(Object.keys(sdk).sort())
    for (const [name, raw] of Object.entries(sdk)) {
      expect(DIAG_CONFIG_DEFAULTS[name]).toEqual(sdkDefaultLiteralToJs(raw))
    }
  })
})

describe('networkCaptureMatchesPage', () => {
  const nc = { summary: { documentUrl: 'https://app.example.com/home', requests: [] } }

  it('matches the same origin only', () => {
    expect(networkCaptureMatchesPage(nc, 'https://app.example.com/other?x=1')).toBe(true)
    expect(networkCaptureMatchesPage(nc, 'https://evil.example.org/')).toBe(false)
    expect(networkCaptureMatchesPage(nc, undefined)).toBe(false)
  })

  it('accepts a summary without a document URL but not a missing summary', () => {
    expect(networkCaptureMatchesPage({ summary: { requests: [] } }, 'https://x.test/')).toBe(true)
    expect(networkCaptureMatchesPage({}, 'https://x.test/')).toBe(false)
    expect(networkCaptureMatchesPage(null, 'https://x.test/')).toBe(false)
  })
})

describe('subframe hero state', () => {
  const frameMap = { available: true, subframePendoCount: 2 }

  it('applies only when the top page has no agent and the Launcher did not validate', () => {
    expect(deriveSubframeHeroState({ status: { pendoPresent: false }, frameMap })).toEqual({
      state: 'warn', title: 'Pendo found in a subframe', sub: 'Not on the top page; found in 2 subframes.',
    })
    expect(deriveSubframeHeroState({ status: { pendoPresent: true }, frameMap })).toBeNull()
    expect(deriveSubframeHeroState({ status: { pendoPresent: false }, frameMap, launcherDataValidated: true })).toBeNull()
    expect(deriveSubframeHeroState({ status: { pendoPresent: false }, frameMap: { available: true, subframePendoCount: 0 } })).toBeNull()
  })
})

describe('report helpers', () => {
  const context = {
    status: {
      pendoPresent: true, version: '2.341.0', visitorAnonymous: true,
      agentScripts: [{ src: 'https://cdn.pendo.io/agent/static/k/pendo.js', apiKey: KEY_A }],
      apiKeysSeen: [KEY_A, KEY_B], otherAgentApiKey: KEY_B,
      environment: envOk({
        errorCount: 2, errors: ['first error', 'second error'],
        methods: [{ type: 'JSON', names: ['stringify'] }, { type: 'Date | Prototype', names: ['toJSON'] }],
        globals: ['Pendo has detected that window.Event has been modified'],
        url: [{ type: 'sanitizedUrl', msg: 'Sanitized', value: 'https://app.example.com/' }],
        plugins: ['guides', 'replay'],
      }),
    },
    frameMap: {
      available: true, inspected: 2, notInspectable: 1, subframePendoCount: 1, topHasAgent: true, note: null,
      frames: [
        frame(),
        frame({ frameId: 2, isTop: false, url: 'https://embed.partner.test/x', visitorId: 'sub-visitor', accountId: 'sub-account', apiKey: KEY_B }),
      ],
    },
    networkCapture: {
      summary: {
        documentUrl: 'https://app.example.com/home',
        documentCsp: { enforce: ["script-src 'self'"], reportOnly: [] },
        requests: [
          { url: `https://cdn.pendo.io/agent/static/${KEY_A}/pendo.js`, method: 'GET', status: 200 },
          { url: `https://data.pendo.io/data/ptm.gif/${KEY_A}`, method: 'POST', blockedReason: 'csp' },
        ],
        requestCount: 2,
      },
      har: { log: { entries: [] } },
    },
  }

  it('collects frame identities, keys and hosts for Share redaction', () => {
    const secrets = collectDiagnosticsSecrets(context)
    expect(secrets).toEqual(expect.arrayContaining([KEY_A, KEY_B, 'sub-visitor', 'sub-account', 'embed.partner.test', 'app.example.com']))
  })

  it('builds the Markdown metadata keys', () => {
    expect(buildDiagnosticsMetadata(context)).toEqual({
      visitorAnonymous: true,
      agentScriptCount: 1,
      agentScripts: ['https://cdn.pendo.io/agent/static/k/pendo.js'],
      apiKeysSeen: [KEY_A, KEY_B],
      environmentCheck: 'available',
      agentErrorCount: 2,
      agentPlugins: ['guides', 'replay'],
      framesInspected: 2,
      framesNotInspectable: 1,
      subframePendo: 1,
      networkCapture: true,
      agentConfigNonDefault: 0,
    })
  })

  it('describes a frame on one line', () => {
    expect(describeFrame(frame({ anonymous: true, visitorId: '_PENDO_T_x' })).detail)
      .toBe(`pendo 2.341.0 · key ${KEY_A} · visitor _PENDO_T_x (anonymous) · account a1 · ready · 3 data requests`)
    expect(describeFrame(frame({ agent: null })).detail).toBe('No Pendo')
  })

  it('writes the Agent environment, Frames and Network sections', () => {
    const md = buildDiagnosticsMarkdownSections(context).join('\n')
    expect(md).toContain('## Agent environment')
    expect(md).toContain('### Config options (non-default)')
    expect(md).toContain('Not reported by this agent version.')
    expect(md).toContain('### Error history (2)')
    expect(md).toContain('- second error')
    expect(md).toContain('- JSON.stringify **(can break Pendo)**')
    expect(md).toContain('- Date.prototype.toJSON')
    expect(md).toContain('- Pendo has detected that window.Event has been modified')
    expect(md).toContain('- sanitizedUrl: Sanitized `https://app.example.com/`')
    expect(md).toContain('guides, replay')
    expect(md).toContain('## Frames')
    expect(md).toContain('- **Subframe** https://embed.partner.test/x')
    expect(md).toContain('1 frame could not be inspected.')
    expect(md).toContain('## Network')
    expect(md).toContain('2 Pendo requests captured while the page reloaded.')
    expect(md).toContain(`- **events** POST https://data.pendo.io/data/ptm.gif/${KEY_A} — blocked by the page's Content Security Policy`)
    expect(md).toContain("enforced: script-src 'self'")
  })

  it('says when the environment check or network capture did not run', () => {
    const md = buildDiagnosticsMarkdownSections({ status: {} }).join('\n')
    expect(md).toContain('Environment check not run (no agent on the page).')
    expect(md).toContain('Frame map unavailable.')
    expect(md).toContain('Network capture not run (turn on in Settings; Chrome/Edge only).')
    const unavailable = buildDiagnosticsMarkdownSections({ status: { version: '2.100.0', environment: { available: false } } }).join('\n')
    expect(unavailable).toContain('Environment check not available on agent 2.100.0.')
  })
})

describe('diagnostics.js boundaries', () => {
  const extDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension')

  // The panel's own window.pendo is the self-instrumentation agent; checks must run on the page's.
  it('never calls a Pendo agent validation method from panel-side code', () => {
    const agentCall = /\b(?:pendo|Pendo|agent)\s*\.\s*(?:validateEnvironment|validateInstall|validateNativeMethods|validateBuiltInGlobals|isSendingEvents|isReady|getVisitorId|getAccountId)\s*\(/g
    // Line-local: a match in a comment line, after //, or inside an open quote is prose, not a call.
    const isProse = (line, idx) => {
      const before = line.slice(0, idx)
      if (/^\s*(?:\*|\/\/|\/\*)/.test(line) || before.includes('//')) return true
      const odd = (ch) => (before.split(ch).length - 1) % 2 === 1
      return odd("'") || odd('"') || odd('`')
    }
    const calls = (src) => src.split('\n').flatMap((line, i) =>
      [...line.matchAll(agentCall)].filter(m => !isProse(line, m.index)).map(m => `${i + 1}: ${m[0]}`))
    expect(calls('const r = pendo.validateEnvironment(true); // pendo.validateInstall()')).toHaveLength(1)
    for (const file of ['diagnostics.js', 'popup.js']) {
      expect(calls(readFileSync(join(extDir, file), 'utf8')), file).toEqual([])
    }
  })

  it('declares only functions and DIAG_ vars at the top level', () => {
    const src = readFileSync(join(extDir, 'diagnostics.js'), 'utf8')
    const topLevel = src.split('\n').filter(l => /^(?:var|let|const|class)\s/.test(l))
    for (const line of topLevel) expect(line).toMatch(/^var DIAG_/)
  })
})
