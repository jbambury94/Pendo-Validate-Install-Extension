import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { evaluateInLauncherWorld, enableDebuggingViaLauncherCdp } from './helpers.js'

const TAB_ID = 42
const LAUNCHER_ID = 'abc123launcher'
const TARGET = { tabId: TAB_ID }
const LAUNCHER_ORIGIN = `chrome-extension://${LAUNCHER_ID}`

function installDebuggerMock({ contexts = [], evaluateResult = { result: { value: 99 } } } = {}) {
  let eventHandler = null
  global.chrome.debugger = {
    attach: vi.fn().mockResolvedValue(undefined),
    detach: vi.fn().mockResolvedValue(undefined),
    sendCommand: vi.fn(async (_target, method) => {
      if (method === 'Runtime.enable' && eventHandler) {
        for (const context of contexts) {
          eventHandler({ tabId: TAB_ID }, 'Runtime.executionContextCreated', { context })
        }
      }
      if (method === 'Runtime.evaluate') return evaluateResult
      return {}
    }),
    onEvent: {
      addListener: vi.fn((fn) => { eventHandler = fn }),
      removeListener: vi.fn((fn) => { if (eventHandler === fn) eventHandler = null }),
    },
  }
}

// ── evaluateInLauncherWorld ───────────────────────────────────────────────────

describe('evaluateInLauncherWorld', () => {
  let savedDebugger

  beforeEach(() => {
    vi.useFakeTimers()
    savedDebugger = global.chrome.debugger
    installDebuggerMock({
      contexts: [{ id: 7, origin: LAUNCHER_ORIGIN }],
      evaluateResult: { result: { value: 99 } },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    global.chrome.debugger = savedDebugger
  })

  it('returns no-debugger-api when chrome.debugger is missing', async () => {
    delete global.chrome.debugger
    const result = await evaluateInLauncherWorld(TAB_ID, LAUNCHER_ID, '1+1')
    expect(result).toEqual({ ok: false, reason: 'no-debugger-api' })
  })

  it('returns attach-failed when attach throws', async () => {
    chrome.debugger.attach.mockRejectedValue(new Error('Cannot attach'))
    const result = await evaluateInLauncherWorld(TAB_ID, LAUNCHER_ID, '1+1')
    expect(result).toEqual({ ok: false, reason: 'attach-failed', message: 'Cannot attach' })
  })

  it('returns no-launcher-context when no matching execution context', async () => {
    installDebuggerMock({ contexts: [{ id: 1, origin: 'chrome-extension://other' }] })
    const promise = evaluateInLauncherWorld(TAB_ID, LAUNCHER_ID, '1+1')
    await vi.runAllTimersAsync()
    const result = await promise
    expect(result).toEqual({ ok: false, reason: 'no-launcher-context' })
    expect(chrome.debugger.detach).toHaveBeenCalledWith(TARGET)
  })

  it('returns ok: true with evaluated value on success', async () => {
    const promise = evaluateInLauncherWorld(TAB_ID, LAUNCHER_ID, '1+1')
    await vi.runAllTimersAsync()
    const result = await promise
    expect(result).toEqual({ ok: true, value: 99 })
    expect(chrome.debugger.attach).toHaveBeenCalledWith(TARGET, '1.3')
    expect(chrome.debugger.sendCommand).toHaveBeenCalledWith(TARGET, 'Runtime.evaluate', {
      expression: '1+1',
      contextId: 7,
      returnByValue: true,
    })
    expect(chrome.debugger.detach).toHaveBeenCalledWith(TARGET)
  })

  it('returns eval-exception when Runtime.evaluate reports exceptionDetails', async () => {
    installDebuggerMock({
      contexts: [{ id: 7, origin: LAUNCHER_ORIGIN }],
      evaluateResult: { exceptionDetails: { text: 'ReferenceError: x is not defined' } },
    })
    const promise = evaluateInLauncherWorld(TAB_ID, LAUNCHER_ID, 'x')
    await vi.runAllTimersAsync()
    const result = await promise
    expect(result).toEqual({
      ok: false,
      reason: 'eval-exception',
      message: 'ReferenceError: x is not defined',
    })
  })
})

// ── enableDebuggingViaLauncherCdp ───────────────────────────────────────────────

describe('enableDebuggingViaLauncherCdp', () => {
  let savedDebugger

  beforeEach(() => {
    vi.useFakeTimers()
    savedDebugger = global.chrome.debugger
    installDebuggerMock({
      contexts: [{ id: 7, origin: LAUNCHER_ORIGIN }],
      evaluateResult: { result: { value: { ok: true } } },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    global.chrome.debugger = savedDebugger
  })

  it('returns page debugger result on happy path', async () => {
    const promise = enableDebuggingViaLauncherCdp(TAB_ID, { id: LAUNCHER_ID })
    await vi.runAllTimersAsync()
    const result = await promise
    expect(result).toEqual({ ok: true })
  })

  it('returns Chrome/Edge message when debugger API is unavailable', async () => {
    delete global.chrome.debugger
    const result = await enableDebuggingViaLauncherCdp(TAB_ID, { id: LAUNCHER_ID })
    expect(result).toEqual({
      ok: false,
      message: 'Launcher debugger requires Chrome or Edge (CDP not available in this browser).',
    })
  })

  it('returns re-run validation message when launcher context is missing', async () => {
    installDebuggerMock({ contexts: [] })
    const promise = enableDebuggingViaLauncherCdp(TAB_ID, { id: LAUNCHER_ID })
    await vi.runAllTimersAsync()
    const result = await promise
    expect(result).toEqual({
      ok: false,
      message: 'Pendo Launcher agent context not found on this tab. Re-run validation first.',
    })
  })
})
