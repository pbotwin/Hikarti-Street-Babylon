// Offline support.
//  - Pages (HTML): always fetched fresh from the network (bypassing the HTTP
//    cache, which GitHub Pages sets to 10 minutes), falling back to the cached
//    copy only when offline. New deploys show up on the next launch.
//  - Hashed build assets (/assets/*): cache-first, they never change.
//  - Everything else (model, icons, manifest): network-first, cache fallback.
// Caches are per origin: the original game may share this one, so only
// this game's own old caches are cleared.
const CACHE = 'hikari-babylon-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('hikari-babylon-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const save = (req, res) => {
  if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
  return res;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req, { cache: 'no-store' }).then((r) => save(req, r)).catch(() => caches.match(req)));
  } else if (url.pathname.includes('/assets/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => save(req, r))));
  } else {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then((r) => save(req, r)).catch(() => caches.match(req)));
  }
});
