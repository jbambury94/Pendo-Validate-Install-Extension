import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const popupHtml = readFileSync(join(root, 'extension', 'popup.html'), 'utf8')
const popupJs = readFileSync(join(root, 'extension', 'popup.js'), 'utf8')
const popupCss = readFileSync(join(root, 'extension', 'popup.css'), 'utf8')
const doc = new JSDOM(popupHtml).window.document

function logCardsOpenKeysFromPopupJs(src) {
  const block = src.match(/let logCardsOpen = \{([^}]+)\}/)?.[1] ?? ''
  return block.split(',').map((part) => part.trim().split(':')[0].trim()).filter(Boolean)
}

describe('popup.html Logs tab layout', () => {
  it('places framesCard in Logs, not Status', () => {
    const status = doc.getElementById('tabStatusPanel')
    const logs = doc.getElementById('tabLogsPanel')
    const frames = doc.getElementById('framesCard')
    expect(logs.contains(frames)).toBe(true)
    expect(status.contains(frames)).toBe(false)
  })

  it('orders Logs cards as console output, install details, frames', () => {
    const logs = doc.getElementById('tabLogsPanel')
    const cards = Array.from(logs.querySelectorAll(':scope > .card'))
    expect(cards.map((c) => c.id)).toEqual(['logsCard', 'installDetailsCard', 'framesCard'])
  })

  it('marks every Logs card collapsible with toggle controls', () => {
    const logs = doc.getElementById('tabLogsPanel')
    const cards = Array.from(logs.querySelectorAll(':scope > .card'))
    const dataCards = new Set()
    for (const card of cards) {
      expect(card.classList.contains('card--collapsible')).toBe(true)
      expect(card.getAttribute('data-open')).toBe('false')
      const key = card.getAttribute('data-card')
      expect(key).toBeTruthy()
      expect(dataCards.has(key)).toBe(false)
      dataCards.add(key)
      const toggle = card.querySelector('[data-action="toggle-card"]')
      expect(toggle).toBeTruthy()
      expect(toggle.getAttribute('aria-expanded')).toBe('false')
      const controlsId = toggle.getAttribute('aria-controls')
      expect(controlsId).toBeTruthy()
      const controlled = doc.getElementById(controlsId)
      expect(card.contains(controlled)).toBe(true)
    }
  })

  it('uses data-card keys that match logCardsOpen in popup.js', () => {
    const logs = doc.getElementById('tabLogsPanel')
    const htmlKeys = Array.from(logs.querySelectorAll(':scope > .card[data-card]'))
      .map((c) => c.getAttribute('data-card'))
      .sort()
    const jsKeys = logCardsOpenKeysFromPopupJs(popupJs).sort()
    expect(htmlKeys).toEqual(jsKeys)
  })
})

describe('popup.css collapsible Logs cards', () => {
  it('hides card body content when data-open is false', () => {
    expect(popupCss).toMatch(/\.card--collapsible\[data-open="false"\]\s*>\s*:not\(\.card__head\)\s*\{\s*display:\s*none/)
  })
})
