/** Injected into page MAIN world. Calls pendo.enableDebugging(). Idempotent on re-injection. Assigned as a function expression (not a top-level declaration) so it never creates a page-global `enableDebuggingInPage` binding that could collide with the host page. */
if (typeof globalThis.__pendoValidateEnableDebugging !== 'function') {
globalThis.__pendoValidateEnableDebugging = function enableDebuggingInPage() {
  const pendo = (typeof window !== 'undefined' && (window.pendo || window.Pendo)) || null;
  if (!pendo || typeof pendo.enableDebugging !== 'function') return { ok: false, message: 'Pendo not found or enableDebugging not available on this page.' };
  try {
    pendo.enableDebugging();
    return { ok: true };
  } catch (e) { return { ok: false, message: (e && e.message) || String(e) }; }
};
}
