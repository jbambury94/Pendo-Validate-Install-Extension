import { describe, it, expect, vi } from 'vitest'
import { FEATURE_REGISTRY, registryWithEnabled } from './setup.js'

// feature-flags.js is loaded into this realm by tests/setup.js, matching how the panel loads it
// before popup.js and how the service worker importScripts it.

const ALL_GATES = ['harDownload', 'cspProbe', 'aiAdvice']
const WITH_DEBUGGER = { debugger: true }

describe('feature-flags.json registry', () => {
  it('ships every gate switched off, so nothing unbaked reaches users by default', () => {
    for (const [key, entry] of Object.entries(FEATURE_REGISTRY)) {
      expect(entry.default, `${key} must ship off`).toBe(false)
    }
  })

  it('registers exactly the gates the extension reads', () => {
    expect(Object.keys(FEATURE_REGISTRY).sort()).toEqual([...ALL_GATES].sort())
  })

  it('describes each gate well enough to be understood from the file alone', () => {
    for (const [key, entry] of Object.entries(FEATURE_REGISTRY)) {
      expect(typeof entry.label, key).toBe('string')
      expect(entry.label.length, key).toBeGreaterThan(0)
      expect(entry.description.length, key).toBeGreaterThan(20)
      expect(['preview', 'unimplemented'], key).toContain(entry.stage)
    }
  })

  it('marks cspProbe as unimplemented and dependent on CDP', () => {
    expect(FEATURE_REGISTRY.cspProbe.stage).toBe('unimplemented')
    expect(FEATURE_REGISTRY.cspProbe.requires).toEqual(['debugger'])
  })
})

describe('normalizeFeatureRegistry', () => {
  it('fills in defaults for a sparse entry', () => {
    const reg = normalizeFeatureRegistry({ thing: {} })
    expect(reg.thing).toEqual({ default: false, label: 'thing', description: '', stage: 'preview', requires: [] })
  })

  it('treats any non-true default as off', () => {
    const reg = normalizeFeatureRegistry({ a: { default: 'true' }, b: { default: 1 }, c: { default: true } })
    expect(reg.a.default).toBe(false)
    expect(reg.b.default).toBe(false)
    expect(reg.c.default).toBe(true)
  })

  it('drops entries that are not objects', () => {
    const reg = normalizeFeatureRegistry({ good: { default: true }, bad: 'yes', worse: null, arr: [] })
    expect(Object.keys(reg)).toEqual(['good'])
  })

  it('returns an empty registry for junk input, which closes every gate', () => {
    expect(normalizeFeatureRegistry(null)).toEqual({})
    expect(normalizeFeatureRegistry('nope')).toEqual({})
    expect(normalizeFeatureRegistry([{ default: true }])).toEqual({})
  })

  it('keeps only string capability names in requires', () => {
    expect(normalizeFeatureRegistry({ a: { requires: ['debugger', 7, null] } }).a.requires).toEqual(['debugger'])
    expect(normalizeFeatureRegistry({ a: { requires: 'debugger' } }).a.requires).toEqual([])
  })
})

describe('normalizeFeatureOverrides', () => {
  it('keeps booleans and discards everything else', () => {
    expect(normalizeFeatureOverrides({ a: true, b: false, c: 'true', d: 1, e: null, f: {} }))
      .toEqual({ a: true, b: false })
  })

  it('returns an empty object for junk input, so a corrupt value cannot open a gate', () => {
    expect(normalizeFeatureOverrides(null)).toEqual({})
    expect(normalizeFeatureOverrides('harDownload')).toEqual({})
    expect(normalizeFeatureOverrides(['harDownload'])).toEqual({})
  })
})

