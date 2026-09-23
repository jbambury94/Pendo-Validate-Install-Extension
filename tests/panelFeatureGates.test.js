import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

// Boots the real popup.html with the real panel scripts, so this covers what the unit suites
// cannot: that a closed gate actually leaves the UI absent, and that opening one reveals it.
const extDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension')
const read = (name) => readFileSync(join(extDir, name), 'utf8')

const popupHtml = read('popup.html')
const FEATURE_REGISTRY = JSON.parse(read('feature-flags.json'))

function neutralizePopup(src) {
  return src
    // the self-instrumentation IIFE would try to load the Pendo agent
    .replace('(async function initPendoWithStoredVisitor() {', '(async function initPendoWithStoredVisitor() { return;')
}

/**
 * Stand up a panel with the given stored values, run initPopup(), and wait for the gate resolution
 * promise chain to settle.
 */
async function bootPanel({ overrides = {}, stored = {}, hasDebugger = true } = {}) {
  // runScripts is required for window.eval to run inside this window's realm. The <script src>
  // tags in popup.html are skipped, since jsdom does not fetch external resources by default —
  // each panel script is eval'd below in the order popup.html declares it.
  const dom = new JSDOM(popupHtml, { url: 'https://app.example.com/', runScripts: 'dangerously' })
  const { window } = dom

  const storage = Object.assign({ featureOverrides: overrides }, stored)
  const onChangedListeners = []
  const chromeStub = {
    storage: {
      local: {
        get: vi.fn((defaults, cb) => {
          const merged = {}
          for (const [key, fallback] of Object.entries(defaults || {})) {
            merged[key] = key in storage ? storage[key] : fallback
          }
          if (cb) cb(merged)
          return Promise.resolve(merged)
        }),
        set: vi.fn((data, cb) => {
          Object.assign(storage, data)
          const changes = {}
          for (const key of Object.keys(data)) changes[key] = { newValue: data[key] }
          if (cb) cb()
          for (const fn of onChangedListeners) fn(changes, 'local')
        }),
        remove: vi.fn((_keys, cb) => { if (cb) cb() }),
      },
      onChanged: { addListener: (fn) => onChangedListeners.push(fn) },
    },
    runtime: {
      id: 'test-ext',
      getURL: (path) => `chrome-extension://test-ext/${path}`,
      getManifest: () => ({ version: '1.9.0' }),
      sendMessage: vi.fn((_msg, cb) => { if (cb) cb({ ok: true }) }),
      onMessage: { addListener: vi.fn() },
      lastError: null,
    },
    tabs: { query: vi.fn(async () => []), sendMessage: vi.fn() },
    scripting: { executeScript: vi.fn(async () => []) },
    management: { getAll: vi.fn((cb) => cb([])) },
  }
  if (hasDebugger) chromeStub.debugger = { attach: vi.fn(), detach: vi.fn(), sendCommand: vi.fn(), onEvent: { addListener: vi.fn(), removeListener: vi.fn() } }

  window.chrome = chromeStub
  window.console.table = () => { /* list() prints a table; keep the test output readable */ }
  window.fetch = vi.fn(async (url) => {
    if (String(url).includes('feature-flags.json')) {
      return { ok: true, status: 200, json: async () => FEATURE_REGISTRY }
    }
    return { ok: true, status: 200, text: async () => '' }
  })

  for (const file of ['pendo-kb.js', 'pendo-telemetry.js', 'feature-flags.js', 'har-capture.js']) {
    window.eval(read(file))
  }
  window.eval(neutralizePopup(read('popup.js')))

  // initPopup() resolves gates through two awaited promises before applying them.
  await new Promise((resolve) => window.setTimeout(resolve, 0))
  await new Promise((resolve) => window.setTimeout(resolve, 0))

  return { window, document: window.document, storage, chromeStub }
}

const visible = (el) => !!el && !el.hidden

beforeEach(() => {
  vi.clearAllMocks()
})

