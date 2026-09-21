import { describe, it, expect } from 'vitest'
import {
  PENDO_LAUNCHER_EXTENSION_IDS,
  detectInstalledPendoLauncherFromExtensions,
  launcherDataValidatedForMetadata,
  formatLauncherValidatedSnapshot,
} from './helpers.js'

describe('PENDO_LAUNCHER_EXTENSION_IDS', () => {
  it('includes both known Pendo Launcher Beta store IDs', () => {
    expect(PENDO_LAUNCHER_EXTENSION_IDS.beta).toContain('pndmgfbnmbbgkikpcnndoeknbmlkhgmj')
    expect(PENDO_LAUNCHER_EXTENSION_IDS.beta).toContain('ggbfghmbjlgbagomdlifpdflpeafbekl')
  })
})

describe('detectInstalledPendoLauncherFromExtensions', () => {
  it('returns launcher-beta for either beta extension ID', () => {
    for (const id of PENDO_LAUNCHER_EXTENSION_IDS.beta) {
      const result = detectInstalledPendoLauncherFromExtensions([
        { id, name: 'Pendo Launcher (Beta)', enabled: true },
      ])
      expect(result).toEqual({ variant: 'launcher-beta', id })
    }
  })

  it('returns launcher for stable extension ID', () => {
    const id = PENDO_LAUNCHER_EXTENSION_IDS.stable[0]
    const result = detectInstalledPendoLauncherFromExtensions([
      { id, name: 'Pendo Launcher', enabled: true },
    ])
    expect(result).toEqual({ variant: 'launcher', id })
  })

  it('prefers beta ID match over stable when both enabled', () => {
    const betaId = PENDO_LAUNCHER_EXTENSION_IDS.beta[1]
    const stableId = PENDO_LAUNCHER_EXTENSION_IDS.stable[0]
    const result = detectInstalledPendoLauncherFromExtensions([
      { id: stableId, name: 'Pendo Launcher', enabled: true },
      { id: betaId, name: 'Pendo Launcher (Beta)', enabled: true },
    ])
    expect(result).toEqual({ variant: 'launcher-beta', id: betaId })
  })

  it('falls back to name when ID is unknown', () => {
    const result = detectInstalledPendoLauncherFromExtensions([
      { id: 'unknownbeta123', name: 'Pendo Launcher (Beta)', enabled: true },
    ])
    expect(result).toEqual({ variant: 'launcher-beta', id: 'unknownbeta123' })
  })
})

describe('launcherDataValidatedForMetadata', () => {
  it('omits when Launcher-specific validation was not run', () => {
    expect(launcherDataValidatedForMetadata({ launcherAttempted: true, launcherDataValidated: undefined })).toBeUndefined()
  })

  it('returns true/false when Launcher validation ran', () => {
    expect(launcherDataValidatedForMetadata({ launcherAttempted: true, launcherDataValidated: true })).toBe(true)
    expect(launcherDataValidatedForMetadata({ launcherAttempted: true, launcherDataValidated: false })).toBe(false)
  })
})

describe('formatLauncherValidatedSnapshot', () => {
  it('shows Not checked (snippet) when validated via snippet path', () => {
    expect(formatLauncherValidatedSnapshot({
      launcherAttempted: true,
      snippetOnPage: true,
      validatedIn: 'page',
      launcherDataValidated: undefined,
    })).toBe('Not checked (snippet)')
  })
})
