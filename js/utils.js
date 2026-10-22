/**
 * utils.js
 * Funciones puras y reutilizables: normalización de texto, formateo de
 * fechas/números y utilidades para trabajar con filas y columnas.
 * No dependen del estado ni del DOM.
 */

/** Convierte un valor de celda a texto limpio (maneja fechas y nulos). */
function normalizeCell(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatDate(value);
  return String(value).trim();
}

/** Formatea una fecha como dd/mm/aaaa (y hh:mm si tiene hora). */
function formatDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const hasTime = hours !== '00' || minutes !== '00';
  return hasTime ? `${day}/${month}/${year} ${hours}:${minutes}` : `${day}/${month}/${year}`;
}

/**
 * ¿Este campo guarda una fecha?
 *
 * Basta con que el nombre lleve "FECHA": así valen los que ya existen (FECHA
 * DEL SINIESTRO, FECHA DE REPORTE, LESIONES FECHA AUDIENCIA, FECHA
 * FINALIZACION, FECHA Y HORA DE LLEGADA, HORA Y FECHA DE ACCION USUARIO…) y
 * los que se agreguen después, sin una lista que haya que acordarse de
 * actualizar. "HORA DEL SINIESTRO" no entra: es una hora, no una fecha.
 */
function esClaveDeFecha(clave) {
  return /FECHA/.test(String(clave == null ? '' : clave).toUpperCase());
}

/**
 * Una fecha en texto, siempre como dd/mm/aaaa (con hh:mm si la trae).
 *
 * En la base conviven tres formatos, y eso es historia, no desorden:
 *
 *  - "aaaa-mm-dd" (ISO): lo que escribe esta app.
 *  - "m/d/aaaa": los 2.707 siniestros importados del AppSheet, que guardaba
 *    MES/día/año. Está medido: 1.650 de esos 2.707 tienen el SEGUNDO número
 *    mayor que 12 y NINGUNO el primero, así que el orden es mes/día sin duda.
 *    Es justo el caso peligroso: "3/5/2026" se lee aquí como 3 de mayo y en
 *    realidad es el 5 de marzo.
 *  - "d/m/aaaa HH:MM": los sellos de hora que pone formatDate() en esta app.
 *
 * Si uno de los dos números pasa de 12, el dato manda y `orden` se ignora.
 * `orden` sólo desempata el caso ambiguo: 'mdy' (el histórico, por defecto) o
 * 'dmy' (lo que escribe esta app).
 *
 * Lo que no calce EXACTAMENTE con un formato conocido se devuelve intacto.
 * Hay valores escritos a mano ("07/10/202608:40", "06-10-26") y es mejor
 * mostrarlos tal cual —raros, pero completos— que recortarlos a medias o
 * inventarles un día.
 */
