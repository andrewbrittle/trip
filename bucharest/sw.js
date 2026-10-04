// Bucharest & Sofia trip — service worker.
// Network-first for the page itself (so anyone online always gets the latest edit — this app is
// still being actively updated), cache-first for the Google Fonts, own-files precached atomically
// at install with the cross-origin font fetch kept separate and best-effort (a flaky connection to
// Google Fonts during install shouldn't be able to prevent the app's own files from caching —
// cache.addAll() is all-or-nothing across everything you hand it, so it's split in two here).
const CACHE_VERSION = 'v261004.001'; // keep in sync with APP_VERSION in index.html — bump both together
const CACHE_NAME = 'bucharest-trip-' + CACHE_VERSION;
const APP_ROOT = new URL('.', self.location).href; // resolves correctly wherever this file actually lives

const PRECACHE_URLS = [
  './', './index.html', './manifest.json', './icon-192.png', './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&display=swap'
];

self.addEventListener('install', event => {
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
      .then(keys => Promise.all(keys.filter(k => k.startsWith('bucharest-trip-') && k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const isOwnPage = req.url.startsWith(APP_ROOT);
  const isFonts = req.url.startsWith('https://fonts.googleapis.com/') || req.url.startsWith('https://fonts.gstatic.com/');
  // Anything else — including a sibling app in a neighbouring folder, e.g. the Japan trip app —
  // is left completely alone. A service worker's scope is the directory it's served from, so this
  // can't reach outside its own folder regardless, but the explicit check is cheap belt-and-braces.
  if (!isOwnPage && !isFonts) return;

  if (isOwnPage && (req.mode === 'navigate' || req.destination === 'document')) {
    event.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(CACHE_NAME).then(cache => cache.put(req, copy)); return res; })
        .catch(() => caches.match(req).then(cached => cached || caches.match('./')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE_NAME).then(cache => cache.put(req, copy)); return res;
    }))
  );
});
