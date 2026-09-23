import { describe, it, expect, vi, beforeEach } from 'vitest'

function loadBackgroundHandler() {
  const { readFileSync } = require('fs')
  const { join } = require('path')
  const extDir = join(__dirname, '..', 'extension')
  const harCaptureSrc = readFileSync(join(extDir, 'har-capture.js'), 'utf8')
  const importScripts = (name) => {
    if (name === 'har-capture.js') new Function(harCaptureSrc)()
  }
  const src = readFileSync(join(extDir, 'background.js'), 'utf8')
  const wrappedSrc = src.replace('chrome.action.onClicked.addListener', '/* skip */ void ')
  const fn = new Function('chrome', 'fetch', 'setTimeout', 'clearTimeout', 'AbortController', 'importScripts', wrappedSrc)
  fn(chrome, global.fetch, setTimeout, clearTimeout, AbortController, importScripts)
}

function stubHarDebuggerApis() {
  chrome.debugger = {
    attach: vi.fn((_target, _version, cb) => { if (cb) cb() }),
    detach: vi.fn((_target, cb) => { if (cb) cb() }),
    sendCommand: vi.fn((_target, _method, _params, cb) => { if (cb) cb({}) }),
    onEvent: { addListener: vi.fn(), removeListener: vi.fn() },
  }
  chrome.tabs.reload = vi.fn((_tabId, _opts, cb) => { if (cb) cb() })
  chrome.runtime.getManifest = vi.fn(() => ({ version: '1.9.0' }))
}

describe('background.js — AI fetch proxy', () => {
  let handler

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
    stubHarDebuggerApis()

    chrome.runtime.onMessage.addListener.mockImplementation((fn) => { handler = fn })

    loadBackgroundHandler()
  })

  it('registers a message listener', () => {
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledOnce()
    expect(typeof handler).toBe('function')
  })

  it('ignores messages with wrong type', () => {
    const sendResponse = vi.fn()
    const result = handler({ type: 'other' }, { id: chrome.runtime.id }, sendResponse)
    expect(result).toBeUndefined()
    expect(sendResponse).not.toHaveBeenCalled()
  })

  it('ignores messages from other extensions', () => {
    const sendResponse = vi.fn()
    const result = handler(
      { type: 'pendo-validate-ai-fetch' },
      { id: 'different-extension-id' },
      sendResponse
    )
    expect(result).toBeUndefined()
    expect(sendResponse).not.toHaveBeenCalled()
  })

  it('returns true for async sendResponse', () => {
    const result = handler(
      { type: 'pendo-validate-ai-fetch', endpoint: 'https://api.test/v1', headers: {}, body: '{}', timeoutMs: 5000 },
      { id: chrome.runtime.id },
      vi.fn()
    )
    expect(result).toBe(true)
  })

  it('sends successful response with parsed JSON', async () => {
    const payload = { content: [{ text: 'advice' }] }
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(payload),
    })

    const sendResponse = vi.fn()
    handler(
      { type: 'pendo-validate-ai-fetch', endpoint: 'https://api.test/v1', headers: { 'Content-Type': 'application/json' }, body: '{}', timeoutMs: 5000 },
      { id: chrome.runtime.id },
      sendResponse
    )

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    const response = sendResponse.mock.calls[0][0]
    expect(response.ok).toBe(true)
    expect(response.status).toBe(200)
    expect(response.json).toEqual(payload)
  })

  it('returns json: null when response body is empty', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    })

    const sendResponse = vi.fn()
    handler(
      { type: 'pendo-validate-ai-fetch', endpoint: 'https://api.test/v1', headers: {}, body: '{}', timeoutMs: 5000 },
      { id: chrome.runtime.id },
      sendResponse
    )

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    expect(sendResponse.mock.calls[0][0].json).toBeNull()
  })

  it('returns json: null when response is not valid JSON', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'not json',
    })

    const sendResponse = vi.fn()
    handler(
      { type: 'pendo-validate-ai-fetch', endpoint: 'https://api.test/v1', headers: {}, body: '{}', timeoutMs: 5000 },
      { id: chrome.runtime.id },
      sendResponse
    )

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    expect(sendResponse.mock.calls[0][0].json).toBeNull()
    expect(sendResponse.mock.calls[0][0].ok).toBe(true)
  })

  it('forwards non-ok status from upstream', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: 'invalid key' } }),
    })

    const sendResponse = vi.fn()
    handler(
      { type: 'pendo-validate-ai-fetch', endpoint: 'https://api.test/v1', headers: {}, body: '{}', timeoutMs: 5000 },
      { id: chrome.runtime.id },
      sendResponse
    )

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    const response = sendResponse.mock.calls[0][0]
    expect(response.ok).toBe(false)
    expect(response.status).toBe(401)
    expect(response.json.error.message).toBe('invalid key')
  })

  it('returns error: "network" on fetch rejection', async () => {
    fetch.mockRejectedValue(new Error('Failed to fetch'))

    const sendResponse = vi.fn()
    handler(
      { type: 'pendo-validate-ai-fetch', endpoint: 'https://api.test/v1', headers: {}, body: '{}', timeoutMs: 5000 },
      { id: chrome.runtime.id },
      sendResponse
    )

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    const response = sendResponse.mock.calls[0][0]
    expect(response.ok).toBe(false)
    expect(response.status).toBe(0)
    expect(response.error).toBe('network')
    expect(response.message).toContain('Failed to fetch')
  })

  it('returns error: "timeout" on AbortError', async () => {
    fetch.mockRejectedValue(new DOMException('Aborted', 'AbortError'))

    const sendResponse = vi.fn()
    handler(
      { type: 'pendo-validate-ai-fetch', endpoint: 'https://api.test/v1', headers: {}, body: '{}', timeoutMs: 5000 },
      { id: chrome.runtime.id },
      sendResponse
    )

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    const response = sendResponse.mock.calls[0][0]
    expect(response.ok).toBe(false)
    expect(response.error).toBe('timeout')
  })

  it('passes correct endpoint and headers to fetch', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200, text: async () => '{}' })

    const sendResponse = vi.fn()
    const headers = { 'x-api-key': 'test-key', 'Content-Type': 'application/json' }
    handler(
      { type: 'pendo-validate-ai-fetch', endpoint: 'https://custom.api/messages', headers, body: '{"model":"test"}', timeoutMs: 5000 },
      { id: chrome.runtime.id },
      sendResponse
    )

    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toBe('https://custom.api/messages')
    expect(opts.method).toBe('POST')
    expect(opts.headers['x-api-key']).toBe('test-key')
    expect(opts.body).toBe('{"model":"test"}')
  })
})