describe('panel with every gate closed (the shipped default)', () => {
  it('shows no HAR button and no AI advice card', async () => {
    const { document } = await bootPanel()

    expect(visible(document.getElementById('downloadHar'))).toBe(false)
    expect(visible(document.getElementById('aiAdviceCard'))).toBe(false)
  })

  it('leaves the rest of the panel untouched', async () => {
    const { document } = await bootPanel()

    expect(visible(document.getElementById('downloadLogs'))).toBe(true)
    expect(visible(document.getElementById('copyLogs'))).toBe(true)
    expect(visible(document.getElementById('run'))).toBe(true)
    expect(visible(document.getElementById('themeSelect'))).toBe(true)
    expect(visible(document.getElementById('sharingCard'))).toBe(true)
  })

  it('never reads the stored API key, so a closed gate leaves it untouched at rest', async () => {
    const { chromeStub } = await bootPanel({ stored: { aiApiKey: 'sk-secret', aiProvider: 'openai' } })

    const readKeys = chromeStub.storage.local.get.mock.calls.flatMap(([defaults]) => Object.keys(defaults || {}))
    expect(readKeys).not.toContain('aiApiKey')
  })

  it('keeps the stored API key in place rather than purging it', async () => {
    const { storage } = await bootPanel({ stored: { aiApiKey: 'sk-secret' } })

    expect(storage.aiApiKey).toBe('sk-secret')
  })
})

describe('panel with gates opened by a local override', () => {
  it('reveals the HAR button', async () => {
    const { document } = await bootPanel({ overrides: { harDownload: true } })

    const har = document.getElementById('downloadHar')
    expect(visible(har)).toBe(true)
    // Still disabled until a validation has produced a context to capture against.
    expect(har.disabled).toBe(true)
    expect(har.title).toBe('Run a validation first')
  })

  it('reveals the AI advice card and populates it from stored settings', async () => {
    const { document } = await bootPanel({
      overrides: { aiAdvice: true },
      stored: { aiApiKey: 'sk-secret', aiProvider: 'gemini' },
    })

    expect(visible(document.getElementById('aiAdviceCard'))).toBe(true)
    expect(document.getElementById('aiApiKeyInput').value).toBe('sk-secret')
    expect(document.getElementById('aiProviderSelect').value).toBe('gemini')
  })

  it('opens one gate without opening the other', async () => {
    const { document } = await bootPanel({ overrides: { harDownload: true } })

    expect(visible(document.getElementById('downloadHar'))).toBe(true)
    expect(visible(document.getElementById('aiAdviceCard'))).toBe(false)
  })
})

