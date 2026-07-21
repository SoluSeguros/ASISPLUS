/**
 * relationship.js
 * Lógica del cruce entre REGISTRO ASISTENCIAS y TERCEROS usando la columna
 * KEY. Genera los datos unidos, las asistencias sin terceros, los terceros
 * huérfanos y el resumen. Escribe los resultados en el estado global.
 */

/** Construye todas las relaciones y guarda los resultados en el estado. */
function buildRelationship() {
  const asistenciaMap = new Map();
  const tercerosGrouped = new Map();
  const asistenciaColumns = getAllColumns(state.asistenciaRows);
  const tercerosColumns = getAllColumns(state.tercerosRows);

  state.asistenciaRows.forEach(row => {
    const key = getKey(row, state.asistenciaKeyCol);
    if (key) asistenciaMap.set(key, row);
  });

  state.tercerosRows.forEach(row => {
    const key = getKey(row, state.tercerosKeyCol);
    if (!key) return;
    if (!tercerosGrouped.has(key)) tercerosGrouped.set(key, []);
    tercerosGrouped.get(key).push(row);
  });

  const joinedRows = [];
  const asistenciaSinTerceros = [];
  const tercerosHuerfanos = [];

  state.asistenciaRows.forEach(asistencia => {
    const key = getKey(asistencia, state.asistenciaKeyCol);
    const terceros = tercerosGrouped.get(key) || [];

    if (terceros.length === 0) {
      asistenciaSinTerceros.push(prefixRow(asistencia, 'ASISTENCIA -'));
      joinedRows.push({
        ID_ASISTENCIA: key,
        ESTADO_RELACION: 'ASISTENCIA SIN TERCEROS',
        N_TERCERO_EN_ASISTENCIA: '',
        TOTAL_TERCEROS_ASISTENCIA: 0,
        ...prefixRowByColumns(asistencia, asistenciaColumns, 'ASISTENCIA -'),
        ...emptyPrefixedColumns(tercerosColumns, 'TERCERO -')
      });
      return;
    }

    terceros.forEach((tercero, index) => {
      joinedRows.push({
        ID_ASISTENCIA: key,
        ESTADO_RELACION: 'RELACIONADO',
        N_TERCERO_EN_ASISTENCIA: index + 1,
        TOTAL_TERCEROS_ASISTENCIA: terceros.length,
        ...prefixRowByColumns(asistencia, asistenciaColumns, 'ASISTENCIA -'),
        ...prefixRowByColumns(tercero, tercerosColumns, 'TERCERO -')
      });
    });
  });

  state.tercerosRows.forEach(tercero => {
    const key = getKey(tercero, state.tercerosKeyCol);
    if (!key || !asistenciaMap.has(key)) {
      tercerosHuerfanos.push({
        ID_ASISTENCIA: key,
        ESTADO_RELACION: 'TERCERO SIN ASISTENCIA',
        ...prefixRowByColumns(tercero, tercerosColumns, 'TERCERO -')
      });
    }
  });

  state.joinedRows = joinedRows;
  state.asistenciaSinTerceros = asistenciaSinTerceros;
  state.tercerosHuerfanos = tercerosHuerfanos;
  state.resumenRows = buildResumen(asistenciaMap, tercerosGrouped);
}

/** Genera el resumen por asistencia, ordenado por cantidad de terceros. */
function buildResumen(asistenciaMap, tercerosGrouped) {
  const rows = [];

  asistenciaMap.forEach((asistencia, key) => {
    const terceros = tercerosGrouped.get(key) || [];
    rows.push({
      ID_ASISTENCIA: key,
      CANTIDAD_TERCEROS: terceros.length,
      TIENE_TERCEROS: terceros.length > 0 ? 'SI' : 'NO',
      EMPRESA: getFirstExistingValue(asistencia, ['EMPRESA', 'Empresa', 'NOMBRE EMPRESA']),
      PLACA: getFirstExistingValue(asistencia, ['PLACA', 'Placa']),
      CONDUCTOR: getFirstExistingValue(asistencia, ['CONDUCTOR', 'Conductor', 'NOMBRE CONDUCTOR']),
      FECHA: getFirstExistingValue(asistencia, ['FECHA', 'Fecha', 'FECHA SINIESTRO', 'Fecha Siniestro'])
    });
  });

  return rows.sort((a, b) => Number(b.CANTIDAD_TERCEROS) - Number(a.CANTIDAD_TERCEROS));
}
