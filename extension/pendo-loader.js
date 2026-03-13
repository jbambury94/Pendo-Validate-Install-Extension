/**
 * Pendo snippet loader — loads the self-hosted Pendo agent in the popup context.
 * Uses extension-packaged vendor/pendo.js so MV3 CSP (script-src 'self') is satisfied.
 * Sets PendoConfig.useAssetHostForDesigner so the agent treats this as an MV3-compatible extension.
 * @see https://www.npmjs.com/package/@pendo/agent#manifest-v3-extensions
 */
(function () {
  var p = window, e = document, n = 'script', d = 'pendo', o = p[d] = p[d] || {};
  o._q = o._q || [];
  var v = ['initialize', 'identify', 'updateOptions', 'pageLoad', 'track', 'trackAgent'];
  for (var w = 0, x = v.length; w < x; ++w) (function (m) {
    o[m] = o[m] || function () { o._q[m === v[0] ? 'unshift' : 'push']([m].concat([].slice.call(arguments, 0))); };
  })(v[w]);
  // MV3 compatibility: agent checks this to avoid "incompatible with manifest V3" warning
  p.PendoConfig = p.PendoConfig || {};
  p.PendoConfig.useAssetHostForDesigner = true;
  var y = e.createElement(n);
  y.async = !0;
  y.src = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
    ? chrome.runtime.getURL('vendor/pendo.js')
    : 'vendor/pendo.js';
  var z = e.getElementsByTagName(n)[0];
  z.parentNode.insertBefore(y, z);
})();
