import { describe, it, expect, vi } from 'vitest'
import { getOrCreateVisitorId, PENDO_VISITOR_ID_KEY } from './helpers.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('getOrCreateVisitorId', () => {
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
