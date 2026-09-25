import { describe, it, expect } from 'vitest'
import {
  deriveHeroState,
  buildMarkdownReport,
  buildJsonReport,
  buildPlainSummary,
  normalizeAdviceList,
  classifyAdvice,
  assessInstallQuality,
  appendQualityAdviceToResult,
} from './helpers.js'

const KEY_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const KEY_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'

const subframeOnlyFrameMap = {
  available: true, inspected: 2, notInspectable: 0, subframeCount: 1, subframePendoCount: 1, topHasAgent: false, note: null,
  frames: [
    { frameId: 0, url: 'https://app.example.com/home', isTop: true, agent: null, apiKey: null, visitorId: null, accountId: null, anonymous: false, ready: null, dataRequests: 0, childFrames: 1 },
    { frameId: 4, url: 'https://embed.partner.test/app', isTop: false, agent: 'pendo', version: '2.341.0', apiKey: KEY_B, visitorId: 'frame-visitor', accountId: 'frame-account', anonymous: false, ready: true, dataRequests: 2, childFrames: 0 },
  ],
}

function context(overrides) {
  return {
    pageUrl: 'https://app.example.com/home',
    timestamp: '2026-09-25T10:00:00.000Z',
    status: { pendoPresent: true, validatePresent: true, version: '2.341.0', detectedApiKey: KEY_A, visitorId: 'v1', accountId: 'a1', resourceHits: [] },
    captured: [],
    advice: [],
    checks: [],
    apiKeyFound: true,
    snippetOnPage: true,
    launcherPresent: false,
    launcherAttempted: false,
    validatedIn: 'page',
    ...overrides,
  }
}

describe('Pendo found only in a subframe', () => {
  const ctx = context({
    status: { pendoPresent: false, validatePresent: false },
    snippetOnPage: false,
    launcherPresent: false,
    launcherAttempted: true,
    frameMap: subframeOnlyFrameMap,
  })

  it('shows a warning hero instead of "Install not detected"', () => {
    expect(deriveHeroState(ctx)).toEqual({ state: 'warn', title: 'Pendo found in a subframe', sub: 'Not on the top page; found in 1 subframe.' })
  })

  it('uses the subframe status line in the Markdown report and Share summary', () => {
    expect(buildMarkdownReport(ctx)).toContain('- **Status:** Pendo found in a subframe')
    expect(buildPlainSummary(ctx)).toMatch(/^Pendo Install Validator — Pendo found in a subframe/)
  })

  it('keeps the existing hero when there is no frame map', () => {
    expect(deriveHeroState({ ...ctx, frameMap: undefined }).title).toBe('Install not detected')
  })

  it('prefers error severity over the subframe-only hero and status lines', () => {
    const blocked = { text: 'The Pendo agent script was blocked.', source: 'builtin', supportKey: 'csp', severity: 'error' }
    const withErr = { ...ctx, advice: [blocked] }
    expect(deriveHeroState(withErr)).toEqual({
      state: 'err',
      title: '1 error',
      sub: 'Validation found errors. Not on the top page; found in 1 subframe.',
    })
    expect(buildMarkdownReport(withErr)).toContain('- **Status:** Errors found')
    expect(buildPlainSummary(withErr)).toMatch(/^Pendo Install Validator — Errors found/)
  })
})

