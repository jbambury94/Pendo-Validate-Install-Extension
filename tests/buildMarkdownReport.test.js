import { describe, it, expect, beforeAll } from 'vitest'
import { buildMarkdownReport, buildJsonReport, PENDO_SUPPORT, selectRelatedReading } from './helpers.js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { JSDOM } from 'jsdom'

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
  launcherDataValidated: undefined,
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
    const ctx = { ...baseContext, validatedIn: 'launcher', launcherUrl: 'https://launcher.example.com', launcherAttempted: true, launcherPresent: true, launcherDataValidated: true }
    const md = buildMarkdownReport(ctx)
    expect(md).toContain('via Pendo Launcher')
  })

  it('appends "(via Pendo Launcher Beta)" for launcher-beta origin', () => {
    const ctx = { ...baseContext, validatedIn: 'launcher-beta', launcherUrl: 'https://beta.example.com', launcherAttempted: true, launcherPresent: true, launcherDataValidated: true }
    expect(buildMarkdownReport(ctx)).toContain('via Pendo Launcher Beta')
  })
})

describe('buildMarkdownReport — content sections', () => {
  it('includes page URL and timestamp', () => {
    const md = buildMarkdownReport(baseContext)
    expect(md).toContain('https://example.com/app')
    expect(md).toContain('2026-04-27T12:00:00.000Z')
  })

  it('uses the Pendo Install Validator report heading', () => {
    expect(buildMarkdownReport(baseContext)).toContain('# Pendo Install Validator Report')
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

  it('includes launcherDataValidated true in metadata for validated launcher context', () => {
    const ctx = { ...baseContext, validatedIn: 'launcher', launcherUrl: 'https://launcher.example.com', launcherAttempted: true, launcherPresent: true, launcherDataValidated: true }
    const md = buildMarkdownReport(ctx)
    expect(md).toContain('"launcherDataValidated": true')
  })

  it('includes launcherDataValidated false in metadata when launcher present but no data', () => {
    const ctx = { ...baseContext, launcherAttempted: true, launcherPresent: true, launcherDataValidated: false, validatedIn: 'page' }
    const md = buildMarkdownReport(ctx)
    expect(md).toContain('"launcherDataValidated": false')
  })

  it('omits launcherDataValidated from metadata when launcher was not attempted', () => {
    const md = buildMarkdownReport(baseContext)
    expect(md).not.toContain('"launcherDataValidated"')
  })

  it('omits observedPendoResources but keeps resourceHitCount in metadata', () => {
    const ctx = {
      ...baseContext,
      status: { ...baseContext.status, resourceHits: [{ name: 'https://cdn.pendo.io/agent.js', initiatorType: 'script' }] },
    }
    const md = buildMarkdownReport(ctx)
    expect(md).not.toContain('observedPendoResources')
    expect(md).toContain('"resourceHitCount": 1')
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

describe('buildMarkdownReport — Related reading section', () => {
  let findKbByTopicsFn

  beforeAll(() => {
    const src = readFileSync(join(__dirname, '..', 'extension', 'pendo-kb.js'), 'utf8')
    const dom = new JSDOM('<!doctype html>', { runScripts: 'dangerously' })
    const result = dom.window.eval(`(function() { ${src}; return { findKbByTopics }; })()`)
    findKbByTopicsFn = result.findKbByTopics
  })

  function srrFn(signals, max) {
    return selectRelatedReading(signals, max, findKbByTopicsFn)
  }

  it('includes Related reading section when signals trigger KB entries', () => {
    const ctx = { ...baseContext, status: { ...baseContext.status, pendoPresent: false }, apiKeyFound: false }
    const md = buildMarkdownReport(ctx, srrFn)
    expect(md).toContain('## Related reading')
    expect(md).toContain('support.pendo.io')
  })

  it('does not include Related reading when no KB entries match', () => {
    const md = buildMarkdownReport(baseContext, () => [])
    expect(md).not.toContain('## Related reading')
  })

  it('does not include Related reading when no selectRelatedReadingFn is provided', () => {
    const md = buildMarkdownReport(baseContext)
    expect(md).not.toContain('## Related reading')
  })

  it('preserves existing sections alongside Related reading', () => {
    const ctx = {
      ...baseContext,
      status: { ...baseContext.status, pendoPresent: false },
      apiKeyFound: false,
      advice: [{ text: 'Install snippet', supportKey: 'installGuide' }],
      checks: ['API key found'],
      captured: [{ level: 'log', text: 'test output' }],
    }
    const md = buildMarkdownReport(ctx, srrFn)
    expect(md).toContain('## Errors')
    expect(md).toContain('## Advice')
    expect(md).toContain('## Related reading')
    expect(md).toContain('## Captured Output')
    expect(md).toContain('test output')
    expect(md).toContain('API key found')
  })

  it('Related reading section appears between Advice and Captured Output', () => {
    const ctx = { ...baseContext, status: { ...baseContext.status, pendoPresent: false }, apiKeyFound: false }
    const md = buildMarkdownReport(ctx, srrFn)
    const adviceIdx = md.indexOf('## Advice')
    const readingIdx = md.indexOf('## Related reading')
    const capturedIdx = md.indexOf('## Captured Output')
    expect(adviceIdx).toBeLessThan(readingIdx)
    expect(readingIdx).toBeLessThan(capturedIdx)
  })

  it('includes Launcher related reading when launcherPresent is true (matches Status panel)', () => {
    const ctx = {
      ...baseContext,
      status: {
        ...baseContext.status,
        resourceHits: undefined,
        visitorMetadata: { id: 'visitor-1', role: 'admin' },
        accountMetadata: { id: 'acct-1', plan: 'pro' },
      },
      launcherAttempted: true,
      launcherPresent: true,
      launcherDataValidated: true,
      validatedIn: 'launcher',
    }
    const md = buildMarkdownReport(ctx, srrFn)
    expect(md).toContain('## Related reading')
    expect(md).toContain('Plan your browser extension implementation')
    expect(md).not.toContain('Validate your Pendo installation')
  })

  it('derives the SPA signal from checks text (was hard-coded false before the fix)', () => {
    const ctx = {
      ...baseContext,
      status: {
        ...baseContext.status,
        visitorMetadata: { id: 'visitor-1', role: 'admin' },
        accountMetadata: { id: 'acct-1', plan: 'pro' },
      },
      checks: ['SPA framework detected: react'],
    }
    const md = buildMarkdownReport(ctx, srrFn)
    expect(md).toContain('## Related reading')
    expect(md).toContain('Install Pendo on a single-page web application')
  })

  it('derives the GTM signal from checks text (matches Status panel)', () => {
    const ctx = {
      ...baseContext,
      status: {
        ...baseContext.status,
        visitorMetadata: { id: 'visitor-1', role: 'admin' },
        accountMetadata: { id: 'acct-1', plan: 'pro' },
      },
      checks: ['Google Tag Manager detected'],
    }
    const md = buildMarkdownReport(ctx, srrFn)
    expect(md).toContain('## Related reading')
    expect(md).toContain('Install Pendo through the Google Tag Manager')
  })

  it('derives iframe/sandbox/agent signals from advice support keys (matches Status panel)', () => {
    const ctx = {
      ...baseContext,
      status: {
        ...baseContext.status,
        visitorMetadata: { id: 'visitor-1', role: 'admin' },
        accountMetadata: { id: 'acct-1', plan: 'pro' },
      },
      advice: [
        { text: 'sandbox', supportKey: 'sandbox' },
        { text: 'old agent', supportKey: 'agentDebug' },
      ],
    }
    const md = buildMarkdownReport(ctx, srrFn)
    expect(md).toContain('## Related reading')
    expect(md).toContain('Pendo in multiple environments for development and testing')
  })

  it('includes parentAccountId and parentAccountMetadata in the metadata JSON when present', () => {
    const ctx = {
      ...baseContext,
      status: {
        ...baseContext.status,
        parentAccountId: 'parent-1',
        parentAccountMetadata: { id: 'parent-1', name: 'Parent Corp' },
      },
    }
    const md = buildMarkdownReport(ctx)
    expect(md).toContain('"parentAccountId": "parent-1"')
    expect(md).toContain('"parentAccountMetadata"')
    expect(md).toContain('"name": "Parent Corp"')
  })

  it('omits parentAccountMetadata from metadata JSON when absent', () => {
    const md = buildMarkdownReport(baseContext)
    expect(md).toContain('"parentAccountId": "not set"')
    expect(md).not.toContain('parentAccountMetadata')
  })

  it('surfaces parent-accounts related reading when parentAccountId is present', () => {
    const ctx = {
      ...baseContext,
      status: {
        ...baseContext.status,
        parentAccountId: 'parent-1',
        parentAccountMetadata: { id: 'parent-1', name: 'Parent Corp' },
      },
    }
    const md = buildMarkdownReport(ctx, srrFn)
    expect(md).toContain('## Related reading')
    expect(md).toContain('Configure parent accounts (multi-level accounts)')
  })
})

describe('buildJsonReport — parent account fields', () => {
  it('includes parent account fields in serialized context when present', () => {
    const ctx = {
      ...baseContext,
      status: {
        ...baseContext.status,
        parentAccountId: 'parent-1',
        parentAccountMetadata: { id: 'parent-1', name: 'Parent Corp' },
      },
    }
    const json = JSON.parse(buildJsonReport(ctx))
    expect(json.status.parentAccountId).toBe('parent-1')
    expect(json.status.parentAccountMetadata).toMatchObject({ name: 'Parent Corp' })
  })
})
