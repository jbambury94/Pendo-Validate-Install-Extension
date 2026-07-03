/**
 * Pendo self-instrumentation entry — bundled by esbuild into
 * extension/vendor/pendo-agent.bundle.js and loaded by popup.html.
 *
 * Replaces the old hand-written async-stub loader + manually-curled vendor/pendo.js.
 * The agent code is imported from the officially supported @pendo/web-sdk package and
 * bundled locally, and all runtime agent/guide/designer assets are self-hosted from the
 * extension origin (extension/pendo/, populated by the `pendo` CLI). `assets.localOnly`
 * sets preventCodeInjection so the agent never loads remote code — satisfying MV3 CSP
 * (`script-src 'self'`) with no remotely-hosted code of any kind.
 *
 * @see https://web-sdk.pendo.io  (Manifest V3 extension setup)
 */
import { initialize, TextCapture } from '@pendo/web-sdk';
import pendoConfig from './pendo.config.json';
import { getOrCreateVisitorId, getIvaVersion } from './pendo-visitor.js';

// EU subscription self-instrumentation app. `apiKey` is the Web SDK's name for what the
// `pendo` CLI calls `--publicAppId`; both take this same value.
const PENDO_API_KEY = '928b3d0d-8a3b-48b1-bf35-a6af3565dcc5';
const PENDO_ENV = 'eu';

/** Resolve the extension origin (e.g. chrome-extension://<id>) used as the local asset host. */
function extensionAssetHost() {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
      return chrome.runtime.getURL('').slice(0, -1); // strip trailing slash
    }
  } catch { /* fall through */ }
  return '';
}

async function startPendo() {
  const visitorId = await getOrCreateVisitorId();
  if (!visitorId) return;

  const visitor = { id: visitorId };
  const ivaVersion = getIvaVersion();
  if (ivaVersion) visitor.ivaVersion = ivaVersion;
  // Only @pendo.io employee profiles resolve to an email-shaped id; tag it as the email too.
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(visitorId)) visitor.email = visitorId;

  await initialize({
    apiKey: PENDO_API_KEY,
    env: PENDO_ENV,
    globalKey: 'pendo',        // keeps window.pendo available to popup.js (notifyPendoTabChange)
    visitor,
    plugins: [TextCapture],
    config: pendoConfig,       // local config → no runtime config.json fetch
    assets: {
      host: extensionAssetHost(),
      path: 'pendo',           // → extension/pendo/*
      localOnly: true,         // preventCodeInjection: no remote code, ever (MV3)
    },
  });
}

// The agent bundle is large; queue init to browser idle so the popup paints first.
function scheduleStart() {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => { startPendo(); }, { timeout: 2000 });
  } else {
    setTimeout(() => { startPendo(); }, 0);
  }
}

if (typeof document !== 'undefined' && document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scheduleStart);
} else {
  scheduleStart();
}
