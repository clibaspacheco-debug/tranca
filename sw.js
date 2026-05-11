// sw.js — service worker simples (cache-first pros assets, network-first pra dados)
const VERSION = 'tranca-v1';
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './stats.js',
  './charts.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== VERSION).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // JSONBin — network-first com fallback de cache
  if (url.hostname === 'api.jsonbin.io') {
    e.respondWith(
      fetch(e.request).then(r => {
        if (e.request.method === 'GET') {
          const copy = r.clone();
          caches.open(VERSION).then(c => c.put(e.request, copy));
        }
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // Assets — cache-first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(r => {
      if (r.ok && e.request.method === 'GET') {
        const copy = r.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
      }
      return r;
    }).catch(() => cached))
  );
});
