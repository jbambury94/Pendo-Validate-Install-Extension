import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'frame-probe.js'), 'utf8')

const SELF_KEY = '928b3d0d-8a3b-48b1-bf35-a6af3565dcc5'
const PAGE_KEY = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const OVERLAY_ID = 'pendo-validate-overlay-iframe'

/** One frame's MAIN world: its own window, location, iframes and resource timing entries. */
function makeFrame({ href = 'https://app.example.com/home?q=1', isTop = true, agent, iframeIds = [], resources = [] } = {}) {
  const url = new URL(href)
  const context = vm.createContext({
    location: { protocol: url.protocol, origin: url.origin, pathname: url.pathname, href: url.href },
    document: { querySelectorAll: () => iframeIds.map(id => ({ id })) },
    performance: { getEntriesByType: (t) => (t === 'resource' ? resources.map(name => ({ name })) : []) },
  })
  context.globalThis = context
  context.window = context
  context.top = isTop ? context : {}
  if (agent) context.pendo = agent
  vm.runInContext(src, context)
  return (opts) => context.__pendoValidateFrameProbe(opts || { selfApiKey: SELF_KEY, overlayIframeId: OVERLAY_ID })
}

function agent(overrides) {
  return {
    apiKey: PAGE_KEY,
    getVersion: () => '2.341.0',
    getVisitorId: () => 'visitor-1',
    getAccountId: () => 'account-1',
    isReady: () => true,
    ...overrides,
  }
}

describe('frame-probe.js', () => {
  it('reports a frame without Pendo', () => {
    const probe = makeFrame({ iframeIds: ['a', 'b'] })
    expect(probe()).toEqual({
      url: 'https://app.example.com/home',
      isTop: true,
      skipped: null,
      agent: null,
      version: null,
      apiKey: null,
      visitorId: null,
      accountId: null,
      anonymous: false,
      ready: null,
      dataRequests: 0,
      childFrames: 2,
    })
  })

  it('reports the agent, identity and readiness in a subframe, without the query string', () => {
    const probe = makeFrame({ href: 'https://embed.example.com/app?token=secret', isTop: false, agent: agent() })
    const out = probe()
    expect(out).toMatchObject({
      url: 'https://embed.example.com/app',
      isTop: false,
      agent: 'pendo',
      version: '2.341.0',
      apiKey: PAGE_KEY,
      visitorId: 'visitor-1',
      accountId: 'account-1',
      anonymous: false,
      ready: true,
    })
    expect(out.url).not.toContain('secret')
  })

  it('reads the API key from agent options and flags anonymous visitors', () => {
    const probe = makeFrame({ agent: agent({ apiKey: undefined, _: { options: { apiKey: PAGE_KEY } }, getVisitorId: () => '_PENDO_T_abc' }) })
    expect(probe()).toMatchObject({ apiKey: PAGE_KEY, anonymous: true, visitorId: '_PENDO_T_abc' })
  })

  it('reports the Launcher global as Pendo', () => {
    const context = vm.createContext({
      location: { protocol: 'https:', origin: 'https://a.test', pathname: '/', href: 'https://a.test/' },
      document: { querySelectorAll: () => [] },
      performance: { getEntriesByType: () => [] },
    })
    context.globalThis = context
    context.window = context
    context.top = context
    context.Pendo = agent()
    vm.runInContext(src, context)
    expect(context.__pendoValidateFrameProbe({}).agent).toBe('Pendo')
  })

  it('skips the extension self-instrumentation agent', () => {
    const probe = makeFrame({ agent: agent({ apiKey: SELF_KEY.toUpperCase() }) })
    expect(probe()).toMatchObject({ skipped: 'self', agent: null, apiKey: null })
  })

  it('skips extension frames', () => {
    const probe = makeFrame({ href: 'chrome-extension://abc/popup.html' })
    expect(probe().skipped).toBe('extension')
  })

  it('does not count the validator overlay iframe as a child frame', () => {
    expect(makeFrame({ iframeIds: [OVERLAY_ID, 'app-frame'] })().childFrames).toBe(1)
  })

  it('counts Pendo data requests but not the self-instrumentation ones', () => {
    const probe = makeFrame({
      agent: agent(),
      resources: [
        `https://data.pendo.io/data/ptm.gif/${PAGE_KEY}?v=1`,
        `https://data.pendo.io/data/guide.gif/${PAGE_KEY}`,
        `https://data.pendo.io/data/ptm.gif/${SELF_KEY}`,
        `https://cdn.pendo.io/agent/static/${PAGE_KEY}/pendo.js`,
        'https://example.com/data/ptm.gif',
      ],
    })
    expect(probe().dataRequests).toBe(2)
  })

  it('keeps going when agent methods throw', () => {
    const boom = () => { throw new Error('boom') }
    const probe = makeFrame({ agent: agent({ getVersion: boom, getVisitorId: boom, getAccountId: boom, isReady: boom }) })
    expect(probe()).toMatchObject({ agent: 'pendo', version: null, visitorId: null, accountId: null, ready: null })
  })

  it('never calls isSendingEvents()', () => {
    let called = false
    makeFrame({ agent: agent({ isSendingEvents: () => { called = true; return true } }) })()
    expect(called).toBe(false)
  })
})
