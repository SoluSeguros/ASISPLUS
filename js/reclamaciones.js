/**
 * reclamaciones.js
 * Bitácora de reclamaciones: lo que SoluSeguros le reclama a las aseguradoras
 * por cuenta de las empresas afiliadas.
 *
 * Reemplaza un Excel de 35 hojas —una por empresa— donde las mismas columnas
 * estaban en posiciones distintas, el valor se escribía a mano y 123 de las 555
 * reclamaciones tenían un diario metido dentro de la casilla "ESTADO", así que
 * no se sabía en qué iban.
 *
 * Dos cosas que este módulo hace y el Excel no podía:
 *
 *  - El ESTADO es una lista cerrada de diez. Es lo único que permite contestar
 *    "¿cuántas están radicadas?" sin leer 555 celdas de prosa.
 *  - La bitácora es una línea de tiempo: cada movimiento es una nota con su
 *    fecha y su autor, en vez de una celda que todos reescriben encima.
 *
 * Es un proceso INTERNO: lo trabajan el rol "reclamaciones" y el admin, los
 * demás roles internos lo consultan, y el rol "empresa" no lo ve. Eso lo
 * garantiza la RLS; aquí sólo se evita ofrecer lo que el servidor va a negar.
 */

/** Los diez estados del proceso, en el orden en que suele avanzar. */
const REC_ESTADOS = [
  'RECOLECCION DE INFORMACION',
  'ASIGNACION DE TALLER',
  'RADICADA',
  'EN TRAMITE',
  'OFRECIMIENTO',
  'OBJETADA',
  'PAGADA',
  'NO PROCEDE',
  'DESISTIDA',
  'TERMINADA'
];

/**
 * Familia de cada estado, para el color de la franja. Son colores de ESTADO
 * (bien / en curso / mal / cerrado), no de identidad: por eso van siempre
 * acompañados del nombre escrito y nunca solos.
 */
const REC_TONO = {
  'RECOLECCION DE INFORMACION': 'espera',
  'ASIGNACION DE TALLER': 'curso',
  'RADICADA': 'curso',
  'EN TRAMITE': 'curso',
  'OFRECIMIENTO': 'curso',
  'OBJETADA': 'malo',
  'NO PROCEDE': 'malo',
  'DESISTIDA': 'cerrado',
  'PAGADA': 'bueno',
  'TERMINADA': 'bueno'
};

const REC_POR_PAGINA = 50;

const REC_COLUMNAS =
  'id, empresa, placa, propietario, contra, encargado, estado, radicado, ' +
  'fecha_siniestro, fecha_siniestro_texto, fecha_actualizacion, ' +
  'pretension, ofrecimiento, valor_texto, caso_key, numero_caso, origen, actualizado_en';

/* ------------------------------------------------------------------ *
 *  Permisos y carga
 * ------------------------------------------------------------------ */

/** ¿Quién puede ver el módulo? Cualquier rol interno. */
function veReclamaciones() {
  const rol = (state.perfil && state.perfil.rol) || '';
  return !!rol && rol !== 'empresa';
}

/** ¿Quién puede escribir? Quien lleva el proceso. */
function editaReclamaciones() {
  const rol = (state.perfil && state.perfil.rol) || '';
  return rol === 'admin' || rol === 'reclamaciones';
}

/**
 * Trae todas las reclamaciones, paginando. Sin .range() Supabase devuelve como
 * mucho 1.000 filas sin avisar; hoy son 555 y entran comparendos todas las
 * semanas.
 */
async function traerReclamaciones() {
  const filas = [];
  const PAGE = 1000;
  let desde = 0;
  while (true) {
    const { data, error } = await db.from('bitacora_reclamaciones')
      .select(REC_COLUMNAS)
      .order('actualizado_en', { ascending: false })
      .range(desde, desde + PAGE - 1);
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < PAGE) break;
    desde += PAGE;
  }
  return filas;
}

