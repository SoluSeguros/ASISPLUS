/**
 * ficha-empresa.js
 * Ficha de siniestralidad de UNA empresa transportadora.
 *
 * La misma ficha la usan los dos lados: el portal de la empresa (que ve la
 * suya, acotada por la RLS) y el dashboard de SoluAsistencia (que elige
 * cualquiera). Es deliberado: si las dos partes miran números calculados igual
 * y llamados igual, la conversación mensual deja de ser sobre qué significa
 * cada cifra.
 *
 * Qué métricas hay y por qué esas: se eligieron por cobertura real del dato,
 * medida sobre los 2.791 casos. Fecha, hora, placa y conductor están al 100 %;
 * gravedad y responsabilidad al 91 %; ruta al 64 %. En cambio TIPO DE EVENTO,
 * FACTOR DE RIESGO e HIPOTESIS solo los llena la app nueva y están por debajo
 * del 3 %, así que una gráfica de esos campos hoy saldría casi vacía y haría
 * creer que no pasa nada. No están. Cuando la app acumule historia, se agregan.
 *
 * Sin librerías: barras HTML/CSS, igual que dashboard.js.
 */

/** Escapa texto para insertarlo con seguridad en HTML. */
function escFicha(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Normaliza un valor de texto para agrupar (mayúsculas, sin espacios dobles). */
function _normFicha(v) {
  return String(v == null ? '' : v).trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Hora del siniestro como número 0-23, o null.
 * El dato viene como "8:00:00", "16:00" o "19:00:00" según la época.
 */
function _horaCaso(f) {
  const s = String((f.datos && f.datos['HORA DEL SINIESTRO']) || '').trim();
  const m = s.match(/^(\d{1,2})\s*:/);
  if (!m) return null;
  const h = Number(m[1]);
  return (h >= 0 && h <= 23) ? h : null;
}

// Franjas pensadas para la operación de transporte, no para el reloj: lo que
// le sirve a la empresa es saber si el problema está en el pico de la mañana,
// en el de la tarde o en la noche.
const FRANJAS = [
  { clave: 'madrugada', etiqueta: 'Madrugada', detalle: '12 a. m. – 6 a. m.', desde: 0, hasta: 5 },
  { clave: 'manana', etiqueta: 'Mañana', detalle: '6 a. m. – 12 m.', desde: 6, hasta: 11 },
  { clave: 'tarde', etiqueta: 'Tarde', detalle: '12 m. – 6 p. m.', desde: 12, hasta: 17 },
  { clave: 'noche', etiqueta: 'Noche', detalle: '6 p. m. – 12 a. m.', desde: 18, hasta: 23 }
];

// Valores que el AppSheet anterior metía en el campo RUTA y que no son rutas
// sino el estado del caso. Se miden y se excluyen para no dibujar un "top de
// rutas" que en realidad sería un top de estados.
const RUTAS_NO_VALIDAS = new Set([
  'PENDIENTE', 'FINALIZADO', 'NO CONCILIADO', 'INTERVENIDO POR TRANSITO',
  'EN CONTRA', 'A FAVOR', 'DESISTIMIENTO', 'CONCILIADO', 'CERRADO'
]);

const _DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const _DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** Cuenta ocurrencias de un valor en las filas y devuelve [{nombre, n}] ordenado. */
function _contar(rows, valorFn, limite) {
  const m = new Map();
  rows.forEach(f => {
    const v = valorFn(f);
    if (!v) return;
    m.set(v, (m.get(v) || 0) + 1);
  });
  const lista = [...m.entries()]
    .map(([nombre, n]) => ({ nombre, n }))
    .sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre));
  return limite ? lista.slice(0, limite) : lista;
}

/**
 * Ventana de meses de la ficha. Por defecto los últimos 12 meses.
 *
 * OJO: no se usa el primer y último siniestro de la empresa como ventana. Una
 * empresa con un solo caso registrado ayer daría "1 caso en 1 día" y la tasa
 * mensual se dispararía a cifras absurdas (se midió: salían 1.522 por cada 100
 * vehículos). Una ventana fija hace comparables a todas.
 */
