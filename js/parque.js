/**
 * parque.js
 * Consulta del maestro "parque_automotor" desde Supabase. Trae los vehículos
 * (paginando si hace falta) y los deja en el estado para verlos y buscarlos
 * reutilizando la tabla y los controles existentes.
 *
 * Nota de privacidad: NO se solicita la columna de contraseña; no se muestra
 * en la interfaz.
 */

// Columnas visibles del parque (se omite contrasena_conductor a propósito).
const PARQUE_COLUMNAS =
  'key,empresa,placa,numero_interno,tipo,modelo,' +
  'cedula_conductor,nombre_conductor,telefono_conductor,' +
  'cedula_propietario,propietario,telefono_propietario,' +
  'aseguradora,correo_empresa';

// Copia del parque en el dispositivo, para buscar/seleccionar el vehículo aunque
// no haya internet (el asistente en la calle). Cabe de sobra en localStorage.
const PARQUE_CACHE_KEY = 'asisplus-parque-cache';

/** Guarda el parque en el dispositivo (con marca de tiempo). */
function guardarParqueCache(rows) {
  try {
    localStorage.setItem(PARQUE_CACHE_KEY, JSON.stringify({ ts: Date.now(), rows: rows }));
  } catch (e) { /* cuota llena u otro: no es crítico */ }
}

/** Lee el parque cacheado. Devuelve { ts, rows } o null. */
function leerParqueCache() {
  try {
    const obj = JSON.parse(localStorage.getItem(PARQUE_CACHE_KEY) || 'null');
    return (obj && Array.isArray(obj.rows)) ? obj : null;
  } catch (e) { return null; }
}

/** Trae todas las filas del parque automotor (paginadas) y actualiza el caché. */
async function fetchParque() {
  const todas = [];
  let desde = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await db
      .from('parque_automotor')
      .select(PARQUE_COLUMNAS)
      .order('empresa', { ascending: true })
      .order('numero_interno', { ascending: true })
      .range(desde, desde + PAGE - 1);

    if (error) throw error;

    todas.push(...data);
    if (data.length < PAGE) break;
    desde += PAGE;
  }

  guardarParqueCache(todas); // deja una copia offline para el formulario
  return todas;
}

/**
 * Deja el parque disponible en state.parqueRows. Intenta traerlo fresco (online);
 * si no hay señal o falla, usa la copia guardada en el dispositivo.
 * Devuelve { origen: 'memoria' | 'red' | 'cache' | 'vacio', ts? }.
 */
async function asegurarParqueDisponible() {
  if (state.parqueRows && state.parqueRows.length) return { origen: 'memoria' };
  try {
    state.parqueRows = await fetchParque();
    return { origen: 'red' };
  } catch (e) {
    const cache = leerParqueCache();
    if (cache && cache.rows.length) {
      state.parqueRows = cache.rows;
      return { origen: 'cache', ts: cache.ts };
    }
    state.parqueRows = state.parqueRows || [];
    return { origen: 'vacio' };
  }
}

/** Precachea el parque en segundo plano si hay señal y aún no hay copia local. */
async function precacheParqueSiHaceFalta() {
  if (!navigator.onLine || leerParqueCache()) return;
  try { await fetchParque(); } catch (e) { /* se reintenta luego */ }
}
window.addEventListener('online', () => { precacheParqueSiHaceFalta(); });

/** Carga el parque desde Supabase y lo muestra en la tabla con búsqueda. */
async function cargarParqueYMostrar() {
  try {
    showLoader(true);
    state.parqueRows = await fetchParque();
    mostrarVistaBD('parque');
    showStatus(`Parque automotor: ${formatNumber(state.parqueRows.length)} vehículos.`, 'ok');
  } catch (error) {
    showStatus('Error al cargar el parque automotor: ' + (error.message || error), 'error');
  } finally {
    showLoader(false);
  }
}
