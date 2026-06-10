// Builds distributable zips from the single extension/ source folder:
//   node scripts/build.mjs [chrome|edge|firefox|all]   (default: all)
//
// For each target this stages extension/ into dist/staging/<target>/ (minus
// dev-only files), rewrites manifest.json via transformManifest(), and zips
// the staged folder to dist/pendo-validate-install-<version>-<target>.zip.

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { TARGETS, transformManifest } from './browser-targets.mjs';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const SOURCE_DIR = join(ROOT, 'extension');
const DIST_DIR = join(ROOT, 'dist');

// Repo/dev-only files that must not ship in a release package.
// NOTE: pendo-install-quality.md is fetched at runtime (popup.js), so it stays.
const EXCLUDED_FILES = new Set(['popup-actions.md', 'README.md', '.DS_Store']);

function stageTarget(target) {
  const stagingDir = join(DIST_DIR, 'staging', target);
  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });
  cpSync(SOURCE_DIR, stagingDir, {
    recursive: true,
    filter: (src) => !EXCLUDED_FILES.has(basename(src)),
  });

  const manifest = JSON.parse(readFileSync(join(SOURCE_DIR, 'manifest.json'), 'utf8'));
  const transformed = transformManifest(manifest, target);
  writeFileSync(join(stagingDir, 'manifest.json'), `${JSON.stringify(transformed, null, 2)}\n`);
  return { stagingDir, version: manifest.version };
}

function buildTarget(target) {
  const { stagingDir, version } = stageTarget(target);
  const zipPath = join(DIST_DIR, `pendo-validate-install-${version}-${target}.zip`);
  const zip = new AdmZip();
  zip.addLocalFolder(stagingDir);
  zip.writeZip(zipPath);
  console.log(`built ${zipPath}`);
  return zipPath;
}

const arg = process.argv[2] ?? 'all';
const targets = arg === 'all' ? TARGETS : [arg];
for (const target of targets) buildTarget(target);
