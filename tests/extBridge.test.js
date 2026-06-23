import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { _extRuntime, _localPrivilegedApi, sendExtMessage, tabsQuery } from './helpers.js'

// The Firefox popup.html iframe has no local tabs/scripting APIs, so privileged calls are
// routed to the background via runtime.sendMessage. On Firefox both `chrome` and `browser`
// exist but only `browser.*` is promise-based; awaiting chrome.runtime.sendMessage there
// returns undefined. These tests guard the browser-first bridge in popup.js (mirrored in
// helpers.js). The shared setup.js stub gives chrome local tabs/scripting, so tests that
// exercise the background bridge must strip them to emulate the iframe context.
function simulateIframeNoLocalApis() {
  chrome.tabs = undefined
  chrome.scripting = undefined
}

describe('extension messaging bridge — Firefox dual namespace', () => {
  let savedTabs, savedScripting
  beforeEach(() => {
    savedTabs = chrome.tabs
    savedScripting = chrome.scripting
  })
  afterEach(() => {
    chrome.tabs = savedTabs
    chrome.scripting = savedScripting
    delete global.browser
  })

  it('sendExtMessage resolves via promise-based browser.runtime, not callback chrome.runtime', async () => {
    // Simulate Firefox: chrome.* is callback-based and returns undefined when awaited.
    chrome.runtime.sendMessage.mockReturnValue(undefined)
    global.browser = {
      runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: true, tabs: [{ id: 1 }] }) },
    }

    const res = await sendExtMessage({ type: 'pendo-validate-tabs-query', queryInfo: {} })

    expect(res).toEqual({ ok: true, tabs: [{ id: 1 }] })
    expect(global.browser.runtime.sendMessage).toHaveBeenCalledOnce()
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })

  it('tabsQuery returns the background tabs through the browser.runtime bridge', async () => {
    simulateIframeNoLocalApis()
    const tabs = [{ id: 7, active: true }]
    global.browser = {
      runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: true, tabs }) },
    }

    await expect(tabsQuery({ active: true, currentWindow: true })).resolves.toEqual(tabs)
    expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'pendo-validate-tabs-query',
      queryInfo: { active: true, currentWindow: true },
    })
  })

  it('_extRuntime prefers browser.runtime when both namespaces exist', () => {
    global.browser = { runtime: { id: 'ff' } }
    expect(_extRuntime()).toBe(global.browser.runtime)
  })

  it('_localPrivilegedApi prefers the browser namespace when both expose tabs/scripting', () => {
    global.browser = { tabs: { query: vi.fn() }, scripting: { executeScript: vi.fn() } }
    expect(_localPrivilegedApi()).toBe(global.browser)
  })
})

describe('extension messaging bridge — Chromium (chrome only)', () => {
  let savedTabs, savedScripting
  beforeEach(() => {
    savedTabs = chrome.tabs
    savedScripting = chrome.scripting
  })
  afterEach(() => {
    chrome.tabs = savedTabs
    chrome.scripting = savedScripting
  })

  it('sendExtMessage promisifies the chrome.runtime callback form', async () => {
    // No global.browser (Chromium). chrome.runtime.sendMessage is callback-based here.
    chrome.runtime.sendMessage.mockImplementation((_msg, cb) => cb({ ok: true, tabs: [{ id: 9 }] }))

    const res = await sendExtMessage({ type: 'pendo-validate-tabs-query', queryInfo: {} })

    expect(res).toEqual({ ok: true, tabs: [{ id: 9 }] })
    expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce()
    expect(typeof chrome.runtime.sendMessage.mock.calls[0][1]).toBe('function')
  })

  it('sendExtMessage rejects with chrome.runtime.lastError', async () => {
    chrome.runtime.sendMessage.mockImplementation((_msg, cb) => {
      chrome.runtime.lastError = { message: 'message port closed' }
      cb(undefined)
      chrome.runtime.lastError = null
    })

    await expect(sendExtMessage({ type: 'x' })).rejects.toThrow('message port closed')
  })

  it('tabsQuery surfaces a failed background response as an error', async () => {
    simulateIframeNoLocalApis()
    chrome.runtime.sendMessage.mockImplementation((_msg, cb) => cb({ ok: false, error: 'denied' }))
    await expect(tabsQuery({})).rejects.toThrow('denied')
  })
})
