// Builds the self-hosted Pendo self-instrumentation assets into extension/.
//
//   node scripts/build-agent.mjs              bundle + copy static assets (LOCAL, offline)
//   node scripts/build-agent.mjs --refresh    also re-download config + designer files (NETWORK)
//
// Outputs (all committed, mirroring the old vendored model):
//   extension/vendor/pendo-agent.bundle.js   esbuild bundle of src/pendo-agent-entry.js
//   extension/pendo/*.min.js, guide.css      `pendo copy` (from node_modules, offline)
//   extension/pendo/plugin.js, preloader.js  `pendo designer` (NETWORK, --refresh only)
//   src/pendo.config.json                    `pendo config`   (NETWORK, --refresh only)
//
// The bundle imports src/pendo.config.json, so that file must exist (it is committed);
// --refresh regenerates it. Update flow when bumping @pendo/web-sdk:
//   npm install --save-exact @pendo/web-sdk@<version> && npm run build:agent:refresh

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const ENTRY = join(ROOT, 'src', 'pendo-agent-entry.js');
const OUTFILE = join(ROOT, 'extension', 'vendor', 'pendo-agent.bundle.js');
const PENDO_DIR = join(ROOT, 'extension', 'pendo');
const CONFIG_OUT = join(ROOT, 'src', 'pendo.config.json');

// Keep in sync with src/pendo-agent-entry.js.
const PENDO_API_KEY = '928b3d0d-8a3b-48b1-bf35-a6af3565dcc5';
const PENDO_ENV = 'eu';

const refresh = process.argv.includes('--refresh');

function pendoCli(args) {
  // Resolve the @pendo/web-sdk `pendo` bin directly so this works without a global install.
  const cli = join(ROOT, 'node_modules', '@pendo', 'web-sdk', 'bin', 'cli.js');
  execFileSync(process.execPath, [cli, ...args], { cwd: ROOT, stdio: 'inherit' });
}

mkdirSync(PENDO_DIR, { recursive: true });

if (refresh) {
  console.log('• pendo config  (network)');
  pendoCli(['config', `--publicAppId=${PENDO_API_KEY}`, `--env=${PENDO_ENV}`, `--output=${CONFIG_OUT}`]);
  console.log('• pendo designer (network)');
  pendoCli(['designer', `--env=${PENDO_ENV}`, `--dest=${PENDO_DIR}`]);
}

if (!existsSync(CONFIG_OUT)) {
  throw new Error(`Missing ${CONFIG_OUT}. Run: node scripts/build-agent.mjs --refresh (needs network).`);
}

console.log('• pendo copy    (static agent assets)');
pendoCli(['copy', `--dest=${PENDO_DIR}`]);

console.log('• esbuild bundle');
await build({
  entryPoints: [ENTRY],
  outfile: OUTFILE,
  bundle: true,
  format: 'iife',        // loaded via a plain <script> in popup.html
  target: 'chrome110',
  minify: true,
  legalComments: 'none',
  logLevel: 'info',
});

console.log(`✓ agent bundle → ${OUTFILE}`);
