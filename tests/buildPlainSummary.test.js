import { describe, it, expect } from 'vitest'
import { buildPlainSummary } from './helpers.js'

const baseContext = {
  pageUrl: 'https://example.com/app',
  timestamp: '2026-05-27T12:00:00.000Z',
  status: {
    pendoPresent: true,
    validatePresent: true,
    version: '2.314.1',
    detectedApiKey: 'abc123',
    visitorId: 'visitor-1',
    accountId: 'acct-1',
    resourceHits: [],
  },
  captured: [],
  advice: [],
  checks: [],
  snippetOnPage: true,
  launcherPresent: undefined,
  launcherAttempted: false,
  launcherDataValidated: undefined,
  validatedIn: 'page',
}

describe('buildPlainSummary — status line', () => {
  it('shows "Looks healthy" when everything passes', () => {
    expect(buildPlainSummary(baseContext)).toContain('Looks healthy')
  })

  it('shows "Pendo not found" when pendoPresent is false', () => {
    const ctx = { ...baseContext, status: { ...baseContext.status, pendoPresent: false } }
    expect(buildPlainSummary(ctx)).toContain('Pendo not found')
  })

  it('shows "No validateInstall()" when validatePresent is false', () => {
    const ctx = { ...baseContext, status: { ...baseContext.status, validatePresent: false } }
    expect(buildPlainSummary(ctx)).toContain('No validateInstall()')
  })

  it('shows "Errors found" when captured has error entries', () => {
    const ctx = { ...baseContext, captured: [{ level: 'error', text: 'Something broke' }] }
    expect(buildPlainSummary(ctx)).toContain('Errors found')
  })

  it('shows "Warnings found" when captured has warn entries', () => {
    const ctx = { ...baseContext, captured: [{ level: 'warn', text: 'Watch out' }] }
    expect(buildPlainSummary(ctx)).toContain('Warnings found')
  })

  it('shows "Pendo not found (snippet and Launcher)" when both missing', () => {
    const ctx = { ...baseContext, snippetOnPage: false, launcherAttempted: true, launcherPresent: false }
    expect(buildPlainSummary(ctx)).toContain('Pendo not found (snippet and Launcher)')
  })

  it('shows "Launcher installed (no data on this tab)" when launcher present but unvalidated', () => {
    const ctx = { ...baseContext, snippetOnPage: false, launcherPresent: true, launcherDataValidated: false }
    expect(buildPlainSummary(ctx)).toContain('Launcher installed (no data on this tab)')
  })
})

describe('buildPlainSummary — content', () => {
  it('includes page URL and timestamp', () => {
    const text = buildPlainSummary(baseContext)
    expect(text).toContain('https://example.com/app')
    expect(text).toContain('2026-05-27T12:00:00.000Z')
  })

  it('prefixes the summary with the Pendo Install Validator name', () => {
    expect(buildPlainSummary(baseContext)).toContain('Pendo Install Validator —')
  })

  it('includes validatedIn value', () => {
    const ctx = { ...baseContext, validatedIn: 'launcher' }
    expect(buildPlainSummary(ctx)).toContain('Validated in: launcher')
  })

  it('defaults validatedIn to page when missing', () => {
    const ctx = { ...baseContext, validatedIn: undefined }
    expect(buildPlainSummary(ctx)).toContain('Validated in: page')
  })

  it('shows error, warning, and passing counts', () => {
    const ctx = {
      ...baseContext,
      captured: [{ level: 'error', text: 'err' }, { level: 'warn', text: 'w' }],
      checks: ['check1', 'check2'],
    }
    const text = buildPlainSummary(ctx)
    expect(text).toContain('Errors: 1')
    expect(text).toContain('Warnings: 1')
    expect(text).toContain('Passing: 2')
  })

  it('lists passing checks with bullet points', () => {
    const ctx = { ...baseContext, checks: ['API key found', 'visitorId present.'] }
    const text = buildPlainSummary(ctx)
    expect(text).toContain('Passing:')
    expect(text).toContain('• API key found')
    expect(text).toContain('• visitorId present.')
  })

  it('lists recommendations with bullet points', () => {
    const ctx = { ...baseContext, advice: [{ text: 'Fix CSP', source: 'builtin', supportKey: 'csp' }] }
    const text = buildPlainSummary(ctx)
    expect(text).toContain('Recommendations:')
    expect(text).toContain('• Fix CSP')
  })

  it('prefixes AI advice with [AI]', () => {
    const ctx = { ...baseContext, advice: [{ text: 'AI tip', source: 'ai' }] }
    expect(buildPlainSummary(ctx)).toContain('[AI] AI tip')
  })

  it('handles null captured array without throwing', () => {
    const ctx = { ...baseContext, captured: null }
    expect(() => buildPlainSummary(ctx)).not.toThrow()
  })

  it('shows "unknown" for missing pageUrl', () => {
    const ctx = { ...baseContext, pageUrl: undefined }
    expect(buildPlainSummary(ctx)).toContain('Page: unknown')
  })
})