describe('background.js — Firefox privileged-API bridge', () => {
  let handler
  const sender = { id: 'anything' }

  beforeEach(() => {
    vi.clearAllMocks()
    chrome.runtime.lastError = null
    stubHarDebuggerApis()
    chrome.runtime.onMessage.addListener.mockImplementation((fn) => { handler = fn })

    loadBackgroundHandler()
  })

  it('pendo-validate-tabs-query forwards to chrome.tabs.query and returns the tabs', async () => {
    const tabs = [{ id: 7, active: true }]
    chrome.tabs.query.mockResolvedValue(tabs)

    const sendResponse = vi.fn()
    const queryInfo = { active: true, currentWindow: true }
    const ret = handler({ type: 'pendo-validate-tabs-query', queryInfo }, sender, sendResponse)

    expect(ret).toBe(true)
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    expect(chrome.tabs.query).toHaveBeenCalledWith(queryInfo)
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, tabs })
  })

  it('pendo-validate-tabs-query reports failure when the query rejects', async () => {
    chrome.tabs.query.mockRejectedValue(new Error('no tabs'))

    const sendResponse = vi.fn()
    handler({ type: 'pendo-validate-tabs-query', queryInfo: {} }, sender, sendResponse)

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'no tabs' })
  })

  it('pendo-validate-execute-script injects capture-inspect.js, then invokes it', async () => {
    const results = [{ result: { status: { pendoPresent: true } } }]
    chrome.scripting.executeScript.mockResolvedValue(results)

    const sendResponse = vi.fn()
    const target = { tabId: 7 }
    const ret = handler(
      { type: 'pendo-validate-execute-script', injectedScript: 'capture-inspect', target, world: 'MAIN', args: ['page'] },
      sender,
      sendResponse,
    )

    expect(ret).toBe(true)
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(2)
    expect(chrome.scripting.executeScript).toHaveBeenNthCalledWith(1, { target, world: 'MAIN', files: ['capture-inspect.js'] })
    const invokeCall = chrome.scripting.executeScript.mock.calls[1][0]
    expect(invokeCall.target).toEqual(target)
    expect(invokeCall.world).toBe('MAIN')
    expect(invokeCall.args).toEqual(['page'])
    expect(typeof invokeCall.func).toBe('function')
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, results })
  })

  it('pendo-validate-execute-script injects enable-debugging.js, then invokes it', async () => {
    const results = [{ result: { ok: true } }]
    chrome.scripting.executeScript.mockResolvedValue(results)

    const sendResponse = vi.fn()
    const target = { tabId: 9 }
    handler({ type: 'pendo-validate-execute-script', injectedScript: 'enable-debugging', target }, sender, sendResponse)

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    expect(chrome.scripting.executeScript).toHaveBeenNthCalledWith(1, { target, world: 'MAIN', files: ['enable-debugging.js'] })
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, results })
  })

  it('pendo-validate-execute-script injects har-timings.js, then invokes it', async () => {
    const results = [{ result: { timeOrigin: 1, entries: [] } }]
    chrome.scripting.executeScript.mockResolvedValue(results)

    const sendResponse = vi.fn()
    const target = { tabId: 11 }
    handler({ type: 'pendo-validate-execute-script', injectedScript: 'har-timings', target, world: 'MAIN' }, sender, sendResponse)

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    expect(chrome.scripting.executeScript).toHaveBeenNthCalledWith(1, { target, world: 'MAIN', files: ['har-timings.js'] })
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, results })
  })

  it('pendo-validate-execute-script with invokeOnly skips the file injection and only invokes', async () => {
    const results = [{ result: { status: { pendoPresent: true } } }]
    chrome.scripting.executeScript.mockResolvedValue(results)

    const sendResponse = vi.fn()
    const target = { tabId: 7 }
    handler(
      { type: 'pendo-validate-execute-script', injectedScript: 'capture-inspect', target, world: 'MAIN', args: ['combined'], invokeOnly: true },
      sender,
      sendResponse,
    )

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(1)
    const onlyCall = chrome.scripting.executeScript.mock.calls[0][0]
    expect(onlyCall.files).toBeUndefined()
    expect(typeof onlyCall.func).toBe('function')
    expect(onlyCall.args).toEqual(['combined'])
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, results })
  })

  it('pendo-validate-execute-script rejects an unknown injectedScript', async () => {
    const sendResponse = vi.fn()
    handler({ type: 'pendo-validate-execute-script', injectedScript: 'bogus', target: { tabId: 1 } }, sender, sendResponse)

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'Unknown injectedScript: bogus' })
  })

  it('pendo-validate-execute-script reports failure when injection throws', async () => {
    chrome.scripting.executeScript.mockRejectedValue(new Error('inject blocked'))

    const sendResponse = vi.fn()
    handler(
      { type: 'pendo-validate-execute-script', injectedScript: 'capture-inspect', target: { tabId: 1 }, args: ['page'] },
      sender,
      sendResponse,
    )

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'inject blocked' })
  })

  it('pendo-validate-check-reopen-panel returns reopen when flag matches sender tab', async () => {
    chrome.storage.local.get.mockImplementation(() => Promise.resolve({
      ivaReopenPanel: { tabId: 5, expires: Date.now() + 60000 },
    }));
    chrome.storage.local.remove.mockImplementation(() => Promise.resolve());
    const sendResponse = vi.fn();
    handler({ type: 'pendo-validate-check-reopen-panel' }, { tab: { id: 5 } }, sendResponse);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(sendResponse.mock.calls[0][0]).toEqual({ ok: true, reopen: true });
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('ivaReopenPanel');
  })

  it('pendo-validate-har-capture acknowledges immediately and starts background capture', () => {
    const sendResponse = vi.fn()
    const ret = handler(
      { type: 'pendo-validate-har-capture', tabId: 42, pageUrl: 'https://app.example.com/' },
      { id: chrome.runtime.id },
      sendResponse,
    )
    expect(ret).toBe(true)
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, started: true })
  })

  it('pendo-validate-management-get-all returns the installed extension list', async () => {
    const extensions = [{ id: 'abc', enabled: true, name: 'Pendo Launcher' }]
    chrome.management.getAll.mockImplementation((cb) => cb(extensions))

    const sendResponse = vi.fn()
    const ret = handler({ type: 'pendo-validate-management-get-all' }, sender, sendResponse)

    expect(ret).toBe(true)
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, extensions })
  })

  it('pendo-validate-management-get-all surfaces chrome.runtime.lastError', async () => {
    chrome.management.getAll.mockImplementation((cb) => {
      chrome.runtime.lastError = { message: 'denied' }
      cb(null)
    })

    const sendResponse = vi.fn()
    handler({ type: 'pendo-validate-management-get-all' }, sender, sendResponse)

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'denied' })
  })
})
