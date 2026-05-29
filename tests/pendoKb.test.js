import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { JSDOM } from 'jsdom';

let PENDO_KB, findKbByTopics, PENDO_KB_MIN_AGENT_VERSION;

beforeAll(() => {
  const src = readFileSync(join(__dirname, '..', 'extension', 'pendo-kb.js'), 'utf8');
  const dom = new JSDOM('<!doctype html>', { runScripts: 'dangerously' });
  const wrapper = `(function() { ${src}; return { PENDO_KB, findKbByTopics, PENDO_KB_MIN_AGENT_VERSION }; })()`;
  const result = dom.window.eval(wrapper);
  PENDO_KB = result.PENDO_KB;
  findKbByTopics = result.findKbByTopics;
  PENDO_KB_MIN_AGENT_VERSION = result.PENDO_KB_MIN_AGENT_VERSION;
});

describe('PENDO_KB data integrity', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(PENDO_KB)).toBe(true);
    expect(PENDO_KB.length).toBeGreaterThanOrEqual(20);
  });

  it('every entry has required fields', () => {
    for (const entry of PENDO_KB) {
      expect(typeof entry.slug).toBe('string');
      expect(entry.slug.length).toBeGreaterThan(0);
      expect(typeof entry.title).toBe('string');
      expect(entry.url).toMatch(/^https:\/\/support\.pendo\.io\//);
      expect(Array.isArray(entry.topics)).toBe(true);
      expect(entry.topics.length).toBeGreaterThan(0);
      expect(typeof entry.summary).toBe('string');
      expect(Array.isArray(entry.bullets)).toBe(true);
      expect(entry.bullets.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('slugs are unique', () => {
    const slugs = PENDO_KB.map(e => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('exposes PENDO_KB_MIN_AGENT_VERSION as a semver string', () => {
    expect(typeof PENDO_KB_MIN_AGENT_VERSION).toBe('string');
    expect(PENDO_KB_MIN_AGENT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('findKbByTopics', () => {
  it('returns empty array for no topics', () => {
    expect(findKbByTopics([], 6)).toEqual([]);
    expect(findKbByTopics(null, 6)).toEqual([]);
    expect(findKbByTopics(undefined, 6)).toEqual([]);
  });

  it('returns entries matching a single topic', () => {
    const results = findKbByTopics(['csp'], 10);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.topics.some(t => t === 'csp')).toBe(true);
    }
  });

  it('orders by match count descending', () => {
    const results = findKbByTopics(['csp', 'security', 'network'], 10);
    expect(results.length).toBeGreaterThan(1);
    const first = results[0];
    const firstHits = first.topics.filter(t => ['csp', 'security', 'network'].includes(t)).length;
    for (let i = 1; i < results.length; i++) {
      const hits = results[i].topics.filter(t => ['csp', 'security', 'network'].includes(t)).length;
      expect(hits).toBeLessThanOrEqual(firstHits);
    }
  });

  it('respects the max parameter', () => {
    const all = findKbByTopics(['install'], 100);
    expect(all.length).toBeGreaterThan(3);
    const capped = findKbByTopics(['install'], 2);
    expect(capped.length).toBe(2);
  });

  it('defaults max to 6 when omitted', () => {
    const results = findKbByTopics(['install']);
    expect(results.length).toBeLessThanOrEqual(6);
  });

  it('deduplicates entries by slug', () => {
    const results = findKbByTopics(['install', 'snippet', 'troubleshooting'], 20);
    const slugs = results.map(r => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('is case-insensitive on topic matching', () => {
    const lower = findKbByTopics(['csp'], 10);
    const upper = findKbByTopics(['CSP'], 10);
    expect(lower.map(r => r.slug)).toEqual(upper.map(r => r.slug));
  });

  it('returns entries with matching topics for identity signals', () => {
    const results = findKbByTopics(['identity', 'metadata'], 10);
    expect(results.length).toBeGreaterThan(0);
    const slugs = results.map(r => r.slug);
    expect(slugs).toContain('choose-ids-metadata');
  });

  it('returns framework-relevant entries for SPA topics', () => {
    const results = findKbByTopics(['spa', 'framework-react'], 10);
    expect(results.length).toBeGreaterThan(0);
    const slugs = results.map(r => r.slug);
    expect(slugs).toContain('spa-install');
  });
});
