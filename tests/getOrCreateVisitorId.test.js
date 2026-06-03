import { describe, it, expect, vi } from 'vitest'
import { getOrCreateVisitorId, getProfileEmail, PENDO_VISITOR_ID_KEY } from './helpers.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('getProfileEmail', () => {
  it('returns lowercased email from chrome.identity', async () => {
    chrome.identity.getProfileUserInfo.mockImplementation((_opts, cb) => cb({ email: 'Foo@Pendo.io', id: '123' }))
    expect(await getProfileEmail()).toBe('foo@pendo.io')
  })

  it('returns empty string when email is empty', async () => {
    chrome.identity.getProfileUserInfo.mockImplementation((_opts, cb) => cb({ email: '', id: '' }))
    expect(await getProfileEmail()).toBe('')
  })

  it('returns empty string when chrome.identity is undefined', async () => {
    const saved = chrome.identity
    chrome.identity = undefined
    expect(await getProfileEmail()).toBe('')
    chrome.identity = saved
  })

  it('returns empty string when getProfileUserInfo throws', async () => {
    chrome.identity.getProfileUserInfo.mockImplementation(() => { throw new Error('fail') })
    expect(await getProfileEmail()).toBe('')
  })

  it('returns empty string when runtime.lastError is set', async () => {
    chrome.runtime.lastError = { message: 'some error' }
    chrome.identity.getProfileUserInfo.mockImplementation((_opts, cb) => cb({ email: '', id: '' }))
    expect(await getProfileEmail()).toBe('')
    chrome.runtime.lastError = null
  })
})

describe('getOrCreateVisitorId', () => {
  describe('email path (@pendo.io profile)', () => {
    it('returns lowercased email when profile is @pendo.io', async () => {
      chrome.identity.getProfileUserInfo.mockImplementation((_opts, cb) => cb({ email: 'John@Pendo.io', id: '1' }))
      expect(await getOrCreateVisitorId()).toBe('john@pendo.io')
    })

    it('does not read storage when @pendo.io email is found', async () => {
      chrome.identity.getProfileUserInfo.mockImplementation((_opts, cb) => cb({ email: 'dev@pendo.io', id: '1' }))
      await getOrCreateVisitorId()
      expect(chrome.storage.local.get).not.toHaveBeenCalled()
    })

    it('falls through to UUID when email is not @pendo.io', async () => {
      chrome.identity.getProfileUserInfo.mockImplementation((_opts, cb) => cb({ email: 'foo@example.com', id: '1' }))
      chrome.storage.local.get.mockImplementation((_keys, cb) => cb({}))
      const id = await getOrCreateVisitorId()
      expect(id).toMatch(UUID_PATTERN)
    })

    it('falls through to UUID when email is empty (signed out)', async () => {
      chrome.identity.getProfileUserInfo.mockImplementation((_opts, cb) => cb({ email: '', id: '' }))
      chrome.storage.local.get.mockImplementation((_keys, cb) => cb({}))
      const id = await getOrCreateVisitorId()
      expect(id).toMatch(UUID_PATTERN)
    })

    it('falls through to UUID when chrome.identity is undefined', async () => {
      const saved = chrome.identity
      chrome.identity = undefined
      chrome.storage.local.get.mockImplementation((_keys, cb) => cb({}))
      const id = await getOrCreateVisitorId()
      expect(id).toMatch(UUID_PATTERN)
      chrome.identity = saved
    })

    it('falls through to UUID when getProfileUserInfo throws', async () => {
      chrome.identity.getProfileUserInfo.mockImplementation(() => { throw new Error('fail') })
      chrome.storage.local.get.mockImplementation((_keys, cb) => cb({}))
      const id = await getOrCreateVisitorId()
      expect(id).toMatch(UUID_PATTERN)
    })
  })

  describe('UUID fallback path', () => {
    it('returns an existing UUID from storage', async () => {
      chrome.storage.local.get.mockImplementation((_keys, cb) => cb({ [PENDO_VISITOR_ID_KEY]: 'stored-uuid-1234' }))
      expect(await getOrCreateVisitorId()).toBe('stored-uuid-1234')
    })

    it('does not write to storage when an existing ID is found', async () => {
      chrome.storage.local.get.mockImplementation((_keys, cb) => cb({ [PENDO_VISITOR_ID_KEY]: 'stored-uuid-1234' }))
      await getOrCreateVisitorId()
      expect(chrome.storage.local.set).not.toHaveBeenCalled()
    })

    it('generates and stores a new UUID when storage returns empty', async () => {
      chrome.storage.local.get.mockImplementation((_keys, cb) => cb({}))
      const id = await getOrCreateVisitorId()
      expect(id).toMatch(UUID_PATTERN)
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({ [PENDO_VISITOR_ID_KEY]: id }),
      )
    })

    it('generates a new UUID when stored value is not a string', async () => {
      chrome.storage.local.get.mockImplementation((_keys, cb) => cb({ [PENDO_VISITOR_ID_KEY]: 42 }))
      const id = await getOrCreateVisitorId()
      expect(id).toMatch(UUID_PATTERN)
    })

    it('generates a new UUID when stored value is an empty string', async () => {
      chrome.storage.local.get.mockImplementation((_keys, cb) => cb({ [PENDO_VISITOR_ID_KEY]: '' }))
      const id = await getOrCreateVisitorId()
      expect(id).toMatch(UUID_PATTERN)
    })

    it('falls back to crypto.randomUUID when chrome.storage.local is null', async () => {
      const savedLocal = chrome.storage.local
      chrome.storage.local = null
      const id = await getOrCreateVisitorId()
      expect(id).toMatch(UUID_PATTERN)
      chrome.storage.local = savedLocal
    })

    it('falls back to crypto.randomUUID when chrome.storage is null', async () => {
      const savedStorage = chrome.storage
      chrome.storage = null
      const id = await getOrCreateVisitorId()
      expect(id).toMatch(UUID_PATTERN)
      chrome.storage = savedStorage
    })

    it('falls back to crypto.randomUUID when storage.get throws', async () => {
      chrome.storage.local.get.mockImplementation(() => { throw new Error('storage unavailable') })
      const id = await getOrCreateVisitorId()
      expect(id).toMatch(UUID_PATTERN)
    })
  })
})
