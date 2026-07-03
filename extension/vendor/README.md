# Vendored Pendo agent bundle

`pendo-agent.bundle.js` is the extension's Pendo self-instrumentation agent, built by
esbuild from `src/pendo-agent-entry.js` (which imports the official
[`@pendo/web-sdk`](https://www.npmjs.com/package/@pendo/web-sdk) package). It is loaded by
`popup.html` under MV3 CSP (`script-src 'self'`) and initializes the agent with
`assets.localOnly: true`, so no remotely-hosted code is ever loaded.

Runtime agent/guide/designer assets are self-hosted in `../pendo/` (see that folder). This
file and the `../pendo/` assets are generated, committed artifacts — do not edit by hand.

## Regenerate / update

Both this bundle and the `../pendo/` assets are produced by `scripts/build-agent.mjs`:

```bash
# Rebuild the bundle + copy static assets from the installed package (offline):
npm run build:agent

# Bump the SDK, then refresh everything including the config + Visual Design Studio
# files that must be downloaded from Pendo (network required):
npm install --save-exact @pendo/web-sdk@<version>
npm run build:agent:refresh
```

`build:agent:refresh` regenerates `src/pendo.config.json` and the designer files
(`pendo/plugin.js`, `pendo/preloader.js`) for the EU self-instrumentation app
(`publicAppId 928b3d0d-8a3b-48b1-bf35-a6af3565dcc5`, `env eu`).
