/**
 * mapa-empresa.js
 * Mapa de dónde ocurrieron los siniestros, dentro del portal de la empresa.
 *
 * Las coordenadas ya estaban: 2.717 de los 2.836 casos las traen (el asistente
 * las captura en la vía). Hasta ahora sólo se veían de a una, dentro del
 * detalle de cada caso, así que nadie podía mirar el conjunto: en qué cruce se
 * repiten, qué corredor concentra los atropellos, si los de una ruta caen todos
 * en el mismo tramo.
 *
 * Decisiones que valen la pena saber:
 *
 *  - Leaflet + OpenStreetMap, no Google Maps. El mapa de un solo caso usa un
 *    iframe de Google porque para un punto alcanza; para cientos hace falta una
 *    librería de verdad, y la de Google exige API key y facturación.
 *  - Se carga SOLO al abrir la pestaña. Son ~180 KB que no tiene por qué pagar
 *    quien entra a mirar su siniestralidad y nunca abre el mapa.
 *  - No se consulta nada: los casos ya están en state.empresaCasosLista, que es
 *    lo mismo que alimenta el historial y la ficha. Un mapa que mostrara otra
 *    cosa que el historial sería un mapa en el que no se puede confiar.
 */

/* Las piezas de Leaflet. cdnjs es el CDN que ya usa el resto de la app. */
const MAPA_LEAFLET = {
  css: [
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.css',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.css'
  ],
  js: [
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js'
  ]
};

/** Medellín, por si no hay ni un punto que encuadrar. */
const MAPA_CENTRO_POR_DEFECTO = [6.2442, -75.5812];

/** Color de cada gravedad: el MISMO de la franja del historial. */
const MAPA_COLORES = {
  'grav-danos': '#16a34a',
  'grav-heridos': '#f59e0b',
  'grav-homicidio': '#dc2626',
  'grav-otro': '#94a3b8'
};

let _mapa = null;          // la instancia de Leaflet (se crea una sola vez)
let _mapaCapa = null;      // el grupo de marcadores que se repinta al filtrar
let _mapaCargando = null;  // promesa única: dos clics seguidos no bajan todo dos veces

/** Mete una hoja de estilos o un script en la página y espera a que cargue. */
function _mapaInyectar(url, esCss) {
  return new Promise((resolve, reject) => {
    const ya = document.querySelector(`[data-mapa-src="${url}"]`);
    if (ya) {
      if (ya.dataset.listo === 'si') return resolve();
      ya.addEventListener('load', () => resolve());
      ya.addEventListener('error', reject);
      return;
    }
    const el = document.createElement(esCss ? 'link' : 'script');
    el.dataset.mapaSrc = url;
    if (esCss) { el.rel = 'stylesheet'; el.href = url; }
    else { el.src = url; el.defer = true; }
    el.addEventListener('load', () => { el.dataset.listo = 'si'; resolve(); });
    el.addEventListener('error', () => reject(new Error('No se pudo cargar ' + url)));
    document.head.appendChild(el);
  });
}

/**
 * Deja Leaflet disponible. Los scripts van EN ORDEN: markercluster es un plugin
 * y se registra sobre el objeto L, que todavía no existe si se bajan en paralelo.
 */
async function asegurarLeaflet() {
  if (typeof L !== 'undefined' && L.markerClusterGroup) return;
  if (_mapaCargando) return _mapaCargando;
  _mapaCargando = (async () => {
    await Promise.all(MAPA_LEAFLET.css.map(u => _mapaInyectar(u, true)));
    for (const u of MAPA_LEAFLET.js) await _mapaInyectar(u, false);
  })();
  try { await _mapaCargando; } finally { _mapaCargando = null; }
}

/**
 * Coordenadas utilizables de un caso, o null.
 *
 * Se descartan las de fuera de Colombia: hay 6 casos guardados en "0,0", que es
 * lo que deja un GPS que no alcanzó a fijar posición. Pintarlos mandaría el
 * encuadre al golfo de Guinea y dejaría el mapa real del tamaño de una moneda.
 */
function coordsCaso(caso) {
  const d = (caso && caso.datos) || {};
  const texto = String(d['COORDENADAS ASISTENCIA'] || '').trim() ||
                String(d['COORDENADAS DEL SINIESTRO'] || '').trim();
  const m = texto.match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  if (lat < -5 || lat > 14 || lng < -82 || lng > -66) return null;
  return { lat, lng };
}

