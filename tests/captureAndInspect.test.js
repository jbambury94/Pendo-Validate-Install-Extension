import { describe, it, expect, beforeEach, vi } from 'vitest'
import { captureAndInspect, assessConfigFlags } from './helpers.js'

beforeEach(() => {
  delete window.pendo
  delete window.Pendo
  document.head.innerHTML = ''
  // Default: no resource entries
  global.performance = { getEntriesByType: vi.fn(() => []) }
})

describe('captureAndInspect — agent detection', () => {
  it('returns pendoPresent: false when window.pendo is absent', () => {
    const result = captureAndInspect()
    expect(result.status.pendoPresent).toBe(false)
    expect(result.status.validatePresent).toBe(false)
  })

  it('returns pendoPresent: true when window.pendo exists', () => {
    window.pendo = { validateInstall: vi.fn() }
    expect(captureAndInspect().status.pendoPresent).toBe(true)
  })

  it('returns validatePresent: false when validateInstall is missing', () => {
    window.pendo = {}
    expect(captureAndInspect().status.validatePresent).toBe(false)
  })

  it('uses window.Pendo for launcher variant', () => {
    window.Pendo = { validateInstall: vi.fn() }
    const result = captureAndInspect('launcher')
    expect(result.status.pendoPresent).toBe(true)
  })

  it('also accepts window.pendo for launcher variant', () => {
    window.pendo = { validateInstall: vi.fn() }
    expect(captureAndInspect('launcher').status.pendoPresent).toBe(true)
  })
})

describe('captureAndInspect — console interception', () => {
  it('captures console.log output from validateInstall', () => {
    window.pendo = { validateInstall() { console.log('API key: abc123') } }
    const result = captureAndInspect()
    expect(result.captured.some(l => l.text.includes('abc123'))).toBe(true)
  })

  it('captures console.warn output', () => {
    window.pendo = { validateInstall() { console.warn('No visitor') } }
    const result = captureAndInspect()
    expect(result.captured.some(l => l.level === 'warn' && l.text.includes('No visitor'))).toBe(true)
  })

  it('captures console.error output', () => {
    window.pendo = { validateInstall() { console.error('Init failed') } }
    const result = captureAndInspect()
    expect(result.captured.some(l => l.level === 'error')).toBe(true)
  })

  it('restores original console.log after execution', () => {
    const originalLog = console.log
    window.pendo = { validateInstall: vi.fn() }
    captureAndInspect()
    expect(console.log).toBe(originalLog)
  })

  it('restores console methods even when validateInstall throws', () => {
    const originalLog = console.log
    window.pendo = { validateInstall() { throw new Error('crash') } }
    captureAndInspect()
    expect(console.log).toBe(originalLog)
  })

  it('captures the exception as an error entry when validateInstall throws', () => {
    window.pendo = { validateInstall() { throw new Error('init failed') } }
    const result = captureAndInspect()
    expect(result.captured.some(l => l.level === 'error' && l.text.includes('init failed'))).toBe(true)
  })
})

describe('captureAndInspect — error/warn classification', () => {
  it('sets hasError when a log line matches the error regex', () => {
    window.pendo = { validateInstall() { console.log('Request blocked by CSP') } }
    expect(captureAndInspect().hasError).toBe(true)
  })

  it('sets hasError when a log line contains "failed"', () => {
    window.pendo = { validateInstall() { console.log('Load failed') } }
    expect(captureAndInspect().hasError).toBe(true)
  })

  it('sets hasError when a log line contains "not found"', () => {
    window.pendo = { validateInstall() { console.log('API key not found') } }
    expect(captureAndInspect().hasError).toBe(true)
  })

  it('sets hasWarn when a log line contains "missing"', () => {
    window.pendo = { validateInstall() { console.log('Snippet missing on page') } }
    expect(captureAndInspect().hasWarn).toBe(true)
  })

  it('sets hasWarn when a log line matches "no visitor"', () => {
    window.pendo = { validateInstall() { console.log('No visitor id set') } }
    expect(captureAndInspect().hasWarn).toBe(true)
  })

  it('sets hasWarn when log contains "not initialized"', () => {
    window.pendo = { validateInstall() { console.log('Pendo not initialized') } }
    expect(captureAndInspect().hasWarn).toBe(true)
  })

  it('sets hasWarn when log contains "not initialised" (British spelling)', () => {
    window.pendo = { validateInstall() { console.log('Pendo not initialised') } }
    expect(captureAndInspect().hasWarn).toBe(true)
  })

  it('does not set hasError or hasWarn for clean output', () => {
    window.pendo = { validateInstall() { console.log('All good') } }
    const result = captureAndInspect()
    expect(result.hasError).toBe(false)
    expect(result.hasWarn).toBe(false)
  })
})

