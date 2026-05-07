import { describe, it, expect, vi, beforeEach } from 'vitest'
import { requestAiAdvice, buildAiPrompt, PENDO_SUPPORT, friendlyAiFailureDetail } from './helpers.js'

const baseContext = {
  pageUrl: 'https://example.com',
  status: {
    version: '2.314.1',
    validatePresent: true,
    pendoPresent: true,
    detectedApiKey: 'abc',
    visitorId: 'v1',
    accountId: 'a1',
  },
  apiKeyFound: true,
  cspMeta: '',
  captured: [],
}

function mockStorage(cfg) {
  chrome.storage.local.get.mockImplementation((_defaults, cb) => cb(cfg))
}

beforeEach(() => {
  global.fetch = vi.fn()
})

describe('requestAiAdvice — no API key', () => {
  it('returns empty array when aiApiKey is not configured', async () => {
    mockStorage({ aiProvider: 'openai', aiEndpoint: '', aiApiKey: '', aiModel: '' })
    expect(await requestAiAdvice(baseContext)).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns empty array when aiApiKey is only whitespace', async () => {
    mockStorage({ aiProvider: 'openai', aiEndpoint: '', aiApiKey: '  \n\t  ', aiModel: '' })
    expect(await requestAiAdvice(baseContext)).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('requestAiAdvice — OpenAI provider', () => {
  beforeEach(() => {
    mockStorage({ aiProvider: 'openai', aiEndpoint: '', aiApiKey: 'sk-test', aiModel: '' })
  })

  it('calls the OpenAI completions endpoint', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '- Fix the snippet' } }] }) })
    await requestAiAdvice(baseContext)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('openai.com'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('sends Authorization Bearer header', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '- tip' } }] }) })
    await requestAiAdvice(baseContext)
    const [, opts] = fetch.mock.calls[0]
    expect(opts.headers['Authorization']).toBe('Bearer sk-test')
  })

  it('parses choices[0].message.content and splits into advice items', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '- Fix snippet\n- Update key' } }] }) })
    const result = await requestAiAdvice(baseContext)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ text: 'Fix snippet', source: 'ai', supportUrl: PENDO_SUPPORT.technicalSupport })
    expect(result[1].text).toBe('Update key')
  })

  it('strips leading bullet characters from response lines', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '* Check API\n- Fix CSP' } }] }) })
    const result = await requestAiAdvice(baseContext)
    expect(result[0].text).toBe('Check API')
    expect(result[1].text).toBe('Fix CSP')
  })

  it('returns empty array when response content is empty', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '' } }] }) })
    expect(await requestAiAdvice(baseContext)).toEqual([])
  })

  it('returns error advice item on non-OK HTTP response', async () => {
    fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: { message: 'invalid x-api-key' } }) })
    const result = await requestAiAdvice(baseContext)
    expect(result[0].text).toContain('AI suggestion unavailable')
    expect(result[0].text).toContain('401')
    expect(result[0].text).toContain('invalid x-api-key')
    expect(result[0].source).toBe('ai')
  })

  it('returns error advice item when fetch throws (e.g. network error)', async () => {
    fetch.mockRejectedValue(new Error('Network error'))
    const result = await requestAiAdvice(baseContext)
    expect(result[0].text).toContain('AI suggestion unavailable')
  })

  it('returns error advice item on AbortError (timeout)', async () => {
    fetch.mockRejectedValue(new DOMException('Aborted', 'AbortError'))
    const result = await requestAiAdvice(baseContext)
    expect(result[0].text).toContain('AI suggestion unavailable')
    expect(result[0].text).toContain('timed out')
  })

  it('uses a custom aiEndpoint when provided', async () => {
    mockStorage({ aiProvider: 'openai', aiEndpoint: 'https://my-proxy.example.com/v1/chat/completions', aiApiKey: 'sk-test', aiModel: '' })
    fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '- tip' } }] }) })
    await requestAiAdvice(baseContext)
    expect(fetch.mock.calls[0][0]).toBe('https://my-proxy.example.com/v1/chat/completions')
  })
})