describe('resolveFeatureState', () => {
  it('resolves the shipped registry to all-off with no overrides', () => {
    const state = resolveFeatureState(FEATURE_REGISTRY, {}, WITH_DEBUGGER)
    expect(state).toEqual({ harDownload: false, cspProbe: false, aiAdvice: false })
  })

  it('lets a local override open a gate the build ships closed', () => {
    const state = resolveFeatureState(FEATURE_REGISTRY, { harDownload: true }, WITH_DEBUGGER)
    expect(state.harDownload).toBe(true)
    expect(state.aiAdvice).toBe(false)
  })

  it('lets a local override close a gate the build ships open', () => {
    const state = resolveFeatureState(registryWithEnabled('aiAdvice'), { aiAdvice: false }, WITH_DEBUGGER)
    expect(state.aiAdvice).toBe(false)
  })

  it('ignores overrides for keys that are not in the registry', () => {
    const state = resolveFeatureState(FEATURE_REGISTRY, { notAFeature: true }, WITH_DEBUGGER)
    expect(state.notAFeature).toBeUndefined()
    expect(Object.keys(state).sort()).toEqual([...ALL_GATES].sort())
  })

  it('ignores a non-boolean override and falls back to the shipped default', () => {
    const registry = registryWithEnabled('harDownload')
    expect(resolveFeatureState(registry, { harDownload: 'false' }, WITH_DEBUGGER).harDownload).toBe(true)
    expect(resolveFeatureState(FEATURE_REGISTRY, { harDownload: 'true' }, WITH_DEBUGGER).harDownload).toBe(false)
  })

  it('keeps a gate closed when a required capability is missing, even if it was opted into', () => {
    const state = resolveFeatureState(FEATURE_REGISTRY, { cspProbe: true }, { debugger: false })
    expect(state.cspProbe).toBe(false)
  })

  it('opens a capability-dependent gate once the capability is present', () => {
    expect(resolveFeatureState(FEATURE_REGISTRY, { cspProbe: true }, WITH_DEBUGGER).cspProbe).toBe(true)
  })

  it('treats absent capabilities as unavailable rather than assuming support', () => {
    expect(resolveFeatureState(FEATURE_REGISTRY, { cspProbe: true }, undefined).cspProbe).toBe(false)
    expect(resolveFeatureState(FEATURE_REGISTRY, { cspProbe: true }, {}).cspProbe).toBe(false)
  })

  it('leaves HAR free of capability requirements, because Firefox has the Resource Timing path', () => {
    expect(resolveFeatureState(FEATURE_REGISTRY, { harDownload: true }, { debugger: false }).harDownload).toBe(true)
  })

  it('produces an empty state when the registry failed to load', () => {
    expect(resolveFeatureState({}, { harDownload: true }, WITH_DEBUGGER)).toEqual({})
  })
})

describe('isFeatureEnabled', () => {
  it('is true only for an exact boolean true', () => {
    expect(isFeatureEnabled({ a: true }, 'a')).toBe(true)
    expect(isFeatureEnabled({ a: false }, 'a')).toBe(false)
    expect(isFeatureEnabled({ a: 'true' }, 'a')).toBe(false)
    expect(isFeatureEnabled({}, 'a')).toBe(false)
    expect(isFeatureEnabled(null, 'a')).toBe(false)
  })
})

describe('detectFeatureCapabilities', () => {
  it('reports the debugger capability from chrome.debugger.attach', () => {
    expect(detectFeatureCapabilities({ debugger: { attach: () => {} } })).toEqual({ debugger: true })
  })

  it('reports no debugger on Firefox, where the permission is stripped from the build', () => {
    expect(detectFeatureCapabilities({})).toEqual({ debugger: false })
    expect(detectFeatureCapabilities(undefined)).toEqual({ debugger: false })
  })
})

describe('loadFeatureRegistry', () => {
  const runtime = { getURL: (p) => `chrome-extension://test/${p}` }

  it('fetches and normalizes feature-flags.json', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ a: { default: true } }) }))
    await expect(loadFeatureRegistry(runtime, fetchImpl)).resolves.toMatchObject({ a: { default: true } })
    expect(fetchImpl).toHaveBeenCalledWith('chrome-extension://test/feature-flags.json')
  })

  it('returns an empty registry when the file is missing', async () => {
    await expect(loadFeatureRegistry(runtime, async () => ({ ok: false, status: 404 }))).resolves.toEqual({})
  })

  it('returns an empty registry when the file is not valid JSON', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => { throw new SyntaxError('bad json') } })
    await expect(loadFeatureRegistry(runtime, fetchImpl)).resolves.toEqual({})
  })

  it('returns an empty registry when fetch throws or the runtime is unavailable', async () => {
    await expect(loadFeatureRegistry(runtime, async () => { throw new Error('offline') })).resolves.toEqual({})
    await expect(loadFeatureRegistry(null, async () => ({ ok: true, json: async () => ({}) }))).resolves.toEqual({})
  })
})

