/**
 * dashboard.js
 * Panel de métricas (dashboard) para gestor/admin: KPIs, Top 10 de empresas con
 * más casos, casos por mes (últimos 12) y distribución por estado. Lee todas las
 * asistencias (paginado) y calcula todo en el navegador. Sin librerías externas:
 * las gráficas son barras HTML/CSS de una sola serie (magnitud) con etiquetas
 * directas, en el azul de marca (accesible por diseño; identidad por la etiqueta).
 */

let _dashRows = [];

/** Escapa texto para insertarlo con seguridad en HTML. */
function escDash(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Abre el módulo de dashboard. */
async function abrirDashboard() {
  ocultarPantallas();
  els.dashboardCard.classList.remove('hidden');
  marcarUbicacion('btnMenuDashboard', 'Dashboard de métricas');
  await cargarDashboard();
}

/** Trae TODAS las asistencias (paginado) y arma las métricas. */
async function cargarDashboard() {
  const cont = els.dashboardBody;
  if (cont) cont.innerHTML = '<div class="tercero-estado">Calculando métricas…</div>';
  try {
    showLoader(true);
    const filas = [];
    let desde = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await db
        .from('registro_asistencias')
        .select('numero_caso, estado, creado_en, datos')
        .order('creado_en', { ascending: false })
        .range(desde, desde + PAGE - 1);
      if (error) throw error;
      filas.push(...(data || []));
      if (!data || data.length < PAGE) break;
      desde += PAGE;
    }
    _dashRows = filas;
    renderDashboard();
  } catch (error) {
    if (cont) cont.innerHTML = `<div class="tercero-estado">Error al cargar las métricas: ${escDash(error.message || error)}</div>`;
  } finally {
    showLoader(false);
  }
}

/** Fecha de referencia de un caso (siniestro si es válida; si no, creación). */
function _fechaCaso(f) {
  const s = (f.datos && f.datos['FECHA DEL SINIESTRO']) || '';
  let dt = s ? new Date(String(s).trim()) : null;
  if (!dt || isNaN(dt.getTime())) dt = f.creado_en ? new Date(f.creado_en) : null;
  return (dt && !isNaN(dt.getTime())) ? dt : null;
}

