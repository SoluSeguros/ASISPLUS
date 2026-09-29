/**
 * apl.js
 * Consulta de los registros de APL, que viven en una hoja de cálculo publicada
 * en línea y NO en la base de datos de ASIS PLUS.
 *
 * Por qué así: son la operación de otra cuenta (de 287 placas del archivo solo
 * una está en el parque automotor, y ninguna de sus KEY existe en
 * registro_asistencias), así que no hay nada que cruzar ni que duplicar. Se lee
 * la hoja tal cual, cuando se pide. Quien la mantiene sigue trabajando en su
 * hoja y aquí siempre se ve lo último, sin importar ni sincronizar nada.
 *
 * Lo que se descarga no se guarda: vive en memoria mientras dura la sesión, y
 * el botón "Actualizar" vuelve a pedirla.
 */

// Hoja publicada (Archivo → Compartir → Publicar en la Web → CSV). Es pública:
// quien tenga el enlace la lee, así que no debe llevar datos reservados.
const APL_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTOC6UxqRk2WdNwpA0gIOqir3tdzEVTD3LX5Z3qjJujTShOtgeDsX3xaPoeDxx-rb18xPZ8hO8mozn8/pub?gid=0&single=true&output=csv';

/**
 * Parte un CSV en filas. No vale con partir por comas y saltos de línea: este
 * archivo trae descripciones de daños escritas en varias líneas y con comas
 * dentro, y todo eso va entre comillas.
 *
 * Reglas del formato: las comillas abren y cierran un campo, y dos comillas
 * seguidas dentro de uno son una comilla literal.
 */
function parsearCSV(texto) {
  const filas = [];
  let fila = [], campo = '', enComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c !== '"') { campo += c; continue; }
      if (texto[i + 1] === '"') { campo += '"'; i++; }   // "" = una comilla
      else enComillas = false;
    } else if (c === '"') {
      enComillas = true;
    } else if (c === ',') {
      fila.push(campo); campo = '';
    } else if (c === '\n') {
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else if (c !== '\r') {
      campo += c;
    }
  }
  // La última fila puede venir sin salto de línea al final.
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

/**
 * Encabezado legible. Varias columnas de la hoja llevan la instrucción para
 * quien la diligencia dentro del propio título ("RESPONSABILIDAD DEL CONDUCTOR
 * (SI EL CONDUCTOR DE LA COMPAÑÍA ES RESPONSABLE RELACIONE SI...)"), que como
 * encabezado de tabla no se puede leer. Se corta en el paréntesis o la coma,
 * que es donde empieza la instrucción.
 */
function acortarEncabezado(h) {
  let s = String(h == null ? '' : h).trim().replace(/\s+/g, ' ');
  const corte = s.search(/\s*[(,]/);
  if (corte > 3) s = s.slice(0, corte).trim();
  return s;
}

/**
 * Convierte las filas del CSV en objetos {columna: valor}.
 *
 * Si al acortar dos encabezados quedan iguales, se conserva el largo de los
 * dos: perder una columna entera por ahorrar texto sería peor.
 */
function filasAObjetos(filas) {
  if (!filas.length) return [];
  const crudos = filas[0];
  const cortos = crudos.map(acortarEncabezado);
  const repetidos = new Set(
    cortos.filter((c, i) => c && cortos.indexOf(c) !== i)
  );
  const cols = crudos.map((crudo, i) =>
    (!cortos[i] || repetidos.has(cortos[i])) ? String(crudo).trim() : cortos[i]
  );

  const out = [];
  for (let f = 1; f < filas.length; f++) {
    const fila = filas[f];
    const obj = {};
    let algo = false;
    cols.forEach((col, i) => {
      const v = (fila[i] == null ? '' : String(fila[i])).trim();
      obj[col] = v;
      if (v) algo = true;
    });
    if (algo) out.push(obj);      // la hoja trae filas en blanco de relleno
  }
  return out;
}

/** Hora de la última consulta, para saber a qué momento corresponde lo que se ve. */
let _aplActualizado = null;

/** Texto del pie: cuántos registros y de cuándo. */
function textoInfoAPL() {
  if (!_aplActualizado) return '';
  const h = _aplActualizado;
  const hora = `${String(h.getHours()).padStart(2, '0')}:${String(h.getMinutes()).padStart(2, '0')}`;
  return `Consultado a las ${hora}`;
}

function pintarInfoAPL() {
  if (els.aplInfo) els.aplInfo.textContent = textoInfoAPL();
}

/**
 * Trae la hoja y la deja en `state.aplRows`.
 *
 * `cache: 'no-store'` es lo que hace que el botón sirva: sin eso el navegador
 * puede responder con la copia que ya tiene y mostrar lo mismo de antes.
 */
async function traerAPL() {
  const resp = await fetch(APL_CSV_URL, { cache: 'no-store', redirect: 'follow' });
  if (!resp.ok) throw new Error('la hoja respondió ' + resp.status);
  const texto = await resp.text();
  const filas = filasAObjetos(parsearCSV(texto));
  _aplActualizado = new Date();
  return filas;
}

/** Abre la consulta de APL. Descarga solo la primera vez; el botón fuerza. */
async function cargarAPL(forzar) {
  try {
    showLoader(true);
    if (forzar || !state.aplRows || !state.aplRows.length) {
      state.aplRows = await traerAPL();
    }
    mostrarVistaBD('apl');
    pintarInfoAPL();
    showStatus(`APL: ${formatNumber(state.aplRows.length)} registros.`, 'ok');
  } catch (error) {
    // Sin conexión, o la hoja dejó de estar publicada.
    showStatus('No se pudo leer la hoja de APL: ' + (error.message || error)
      + '. Revisa la conexión y que la hoja siga publicada.', 'error');
    // Sin nada que mostrar se vuelve al menú, para no dejar una tabla vacía
    // que parezca que APL no tiene registros.
    if (!state.aplRows || !state.aplRows.length) ocultarPantallas();
  } finally {
    showLoader(false);
  }
}
