/**
 * sw.js — Service Worker
 * Cachea la "carcasa" de la aplicación para que cargue rápido y funcione como
 * app instalada (PWA). El nombre de la caché incluye la versión (version.js):
 * al subir la versión se crea una caché nueva, se borran las viejas y se avisa
 * al usuario para que actualice. Las llamadas a Supabase/CDN NO se cachean.
 */
importScripts('./js/version.js');

const CACHE = 'casos-cache-' + APP_VERSION;

const ASSETS = [
  './verificacion.html',
  './manifest.json',
  './css/styles.css',
  './js/version.js',
  './js/config.js',
  './js/utils.js',
  './js/state.js',
  './js/dom.js',
  './js/supabase.js',
  './js/auth.js',
  './js/relationship.js',
  './js/excel.js',
  './js/parque.js',
  './js/vistas-bd.js',
  './js/casos.js',
  './js/audio.js',
  './js/camara.js',
  './js/fotos.js',
  './js/croquis.js',
  './js/usuarios.js',
  './js/detalle.js',
  './js/terceros.js',
  './js/cierre.js',
  './js/ui.js',
  './js/segvial.js',
  './js/main.js',
  './js/conexion.js',
  './js/offline.js',
  './js/pwa.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/logo.svg',
  './icons/logo-maskable.svg',
  // Módulo de contratos legales (integrado, mismo origen y misma sesión).
  './contratos/casos.html',
  './contratos/formularios2.html'
];

// Instalación: precachear la carcasa (sin activar todavía).
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS).catch(() => {}))
  );
});

// Activación: borrar cachés de versiones anteriores.
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// La página pide activar la nueva versión.
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// Estrategia: RED PRIMERO para recursos propios (siempre lo más nuevo estando
// en línea) y caché como respaldo sin conexión. Supabase y CDN van directo.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 'no-store' evita que el fetch pase por la caché HTTP del navegador: así, al
  // publicar una versión nueva, SIEMPRE se descargan los archivos frescos del
  // servidor (antes el navegador podía servir un .js viejo aunque cambiara la
  // versión). Sin conexión se responde desde la caché del propio SW.
  event.respondWith(
    fetch(req, { cache: 'no-store' })
      .then(res => {
        const copia = res.clone(); // clonar YA, antes de que el navegador consuma el body
        caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then(m => m || caches.match('./verificacion.html')))
  );
});
