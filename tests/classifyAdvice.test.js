import { describe, it, expect } from 'vitest'
import { classifyAdvice, PENDO_SUPPORT } from './helpers.js'

describe('classifyAdvice', () => {
  it('returns empty buckets for empty inputs', () => {
    const result = classifyAdvice([], [], [])
    expect(result).toEqual({ err: [], warn: [], ok: [] })
  })

  it('returns empty buckets when all inputs are null', () => {
    const result = classifyAdvice(null, null, null)
    expect(result).toEqual({ err: [], warn: [], ok: [] })
  })

  it('routes advice with ERR_SUPPORT_KEYS supportKey to the err bucket', () => {
    const advice = [{ text: 'Install snippet', supportKey: 'installGuide' }]
    const result = classifyAdvice(advice, [], [])
    expect(result.err).toHaveLength(1)
    expect(result.err[0].text).toBe('Install snippet')
    expect(result.err[0].supportKey).toBe('installGuide')
  })

  it('routes installComponents supportKey to err bucket', () => {
    const advice = [{ text: 'Missing components', supportKey: 'installComponents' }]
    const result = classifyAdvice(advice, [], [])
    expect(result.err).toHaveLength(1)
  })

  it('routes agentSettings supportKey to err bucket', () => {
    const advice = [{ text: 'Bad settings', supportKey: 'agentSettings' }]
    const result = classifyAdvice(advice, [], [])
    expect(result.err).toHaveLength(1)
  })

  it('routes advice without ERR supportKey to the warn bucket', () => {
    const advice = [{ text: 'Add CSP domain', supportKey: 'csp' }]
    const result = classifyAdvice(advice, [], [])
    expect(result.warn).toHaveLength(1)
    expect(result.warn[0].text).toBe('Add CSP domain')
  })

  it('routes captured error log lines to err bucket with installGuide supportUrl', () => {
    const captured = [{ level: 'error', text: 'Load failed' }]
    const result = classifyAdvice([], captured, [])
    expect(result.err).toHaveLength(1)
    expect(result.err[0].supportUrl).toBe(PENDO_SUPPORT.installGuide)
    expect(result.err[0].source).toBe('captured')
  })

  it('routes generic captured warn log lines to warn bucket with troubleshooting supportUrl', () => {
    const captured = [{ level: 'warn', text: 'Some unrecognised warning' }]
    const result = classifyAdvice([], captured, [])
    expect(result.warn).toHaveLength(1)
    expect(result.warn[0].supportUrl).toBe(PENDO_SUPPORT.troubleshooting)
    expect(result.warn[0].supportKey).toBe('troubleshooting')
    expect(result.warn[0].source).toBe('captured')
  })

  it('maps known Pendo validateInstall warn messages to snippet-appropriate support articles (not the browser-scripting article)', () => {
    const captured = [
      { level: 'warn', text: 'The current visitor is not identified and will be treated as "anonymous". (You might have used "VISITOR-UNIQUE-ID" as the visitor ID)' },
      { level: 'warn', text: 'The current visitor is not associated with an account. Is this expected?' },
      { level: 'warn', text: 'No account metadata found. Learn more about metadata here: http://help.pendo.io/resources/support-library/installation/metadata.html' },
    ]
    const result = classifyAdvice([], captured, [])
    expect(result.warn).toHaveLength(3)
    expect(result.warn[0].supportKey).toBe('chooseIdsMetadata')
    expect(result.warn[0].supportUrl).toBe(PENDO_SUPPORT.chooseIdsMetadata)
    expect(result.warn[1].supportKey).toBe('chooseIdsMetadata')
    expect(result.warn[1].supportUrl).toBe(PENDO_SUPPORT.chooseIdsMetadata)
    expect(result.warn[2].supportKey).toBe('configureMetadata')
    expect(result.warn[2].supportUrl).toBe(PENDO_SUPPORT.configureMetadata)
    result.warn.forEach(w => {
      expect(w.supportUrl).not.toBe(PENDO_SUPPORT.helpCenter)
      expect(w.supportKey).not.toBe('identifyVisitors')
    })
    expect(result.warn[2].text).not.toMatch(/help\.pendo\.io/)
    expect(result.warn[2].text).toBe('No account metadata found.')
  })

  it('maps CSP-related captured errors to the CSP article instead of installGuide', () => {
    const captured = [{ level: 'error', text: 'Refused to connect to data.pendo.io: blocked by CSP' }]
    const result = classifyAdvice([], captured, [])
    expect(result.err).toHaveLength(1)
    expect(result.err[0].supportKey).toBe('csp')
    expect(result.err[0].supportUrl).toBe(PENDO_SUPPORT.csp)
  })

  it('maps checks to ok bucket as builtin source', () => {
    const checks = ['API key found', 'visitorId present.']
    const result = classifyAdvice([], [], checks)
    expect(result.ok).toHaveLength(2)
    expect(result.ok[0]).toEqual({ text: 'API key found', source: 'builtin' })
    expect(result.ok[1]).toEqual({ text: 'visitorId present.', source: 'builtin' })
  })

  it('deduplicates captured lines that share text with advice items', () => {
    const advice = [{ text: 'Load failed', supportKey: 'installGuide' }]
    const captured = [{ level: 'error', text: 'Load failed' }]
    const result = classifyAdvice(advice, captured, [])
    expect(result.err).toHaveLength(1)
  })

  it('distributes mixed inputs across all three buckets', () => {
    const advice = [
      { text: 'Install snippet', supportKey: 'installGuide' },
      { text: 'Add CSP domain', supportKey: 'csp' },
    ]
    const captured = [
      { level: 'error', text: 'Script blocked' },
      { level: 'warn', text: 'Missing field' },
    ]
    const checks = ['API key found']
    const result = classifyAdvice(advice, captured, checks)
    expect(result.err).toHaveLength(2)
    expect(result.warn).toHaveLength(2)
    expect(result.ok).toHaveLength(1)
  })

  it('skips captured lines with falsy or empty text', () => {
    const captured = [{ level: 'error', text: '' }, { level: 'warn' }, null]
    const result = classifyAdvice([], captured, [])
    expect(result.err).toHaveLength(0)
    expect(result.warn).toHaveLength(0)
  })

  it('routes new gtm supportKey to warn bucket (not err)', () => {
    const advice = [{ text: 'GTM present, Pendo missing', supportKey: 'gtm' }]
    const result = classifyAdvice(advice, [], [])
    expect(result.warn).toHaveLength(1)
    expect(result.err).toHaveLength(0)
  })

  it('routes new iframe supportKey to warn bucket', () => {
    const advice = [{ text: 'Running in iframe', supportKey: 'iframe' }]
    const result = classifyAdvice(advice, [], [])
    expect(result.warn).toHaveLength(1)
    expect(result.err).toHaveLength(0)
  })

  it('routes new sandbox supportKey to warn bucket', () => {
    const advice = [{ text: 'Staging environment', supportKey: 'sandbox' }]
    const result = classifyAdvice(advice, [], [])
    expect(result.warn).toHaveLength(1)
    expect(result.err).toHaveLength(0)
  })

  it('routes new configureMetadata supportKey to warn bucket', () => {
    const advice = [{ text: 'Account metadata empty', supportKey: 'configureMetadata' }]
    const result = classifyAdvice(advice, [], [])
    expect(result.warn).toHaveLength(1)
    expect(result.err).toHaveLength(0)
  })

  it('routes new hostnameAllowlist supportKey to warn bucket', () => {
    const advice = [{ text: 'Missing data.pendo.io', supportKey: 'csp', supportKeys: ['csp', 'hostnameAllowlist'] }]
    const result = classifyAdvice(advice, [], [])
    expect(result.warn).toHaveLength(1)
    expect(result.err).toHaveLength(0)
  })

  it('routes new troubleshooting supportKey to warn bucket', () => {
    const advice = [{ text: 'Pendo not displaying', supportKey: 'troubleshooting' }]
    const result = classifyAdvice(advice, [], [])
    expect(result.warn).toHaveLength(1)
    expect(result.err).toHaveLength(0)
  })

  it('routes AI-failure items (technicalSupport supportKey) to warn bucket, never err', () => {
    // The "AI suggestion unavailable" item is an extension-side failure, not a
    // snippet/Launcher install issue. It must surface as a warning even when the
    // failure detail contains phrases like "API key" that would otherwise be
    // inferred as an installComponents-level error.
    const advice = [{
      text: 'AI suggestion unavailable: Anthropic returned an organization policy error: client-side (browser) API access is disabled for your workspace, and Chrome extensions are treated as client-side. Use OpenAI or Google Gemini in Settings, use an API key from a workspace that allows browser access, ask an Anthropic org admin to update that policy, or set storage key aiClaudeEndpoint to an HTTPS URL of a proxy you run that forwards to Anthropic\u2019s Messages API (same request/response shape as /v1/messages).',
      source: 'ai',
      supportKey: 'technicalSupport',
      supportUrl: PENDO_SUPPORT.technicalSupport,
    }]
    const result = classifyAdvice(advice, [], [])
    expect(result.err).toHaveLength(0)
    expect(result.warn).toHaveLength(1)
    expect(result.warn[0].supportKey).toBe('technicalSupport')
    expect(result.warn[0].supportUrl).toBe(PENDO_SUPPORT.technicalSupport)
    expect(result.warn[0].source).toBe('ai')
  })
})
