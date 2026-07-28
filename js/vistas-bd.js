/**
 * vistas-bd.js
 * Vistas de las tablas de Supabase y el CRUCE de asistencias con terceros,
 * todo desde la base de datos (ya no se sube Excel). Reutiliza la lógica de
 * cruce (relationship.js) y la tabla con búsqueda/paginación (ui.js).
 */

/** Trae todas las filas (JSONB) de una tabla, devolviendo el objeto `datos`. */
async function fetchTablaJsonb(tabla) {
  const todas = [];
  let desde = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await db
      .from(tabla)
      .select('datos')
      // Orden estable y único: sin él, con >1000 filas las páginas se pueden
      // solapar u omitir (Postgres no garantiza el orden entre consultas).
      .order('id', { ascending: true })
      .range(desde, desde + PAGE - 1);

    if (error) throw error;

    todas.push(...data.map(r => r.datos));
    if (data.length < PAGE) break;
    desde += PAGE;
  }

  return todas;
}

/**
 * Trae el Registro de Asistencias ordenado por lo más reciente primero
 * (actualizado_en desc, y como desempate id desc: lo último ingresado arriba).
 */
async function fetchAsistenciasOrdenado() {
  const todas = [];
  let desde = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await db
      .from('registro_asistencias')
      .select('datos, actualizado_en')
      .order('actualizado_en', { ascending: false })
      .order('id', { ascending: false })
      .range(desde, desde + PAGE - 1);

    if (error) throw error;

    todas.push(...data.map(r => r.datos));
    if (data.length < PAGE) break;
    desde += PAGE;
  }

  return todas;
}

/**
 * Cuenta cuántos terceros hay por cada KEY (para mostrar la cantidad de
 * terceros de cada asistencia en la tabla). Recorre toda la tabla de terceros.
 */
async function fetchTercerosCountPorKey() {
  const counts = {};
  let desde = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await db
      .from('registro_terceros')
      .select('key')
      .order('id', { ascending: true }) // orden estable para paginar sin repetir/omitir
      .range(desde, desde + PAGE - 1);

    if (error) throw error;

    data.forEach(r => {
      const k = String(r.key || '').trim();
      if (k) counts[k] = (counts[k] || 0) + 1;
    });
    if (data.length < PAGE) break;
    desde += PAGE;
  }

  return counts;
}

