import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { evaluateInLauncherWorld, enableDebuggingViaLauncherCdp, buildLauncherInvokeExpression, resolveDebuggerRetryResult, LAUNCHER_NOT_CONFIGURED_MESSAGE } from './helpers.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readExtensionFile(name) {
  return readFileSync(join(__dirname, '..', 'extension', name), 'utf8')
}

function fileRevision(src, globalName) {
  return Number(src.match(new RegExp(`globalThis\\.${globalName}Revision = (\\d+);`))[1])
}

const TAB_ID = 42
const LAUNCHER_ID = 'abc123launcher'
const TARGET = { tabId: TAB_ID }
const LAUNCHER_ORIGIN = `chrome-extension://${LAUNCHER_ID}`

const AGENT_PROBE = '!!(window.pendo || window.Pendo)'

function installDebuggerMock({ contexts = [], evaluateResult = { result: { value: 99 } }, agentContextId = null } = {}) {
  let eventHandler = null
  global.chrome.debugger = {
    attach: vi.fn().mockResolvedValue(undefined),
    detach: vi.fn().mockResolvedValue(undefined),
    sendCommand: vi.fn(async (_target, method, params) => {
      if (method === 'Runtime.enable' && eventHandler) {
        for (const context of contexts) {
          eventHandler({ tabId: TAB_ID }, 'Runtime.executionContextCreated', { context })
        }
      }
      if (method === 'Runtime.evaluate') {
        // The agent probe runs before the caller's expression; only agentContextId has it.
        if (params?.expression === AGENT_PROBE) return { result: { value: params.contextId === agentContextId } }
        return evaluateResult
      }
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

  it('evaluates in the launcher frame that hosts the agent, not the first one reported', async () => {
    // The Launcher content script runs in every frame of a multi-frame page, so arrival
    // order says nothing about which isolated world actually holds window.pendo.
    installDebuggerMock({
      contexts: [
        { id: 11, origin: LAUNCHER_ORIGIN, auxData: { frameId: 'frame-a' } },
        { id: 22, origin: LAUNCHER_ORIGIN, auxData: { frameId: 'frame-b' } },
        { id: 33, origin: LAUNCHER_ORIGIN, auxData: { frameId: 'frame-c' } },
      ],
      agentContextId: 22,
    })
    const promise = evaluateInLauncherWorld(TAB_ID, LAUNCHER_ID, '1+1')
    await vi.runAllTimersAsync()
    expect(await promise).toEqual({ ok: true, value: 99 })
    expect(chrome.debugger.sendCommand).toHaveBeenCalledWith(TARGET, 'Runtime.evaluate', {
      expression: '1+1',
      contextId: 22,
      returnByValue: true,
    })
  })

  it('falls back to the first launcher frame when none hosts the agent', async () => {
    installDebuggerMock({
      contexts: [
        { id: 11, origin: LAUNCHER_ORIGIN, auxData: { frameId: 'frame-a' } },
        { id: 22, origin: LAUNCHER_ORIGIN, auxData: { frameId: 'frame-b' } },
      ],
      agentContextId: null,
    })
    const promise = evaluateInLauncherWorld(TAB_ID, LAUNCHER_ID, '1+1')
    await vi.runAllTimersAsync()
    expect(await promise).toEqual({ ok: true, value: 99 })
    expect(chrome.debugger.sendCommand).toHaveBeenCalledWith(TARGET, 'Runtime.evaluate', {
      expression: '1+1',
      contextId: 11,
      returnByValue: true,
    })
  })

  it('does not time out while Runtime.enable is still pending', async () => {
    // Context is emitted only when enable completes after 400ms; a timer armed at t=0
    // would fire at 250ms and falsely return no-launcher-context.
    let eventHandler = null
    global.chrome.debugger = {
      attach: vi.fn().mockResolvedValue(undefined),
      detach: vi.fn().mockResolvedValue(undefined),
      sendCommand: vi.fn(async (_target, method) => {
        if (method === 'Runtime.enable' && eventHandler) {
          await vi.advanceTimersByTimeAsync(400)
          eventHandler({ tabId: TAB_ID }, 'Runtime.executionContextCreated', {
            context: { id: 7, origin: LAUNCHER_ORIGIN },
          })
        }
        if (method === 'Runtime.evaluate') return { result: { value: 99 } }
        return {}
      }),
      onEvent: {
        addListener: vi.fn((fn) => { eventHandler = fn }),
        removeListener: vi.fn((fn) => { if (eventHandler === fn) eventHandler = null }),
      },
    }

    const promise = evaluateInLauncherWorld(TAB_ID, LAUNCHER_ID, '1+1')
    // First pass advances Runtime.enable's 400ms delay; the second flushes the collection
    // timer, which is only armed once enable settles.
    await vi.runAllTimersAsync()
    await vi.runAllTimersAsync()
    expect(await promise).toEqual({ ok: true, value: 99 })
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
      reason: 'no-debugger-api',
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
      reason: 'no-launcher-context',
      message: 'Pendo Launcher agent context not found on this tab. Re-run validation first.',
    })
  })

  it('passes the attach failure reason and message through', async () => {
    chrome.debugger.attach.mockRejectedValue(new Error('Another debugger is already attached to the tab with id: 42.'))
    const result = await enableDebuggingViaLauncherCdp(TAB_ID, { id: LAUNCHER_ID })
    expect(result).toEqual({
      ok: false,
      reason: 'attach-failed',
      message: 'Another debugger is already attached to the tab with id: 42.',
    })
  })

  it("names the Launcher's agent when it is not the lead agent", async () => {
    installDebuggerMock({
      contexts: [{ id: 7, origin: LAUNCHER_ORIGIN }],
      evaluateResult: { result: { value: { ok: false, reason: 'not-leader', message: "This page's Pendo agent isn't the lead agent in this tab, so it didn't start the debugger." } } },
    })
    const promise = enableDebuggingViaLauncherCdp(TAB_ID, { id: LAUNCHER_ID })
    await vi.runAllTimersAsync()
    expect(await promise).toEqual({
      ok: false,
      reason: 'not-leader',
      message: "The Pendo Launcher's agent isn't the lead agent in this tab, so it didn't start the debugger.",
    })
  })

  it('reports the Launcher as not configured when its world has no agent', async () => {
    installDebuggerMock({
      contexts: [{ id: 7, origin: LAUNCHER_ORIGIN }],
      evaluateResult: { result: { value: { ok: false, reason: 'no-agent', message: 'Pendo not found or enableDebugging not available on this page.' } } },
    })
    const promise = enableDebuggingViaLauncherCdp(TAB_ID, { id: LAUNCHER_ID })
    await vi.runAllTimersAsync()
    expect(await promise).toEqual({ ok: false, reason: 'no-agent', message: LAUNCHER_NOT_CONFIGURED_MESSAGE })
  })
})

