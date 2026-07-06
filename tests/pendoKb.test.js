import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { JSDOM } from 'jsdom';
import { selectRelatedReading } from './helpers.js';

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

  it('returns the VDS article for vds/designer topics', () => {
    const results = findKbByTopics(['vds', 'designer', 'guides'], 10);
    expect(results.length).toBeGreaterThan(0);
    const slugs = results.map(r => r.slug);
    expect(slugs).toContain('launch-vds');
  });

  it('returns the validate-install article for validation/best-practices topics', () => {
    const results = findKbByTopics(['validation', 'best-practices'], 10);
    expect(results.length).toBeGreaterThan(0);
    const slugs = results.map(r => r.slug);
    expect(slugs).toContain('validate-install');
  });
});

describe('selectRelatedReading', () => {
  it('returns empty when no signals provided', () => {
    expect(selectRelatedReading(null, 6, findKbByTopics)).toEqual([]);
    expect(selectRelatedReading(undefined, 6, findKbByTopics)).toEqual([]);
  });

  it('returns empty when findKbByTopics is not a function', () => {
    expect(selectRelatedReading({}, 6, null)).toEqual([]);
    expect(selectRelatedReading({}, 6, 'not a fn')).toEqual([]);
  });

  it('returns install/troubleshooting articles when pendoPresent is false', () => {
    const results = selectRelatedReading({ pendoPresent: false }, 10, findKbByTopics);
    expect(results.length).toBeGreaterThan(0);
    const allTopics = results.flatMap(r => r.topics);
    expect(allTopics.some(t => t === 'install' || t === 'snippet' || t === 'troubleshooting')).toBe(true);
  });

  it('returns CSP articles when cspIssue is true', () => {
    const results = selectRelatedReading({ pendoPresent: true, cspIssue: true }, 10, findKbByTopics);
    expect(results.length).toBeGreaterThan(0);
    const slugs = results.map(r => r.slug);
    expect(slugs).toContain('csp');
  });

  it('returns SPA + framework articles for frameworkHint react', () => {
    const results = selectRelatedReading({ pendoPresent: true, isSpa: true, frameworkHint: 'react' }, 10, findKbByTopics);
    expect(results.length).toBeGreaterThan(0);
    const slugs = results.map(r => r.slug);
    expect(slugs).toContain('spa-install');
  });

  it('returns GTM articles when hasGtm is true', () => {
    const results = selectRelatedReading({ pendoPresent: true, hasGtm: true }, 10, findKbByTopics);
    expect(results.length).toBeGreaterThan(0);
    const slugs = results.map(r => r.slug);
    expect(slugs).toContain('gtm-install');
  });

  it('returns sandbox articles when isSandbox is true', () => {
    const results = selectRelatedReading({ pendoPresent: true, isSandbox: true }, 10, findKbByTopics);
    expect(results.length).toBeGreaterThan(0);
    const allTopics = results.flatMap(r => r.topics);
    expect(allTopics).toContain('sandbox');
  });

  it('returns the VDS article when urlSanitized is true', () => {
    const results = selectRelatedReading({ pendoPresent: true, urlSanitized: true }, 10, findKbByTopics);
    expect(results.length).toBeGreaterThan(0);
    const slugs = results.map(r => r.slug);
    expect(slugs).toContain('launch-vds');
  });

  it('returns identity/metadata articles when visitorId missing', () => {
    const results = selectRelatedReading({ pendoPresent: true, visitorId: null }, 10, findKbByTopics);
    expect(results.length).toBeGreaterThan(0);
    const allTopics = results.flatMap(r => r.topics);
    expect(allTopics).toContain('identity');
  });

  it('respects max parameter', () => {
    const results = selectRelatedReading({ pendoPresent: false, cspIssue: true, isSpa: true }, 2, findKbByTopics);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('returns iframe articles when isIframe is true', () => {
    const results = selectRelatedReading({ pendoPresent: true, isIframe: true }, 10, findKbByTopics);
    expect(results.length).toBeGreaterThan(0);
    const allTopics = results.flatMap(r => r.topics);
    expect(allTopics).toContain('iframe');
  });

  it('returns agent/troubleshooting articles when validatePresent is false', () => {
    const results = selectRelatedReading({ pendoPresent: true, validatePresent: false }, 10, findKbByTopics);
    expect(results.length).toBeGreaterThan(0);
    const allTopics = results.flatMap(r => r.topics);
    expect(allTopics.some(t => t === 'agent' || t === 'troubleshooting')).toBe(true);
  });

  it('returns metadata articles when hasVisitorMeta is false', () => {
    const results = selectRelatedReading({ pendoPresent: true, hasVisitorMeta: false }, 10, findKbByTopics);
    expect(results.length).toBeGreaterThan(0);
    const allTopics = results.flatMap(r => r.topics);
    expect(allTopics).toContain('metadata');
  });

  it('returns metadata+account articles when hasAccountMeta is false but hasVisitorMeta is true', () => {
    const results = selectRelatedReading({ pendoPresent: true, hasVisitorMeta: true, hasAccountMeta: false }, 10, findKbByTopics);
    expect(results.length).toBeGreaterThan(0);
    const allTopics = results.flatMap(r => r.topics);
    expect(allTopics).toContain('metadata');
  });

  it('returns identity+account articles when accountId is null', () => {
    const results = selectRelatedReading({ pendoPresent: true, accountId: null }, 10, findKbByTopics);
    expect(results.length).toBeGreaterThan(0);
    const allTopics = results.flatMap(r => r.topics);
    expect(allTopics.some(t => t === 'identity' || t === 'account')).toBe(true);
  });

  it('returns network/csp articles when noResourceHits is true and pendoPresent', () => {
    const results = selectRelatedReading({ pendoPresent: true, noResourceHits: true }, 10, findKbByTopics);
    expect(results.length).toBeGreaterThan(0);
    const allTopics = results.flatMap(r => r.topics);
    expect(allTopics.some(t => t === 'network' || t === 'csp')).toBe(true);
  });

  it('returns segment articles when hasSegment is true', () => {
    const results = selectRelatedReading({ pendoPresent: true, hasSegment: true }, 10, findKbByTopics);
    expect(results.length).toBeGreaterThan(0);
    const allTopics = results.flatMap(r => r.topics);
    expect(allTopics.some(t => t === 'segment' || t === 'tag-manager')).toBe(true);
  });

  it('returns launcher articles when launcherPresent is true', () => {
    const results = selectRelatedReading({ pendoPresent: true, launcherPresent: true }, 10, findKbByTopics);
    expect(results.length).toBeGreaterThan(0);
    const allTopics = results.flatMap(r => r.topics);
    expect(allTopics).toContain('launcher');
  });

  it('returns agent/configuration articles when agentVersionOld is true', () => {
    const results = selectRelatedReading({ pendoPresent: true, agentVersionOld: true }, 10, findKbByTopics);
    expect(results.length).toBeGreaterThan(0);
    const allTopics = results.flatMap(r => r.topics);
    expect(allTopics.some(t => t === 'agent' || t === 'configuration')).toBe(true);
  });

  it('returns api-key/install articles when apiKeyMissing is true', () => {
    const results = selectRelatedReading({ pendoPresent: true, apiKeyMissing: true }, 10, findKbByTopics);
    expect(results.length).toBeGreaterThan(0);
    const allTopics = results.flatMap(r => r.topics);
    expect(allTopics.some(t => t === 'api-key' || t === 'install')).toBe(true);
  });

  it('surfaces the validate-install article on a fully healthy install', () => {
    const results = selectRelatedReading({
      pendoPresent: true,
      validatePresent: true,
      visitorId: 'user-123',
      accountId: 'acct-9',
      hasVisitorMeta: true,
      hasAccountMeta: true,
    }, 6, findKbByTopics);
    expect(results.length).toBeGreaterThan(0);
    const slugs = results.map(r => r.slug);
    expect(slugs).toContain('validate-install');
  });

  it('does NOT surface the healthy validate-install article when a warning was logged', () => {
    const results = selectRelatedReading({
      pendoPresent: true,
      validatePresent: true,
      visitorId: 'user-123',
      accountId: 'acct-9',
      hasVisitorMeta: true,
      hasAccountMeta: true,
      hasWarn: true,
    }, 6, findKbByTopics);
    const slugs = results.map(r => r.slug);
    expect(slugs).not.toContain('validate-install');
  });

  it('does NOT surface the healthy validate-install article when an error was logged', () => {
    const results = selectRelatedReading({
      pendoPresent: true,
      validatePresent: true,
      visitorId: 'user-123',
      accountId: 'acct-9',
      hasVisitorMeta: true,
      hasAccountMeta: true,
      hasError: true,
    }, 6, findKbByTopics);
    const slugs = results.map(r => r.slug);
    expect(slugs).not.toContain('validate-install');
  });
});
