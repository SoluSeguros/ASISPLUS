/**
 * segvial.js
 * Módulo "Casos por categoría" (antes mal llamado "rutas de cierre").
 * Clasifica AUTOMÁTICAMENTE cada asistencia en una categoría a partir de sus
 * propios datos (responsabilidad, lesionados, gravedad, estado) y las muestra
 * en una tabla profesional con filtros. Al abrir un caso, despliega un modal
 * con un informe detallado. El administrador ve todas las categorías.
 * Se carga después de casos.js / ui.js.
 */

// Categorías (orden de prioridad para clasificar Y de presentación).
const SV_CATS = [
  { key: 'A_FAVOR',     label: 'Reclamación a favor',   cls: 'cat-favor',    desc: 'El tercero es responsable: se reclama a favor.' },
  { key: 'EN_CONTRA',   label: 'Reclamación en contra', cls: 'cat-contra',   desc: 'El conductor asegurado es responsable.' },
  { key: 'LESIONES',    label: 'Lesiones',              cls: 'cat-lesiones', desc: 'Hay personas lesionadas: audiencia contravencional.' },
  { key: 'PREJUDICIAL', label: 'Prejudiciales',         cls: 'cat-prejud',   desc: 'Audiencias prejudiciales, proceso penal o demanda.' },
  { key: 'V2251',       label: 'Seguridad Vial 2251',   cls: 'cat-2251',     desc: 'Solo daños con afectación de póliza o deducible.' },
  { key: 'CERRADO',     label: 'Cerrado',               cls: 'cat-cerrado',  desc: 'Conciliado / cerrado.' }
];
const SV_CAT_POR_KEY = SV_CATS.reduce((m, c) => { m[c.key] = c; return m; }, {});

/**
 * Clasifica un caso en UNA categoría según sus datos (primer criterio que
 * cumpla, gana). El orden es la prioridad de negocio acordada.
 */
/** Clasificación AUTOMÁTICA pura (sin override manual ni finalización). */
function _clasificarAuto(d) {
  d = d || {};
  const up = v => String(v || '').trim().toUpperCase();
  // Normaliza tildes para comparar ("SÍ" → "si") y evita falsos positivos como
  // "SIN LESIONADOS" (que empieza por "si" pero significa lo contrario).
  const les = String(d['LESIONADOS'] || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const hayLesionados = /^si\b/.test(les); // "si", "sí", "si hay…" pero NO "sin…"
  const grav = up(d['GRAVEDAD DEL SINIESTRO']);
  const resp = up(d['RESPONSABILIDAD DEL CONDUCTOR']);
  const est = up(d['ESTADO DEL SINIESTRO']);

  if (up(d['PREJUDICIAL']) === 'SI' || up(d['RUTA CIERRE']) === 'SEG_VIAL_PREJUDICIALES') return 'PREJUDICIAL';
  // Hay lesiones si LO indica el campo "¿Hay lesionados?" o si es homicidio.
  // ('HERIDOS' se mantiene por compatibilidad con datos antiguos.)
  if (hayLesionados || grav === 'HERIDOS' || grav === 'HOMICIDIO') return 'LESIONES';
  if (resp === 'SI') return 'EN_CONTRA';
  if (resp === 'NO') return 'A_FAVOR';
  // Solo daños (sin lesionados): la gravedad ahora es "DAÑOS Y LESIONES"; el
  // que NO haya lesionados es lo que lo lleva a 2251. ('SOLO DAÑOS' = dato viejo.)
  if (grav === 'SOLO DAÑOS' || grav === 'DAÑOS Y LESIONES') return 'V2251';
  if (est === 'CERRADO') return 'CERRADO';
  return 'SIN';
}

/**
 * Categoría efectiva del caso. Prioridad:
 *  1) Finalizado → Cerrado.  2) Categoría MANUAL (override del área).  3) Automática.
 */
function clasificarCaso(d) {
  d = d || {};
  const up = v => String(v || '').trim().toUpperCase();
  if (up(d['ESTADO GENERAL']) === 'FINALIZADO') return 'CERRADO';
  const manual = up(d['CATEGORIA MANUAL']);
  if (manual && SV_CAT_POR_KEY[manual]) return manual;
  return _clasificarAuto(d);
}

/** Etiqueta legible de una categoría (o 'Sin clasificar'). */
function catLabel(key) {
  return (SV_CAT_POR_KEY[key] && SV_CAT_POR_KEY[key].label) || 'Sin clasificar';
}

/** Escapa texto para insertarlo con seguridad en HTML. */
function escSv(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Estado del módulo.
let svRows = [];          // todas las asistencias con su categoría calculada
let svCatActiva = '';     // '' = todas
let svPage = 1;
const SV_PAGE_SIZE = 50;
let svVista = 'tabla';    // 'tabla' | 'calendario'
let svCalRef = null;      // mes mostrado en el calendario {y, m}

/** Abre el módulo "Casos por categoría". */
async function abrirSegvial() {
  ocultarPantallas();
  els.segvialCard.classList.remove('hidden');
  marcarUbicacion('btnMenuSegvial', 'Casos por categoría');
  svCatActiva = '';
  svPage = 1;
  await cargarCasosCategoria();
}

/** Trae TODAS las asistencias (paginado) y calcula la categoría de cada una. */
async function cargarCasosCategoria() {
  try {
    showLoader(true);
    const filas = [];
    let desde = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await db
        .from('registro_asistencias')
        .select('id, numero_caso, estado, key, creado_en, asignado_a, datos')
        .order('creado_en', { ascending: false })
        .order('id', { ascending: false })
        .range(desde, desde + PAGE - 1);
      if (error) throw error;
      filas.push(...(data || []));
      if (!data || data.length < PAGE) break;
      desde += PAGE;
    }
    // Cuántos terceros tiene cada caso (para la columna "Terceros").
    const terc = await _contarTercerosPorKey();
    filas.forEach((f, i) => {
      f._cat = clasificarCaso(f.datos);
      f._idx = i;
      f._terceros = terc ? (terc[f.key] || 0) : null;
    });
    svRows = filas;
    renderSegvial();
  } catch (error) {
    showStatus('Error al cargar los casos: ' + (error.message || error), 'error');
  } finally {
    showLoader(false);
  }
}

/** Cuenta los terceros de cada caso agrupados por `key`. null si falla. */
async function _contarTercerosPorKey() {
  try {
    const mapa = {};
    let desde = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await db
        .from('registro_terceros').select('key').range(desde, desde + PAGE - 1);
      if (error) throw error;
      (data || []).forEach(t => { if (t.key) mapa[t.key] = (mapa[t.key] || 0) + 1; });
      if (!data || data.length < PAGE) break;
      desde += PAGE;
    }
    return mapa;
  } catch (e) {
    return null; // si no se pudo, la columna muestra "—"
  }
}

/** Celda de "Terceros": badge con el número de terceros involucrados. */
function tercerosCeldaHTML(caso) {
  const n = caso._terceros;
  if (n == null) return '<td class="cat-td-terc">—</td>';
  if (!n) return '<td class="cat-td-terc"><span class="terc-badge terc-no">0</span></td>';
  return `<td class="cat-td-terc"><span class="terc-badge terc-si">👥 ${n}</span></td>`;
}

/** Celda de "Días" de la tabla: color por antigüedad; neutro si ya está cerrado. */
function diasCeldaHTML(caso) {
  const n = diasEnProceso(caso);
  if (n == null) return '<td class="cat-td-dias">—</td>';
  const d = caso.datos || {};
  const est = String(d['ESTADO DEL SINIESTRO'] || '').toUpperCase();
  const cerrado = String(d['ESTADO GENERAL'] || '').toUpperCase() === 'FINALIZADO'
    || est === 'CERRADO' || est === 'CANCELADO' || caso._cat === 'CERRADO';
  let cls = 'dias-ok';
  if (cerrado) cls = 'dias-cerr';
  else if (n > 60) cls = 'dias-alto';
  else if (n > 30) cls = 'dias-medio';
  return `<td class="cat-td-dias"><span class="cat-dias ${cls}">${n}</span></td>`;
}

/** Filas de la categoría activa ('' = todas, excluyendo 'SIN' salvo en Todos). */
function svFilasFiltradas() {
  if (!svCatActiva) return svRows;
  return svRows.filter(f => f._cat === svCatActiva);
}

