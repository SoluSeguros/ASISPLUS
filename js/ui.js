/**
 * ui.js
 * Capa de presentación: renderiza la tabla y las estadísticas, controla la
 * paginación/búsqueda por vista y muestra mensajes de estado y el loader.
 */

/** Devuelve las filas de la vista (pestaña) actualmente seleccionada. */
function getCurrentRows() {
  if (state.currentView === 'unidos') return state.joinedRows;
  if (state.currentView === 'sinTerceros') return state.asistenciaSinTerceros;
  if (state.currentView === 'huerfanos') return state.tercerosHuerfanos;
  if (state.currentView === 'resumen') return state.resumenRows;
  if (state.currentView === 'parque') return state.parqueRows;
  if (state.currentView === 'asistenciasBD') return state.asistenciasBDRows;
  if (state.currentView === 'tercerosBD') return state.tercerosBDRows;
  return [];
}

/** Devuelve el título correspondiente a la vista actual. */
function getCurrentTitle() {
  if (state.currentView === 'unidos') return 'Datos unidos: asistencias + terceros';
  if (state.currentView === 'sinTerceros') return 'Asistencias sin terceros';
  if (state.currentView === 'huerfanos') return 'Terceros sin asistencia relacionada';
  if (state.currentView === 'resumen') return 'Resumen por asistencia';
  if (state.currentView === 'parque') return 'Parque automotor (base de datos)';
  if (state.currentView === 'asistenciasBD') return 'Registro de asistencias (base de datos)';
  if (state.currentView === 'tercerosBD') return 'Terceros (base de datos)';
  return 'Datos';
}

/** Año (AAAA) de la fecha del siniestro de una fila. */
function anioDeFila(row) {
  const m = String(row['FECHA DEL SINIESTRO'] || '').match(/(\d{4})/);
  return m ? m[1] : '';
}

/**
 * Fecha del siniestro como clave comparable 'YYYY-MM-DD' ('' si no se reconoce).
 * Acepta 'YYYY-MM-DD' y 'DD/MM/YYYY'. La comparación es lexicográfica, sin
 * zonas horarias.
 */
function fechaKeyDeFila(row) {
  const s = String(row['FECHA DEL SINIESTRO'] || '');
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return '';
}

/** ESTADO DEL SINIESTRO de una fila, normalizado ('' = sin dato). */
function estadoSinDeFila(row) {
  return String(row['ESTADO DEL SINIESTRO'] || '').trim().toUpperCase();
}
/** GRAVEDAD DEL SINIESTRO de una fila, normalizada ('' = sin dato). */
function gravedadDeFila(row) {
  return String(row['GRAVEDAD DEL SINIESTRO'] || '').trim().toUpperCase();
}

/**
 * Filas del Registro de Asistencias tras aplicar año, empresa y búsqueda,
 * PERO sin los filtros de estado/gravedad del resumen. Es la base sobre la
 * que se calculan los contadores (así los números no cambian al filtrar por
 * un chip). Las filas ya vienen ordenadas de la base (lo último primero).
 */
function getResumenBaseRows() {
  let rows = getCurrentRows();

  if (state.currentView === 'asistenciasBD') {
    if (state.filtroAnio) rows = rows.filter(r => anioDeFila(r) === state.filtroAnio);
    if (state.filtroEmpresa) rows = rows.filter(r => String(r['EMPRESA'] || '').trim() === state.filtroEmpresa);
    if (state.filtroDesde || state.filtroHasta) {
      rows = rows.filter(r => {
        const k = fechaKeyDeFila(r);
        if (!k) return false;
        if (state.filtroDesde && k < state.filtroDesde) return false;
        if (state.filtroHasta && k > state.filtroHasta) return false;
        return true;
      });
    }
  }

  if (!state.search) return rows;

  return rows.filter(row =>
    Object.values(row).some(value => String(value || '').toLowerCase().includes(state.search))
  );
}

/** ¿El valor de la fila cae en el bucket filtrado? ('__SIN__' = sin dato). */
function coincideBucket(valorFila, filtro) {
  return filtro === '__SIN__' ? !valorFila : valorFila === filtro;
}

/**
 * Aplica TODOS los filtros de la vista, incluidos los de estado/gravedad del
 * resumen del Registro de Asistencias.
 */
function getFilteredRows() {
  let rows = getResumenBaseRows();

  if (state.currentView === 'asistenciasBD') {
    if (state.filtroEstadoSin) rows = rows.filter(r => coincideBucket(estadoSinDeFila(r), state.filtroEstadoSin));
    if (state.filtroGravedad) rows = rows.filter(r => coincideBucket(gravedadDeFila(r), state.filtroGravedad));
  }

  return rows;
}

