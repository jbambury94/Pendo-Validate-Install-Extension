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
