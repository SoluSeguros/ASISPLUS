/**
 * empresa.js
 * Portal de solo lectura para el rol "empresa" (login autogestionable de una
 * compañía transportadora). Solo lectura: la RLS de Supabase ya filtra
 * parque_automotor y registro_asistencias por la empresa del perfil, así que
 * aquí no hace falta (ni se debe) volver a filtrar por empresa en el cliente.
 */

/** Engancha el clic en una fila del historial (abre el detalle de ese caso) y el modal. */
function initEmpresaPortal() {
  if (els.empresaCasosBody) {
    const abrirDesdeFila = event => {
      const fila = event.target.closest('tr[data-idx]');
      if (!fila) return;
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
      if (event.type === 'keydown') event.preventDefault(); // evita el scroll con espacio
      const caso = (state.empresaCasosLista || [])[Number(fila.dataset.idx)];
      if (caso) verDetalleCasoEmpresa(caso);
    };
    els.empresaCasosBody.addEventListener('click', abrirDesdeFila);
    els.empresaCasosBody.addEventListener('keydown', abrirDesdeFila);
  }
  if (els.btnEmpresaCasoCerrar) els.btnEmpresaCasoCerrar.addEventListener('click', cerrarDetalleCasoEmpresa);
  if (els.empresaCasoModal) {
    els.empresaCasoModal.addEventListener('click', event => {
      if (event.target === els.empresaCasoModal) cerrarDetalleCasoEmpresa();
    });
  }

  // Filtro de fechas de "Mis siniestros por mes".
  if (els.btnEmpresaMesFiltrar) els.btnEmpresaMesFiltrar.addEventListener('click', renderSiniestrosPorMesEmpresa);
  if (els.btnEmpresaMesLimpiar) els.btnEmpresaMesLimpiar.addEventListener('click', () => {
    if (els.empresaMesDesde) els.empresaMesDesde.value = '';
    if (els.empresaMesHasta) els.empresaMesHasta.value = '';
    renderSiniestrosPorMesEmpresa();
  });

  // Submenú: Dashboard / Históricos / Vehículos registrados.
  if (els.empresaTabs) {
    els.empresaTabs.addEventListener('click', event => {
      const btn = event.target.closest('.tab');
      if (btn) cambiarVistaEmpresa(btn.dataset.vista);
    });
  }
}

const EMPRESA_VISTAS = {
  dashboard: 'empresaVistaDashboard',
  historico: 'empresaVistaHistorico',
  vehiculos: 'empresaVistaVehiculos'
};

/** Cambia entre Dashboard / Históricos / Vehículos dentro del portal de empresa. */
function cambiarVistaEmpresa(vista) {
  if (!EMPRESA_VISTAS[vista]) return;
  if (els.empresaTabs) {
    els.empresaTabs.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.vista === vista));
  }
  Object.keys(EMPRESA_VISTAS).forEach(v => {
    const el = els[EMPRESA_VISTAS[v]];
    if (el) el.classList.toggle('hidden', v !== vista);
  });
}

/** Lee el rango Desde/Hasta del filtro de "Mis siniestros por mes". */
function _empresaRangoFiltro() {
  const parse = (s, fin) => {
    if (!s) return null;
    const p = String(s).split('-').map(Number);
    if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return null;
    return fin ? new Date(p[0], p[1] - 1, p[2], 23, 59, 59, 999)
               : new Date(p[0], p[1] - 1, p[2], 0, 0, 0, 0);
  };
  return {
    desde: els.empresaMesDesde ? parse(els.empresaMesDesde.value, false) : null,
    hasta: els.empresaMesHasta ? parse(els.empresaMesHasta.value, true) : null
  };
}

/**
 * Dibuja "Mis siniestros por mes" (barras) a partir de state.empresaCasosLista,
 * acotado al rango Desde/Hasta si hay filtro activo. Reutiliza los mismos
 * ayudantes de fecha/mes de dashboard.js (_fechaCaso, _claveMes, _MESES_CORTOS).
 */
