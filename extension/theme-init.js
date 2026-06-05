// Applies the saved light/dark theme before first paint (FOUC prevention).
// Must be an external script: MV3's default CSP (script-src 'self') blocks
// inline scripts, so an inline version is silently dropped in Firefox.
try {
  var t = localStorage.getItem('pendoValidateTheme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) {}
