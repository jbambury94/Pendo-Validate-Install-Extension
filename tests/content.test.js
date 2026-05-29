import { describe, it, expect, vi, beforeEach } from 'vitest'
import { clampDragPosition, clampResizeSize, enableDebuggingInPage } from './helpers.js'

// ── Drag clamping ─────────────────────────────────────────────────────────────

describe('clampDragPosition', () => {
  const viewport = { innerWidth: 1024, innerHeight: 768, iframeWidth: 460 }

  it('returns correct position within bounds', () => {
    const pos = clampDragPosition({ clientX: 300, clientY: 200, offsetX: 10, offsetY: 10, ...viewport })
    expect(pos.left).toBe(290)
    expect(pos.top).toBe(190)
  })

  it('clamps left to 0 when dragged past the left edge', () => {
    const pos = clampDragPosition({ clientX: 10, clientY: 100, offsetX: 50, offsetY: 0, ...viewport })
    expect(pos.left).toBe(0)
  })

  it('clamps right to innerWidth - iframeWidth', () => {
    const pos = clampDragPosition({ clientX: 1000, clientY: 100, offsetX: 0, offsetY: 0, ...viewport })
    expect(pos.left).toBe(1024 - 460) // 564
  })

  it('clamps top to 0 when dragged above the viewport', () => {
    const pos = clampDragPosition({ clientX: 100, clientY: 5, offsetX: 0, offsetY: 50, ...viewport })
    expect(pos.top).toBe(0)
  })

  it('clamps bottom to innerHeight - 60 to keep hero bar visible', () => {
    const pos = clampDragPosition({ clientX: 100, clientY: 900, offsetX: 0, offsetY: 0, ...viewport })
    expect(pos.top).toBe(768 - 60) // 708
  })

  it('allows position exactly at left boundary (0)', () => {
    const pos = clampDragPosition({ clientX: 0, clientY: 100, offsetX: 0, offsetY: 0, ...viewport })
    expect(pos.left).toBe(0)
  })

  it('allows position exactly at right boundary', () => {
    const pos = clampDragPosition({ clientX: 1024 - 460, clientY: 100, offsetX: 0, offsetY: 0, ...viewport })
    expect(pos.left).toBe(564)
  })

  it('accounts for offsetX correctly', () => {
    const pos = clampDragPosition({ clientX: 200, clientY: 100, offsetX: 30, offsetY: 0, ...viewport })
    expect(pos.left).toBe(170)
  })

  it('accounts for offsetY correctly', () => {
    const pos = clampDragPosition({ clientX: 100, clientY: 200, offsetX: 0, offsetY: 25, ...viewport })
    expect(pos.top).toBe(175)
  })
})

// ── Resize clamping ──────────────────────────────────────────────────────────

describe('clampResizeSize', () => {
  const viewport = { innerWidth: 1024, innerHeight: 768 }

  it('returns unclamped size when within bounds', () => {
    const size = clampResizeSize({ originWidth: 440, originHeight: 660, dw: 50, dh: 30, ...viewport })
    expect(size.width).toBe(490)
    expect(size.height).toBe(690)
  })

  it('clamps width to MIN_WIDTH (360) when shrinking past minimum', () => {
    const size = clampResizeSize({ originWidth: 440, originHeight: 660, dw: -200, dh: 0, ...viewport })
    expect(size.width).toBe(360)
  })

  it('clamps height to MIN_HEIGHT (480) when shrinking past minimum', () => {
    const size = clampResizeSize({ originWidth: 440, originHeight: 660, dw: 0, dh: -300, ...viewport })
    expect(size.height).toBe(480)
  })

  it('clamps width to floor(innerWidth * 0.92) when expanding past max', () => {
    const size = clampResizeSize({ originWidth: 440, originHeight: 660, dw: 900, dh: 0, ...viewport })
    expect(size.width).toBe(Math.floor(1024 * 0.92))
  })

  it('clamps height to floor(innerHeight * 0.92) when expanding past max', () => {
    const size = clampResizeSize({ originWidth: 440, originHeight: 660, dw: 0, dh: 900, ...viewport })
    expect(size.height).toBe(Math.floor(768 * 0.92))
  })

  it('returns origin dimensions when dw and dh are 0', () => {
    const size = clampResizeSize({ originWidth: 500, originHeight: 600, dw: 0, dh: 0, ...viewport })
    expect(size.width).toBe(500)
    expect(size.height).toBe(600)
  })

  it('handles negative deltas that stay above minimum', () => {
    const size = clampResizeSize({ originWidth: 500, originHeight: 600, dw: -50, dh: -50, ...viewport })
    expect(size.width).toBe(450)
    expect(size.height).toBe(550)
  })

  it('clamps both axes simultaneously', () => {
    const size = clampResizeSize({ originWidth: 440, originHeight: 660, dw: -500, dh: 500, ...viewport })
    expect(size.width).toBe(360)
    expect(size.height).toBe(Math.floor(768 * 0.92))
  })
})

// ── enableDebuggingInPage ─────────────────────────────────────────────────────

describe('enableDebuggingInPage', () => {
  beforeEach(() => {
    delete window.pendo
    delete window.Pendo
  })

  it('returns ok: false when no pendo agent on window', () => {
    const result = enableDebuggingInPage()
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/Pendo not found/)
  })

  it('returns ok: false when enableDebugging method is missing', () => {
    window.pendo = {}
    const result = enableDebuggingInPage()
    expect(result.ok).toBe(false)
  })

  it('returns ok: true when enableDebugging is called successfully', () => {
    window.pendo = { enableDebugging: vi.fn() }
    expect(enableDebuggingInPage()).toEqual({ ok: true })
    expect(window.pendo.enableDebugging).toHaveBeenCalledOnce()
  })

  it('returns ok: false with error message when enableDebugging throws', () => {
    window.pendo = { enableDebugging: () => { throw new Error('debug error') } }
    const result = enableDebuggingInPage()
    expect(result.ok).toBe(false)
    expect(result.message).toBe('debug error')
  })

  it('picks up window.Pendo (capital P) as fallback', () => {
    window.Pendo = { enableDebugging: vi.fn() }
    expect(enableDebuggingInPage().ok).toBe(true)
  })
})

