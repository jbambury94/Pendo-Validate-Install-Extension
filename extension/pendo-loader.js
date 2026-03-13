/**
 * Pendo snippet loader — loads Pendo agent in the popup context.
 * Kept in a separate file to satisfy extension CSP (no inline scripts in MV3).
 */
(function (publicAppId) {
  (function (p, e, n, d, o) {
    var v, w, x, y, z;
    o = p[d] = p[d] || {};
    o._q = o._q || [];
    v = ['initialize', 'identify', 'updateOptions', 'pageLoad', 'track', 'trackAgent'];
    for (w = 0, x = v.length; w < x; ++w) (function (m) {
      o[m] = o[m] || function () { o._q[m === v[0] ? 'unshift' : 'push']([m].concat([].slice.call(arguments, 0))); };
    })(v[w]);
    y = e.createElement(n);
    y.async = !0;
    y.src = 'https://cdn.eu.pendo.io/agent/static/' + publicAppId + '/pendo.js';
    z = e.getElementsByTagName(n)[0];
    z.parentNode.insertBefore(y, z);
  })(window, document, 'script', 'pendo');
})('928b3d0d-8a3b-48b1-bf35-a6af3565dcc5');
