// Service worker: precaches the whole game so it works offline. Paths are
// relative to the worker's location, so it works under a GitHub Pages subpath.
const VERSION = 'little-garden-v1.0.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/styles.css',
  './src/main.js',
  './src/core/game.js',
  './src/core/rng.js',
  './src/core/state.js',
  './src/data/config.js',
  './src/data/crops.js',
  './src/data/decorations.js',
  './src/data/visitors.js',
  './src/art/pixel.js',
  './src/art/sprites.js',
  './src/art/cropArt.js',
  './src/art/decorArt.js',
  './src/art/visitorArt.js',
  './src/art/uiArt.js',
  './src/ui/app.js',
  './src/ui/audio.js',
  './src/ui/collection.js',
  './src/ui/decor.js',
  './src/ui/dom.js',
  './src/ui/garden.js',
  './src/ui/modals.js',
  './src/ui/records.js',
  './src/ui/render.js',
  './src/ui/seeds.js',
  './src/ui/showcase.js',
  './assets/fonts/PixelifySans-latin.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network-first for navigations (so updates arrive), cache-first for assets.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html')),
    );
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});
