/**
 * Defer loading the heavy Pendo self-instrumentation bundle until the browser is idle
 * so the panel UI can paint first. Initialization inside the bundle is also idle-deferred.
 */
(function () {
  function loadBundle() {
    const script = document.createElement('script');
    script.src = 'vendor/pendo-agent.bundle.js';
    script.async = true;
    document.head.appendChild(script);
  }

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(loadBundle, { timeout: 2000 });
  } else {
    setTimeout(loadBundle, 0);
  }
})();
