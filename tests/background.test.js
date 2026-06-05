import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('background.js — AI fetch proxy', () => {
  let handler

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()

    chrome.runtime.onMessage.addListener.mockImplementation((fn) => { handler = fn })

    const { readFileSync } = require('fs')
    const { join } = require('path')
    const src = readFileSync(join(__dirname, '..', 'extension', 'background.js'), 'utf8')

    const wrappedSrc = src
      .replace('chrome.action.onClicked.addListener', '/* skip */ void ')

    const fn = new Function('chrome', 'fetch', 'setTimeout', 'clearTimeout', 'AbortController', wrappedSrc)
    fn(chrome, global.fetch, setTimeout, clearTimeout, AbortController)
  })

  it('registers a message listener', () => {
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledOnce()
    expect(typeof handler).toBe('function')
  })

  it('ignores messages with wrong type', () => {
    const sendResponse = vi.fn()
    const result = handler({ type: 'other' }, { id: chrome.runtime.id }, sendResponse)
    expect(result).toBeUndefined()
    expect(sendResponse).not.toHaveBeenCalled()
  })

  it('ignores messages from other extensions', () => {
    const sendResponse = vi.fn()
    const result = handler(
      { type: 'pendo-validate-ai-fetch' },
      { id: 'different-extension-id' },
      sendResponse
    )
    expect(result).toBeUndefined()
    expect(sendResponse).not.toHaveBeenCalled()
  })

  it('returns true for async sendResponse', () => {
    const result = handler(
      { type: 'pendo-validate-ai-fetch', endpoint: 'https://api.test/v1', headers: {}, body: '{}', timeoutMs: 5000 },
      { id: chrome.runtime.id },
      vi.fn()
    )
    expect(result).toBe(true)
  })

  it('sends successful response with parsed JSON', async () => {
    const payload = { content: [{ text: 'advice' }] }
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(payload),
    })

    const sendResponse = vi.fn()
    handler(
      { type: 'pendo-validate-ai-fetch', endpoint: 'https://api.test/v1', headers: { 'Content-Type': 'application/json' }, body: '{}', timeoutMs: 5000 },
      { id: chrome.runtime.id },
      sendResponse
    )

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    const response = sendResponse.mock.calls[0][0]
    expect(response.ok).toBe(true)
    expect(response.status).toBe(200)
    expect(response.json).toEqual(payload)
  })

  it('returns json: null when response body is empty', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    })

    const sendResponse = vi.fn()
    handler(
      { type: 'pendo-validate-ai-fetch', endpoint: 'https://api.test/v1', headers: {}, body: '{}', timeoutMs: 5000 },
      { id: chrome.runtime.id },
      sendResponse
    )

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    expect(sendResponse.mock.calls[0][0].json).toBeNull()
  })

  it('returns json: null when response is not valid JSON', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'not json',
    })

    const sendResponse = vi.fn()
    handler(
      { type: 'pendo-validate-ai-fetch', endpoint: 'https://api.test/v1', headers: {}, body: '{}', timeoutMs: 5000 },
      { id: chrome.runtime.id },
      sendResponse
    )

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    expect(sendResponse.mock.calls[0][0].json).toBeNull()
    expect(sendResponse.mock.calls[0][0].ok).toBe(true)
  })

  it('forwards non-ok status from upstream', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: 'invalid key' } }),
    })

    const sendResponse = vi.fn()
    handler(
      { type: 'pendo-validate-ai-fetch', endpoint: 'https://api.test/v1', headers: {}, body: '{}', timeoutMs: 5000 },
      { id: chrome.runtime.id },
      sendResponse
    )

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    const response = sendResponse.mock.calls[0][0]
    expect(response.ok).toBe(false)
    expect(response.status).toBe(401)
    expect(response.json.error.message).toBe('invalid key')
  })

  it('returns error: "network" on fetch rejection', async () => {
    fetch.mockRejectedValue(new Error('Failed to fetch'))

    const sendResponse = vi.fn()
    handler(
      { type: 'pendo-validate-ai-fetch', endpoint: 'https://api.test/v1', headers: {}, body: '{}', timeoutMs: 5000 },
      { id: chrome.runtime.id },
      sendResponse
    )

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    const response = sendResponse.mock.calls[0][0]
    expect(response.ok).toBe(false)
    expect(response.status).toBe(0)
    expect(response.error).toBe('network')
    expect(response.message).toContain('Failed to fetch')
  })

  it('returns error: "timeout" on AbortError', async () => {
    fetch.mockRejectedValue(new DOMException('Aborted', 'AbortError'))

    const sendResponse = vi.fn()
    handler(
      { type: 'pendo-validate-ai-fetch', endpoint: 'https://api.test/v1', headers: {}, body: '{}', timeoutMs: 5000 },
      { id: chrome.runtime.id },
      sendResponse
    )

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    const response = sendResponse.mock.calls[0][0]
    expect(response.ok).toBe(false)
    expect(response.error).toBe('timeout')
  })

  it('passes correct endpoint and headers to fetch', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200, text: async () => '{}' })

    const sendResponse = vi.fn()
    const headers = { 'x-api-key': 'test-key', 'Content-Type': 'application/json' }
    handler(
      { type: 'pendo-validate-ai-fetch', endpoint: 'https://custom.api/messages', headers, body: '{"model":"test"}', timeoutMs: 5000 },
      { id: chrome.runtime.id },
      sendResponse
    )

    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toBe('https://custom.api/messages')
    expect(opts.method).toBe('POST')
    expect(opts.headers['x-api-key']).toBe('test-key')
    expect(opts.body).toBe('{"model":"test"}')
  })
})
