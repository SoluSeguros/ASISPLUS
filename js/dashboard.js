/**
 * dashboard.js
 * Panel de métricas (dashboard) para gestor/admin: KPIs, Top 10 de empresas con
 * más casos, casos por mes (últimos 12) y distribución por estado. Lee todas las
 * asistencias (paginado) y calcula todo en el navegador. Sin librerías externas:
 * las gráficas son barras HTML/CSS de una sola serie (magnitud) con etiquetas
 * directas, en el azul de marca (accesible por diseño; identidad por la etiqueta).
 */

let _dashRows = [];
// Tamaño del parque por empresa. Sin esto no se puede comparar una empresa con
// otra: 411 casos en una flota de 103 buses y 184 en una de 597 no son el mismo
// problema, y la lista por volumen bruto hace ver mal a quien más vehículos tiene.
let _dashParque = {};

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
    _dashParque = await cargarParquePorEmpresa();
    llenarSelectorEmpresasDash();
    renderDashboard();
  } catch (error) {
    if (cont) cont.innerHTML = `<div class="tercero-estado">Error al cargar las métricas: ${escDash(error.message || error)}</div>`;
  } finally {
    showLoader(false);
  }
}

/**
 * Cuenta los vehículos de cada empresa. Se normaliza el nombre igual que en los
 * casos (recortado y en mayúsculas) porque en los datos conviven "COOTRANSI" y
 * "Cootransi", y sin normalizar quedarían como dos empresas distintas.
 */
async function cargarParquePorEmpresa() {
  const mapa = {};
  try {
    let desde = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await db
        .from('parque_automotor')
        .select('empresa')
        .range(desde, desde + PAGE - 1);
      if (error) throw error;
      (data || []).forEach(v => {
        const e = String(v.empresa || '').trim().toUpperCase();
        if (e) mapa[e] = (mapa[e] || 0) + 1;
      });
      if (!data || data.length < PAGE) break;
      desde += PAGE;
    }
  } catch (_) {
    // Sin parque la ficha sigue sirviendo: solo se queda sin la tasa por vehículo.
  }
  return mapa;
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

/** Lee el rango de fechas del filtro (Desde/Hasta) como Date de inicio/fin de día. */
function _rangoFiltro() {
  const parse = (s, fin) => {
    if (!s) return null;
    const p = String(s).split('-').map(Number);
    if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return null;
    return fin ? new Date(p[0], p[1] - 1, p[2], 23, 59, 59, 999)
               : new Date(p[0], p[1] - 1, p[2], 0, 0, 0, 0);
  };
  const desde = els.dashDesde ? parse(els.dashDesde.value, false) : null;
  const hasta = els.dashHasta ? parse(els.dashHasta.value, true) : null;
  return { desde, hasta };
}

/** Filas dentro del rango de fechas activo (o todas si no hay filtro). */
function _filasFiltradas() {
  const { desde, hasta } = _rangoFiltro();
  if (!desde && !hasta) return _dashRows;
  return _dashRows.filter(f => {
    const dt = _fechaCaso(f);
    if (!dt) return false;
    if (desde && dt < desde) return false;
    if (hasta && dt > hasta) return false;
    return true;
  });
}

/** Formatea un Date a texto corto dd/mm/aaaa. */
function _fechaCorta(dt) {
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}

