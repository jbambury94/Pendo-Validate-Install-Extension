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

  it('routes captured warn log lines to warn bucket with helpCenter supportUrl', () => {
    const captured = [{ level: 'warn', text: 'Missing visitor' }]
    const result = classifyAdvice([], captured, [])
    expect(result.warn).toHaveLength(1)
    expect(result.warn[0].supportUrl).toBe(PENDO_SUPPORT.helpCenter)
    expect(result.warn[0].source).toBe('captured')
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
})
