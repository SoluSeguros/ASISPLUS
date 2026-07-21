/**
 * pwa.js
 * Registra el service worker, muestra la versión de la app y avisa cuando hay
 * una nueva versión publicada (para actualizar sin recargas forzadas).
 */

// Mostrar la versión actual en la interfaz.
document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('appVersion');
  if (el) el.textContent = 'v' + APP_VERSION;
  const lv = document.getElementById('loginVersion');
  if (lv) lv.textContent = 'v' + APP_VERSION;
});

if ('serviceWorker' in navigator) {
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargando) return;
    recargando = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      // Ya hay una versión nueva esperando.
      if (reg.waiting && navigator.serviceWorker.controller) mostrarBannerActualizar(reg);

      reg.addEventListener('updatefound', () => {
        const nuevo = reg.installing;
        if (!nuevo) return;
        nuevo.addEventListener('statechange', () => {
          if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
            mostrarBannerActualizar(reg);
          }
        });
      });
    }).catch(() => { /* sin SW (por ejemplo, abierto con file://) */ });
  });
}

/** Muestra el aviso de "nueva versión disponible". */
function mostrarBannerActualizar(reg) {
  const banner = document.getElementById('pwaBanner');
  if (!banner) return;
  banner.classList.add('show');
  const btn = document.getElementById('pwaActualizar');
  btn.onclick = () => {
    if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
    banner.classList.remove('show');
  };
}
