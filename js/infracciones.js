/**
 * infracciones.js
 * Histórico de comparendos del parque: el primer "servicio de programación
 * adicional" (ver servicios.js). Sólo lo ve quien lo tiene contratado.
 *
 * Es un CRUD completo —la empresa consulta, registra, corrige y borra— porque
 * un comparendo cambia de estado: entra sin cancelar, se paga, a veces se
 * impugna. Un listado de sólo lectura obligaría a seguir llevando el Excel en
 * paralelo, que es exactamente lo que este módulo viene a reemplazar.
 *
 * La RLS hace el trabajo de verdad: devuelve filas sólo si el perfil tiene el
 * servicio Y la empresa es suya, y lo vuelve a comprobar en cada escritura. Lo
 * de aquí es que la pantalla no ofrezca lo que el servidor va a rechazar.
 */

/** Cuántas por página (el mismo número que el historial y los vehículos). */
const INFRA_POR_PAGINA = 50;

/** Los dos únicos estados, como los guarda la base. */
const INFRA_ESTADOS = ['SIN CANCELAR', 'CANCELADA'];

/** Columnas que se leen (todas: es el dueño de los datos quien mira). */
const INFRA_COLUMNAS =
  'id, empresa, placa, numero_interno, fecha, ruta, comparendo, codigo, infraccion, ' +
  'cedula_conductor, conductor, estado, solidaridad, foto_multa, observaciones, origen, actualizado_en';

/* ------------------------------------------------------------------ *
 *  Carga
 * ------------------------------------------------------------------ */

/**
 * Trae las infracciones visibles, paginando.
 *
 * Sin .range() Supabase devuelve como mucho 1.000 filas SIN avisar. Hoy son
 * 230, pero esto crece con cada comparendo que llega.
 */
async function traerInfracciones() {
  const filas = [];
  const PAGE = 1000;
  let desde = 0;
  while (true) {
    let consulta = db.from('infracciones').select(INFRA_COLUMNAS)
      .order('fecha', { ascending: false })
      .range(desde, desde + PAGE - 1);
    // La empresa no necesita filtro (lo hace la RLS); el admin que está mirando
    // el portal de otra, sí.
    if (state.empresaVistaAdmin) consulta = consulta.in('empresa', state.empresaVistaAdmin);
    const { data, error } = await consulta;
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < PAGE) break;
    desde += PAGE;
  }
  return filas;
}

/** Carga el módulo y lo dibuja. */
async function cargarInfracciones() {
  const cont = els.infraBody;
  if (!cont) return;
  cont.innerHTML = '<div class="ehl-estado">Cargando…</div>';
  try {
    state.infraLista = await traerInfracciones();
    state.infraPagina = 1;
    llenarFiltrosInfra();
    renderInfracciones();
  } catch (error) {
    state.infraLista = [];
    cont.innerHTML = `<div class="ehl-estado">Error: ${escBandeja(error.message || String(error))}</div>`;
  }
}

/* ------------------------------------------------------------------ *
 *  Filtros
 * ------------------------------------------------------------------ */

function _valorFiltroInfra(id) {
  return (els[id] && els[id].value) || '';
}

function _hayFiltroInfra() {
  return !!(((els.buscarInfra && els.buscarInfra.value) || '').trim() ||
    _valorFiltroInfra('filtroInfraAnio') || _valorFiltroInfra('filtroInfraEstado') ||
    _valorFiltroInfra('filtroInfraEmpresa'));
}

/** El año de la infracción (la fecha llega como 'AAAA-MM-DD'). */
function _anioInfra(r) {
  return String(r.fecha || '').slice(0, 4);
}

/** Las infracciones que se ven: los selectores y, encima, el buscador. */
function _infraccionesFiltradas() {
  let filas = state.infraLista || [];
  const anio = _valorFiltroInfra('filtroInfraAnio');
  const estado = _valorFiltroInfra('filtroInfraEstado');
  const emp = _valorFiltroInfra('filtroInfraEmpresa');
  if (anio) filas = filas.filter(r => _anioInfra(r) === anio);
  if (estado) filas = filas.filter(r => String(r.estado || '') === estado);
  if (emp) filas = filas.filter(r => String(r.empresa || '').trim() === emp);

  const q = normalizarBusqueda((els.buscarInfra && els.buscarInfra.value) || '').trim();
  if (!q) return filas;
  // La placa se busca normalizada, igual que en el listado de vehículos: quien
  // escribe "tsk974" busca "TSK-974".
  const qPlaca = q.replace(/[^a-z0-9]/g, '');
  return filas.filter(r => {
    if (qPlaca && normalizarBusqueda(r.placa).replace(/[^a-z0-9]/g, '').includes(qPlaca)) return true;
    return [r.conductor, r.cedula_conductor, r.comparendo, r.codigo, r.infraccion,
            r.ruta, r.numero_interno, r.empresa, r.observaciones]
      .some(c => normalizarBusqueda(c).includes(q));
  });
}

