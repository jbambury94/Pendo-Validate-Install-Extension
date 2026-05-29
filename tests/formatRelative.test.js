import { describe, it, expect, vi, afterEach } from 'vitest'
import { formatRelative } from './helpers.js'

describe('formatRelative', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "NEVER" for null input', () => {
    expect(formatRelative(null)).toBe('NEVER')
  })

  it('returns "NEVER" for undefined input', () => {
    expect(formatRelative(undefined)).toBe('NEVER')
  })

  it('returns "JUST NOW" for a date less than 5 seconds ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-27T12:00:03.000Z'))
    expect(formatRelative(new Date('2026-05-27T12:00:00.000Z'))).toBe('JUST NOW')
  })

  it('returns seconds ago for a date between 5 and 60 seconds ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-27T12:00:30.000Z'))
    expect(formatRelative(new Date('2026-05-27T12:00:00.000Z'))).toBe('30s AGO')
  })

  it('returns minutes ago for a date between 1 and 60 minutes ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-27T12:05:00.000Z'))
    expect(formatRelative(new Date('2026-05-27T12:00:00.000Z'))).toBe('5m AGO')
  })

  it('returns hours ago for a date more than 60 minutes ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-27T14:00:00.000Z'))
    expect(formatRelative(new Date('2026-05-27T12:00:00.000Z'))).toBe('2h AGO')
  })
})
