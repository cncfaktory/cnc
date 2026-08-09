// Service worker for CNC Fabrika — enables offline play and installability,
// which is what a TWA (Trusted Web Activity) wrapper checks for before it
// will let Google Play accept the app as a "real" PWA rather than a bare
// WebView.
//
// Strategy split in two:
//  - HTML/JS/manifest (anything that changes when we ship an update):
//    NETWORK-FIRST. Always tries to fetch the live version first, and only
//    falls back to the cached copy if there's no connection. This is what
//    was missing before — a pure cache-first strategy meant the installed
//    app kept showing whatever was cached on first launch forever, even
//    after the live site was updated many times since.
//  - Icons (genuinely static, never change): CACHE-FIRST, since there's no
//    reason to re-fetch something that's never going to be different.
//
// CACHE_NAME is bumped so anyone with an old build gets a clean slate once.
const CACHE_NAME = 'cnc-fabrika-v2';
const NETWORK_FIRST = [
  './cnc-factory.html',
  './index.html',
  './account-deletion.html',
  './privacy-policy.html',
  './manifest.json',
  './auth.js',
  './sw.js',
];
const CACHE_FIRST = [
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll([...NETWORK_FIRST, ...CACHE_FIRST]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isNetworkFirst(url) {
  return NETWORK_FIRST.some((path) => url.endsWith(path.replace('./', '/')) || url.endsWith(path.replace('./', '')));
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url;

  if (isNetworkFirst(url)) {
    // Network-first: try live content, cache a fresh copy for offline use,
    // and only reach for the cache if the network request itself fails.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for everything else (icons, fonts, etc.)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && url.startsWith(self.location.origin)) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