describe('requestAiAdvice — Claude provider', () => {
  beforeEach(() => {
    mockStorage({ aiProvider: 'claude', aiEndpoint: '', aiApiKey: 'ant-test', aiModel: '' })
    chrome.runtime.sendMessage.mockImplementation(async (msg) => {
      if (msg.type !== 'pendo-validate-ai-fetch') return undefined
      const res = await fetch(msg.endpoint, { method: 'POST', headers: msg.headers, body: msg.body })
      const text = await res.text()
      let json = null
      try {
        json = text ? JSON.parse(text) : null
      } catch (_) {}
      return { ok: res.ok, status: res.status, json }
    })
  })

  it('calls the Anthropic messages endpoint', async () => {
    const payload = { content: [{ text: '- Check key' }] }
    fetch.mockResolvedValue({ ok: true, text: async () => JSON.stringify(payload) })
    await requestAiAdvice(baseContext)
    expect(fetch.mock.calls[0][0]).toContain('anthropic.com')
  })

  it('proxies Claude via sendMessage with Anthropic browser-access and API headers', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ content: [{ text: '- tip' }] }), text: async () => JSON.stringify({ content: [{ text: '- tip' }] }) })
    await requestAiAdvice(baseContext)
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'pendo-validate-ai-fetch',
        endpoint: expect.stringContaining('anthropic.com'),
      }),
    )
    const msg = chrome.runtime.sendMessage.mock.calls[0][0]
    expect(msg.headers['x-api-key']).toBe('ant-test')
    expect(msg.headers['anthropic-version']).toBe('2023-06-01')
    expect(msg.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
  })

  it('uses aiClaudeEndpoint and omits browser-only header for non-anthropic URLs', async () => {
    mockStorage({ aiProvider: 'claude', aiEndpoint: '', aiClaudeEndpoint: 'https://proxy.example/v1/messages', aiApiKey: 'ant-test', aiModel: '' })
    fetch.mockResolvedValue({ ok: true, text: async () => JSON.stringify({ content: [{ text: '- ok' }] }) })
    await requestAiAdvice(baseContext)
    const msg = chrome.runtime.sendMessage.mock.calls[0][0]
    expect(msg.endpoint).toBe('https://proxy.example/v1/messages')
    expect(msg.headers['anthropic-dangerous-direct-browser-access']).toBeUndefined()
  })

  it('parses content[0].text from Claude response', async () => {
    const payload = { content: [{ text: '- Fix snippet\n- Update CSP' }] }
    fetch.mockResolvedValue({ ok: true, text: async () => JSON.stringify(payload) })
    const result = await requestAiAdvice(baseContext)
    expect(result).toHaveLength(2)
    expect(result[0].text).toBe('Fix snippet')
  })

  it('surfaces org-policy guidance when Anthropic blocks client-side access', async () => {
    chrome.runtime.sendMessage.mockResolvedValue({
      ok: false,
      status: 401,
      json: { error: { message: 'CORS requests are not allowed for this Organization because of its settings.' } },
    })
    const result = await requestAiAdvice(baseContext)
    expect(result[0].text).toContain('AI suggestion unavailable')
    expect(result[0].text).toContain('organization policy')
  })
})

describe('requestAiAdvice — Gemini provider', () => {
  beforeEach(() => {
    mockStorage({ aiProvider: 'gemini', aiEndpoint: '', aiApiKey: 'gem-test', aiModel: '' })
  })

  it('calls the Gemini generateContent endpoint', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '- Fix it' }] } }] }) })
    await requestAiAdvice(baseContext)
    expect(fetch.mock.calls[0][0]).toContain('googleapis.com')
    expect(fetch.mock.calls[0][0]).toContain('gem-test')
  })

  it('parses candidates[0].content.parts[0].text from Gemini response', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '- Update snippet\n- Check CSP' }] } }] }) })
    const result = await requestAiAdvice(baseContext)
    expect(result[0].text).toBe('Update snippet')
    expect(result[1].text).toBe('Check CSP')
  })
})

describe('friendlyAiFailureDetail', () => {
  it('maps Anthropic org browser/CORS block to actionable guidance', () => {
    const msg = friendlyAiFailureDetail('claude', 'CORS requests are not allowed for this Organization because of its settings.')
    expect(msg).toContain('OpenAI')
    expect(msg).toContain('Google Gemini')
    expect(msg).toContain('aiClaudeEndpoint')
    expect(friendlyAiFailureDetail('openai', 'CORS requests are not allowed for this Organization')).toBeNull()
  })
})

describe('buildAiPrompt', () => {
  it('includes the page URL', () => {
    expect(buildAiPrompt(baseContext)).toContain('https://example.com')
  })

  it('includes agent version', () => {
    expect(buildAiPrompt(baseContext)).toContain('2.314.1')
  })

  it('includes visitorId', () => {
    expect(buildAiPrompt(baseContext)).toContain('v1')
  })

  it('truncates captured logs to 30 lines and appends ellipsis', () => {
    const ctx = {
      ...baseContext,
      captured: Array.from({ length: 35 }, (_, i) => ({ level: 'log', text: `line ${i}` })),
    }
    const prompt = buildAiPrompt(ctx)
    expect(prompt).toContain('...truncated...')
    expect(prompt).toContain('line 29')
    expect(prompt).not.toContain('line 30')
  })

  it('handles empty captured array without truncation marker', () => {
    const prompt = buildAiPrompt({ ...baseContext, captured: [] })
    expect(prompt).not.toContain('...truncated...')
  })

  it('shows "not set" for null accountId', () => {
    const ctx = { ...baseContext, status: { ...baseContext.status, accountId: null } }
    expect(buildAiPrompt(ctx)).toContain('AccountId: not set')
  })
})