describe('captureAndInspect — agent metadata extraction', () => {
  it('extracts version from getVersion()', () => {
    window.pendo = { validateInstall: vi.fn(), getVersion: () => '2.314.1' }
    expect(captureAndInspect().status.version).toBe('2.314.1')
  })

  it('extracts version from VERSION property', () => {
    window.pendo = { validateInstall: vi.fn(), VERSION: '2.300.0' }
    expect(captureAndInspect().status.version).toBe('2.300.0')
  })

  it('extracts detectedApiKey from agent.apiKey string', () => {
    window.pendo = { validateInstall: vi.fn(), apiKey: 'my-key-123' }
    expect(captureAndInspect().status.detectedApiKey).toBe('my-key-123')
  })

  it('extracts detectedApiKey from agent._.options.apiKey', () => {
    window.pendo = { validateInstall: vi.fn(), _: { options: { apiKey: 'opt-key' } } }
    expect(captureAndInspect().status.detectedApiKey).toBe('opt-key')
  })

  it('extracts visitorId from agent._.state', () => {
    window.pendo = { validateInstall: vi.fn(), _: { state: { visitorId: 'visitor-abc', accountId: 'acct-1' } } }
    const result = captureAndInspect()
    expect(result.status.visitorId).toBe('visitor-abc')
    expect(result.status.accountId).toBe('acct-1')
  })

  it('falls back to getVisitorId() when state.visitorId is absent', () => {
    window.pendo = { validateInstall: vi.fn(), getVisitorId: () => 'fallback-visitor' }
    expect(captureAndInspect().status.visitorId).toBe('fallback-visitor')
  })

  it('falls back to getAccountId() when state.accountId is absent', () => {
    window.pendo = { validateInstall: vi.fn(), _: { state: { visitorId: 'v1' } }, getAccountId: () => 'fallback-account' }
    expect(captureAndInspect().status.accountId).toBe('fallback-account')
  })
})

describe('captureAndInspect — API key detection', () => {
  it('sets apiKeyFound when a UUID appears in captured output', () => {
    window.pendo = { validateInstall() { console.log('Key: abcdef12-1234-1234-1234-abcdef123456') } }
    expect(captureAndInspect().apiKeyFound).toBe(true)
  })

  it('sets apiKeyFound when agent.apiKey is present', () => {
    window.pendo = { validateInstall: vi.fn(), apiKey: 'some-key' }
    expect(captureAndInspect().apiKeyFound).toBe(true)
  })

  it('extracts API key from Pendo CDN resource URL via performance entries', () => {
    const key = 'abcdef12-1234-1234-1234-abcdef123456'
    global.performance = {
      getEntriesByType: vi.fn(() => [{
        name: `https://cdn.pendo.io/agent/static/${key}/pendo.js`,
        initiatorType: 'script',
      }]),
    }
    window.pendo = { validateInstall: vi.fn() }
    const result = captureAndInspect()
    expect(result.status.detectedApiKey).toBe(key)
    expect(result.status.resourceHits).toHaveLength(1)
  })

  it('filters performance entries to pendo domains only', () => {
    global.performance = {
      getEntriesByType: vi.fn(() => [
        { name: 'https://other-cdn.com/script.js', initiatorType: 'script' },
        { name: 'https://cdn.pendo.io/agent.js',   initiatorType: 'script' },
      ]),
    }
    window.pendo = { validateInstall: vi.fn() }
    expect(captureAndInspect().status.resourceHits).toHaveLength(1)
  })

  it('still detects a self-hosted agent via the agent/static path when the host lacks "pendo"', () => {
    // Guards the cheap pre-filter: the agent/(static|production) branch must keep working
    // for self-hosted agents served from a non-pendo domain.
    const key = 'abcdef12-1234-1234-1234-abcdef123456'
    global.performance = {
      getEntriesByType: vi.fn(() => [{ name: `https://assets.example.com/agent/static/${key}/agent.js`, initiatorType: 'script' }]),
    }
    window.pendo = { validateInstall: vi.fn() }
    const result = captureAndInspect()
    expect(result.status.resourceHits).toHaveLength(1)
    expect(result.status.detectedApiKey).toBe(key)
  })
})

