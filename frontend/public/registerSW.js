// Compatibility shim: served to old clients that cached a previous index.html
// which contained <script src="/registerSW.js">. New clients use virtual:pwa-register
// (imported in main.tsx) and never load this file.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function (err) {
      // Non-fatal: PWA features unavailable but the app works normally.
      console.warn('[CapVeri] Service worker registration failed', err)
    })
  })
}
