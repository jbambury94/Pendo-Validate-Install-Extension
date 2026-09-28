import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ext = join(root, 'extension')

const popupHtml = readFileSync(join(ext, 'popup.html'), 'utf8')

const PANEL_SCRIPTS = [
  'pendo-kb.js',
  'pendo-telemetry.js',
  'har-capture.js',
  'diagnostics.js',
  'popup.js',
]

function readExt(filename) {
  return readFileSync(join(ext, filename), 'utf8')
}

/** Boot the real panel in jsdom (localhost URL enables __pendoValidateApplyFixture). */
function bootPanel(stored = {}) {
  const dom = new JSDOM(popupHtml, { url: 'http://localhost/popup.html', runScripts: 'outside-only' })
  const { window } = dom
  chrome.storage.local.get.mockImplementation((defaults, cb) => {
    cb({ ...defaults, ...stored })
  })
  window.chrome = global.chrome
  window.browser = global.browser
  for (const f of PANEL_SCRIPTS) {
    window.eval(readExt(f))
  }
  // JSDOM keeps readyState at "loading" until we dispatch; popup.js defers initPopup to DOMContentLoaded.
  if (window.document.readyState === 'loading') {
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'))
  }
  return window
}

function minimalValidationResult(overrides = {}) {
  return {
    status: {
      pendoPresent: true,
      validatePresent: true,
      visitorId: 'visitor-1',
      accountId: 'account-1',
      resourceHits: [],
    },
    captured: [],
    advice: [],
    checks: ['visitorId present.'],
    cspMeta: '',
    apiKeyFound: true,
    hasError: false,
    hasWarn: false,
    origin: 'page',
    pageUrl: 'https://app.example.com/',
    snippetOnPage: true,
    launcherPresent: false,
    launcherAttempted: false,
    validatedIn: 'page',
    ...overrides,
  }
}

function lastLogUiPrefsSet() {
  const calls = chrome.storage.local.set.mock.calls.filter((c) => c[0]?.logUiPrefs)
  return calls.length ? calls[calls.length - 1][0].logUiPrefs : null
}

describe('logCards — panel boot defaults', () => {
  it('starts with all Logs cards collapsed and chevron icons wired', () => {
    const win = bootPanel()
    const doc = win.document
    for (const id of ['logsCard', 'installDetailsCard', 'framesCard']) {
      const card = doc.getElementById(id)
      expect(card.dataset.open).toBe('false')
      const toggle = card.querySelector('.card__toggle')
      expect(toggle.getAttribute('aria-expanded')).toBe('false')
      const chev = card.querySelector('.card__chev')
      expect(chev?.querySelector('svg')).toBeTruthy()
    }
    expect(doc.getElementById('logsCardMeta').textContent).toBe('')
  })
})

describe('logCards — toggle and persist', () => {
  it('opens and closes Console output and persists cards with filters and query', () => {
    const win = bootPanel({
      logUiPrefs: {
        filters: { error: true, warn: false, info: true },
        query: 'pendo',
      },
    })
    const doc = win.document
    const card = doc.getElementById('logsCard')
    const toggle = doc.getElementById('logsCardToggle')

    toggle.click()
    expect(card.dataset.open).toBe('true')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')

    toggle.click()
    expect(card.dataset.open).toBe('false')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    const prefs = lastLogUiPrefsSet()
    expect(prefs).toMatchObject({
      query: 'pendo',
      filters: { error: true, warn: false, info: true },
      cards: { logs: false, installDetails: false, frames: false },
    })
  })
})

describe('logCards — restore from storage', () => {
  it('opens only cards stored as true', () => {
    const win = bootPanel({
      logUiPrefs: { cards: { frames: true, logs: false, installDetails: false } },
    })
    const doc = win.document
    expect(doc.getElementById('framesCard').dataset.open).toBe('true')
    expect(doc.getElementById('logsCard').dataset.open).toBe('false')
    expect(doc.getElementById('installDetailsCard').dataset.open).toBe('false')
  })

  it('ignores non-boolean truthy values and unknown card keys', () => {
    const win = bootPanel({
      logUiPrefs: { cards: { logs: 'yes', bogus: true, installDetails: 1 } },
    })
    const doc = win.document
    expect(doc.getElementById('logsCard').dataset.open).toBe('false')
    expect(doc.getElementById('installDetailsCard').dataset.open).toBe('false')
    expect(doc.getElementById('framesCard').dataset.open).toBe('false')
  })

  it('keeps cards collapsed when legacy prefs have no cards key', () => {
    const win = bootPanel({
      logUiPrefs: {
        filters: { error: true, warn: true, info: false },
        query: 'api',
      },
    })
    const doc = win.document
    for (const id of ['logsCard', 'installDetailsCard', 'framesCard']) {
      expect(doc.getElementById(id).dataset.open).toBe('false')
    }
  })
})

describe('logCards — View in Logs', () => {
  const warnLine = 'Pendo: visitorId is missing from initialize.'

  it('expands console card, switches to Logs, and persists cards.logs', () => {
    const win = bootPanel()
    const doc = win.document
    win.__pendoValidateApplyFixture(minimalValidationResult({
      captured: [{ level: 'warn', text: warnLine }],
      hasWarn: true,
    }))

    const link = doc.querySelector('[data-action="view-check-in-logs"]')
    expect(link).toBeTruthy()
    link.click()

    expect(doc.getElementById('tabLogsBtn').getAttribute('aria-selected')).toBe('true')
    expect(doc.getElementById('tabLogsPanel').hidden).toBe(false)
    expect(doc.getElementById('logsCard').dataset.open).toBe('true')
    expect(lastLogUiPrefsSet()?.cards?.logs).toBe(true)
  })
})

describe('logCards — logsCardMeta line counts', () => {
  it('shows 0 lines after validation with no captured output', () => {
    const win = bootPanel()
    win.__pendoValidateApplyFixture(minimalValidationResult({ captured: [] }))
    expect(win.document.getElementById('logsCardMeta').textContent).toBe('0 lines')
  })

  it('shows singular and plural totals when all levels match filters', () => {
    const win = bootPanel()
    win.__pendoValidateApplyFixture(minimalValidationResult({
      captured: [{ level: 'info', text: 'one' }],
    }))
    expect(win.document.getElementById('logsCardMeta').textContent).toBe('1 line')

    win.__pendoValidateApplyFixture(minimalValidationResult({
      captured: [
        { level: 'info', text: 'a' },
        { level: 'info', text: 'b' },
        { level: 'warn', text: 'c' },
      ],
    }))
    expect(win.document.getElementById('logsCardMeta').textContent).toBe('3 lines')
  })

  it('shows filtered count when level chips narrow visible lines', () => {
    const win = bootPanel()
    const doc = win.document
    win.__pendoValidateApplyFixture(minimalValidationResult({
      captured: [
        { level: 'error', text: 'e' },
        { level: 'warn', text: 'w' },
        { level: 'info', text: 'i' },
      ],
    }))
    doc.getElementById('logFilterWarn').click()
    doc.getElementById('logFilterInfo').click()
    expect(doc.getElementById('logsCardMeta').textContent).toBe('1 of 3 shown')
  })
})