describe('captureAndInspect — advice and checks generation', () => {
  it('adds "Pendo agent not detected" advice when pendoPresent is false', () => {
    const result = captureAndInspect()
    expect(result.advice.some(a => a.text.includes('Pendo agent not detected'))).toBe(true)
  })

  it('adds validateInstall unavailable advice when present but no validateInstall', () => {
    window.pendo = {}
    const result = captureAndInspect()
    expect(result.advice.some(a => a.text.includes('validateInstall()'))).toBe(true)
  })

  it('adds "No API key detected" advice when apiKeyFound is false', () => {
    window.pendo = { validateInstall: vi.fn() }
    const result = captureAndInspect()
    expect(result.advice.some(a => a.text.includes('No API key detected'))).toBe(true)
  })

  it('adds "API key found" check when apiKeyFound is true', () => {
    window.pendo = { validateInstall: vi.fn(), apiKey: 'key-123' }
    expect(captureAndInspect().checks.some(c => c.includes('API key'))).toBe(true)
  })

  it('adds visitor identity advice when visitorId is absent', () => {
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k' }
    const result = captureAndInspect()
    expect(result.advice.some(a => a.text.includes('Visitor identity'))).toBe(true)
  })

  it('adds visitorId present check when visitorId is set', () => {
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k', _: { state: { visitorId: 'v1', accountId: 'a1' } } }
    expect(captureAndInspect().checks).toContain('visitorId present.')
  })

  it('adds CSP advice for each missing domain when cspMeta is present', () => {
    document.head.innerHTML = '<meta http-equiv="Content-Security-Policy" content="default-src self">'
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k' }
    const result = captureAndInspect()
    const cspAdvice = result.advice.filter(a => a.text.includes('CSP'))
    expect(cspAdvice.length).toBeGreaterThan(0)
  })

  it('adds CSP advice from captured text when no cspMeta but logs mention CSP block', () => {
    window.pendo = { validateInstall() { console.log('Refused to connect: blocked by CSP') } }
    const result = captureAndInspect()
    expect(result.advice.some(a => a.text.includes('CSP is blocking'))).toBe(true)
  })

  it('adds no-resource-hits advice when pendo present but no resource entries', () => {
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k', _: { state: { visitorId: 'v', accountId: 'a' } } }
    expect(captureAndInspect().advice.some(a => a.text.includes('No Pendo network resources'))).toBe(true)
  })

  it('adds healthy check when validateInstall runs clean', () => {
    window.pendo = {
      validateInstall() { console.log('All checks passed') },
      apiKey: 'k',
      _: { state: { visitorId: 'v', accountId: 'a' } },
    }
    global.performance = {
      getEntriesByType: vi.fn(() => [{ name: 'https://cdn.pendo.io/a.js', initiatorType: 'script' }]),
    }
    const result = captureAndInspect()
    expect(result.checks.some(c => c.includes('no warnings or errors'))).toBe(true)
  })
})

describe('captureAndInspect — variant messages', () => {
  it('prepends Pendo Launcher info message for launcher variant', () => {
    window.Pendo = { validateInstall: vi.fn() }
    const result = captureAndInspect('launcher')
    expect(result.captured[0]).toMatchObject({ level: 'info', text: expect.stringContaining('Pendo Launcher window') })
  })

  it('prepends Pendo Launcher Beta info message for launcher-beta variant', () => {
    window.Pendo = { validateInstall: vi.fn() }
    const result = captureAndInspect('launcher-beta')
    expect(result.captured[0]).toMatchObject({ level: 'info', text: expect.stringContaining('Pendo Launcher (Beta)') })
  })

  it('adds warn message when launcher variant but no validateInstall', () => {
    window.Pendo = {}
    const result = captureAndInspect('launcher')
    expect(result.captured.some(l => l.level === 'warn' && l.text.includes('validateInstall()'))).toBe(true)
  })
})

describe('captureAndInspect — combined variant (merged Phase 1 + 1.5)', () => {
  it('validates the snippet (window.pendo) as primary and reports both global flags', () => {
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k', _: { state: { visitorId: 'v', accountId: 'a' } } }
    const result = captureAndInspect('combined')
    expect(result.status.pendoPresent).toBe(true)
    expect(result.status.pendoGlobal).toBe('pendo')
    expect(result.status.snippetGlobalPresent).toBe(true)
    expect(result.status.launcherGlobalPresent).toBe(false)
    expect(window.pendo.validateInstall).toHaveBeenCalledOnce()
  })

  it('validates the Launcher (window.Pendo) as primary when no snippet is present', () => {
    window.Pendo = { validateInstall: vi.fn() }
    const result = captureAndInspect('combined')
    expect(result.status.pendoPresent).toBe(true)
    expect(result.status.pendoGlobal).toBe('Pendo')
    expect(result.status.snippetGlobalPresent).toBe(false)
    expect(result.status.launcherGlobalPresent).toBe(true)
    expect(window.Pendo.validateInstall).toHaveBeenCalledOnce()
    expect(result.captured[0]).toMatchObject({ level: 'info', text: expect.stringContaining('Pendo Launcher window') })
  })

  it('prefers the snippet and does not emit the Launcher message when both globals exist', () => {
    window.pendo = { validateInstall: vi.fn() }
    window.Pendo = { validateInstall: vi.fn() }
    const result = captureAndInspect('combined')
    expect(result.status.pendoGlobal).toBe('pendo')
    expect(result.status.snippetGlobalPresent).toBe(true)
    expect(result.status.launcherGlobalPresent).toBe(true)
    expect(window.pendo.validateInstall).toHaveBeenCalledOnce()
    expect(window.Pendo.validateInstall).not.toHaveBeenCalled()
    expect(result.captured.some(l => /Pendo Launcher window/.test(l.text))).toBe(false)
  })

  it('reports both flags false when neither global is present', () => {
    const result = captureAndInspect('combined')
    expect(result.status.pendoPresent).toBe(false)
    expect(result.status.snippetGlobalPresent).toBe(false)
    expect(result.status.launcherGlobalPresent).toBe(false)
  })

  it('warns when the Launcher is primary but validateInstall is unavailable', () => {
    window.Pendo = {}
    const result = captureAndInspect('combined')
    expect(result.captured.some(l => l.level === 'warn' && l.text.includes('validateInstall()'))).toBe(true)
  })
})