function _ventanaFicha(opciones) {
  const hoy = (opciones && opciones.hoy) || new Date();
  let fin = (opciones && opciones.hasta) ? new Date(opciones.hasta) : hoy;
  let ini = (opciones && opciones.desde) ? new Date(opciones.desde) : null;
  if (!ini) {
    ini = new Date(fin.getFullYear(), fin.getMonth() - 11, 1);
  }
  const iniMes = new Date(ini.getFullYear(), ini.getMonth(), 1);
  const finMes = new Date(fin.getFullYear(), fin.getMonth(), 1);
  let meses = (finMes.getFullYear() - iniMes.getFullYear()) * 12 + (finMes.getMonth() - iniMes.getMonth()) + 1;
  if (meses < 1) meses = 1;
  if (meses > 24) meses = 24;
  return { desde: iniMes, hasta: fin, iniMes, finMes, meses };
}

/** ¿La fecha del caso cae dentro de [desde, hasta]? */
function _enVentana(dt, desde, hasta) {
  if (!dt) return false;
  if (desde && dt < desde) return false;
  if (hasta && dt > hasta) return false;
  return true;
}

/**
 * Calcula todas las métricas de una empresa.
 *
 * @param {Array}  rows       casos de la empresa (ya filtrados por empresa).
 * @param {number} vehiculos  tamaño del parque automotor (0 si no se conoce).
 * @param {Object} opciones   {desde, hasta, hoy}
 */
