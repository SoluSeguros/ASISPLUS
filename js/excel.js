/**
 * excel.js
 * Exportación a Excel de la vista actual (parque, asistencias, terceros o
 * cualquiera de las vistas del cruce). No lee archivos: solo genera la
 * descarga a partir de lo que se está mostrando.
 */

/** Descarga la vista actual (respetando la búsqueda) como un archivo Excel. */
function descargarVistaActual() {
  const rows = getFilteredRows();
  if (!rows.length) {
    showStatus('No hay datos para descargar en esta vista.', 'error');
    return;
  }

  // Quitar columnas ocultas (fotos) también en la exportación.
  const limpias = rows.map(fila => {
    const o = {};
    Object.keys(fila).forEach(k => { if (columnaVisible(k)) o[k] = fila[k]; });
    return o;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(limpias);
  autoWidth(ws, limpias);
  const nombreHoja = getCurrentTitle().substring(0, 31).replace(/[\\/?*\[\]:]/g, ' ');
  XLSX.utils.book_append_sheet(wb, ws, nombreHoja || 'DATOS');

  const base = getCurrentTitle().replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase();
  XLSX.writeFile(wb, `${base || 'DATOS'}.xlsx`);
  showStatus('Datos descargados a Excel correctamente.', 'ok');
}

/**
 * Descarga el INFORME COMPLETO del cruce en un Excel con varias hojas:
 * datos unidos, resumen por asistencia, asistencias sin terceros, terceros
 * sin asistencia y una hoja de control con los totales del proceso.
 */
function descargarInformeCruce() {
  if (!state.joinedRows.length) {
    showStatus('Primero realiza el cruce para generar el informe.', 'error');
    return;
  }

  const wb = XLSX.utils.book_new();

  appendSheet(wb, state.joinedRows, 'DATOS_UNIDOS');
  appendSheet(wb, state.resumenRows, 'RESUMEN_ASISTENCIAS');
  appendSheet(wb, state.asistenciaSinTerceros, 'ASISTENCIAS_SIN_TERCEROS');
  appendSheet(wb, state.tercerosHuerfanos, 'TERCEROS_SIN_ASISTENCIA');
  appendSheet(wb, [{
    ORIGEN: 'Base de datos (Supabase)',
    TABLA_ASISTENCIAS: 'registro_asistencias',
    TABLA_TERCEROS: 'registro_terceros',
    COLUMNA_RELACION: 'KEY',
    TOTAL_ASISTENCIAS: state.asistenciaRows.length,
    TOTAL_TERCEROS: state.tercerosRows.length,
    FILAS_RELACIONADAS: state.joinedRows.filter(r => r.ESTADO_RELACION === 'RELACIONADO').length,
    ASISTENCIAS_SIN_TERCEROS: state.asistenciaSinTerceros.length,
    TERCEROS_SIN_ASISTENCIA: state.tercerosHuerfanos.length,
    FECHA_PROCESO: new Date().toLocaleString('es-CO')
  }], 'CONTROL_PROCESO');

  XLSX.writeFile(wb, 'INFORME_CRUCE_ASISTENCIAS_TERCEROS.xlsx');
  showStatus('Informe completo descargado correctamente.', 'ok');
}

/** Agrega una hoja al libro con ancho de columnas automático. */
function appendSheet(workbook, rows, sheetName) {
  // Quita las columnas ocultas (fotos, firmas, croquis, KEY) también en el
  // informe, igual que hace la descarga de la vista actual.
  const limpias = (rows || []).map(fila => {
    const o = {};
    Object.keys(fila).forEach(k => { if (columnaVisible(k)) o[k] = fila[k]; });
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(limpias.length ? limpias : [{ MENSAJE: 'Sin registros' }]);
  autoWidth(ws, limpias);
  XLSX.utils.book_append_sheet(workbook, ws, sheetName.substring(0, 31));
}

/** Calcula el ancho de cada columna según su contenido más largo. */
function autoWidth(ws, rows) {
  const columns = getAllColumns(rows);
  ws['!cols'] = columns.map(col => {
    const maxContent = rows.reduce((max, row) => {
      const value = String(row[col] || '');
      return Math.max(max, value.length);
    }, String(col).length);
    return { wch: Math.min(Math.max(maxContent + 2, 12), 55) };
  });
}
