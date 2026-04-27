// Guard against double-injection (manifest auto-inject + background.js executeScript on pre-existing tabs).
// The isolated world's window object is shared across injections into the same tab.
if (window.__pendoValidateInjected) {
  // Already running — do nothing.
} else {
  window.__pendoValidateInjected = true;

  const IFRAME_ID  = 'pendo-validate-overlay-iframe';
  const CAPTURE_ID = 'pendo-validate-drag-capture';

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
      startDrag(event.data, iframe);
    }
  });

  // ── Overlay lifecycle ──────────────────────────────────────────────────────
  function createOverlay() {
    const iframe = document.createElement('iframe');
    iframe.id  = IFRAME_ID;
    iframe.src = chrome.runtime.getURL('popup.html');
    // Position top-right, 20px inset. Convert right-offset to left for easier drag math.
    const left = Math.max(0, window.innerWidth - 460 - 20);
    iframe.style.cssText = [
      'position:fixed',
      `top:20px`,
      `left:${left}px`,
      'width:460px',
      'height:620px',
      'border:none',
      'border-radius:14px',
      'box-shadow:0 8px 32px rgba(0,0,0,0.22),0 2px 8px rgba(0,0,0,0.12)',
      `z-index:2147483647`,
      'overflow:hidden',
    ].join(';');
    // Append to <html> — more stable than <body> on SPAs that swap the body element.
    document.documentElement.appendChild(iframe);
  }

  function removeOverlay() {
    const iframe = document.getElementById(IFRAME_ID);
    if (iframe) iframe.remove();
    removeCaptureDiv();
  }

  // ── Drag implementation ────────────────────────────────────────────────────
  // The mouse-capture overlay pattern:
  //   1. popup.js sends dragstart with clientX/Y relative to the iframe's own viewport.
  //   2. We disable pointer-events on the iframe so mouse events are not swallowed by it.
  //   3. A transparent full-page capture <div> at the same z-index receives all mousemove/mouseup.
  //   4. On mouseup we remove the capture div and restore pointer-events.
  //
  // Because the iframe is position:fixed, data.x equals the pointer-to-iframe-left offset
  // and data.y equals the pointer-to-iframe-top offset — no coordinate translation needed.

  let dragState = null;

  function startDrag(data, iframe) {
    dragState = { iframe, offsetX: data.x, offsetY: data.y };

    // Disable pointer events on the iframe so the capture div receives everything.
    iframe.style.pointerEvents = 'none';

    const cap = document.createElement('div');
    cap.id = CAPTURE_ID;
    cap.style.cssText = [
      'position:fixed',
      'inset:0',
      `z-index:2147483647`,
      'cursor:grabbing',
      'background:transparent',
    ].join(';');
    document.documentElement.appendChild(cap);

    cap.addEventListener('mousemove', onDragMove);
    cap.addEventListener('mouseup',   onDragEnd);
    document.addEventListener('keydown', onDragEscape);
  }

  function onDragMove(e) {
    if (!dragState) return;
    const { iframe, offsetX, offsetY } = dragState;
    const newLeft = e.clientX - offsetX;
    const newTop  = e.clientY - offsetY;
    // Clamp so the panel can't be dragged entirely off-screen.
    const maxLeft = window.innerWidth  - iframe.offsetWidth;
    const maxTop  = window.innerHeight - 60; // keep at least the hero bar visible
    iframe.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + 'px';
    iframe.style.top  = Math.max(0, Math.min(newTop,  maxTop))  + 'px';
  }

  function onDragEnd() {
    if (dragState) {
      dragState.iframe.style.pointerEvents = '';
      dragState = null;
    }
    removeCaptureDiv();
    document.removeEventListener('keydown', onDragEscape);
  }

  function onDragEscape(e) {
    if (e.key === 'Escape') onDragEnd();
  }

  function removeCaptureDiv() {
    const cap = document.getElementById(CAPTURE_ID);
    if (cap) cap.remove();
  }
}
