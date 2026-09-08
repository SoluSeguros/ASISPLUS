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
  './asisplus.html',
  './manifest.json',
  './css/styles.css?v=' + APP_VERSION,
  './js/version.js?v=' + APP_VERSION,
  './js/config.js?v=' + APP_VERSION,
  './js/utils.js?v=' + APP_VERSION,
  './js/state.js?v=' + APP_VERSION,
  './js/dom.js?v=' + APP_VERSION,
  './js/supabase.js?v=' + APP_VERSION,
  './js/auth.js?v=' + APP_VERSION,
  './js/relationship.js?v=' + APP_VERSION,
  './js/excel.js?v=' + APP_VERSION,
  './js/parque.js?v=' + APP_VERSION,
  './js/vistas-bd.js?v=' + APP_VERSION,
  './js/casos.js?v=' + APP_VERSION,
  './js/audio.js?v=' + APP_VERSION,
  './js/camara.js?v=' + APP_VERSION,
  './js/fotos.js?v=' + APP_VERSION,
  './js/croquis.js?v=' + APP_VERSION,
  './js/lugarimpacto.js?v=' + APP_VERSION,
  './js/instalarapp.js?v=' + APP_VERSION,
  './js/usuarios.js?v=' + APP_VERSION,
  './js/empresa.js?v=' + APP_VERSION,
  './js/detalle.js?v=' + APP_VERSION,
  './js/terceros.js?v=' + APP_VERSION,
  './js/cierre.js?v=' + APP_VERSION,
  './js/ui.js?v=' + APP_VERSION,
  './js/segvial.js?v=' + APP_VERSION,
  './js/dashboard.js?v=' + APP_VERSION,
  './js/novedades.js?v=' + APP_VERSION,
  './js/main.js?v=' + APP_VERSION,
  './js/conexion.js?v=' + APP_VERSION,
  './js/offline.js?v=' + APP_VERSION,
  './js/pwa.js?v=' + APP_VERSION,
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/soluasistencia.png',
  './icons/soluasistencia-trans.png',
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
        // Solo se guarda lo que llegó BIEN: cachear un 404/500 de un despliegue
        // a medias dejaría ese error servido sin conexión hasta cambiar de versión.
        if (res.ok) {
          const copia = res.clone(); // clonar YA, antes de que el navegador consuma el body
          caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(m => {
        if (m) return m;
        // Respaldo a la carcasa SOLO para navegaciones. Devolver el HTML ante un
        // .js o .css no cacheado no arregla nada: el navegador lo rechaza por
        // MIME y el fallo real (el archivo que falta) queda oculto.
        if (req.mode === 'navigate') return caches.match('./asisplus.html');
        return Response.error();
      }))
  );
});