describe('captureAndInspect — pendoGlobal tracking', () => {
  it('reports pendoGlobal "pendo" for standard snippet', () => {
    window.pendo = { validateInstall: vi.fn() }
    expect(captureAndInspect().status.pendoGlobal).toBe('pendo')
  })

  it('reports pendoGlobal null when no agent', () => {
    expect(captureAndInspect().status.pendoGlobal).toBeNull()
  })

  it('reports pendoGlobal "Pendo" for launcher variant using window.Pendo', () => {
    window.Pendo = { validateInstall: vi.fn() }
    expect(captureAndInspect('launcher').status.pendoGlobal).toBe('Pendo')
  })

  it('reports pendoGlobal "pendo" for launcher variant falling back to window.pendo', () => {
    window.pendo = { validateInstall: vi.fn() }
    expect(captureAndInspect('launcher').status.pendoGlobal).toBe('pendo')
  })
})

describe('captureAndInspect — getSerializedMetadata', () => {
  it('reads metadata from getSerializedMetadata() when available', () => {
    window.pendo = {
      validateInstall: vi.fn(),
      apiKey: 'k',
      getSerializedMetadata: () => ({
        visitor: { id: 'v1', email: 'a@b.c', name: 'Alice' },
        account: { id: 'a1', name: 'Acme', plan: 'pro' },
      }),
      _: { state: { visitorId: 'v1', accountId: 'a1' } },
    }
    const result = captureAndInspect()
    expect(result.status.visitorMetadata).toMatchObject({ email: 'a@b.c', name: 'Alice' })
    expect(result.status.accountMetadata).toMatchObject({ name: 'Acme', plan: 'pro' })
  })

  it('falls back to legacy agent._.options when getSerializedMetadata is absent', () => {
    window.pendo = {
      validateInstall: vi.fn(),
      apiKey: 'k',
      _: {
        options: {
          visitor: { id: 'v1', role: 'admin' },
          account: { id: 'a1', industry: 'tech' },
          apiKey: 'k',
        },
        state: { visitorId: 'v1', accountId: 'a1' },
      },
    }
    const result = captureAndInspect()
    expect(result.status.visitorMetadata).toMatchObject({ role: 'admin' })
    expect(result.status.accountMetadata).toMatchObject({ industry: 'tech' })
  })

  it('reads parentAccount from legacy agent._.options when getSerializedMetadata is absent', () => {
    window.pendo = {
      validateInstall: vi.fn(),
      apiKey: 'k',
      _: {
        options: {
          visitor: { id: 'v1' },
          account: { id: 'a1' },
          parentAccount: { id: 'p1', name: 'Parent Corp' },
          apiKey: 'k',
        },
        state: { visitorId: 'v1', accountId: 'a1' },
      },
    }
    const result = captureAndInspect()
    expect(result.status.parentAccountId).toBe('p1')
    expect(result.status.parentAccountMetadata).toMatchObject({ name: 'Parent Corp' })
  })

  it('reads parentAccount from getSerializedMetadata() when available', () => {
    window.pendo = {
      validateInstall: vi.fn(),
      apiKey: 'k',
      getSerializedMetadata: () => ({
        visitor: { id: 'v1', email: 'a@b.c' },
        account: { id: 'a1', name: 'Child Co' },
        parentAccount: { id: 'p1', name: 'Parent Corp' },
      }),
      _: { state: { visitorId: 'v1', accountId: 'a1' } },
    }
    const result = captureAndInspect()
    expect(result.status.parentAccountId).toBe('p1')
    expect(result.status.parentAccountMetadata).toMatchObject({ name: 'Parent Corp' })
    expect(result.checks).toContain('parentAccount present.')
    expect(result.checks).toContain('Parent account metadata fields detected.')
  })

  it('does not warn when parentAccount is absent', () => {
    window.pendo = {
      validateInstall: vi.fn(),
      apiKey: 'k',
      getSerializedMetadata: () => ({
        visitor: { id: 'v1' },
        account: { id: 'a1', name: 'Acme' },
      }),
      _: { state: { visitorId: 'v1', accountId: 'a1' } },
    }
    const result = captureAndInspect()
    expect(result.status.parentAccountId).toBeNull()
    expect(result.advice.some(a => /parent account/i.test(a.text || ''))).toBe(false)
  })

  it('skips agent._.options when agent._ is a function (underscore.js)', () => {
    const fn = () => {}
    fn.options = { visitor: { shouldIgnore: true } }
    window.pendo = {
      validateInstall: vi.fn(),
      apiKey: 'k',
      _: fn,
      getVisitorId: () => 'v1',
      getAccountId: () => 'a1',
    }
    const result = captureAndInspect()
    expect(result.status.visitorMetadata).toBeNull()
  })
})

