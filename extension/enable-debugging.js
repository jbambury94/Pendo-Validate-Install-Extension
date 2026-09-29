/** Injected into page MAIN world. Calls pendo.enableDebugging(). Idempotent on re-injection; the revision guard replaces a stale global left by an older extension version. Assigned as a function expression (not a top-level declaration) so it never creates a page-global `enableDebuggingInPage` binding that could collide with the host page. */
if (globalThis.__pendoValidateEnableDebuggingRevision !== 2 || typeof globalThis.__pendoValidateEnableDebugging !== 'function') {
globalThis.__pendoValidateEnableDebuggingRevision = 2;
globalThis.__pendoValidateEnableDebugging = function enableDebuggingInPage() {
  const pendo = (typeof window !== 'undefined' && (window.pendo || window.Pendo)) || null;
  if (!pendo || typeof pendo.enableDebugging !== 'function') return { ok: false, message: 'Pendo not found or enableDebugging not available on this page.' };
  try {
    pendo.enableDebugging();
    // The SDK only lets the leader frame's agent start the debugger; a follower returns without enabling.
    const enabled = typeof pendo.isDebuggingEnabled === 'function' ? pendo.isDebuggingEnabled(true) : undefined;
    if (enabled === false || enabled === 'No') {
      return { ok: false, reason: 'not-leader', message: "This page's Pendo agent isn't the lead agent in this tab, so it didn't start the debugger." };
    }
    return { ok: true };
  } catch (e) { return { ok: false, message: (e && e.message) || String(e) }; }
};
}
