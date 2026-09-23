/** Injected into page MAIN world. Returns Pendo-related performance resource entries. Idempotent on re-injection. */
if (typeof globalThis.__pendoValidateHarTimings !== 'function') {
globalThis.__pendoValidateHarTimings = function pendoValidateHarTimings() {
  function isPendoUrl(name) {
    if (!name) return false;
    if (name.indexOf('pendo') === -1 && name.indexOf('agent/static') === -1 && name.indexOf('agent/production') === -1) return false;
    return /pendo(io)?\.com|pendo\.io|cdn\.pendo|pendo-io|data\.eu\.pendo|app\.eu\.pendo|cdn\.eu\.pendo/i.test(name)
      || /agent\/(static|production)/.test(name);
  }
  try {
    const timeOrigin = (typeof performance !== 'undefined' && typeof performance.timeOrigin === 'number')
      ? performance.timeOrigin
      : Date.now();
    const res = (typeof performance !== 'undefined' && performance.getEntriesByType)
      ? performance.getEntriesByType('resource') || []
      : [];
    const entries = res.filter((r) => isPendoUrl(r.name)).map((r) => ({
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
