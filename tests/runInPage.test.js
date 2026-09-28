import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import './helpers.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const popupSrc = readFileSync(join(root, 'extension', 'popup.js'), 'utf8')
const diagSrc = readFileSync(join(root, 'extension', 'diagnostics.js'), 'utf8')

function loadRunInPage() {
  const neutralized = popupSrc
    .replace('(async function initPendoWithStoredVisitor() {', '(async function initPendoWithStoredVisitor() { return;')
    .replace('initPopup();', ';')
  const factory = new Function(
    'chrome', 'browser', 'fetch', 'setTimeout', 'clearTimeout',
    `${diagSrc}\n${neutralized}\nreturn { runInPage };`,
  )
  return factory(global.chrome, global.browser, global.fetch, setTimeout, clearTimeout)
}

const combinedCapture = {
  status: {
    snippetGlobalPresent: true,
    launcherGlobalPresent: false,
    pendoPresent: true,
    validatePresent: true,
    visitorId: 'visitor-1',
    resourceHits: [],
  },
  captured: [],
  advice: [],
  checks: ['visitorId present.'],
}

describe('runInPage — tab targeting', () => {
  beforeEach(() => {
    chrome.tabs.query.mockResolvedValue([
      { id: 3, url: 'https://active.example/', active: true },
      { id: 7, url: 'https://pending.example/app', active: false },
    ])
    chrome.scripting.executeScript.mockImplementation(async (details) => {
      if (details.files) return [{ result: undefined }]
      if (details.target?.allFrames) return [{ result: { skipped: 'extension' } }]
      return [{ result: combinedCapture }]
    })
    chrome.management.getAll.mockResolvedValue([])
  })

  it('uses opts.tabId instead of the focused tab for injections and metadata', async () => {
    const { runInPage } = loadRunInPage()
    const networkCapture = {
      summary: { documentUrl: 'https://pending.example/app', requests: [] },
    }

    const res = await runInPage({ tabId: 7, networkCapture })

    expect(res.pageUrl).toBe('https://pending.example/app')
    expect(res.validationTabId).toBe(7)
    expect(res.networkCapture.summary).toEqual(networkCapture.summary)
    const targets = chrome.scripting.executeScript.mock.calls.map((c) => c[0].target)
    expect(targets.length).toBeGreaterThan(0)
    for (const target of targets) {
      expect(target.tabId).toBe(7)
    }
  })

  it('defaults to the active tab when tabId is omitted', async () => {
    const { runInPage } = loadRunInPage()
    const res = await runInPage()
    expect(res.pageUrl).toBe('https://active.example/')
    expect(res.validationTabId).toBe(3)
    const targets = chrome.scripting.executeScript.mock.calls.map((c) => c[0].target)
    for (const target of targets) {
      expect(target.tabId).toBe(3)
    }
  })
})