/** Llena el selector de empresa del Registro de Asistencias. */
function llenarFiltroEmpresa() {
  const empresas = [...new Set(
    state.asistenciasBDRows.map(r => String(r['EMPRESA'] || '').trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  els.filtroEmpresa.innerHTML = '';
  const todas = document.createElement('option');
  todas.value = '';
  todas.textContent = 'Todas las empresas';
  els.filtroEmpresa.appendChild(todas);
  empresas.forEach(e => {
    const o = document.createElement('option');
    o.value = e;
    o.textContent = e;
    els.filtroEmpresa.appendChild(o);
  });

  state.filtroEmpresa = '';
  els.filtroEmpresa.value = '';
}

/** Llena el selector de año del Registro de Asistencias (2026 por defecto). */
function llenarFiltroAnio() {
  const anios = [...new Set(state.asistenciasBDRows.map(anioDeFila).filter(Boolean))]
    .sort((a, b) => Number(b) - Number(a));
  const actual = String(new Date().getFullYear());

  els.filtroAnio.innerHTML = '';
  const todos = document.createElement('option');
  todos.value = '';
  todos.textContent = 'Todos los años';
  els.filtroAnio.appendChild(todos);
  anios.forEach(a => {
    const o = document.createElement('option');
    o.value = a;
    o.textContent = 'Año ' + a;
    els.filtroAnio.appendChild(o);
  });

  state.filtroAnio = anios.includes(actual) ? actual : '';
  els.filtroAnio.value = state.filtroAnio;
}

/** Muestra una vista de una sola tabla (sin pestañas ni estadísticas). */
function mostrarVistaBD(view) {
  ocultarPantallas();
  els.controlsBox.classList.remove('hidden');
  els.tableCard.classList.remove('hidden');
  els.filtroAnio.classList.toggle('hidden', view !== 'asistenciasBD');
  els.filtroEmpresa.classList.toggle('hidden', view !== 'asistenciasBD');
  if (els.filtroFechasBox) els.filtroFechasBox.classList.toggle('hidden', view !== 'asistenciasBD');
  // El rango de fechas arranca vacío (sin filtrar) cada vez que se entra.
  state.filtroDesde = '';
  state.filtroHasta = '';
  if (els.filtroDesde) els.filtroDesde.value = '';
  if (els.filtroHasta) els.filtroHasta.value = '';
  const info = {
    parque: ['btnVerParque', 'Parque automotor'],
    asistenciasBD: ['btnVerAsistenciasBD', 'Registro de Asistencias'],
    tercerosBD: ['btnVerTercerosBD', 'Terceros']
  }[view];
  if (info) marcarUbicacion(info[0], info[1]);
  state.currentView = view;
  state.search = '';
  els.searchInput.value = '';
  state.filtroEstadoSin = ''; // el resumen arranca mostrando "Todos".
  state.filtroGravedad = '';
  state.page = 1;
  renderTable();
}

/** Carga REGISTRO ASISTENCIAS desde Supabase y lo muestra. */
async function cargarAsistenciasBD() {
  try {
    showLoader(true);
    state.asistenciasBDRows = await fetchAsistenciasOrdenado();

    // Añade a cada asistencia la cantidad de terceros relacionados (por KEY).
    const counts = await fetchTercerosCountPorKey();
    state.asistenciasBDRows.forEach(r => {
      r['TERCEROS'] = String(counts[getKey(r, 'KEY')] || 0);
    });

    llenarFiltroAnio();
    llenarFiltroEmpresa();
    mostrarVistaBD('asistenciasBD');
    showStatus(`Registro de asistencias: ${formatNumber(state.asistenciasBDRows.length)} registros.`, 'ok');
  } catch (error) {
    showStatus('Error al cargar asistencias: ' + (error.message || error), 'error');
  } finally {
    showLoader(false);
  }
}

/** Carga TERCEROS desde Supabase y lo muestra. */
async function cargarTercerosBD() {
  try {
    showLoader(true);
    state.tercerosBDRows = await fetchTablaJsonb('registro_terceros');
    mostrarVistaBD('tercerosBD');
    showStatus(`Terceros: ${formatNumber(state.tercerosBDRows.length)} registros.`, 'ok');
  } catch (error) {
    showStatus('Error al cargar terceros: ' + (error.message || error), 'error');
  } finally {
    showLoader(false);
  }
}

/**
 * Realiza el cruce Asistencias ↔ Terceros directamente desde Supabase:
 * carga ambas tablas, las relaciona por KEY y muestra los resultados
 * (datos unidos, asistencias sin terceros, terceros huérfanos y resumen).
 */
async function cargarCruceDesdeBD() {
  try {
    showLoader(true);

    const [asistencias, terceros] = await Promise.all([
      fetchTablaJsonb('registro_asistencias'),
      fetchTablaJsonb('registro_terceros')
    ]);

    clearPreviousData();
    state.fileName = 'CRUCE_ASISTENCIAS_TERCEROS';
    state.asistenciaRows = asistencias;
    state.tercerosRows = terceros;
    state.asistenciaKeyCol = findColumnName(asistencias, ['KEY']);
    state.tercerosKeyCol = findColumnName(terceros, ['KEY']);

    if (!state.asistenciaKeyCol || !state.tercerosKeyCol) {
      throw new Error('No se encontró la columna KEY en las tablas de la base de datos.');
    }

    buildRelationship();
    renderStats();

    ocultarPantallas();
    els.statsBox.classList.remove('hidden');
    els.tabsBox.classList.remove('hidden');
    els.btnDownloadInforme.classList.remove('hidden');
    els.controlsBox.classList.remove('hidden');
    els.tableCard.classList.remove('hidden');
    els.filtroAnio.classList.add('hidden');
    els.filtroEmpresa.classList.add('hidden');
    if (els.filtroFechasBox) els.filtroFechasBox.classList.add('hidden');
    marcarUbicacion('btnVerCruce', 'Cruce Asistencias ↔ Terceros');

    state.currentView = 'unidos';
    setActiveTab('unidos');
    state.search = '';
    els.searchInput.value = '';
    state.page = 1;
    renderTable();

    const relacionadas = state.joinedRows.filter(r => r.ESTADO_RELACION === 'RELACIONADO').length;
    showStatus(`Cruce realizado desde la base de datos: ${formatNumber(relacionadas)} filas relacionadas.`, 'ok');
  } catch (error) {
    showStatus('Error al realizar el cruce: ' + (error.message || error), 'error');
  } finally {
    showLoader(false);
  }
}
