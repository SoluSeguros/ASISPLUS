/**
 * buscar.js
 * Búsqueda de casos por texto libre.
 *
 * La usan las dos listas de la app: la bandeja (administración) y el historial
 * del portal de empresa. Es una sola pieza a propósito, para que las dos
 * pantallas busquen igual y lo que sirve en una sirva en la otra.
 *
 * El filtrado es en el cliente, como el resto de la app: las listas ya están
 * cargadas en memoria, así que la búsqueda responde mientras se escribe sin ir
 * y volver al servidor.
 */

/**
 * Campos de `datos` en los que se busca, elegidos por cobertura medida sobre
 * los 2.791 siniestros: cédula, placa, empresa y fecha están en el 100 %;
 * dirección y conductor en el 99,9 %; número interno en el 98 %.
 */
const BUSCAR_CAMPOS = [
  'EMPRESA',
  'PLACA VEHICULO',
  'NUMERO INTERNO VEHICULO',
  'NOMBRE CONDUCTOR',
  'CEDULA DEL CONDUCTOR',
  'TIPO DE VEHICULO',
  'DIRECCION DEL LUGAR DEL SINIESTRO',
  'GRAVEDAD DEL SINIESTRO',
  'HORA DEL SINIESTRO',
  'RUTA'
];

/** A mayúsculas, sin tildes y con los espacios apretados. */
function normalizarBusqueda(texto) {
  return String(texto == null ? '' : texto)
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * La base guarda la fecha como "9/9/2025" (así venía del AppSheet), pero quien
 * busca suele escribir "09/09/2025". Se indexan las dos formas para que las dos
 * encuentren el mismo caso.
 */
function _fechasBuscables(valor) {
  const s = String(valor == null ? '' : valor).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return s;
  return `${s} ${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`;
}

/**
 * Todo el texto donde se busca un caso, ya normalizado.
 *
 * Se calcula una vez por objeto y se guarda en él: la lista se recorre entera
 * en cada tecla y normalizar 2.791 casos cada vez se nota. La propiedad no es
 * enumerable para que no se cuele en lo que se manda al servidor, y al recargar
 * la lista llegan objetos nuevos, así que la caché no se queda vieja.
 */
function textoBuscableCaso(caso) {
  if (!caso) return '';
  if (caso._buscable != null) return caso._buscable;

  const d = caso.datos || {};
  const partes = [caso.numero_caso, caso.estado];
  BUSCAR_CAMPOS.forEach(c => partes.push(d[c]));
  partes.push(_fechasBuscables(d['FECHA DEL SINIESTRO']));

  const txt = normalizarBusqueda(partes.filter(Boolean).join(' '));
  try {
    Object.defineProperty(caso, '_buscable', {
      value: txt, enumerable: false, configurable: true, writable: true
    });
  } catch (_) { /* objeto congelado: se recalcula cada vez y ya */ }
  return txt;
}

/**
 * Filtra una lista de casos por lo escrito.
 *
 * Varias palabras significan que deben estar TODAS, en cualquier orden y en
 * cualquier campo: "cootranspinal 2025" encuentra los de esa empresa en ese
 * año, y "TSG045 lesiones" los de esa placa que dejaron heridos.
 *
 * Sin consulta devuelve la misma lista, sin copiarla.
 */
function filtrarCasosPorTexto(casos, consulta) {
  const q = normalizarBusqueda(consulta);
  if (!q) return casos || [];
  const terminos = q.split(' ');
  return (casos || []).filter(c => {
    const txt = textoBuscableCaso(c);
    return terminos.every(t => txt.includes(t));
  });
}

/** ¿Este caso calza con lo escrito? (misma regla que filtrarCasosPorTexto) */
function coincideBusqueda(caso, consulta) {
  const q = normalizarBusqueda(consulta);
  if (!q) return true;
  const txt = textoBuscableCaso(caso);
  return q.split(' ').every(t => txt.includes(t));
}

/**
 * Cablea un campo de búsqueda: dispara al escribir (con un respiro para no
 * recalcular en cada tecla) y limpia con Escape.
 */
function cablearBuscador(input, alBuscar) {
  if (!input || input.dataset.cableado === 'si') return;
  input.dataset.cableado = 'si';
  let t = null;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(alBuscar, 150);
  });
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && input.value) {
      ev.preventDefault();
      input.value = '';
      clearTimeout(t);
      alBuscar();
    }
  });
}
