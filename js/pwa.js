/**
 * pwa.js
 * Registra el service worker, muestra la versión de la app y aplica las
 * actualizaciones publicadas.
 *
 * Cómo se actualiza:
 *
 *   1. Se pregunta al servidor cada pocos minutos si hay versión nueva, y
 *      también al volver a la pestaña y al recuperar la conexión. Sin esto una
 *      publicación no llegaba nunca: `register()` mira UNA vez, al cargar, y la
 *      app se queda abierta todo el día en el móvil del asistente.
 *   2. Cuando hay una, se aplica sola SI la pantalla está libre.
 *   3. Si el usuario está a media tarea, se deja el aviso y decide él. Recargar
 *      es tirar la página: con un caso a medio llenar o una foto subiendo se
 *      perdería trabajo hecho en la vía, y eso no se recupera.
 */

// Mostrar la versión actual en la interfaz.
document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('appVersion');
  if (el) el.textContent = 'v' + APP_VERSION;
  const lv = document.getElementById('loginVersion');
  if (lv) lv.textContent = 'v' + APP_VERSION;
});

// Cada cuánto se pregunta por una versión nueva. Es una petición diminuta
// (el sw.js), así que no pesa aunque se esté en datos móviles.
const PWA_REVISAR_CADA = 5 * 60 * 1000;
// Con una versión esperando y la pantalla ocupada, cada cuánto se reintenta.
const PWA_REINTENTAR_CADA = 20 * 1000;

let _pwaEsperando = null;   // registro con una versión lista para entrar
let _pwaReintento = null;

/**
 * ¿Se puede recargar ahora sin que el usuario pierda algo?
 *
 * Se mira la pantalla y no una bandera interna: cualquier cosa a medio hacer
 * deja rastro visible (una pantalla de caso abierta, el loader, un modal, o el
 * badge de cambios sin subir), y así no hay que ir tocando cada módulo.
 */
function esSeguroActualizar() {
  const visible = id => {
    const el = document.getElementById(id);
    return !!el && !el.classList.contains('hidden');
  };
  // Creando o editando un caso: puede haber texto escrito sin guardar.
  if (visible('casoCrearCard') || visible('casoDetalleCard')) return false;
  // Algo en vuelo (subiendo fotos, guardando).
  const loader = document.getElementById('loaderModal');
  if (loader && loader.classList.contains('show')) return false;
  // Cambios guardados en el dispositivo que todavía no llegan al servidor.
  const pend = document.getElementById('syncPendientes');
  if (pend && !pend.classList.contains('hidden')) return false;
  // Un modal abierto casi siempre es una tarea a medias.
  if (document.querySelector('.modal-overlay.show')) return false;
  return true;
}

/** Le pide al service worker que entre; al hacerlo, `controllerchange` recarga. */
function aplicarActualizacion(reg) {
  const nuevo = reg && (reg.waiting || reg.installing);
  if (nuevo) nuevo.postMessage('SKIP_WAITING');
}

/**
 * Hay versión nueva lista. Si la pantalla está libre entra sola; si no, se
 * avisa y se vuelve a intentar cuando el usuario termine lo que está haciendo.
 */
function versionNuevaLista(reg) {
  _pwaEsperando = reg;
  if (esSeguroActualizar()) {
    aplicarActualizacion(reg);
    return;
  }
  mostrarBannerActualizar(reg);
  if (_pwaReintento) return;
  _pwaReintento = setInterval(() => {
    if (!_pwaEsperando) { clearInterval(_pwaReintento); _pwaReintento = null; return; }
    if (esSeguroActualizar()) {
      clearInterval(_pwaReintento);
      _pwaReintento = null;
      aplicarActualizacion(_pwaEsperando);
    }
  }, PWA_REINTENTAR_CADA);
}

if ('serviceWorker' in navigator) {
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargando) return;
    recargando = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    // `updateViaCache: 'none'` es lo que hace que la comprobación sirva de algo:
    // sin eso el navegador puede responder el sw.js desde su propia caché HTTP
    // y no enterarse nunca de que se publicó una versión. Alcanza también a
    // version.js, que el sw importa.
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
      // Ya hay una versión nueva esperando de una visita anterior.
      if (reg.waiting && navigator.serviceWorker.controller) versionNuevaLista(reg);

      reg.addEventListener('updatefound', () => {
        const nuevo = reg.installing;
        if (!nuevo) return;
        nuevo.addEventListener('statechange', () => {
          // Sin `controller` es la primera instalación: no hay nada que avisar.
          if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
            versionNuevaLista(reg);
          }
        });
      });

      const revisar = () => {
        if (document.visibilityState === 'hidden') return;  // no gastar datos en segundo plano
        reg.update().catch(() => { /* sin señal: se reintenta luego */ });
      };
      setInterval(revisar, PWA_REVISAR_CADA);
      document.addEventListener('visibilitychange', revisar);
      window.addEventListener('online', revisar);
    }).catch(() => { /* sin SW (por ejemplo, abierto con file://) */ });
  });
}

/** Muestra el aviso de "nueva versión disponible" con el botón para aplicarla. */
function mostrarBannerActualizar(reg) {
  const banner = document.getElementById('pwaBanner');
  if (!banner) return;
  banner.classList.add('show');
  const btn = document.getElementById('pwaActualizar');
  if (!btn) return;
  btn.onclick = () => {
    aplicarActualizacion(reg);
    banner.classList.remove('show');
  };
}
