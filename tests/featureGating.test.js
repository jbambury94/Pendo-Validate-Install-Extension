import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { FEATURE_REGISTRY } from './setup.js'

const extDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension')

// popup.html loads har-capture.js before popup.js; the Resource Timing path calls into it.
vm.runInThisContext(readFileSync(join(extDir, 'har-capture.js'), 'utf8'))

// Exercises the gates in the shipped popup.js rather than the tests/helpers.js mirror, so the
// gating cannot drift out of the file that actually runs. Same Function-wrapper approach as
// tests/executeScript.test.js: load the real source, neutralize its two top-level side effects,
// and return the functions under test.
const popupSrc = readFileSync(join(extDir, 'popup.js'), 'utf8')

function loadPopupGating() {
  const neutralized = popupSrc
    .replace('(async function initPendoWithStoredVisitor() {', '(async function initPendoWithStoredVisitor() { return;')
    .replace('initPopup();', ';')
  const factory = new Function(
    'chrome', 'browser', 'fetch', 'setTimeout', 'clearTimeout',
    `${neutralized}\nreturn { requestAiAdvice, captureNetworkHar, refreshFeatureState, featureEnabled };`,
  )
  return factory(global.chrome, global.browser, global.fetch, setTimeout, clearTimeout)
}

/** Serve feature-flags.json from the given registry; hand everything else to the test's fetch mock. */
function serveRegistry(registry) {
  const upstream = global.fetch
  global.fetch = vi.fn(async (url, opts) => {
    if (String(url).includes('feature-flags.json')) {
      return { ok: true, status: 200, json: async () => registry }
    }
    return upstream(url, opts)
  })
  return global.fetch
}

function storageReturning(values) {
  chrome.storage.local.get.mockImplementation((defaults, cb) => {
    const merged = Object.assign({}, defaults, values)
    if (cb) cb(merged)
    return Promise.resolve(merged)
  })
}

const AI_CONFIGURED = { aiProvider: 'openai', aiEndpoint: '', aiClaudeEndpoint: '', aiApiKey: 'sk-test', aiModel: '' }

const validationContext = {
  pageUrl: 'https://example.com',
  status: { version: '2.341.0', validatePresent: true, pendoPresent: true, visitorId: 'v1', accountId: 'a1' },
  apiKeyFound: true,
  cspMeta: '',
  captured: [],
  advice: [],
  checks: [],
}

beforeEach(() => {
  global.fetch = vi.fn()
  global.browser = undefined
  chrome.debugger = undefined
})

describe('AI advice gate (real popup.js)', () => {
  it('makes no provider request when the gate is closed, even with a key saved', async () => {
    storageReturning(AI_CONFIGURED)
    const registryFetch = serveRegistry(FEATURE_REGISTRY)
    const api = loadPopupGating()
    await api.refreshFeatureState()

    expect(await api.requestAiAdvice(validationContext)).toEqual([])
    const providerCalls = registryFetch.mock.calls.filter(([url]) => !String(url).includes('feature-flags.json'))
    expect(providerCalls).toEqual([])
  })

  it('returns no advice items at all, so nothing renders an "AI suggestion unavailable" row', async () => {
    storageReturning(AI_CONFIGURED)
    serveRegistry(FEATURE_REGISTRY)
    const api = loadPopupGating()
    await api.refreshFeatureState()

    // A provider error would normally surface an advice item; the gate must short-circuit first.
    global.fetch.mockRejectedValue(new Error('should never be called'))
    expect(await api.requestAiAdvice(validationContext)).toEqual([])
  })

  it('calls the provider once a local override opens the gate', async () => {
    storageReturning(Object.assign({ featureOverrides: { aiAdvice: true } }, AI_CONFIGURED))
    const registryFetch = serveRegistry(FEATURE_REGISTRY)
    registryFetch.mockImplementation(async (url) => {
      if (String(url).includes('feature-flags.json')) {
        return { ok: true, status: 200, json: async () => FEATURE_REGISTRY }
      }
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '- Fix the snippet' } }] }) }
    })
    const api = loadPopupGating()
    await api.refreshFeatureState()

    const advice = await api.requestAiAdvice(validationContext)
    expect(advice).toHaveLength(1)
    expect(advice[0]).toMatchObject({ source: 'ai' })
    expect(registryFetch).toHaveBeenCalledWith(
      expect.stringContaining('openai.com'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('stays closed before the state has resolved, so a slow registry read cannot leak a request', async () => {
    storageReturning(Object.assign({ featureOverrides: { aiAdvice: true } }, AI_CONFIGURED))
    serveRegistry(FEATURE_REGISTRY)
    const api = loadPopupGating()

    // No refreshFeatureState() yet — this is the window between panel load and gate resolution.
    expect(api.featureEnabled('aiAdvice')).toBe(false)
    expect(await api.requestAiAdvice(validationContext)).toEqual([])
  })

  it('stays closed when feature-flags.json cannot be read', async () => {
    storageReturning(Object.assign({ featureOverrides: { aiAdvice: true } }, AI_CONFIGURED))
    global.fetch = vi.fn(async () => ({ ok: false, status: 404 }))
    const api = loadPopupGating()
    await api.refreshFeatureState()

    expect(api.featureEnabled('aiAdvice')).toBe(false)
    expect(await api.requestAiAdvice(validationContext)).toEqual([])
  })
})

