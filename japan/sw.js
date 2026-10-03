// ---- Japan trip app — service worker ----
// Keep CACHE_VERSION in sync with APP_VERSION in index.html — bump both together on every release.
// The cache name is derived from it, so shipping a new version automatically invalidates the old
// cache (old caches matching this app's prefix are swept in activate(), below).
const CACHE_VERSION = 'v261003.001';
const CACHE_NAME = 'japan-trip-' + CACHE_VERSION;

// resolved at runtime from this file's own location, so it's correct wherever this folder actually
// lives — e.g. https://andrewbrittle.github.io/trip/japan/ — rather than a path hardcoded here
const APP_ROOT = new URL('.', self.location).href;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&display=swap'
];

self.addEventListener('install', event => {
  // own-origin files are cached as one atomic batch (they're small and should all succeed together);
  // the cross-origin font CSS is cached separately and best-effort, so a Google Fonts hiccup can't
  // poison the whole precache and leave the app itself uncached
  const ownFiles = PRECACHE_URLS.filter(u => !u.startsWith('http'));
  const fontUrls = PRECACHE_URLS.filter(u => u.startsWith('http'));
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ownFiles)
        .catch(() => {})
        .then(() => Promise.all(fontUrls.map(u => cache.add(u).catch(() => {})))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('japan-trip-') && k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isOwnPage = req.url.startsWith(APP_ROOT);
  const isFonts = req.url.startsWith('https://fonts.googleapis.com/') || req.url.startsWith('https://fonts.gstatic.com/');

  // only ever act on this app's own files or the Google Fonts it loads — anything else (including a
  // sibling app under the same site, now or in future) is left completely alone, so the browser
  // handles it exactly as if this service worker didn't exist
  if (!isOwnPage && !isFonts) return;

  if (isOwnPage && (req.mode === 'navigate' || req.destination === 'document')) {
    // network-first for the page itself: anyone online always gets whatever was last shipped;
    // only a genuinely offline visit falls back to the last cached copy
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(cached => cached || caches.match('./')))
    );
    return;
  }

  // everything else in scope (fonts, the manifest, icons): cache-first, populating the cache on
  // whatever the first real network fetch turns out to be
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
      return res;
    }))
  );
});
