import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'extension/manifest.json'), 'utf8'),
)

describe('manifest permissions (Firefox)', () => {
  it('declares the cross-browser permissions the extension needs', () => {
    expect(manifest.permissions).toEqual(
      expect.arrayContaining(['scripting', 'activeTab', 'storage', 'tabs', 'management']),
    )
  })

  it('omits Chrome-only permissions that Firefox does not support', () => {
    // getProfileUserInfo (identity/identity.email) and the CDP debugger API are
    // Chrome-only; Firefox rejects/flags them, so the Firefox build drops them.
    expect(manifest.permissions).not.toContain('debugger')
    expect(manifest.permissions).not.toContain('identity')
    expect(manifest.permissions).not.toContain('identity.email')
  })
})

describe('manifest Firefox compatibility', () => {
  it('sets a stable Gecko add-on id and a minimum version for MAIN-world support', () => {
    expect(manifest.browser_specific_settings?.gecko?.id).toBeTruthy()
    expect(manifest.browser_specific_settings?.gecko?.strict_min_version).toBe('128.0')
  })

  it('provides a background scripts fallback for Firefox event pages', () => {
    expect(manifest.background.scripts).toEqual(['background.js'])
    // Keep the Chrome service worker entry for cross-browser parity.
    expect(manifest.background.service_worker).toBe('background.js')
  })
})
