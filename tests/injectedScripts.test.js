import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const __dirname = dirname(fileURLToPath(import.meta.url))
const extDir = join(__dirname, '../extension')

function readExtensionScript(name) {
  return readFileSync(join(extDir, name), 'utf8')
}

/** Emulates scripting.executeScript({ files: [...] }) into a persistent MAIN world. */
function injectIntoContext(src, context) {
  vm.runInContext(src, context)
}

describe('injected extension scripts — MAIN world idempotency', () => {
  it('capture-inspect.js can be injected twice without redeclaration (Phase 1 + 1.5)', () => {
    const src = readExtensionScript('capture-inspect.js')
    const context = vm.createContext({ globalThis: {} })
    context.globalThis = context

    injectIntoContext(src, context)
    expect(typeof context.__pendoValidateCaptureAndInspect).toBe('function')

    // Second injection into the same execution context must not throw.
    expect(() => injectIntoContext(src, context)).not.toThrow()
    expect(typeof context.__pendoValidateCaptureAndInspect).toBe('function')
  })

  it('capture-inspect.js replaces a stale page global when revision changes', () => {
    const src = readExtensionScript('capture-inspect.js')
    const context = vm.createContext({ globalThis: {}, window: {}, document: { querySelectorAll: () => [] }, console, performance: { getEntriesByType: () => [] } })
    context.globalThis = context
    context.window = context

    // Simulate a pre-revision global left on the page from an older extension build.
    context.__pendoValidateCaptureAndInspect = () => ({
      status: { pendoPresent: true, validatePresent: true },
      captured: [], advice: [], checks: [], cspMeta: '', apiKeyFound: false, hasError: false, hasWarn: false,
    })

    injectIntoContext(src, context)
    const result = context.__pendoValidateCaptureAndInspect('combined')
    expect(result.status.snippetGlobalPresent).toBe(false)
    expect(result.status.launcherGlobalPresent).toBe(false)
    expect('snippetGlobalPresent' in result.status).toBe(true)
    expect('launcherGlobalPresent' in result.status).toBe(true)
  })

  it('capture-inspect.js restores the function when revision matches but the global was cleared', () => {
    const src = readExtensionScript('capture-inspect.js')
    const context = vm.createContext({ globalThis: {}, window: {}, document: { querySelectorAll: () => [] }, console, performance: { getEntriesByType: () => [] } })
    context.globalThis = context
    context.window = context

    injectIntoContext(src, context)
    expect(typeof context.__pendoValidateCaptureAndInspect).toBe('function')

    // Revision marker survives but the callable was removed (e.g. page script deleted it).
    vm.runInContext('delete globalThis.__pendoValidateCaptureAndInspect', context)

    expect(() => injectIntoContext(src, context)).not.toThrow()
    expect(typeof context.__pendoValidateCaptureAndInspect).toBe('function')
    const result = context.__pendoValidateCaptureAndInspect('combined')
    expect('snippetGlobalPresent' in result.status).toBe(true)
  })

  it('enable-debugging.js can be injected twice without redeclaration', () => {
    const src = readExtensionScript('enable-debugging.js')
    const context = vm.createContext({ globalThis: {} })
    context.globalThis = context

    injectIntoContext(src, context)
    expect(typeof context.__pendoValidateEnableDebugging).toBe('function')
    expect(() => injectIntoContext(src, context)).not.toThrow()
    expect(typeof context.__pendoValidateEnableDebugging).toBe('function')
  })

  it('unguarded top-level binding fails on re-injection (documents the bug)', () => {
    const unguarded = [
      'const __sampleCapture = function () { return 1 }',
      'void (globalThis.__sampleCapture = __sampleCapture);',
    ].join('\n')
    const context = vm.createContext({ globalThis: {} })
    context.globalThis = context

    injectIntoContext(unguarded, context)
    expect(() => injectIntoContext(unguarded, context)).toThrow()
  })
})

describe('injected extension scripts — host-page global collision', () => {
  it('top-level function declaration collides with a host-page lexical binding (documents the bug)', () => {
    // A prior page script declares a lexical `captureAndInspect`; the old injection style
    // declared `function captureAndInspect` at the top level, which redeclares it.
    const oldStyle = [
      'if (typeof globalThis.__sampleCapture !== "function") {',
      'function captureAndInspect() { return 1 }',
      'void (globalThis.__sampleCapture = captureAndInspect);',
      '}',
    ].join('\n')
    const context = vm.createContext({ globalThis: {} })
    context.globalThis = context

    injectIntoContext('let captureAndInspect = () => 2', context)
    expect(() => injectIntoContext(oldStyle, context)).toThrow()
  })

  it('capture-inspect.js injects cleanly when the host page already has a lexical captureAndInspect', () => {
    const src = readExtensionScript('capture-inspect.js')
    const context = vm.createContext({ globalThis: {} })
    context.globalThis = context

    injectIntoContext('let captureAndInspect = () => 1', context)
    expect(() => injectIntoContext(src, context)).not.toThrow()
    expect(typeof context.__pendoValidateCaptureAndInspect).toBe('function')
  })

  it('enable-debugging.js injects cleanly when the host page already has a lexical enableDebuggingInPage', () => {
    const src = readExtensionScript('enable-debugging.js')
    const context = vm.createContext({ globalThis: {} })
    context.globalThis = context

    injectIntoContext('let enableDebuggingInPage = () => 1', context)
    expect(() => injectIntoContext(src, context)).not.toThrow()
    expect(typeof context.__pendoValidateEnableDebugging).toBe('function')
  })
})
