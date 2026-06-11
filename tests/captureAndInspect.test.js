import { describe, it, expect, beforeEach, vi } from 'vitest'
import { captureAndInspect } from './helpers.js'

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
