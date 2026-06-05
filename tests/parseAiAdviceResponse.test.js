import { describe, it, expect } from 'vitest'
import { parseAiAdviceResponse, stripAllUrls } from './helpers.js'

describe('stripAllUrls', () => {
  it('removes https URLs', () => {
    expect(stripAllUrls('Check https://support.pendo.io/hc/en-us for details')).toBe('Check for details')
  })

  it('removes http URLs', () => {
    expect(stripAllUrls('See http://example.com/page for more')).toBe('See for more')
  })

  it('collapses extra whitespace', () => {
    expect(stripAllUrls('before  https://x.com  after')).toBe('before after')
  })

  it('handles null/empty', () => {
    expect(stripAllUrls(null)).toBe('')
    expect(stripAllUrls('')).toBe('')
  })
})

describe('parseAiAdviceResponse', () => {
  describe('JSON parsing (preferred)', () => {
    it('parses a valid JSON array response', () => {
      const content = '[{"text":"Add visitorId to pendo.initialize.","supportKey":"chooseIdsMetadata"}]'
      const result = parseAiAdviceResponse(content, [])
      expect(result).toHaveLength(1)
      expect(result[0].text).toBe('Add visitorId to pendo.initialize.')
      expect(result[0].supportKey).toBe('chooseIdsMetadata')
      expect(result[0].source).toBe('ai')
    })

    it('handles JSON with surrounding text', () => {
      const content = 'Here are my suggestions:\n[{"text":"Fix CSP.","supportKey":"csp"}]'
      const result = parseAiAdviceResponse(content, [])
      expect(result).toHaveLength(1)
      expect(result[0].text).toBe('Fix CSP.')
    })

    it('limits to 3 items', () => {
      const items = Array.from({ length: 5 }, (_, i) => ({ text: `Suggestion number ${i + 1} here.`, supportKey: 'spa' }))
      const content = JSON.stringify(items)
      const result = parseAiAdviceResponse(content, [])
      expect(result).toHaveLength(3)
    })

    it('infers supportKey when not provided in JSON', () => {
      const content = '[{"text":"Check your Content Security Policy settings."}]'
      const result = parseAiAdviceResponse(content, [])
      expect(result[0].supportKey).toBe('csp')
    })

    it('infers supportKey when invalid key provided', () => {
      const content = '[{"text":"Update the CSP to allow Pendo.","supportKey":"nonexistent"}]'
      const result = parseAiAdviceResponse(content, [])
      expect(result[0].supportKey).toBe('csp')
    })
  })

  describe('markdown fallback', () => {
    it('strips markdown headers, bold, bullets, and URLs', () => {
      const content = `## Recommendations
1. **Verify snippet installation** — see https://support.pendo.io/hc/en-us/articles/360046272771
2. Add visitor metadata fields for better segmentation.`
      const result = parseAiAdviceResponse(content, [])
      expect(result.length).toBeGreaterThanOrEqual(1)
      expect(result[0].text).not.toContain('##')
      expect(result[0].text).not.toContain('**')
      expect(result[0].text).not.toContain('https://')
    })

    it('handles bullet-style responses', () => {
      const content = '- Fix the snippet\n- Check CSP\n- Update agent'
      const result = parseAiAdviceResponse(content, [])
      expect(result).toHaveLength(3)
      expect(result[0].text).toBe('Fix the snippet')
      expect(result[1].text).toBe('Check CSP')
    })

    it('strips backtick code formatting', () => {
      const content = '- Run `pendo.initialize()` with correct params'
      const result = parseAiAdviceResponse(content, [])
      expect(result[0].text).toBe('Run pendo.initialize() with correct params')
    })
  })

  describe('deduplication', () => {
    it('removes items that are substrings of existing advice', () => {
      const existing = [{ text: 'Visitor identity is not set. Call pendo.initialize with a visitorId after authentication.' }]
      const content = '[{"text":"Call pendo.initialize with a visitorId after authentication.","supportKey":"chooseIdsMetadata"}]'
      const result = parseAiAdviceResponse(content, existing)
      expect(result).toHaveLength(0)
    })

    it('removes items with >70% token overlap', () => {
      const existing = [{ text: 'No visitor metadata fields detected beyond the ID. Consider passing name, email, and role for better segmentation.' }]
      const content = '[{"text":"Consider passing name, email, and role for better segmentation of your visitors.","supportKey":"chooseIdsMetadata"}]'
      const result = parseAiAdviceResponse(content, existing)
      expect(result).toHaveLength(0)
    })

    it('keeps items that are genuinely different', () => {
      const existing = [{ text: 'CSP is blocking Pendo.' }]
      const content = '[{"text":"Enable pendo.enableDebugging() to see detailed agent initialization logs.","supportKey":"agentDebug"}]'
      const result = parseAiAdviceResponse(content, existing)
      expect(result).toHaveLength(1)
    })
  })

  describe('edge cases', () => {
    it('filters items shorter than 5 characters', () => {
      const content = '[{"text":"OK.","supportKey":"spa"},{"text":"Check your CSP headers carefully.","supportKey":"csp"}]'
      const result = parseAiAdviceResponse(content, [])
      expect(result).toHaveLength(1)
      expect(result[0].text).toContain('CSP')
    })

    it('handles empty content', () => {
      expect(parseAiAdviceResponse('', [])).toHaveLength(0)
    })

    it('handles content with only URLs', () => {
      const content = '- https://support.pendo.io/hc/en-us/articles/360046272771'
      const result = parseAiAdviceResponse(content, [])
      expect(result).toHaveLength(0)
    })
  })
})
