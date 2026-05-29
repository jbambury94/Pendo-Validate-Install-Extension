import { describe, it, expect, beforeEach } from 'vitest'
import {
  applyTheme,
  loadThemePreference,
  saveThemePreference,
  PENDO_THEME_KEY,
  THEME_STORAGE_KEY,
} from './helpers.js'

describe('applyTheme', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.theme
  })

  it('sets data-theme="dark" when called with "dark"', () => {
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('sets data-theme="light" when called with "light"', () => {
    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('removes the attribute when called with "system"', () => {
    document.documentElement.dataset.theme = 'dark'
    applyTheme('system')
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('removes the attribute for unknown values', () => {
    document.documentElement.dataset.theme = 'light'
    applyTheme('auto')
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('removes the attribute for null', () => {
    document.documentElement.dataset.theme = 'dark'
    applyTheme(null)
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('accepts a custom root element', () => {
    const el = document.createElement('div')
    applyTheme('dark', el)
    expect(el.dataset.theme).toBe('dark')
  })
})

describe('loadThemePreference', () => {
  it('returns "dark" when stored value is "dark"', async () => {
    chrome.storage.local.get.mockImplementation((_defaults, cb) => cb({ [THEME_STORAGE_KEY]: 'dark' }))
    expect(await loadThemePreference()).toBe('dark')
  })

  it('returns "light" when stored value is "light"', async () => {
    chrome.storage.local.get.mockImplementation((_defaults, cb) => cb({ [THEME_STORAGE_KEY]: 'light' }))
    expect(await loadThemePreference()).toBe('light')
  })

  it('returns "system" when storage is empty', async () => {
    chrome.storage.local.get.mockImplementation((_defaults, cb) => cb({ [THEME_STORAGE_KEY]: 'system' }))
    expect(await loadThemePreference()).toBe('system')
  })

  it('returns "system" when stored value is a number', async () => {
    chrome.storage.local.get.mockImplementation((_defaults, cb) => cb({ [THEME_STORAGE_KEY]: 42 }))
    expect(await loadThemePreference()).toBe('system')
  })

  it('returns "system" when stored value is a random string', async () => {
    chrome.storage.local.get.mockImplementation((_defaults, cb) => cb({ [THEME_STORAGE_KEY]: 'neon' }))
    expect(await loadThemePreference()).toBe('system')
  })

  it('returns "system" when chrome.storage.local is null', async () => {
    const savedLocal = chrome.storage.local
    chrome.storage.local = null
    expect(await loadThemePreference()).toBe('system')
    chrome.storage.local = savedLocal
  })

  it('returns "system" when chrome.storage is null', async () => {
    const savedStorage = chrome.storage
    chrome.storage = null
    expect(await loadThemePreference()).toBe('system')
    chrome.storage = savedStorage
  })

  it('returns "system" when chrome.storage.local.get throws', async () => {
    chrome.storage.local.get.mockImplementation(() => { throw new Error('fail') })
    expect(await loadThemePreference()).toBe('system')
  })
})

describe('saveThemePreference', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('writes dark to chrome.storage.local and localStorage', async () => {
    await saveThemePreference('dark')
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      { [THEME_STORAGE_KEY]: 'dark' },
      expect.any(Function),
    )
    expect(localStorage.getItem(PENDO_THEME_KEY)).toBe('dark')
  })

  it('writes light to chrome.storage.local and localStorage', async () => {
    await saveThemePreference('light')
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      { [THEME_STORAGE_KEY]: 'light' },
      expect.any(Function),
    )
    expect(localStorage.getItem(PENDO_THEME_KEY)).toBe('light')
  })

  it('clears localStorage key when given "system"', async () => {
    localStorage.setItem(PENDO_THEME_KEY, 'dark')
    await saveThemePreference('system')
    expect(localStorage.getItem(PENDO_THEME_KEY)).toBeNull()
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      { [THEME_STORAGE_KEY]: 'system' },
      expect.any(Function),
    )
  })

  it('resolves cleanly when chrome.storage.local is null', async () => {
    const savedLocal = chrome.storage.local
    chrome.storage.local = null
    await expect(saveThemePreference('dark')).resolves.toBeUndefined()
    chrome.storage.local = savedLocal
  })

  it('resolves cleanly when chrome.storage is null', async () => {
    const savedStorage = chrome.storage
    chrome.storage = null
    await expect(saveThemePreference('light')).resolves.toBeUndefined()
    chrome.storage = savedStorage
  })
})
