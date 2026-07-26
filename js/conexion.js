/**
 * conexion.js
 * Indicador de conexión a internet. Muestra en el header si la app está EN LÍNEA
 * o SIN CONEXIÓN y despliega un aviso cuando se pierde. No se conforma con
 * navigator.onLine (que solo mira la interfaz de red): hace un "ping" ligero a
 * Supabase para confirmar que hay internet de verdad. Otras partes de la app
 * pueden llamar estaEnLinea() antes de intentar guardar.
 */

let _conexionOnline = navigator.onLine;
let _conexionTimer = null;
const CONEXION_MS = 30000; // revisión periódica de respaldo

/** ¿La app tiene conexión (según la última comprobación)? */
function estaEnLinea() { return _conexionOnline; }

/** Actualiza el chip del header y el banner de "sin conexión". */
function pintarConexion() {
  const chip = document.getElementById('conexionChip');
  if (chip) {
    chip.className = 'conexion-chip ' + (_conexionOnline ? 'con-on' : 'con-off');
    chip.innerHTML = `<span class="con-dot"></span>${_conexionOnline ? 'En línea' : 'Sin conexión'}`;
    chip.title = _conexionOnline
      ? 'Conectado a internet: los cambios se guardan.'
      : 'Sin internet: los cambios y fotos no se guardarán hasta reconectar.';
  }
  const banner = document.getElementById('offlineBanner');
  if (banner) banner.classList.toggle('show', !_conexionOnline);
}

/** Fija el estado y avisa (una sola vez) cuando cambia. */
function setConexion(online) {
  const cambio = online !== _conexionOnline;
  _conexionOnline = online;
  pintarConexion();
  // Al recuperar la conexión, vacía la cola de cambios pendientes (offline).
  if (online && typeof sincronizarPendientes === 'function') {
    setTimeout(sincronizarPendientes, 300);
  }
  if (cambio && typeof showStatus === 'function') {
    showStatus(
      online
        ? '🟢 Conexión restablecida. Subiendo lo que quedó pendiente…'
        : '🔴 Sin conexión. Puedes seguir trabajando: lo que guardes queda en el dispositivo y se subirá solo al reconectar.',
      online ? 'ok' : 'error'
    );
  }
}

/** Comprueba la conexión real con un ping a Supabase (con tiempo límite). */
async function verificarConexion() {
  if (!navigator.onLine) { setConexion(false); return; }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const base = (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.url) || '';
    // mode:'no-cors' → basta con que la petición LLEGUE al servidor; así una
    // respuesta sin cabeceras CORS NO se interpreta como "sin conexión".
    await fetch(base + '/auth/v1/health', { cache: 'no-store', mode: 'no-cors', signal: ctrl.signal });
    setConexion(true);
  } catch (_) {
    // Solo un fallo de red real (o timeout) llega aquí.
    setConexion(false);
  } finally {
    clearTimeout(t);
  }
}

/** Arranca el monitor de conexión. */
function initConexion() {
  pintarConexion();
  verificarConexion();
  // Los eventos del navegador dan el cambio al instante (y son gratis).
  window.addEventListener('online', verificarConexion);
  window.addEventListener('offline', () => setConexion(false));
  // Respaldo periódico solo cuando la pestaña está visible (ahorra recursos).
  if (_conexionTimer) clearInterval(_conexionTimer);
  _conexionTimer = setInterval(() => {
    if (!document.hidden) verificarConexion();
  }, CONEXION_MS);
  // Al volver a la pestaña, revisa de inmediato.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) verificarConexion(); });
}

document.addEventListener('DOMContentLoaded', initConexion);
