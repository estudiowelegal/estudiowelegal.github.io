// ═══════════════════════════════════════════════════════════════════
// Service worker de WE Legal
// Regla de oro: el HTML del sistema SIEMPRE se pide a la red primero.
// La copia guardada solo se usa si no hay internet. Así nadie se queda
// con una versión vieja del día anterior.
// ═══════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'welegal-v7';

// Lo único que se guarda de entrada: los íconos y el manifiesto, que casi
// nunca cambian. El index.html no se precachea a propósito.
const ESTATICOS = [
  './manifest.webmanifest',
  './icono-192.png',
  './icono-512.png',
  './icono-maskable-192.png',
  './icono-maskable-512.png',
  './apple-touch-icon.png',
  './favicon.png'
];

self.addEventListener('install', e => {
  // No espera a que se cierren las pestañas viejas: se activa enseguida
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(c => c.addAll(ESTATICOS))
      .catch(() => {})   // si algún ícono falla, el sistema anda igual
  );
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // Borra las versiones anteriores del caché
    const nombres = await caches.keys();
    await Promise.all(nombres.filter(n => n !== CACHE_VERSION).map(n => caches.delete(n)));
    // Toma el control de las pestañas ya abiertas sin esperar a que se recarguen
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'actualizar-ya') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Supabase y demás, directo a la red

  const esHTML = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html') ||
                 url.pathname.endsWith('/') ||
                 url.pathname.endsWith('.html');

  if (esHTML) {
    // ── Red primero: siempre la última versión publicada ──
    e.respondWith((async () => {
      try {
        const fresca = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE_VERSION);
        cache.put(req, fresca.clone());
        return fresca;
      } catch (err) {
        // Sin internet: se sirve la última que se haya visto
        const guardada = await caches.match(req) || await caches.match('./index.html') || await caches.match('./');
        if (guardada) return guardada;
        throw err;
      }
    })());
    return;
  }

  // ── Íconos y manifiesto: caché primero, que casi nunca cambian ──
  e.respondWith((async () => {
    const guardada = await caches.match(req);
    if (guardada) return guardada;
    const fresca = await fetch(req);
    if (fresca && fresca.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(req, fresca.clone());
    }
    return fresca;
  })());
});