/** Llena los selectores con lo que REALMENTE hay. */
function llenarFiltrosInfra() {
  const filas = state.infraLista || [];
  const unicos = f => [...new Set(filas.map(f).filter(Boolean))];

  const llenar = (el, valores, titulo) => {
    if (!el) return;
    const previo = el.value;
    el.innerHTML = `<option value="">${titulo}</option>` +
      valores.map(v => `<option value="${escBandeja(v)}">${escBandeja(v)}</option>`).join('');
    el.value = valores.includes(previo) ? previo : '';
  };

  llenar(els.filtroInfraAnio, unicos(_anioInfra).sort((a, b) => Number(b) - Number(a)), 'Todos los años');
  llenar(els.filtroInfraEstado, INFRA_ESTADOS.filter(e => filas.some(r => r.estado === e)), 'Todos los estados');

  const empresas = unicos(r => String(r.empresa || '').trim()).sort((a, b) => a.localeCompare(b, 'es'));
  llenar(els.filtroInfraEmpresa, empresas, 'Todas mis empresas');
  if (els.filtroInfraEmpresa) els.filtroInfraEmpresa.classList.toggle('hidden', empresas.length < 2);
}

/* ------------------------------------------------------------------ *
 *  Listado
 * ------------------------------------------------------------------ */