function renderSiniestrosPorMesEmpresa() {
  const cont = els.empresaMesCols;
  if (!cont) return;

  const todas = state.empresaCasosLista || [];
  const { desde, hasta } = _empresaRangoFiltro();
  const hoy = new Date();
  const rows = (desde || hasta) ? todas.filter(f => {
    const dt = _fechaCaso(f);
    if (!dt) return false;
    if (desde && dt < desde) return false;
    if (hasta && dt > hasta) return false;
    return true;
  }) : todas;

  // Ventana de meses: últimos 12 sin filtro, o los meses del rango elegido.
  let iniMes = desde ? new Date(desde.getFullYear(), desde.getMonth(), 1) : null;
  let finMes = hasta ? new Date(hasta.getFullYear(), hasta.getMonth(), 1) : null;
  if (!iniMes && !finMes) {
    finMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    iniMes = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1);
  } else if (!iniMes) {
    iniMes = new Date(finMes.getFullYear(), finMes.getMonth() - 11, 1);
  } else if (!finMes) {
    finMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    if (finMes < iniMes) finMes = new Date(iniMes.getFullYear(), iniMes.getMonth(), 1);
  }
  let numMeses = (finMes.getFullYear() - iniMes.getFullYear()) * 12 + (finMes.getMonth() - iniMes.getMonth()) + 1;
  if (numMeses > 24) { iniMes = new Date(finMes.getFullYear(), finMes.getMonth() - 23, 1); numMeses = 24; }
  if (numMeses < 1) numMeses = 1;

  const meses = [];
  for (let i = 0; i < numMeses; i++) {
    const dt = new Date(iniMes.getFullYear(), iniMes.getMonth() + i, 1);
    meses.push({ clave: _claveMes(dt), etiqueta: _MESES_CORTOS[dt.getMonth()], anio: String(dt.getFullYear()).slice(2), n: 0 });
  }
  const idxMes = {};
  meses.forEach((m, i) => { idxMes[m.clave] = i; });
  rows.forEach(f => { const dt = _fechaCaso(f); if (!dt) return; const k = _claveMes(dt); if (idxMes[k] != null) meses[idxMes[k]].n++; });
  const maxMes = Math.max(1, ...meses.map(m => m.n));

  const ALTO_PLOT = 130;
  let html = '';
  meses.forEach(m => {
    const h = m.n ? Math.max(4, Math.round((m.n / maxMes) * ALTO_PLOT)) : 2;
    html += `<div class="dash-col" title="${escBandeja(m.etiqueta)} ${escBandeja(m.anio)}: ${m.n} caso${m.n === 1 ? '' : 's'}">
      <span class="dash-col-val">${m.n || ''}</span>
      <span class="dash-col-bar" style="height:${h}px"></span>
      <span class="dash-col-lab">${escBandeja(m.etiqueta)}<small>${escBandeja(m.anio)}</small></span>
    </div>`;
  });
  cont.innerHTML = html;

  const total = meses.reduce((s, m) => s + m.n, 0);
  if (els.empresaMesTotal) els.empresaMesTotal.textContent = `${total} caso${total === 1 ? '' : 's'} en el periodo`;
}

/** Abre el portal de empresa: parque propio + historial de casos propio. */
async function abrirEmpresaPortal() {
  ocultarPantallas();
  els.empresaCard.classList.remove('hidden');
  const nombreEmpresa = (state.perfil && state.perfil.empresa) || 'Mi empresa';
  if (els.empresaNombreTitulo) els.empresaNombreTitulo.textContent = nombreEmpresa;
  marcarUbicacion('empresaCard', nombreEmpresa);
  cambiarVistaEmpresa('dashboard');
  await Promise.all([cargarMisVehiculos(), cargarMisCasos()]);
}

/** Carga el listado de vehículos de la empresa (RLS ya filtra por empresa). */
async function cargarMisVehiculos() {
  const tbody = els.empresaVehiculosBody;
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';
  try {
    const { data, error } = await db
      .from('parque_automotor')
      .select('placa, numero_interno, tipo')
      .order('placa', { ascending: true });
    if (error) throw error;
    if (els.empresaVehiculosCount) els.empresaVehiculosCount.textContent = `(${formatNumber((data || []).length)})`;
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3">Sin vehículos registrados.</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(v => `
      <tr>
        <td>${escBandeja(v.placa || '—')}</td>
        <td>${escBandeja(v.numero_interno || '—')}</td>
        <td>${escBandeja(v.tipo || '—')}</td>
      </tr>`).join('');
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="3">Error: ${escBandeja(error.message || String(error))}</td></tr>`;
  }
}

