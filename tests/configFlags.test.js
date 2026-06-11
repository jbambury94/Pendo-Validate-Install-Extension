import { describe, it, expect } from 'vitest'
import {
  assessConfigFlags,
  appendConfigFlagsAdviceToResult,
  normalizeAdviceList,
  classifyAdvice,
  ERR_SUPPORT_KEYS,
} from './helpers.js'

describe('assessConfigFlags', () => {
  it('returns detected:false when configKeys is absent/null', () => {
    expect(assessConfigFlags({ configKeys: null })).toEqual({ detected: false, flags: [] })
    expect(assessConfigFlags({})).toEqual({ detected: false, flags: [] })
    expect(assessConfigFlags(undefined)).toEqual({ detected: false, flags: [] })
  })

  it('treats visitor/account/apiKey/publicAppId as standard (no flags)', () => {
    const r = assessConfigFlags({ configKeys: ['visitor', 'account', 'apiKey', 'publicAppId'] })
    expect(r.detected).toBe(true)
    expect(r.flags).toEqual([])
  })

  it('flags non-standard keys with their config-doc category', () => {
    const r = assessConfigFlags({
      configKeys: ['visitor', 'account', 'disableCookies', 'excludeAllText', 'recording', 'networkLogs', 'guides'],
    })
    expect(r.detected).toBe(true)
    expect(r.flags).toEqual([
      { key: 'disableCookies', category: 'core' },
      { key: 'excludeAllText', category: 'analytics' },
      { key: 'recording', category: 'replay' },
      { key: 'networkLogs', category: 'networkLogs' },
      { key: 'guides', category: 'guides' },
    ])
  })

  it('maps unrecognised/custom keys to a null category', () => {
    const r = assessConfigFlags({ configKeys: ['visitor', 'myCustomThing'] })
    expect(r.flags).toEqual([{ key: 'myCustomThing', category: null }])
  })
})

describe('appendConfigFlagsAdviceToResult', () => {
  const baseResult = (configKeys) => ({ status: { pendoPresent: true, configKeys }, advice: [], checks: [] })

  it('is a no-op when pendo is not present', () => {
    const result = { status: { pendoPresent: false, configKeys: ['disableCookies'] }, advice: [], checks: [] }
    appendConfigFlagsAdviceToResult(result)
    expect(result.advice).toEqual([])
    expect(result.checks).toEqual([])
  })

  it('is a no-op when init options were not readable (configKeys null)', () => {
    const result = baseResult(null)
    appendConfigFlagsAdviceToResult(result)
    expect(result.advice).toEqual([])
    expect(result.checks).toEqual([])
  })

  it('adds a passing check when only standard keys are present', () => {
    const result = baseResult(['visitor', 'account'])
    appendConfigFlagsAdviceToResult(result)
    expect(result.advice).toEqual([])
    expect(result.checks).toContain('Standard configuration detected (visitor + account only).')
  })

  it('adds one grouped warning naming each flag + category and the deduped category links', () => {
    const result = baseResult(['visitor', 'account', 'disableCookies', 'recording'])
    appendConfigFlagsAdviceToResult(result)
    expect(result.advice).toHaveLength(1)
    const a = result.advice[0]
    expect(a.supportKey).toBe('agentConfig')
    expect(a.text).toContain('disableCookies (Core)')
    expect(a.text).toContain('recording (Replay)')
    expect(a.supportKeys).toEqual(['agentConfigCore', 'agentConfigReplay'])
  })

  it('labels unrecognised keys as (other) and contributes no category link', () => {
    const result = baseResult(['visitor', 'customFlag'])
    appendConfigFlagsAdviceToResult(result)
    const a = result.advice[0]
    expect(a.text).toContain('customFlag (other)')
    expect(a.supportKeys).toEqual([])
  })

  it('produces a warning (not an error) that resolves to the config docs via normalize/classify', () => {
    const result = baseResult(['visitor', 'account', 'excludeAllText'])
    appendConfigFlagsAdviceToResult(result)

    expect(ERR_SUPPORT_KEYS.has('agentConfig')).toBe(false)
    const buckets = classifyAdvice(result.advice, [], result.checks)
    expect(buckets.warn.some(w => w.supportKey === 'agentConfig')).toBe(true)
    expect(buckets.err.some(e => e.supportKey === 'agentConfig')).toBe(false)

    const normalized = normalizeAdviceList(result.advice)
    expect(normalized[0].supportUrl).toBe('https://web-sdk.pendo.io/config/')
    expect(normalized[0].relatedSupportUrls.map(r => r.url)).toContain('https://web-sdk.pendo.io/config/analytics')
  })
})