/** Dibuja todo el dashboard. */
function renderDashboard() {
  const cont = els.dashboardBody;
  if (!cont) return;
  const rows = _filasFiltradas();
  const { desde, hasta } = _rangoFiltro();
  const hayFiltro = !!(desde || hasta);

  // --- Aviso de rango activo ---
  let avisoHTML = '';
  if (hayFiltro) {
    const ini = desde ? _fechaCorta(desde) : '…';
    const fin = hasta ? _fechaCorta(hasta) : '…';
    avisoHTML = `<div class="dash-rango">📅 Mostrando ${ini} → ${fin} · <b>${rows.length}</b> caso${rows.length === 1 ? '' : 's'} en el rango</div>`;
  }

  // --- KPIs ---
  const total = rows.length;
  const abiertos = rows.filter(f => !['CERRADO', 'CANCELADO', 'HISTORICO'].includes(f.estado)).length;
  const cerrados = rows.filter(f => f.estado === 'CERRADO').length;
  const hoy = new Date();
  const claveActual = _claveMes(hoy);
  const esteMes = rows.filter(f => { const dt = _fechaCaso(f); return dt && _claveMes(dt) === claveActual; }).length;

  const kpis = `<div class="dash-kpis">
    ${_kpi(total, hayFiltro ? 'Casos en el rango' : 'Casos totales', '', 'todos')}
    ${_kpi(abiertos, 'Abiertos', 'info', 'abiertos')}
    ${_kpi(cerrados, 'Cerrados', 'ok', 'cerrados')}
    ${_kpi(esteMes, 'Este mes', 'warn', 'estemes')}
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
    empHTML += `<div class="dash-bar-row dash-clic${i === 0 ? ' es-lider' : ''}" role="button" tabindex="0" data-drill="empresa" data-val="${escDash(e.nombre)}" title="Ver los ${e.n} caso${e.n === 1 ? '' : 's'} de ${escDash(e.nombre)}">
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

  // --- Casos por mes (ventana adaptable al rango del filtro) ---
  // Sin filtro: últimos 12 meses. Con filtro: los meses que abarca el rango
  // (mínimo hasta el mes actual cuando falta un extremo), con tope de 24 columnas.
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

  const ALTO_PLOT = 150; // px de la barra más alta (altura determinista)
  let mesHTML = '';
  meses.forEach(m => {
    const h = m.n ? Math.max(4, Math.round((m.n / maxMes) * ALTO_PLOT)) : 2;
    const clic = m.n ? ` dash-clic" role="button" tabindex="0" data-drill="mes" data-val="${escDash(m.clave)}` : '';
    mesHTML += `<div class="dash-col${clic}" title="${escDash(m.etiqueta)} ${m.anio}: ${m.n} caso${m.n === 1 ? '' : 's'}${m.n ? ' — clic para ver' : ''}">
      <span class="dash-col-val">${m.n || ''}</span>
      <span class="dash-col-bar" style="height:${h}px"></span>
      <span class="dash-col-lab">${escDash(m.etiqueta)}<small>${escDash(m.anio)}</small></span>
    </div>`;
  });
  const totalMeses = meses.reduce((s, m) => s + m.n, 0);
  const tituloMes = hayFiltro ? '📅 Casos por mes' : '📅 Casos por mes (últimos 12)';
  const mesBlock = `<div class="dash-panel">
    <div class="dash-panel-head"><h3>${tituloMes}</h3><span class="dash-panel-sub">${totalMeses} casos en el periodo</span></div>
    <div class="dash-cols">${mesHTML}</div>
  </div>`;

  // --- Comparativo normalizado por flota ---
  // El Top 10 de arriba ordena por volumen; este ordena por riesgo real.
  const comp = _comparativoEmpresas(rows, meses.length);
  let compBlock = '';
  if (comp.length >= 2) {
    const maxTasa = comp[0].tasa || 1;
    let filasHTML = '';
    comp.forEach((c, i) => {
      const pct = Math.max(4, Math.round((c.tasa / maxTasa) * 100));
      filasHTML += `<div class="dash-bar-row dash-clic${i === 0 ? ' es-lider' : ''}" role="button" tabindex="0" data-drill="empresa" data-val="${escDash(c.empresa)}" title="Ver los ${c.casos} casos de ${escDash(c.empresa)}">
        <span class="dash-bar-rank">${i + 1}</span>
        <span class="dash-bar-nom">${escDash(tituloCaseFicha(c.empresa))} <small class="fe-sub">${c.vehiculos} veh. · ${c.casos} casos</small></span>
        <span class="dash-bar-track"><span class="dash-bar-fill" style="width:${pct}%"></span></span>
        <span class="dash-bar-val">${c.tasa.toFixed(1)}</span>
      </div>`;
    });
    const peor = comp[0], mejor = comp[comp.length - 1];
    const veces = mejor.tasa > 0 ? Math.round(peor.tasa / mejor.tasa) : 0;
    compBlock = `<div class="dash-panel">
      <div class="dash-panel-head">
        <h3>⚖️ Siniestralidad comparada (por cada 100 vehículos al mes)</h3>
        <span class="dash-panel-sub">${veces > 1 ? `<b>${escDash(tituloCaseFicha(peor.empresa))}</b> tiene ${veces} veces la siniestralidad de <b>${escDash(tituloCaseFicha(mejor.empresa))}</b>` : ''}</span>
      </div>
      <p class="audio-nota">El Top 10 de arriba ordena por cantidad, así que las flotas grandes siempre encabezan. Esta lista descuenta el tamaño de la flota: es la que dice quién tiene de verdad un problema. Solo entran empresas con parque registrado y 5 o más casos en el periodo.</p>
      <div class="dash-bars">${filasHTML}</div>
    </div>`;
  }

  cont.innerHTML = avisoHTML + kpis + topEmpBlock + mesBlock + compBlock;
}

