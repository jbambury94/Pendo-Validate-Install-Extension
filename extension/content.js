// Guard against double-injection (manifest auto-inject + background.js executeScript on pre-existing tabs).
// The isolated world's window object is shared across injections into the same tab.
if (window.__pendoValidateInjected) {
  // Already running — do nothing.
} else {
  window.__pendoValidateInjected = true;

  const IFRAME_ID = 'pendo-validate-overlay-iframe';

  // Default panel size — matches the redesign tokens (also clamped by min/max below).
  const DEFAULT_WIDTH = 440;
  const DEFAULT_HEIGHT = 660;
  const MIN_WIDTH = 360;
  const MIN_HEIGHT = 480;
  const MAX_RATIO = 0.92; // max 92vw × 92vh

  // ── Toggle handler (message from background.js) ────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== 'pendo-validate-toggle') return;
    document.getElementById(IFRAME_ID) ? removeOverlay() : createOverlay();
  });

  // ── postMessage handler (messages from inside the iframe) ──────────────────
  window.addEventListener('message', (event) => {
    const iframe = document.getElementById(IFRAME_ID);
    if (!iframe || event.source !== iframe.contentWindow) return;

    const { type } = event.data || {};
    if (type === 'pendo-validate-close') {
      removeOverlay();
    } else if (type === 'pendo-validate-dragstart') {
      startDrag(iframe);
    } else if (type === 'pendo-validate-drag') {
      applyDrag(event.data, iframe);
    } else if (type === 'pendo-validate-dragend') {
      dragOrigin = null;
    } else if (type === 'pendo-validate-resizestart') {
      startResize(iframe);
    } else if (type === 'pendo-validate-resize') {
      applyResize(event.data, iframe);
    } else if (type === 'pendo-validate-resizeend') {
      resizeOrigin = null;
    }
  });

  // ── Overlay lifecycle ──────────────────────────────────────────────────────
  function createOverlay() {
    const iframe = document.createElement('iframe');
    iframe.id  = IFRAME_ID;
    iframe.src = chrome.runtime.getURL('popup.html');
    const left = Math.max(0, window.innerWidth - DEFAULT_WIDTH - 20);
    iframe.style.cssText = [
      'position:fixed',
      `top:20px`,
      `left:${left}px`,
      `width:${DEFAULT_WIDTH}px`,
      `height:${DEFAULT_HEIGHT}px`,
      'border:none',
      'border-radius:16px',
      'background-color:transparent',
      'box-shadow:0 24px 60px rgba(0,0,0,0.22),0 4px 14px rgba(0,0,0,0.12)',
      `z-index:2147483647`,
      'overflow:hidden',
    ].join(';');
    document.documentElement.appendChild(iframe);
  }

  function removeOverlay() {
    dragOrigin = null;
    resizeOrigin = null;
    const iframe = document.getElementById(IFRAME_ID);
    if (iframe) iframe.remove();
  }

  // ── Drag ─────────────────────────────────────────────────────────────────
  // Pointer capture runs inside the iframe; parent tracks the starting position and
  // applies screen-coordinate deltas sent from the iframe on each pointermove.
  let dragOrigin = null;

  function startDrag(iframe) {
    dragOrigin = {
      left: parseFloat(iframe.style.left) || 0,
      top:  parseFloat(iframe.style.top)  || 0,
    };
  }

  function applyDrag(data, iframe) {
    if (!dragOrigin) return;
    const newLeft = dragOrigin.left + (data.dx || 0);
    const newTop  = dragOrigin.top  + (data.dy || 0);
    const maxLeft = window.innerWidth  - iframe.offsetWidth;
    const maxTop  = window.innerHeight - 60;
    iframe.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + 'px';
    iframe.style.top  = Math.max(0, Math.min(newTop,  maxTop))  + 'px';
  }

  // ── Resize ───────────────────────────────────────────────────────────────
  // Mirrors the drag protocol. Iframe sends {dw, dh} screen-coord deltas; we clamp
  // to min 360×480 and max 92vw × 92vh before applying width/height.
  let resizeOrigin = null;

  function startResize(iframe) {
    resizeOrigin = {
      width: iframe.offsetWidth || DEFAULT_WIDTH,
      height: iframe.offsetHeight || DEFAULT_HEIGHT,
    };
  }

  function applyResize(data, iframe) {
    if (!resizeOrigin) return;
    const maxW = Math.floor(window.innerWidth * MAX_RATIO);
    const maxH = Math.floor(window.innerHeight * MAX_RATIO);
    const newW = Math.max(MIN_WIDTH, Math.min(resizeOrigin.width + (data.dw || 0), maxW));
    const newH = Math.max(MIN_HEIGHT, Math.min(resizeOrigin.height + (data.dh || 0), maxH));
    iframe.style.width = newW + 'px';
    iframe.style.height = newH + 'px';
  }
}