describe('captureAndInspect — extended signals', () => {
  it('detects Google Tag Manager and adds check', () => {
    window.google_tag_manager = {}
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k', _: { state: { visitorId: 'v', accountId: 'a' } } }
    global.performance = { getEntriesByType: vi.fn(() => [{ name: 'https://cdn.pendo.io/a.js', initiatorType: 'script' }]) }
    const result = captureAndInspect()
    expect(result.checks).toContain('Google Tag Manager detected.')
    delete window.google_tag_manager
  })

  it('adds GTM advice when pendo absent but GTM present', () => {
    window.google_tag_manager = {}
    const result = captureAndInspect()
    expect(result.advice.some(a => a.text.includes('Google Tag Manager') && a.supportKey === 'gtm')).toBe(true)
    delete window.google_tag_manager
  })

  it('detects Tealium iQ (utag) and adds check', () => {
    window.utag = {}
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k', _: { state: { visitorId: 'v', accountId: 'a' } } }
    global.performance = { getEntriesByType: vi.fn(() => [{ name: 'https://cdn.pendo.io/a.js', initiatorType: 'script' }]) }
    const result = captureAndInspect()
    expect(result.checks).toContain('Tealium iQ (utag) detected.')
    delete window.utag
  })

  it('detects React SPA framework', () => {
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {}
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k', _: { state: { visitorId: 'v', accountId: 'a' } } }
    global.performance = { getEntriesByType: vi.fn(() => [{ name: 'https://cdn.pendo.io/a.js', initiatorType: 'script' }]) }
    const result = captureAndInspect()
    expect(result.checks.some(c => c.includes('react'))).toBe(true)
    delete window.__REACT_DEVTOOLS_GLOBAL_HOOK__
  })

  it('adds outdated agent advice when version is below minimum', () => {
    window.pendo = {
      validateInstall: vi.fn(),
      apiKey: 'k',
      getVersion: () => '2.10.0',
      _: { state: { visitorId: 'v', accountId: 'a' } },
    }
    global.performance = { getEntriesByType: vi.fn(() => [{ name: 'https://cdn.pendo.io/a.js', initiatorType: 'script' }]) }
    const result = captureAndInspect()
    expect(result.advice.some(a => a.text.includes('older than the recommended minimum'))).toBe(true)
  })

  it('does not add outdated advice for current agent version', () => {
    window.pendo = {
      validateInstall: vi.fn(),
      apiKey: 'k',
      getVersion: () => '2.314.1',
      _: { state: { visitorId: 'v', accountId: 'a' } },
    }
    global.performance = { getEntriesByType: vi.fn(() => [{ name: 'https://cdn.pendo.io/a.js', initiatorType: 'script' }]) }
    const result = captureAndInspect()
    expect(result.advice.some(a => a.text.includes('older than the recommended minimum'))).toBe(false)
  })

  it('adds account metadata gap advice when visitor metadata populated but account empty', () => {
    window.pendo = {
      validateInstall: vi.fn(),
      apiKey: 'k',
      getSerializedMetadata: () => ({
        visitor: { id: 'v1', email: 'a@b.c', name: 'A' },
        account: { id: 'a1' },
      }),
      _: { state: { visitorId: 'v1', accountId: 'a1' } },
    }
    global.performance = { getEntriesByType: vi.fn(() => [{ name: 'https://cdn.pendo.io/a.js', initiatorType: 'script' }]) }
    const result = captureAndInspect()
    expect(result.advice.some(a => a.text.includes('account metadata is empty'))).toBe(true)
  })

  it('uses hasFieldsBeyondId for metadata checks', () => {
    window.pendo = {
      validateInstall: vi.fn(),
      apiKey: 'k',
      getSerializedMetadata: () => ({
        visitor: { id: 'v1' },
        account: { id: 'a1' },
      }),
      _: { state: { visitorId: 'v1', accountId: 'a1' } },
    }
    global.performance = { getEntriesByType: vi.fn(() => [{ name: 'https://cdn.pendo.io/a.js', initiatorType: 'script' }]) }
    const result = captureAndInspect()
    expect(result.checks).not.toContain('Visitor metadata fields detected.')
    expect(result.checks).not.toContain('Account metadata fields detected.')
    expect(result.advice.some(a => a.text.includes('No visitor metadata fields detected'))).toBe(true)
  })
})

