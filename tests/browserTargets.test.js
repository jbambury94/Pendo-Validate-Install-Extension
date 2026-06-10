import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  FIREFOX_UNSUPPORTED_PERMISSIONS,
  TARGETS,
  transformManifest,
} from '../scripts/browser-targets.mjs'

const sourceManifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'extension/manifest.json'), 'utf8'),
)

describe('transformManifest', () => {
  it('exposes the three supported build targets', () => {
    expect(TARGETS).toEqual(['chrome', 'edge', 'firefox'])
  })

  it('throws on an unknown target', () => {
    expect(() => transformManifest(sourceManifest, 'safari')).toThrow(/Unknown build target/)
  })

  it.each(['chrome', 'edge'])('leaves the manifest unchanged for %s', (target) => {
    const out = transformManifest(sourceManifest, target)
    expect(out).toEqual(sourceManifest)
    expect(out).not.toBe(sourceManifest) // must be a copy, never the source object
  })

  it('never mutates the source manifest', () => {
    const before = structuredClone(sourceManifest)
    for (const target of TARGETS) transformManifest(sourceManifest, target)
    expect(sourceManifest).toEqual(before)
  })

  describe('firefox', () => {
    const out = transformManifest(sourceManifest, 'firefox')

    it('drops the permissions Firefox does not implement', () => {
      for (const permission of FIREFOX_UNSUPPORTED_PERMISSIONS) {
        expect(out.permissions).not.toContain(permission)
      }
    })

    it('keeps every other permission and host permission', () => {
      const kept = sourceManifest.permissions.filter(
        (p) => !FIREFOX_UNSUPPORTED_PERMISSIONS.includes(p),
      )
      expect(out.permissions).toEqual(kept)
      expect(out.host_permissions).toEqual(sourceManifest.host_permissions)
    })

    it('runs the background script as an event page, not a service worker', () => {
      expect(out.background).toEqual({ scripts: ['background.js'] })
      expect(out.background.service_worker).toBeUndefined()
    })

    it('declares gecko settings with an add-on id and Firefox 128 minimum', () => {
      expect(out.browser_specific_settings.gecko.id).toBe('pendo-validate-install@pendo.io')
      expect(out.browser_specific_settings.gecko.strict_min_version).toBe('128.0')
    })

    it('keeps web_accessible_resources identical to the source', () => {
      expect(out.web_accessible_resources).toEqual(sourceManifest.web_accessible_resources)
    })
  })
})
