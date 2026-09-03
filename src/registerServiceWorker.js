/**
 * Production Service Worker registration (vite-plugin-pwa / Workbox).
 * Skips gracefully when SW APIs are unavailable (some in-app browsers).
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  void import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({
        immediate: true,
        onRegisteredSW(swUrl, registration) {
          if (import.meta.env.DEV) {
            console.info('[sw] registered', swUrl, registration?.scope);
          }
        },
        onRegisterError(error) {
          console.warn('[sw] register failed', error);
        },
      });
    })
    .catch((error) => {
      console.warn('[sw] unavailable', error);
    });
}
