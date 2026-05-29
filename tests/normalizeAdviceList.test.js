import { describe, it, expect } from 'vitest'
import { normalizeAdviceList, PENDO_SUPPORT, SUPPORT_LABELS } from './helpers.js'

describe('normalizeAdviceList', () => {
  it('returns empty array for empty input', () => {
    expect(normalizeAdviceList([])).toEqual([])
  })

  it('returns empty array when called with no arguments', () => {
    expect(normalizeAdviceList()).toEqual([])
  })

  it('converts a plain string to a builtin advice object with helpCenter URL', () => {
    const result = normalizeAdviceList(['Check your snippet'])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      text: 'Check your snippet',
      source: 'builtin',
      supportUrl: PENDO_SUPPORT.helpCenter,
      supportKey: null,
      relatedSupportUrls: [],
    })
  })

  it('passes through an object that already has supportUrl', () => {
    const result = normalizeAdviceList([{ text: 'Fix it', source: 'builtin', supportUrl: 'https://example.com' }])
    expect(result[0].supportUrl).toBe('https://example.com')
  })

  it('resolves a known supportKey to the corresponding PENDO_SUPPORT URL', () => {
    const result = normalizeAdviceList([{ text: 'Fix CSP', supportKey: 'csp' }])
    expect(result[0].supportUrl).toBe(PENDO_SUPPORT.csp)
  })

  it('resolves supportKey: installGuide', () => {
    const result = normalizeAdviceList([{ text: 'Install snippet', supportKey: 'installGuide' }])
    expect(result[0].supportUrl).toBe(PENDO_SUPPORT.installGuide)
  })

  it('uses technicalSupport URL for ai source without supportKey', () => {
    const result = normalizeAdviceList([{ text: 'AI tip', source: 'ai' }])
    expect(result[0].supportUrl).toBe(PENDO_SUPPORT.technicalSupport)
  })

  it('falls back to helpCenter when supportKey does not exist in PENDO_SUPPORT', () => {
    const result = normalizeAdviceList([{ text: 'tip', supportKey: 'nonExistentKey' }])
    expect(result[0].supportUrl).toBe(PENDO_SUPPORT.helpCenter)
  })

  it('filters out items with empty text', () => {
    const result = normalizeAdviceList([{ text: '', source: 'builtin' }, { text: 'Valid advice' }])
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('Valid advice')
  })

  it('coerces numeric values via String() and assigns builtin source', () => {
    const result = normalizeAdviceList([42])
    expect(result[0].text).toBe('42')
    expect(result[0].source).toBe('builtin')
    expect(result[0].supportUrl).toBe(PENDO_SUPPORT.helpCenter)
  })

  it('defaults source to builtin when object omits source field', () => {
    const result = normalizeAdviceList([{ text: 'Missing source' }])
    expect(result[0].source).toBe('builtin')
  })

  it('processes multiple items in order', () => {
    const result = normalizeAdviceList([
      { text: 'First', source: 'builtin' },
      'Second',
      { text: 'Third', source: 'ai' },
    ])
    expect(result.map(a => a.text)).toEqual(['First', 'Second', 'Third'])
  })

  it('returns supportKey from object input', () => {
    const result = normalizeAdviceList([{ text: 'Fix CSP', supportKey: 'csp' }])
    expect(result[0].supportKey).toBe('csp')
  })

  it('returns supportKey as null for plain string input', () => {
    const result = normalizeAdviceList(['plain text'])
    expect(result[0].supportKey).toBeNull()
  })

  it('always includes relatedSupportUrls array (empty by default)', () => {
    const result = normalizeAdviceList([{ text: 'tip', supportKey: 'csp' }])
    expect(Array.isArray(result[0].relatedSupportUrls)).toBe(true)
    expect(result[0].relatedSupportUrls).toHaveLength(0)
  })

  it('populates relatedSupportUrls from supportKeys array', () => {
    const result = normalizeAdviceList([{
      text: 'SPA with GTM',
      supportKey: 'spa',
      supportKeys: ['spa', 'gtm', 'csp'],
    }])
    expect(result[0].supportUrl).toBe(PENDO_SUPPORT.spa)
    expect(result[0].relatedSupportUrls).toEqual([
      { url: PENDO_SUPPORT.gtm, label: SUPPORT_LABELS.gtm },
      { url: PENDO_SUPPORT.csp, label: SUPPORT_LABELS.csp },
    ])
  })

  it('skips unknown keys in supportKeys array', () => {
    const result = normalizeAdviceList([{
      text: 'test',
      supportKey: 'csp',
      supportKeys: ['csp', 'nonExistentKey', 'gtm'],
    }])
    expect(result[0].relatedSupportUrls).toEqual([
      { url: PENDO_SUPPORT.gtm, label: SUPPORT_LABELS.gtm },
    ])
  })

  it('does not duplicate primary supportKey in relatedSupportUrls', () => {
    const result = normalizeAdviceList([{
      text: 'test',
      supportKey: 'gtm',
      supportKeys: ['gtm', 'iframe'],
    }])
    const relatedKeys = result[0].relatedSupportUrls.map(r => r.url)
    expect(relatedKeys).not.toContain(PENDO_SUPPORT.gtm)
    expect(relatedKeys).toContain(PENDO_SUPPORT.iframe)
  })

  it('legacy single-key form still works identically with empty relatedSupportUrls', () => {
    const result = normalizeAdviceList([{ text: 'Fix CSP', supportKey: 'csp' }])
    expect(result[0]).toEqual({
      text: 'Fix CSP',
      source: 'builtin',
      supportUrl: PENDO_SUPPORT.csp,
      supportKey: 'csp',
      relatedSupportUrls: [],
    })
  })
})
