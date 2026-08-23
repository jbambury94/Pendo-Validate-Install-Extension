import { describe, it, expect } from 'vitest'
import { assessInstallQuality } from './helpers.js'

describe('assessInstallQuality', () => {
  const goodContext = {
    pageUrl: 'https://app.example.com/dashboard',
    status: {
      visitorId: 'user-abc-123',
      accountId: 'acme-corp-456',
      visitorMetadata: { id: 'user-abc-123', email: 'alice@example.com', name: 'Alice', role: 'admin' },
      accountMetadata: { id: 'acme-corp-456', name: 'Acme Corp', plan: 'enterprise' },
    },
  }

  it('returns all-good for a healthy install', () => {
    const result = assessInstallQuality(goodContext)
    expect(result.visitorId.quality).toBe('good')
    expect(result.accountId.quality).toBe('good')
    expect(result.visitorMetadata.quality).toBe('good')
    expect(result.accountMetadata.quality).toBe('good')
    expect(result.environment.isStaging).toBe(false)
    expect(result.environment.issues).toHaveLength(0)
  })

  describe('visitorId', () => {
    it('flags placeholder visitorId as poor', () => {
      const ctx = { ...goodContext, status: { ...goodContext.status, visitorId: 'anonymous' } }
      const result = assessInstallQuality(ctx)
      expect(result.visitorId.quality).toBe('poor')
      expect(result.visitorId.issues[0]).toContain('placeholder')
    })

    it('flags very short visitorId as weak', () => {
      const ctx = { ...goodContext, status: { ...goodContext.status, visitorId: 'ab' } }
      const result = assessInstallQuality(ctx)
      expect(result.visitorId.quality).toBe('weak')
      expect(result.visitorId.issues[0]).toContain('short')
    })

    it('flags low numeric counter as weak', () => {
      const ctx = { ...goodContext, status: { ...goodContext.status, visitorId: '1' } }
      const result = assessInstallQuality(ctx)
      expect(result.visitorId.quality).toBe('weak')
    })

    it('does not flag email as visitorId', () => {
      const ctx = { ...goodContext, status: { ...goodContext.status, visitorId: 'alice@example.com' } }
      const result = assessInstallQuality(ctx)
      expect(result.visitorId.quality).toBe('good')
    })

    it('does not flag a UUID as weak', () => {
      const ctx = { ...goodContext, status: { ...goodContext.status, visitorId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' } }
      const result = assessInstallQuality(ctx)
      expect(result.visitorId.quality).toBe('good')
    })
  })

  describe('accountId', () => {
    it('flags placeholder accountId as poor', () => {
      const ctx = { ...goodContext, status: { ...goodContext.status, accountId: 'test' } }
      const result = assessInstallQuality(ctx)
      expect(result.accountId.quality).toBe('poor')
      expect(result.accountId.issues[0]).toContain('placeholder')
    })

    it('flags accountId === visitorId as weak', () => {
      const ctx = { ...goodContext, status: { ...goodContext.status, visitorId: 'user-123', accountId: 'user-123' } }
      const result = assessInstallQuality(ctx)
      expect(result.accountId.quality).toBe('weak')
      expect(result.accountId.issues[0]).toContain('identical')
    })

    it('does not flag null accountId (just marks not present)', () => {
      const ctx = { ...goodContext, status: { ...goodContext.status, accountId: null } }
      const result = assessInstallQuality(ctx)
      expect(result.accountId.present).toBe(false)
      expect(result.accountId.quality).toBe('good')
    })
  })

  describe('visitorMetadata', () => {
    it('flags no metadata when visitorId is set as poor', () => {
      const ctx = { ...goodContext, status: { ...goodContext.status, visitorMetadata: null } }
      const result = assessInstallQuality(ctx)
      expect(result.visitorMetadata.quality).toBe('poor')
      expect(result.visitorMetadata.missingRecommended).toContain('email')
    })

    it('flags empty metadata object as poor', () => {
      const ctx = { ...goodContext, status: { ...goodContext.status, visitorMetadata: { id: 'x' } } }
      const result = assessInstallQuality(ctx)
      expect(result.visitorMetadata.quality).toBe('poor')
    })

    it('flags missing recommended fields as weak', () => {
      const ctx = { ...goodContext, status: { ...goodContext.status, visitorMetadata: { id: 'x', customField: 'val' } } }
      const result = assessInstallQuality(ctx)
      expect(result.visitorMetadata.quality).toBe('weak')
      expect(result.visitorMetadata.missingRecommended.length).toBeGreaterThanOrEqual(2)
    })

    it('reports good when email and name are present', () => {
      const ctx = { ...goodContext, status: { ...goodContext.status, visitorMetadata: { email: 'a@b.c', name: 'A' } } }
      const result = assessInstallQuality(ctx)
      expect(result.visitorMetadata.quality).toBe('good')
    })
  })

  describe('accountMetadata', () => {
    it('flags no metadata when accountId is set as poor', () => {
      const ctx = { ...goodContext, status: { ...goodContext.status, accountMetadata: null } }
      const result = assessInstallQuality(ctx)
      expect(result.accountMetadata.quality).toBe('poor')
    })

    it('reports good when name and plan are present', () => {
      const ctx = { ...goodContext, status: { ...goodContext.status, accountMetadata: { name: 'Acme', plan: 'pro' } } }
      const result = assessInstallQuality(ctx)
      expect(result.accountMetadata.quality).toBe('good')
    })
  })

  describe('parentAccount', () => {
    it('does not penalize absence of parentAccountId', () => {
      const result = assessInstallQuality(goodContext)
      expect(result.parentAccount.present).toBe(false)
      expect(result.parentAccount.quality).toBe('good')
    })

    it('reports good when parentAccountId matches accountId (valid rollup pattern)', () => {
      const ctx = {
        ...goodContext,
        status: {
          ...goodContext.status,
          parentAccountId: 'acme-corp-456',
          parentAccountMetadata: { id: 'acme-corp-456', name: 'Acme Corp' },
        },
      }
      const result = assessInstallQuality(ctx)
      expect(result.parentAccount.present).toBe(true)
      expect(result.parentAccount.quality).toBe('good')
      expect(result.parentAccountMetadata.quality).toBe('good')
    })

    it('flags placeholder parentAccountId as poor', () => {
      const ctx = {
        ...goodContext,
        status: {
          ...goodContext.status,
          parentAccountId: 'test',
          parentAccountMetadata: { id: 'test' },
        },
      }
      const result = assessInstallQuality(ctx)
      expect(result.parentAccount.quality).toBe('poor')
    })

    it('flags parentAccountId identical to visitorId as weak', () => {
      const ctx = {
        ...goodContext,
        status: {
          ...goodContext.status,
          parentAccountId: 'user-abc-123',
          parentAccountMetadata: { id: 'user-abc-123' },
        },
      }
      const result = assessInstallQuality(ctx)
      expect(result.parentAccount.quality).toBe('weak')
    })
  })

  describe('environment', () => {
    it('flags staging URL without test prefix on visitorId', () => {
      const ctx = { pageUrl: 'https://staging.app.com', status: { ...goodContext.status, visitorId: 'user-123' } }
      const result = assessInstallQuality(ctx)
      expect(result.environment.isStaging).toBe(true)
      expect(result.environment.issues[0]).toContain('test prefix')
    })

    it('does not flag staging URL when visitorId has test prefix', () => {
      const ctx = { pageUrl: 'https://staging.app.com', status: { ...goodContext.status, visitorId: 'staging_user-123' } }
      const result = assessInstallQuality(ctx)
      expect(result.environment.isStaging).toBe(true)
      expect(result.environment.issues).toHaveLength(0)
    })

    it('does not flag production URLs', () => {
      const result = assessInstallQuality(goodContext)
      expect(result.environment.isStaging).toBe(false)
    })
  })
})