/** Carga el historial de casos de la empresa (RLS ya filtra por EMPRESA). */
async function cargarMisCasos() {
  const tbody = els.empresaCasosBody;
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
  try {
    const { data, error } = await db
      .from('registro_asistencias')
      .select('numero_caso, estado, datos, creado_en')
      .order('creado_en', { ascending: false });
    if (error) throw error;
    state.empresaCasosLista = data || [];
    renderSiniestrosPorMesEmpresa();
    if (els.empresaCasosCount) els.empresaCasosCount.textContent = `(${formatNumber((data || []).length)})`;
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5">Sin casos registrados.</td></tr>';
      return;
    }
    // Cada fila abre el detalle completo del caso (clic o Enter/Espacio). En
    // vez de "Estado" (en los históricos siempre dice lo mismo) se muestra el
    // tipo de vehículo y la gravedad, que sí distinguen un caso de otro.
    tbody.innerHTML = data.map((c, i) => {
      const d = c.datos || {};
      const fecha = d['FECHA DEL SINIESTRO'] || '—';
      const placa = d['PLACA VEHICULO'] || '—';
      const tipo = d['TIPO DE VEHICULO'] || '—';
      const gravedad = d['GRAVEDAD DEL SINIESTRO'] || '';
      const gravedadHTML = gravedad
        ? `<span class="ct-grav ${claseGravedad(gravedad)}">${escBandeja(gravedad)}</span>`
        : '—';
      return `
        <tr class="fila-clic" data-idx="${i}" tabindex="0">
          <td>${escBandeja(c.numero_caso || '—')}</td>
          <td>${escBandeja(fecha)}</td>
          <td>${escBandeja(placa)}</td>
          <td>${escBandeja(tipo)}</td>
          <td>${gravedadHTML}</td>
        </tr>`;
    }).join('');
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="5">Error: ${escBandeja(error.message || String(error))}</td></tr>`;
  }
}

/** Muestra el detalle de un caso del historial (mismo patrón de "fila" que el resto de la app). */
function verDetalleCasoEmpresa(caso) {
  const d = caso.datos || {};
  const fila = (lab, val) => val
    ? `<div class="detalle-item"><div class="detalle-lab">${lab}</div><div class="detalle-val">${escBandeja(String(val))}</div></div>`
    : '';

  const idVeh = [d['PLACA VEHICULO'], d['NUMERO INTERNO VEHICULO'] ? `Interno #${d['NUMERO INTERNO VEHICULO']}` : '']
    .filter(Boolean).join(' · ');
  const fechaHora = [d['FECHA DEL SINIESTRO'], d['HORA DEL SINIESTRO']].filter(Boolean).join('  ');

  if (els.empresaCasoTitulo) els.empresaCasoTitulo.textContent = caso.numero_caso ? `Caso N.º ${caso.numero_caso}` : 'Caso histórico';
  if (els.empresaCasoSub) els.empresaCasoSub.textContent = caso.estado || '';

  if (els.empresaCasoBody) {
    els.empresaCasoBody.innerHTML = `
      <h4 class="detalle-seccion-tit">Vehículo</h4>
      <div class="detalle-grid">
        ${fila('Vehículo', idVeh)}
        ${fila('Tipo', d['TIPO DE VEHICULO'])}
        ${fila('Lugar de impacto', d['LUGAR DE IMPACTO'])}
        ${fila('Conductor', d['NOMBRE CONDUCTOR'])}
      </div>

      <h4 class="detalle-seccion-tit">Siniestro</h4>
      <div class="detalle-grid">
        ${fila('Fecha y hora', fechaHora)}
        ${fila('Ruta', d['RUTA'])}
        ${fila('Dirección del lugar', d['DIRECCION DEL LUGAR DEL SINIESTRO'])}
        ${fila('Gravedad', d['GRAVEDAD DEL SINIESTRO'])}
        ${fila('Responsabilidad del conductor', d['RESPONSABILIDAD DEL CONDUCTOR'])}
        ${fila('Descripción de los daños', d['DESCRIPCION DAÑOS EMPRESA'])}
        ${fila('Observaciones', d['OBSERVACIONES'])}
      </div>
    `;
  }
  if (els.empresaCasoModal) els.empresaCasoModal.classList.add('show');
}

function cerrarDetalleCasoEmpresa() {
  if (els.empresaCasoModal) els.empresaCasoModal.classList.remove('show');
}