describe('__pendoValidateFeatures console helper', () => {
  it('is exposed on the panel window', async () => {
    const { window } = await bootPanel()

    expect(typeof window.__pendoValidateFeatures.enable).toBe('function')
    expect(typeof window.__pendoValidateFeatures.list).toBe('function')
    expect(typeof window.__pendoValidateFeatures.reset).toBe('function')
  })

  it('reports each gate, its state, and where the value came from', async () => {
    const { window } = await bootPanel({ overrides: { harDownload: true } })

    const rows = window.__pendoValidateFeatures.list()
    expect(rows).toHaveLength(3)
    expect(rows.find((r) => r.key === 'harDownload')).toMatchObject({ enabled: true, source: 'local override' })
    expect(rows.find((r) => r.key === 'aiAdvice')).toMatchObject({ enabled: false, source: 'shipped default' })
  })

  it('enable() reveals the gated UI without an extension reload', async () => {
    const { window, document } = await bootPanel()
    expect(visible(document.getElementById('downloadHar'))).toBe(false)

    await window.__pendoValidateFeatures.enable('harDownload')

    expect(visible(document.getElementById('downloadHar'))).toBe(true)
  })

  it('disable() hides it again', async () => {
    const { window, document } = await bootPanel({ overrides: { aiAdvice: true } })
    expect(visible(document.getElementById('aiAdviceCard'))).toBe(true)

    await window.__pendoValidateFeatures.disable('aiAdvice')

    expect(visible(document.getElementById('aiAdviceCard'))).toBe(false)
  })

  it('reset() drops every override and returns to the shipped defaults', async () => {
    const { window, document, storage } = await bootPanel({ overrides: { harDownload: true, aiAdvice: true } })

    await window.__pendoValidateFeatures.reset()

    expect(storage.featureOverrides).toEqual({})
    expect(visible(document.getElementById('downloadHar'))).toBe(false)
    expect(visible(document.getElementById('aiAdviceCard'))).toBe(false)
  })

  it('rejects an unknown key instead of writing it to storage', async () => {
    const { window, storage } = await bootPanel()
    const error = vi.spyOn(window.console, 'error').mockImplementation(() => {})

    expect(await window.__pendoValidateFeatures.enable('harDownlaod')).toBeNull()

    expect(error).toHaveBeenCalledWith(expect.stringContaining('Unknown feature "harDownlaod"'))
    expect(storage.featureOverrides).toEqual({})
  })

  it('reports each state change as a feature_flag_toggled Track Event, including reset()', async () => {
    const { window } = await bootPanel()
    const tracked = []
    window.pendo = { track: (name, props) => tracked.push({ name, props }) }

    await window.__pendoValidateFeatures.enable('harDownload')
    await window.__pendoValidateFeatures.reset()

    expect(tracked.map((t) => t.name)).toEqual(['feature_flag_toggled', 'feature_flag_toggled'])
    expect(tracked[0].props).toMatchObject({ ivaFeatureKey: 'harDownload', ivaFeatureEnabled: true })
    expect(tracked[1].props).toMatchObject({ ivaFeatureKey: 'harDownload', ivaFeatureEnabled: false })
  })

  it('reports nothing when a call leaves every gate where it was', async () => {
    const { window } = await bootPanel()
    const tracked = []
    window.pendo = { track: (name) => tracked.push(name) }

    await window.__pendoValidateFeatures.disable('harDownload')

    expect(tracked).toEqual([])
  })

  it('warns rather than silently failing when a gate needs an unavailable capability', async () => {
    const { window } = await bootPanel({ hasDebugger: false })
    const warn = vi.spyOn(window.console, 'warn').mockImplementation(() => {})

    await window.__pendoValidateFeatures.enable('cspProbe')

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cspProbe'))
    expect(window.__pendoValidateFeatures.list().find((r) => r.key === 'cspProbe').enabled).toBe(false)
  })
})

describe('panel when feature-flags.json cannot be read', () => {
  it('keeps every gate closed rather than falling back to defaults', async () => {
    const dom = new JSDOM(popupHtml, { url: 'https://app.example.com/', runScripts: 'dangerously' })
    const { window } = dom
    window.chrome = {
      storage: {
        local: {
          get: vi.fn((defaults, cb) => { if (cb) cb(Object.assign({}, defaults, { featureOverrides: { harDownload: true, aiAdvice: true } })) }),
          set: vi.fn((_d, cb) => { if (cb) cb() }),
          remove: vi.fn((_k, cb) => { if (cb) cb() }),
        },
        onChanged: { addListener: vi.fn() },
      },
      runtime: { id: 'x', getURL: (p) => p, getManifest: () => ({ version: '1.9.0' }), sendMessage: vi.fn(), onMessage: { addListener: vi.fn() } },
      tabs: { query: vi.fn(async () => []) },
      scripting: { executeScript: vi.fn(async () => []) },
    }
    window.fetch = vi.fn(async () => ({ ok: false, status: 404 }))

    for (const file of ['pendo-kb.js', 'pendo-telemetry.js', 'feature-flags.js', 'har-capture.js']) {
      window.eval(read(file))
    }
    window.eval(neutralizePopup(read('popup.js')))
    await new Promise((resolve) => window.setTimeout(resolve, 0))
    await new Promise((resolve) => window.setTimeout(resolve, 0))

    expect(visible(window.document.getElementById('downloadHar'))).toBe(false)
    expect(visible(window.document.getElementById('aiAdviceCard'))).toBe(false)
  })
})
