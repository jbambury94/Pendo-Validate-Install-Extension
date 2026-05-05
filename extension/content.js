// Guard against double-injection (manifest auto-inject + background.js executeScript on pre-existing tabs).
// The isolated world's window object is shared across injections into the same tab.
if (window.__pendoValidateInjected) {
  // Already running — do nothing.
} else {
  window.__pendoValidateInjected = true;

  const IFRAME_ID = 'pendo-validate-overlay-iframe';

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
    }
  });

  // ── Overlay lifecycle ──────────────────────────────────────────────────────
  function createOverlay() {
    const iframe = document.createElement('iframe');
    iframe.id  = IFRAME_ID;
    iframe.src = chrome.runtime.getURL('popup.html');
    const left = Math.max(0, window.innerWidth - 460 - 20);
    iframe.style.cssText = [
      'position:fixed',
      `top:20px`,
      `left:${left}px`,
      'width:460px',
      'height:620px',
      'border:none',
      'border-radius:14px',
      'background-color:#ffffff',
      'box-shadow:0 8px 32px rgba(0,0,0,0.22),0 2px 8px rgba(0,0,0,0.12)',
      `z-index:2147483647`,
      'overflow:hidden',
    ].join(';');
    document.documentElement.appendChild(iframe);
  }

  function removeOverlay() {
    dragOrigin = null;
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
}