/** Abre el módulo. */
async function abrirReclamaciones() {
  if (!veReclamaciones()) return;
  ocultarPantallas();
  els.reclamacionesCard.classList.remove('hidden');
  marcarUbicacion('reclamacionesCard', 'Reclamaciones');
  if (els.recAcciones) els.recAcciones.classList.toggle('hidden', !editaReclamaciones());
  await cargarReclamaciones();
}

async function cargarReclamaciones() {
  const cont = els.recBody;
  if (!cont) return;
  cont.innerHTML = '<div class="ehl-estado">Cargando…</div>';
  try {
    showLoader(true);
    state.recLista = await traerReclamaciones();
    state.recPagina = 1;
    llenarFiltrosRec();
    renderReclamaciones();
  } catch (error) {
    state.recLista = [];
    cont.innerHTML = `<div class="ehl-estado">Error: ${escBandeja(error.message || String(error))}</div>`;
  } finally {
    showLoader(false);
  }
}

/* ------------------------------------------------------------------ *
 *  Filtros
 * ------------------------------------------------------------------ */

function _valorFiltroRec(id) {
  return (els[id] && els[id].value) || '';
}

function _hayFiltroRec() {
  return !!(((els.buscarRec && els.buscarRec.value) || '').trim() ||
    _valorFiltroRec('filtroRecEstado') || _valorFiltroRec('filtroRecEmpresa') ||
    _valorFiltroRec('filtroRecEncargado') || _valorFiltroRec('filtroRecContra'));
}

function _reclamacionesFiltradas() {
  let filas = state.recLista || [];
  const est = _valorFiltroRec('filtroRecEstado');
  const emp = _valorFiltroRec('filtroRecEmpresa');
  const enc = _valorFiltroRec('filtroRecEncargado');
  const con = _valorFiltroRec('filtroRecContra');
  if (est) filas = filas.filter(r => r.estado === est);
  if (emp) filas = filas.filter(r => String(r.empresa || '') === emp);
  if (enc) filas = filas.filter(r => String(r.encargado || '') === enc);
  if (con) filas = filas.filter(r => String(r.contra || '') === con);

  const q = normalizarBusqueda((els.buscarRec && els.buscarRec.value) || '').trim();
  if (!q) return filas;
  const qPlaca = q.replace(/[^a-z0-9]/g, '');
  return filas.filter(r => {
    if (qPlaca && normalizarBusqueda(r.placa).replace(/[^a-z0-9]/g, '').includes(qPlaca)) return true;
    return [r.propietario, r.contra, r.encargado, r.radicado, r.empresa,
            r.numero_caso, r.valor_texto, r.fecha_siniestro_texto]
      .some(c => normalizarBusqueda(c).includes(q));
  });
}