describe('captureAndInspect — URL sanitization / redirect detection', () => {
  it('adds VDS advice when the page redirected during load and pendo is present', () => {
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k', _: { state: { visitorId: 'v', accountId: 'a' } } }
    global.performance = { getEntriesByType: vi.fn((type) => type === 'navigation' ? [{ redirectCount: 1 }] : []) }
    const result = captureAndInspect()
    expect(result.status.redirectCount).toBe(1)
    expect(result.advice.some(a => a.supportKey === 'vds' && /Visual Design Studio/.test(a.text))).toBe(true)
  })

  it('does not add VDS advice when there were no redirects', () => {
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k', _: { state: { visitorId: 'v', accountId: 'a' } } }
    global.performance = { getEntriesByType: vi.fn((type) => type === 'navigation' ? [{ redirectCount: 0 }] : []) }
    const result = captureAndInspect()
    expect(result.status.redirectCount).toBe(0)
    expect(result.advice.some(a => a.supportKey === 'vds')).toBe(false)
  })

  it('does not add VDS advice when redirected but pendo is absent', () => {
    global.performance = { getEntriesByType: vi.fn((type) => type === 'navigation' ? [{ redirectCount: 2 }] : []) }
    const result = captureAndInspect()
    expect(result.advice.some(a => a.supportKey === 'vds')).toBe(false)
  })

  it('falls back to legacy performance.navigation.redirectCount', () => {
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k', _: { state: { visitorId: 'v', accountId: 'a' } } }
    global.performance = { getEntriesByType: vi.fn(() => []), navigation: { redirectCount: 1 } }
    const result = captureAndInspect()
    expect(result.status.redirectCount).toBe(1)
    expect(result.advice.some(a => a.supportKey === 'vds')).toBe(true)
  })
})

describe('captureAndInspect — client-side URL sanitization', () => {
  beforeEach(() => {
    window.__pendoValidateHistoryHooked = false
    window.__pendoValidateUrlStrips = []
  })

  it('flags an inline script that clears location.search', () => {
    document.head.innerHTML = '<script>function clean(){ location.search = "" }</script>'
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k', _: { state: { visitorId: 'v', accountId: 'a' } } }
    const result = captureAndInspect()
    expect(result.status.urlSanitization.inlinePatterns).toContain('location.search cleared')
    expect(result.advice.some(a => a.supportKey === 'vds' && /Client-side code/.test(a.text))).toBe(true)
  })

  it('flags an inline script using searchParams.delete', () => {
    document.head.innerHTML = '<script>const u = new URL(location.href); u.searchParams.delete("pendo-designer")</script>'
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k', _: { state: { visitorId: 'v', accountId: 'a' } } }
    const result = captureAndInspect()
    expect(result.status.urlSanitization.inlinePatterns).toContain('searchParams.delete')
    expect(result.advice.some(a => a.supportKey === 'vds')).toBe(true)
  })

  it('flags an observed query-string strip recorded by the history hook', () => {
    window.__pendoValidateHistoryHooked = true
    window.__pendoValidateUrlStrips = [{ method: 'replaceState', before: '?pendo-designer=x', hadPendoToken: true }]
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k', _: { state: { visitorId: 'v', accountId: 'a' } } }
    const result = captureAndInspect()
    expect(result.status.urlSanitization.observedStrips).toBe(1)
    expect(result.advice.some(a => a.supportKey === 'vds' && /query string was observed/.test(a.text))).toBe(true)
  })

  it('adds a clean check when inline scripts have no sanitization patterns', () => {
    document.head.innerHTML = '<script>console.log("hello world")</script>'
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k', _: { state: { visitorId: 'v', accountId: 'a' } } }
    const result = captureAndInspect()
    expect(result.status.urlSanitization.inlinePatterns).toEqual([])
    expect(result.checks).toContain('No URL-sanitization patterns found in inline scripts (external bundles not scanned).')
    expect(result.advice.some(a => a.supportKey === 'vds')).toBe(false)
  })

  it('does not flag client-side sanitization when pendo is absent', () => {
    document.head.innerHTML = '<script>location.search = ""</script>'
    const result = captureAndInspect()
    expect(result.advice.some(a => a.supportKey === 'vds')).toBe(false)
  })

  it('reports inline and external script counts', () => {
    document.head.innerHTML = '<script src="https://cdn.example.com/app.js"></script><script>var x = 1</script>'
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k', _: { state: { visitorId: 'v', accountId: 'a' } } }
    const result = captureAndInspect()
    expect(result.status.urlSanitization.externalScripts).toBe(1)
    expect(result.status.urlSanitization.inlineScripts).toBe(1)
  })

  it('does not patch the host History API when Pendo is absent', () => {
    document.head.innerHTML = '<script>history.replaceState({}, "", location.pathname)</script>'
    captureAndInspect()
    expect(window.__pendoValidateHistoryHooked).not.toBe(true)
  })

  it('patches the History API only once Pendo is present', () => {
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k', _: { state: { visitorId: 'v', accountId: 'a' } } }
    captureAndInspect()
    expect(window.__pendoValidateHistoryHooked).toBe(true)
  })

  it('does not flag replaceState that re-appends location.search (query preserved)', () => {
    document.head.innerHTML = '<script>history.replaceState({}, "", location.pathname + location.search)</script>'
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k', _: { state: { visitorId: 'v', accountId: 'a' } } }
    const result = captureAndInspect()
    expect(result.status.urlSanitization.inlinePatterns).not.toContain('replaceState/pushState to pathname')
    expect(result.advice.some(a => a.supportKey === 'vds')).toBe(false)
  })

  it('flags replaceState to bare location.pathname (query dropped)', () => {
    document.head.innerHTML = '<script>history.replaceState({}, "", location.pathname)</script>'
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k', _: { state: { visitorId: 'v', accountId: 'a' } } }
    const result = captureAndInspect()
    expect(result.status.urlSanitization.inlinePatterns).toContain('replaceState/pushState to pathname')
    expect(result.advice.some(a => a.supportKey === 'vds')).toBe(true)
  })

  it("does not flag the benign url.split('?')[0] read idiom", () => {
    document.head.innerHTML = '<script>const base = location.href.split("?")[0]; console.log(base)</script>'
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k', _: { state: { visitorId: 'v', accountId: 'a' } } }
    const result = captureAndInspect()
    expect(result.status.urlSanitization.inlinePatterns).toEqual([])
    expect(result.advice.some(a => a.supportKey === 'vds')).toBe(false)
  })

  it('flags a load-time strip via Navigation Timing (query present at request, gone now)', () => {
    global.performance = { getEntriesByType: vi.fn((type) => type === 'navigation' ? [{ name: 'https://app.example.com/dashboard?pendo-designer=abc123', redirectCount: 0 }] : []) }
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k', _: { state: { visitorId: 'v', accountId: 'a' } } }
    const result = captureAndInspect()
    expect(result.status.urlSanitization.navPendoTokenStripped).toBe(true)
    expect(result.status.urlSanitization.navQueryStripped).toBe(true)
    expect(result.advice.some(a => a.supportKey === 'vds' && /stripped during load/.test(a.text))).toBe(true)
  })

  it('does not flag when the originally-requested URL had no query string', () => {
    global.performance = { getEntriesByType: vi.fn((type) => type === 'navigation' ? [{ name: 'https://app.example.com/dashboard', redirectCount: 0 }] : []) }
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k', _: { state: { visitorId: 'v', accountId: 'a' } } }
    const result = captureAndInspect()
    expect(result.status.urlSanitization.navQueryStripped).toBe(false)
    expect(result.status.urlSanitization.navPendoTokenStripped).toBe(false)
    expect(result.advice.some(a => a.supportKey === 'vds')).toBe(false)
  })

  it('defers to the redirect signal (no client-side nav-strip flag) when redirectCount > 0', () => {
    global.performance = { getEntriesByType: vi.fn((type) => type === 'navigation' ? [{ name: 'https://app.example.com/dashboard?pendo-designer=abc', redirectCount: 1 }] : []) }
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k', _: { state: { visitorId: 'v', accountId: 'a' } } }
    const result = captureAndInspect()
    expect(result.status.urlSanitization.navQueryStripped).toBe(false)
    expect(result.status.urlSanitization.navPendoTokenStripped).toBe(false)
  })
})