/** Tarjeta-KPI (clicable si se pasa un tipo de drill). */
function _kpi(n, label, tono, drill) {
  const num = (typeof formatNumber === 'function') ? formatNumber(n) : n;
  const clic = drill ? ` dash-clic" role="button" tabindex="0" data-drill="subset" data-val="${escDash(drill)}` : '';
  return `<div class="dash-kpi${tono ? ' k-' + tono : ''}${clic}">
    <span class="dash-kpi-n">${num}</span>
    <span class="dash-kpi-l">${escDash(label)}</span>
  </div>`;
}

/**
 * Manejador de clic sobre una métrica del dashboard: arma el filtro y abre la
 * Bandeja ya filtrada. Respeta el rango de fechas activo del dashboard.
 */
function onDashboardDrill(ev) {
  const el = ev.target.closest('[data-drill]');
  if (!el) return;
  if (ev.type === 'keydown' && ev.key !== 'Enter' && ev.key !== ' ') return;
  if (ev.type === 'keydown') ev.preventDefault();
  if (typeof abrirBandejaFiltrada !== 'function') return;

  const tipo = el.dataset.drill;
  const val = el.dataset.val || '';
  const { desde, hasta } = _rangoFiltro();
  const sufijoRango = (desde || hasta)
    ? ` · ${desde ? _fechaCorta(desde) : '…'}→${hasta ? _fechaCorta(hasta) : '…'}`
    : '';
  const extra = {};

  if (tipo === 'empresa') {
    extra.empresa = val;
    extra.desde = desde; extra.hasta = hasta;
    extra.label = `🏢 ${val}${sufijoRango}`;
  } else if (tipo === 'mes') {
    extra.mes = val;
    const p = val.split('-');
    const et = _MESES_CORTOS[Number(p[1]) - 1] || val;
    extra.label = `📅 ${et} ${p[0]}`;
  } else if (tipo === 'subset') {
    if (val === 'abiertos') { extra.estado = 'abiertos'; extra.desde = desde; extra.hasta = hasta; extra.label = `🟦 Casos abiertos${sufijoRango}`; }
    else if (val === 'cerrados') { extra.estado = 'cerrados'; extra.desde = desde; extra.hasta = hasta; extra.label = `✅ Casos cerrados${sufijoRango}`; }
    else if (val === 'estemes') { const hoy = new Date(); extra.mes = _claveMes(hoy); extra.label = '📅 Casos de este mes'; }
    else { extra.desde = desde; extra.hasta = hasta; extra.label = `📊 ${desde || hasta ? 'Casos del rango' : 'Todos los casos'}${sufijoRango}`; }
  } else {
    return;
  }

  abrirBandejaFiltrada(extra);
}

/* ------------------------------------------------------------------ *
 *  Ficha por empresa (la misma que ve la empresa en su portal)
 * ------------------------------------------------------------------ */

const DASH_VISTAS = { general: 'dashVistaGeneral', empresa: 'dashVistaEmpresa' };

/**
 * Vuelve al dashboard desde el portal de una empresa SIN volver a descargar
 * los casos: son ~2.800 filas y ya están en memoria. Si por lo que sea no lo
 * están (recarga de la página), entonces sí se cargan.
 */
async function volverAlDashboard() {
  if (!_dashRows.length) { await abrirDashboard(); return; }
  ocultarPantallas();
  els.dashboardCard.classList.remove('hidden');
  marcarUbicacion('btnMenuDashboard', 'Dashboard de métricas');
  cambiarVistaDashboard('empresa');   // se regresa a donde estaba
}

