import { describe, it, expect } from 'vitest'
import { appendQualityAdviceToResult } from './helpers.js'

// The exact sandbox/staging advice object captureAndInspect emits for a lower-environment
// URL. appendQualityAdviceToResult runs afterwards on the same result, so it must not add
// a second, overlapping sandbox recommendation.
const CAPTURE_STAGING_ADVICE = {
  text: 'This appears to be a staging or development environment. Use unique Visitor/Account ID prefixes and configure an Exclude List to keep test data separate.',
  source: 'builtin',
  supportKey: 'sandbox',
}

function baseResult(overrides = {}) {
  return {
    status: {
      pendoPresent: true,
      visitorId: 'user-123',
      accountId: 'acct-456',
      visitorMetadata: { id: 'user-123', email: 'a@b.c', name: 'Alice', role: 'admin' },
      accountMetadata: { id: 'acct-456', name: 'Acme', plan: 'pro' },
      ...(overrides.status || {}),
    },
    advice: overrides.advice || [],
  }
}

const sandboxCount = (advice) => advice.filter((a) => a && a.supportKey === 'sandbox').length

describe('appendQualityAdviceToResult — sandbox de-duplication', () => {
  it('does not add a second sandbox recommendation when captureAndInspect already added one', () => {
    // Reproduces the pipeline: captureAndInspect pushed the staging advice for a staging
    // URL, then appendQualityAdviceToResult runs for the same staging URL with a visitorId
    // that lacks a test prefix. Only one sandbox recommendation should remain.
    const result = baseResult({ advice: [{ ...CAPTURE_STAGING_ADVICE }] })
    appendQualityAdviceToResult(result, 'https://staging.app.com/dashboard')
    expect(sandboxCount(result.advice)).toBe(1)
  })

  it('adds exactly one sandbox recommendation when captureAndInspect added none (e.g. localhost)', () => {
    // captureAndInspect's URL pattern does not match "localhost", so no sandbox advice
    // exists yet and appendQualityAdviceToResult must supply the only one.
    const result = baseResult()
    appendQualityAdviceToResult(result, 'http://localhost:3000/app')
    expect(sandboxCount(result.advice)).toBe(1)
    expect(result.advice.find((a) => a.supportKey === 'sandbox').text).toContain('test prefix')
  })

  it('adds no sandbox recommendation when the staging visitorId already has a test prefix', () => {
    const result = baseResult({ status: { visitorId: 'staging_user-123' } })
    appendQualityAdviceToResult(result, 'https://staging.app.com/dashboard')
    expect(sandboxCount(result.advice)).toBe(0)
  })

  it('adds no sandbox recommendation on a production URL', () => {
    const result = baseResult()
    appendQualityAdviceToResult(result, 'https://app.example.com/dashboard')
    expect(sandboxCount(result.advice)).toBe(0)
  })

  it('is a no-op when Pendo is not present', () => {
    const result = { status: { pendoPresent: false, visitorId: 'user-123' }, advice: [] }
    appendQualityAdviceToResult(result, 'https://staging.app.com/dashboard')
    expect(result.advice).toHaveLength(0)
  })
})