describe('captureAndInspect — inline script scan cap', () => {
  beforeEach(() => {
    window.__pendoValidateHistoryHooked = false
    window.__pendoValidateUrlStrips = []
  })

  it('counts every inline script even when its content exceeds the per-script scan budget', () => {
    const huge = 'var x=1;'.repeat(3000) // ~24 KB, over the 16 KB per-script cap
    document.head.innerHTML = `<script>${huge}</script><script>var y=2</script>`
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k', _: { state: { visitorId: 'v', accountId: 'a' } } }
    const result = captureAndInspect()
    expect(result.status.urlSanitization.inlineScripts).toBe(2)
  })

  it('does not scan past the per-script byte cap for sanitization patterns', () => {
    const padding = '/* pad */\n'.repeat(2500) // ~25 KB of benign text before the pattern
    document.head.innerHTML = `<script>${padding}location.search = ""</script>`
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k', _: { state: { visitorId: 'v', accountId: 'a' } } }
    const result = captureAndInspect()
    expect(result.status.urlSanitization.inlinePatterns).not.toContain('location.search cleared')
  })

  it('still flags a sanitization pattern that sits within the per-script byte cap', () => {
    document.head.innerHTML = `<script>/* small */ location.search = ""</script>`
    window.pendo = { validateInstall: vi.fn(), apiKey: 'k', _: { state: { visitorId: 'v', accountId: 'a' } } }
    const result = captureAndInspect()
    expect(result.status.urlSanitization.inlinePatterns).toContain('location.search cleared')
  })
})

