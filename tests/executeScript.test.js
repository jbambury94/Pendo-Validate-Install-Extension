import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// popup.js is a classic script with top-level side effects (a self-instrumentation IIFE and the
// initPopup() bootstrap), so it can't be imported. Load the real source through a Function wrapper
// (the tests/background.test.js pattern), neutralize those two side effects, and expose the bridge
// functions — so these tests exercise the shipped popup.js code, not a mirror.
const popupSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'popup.js'),
  'utf8',
)

function loadPopupExports() {
  const neutralized = popupSrc
    // stop the self-instrumentation IIFE from running its body at load
    .replace('(async function initPendoWithStoredVisitor() {', '(async function initPendoWithStoredVisitor() { return;')
    // stop the DOMContentLoaded bootstrap from calling initPopup() (no panel DOM in the test)
    .replace('initPopup();', ';')
  const factory = new Function(
    'chrome', 'browser', 'fetch', 'setTimeout', 'clearTimeout',
    `${neutralized}\nreturn { executeScript, injectScriptFileAndRun, loadExtensionScriptText };`,
  )
  // A fresh instance per call resets the module-level _injectedWorlds and _scriptTextCache.
  return factory(global.chrome, global.browser, global.fetch, setTimeout, clearTimeout)
}

// ── executeScript: invoke-only world cache + self-heal (Chrome/Edge local scripting API) ──────────
describe('executeScript — invoke-only world cache (local scripting API)', () => {
  const CAPTURE = { target: { tabId: 5 }, world: 'MAIN', injectedScript: 'capture-inspect', args: ['combined'] }

  it('first run injects the file then invokes, and caches the world', async () => {
    chrome.scripting.executeScript.mockResolvedValue([{ result: { status: { pendoPresent: true } } }])
    const api = loadPopupExports()

    const out = await api.executeScript({ ...CAPTURE })

    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(2)
    expect(chrome.scripting.executeScript.mock.calls[0][0]).toMatchObject({
      target: { tabId: 5 }, world: 'MAIN', files: ['capture-inspect.js'],
    })
    const invoke = chrome.scripting.executeScript.mock.calls[1][0]
    expect(invoke.files).toBeUndefined()
    expect(typeof invoke.func).toBe('function')
    expect(invoke.args).toEqual(['combined'])
    expect(out).toEqual([{ result: { status: { pendoPresent: true } } }])
  })

  it('repeat run for the same world skips the file injection (invoke-only)', async () => {
    chrome.scripting.executeScript.mockResolvedValue([{ result: { ok: true } }])
    const api = loadPopupExports()

    await api.executeScript({ ...CAPTURE })
    chrome.scripting.executeScript.mockClear()
    await api.executeScript({ ...CAPTURE })

    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(1)
    expect(chrome.scripting.executeScript.mock.calls[0][0].files).toBeUndefined()
    expect(typeof chrome.scripting.executeScript.mock.calls[0][0].func).toBe('function')
  })

  it('self-heals when the invoke-only attempt returns an undefined result (world was reset)', async () => {
    chrome.scripting.executeScript.mockResolvedValue([{ result: { ok: true } }])
    const api = loadPopupExports()

    await api.executeScript({ ...CAPTURE }) // cache the world (2 calls)
    chrome.scripting.executeScript.mockClear()
    chrome.scripting.executeScript
      .mockResolvedValueOnce([{ result: undefined }]) // invoke-only attempt: global gone
      .mockResolvedValue([{ result: { ok: true } }])  // re-injection: file + invoke

    const out = await api.executeScript({ ...CAPTURE })

    // 1 invoke-only attempt + 2 (file + invoke) re-injection
    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(3)
    expect(chrome.scripting.executeScript.mock.calls[1][0].files).toEqual(['capture-inspect.js'])
    expect(out).toEqual([{ result: { ok: true } }])
  })

  it('self-heals when invoke-only returns a stale combined capture shape (pre-revision page global)', async () => {
    chrome.scripting.executeScript.mockResolvedValue([{ result: { status: { pendoPresent: true } } }])
    const api = loadPopupExports()

    await api.executeScript({ ...CAPTURE }) // cache the world (2 calls)
    chrome.scripting.executeScript.mockClear()
    chrome.scripting.executeScript
      .mockResolvedValueOnce([{ result: { status: { pendoPresent: true, validatePresent: true } } }]) // stale: no snippetGlobalPresent
      .mockResolvedValue([{ result: { status: { pendoPresent: true, snippetGlobalPresent: true, launcherGlobalPresent: false } } }])

    const out = await api.executeScript({ ...CAPTURE })

    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(3)
    expect(chrome.scripting.executeScript.mock.calls[1][0].files).toEqual(['capture-inspect.js'])
    expect(out[0].result.status.snippetGlobalPresent).toBe(true)
  })

  it('self-heals when the invoke-only attempt throws (world was reset)', async () => {
    chrome.scripting.executeScript.mockResolvedValue([{ result: { ok: true } }])
    const api = loadPopupExports()

    await api.executeScript({ ...CAPTURE }) // cache the world (2 calls)
    chrome.scripting.executeScript.mockClear()
    chrome.scripting.executeScript
      .mockRejectedValueOnce(new Error('No frame with given id')) // invoke-only attempt throws
      .mockResolvedValue([{ result: { ok: true } }])              // re-injection: file + invoke

    const out = await api.executeScript({ ...CAPTURE })

    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(3)
    expect(chrome.scripting.executeScript.mock.calls[1][0].files).toEqual(['capture-inspect.js'])
    expect(out).toEqual([{ result: { ok: true } }])
  })

  it('treats a different tabId as a separate world and re-injects', async () => {
    chrome.scripting.executeScript.mockResolvedValue([{ result: { ok: true } }])
    const api = loadPopupExports()

    await api.executeScript({ target: { tabId: 1 }, injectedScript: 'capture-inspect', args: ['combined'] })
    chrome.scripting.executeScript.mockClear()
    await api.executeScript({ target: { tabId: 2 }, injectedScript: 'capture-inspect', args: ['combined'] })

    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(2)
    expect(chrome.scripting.executeScript.mock.calls[0][0].files).toEqual(['capture-inspect.js'])
  })

  it('caches enable-debugging independently of capture-inspect on the same tab', async () => {
    chrome.scripting.executeScript.mockResolvedValue([{ result: { ok: true } }])
    const api = loadPopupExports()

    await api.executeScript({ target: { tabId: 5 }, injectedScript: 'capture-inspect', args: ['combined'] })
    chrome.scripting.executeScript.mockClear()
    // Different injectedScript -> different key -> full injection (2 calls), not an invoke-only skip.
    await api.executeScript({ target: { tabId: 5 }, injectedScript: 'enable-debugging' })

    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(2)
    expect(chrome.scripting.executeScript.mock.calls[0][0].files).toEqual(['enable-debugging.js'])
  })
})

