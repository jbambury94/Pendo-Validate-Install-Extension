import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const extDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension')
const telemetrySrc = readFileSync(join(extDir, 'pendo-telemetry.js'), 'utf8')
// The panel loads diagnostics.js too; telemetry uses its helpers when they are defined.
const diagnosticsSrc = readFileSync(join(extDir, 'diagnostics.js'), 'utf8')

function loadTelemetry() {
  vm.runInThisContext(diagnosticsSrc)
  vm.runInThisContext(telemetrySrc)
}

const PAGE_KEY = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'

const baseRes = {
  status: { pendoPresent: true, validatePresent: true },
  captured: [],
  checks: ['Standard configuration detected.'],
  advice: [],
  snippetOnPage: true,
  launcherPresent: false,
  launcherAttempted: false,
  launcherDataValidated: undefined,
  validatedIn: 'page',
  validationPath: 'page',
  pageUrl: 'https://customer.example.com/secret',
}

describe('pendo-telemetry', () => {
  beforeEach(() => {
    loadTelemetry()
  })

  it('buildValidationCompletedProps maps a clean pass to ok', () => {
    const props = buildValidationCompletedProps(baseRes, { aiAdviceUsed: false, ivaVersion: '1.9.0', browser: 'chrome' })
    expect(props.ivaOutcome).toBe('ok')
    expect(props.ivaValidationPath).toBe('page')
    expect(props.ivaErrCount).toBe('0')
    expect(props.ivaAiUsed).toBe(false)
  })

  it('buildValidationCompletedProps maps errors to err outcome', () => {
    const res = {
      ...baseRes,
      captured: [{ level: 'error', text: 'boom' }],
    }
    expect(buildValidationCompletedProps(res, {}).ivaOutcome).toBe('err')
    expect(buildValidationCompletedProps(res, {}).ivaErrCount).toBe('1')
  })

  it('buildValidationCompletedProps maps missing pendo to notDetected', () => {
    const res = {
      ...baseRes,
      status: { pendoPresent: false, validatePresent: false },
      snippetOnPage: false,
      launcherAttempted: true,
      launcherPresent: false,
    }
    expect(buildValidationCompletedProps(res, {}).ivaOutcome).toBe('notDetected')
  })

  it('property names conform to Pendo rules and avoid reserved error key', () => {
    const props = buildValidationCompletedProps(baseRes, { ivaVersion: '1.9.0', browser: 'firefox' })
    for (const key of Object.keys(props)) {
      expect(key).not.toBe('error')
      expect(key).toMatch(/^[A-Za-z][A-Za-z0-9_]{0,30}$/)
      expect(typeof props[key] === 'string' || typeof props[key] === 'boolean').toBe(true)
    }
  })

  it('serialized properties stay under the 512-byte cap', () => {
    const res = {
      ...baseRes,
      captured: Array.from({ length: 250 }, (_, i) => ({ level: 'warn', text: `line ${i}` })),
      checks: Array.from({ length: 40 }, (_, i) => `Check ${i}`),
      advice: Array.from({ length: 20 }, (_, i) => ({ text: `Advice ${i}`, source: 'builtin' })),
      validationPath: 'launcher-cdp',
      validatedIn: 'launcher-beta',
      launcherPresent: true,
      launcherDataValidated: true,
      status: {
        pendoPresent: true, validatePresent: true, visitorAnonymous: true,
        environment: { available: true, errorCount: 100 },
        agentScripts: [{}, {}], apiKeysSeen: ['k1', 'k2'],
      },
      frameMap: { available: true, inspected: 30, subframePendoCount: 3 },
      networkCapture: { summary: { requests: Array.from({ length: 30 }, () => ({ url: 'https://cdn.pendo.io/x', status: 500 })) } },
    }
    const props = buildValidationCompletedProps(res, { aiAdviceUsed: true, ivaVersion: '1.9.1', browser: 'firefox' })
    expect(JSON.stringify(props).length).toBeLessThan(450)
    expect(JSON.stringify(props)).not.toContain('customer.example.com')
    expect(JSON.stringify(props)).not.toContain('visitor')
  })

  it('reports the new checks as low-cardinality flags and buckets', () => {
    const props = buildValidationCompletedProps({
      ...baseRes,
      status: {
        pendoPresent: true, validatePresent: true, visitorId: '_PENDO_T_abc', visitorAnonymous: true, detectedApiKey: PAGE_KEY,
        environment: { available: true, errorCount: 12, errors: ['secret error text'] },
        agentScripts: [
          { src: `https://cdn.pendo.io/agent/static/${PAGE_KEY}/pendo.js`, apiKey: PAGE_KEY },
          { src: `https://cdn.pendo.io/agent/static/${PAGE_KEY}/pendo.js`, apiKey: PAGE_KEY },
        ],
        apiKeysSeen: [PAGE_KEY],
      },
      frameMap: {
        available: true, inspected: 3, subframePendoCount: 1,
        frames: [{ url: 'https://frame.customer.example.com/', visitorId: 'frame-visitor-id', apiKey: PAGE_KEY }],
      },
      networkCapture: {
        summary: {
          documentCsp: { enforce: ["script-src 'self' secret.example"], reportOnly: [] },
          requests: [
            { url: `https://data.pendo.io/data/ptm.gif/${PAGE_KEY}`, blockedReason: 'csp' },
            { url: `https://data.pendo.io/data/ptm.gif/${PAGE_KEY}`, status: 200 },
          ],
        },
        har: { log: { entries: [] } },
      },
    }, { ivaVersion: '1.9.1', browser: 'chrome' })
    expect(props).toMatchObject({
      ivaFrames: '2-5',
      ivaSubframe: true,
      ivaAgentErrs: '11-50',
      ivaDup: 'scripts',
      ivaAnonymous: true,
      ivaNetFails: '1',
    })
    const serialized = JSON.stringify(props)
    for (const leak of [PAGE_KEY, '_PENDO_T_', 'secret', 'frame.customer', 'frame-visitor-id', 'cdn.pendo.io']) {
      expect(serialized).not.toContain(leak)
    }
  })

  it('uses neutral values when the new checks did not run', () => {
    const props = buildValidationCompletedProps(baseRes, {})
    expect(props).toMatchObject({ ivaFrames: '0', ivaSubframe: false, ivaAgentErrs: 'na', ivaDup: 'none', ivaAnonymous: false, ivaNetFails: 'off' })
    expect(buildValidationCompletedProps({ ...baseRes, status: { ...baseRes.status, apiKeysSeen: ['a', 'b'], agentScripts: [{}, {}] } }, {}).ivaDup).toBe('both')
  })

  it('counts advice severity in the outcome, like the Status hero', () => {
    expect(deriveIvaOutcome({ ...baseRes, advice: [{ text: 'blocked', severity: 'error' }] })).toBe('err')
    expect(deriveIvaOutcome({ ...baseRes, advice: [{ text: 'duplicate', severity: 'warn' }] })).toBe('warn')
    expect(deriveIvaOutcome({ ...baseRes, advice: [{ text: 'legacy', supportKey: 'installGuide' }] })).toBe('ok')
  })

  it('maps Pendo found only in a subframe to warn', () => {
    const res = {
      ...baseRes,
      status: { pendoPresent: false, validatePresent: false },
      snippetOnPage: false,
      launcherAttempted: true,
      launcherPresent: false,
      frameMap: { available: true, inspected: 2, subframePendoCount: 1 },
    }
    expect(deriveIvaOutcome(res)).toBe('warn')
  })

  it('maps subframe-only plus severity errors to err', () => {
    const res = {
      ...baseRes,
      status: { pendoPresent: false, validatePresent: false },
      snippetOnPage: false,
      launcherAttempted: true,
      launcherPresent: false,
      frameMap: { available: true, inspected: 2, subframePendoCount: 1 },
      advice: [{ text: 'blocked', severity: 'error' }],
    }
    expect(deriveIvaOutcome(res)).toBe('err')
  })

  it('bucketIvaLogLines uses low-cardinality buckets', () => {
    expect(bucketIvaLogLines(0)).toBe('0')
    expect(bucketIvaLogLines(5)).toBe('1-10')
    expect(bucketIvaLogLines(201)).toBe('200+')
  })

  it('trackIvaEvent no-ops when pendo.track is missing', () => {
    const prev = globalThis.window
    globalThis.window = {}
    expect(() => trackIvaEvent('validation_completed', { ivaOutcome: 'ok' })).not.toThrow()
    globalThis.window = prev
  })

  describe('trackIvaEventWhenReady', () => {
    let prevWindow

    beforeEach(() => {
      prevWindow = globalThis.window
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
      globalThis.window = prevWindow
    })

    it('fires immediately when the agent is ready', () => {
      const track = vi.fn()
      globalThis.window = { pendo: { track, isReady: () => true } }
      trackIvaEventWhenReady('har_downloaded', { ivaOutcome: 'ok' })
      expect(track).toHaveBeenCalledWith('har_downloaded', { ivaOutcome: 'ok' })
    })

    it('waits for the idle-loaded agent to become ready, then fires once', () => {
      const track = vi.fn()
      globalThis.window = {}
      trackIvaEventWhenReady('har_downloaded', { ivaOutcome: 'warn' }, { intervalMs: 500 })
      vi.advanceTimersByTime(1000)
      expect(track).not.toHaveBeenCalled()

      let ready = false
      globalThis.window.pendo = { track, isReady: () => ready }
      vi.advanceTimersByTime(1000)
      expect(track).not.toHaveBeenCalled()

      ready = true
      vi.advanceTimersByTime(500)
      expect(track).toHaveBeenCalledOnce()
      vi.advanceTimersByTime(5000)
      expect(track).toHaveBeenCalledOnce()
    })

    it('drops the event once maxWaitMs elapses without the agent', () => {
      const track = vi.fn()
      globalThis.window = {}
      trackIvaEventWhenReady('har_downloaded', {}, { intervalMs: 500, maxWaitMs: 2000 })
      vi.advanceTimersByTime(2500)
      globalThis.window.pendo = { track, isReady: () => true }
      vi.advanceTimersByTime(5000)
      expect(track).not.toHaveBeenCalled()
    })
  })

  it('har_downloaded props avoid page URL and identity', () => {
    const props = {
      ivaHarMode: 'cdp',
      ivaHarEntries: bucketIvaLogLines(5),
      ivaOutcome: 'err',
    }
    const serialized = JSON.stringify(props)
    expect(serialized).not.toContain('customer.example.com')
    expect(serialized).not.toContain('visitor')
    for (const key of Object.keys(props)) {
      expect(key).toMatch(/^iva/)
    }
  })
})