function _valorFiltroMapa(id) {
  return (els[id] && els[id].value) || '';
}

function _hayFiltroMapa() {
  return !!(_valorFiltroMapa('filtroMapaAnio') ||
    _valorFiltroMapa('filtroMapaGravedad') ||
    _valorFiltroMapa('filtroMapaEmpresa'));
}

/** Los casos que entran al mapa según los selectores (antes de mirar coordenadas). */
function _casosDelMapa() {
  let filas = state.empresaCasosLista || [];
  const anio = _valorFiltroMapa('filtroMapaAnio');
  const grav = _valorFiltroMapa('filtroMapaGravedad');
  const emp = _valorFiltroMapa('filtroMapaEmpresa');
  if (anio) filas = filas.filter(c => _anioCasoEmpresa(c) === anio);
  if (grav) filas = filas.filter(c => String((c.datos || {})['GRAVEDAD DEL SINIESTRO'] || '').trim() === grav);
  if (emp) filas = filas.filter(c => String((c.datos || {})['EMPRESA'] || '').trim() === emp);
  return filas;
}

/** Llena los selectores con lo que de verdad hay en el historial de esta empresa. */
function llenarFiltrosMapa() {
  const filas = state.empresaCasosLista || [];
  const unicos = f => [...new Set(filas.map(f).filter(Boolean))];

  const llenar = (el, valores, titulo, etiqueta) => {
    if (!el) return;
    const previo = el.value;
    el.innerHTML = `<option value="">${titulo}</option>` + valores
      .map(v => `<option value="${escBandeja(v)}">${escBandeja(etiqueta ? etiqueta(v) : v)}</option>`).join('');
    el.value = valores.includes(previo) ? previo : '';
  };

  llenar(els.filtroMapaAnio,
    unicos(_anioCasoEmpresa).sort((a, b) => Number(b) - Number(a)), 'Todos los años');
  llenar(els.filtroMapaGravedad,
    unicos(c => String((c.datos || {})['GRAVEDAD DEL SINIESTRO'] || '').trim()).sort(),
    'Toda gravedad', tituloCaseFicha);

  // El de empresa sólo si el usuario está vinculado a varias: con una sola, un
  // desplegable de un elemento no filtra nada.
  const empresas = unicos(c => String((c.datos || {})['EMPRESA'] || '').trim()).sort();
  llenar(els.filtroMapaEmpresa, empresas, 'Todas mis empresas');
  if (els.filtroMapaEmpresa) els.filtroMapaEmpresa.classList.toggle('hidden', empresas.length < 2);
}

/** El globo que sale al tocar un punto. */
function _popupCaso(caso) {
  const d = caso.datos || {};
  const grav = String(d['GRAVEDAD DEL SINIESTRO'] || '').trim();
  const cont = document.createElement('div');
  cont.className = 'mapa-pop';
  cont.innerHTML = `
    <div class="mapa-pop-placa">${escBandeja(d['PLACA VEHICULO'] || 'Sin placa')}</div>
    <div class="mapa-pop-meta">${escBandeja(_fechaBonitaEmpresa(caso))}${
      caso.numero_caso ? ' · ' + escBandeja(caso.numero_caso) : ''}</div>
    ${grav ? `<div class="ct-grav ${escBandeja(claseGravedad(grav))}">${escBandeja(tituloCaseFicha(grav))}</div>` : ''}
    ${d['NOMBRE CONDUCTOR'] ? `<div class="mapa-pop-cond">${escBandeja(tituloCaseFicha(String(d['NOMBRE CONDUCTOR'])))}</div>` : ''}
    ${d['DIRECCION DEL LUGAR DEL SINIESTRO'] ? `<div class="mapa-pop-dir">${escBandeja(String(d['DIRECCION DEL LUGAR DEL SINIESTRO']))}</div>` : ''}
  `;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'secondary mapa-pop-btn';
  btn.textContent = 'Ver el caso completo';
  // El detalle es el MISMO modal del historial: desde el mapa se llega a la
  // misma pantalla, no a un resumen distinto.
  btn.addEventListener('click', () => verDetalleCasoEmpresa(caso));
  cont.appendChild(btn);
  return cont;
}

