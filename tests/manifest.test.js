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
  it('exposes every runtime asset the overlay iframe loads', () => {
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
        // Fetched via runtime.getURL() from the panel context (CDP evaluate + AI prompt enrichment).
        'capture-inspect.js',
        'enable-debugging.js',
        'pendo-install-quality.md',
      ]),
    )
  })
})
describe('manifest version', () => {
  it('version matches the current release', () => {
    expect(manifest.version).toBe('1.8.3')
  })
})