describe('Markdown and JSON reports include the new checks', () => {
  const ctx = context({
    status: {
      ...context().status,
      visitorAnonymous: false,
      agentScripts: [{ src: `https://cdn.pendo.io/agent/static/${KEY_A}/pendo.js`, apiKey: KEY_A }],
      apiKeysSeen: [KEY_A],
      environment: {
        available: true, errorCount: 1, errors: ['Pendo failed to send'], methods: [], globals: [], url: [], plugins: ['guides'],
        config: {
          reported: true,
          options: [
            { name: 'excludeAllText', value: 'true', source: 'snippet' },
            { name: 'disableCookies', value: 'true', source: 'pendoconfig' },
          ],
          conflicts: [{ name: 'disableCookies', values: [{ value: 'true', source: 'snippet' }, { value: 'false', source: 'pendoconfig' }] }],
        },
      },
    },
    frameMap: { ...subframeOnlyFrameMap, topHasAgent: true, frames: [{ ...subframeOnlyFrameMap.frames[0], agent: 'pendo', apiKey: KEY_A }, subframeOnlyFrameMap.frames[1]] },
    networkCapture: {
      summary: { documentUrl: 'https://app.example.com/home', documentCsp: { enforce: [], reportOnly: [] }, requests: [{ url: `https://data.pendo.io/data/ptm.gif/${KEY_A}`, method: 'POST', status: 200 }], requestCount: 1 },
      har: { log: { entries: [{ request: { url: 'https://data.pendo.io/secret-har-entry' } }] } },
      entryCount: 1,
      capturedAt: 1,
    },
  })

  it('adds the diagnostics metadata keys to the Metadata JSON', () => {
    const md = buildMarkdownReport(ctx)
    const json = JSON.parse(md.split('```json\n')[1].split('\n```')[0])
    expect(json).toMatchObject({
      visitorAnonymous: false,
      agentScriptCount: 1,
      apiKeysSeen: [KEY_A],
      environmentCheck: 'available',
      agentErrorCount: 1,
      agentPlugins: ['guides'],
      framesInspected: 2,
      subframePendo: 1,
      networkCapture: true,
      agentConfigNonDefault: 2,
    })
  })

  it('places the Agent environment, Frames and Network sections after Advice', () => {
    const md = buildMarkdownReport(ctx)
    const order = ['## Advice', '## Agent environment', '## Frames', '## Network', '## Captured Output'].map(h => md.indexOf(h))
    expect(order.every(i => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(md).toContain('- Pendo failed to send')
    expect(md).toContain('### Config options (non-default)')
    expect(md).toContain('| excludeAllText | true | snippet |')
    expect(md).toContain('Config conflict — disableCookies')
    expect(md).not.toContain('secret-har-entry')
  })

  it('leaves the raw HAR out of the JSON report but keeps the summary', () => {
    const json = JSON.parse(buildJsonReport(ctx))
    expect(json.networkCapture.har).toBeUndefined()
    expect(json.networkCapture.summary.requests).toHaveLength(1)
    expect(buildJsonReport(ctx)).not.toContain('secret-har-entry')
    expect(ctx.networkCapture.har).toBeTruthy()
  })
})

describe('Share summary redaction covers frame identities', () => {
  it('redacts subframe visitor/account IDs, API keys and hosts when identity is off', () => {
    const ctx = context({
      status: { ...context().status, apiKeysSeen: [KEY_A, KEY_B] },
      frameMap: { ...subframeOnlyFrameMap, topHasAgent: true },
      advice: [{ text: `The subframe at embed.partner.test identifies frame-visitor and frame-account with key ${KEY_B}.`, source: 'builtin', supportKey: 'iframe' }],
    })
    const text = buildPlainSummary(ctx, { includeIdentity: false })
    for (const secret of ['frame-visitor', 'frame-account', KEY_B, 'embed.partner.test']) expect(text).not.toContain(secret)
    expect(buildPlainSummary(ctx, { includeIdentity: true })).toContain('frame-visitor')
  })
})

describe('advice severity', () => {
  it('keeps an explicit severity through normalizeAdviceList and ignores other values', () => {
    const [error, warn, bogus, none] = normalizeAdviceList([
      { text: 'a', supportKey: 'troubleshooting', severity: 'error' },
      { text: 'b', supportKey: 'installComponents', severity: 'warn' },
      { text: 'c', severity: 'critical' },
      { text: 'd' },
    ])
    expect(error.severity).toBe('error')
    expect(warn.severity).toBe('warn')
    expect('severity' in bogus).toBe(false)
    expect('severity' in none).toBe(false)
  })

  it('lets severity override the support-key classification', () => {
    const result = classifyAdvice([
      { text: 'blocked agent', supportKey: 'troubleshooting', severity: 'error' },
      { text: 'duplicate script', supportKey: 'installComponents', severity: 'warn' },
      { text: 'legacy', supportKey: 'installComponents' },
    ], [], [])
    expect(result.err.map(i => i.text)).toEqual(['blocked agent', 'legacy'])
    expect(result.warn.map(i => i.text)).toEqual(['duplicate script'])
  })
})

describe('hero and status lines count the new checks', () => {
  const blocked = { text: 'The Pendo agent script was blocked.', source: 'builtin', supportKey: 'csp', severity: 'error' }
  const duplicate = { text: 'The Pendo agent script is included 2 times.', source: 'builtin', supportKey: 'installComponents', severity: 'warn' }
  const legacy = { text: 'accountId not found.', source: 'builtin', supportKey: 'chooseIdsMetadata' }

  it('turns a clean console with a severity error into an error hero', () => {
    const ctx = context({ advice: [blocked, duplicate] })
    expect(deriveHeroState(ctx)).toEqual({ state: 'err', title: '1 error', sub: 'Validation found errors.' })
    expect(buildMarkdownReport(ctx)).toContain('- **Status:** Errors found')
    expect(buildPlainSummary(ctx)).toMatch(/^Pendo Install Validator — Errors found/)
  })

  it('adds severity warnings to the console warning count', () => {
    const ctx = context({ advice: [duplicate], captured: [{ level: 'warn', text: 'console warning' }] })
    expect(deriveHeroState(ctx)).toMatchObject({ state: 'warn', title: '2 warnings' })
    expect(buildMarkdownReport(ctx)).toContain('- **Status:** Warnings found')
  })

  it('keeps the validateInstall() wording when the console reported errors', () => {
    const ctx = context({ advice: [blocked], captured: [{ level: 'error', text: 'boom' }] })
    expect(deriveHeroState(ctx)).toEqual({ state: 'err', title: '2 errors', sub: 'validateInstall() reported errors.' })
  })

  it('leaves advice without a severity out of the hero, as before', () => {
    const ctx = context({ advice: [legacy] })
    expect(deriveHeroState(ctx).state).toBe('ok')
    expect(buildMarkdownReport(ctx)).toContain('- **Status:** Looks healthy')
  })
})

describe('anonymous visitors in the install quality check', () => {
  const status = { pendoPresent: true, visitorId: '_PENDO_T_abc123', visitorAnonymous: true }

  it('grades an anonymous visitor as poor', () => {
    const quality = assessInstallQuality({ status, pageUrl: 'https://staging.example.com/' })
    expect(quality.visitorId.quality).toBe('poor')
    expect(quality.visitorId.issues[0]).toMatch(/anonymous/)
    expect(quality.environment.issues).toEqual([])
  })

  it('does not add a placeholder or staging recommendation on top of the anonymous one', () => {
    const result = appendQualityAdviceToResult({ status: { ...status }, advice: [] }, 'https://staging.example.com/')
    expect(result.advice.some(a => /placeholder/.test(a.text))).toBe(false)
    expect(result.advice.some(a => /test prefix/.test(a.text))).toBe(false)
  })
})
