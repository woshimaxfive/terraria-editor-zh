export function registerOfflineSupport() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        `${import.meta.env.BASE_URL}service-worker.js`,
        { scope: import.meta.env.BASE_URL, updateViaCache: 'none' },
      );
      const activate = worker => worker?.postMessage({ type: 'SKIP_WAITING' });
      activate(registration.waiting);
      const watch = worker => {
        if (!worker) return;
        if (worker.state === 'installed') activate(worker);
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed') activate(worker);
        });
      };
      watch(registration.installing);
      registration.addEventListener('updatefound', () => watch(registration.installing));
    } catch {
      // The page remains available online when offline storage is unavailable.
    }
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
