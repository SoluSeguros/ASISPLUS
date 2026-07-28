/**
 * main.js
 * Punto de entrada: registra los eventos de la interfaz. Toda la información
 * proviene de la base de datos (Supabase); no se suben archivos de Excel.
 * Se carga en último lugar, cuando el resto ya está definido.
 */

// --- Barra inferior de navegación (móvil): reutiliza los flujos existentes ---
if (els.bnInicio) els.bnInicio.addEventListener('click', ocultarPantallas);
if (els.bnBandeja) els.bnBandeja.addEventListener('click', abrirBandeja);
if (els.bnCrear) els.bnCrear.addEventListener('click', abrirCrearCaso);
if (els.bnSalir) els.bnSalir.addEventListener('click', cerrarSesion);

// --- Gestión de casos ---
els.btnMenuCrearCaso.addEventListener('click', abrirCrearCaso);
els.btnMenuBandeja.addEventListener('click', abrirBandeja);
els.btnMenuSegvial.addEventListener('click', abrirSegvial);
els.btnSegvialVolver.addEventListener('click', ocultarPantallas);
els.btnRefrescarSegvial.addEventListener('click', cargarCasosCategoria);
els.casoVehiculoBuscar.addEventListener('input', filtrarVehiculos);
els.casoVehiculoBuscar.addEventListener('focus', filtrarVehiculos);
els.casoVehiculoBuscar.addEventListener('blur', () => {
  setTimeout(() => els.casoVehiculoLista.classList.add('hidden'), 150);
});
els.formCaso.addEventListener('submit', guardarCaso);
els.btnCrearVolver.addEventListener('click', ocultarPantallas);
els.btnCrearVolver2.addEventListener('click', ocultarPantallas);

// Validación de formato en vivo: nombre solo letras (en MAYÚSCULA), cédula/contacto solo números.
const soloLetras = v => v.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ .'-]/g, '');
const soloDigitos = v => v.replace(/\D/g, '');
els.casoConductor.addEventListener('input', e => { e.target.value = soloLetras(e.target.value).toUpperCase(); });
els.casoCedulaConductor.addEventListener('input', e => { e.target.value = soloDigitos(e.target.value); });
// Si editan la placa a mano, recalcula el aviso de "vehículo fuera del parque".
if (els.casoPlaca) els.casoPlaca.addEventListener('input', () => { if (typeof actualizarAvisoParque === 'function') actualizarAvisoParque(); });
els.casoContacto.addEventListener('input', e => { e.target.value = soloDigitos(e.target.value); });
els.filtroEstado.addEventListener('change', aplicarFiltrosBandeja);
els.filtroMisCasos.addEventListener('change', cargarBandeja);
els.btnRefrescarBandeja.addEventListener('click', cargarBandeja);

// Campanita: abre la bandeja con los casos pendientes del usuario.
els.btnNotif.addEventListener('click', () => {
  if (state.perfil && state.perfil.rol === 'asistente') els.filtroMisCasos.checked = true;
  abrirBandeja();
});
els.btnBandejaVolver.addEventListener('click', ocultarPantallas);
els.btnGuardarDetalle.addEventListener('click', guardarDetalleCaso);
els.btnCheckin.addEventListener('click', reportarLlegada);
if (els.btnTelefonica) els.btnTelefonica.addEventListener('click', reportarTelefonica);
els.btnDetalleVolver.addEventListener('click', abrirBandeja);
els.btnCancelarCaso.addEventListener('click', cancelarCaso);
els.btnEliminarCaso.addEventListener('click', eliminarCaso);

// Grabadores de voz (versión conductor / asistente).
initAudioRecorders();

// Cámara (web + móvil) y captura de fotos del sitio (con marca de agua).
initCamara();
initFotos();

// Editor de croquis del accidente.
initCroquis();
els.btnAbrirCroquis.addEventListener('click', abrirEditorCroquis);
els.btnCroquisCerrar.addEventListener('click', cerrarEditorCroquis);
els.btnCroquisCancelar.addEventListener('click', cerrarEditorCroquis);
els.btnCroquisGuardar.addEventListener('click', guardarCroquis);
els.btnCroquisTutorial.addEventListener('click', () => { els.croquisTutorial.hidden = false; });
els.btnCroquisTutorialCerrar.addEventListener('click', () => { els.croquisTutorial.hidden = true; });
els.btnCroquisTutorialOk.addEventListener('click', () => { els.croquisTutorial.hidden = true; });

// El admin puede reasignar al instante cambiando el desplegable (aunque el
// caso esté bloqueado por check-in). El asistente lo guarda con el botón.
els.detalleAsignar.addEventListener('change', () => {
  if (state.perfil && state.perfil.rol === 'admin') guardarReasignacion();
});
// Registro completo del tercero (datos + fotos + firmas).
initTerceros();

