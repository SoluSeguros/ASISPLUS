/**
 * state.js
 * Estado global de la aplicación. Un único objeto compartido por el resto
 * de los módulos para almacenar datos cargados, resultados del cruce y la
 * configuración de la vista actual (paginación, búsqueda, pestaña).
 */
const state = {
  workbook: null,
  fileName: '',
  currentView: 'unidos',
  page: 1,
  pageSize: 50,
  search: '',
  sheets: {},
  asistenciaRows: [],
  tercerosRows: [],
  joinedRows: [],
  asistenciaSinTerceros: [],
  tercerosHuerfanos: [],
  resumenRows: [],
  parqueRows: [],
  asistenciasBDRows: [],
  tercerosBDRows: [],
  asistenciaKeyCol: '',
  tercerosKeyCol: '',
  perfil: null,
  casoActual: null,
  filtroAnio: '',
  filtroEmpresa: '',
  filtroDesde: '', // rango de fechas del Registro de Asistencias (YYYY-MM-DD)
  filtroHasta: '',
  filtroEstadoSin: '', // filtro por ESTADO DEL SINIESTRO (resumen del registro)
  filtroGravedad: '',  // filtro por GRAVEDAD DEL SINIESTRO (resumen del registro)
  perfilesLista: [],
  usuariosPorId: {},
  notifTimer: null,
  presenceTimer: null,
  conectadosTimer: null,
  casoPaso: 1,
  hipotesisLista: [],
  audioBlobs: {},
  audioEliminar: {},
  // Portal de empresa
  empresaCasosLista: [],       // casos propios (la RLS ya filtra por empresa)
  empresaCasosVisibles: [],    // los de arriba tras el buscador: lo que se ve
  empresaVehiculosTotal: 0,    // tamaño del parque: base de la tasa por 100 vehículos
  fichaEmpresaSel: '',         // empresa elegida en el dashboard de SoluAsistencia
  empresaVistaAdmin: null,     // si un admin está viendo el portal de una empresa, su nombre
  empresaCasosPagina: 1        // página actual del historial de la empresa
};
