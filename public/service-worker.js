// These placeholders are filled by the existing Vite build plugin.
const VERSION = '__SW_VERSION__';
const SCOPE = new URL(self.registration.scope);
const CACHE_PREFIX = `terraria-editor-zh:${SCOPE.href}:`;
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;
const APP_SHELL = new URL('index.html', SCOPE).href;
const PRECACHE_URLS = __PRECACHE_URLS__.map(file => new URL(file, SCOPE).href);
const ASSETS = new Set(PRECACHE_URLS);

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// A failed asset download leaves the previous version active.
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  const assetUrl = url.origin + url.pathname;
  if (assetUrl === new URL('service-worker.js', SCOPE).href) return;

  if (event.request.mode === 'navigate' && (url.pathname === SCOPE.pathname || assetUrl === APP_SHELL)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(event.request);
        if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
          await cache.put(APP_SHELL, response.clone());
        }
        return response;
      } catch {
        return await cache.match(APP_SHELL) || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Cache build output only; world files, API calls and other sites are excluded.
  if (!ASSETS.has(assetUrl)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(assetUrl);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) await cache.put(assetUrl, response.clone());
    return response;
  })());
});