/** Dibuja (o redibuja) los puntos según los filtros. */
function renderMapaEmpresa() {
  if (!_mapa) return;

  const casos = _casosDelMapa();
  const ubicados = [];
  casos.forEach(c => {
    const xy = coordsCaso(c);
    if (xy) ubicados.push({ caso: c, xy });
  });

  if (_mapaCapa) { _mapa.removeLayer(_mapaCapa); _mapaCapa = null; }

  // chunkedLoading: con 2.700 puntos, agruparlos de una sola vez congela la
  // pantalla un segundo largo. Así entra por tandas y la app sigue respondiendo.
  _mapaCapa = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 45,
    showCoverageOnHover: false
  });

  ubicados.forEach(({ caso, xy }) => {
    const grav = String((caso.datos || {})['GRAVEDAD DEL SINIESTRO'] || '').trim();
    const color = MAPA_COLORES[claseGravedad(grav)] || MAPA_COLORES['grav-otro'];
    const punto = L.circleMarker([xy.lat, xy.lng], {
      radius: 7, color: '#fff', weight: 2, opacity: 1,
      fillColor: color, fillOpacity: .85
    });
    // El contenido se arma al abrir, no para los 2.700 de entrada.
    punto.bindPopup(() => _popupCaso(caso), { minWidth: 210 });
    _mapaCapa.addLayer(punto);
  });

  _mapa.addLayer(_mapaCapa);

  if (ubicados.length) {
    _mapa.fitBounds(L.latLngBounds(ubicados.map(u => [u.xy.lat, u.xy.lng])), { padding: [30, 30], maxZoom: 16 });
  } else {
    _mapa.setView(MAPA_CENTRO_POR_DEFECTO, 11);
  }

  // Lo que NO se puede mostrar se dice. Un mapa con 384 puntos que en realidad
  // son 403 casos es un mapa que miente por omisión.
  const sin = casos.length - ubicados.length;
  if (els.empresaMapaInfo) {
    els.empresaMapaInfo.innerHTML = casos.length
      ? `<b>${formatNumber(ubicados.length)}</b> siniestro(s) en el mapa` +
        (sin ? ` · <span class="mapa-sinubi">${formatNumber(sin)} sin ubicación registrada</span>` : '')
      : 'Ningún caso coincide con lo que estás filtrando.';
  }
  if (els.btnMapaFiltrosLimpiar) {
    els.btnMapaFiltrosLimpiar.classList.toggle('hidden', !_hayFiltroMapa());
  }
}

/**
 * Abre la pestaña del mapa: baja Leaflet si hace falta, crea el mapa la primera
 * vez y pinta los puntos.
 *
 * El invalidateSize no es opcional: el contenedor estaba oculto (display:none)
 * cuando se creó el mapa, así que Leaflet lo midió como 0×0 y las teselas
 * salen cortadas hasta que se le dice que vuelva a medir.
 */
async function abrirMapaEmpresa() {
  const caja = els.empresaMapaCanvas;
  if (!caja) return;
  try {
    if (els.empresaMapaInfo && !_mapa) els.empresaMapaInfo.textContent = 'Cargando el mapa…';
    await asegurarLeaflet();

    if (!_mapa) {
      _mapa = L.map(caja, { scrollWheelZoom: false });   // la rueda hace scroll de la página, no zoom
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(_mapa);
      llenarFiltrosMapa();
    }
    _mapa.invalidateSize();
    renderMapaEmpresa();
  } catch (error) {
    if (els.empresaMapaInfo) {
      els.empresaMapaInfo.textContent =
        'No se pudo cargar el mapa (' + (error.message || error) + '). Revisa la conexión y vuelve a entrar.';
    }
  }
}

/** Suelta el mapa al salir del portal, para no dejarlo vivo con datos de otra empresa. */
function soltarMapaEmpresa() {
  if (_mapa) { _mapa.remove(); _mapa = null; _mapaCapa = null; }
}

function initMapaEmpresa() {
  ['filtroMapaAnio', 'filtroMapaGravedad', 'filtroMapaEmpresa'].forEach(id => {
    if (els[id]) els[id].addEventListener('change', renderMapaEmpresa);
  });
  if (els.btnMapaFiltrosLimpiar) {
    els.btnMapaFiltrosLimpiar.addEventListener('click', () => {
      ['filtroMapaAnio', 'filtroMapaGravedad', 'filtroMapaEmpresa']
        .forEach(id => { if (els[id]) els[id].value = ''; });
      renderMapaEmpresa();
    });
  }
}
