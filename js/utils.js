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