// Columnas que no se muestran (fotos, firmas, croquis, licencia y matrícula:
// son rutas de imagen; su evidencia se muestra como miniatura, no como texto).
const COLUMNAS_OCULTAS = /foto|firma|croquis|licencia de condu|matricula (primera|segunda)|id registro/i;

/** Indica si una columna debe mostrarse. */
function columnaVisible(col) {
  if (COLUMNAS_OCULTAS.test(col)) return false;
  const c = String(col).trim().toUpperCase();
  if (c === 'KEY' || c.endsWith(' KEY') || c.endsWith('-KEY')) return false;
  return true;
}

/** Marca como activa la pestaña indicada (por su data-view). */
function setActiveTab(view) {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === view);
  });
}

/* ------------------------------------------------------------------ *
 *  Resumen del Registro de Asistencias: contadores por Estado y
 *  Gravedad, clicables para filtrar la tabla.
 * ------------------------------------------------------------------ */

// Etiqueta + color de cada valor conocido (fallback: se titula el valor crudo).
const ESTADO_SIN_META = {
  'CERRADO':   { label: 'Cerrados',   cls: 'br-verde' },
  'CANCELADO': { label: 'Cancelados', cls: 'br-gris' },
  'ABIERTO':   { label: 'Abiertos',   cls: 'br-azul' }
};
const GRAVEDAD_META = {
  'DAÑOS Y LESIONES': { label: 'Daños y lesiones', cls: 'br-naranja' },
  'HOMICIDIO':        { label: 'Homicidio',        cls: 'br-rojo' },
  // Compatibilidad con datos antiguos (antes eran tres opciones):
  'SOLO DAÑOS':       { label: 'Solo daños',       cls: 'br-verde' },
  'HERIDOS':          { label: 'Heridos',          cls: 'br-naranja' }
};

