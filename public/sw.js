// Service Worker de Control de Costales: permite abrir la pantalla de la tienda sin internet.
const VERSION = 'cc-v1';
const ESTATICOS = `${VERSION}-estaticos`;
const PAGINAS = `${VERSION}-paginas`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((c) => !c.startsWith(VERSION)).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase y otros servicios van directo a la red

  // Archivos de la app (llevan hash en el nombre): primero caché
  if (url.pathname.startsWith('/_next/static/') || url.pathname === '/icon.svg') {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copia = res.clone();
              caches.open(ESTATICOS).then((c) => c.put(req, copia));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Pantalla del celular de tienda: primero red, si no hay internet se usa la última versión guardada
  if (req.mode === 'navigate' && url.pathname.startsWith('/tienda')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !res.redirected) {
            const copia = res.clone();
            caches.open(PAGINAS).then((c) => c.put('/tienda', copia));
          }
          return res;
        })
        .catch(() =>
          caches.match('/tienda').then(
            (hit) =>
              hit ||
              new Response('<h1 style="font-family:sans-serif;padding:24px">Sin conexión. Abre la app con internet al menos una vez.</h1>', {
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
              }),
          ),
        ),
    );
  }
});