// Versiones (escrita/voz) y firmas del caso.
initVersionesToggle();
initCasoFirmas();
initBuscadorHipotesis();

// Cierre y ruta del caso (desarrollo de dependencias).
initCierre();

// --- Modal de confirmación de caso creado ---
els.btnCerrarCasoCreado.addEventListener('click', cerrarCasoCreado);
els.btnCasoCreadoOtro.addEventListener('click', cerrarCasoCreado);
els.btnCasoCreadoBandeja.addEventListener('click', () => {
  cerrarCasoCreado();
  abrirBandeja();
});
els.casoCreadoModal.addEventListener('click', event => {
  if (event.target === els.casoCreadoModal) cerrarCasoCreado();
});

// --- Gestión de usuarios (solo admin) ---
els.btnMenuUsuarios.addEventListener('click', abrirUsuarios);
els.formUsuario.addEventListener('submit', crearUsuario);
els.btnRefrescarUsuarios.addEventListener('click', cargarUsuarios);
els.btnUsuVolver.addEventListener('click', ocultarPantallas);

// Usuarios conectados (solo admin).
els.btnMenuConectados.addEventListener('click', abrirConectados);

// Módulo de contratos legales (app integrada bajo /contratos/, mismo origen y
// misma sesión de Supabase → no requiere volver a iniciar sesión).
if (els.btnMenuContratos) {
  els.btnMenuContratos.addEventListener('click', () => {
    window.location.href = 'contratos/casos.html';
  });
}
els.btnConectadosVolver.addEventListener('click', ocultarPantallas);

// Ahorro: pausa/reanuda los sondeos según si la pestaña está visible.
document.addEventListener('visibilitychange', gestionarVisibilidad);

// --- Menú principal: cada opción carga datos frescos desde Supabase ---
els.btnVerCruce.addEventListener('click', cargarCruceDesdeBD);

els.btnVerParque.addEventListener('click', () => {
  state.parqueRows = [];
  cargarParqueYMostrar();
});

els.btnVerAsistenciasBD.addEventListener('click', () => {
  state.asistenciasBDRows = [];
  cargarAsistenciasBD();
});

els.btnVerTercerosBD.addEventListener('click', () => {
  state.tercerosBDRows = [];
  cargarTercerosBD();
});

// --- Búsqueda y paginación ---
els.searchInput.addEventListener('input', event => {
  state.search = event.target.value.trim().toLowerCase();
  state.page = 1;
  renderTable();
});

els.pageSizeSelect.addEventListener('change', event => {
  state.pageSize = Number(event.target.value);
  state.page = 1;
  renderTable();
});

els.filtroAnio.addEventListener('change', event => {
  state.filtroAnio = event.target.value;
  state.page = 1;
  renderTable();
});

els.filtroEmpresa.addEventListener('change', event => {
  state.filtroEmpresa = event.target.value;
  state.page = 1;
  renderTable();
});

els.btnClearSearch.addEventListener('click', () => {
  state.search = '';
  els.searchInput.value = '';
  state.page = 1;
  renderTable();
});

els.btnPrev.addEventListener('click', () => {
  if (state.page > 1) {
    state.page--;
    renderTable();
  }
});

els.btnNext.addEventListener('click', () => {
  const rows = getFilteredRows();
  const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
  if (state.page < totalPages) {
    state.page++;
    renderTable();
  }
});

// Volver al menú: oculta todas las pantallas y la barra de ubicación.
els.btnVolverMenu.addEventListener('click', ocultarPantallas);

// La barra de ubicación también vuelve al panel principal.
els.ubicacion.addEventListener('click', ocultarPantallas);

// Detalle de asistencia (con mapa).
els.btnCerrarDetalleAsis.addEventListener('click', cerrarDetalleAsistencia);
els.detalleAsisModal.addEventListener('click', event => {
  if (event.target === els.detalleAsisModal) cerrarDetalleAsistencia();
});

// --- Descargas ---
els.btnDownload.addEventListener('click', descargarVistaActual);
els.btnDownloadInforme.addEventListener('click', descargarInformeCruce);

// --- Autenticación ---
els.loginForm.addEventListener('submit', event => {
  event.preventDefault();
  iniciarSesion(els.loginEmail.value.trim(), els.loginPassword.value);
});

els.btnLogout.addEventListener('click', cerrarSesion);

// --- Cambio de pestañas del cruce (datos unidos, sin terceros, etc.) ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    setActiveTab(tab.dataset.view);
    state.currentView = tab.dataset.view;
    state.page = 1;
    renderTable();
  });
});

// --- Arranque: controlar sesión antes de mostrar la aplicación ---
initAuth();
