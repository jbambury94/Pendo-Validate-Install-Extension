// Per-browser build targets and manifest transforms.
// The extension/ folder is the single source of truth (Chrome-flavoured MV3);
// build.mjs stages a copy per target and rewrites the manifest via these
// pure functions so tests can assert on them without touching the filesystem.

export const TARGETS = ['chrome', 'edge', 'firefox'];

// APIs Firefox MV3 does not implement. popup.js degrades gracefully when
// they are absent (debugger-based Launcher introspection returns null and
// the visitor ID falls back to a stored UUID).
export const FIREFOX_UNSUPPORTED_PERMISSIONS = ['debugger', 'identity', 'identity.email'];

export const FIREFOX_GECKO_SETTINGS = {
  gecko: {
    id: 'pendo-validate-install@pendo.io',
    // world: 'MAIN' for scripting.executeScript requires Firefox 128+.
    strict_min_version: '128.0',
  },
};

export function transformManifest(manifest, target) {
  if (!TARGETS.includes(target)) {
    throw new Error(`Unknown build target "${target}". Expected one of: ${TARGETS.join(', ')}`);
  }
  const out = structuredClone(manifest);
  if (target !== 'firefox') return out; // Edge is Chromium: byte-identical manifest.

  out.permissions = out.permissions.filter(
    (p) => !FIREFOX_UNSUPPORTED_PERMISSIONS.includes(p),
  );
  // Firefox MV3 runs the background script as an event page, not a service worker.
  out.background = { scripts: [manifest.background.service_worker] };
  out.browser_specific_settings = structuredClone(FIREFOX_GECKO_SETTINGS);
  return out;
}
