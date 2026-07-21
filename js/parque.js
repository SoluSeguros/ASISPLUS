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

/** Trae todas las filas del parque automotor (paginadas). */
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

  return todas;
}

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