const MESES_INFRA = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** 'AAAA-MM-DD' partido en día y "mes aa", sin pasar por Date (no hay zonas). */
function _fechaInfra(r) {
  const m = String(r.fecha || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return { dia: '—', mesAnio: '' };
  return { dia: m[3], mesAnio: `${MESES_INFRA[Number(m[2]) - 1] || ''} ${m[1].slice(2)}` };
}

/** Fecha en dd/mm/aaaa para la ficha. */
function fechaBonitaInfra(fecha) {
  const m = String(fecha || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Dibuja una página del listado. */
function renderInfracciones() {
  const cont = els.infraBody;
  if (!cont) return;

  const todas = _infraccionesFiltradas();
  const acotado = _hayFiltroInfra();
  const total = (state.infraLista || []).length;
  state.infraVisibles = todas;
  const variasEmpresas = [...new Set((state.infraLista || []).map(r => r.empresa))].length > 1;

  // Los totales de arriba se calculan sobre lo FILTRADO: si se está mirando
  // 2025, "sin cancelar" tiene que ser el de 2025, no el de todo.
  const sinPagar = todas.filter(r => r.estado === 'SIN CANCELAR').length;
  if (els.infraResumen) {
    els.infraResumen.innerHTML = todas.length
      ? `<span class="infra-kpi"><b>${formatNumber(todas.length)}</b> infracción(es)</span>` +
        `<span class="infra-kpi es-pendiente"><b>${formatNumber(sinPagar)}</b> sin cancelar</span>` +
        `<span class="infra-kpi es-ok"><b>${formatNumber(todas.length - sinPagar)}</b> canceladas</span>`
      : '';
  }
  if (els.btnInfraFiltrosLimpiar) els.btnInfraFiltrosLimpiar.classList.toggle('hidden', !acotado);
  if (els.infraCount) {
    els.infraCount.textContent = acotado
      ? `(${formatNumber(todas.length)} de ${formatNumber(total)})`
      : `(${formatNumber(total)})`;
  }

  if (!todas.length) {
    cont.innerHTML = acotado
      ? '<div class="ehl-estado">🔍 Ninguna infracción coincide con lo que estás filtrando.</div>'
      : '<div class="ehl-estado">Sin infracciones registradas.</div>';
    if (els.infraPager) els.infraPager.classList.add('hidden');
    return;
  }

  const paginas = Math.max(1, Math.ceil(todas.length / INFRA_POR_PAGINA));
  let pag = state.infraPagina || 1;
  if (pag < 1) pag = 1;
  if (pag > paginas) pag = paginas;
  state.infraPagina = pag;

  const inicio = (pag - 1) * INFRA_POR_PAGINA;
  const trozo = todas.slice(inicio, inicio + INFRA_POR_PAGINA);

  cont.innerHTML = trozo.map((r, i) => {
    const f = _fechaInfra(r);
    const pendiente = r.estado === 'SIN CANCELAR';
    const sub = [r.codigo, r.infraccion].filter(Boolean).join(' · ');
    return `
      <button type="button" class="ehl-row inf-row" data-idx="${inicio + i}"
              data-estado="${pendiente ? 'pendiente' : 'pagada'}">
        <span class="ehl-fecha"><b>${escBandeja(f.dia)}</b><small>${escBandeja(f.mesAnio)}</small></span>
        <span class="ehl-main">
          <span class="ehl-veh inf-placa">${escBandeja(r.placa || '—')}${
            r.numero_interno ? `<small>Interno ${escBandeja(r.numero_interno)}</small>` : ''}</span>
          <span class="ehl-cond">${sub ? escBandeja(sub) : '<i>Sin clasificar</i>'}</span>
          ${r.conductor ? `<span class="inf-cond">${escBandeja(tituloCaseFicha(r.conductor))}</span>` : ''}
        </span>
        <span class="ehl-side">
          <span class="inf-estado ${pendiente ? 'es-pendiente' : 'es-ok'}">${escBandeja(r.estado)}</span>
          <span class="ehl-meta">
            ${variasEmpresas ? `<span class="evl-empresa">${escBandeja(r.empresa)}</span>` : ''}
            ${r.solidaridad ? '<span class="inf-flag" title="La empresa responde solidariamente">Solidaria</span>' : ''}
            ${r.foto_multa ? '<span class="inf-flag">Fotomulta</span>' : ''}
          </span>
        </span>
      </button>`;
  }).join('');

  if (els.infraPager) els.infraPager.classList.toggle('hidden', paginas <= 1);
  if (els.infraPageInfo) {
    els.infraPageInfo.textContent = `Página ${pag} de ${paginas} · ${formatNumber(todas.length)} infracciones`;
  }
  if (els.btnInfraPrev) els.btnInfraPrev.disabled = pag <= 1;
  if (els.btnInfraNext) els.btnInfraNext.disabled = pag >= paginas;
}

function moverPaginaInfra(paso) {
  state.infraPagina = (state.infraPagina || 1) + paso;
  renderInfracciones();
  if (els.empresaVistaInfracciones) els.empresaVistaInfracciones.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/* ------------------------------------------------------------------ *
 *  Alta / edición
 * ------------------------------------------------------------------ */

/** Los campos del formulario, con su columna en la base. */
const INFRA_FORM = {
  empresa: 'infraEmpresa',
  placa: 'infraPlaca',
  fecha: 'infraFecha',
  ruta: 'infraRuta',
  comparendo: 'infraComparendo',
  codigo: 'infraCodigo',
  infraccion: 'infraDescripcion',
  cedula_conductor: 'infraCedula',
  conductor: 'infraConductor',
  estado: 'infraEstado',
  observaciones: 'infraObservaciones'
};

/** ¿Puede escribir quien está mirando? */
function puedeEditarInfracciones() {
  if (state.empresaVistaAdmin) return false;   // vista previa del admin: solo lectura
  return !!(state.perfil &&
    (state.perfil.rol === 'admin' ||
     (state.perfil.rol === 'empresa' && tieneServicio('infracciones'))));
}

/** Las empresas entre las que se puede elegir al registrar. */
function _empresasInfra() {
  const p = state.perfil || {};
  if (p.rol === 'empresa') {
    return (p.empresas && p.empresas.length) ? p.empresas : (p.empresa ? [p.empresa] : []);
  }
  // El admin registra sobre las empresas que ya tienen infracciones cargadas.
  return [...new Set((state.infraLista || []).map(r => String(r.empresa || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));
}

/** Abre el formulario: vacío para registrar, o con la fila para corregir. */
function abrirInfraccion(fila) {
  if (!puedeEditarInfracciones()) return;
  state.infraEditando = fila || null;

  const empresas = _empresasInfra();
  if (els.infraEmpresa) {
    els.infraEmpresa.innerHTML = empresas
      .map(e => `<option value="${escBandeja(e)}">${escBandeja(e)}</option>`).join('');
  }
  if (els.infraEstado) {
    els.infraEstado.innerHTML = INFRA_ESTADOS
      .map(e => `<option value="${escBandeja(e)}">${escBandeja(e)}</option>`).join('');
  }

  Object.keys(INFRA_FORM).forEach(campo => {
    const el = els[INFRA_FORM[campo]];
    if (!el) return;
    el.value = fila ? (fila[campo] == null ? '' : String(fila[campo])) : '';
  });
  if (!fila) {
    if (els.infraEmpresa) els.infraEmpresa.value = empresas[0] || '';
    if (els.infraEstado) els.infraEstado.value = 'SIN CANCELAR';
    if (els.infraFecha) els.infraFecha.value = new Date().toISOString().slice(0, 10);
  }
  if (els.infraSolidaridad) els.infraSolidaridad.checked = !!(fila && fila.solidaridad);
  if (els.infraFotoMulta) els.infraFotoMulta.checked = !!(fila && fila.foto_multa);

  if (els.infraEmpresaWrap) els.infraEmpresaWrap.classList.toggle('hidden', empresas.length < 2);
  if (els.infraModalTitulo) els.infraModalTitulo.textContent = fila ? 'Editar infracción' : 'Registrar infracción';
  if (els.infraModalSub) {
    els.infraModalSub.textContent = fila
      ? [fila.placa, fechaBonitaInfra(fila.fecha), fila.comparendo ? `Comparendo ${fila.comparendo}` : '']
          .filter(Boolean).join('  ·  ')
      : 'La placa y la fecha son obligatorias.';
  }
  // Borrar sólo tiene sentido sobre algo que ya existe.
  if (els.btnInfraEliminar) els.btnInfraEliminar.classList.toggle('hidden', !fila);
  if (els.infraAviso) els.infraAviso.textContent = '';
  if (els.infraModal) els.infraModal.classList.add('show');
}

function cerrarInfraccion() {
  if (els.infraModal) els.infraModal.classList.remove('show');
  state.infraEditando = null;
}

/** Guarda el alta o la corrección. */
async function guardarInfraccion(evento) {
  if (evento) evento.preventDefault();
  if (!puedeEditarInfracciones()) return;

  const empresas = _empresasInfra();
  const fila = {
    empresa: empresas.length > 1
      ? String((els.infraEmpresa && els.infraEmpresa.value) || '').trim()
      : (empresas[0] || ''),
    placa: String((els.infraPlaca && els.infraPlaca.value) || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
    fecha: String((els.infraFecha && els.infraFecha.value) || '').trim(),
    estado: String((els.infraEstado && els.infraEstado.value) || 'SIN CANCELAR'),
    solidaridad: !!(els.infraSolidaridad && els.infraSolidaridad.checked),
    foto_multa: !!(els.infraFotoMulta && els.infraFotoMulta.checked)
  };
  ['ruta', 'comparendo', 'codigo', 'infraccion', 'cedula_conductor', 'conductor', 'observaciones']
    .forEach(campo => {
      const el = els[INFRA_FORM[campo]];
      fila[campo] = el ? String(el.value || '').trim() : '';
    });

  const falta = !fila.empresa ? 'la empresa' : !fila.placa ? 'la placa' : !fila.fecha ? 'la fecha' : '';
  if (falta) {
    if (els.infraAviso) els.infraAviso.textContent = `Falta ${falta}.`;
    return;
  }

  try {
    showLoader(true);
    const editando = state.infraEditando;
    const { error } = editando
      ? await db.from('infracciones').update(fila).eq('id', editando.id)
      : await db.from('infracciones').insert([fila]);
    if (error) throw error;
    cerrarInfraccion();
    await cargarInfracciones();
    showStatus(editando ? 'Infracción actualizada.' : 'Infracción registrada.', 'ok');
  } catch (error) {
    const m = String((error && (error.message || error.details)) || error);
    if (els.infraAviso) {
      els.infraAviso.textContent = /row-level security/i.test(m)
        ? 'Tu usuario no tiene permiso para guardar en esa empresa.'
        : m;
    }
  } finally {
    showLoader(false);
  }
}

/** Borra la infracción que se está editando. */
async function eliminarInfraccion() {
  const fila = state.infraEditando;
  if (!fila || !puedeEditarInfracciones()) return;
  if (!confirm(`¿Borrar la infracción de ${fila.placa} del ${fechaBonitaInfra(fila.fecha)}?\n\nNo se puede deshacer.`)) return;
  try {
    showLoader(true);
    const { error } = await db.from('infracciones').delete().eq('id', fila.id);
    if (error) throw error;
    cerrarInfraccion();
    await cargarInfracciones();
    showStatus('Infracción borrada.', 'ok');
  } catch (error) {
    if (els.infraAviso) els.infraAviso.textContent = String((error && error.message) || error);
  } finally {
    showLoader(false);
  }
}

/** Descarga lo que se está viendo (con el filtro puesto) a Excel. */
function descargarInfracciones() {
  const filas = _infraccionesFiltradas();
  if (!filas.length) { showStatus('No hay infracciones para descargar.', 'error'); return; }
  const hoja = filas.map(r => ({
    FECHA: fechaBonitaInfra(r.fecha),
    EMPRESA: r.empresa, PLACA: r.placa, 'NUMERO INTERNO': r.numero_interno || '',
    RUTA: r.ruta || '', 'COMPARENDO': r.comparendo || '', 'CODIGO': r.codigo || '',
    'INFRACCION': r.infraccion || '', 'CEDULA CONDUCTOR': r.cedula_conductor || '',
    CONDUCTOR: r.conductor || '', ESTADO: r.estado,
    SOLIDARIDAD: r.solidaridad ? 'SI' : 'NO', FOTOMULTA: r.foto_multa ? 'SI' : 'NO',
    OBSERVACIONES: r.observaciones || ''
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(hoja);
  ws['!cols'] = Object.keys(hoja[0]).map(k => ({ wch: Math.max(k.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, 'INFRACCIONES');
  XLSX.writeFile(wb, `INFRACCIONES_${new Date().toISOString().slice(0, 10)}.xlsx`);
  showStatus(`${formatNumber(filas.length)} infracción(es) descargadas.`, 'ok');
}

/* ------------------------------------------------------------------ *
 *  Cableado
 * ------------------------------------------------------------------ */

function initInfracciones() {
  if (els.infraBody) {
    const abrir = event => {
      const f = event.target.closest('[data-idx]');
      if (!f) return;
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
      if (event.type === 'keydown') event.preventDefault();
      const fila = (state.infraVisibles || [])[Number(f.dataset.idx)];
      if (fila) abrirInfraccion(fila);
    };
    els.infraBody.addEventListener('click', abrir);
    els.infraBody.addEventListener('keydown', abrir);
  }
  const refiltrar = () => { state.infraPagina = 1; renderInfracciones(); };
  cablearBuscador(els.buscarInfra, refiltrar);
  ['filtroInfraAnio', 'filtroInfraEstado', 'filtroInfraEmpresa'].forEach(id => {
    if (els[id]) els[id].addEventListener('change', refiltrar);
  });
  if (els.btnInfraFiltrosLimpiar) {
    els.btnInfraFiltrosLimpiar.addEventListener('click', () => {
      if (els.buscarInfra) els.buscarInfra.value = '';
      ['filtroInfraAnio', 'filtroInfraEstado', 'filtroInfraEmpresa']
        .forEach(id => { if (els[id]) els[id].value = ''; });
      refiltrar();
    });
  }
  if (els.btnInfraPrev) els.btnInfraPrev.addEventListener('click', () => moverPaginaInfra(-1));
  if (els.btnInfraNext) els.btnInfraNext.addEventListener('click', () => moverPaginaInfra(1));
  if (els.btnInfraNueva) els.btnInfraNueva.addEventListener('click', () => abrirInfraccion(null));
  if (els.btnInfraExcel) els.btnInfraExcel.addEventListener('click', descargarInfracciones);
  if (els.btnInfraCerrar) els.btnInfraCerrar.addEventListener('click', cerrarInfraccion);
  if (els.btnInfraEliminar) els.btnInfraEliminar.addEventListener('click', eliminarInfraccion);
  if (els.formInfraccion) els.formInfraccion.addEventListener('submit', guardarInfraccion);
  if (els.infraModal) {
    els.infraModal.addEventListener('click', event => {
      if (event.target === els.infraModal) cerrarInfraccion();
    });
  }
}