/** Dibuja el módulo: conmutador Tabla/Calendario + la vista activa. */
function renderSegvial() {
  const cont = els.segvialBoard;
  if (!cont) return;

  const toggle = `<div class="sv-vistas">
    <button type="button" class="sv-vista-btn${svVista === 'tabla' ? ' activo' : ''}" data-vista="tabla">📋 Tabla</button>
    <button type="button" class="sv-vista-btn${svVista === 'calendario' ? ' activo' : ''}" data-vista="calendario">📅 Calendario de audiencias</button>
  </div>`;
  cont.innerHTML = toggle + (svVista === 'calendario' ? calendarioHTML() : tablaHTML());

  // Cableado (delegación en el contenedor, una sola vez): cubre ambas vistas.
  if (!cont.dataset.wired) {
    cont.addEventListener('click', ev => {
      const vb = ev.target.closest('.sv-vista-btn');
      if (vb) { svVista = vb.dataset.vista; renderSegvial(); return; }
      // Navegación del calendario.
      if (ev.target.closest('#svCalPrev')) { svCalRef = _mesRel(svCalRef, -1); renderSegvial(); return; }
      if (ev.target.closest('#svCalNext')) { svCalRef = _mesRel(svCalRef, 1); renderSegvial(); return; }
      if (ev.target.closest('#svCalHoy')) { const t = new Date(); svCalRef = { y: t.getFullYear(), m: t.getMonth() }; renderSegvial(); return; }
      // Clic en una audiencia (calendario o recordatorio) → abre el caso.
      const audi = ev.target.closest('.sv-cal-ev, .sv-rec-item');
      if (audi) { const c = svRows[Number(audi.dataset.idx)]; if (c) abrirModalCaso(c); return; }
      // Interacciones de la tabla.
      const tab = ev.target.closest('.cat-tab');
      if (tab) { svCatActiva = tab.dataset.cat || ''; svPage = 1; renderSegvial(); return; }
      if (ev.target.closest('#catPrev')) { if (svPage > 1) { svPage--; renderSegvial(); } return; }
      if (ev.target.closest('#catNext')) { svPage++; renderSegvial(); return; }
      const fila = ev.target.closest('.cat-fila');
      if (fila) { const caso = svRows[Number(fila.dataset.idx)]; if (caso) abrirModalCaso(caso); }
    });
    cont.dataset.wired = '1';
  }
}

/** Vista de tabla (filtros + tabla + paginación) como cadena HTML. */
function tablaHTML() {
  const cuenta = {};
  svRows.forEach(f => { cuenta[f._cat] = (cuenta[f._cat] || 0) + 1; });

  let tabs = `<button type="button" class="cat-tab${svCatActiva === '' ? ' activo' : ''}" data-cat="">Todos <span class="cat-n">${svRows.length}</span></button>`;
  SV_CATS.forEach(c => {
    tabs += `<button type="button" class="cat-tab ${c.cls}${svCatActiva === c.key ? ' activo' : ''}" data-cat="${c.key}" title="${escSv(c.desc)}">${escSv(c.label)} <span class="cat-n">${cuenta[c.key] || 0}</span></button>`;
  });
  const sinN = cuenta['SIN'] || 0;
  if (sinN) tabs += `<button type="button" class="cat-tab cat-sin${svCatActiva === 'SIN' ? ' activo' : ''}" data-cat="SIN">Sin clasificar <span class="cat-n">${sinN}</span></button>`;

  const filas = svFilasFiltradas();
  const totalPag = Math.max(1, Math.ceil(filas.length / SV_PAGE_SIZE));
  if (svPage > totalPag) svPage = totalPag;
  const ini = (svPage - 1) * SV_PAGE_SIZE;
  const visibles = filas.slice(ini, ini + SV_PAGE_SIZE);

  const catDesc = svCatActiva && SV_CAT_POR_KEY[svCatActiva] ? SV_CAT_POR_KEY[svCatActiva].desc : 'Todas las categorías.';

  let filasHTML = '';
  visibles.forEach(f => {
    const d = f.datos || {};
    const cat = SV_CAT_POR_KEY[f._cat] || { label: 'Sin clasificar', cls: 'cat-sin' };
    filasHTML += `
      <tr class="cat-fila" data-idx="${f._idx}">
        <td class="cat-td-num">${escSv(f.numero_caso || '—')}</td>
        <td>${escSv(d['EMPRESA'] || '—')}</td>
        <td>${escSv(d['PLACA VEHICULO'] || '—')}</td>
        <td>${escSv(d['NOMBRE CONDUCTOR'] || '—')}</td>
        ${tercerosCeldaHTML(f)}
        <td>${escSv(d['FECHA DEL SINIESTRO'] || '—')}</td>
        ${diasCeldaHTML(f)}
        <td><span class="cat-chip ${cat.cls}">${escSv(cat.label)}</span></td>
        <td>${escSv(d['RESPONSABILIDAD DEL CONDUCTOR'] || '—')}</td>
        <td>${escSv(d['ESTADO DEL SINIESTRO'] || d['GRAVEDAD DEL SINIESTRO'] || '—')}</td>
      </tr>`;
  });
  if (!visibles.length) filasHTML = '<tr><td colspan="10" class="cat-vacio">No hay casos en esta categoría.</td></tr>';

  return `
    <div class="cat-tabs">${tabs}</div>
    <div class="cat-desc">${escSv(catDesc)}</div>
    <div class="cat-tabla-wrap">
      <table class="cat-tabla">
        <thead>
          <tr>
            <th>N° Caso</th><th>Empresa</th><th>Placa</th><th>Conductor</th><th>Terceros</th>
            <th>Fecha</th><th>Días</th><th>Categoría</th><th>Responsabilidad</th><th>Estado / Gravedad</th>
          </tr>
        </thead>
        <tbody>${filasHTML}</tbody>
      </table>
    </div>
    <div class="cat-pag">
      <span class="muted">${formatNumber(filas.length)} casos · página ${svPage} de ${totalPag}</span>
      <span>
        <button type="button" class="secondary" id="catPrev"${svPage <= 1 ? ' disabled' : ''}>Anterior</button>
        <button type="button" class="secondary" id="catNext"${svPage >= totalPag ? ' disabled' : ''}>Siguiente</button>
      </span>
    </div>`;
}

/* ------------------------------------------------------------------ *
 *  Calendario de audiencias + recordatorios.
 * ------------------------------------------------------------------ */
const SV_CAMPOS_AUDIENCIA = ['LESIONES FECHA AUDIENCIA', '2251 FECHA AUDIENCIA', 'CONTRA FECHA AUDIENCIA', 'PREJUDICIALES FECHA AUDIENCIA'];

/** Fecha de audiencia programada de un caso (YYYY-MM-DD) o null. */
function audienciaDeCaso(caso) {
  const d = caso.datos || {};
  for (let i = 0; i < SV_CAMPOS_AUDIENCIA.length; i++) {
    const v = d[SV_CAMPOS_AUDIENCIA[i]];
    if (v && String(v).trim()) return String(v).trim();
  }
  return null;
}

