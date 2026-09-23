import { describe, it, expect } from 'vitest'
import { filterCapturedLogs } from './helpers.js'

const captured = [
  { level: 'error', text: 'Error one' },
  { level: 'warn', text: 'Warning alpha' },
  { level: 'info', text: 'Info note' },
  { level: 'error', text: 'Error two' },
]

describe('filterCapturedLogs', () => {
  it('counts all levels and returns all lines when filters and query are open', () => {
    const out = filterCapturedLogs(captured, { error: true, warn: true, info: true }, '')
    expect(out.errCount).toBe(2)
    expect(out.warnCount).toBe(1)
    expect(out.infoCount).toBe(1)
    expect(out.visible).toHaveLength(4)
  })

  it('respects level chip toggles', () => {
    const out = filterCapturedLogs(captured, { error: true, warn: false, info: false }, '')
    expect(out.visible).toHaveLength(2)
    expect(out.visible.every((l) => l.level === 'error')).toBe(true)
  })

  it('filters by search query case-insensitively', () => {
    const out = filterCapturedLogs(captured, { error: true, warn: true, info: true }, 'alpha')
    expect(out.visible).toHaveLength(1)
    expect(out.visible[0].text).toContain('alpha')
  })
})
