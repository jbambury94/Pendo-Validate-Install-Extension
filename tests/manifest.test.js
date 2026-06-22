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
  const resources = manifest.web_accessible_resources[0].resources

  it('exposes the overlay iframe document and the sub-resources it loads from the extension origin', () => {
    expect(resources).toEqual(
      expect.arrayContaining([
        'popup.html',
        'popup.css',
        'popup.js',
        'theme-init.js',
        'pendo-kb.js',
        'pendo-loader.js',
        'vendor/pendo.js',
        'fonts/*.woff2',
      ]),
    )
  })

  it('does not expose scripts that are only injected via executeScript or fetched same-origin', () => {
    // capture-inspect.js / enable-debugging.js are injected with scripting.executeScript({ files })
    // (which does not require WAR) and otherwise fetched same-origin from the panel iframe;
    // pendo-install-quality.md is only fetched same-origin. None are loaded by a web origin, so
    // exposing them only widens the fingerprinting/inspection surface.
    expect(resources).not.toContain('capture-inspect.js')
    expect(resources).not.toContain('enable-debugging.js')
    expect(resources).not.toContain('pendo-install-quality.md')
  })

  it('does not expose the toolbar icon, which the browser loads from manifest.icons (not web pages)', () => {
    expect(resources).not.toContain('icons/*.png')
  })
})
describe('manifest version', () => {
  it('version matches the current release', () => {
    expect(manifest.version).toBe('1.8.4')
  })
})
