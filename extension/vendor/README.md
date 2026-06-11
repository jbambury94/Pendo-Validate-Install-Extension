# Pendo agent (bundled)

`pendo.js` is the Pendo Web SDK agent bundled in the extension so the popup can load it under MV3 CSP (`script-src 'self'`). The extension uses this file only; end users do not update it.

**Bundled agent version:** 2.327.0

To update, re-download the production agent for the self-instrumentation API key and replace this file:

```bash
curl -fsSL "https://cdn.pendo.io/agent/static/928b3d0d-8a3b-48b1-bf35-a6af3565dcc5/pendo.js" -o extension/vendor/pendo.js
```