describe('readFeatureOverrides', () => {
  it('reads the featureOverrides key via the callback form', async () => {
    const storage = { get: vi.fn((_defaults, cb) => cb({ featureOverrides: { harDownload: true } })) }
    await expect(readFeatureOverrides(storage)).resolves.toEqual({ harDownload: true })
  })

  it('reads the featureOverrides key via the promise form used by browser.*', async () => {
    const storage = { get: vi.fn(() => Promise.resolve({ featureOverrides: { aiAdvice: true } })) }
    await expect(readFeatureOverrides(storage)).resolves.toEqual({ aiAdvice: true })
  })

  it('sanitizes what it reads, so a hand-edited value cannot open a gate', async () => {
    const storage = { get: vi.fn((_d, cb) => cb({ featureOverrides: { harDownload: 'yes' } })) }
    await expect(readFeatureOverrides(storage)).resolves.toEqual({})
  })

  it('resolves empty when storage is unavailable or throws', async () => {
    await expect(readFeatureOverrides(null)).resolves.toEqual({})
    await expect(readFeatureOverrides({ get: () => { throw new Error('no storage') } })).resolves.toEqual({})
    await expect(readFeatureOverrides({ get: () => Promise.reject(new Error('denied')) })).resolves.toEqual({})
  })
})

describe('writeFeatureOverride', () => {
  it('merges a single gate into the existing overrides', async () => {
    let stored = { aiAdvice: true }
    const storage = {
      get: vi.fn((_d, cb) => cb({ featureOverrides: stored })),
      set: vi.fn((data, cb) => { stored = data.featureOverrides; cb() }),
    }
    await expect(writeFeatureOverride(storage, 'harDownload', true)).resolves.toEqual({ aiAdvice: true, harDownload: true })
    expect(stored).toEqual({ aiAdvice: true, harDownload: true })
  })

  it('coerces the value to a boolean before storing', async () => {
    const storage = { get: vi.fn((_d, cb) => cb({})), set: vi.fn((_d, cb) => cb()) }
    await expect(writeFeatureOverride(storage, 'harDownload', 'truthy')).resolves.toEqual({ harDownload: true })
  })

  it('clearFeatureOverrides wipes the whole object back to the shipped defaults', async () => {
    const storage = { get: vi.fn((_d, cb) => cb({ featureOverrides: { harDownload: true } })), set: vi.fn((_d, cb) => cb()) }
    await expect(clearFeatureOverrides(storage)).resolves.toEqual({})
    expect(storage.set).toHaveBeenCalledWith({ featureOverrides: {} }, expect.any(Function))
  })
})

describe('isFeatureOverridesChange', () => {
  it('matches a local-area change to the overrides key', () => {
    expect(isFeatureOverridesChange({ featureOverrides: { newValue: {} } }, 'local')).toBe(true)
  })

  it('ignores other keys and other storage areas', () => {
    expect(isFeatureOverridesChange({ themePreference: { newValue: 'dark' } }, 'local')).toBe(false)
    expect(isFeatureOverridesChange({ featureOverrides: { newValue: {} } }, 'sync')).toBe(false)
    expect(isFeatureOverridesChange(null, 'local')).toBe(false)
  })
})

describe('loadFeatureState', () => {
  it('combines the shipped registry with local overrides and capabilities', async () => {
    const loaded = await loadFeatureState({
      runtime: { getURL: (p) => p },
      storage: { get: (_d, cb) => cb({ featureOverrides: { harDownload: true, cspProbe: true } }) },
      api: { debugger: { attach: () => {} } },
      fetchImpl: async () => ({ ok: true, json: async () => FEATURE_REGISTRY }),
    })
    expect(loaded.state).toEqual({ harDownload: true, cspProbe: true, aiAdvice: false })
    expect(loaded.overrides).toEqual({ harDownload: true, cspProbe: true })
    expect(loaded.registry.harDownload.label).toBe('HAR download')
  })

  it('closes every gate when nothing can be read', async () => {
    const loaded = await loadFeatureState({})
    expect(loaded.state).toEqual({})
    expect(loaded.registry).toEqual({})
    expect(loaded.overrides).toEqual({})
  })

  it('keeps cspProbe shut on a build without the debugger permission', async () => {
    const loaded = await loadFeatureState({
      runtime: { getURL: (p) => p },
      storage: { get: (_d, cb) => cb({ featureOverrides: { cspProbe: true, harDownload: true } }) },
      api: {},
      fetchImpl: async () => ({ ok: true, json: async () => FEATURE_REGISTRY }),
    })
    expect(loaded.state.cspProbe).toBe(false)
    expect(loaded.state.harDownload).toBe(true)
  })
})
