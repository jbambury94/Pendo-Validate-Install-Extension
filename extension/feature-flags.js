/**
 * Feature gates for Install Validator features that are not fully baked.
 *
 * Unrelated to assessConfigFlags() and the "config flags" language used elsewhere in this codebase,
 * which describes the keys a customer passes to pendo.initialize(). These gates decide which panel
 * features exist at all.
 *
 * Shipped defaults live in feature-flags.json (edit that file to change what a build starts with).
 * Per-install overrides live in chrome.storage.local under "featureOverrides" and are written by the
 * __pendoValidateFeatures console helper in popup.js.
 *
 * Runs unbundled in three places — the panel (<script src>), the service worker (importScripts), and
 * the suite (vm.runInThisContext) — so it declares plain functions rather than exporting, and keeps
 * resolution pure and free of I/O so it can be tested without chrome mocks.
 *
 * Everything fails closed: an unreadable registry, a malformed override, or an unknown key all leave
 * the gate shut.
 */

const FEATURE_REGISTRY_FILE = 'feature-flags.json';
const FEATURE_OVERRIDES_STORAGE_KEY = 'featureOverrides';

/** Probe the APIs a gate can name in its "requires" list. Firefox MV3 has no chrome.debugger. */
function detectFeatureCapabilities(api) {
  return {
    debugger: typeof api?.debugger?.attach === 'function',
  };
}

/** Keep only boolean values, so a hand-edited or half-written override object cannot open a gate. */
function normalizeFeatureOverrides(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}

/** Coerce the shipped JSON into a usable registry, dropping entries that are not objects. */
function normalizeFeatureRegistry(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    out[key] = {
      default: entry.default === true,
      label: typeof entry.label === 'string' ? entry.label : key,
      description: typeof entry.description === 'string' ? entry.description : '',
      stage: typeof entry.stage === 'string' ? entry.stage : 'preview',
      requires: Array.isArray(entry.requires) ? entry.requires.filter((c) => typeof c === 'string') : [],
    };
  }
  return out;
}

/**
 * Resolve every gate in the registry to a boolean. Pure — callers supply the inputs.
 *
 * A local override beats the shipped default, but a missing capability beats both, so enabling a gate
 * on a browser that cannot run it is inert rather than broken.
 */
function resolveFeatureState(registry, overrides, capabilities) {
  const reg = normalizeFeatureRegistry(registry);
  const over = normalizeFeatureOverrides(overrides);
  const caps = capabilities && typeof capabilities === 'object' ? capabilities : {};
  const state = {};
  for (const [key, entry] of Object.entries(reg)) {
    const enabled = typeof over[key] === 'boolean' ? over[key] : entry.default;
    state[key] = enabled && entry.requires.every((cap) => caps[cap] === true);
  }
  return state;
}

function isFeatureEnabled(state, key) {
  return !!(state && state[key] === true);
}

/** Fetch the shipped registry. Any failure yields an empty registry, which closes every gate. */
async function loadFeatureRegistry(runtime, fetchImpl) {
  try {
    const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!runtime?.getURL || !doFetch) return {};
    const res = await doFetch(runtime.getURL(FEATURE_REGISTRY_FILE));
    if (!res || !res.ok) return {};
    return normalizeFeatureRegistry(await res.json());
  } catch (_) {
    return {};
  }
}

/** Read per-install overrides. Handles both the callback and promise forms of storage.get. */
function readFeatureOverrides(storage) {
  return new Promise((resolve) => {
    const done = (data) => resolve(normalizeFeatureOverrides(data?.[FEATURE_OVERRIDES_STORAGE_KEY]));
    try {
      if (!storage?.get) return resolve({});
      const maybePromise = storage.get({ [FEATURE_OVERRIDES_STORAGE_KEY]: {} }, done);
      if (maybePromise && typeof maybePromise.then === 'function') maybePromise.then(done, () => resolve({}));
    } catch (_) {
      resolve({});
    }
  });
}

function writeFeatureOverrides(storage, overrides) {
  return new Promise((resolve) => {
    try {
      if (!storage?.set) return resolve(false);
      const done = () => resolve(true);
      const maybePromise = storage.set({ [FEATURE_OVERRIDES_STORAGE_KEY]: overrides }, done);
      if (maybePromise && typeof maybePromise.then === 'function') maybePromise.then(done, () => resolve(false));
    } catch (_) {
      resolve(false);
    }
  });
}

/** Read-modify-write a single gate; returns the overrides object that was stored. */
async function writeFeatureOverride(storage, key, value) {
  const current = await readFeatureOverrides(storage);
  const next = Object.assign({}, current, { [key]: !!value });
  await writeFeatureOverrides(storage, next);
  return next;
}

async function clearFeatureOverrides(storage) {
  await writeFeatureOverrides(storage, {});
  return {};
}

/** True when a storage.onChanged batch touched the overrides key, so listeners can re-resolve. */
function isFeatureOverridesChange(changes, areaName) {
  if (areaName && areaName !== 'local') return false;
  return !!(changes && Object.prototype.hasOwnProperty.call(changes, FEATURE_OVERRIDES_STORAGE_KEY));
}

/**
 * Resolve gates from the live environment. Returns the registry and overrides alongside the state so
 * the console helper can explain where each value came from.
 */
async function loadFeatureState({ runtime, storage, api, fetchImpl } = {}) {
  const [registry, overrides] = await Promise.all([
    loadFeatureRegistry(runtime, fetchImpl),
    readFeatureOverrides(storage),
  ]);
  return {
    registry,
    overrides,
    state: resolveFeatureState(registry, overrides, detectFeatureCapabilities(api)),
  };
}
