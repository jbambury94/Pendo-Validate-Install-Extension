import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'extension/manifest.json'), 'utf8'),
)

describe('manifest permissions', () => {
  it('declares the identity permissions needed to collect @pendo.io profile emails', () => {
    expect(manifest.permissions).toEqual(
      expect.arrayContaining(['identity', 'identity.email']),
    )
  })
})

describe('manifest web_accessible_resources', () => {
  it('exposes every file popup.html loads inside the overlay iframe', () => {
    const resources = manifest.web_accessible_resources[0].resources
    expect(resources).toEqual(
      expect.arrayContaining([
        'popup.html',
        'popup.css',
        'popup.js',
        'theme-init.js',
        'pendo-kb.js',
        'pendo-loader.js',
        'vendor/pendo.js',
      ]),
    )
  })
})
describe('manifest version', () => {
  it('version matches the current release', () => {
    expect(manifest.version).toBe('1.8.1')
  })
})
