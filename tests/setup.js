import { vi, beforeEach } from 'vitest'

// Chrome Extension API stub — reset between tests via vi.clearAllMocks()
global.chrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
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
})
