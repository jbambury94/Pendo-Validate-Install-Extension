/** Injected into page MAIN world. Returns Pendo-related performance resource entries. Idempotent on re-injection. */
if (typeof globalThis.__pendoValidateHarTimings !== 'function') {
globalThis.__pendoValidateHarTimings = function pendoValidateHarTimings() {
  // Must stay a superset of isPendoNetworkUrl (har-capture.js), which applies the strict
  // hostname / custom-domain path rules in the panel before anything is exported.
  function mayBePendoUrl(name) {
    return !!name && (name.indexOf('pendo') !== -1 || name.indexOf('/agent/static/') !== -1 || name.indexOf('/data/') !== -1);
  }
  try {
    const timeOrigin = (typeof performance !== 'undefined' && typeof performance.timeOrigin === 'number')
      ? performance.timeOrigin
      : Date.now();
    const res = (typeof performance !== 'undefined' && performance.getEntriesByType)
      ? performance.getEntriesByType('resource') || []
      : [];
    const entries = res.filter((r) => mayBePendoUrl(r.name)).map((r) => ({
      name: r.name,
      startTime: r.startTime,
      duration: r.duration,
      responseEnd: r.responseEnd,
      transferSize: r.transferSize,
      encodedBodySize: r.encodedBodySize,
      nextHopProtocol: r.nextHopProtocol || '',
      initiatorType: r.initiatorType || 'unknown',
    }));
    return { timeOrigin, entries };
  } catch (e) {
    return { error: (e && e.message) ? e.message : String(e) };
  }
};
}