/** Cambia entre "General" y "Ficha por empresa". */
function cambiarVistaDashboard(vista) {
  if (!DASH_VISTAS[vista]) return;
  if (els.dashTabs) {
    els.dashTabs.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.vista === vista));
  }
  Object.keys(DASH_VISTAS).forEach(v => {
    const el = els[DASH_VISTAS[v]];
    if (el) el.classList.toggle('hidden', v !== vista);
  });
  if (vista === 'empresa') renderFichaEmpresaAdmin();
}

/** Nombre de empresa de una fila, normalizado para agrupar. */
function _empresaDeFila(f) {
  return String((f.datos && f.datos['EMPRESA']) || '').trim().toUpperCase();
}

/** Llena el selector de empresas con las que tienen casos, de mayor a menor. */
function llenarSelectorEmpresasDash() {
  const sel = els.dashEmpresaSel;
  if (!sel) return;
  const conteo = {};
  _dashRows.forEach(f => {
    const e = _empresaDeFila(f);
    if (e) conteo[e] = (conteo[e] || 0) + 1;
  });
  const empresas = Object.keys(conteo).sort((a, b) => conteo[b] - conteo[a] || a.localeCompare(b));
  if (!empresas.length) {
    sel.innerHTML = '<option value="">Sin empresas</option>';
    return;
  }
  const previa = state.fichaEmpresaSel;
  sel.innerHTML = empresas
    .map(e => `<option value="${escDash(e)}">${escDash(tituloCaseFicha(e))} (${conteo[e]})</option>`)
    .join('');
  // Conserva la empresa elegida al refrescar; si no había, arranca por la primera.
  state.fichaEmpresaSel = (previa && empresas.includes(previa)) ? previa : empresas[0];
  sel.value = state.fichaEmpresaSel;
}

/** Rango Desde/Hasta de la pestaña "Ficha por empresa". */
function _rangoFichaAdmin() {
  const parse = (s, fin) => {
    if (!s) return null;
    const p = String(s).split('-').map(Number);
    if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return null;
    return fin ? new Date(p[0], p[1] - 1, p[2], 23, 59, 59, 999)
               : new Date(p[0], p[1] - 1, p[2], 0, 0, 0, 0);
  };
  return {
    desde: els.dashEmpDesde ? parse(els.dashEmpDesde.value, false) : null,
    hasta: els.dashEmpHasta ? parse(els.dashEmpHasta.value, true) : null
  };
}

/** Dibuja la ficha de la empresa elegida en el selector. */
function renderFichaEmpresaAdmin() {
  const cont = els.dashEmpresaBody;
  if (!cont) return;
  const empresa = (els.dashEmpresaSel && els.dashEmpresaSel.value) || state.fichaEmpresaSel || '';
  state.fichaEmpresaSel = empresa;
  if (!empresa) {
    cont.innerHTML = '<div class="dash-panel"><div class="tercero-estado">Elige una empresa.</div></div>';
    return;
  }
  const filas = _dashRows.filter(f => _empresaDeFila(f) === empresa);
  const { desde, hasta } = _rangoFichaAdmin();
  const metricas = calcularFichaEmpresa(filas, _dashParque[empresa] || 0, { desde, hasta });
  renderFichaEmpresa(cont, metricas, { nombreEmpresa: tituloCaseFicha(empresa) });
}

/**
 * Comparativo de siniestralidad entre empresas, normalizado por flota.
 *
 * Es la vista que le faltaba a SoluAsistencia: el Top 10 por volumen premia a
 * las flotas grandes y castiga a las pequeñas. Aquí se mide siniestros por cada
 * 100 vehículos al mes, que sí es comparable. Solo entran las empresas con
 * parque conocido y con al menos 5 casos: por debajo de eso el indicador se
 * mueve tanto por azar que induce a error.
 */
function _comparativoEmpresas(rows, meses) {
  const conteo = {};
  rows.forEach(f => {
    const e = _empresaDeFila(f);
    if (e) conteo[e] = (conteo[e] || 0) + 1;
  });
  const MIN_CASOS = 5;
  return Object.keys(conteo)
    .map(empresa => {
      const veh = _dashParque[empresa] || 0;
      const casos = conteo[empresa];
      const tasa = (veh > 0 && meses > 0) ? ((casos / meses) / veh) * 100 : null;
      return { empresa, casos, vehiculos: veh, tasa };
    })
    .filter(x => x.tasa != null && x.casos >= MIN_CASOS)
    .sort((a, b) => b.tasa - a.tasa);
}
