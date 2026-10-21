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
  'id, empresa, placa, numero_interno, fecha, hora, ruta, comparendo, codigo, infraccion, ' +
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
    // Los filtros de gráfico pertenecen a la lista que se acaba de cargar.
    state.infraFiltroMes = '';
    state.infraFiltroDia = '';
    state.infraFiltroFranja = '';
    llenarFiltrosInfra();
    refrescarInfra();
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
    _valorFiltroInfra('filtroInfraEmpresa') ||
    state.infraFiltroMes || state.infraFiltroDia || state.infraFiltroFranja);
}

/** El año de la infracción (la fecha llega como 'AAAA-MM-DD'). */
function _anioInfra(r) {
  return String(r.fecha || '').slice(0, 4);
}

/**
 * Las infracciones que se ven: los selectores, los filtros que salen de tocar
 * un gráfico (mes, día, franja) y, encima, el buscador.
 *
 * `opciones` permite calcular un subconjunto distinto del que se está viendo:
 * `anio` reemplaza el año (para comparar con el anterior) y `sinMes`/`sinDia`/
 * `sinFranja` saltan ese filtro, que es lo que necesitan los paneles que a su
 * vez SON ese filtro para no quedarse con una sola columna en pie.
 */
function _infraccionesFiltradas(opciones) {
  const o = opciones || {};
  let filas = state.infraLista || [];
  const anio = o.anio != null ? o.anio : _valorFiltroInfra('filtroInfraAnio');
  const estado = _valorFiltroInfra('filtroInfraEstado');
  const emp = _valorFiltroInfra('filtroInfraEmpresa');
  if (anio) filas = filas.filter(r => _anioInfra(r) === anio);
  if (estado) filas = filas.filter(r => String(r.estado || '') === estado);
  if (emp) filas = filas.filter(r => String(r.empresa || '').trim() === emp);
  if (!o.sinMes && state.infraFiltroMes) {
    filas = filas.filter(r => _mesInfra(r) === state.infraFiltroMes);
  }
  if (!o.sinDia && state.infraFiltroDia) {
    filas = filas.filter(r => _diaInfra(r) === state.infraFiltroDia);
  }
  if (!o.sinFranja && state.infraFiltroFranja) {
    filas = filas.filter(r => _franjaInfra(r) === state.infraFiltroFranja);
  }

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
            ${r.hora ? `<span class="ehl-hora">${escBandeja(horaBonitaInfra(r.hora))}</span>` : ''}
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

/**
 * Repinta lo que esté a la vista. El listado siempre (sus contadores de arriba
 * se usan en las dos pestañas) y la estadística sólo si está abierta: calcular
 * seis tops en cada tecla del buscador no lo ve nadie.
 */
function refrescarInfra() {
  renderActivosInfra();
  renderInfracciones();
  if (state.infraSubvista === 'estadistica') renderEstadisticaInfra();
}

function moverPaginaInfra(paso) {
  state.infraPagina = (state.infraPagina || 1) + paso;
  renderInfracciones();
  if (els.empresaVistaInfracciones) els.empresaVistaInfracciones.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/* ------------------------------------------------------------------ *
 *  Dimensiones que se calculan de la fecha
 * ------------------------------------------------------------------ *
 *  El Excel traía columnas Año, Mes y Día de la semana al lado de la
 *  fecha. No se importaron: son la misma fecha escrita tres veces, y un
 *  dato duplicado se desincroniza en cuanto alguien corrige uno. Se
 *  calculan aquí. (Se comprobó contra la columna "Día" del propio Excel:
 *  230 de 230 iguales.)
 *
 *  La hora NO se puede calcular de nada, y el Excel no la traía: existe
 *  la columna `hora` en la base para lo que se registre de ahora en
 *  adelante, y las 230 importadas quedan sin ella a propósito.
 */

/**
 * La fecha como Date LOCAL.
 *
 * OJO: new Date('2023-01-04') se interpreta en UTC, y en Colombia (UTC-5)
 * eso devuelve el 3 de enero a las 7 p. m. El día de la semana saldría
 * corrido uno hacia atrás en TODA la estadística.
 */
function _fechaLocalInfra(r) {
  const m = String((r && r.fecha) || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** El mes de la infracción como '01'…'12' (de la cadena, sin pasar por Date). */
function _mesInfra(r) {
  const m = String((r && r.fecha) || '').match(/^\d{4}-(\d{2})/);
  return m ? m[1] : '';
}

/** El día de la semana como '0'…'6', 0 = domingo (igual que Date.getDay()). */
function _diaInfra(r) {
  const dt = _fechaLocalInfra(r);
  return dt ? String(dt.getDay()) : '';
}

/** La hora como número 0–23, o null cuando la infracción no la tiene. */
function _horaInfra(r) {
  const m = String((r && r.hora) || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  return (h >= 0 && h <= 23) ? h : null;
}

/** La franja horaria ('madrugada'…'noche'), o '' si no hay hora. */
function _franjaInfra(r) {
  const h = _horaInfra(r);
  if (h == null) return '';
  const f = FRANJAS.find(x => h >= x.desde && h <= x.hasta);
  return f ? f.clave : '';
}

/** La hora en HH:MM para mostrar ('14:30:00' → '14:30'). */
function horaBonitaInfra(hora) {
  const m = String(hora || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

/* ------------------------------------------------------------------ *
 *  Estadística
 * ------------------------------------------------------------------ *
 *  Se calcula sobre lo FILTRADO, igual que los tres números de arriba:
 *  mirar 2025 en la lista y un gráfico de todos los años al lado haría
 *  imposible cuadrar nada.
 *
 *  Las piezas (tarjetas, barras, columnas) son las de la ficha de
 *  siniestralidad: quien aprendió a leer una, lee la otra. Lo que son dos
 *  valores —pagadas/sin pagar, con o sin solidaridad— va como cifra, no
 *  como gráfico: un gráfico de dos barras es una cifra disfrazada.
 *
 *  Todo gráfico filtra al tocarlo (data-drill). Y cada panel que ES un
 *  filtro se cuenta SIN su propio filtro: si no, al elegir junio el panel
 *  de meses quedaría con una sola columna y no habría forma de pasar a
 *  julio sin limpiar todo. La columna elegida se marca.
 */

/** Cambia entre el listado y la estadística dentro del módulo. */
function cambiarVistaInfra(sub) {
  if (sub !== 'listado' && sub !== 'estadistica') return;
  if (els.infraSubtabs) {
    els.infraSubtabs.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.sub === sub));
  }
  if (els.infraVistaListado) els.infraVistaListado.classList.toggle('hidden', sub !== 'listado');
  if (els.infraVistaEstadistica) els.infraVistaEstadistica.classList.toggle('hidden', sub !== 'estadistica');
  state.infraSubvista = sub;
  if (sub === 'estadistica') renderEstadisticaInfra();
}

/**
 * Agrupa por periodo. Con un año elegido, los doce meses de ese año; sin
 * filtro, un año por columna. Treinta y nueve columnas de mes no se leen, y
 * cuatro de año dicen la tendencia de un vistazo.
 */
function _periodosInfra(filas) {
  const anioFiltro = _valorFiltroInfra('filtroInfraAnio');
  if (anioFiltro) {
    const meses = MESES_INFRA.map((etiqueta, i) => ({
      clave: `${anioFiltro}-${String(i + 1).padStart(2, '0')}`,
      drill: 'mes', val: String(i + 1).padStart(2, '0'),
      etiqueta, anio: anioFiltro.slice(2), n: 0
    }));
    const idx = {};
    meses.forEach((m, i) => { idx[m.clave] = i; });
    filas.forEach(r => {
      const k = String(r.fecha || '').slice(0, 7);
      if (idx[k] != null) meses[idx[k]].n++;
    });
    return meses;
  }
  const anios = [...new Set(filas.map(_anioInfra).filter(Boolean))].sort();
  return anios.map(a => ({
    clave: a, etiqueta: a, anio: '', drill: 'anio', val: a,
    n: filas.filter(r => _anioInfra(r) === a).length
  }));
}

/** Los nombres largos de los meses, para la frase y los tooltips. */
const MESES_LARGOS_INFRA = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Los números y los tops de la estadística.
 *
 * `bases` trae los subconjuntos cruzados que necesitan los paneles que a su
 * vez son filtros (mes, día, franja): cada uno se cuenta sin su propio filtro.
 * Si no se pasan, se usa `filas` para todo, que es lo correcto cuando se
 * calcula sin pantalla (una prueba, una descarga).
 */
function calcularEstadisticaInfra(filas, bases) {
  const b = bases || {};
  const baseMes = b.sinMes || filas;
  const baseDia = b.sinDia || filas;
  const baseFranja = b.sinFranja || filas;
  const basePeriodo = b.periodo || filas;

  const total = filas.length;
  const sinPagar = filas.filter(r => r.estado === 'SIN CANCELAR').length;
  const solidarias = filas.filter(r => r.solidaridad).length;
  const fotomultas = filas.filter(r => r.foto_multa).length;

  const porConductor = _contar(filas, r => String(r.conductor || '').trim());
  const reincidentes = porConductor.filter(x => x.n > 1).length;

  // --- Mes del año: la temporada. Doce posiciones fijas, con ceros: en una
  // serie de meses el hueco es justamente lo que se quiere ver.
  const mesesAnio = MESES_INFRA.map((etiqueta, i) => {
    const val = String(i + 1).padStart(2, '0');
    return {
      etiqueta, anio: '', clave: val, drill: 'mes', val,
      n: baseMes.filter(r => _mesInfra(r) === val).length
    };
  });

  // --- Día de la semana. El Excel ya lo traía como columna; aquí sale de la
  // fecha, que es la única fuente que no se puede desincronizar.
  const dias = _DIAS_CORTOS.map((etiqueta, i) => ({
    etiqueta, anio: '', clave: String(i), drill: 'dia', val: String(i),
    nombre: _DIAS_SEMANA[i],
    n: baseDia.filter(r => _diaInfra(r) === String(i)).length
  }));

  // --- Hora. Las 230 del histórico vinieron sin ella, así que el panel tiene
  // que decir cuántas no la tienen en vez de repartirlas en una franja.
  const conHora = filas.filter(r => _horaInfra(r) != null).length;
  const franjas = FRANJAS.map(f => ({
    nombre: f.etiqueta, clave: f.clave, detalle: f.detalle,
    drill: 'franja', val: f.clave,
    n: baseFranja.filter(r => _franjaInfra(r) === f.clave).length
  }));
  const horas = [];
  for (let h = 0; h < 24; h++) {
    horas.push({
      etiqueta: String(h).padStart(2, '0'), anio: '', clave: String(h),
      n: filas.filter(r => _horaInfra(r) === h).length
    });
  }

  const topCodigos = _contar(filas, r => {
    const c = String(r.codigo || '').trim();
    return c ? c + '|' + String(r.infraccion || '').trim() : '';
  }, 10);
  const topVehiculos = _contar(filas, r => {
    const p = String(r.placa || '').trim();
    return p ? p + (r.numero_interno ? '|' + r.numero_interno : '') : '';
  }, 10);

  // --- Lo que va en la frase de arriba: el pico de cada dimensión.
  const pico = lista => {
    const l = (lista || []).filter(x => x.n > 0).slice().sort((a, b) => b.n - a.n);
    return l.length ? l[0] : null;
  };

  return {
    total, sinPagar, solidarias, fotomultas, reincidentes,
    conductores: porConductor.length,
    periodos: _periodosInfra(basePeriodo),
    mesesAnio, dias, franjas, horas, conHora, sinHora: total - conHora,
    picoMes: pico(mesesAnio), picoDia: pico(dias), picoFranja: pico(franjas),
    topCodigos,
    topConductores: porConductor.slice(0, 10),
    topVehiculos,
    codigosDistintos: _contar(filas, r => String(r.codigo || '').trim()).length,
    rutas: _contar(filas, r => String(r.ruta || '').trim(), 10),
    empresas: _contar(filas, r => String(r.empresa || '').trim())
  };
}

/** Un panel con título, subtítulo y contenido. */
function _panelInfra(titulo, sub, cuerpo) {
  return `<div class="dash-panel">
    <div class="dash-panel-head">
      <h3>${escBandeja(titulo)}</h3>
      ${sub ? `<span class="dash-panel-sub">${escBandeja(sub)}</span>` : ''}
    </div>
    ${cuerpo}
  </div>`;
}

/**
 * Columnas por periodo, clicables.
 *
 * Es la misma pieza de la ficha (_mesesFicha) más el drill y la marca de la
 * columna elegida. No se reutiliza la de allá porque allá una columna no
 * filtra nada: aquí es el gesto principal de la pantalla.
 */
function _columnasInfra(lista, sustantivo, seleccion) {
  const uno = sustantivo || 'infracción';
  const varios = uno === 'infracción' ? 'infracciones' : uno + 's';
  const max = Math.max(1, ...lista.map(x => x.n));
  const ALTO = 140;
  return `<div class="dash-cols">${lista.map(x => {
    const h = x.n ? Math.max(4, Math.round((x.n / max) * ALTO)) : 2;
    const sel = seleccion && x.val && String(seleccion) === String(x.val);
    const clic = x.drill
      ? ` dash-clic${sel ? ' es-sel' : ''}" role="button" tabindex="0"` +
        ` data-drill="${escBandeja(x.drill)}" data-val="${escBandeja(x.val)}`
      : '';
    const tip = x.tip || `${x.etiqueta} ${x.anio || ''}: ${x.n} ${x.n === 1 ? uno : varios}`;
    return `<div class="dash-col${clic}" title="${escBandeja(tip.trim())}">
      <span class="dash-col-val">${x.n || ''}</span>
      <span class="dash-col-bar" style="height:${h}px"></span>
      <span class="dash-col-lab">${escBandeja(x.etiqueta)}${
        x.anio ? `<small>${escBandeja(x.anio)}</small>` : ''}</span>
    </div>`;
  }).join('')}</div>`;
}

/** Barras horizontales clicables (las de la ficha más el drill). */
function _barrasInfra(lista, opciones) {
  const o = opciones || {};
  if (!lista.length) {
    return `<div class="tercero-estado">${escBandeja(o.vacio || 'Sin datos en lo que estás viendo.')}</div>`;
  }
  const max = lista[0].n || Math.max(1, ...lista.map(x => x.n));
  const total = o.total || lista.reduce((s, x) => s + x.n, 0);
  return `<div class="dash-bars${o.rank === false ? ' dash-bars-estado' : ''}">${lista.map((x, i) => {
    const pct = Math.max(4, Math.round((x.n / (max || 1)) * 100));
    const etiqueta = o.etiqueta ? o.etiqueta(x, i) : escBandeja(x.nombre);
    const sufijo = o.porcentaje && total
      ? ` <small class="fe-pct">${Math.round((x.n / total) * 100)}%</small>` : '';
    const sel = o.seleccion && x.val && String(o.seleccion) === String(x.val);
    const clic = (o.drill || x.drill)
      ? ` dash-clic${sel ? ' es-sel' : ''}" role="button" tabindex="0"` +
        ` data-drill="${escBandeja(x.drill || o.drill)}" data-val="${escBandeja(x.val != null ? x.val : x.nombre)}`
      : '';
    return `<div class="dash-bar-row${o.rank === false ? ' fe-sin-rank' : ''}` +
      `${i === 0 && o.destacarPrimero ? ' es-lider' : ''}${clic}"` +
      `${x.tip ? ` title="${escBandeja(x.tip)}"` : ''}>
      ${o.rank === false ? '' : `<span class="dash-bar-rank">${i + 1}</span>`}
      <span class="dash-bar-nom">${etiqueta}</span>
      <span class="dash-bar-track"><span class="dash-bar-fill" style="width:${pct}%"></span></span>
      <span class="dash-bar-val">${x.n}${sufijo}</span>
    </div>`;
  }).join('')}</div>`;
}

/** Dibuja la estadística de lo que se está viendo. */
function renderEstadisticaInfra() {
  const cont = els.infraEstadistica;
  if (!cont) return;

  const filas = _infraccionesFiltradas();
  if (!filas.length) {
    cont.innerHTML = `<div class="dash-panel"><div class="tercero-estado">${
      _hayFiltroInfra()
        ? 'Ningún comparendo coincide con lo que estás filtrando.'
        : 'Todavía no hay infracciones registradas.'
    }</div></div>`;
    return;
  }

  const anio = _valorFiltroInfra('filtroInfraAnio');
  const m = calcularEstadisticaInfra(filas, {
    sinMes: _infraccionesFiltradas({ sinMes: true }),
    sinDia: _infraccionesFiltradas({ sinDia: true }),
    sinFranja: _infraccionesFiltradas({ sinFranja: true }),
    // Con un año elegido el panel de periodo muestra sus doce meses: tiene que
    // contarlos sin el filtro de mes o quedaría una sola columna en pie.
    periodo: anio ? _infraccionesFiltradas({ sinMes: true }) : filas
  });
  const pct = n => m.total ? Math.round((n / m.total) * 100) + '%' : '—';

  // --- Comparación con el año anterior, cuando hay un año elegido ---------
  // Un número suelto no dice si se está mejorando. Sólo se compara si ese año
  // anterior existe de verdad en los datos: si no, "bajó 100%" sería mentira.
  let notaTotal = 'En lo que estás viendo';
  if (anio) {
    const previo = String(Number(anio) - 1);
    const hayPrevio = (state.infraLista || []).some(r => _anioInfra(r) === previo);
    if (hayPrevio) {
      const nPrevio = _infraccionesFiltradas({ anio: previo }).length;
      if (nPrevio > 0) {
        const v = Math.round(((m.total - nPrevio) / nPrevio) * 100);
        const cls = v === 0 ? 'fe-igual' : (v > 0 ? 'fe-sube' : 'fe-baja');
        notaTotal = `<span class="fe-var ${cls}">${v === 0 ? '=' : (v > 0 ? '▲' : '▼')} ` +
          `${Math.abs(v)}%</span> vs. ${previo} (${formatNumber(nPrevio)})`;
      }
    } else {
      notaTotal = `En ${anio} · sin ${previo} para comparar`;
    }
  }

  const kpis = `<div class="dash-kpis">
    ${_kpiFicha(formatNumber(m.total), 'Infracciones', notaTotal)}
    ${_kpiFicha(formatNumber(m.sinPagar), 'Sin cancelar', `${pct(m.sinPagar)} del total`,
      m.sinPagar ? 'warn' : 'ok')}
    ${_kpiFicha(formatNumber(m.solidarias), 'Responde la empresa',
      `${pct(m.solidarias)} con responsabilidad solidaria`, m.solidarias ? 'warn' : 'ok')}
    ${_kpiFicha(formatNumber(m.reincidentes), 'Conductores reincidentes',
      `De ${formatNumber(m.conductores)} conductores con comparendo`, 'info')}
  </div>`;

  // --- La conclusión en una frase ----------------------------------------
  // Lo más directo que puede dar la pantalla: quien no va a leer ocho gráficos
  // se lleva igual lo que tiene que hacer mañana.
  const trozos = [];
  if (m.picoMes) {
    trozos.push(`el mes que más repite es <b>${escBandeja(MESES_LARGOS_INFRA[Number(m.picoMes.val) - 1])}</b>` +
      ` (${formatNumber(m.picoMes.n)})`);
  }
  if (m.picoDia) {
    trozos.push(`el día, el <b>${escBandeja(m.picoDia.nombre.toLowerCase())}</b> (${formatNumber(m.picoDia.n)})`);
  }
  if (m.picoFranja) {
    trozos.push(`la franja, la <b>${escBandeja(m.picoFranja.nombre.toLowerCase())}</b> (${formatNumber(m.picoFranja.n)})`);
  }
  if (m.topCodigos.length) {
    const p = m.topCodigos[0].nombre.split('|');
    trozos.push(`el código <b>${escBandeja(p[0])}</b>${p[1] ? ' — ' + escBandeja(p[1]) : ''}` +
      ` (${formatNumber(m.topCodigos[0].n)})`);
  }
  if (m.topVehiculos.length && m.topVehiculos[0].n > 1) {
    trozos.push(`y el vehículo <b>${escBandeja(m.topVehiculos[0].nombre.split('|')[0])}</b>` +
      ` (${formatNumber(m.topVehiculos[0].n)})`);
  }
  const frase = trozos.length
    ? `<div class="dash-panel inf-frase"><p>📌 De las <b>${formatNumber(m.total)}</b> que estás viendo, ${
        trozos.join(', ')}.</p></div>`
    : '';

  const porPeriodo = _panelInfra(
    '📅 Cuándo se cometieron',
    anio ? `Mes a mes de ${anio} · toca un mes para verlo solo` : 'Un año por columna · toca uno para entrar',
    _columnasInfra(m.periodos, 'infracción', anio ? state.infraFiltroMes : anio));

  // El mes del año sólo cuando NO hay un año elegido: con uno, el panel de
  // arriba ya son sus doce meses y este diría lo mismo.
  const porMes = !anio ? _panelInfra(
    '📆 En qué mes del año',
    'Los cuatro años juntos: es la temporada, no la tendencia',
    _columnasInfra(m.mesesAnio, 'infracción', state.infraFiltroMes)) : '';

  const porDia = _panelInfra(
    '🗓️ Qué día de la semana',
    m.picoDia ? `El peor es el ${m.picoDia.nombre.toLowerCase()}` : '',
    _columnasInfra(m.dias, 'infracción', state.infraFiltroDia));

  // --- Hora ---------------------------------------------------------------
  // El histórico vino sin hora. Decirlo es más útil que esconder el panel: así
  // se entiende por qué no hay nada y dónde se empieza a llenar.
  const porHora = m.conHora
    ? _panelInfra('🕐 A qué hora',
        `${formatNumber(m.conHora)} de ${formatNumber(m.total)} tienen la hora registrada` +
        (m.sinHora ? ` · ${formatNumber(m.sinHora)} sin hora` : ''),
        _barrasInfra(m.franjas, {
          rank: false, porcentaje: true, total: m.conHora, seleccion: state.infraFiltroFranja,
          etiqueta: x => `${escBandeja(x.nombre)} <small class="fe-sub">${escBandeja(x.detalle)}</small>`
        }) + (m.conHora > 3 ? _columnasInfra(m.horas, 'infracción', '') : ''))
    : _panelInfra('🕐 A qué hora', 'Ninguna de las que estás viendo tiene la hora',
        `<div class="tercero-estado">El histórico que se importó del Excel no traía la hora
         (17 columnas y ninguna de hora), así que las ${formatNumber(m.total)} que estás
         viendo están sin ella. El campo <b>Hora</b> ya está en el formulario: las que
         registres o corrijas de ahora en adelante van a aparecer acá, por franja y por
         hora exacta.</div>`);

  // El top de códigos es el panel accionable: dice en qué capacitar.
  const codigos = _panelInfra(
    '🚦 Qué se está infringiendo',
    `${formatNumber(m.topCodigos.length)} de ${formatNumber(m.codigosDistintos)} códigos distintos`,
    _barrasInfra(m.topCodigos.map(x => {
      const [cod, desc] = x.nombre.split('|');
      return { nombre: cod, n: x.n, _desc: desc || '', drill: 'texto', val: cod,
               tip: `Ver las ${x.n} de ${cod}${desc ? ' — ' + desc : ''}` };
    }), {
      porcentaje: true, total: m.total,
      etiqueta: x => `<b>${escBandeja(x.nombre)}</b>${x._desc
        ? ` <small class="inf-barra-desc">${escBandeja(x._desc)}</small>` : ''}`
    }));

  const conductores = _panelInfra(
    '👤 Conductores con más comparendos',
    m.reincidentes ? `${formatNumber(m.reincidentes)} tienen más de uno` : 'Ninguno repite',
    _barrasInfra(m.topConductores.map(x => ({
      nombre: tituloCaseFicha(x.nombre), n: x.n, drill: 'texto', val: x.nombre,
      tip: `Ver los ${x.n} de ${tituloCaseFicha(x.nombre)}`
    })), { porcentaje: true, total: m.total, destacarPrimero: true }));

  const vehiculos = _panelInfra(
    '🚌 Vehículos con más comparendos', '',
    _barrasInfra(m.topVehiculos.map(x => {
      const [placa, interno] = x.nombre.split('|');
      return { nombre: placa, n: x.n, _int: interno || '', drill: 'texto', val: placa,
               tip: `Ver los ${x.n} de ${placa}` };
    }), {
      porcentaje: true, total: m.total, destacarPrimero: true,
      etiqueta: x => `<b>${escBandeja(x.nombre)}</b>${x._int
        ? ` <small class="inf-barra-desc">Interno ${escBandeja(x._int)}</small>` : ''}`
    }));

  const rutas = m.rutas.length > 1
    ? _panelInfra('🛣️ Por ruta', '', _barrasInfra(m.rutas.map(x => ({
        nombre: x.nombre, n: x.n, drill: 'texto', val: x.nombre,
        tip: `Ver las ${x.n} de ${x.nombre}`
      })), { rank: false, porcentaje: true, total: m.total }))
    : '';

  // Sólo con varias empresas: una barra sola es el número que ya está arriba.
  const empresas = m.empresas.length > 1
    ? _panelInfra('🏢 Por empresa', '', _barrasInfra(m.empresas.map(x => ({
        nombre: x.nombre, n: x.n, drill: 'empresa', val: x.nombre,
        tip: `Ver las ${x.n} de ${x.nombre}`
      })), { rank: false, porcentaje: true, total: m.total,
             seleccion: _valorFiltroInfra('filtroInfraEmpresa') }))
    : '';

  const nota = m.fotomultas
    ? `<p class="audio-nota">📸 ${formatNumber(m.fotomultas)} (${pct(m.fotomultas)}) se detectaron por fotomulta.</p>`
    : '';

  cont.innerHTML = kpis + frase + porPeriodo + porMes + porDia + porHora +
    codigos + conductores + vehiculos + rutas + empresas + nota;
}

/**
 * Clic (o Enter) sobre un gráfico: aplica el filtro y repinta.
 *
 * Es lo que hace la pantalla dinámica: de "junio es el peor mes" a ver esas
 * infracciones no hay que pasar por ningún selector. Volver a tocar lo que ya
 * está elegido lo quita, así que el mismo gesto entra y sale.
 */
function onInfraDrill(evento) {
  const el = evento.target.closest('[data-drill]');
  if (!el) return;
  if (evento.type === 'keydown' && evento.key !== 'Enter' && evento.key !== ' ') return;
  if (evento.type === 'keydown') evento.preventDefault();

  const tipo = el.dataset.drill;
  const val = el.dataset.val || '';
  const alternar = (actual, nuevo) => (String(actual) === String(nuevo) ? '' : nuevo);

  if (tipo === 'anio' && els.filtroInfraAnio) {
    els.filtroInfraAnio.value = alternar(els.filtroInfraAnio.value, val);
  } else if (tipo === 'mes') {
    state.infraFiltroMes = alternar(state.infraFiltroMes, val);
  } else if (tipo === 'dia') {
    state.infraFiltroDia = alternar(state.infraFiltroDia, val);
  } else if (tipo === 'franja') {
    state.infraFiltroFranja = alternar(state.infraFiltroFranja, val);
  } else if (tipo === 'empresa' && els.filtroInfraEmpresa) {
    els.filtroInfraEmpresa.value = alternar(els.filtroInfraEmpresa.value, val);
  } else if (tipo === 'texto' && els.buscarInfra) {
    // Un código, una placa, un conductor: va al buscador, que es donde el
    // usuario puede verlo y borrarlo. Nada de filtros invisibles.
    els.buscarInfra.value = els.buscarInfra.value.trim() === val ? '' : val;
  } else {
    return;
  }
  state.infraPagina = 1;
  refrescarInfra();
}

/**
 * Los filtros que no tienen un control visible (mes, día y franja salen de
 * tocar un gráfico) se muestran como chips con una ✕.
 *
 * Sin esto quedarían filtros invisibles: la lista mostraría 45 de 230 y nada
 * en la pantalla diría por qué.
 */
function renderActivosInfra() {
  const cont = els.infraActivos;
  if (!cont) return;
  const chips = [];
  if (state.infraFiltroMes) {
    chips.push(['mes', '📆 ' + MESES_LARGOS_INFRA[Number(state.infraFiltroMes) - 1]]);
  }
  if (state.infraFiltroDia) {
    chips.push(['dia', '🗓️ ' + _DIAS_SEMANA[Number(state.infraFiltroDia)]]);
  }
  if (state.infraFiltroFranja) {
    const f = FRANJAS.find(x => x.clave === state.infraFiltroFranja);
    chips.push(['franja', '🕐 ' + (f ? f.etiqueta : state.infraFiltroFranja)]);
  }
  cont.innerHTML = chips.map(([campo, etiqueta]) =>
    `<button type="button" class="inf-activo" data-quitar="${campo}"` +
    ` title="Quitar este filtro">${escBandeja(etiqueta)} <span aria-hidden="true">✕</span></button>`).join('');
  cont.classList.toggle('hidden', !chips.length);
}

/* ------------------------------------------------------------------ *
 *  Alta / edición
 * ------------------------------------------------------------------ */

/** Los campos del formulario, con su columna en la base. */
const INFRA_FORM = {
  empresa: 'infraEmpresa',
  placa: 'infraPlaca',
  fecha: 'infraFecha',
  hora: 'infraHora',
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
      ? [fila.placa,
         fechaBonitaInfra(fila.fecha) + (fila.hora ? ' ' + horaBonitaInfra(fila.hora) : ''),
         fila.comparendo ? `Comparendo ${fila.comparendo}` : '']
          .filter(Boolean).join('  ·  ')
      : 'La placa y la fecha son obligatorias; la hora ayuda a la estadística.';
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
    // La hora es opcional y va como null, no como '': una columna `time` no
    // acepta la cadena vacía y el guardado fallaría con un error de tipos.
    hora: String((els.infraHora && els.infraHora.value) || '').trim() || null,
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
    HORA: horaBonitaInfra(r.hora),
    'DIA DE LA SEMANA': _DIAS_SEMANA[Number(_diaInfra(r))] || '',
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
  if (els.infraSubtabs) {
    els.infraSubtabs.addEventListener('click', event => {
      const b = event.target.closest('.tab');
      if (b) cambiarVistaInfra(b.dataset.sub);
    });
  }
  const refiltrar = () => { state.infraPagina = 1; refrescarInfra(); };
  cablearBuscador(els.buscarInfra, refiltrar);
  ['filtroInfraAnio', 'filtroInfraEstado', 'filtroInfraEmpresa'].forEach(id => {
    if (els[id]) els[id].addEventListener('change', refiltrar);
  });
  // Los gráficos filtran al tocarlos. Por delegación: el contenedor sobrevive
  // al reemplazo de innerHTML en cada redibujado.
  if (els.infraEstadistica) {
    els.infraEstadistica.addEventListener('click', onInfraDrill);
    els.infraEstadistica.addEventListener('keydown', onInfraDrill);
  }
  // Y la ✕ de cada chip quita ese filtro.
  if (els.infraActivos) {
    els.infraActivos.addEventListener('click', event => {
      const b = event.target.closest('[data-quitar]');
      if (!b) return;
      if (b.dataset.quitar === 'mes') state.infraFiltroMes = '';
      else if (b.dataset.quitar === 'dia') state.infraFiltroDia = '';
      else if (b.dataset.quitar === 'franja') state.infraFiltroFranja = '';
      refiltrar();
    });
  }
  if (els.btnInfraFiltrosLimpiar) {
    els.btnInfraFiltrosLimpiar.addEventListener('click', () => {
      if (els.buscarInfra) els.buscarInfra.value = '';
      ['filtroInfraAnio', 'filtroInfraEstado', 'filtroInfraEmpresa']
        .forEach(id => { if (els[id]) els[id].value = ''; });
      state.infraFiltroMes = '';
      state.infraFiltroDia = '';
      state.infraFiltroFranja = '';
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
