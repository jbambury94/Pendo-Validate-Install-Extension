import { describe, it, expect } from 'vitest'
import { buildMarkdownReport, buildJsonReport, PENDO_SUPPORT } from './helpers.js'

const baseContext = {
  pageUrl: 'https://example.com/app',
  timestamp: '2026-04-27T12:00:00.000Z',
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
  cspMeta: '',
  apiKeyFound: true,
  hasError: false,
  hasWarn: false,
  origin: 'page',
  snippetOnPage: true,
  launcherPresent: undefined,
  launcherAttempted: false,
  validatedIn: 'page',
  launcherUrl: null,
}

describe('buildMarkdownReport — status line', () => {
  it('shows "Looks healthy" when everything passes', () => {
    expect(buildMarkdownReport(baseContext)).toContain('Looks healthy')
  })

  it('shows "Pendo not found" when pendoPresent is false', () => {
    const ctx = { ...baseContext, status: { ...baseContext.status, pendoPresent: false } }
    expect(buildMarkdownReport(ctx)).toContain('Pendo not found')
  })

  it('shows "No validateInstall()" when validatePresent is false', () => {
    const ctx = { ...baseContext, status: { ...baseContext.status, validatePresent: false } }
    expect(buildMarkdownReport(ctx)).toContain('No validateInstall()')
  })

  it('shows "Errors found" when captured has an error entry', () => {
    const ctx = { ...baseContext, captured: [{ level: 'error', text: 'Something broke' }] }
    expect(buildMarkdownReport(ctx)).toContain('Errors found')
  })

  it('shows "Warnings found" when captured has a warn entry', () => {
    const ctx = { ...baseContext, captured: [{ level: 'warn', text: 'Watch out' }] }
    expect(buildMarkdownReport(ctx)).toContain('Warnings found')
  })

  it('errors take precedence over warnings in status line', () => {
    const ctx = {
      ...baseContext,
      captured: [
        { level: 'error', text: 'Failed' },
        { level: 'warn',  text: 'Also a warning' },
      ],
    }
    const md = buildMarkdownReport(ctx)
    expect(md).toContain('Errors found')
    expect(md).not.toContain('Warnings found')
  })

  it('appends "(via Pendo Launcher)" for launcher origin', () => {
    const ctx = { ...baseContext, validatedIn: 'launcher', launcherUrl: 'https://launcher.example.com', launcherAttempted: true, launcherPresent: true }
    const md = buildMarkdownReport(ctx)
    expect(md).toContain('via Pendo Launcher')
  })

  it('appends "(via Pendo Launcher Beta)" for launcher-beta origin', () => {
    const ctx = { ...baseContext, validatedIn: 'launcher-beta', launcherUrl: 'https://beta.example.com', launcherAttempted: true, launcherPresent: true }
    expect(buildMarkdownReport(ctx)).toContain('via Pendo Launcher Beta')
  })
})

describe('buildMarkdownReport — content sections', () => {
  it('includes page URL and timestamp', () => {
    const md = buildMarkdownReport(baseContext)
    expect(md).toContain('https://example.com/app')
    expect(md).toContain('2026-04-27T12:00:00.000Z')
  })

  it('includes Validated in URL line for launcher variant', () => {
    const ctx = { ...baseContext, validatedIn: 'launcher', launcherUrl: 'https://launcher.example.com', launcherAttempted: true }
    expect(buildMarkdownReport(ctx)).toContain('https://launcher.example.com')
  })

  it('does not include Validated in URL line for page variant', () => {
    expect(buildMarkdownReport(baseContext)).not.toContain('Validated in URL')
  })

  it('renders error lines with install guide link', () => {
    const ctx = { ...baseContext, captured: [{ level: 'error', text: 'init failed' }] }
    const md = buildMarkdownReport(ctx)
    expect(md).toContain('init failed')
    expect(md).toContain(PENDO_SUPPORT.installGuide)
  })

  it('renders checks passed section', () => {
    const ctx = { ...baseContext, checks: ['API key found', 'visitorId present.'] }
    const md = buildMarkdownReport(ctx)
    expect(md).toContain('Checks passed')
    expect(md).toContain('API key found')
    expect(md).toContain('visitorId present.')
  })

  it('renders recommendations with support link', () => {
    const ctx = { ...baseContext, advice: [{ text: 'Fix CSP', source: 'builtin', supportKey: 'csp' }] }
    const md = buildMarkdownReport(ctx)
    expect(md).toContain('Fix CSP')
    expect(md).toContain(PENDO_SUPPORT.csp)
  })

  it('prefixes AI advice items with [AI]', () => {
    const ctx = { ...baseContext, advice: [{ text: 'AI tip', source: 'ai' }] }
    expect(buildMarkdownReport(ctx)).toContain('[AI] AI tip')
  })

  it('renders captured output lines', () => {
    const ctx = { ...baseContext, captured: [{ level: 'log', text: 'Pendo initialized' }] }
    expect(buildMarkdownReport(ctx)).toContain('[log] Pendo initialized')
  })

  it('shows "No output captured." when captured is empty', () => {
    expect(buildMarkdownReport(baseContext)).toContain('No output captured.')
  })

  it('handles null captured array without throwing', () => {
    const ctx = { ...baseContext, captured: null }
    expect(() => buildMarkdownReport(ctx)).not.toThrow()
  })

  it('shows "No errors detected." when no errors', () => {
    expect(buildMarkdownReport(baseContext)).toContain('No errors detected.')
  })

  it('includes metadata JSON block', () => {
    const md = buildMarkdownReport(baseContext)
    expect(md).toContain('```json')
    expect(md).toContain('"pendoPresent": true')
  })

  it('includes resource hits in metadata when present', () => {
    const ctx = {
      ...baseContext,
      status: { ...baseContext.status, resourceHits: [{ name: 'https://cdn.pendo.io/agent.js', initiatorType: 'script' }] },
    }
    expect(buildMarkdownReport(ctx)).toContain('observedPendoResources')
  })
})

describe('buildJsonReport', () => {
  it('returns valid JSON string', () => {
    expect(() => JSON.parse(buildJsonReport(baseContext))).not.toThrow()
  })

  it('round-trips the context object', () => {
    const parsed = JSON.parse(buildJsonReport(baseContext))
    expect(parsed.pageUrl).toBe(baseContext.pageUrl)
    expect(parsed.status.pendoPresent).toBe(true)
  })
})