/** Clave de mes YYYY-MM de un Date. */
function _claveMes(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

const _MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Dibuja todo el dashboard. */
function renderDashboard() {
  const cont = els.dashboardBody;
  if (!cont) return;
  const rows = _dashRows;

  // --- KPIs ---
  const total = rows.length;
  const abiertos = rows.filter(f => !['CERRADO', 'CANCELADO', 'HISTORICO'].includes(f.estado)).length;
  const cerrados = rows.filter(f => f.estado === 'CERRADO').length;
  const hoy = new Date();
  const claveActual = _claveMes(hoy);
  const esteMes = rows.filter(f => { const dt = _fechaCaso(f); return dt && _claveMes(dt) === claveActual; }).length;

  const kpis = `<div class="dash-kpis">
    ${_kpi(total, 'Casos totales', '')}
    ${_kpi(abiertos, 'Abiertos', 'info')}
    ${_kpi(cerrados, 'Cerrados', 'ok')}
    ${_kpi(esteMes, 'Este mes', 'warn')}
  </div>`;

  // --- Top 10 empresas ---
  const porEmpresa = {};
  rows.forEach(f => {
    const e = String((f.datos && f.datos['EMPRESA']) || '').trim() || '(Sin empresa)';
    porEmpresa[e] = (porEmpresa[e] || 0) + 1;
  });
  const topEmp = Object.keys(porEmpresa)
    .map(nombre => ({ nombre, n: porEmpresa[nombre] }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 10);
  const maxEmp = topEmp.length ? topEmp[0].n : 1;

  let empHTML = '';
  topEmp.forEach((e, i) => {
    const pct = Math.max(4, Math.round((e.n / maxEmp) * 100));
    empHTML += `<div class="dash-bar-row${i === 0 ? ' es-lider' : ''}" title="${escDash(e.nombre)}: ${e.n} caso${e.n === 1 ? '' : 's'}">
      <span class="dash-bar-rank">${i + 1}</span>
      <span class="dash-bar-nom">${escDash(e.nombre)}</span>
      <span class="dash-bar-track"><span class="dash-bar-fill" style="width:${pct}%"></span></span>
      <span class="dash-bar-val">${e.n}</span>
    </div>`;
  });
  if (!topEmp.length) empHTML = '<div class="tercero-estado">Sin datos de empresas.</div>';
  const liderTxt = topEmp.length
    ? `La empresa con más casos es <b>${escDash(topEmp[0].nombre)}</b> (${topEmp[0].n}).`
    : '';
  const topEmpBlock = `<div class="dash-panel">
    <div class="dash-panel-head"><h3>🏢 Top 10 empresas por casos</h3><span class="dash-panel-sub">${liderTxt}</span></div>
    <div class="dash-bars">${empHTML}</div>
  </div>`;

  // --- Casos por mes (últimos 12) ---
  const meses = [];
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    meses.push({ clave: _claveMes(dt), etiqueta: _MESES_CORTOS[dt.getMonth()], anio: String(dt.getFullYear()).slice(2), n: 0 });
  }
  const idxMes = {};
  meses.forEach((m, i) => { idxMes[m.clave] = i; });
  rows.forEach(f => { const dt = _fechaCaso(f); if (!dt) return; const k = _claveMes(dt); if (idxMes[k] != null) meses[idxMes[k]].n++; });
  const maxMes = Math.max(1, ...meses.map(m => m.n));

  const ALTO_PLOT = 150; // px de la barra más alta (altura determinista)
  let mesHTML = '';
  meses.forEach(m => {
    const h = m.n ? Math.max(4, Math.round((m.n / maxMes) * ALTO_PLOT)) : 2;
    mesHTML += `<div class="dash-col" title="${escDash(m.etiqueta)} ${m.anio}: ${m.n} caso${m.n === 1 ? '' : 's'}">
      <span class="dash-col-val">${m.n || ''}</span>
      <span class="dash-col-bar" style="height:${h}px"></span>
      <span class="dash-col-lab">${escDash(m.etiqueta)}<small>${escDash(m.anio)}</small></span>
    </div>`;
  });
  const totalMeses = meses.reduce((s, m) => s + m.n, 0);
  const mesBlock = `<div class="dash-panel">
    <div class="dash-panel-head"><h3>📅 Casos por mes (últimos 12)</h3><span class="dash-panel-sub">${totalMeses} casos en el periodo</span></div>
    <div class="dash-cols">${mesHTML}</div>
  </div>`;

  // --- Distribución por estado ---
  const porEstado = {};
  rows.forEach(f => { const e = f.estado || 'REPORTADO'; porEstado[e] = (porEstado[e] || 0) + 1; });
  const estados = Object.keys(porEstado).map(k => ({ k, n: porEstado[k] })).sort((a, b) => b.n - a.n);
  const maxEst = estados.length ? Math.max(...estados.map(e => e.n)) : 1;
  let estHTML = '';
  estados.forEach(e => {
    const pct = Math.max(4, Math.round((e.n / maxEst) * 100));
    const info = (typeof ESTADOS_CASO !== 'undefined' && ESTADOS_CASO[e.k]) ? ESTADOS_CASO[e.k] : { texto: e.k, clase: '' };
    estHTML += `<div class="dash-bar-row" title="${escDash(info.texto)}: ${e.n}">
      <span class="dash-bar-nom"><span class="estado-badge ${info.clase}">${escDash(info.texto)}</span></span>
      <span class="dash-bar-track"><span class="dash-bar-fill" style="width:${pct}%"></span></span>
      <span class="dash-bar-val">${e.n}</span>
    </div>`;
  });
  const estBlock = `<div class="dash-panel">
    <div class="dash-panel-head"><h3>🗂️ Casos por estado</h3></div>
    <div class="dash-bars dash-bars-estado">${estHTML || '<div class="tercero-estado">Sin datos.</div>'}</div>
  </div>`;

  cont.innerHTML = kpis + topEmpBlock + `<div class="dash-2col">${mesBlock}${estBlock}</div>`;
}

/** Tarjeta-KPI. */
function _kpi(n, label, tono) {
  const num = (typeof formatNumber === 'function') ? formatNumber(n) : n;
  return `<div class="dash-kpi${tono ? ' k-' + tono : ''}">
    <span class="dash-kpi-n">${num}</span>
    <span class="dash-kpi-l">${escDash(label)}</span>
  </div>`;
}
