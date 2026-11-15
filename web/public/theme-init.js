// Before the app loads: the saved theme, so the page doesn't flash the wrong one. A file,
// not an inline script, so the CSP can be script-src 'self' (P9).
try {
  document.documentElement.dataset.theme = localStorage.getItem('isai-theme') || 'system';
} catch (e) {
  document.documentElement.dataset.theme = 'system';
}
