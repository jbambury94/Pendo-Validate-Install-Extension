import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const harSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'har-capture.js'),
  'utf8',
)

function loadHarCapture() {
  vm.runInThisContext(harSrc)
}

describe('har-capture', () => {
  beforeAll(() => {
    loadHarCapture()
  })

  it('isPendoNetworkUrl matches CDN and regional data hosts', () => {
    expect(isPendoNetworkUrl('https://cdn.pendo.io/agent/static/abc/agent.js')).toBe(true)
    expect(isPendoNetworkUrl('https://data.eu.pendo.io/data/ptm.gif/v2/abc/events')).toBe(true)
    expect(isPendoNetworkUrl('https://example.com/app.js')).toBe(false)
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
