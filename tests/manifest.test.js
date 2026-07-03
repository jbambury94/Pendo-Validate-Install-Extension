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
        'capture-inspect.js',
        'enable-debugging.js',
        'theme-init.js',
        'pendo-kb.js',
        'pendo-install-quality.md',
        'vendor/pendo-agent.bundle.js',
        'pendo/*',
        'fonts/*.woff2',
      ]),
    )
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

describe('manifest branding', () => {
  it('uses the customer-facing extension name', () => {
    expect(manifest.name).toBe('Pendo Install Validator')
  })

  it('exposes a short_name for cramped browser UI surfaces', () => {
    expect(manifest.short_name).toBe('Pendo Validator')
  })

  it('sets the toolbar action tooltip', () => {
    expect(manifest.action.default_title).toBe('Validate Pendo install')
  })
})