// ── resolveDebuggerRetryResult ──────────────────────────────────────────────────

describe('resolveDebuggerRetryResult', () => {
  const PAGE_NOT_LEADER = { ok: false, reason: 'not-leader', message: "This page's Pendo agent isn't the lead agent in this tab, so it didn't start the debugger." }
  const PAGE_NO_AGENT = { ok: false, reason: 'no-agent', message: 'Pendo not found or enableDebugging not available on this page.' }
  const PAGE_THREW = { ok: false, message: 'pendo.enableDebugging is broken' }
  const LAUNCHER_NOT_LEADER = { ok: false, reason: 'not-leader', message: "The Pendo Launcher's agent isn't the lead agent in this tab, so it didn't start the debugger." }

  it('returns the Launcher result when the Launcher enabled the debugger', () => {
    expect(resolveDebuggerRetryResult(PAGE_NOT_LEADER, { ok: true })).toEqual({ ok: true })
  })

  const LAUNCHER_ABSENT = [
    ['the Launcher is not on this tab', { ok: false, reason: 'no-launcher-context', message: 'Pendo Launcher agent context not found on this tab. Re-run validation first.' }],
    ['the Launcher world has no agent', { ok: false, reason: 'no-agent', message: LAUNCHER_NOT_CONFIGURED_MESSAGE }],
  ]

  it.each(LAUNCHER_ABSENT)('keeps the page result when %s', (_label, launcherRes) => {
    for (const pageRes of [PAGE_NOT_LEADER, PAGE_THREW]) {
      expect(resolveDebuggerRetryResult(pageRes, launcherRes)).toBe(pageRes)
    }
  })

  it.each(LAUNCHER_ABSENT)('reports the Launcher as not configured when the page has no agent and %s', (_label, launcherRes) => {
    expect(resolveDebuggerRetryResult(PAGE_NO_AGENT, launcherRes)).toEqual({ ok: false, reason: 'no-agent', message: LAUNCHER_NOT_CONFIGURED_MESSAGE })
  })

  it('does not let a follower Launcher agent hide the page error', () => {
    expect(resolveDebuggerRetryResult(PAGE_THREW, LAUNCHER_NOT_LEADER)).toEqual({
      ...LAUNCHER_NOT_LEADER,
      message: `pendo.enableDebugging is broken Retrying in the Pendo Launcher failed: ${LAUNCHER_NOT_LEADER.message}`,
    })
  })

  it('reports both agents when neither leads the tab', () => {
    expect(resolveDebuggerRetryResult(PAGE_NOT_LEADER, LAUNCHER_NOT_LEADER).message)
      .toBe(`${PAGE_NOT_LEADER.message} Retrying in the Pendo Launcher failed: ${LAUNCHER_NOT_LEADER.message}`)
  })

  it.each(['attach-failed', 'eval-exception', 'no-debugger-api'])('reports both failures when the Launcher retry fails with %s', (reason) => {
    for (const pageRes of [PAGE_NOT_LEADER, PAGE_NO_AGENT]) {
      expect(resolveDebuggerRetryResult(pageRes, { ok: false, reason, message: 'Launcher retry broke.' })).toEqual({
        ok: false,
        reason,
        message: `${pageRes.message} Retrying in the Pendo Launcher failed: Launcher retry broke.`,
      })
    }
  })

  it('popup.js enableDebuggerForActiveTab returns through resolveDebuggerRetryResult', () => {
    const popup = readExtensionFile('popup.js')
    const body = popup.slice(popup.indexOf('async function enableDebuggerForActiveTab('), popup.indexOf("launchDebuggerBtn.addEventListener('click'"))
    expect(body).toContain('return resolveDebuggerRetryResult(pageRes, launcherRes);')
    expect(popup).toContain(`const LAUNCHER_NOT_CONFIGURED_MESSAGE = '${LAUNCHER_NOT_CONFIGURED_MESSAGE}';`)
  })
})