// ── executeScript: background bridge route (Firefox iframe — no local scripting API) ──────────────
describe('executeScript — background bridge route (no local scripting API)', () => {
  let savedTabs, savedScripting
  beforeEach(() => {
    savedTabs = chrome.tabs
    savedScripting = chrome.scripting
  })
  afterEach(() => {
    chrome.tabs = savedTabs
    chrome.scripting = savedScripting
  })

  it('routes through sendExtMessage carrying invokeOnly (false first, true on the cached repeat)', async () => {
    chrome.tabs = undefined
    chrome.scripting = undefined
    chrome.runtime.sendMessage.mockImplementation((_msg, cb) => cb({ ok: true, results: [{ result: { ok: true } }] }))
    const api = loadPopupExports()

    const details = { target: { tabId: 3 }, injectedScript: 'capture-inspect', args: ['combined'] }
    await api.executeScript({ ...details })
    expect(chrome.runtime.sendMessage.mock.calls[0][0]).toMatchObject({
      type: 'pendo-validate-execute-script',
      injectedScript: 'capture-inspect',
      args: ['combined'],
      invokeOnly: false,
    })

    await api.executeScript({ ...details })
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2)
    expect(chrome.runtime.sendMessage.mock.calls[1][0]).toMatchObject({ invokeOnly: true })
  })
})

// ── loadExtensionScriptText: memoize the fetched file text ─────────────────────────────────────────
describe('loadExtensionScriptText — caches fetched script text', () => {
  it('fetches once and reuses the cached text on later calls', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => 'SCRIPT_TEXT' })
    const api = loadPopupExports()

    const first = await api.loadExtensionScriptText('capture-inspect.js')
    const second = await api.loadExtensionScriptText('capture-inspect.js')

    expect(first).toBe('SCRIPT_TEXT')
    expect(second).toBe('SCRIPT_TEXT')
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(chrome.runtime.getURL).toHaveBeenCalledWith('capture-inspect.js')
  })

  it('does not cache a failed fetch, so a later call retries', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValue({ ok: true, text: async () => 'OK' })
    const api = loadPopupExports()

    await expect(api.loadExtensionScriptText('enable-debugging.js')).rejects.toThrow(/Failed to load/)
    const retry = await api.loadExtensionScriptText('enable-debugging.js')

    expect(retry).toBe('OK')
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})
