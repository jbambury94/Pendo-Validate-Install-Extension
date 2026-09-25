import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const extDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension')
const harSrc = readFileSync(join(extDir, 'har-capture.js'), 'utf8')
const harTimingsSrc = readFileSync(join(extDir, 'har-timings.js'), 'utf8')

function loadHarCapture() {
  vm.runInThisContext(harSrc)
}

describe('har-capture', () => {
  beforeAll(() => {
    loadHarCapture()
  })

  const API_KEY = '0b2239ff-4876-4f9d-b180-0f9d58b38600'

  it('isPendoNetworkUrl matches CDN and regional data hosts', () => {
    expect(isPendoNetworkUrl('https://cdn.pendo.io/agent/static/abc/agent.js')).toBe(true)
    expect(isPendoNetworkUrl('https://data.eu.pendo.io/data/ptm.gif/v2/abc/events')).toBe(true)
    expect(isPendoNetworkUrl('https://app.pendo.io/')).toBe(true)
    expect(isPendoNetworkUrl('https://CDN.JPN.PENDO.IO./agent/static/x/pendo.js')).toBe(true)
    expect(isPendoNetworkUrl('https://example.com/app.js')).toBe(false)
  })

  it('isPendoNetworkUrl matches Pendo Cloud Storage buckets only', () => {
    expect(isPendoNetworkUrl('https://pendo-io-static.storage.googleapis.com/guide.css')).toBe(true)
    expect(isPendoNetworkUrl('https://pendo-jp-prod-static.storage.googleapis.com/x.js')).toBe(true)
    expect(isPendoNetworkUrl('https://pendo-static-5668600916475904.storage.googleapis.com/guide-content/a/b/c.guide.js')).toBe(true)
    expect(isPendoNetworkUrl('https://pendo-eu-static-5668600916475904.storage.googleapis.com/guide-content/a.js')).toBe(true)
    expect(isPendoNetworkUrl('https://storage.googleapis.com/pendo-eu-static/guide.css')).toBe(true)
    expect(isPendoNetworkUrl('https://pendo-attacker-static.storage.googleapis.com/x.js')).toBe(false)
    expect(isPendoNetworkUrl('https://customer-bucket.storage.googleapis.com/pendo-io-static/x.js')).toBe(false)
    expect(isPendoNetworkUrl('https://storage.googleapis.com/customer-bucket/pendo-io-static.js')).toBe(false)
  })

  it('isPendoNetworkUrl rejects unrelated URLs that merely contain Pendo-like substrings', () => {
    expect(isPendoNetworkUrl('https://notpendo.com/private')).toBe(false)
    expect(isPendoNetworkUrl('https://pendo.com/private')).toBe(false)
    expect(isPendoNetworkUrl('https://cdn.pendo.io.evil.example/agent.js')).toBe(false)
    expect(isPendoNetworkUrl('https://evilpendo.io/agent.js')).toBe(false)
    expect(isPendoNetworkUrl('https://app.example.com/login?next=https://cdn.pendo.io/')).toBe(false)
    expect(isPendoNetworkUrl('https://app.example.com/#cdn.pendo.io')).toBe(false)
    expect(isPendoNetworkUrl('https://app.example.com/pendo-io/settings')).toBe(false)
    expect(isPendoNetworkUrl('https://app.example.com/agent/static/app.js')).toBe(false)
    expect(isPendoNetworkUrl('https://app.example.com/agent/production/app.js')).toBe(false)
    expect(isPendoNetworkUrl(`https://app.example.com/api/agent/static/${API_KEY}/pendo.js`)).toBe(false)
    expect(isPendoNetworkUrl(`https://app.example.com/data/users/${API_KEY}`)).toBe(false)
    expect(isPendoNetworkUrl('chrome-extension://abc/pendo/guide.css')).toBe(false)
    expect(isPendoNetworkUrl('not a url')).toBe(false)
    expect(isPendoNetworkUrl('')).toBe(false)
  })

  it('isPendoNetworkUrl matches Web SDK routes on custom (CNAME) domains when they carry an API key', () => {
    expect(isPendoNetworkUrl(`https://content.customer.com/agent/static/${API_KEY}/pendo.js`)).toBe(true)
    expect(isPendoNetworkUrl(`https://data.customer.com/data/ptm.gif/${API_KEY}?v=2.341.0&ct=1`)).toBe(true)
    expect(isPendoNetworkUrl(`https://data.customer.com/data/guide.json/${API_KEY}?jzb=x`)).toBe(true)
    expect(isPendoNetworkUrl(`https://data.customer.com/data/rec/${API_KEY}`)).toBe(true)
    expect(isPendoNetworkUrl(`https://data.customer.com/data/segmentflag.json/${API_KEY}`)).toBe(true)
    expect(isPendoNetworkUrl('https://data.customer.com/data/ptm.gif/not-a-key')).toBe(false)
  })

  it('isSelfInstrumentationRequest excludes extension-origin documents and IVA API key URLs', () => {
    const ext = 'chrome-extension://abc123'
    expect(isSelfInstrumentationRequest({
      url: 'https://data.eu.pendo.io/data/ptm.gif/v2/928b3d0d-8a3b-48b1-bf35-a6af3565dcc5/events',
      documentURL: `${ext}/popup.html`,
    }, { extensionOrigin: ext })).toBe(true)
    expect(isSelfInstrumentationRequest({
      url: 'https://data.pendo.io/data/ptm.gif/v2/customer-key/events',
      documentURL: 'https://app.customer.com/',
    }, { extensionOrigin: ext })).toBe(false)
  })

  it('redactHarHeaders removes cookie and authorization headers', () => {
    const out = redactHarHeaders([
      { name: 'Cookie', value: 'secret' },
      { name: 'Authorization', value: 'Bearer x' },
      { name: 'Content-Type', value: 'application/json' },
    ])
    expect(out).toEqual([{ name: 'Content-Type', value: 'application/json' }])
  })

  it('buildHarFromCdpEvents produces HAR 1.2 with Pendo entries only', () => {
    const events = [
      {
        method: 'Network.requestWillBeSent',
        params: {
          requestId: '1',
          documentURL: 'https://app.example.com/',
          request: { url: 'https://cdn.pendo.io/agent/static/x/agent.js', method: 'GET', headers: { Accept: '*/*' } },
          wallTime: 1_700_000_000,
        },
      },
      {
        method: 'Network.responseReceived',
        params: {
          requestId: '1',
          response: { url: 'https://cdn.pendo.io/agent/static/x/agent.js', status: 200, statusText: 'OK', headers: { 'Content-Type': 'application/javascript' } },
        },
      },
      {
        method: 'Network.loadingFinished',
        params: { requestId: '1', encodedDataLength: 1200 },
      },
      {
        method: 'Network.requestWillBeSent',
        params: {
          requestId: '2',
          documentURL: 'https://app.example.com/',
          request: { url: 'https://app.example.com/other.js', method: 'GET' },
        },
      },
    ]
    const har = buildHarFromCdpEvents(events, { pageUrl: 'https://app.example.com/' })
    expect(har.log.version).toBe('1.2')
    expect(har.log.entries).toHaveLength(1)
    expect(har.log.entries[0].request.url).toContain('cdn.pendo.io')
    expect(har.log.entries[0].response.status).toBe(200)
  })

  it('buildHarFromCdpEvents derives timings from CDP response.timing and timestamps', () => {
    const url = 'https://data.pendo.io/data/guide.json/key'
    const har = buildHarFromCdpEvents([
      { method: 'Network.requestWillBeSent', params: { requestId: 't1', timestamp: 100, wallTime: 1_700_000_000, request: { url } } },
      {
        method: 'Network.responseReceived',
        params: {
          requestId: 't1',
          timestamp: 100.18,
          response: {
            url,
            status: 200,
            timing: {
              requestTime: 100.01,
              proxyStart: -1, proxyEnd: -1,
              dnsStart: 1, dnsEnd: 11,
              connectStart: 11, connectEnd: 41,
              sslStart: 21, sslEnd: 41,
              sendStart: 41, sendEnd: 42,
              receiveHeadersEnd: 170,
            },
          },
        },
      },
      { method: 'Network.loadingFinished', params: { requestId: 't1', timestamp: 100.25, encodedDataLength: 900 } },
    ], {})
    const [entry] = har.log.entries
    expect(entry.timings).toEqual({ blocked: 11, dns: 10, ssl: 20, connect: 30, send: 1, wait: 128, receive: 70 })
    expect(entry.time).toBe(250)
  })

  it('buildHarFromCdpEvents reports -1 for connection phases skipped on a reused connection', () => {
    const url = 'https://data.pendo.io/data/ptm.gif/key'
    const har = buildHarFromCdpEvents([
      { method: 'Network.requestWillBeSent', params: { requestId: 'r', timestamp: 5, request: { url } } },
      {
        method: 'Network.responseReceived',
        params: {
          requestId: 'r',
          timestamp: 5.06,
          response: {
            url,
            status: 200,
            timing: {
              requestTime: 5,
              dnsStart: -1, dnsEnd: -1, connectStart: -1, connectEnd: -1, sslStart: -1, sslEnd: -1,
              sendStart: 2, sendEnd: 3, receiveHeadersEnd: 55,
            },
          },
        },
      },
      { method: 'Network.loadingFinished', params: { requestId: 'r', timestamp: 5.065 } },
    ], {})
    const [entry] = har.log.entries
    expect(entry.timings).toEqual({ blocked: 2, dns: -1, ssl: -1, connect: -1, send: 1, wait: 52, receive: 10 })
    expect(entry.time).toBe(65)
  })

  it('buildHarFromCdpEvents falls back to event timestamps when response.timing is absent', () => {
    const url = 'https://cdn.pendo.io/agent/static/key/pendo.js'
    const har = buildHarFromCdpEvents([
      { method: 'Network.requestWillBeSent', params: { requestId: 'c', timestamp: 50, request: { url } } },
      { method: 'Network.responseReceived', params: { requestId: 'c', timestamp: 50.3, response: { url, status: 200 } } },
      { method: 'Network.loadingFinished', params: { requestId: 'c', timestamp: 50.5 } },
    ], {})
    const [entry] = har.log.entries
    expect(entry.timings.wait).toBe(300)
    expect(entry.timings.receive).toBe(200)
    expect(entry.time).toBe(500)
  })

  it('buildHarFromCdpEvents times failed requests up to the failure', () => {
    const url = 'https://data.pendo.io/data/ptm.gif/key'
    const har = buildHarFromCdpEvents([
      { method: 'Network.requestWillBeSent', params: { requestId: 'f', timestamp: 10, request: { url } } },
      { method: 'Network.loadingFailed', params: { requestId: 'f', timestamp: 10.05, errorText: 'net::ERR_BLOCKED_BY_CLIENT' } },
    ], {})
    const [entry] = har.log.entries
    expect(entry.timings.wait).toBe(50)
    expect(entry.time).toBe(50)
    expect(entry.comment).toBe('net::ERR_BLOCKED_BY_CLIENT')
  })

  it('buildHarFromCdpEvents excludes non-Pendo hosts whose URL contains a Pendo substring', () => {
    const url = 'https://notpendo.com/private'
    const har = buildHarFromCdpEvents([
      { method: 'Network.requestWillBeSent', params: { requestId: 'x', timestamp: 1, request: { url, headers: { 'X-Secret': 's' } } } },
      { method: 'Network.responseReceived', params: { requestId: 'x', timestamp: 1.1, response: { url, status: 200 } } },
    ], {})
    expect(har.log.entries).toHaveLength(0)
  })

  it('har-timings.js page pre-filter keeps every URL isPendoNetworkUrl accepts', () => {
    const urls = [
      'https://cdn.pendo.io/agent/static/k/pendo.js',
      'https://data.eu.pendo.io/data/ptm.gif/k',
      'https://pendo-static-123.storage.googleapis.com/guide-content/a.js',
      'https://storage.googleapis.com/pendo-io-static/guide.css',
      `https://content.customer.com/agent/static/${API_KEY}/pendo.js`,
      `https://data.customer.com/data/ptm.gif/${API_KEY}`,
      'https://notpendo.com/private',
      'https://app.example.com/app.js',
    ]
    const context = vm.createContext({
      globalThis: {},
      performance: {
        timeOrigin: 0,
        getEntriesByType: () => urls.map((name) => ({ name, startTime: 1, duration: 2 })),
      },
    })
    context.globalThis = context
    vm.runInContext(harTimingsSrc, context)
    const kept = new Set(context.__pendoValidateHarTimings().entries.map((e) => e.name))
    for (const url of urls.filter((u) => isPendoNetworkUrl(u))) {
      expect(kept.has(url)).toBe(true)
    }
    expect(kept.has('https://app.example.com/app.js')).toBe(false)

    const har = buildHarFromResourceTimings([...kept].map((name) => ({ name, startTime: 1, duration: 2 })), { timeOrigin: 0 })
    expect(har.log.entries.map((e) => e.request.url)).not.toContain('https://notpendo.com/private')
  })

  it('buildHarFromResourceTimings marks partial entries', () => {
    const har = buildHarFromResourceTimings([
      { name: 'https://cdn.pendo.io/agent/static/k/agent.js', startTime: 100, duration: 50, transferSize: 900, initiatorType: 'script' },
    ], { pageUrl: 'https://app.example.com/', timeOrigin: 1_000_000 })
    expect(har.log._partial).toBe(true)
    expect(har.log.entries[0]._partial).toBe(true)
    expect(har.log.entries[0].response.status).toBe(0)
  })

  it('bucketHarEntries buckets entry counts', () => {
    expect(bucketHarEntries(0)).toBe('0')
    expect(bucketHarEntries(12)).toBe('11-50')
  })
})
