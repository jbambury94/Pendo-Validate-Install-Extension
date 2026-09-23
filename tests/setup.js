import { vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const extDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension')

// feature-flags.js loads before popup.js in the panel and is importScripts'd by the service worker,
// so define its globals for every suite too. Several suites load popup.js/background.js through a
// `new Function` wrapper, where a missing global is a ReferenceError rather than a skipped feature.
// Runs once per test file (setupFiles are per-file); re-running would redeclare its top-level const.
vm.runInThisContext(readFileSync(join(extDir, 'feature-flags.js'), 'utf8'))

export const FEATURE_REGISTRY = JSON.parse(
  readFileSync(join(extDir, 'feature-flags.json'), 'utf8'),
)

/** Stand in for fetch('…/feature-flags.json'), so gate resolution works in tests. */
export function featureRegistryFetchStub(registry = FEATURE_REGISTRY) {
  return vi.fn(async (url) => {
    if (String(url).includes('feature-flags.json')) {
      return { ok: true, status: 200, json: async () => registry }
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' }
  })
}

/** Build a registry with the named gates forced on, for tests that exercise gated behaviour. */
export function registryWithEnabled(...keys) {
  const out = structuredClone(FEATURE_REGISTRY)
  for (const key of keys) {
    if (out[key]) out[key].default = true
  }
  return out
}

// Chrome Extension API stub — reset between tests via vi.clearAllMocks()
global.chrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn((keys, cb) => { if (cb) cb() }),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  scripting: {
    executeScript: vi.fn(),
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
  },
  windows: {
    getAll: vi.fn(),
  },
  permissions: {
    contains: vi.fn(),
  },
  management: {
    getAll: vi.fn(),
  },
  identity: {
    getProfileUserInfo: vi.fn((_opts, cb) => cb({ email: '', id: '' })),
  },
  runtime: {
    getURL: vi.fn((path) => `chrome-extension://test-ext/${path}`),
    onMessage: { addListener: vi.fn() },
    sendMessage: vi.fn(),
    lastError: null,
  },
  action: {
    onClicked: { addListener: vi.fn() },
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  // set.mockImplementation so callers that omit a callback don't throw
  chrome.storage.local.set.mockImplementation((_data, cb) => { if (cb) cb() })
  // get echoes the requested defaults, so callback-form readers (feature overrides, theme) resolve
  // instead of hanging on a bare vi.fn(). Suites that care override this.
  chrome.storage.local.get.mockImplementation((defaults, cb) => {
    const value = defaults && typeof defaults === 'object' && !Array.isArray(defaults) ? defaults : {}
    if (cb) cb(value)
    return Promise.resolve(value)
  })
})