function calcularFichaEmpresa(rows, vehiculos, opciones) {
  const v = _ventanaFicha(opciones || {});
  const todas = rows || [];

  // Periodo actual y el inmediatamente anterior, de la misma duración, para
  // poder decir "subió" o "bajó" en vez de soltar un número suelto.
  const msVentana = v.hasta - v.desde;
  const desdeAnt = new Date(v.desde.getTime() - msVentana);
  const hastaAnt = new Date(v.desde.getTime() - 1);

  const dentro = [];
  const anteriores = [];
  todas.forEach(f => {
    const dt = _fechaCaso(f);
    if (_enVentana(dt, v.desde, v.hasta)) dentro.push(f);
    else if (_enVentana(dt, desdeAnt, hastaAnt)) anteriores.push(f);
  });

  const total = dentro.length;
  const totalAnterior = anteriores.length;

  // --- Casos por mes ---
  const meses = [];
  for (let i = 0; i < v.meses; i++) {
    const dt = new Date(v.iniMes.getFullYear(), v.iniMes.getMonth() + i, 1);
    meses.push({
      clave: _claveMes(dt),
      etiqueta: _MESES_CORTOS[dt.getMonth()],
      anio: String(dt.getFullYear()).slice(2),
      n: 0
    });
  }
  const idxMes = {};
  meses.forEach((m, i) => { idxMes[m.clave] = i; });
  dentro.forEach(f => {
    const dt = _fechaCaso(f);
    if (!dt) return;
    const k = _claveMes(dt);
    if (idxMes[k] != null) meses[idxMes[k]].n++;
  });

  // --- Tasa normalizada por parque ---
  // Sin esto no se pueden comparar empresas: 411 casos en una flota de 103
  // buses y 184 en una de 597 no son el mismo problema.
  const casosMes = v.meses > 0 ? total / v.meses : 0;
  const tasaPor100 = vehiculos > 0 ? (casosMes / vehiculos) * 100 : null;

  // --- Gravedad y responsabilidad ---
  const gravedad = _contar(dentro, f => _normFicha(f.datos && f.datos['GRAVEDAD DEL SINIESTRO']));
  const responsabilidad = _contar(dentro, f => _normFicha(f.datos && f.datos['RESPONSABILIDAD DEL CONDUCTOR']));
  const conResp = responsabilidad.reduce((s, r) => s + r.n, 0);
  const respSi = (responsabilidad.find(r => r.nombre === 'SI') || { n: 0 }).n;

  // --- Lesionados: cuenta el campo explícito o una gravedad que lo implique ---
  const conLesionados = dentro.filter(f => {
    const d = f.datos || {};
    const les = String(d['LESIONADOS'] || '').trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (/^si\b/.test(les)) return true;
    const g = _normFicha(d['GRAVEDAD DEL SINIESTRO']);
    return g === 'HOMICIDIO' || g === 'DAÑOS Y LESIONES' || g === 'HERIDOS';
  }).length;

  // --- Reincidencia: el hallazgo más accionable de toda la ficha ---
  const topVehiculos = _contar(dentro, f => {
    const d = f.datos || {};
    const placa = _normFicha(d['PLACA VEHICULO']).replace(/\s+/g, '');
    if (!placa) return '';
    const interno = String(d['NUMERO INTERNO VEHICULO'] || '').trim();
    return interno ? `${placa}|${interno}` : placa;
  }, 10).map(x => {
    const p = x.nombre.split('|');
    return { placa: p[0], interno: p[1] || '', n: x.n };
  });

  const topConductores = _contar(dentro, f => _normFicha(f.datos && f.datos['NOMBRE CONDUCTOR']), 10);
  // RUTA viene envenenado del AppSheet viejo: en 1.747 de 1.788 registros
  // guarda un ESTADO del caso ("PENDIENTE", "FINALIZADO", "NO CONCILIADO"…),
  // no la ruta del vehículo. Se descartan esos valores; si lo que queda no
  // alcanza para decir algo, el panel no se dibuja. La app nueva sí pide la
  // ruta de verdad, así que el panel aparecerá solo cuando haya con qué.
  const topRutas = _contar(dentro, f => {
    const r = _normFicha(f.datos && f.datos['RUTA']);
    return RUTAS_NO_VALIDAS.has(r) ? '' : r;
  }, 8);

  // --- Cuándo pasan: franja horaria y día de la semana ---
  const franjas = FRANJAS.map(fr => ({ ...fr, n: 0 }));
  let sinHora = 0;
  dentro.forEach(f => {
    const h = _horaCaso(f);
    if (h == null) { sinHora++; return; }
    const fr = franjas.find(x => h >= x.desde && h <= x.hasta);
    if (fr) fr.n++;
  });

  const dias = _DIAS_SEMANA.map((nombre, i) => ({ nombre, corto: _DIAS_CORTOS[i], n: 0 }));
  dentro.forEach(f => {
    const dt = _fechaCaso(f);
    if (dt) dias[dt.getDay()].n++;
  });

  // --- Estado de los casos ---
  const abiertos = dentro.filter(f => !['CERRADO', 'CANCELADO', 'HISTORICO'].includes(f.estado)).length;
  const cerrados = dentro.filter(f => f.estado === 'CERRADO'
    || _normFicha(f.datos && f.datos['ESTADO DEL SINIESTRO']) === 'CERRADO').length;

  return {
    ventana: v,
    total, totalAnterior,
    variacion: totalAnterior > 0 ? Math.round(((total - totalAnterior) / totalAnterior) * 100) : null,
    meses,
    vehiculos: vehiculos || 0,
    casosMes, tasaPor100,
    gravedad, responsabilidad,
    porcResponsable: conResp > 0 ? Math.round((respSi / conResp) * 100) : null,
    conLesionados,
    porcLesionados: total > 0 ? Math.round((conLesionados / total) * 100) : 0,
    topVehiculos, topConductores, topRutas,
    franjas, sinHora, dias,
    abiertos, cerrados
  };
}

/* ------------------------------------------------------------------ *
 *  Dibujo
 * ------------------------------------------------------------------ */

/** Tarjeta KPI con una nota al pie opcional (la variación, la base de cálculo). */
function _kpiFicha(valor, etiqueta, nota, tono, drill) {
  const clic = drill ? ` dash-clic" role="button" tabindex="0" data-drill="${escFicha(drill)}` : '';
  return `<div class="dash-kpi fe-kpi${tono ? ' k-' + tono : ''}${clic}">
    <span class="dash-kpi-n">${escFicha(valor)}</span>
    <span class="dash-kpi-l">${escFicha(etiqueta)}</span>
    ${nota ? `<span class="fe-kpi-nota">${nota}</span>` : ''}
  </div>`;
}