// ── buildLauncherInvokeExpression ───────────────────────────────────────────────

describe('buildLauncherInvokeExpression', () => {
  it('guards the injected source so a top-level binding is not redeclared on re-eval', () => {
    // Emulates the Launcher's persistent isolated world: a top-level `const` would
    // throw "Identifier has already been declared" if the raw source were re-evaluated.
    const src = [
      'const __sampleMarker = 1;',
      'function __sampleInjected(variant = "page") { return "ran:" + variant + ":" + __sampleMarker }',
      'void (globalThis.__sampleInjected = __sampleInjected);',
    ].join('\n')
    const expression = buildLauncherInvokeExpression(src, '__sampleInjected', JSON.stringify('launcher'))
    const context = vm.createContext({})

    expect(vm.runInContext(expression, context)).toBe('ran:launcher:1')
    // Re-evaluating in the SAME persistent context must not throw and must still invoke.
    expect(() => vm.runInContext(expression, context)).not.toThrow()
    expect(vm.runInContext(expression, context)).toBe('ran:launcher:1')
  })

  it('re-evaluating the raw (unguarded) source in a persistent context throws', () => {
    // Documents the bug the guard prevents: re-running the source verbatim redeclares it.
    const rawExpression = [
      'const __rawMarker = 1;',
      'globalThis.__rawMarker = __rawMarker;',
    ].join('\n')
    const context = vm.createContext({})

    expect(() => vm.runInContext(rawExpression, context)).not.toThrow()
    expect(() => vm.runInContext(rawExpression, context)).toThrow()
  })

  it('invokes with no arguments when argsExpr is omitted', () => {
    const src = 'void (globalThis.__sampleNoArg = () => "called");'
    const expression = buildLauncherInvokeExpression(src, '__sampleNoArg')
    const context = vm.createContext({})

    expect(expression).toContain("typeof globalThis.__sampleNoArg !== 'function'")
    expect(expression.trimEnd().endsWith('globalThis.__sampleNoArg();')).toBe(true)
    expect(vm.runInContext(expression, context)).toBe('called')
  })

  it('skips the body when the revision already matches', () => {
    const context = vm.createContext({ __sampleRevision: 3, __sample: () => 'current' })
    const expression = buildLauncherInvokeExpression('throw new Error("re-evaluated")', '__sample', '', 3)

    expect(vm.runInContext(expression, context)).toBe('current')
  })

  it('replaces a stale enable-debugging helper left in the Launcher world by an older build', () => {
    // The Launcher isolated world outlives an extension upgrade, so a pre-revision helper
    // that reported ok: true for a follower agent can still be defined there.
    const src = readExtensionFile('enable-debugging.js')
    const revision = fileRevision(src, '__pendoValidateEnableDebugging')
    const context = vm.createContext({ pendo: { enableDebugging: () => undefined, isDebuggingEnabled: () => false } })
    context.window = context
    context.__pendoValidateEnableDebugging = () => ({ ok: true })

    expect(vm.runInContext(buildLauncherInvokeExpression(src, '__pendoValidateEnableDebugging'), context)).toEqual({ ok: true })
    expect(vm.runInContext(buildLauncherInvokeExpression(src, '__pendoValidateEnableDebugging', '', revision), context))
      .toMatchObject({ ok: false, reason: 'not-leader' })
  })

  it('replaces a stale capture-inspect helper left in the Launcher world by an older build', () => {
    const src = readExtensionFile('capture-inspect.js')
    const revision = fileRevision(src, '__pendoValidateCaptureAndInspect')
    const context = vm.createContext({ document: { querySelectorAll: () => [] }, console, performance: { getEntriesByType: () => [] } })
    context.window = context
    context.__pendoValidateCaptureAndInspectRevision = revision - 1
    context.__pendoValidateCaptureAndInspect = () => ({ status: { pendoPresent: false }, captured: [], advice: [], checks: [] })

    const expression = buildLauncherInvokeExpression(src, '__pendoValidateCaptureAndInspect', JSON.stringify('launcher'), revision)
    const result = vm.runInContext(expression, context)
    expect('apiKeysSeen' in result.status).toBe(true)
    expect(context.__pendoValidateCaptureAndInspectRevision).toBe(revision)
  })

  it('popup.js passes each Launcher script its _INJECTED_SCRIPTS revision, matching the file', () => {
    const popup = readExtensionFile('popup.js')
    for (const [key, globalName] of [['capture-inspect', '__pendoValidateCaptureAndInspect'], ['enable-debugging', '__pendoValidateEnableDebugging']]) {
      expect(popup).toMatch(new RegExp(`buildLauncherInvokeExpression\\(src, '${globalName}', .+, _INJECTED_SCRIPTS\\['${key}'\\]\\.revision\\)`))
      const declared = Number(popup.match(new RegExp(`'${key}': \\{ file: '${key}\\.js', revision: (\\d+)`))[1])
      expect(declared).toBe(fileRevision(readExtensionFile(`${key}.js`), globalName))
    }
  })
})
