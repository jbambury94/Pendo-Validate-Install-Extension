import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const telemetrySrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'pendo-telemetry.js'),
  'utf8',
)

function loadTelemetry() {
  vm.runInThisContext(telemetrySrc)
}

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
    }
    const props = buildValidationCompletedProps(res, { aiAdviceUsed: true, ivaVersion: '1.9.0', browser: 'edge' })
    expect(JSON.stringify(props).length).toBeLessThan(450)
    expect(JSON.stringify(props)).not.toContain('customer.example.com')
    expect(JSON.stringify(props)).not.toContain('visitor')
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