/** Barras horizontales reutilizables (top de placas, conductores, rutas…). */
function _barrasFicha(lista, opciones) {
  const o = opciones || {};
  if (!lista.length) return `<div class="tercero-estado">${escFicha(o.vacio || 'Sin datos en el periodo.')}</div>`;
  const max = lista[0].n || 1;
  const total = o.total || lista.reduce((s, x) => s + x.n, 0);
  let html = '';
  lista.forEach((x, i) => {
    const pct = Math.max(4, Math.round((x.n / max) * 100));
    const etiqueta = o.etiqueta ? o.etiqueta(x, i) : escFicha(x.nombre);
    const sufijo = o.porcentaje && total
      ? ` <small class="fe-pct">${Math.round((x.n / total) * 100)}%</small>`
      : '';
    html += `<div class="dash-bar-row${o.rank === false ? ' fe-sin-rank' : ''}${i === 0 && o.destacarPrimero ? ' es-lider' : ''}">
      ${o.rank === false ? '' : `<span class="dash-bar-rank">${i + 1}</span>`}
      <span class="dash-bar-nom">${etiqueta}</span>
      <span class="dash-bar-track"><span class="dash-bar-fill" style="width:${pct}%"></span></span>
      <span class="dash-bar-val">${x.n}${sufijo}</span>
    </div>`;
  });
  return `<div class="dash-bars${o.rank === false ? ' dash-bars-estado' : ''}">${html}</div>`;
}

/** Columnas de casos por mes. */
function _mesesFicha(meses) {
  const max = Math.max(1, ...meses.map(m => m.n));
  const ALTO = 140;
  let html = '';
  meses.forEach(m => {
    const h = m.n ? Math.max(4, Math.round((m.n / max) * ALTO)) : 2;
    html += `<div class="dash-col" title="${escFicha(m.etiqueta)} ${escFicha(m.anio)}: ${m.n} caso${m.n === 1 ? '' : 's'}">
      <span class="dash-col-val">${m.n || ''}</span>
      <span class="dash-col-bar" style="height:${h}px"></span>
      <span class="dash-col-lab">${escFicha(m.etiqueta)}<small>${escFicha(m.anio)}</small></span>
    </div>`;
  });
  return `<div class="dash-cols">${html}</div>`;
}

/** Formatea un número con separador de miles si existe el ayudante global. */
function _numFicha(n) {
  return (typeof formatNumber === 'function') ? formatNumber(n) : String(n);
}

/** Nombre corto de mes/año para el encabezado del periodo. */
function _mesLargo(dt) {
  return `${_MESES_CORTOS[dt.getMonth()]} ${dt.getFullYear()}`;
}

/**
 * Dibuja la ficha completa dentro de un contenedor.
 *
 * @param {HTMLElement} cont
 * @param {Object} m         lo que devuelve calcularFichaEmpresa
 * @param {Object} opciones  {nombreEmpresa, mostrarParque}
 */
