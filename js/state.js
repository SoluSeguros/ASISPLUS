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
  aplRows: [],            // hoja de APL: se lee en línea, no se guarda
  filtroMes: '',          // mes elegido en la consulta de APL ('01'…'12')
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
  empresaFiltroEmpresa: '',    // chip de empresa elegido en el historial ('' = todas)
  empresaFiltroMes: '',        // chip de mes elegido en el historial ('01'…'12')
  empresaFichaEmpresa: '',     // empresa elegida en el dashboard del portal
  empresaVehiculosTotal: 0,    // tamaño del parque: base de la tasa por 100 vehículos
  fichaEmpresaSel: '',         // empresa elegida en el dashboard de SoluAsistencia
  empresaVehiculosLista: [],   // flota a la vista (para detectar placas repetidas al dar de alta)
  empresaVehiculosVisibles: [],// la misma, ya filtrada: es sobre la que indexa el clic
  empresaVehiculosPagina: 1,
  // Bitácora de reclamaciones (proceso interno)
  recLista: [],
  recVisibles: [],
  recPagina: 1,
  recEditando: null,

  // Servicio adicional "infracciones" (solo quien lo tiene contratado)
  infraLista: [],
  infraVisibles: [],
  infraPagina: 1,
  infraSubvista: 'listado',    // 'listado' | 'estadistica' dentro del módulo
  infraFiltroMes: '',          // '01'…'12': sale de tocar el gráfico de meses
  infraFiltroDia: '',          // '0'…'6' (0 = domingo): del gráfico de días
  infraFiltroFranja: '',       // 'madrugada'…'noche': del panel de horas
  infraEditando: null,
  empresaVistaServicios: null, // servicios del usuario cuyo portal se está previsualizando
  empresaVistaAdmin: null,     // admin viendo un portal ajeno: lista de empresas que ve
  empresaVistaVolver: null,    // por dónde entró a esa vista ('dashboard' | 'usuarios')
  empresaCasosPagina: 1        // página actual del historial de la empresa
};