/** Escapa texto para insertarlo con seguridad en HTML. */
function escBd(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
/** Primera letra de cada palabra en mayúscula. */
function tituloCase(s) {
  return String(s).toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
}
/** Cuenta filas por bucket ('' = sin dato) de un campo dado. */
function contarBuckets(rows, valorFn) {
  const m = new Map();
  rows.forEach(r => {
    const v = valorFn(r);
    m.set(v, (m.get(v) || 0) + 1);
  });
  return m;
}

/** Dibuja el resumen (Estado + Gravedad) sobre la tabla de asistencias. */
function renderResumenBD() {
  const cont = els.bdResumen;
  if (!cont) return;
  if (state.currentView !== 'asistenciasBD') {
    cont.classList.add('hidden');
    cont.innerHTML = '';
    return;
  }

  const base = getResumenBaseRows();
  const total = base.length;

  const filaHTML = (titulo, campo, activo, valorFn, meta, orden) => {
    const counts = contarBuckets(base, valorFn);
    const claves = [...counts.keys()].sort((a, b) => {
      if (a === '') return 1;            // "sin dato" siempre al final
      if (b === '') return -1;
      const ia = orden.indexOf(a), ib = orden.indexOf(b);
      const ra = ia === -1 ? 999 : ia, rb = ib === -1 ? 999 : ib;
      if (ra !== rb) return ra - rb;     // primero el orden preferido
      return counts.get(b) - counts.get(a); // luego por frecuencia
    });

    let chips = `<button type="button" class="br-chip br-todos${activo === '' ? ' activo' : ''}" data-campo="${campo}" data-val="">`
      + `Todos <span class="br-count">${total}</span></button>`;
    claves.forEach(k => {
      const key = k === '' ? '__SIN__' : k;
      const info = meta[k] || { label: (k ? tituloCase(k) : 'Sin dato'), cls: 'br-gris' };
      chips += `<button type="button" class="br-chip ${info.cls}${activo === key ? ' activo' : ''}" data-campo="${campo}" data-val="${escBd(key)}">`
        + `${escBd(info.label)} <span class="br-count">${counts.get(k)}</span></button>`;
    });
    return `<div class="bd-res-fila"><span class="bd-res-label">${titulo}</span><div class="bd-res-chips">${chips}</div></div>`;
  };

  cont.innerHTML =
    filaHTML('Estado', 'estado', state.filtroEstadoSin, estadoSinDeFila, ESTADO_SIN_META, ['CERRADO', 'CANCELADO', 'ABIERTO']) +
    filaHTML('Gravedad', 'gravedad', state.filtroGravedad, gravedadDeFila, GRAVEDAD_META, ['DAÑOS Y LESIONES', 'HOMICIDIO', 'SOLO DAÑOS', 'HERIDOS']);
  cont.classList.remove('hidden');

  // Cableado por delegación (una sola vez): sobrevive al reemplazo de innerHTML.
  if (!cont.dataset.wired) {
    cont.addEventListener('click', ev => {
      const b = ev.target.closest('.br-chip');
      if (!b) return;
      const val = b.dataset.val || '';
      if (b.dataset.campo === 'estado') state.filtroEstadoSin = val;
      else if (b.dataset.campo === 'gravedad') state.filtroGravedad = val;
      state.page = 1;
      renderTable();
    });
    cont.dataset.wired = '1';
  }
}

/** Renderiza la tabla con paginación según la vista y el filtro activos. */
function renderTable() {
  renderResumenBD();
  const rows = getFilteredRows();
  const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
  if (state.page > totalPages) state.page = totalPages;

  const start = (state.page - 1) * state.pageSize;
  const end = start + state.pageSize;
  const visibleRows = rows.slice(start, end);
  let columns = getAllColumns(visibleRows.length ? visibleRows : getCurrentRows())
    .filter(columnaVisible)
    .slice(0, 250);

  // En el Registro de Asistencias, la cantidad de terceros va primero.
  if (state.currentView === 'asistenciasBD' && columns.includes('TERCEROS')) {
    columns = ['TERCEROS', ...columns.filter(c => c !== 'TERCEROS')];
  }

  els.tableTitle.textContent = getCurrentTitle();
  els.tableCount.textContent = `${formatNumber(rows.length)} registros`;
  els.pageInfo.textContent = `Página ${state.page} de ${totalPages}`;
  els.btnPrev.disabled = state.page <= 1;
  els.btnNext.disabled = state.page >= totalPages;

  const thead = els.dataTable.querySelector('thead');
  const tbody = els.dataTable.querySelector('tbody');

  thead.innerHTML = '';
  tbody.innerHTML = '';

  if (!columns.length) {
    thead.innerHTML = '<tr><th>Sin datos</th></tr>';
    tbody.innerHTML = '<tr><td>No hay registros para mostrar.</td></tr>';
    return;
  }

  const headerRow = document.createElement('tr');
  columns.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col === 'TERCEROS' ? 'TERCEROS' : col;
    th.title = col;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  const clickable = state.currentView === 'asistenciasBD';
  visibleRows.forEach(row => {
    const tr = document.createElement('tr');
    columns.forEach(col => {
      const td = document.createElement('td');
      const value = row[col] || '';
      if (col === 'TERCEROS') {
        const n = Number(value) || 0;
        const badge = document.createElement('span');
        badge.className = n > 0 ? 'terceros-badge tiene' : 'terceros-badge cero';
        badge.textContent = n;
        td.appendChild(badge);
        td.classList.add('td-terceros');
      } else {
        td.textContent = value;
        td.title = value;
      }
      tr.appendChild(td);
    });
    if (clickable) {
      tr.classList.add('fila-clic');
      tr.addEventListener('click', () => abrirDetalleAsistencia(row));
    }
    tbody.appendChild(tr);
  });
}

/** Actualiza las tarjetas de estadísticas con los totales del cruce. */
function renderStats() {
  els.statAsistencias.textContent = formatNumber(state.asistenciaRows.length);
  els.statTerceros.textContent = formatNumber(state.tercerosRows.length);
  els.statRelacionadas.textContent = formatNumber(state.joinedRows.filter(r => r.ESTADO_RELACION === 'RELACIONADO').length);
  els.statSinTerceros.textContent = formatNumber(state.asistenciaSinTerceros.length);
  els.statHuerfanos.textContent = formatNumber(state.tercerosHuerfanos.length);
}

/** Muestra u oculta las secciones de la app (stats, pestañas, tabla). */
function showAppSections(show) {
  els.statsBox.classList.toggle('hidden', !show);
  els.tabsBox.classList.toggle('hidden', !show);
  els.controlsBox.classList.toggle('hidden', !show);
  els.tableCard.classList.toggle('hidden', !show);
  els.btnDownload.disabled = !show;
}

/** Muestra un mensaje de estado (ok / error / info). */
function showStatus(message, type = 'info') {
  els.statusBox.textContent = message;
  els.statusBox.className = `status show ${type}`;
}

/** Muestra u oculta el modal de carga (loader). */
function showLoader(show) {
  els.loaderModal.classList.toggle('show', show);
}

/** Restablece el estado y la interfaz antes de procesar un nuevo archivo. */
function clearPreviousData() {
  state.workbook = null;
  state.currentView = 'unidos';
  state.page = 1;
  state.search = '';
  state.sheets = {};
  state.asistenciaRows = [];
  state.tercerosRows = [];
  state.joinedRows = [];
  state.asistenciaSinTerceros = [];
  state.tercerosHuerfanos = [];
  state.resumenRows = [];
  state.asistenciaKeyCol = '';
  state.tercerosKeyCol = '';
  els.searchInput.value = '';
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.tab[data-view="unidos"]').classList.add('active');
}
