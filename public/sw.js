
const CACHE_NAME = 'costalcontrol-v1';
const ASSETS_TO_CACHE = [
  './',
  'index.html',
  'https://cdn.tailwindcss.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Ignorar peticiones a Apps Script para evitar cachear respuestas dinámicas
  if (event.request.url.includes('script.google.com')) {
    return fetch(event.request);
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
