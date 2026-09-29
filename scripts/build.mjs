// Builds the Chrome Web Store zip from the single extension/ source folder:
//   node scripts/build.mjs
//
// Stages extension/ into dist/staging/chrome/ (minus dev-only files), then zips
// to dist/pendo-validate-install-<version>-chrome.zip.

import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const SOURCE_DIR = join(ROOT, 'extension');
const DIST_DIR = join(ROOT, 'dist');
const TARGET = 'chrome';

// Repo/dev-only files that must not ship in a release package.
// NOTE: pendo-install-quality.md is fetched at runtime (popup.js), so it stays.
const EXCLUDED_FILES = new Set(['popup-actions.md', 'README.md', '.DS_Store']);

function stageChrome() {
  const stagingDir = join(DIST_DIR, 'staging', TARGET);
  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });
  cpSync(SOURCE_DIR, stagingDir, {
    recursive: true,
    filter: (src) => !EXCLUDED_FILES.has(basename(src)),
  });

  const manifest = JSON.parse(readFileSync(join(SOURCE_DIR, 'manifest.json'), 'utf8'));
  return { stagingDir, version: manifest.version };
}

function buildChrome() {
  const { stagingDir, version } = stageChrome();
  const zipPath = join(DIST_DIR, `pendo-validate-install-${version}-${TARGET}.zip`);
  const zip = new AdmZip();
  zip.addLocalFolder(stagingDir);
  zip.writeZip(zipPath);
  console.log(`built ${zipPath}`);
  return zipPath;
}

buildChrome();
