/* Work Desk — offline support.
   App files: try the network first (so updates show up right away), fall back to the saved copy when offline.
   Supabase library from the CDN: saved after the first download so shared books can still load offline. */
const CACHE = 'workdesk-app-v1';
const RUNTIME = 'workdesk-runtime-v1';
const APP_FILES = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './js/util.js', './js/store.js', './js/board.js', './js/timeline.js', './js/charmap.js', './js/snapshots.js',
  './js/search.js', './js/habits.js', './js/library.js', './js/comments.js', './js/stickies.js', './js/cover.js',
  './js/importer.js', './js/cloud.js', './js/collab.js', './js/pwa.js', './js/app.js',
  './assets/icon-32.png', './assets/icon-64.png', './assets/icon-192.png', './assets/icon-512.png',
  './assets/icon-maskable-192.png', './assets/icon-maskable-512.png', './assets/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_FILES)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE && key !== RUNTIME) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => { if (event.data === 'skipWaiting') self.skipWaiting(); });

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
    ]);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    if (request.mode === 'navigate') return cache.match('./index.html');
    throw e;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) event.respondWith(networkFirst(req));
  else if (url.hostname === 'cdn.jsdelivr.net') event.respondWith(cacheFirst(req));
  // Everything else (Supabase data, sign-in) always goes straight to the network.
});
