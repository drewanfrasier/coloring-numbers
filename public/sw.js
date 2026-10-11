// Offline support: serve from cache right away, refresh the cache in the background.
const CACHE = 'color-pop-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html'])));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith('http')) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
      const network = fetch(request)
        .then((res) => {
          if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
          return res;
        })
        .catch(() => hit || (request.mode === 'navigate' ? cache.match('./index.html') : Response.error()));
      return hit || network;
    }),
  );
});