function llenarFiltrosRec() {
  const filas = state.recLista || [];
  const unicos = f => [...new Set(filas.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

  const llenar = (el, valores, titulo) => {
    if (!el) return;
    const previo = el.value;
    el.innerHTML = `<option value="">${titulo}</option>` +
      valores.map(v => `<option value="${escBandeja(v)}">${escBandeja(v)}</option>`).join('');
    el.value = valores.includes(previo) ? previo : '';
  };

  // Los estados van en el orden del proceso, no alfabético: así el desplegable
  // se lee como el flujo que es.
  llenar(els.filtroRecEstado, REC_ESTADOS.filter(e => filas.some(r => r.estado === e)), 'Todos los estados');
  llenar(els.filtroRecEmpresa, unicos(r => String(r.empresa || '').trim()), 'Todas las empresas');
  llenar(els.filtroRecEncargado, unicos(r => String(r.encargado || '').trim()), 'Todos los encargados');
  llenar(els.filtroRecContra, unicos(r => String(r.contra || '').trim()), 'Todas las aseguradoras');
}

/* ------------------------------------------------------------------ *
 *  Listado
 * ------------------------------------------------------------------ */

const MESES_REC = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** 'AAAA-MM-DD' en día y "mes aa", sin pasar por Date (no hay zonas horarias). */
function _fechaRec(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { dia: m[3], mesAnio: `${MESES_REC[Number(m[2]) - 1] || ''} ${m[1].slice(2)}`, iso: m[0] };
}

/** dd/mm/aaaa para la ficha. */
function fechaBonitaRec(iso) {
  const f = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return f ? `${f[3]}/${f[2]}/${f[1]}` : '';
}

/** El dinero en pesos, sin decimales (aquí nadie reclama centavos). */
function pesosRec(n) {
  if (n == null || n === '') return '';
  const v = Number(n);
  if (!isFinite(v)) return '';
  return '$' + formatNumber(Math.round(v));
}

/**
 * Lo que se muestra como valor: la pretensión, y si hay ofrecimiento también.
 * Cuando no se pudo leer el número, se muestra el texto original tal cual: es
 * preferible a una casilla vacía que esconde que ahí hay algo escrito.
 */
function _valorRec(r) {
  const p = pesosRec(r.pretension), o = pesosRec(r.ofrecimiento);
  if (p && o) return `${p} → ${o}`;
  if (p || o) return p || o;
  return '';
}

function renderReclamaciones() {
  const cont = els.recBody;
  if (!cont) return;

  const todas = _reclamacionesFiltradas();
  const acotado = _hayFiltroRec();
  const total = (state.recLista || []).length;
  state.recVisibles = todas;

  if (els.btnRecFiltrosLimpiar) els.btnRecFiltrosLimpiar.classList.toggle('hidden', !acotado);
  if (els.recCount) {
    els.recCount.textContent = acotado
      ? `(${formatNumber(todas.length)} de ${formatNumber(total)})`
      : `(${formatNumber(total)})`;
  }
  pintarResumenRec(todas);

  if (!todas.length) {
    cont.innerHTML = acotado
      ? '<div class="ehl-estado">🔍 Ninguna reclamación coincide con lo que estás filtrando.</div>'
      : '<div class="ehl-estado">Sin reclamaciones registradas.</div>';
    if (els.recPager) els.recPager.classList.add('hidden');
    return;
  }

  const paginas = Math.max(1, Math.ceil(todas.length / REC_POR_PAGINA));
  let pag = Math.min(Math.max(state.recPagina || 1, 1), paginas);
  state.recPagina = pag;
  const inicio = (pag - 1) * REC_POR_PAGINA;

  cont.innerHTML = todas.slice(inicio, inicio + REC_POR_PAGINA).map((r, i) => {
    const f = _fechaRec(r.fecha_siniestro);
    const val = _valorRec(r);
    const sub = [r.contra, r.encargado ? tituloCaseFicha(r.encargado) : '']
      .filter(Boolean).join(' · ');
    return `
      <button type="button" class="ehl-row rec-row" data-idx="${inicio + i}"
              data-tono="${escBandeja(REC_TONO[r.estado] || 'espera')}">
        <span class="ehl-fecha">${f
          ? `<b>${escBandeja(f.dia)}</b><small>${escBandeja(f.mesAnio)}</small>`
          : '<b class="rec-sinfecha">—</b><small>sin fecha</small>'}</span>
        <span class="ehl-main">
          <span class="ehl-veh rec-placa">${escBandeja(r.placa || 'Sin placa')}
            <small>${escBandeja(r.empresa || '')}</small></span>
          <span class="ehl-cond">${sub ? escBandeja(sub) : '<i>Sin aseguradora ni encargado</i>'}</span>
          ${r.propietario ? `<span class="rec-prop">${escBandeja(tituloCaseFicha(r.propietario))}</span>` : ''}
        </span>
        <span class="ehl-side">
          <span class="rec-estado t-${escBandeja(REC_TONO[r.estado] || 'espera')}">${escBandeja(r.estado)}</span>
          <span class="ehl-meta">
            ${val ? `<span class="rec-valor">${escBandeja(val)}</span>` : ''}
            ${r.numero_caso ? `<span class="ehl-num">${escBandeja(r.numero_caso)}</span>` : ''}
          </span>
        </span>
      </button>`;
  }).join('');

  if (els.recPager) els.recPager.classList.toggle('hidden', paginas <= 1);
  if (els.recPageInfo) {
    els.recPageInfo.textContent = `Página ${pag} de ${paginas} · ${formatNumber(todas.length)} reclamaciones`;
  }
  if (els.btnRecPrev) els.btnRecPrev.disabled = pag <= 1;
  if (els.btnRecNext) els.btnRecNext.disabled = pag >= paginas;
}

/**
 * La fila de números de arriba. Se calcula sobre lo FILTRADO: mirar una empresa
 * y ver el total de todas al lado no deja cuadrar nada.
 *
 * El dinero se muestra con la advertencia de sobre cuántas se pudo calcular:
 * 273 de las 555 traen el valor como texto escrito a mano y no se pueden sumar.
 */
function pintarResumenRec(filas) {
  if (!els.recResumen) return;
  if (!filas.length) { els.recResumen.innerHTML = ''; return; }
  const abiertas = filas.filter(r => !['PAGADA', 'TERMINADA', 'NO PROCEDE', 'DESISTIDA'].includes(r.estado)).length;
  const conValor = filas.filter(r => r.pretension != null);
  const suma = conValor.reduce((s, r) => s + Number(r.pretension || 0), 0);
  els.recResumen.innerHTML =
    `<span class="infra-kpi"><b>${formatNumber(filas.length)}</b> reclamación(es)</span>` +
    `<span class="infra-kpi es-pendiente"><b>${formatNumber(abiertas)}</b> abiertas</span>` +
    `<span class="infra-kpi es-ok"><b>${formatNumber(filas.filter(r => r.estado === 'PAGADA').length)}</b> pagadas</span>` +
    (conValor.length
      ? `<span class="infra-kpi"><b>${pesosRec(suma)}</b> pretendido <small>(sobre ${formatNumber(conValor.length)} de ${formatNumber(filas.length)} con valor legible)</small></span>`
      : '');
}

function moverPaginaRec(paso) {
  state.recPagina = (state.recPagina || 1) + paso;
  renderReclamaciones();
  if (els.reclamacionesCard) els.reclamacionesCard.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/* ------------------------------------------------------------------ *
 *  Ficha: datos + línea de tiempo
 * ------------------------------------------------------------------ */

const REC_FORM = {
  empresa: 'recEmpresa', placa: 'recPlaca', propietario: 'recPropietario',
  contra: 'recContra', encargado: 'recEncargado', estado: 'recEstado',
  radicado: 'recRadicado', fecha_siniestro: 'recFechaSin',
  pretension: 'recPretension', ofrecimiento: 'recOfrecimiento'
};

/** Abre la ficha. Sin argumento, una reclamación nueva. */
async function abrirReclamacion(fila) {
  state.recEditando = fila || null;
  const puede = editaReclamaciones();

  if (els.recEstado) {
    els.recEstado.innerHTML = REC_ESTADOS
      .map(e => `<option value="${escBandeja(e)}">${escBandeja(e)}</option>`).join('');
  }
  Object.keys(REC_FORM).forEach(campo => {
    const el = els[REC_FORM[campo]];
    if (!el) return;
    el.value = fila && fila[campo] != null ? String(fila[campo]) : '';
    el.disabled = !puede;
  });
  if (!fila && els.recEstado) els.recEstado.value = 'RECOLECCION DE INFORMACION';

  if (els.recFichaTitulo) {
    els.recFichaTitulo.textContent = fila
      ? `${fila.placa || 'Sin placa'} · ${fila.empresa || ''}`
      : 'Nueva reclamación';
  }
  if (els.recFichaSub) {
    els.recFichaSub.textContent = fila
      ? [fila.numero_caso ? `Caso ${fila.numero_caso}` : '',
         fila.fecha_siniestro ? `Siniestro ${fechaBonitaRec(fila.fecha_siniestro)}`
           : (fila.fecha_siniestro_texto ? `Siniestro: ${fila.fecha_siniestro_texto}` : ''),
         fila.radicado ? `Radicado ${fila.radicado}` : ''].filter(Boolean).join('  ·  ')
      : 'La empresa es lo único obligatorio.';
  }
  // Lo que el Excel traía escrito y no se pudo convertir en número o en fecha se
  // muestra aquí: es lo que hay que completar a mano.
  if (els.recCrudo) {
    const pend = [];
    if (fila && fila.valor_texto) pend.push(`<b>Valor como estaba escrito:</b> ${escBandeja(fila.valor_texto)}`);
    if (fila && fila.fecha_siniestro_texto) pend.push(`<b>Fecha como estaba escrita:</b> ${escBandeja(fila.fecha_siniestro_texto)}`);
    els.recCrudo.innerHTML = pend.join('<br>');
    els.recCrudo.classList.toggle('hidden', !pend.length);
  }

  if (els.btnRecGuardar) els.btnRecGuardar.classList.toggle('hidden', !puede);
  if (els.btnRecEliminar) els.btnRecEliminar.classList.toggle('hidden', !(puede && fila));
  if (els.recNotaCaja) els.recNotaCaja.classList.toggle('hidden', !(puede && fila));
  if (els.recNotaTexto) els.recNotaTexto.value = '';
  if (els.recAviso) els.recAviso.textContent = '';
  if (els.recFichaModal) els.recFichaModal.classList.add('show');

  await cargarNotasRec(fila ? fila.id : null);
}

function cerrarReclamacion() {
  if (els.recFichaModal) els.recFichaModal.classList.remove('show');
  state.recEditando = null;
}

/** La línea de tiempo de la reclamación. */
async function cargarNotasRec(id) {
  const cont = els.recNotas;
  if (!cont) return;
  if (!id) { cont.innerHTML = '<div class="ehl-estado">La bitácora se abre cuando la reclamación esté creada.</div>'; return; }
  cont.innerHTML = '<div class="ehl-estado">Cargando bitácora…</div>';
  try {
    const { data, error } = await db.from('bitacora_notas')
      .select('id, fecha, texto, autor')
      .eq('reclamacion_id', id)
      .order('fecha', { ascending: false }).order('id', { ascending: false });
    if (error) throw error;
    if (!data || !data.length) {
      cont.innerHTML = '<div class="ehl-estado">Todavía no hay movimientos anotados.</div>';
      return;
    }
    cont.innerHTML = data.map(n => `
      <div class="rec-nota">
        <div class="rec-nota-cab">
          <b>${escBandeja(fechaBonitaRec(n.fecha))}</b>
          ${n.autor ? `<span>${escBandeja(n.autor)}</span>` : ''}
        </div>
        <div class="rec-nota-txt">${escBandeja(n.texto)}</div>
      </div>`).join('');
  } catch (error) {
    cont.innerHTML = `<div class="ehl-estado">Error: ${escBandeja(error.message || String(error))}</div>`;
  }
}

/** Agrega un movimiento a la bitácora. */
async function agregarNotaRec() {
  const fila = state.recEditando;
  const texto = String((els.recNotaTexto && els.recNotaTexto.value) || '').trim();
  if (!fila || !texto || !editaReclamaciones()) return;
  try {
    showLoader(true);
    const autor = (state.perfil && (state.perfil.nombre || state.perfil.email)) || '';
    const { error } = await db.from('bitacora_notas').insert([{
      reclamacion_id: fila.id, texto: texto, autor: autor,
      autor_id: (state.perfil && state.perfil.id) || null
    }]);
    if (error) throw error;
    if (els.recNotaTexto) els.recNotaTexto.value = '';
    await cargarNotasRec(fila.id);
    showStatus('Movimiento anotado.', 'ok');
  } catch (error) {
    if (els.recAviso) els.recAviso.textContent = String((error && error.message) || error);
  } finally {
    showLoader(false);
  }
}

/** Un número escrito con puntos, comas o pesos, como número. */
function _numeroRec(v) {
  const s = String(v == null ? '' : v).replace(/[^\d]/g, '');
  if (!s) return null;
  const n = Number(s);
  return isFinite(n) && n > 0 ? n : null;
}

async function guardarReclamacion(evento) {
  if (evento) evento.preventDefault();
  if (!editaReclamaciones()) return;

  const fila = {
    empresa: String((els.recEmpresa && els.recEmpresa.value) || '').trim(),
    placa: String((els.recPlaca && els.recPlaca.value) || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
    propietario: String((els.recPropietario && els.recPropietario.value) || '').trim(),
    contra: String((els.recContra && els.recContra.value) || '').trim(),
    encargado: String((els.recEncargado && els.recEncargado.value) || '').trim(),
    estado: String((els.recEstado && els.recEstado.value) || 'RECOLECCION DE INFORMACION'),
    radicado: String((els.recRadicado && els.recRadicado.value) || '').trim(),
    fecha_siniestro: String((els.recFechaSin && els.recFechaSin.value) || '').trim() || null,
    pretension: _numeroRec(els.recPretension && els.recPretension.value),
    ofrecimiento: _numeroRec(els.recOfrecimiento && els.recOfrecimiento.value)
  };
  if (!fila.empresa) {
    if (els.recAviso) els.recAviso.textContent = 'Falta la empresa.';
    return;
  }

  try {
    showLoader(true);
    const editando = state.recEditando;
    const { error } = editando
      ? await db.from('bitacora_reclamaciones').update(fila).eq('id', editando.id)
      : await db.from('bitacora_reclamaciones').insert([fila]);
    if (error) throw error;
    cerrarReclamacion();
    await cargarReclamaciones();
    showStatus(editando ? 'Reclamación actualizada.' : 'Reclamación creada.', 'ok');
  } catch (error) {
    const m = String((error && (error.message || error.details)) || error);
    if (els.recAviso) {
      els.recAviso.textContent = /row-level security/i.test(m)
        ? 'Tu usuario no tiene permiso para modificar reclamaciones.'
        : m;
    }
  } finally {
    showLoader(false);
  }
}

async function eliminarReclamacion() {
  const fila = state.recEditando;
  if (!fila || !editaReclamaciones()) return;
  if (!confirm(`¿Borrar la reclamación de ${fila.placa || 'sin placa'} (${fila.empresa})?\n\nSe borra también su bitácora. No se puede deshacer.`)) return;
  try {
    showLoader(true);
    const { error } = await db.from('bitacora_reclamaciones').delete().eq('id', fila.id);
    if (error) throw error;
    cerrarReclamacion();
    await cargarReclamaciones();
    showStatus('Reclamación borrada.', 'ok');
  } catch (error) {
    if (els.recAviso) els.recAviso.textContent = String((error && error.message) || error);
  } finally {
    showLoader(false);
  }
}

/** Descarga lo que se está viendo, con el filtro puesto. */
function descargarReclamaciones() {
  const filas = _reclamacionesFiltradas();
  if (!filas.length) { showStatus('No hay reclamaciones para descargar.', 'error'); return; }
  const hoja = filas.map(r => ({
    EMPRESA: r.empresa, PLACA: r.placa || '', PROPIETARIO: r.propietario || '',
    'SE LE RECLAMA A': r.contra || '', ENCARGADO: r.encargado || '', ESTADO: r.estado,
    RADICADO: r.radicado || '',
    'FECHA SINIESTRO': r.fecha_siniestro ? fechaBonitaRec(r.fecha_siniestro) : (r.fecha_siniestro_texto || ''),
    'ULTIMO MOVIMIENTO': r.fecha_actualizacion ? fechaBonitaRec(r.fecha_actualizacion) : '',
    PRETENSION: r.pretension || '', OFRECIMIENTO: r.ofrecimiento || '',
    'VALOR COMO ESTABA ESCRITO': r.valor_texto || '',
    'CASO EN ASIS PLUS': r.numero_caso || ''
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(hoja);
  ws['!cols'] = Object.keys(hoja[0]).map(k => ({ wch: Math.max(k.length + 2, 16) }));
  XLSX.utils.book_append_sheet(wb, ws, 'RECLAMACIONES');
  XLSX.writeFile(wb, `RECLAMACIONES_${new Date().toISOString().slice(0, 10)}.xlsx`);
  showStatus(`${formatNumber(filas.length)} reclamación(es) descargadas.`, 'ok');
}

/* ------------------------------------------------------------------ *
 *  Cableado
 * ------------------------------------------------------------------ */

function initReclamaciones() {
  if (els.btnMenuReclamaciones) els.btnMenuReclamaciones.addEventListener('click', abrirReclamaciones);
  if (els.btnRecVolver) els.btnRecVolver.addEventListener('click', ocultarPantallas);
  if (els.btnRecRefrescar) els.btnRecRefrescar.addEventListener('click', cargarReclamaciones);

  if (els.recBody) {
    const abrir = event => {
      const f = event.target.closest('[data-idx]');
      if (!f) return;
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
      if (event.type === 'keydown') event.preventDefault();
      const fila = (state.recVisibles || [])[Number(f.dataset.idx)];
      if (fila) abrirReclamacion(fila);
    };
    els.recBody.addEventListener('click', abrir);
    els.recBody.addEventListener('keydown', abrir);
  }

  const refiltrar = () => { state.recPagina = 1; renderReclamaciones(); };
  cablearBuscador(els.buscarRec, refiltrar);
  ['filtroRecEstado', 'filtroRecEmpresa', 'filtroRecEncargado', 'filtroRecContra'].forEach(id => {
    if (els[id]) els[id].addEventListener('change', refiltrar);
  });
  if (els.btnRecFiltrosLimpiar) {
    els.btnRecFiltrosLimpiar.addEventListener('click', () => {
      if (els.buscarRec) els.buscarRec.value = '';
      ['filtroRecEstado', 'filtroRecEmpresa', 'filtroRecEncargado', 'filtroRecContra']
        .forEach(id => { if (els[id]) els[id].value = ''; });
      refiltrar();
    });
  }
  if (els.btnRecPrev) els.btnRecPrev.addEventListener('click', () => moverPaginaRec(-1));
  if (els.btnRecNext) els.btnRecNext.addEventListener('click', () => moverPaginaRec(1));
  if (els.btnRecNueva) els.btnRecNueva.addEventListener('click', () => abrirReclamacion(null));
  if (els.btnRecExcel) els.btnRecExcel.addEventListener('click', descargarReclamaciones);
  if (els.btnRecFichaCerrar) els.btnRecFichaCerrar.addEventListener('click', cerrarReclamacion);
  if (els.formReclamacion) els.formReclamacion.addEventListener('submit', guardarReclamacion);
  if (els.btnRecEliminar) els.btnRecEliminar.addEventListener('click', eliminarReclamacion);
  if (els.btnRecNotaAgregar) els.btnRecNotaAgregar.addEventListener('click', agregarNotaRec);
  if (els.recFichaModal) {
    els.recFichaModal.addEventListener('click', event => {
      if (event.target === els.recFichaModal) cerrarReclamacion();
    });
  }
}
