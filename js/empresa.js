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
      const fila = event.target.closest('[data-idx]');
      if (!fila) return;
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
      if (event.type === 'keydown') event.preventDefault(); // evita el scroll con espacio
      // Indexa sobre lo que se está viendo (ya filtrado), no sobre la lista
      // completa: si no, buscar abriría un caso distinto al que se tocó.
      const caso = (state.empresaCasosVisibles || [])[Number(fila.dataset.idx)];
      if (caso) verDetalleCasoEmpresa(caso);
    };
    els.empresaCasosBody.addEventListener('click', abrirDesdeFila);
    els.empresaCasosBody.addEventListener('keydown', abrirDesdeFila);
  }
  if (els.btnEmpresaCasosPrev) els.btnEmpresaCasosPrev.addEventListener('click', () => moverPaginaHistorialEmpresa(-1));
  if (els.btnEmpresaCasosNext) els.btnEmpresaCasosNext.addEventListener('click', () => moverPaginaHistorialEmpresa(1));
  // Al buscar se vuelve a la primera página: quedarse en la 7 de una lista que
  // ahora tiene dos resultados dejaría la pantalla en blanco.
  const refiltrar = () => {
    state.empresaCasosPagina = 1;
    renderHistorialEmpresa();
  };
  cablearBuscador(els.buscarEmpresaCasos, refiltrar);
  ['filtroEmpresaAnio', 'filtroEmpresaGravedad', 'filtroEmpresaEstado'].forEach(id => {
    if (els[id]) els[id].addEventListener('change', refiltrar);
  });
  if (els.btnEmpresaFiltrosLimpiar) {
    els.btnEmpresaFiltrosLimpiar.addEventListener('click', () => {
      if (els.buscarEmpresaCasos) els.buscarEmpresaCasos.value = '';
      ['filtroEmpresaAnio', 'filtroEmpresaGravedad', 'filtroEmpresaEstado']
        .forEach(id => { if (els[id]) els[id].value = ''; });
      refiltrar();
    });
  }
  if (els.btnEmpresaCasoCerrar) els.btnEmpresaCasoCerrar.addEventListener('click', cerrarDetalleCasoEmpresa);
  if (els.empresaCasoModal) {
    els.empresaCasoModal.addEventListener('click', event => {
      if (event.target === els.empresaCasoModal) cerrarDetalleCasoEmpresa();
    });
  }

  // Filtro de fechas de la ficha de siniestralidad.
  if (els.btnEmpresaMesFiltrar) els.btnEmpresaMesFiltrar.addEventListener('click', renderFichaEmpresaPropia);
  if (els.btnEmpresaMesLimpiar) els.btnEmpresaMesLimpiar.addEventListener('click', () => {
    if (els.empresaMesDesde) els.empresaMesDesde.value = '';
    if (els.empresaMesHasta) els.empresaMesHasta.value = '';
    renderFichaEmpresaPropia();
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
 * Dibuja la ficha de siniestralidad de la empresa, acotada al rango Desde/Hasta
 * si hay filtro activo. El cálculo y el dibujo viven en ficha-empresa.js: es
 * exactamente la misma ficha que SoluAsistencia ve desde su dashboard, para que
 * ambas partes miren los mismos números calculados igual.
 */
function renderFichaEmpresaPropia() {
  const cont = els.empresaFichaBody;
  if (!cont) return;
  const { desde, hasta } = _empresaRangoFiltro();
  const metricas = calcularFichaEmpresa(
    state.empresaCasosLista || [],
    state.empresaVehiculosTotal || 0,
    { desde, hasta }
  );
  renderFichaEmpresa(cont, metricas, { nombreEmpresa: _nombreEmpresaActual() });
}

/**
 * Cómo se llama lo que se está viendo. En modo admin, la empresa elegida; si no,
 * la principal del usuario, con un «+ N más» cuando está vinculado a varias.
 */
function _nombreEmpresaActual() {
  if (state.empresaVistaAdmin) return state.empresaVistaAdmin;
  const mias = (state.perfil && state.perfil.empresas) || [];
  const principal = mias[0] || (state.perfil && state.perfil.empresa) || '';
  return mias.length > 1 ? `${principal} + ${mias.length - 1} más` : principal;
}

/**
 * Abre el portal de empresa.
 *
 * Sin argumento lo abre el rol "empresa" y ve lo suyo: la RLS de Supabase ya
 * filtra parque_automotor y registro_asistencias por la empresa del perfil.
 *
 * Con `empresaNombre` lo abre un gestor o un admin para ver el portal de esa
 * empresa tal cual lo ve ella. Ahí la RLS NO filtra (esos roles ven todo), así
 * que el filtro se aplica en la consulta. Es la misma pantalla, no una copia:
 * si mañana cambia el portal, cambia para los dos a la vez.
 */
async function abrirEmpresaPortal(empresaNombre) {
  const comoAdmin = !!empresaNombre && (state.perfil && state.perfil.rol !== 'empresa');
  state.empresaVistaAdmin = comoAdmin ? empresaNombre : null;

  ocultarPantallas();
  els.empresaCard.classList.remove('hidden');

  // Un usuario puede estar vinculado a varias empresas (opera vehículos que en
  // el parque figuran a nombre de otra). El título lleva la principal y, si hay
  // más, cuántas; el detalle va en el tooltip para no alargar el encabezado.
  const mias = (state.perfil && state.perfil.empresas) || [];
  const titulo = comoAdmin
    ? empresaNombre
    : (mias[0] || (state.perfil && state.perfil.empresa) || 'Mi empresa');
  if (els.empresaNombreTitulo) {
    els.empresaNombreTitulo.textContent =
      (!comoAdmin && mias.length > 1) ? `${titulo} + ${mias.length - 1} más` : titulo;
    els.empresaNombreTitulo.title = (!comoAdmin && mias.length > 1) ? mias.join(' · ') : '';
  }

  // El aviso y el botón de volver solo existen en el modo admin: la empresa no
  // tiene menú al que regresar ni necesita que le digan de quién es el portal.
  if (els.empresaAdminBtns) els.empresaAdminBtns.classList.toggle('hidden', !comoAdmin);
  if (els.empresaAvisoAdmin) els.empresaAvisoAdmin.classList.toggle('hidden', !comoAdmin);
  if (els.empresaAvisoNombre) els.empresaAvisoNombre.textContent = titulo;

  marcarUbicacion('empresaCard', titulo);
  cambiarVistaEmpresa('dashboard');
  await Promise.all([cargarMisVehiculos(), cargarMisCasos()]);
  renderFichaEmpresaPropia();
}

/** Carga el listado de vehículos de la empresa (RLS ya filtra por empresa). */
async function cargarMisVehiculos() {
  const tbody = els.empresaVehiculosBody;
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';
  try {
    let consulta = db
      .from('parque_automotor')
      .select('placa, numero_interno, tipo')
      .order('placa', { ascending: true });
    // La empresa no necesita filtro (lo hace la RLS); el admin sí.
    if (state.empresaVistaAdmin) consulta = consulta.eq('empresa', state.empresaVistaAdmin);
    const { data, error } = await consulta;
    if (error) throw error;
    state.empresaVehiculosTotal = (data || []).length;
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

/**
 * Trae TODAS las asistencias visibles, paginando.
 *
 * El paginado es a propósito: sin .range() Supabase devuelve como mucho 1.000
 * filas y la ficha contaría de menos SIN AVISAR, que es el peor error posible
 * en una pantalla de métricas. Hoy la empresa más grande tiene 411 casos, pero
 * eso crece solo.
 */
async function traerAsistenciasPaginado() {
  const filas = [];
  const PAGE = 1000;
  let desde = 0;
  while (true) {
    const { data, error } = await db
      .from('registro_asistencias')
      .select('key, numero_caso, estado, datos, creado_en')
      .order('creado_en', { ascending: false })
      .range(desde, desde + PAGE - 1);
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < PAGE) break;
    desde += PAGE;
  }
  return filas;
}

/**
 * Carga el historial de casos que se muestra en el portal.
 *
 * Para el rol "empresa" no hace falta filtrar: la RLS ya acota la consulta a
 * su empresa. Para el gestor o el admin que está viendo el portal de otra, el
 * filtro se hace en el cliente, igual que en el resto de la app (ver
 * abrirBandejaFiltrada en casos.js). Y si el dashboard ya bajó los casos, se
 * reutilizan: son ~2.800 filas que no tiene sentido volver a pedir.
 */
async function cargarMisCasos() {
  const tbody = els.empresaCasosBody;
  if (!tbody) return;
  tbody.innerHTML = '<div class="ehl-estado">Cargando…</div>';
  try {
    let data;
    if (state.empresaVistaAdmin) {
      const base = (typeof _dashRows !== 'undefined' && _dashRows.length)
        ? _dashRows
        : await traerAsistenciasPaginado();
      data = base.filter(c =>
        String((c.datos || {})['EMPRESA'] || '').trim() === state.empresaVistaAdmin);
    } else {
      data = await traerAsistenciasPaginado();
    }
    // Orden por la fecha REAL del siniestro, del más reciente al más antiguo.
    // Antes se ordenaba por creado_en, y eso salía al azar: los 2.707
    // históricos se importaron todos el mismo día, así que comparten
    // exactamente la misma marca de tiempo.
    state.empresaCasosLista = (data || []).slice().sort((a, b) => {
      const fa = _fechaCaso(a), fb = _fechaCaso(b);
      if (!fa && !fb) return 0;
      if (!fa) return 1;
      if (!fb) return -1;
      return fb - fa;
    });
    state.empresaCasosPagina = 1;
    llenarFiltrosEmpresa();
    // El contador lo pone renderHistorialEmpresa, que es quien sabe si hay un
    // filtro activo y cuántos casos está mostrando de verdad.
    renderHistorialEmpresa();
  } catch (error) {
    tbody.innerHTML = `<div class="ehl-estado">Error: ${escBandeja(error.message || String(error))}</div>`;
  }
}

/** Fecha del siniestro como dd/mm/aaaa (el dato viene en dos formatos). */
function _fechaBonitaEmpresa(caso) {
  const dt = _fechaCaso(caso);
  if (!dt) return '—';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${dt.getFullYear()}`;
}

/** Hora del siniestro en formato corto (viene como "8:00:00" o "16:00"). */
function _horaBonitaEmpresa(caso) {
  const s = String((caso.datos || {})['HORA DEL SINIESTRO'] || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

/** Cuántos casos por página en el historial de la empresa. */
const EMPRESA_CASOS_POR_PAGINA = 50;

/**
 * Filtros del historial. Son los mismos que usa la administración —año,
 * gravedad y estado— salvo el de empresa, que aquí no tiene sentido: la RLS ya
 * garantiza que sólo se ven los casos propios.
 */
function _valorFiltroEmpresa(id) {
  return (els[id] && els[id].value) || '';
}

/** ¿Hay algo acotando la lista (buscador o alguno de los selectores)? */
function _hayFiltroEmpresa() {
  return !!(((els.buscarEmpresaCasos && els.buscarEmpresaCasos.value) || '').trim() ||
    _valorFiltroEmpresa('filtroEmpresaAnio') ||
    _valorFiltroEmpresa('filtroEmpresaGravedad') ||
    _valorFiltroEmpresa('filtroEmpresaEstado'));
}

/** Año del caso por la fecha REAL del siniestro, no por la de importación. */
function _anioCasoEmpresa(caso) {
  const dt = _fechaCaso(caso);
  return dt ? String(dt.getFullYear()) : '';
}

/** Los casos que se ven: los selectores y, encima, el buscador. */
function _casosEmpresaFiltrados() {
  let filas = state.empresaCasosLista || [];
  const anio = _valorFiltroEmpresa('filtroEmpresaAnio');
  const grav = _valorFiltroEmpresa('filtroEmpresaGravedad');
  const est = _valorFiltroEmpresa('filtroEmpresaEstado');
  if (anio) filas = filas.filter(c => _anioCasoEmpresa(c) === anio);
  if (grav) filas = filas.filter(c => String((c.datos || {})['GRAVEDAD DEL SINIESTRO'] || '').trim() === grav);
  if (est) filas = filas.filter(c => String(c.estado || '').trim() === est);
  return filtrarCasosPorTexto(filas, (els.buscarEmpresaCasos && els.buscarEmpresaCasos.value) || '');
}

/**
 * Llena los selectores con lo que REALMENTE hay en el historial de esta
 * empresa. Ofrecer un año o una gravedad sin casos sólo lleva a una lista
 * vacía y hace dudar de que el filtro funcione.
 */
function llenarFiltrosEmpresa() {
  const filas = state.empresaCasosLista || [];
  const unicos = f => [...new Set(filas.map(f).filter(Boolean))];

  const llenar = (el, valores, titulo, etiqueta) => {
    if (!el) return;
    const previo = el.value;
    el.innerHTML = `<option value="">${titulo}</option>` + valores
      .map(v => `<option value="${escBandeja(v)}">${escBandeja(etiqueta ? etiqueta(v) : v)}</option>`)
      .join('');
    el.value = valores.includes(previo) ? previo : '';   // respeta lo elegido si sigue existiendo
  };

  llenar(els.filtroEmpresaAnio,
    unicos(_anioCasoEmpresa).sort((a, b) => Number(b) - Number(a)), 'Todos los años');
  llenar(els.filtroEmpresaGravedad,
    unicos(c => String((c.datos || {})['GRAVEDAD DEL SINIESTRO'] || '').trim()).sort(),
    'Toda gravedad', tituloCaseFicha);
  llenar(els.filtroEmpresaEstado,
    unicos(c => String(c.estado || '').trim()).sort(), 'Todos los estados', tituloCaseFicha);
}

/**
 * Dibuja una página del historial.
 *
 * El data-idx es el índice dentro de state.empresaCasosVisibles (la lista ya
 * filtrada por el buscador), no el de la página: así el clic abre el caso
 * correcto tanto si se está buscando como si no.
 */
function renderHistorialEmpresa() {
  const tbody = els.empresaCasosBody;
  if (!tbody) return;

  const todos = _casosEmpresaFiltrados();
  const acotado = _hayFiltroEmpresa();
  state.empresaCasosVisibles = todos;

  if (els.btnEmpresaFiltrosLimpiar) {
    els.btnEmpresaFiltrosLimpiar.classList.toggle('hidden', !acotado);
  }
  if (els.empresaCasosCount) {
    const n = (state.empresaCasosLista || []).length;
    els.empresaCasosCount.textContent = acotado
      ? `(${formatNumber(todos.length)} de ${formatNumber(n)})`
      : `(${formatNumber(n)})`;
  }

  if (!todos.length) {
    tbody.innerHTML = acotado
      ? '<div class="ehl-estado">🔍 Ningún caso coincide con lo que estás filtrando.</div>'
      : '<div class="ehl-estado">Sin casos registrados.</div>';
    if (els.empresaCasosPager) els.empresaCasosPager.classList.add('hidden');
    return;
  }

  const paginas = Math.max(1, Math.ceil(todos.length / EMPRESA_CASOS_POR_PAGINA));
  let pag = state.empresaCasosPagina || 1;
  if (pag < 1) pag = 1;
  if (pag > paginas) pag = paginas;
  state.empresaCasosPagina = pag;

  const inicio = (pag - 1) * EMPRESA_CASOS_POR_PAGINA;
  const trozo = todos.slice(inicio, inicio + EMPRESA_CASOS_POR_PAGINA);

  // Una tabla de cinco columnas se estiraba a lo ancho y quedaba hueca. Cada
  // caso es ahora una fila-tarjeta con tres bloques y una jerarquía clara:
  // cuándo, qué vehículo y quién, y a la derecha lo que califica el caso. El
  // borde de color a la izquierda (por gravedad) permite barrer la lista de un
  // vistazo sin leer. Es el mismo lenguaje visual de la bandeja (.bl-row).
  const MESES_EHL = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  tbody.innerHTML = trozo.map((c, i) => {
    const d = c.datos || {};
    const dt = _fechaCaso(c);
    const dia = dt ? String(dt.getDate()).padStart(2, '0') : '—';
    const mesAnio = dt ? `${MESES_EHL[dt.getMonth()]} ${String(dt.getFullYear()).slice(2)}` : '';

    const num = c.numero_caso || '—';
    const esHistorico = /^H-/.test(num);
    const hora = _horaBonitaEmpresa(c);

    const placa = d['PLACA VEHICULO'] || '—';
    const interno = String(d['NUMERO INTERNO VEHICULO'] || '').trim();
    const tipo = String(d['TIPO DE VEHICULO'] || '').trim();
    const subVeh = [tipo ? tituloCaseFicha(tipo) : '', interno ? `Interno ${interno}` : '']
      .filter(Boolean).join(' · ');

    const conductor = String(d['NOMBRE CONDUCTOR'] || '').trim();
    const gravedad = String(d['GRAVEDAD DEL SINIESTRO'] || '').trim();
    const gravCls = gravedad ? claseGravedad(gravedad) : 'grav-otro';

    return `
      <button type="button" class="ehl-row" data-idx="${inicio + i}" data-grav="${escBandeja(gravCls)}">
        <span class="ehl-fecha"><b>${escBandeja(dia)}</b><small>${escBandeja(mesAnio)}</small></span>
        <span class="ehl-main">
          <span class="ehl-veh">${escBandeja(placa)}${subVeh ? `<small>${escBandeja(subVeh)}</small>` : ''}</span>
          <span class="ehl-cond">${conductor ? escBandeja(tituloCaseFicha(conductor)) : '<i>Conductor sin registrar</i>'}</span>
        </span>
        <span class="ehl-side">
          ${gravedad
            ? `<span class="ct-grav ${escBandeja(gravCls)}">${escBandeja(tituloCaseFicha(gravedad))}</span>`
            : '<span class="ehl-sin">Gravedad sin registrar</span>'}
          <span class="ehl-meta">
            <span class="ehl-num${esHistorico ? ' es-hist' : ''}">${escBandeja(num)}</span>
            ${hora ? `<span class="ehl-hora">${escBandeja(hora)}</span>` : ''}
          </span>
        </span>
      </button>`;
  }).join('');

  if (els.empresaCasosPager) els.empresaCasosPager.classList.toggle('hidden', paginas <= 1);
  if (els.empresaCasosPageInfo) {
    els.empresaCasosPageInfo.textContent =
      `Página ${pag} de ${paginas} · ${formatNumber(todos.length)} casos`;
  }
  if (els.btnEmpresaCasosPrev) els.btnEmpresaCasosPrev.disabled = pag <= 1;
  if (els.btnEmpresaCasosNext) els.btnEmpresaCasosNext.disabled = pag >= paginas;
}

/** Mueve el historial una página adelante o atrás. */
function moverPaginaHistorialEmpresa(paso) {
  state.empresaCasosPagina = (state.empresaCasosPagina || 1) + paso;
  renderHistorialEmpresa();
  if (els.empresaVistaHistorico) els.empresaVistaHistorico.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/** Muestra el detalle de un caso del historial (mismo patrón de "fila" que el resto de la app). */
function verDetalleCasoEmpresa(caso) {
  const d = caso.datos || {};

  if (els.empresaCasoTitulo) {
    els.empresaCasoTitulo.textContent =
      caso.numero_caso ? `Caso N.º ${caso.numero_caso}` : 'Caso histórico';
  }
  if (els.empresaCasoSub) {
    els.empresaCasoSub.textContent = [
      caso.estado, d['PLACA VEHICULO'], d['NOMBRE CONDUCTOR']
    ].filter(Boolean).join('  ·  ');
  }

  const cont = els.empresaCasoBody;
  if (cont) {
    cont.innerHTML = '';

    // El mapa del lugar, igual que en el visor de registros.
    const mapa = document.createElement('div');
    mapa.className = 'mapa-wrap';
    cont.appendChild(mapa);
    agregarMapaDetalle(mapa, d);

    // TODOS los campos, no una selección: la versión del conductor, la
    // hipótesis, la categorización y lo demás que antes se quedaba fuera.
    // Es la misma pieza que usa la administración, así que cuando se agregue
    // un campo nuevo aparece en las dos pantallas a la vez.
    construirCuerpoDetalle(cont, d);

    // Evidencia: primero la del vehículo asegurado, después cada tercero.
    agregarFotosDetalle(cont, 'Fotos y firmas del siniestro', rutasImagenesAsistencia(d));
    agregarDocsDetalle(cont, d);
    // El cruce con terceros va por KEY. Normalmente viene en la columna; en los
    // importados también está dentro de `datos`, así que se usa como respaldo.
    const clave = caso.key || (typeof getKey === 'function' ? getKey(d, 'KEY') : '');
    cargarTercerosDelDetalle(clave, cont);
  }

  if (els.empresaCasoModal) els.empresaCasoModal.classList.add('show');
}

function cerrarDetalleCasoEmpresa() {
  if (els.empresaCasoModal) els.empresaCasoModal.classList.remove('show');
}