describe('HAR download gate (real popup.js)', () => {
  it('refuses and never messages the service worker when the gate is closed', async () => {
    storageReturning({})
    serveRegistry(FEATURE_REGISTRY)
    chrome.debugger = { attach: vi.fn() }
    const api = loadPopupGating()
    await api.refreshFeatureState()

    const res = await api.captureNetworkHar(7, 'https://app.example.com/')
    expect(res).toEqual({ ok: false, message: 'HAR download is not enabled' })
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })

  it('hands off to the service worker once the gate is open on a CDP-capable browser', async () => {
    storageReturning({ featureOverrides: { harDownload: true } })
    serveRegistry(FEATURE_REGISTRY)
    chrome.debugger = { attach: vi.fn() }
    chrome.runtime.sendMessage.mockImplementation((_msg, cb) => { cb({ ok: true, started: true }) })
    const api = loadPopupGating()
    await api.refreshFeatureState()

    const res = await api.captureNetworkHar(7, 'https://app.example.com/')
    expect(res).toEqual({ ok: true, pendingReload: true })
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'pendo-validate-har-capture', tabId: 7 }),
      expect.any(Function),
    )
  })

  it('takes the Resource Timing path when the gate is open without a debugger API', async () => {
    storageReturning({ featureOverrides: { harDownload: true } })
    serveRegistry(FEATURE_REGISTRY)
    chrome.scripting.executeScript.mockResolvedValue([{ result: { timeOrigin: 1_000, entries: [] } }])
    const api = loadPopupGating()
    await api.refreshFeatureState()

    const res = await api.captureNetworkHar(7, 'https://app.example.com/')
    expect(res.ok).toBe(true)
    expect(res.mode).toBe('timings')
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })

  it('stays open on Firefox, where HAR falls back to Resource Timing rather than requiring CDP', async () => {
    storageReturning({ featureOverrides: { harDownload: true } })
    serveRegistry(FEATURE_REGISTRY)
    const api = loadPopupGating()
    await api.refreshFeatureState()

    expect(api.featureEnabled('harDownload')).toBe(true)
  })
})

describe('cspProbe gate (real popup.js)', () => {
  it('is registered but unreferenced, so the unbuilt feature cannot ship switched on', async () => {
    storageReturning({ featureOverrides: { cspProbe: true } })
    serveRegistry(FEATURE_REGISTRY)
    chrome.debugger = { attach: vi.fn() }
    const api = loadPopupGating()
    await api.refreshFeatureState()

    // The gate resolves, so the future implementation has somewhere to hang...
    expect(api.featureEnabled('cspProbe')).toBe(true)
    // ...but nothing in the shipped panel reads it yet.
    expect(popupSrc).not.toContain("'cspProbe'")
  })

  it('cannot be opened on a build without the debugger permission', async () => {
    storageReturning({ featureOverrides: { cspProbe: true } })
    serveRegistry(FEATURE_REGISTRY)
    const api = loadPopupGating()
    await api.refreshFeatureState()

    expect(api.featureEnabled('cspProbe')).toBe(false)
  })
})