function fechaDMA(valor, orden) {
  const s = String(valor == null ? '' : valor).trim();
  if (!s) return '';

  // ISO con zona horaria: eso es un instante, no una fecha escrita. Se pasa por
  // Date para que la hora salga en la del usuario y no en UTC.
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}.*(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? s : formatDate(dt);
  }

  const conHora = (h, mi) => (h ? ` ${String(h).padStart(2, '0')}:${mi}` : '');

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]+(\d{1,2}):(\d{2})(?::\d{2})?)?$/);
  if (m) {
    return `${m[3].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[1]}` + conHora(m[4], m[5]);
  }

  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[,: ]+(\d{1,2}):(\d{2})(?::\d{2})?)?$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    let dia, mes;
    if (a > 12) { dia = a; mes = b; }             // sólo puede ser día/mes
    else if (b > 12) { dia = b; mes = a; }        // sólo puede ser mes/día
    else if (orden === 'dmy') { dia = a; mes = b; }
    else { dia = b; mes = a; }
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return s;
    return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${m[3]}` + conHora(m[4], m[5]);
  }
  return s;
}

/**
 * Un texto de fecha a Date en hora LOCAL, o null.
 *
 * Aquí está la trampa que importa: new Date('2026-08-18') se interpreta en
 * UTC, y en Colombia (UTC-5) eso cae el 17 a las 7 p. m. Todo lo que agrupe
 * por día o por mes contaba un día antes, y un caso del 1.º de agosto caía en
 * julio. Afecta a los casos que guardó ESTA app (en ISO); los "m/d/aaaa" del
 * AppSheet no, porque ese formato sí se lee en hora local.
 *
 * Es la fecha que usan el dashboard, la ficha de siniestralidad, la bandeja y
 * el portal de la empresa para ordenar, agrupar y contar, así que tiene que
 * dar el mismo día que muestra la pantalla.
 */
function fechaDeTexto(valor) {
  const s = String(valor == null ? '' : valor).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

/**
 * La misma, decidiendo el orden por el nombre del campo.
 *
 * Los sellos que pone esta app —"FECHA Y HORA DE LLEGADA", "HORA Y FECHA DE
 * ACCION USUARIO", "HORA Y FECHA  ASISTENTE"— salen de formatDate(), que ya
 * escribe día/mes/año. Todo lo demás en n/n/aaaa viene del AppSheet, que
 * guardaba mes/día/año.
 */
function fechaDMADeCampo(clave, valor) {
  const k = String(clave == null ? '' : clave).toUpperCase();
  return fechaDMA(valor, /HORA Y FECHA|FECHA Y HORA/.test(k) ? 'dmy' : 'mdy');
}

/** Normaliza un nombre: sin tildes, sin espacios extra y en MAYÚSCULAS. */
function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** Limpia las claves y valores de una fila (objeto). */
function cleanRowObject(row) {
  const cleaned = {};
  Object.keys(row).forEach(key => {
    const cleanKey = String(key || '').trim();
    cleaned[cleanKey] = normalizeCell(row[key]);
  });
  return cleaned;
}

/** Busca el nombre real de una hoja comparando de forma normalizada. */
function findSheetName(sheetNames, wantedName) {
  const wanted = normalizeName(wantedName);
  return sheetNames.find(name => normalizeName(name) === wanted) || '';
}

/** Busca el nombre real de una columna entre varios posibles nombres. */
function findColumnName(rows, possibleNames) {
  if (!rows.length) return '';

  const allColumns = getAllColumns(rows);
  const normalizedTargets = possibleNames.map(normalizeName);

  return allColumns.find(col => normalizedTargets.includes(normalizeName(col))) || '';
}

/** Devuelve el conjunto de todas las columnas presentes en las filas. */
function getAllColumns(rows) {
  const set = new Set();
  rows.forEach(row => {
    Object.keys(row).forEach(key => set.add(key));
  });
  return Array.from(set);
}

/** Obtiene el valor de la columna KEY de una fila como texto. */
function getKey(row, colName) {
  return String(row[colName] || '').trim();
}

/** Devuelve el primer valor no vacío entre varias columnas posibles. */
function getFirstExistingValue(row, columns) {
  const normalizedRow = {};
  Object.keys(row).forEach(key => {
    normalizedRow[normalizeName(key)] = row[key];
  });

  for (const col of columns) {
    const value = normalizedRow[normalizeName(col)];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }

  return '';
}

/** Prefija todas las claves de una fila (ej: "ASISTENCIA - PLACA"). */
function prefixRow(row, prefix) {
  const result = {};
  Object.keys(row).forEach(key => {
    result[`${prefix} ${key}`.replace(/\s+/g, ' ').trim()] = row[key];
  });
  return result;
}

/** Prefija una fila usando una lista fija de columnas (rellena faltantes). */
function prefixRowByColumns(row, columns, prefix) {
  const result = {};
  columns.forEach(key => {
    result[`${prefix} ${key}`.replace(/\s+/g, ' ').trim()] = row[key] || '';
  });
  return result;
}

/** Genera columnas prefijadas vacías (para asistencias sin terceros). */
function emptyPrefixedColumns(columns, prefix) {
  const result = {};
  columns.forEach(key => {
    result[`${prefix} ${key}`.replace(/\s+/g, ' ').trim()] = '';
  });
  return result;
}

/** Formatea un número con separadores de miles (es-CO). */
function formatNumber(value) {
  return new Intl.NumberFormat('es-CO').format(Number(value || 0));
}

/** Formatea una marca de tiempo ISO (de la BD) como fecha/hora legible. */
function formatTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return String(value);
  return formatDate(date);
}
