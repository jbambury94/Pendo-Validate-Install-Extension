/** Injected into page MAIN world. Calls pendo.enableDebugging(). Idempotent on re-injection. */
if (typeof globalThis.__pendoValidateEnableDebugging !== 'function') {
function enableDebuggingInPage() {
  const pendo = (typeof window !== 'undefined' && (window.pendo || window.Pendo)) || null;
  if (!pendo || typeof pendo.enableDebugging !== 'function') return { ok: false, message: 'Pendo not found or enableDebugging not available on this page.' };
  try {
    pendo.enableDebugging();
    return { ok: true };
  } catch (e) { return { ok: false, message: (e && e.message) || String(e) }; }
}
void (globalThis.__pendoValidateEnableDebugging = enableDebuggingInPage);
}
