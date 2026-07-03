/**
 * Visitor identity for the extension's own Pendo self-instrumentation.
 *
 * Extracted from popup.js so it can be (a) bundled into the Pendo agent entry
 * (src/pendo-agent-entry.js) and (b) imported directly by the test suite
 * (tests/helpers.js) — a single source of truth instead of a hand-kept mirror.
 *
 * All chrome.* access is read lazily at call time so tests can toggle the mocks
 * per case, and every path degrades gracefully when an API is missing (Firefox
 * strips `identity`; a stored UUID is used instead).
 */

export const PENDO_VISITOR_ID_KEY = 'pendoVisitorId';

/** Read the signed-in Chrome profile email (passive, no OAuth prompt). */
export function getProfileEmail() {
  return new Promise((resolve) => {
    try {
      if (!chrome.identity || typeof chrome.identity.getProfileUserInfo !== 'function') return resolve('');
      chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (info) => {
        if (chrome.runtime.lastError) return resolve('');
        resolve((info && info.email) ? String(info.email).trim().toLowerCase() : '');
      });
    } catch { resolve(''); }
  });
}

/** Get or create a persistent visitor UUID; store in chrome.storage.local and return it. */
export async function getOrCreateVisitorId() {
  const email = await getProfileEmail();
  if (email && email.endsWith('@pendo.io')) return email;

  return new Promise((resolve) => {
    try {
      if (!chrome.storage || !chrome.storage.local) {
        resolve(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '');
        return;
      }
      chrome.storage.local.get([PENDO_VISITOR_ID_KEY], (result) => {
        let id = result && result[PENDO_VISITOR_ID_KEY];
        if (!id || typeof id !== 'string') {
          id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '';
          if (id) chrome.storage.local.set({ [PENDO_VISITOR_ID_KEY]: id });
        }
        resolve(id);
      });
    } catch (e) {
      resolve(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '');
    }
  });
}

/** Read the IVA extension version from the manifest (for self-instrumentation metadata). */
export function getIvaVersion() {
  try {
    return (chrome.runtime && typeof chrome.runtime.getManifest === 'function')
      ? (chrome.runtime.getManifest().version || '')
      : '';
  } catch { return ''; }
}