function renderFichaEmpresa(cont, m, opciones) {
  if (!cont) return;
  const o = opciones || {};

  if (!m.total && !m.totalAnterior) {
    cont.innerHTML = `<div class="dash-panel"><div class="tercero-estado">
      Todavía no hay siniestros registrados en este periodo.
    </div></div>`;
    return;
  }

  const periodo = `${_mesLargo(m.ventana.iniMes)} – ${_mesLargo(m.ventana.finMes)}`;

  // --- KPIs ---
  let notaVar = '';
  if (m.variacion != null) {
    const sube = m.variacion > 0;
    const igual = m.variacion === 0;
    notaVar = `<span class="fe-var ${igual ? 'fe-igual' : (sube ? 'fe-sube' : 'fe-baja')}">`
      + `${igual ? '=' : (sube ? '▲' : '▼')} ${Math.abs(m.variacion)}%</span> vs. periodo anterior`;
  } else {
    notaVar = 'Sin periodo anterior para comparar';
  }

  const tasaTxt = m.tasaPor100 != null ? m.tasaPor100.toFixed(1) : '—';
  const notaTasa = m.tasaPor100 != null
    ? `${_numFicha(m.vehiculos)} vehículos en el parque`
    : 'Falta el parque automotor para calcularla';

  const kpis = `<div class="dash-kpis">
    ${_kpiFicha(_numFicha(m.total), 'Siniestros en el periodo', notaVar)}
    ${_kpiFicha(tasaTxt, 'Por cada 100 vehículos al mes', notaTasa, 'info')}
    ${_kpiFicha(m.porcResponsable != null ? m.porcResponsable + '%' : '—', 'Responsabilidad del conductor',
      m.porcResponsable != null ? 'De los casos con responsabilidad definida' : 'Sin dato de responsabilidad', 'warn')}
    ${_kpiFicha(_numFicha(m.conLesionados), 'Casos con lesionados',
      `${m.porcLesionados}% del total del periodo`, m.conLesionados ? 'warn' : 'ok')}
  </div>`;

  // --- Casos por mes ---
  const mesesBlock = `<div class="dash-panel">
    <div class="dash-panel-head">
      <h3>📅 Siniestros por mes</h3>
      <span class="dash-panel-sub">${periodo} · ${_numFicha(m.total)} en total</span>
    </div>
    ${_mesesFicha(m.meses)}
  </div>`;

  // --- Reincidencia (lo que la empresa puede accionar mañana) ---
  const vehLista = m.topVehiculos.map(x => ({
    nombre: x.placa,
    n: x.n,
    interno: x.interno
  }));
  const repetidos = m.topVehiculos.filter(x => x.n > 1).length;
  const vehBlock = `<div class="dash-panel">
    <div class="dash-panel-head">
      <h3>🚌 Vehículos con más siniestros</h3>
      <span class="dash-panel-sub">${repetidos ? `${repetidos} con más de uno` : 'Ninguno repite'}</span>
    </div>
    ${_barrasFicha(vehLista, {
      destacarPrimero: true,
      etiqueta: x => escFicha(x.nombre) + (x.interno ? ` <small class="fe-sub">int. ${escFicha(x.interno)}</small>` : ''),
      vacio: 'Sin placas registradas en el periodo.'
    })}
  </div>`;

  const condRepetidos = m.topConductores.filter(x => x.n > 1).length;
  const condBlock = `<div class="dash-panel">
    <div class="dash-panel-head">
      <h3>🧑‍✈️ Conductores con más siniestros</h3>
      <span class="dash-panel-sub">${condRepetidos ? `${condRepetidos} con más de uno` : 'Ninguno repite'}</span>
    </div>
    ${_barrasFicha(m.topConductores, {
      destacarPrimero: true,
      etiqueta: x => escFicha(tituloCaseFicha(x.nombre)),
      vacio: 'Sin conductores registrados en el periodo.'
    })}
  </div>`;

  // --- Gravedad y responsabilidad, lado a lado ---
  const gravBlock = `<div class="dash-panel">
    <div class="dash-panel-head"><h3>⚠️ Gravedad</h3></div>
    ${_barrasFicha(m.gravedad, {
      rank: false, porcentaje: true, total: m.total,
      etiqueta: x => escFicha(tituloCaseFicha(x.nombre)),
      vacio: 'Sin gravedad registrada.'
    })}
  </div>`;

  const respBlock = `<div class="dash-panel">
    <div class="dash-panel-head"><h3>⚖️ Responsabilidad del conductor</h3></div>
    ${_barrasFicha(m.responsabilidad, {
      rank: false, porcentaje: true,
      etiqueta: x => escFicha(x.nombre === 'SI' ? 'Sí, del conductor'
        : x.nombre === 'NO' ? 'No, del tercero' : tituloCaseFicha(x.nombre)),
      vacio: 'Sin responsabilidad definida.'
    })}
  </div>`;

  // --- Cuándo ocurren ---
  const maxFranja = Math.max(1, ...m.franjas.map(f => f.n));
  let franjaHTML = '';
  m.franjas.forEach(f => {
    const pct = Math.max(4, Math.round((f.n / maxFranja) * 100));
    const porc = m.total ? Math.round((f.n / m.total) * 100) : 0;
    franjaHTML += `<div class="dash-bar-row fe-sin-rank">
      <span class="dash-bar-nom">${escFicha(f.etiqueta)} <small class="fe-sub">${escFicha(f.detalle)}</small></span>
      <span class="dash-bar-track"><span class="dash-bar-fill" style="width:${pct}%"></span></span>
      <span class="dash-bar-val">${f.n} <small class="fe-pct">${porc}%</small></span>
    </div>`;
  });
  const franjaPico = m.franjas.slice().sort((a, b) => b.n - a.n)[0];
  const franjaBlock = `<div class="dash-panel">
    <div class="dash-panel-head">
      <h3>🕐 Franja horaria</h3>
      <span class="dash-panel-sub">${franjaPico && franjaPico.n
        ? `La franja crítica es la <b>${escFicha(franjaPico.etiqueta.toLowerCase())}</b>` : ''}</span>
    </div>
    <div class="dash-bars dash-bars-estado">${franjaHTML}</div>
  </div>`;

  const maxDia = Math.max(1, ...m.dias.map(d => d.n));
  let diaHTML = '';
  m.dias.forEach(d => {
    const h = d.n ? Math.max(4, Math.round((d.n / maxDia) * 110)) : 2;
    diaHTML += `<div class="dash-col" title="${escFicha(d.nombre)}: ${d.n} caso${d.n === 1 ? '' : 's'}">
      <span class="dash-col-val">${d.n || ''}</span>
      <span class="dash-col-bar" style="height:${h}px"></span>
      <span class="dash-col-lab">${escFicha(d.corto)}</span>
    </div>`;
  });
  const diaPico = m.dias.slice().sort((a, b) => b.n - a.n)[0];
  const diaBlock = `<div class="dash-panel">
    <div class="dash-panel-head">
      <h3>📆 Día de la semana</h3>
      <span class="dash-panel-sub">${diaPico && diaPico.n ? `El peor día es el <b>${escFicha(diaPico.nombre.toLowerCase())}</b>` : ''}</span>
    </div>
    <div class="dash-cols">${diaHTML}</div>
  </div>`;

  // --- Rutas (solo si hay dato suficiente para no engañar) ---
  // Con menos de 5 casos con ruta real, el panel dice más de lo que sabe.
  const totalRutas = m.topRutas.reduce((s, r) => s + r.n, 0);
  const rutaBlock = totalRutas >= 5 ? `<div class="dash-panel">
    <div class="dash-panel-head">
      <h3>🛣️ Rutas con más siniestros</h3>
      <span class="dash-panel-sub">${totalRutas} de ${m.total} casos tienen ruta registrada</span>
    </div>
    ${_barrasFicha(m.topRutas, { etiqueta: x => escFicha(tituloCaseFicha(x.nombre)) })}
  </div>` : '';

  cont.innerHTML = `
    <div class="fe-periodo">📅 Periodo: <b>${escFicha(periodo)}</b>${o.nombreEmpresa ? ` · <b>${escFicha(o.nombreEmpresa)}</b>` : ''}</div>
    ${kpis}
    ${mesesBlock}
    <div class="dash-2col">${vehBlock}${condBlock}</div>
    <div class="dash-2col">${gravBlock}${respBlock}</div>
    <div class="dash-2col">${franjaBlock}${diaBlock}</div>
    ${rutaBlock}
  `;
}

/** Primera letra de cada palabra en mayúscula (los datos vienen en MAYÚSCULAS). */
function tituloCaseFicha(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
}
