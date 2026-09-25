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
  if (els.btnEmpresaCasosPrev) els.btnEmpresaCasosPrev.addEventListener('click', () => moverPaginaHistorialEmpresa(-1));
  if (els.btnEmpresaCasosNext) els.btnEmpresaCasosNext.addEventListener('click', () => moverPaginaHistorialEmpresa(1));
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
  renderFichaEmpresa(cont, metricas, {
    nombreEmpresa: state.empresaVistaAdmin || (state.perfil && state.perfil.empresa) || ''
  });
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

  const titulo = comoAdmin ? empresaNombre : ((state.perfil && state.perfil.empresa) || 'Mi empresa');
  if (els.empresaNombreTitulo) els.empresaNombreTitulo.textContent = titulo;

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
      .select('numero_caso, estado, datos, creado_en')
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
  tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
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
    state.empresaCasosLista = data || [];
    state.empresaCasosPagina = 1;
    if (els.empresaCasosCount) els.empresaCasosCount.textContent = `(${formatNumber((data || []).length)})`;
    renderHistorialEmpresa();
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="5">Error: ${escBandeja(error.message || String(error))}</td></tr>`;
  }
}

/** Cuántos casos por página en el historial de la empresa. */
const EMPRESA_CASOS_POR_PAGINA = 50;

/**
 * Dibuja una página del historial.
 *
 * El data-idx es el índice ABSOLUTO dentro de state.empresaCasosLista, no el
 * de la página: así el clic sigue abriendo el caso correcto sin tocar el
 * manejador que ya existía.
 */
function renderHistorialEmpresa() {
  const tbody = els.empresaCasosBody;
  if (!tbody) return;
  const todos = state.empresaCasosLista || [];

  if (!todos.length) {
    tbody.innerHTML = '<tr><td colspan="5">Sin casos registrados.</td></tr>';
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

  // En vez de "Estado" (en los históricos siempre dice lo mismo) se muestra el
  // tipo de vehículo y la gravedad, que sí distinguen un caso de otro.
  tbody.innerHTML = trozo.map((c, i) => {
    const d = c.datos || {};
    const fecha = d['FECHA DEL SINIESTRO'] || '—';
    const placa = d['PLACA VEHICULO'] || '—';
    const tipo = d['TIPO DE VEHICULO'] || '—';
    const gravedad = d['GRAVEDAD DEL SINIESTRO'] || '';
    const gravedadHTML = gravedad
      ? `<span class="ct-grav ${claseGravedad(gravedad)}">${escBandeja(gravedad)}</span>`
      : '—';
    return `
      <tr class="fila-clic" data-idx="${inicio + i}" tabindex="0">
        <td>${escBandeja(c.numero_caso || '—')}</td>
        <td>${escBandeja(fecha)}</td>
        <td>${escBandeja(placa)}</td>
        <td>${escBandeja(tipo)}</td>
        <td>${gravedadHTML}</td>
      </tr>`;
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
