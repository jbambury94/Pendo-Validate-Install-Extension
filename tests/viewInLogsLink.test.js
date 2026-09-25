import { describe, it, expect } from 'vitest'
import {
  shouldOfferViewInLogsLink,
  checkItemDisplayText,
  checkLogSearchToken,
  filterCapturedLogs,
} from './helpers.js'

describe('shouldOfferViewInLogsLink', () => {
  const captured = [
    { level: 'warn', text: 'Pendo: visitorId is missing from initialize.' },
    { level: 'error', text: 'Pendo validateInstall: API key mismatch detected.' },
  ]

  it('offers link for captured-source items', () => {
    expect(shouldOfferViewInLogsLink(
      { text: 'Pendo: visitorId is missing', source: 'captured' },
      'warn',
      captured,
    )).toBe(true)
  })

  it('does not offer link for built-in quality recommendations', () => {
    expect(shouldOfferViewInLogsLink(
      { text: 'visitorId is not set. Pass a stable user identifier in pendo.initialize().', source: 'builtin' },
      'warn',
      captured,
    )).toBe(false)
  })

  it('does not offer link for AI advice without a matching log line', () => {
    expect(shouldOfferViewInLogsLink(
      { text: 'Consider enabling cross-origin headers for the agent.', source: 'ai' },
      'warn',
      captured,
    )).toBe(false)
  })

  it('offers link when search token would match a captured line at the same level', () => {
    expect(shouldOfferViewInLogsLink(
      { text: 'Pendo validateInstall: API key mismatch detected.', source: 'ai' },
      'err',
      captured,
    )).toBe(true)
  })

  it('returns false for passing checks', () => {
    expect(shouldOfferViewInLogsLink({ text: 'ok', source: 'builtin' }, 'ok', captured)).toBe(false)
  })
})

/**
 * The check row renders AI text with embedded help links stripped, and the click handler
 * searches that displayed text — so the availability check has to search it too.
 */
describe('shouldOfferViewInLogsLink — agrees with the Logs search on click', () => {
  const errLine = 'Pendo: API key mismatch detected. Learn more about API keys: https://help.pendo.io/resources/keys Update the snippet key.'
  const warnLine = 'Pendo: visitorId is missing from initialize.'
  const captured = [
    { level: 'error', text: errLine },
    { level: 'warn', text: warnLine },
  ]

  /** What clicking "View in Logs" would surface for a check row. */
  function linesFoundOnClick(item, kind) {
    const filters = kind === 'err'
      ? { error: true, warn: false, info: false }
      : { error: false, warn: true, info: false }
    const token = checkLogSearchToken(checkItemDisplayText(item))
    return filterCapturedLogs(captured, filters, token).visible
  }

  it('does not offer the link when stripping a mid-text help link breaks the match', () => {
    const item = { text: errLine, source: 'ai' }
    expect(linesFoundOnClick(item, 'err')).toHaveLength(0)
    expect(shouldOfferViewInLogsLink(item, 'err', captured)).toBe(false)
  })

  it('offers the link when a leading help link is stripped from the search token', () => {
    const item = { text: `Learn more about installs: https://help.pendo.io/x ${warnLine}`, source: 'ai' }
    expect(shouldOfferViewInLogsLink(item, 'warn', captured)).toBe(true)
    expect(linesFoundOnClick(item, 'warn')).toHaveLength(1)
  })

  it('offers the link for AI text that echoes a captured line verbatim', () => {
    const item = { text: warnLine, source: 'ai' }
    expect(shouldOfferViewInLogsLink(item, 'warn', captured)).toBe(true)
    expect(linesFoundOnClick(item, 'warn')).toHaveLength(1)
  })
})
