// Offline support. Everything the page needs is cached on the first visit and served from the
// cache from then on, so the app opens instantly and works with no connection. While online,
// each launch quietly checks the cached files against the server (conditional requests, so
// unchanged files cost a few hundred bytes) and stores any that changed for the next launch.

const CACHE = 'polowat-v1';
const ASSETS = [
  './',
  'manifest.webmanifest',
  'src/style.css',
  'src/main.js',
  'src/astro.js',
  'src/compass.js',
  'src/brightStars.js',
  'src/constellations.js',
  'assets/fonts/exo2.woff2',
  'assets/milkyway-1024.webp',
  'assets/milkyway-2048.webp',
  'assets/icon-192.png',
  'assets/icon-512.png',
];
const SCOPE = new URL('./', self.location).pathname;
const REFRESH_INTERVAL_MS = 60 * 1000;
let lastRefresh = 0;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate' && (url.pathname === SCOPE || url.pathname === `${SCOPE}index.html`)) {
    // Any launch of the app, with or without view parameters, gets the cached page.
    event.respondWith(caches.match('./').then((cached) => cached || fetch(request)));
    event.waitUntil(refresh());
    return;
  }
  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  // Files outside the precache list (the 4096 px Milky Way on large screens) are kept too.
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

// Revalidates every cached file. Changes are stored only once all the checks have come back,
// so an interrupted check never leaves a mix of old and new files.
async function refresh() {
  if (Date.now() - lastRefresh < REFRESH_INTERVAL_MS) return;
  lastRefresh = Date.now();
  const cache = await caches.open(CACHE);
  const requests = await cache.keys();
  let results;
  try {
    results = await Promise.all(requests.map(async (request) => {
      const cached = await cache.match(request);
      const headers = {};
      const etag = cached?.headers.get('ETag');
      const modified = cached?.headers.get('Last-Modified');
      if (etag) headers['If-None-Match'] = etag;
      if (modified) headers['If-Modified-Since'] = modified;
      const response = await fetch(request.url, { cache: 'no-store', headers });
      return { request, response };
    }));
  } catch {
    return; // offline or flaky: keep what we have
  }
  for (const { request, response } of results) {
    if (response.status === 200) await cache.put(request, response);
  }
}