/** Fecha local a YYYY-MM-DD (sin desfase de zona horaria). */
function _isoLocal(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function _mesRel(ref, delta) {
  const base = ref || { y: new Date().getFullYear(), m: new Date().getMonth() };
  const dt = new Date(base.y, base.m + delta, 1);
  return { y: dt.getFullYear(), m: dt.getMonth() };
}

/** Todas las audiencias programadas (un item por caso con fecha). */
function audienciasList() {
  const out = [];
  svRows.forEach(f => {
    const fecha = audienciaDeCaso(f);
    if (!fecha) return;
    const finalizado = String((f.datos || {})['ESTADO GENERAL'] || '').toUpperCase() === 'FINALIZADO';
    out.push({ caso: f, fecha: fecha, hora: (f.datos || {})['LESIONES HORA AUDIENCIA'] || '', finalizado: finalizado });
  });
  return out;
}

/** Vista de calendario (mes) + panel de recordatorios como cadena HTML. */
function calendarioHTML() {
  if (!svCalRef) { const t = new Date(); svCalRef = { y: t.getFullYear(), m: t.getMonth() }; }
  const { y, m } = svCalRef;
  const hoyISO = _isoLocal(new Date());
  const auds = audienciasList();

  const porFecha = {};
  auds.forEach(a => { (porFecha[a.fecha] = porFecha[a.fecha] || []).push(a); });

  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const dows = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const finMes = new Date(y, m + 1, 0).getDate();
  let startDow = (new Date(y, m, 1).getDay() + 6) % 7; // 0 = lunes

  let celdas = '';
  for (let i = 0; i < startDow; i++) celdas += '<div class="sv-cal-cel vacio"></div>';
  for (let dia = 1; dia <= finMes; dia++) {
    const iso = _isoLocal(new Date(y, m, dia));
    const evs = porFecha[iso] || [];
    const hoy = iso === hoyISO ? ' hoy' : '';
    let chips = '';
    evs.slice(0, 3).forEach(a => {
      const cat = SV_CAT_POR_KEY[a.caso._cat] || { cls: 'cat-sin' };
      const d = a.caso.datos || {};
      const et = a.finalizado ? ' fin' : '';
      chips += `<button type="button" class="sv-cal-ev cat-chip ${cat.cls}${et}" data-idx="${a.caso._idx}" title="${escSv(d['EMPRESA'] || '')} ${escSv(d['PLACA VEHICULO'] || '')}">${a.hora ? escSv(a.hora) + ' · ' : ''}${escSv(d['PLACA VEHICULO'] || a.caso.numero_caso || 'caso')}</button>`;
    });
    if (evs.length > 3) chips += `<span class="sv-cal-mas">+${evs.length - 3} más</span>`;
    celdas += `<div class="sv-cal-cel${hoy}"><div class="sv-cal-dia">${dia}</div><div class="sv-cal-evs">${chips}</div></div>`;
  }

  const cal = `
    <div class="sv-cal-main">
      <div class="sv-cal-head">
        <button type="button" class="secondary" id="svCalPrev" aria-label="Mes anterior">‹</button>
        <div class="sv-cal-mes">${meses[m]} ${y}</div>
        <button type="button" class="secondary" id="svCalHoy">Hoy</button>
        <button type="button" class="secondary" id="svCalNext" aria-label="Mes siguiente">›</button>
      </div>
      <div class="sv-cal-grid">${dows.map(w => `<div class="sv-cal-dow">${w}</div>`).join('')}${celdas}</div>
    </div>`;

  return `<div class="sv-cal">${cal}${recordatoriosHTML(auds, hoyISO)}</div>`;
}

/** Panel lateral de recordatorios: próximas audiencias (y vencidas). */
function recordatoriosHTML(auds, hoyISO) {
  const hoy = new Date(hoyISO + 'T00:00:00');
  const items = auds
    .filter(a => !a.finalizado)
    .map(a => {
      const dt = new Date(a.fecha + 'T00:00:00');
      return { a: a, dt: dt, dias: Math.round((dt.getTime() - hoy.getTime()) / 86400000) };
    })
    .filter(x => !isNaN(x.dt.getTime()) && x.dias >= -30 && x.dias <= 120)
    .sort((p, q) => p.dt - q.dt);

  if (!items.length) {
    return '<div class="sv-rec"><h4>🔔 Próximas audiencias</h4><div class="sv-rec-vacio">No hay audiencias programadas próximamente. Prográmalas en la gestión de cada caso.</div></div>';
  }

  let lista = '';
  items.forEach(x => {
    let badge, bcls;
    if (x.dias < 0) { badge = 'vencida (' + (-x.dias) + 'd)'; bcls = 'venc'; }
    else if (x.dias === 0) { badge = 'HOY'; bcls = 'hoy'; }
    else if (x.dias === 1) { badge = 'mañana'; bcls = 'pronto'; }
    else if (x.dias <= 7) { badge = 'en ' + x.dias + ' días'; bcls = 'pronto'; }
    else { badge = 'en ' + x.dias + ' días'; bcls = 'lejos'; }
    const cat = SV_CAT_POR_KEY[x.a.caso._cat] || { label: '', cls: 'cat-sin' };
    const d = x.a.caso.datos || {};
    lista += `<button type="button" class="sv-rec-item" data-idx="${x.a.caso._idx}">
      <span class="sv-rec-fecha">${escSv(x.a.fecha)}${x.a.hora ? ' · ' + escSv(x.a.hora) : ''}</span>
      <span class="sv-rec-caso">${escSv(d['EMPRESA'] || '')} · ${escSv(d['PLACA VEHICULO'] || x.a.caso.numero_caso || '')}</span>
      <span class="cat-chip ${cat.cls}">${escSv(cat.label)}</span>
      <span class="sv-rec-badge ${bcls}">${escSv(badge)}</span>
    </button>`;
  });
  return `<div class="sv-rec"><h4>🔔 Próximas audiencias (${items.length})</h4><div class="sv-rec-lista">${lista}</div></div>`;
}

/* ------------------------------------------------------------------ *
 *  Campos de gestión editables por categoría (los "campos directos"
 *  del área para programar audiencias, fallo, reservas, pagos, etc.).
 *  Reutilizan las mismas claves del flujo de cierre donde aplica.
 * ------------------------------------------------------------------ */
function _seg(op) { return { col: 'SEGUIMIENTO', label: 'Seguimiento del proceso', tipo: 'select', op: op }; }

const CAMPOS_GESTION = {
  A_FAVOR: [
    _seg(['RADICADA', 'EN TRAMITE', 'PAGO', 'PROCEDIBILIDAD AGOTADA', 'CERRADA']),
    { col: 'RECLAMACION RESULTADO', label: 'Resultado', tipo: 'select', op: ['EN TRAMITE', 'PAGO', 'PROCEDIBILIDAD AGOTADA'] },
    { col: 'RECLAMACION MONTO', label: 'Monto ($)', tipo: 'text' },
    { col: 'RECLAMACION CONTROL', label: 'Control del proceso', tipo: 'textarea' }
  ],
  EN_CONTRA: [
    _seg(['EN TRAMITE', 'CITADO A AUDIENCIA', 'EN AUDIENCIA', 'TRANSACCION', 'RESERVA ASEGURADORA', 'PAGO', 'CERRADA']),
    { col: 'CONTRA FECHA AUDIENCIA', label: 'Fecha de audiencia', tipo: 'date', destacado: true },
    { col: 'CONTRA RESULTADO', label: 'Resultado', tipo: 'select', op: ['EN TRAMITE', 'TRANSACCION', 'RESERVA ASEGURADORA', 'PAGO'] },
    { col: 'CONTRA MONTO', label: 'Reserva / pago ($)', tipo: 'text' },
    { col: 'CONTRA CONTROL', label: 'Control del proceso', tipo: 'textarea' }
  ],
  LESIONES: [
    _seg(['CITADO A AUDIENCIA', 'EN AUDIENCIA', 'FALLO', 'RESERVA / PAGO', 'CERRADA']),
    { col: 'LESIONES FECHA AUDIENCIA', label: 'Fecha de audiencia', tipo: 'date', destacado: true },
    { col: 'LESIONES HORA AUDIENCIA', label: 'Hora de audiencia', tipo: 'time' },
    { col: 'LESIONES FALLO', label: 'Fallo', tipo: 'text' },
    { col: 'LESIONES POSIBLE RECLAMACION', label: '¿Posible reclamación?', tipo: 'select', op: ['SI', 'NO', 'POR DEFINIR'] },
    { col: 'LESIONES MONTO', label: 'Reserva / pago ($)', tipo: 'text' },
    { col: 'LESIONES CONTROL', label: 'Control del proceso', tipo: 'textarea' }
  ],
  PREJUDICIAL: [
    _seg(['CITACION', 'AUDIENCIA PREJUDICIAL', 'PROCESO PENAL', 'DEMANDA', 'CERRADA']),
    { col: 'PREJUDICIALES FECHA AUDIENCIA', label: 'Fecha de audiencia', tipo: 'date', destacado: true },
    { col: 'PREJUDICIALES CONTROL', label: 'Control del proceso', tipo: 'textarea' }
  ],
  V2251: [
    _seg(['EN TRAMITE', 'TRANSACCION', 'RESERVA ASEGURADORA', 'PAGO', 'CERRADA']),
    { col: '2251 FECHA AUDIENCIA', label: 'Fecha de audiencia', tipo: 'date', destacado: true },
    { col: '2251 RESULTADO', label: 'Cierre por', tipo: 'select', op: ['EN TRAMITE', 'TRANSACCION', 'RESERVA ASEGURADORA', 'PAGO'] },
    { col: '2251 MONTO', label: 'Reserva / pago ($)', tipo: 'text' },
    { col: '2251 CONTROL', label: 'Control del proceso', tipo: 'textarea' }
  ],
  CERRADO: [
    { col: 'CIERRE MOTIVO', label: 'Tipo de cierre', tipo: 'select', op: ['TRANSACCION', 'DESISTIMIENTO', 'MUTUO ACUERDO', 'OTRO'] },
    { col: 'CIERRE OBSERVACION', label: 'Observación del cierre', tipo: 'textarea' }
  ]
};

/** id de input seguro a partir del nombre de la columna. */
function _gid(col) { return 'g_' + String(col).replace(/[^a-zA-Z0-9]+/g, '_'); }

/** HTML de un campo editable de gestión, con su valor actual. */
function inputGestionHTML(c, d) {
  const val = d[c.col] == null ? '' : String(d[c.col]);
  const id = _gid(c.col);
  const cls = 'cat-g-field' + (c.destacado ? ' cat-g-destacado' : '') + (c.tipo === 'textarea' ? ' cat-g-ancho' : '');
  let control;
  if (c.tipo === 'select') {
    control = `<select id="${id}"><option value="">—</option>` +
      c.op.map(o => `<option${o === val ? ' selected' : ''}>${escSv(o)}</option>`).join('') + '</select>';
  } else if (c.tipo === 'textarea') {
    control = `<textarea id="${id}" rows="2">${escSv(val)}</textarea>`;
  } else {
    const t = (c.tipo === 'date' || c.tipo === 'time') ? c.tipo : 'text';
    control = `<input id="${id}" type="${t}" value="${escSv(val)}">`;
  }
  return `<div class="${cls}"><label>${escSv(c.label)}${c.destacado ? ' <span class="cat-g-tag">audiencia</span>' : ''}</label>${control}</div>`;
}

/** Lee los campos de gestión del modal para la categoría dada. */
function leerGestion(catKey) {
  const campos = CAMPOS_GESTION[catKey] || [];
  const out = {};
  campos.forEach(c => {
    const el = document.getElementById(_gid(c.col));
    if (el) out[c.col] = el.value;
  });
  return out;
}

/**
 * Guarda los campos de gestión del caso por su `id` (llave primaria, presente
 * en todos los casos, con o sin número). Lectura-modificación-escritura: no
 * pisa otros campos del JSONB.
 */
async function guardarGestionCaso(caso, nuevos, mutar) {
  const { data, error } = await db
    .from('registro_asistencias').select('datos').eq('id', caso.id).maybeSingle();
  if (error) throw error;
  const datos = (data && data.datos) ? data.datos : (caso.datos || {});
  if (nuevos) Object.keys(nuevos).forEach(k => { datos[k] = nuevos[k]; });
  if (typeof mutar === 'function') mutar(datos); // p. ej. anexar a un arreglo
  const { error: e2 } = await db
    .from('registro_asistencias').update({ datos }).eq('id', caso.id);
  if (e2) throw e2;
  caso.datos = datos; // refresca la copia local
}

/* ------------------------------------------------------------------ *
 *  Estado general (finalización) + días en proceso.
 * ------------------------------------------------------------------ */

/** Parsea una fecha de texto (ISO o M/D/AAAA) a Date, o null. */
function _parseFechaSv(s) {
  if (!s) return null;
  const d = new Date(String(s).trim());
  return isNaN(d.getTime()) ? null : d;
}

/** Días que lleva el caso en proceso (del siniestro a hoy, o a la finalización). */
function diasEnProceso(caso) {
  const d = caso.datos || {};
  const start = _parseFechaSv(d['FECHA DEL SINIESTRO']) || (caso.creado_en ? new Date(caso.creado_en) : null);
  if (!start || isNaN(start.getTime())) return null;
  const finalizado = String(d['ESTADO GENERAL'] || '').toUpperCase() === 'FINALIZADO';
  const fin = (finalizado && _parseFechaSv(d['FECHA FINALIZACION'])) || new Date();
  const dias = Math.floor((fin.getTime() - start.getTime()) / 86400000);
  return dias >= 0 ? dias : 0;
}

/** Cabecera: estado general (En trámite / Finalizado) + días en proceso. */
function estadoGeneralHTML(caso) {
  const d = caso.datos || {};
  const est = String(d['ESTADO GENERAL'] || '').toUpperCase();
  const finalizado = est === 'FINALIZADO';
  const dias = diasEnProceso(caso);
  const diasTxt = dias == null ? '—' : (dias + (dias === 1 ? ' día' : ' días'));
  return `
    <div class="cat-g-cab">
      <div class="cat-g-field">
        <label>Estado general del caso</label>
        <select id="g_ESTADO_GENERAL">
          <option value="EN TRAMITE"${!finalizado ? ' selected' : ''}>En trámite</option>
          <option value="FINALIZADO"${finalizado ? ' selected' : ''}>Finalizado</option>
        </select>
      </div>
      <div class="cat-g-dias ${finalizado ? 'fin' : 'trm'}">
        <span class="cat-g-dias-n">${escSv(diasTxt)}</span>
        <span class="cat-g-dias-l">${finalizado ? 'hasta el cierre' : 'en proceso'}</span>
      </div>
    </div>`;
}

/** Selector de categoría (override manual). '' = automática. */
function categoriaSelectorHTML(caso) {
  const d = caso.datos || {};
  const manual = String(d['CATEGORIA MANUAL'] || '').toUpperCase();
  const auto = _clasificarAuto(d);
  let opts = `<option value="">Automática (${escSv(catLabel(auto))})</option>`;
  SV_CATS.forEach(c => {
    opts += `<option value="${c.key}"${manual === c.key ? ' selected' : ''}>${escSv(c.label)}</option>`;
  });
  return `<div class="cat-g-field cat-g-ancho">
    <label>Categoría del caso <span class="cat-g-tag" style="color:#4338ca;background:#eef2ff;border-color:#c7d2fe">clasificar</span></label>
    <select id="g_CATEGORIA_MANUAL">${opts}</select>
  </div>`;
}

/* ------------------------------------------------------------------ *
 *  Adjuntos de gestión (PDF / imágenes) — bucket documentos-casos.
 * ------------------------------------------------------------------ */
const SV_MIME_OK = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/** Bloque de adjuntos (botón + lista). */
function adjuntosHTML() {
  return `
    <div class="cat-g-adj">
      <div class="cat-g-adj-top">
        <span class="cat-g-adj-tit">📎 Adjuntos (PDF o imagen) · audiencia y evidencia</span>
        <button type="button" class="secondary" id="catAdjBtn">Adjuntar</button>
        <input type="file" id="catAdjInput" accept="application/pdf,image/jpeg,image/png,image/webp" multiple hidden>
      </div>
      <div id="catAdjLista" class="cat-g-adj-lista"></div>
    </div>`;
}

/** Pinta la lista de adjuntos del caso. */
function renderAdjuntos(caso) {
  const cont = document.getElementById('catAdjLista');
  if (!cont) return;
  const lista = Array.isArray(caso.datos && caso.datos['DOCUMENTOS RUTA']) ? caso.datos['DOCUMENTOS RUTA'] : [];
  if (!lista.length) { cont.innerHTML = '<span class="cat-g-adj-vacio">Sin adjuntos todavía.</span>'; return; }
  cont.innerHTML = lista.map(doc => {
    const ico = /\.(jpg|jpeg|png|webp)$/i.test(doc.nombre || doc.ruta || '') ? '🖼️' : '📄';
    return `<span class="cat-g-adj-item">${ico}
      <button type="button" class="cat-g-adj-ver" data-ruta="${escSv(doc.ruta)}">${escSv(doc.nombre || 'archivo')}</button>
      <button type="button" class="cat-g-adj-del" data-ruta="${escSv(doc.ruta)}" title="Quitar">✕</button></span>`;
  }).join('');
}

/** Sube archivos y los anexa a DOCUMENTOS RUTA (por id, sin pisar). */
async function subirAdjuntoGestion(caso, files) {
  for (const file of files) {
    if (file.type && !SV_MIME_OK.includes(file.type)) { showStatus(`Tipo no permitido: ${file.name}`, 'error'); continue; }
    const safe = String(file.name).replace(/[^a-zA-Z0-9._-]+/g, '_');
    const ruta = `${caso.id}/gestion/${Date.now()}_${safe}`;
    const { error } = await db.storage.from(BUCKET_DOCS).upload(ruta, file, { contentType: file.type || 'application/pdf', upsert: false });
    if (error) throw error;
    const nuevo = { ruta, nombre: file.name };
    await guardarGestionCaso(caso, null, datos => {
      const l = Array.isArray(datos['DOCUMENTOS RUTA']) ? datos['DOCUMENTOS RUTA'] : [];
      datos['DOCUMENTOS RUTA'] = l.concat([nuevo]);
    });
  }
}

/** Abre un adjunto en una pestaña nueva (URL firmada). */
async function verAdjuntoGestion(ruta) {
  const { data } = await db.storage.from(BUCKET_DOCS).createSignedUrl(ruta, 3600);
  if (data && data.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  else showStatus('No se pudo abrir el archivo.', 'error');
}

/** Quita un adjunto (del storage y de la lista). */
async function eliminarAdjuntoGestion(caso, ruta) {
  try { await db.storage.from(BUCKET_DOCS).remove([ruta]); } catch (e) { /* ignora */ }
  await guardarGestionCaso(caso, null, datos => {
    datos['DOCUMENTOS RUTA'] = (Array.isArray(datos['DOCUMENTOS RUTA']) ? datos['DOCUMENTOS RUTA'] : []).filter(x => x.ruta !== ruta);
  });
}

/* ------------------------------------------------------------------ *
 *  Modal: informe detallado del caso.
 * ------------------------------------------------------------------ */

// Grupos de campos del informe (label visible → clave en datos).
const SV_INFORME = [
  ['Vehículo', [
    ['PLACA VEHICULO', 'Placa'], ['NUMERO INTERNO VEHICULO', 'Interno'], ['TIPO DE VEHICULO', 'Tipo'],
    ['PROPIETARIO', 'Propietario'], ['ASEGURADORA', 'Aseguradora']
  ]],
  ['Conductor', [
    ['NOMBRE CONDUCTOR', 'Nombre'], ['CEDULA DEL CONDUCTOR', 'Cédula']
  ]],
  ['Siniestro', [
    ['FECHA DEL SINIESTRO', 'Fecha'], ['HORA DEL SINIESTRO', 'Hora'],
    ['DIRECCION DEL LUGAR DEL SINIESTRO', 'Dirección'], ['RUTA', 'Ruta'],
    ['GRAVEDAD DEL SINIESTRO', 'Gravedad'], ['CATEGORIZACION DEL INCIDENTE', 'Categorización'],
    ['LESIONADOS', 'Lesionados'], ['RESPONSABILIDAD DEL CONDUCTOR', 'Responsabilidad'],
    ['ESTADO DEL SINIESTRO', 'Estado del siniestro']
  ]],
  ['Hipótesis', [
    ['HIPOTESIS', 'Hipótesis'], ['ATRIBUCION HIPOTESIS', 'Atribución']
  ]],
  ['Observaciones', [
    ['OBSERVACIONES', 'Observaciones']
  ]]
];

/** Construye/asegura el contenedor del modal. */
function svModalEl() {
  let m = document.getElementById('catModal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'catModal';
    m.className = 'cat-modal hidden';
    m.innerHTML = '<div class="cat-modal-bg"></div><div class="cat-modal-card" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(m);
    m.querySelector('.cat-modal-bg').addEventListener('click', cerrarModalCaso);
  }
  return m;
}

/** Abre el modal con el informe detallado del caso. */
function abrirModalCaso(caso) {
  const d = caso.datos || {};
  const cat = SV_CAT_POR_KEY[caso._cat] || { label: 'Sin clasificar', cls: 'cat-sin' };

  let cuerpo = '';
  SV_INFORME.forEach(([titulo, campos]) => {
    const items = campos
      .filter(([k]) => String(d[k] == null ? '' : d[k]).trim() !== '')
      .map(([k, lab]) => `<div class="cat-inf-item"><span class="cat-inf-lab">${escSv(lab)}</span><span class="cat-inf-val">${escSv(d[k])}</span></div>`)
      .join('');
    if (items) cuerpo += `<div class="cat-inf-grupo"><h4>${escSv(titulo)}</h4><div class="cat-inf-grid">${items}</div></div>`;
  });
  if (!cuerpo) cuerpo = '<div class="muted">Este caso no tiene datos para mostrar.</div>';

  // Sección editable: los "campos directos" del área para gestionar el proceso.
  // Se muestra SIEMPRE (incluso "Sin clasificar") para poder clasificar a mano.
  const campos = CAMPOS_GESTION[caso._cat];
  const tituloCat = caso._cat === 'SIN' ? '' : ' · ' + escSv(cat.label);
  const gridCampos = (campos && campos.length)
    ? `<div class="cat-g-grid">${campos.map(c => inputGestionHTML(c, d)).join('')}</div>`
    : '<div class="cat-g-hint">Elige una categoría arriba y guarda; luego aparecen sus campos (audiencia, seguimiento, etc.).</div>';
  const gestion = `<div class="cat-inf-grupo cat-g-grupo">
    <h4>✍️ Gestión del proceso${tituloCat}</h4>
    ${categoriaSelectorHTML(caso)}
    ${estadoGeneralHTML(caso)}
    ${gridCampos}
    ${adjuntosHTML()}
  </div>`;

  const m = svModalEl();
  const card = m.querySelector('.cat-modal-card');
  card.innerHTML = `
    <div class="cat-modal-head">
      <div>
        <div class="cat-modal-num">${escSv(caso.numero_caso || 'Caso')}</div>
        <div class="cat-modal-sub">${escSv(d['EMPRESA'] || '')} · ${escSv(d['PLACA VEHICULO'] || '')}${caso._terceros ? ' · 👥 ' + caso._terceros + ' tercero' + (caso._terceros === 1 ? '' : 's') : ''}</div>
      </div>
      <span class="cat-chip ${cat.cls}">${escSv(cat.label)}</span>
      <button type="button" class="cat-modal-x" id="catModalX" aria-label="Cerrar">✕</button>
    </div>
    <div class="cat-modal-body">${gestion}${cuerpo}</div>
    <div class="cat-modal-foot">
      <span class="cat-modal-msg" id="catModalMsg"></span>
      <button type="button" class="secondary" id="catModalCerrar">Cerrar</button>
      <button type="button" class="success" id="catModalGuardar">Guardar gestión</button>
      <button type="button" class="secondary" id="catModalAbrir">📄 Informe completo →</button>
    </div>`;

  card.querySelector('#catModalX').addEventListener('click', cerrarModalCaso);
  card.querySelector('#catModalCerrar').addEventListener('click', cerrarModalCaso);
  card.querySelector('#catModalAbrir').addEventListener('click', () => abrirInformeCompleto(caso));

  const btnG = card.querySelector('#catModalGuardar');
  if (btnG) {
    btnG.addEventListener('click', async () => {
      const msg = card.querySelector('#catModalMsg');
      btnG.disabled = true;
      if (msg) { msg.textContent = 'Guardando…'; msg.className = 'cat-modal-msg'; }
      try {
        const catAntes = caso._cat;
        const nuevos = leerGestion(caso._cat);
        // Categoría manual (override del área). '' = automática (limpia el override).
        const catManual = document.getElementById('g_CATEGORIA_MANUAL');
        if (catManual) nuevos['CATEGORIA MANUAL'] = catManual.value;
        // Estado general + fecha de finalización (para contar los días).
        const estG = document.getElementById('g_ESTADO_GENERAL');
        if (estG) {
          nuevos['ESTADO GENERAL'] = estG.value;
          const yaFin = caso.datos && caso.datos['FECHA FINALIZACION'];
          if (estG.value === 'FINALIZADO') {
            if (!yaFin) nuevos['FECHA FINALIZACION'] = new Date().toISOString().slice(0, 10);
          } else {
            nuevos['FECHA FINALIZACION'] = '';
          }
        }
        await guardarGestionCaso(caso, nuevos);
        // Reclasifica (categoría manual o finalización pueden cambiarla) y refresca la tabla.
        caso._cat = clasificarCaso(caso.datos);
        renderSegvial();
        if (msg) { msg.textContent = '✓ Guardado'; msg.className = 'cat-modal-msg ok'; }
        // Si cambió de categoría, reabre el modal con los campos de la nueva.
        if (caso._cat !== catAntes) { abrirModalCaso(caso); return; }
        // Refresca la cabecera de días/estado con lo recién guardado.
        const cab = card.querySelector('.cat-g-cab');
        if (cab) cab.outerHTML = estadoGeneralHTML(caso);
      } catch (e) {
        if (msg) { msg.textContent = 'Error al guardar: ' + (e.message || e); msg.className = 'cat-modal-msg err'; }
      } finally {
        btnG.disabled = false;
      }
    });
  }

  // Adjuntos: abrir selector, subir, ver y quitar.
  const inp = card.querySelector('#catAdjInput');
  const btnA = card.querySelector('#catAdjBtn');
  if (btnA && inp) {
    btnA.addEventListener('click', () => inp.click());
    inp.addEventListener('change', async () => {
      const files = [...inp.files];
      inp.value = '';
      if (!files.length) return;
      const msg = card.querySelector('#catModalMsg');
      if (msg) { msg.textContent = 'Subiendo adjunto(s)…'; msg.className = 'cat-modal-msg'; }
      try {
        await subirAdjuntoGestion(caso, files);
        renderAdjuntos(caso);
        if (msg) { msg.textContent = '✓ Adjunto(s) guardado(s)'; msg.className = 'cat-modal-msg ok'; }
      } catch (e) {
        if (msg) { msg.textContent = 'Error al adjuntar: ' + (e.message || e); msg.className = 'cat-modal-msg err'; }
      }
    });
  }
  const listaAdj = card.querySelector('#catAdjLista');
  if (listaAdj) {
    listaAdj.addEventListener('click', async ev => {
      const ver = ev.target.closest('.cat-g-adj-ver');
      if (ver) { verAdjuntoGestion(ver.dataset.ruta); return; }
      const del = ev.target.closest('.cat-g-adj-del');
      if (del && confirm('¿Quitar este adjunto?')) {
        try { await eliminarAdjuntoGestion(caso, del.dataset.ruta); renderAdjuntos(caso); }
        catch (e) { showStatus('No se pudo quitar: ' + (e.message || e), 'error'); }
      }
    });
  }
  renderAdjuntos(caso);

  m.classList.remove('hidden');
  document.body.classList.add('cat-modal-open');
}

/** Cierra el modal del informe. */
function cerrarModalCaso() {
  const m = document.getElementById('catModal');
  if (m) m.classList.add('hidden');
  document.body.classList.remove('cat-modal-open');
}

/* ------------------------------------------------------------------ *
 *  Informe COMPLETO del caso (todo: datos + terceros + evidencias).
 * ------------------------------------------------------------------ */

/** Ítems de un grid de "etiqueta → valor" (solo campos con valor). */
function _infoGrid(d, campos) {
  return campos
    .filter(([k]) => String(d[k] == null ? '' : d[k]).trim() !== '')
    .map(([k, lab]) => `<div class="cat-inf-item"><span class="cat-inf-lab">${escSv(lab)}</span><span class="cat-inf-val">${escSv(d[k])}</span></div>`)
    .join('');
}

/** Miniatura de una evidencia de imagen (se llena con URL firmada async). */
function _thumb(bucket, ruta, label) {
  return `<a class="ev-thumb" target="_blank" rel="noopener" title="${escSv(label)}"><img data-bucket="${escSv(bucket)}" data-ruta="${escSv(ruta)}" loading="lazy" alt="${escSv(label)}"><span>${escSv(label)}</span></a>`;
}

/** Carga las URLs firmadas de las miniaturas ya pintadas. */
async function _cargarThumbs(cont) {
  const imgs = cont.querySelectorAll('img[data-bucket][data-ruta]');
  for (const im of imgs) {
    try {
      const { data } = await db.storage.from(im.dataset.bucket).createSignedUrl(im.dataset.ruta, 3600);
      if (data && data.signedUrl) { im.src = data.signedUrl; if (im.parentElement) im.parentElement.href = data.signedUrl; }
    } catch (e) { /* sin url */ }
  }
}

/** Abre una evidencia (cualquier bucket) en pestaña nueva con URL firmada. */
async function _verEvidencia(bucket, ruta) {
  try {
    const { data } = await db.storage.from(bucket).createSignedUrl(ruta, 3600);
    if (data && data.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
    else showStatus('No se pudo abrir la evidencia.', 'error');
  } catch (e) { showStatus('No se pudo abrir la evidencia.', 'error'); }
}

/** Bloque de evidencias (fotos, croquis, firmas, documentos, audio). */
function _evidenciasHTML(d) {
  const fotos = Array.isArray(d['FOTOS SITIO']) ? d['FOTOS SITIO'] : [];
  const firmas = [['FIRMA CONDUCTOR', 'Firma conductor'], ['FIRMA ASISTENTE EN SITIO', 'Firma asistente']].filter(([k]) => d[k]);
  const croquis = d['CROQUIS'];
  const docs = Array.isArray(d['DOCUMENTOS RUTA']) ? d['DOCUMENTOS RUTA'] : [];
  const audios = [['VERSION CONDUCTOR AUDIO', 'Audio conductor'], ['VERSION ASISTENTE AUDIO', 'Audio asistente']].filter(([k]) => d[k]);
  if (!fotos.length && !firmas.length && !croquis && !docs.length && !audios.length) return '';

  let thumbs = '';
  fotos.forEach((ruta, i) => { thumbs += _thumb('fotos-casos', ruta, 'Foto ' + (i + 1)); });
  if (croquis) thumbs += _thumb('fotos-casos', croquis, 'Croquis');
  firmas.forEach(([k, lab]) => { thumbs += _thumb('fotos-casos', d[k], lab); });

  let chips = '';
  docs.forEach(doc => { chips += `<button type="button" class="cat-g-adj-ver ev-ver" data-bucket="documentos-casos" data-ruta="${escSv(doc.ruta)}">📄 ${escSv(doc.nombre || 'documento')}</button>`; });
  audios.forEach(([k, lab]) => { chips += `<button type="button" class="cat-g-adj-ver ev-ver" data-bucket="versiones-audio" data-ruta="${escSv(d[k])}">🔊 ${escSv(lab)}</button>`; });

  return `<div class="cat-inf-grupo"><h4>Evidencias</h4>
    ${thumbs ? `<div class="ev-thumbs">${thumbs}</div>` : ''}
    ${chips ? `<div class="ev-chips">${chips}</div>` : ''}
  </div>`;
}

/** Pinta los terceros del caso en el informe. */
function renderTercerosInforme(terceros) {
  const cont = document.getElementById('catInfTerceros');
  if (!cont) return;
  const campos = (typeof TERCERO_CAMPOS !== 'undefined') ? TERCERO_CAMPOS : [];
  if (!terceros.length) {
    cont.innerHTML = '<div class="cat-inf-grupo"><h4>Terceros involucrados</h4><div class="muted">Sin terceros registrados.</div></div>';
    return;
  }
  let html = `<div class="cat-inf-grupo"><h4>Terceros involucrados (${terceros.length})</h4>`;
  terceros.forEach(t => {
    const td = t.datos || {};
    const nombre = td['NOMBRE COMPLETO'] || td['TIPO DE TERCERO'] || 'Tercero';
    const items = _infoGrid(td, campos);
    html += `<div class="ev-tercero"><div class="ev-tercero-nom">👤 ${escSv(nombre)}${td['TIPO DE TERCERO'] ? ' · ' + escSv(td['TIPO DE TERCERO']) : ''}</div><div class="cat-inf-grid">${items || '<span class="muted">Sin datos.</span>'}</div></div>`;
  });
  html += '</div>';
  cont.innerHTML = html;
}

/** Abre el INFORME COMPLETO del caso (todos los datos, terceros y evidencias). */
async function abrirInformeCompleto(caso) {
  const d = caso.datos || {};
  const cat = SV_CAT_POR_KEY[caso._cat] || { label: 'Sin clasificar', cls: 'cat-sin' };
  const m = svModalEl();
  const card = m.querySelector('.cat-modal-card');

  card.innerHTML = `
    <div class="cat-modal-head">
      <div>
        <div class="cat-modal-num">${escSv(caso.numero_caso || 'Caso')} · Informe completo</div>
        <div class="cat-modal-sub">${escSv(d['EMPRESA'] || '')} · ${escSv(d['PLACA VEHICULO'] || '')}</div>
      </div>
      <span class="cat-chip ${cat.cls}">${escSv(cat.label)}</span>
      <button type="button" class="cat-modal-x" id="catModalX" aria-label="Cerrar">✕</button>
    </div>
    <div class="cat-modal-body" id="catInfBody"><div class="muted">Cargando informe…</div></div>
    <div class="cat-modal-foot">
      <button type="button" class="secondary" id="catInfVolver">← Volver a gestión</button>
      <button type="button" class="success" id="catInfPdf">🖨️ Descargar PDF</button>
      <button type="button" class="secondary" id="catModalCerrar">Cerrar</button>
    </div>`;
  card.querySelector('#catModalX').addEventListener('click', cerrarModalCaso);
  card.querySelector('#catModalCerrar').addEventListener('click', cerrarModalCaso);
  card.querySelector('#catInfVolver').addEventListener('click', () => abrirModalCaso(caso));
  card.querySelector('#catInfPdf').addEventListener('click', () => exportarInformePDF(caso));
  m.classList.remove('hidden');
  document.body.classList.add('cat-modal-open');

  // Secciones de datos (reutiliza las de detalle.js).
  let html = '';
  const secciones = (typeof DETALLE_SECCIONES !== 'undefined') ? DETALLE_SECCIONES : [];
  secciones.forEach(sec => {
    const items = _infoGrid(d, sec.campos);
    if (items) html += `<div class="cat-inf-grupo"><h4>${escSv(sec.titulo)}</h4><div class="cat-inf-grid">${items}</div></div>`;
  });

  // Seguimiento / gestión del área (solo lectura).
  const gcampos = CAMPOS_GESTION[caso._cat] || [];
  const gItems = _infoGrid(d, gcampos.map(c => [c.col, c.label]))
    + _infoGrid(d, [['ESTADO GENERAL', 'Estado general'], ['FECHA FINALIZACION', 'Fecha de finalización']]);
  if (gItems) html += `<div class="cat-inf-grupo"><h4>Seguimiento del proceso · ${escSv(cat.label)}</h4><div class="cat-inf-grid">${gItems}</div></div>`;

  // Otros datos: todo lo que no se mostró y no es evidencia/interno.
  const vistos = new Set();
  secciones.forEach(s => s.campos.forEach(([k]) => vistos.add(k)));
  gcampos.forEach(c => vistos.add(c.col));
  ['ESTADO GENERAL', 'FECHA FINALIZACION', 'CATEGORIA MANUAL', 'NOTIF DOCS', 'RUTA CIERRE', 'RESPONSABLE RUTA',
    'FOTOS SITIO', 'CROQUIS', 'FIRMA CONDUCTOR', 'FIRMA ASISTENTE EN SITIO', 'DOCUMENTOS RUTA'].forEach(k => vistos.add(k));
  const otros = Object.keys(d).filter(k =>
    !vistos.has(k) && typeof d[k] !== 'object' && String(d[k]).trim() !== ''
    && !/foto|firma|croquis|audio|key$|^key| ts$|_ts$/i.test(k));
  if (otros.length) {
    const items = otros.map(k => `<div class="cat-inf-item"><span class="cat-inf-lab">${escSv(k)}</span><span class="cat-inf-val">${escSv(d[k])}</span></div>`).join('');
    html += `<div class="cat-inf-grupo"><h4>Otros datos</h4><div class="cat-inf-grid">${items}</div></div>`;
  }

  // Evidencias + placeholder de terceros.
  html += _evidenciasHTML(d);
  html += '<div id="catInfTerceros"><div class="cat-inf-grupo"><h4>Terceros involucrados</h4><div class="muted">Cargando…</div></div></div>';

  const body = card.querySelector('#catInfBody');
  body.innerHTML = html;

  // Miniaturas (async), clic en evidencias y terceros.
  _cargarThumbs(body);
  body.addEventListener('click', ev => {
    const b = ev.target.closest('.ev-ver');
    if (b) _verEvidencia(b.dataset.bucket, b.dataset.ruta);
  });
  try {
    const { data: terceros } = await db.from('registro_terceros').select('datos').eq('key', caso.key);
    renderTercerosInforme(terceros || []);
  } catch (e) {
    const t = document.getElementById('catInfTerceros');
    if (t) t.innerHTML = '<div class="cat-inf-grupo"><h4>Terceros involucrados</h4><div class="muted">No se pudieron cargar.</div></div>';
  }
}

/* ------------------------------------------------------------------ *
 *  Exportar el informe completo a PDF (documento imprimible limpio).
 *  Abre una ventana con HTML optimizado para impresión y lanza el
 *  diálogo "Guardar como PDF" del navegador. Texto seleccionable,
 *  con fotos/croquis/firmas y terceros. No usa librerías externas.
 * ------------------------------------------------------------------ */

/** Colores del chip de categoría en el PDF [fondo, texto]. */
const SV_PDF_CAT_COLOR = {
  A_FAVOR: ['#e7f6ec', '#137a37'], EN_CONTRA: ['#fdeaea', '#b91c1c'],
  LESIONES: ['#fef3c7', '#b45309'], PREJUDICIAL: ['#fde8ef', '#be185d'],
  V2251: ['#e7f2ff', '#1d4ed8'], CERRADO: ['#eef2f7', '#475569'], SIN: ['#f1f5f9', '#64748b']
};

/** Estilos del documento PDF (impresión A4). */
const SV_PDF_CSS = `
*{box-sizing:border-box;}
body{font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#1e293b;margin:0;background:#fff;}
.doc{max-width:820px;margin:0 auto;padding:26px 30px;}
.rep-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1e3a8a;padding-bottom:12px;}
.rep-brand{font-size:21px;font-weight:800;color:#1e3a8a;letter-spacing:.5px;}
.rep-brand small{display:block;font-size:11px;font-weight:600;color:#64748b;letter-spacing:.02em;margin-top:2px;}
.rep-meta{text-align:right;font-size:12px;color:#475569;line-height:1.5;}
.rep-cat{display:inline-block;margin-top:6px;padding:3px 12px;border-radius:999px;font-size:12px;font-weight:800;}
.rep-title{font-size:16px;font-weight:800;margin:14px 0 2px;color:#0f172a;}
.rep-sub{font-size:13px;color:#475569;margin-bottom:6px;}
.sec{margin:16px 0;page-break-inside:avoid;}
.sec>h3{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#1e3a8a;border-left:4px solid #1e3a8a;padding-left:8px;margin:0 0 8px;}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:0 26px;}
.item{padding:5px 0;border-bottom:1px dotted #e2e8f0;}
.item .lab{display:block;font-size:9.5px;font-weight:700;text-transform:uppercase;color:#94a3b8;letter-spacing:.03em;}
.item .val{font-size:13px;color:#0f172a;}
.terc{border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin-bottom:8px;page-break-inside:avoid;}
.terc .tnom{font-weight:800;font-size:13px;margin-bottom:4px;color:#1e3a8a;}
.fotos{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
.fotos figure{margin:0;page-break-inside:avoid;}
.fotos img{width:100%;height:130px;object-fit:cover;border:1px solid #cbd5e1;border-radius:6px;background:#f1f5f9;}
.fotos figcaption{font-size:10px;color:#64748b;text-align:center;margin-top:2px;}
.rep-foot{margin-top:24px;border-top:1px solid #e2e8f0;padding-top:10px;font-size:10px;color:#94a3b8;text-align:center;}
@page{size:A4;margin:13mm;}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
`;

/** Firma una lista de imágenes [{bucket,ruta,label}] → agrega .url. */
async function _firmarLista(items) {
  const out = [];
  for (const it of items) {
    try {
      const { data } = await db.storage.from(it.bucket).createSignedUrl(it.ruta, 3600);
      if (data && data.signedUrl) out.push(Object.assign({}, it, { url: data.signedUrl }));
    } catch (e) { /* omite la que falle */ }
  }
  return out;
}

/** Espera a que carguen las imágenes de una ventana (o hasta `ms` ms). */
function _esperarImgs(win, ms) {
  return new Promise(res => {
    const t0 = Date.now();
    (function check() {
      let imgs;
      try { imgs = Array.prototype.slice.call(win.document.images || []); }
      catch (e) { return res(); }
      const pend = imgs.filter(i => !i.complete).length;
      if (!pend || Date.now() - t0 > ms) return res();
      setTimeout(check, 150);
    })();
  });
}

/** Grid etiqueta→valor con clases del PDF (solo campos con valor). */
function _pdfGrid(d, campos) {
  return campos
    .filter(([k]) => String(d[k] == null ? '' : d[k]).trim() !== '')
    .map(([k, lab]) => `<div class="item"><span class="lab">${escSv(lab)}</span><span class="val">${escSv(d[k])}</span></div>`)
    .join('');
}

/** Genera y abre el informe del caso como PDF imprimible. */
async function exportarInformePDF(caso) {
  // Abrir la ventana YA (dentro del gesto del clic) para no gatillar el bloqueo de pop-ups.
  const win = window.open('', '_blank');
  if (!win) { showStatus('Permite las ventanas emergentes para descargar el PDF.', 'error'); return; }
  win.document.write('<!doctype html><meta charset="utf-8"><title>Generando informe…</title><body style="font-family:sans-serif;padding:40px;color:#475569">Generando el informe, un momento…</body>');

  try {
    const d = caso.datos || {};
    const cat = SV_CAT_POR_KEY[caso._cat] || { label: 'Sin clasificar' };
    const secciones = (typeof DETALLE_SECCIONES !== 'undefined') ? DETALLE_SECCIONES : [];

    // 1) Secciones de datos.
    let secHTML = '';
    secciones.forEach(sec => {
      const items = _pdfGrid(d, sec.campos);
      if (items) secHTML += `<div class="sec"><h3>${escSv(sec.titulo)}</h3><div class="grid">${items}</div></div>`;
    });

    // 2) Seguimiento del proceso (gestión del área).
    const gcampos = CAMPOS_GESTION[caso._cat] || [];
    const gItems = _pdfGrid(d, gcampos.map(c => [c.col, c.label]))
      + _pdfGrid(d, [['ESTADO GENERAL', 'Estado general'], ['FECHA FINALIZACION', 'Fecha de finalización']]);
    if (gItems) secHTML += `<div class="sec"><h3>Seguimiento del proceso · ${escSv(cat.label)}</h3><div class="grid">${gItems}</div></div>`;

    // 3) Otros datos no cubiertos.
    const vistos = new Set();
    secciones.forEach(s => s.campos.forEach(([k]) => vistos.add(k)));
    gcampos.forEach(c => vistos.add(c.col));
    ['ESTADO GENERAL', 'FECHA FINALIZACION', 'CATEGORIA MANUAL', 'NOTIF DOCS', 'RUTA CIERRE', 'RESPONSABLE RUTA',
      'FOTOS SITIO', 'CROQUIS', 'FIRMA CONDUCTOR', 'FIRMA ASISTENTE EN SITIO', 'DOCUMENTOS RUTA'].forEach(k => vistos.add(k));
    const otros = Object.keys(d).filter(k =>
      !vistos.has(k) && typeof d[k] !== 'object' && String(d[k]).trim() !== ''
      && !/foto|firma|croquis|audio|key$|^key| ts$|_ts$/i.test(k));
    if (otros.length) {
      secHTML += `<div class="sec"><h3>Otros datos</h3><div class="grid">${otros.map(k => `<div class="item"><span class="lab">${escSv(k)}</span><span class="val">${escSv(d[k])}</span></div>`).join('')}</div></div>`;
    }

    // 4) Terceros involucrados.
    try {
      const { data: terceros } = await db.from('registro_terceros').select('datos').eq('key', caso.key);
      const tcampos = (typeof TERCERO_CAMPOS !== 'undefined') ? TERCERO_CAMPOS : [];
      if (terceros && terceros.length) {
        let t = '';
        terceros.forEach(tc => {
          const td = tc.datos || {};
          const nombre = td['NOMBRE COMPLETO'] || td['TIPO DE TERCERO'] || 'Tercero';
          const items = _pdfGrid(td, tcampos);
          t += `<div class="terc"><div class="tnom">👤 ${escSv(nombre)}${td['TIPO DE TERCERO'] ? ' · ' + escSv(td['TIPO DE TERCERO']) : ''}</div><div class="grid">${items || '<span class="val">Sin datos.</span>'}</div></div>`;
        });
        secHTML += `<div class="sec"><h3>Terceros involucrados (${terceros.length})</h3>${t}</div>`;
      }
    } catch (e) { /* sigue sin terceros */ }

    // 5) Documentos adjuntos (listado).
    const docs = Array.isArray(d['DOCUMENTOS RUTA']) ? d['DOCUMENTOS RUTA'] : [];
    if (docs.length) {
      secHTML += `<div class="sec"><h3>Documentos adjuntos (${docs.length})</h3><div class="grid">${docs.map(x => `<div class="item"><span class="val">📄 ${escSv(x.nombre || 'documento')}</span></div>`).join('')}</div></div>`;
    }

    // 6) Evidencias fotográficas (fotos, croquis, firmas) con URL firmada.
    const imgItems = [];
    (Array.isArray(d['FOTOS SITIO']) ? d['FOTOS SITIO'] : []).forEach((r, i) => imgItems.push({ bucket: 'fotos-casos', ruta: r, label: 'Foto ' + (i + 1) }));
    if (d['CROQUIS']) imgItems.push({ bucket: 'fotos-casos', ruta: d['CROQUIS'], label: 'Croquis' });
    [['FIRMA CONDUCTOR', 'Firma conductor'], ['FIRMA ASISTENTE EN SITIO', 'Firma asistente']].forEach(([k, lab]) => { if (d[k]) imgItems.push({ bucket: 'fotos-casos', ruta: d[k], label: lab }); });
    const firmados = await _firmarLista(imgItems);
    if (firmados.length) {
      const figs = firmados.map(f => `<figure><img src="${escSv(f.url)}"><figcaption>${escSv(f.label)}</figcaption></figure>`).join('');
      secHTML += `<div class="sec"><h3>Evidencias fotográficas</h3><div class="fotos">${figs}</div></div>`;
    }

    // Cabecera y ensamblado final.
    const now = new Date();
    const fechaGen = now.toLocaleDateString('es-CO') + ' ' + now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    const col = SV_PDF_CAT_COLOR[caso._cat] || SV_PDF_CAT_COLOR.SIN;

    const full = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Informe ${escSv(caso.numero_caso || 'caso')} ${escSv(d['PLACA VEHICULO'] || '')}</title>
<style>${SV_PDF_CSS}</style></head><body>
<div class="doc">
  <div class="rep-head">
    <div class="rep-brand">ASIS PLUS<small>SoluAsistencia · Informe de caso</small></div>
    <div class="rep-meta">
      <div><b>${escSv(caso.numero_caso || 'Caso')}</b></div>
      <div>Generado: ${escSv(fechaGen)}</div>
      <div class="rep-cat" style="background:${col[0]};color:${col[1]}">${escSv(cat.label)}</div>
    </div>
  </div>
  <div class="rep-title">${escSv(d['EMPRESA'] || 'Sin empresa')}</div>
  <div class="rep-sub">Placa ${escSv(d['PLACA VEHICULO'] || '—')} · Conductor ${escSv(d['NOMBRE CONDUCTOR'] || '—')}</div>
  ${secHTML || '<div class="sec"><div class="val">Este caso no tiene datos para mostrar.</div></div>'}
  <div class="rep-foot">Documento generado automáticamente por ASIS PLUS — SoluAsistencia. Información confidencial.</div>
</div></body></html>`;

    win.document.open();
    win.document.write(full);
    win.document.close();
    await _esperarImgs(win, 6000);
    win.focus();
    win.print();
  } catch (e) {
    try { win.document.body.innerHTML = '<p style="font-family:sans-serif;padding:40px;color:#b91c1c">No se pudo generar el informe: ' + escSv(e.message || e) + '</p>'; } catch (_) { /* */ }
    showStatus('No se pudo generar el PDF: ' + (e.message || e), 'error');
  }
}