describe('captureAndInspect — init config detection (snippet queue)', () => {
  it('captures top-level pendo.initialize() keys from pendo._q', () => {
    window.pendo = {
      validateInstall: vi.fn(),
      _q: [['initialize', { visitor: { id: 'v' }, account: { id: 'a' }, disableCookies: true }]],
    }
    const result = captureAndInspect()
    expect(result.status.configSource).toBe('snippet-queue')
    expect(result.status.configKeys).toEqual(['visitor', 'account', 'disableCookies'])
  })

  it('uses the last initialize entry when several calls are queued', () => {
    window.pendo = {
      validateInstall: vi.fn(),
      _q: [
        ['initialize', { visitor: { id: 'v' } }],
        ['identify', { id: 'x' }],
        ['initialize', { visitor: { id: 'v' }, account: { id: 'a' }, excludeAllText: true }],
      ],
    }
    expect(captureAndInspect().status.configKeys).toEqual(['visitor', 'account', 'excludeAllText'])
  })

  it('leaves configKeys/configSource null when there is no _q queue', () => {
    window.pendo = { validateInstall: vi.fn() }
    const result = captureAndInspect()
    expect(result.status.configKeys).toBeNull()
    expect(result.status.configSource).toBeNull()
  })

  it('leaves configKeys null when _q has no initialize entry', () => {
    window.pendo = { validateInstall: vi.fn(), _q: [['identify', { id: 'x' }]] }
    expect(captureAndInspect().status.configKeys).toBeNull()
  })

  it('ignores a non-array _q', () => {
    window.pendo = { validateInstall: vi.fn(), _q: 'nope' }
    expect(captureAndInspect().status.configKeys).toBeNull()
  })
})

describe('captureAndInspect — init config detection (inline script fallback)', () => {
  it('parses pendo.initialize() flags from the inline install snippet when _q is drained', () => {
    document.head.innerHTML = `<script>
      pendo.initialize({
        visitor: { id: 'v', email: 'x@y.com' },
        account: { id: 'a' },
        excludeAllText: true,
        guides: { delay: false },
      });
    </script>`
    window.pendo = { validateInstall: vi.fn(), _q: [] } // queue already drained by the loaded agent
    const result = captureAndInspect()
    expect(result.status.configSource).toBe('inline-script')
    expect(result.status.configKeys).toEqual(['visitor', 'account', 'excludeAllText', 'guides'])
  })

  it('surfaces the non-standard flags as advice via assessConfigFlags', () => {
    document.head.innerHTML = `<script>pendo.initialize({ visitor: { id: 'v' }, account: { id: 'a' }, excludeAllText: true })</script>`
    window.pendo = { validateInstall: vi.fn(), _q: [] }
    const flags = assessConfigFlags(captureAndInspect().status)
    expect(flags.detected).toBe(true)
    expect(flags.flags.map(f => f.key)).toContain('excludeAllText')
  })

  it('does not flag parentAccount as a non-standard config key', () => {
    document.head.innerHTML = `<script>pendo.initialize({ visitor: { id: 'v' }, account: { id: 'a' }, parentAccount: { id: 'p' } })</script>`
    window.pendo = { validateInstall: vi.fn(), _q: [] }
    const flags = assessConfigFlags(captureAndInspect().status)
    expect(flags.detected).toBe(true)
    expect(flags.flags).toEqual([])
  })

  it('prefers the live _q queue over the inline script when both are present', () => {
    document.head.innerHTML = `<script>pendo.initialize({ visitor: { id: 'v' }, fromInline: true })</script>`
    window.pendo = { validateInstall: vi.fn(), _q: [['initialize', { visitor: { id: 'v' }, fromQueue: true }]] }
    const result = captureAndInspect()
    expect(result.status.configSource).toBe('snippet-queue')
    expect(result.status.configKeys).toContain('fromQueue')
    expect(result.status.configKeys).not.toContain('fromInline')
  })

  it('captures only top-level keys, skipping nested objects and function values', () => {
    document.head.innerHTML = `<script>pendo.initialize({ visitor: { id: 'v', meta: { role: 'x' } }, sanitizeUrl: function (u) { return u; }, disableGuides: false })</script>`
    window.pendo = { validateInstall: vi.fn() }
    expect(captureAndInspect().status.configKeys).toEqual(['visitor', 'sanitizeUrl', 'disableGuides'])
  })

  it('does not capture config when the init argument is a variable, not a literal', () => {
    document.head.innerHTML = `<script>pendo.initialize(window.__pendoCfg)</script>`
    window.pendo = { validateInstall: vi.fn() }
    expect(captureAndInspect().status.configKeys).toBeNull()
  })

  it('ignores keys that appear only inside comments', () => {
    document.head.innerHTML = `<script>pendo.initialize({ /* excludeAllText: true */ visitor: { id: 'v' } })</script>`
    window.pendo = { validateInstall: vi.fn() }
    expect(captureAndInspect().status.configKeys).toEqual(['visitor'])
  })
})
