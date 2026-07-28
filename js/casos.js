/**
 * casos.js
 * Gestión de casos (siniestros): perfil/rol del usuario, creación del caso
 * (primera medida), bandeja de casos y completado del caso + terceros.
 * Cada caso es una fila de registro_asistencias; los terceros van en
 * registro_terceros (relacionados por KEY).
 */

// Campos que el asistente completa (además de los capturados al crear el caso).
// Nota: DESCRIPCION DAÑOS EMPRESA, VERSION CONDUCTOR/ASISTENTE y las FIRMAS se
// manejan con secciones propias en el HTML (no en esta grilla).
const CAMPOS_CASO_COMPLETAR = [
  'AFILIADOS', 'CORREO AFILIADO', 'CELULAR AFILIADO',
  'USUARIO ASISTENCIA', 'USUARIO LOGISTICA', 'NOMBRE ASISTENTE EN SITIO',
  'COORDENADAS ASISTENCIA', 'HORA DE ATENCION', 'HORA Y FECHA DE ACCION USUARIO',
  'GRAVEDAD DEL SINIESTRO', 'RESPONSABILIDAD DEL CONDUCTOR',
  'LESIONADOS'
];

const CAMPOS_LARGOS = /OBSERVAC|VERSION|DESCRIPCION|DAÑOS|CROQUIS/;

/* ------------------------------------------------------------------ *
 *  Perfil / rol
 * ------------------------------------------------------------------ */

/** Carga el perfil (rol) del usuario autenticado y adapta el menú. */
async function cargarPerfil(user) {
  try {
    const { data, error } = await db
      .from('perfiles')
      .select('nombre, rol')
      .eq('id', user.id)
      .single();
    if (error) throw error;
    state.perfil = data;
  } catch (error) {
    state.perfil = { rol: 'asistente', nombre: user.email };
  }
  state.perfil.id = user.id; // se usa para el heartbeat de presencia
  aplicarRol();
  abrirCasoDesdeURL(); // deep-link: ?caso=CASO-... abre ese caso directo
  // Deja lista una copia del parque en el dispositivo, por si luego no hay señal.
  if (typeof precacheParqueSiHaceFalta === 'function') precacheParqueSiHaceFalta();
}

// Deep-link: si la URL trae ?caso=CASO-XXXX (p. ej. al volver desde el módulo
// de contratos), abre ese caso directamente una sola vez.
let _deepLinkCasoHecho = false;
async function abrirCasoDesdeURL() {
  if (_deepLinkCasoHecho) return;
  let num = null;
  try { num = new URLSearchParams(window.location.search).get('caso'); } catch (_) {}
  if (!num) return;
  _deepLinkCasoHecho = true;
  // Quita el parámetro para que un refresco no reabra el caso.
  try { history.replaceState(null, '', window.location.pathname); } catch (_) {}
  try {
    const { data, error } = await db.from('registro_asistencias')
      .select('numero_caso, estado, key, creado_en, asignado_a, datos')
      .eq('numero_caso', num).single();
    if (error || !data) { showStatus('No se encontró el caso ' + num + '.', 'error'); return; }
    abrirCaso(data);
  } catch (_) { /* si falla, se queda en el panel */ }
}

/**
 * Escribe `datos` de un caso SIN pisar cambios ajenos: relee la fila fresca de
 * la BD, aplica el cambio con la función `mutar(datos)` y guarda. Evita perder
 * evidencia (fotos, documentos) subida en tiempo real desde otro dispositivo.
 */
async function persistirDatosCaso(caso, mutar) {
  // Borrador local: aplica el cambio sobre su `datos` y lo guarda en el
  // dispositivo (subirá entero con la creación del caso al reconectar).
  if (typeof esBorrador === 'function' && esBorrador(caso)) {
    caso.datos = Object.assign({}, caso.datos || {});
    mutar(caso.datos);
    await guardarBorrador(caso);
    return { encolado: true };
  }

  const offline = (typeof offlineSinConexion === 'function') ? offlineSinConexion() : !navigator.onLine;

  // ONLINE: relee fresco, aplica `mutar` SOBRE lo fresco (así un append no pisa
  // lo que otro dispositivo agregó) y escribe. Igual que el comportamiento
  // original; solo se añade el respaldo offline.
  if (!offline) {
    try {
      let base = caso.datos || {};
      const { data } = await db.from('registro_asistencias')
        .select('datos').eq('numero_caso', caso.numero_caso).maybeSingle();
      if (data && data.datos) base = data.datos;
      const datos = Object.assign({}, base);
      mutar(datos);
      const { error } = await db.from('registro_asistencias')
        .update({ datos }).eq('numero_caso', caso.numero_caso);
      if (error) throw error;
      caso.datos = datos;
      return { encolado: false };
    } catch (e) {
      // Si NO fue error de red, propágalo; si fue de red, cae a la rama offline.
      if (!(typeof offlineEsErrorRed === 'function' && offlineEsErrorRed(e))) throw e;
    }
  }

  // OFFLINE (o cayó la red): aplica `mutar` sobre lo local, refleja en pantalla
  // y encola un merge del delta para subirlo al reconectar.
  const base = caso.datos || {};
  const datos = Object.assign({}, base);
  mutar(datos);
  const cambios = {};
  Object.keys(datos).forEach(k => { if (datos[k] !== base[k]) cambios[k] = datos[k]; });
  caso.datos = datos;

  if (typeof encolarMergeDatos === 'function') {
    return await encolarMergeDatos(caso.numero_caso, cambios);
  }
  const { error } = await db.from('registro_asistencias')
    .update({ datos }).eq('numero_caso', caso.numero_caso);
  if (error) throw error;
  return { encolado: false };
}

// Áreas del "desarrollo de dependencias" (Fase 2) y las rutas de cierre que ve
// cada una en su bandeja.
const AREA_ROLES = ['reclamaciones', 'seguridad_vial'];
const RUTAS_POR_ROL = {
  reclamaciones: ['RECLAMACION_FAVOR'],
  seguridad_vial: ['SEG_VIAL_2251', 'SEG_VIAL_LESIONES', 'SEG_VIAL_PREJUDICIALES']
};

/** Muestra u oculta las opciones del menú según el rol. */
function aplicarRol() {
  const rol = (state.perfil && state.perfil.rol) || 'asistente';
  els.rolUsuario.textContent = nombreRol(rol);

  const esArea = AREA_ROLES.includes(rol);
  const puedeCrear = rol === 'gestor' || rol === 'admin';
  // La bandeja la ven todos: el asistente para atender, el gestor para dar
  // seguimiento, las áreas para gestionar sus rutas y el admin para todo.
  const veBandeja = true;
  // Los módulos de análisis (cruce, registro completo, terceros) son para
  // gestor/admin; asistente y áreas trabajan enfocados en su bandeja.
  const veAnalisis = rol === 'gestor' || rol === 'admin';

  els.btnMenuCrearCaso.classList.toggle('hidden', !puedeCrear);
  els.btnMenuBandeja.classList.toggle('hidden', !veBandeja);
  // Módulo Seguridad Vial / Desarrollo de dependencias: el admin y el gestor ven
  // TODAS las rutas; cada área ve solo las suyas.
  if (els.btnMenuSegvial) {
    els.btnMenuSegvial.classList.toggle('hidden', !(rol === 'admin' || rol === 'gestor' || esArea));
  }
  // Dashboard de métricas: gestor y admin.
  if (els.btnMenuDashboard) els.btnMenuDashboard.classList.toggle('hidden', !veAnalisis);
  els.btnMenuUsuarios.classList.toggle('hidden', rol !== 'admin');
  // Ver quién está conectado: solo el administrador.
  if (els.btnMenuConectados) els.btnMenuConectados.classList.toggle('hidden', rol !== 'admin');
  els.btnVerCruce.classList.toggle('hidden', !veAnalisis);
  els.btnVerAsistenciasBD.classList.toggle('hidden', !veAnalisis);
  els.btnVerTercerosBD.classList.toggle('hidden', !veAnalisis);
  // El parque queda disponible para gestor/asistente/admin; las áreas se enfocan.
  els.btnVerParque.classList.toggle('hidden', esArea);
  // Menú "Contratos" (módulo completo para navegar TODOS los contratos):
  // solo gestor, admin y áreas jurídicas (reclamaciones, seguridad vial).
  // El asistente NO abre ese módulo, pero SÍ genera el contrato de conciliación
  // en sitio desde la tarjeta del tercero del caso (ver rolVeContratos en cierre.js).
  if (els.btnMenuContratos) {
    const veContratos = rol === 'gestor' || rol === 'admin' || esArea;
    els.btnMenuContratos.classList.toggle('hidden', !veContratos);
  }

  // Texto del tile de bandeja según el rol.
  if (els.bandejaTileTitulo) {
    els.bandejaTileTitulo.textContent = esArea ? 'Casos de mi área'
      : (rol === 'asistente' ? 'Mis casos asignados' : 'Bandeja de casos');
  }

  // Portal por rol: encabezado propio del panel.
  const nombre = (state.perfil && state.perfil.nombre) || '';
  const primerNombre = String(nombre).split(/[\s@]/)[0];
  const PORTAL = {
    admin: { t: 'Panel de administración', s: 'Control total: casos, asignaciones, usuarios y análisis.' },
    gestor: { t: 'Panel del gestor de casos', s: 'Registra siniestros (primera medida), asigna y haz seguimiento.' },
    asistente: { t: `Hola${primerNombre ? ', ' + primerNombre : ''}`, s: 'Estos son tus casos asignados para atender en sitio.' },
    reclamaciones: { t: 'Panel de Reclamaciones', s: 'Casos enrutados a reclamación a favor: gestiona el proceso y adjunta soportes.' },
    seguridad_vial: { t: 'Panel de Seguridad Vial', s: 'Casos 2251, lesiones y prejudiciales: audiencias, fallos, reservas y documentación.' }
  };
  const info = PORTAL[rol] || { t: 'Panel principal', s: 'Selecciona un módulo para comenzar.' };
  if (els.homeTitulo) els.homeTitulo.textContent = info.t;
  if (els.homeSub) els.homeSub.textContent = info.s;
  document.body.dataset.rol = rol; // permite estilos por rol si se desea

  // Arranca las notificaciones de casos pendientes (campanita) y la presencia.
  cargarPerfilesLista();
  iniciarNotificaciones();
  iniciarPresencia();

  // El asistente y las áreas aterrizan directo en su bandeja (portal enfocado).
  if (rol === 'asistente' || esArea) abrirBandeja();
}

/* ------------------------------------------------------------------ *
 *  Presencia (quién está conectado) — solo el admin ve el panel
 * ------------------------------------------------------------------ */

/** Marca "última actividad" del usuario (heartbeat). */
async function latidoPresencia() {
  const id = state.perfil && state.perfil.id;
  if (!id) return;
  try {
    await db.from('perfiles').update({ last_seen: new Date().toISOString() }).eq('id', id);
  } catch (e) { /* ignora */ }
}

/** Inicia el heartbeat de presencia (marca ahora y cada PRESENCIA_MS). */
function iniciarPresencia() {
  latidoPresencia();
  if (state.presenceTimer) clearInterval(state.presenceTimer);
  state.presenceTimer = setInterval(latidoPresencia, PRESENCIA_MS);
}

/**
 * Ahorro de consumo: cuando la pestaña queda en segundo plano (o se minimiza),
 * se detienen TODOS los sondeos; al volver al frente se reanudan. Así, aunque
 * la app quede abierta pero sin uso, no gasta peticiones.
 */
function gestionarVisibilidad() {
  if (!state.perfil) return; // sin sesión no hay nada que sondear
  if (document.hidden) {
    if (state.notifTimer) { clearInterval(state.notifTimer); state.notifTimer = null; }
    if (state.presenceTimer) { clearInterval(state.presenceTimer); state.presenceTimer = null; }
    if (state.conectadosTimer) { clearInterval(state.conectadosTimer); state.conectadosTimer = null; }
  } else {
    iniciarNotificaciones();
    iniciarPresencia();
    // Reanuda el panel de conectados solo si está abierto.
    if (els.conectadosCard && !els.conectadosCard.classList.contains('hidden')) {
      cargarConectados();
      state.conectadosTimer = setInterval(cargarConectados, CONECTADOS_MS);
    }
  }
}

/** Abre el panel de usuarios conectados (solo admin) y lo auto-refresca. */
async function abrirConectados() {
  ocultarPantallas();
  els.conectadosCard.classList.remove('hidden');
  marcarUbicacion('btnMenuConectados', 'Usuarios conectados');
  await cargarConectados();
  if (state.conectadosTimer) clearInterval(state.conectadosTimer);
  state.conectadosTimer = setInterval(cargarConectados, CONECTADOS_MS);
}

/** Texto de "última vez visto". */
function textoUltimaVez(ts) {
  if (!ts) return 'Sin actividad';
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'hace instantes';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

/** Lista los usuarios con su estado (en línea = actividad < 2 min). */
async function cargarConectados() {
  const cont = els.conectadosLista;
  try {
    const { data, error } = await db.from('perfiles').select('id, nombre, rol, last_seen');
    if (error) throw error;
    const ahora = Date.now();
    const filas = (data || []).map(p => {
      const ls = p.last_seen ? new Date(p.last_seen).getTime() : 0;
      const online = ls && (ahora - ls) < VENTANA_ONLINE_MS;
      return { nombre: p.nombre || p.id, rol: p.rol, ls, online };
    }).sort((a, b) => (b.online - a.online) || (b.ls - a.ls));

    const enLinea = filas.filter(f => f.online).length;
    cont.innerHTML =
      `<div class="conectados-cab"><b>${enLinea}</b> en línea · ${filas.length} usuarios</div>` +
      filas.map(f => `
        <div class="conectado-item">
          <span class="conectado-dot ${f.online ? 'on' : 'off'}"></span>
          <span class="conectado-nombre">${f.nombre}</span>
          <span class="conectado-rol">${nombreRol(f.rol)}</span>
          <span class="conectado-visto">${f.online ? 'En línea' : textoUltimaVez(f.ls)}</span>
        </div>`).join('');
  } catch (e) {
    cont.innerHTML = `<div class="tercero-estado">Error: ${e.message || e}</div>`;
  }
}

/** Carga la lista de perfiles (para asignar y mostrar nombres). */
async function cargarPerfilesLista() {
  try {
    const { data, error } = await db.from('perfiles').select('id, nombre, rol');
    if (error) throw error;
    state.perfilesLista = data || [];
    state.usuariosPorId = {};
    state.perfilesLista.forEach(p => { state.usuariosPorId[p.id] = p.nombre || p.id; });
  } catch (error) {
    state.perfilesLista = [];
  }
}

/** Llena un <select> con las personas asignables (asistentes y admin). */
function llenarSelectAsistentes(sel, seleccionadoId) {
  if (!sel) return;
  sel.innerHTML = '<option value="">— Sin asignar —</option>';
  state.perfilesLista
    // Se puede asignar a asistentes y a administradores (para pruebas).
    .filter(p => p.rol === 'asistente' || p.rol === 'admin')
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || '')))
    .forEach(p => {
      const o = document.createElement('option');
      o.value = p.id;
      const etiqueta = p.rol === 'admin' ? ` · ${nombreRol('admin')}` : '';
      o.textContent = `${p.nombre || p.id}${etiqueta}`;
      if (p.id === seleccionadoId) o.selected = true;
      sel.appendChild(o);
    });
}

/* ------------------------------------------------------------------ *
 *  Notificaciones (campanita de casos pendientes)
 * ------------------------------------------------------------------ */

/** Actualiza la campanita con la cantidad de casos pendientes del usuario. */
async function actualizarNotificaciones() {
  const rol = (state.perfil && state.perfil.rol) || '';
  const esArea = AREA_ROLES.includes(rol);
  if (rol !== 'asistente' && rol !== 'admin' && !esArea) {
    if (els.btnNotif) els.btnNotif.classList.add('hidden');
    return;
  }
  try {
    let n;
    if (esArea) {
      // Las áreas cuentan los casos abiertos enrutados a sus rutas de cierre.
      const rutas = RUTAS_POR_ROL[rol] || [];
      const { data, error } = await db
        .from('registro_asistencias')
        .select('datos')
        .not('estado', 'in', '(CERRADO,HISTORICO)')
        .limit(500);
      if (error) throw error;
      n = (data || []).filter(c => rutas.includes((c.datos || {})['RUTA CIERRE'])).length;
    } else {
      let q = db
        .from('registro_asistencias')
        .select('id', { count: 'exact', head: true })
        .not('estado', 'in', '(CERRADO,HISTORICO)');
      // El asistente ve solo los casos que le fueron asignados.
      if (rol === 'asistente') {
        const { data: u } = await db.auth.getUser();
        q = q.eq('asignado_a', u.user.id);
      }
      const { count, error } = await q;
      if (error) throw error;
      n = count || 0;
    }

    els.btnNotif.classList.remove('hidden');
    els.notifBadge.textContent = n > 99 ? '99+' : String(n);
    els.notifBadge.classList.toggle('hidden', n === 0);
    els.btnNotif.classList.toggle('tiene', n > 0);
  } catch (error) {
    /* silencioso: la campanita no debe romper la app */
  }
}

// Intervalos de sondeo (ms). Más largos = MENOS consumo (ideal plan Free).
// Puedes subirlos aún más para ahorrar (p. ej. PRESENCIA_MS a 30*60*1000).
const NOTIF_MS = 60 * 1000;          // campanita de pendientes: cada 1 min
const PRESENCIA_MS = 5 * 60 * 1000;  // heartbeat "estoy conectado": cada 5 min
const CONECTADOS_MS = 60 * 1000;     // refresco del panel de conectados: cada 1 min
const VENTANA_ONLINE_MS = 11 * 60 * 1000; // "en línea" = actividad < 11 min

/** Inicia el refresco periódico de la campanita. */
function iniciarNotificaciones() {
  actualizarNotificaciones();
  if (state.notifTimer) clearInterval(state.notifTimer);
  state.notifTimer = setInterval(actualizarNotificaciones, NOTIF_MS);
}

/* ------------------------------------------------------------------ *
 *  Utilidades
 * ------------------------------------------------------------------ */

/** Genera una clave hexadecimal única (formato similar a los KEY existentes). */
function generarKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Carpeta de storage del caso: su N.º de caso si ya existe; si no (borrador
 * creado sin señal), su `key`. Como la ruta se guarda tal cual en `datos`, sigue
 * siendo válida aunque después el caso reciba su número.
 */
function carpetaCaso(caso) {
  return (caso && (caso.numero_caso || caso.key)) || 'sin-id';
}

/** Oculta todas las pantallas (vistas de tabla y pantallas de casos). */
function ocultarPantallas() {
  ['statsBox', 'tabsBox', 'controlsBox', 'tableCard', 'btnDownloadInforme',
   'casoCrearCard', 'casoListaCard', 'casoDetalleCard', 'usuariosCard', 'conectadosCard',
   'segvialCard', 'dashboardCard'].forEach(id => {
    if (els[id]) els[id].classList.add('hidden');
  });
  // Al salir del panel de conectados, detiene su auto-refresco.
  if (state.conectadosTimer) { clearInterval(state.conectadosTimer); state.conectadosTimer = null; }
  limpiarUbicacion();
}

/** Entra a un módulo: oculta el menú y muestra la barra de ubicación. */
function marcarUbicacion(tileId, nombre) {
  const tiles = document.querySelector('.tiles');
  const head = document.querySelector('.home-head');
  if (tiles) tiles.classList.add('hidden');
  if (head) head.classList.add('hidden');
  els.ubicacionTexto.textContent = nombre;
  els.ubicacion.classList.remove('hidden');
}

/** Vuelve al menú: muestra las tarjetas y oculta la barra de ubicación. */
function limpiarUbicacion() {
  const tiles = document.querySelector('.tiles');
  const head = document.querySelector('.home-head');
  if (tiles) tiles.classList.remove('hidden');
  if (head) head.classList.remove('hidden');
  els.ubicacion.classList.add('hidden');
}

// Ciclo de vida del caso: valor en BD -> etiqueta y clase de color.
const ESTADOS_CASO = {
  REPORTADO:  { texto: 'Reportado',  clase: 'est-reportado' },
  ASIGNADO:   { texto: 'Asignado',   clase: 'est-asignado' },
  EN_SITIO:   { texto: 'En sitio',   clase: 'est-sitio' },
  TELEFONICA: { texto: 'Telefónica', clase: 'est-telefonica' },
  EN_PROCESO: { texto: 'En proceso', clase: 'est-proceso' },
  ASISTIDO:   { texto: 'Asistido',   clase: 'est-asistido' },
  CERRADO:    { texto: 'Cerrado',    clase: 'est-cerrado' },
  CANCELADO:  { texto: 'Cancelado',  clase: 'est-cancelado' },
  HISTORICO:  { texto: 'Histórico',  clase: 'est-historico' }
};

/** Devuelve una etiqueta de estado con color. */
function badgeEstado(estado) {
  const info = ESTADOS_CASO[estado] || { texto: estado || 'Reportado', clase: 'est-reportado' };
  return `<span class="estado-badge ${info.clase}">${info.texto}</span>`;
}

// Checklist de atención: qué debe tener un caso para considerarse "Asistido".
// Cada ítem sabe leer si está cumplido en los datos del caso.
const CHECKLIST_CASO = [
  { etiqueta: 'Llegada al sitio (GPS) o atención telefónica', ok: d => !!String(d['COORDENADAS ASISTENCIA'] || '').trim() || String(d['ASISTENCIA TELEFONICA'] || '').toUpperCase() === 'SI' },
  { etiqueta: 'Gravedad del siniestro', ok: d => !!String(d['GRAVEDAD DEL SINIESTRO'] || '').trim() },
  { etiqueta: 'Responsabilidad del conductor', ok: d => !!String(d['RESPONSABILIDAD DEL CONDUCTOR'] || '').trim() },
  { etiqueta: 'Hipótesis del siniestro', ok: d => !!String(d['CODIGO HIPOTESIS'] || '').trim() },
  { etiqueta: 'Versión del conductor (texto o audio)', ok: d => !!(String(d['VERSION CONDUCTOR'] || '').trim() || d['VERSION CONDUCTOR AUDIO']) },
  { etiqueta: 'Descripción de daños', ok: d => !!String(d['DESCRIPCION DAÑOS EMPRESA'] || '').trim() },
  { etiqueta: 'Lesionados', ok: d => !!String(d['LESIONADOS'] || '').trim() },
  { etiqueta: 'Al menos una foto del sitio', ok: d => Array.isArray(d['FOTOS SITIO']) && d['FOTOS SITIO'].length > 0 },
  { etiqueta: 'Croquis del accidente', ok: d => !!d['CROQUIS'] }
];

/** Cuenta cuántos ítems del checklist están cumplidos. */
function completitudCaso(datos) {
  const d = datos || {};
  const hechos = CHECKLIST_CASO.filter(item => item.ok(d)).length;
  return { total: CHECKLIST_CASO.length, hechos };
}

/**
 * Calcula el estado del caso automáticamente según lo que ha hecho el asistente.
 * No toca estados terminales/manuales (CERRADO, CANCELADO, HISTORICO).
 */
function calcularEstadoAuto(caso, datos) {
  if (['CERRADO', 'CANCELADO', 'HISTORICO'].includes(caso.estado)) return caso.estado;
  const d = datos || {};
  const tel = String(d['ASISTENCIA TELEFONICA'] || '').toUpperCase() === 'SI';
  const geo = !!String(d['COORDENADAS ASISTENCIA'] || '').trim();
  // Sin llegada al sitio y sin marcar telefónica: aún no arranca la atención.
  if (!geo && !tel) return caso.asignado_a ? 'ASIGNADO' : 'REPORTADO';
  const { total, hechos } = completitudCaso(datos);
  if (hechos >= total) return 'ASISTIDO';   // completó todo → caso asistido
  if (tel) return 'TELEFONICA';             // atención telefónica en curso
  if (hechos > 1) return 'EN_PROCESO';       // llegó y va llenando
  return 'EN_SITIO';                         // recién llegó (solo el GPS)
}

/** Devuelve la marca de tiempo (ms) de llegada, del TS o parseando el texto. */
function tsLlegada(d) {
  if (d['LLEGADA TS']) return Number(d['LLEGADA TS']);
  // Respaldo: parsear "dd/mm/aaaa HH:MM" de FECHA Y HORA DE LLEGADA.
  const m = String(d['FECHA Y HORA DE LLEGADA'] || '').match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]).getTime();
  return null;
}

/** Formatea una duración en ms a un texto legible (ej. "2 h 15 min"). */
function formatearDuracion(ms) {
  if (ms == null || ms < 0) return '—';
  const min = Math.round(ms / 60000);
  if (min < 1) return 'menos de 1 min';
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** Muestra cuánto se demoró (o lleva) la asistencia. */
function renderDuracionCaso(caso) {
  const cont = els.detalleDuracion;
  if (!cont) return;
  const d = caso.datos || {};
  const ini = tsLlegada(d);
  if (!ini) { cont.innerHTML = ''; return; }

  const fin = d['FIN ATENCION TS'] ? Number(d['FIN ATENCION TS']) : null;
  if (fin) {
    cont.innerHTML =
      `<span class="dur-ico">⏱️</span> Duración de la asistencia: <b>${formatearDuracion(fin - ini)}</b>
       <span class="dur-detalle">Llegada ${d['FECHA Y HORA DE LLEGADA'] || ''} → Fin ${d['HORA FIN ATENCION'] || ''}</span>`;
  } else {
    cont.innerHTML =
      `<span class="dur-ico">⏱️</span> En atención desde ${d['FECHA Y HORA DE LLEGADA'] || ''}
       · <b>${formatearDuracion(Date.now() - ini)}</b> transcurrido`;
  }
}

/** Pinta el checklist de avance del caso (transparencia del estado automático). */
function renderChecklistCaso(caso) {
  const cont = els.detalleChecklist;
  if (!cont) return;
  const d = caso.datos || {};
  const { total, hechos } = completitudCaso(d);
  const items = CHECKLIST_CASO.map(item => {
    const ok = item.ok(d);
    return `<li class="${ok ? 'chk-ok' : 'chk-no'}">${ok ? '✅' : '⬜'} ${item.etiqueta}</li>`;
  }).join('');
  cont.innerHTML =
    `<div class="checklist-cab">Avance de atención: <b>${hechos}/${total}</b> · el estado se actualiza solo al guardar</div>
     <ul class="checklist-items">${items}</ul>`;
}

/* ------------------------------------------------------------------ *
 *  Crear caso (primera medida)
 * ------------------------------------------------------------------ */

/** Abre el formulario de creación de caso y carga los vehículos. */
async function abrirCrearCaso() {
  ocultarPantallas();
  els.casoCrearCard.classList.remove('hidden');
  marcarUbicacion('btnMenuCrearCaso', 'Crear caso — primera medida');
  els.formCaso.reset();
  els.casoVehiculo.value = '';
  els.casoVehiculoBuscar.value = '';
  els.casoVehiculoLista.classList.add('hidden');
  els.casoVehiculoLista.innerHTML = '';
  limpiarAutocompletado();
  ponerFechaHoraActual();

  if (!state.parqueRows.length) {
    showLoader(true);
    const r = await asegurarParqueDisponible();
    showLoader(false);
    if (r.origen === 'cache') {
      showStatus('Sin conexión: usando el parque guardado en el dispositivo para buscar el vehículo.', 'ok');
    } else if (r.origen === 'vacio') {
      showStatus('No se pudo cargar el parque (sin señal y sin copia local). Puedes escribir la placa a mano.', 'error');
    }
  }
  llenarListasVehiculo();

  if (!state.perfilesLista.length) await cargarPerfilesLista();
  llenarSelectAsistentes(els.casoAsignar, '');

  mostrarPasoCaso(1);
}

/* ------------------------------------------------------------------ *
 *  Formulario de crear caso (directo, sin pasos)
 * ------------------------------------------------------------------ */

/**
 * Compatibilidad: el formulario de crear caso ya NO es por pasos, es un solo
 * formulario directo con todas las secciones visibles. Se conserva la función
 * porque otras partes la invocan (al abrir el formulario y tras crear un caso).
 */
function mostrarPasoCaso(n) {
  state.casoPaso = n || 1;
}

/** Enfoca y desplaza a un campo (usado al validar el formulario directo). */
function irACampoCaso(el, mensaje) {
  showStatus(mensaje, 'error');
  if (el) {
    el.focus();
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/**
 * Valida TODO el formulario (ya no hay pasos). Devuelve true si está completo;
 * si no, muestra el mensaje y lleva al primer campo que falta.
 */
function validarCasoCompleto() {
  if (!els.casoPlaca.value.trim()) {
    irACampoCaso(els.casoVehiculoBuscar, 'Selecciona el vehículo en el parque o registra la placa manualmente.');
    return false;
  }
  // Vehículo MANUAL (no está en el parque): hay que diligenciar todos los campos
  // del vehículo. El caso quedará marcado para revisión.
  if (vehiculoEsManual()) {
    actualizarAvisoParque();
    const obligatorios = [
      [els.casoEmpresa, 'Indica la empresa del vehículo (no está en el parque).'],
      [els.casoTipo, 'Indica el tipo de vehículo (no está en el parque).'],
      [els.casoPropietario, 'Indica el propietario del vehículo (no está en el parque).'],
      [els.casoAseguradora, 'Indica la aseguradora del vehículo (no está en el parque).']
    ];
    for (const [campo, msg] of obligatorios) {
      if (campo && !String(campo.value || '').trim()) { irACampoCaso(campo, msg); return false; }
    }
  }
  const conductor = els.casoConductor.value.trim();
  if (conductor.length < 3 || !/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(conductor)) {
    irACampoCaso(els.casoConductor, 'Ingresa el nombre del conductor (solo letras).');
    return false;
  }
  if (!/^\d{4,}$/.test(els.casoCedulaConductor.value.trim())) {
    irACampoCaso(els.casoCedulaConductor, 'Ingresa una cédula válida (solo números, mínimo 4 dígitos).');
    return false;
  }
  if (!els.casoFecha.value) { irACampoCaso(els.casoFecha, 'Indica la fecha del siniestro.'); return false; }
  if (!els.casoHora.value) { irACampoCaso(els.casoHora, 'Indica la hora del siniestro.'); return false; }
  if (!els.casoReportadoPor.value.trim()) { irACampoCaso(els.casoReportadoPor, 'Indica quién reporta el caso.'); return false; }
  return true;
}

/** Llena la lista de empresas y el desplegable de tipos con valores del parque. */
function llenarListasVehiculo() {
  const distintos = campo => [...new Set(
    state.parqueRows.map(v => String(v[campo] || '').trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  // Empresas -> datalist
  els.listaEmpresas.innerHTML = '';
  distintos('empresa').forEach(e => {
    const opt = document.createElement('option');
    opt.value = e;
    els.listaEmpresas.appendChild(opt);
  });

  // Tipos de vehículo -> select (unificando duplicados por mayúsculas/tildes)
  els.casoTipo.innerHTML = '<option value="">— Selecciona —</option>';
  tiposDeVehiculoLimpios().forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    els.casoTipo.appendChild(opt);
  });
}

/**
 * Devuelve los tipos de vehículo del parque SIN duplicados por
 * mayúsculas/tildes (p. ej. "Bus" y "BUS" cuentan como uno solo). Para cada
 * grupo elige la etiqueta más legible (evita TODO EN MAYÚSCULAS y conserva
 * tildes) y las ordena alfabéticamente.
 */
function tiposDeVehiculoLimpios() {
  const porClave = new Map(); // clave normalizada -> mejor etiqueta
  const esTodoMayus = s => s === s.toUpperCase();
  const tieneTilde = s => /[áéíóúñ]/i.test(s);

  state.parqueRows.forEach(v => {
    const raw = String(v.tipo || '').trim();
    if (!raw) return;
    const clave = normalizeName(raw); // MAYÚSCULAS, sin tildes, sin espacios extra
    const actual = porClave.get(clave);
    if (!actual) { porClave.set(clave, raw); return; }

    // Preferir: no-todo-mayúsculas > con tildes > más corta.
    let cambiar = false;
    if (esTodoMayus(actual) && !esTodoMayus(raw)) cambiar = true;
    else if (esTodoMayus(actual) === esTodoMayus(raw)) {
      if (!tieneTilde(actual) && tieneTilde(raw)) cambiar = true;
      else if (tieneTilde(actual) === tieneTilde(raw) && raw.length < actual.length) cambiar = true;
    }
    if (cambiar) porClave.set(clave, raw);
  });

  return [...porClave.values()].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Pone la fecha y hora actuales en el formulario (siniestro y reporte). */
function ponerFechaHoraActual() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fecha = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const hora = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  els.casoFecha.value = fecha;
  els.casoHora.value = hora;
  // Hora de reporte: se llena sola con "ahora", pero queda editable.
  if (els.casoFechaReporte) els.casoFechaReporte.value = fecha;
  if (els.casoHoraReporte) els.casoHoraReporte.value = hora;
}

/** Filtra el parque por placa/empresa/N.º interno y muestra coincidencias. */
function filtrarVehiculos() {
  const term = els.casoVehiculoBuscar.value.trim().toLowerCase();
  const lista = els.casoVehiculoLista;

  // Al escribir se anula la selección previa hasta elegir de la lista.
  els.casoVehiculo.value = '';

  if (!term) {
    lista.classList.add('hidden');
    lista.innerHTML = '';
    return;
  }

  const resultados = state.parqueRows
    .filter(v => {
      const placa = String(v.placa || '').toLowerCase();
      const interno = String(v.numero_interno || '').toLowerCase();
      const empresa = String(v.empresa || '').toLowerCase();
      // Con 1-2 letras solo se busca por placa/interno; la empresa desde 3.
      return placa.includes(term) || interno.includes(term) ||
        (term.length >= 3 && empresa.includes(term));
    })
    .sort((a, b) => {
      const r = rankVehiculo(a, term) - rankVehiculo(b, term);
      if (r) return r;
      // Los que tienen placa van primero.
      const ap = a.placa ? 0 : 1, bp = b.placa ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return String(a.placa || '').localeCompare(String(b.placa || ''));
    })
    .slice(0, 40);

  lista.innerHTML = '';

  if (!resultados.length) {
    const vacio = document.createElement('div');
    vacio.className = 'combo-item combo-vacio';
    vacio.textContent = 'No se encontró en el parque automotor.';
    lista.appendChild(vacio);
  }

  resultados.forEach(v => {
    const item = document.createElement('div');
    item.className = 'combo-item';
    const idv = v.placa
      ? `<b>${v.placa}</b>`
      : (v.numero_interno ? `<b>Interno #${v.numero_interno}</b>` : '<b>(sin placa)</b>');
    const interno = (v.placa && v.numero_interno) ? ` · #${v.numero_interno}` : '';
    item.innerHTML = `${idv} · ${v.empresa || ''}${interno}`;
    // mousedown (no click) para que la selección ocurra antes del blur.
    item.addEventListener('mousedown', event => {
      event.preventDefault();
      seleccionarVehiculo(v);
    });
    lista.appendChild(item);
  });

  // Opción para registrar un vehículo que no está en el parque.
  const manual = document.createElement('div');
  manual.className = 'combo-item combo-manual';
  manual.innerHTML = `➕ Registrar manualmente "<b>${els.casoVehiculoBuscar.value.trim()}</b>" (no está en el parque)`;
  manual.addEventListener('mousedown', event => {
    event.preventDefault();
    usarVehiculoManual();
  });
  lista.appendChild(manual);

  lista.classList.remove('hidden');
}

/** Prioriza: 0 = placa/interno exacto, 1 = empieza por, 2 = contiene, 5 = solo empresa. */
function rankVehiculo(v, term) {
  const placa = String(v.placa || '').toLowerCase();
  const interno = String(v.numero_interno || '').toLowerCase();
  if (placa === term || interno === term) return 0;
  if (placa.startsWith(term) || interno.startsWith(term)) return 1;
  if (placa.includes(term) || interno.includes(term)) return 2;
  return 5;
}

/** Selecciona un vehículo de la lista y autocompleta el formulario. */
function seleccionarVehiculo(v) {
  els.casoVehiculo.value = v.key;
  const idv = v.placa || (v.numero_interno ? `Interno #${v.numero_interno}` : '(sin placa)');
  els.casoVehiculoBuscar.value = `${idv} · ${v.empresa || ''}`;
  els.casoVehiculoLista.classList.add('hidden');
  autocompletarVehiculo();
}

/**
 * ¿El vehículo del formulario es MANUAL (no salió del parque automotor)? Es
 * manual cuando hay una placa escrita pero no se eligió ningún vehículo de la
 * lista del parque. Estos casos exigen diligenciar todo y quedan por revisar.
 */
function vehiculoEsManual() {
  return !els.casoVehiculo.value && !!els.casoPlaca.value.trim();
}

/** Muestra u oculta el aviso de "vehículo fuera del parque" según corresponda. */
function actualizarAvisoParque() {
  if (els.casoVehiculoAviso) els.casoVehiculoAviso.classList.toggle('hidden', !vehiculoEsManual());
}

/** Activa el modo manual: la placa escrita se usa y los datos se llenan a mano. */
function usarVehiculoManual() {
  const texto = els.casoVehiculoBuscar.value.trim().toUpperCase();
  els.casoVehiculo.value = '';
  els.casoVehiculoLista.classList.add('hidden');
  limpiarAutocompletado();
  els.casoVehiculoBuscar.value = `${texto} · (registro manual)`;
  els.casoPlaca.value = texto;
  showStatus('Vehículo no encontrado en el parque. Diligencia TODOS los campos: el vehículo quedará marcado para revisión.', 'info');
  actualizarAvisoParque();
  els.casoEmpresa.focus();
}

/** Autocompleta los datos del vehículo seleccionado. */
function autocompletarVehiculo() {
  const v = state.parqueRows.find(x => x.key === els.casoVehiculo.value) || {};
  els.casoEmpresa.value = v.empresa || '';
  els.casoPlaca.value = v.placa || '';
  els.casoInterno.value = v.numero_interno || '';
  seleccionarTipoVehiculo(v.tipo || '');
  // El conductor y la cédula NO se traen del parque (ese conductor no suele ser
  // el real): los escribe quien atiende el caso. Se limpian por si venían de una
  // selección anterior.
  els.casoConductor.value = '';
  els.casoCedulaConductor.value = '';
  els.casoPropietario.value = v.propietario || '';
  els.casoAseguradora.value = v.aseguradora || '';
  actualizarAvisoParque(); // vehículo del parque → oculta el aviso de revisión
}

/**
 * Selecciona el tipo de vehículo en el desplegable comparando de forma
 * insensible a mayúsculas/tildes (porque las etiquetas se unificaron). Si el
 * tipo no existe como opción, lo agrega para no perder el dato.
 */
function seleccionarTipoVehiculo(tipo) {
  const objetivo = normalizeName(tipo);
  if (!objetivo) { els.casoTipo.value = ''; return; }

  const opcion = [...els.casoTipo.options].find(o => normalizeName(o.value) === objetivo);
  if (opcion) {
    els.casoTipo.value = opcion.value;
  } else {
    const nueva = document.createElement('option');
    nueva.value = tipo;
    nueva.textContent = tipo;
    els.casoTipo.appendChild(nueva);
    els.casoTipo.value = tipo;
  }
}

/** Limpia los campos autocompletados. */
function limpiarAutocompletado() {
  ['casoEmpresa', 'casoPlaca', 'casoInterno', 'casoTipo', 'casoConductor',
   'casoCedulaConductor', 'casoPropietario', 'casoAseguradora'].forEach(id => {
    els[id].value = '';
  });
  actualizarAvisoParque(); // sin placa ya no es "manual": oculta el aviso
}

/** Crea el caso en la base de datos (estado inicial REPORTADO). */
async function guardarCaso(event) {
  event.preventDefault();

  // Formulario directo (sin pasos): validar todo de una vez y crear.
  if (!validarCasoCompleto()) return;

  const placa = els.casoPlaca.value.trim();

  const vSel = state.parqueRows.find(x => x.key === els.casoVehiculo.value);

  const datos = {
    'EMPRESA': els.casoEmpresa.value.trim(),
    'PLACA VEHICULO': placa,
    'NUMERO INTERNO VEHICULO': els.casoInterno.value.trim(),
    'TIPO DE VEHICULO': els.casoTipo.value.trim(),
    'CEDULA DEL CONDUCTOR': els.casoCedulaConductor.value.trim(),
    'NOMBRE CONDUCTOR': els.casoConductor.value.trim(),
    'PROPIETARIO': els.casoPropietario.value.trim(),
    'ASEGURADORA': els.casoAseguradora.value.trim(),
    'CORREO AFILIADO': vSel ? (vSel.correo_empresa || '') : '',
    'ORIGEN VEHICULO': vSel ? 'PARQUE' : 'MANUAL',
    // Marca de revisión: si el vehículo no salió del parque, el administrador
    // debe revisar si pertenece a una empresa afiliada.
    'VEHICULO POR REVISAR': vSel ? '' : 'SI',
    'REPORTADO POR': els.casoReportadoPor.value.trim(),
    'FECHA DE REPORTE': els.casoFechaReporte ? els.casoFechaReporte.value : '',
    'HORA DE REPORTE': els.casoHoraReporte ? els.casoHoraReporte.value : '',
    'FECHA DEL SINIESTRO': els.casoFecha.value,
    'HORA DEL SINIESTRO': els.casoHora.value,
    'RUTA': els.casoRuta.value.trim(),
    'CIUDAD DEL SINIESTRO': els.casoCiudad ? els.casoCiudad.value.trim() : '',
    'DIRECCION DEL LUGAR DEL SINIESTRO': els.casoDireccion.value.trim(),
    'NUMERO DE CONTACTO': els.casoContacto.value.trim(),
    'OBSERVACIONES': els.casoObservaciones.value.trim()
  };

  const asignado = els.casoAsignar.value || null;

  // Estado elegido en el formulario. Si se deja en "Reportado" pero se asigna a
  // alguien, sube a "Asignado" automáticamente.
  let estadoInicial = els.casoEstadoInicial.value || 'REPORTADO';
  if (asignado && estadoInicial === 'REPORTADO') estadoInicial = 'ASIGNADO';

  // creado_por desde el perfil ya cargado (funciona sin señal; no llama a la red).
  const payload = {
    key: generarKey(),
    estado: estadoInicial,
    creado_por: (state.perfil && state.perfil.id) || null,
    asignado_a: asignado,
    datos
  };
  const quien = asignado ? (state.usuariosPorId[asignado] || 'un asistente') : null;

  // Deja el formulario limpio tras crear el caso o guardar el borrador.
  const limpiarTrasCrear = () => {
    els.formCaso.reset();
    limpiarAutocompletado();
    els.casoVehiculo.value = '';
    els.casoVehiculoBuscar.value = '';
    ponerFechaHoraActual();
    llenarSelectAsistentes(els.casoAsignar, '');
    mostrarPasoCaso(1);
    actualizarNotificaciones();
  };
  // Guarda el caso como BORRADOR en el dispositivo (se creará al reconectar) y
  // lo deja disponible en la bandeja para seguir trabajándolo sin señal.
  const guardarComoBorrador = async () => {
    await encolarInsertCaso(payload);
    if (typeof guardarBorrador === 'function') {
      await guardarBorrador({
        key: payload.key, estado: payload.estado, asignado_a: payload.asignado_a,
        datos: datos, creado_en: new Date().toISOString()
      });
    }
    mostrarCasoCreado('⏳ Borrador — se subirá al reconectar', datos, quien, payload.estado);
    limpiarTrasCrear();
  };

  // Sin señal: no llamamos al servidor; guardamos el borrador de una vez.
  if (typeof offlineSinConexion === 'function' && offlineSinConexion()) {
    try { await guardarComoBorrador(); }
    catch (e) { showStatus('No se pudo guardar el borrador local: ' + (e.message || e), 'error'); }
    return;
  }

  try {
    showLoader(true);
    const { data, error } = await db
      .from('registro_asistencias')
      .insert(payload)
      .select('numero_caso')
      .single();
    if (error) throw error;
    mostrarCasoCreado(data.numero_caso, datos, quien, payload.estado);
    limpiarTrasCrear();
  } catch (error) {
    // Si el fallo fue de red, no perder el caso: guardarlo como borrador local
    // (encola la creación + guarda el borrador + muestra el modal).
    if (typeof offlineEsErrorRed === 'function' && offlineEsErrorRed(error)) {
      try { await guardarComoBorrador(); }
      catch (e) { showStatus('No se pudo guardar el borrador local: ' + (e.message || e), 'error'); }
    } else {
      showStatus('Error al crear el caso: ' + (error.message || error), 'error');
    }
  } finally {
    showLoader(false);
  }
}

/** Muestra el modal de confirmación con el detalle del caso creado. */
function mostrarCasoCreado(numeroCaso, datos, asignadoNombre, estado) {
  const d = datos || {};
  els.casoCreadoSub.textContent = `N.º ${numeroCaso} · ${badgeEstado(estado).replace(/<[^>]+>/g, '')}`;

  const fila = (lab, val) => val
    ? `<div class="detalle-item"><div class="detalle-lab">${lab}</div><div class="detalle-val">${val}</div></div>`
    : '';

  const idVeh = [d['PLACA VEHICULO'], d['NUMERO INTERNO VEHICULO'] ? `Interno #${d['NUMERO INTERNO VEHICULO']}` : '']
    .filter(Boolean).join(' · ');
  const fechaHora = [d['FECHA DEL SINIESTRO'], d['HORA DEL SINIESTRO']].filter(Boolean).join('  ');

  const asignadoHtml = asignadoNombre
    ? `<b>${asignadoNombre}</b> — le aparecerá como pendiente (campanita 🔔).`
    : 'Sin asignar todavía — queda disponible en la bandeja para que un asistente lo tome.';

  const avisoRevisar = String(d['VEHICULO POR REVISAR'] || '').toUpperCase() === 'SI'
    ? `<div class="caso-aviso-parque" role="alert">⚠️ <b>Vehículo fuera del parque automotor.</b> Este caso quedó <b>marcado para revisión</b>: verifica si la placa ${d['PLACA VEHICULO'] ? '<b>' + d['PLACA VEHICULO'] + '</b> ' : ''}pertenece a una empresa afiliada.</div>`
    : '';

  els.casoCreadoBody.innerHTML = `
    <div class="caso-creado-banner">
      <div class="caso-creado-num">${numeroCaso}</div>
      <div>
        <div class="caso-creado-estado">${badgeEstado(estado)}</div>
        <div class="caso-creado-asig">Asignado a: ${asignadoHtml}</div>
      </div>
    </div>
    ${avisoRevisar}

    <h4 class="detalle-seccion-tit">Vehículo</h4>
    <div class="detalle-grid">
      ${fila('Empresa', d['EMPRESA'])}
      ${fila('Vehículo', idVeh)}
      ${fila('Tipo', d['TIPO DE VEHICULO'])}
      ${fila('Conductor', d['NOMBRE CONDUCTOR'])}
      ${fila('Cédula conductor', d['CEDULA DEL CONDUCTOR'])}
      ${fila('Propietario', d['PROPIETARIO'])}
      ${fila('Aseguradora', d['ASEGURADORA'])}
    </div>

    <h4 class="detalle-seccion-tit">Siniestro</h4>
    <div class="detalle-grid">
      ${fila('Fecha y hora', fechaHora)}
      ${fila('Ruta', d['RUTA'])}
      ${fila('Dirección del lugar', d['DIRECCION DEL LUGAR DEL SINIESTRO'])}
      ${fila('Reportado por', d['REPORTADO POR'])}
      ${fila('Número de contacto', d['NUMERO DE CONTACTO'])}
      ${fila('Observaciones', d['OBSERVACIONES'])}
    </div>

    <p class="caso-creado-nota">Un asistente debe reportar su llegada al sitio (GPS) antes de completar la información del caso.</p>
  `;

  els.casoCreadoModal.classList.add('show');
}

/** Cierra el modal de confirmación de caso creado. */
function cerrarCasoCreado() {
  els.casoCreadoModal.classList.remove('show');
}

/* ------------------------------------------------------------------ *
 *  Bandeja de casos
 * ------------------------------------------------------------------ */

/** Abre la bandeja de casos. */
async function abrirBandeja() {
  ocultarPantallas();
  els.casoListaCard.classList.remove('hidden');
  filtroRutaActivo = ''; // al entrar, la bandeja arranca mostrando "Todos".
  const rol = state.perfil && state.perfil.rol;
  const esAsistente = rol === 'asistente';
  const esArea = AREA_ROLES.includes(rol);
  // El asistente entra viendo solo los casos que le fueron asignados.
  if (esAsistente) els.filtroMisCasos.checked = true;
  // Las áreas ven por ruta (no por asignación): se oculta "solo los míos".
  const labelMis = els.filtroMisCasos && els.filtroMisCasos.closest('label');
  if (labelMis) labelMis.classList.toggle('hidden', esArea);
  const titulo = esArea ? 'Casos de mi área' : (esAsistente ? 'Mis casos asignados' : 'Bandeja de casos');
  marcarUbicacion('btnMenuBandeja', titulo);
  await cargarBandeja();
}

/** Carga y muestra los casos (excluye los históricos importados). */
async function cargarBandeja() {
  try {
    showLoader(true);
    const rol = state.perfil && state.perfil.rol;
    const esArea = AREA_ROLES.includes(rol);

    // Trae los casos del servidor. Sin señal esto falla: no es fatal, seguimos
    // con los borradores locales.
    let servidor = [];
    try {
      let query = db
        .from('registro_asistencias')
        .select('numero_caso, estado, key, creado_en, asignado_a, datos')
        .neq('estado', 'HISTORICO')
        .order('creado_en', { ascending: false })
        .limit(500);
      // "Solo los míos": casos asignados al usuario (no aplica a las áreas).
      if (!esArea && els.filtroMisCasos && els.filtroMisCasos.checked) {
        const { data: u } = await db.auth.getUser();
        query = query.eq('asignado_a', u.user.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      servidor = data || [];
    } catch (e) {
      if (!(typeof offlineEsErrorRed === 'function' && offlineEsErrorRed(e))) throw e;
    }

    // Las áreas solo ven los casos enrutados a sus rutas de cierre.
    if (esArea) {
      const rutas = RUTAS_POR_ROL[rol] || [];
      servidor = servidor.filter(c => rutas.includes((c.datos || {})['RUTA CIERRE']));
    }

    // Antepone los BORRADORES locales (creados sin señal, aún sin subir).
    let filas = servidor;
    if (typeof listarBorradores === 'function') {
      const borr = listarBorradores();
      if (borr.length) filas = borr.concat(servidor);
    }

    // Set base de la bandeja (sin filtros de estado/ruta). Alimenta el resumen
    // con contadores estables y la lista con los filtros aplicados por encima.
    state.bandejaCache = filas;
    renderResumenBandeja(filas);
    aplicarFiltrosBandeja();
  } catch (error) {
    showStatus('Error al cargar la bandeja: ' + (error.message || error), 'error');
  } finally {
    showLoader(false);
  }
}

/* ------------------------------------------------------------------ *
 *  Resumen de la bandeja: contadores por ruta de cierre, clicables.
 * ------------------------------------------------------------------ */

// Ruta de cierre activa como filtro ('' = todas; 'SIN' = sin clasificar).
let filtroRutaActivo = '';

/** Ruta de cierre de un caso (cadena vacía si no tiene). */
function rutaDeCaso(c) {
  return (c && c.datos && c.datos['RUTA CIERRE']) || '';
}

/** Categorías del resumen según el rol (las áreas solo ven sus rutas). */
function categoriasResumen(rol) {
  if (AREA_ROLES.includes(rol)) {
    const rutas = RUTAS_POR_ROL[rol] || [];
    const chip = (typeof RUTA_CHIP !== 'undefined') ? RUTA_CHIP : {};
    return rutas.map(r => ({
      key: r,
      label: chip[r] ? chip[r].t : r,
      cls: chip[r] ? chip[r].c : ''
    }));
  }
  return [
    { key: 'CERRADO',                label: 'Conciliados',     cls: 'rc-cerrado' },
    { key: 'RECLAMACION_FAVOR',      label: 'Reclamaciones',   cls: 'rc-recl' },
    { key: 'SEG_VIAL_2251',          label: 'S.Vial 2251',     cls: 'rc-2251' },
    { key: 'SEG_VIAL_LESIONES',      label: 'S.Vial Lesiones', cls: 'rc-lesiones' },
    { key: 'SEG_VIAL_PREJUDICIALES', label: 'Prejudiciales',   cls: 'rc-prejud' },
    { key: 'SIN',                    label: 'Sin clasificar',  cls: 'rc-sin' }
  ];
}

/** Cuenta cuántos casos del set caen en una categoría. */
function contarCategoria(filas, key) {
  if (key === 'SIN') return filas.filter(c => !rutaDeCaso(c)).length;
  return filas.filter(c => rutaDeCaso(c) === key).length;
}

/** Dibuja la barra de resumen (chips con contador) sobre la bandeja. */
function renderResumenBandeja(filas) {
  const cont = els.bandejaResumen;
  if (!cont) return;
  const rol = state.perfil && state.perfil.rol;
  const cats = categoriasResumen(rol);

  // Chip "Todos" + un chip por categoría con su conteo.
  let html = `<button type="button" class="br-chip br-todos${filtroRutaActivo === '' ? ' activo' : ''}" data-ruta="">`
    + `Todos <span class="br-count">${filas.length}</span></button>`;
  cats.forEach(cat => {
    const n = contarCategoria(filas, cat.key);
    html += `<button type="button" class="br-chip ${cat.cls}${filtroRutaActivo === cat.key ? ' activo' : ''}" data-ruta="${escBandeja(cat.key)}">`
      + `${escBandeja(cat.label)} <span class="br-count">${n}</span></button>`;
  });
  cont.innerHTML = html;
  cont.classList.remove('hidden');

  // Cableado por delegación (una sola vez): el listener vive en el contenedor,
  // así sobrevive al reemplazo de innerHTML.
  if (!cont.dataset.wired) {
    cont.addEventListener('click', ev => {
      const b = ev.target.closest('.br-chip');
      if (!b) return;
      filtroRutaActivo = b.dataset.ruta || '';
      renderResumenBandeja(state.bandejaCache || []); // refresca el resaltado
      aplicarFiltrosBandeja();
    });
    cont.dataset.wired = '1';
  }
}

/** Aplica los filtros de estado (menú) y ruta (resumen) sobre el set base. */
function aplicarFiltrosBandeja() {
  let filas = state.bandejaCache || [];
  const est = els.filtroEstado && els.filtroEstado.value;
  if (est) filas = filas.filter(c => (c.estado || '') === est);
  if (filtroRutaActivo === 'SIN') filas = filas.filter(c => !rutaDeCaso(c));
  else if (filtroRutaActivo) filas = filas.filter(c => rutaDeCaso(c) === filtroRutaActivo);
  renderBandeja(filas);
}

/** Dibuja la lista de casos. */
/** Escapa texto para insertarlo con seguridad en HTML. */
function escBandeja(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Clase de color para la gravedad del siniestro. */
function claseGravedad(g) {
  const s = String(g || '').toUpperCase();
  if (s.includes('HOMICIDIO')) return 'grav-homicidio';
  if (s.includes('LESION') || s.includes('HERIDO')) return 'grav-heridos'; // "daños y lesiones"
  if (s.includes('DAÑO') || s.includes('DANO')) return 'grav-danos';
  return 'grav-otro';
}

/** Dibuja la bandeja como tarjetas (una por caso). */
function renderBandeja(casos) {
  const cont = els.casoListaBody;
  cont.innerHTML = '';
  els.casoListaCount.textContent = `${formatNumber(casos.length)} casos`;

  if (!casos.length) {
    cont.innerHTML = '<div class="bandeja-vacio">📭 No hay casos para mostrar.</div>';
    return;
  }

  casos.forEach(caso => {
    const d = caso.datos || {};
    const card = document.createElement('article');
    card.className = 'caso-tarjeta';
    if (caso._borrador) card.classList.add('caso-borrador');
    card.dataset.estado = caso.estado || 'REPORTADO';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');

    const sinAsignar = !caso.asignado_a;
    const asignadoTxt = caso.asignado_a
      ? (state.usuariosPorId[caso.asignado_a] || 'Asignado')
      : 'Sin asignar';

    const placa = d['PLACA VEHICULO'] || '—';
    const interno = d['NUMERO INTERNO VEHICULO'] ? `Int. ${d['NUMERO INTERNO VEHICULO']}` : '';
    const conductor = d['NOMBRE CONDUCTOR'] || '';
    const direccion = d['DIRECCION DEL LUGAR DEL SINIESTRO'] || '';
    const fechaHora = [d['FECHA DEL SINIESTRO'], d['HORA DEL SINIESTRO']].filter(Boolean).join(' · ');
    const gravedad = d['GRAVEDAD DEL SINIESTRO'] || '';
    const rutaChip = (typeof chipRutaBandeja === 'function') ? chipRutaBandeja(d) : '';
    const porRevisar = String(d['VEHICULO POR REVISAR'] || '').toUpperCase() === 'SI';
    const revisarChip = porRevisar ? `<span class="ct-revisar" title="Vehículo fuera del parque automotor">⚠️ Revisar vehículo</span>` : '';

    card.innerHTML = `
      <div class="ct-top">
        <span class="ct-num">${caso._borrador ? '⏳ Borrador' : escBandeja(caso.numero_caso)}</span>
        ${badgeEstado(caso.estado)}${caso._borrador ? '<span class="ct-borrador">sin subir</span>' : ''}
      </div>
      <div class="ct-empresa">${escBandeja(d['EMPRESA'] || 'Sin empresa')}</div>
      <div class="ct-veh">
        <span class="ct-placa">🚌 ${escBandeja(placa)}</span>
        ${interno ? `<span class="ct-sep">·</span><span>${escBandeja(interno)}</span>` : ''}
        ${conductor ? `<span class="ct-sep">·</span><span>👤 ${escBandeja(conductor)}</span>` : ''}
      </div>
      <div class="ct-body">
        ${direccion ? `<div class="ct-linea">📍 ${escBandeja(direccion)}</div>` : ''}
        ${fechaHora ? `<div class="ct-linea">🗓️ ${escBandeja(fechaHora)}</div>` : ''}
        ${(gravedad || rutaChip || revisarChip) ? `<div class="ct-chips">
          ${gravedad ? `<span class="ct-grav ${claseGravedad(gravedad)}">${escBandeja(gravedad)}</span>` : ''}
          ${rutaChip}
          ${revisarChip}
        </div>` : ''}
      </div>
      <div class="ct-foot">
        <span class="ct-asig ${sinAsignar ? 'ct-sinasig' : ''}">👤 ${escBandeja(asignadoTxt)}</span>
        <span class="ct-creado">🕐 ${escBandeja(formatTimestamp(caso.creado_en))}</span>
      </div>
      <span class="ct-abrir">Abrir <b>→</b></span>
    `;

    const abrir = () => abrirCaso(caso);
    card.addEventListener('click', abrir);
    card.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(); }
    });

    cont.appendChild(card);
  });
}

/* ------------------------------------------------------------------ *
 *  Hipótesis del siniestro (catálogo oficial)
 * ------------------------------------------------------------------ */

/** Carga el catálogo de hipótesis desde Supabase (una sola vez). */
async function cargarHipotesis() {
  if (state.hipotesisLista.length) return;
  try {
    const { data, error } = await db
      .from('hipotesis')
      .select('codigo, hipotesis, atribucion')
      .order('atribucion', { ascending: true })
      .order('hipotesis', { ascending: true });
    if (error) throw error;
    state.hipotesisLista = data || [];
  } catch (error) {
    state.hipotesisLista = [];
  }
}

// Texto de búsqueda actual de hipótesis (se conserva entre re-renderes).
let hipotesisFiltroActual = '';

/** Normaliza texto para buscar sin tildes ni mayúsculas. */
function normalizarBusqueda(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Llena el selector de hipótesis agrupado por atribución (marca la elegida).
 * Si hay texto de búsqueda, sólo muestra las que coinciden en código,
 * hipótesis o atribución.
 */
function llenarSelectHipotesis(codigoSel, filtro) {
  const sel = els.detalleHipotesis;
  if (filtro != null) hipotesisFiltroActual = filtro;
  const q = normalizarBusqueda(hipotesisFiltroActual).trim();
  sel.innerHTML = '<option value="">— Selecciona la hipótesis —</option>';

  const grupos = {};
  let mostradas = 0;
  state.hipotesisLista.forEach(h => {
    if (q) {
      const blob = normalizarBusqueda(`${h.codigo} ${h.hipotesis} ${h.atribucion}`);
      if (!blob.includes(q)) return;
    }
    (grupos[h.atribucion] = grupos[h.atribucion] || []).push(h);
    mostradas++;
  });

  Object.keys(grupos).sort((a, b) => a.localeCompare(b, 'es')).forEach(atr => {
    const og = document.createElement('optgroup');
    og.label = atr;
    grupos[atr].forEach(h => {
      const o = document.createElement('option');
      o.value = String(h.codigo);
      o.textContent = `${h.codigo} · ${h.hipotesis}`;
      if (String(h.codigo) === String(codigoSel || '')) o.selected = true;
      og.appendChild(o);
    });
    sel.appendChild(og);
  });

  // Pista con el conteo de coincidencias.
  if (els.detalleHipotesisHint && q) {
    els.detalleHipotesisHint.textContent = mostradas
      ? `${mostradas} coincidencia(s). Selecciona la que corresponda.`
      : 'Sin coincidencias. Prueba con otra palabra (p. ej. «peatón», «velocidad», «embriaguez»).';
  } else if (els.detalleHipotesisHint) {
    els.detalleHipotesisHint.textContent = 'Causa probable del siniestro según el código oficial de tránsito, agrupada por atribución. Usa el buscador para encontrarla rápido.';
  }
}

/** Cablea el buscador de hipótesis (filtra el selector al escribir). */
function initBuscadorHipotesis() {
  if (!els.detalleHipotesisBuscar) return;
  els.detalleHipotesisBuscar.addEventListener('input', () => {
    const seleccion = els.detalleHipotesis.value; // conserva la elegida si sigue visible
    llenarSelectHipotesis(seleccion, els.detalleHipotesisBuscar.value);
  });
}

/* ------------------------------------------------------------------ *
 *  Detalle / completar caso
 * ------------------------------------------------------------------ */

/** Abre el detalle de un caso para completarlo. */
/**
 * Resumen (SOLO LECTURA) de los datos del siniestro reportado, para que el
 * asistente sepa a quién y a qué empresa va a asistir ANTES de llegar al sitio.
 * Destaca Empresa y Conductor (lo más importante) y lista el resto del contexto.
 */
function renderResumenSiniestro(caso) {
  const cont = els.detalleResumen;
  if (!cont) return;
  const d = (caso && caso.datos) || {};
  const esc = (typeof escBandeja === 'function') ? escBandeja : (v => String(v == null ? '' : v));
  const idVeh = [d['PLACA VEHICULO'], d['NUMERO INTERNO VEHICULO'] ? `Interno #${d['NUMERO INTERNO VEHICULO']}` : '']
    .filter(Boolean).join(' · ');
  const fechaHora = [d['FECHA DEL SINIESTRO'], d['HORA DEL SINIESTRO']].filter(Boolean).join('  ');
  const top = (lab, val) => val ? `<div class="rs-top-item"><span class="rs-lab">${lab}</span><span class="rs-top-val">${esc(val)}</span></div>` : '';
  const fila = (lab, val) => val ? `<div class="rs-item"><span class="rs-lab">${lab}</span><span class="rs-val">${esc(val)}</span></div>` : '';

  const destacados = [top('🏢 Empresa', d['EMPRESA']), top('👤 Conductor', d['NOMBRE CONDUCTOR'])].filter(Boolean).join('');
  const filas = [
    fila('🚌 Vehículo', idVeh),
    fila('Tipo de vehículo', d['TIPO DE VEHICULO']),
    fila('Cédula del conductor', d['CEDULA DEL CONDUCTOR']),
    fila('Propietario', d['PROPIETARIO']),
    fila('Aseguradora', d['ASEGURADORA']),
    fila('🗓️ Fecha y hora', fechaHora),
    fila('Ciudad', d['CIUDAD DEL SINIESTRO']),
    fila('📍 Dirección del lugar', d['DIRECCION DEL LUGAR DEL SINIESTRO']),
    fila('Ruta', d['RUTA']),
    fila('Reportado por', d['REPORTADO POR']),
    fila('📞 Contacto', d['NUMERO DE CONTACTO']),
    fila('Observaciones', d['OBSERVACIONES'])
  ].filter(Boolean).join('');

  if (!destacados && !filas) { cont.classList.add('hidden'); cont.innerHTML = ''; return; }
  const porRevisar = String(d['VEHICULO POR REVISAR'] || '').toUpperCase() === 'SI';
  const avisoRevisar = porRevisar
    ? `<div class="rs-aviso" role="alert">⚠️ <b>Vehículo fuera del parque automotor.</b> Marcado para revisión: verifica si pertenece a una empresa afiliada.</div>`
    : '';
  cont.classList.remove('hidden');
  cont.innerHTML =
    `<div class="rs-tit">📋 Datos del caso <span class="rs-lock">🔒 enviados por el administrador · solo lectura</span></div>` +
    avisoRevisar +
    (destacados ? `<div class="rs-top">${destacados}</div>` : '') +
    (filas ? `<div class="rs-grid">${filas}</div>` : '');
}

async function abrirCaso(caso) {
  state.casoActual = caso;
  ocultarPantallas();
  els.casoDetalleCard.classList.remove('hidden');
  const idMostrar = caso._borrador ? '⏳ Borrador (sin subir)' : (caso.numero_caso || '');
  marcarUbicacion('btnMenuBandeja', `Caso ${idMostrar}`);

  const d = caso.datos || {};
  els.detalleTitulo.textContent =
    `${idMostrar} · ${d['EMPRESA'] || ''} · ${d['PLACA VEHICULO'] || ''}`;
  renderResumenSiniestro(caso); // resumen visible del caso a asistir (conductor, empresa…)
  els.detalleEstado.value = caso.estado || 'REPORTADO';

  if (!state.perfilesLista.length) await cargarPerfilesLista();
  llenarSelectAsistentes(els.detalleAsignar, caso.asignado_a || '');

  await cargarHipotesis();
  if (els.detalleHipotesisBuscar) els.detalleHipotesisBuscar.value = ''; // limpia el buscador
  llenarSelectHipotesis(d['CODIGO HIPOTESIS'], ''); // sin filtro al abrir

  const dVista = await prepararDatosVistaCaso(caso);
  renderCamposCompletar(dVista);
  renderChecklistCaso(caso);
  renderDuracionCaso(caso);
  cargarVersionesCaso(caso);
  // Las evidencias necesitan señal para su previsualización; si no hay, no deben
  // impedir abrir/editar el caso (importante para borradores y trabajo offline).
  try { await cargarAudiosCaso(caso); } catch (_) { /* sin señal */ }
  try { await cargarFotosCaso(caso); } catch (_) { /* sin señal */ }
  try { await cargarCroquisCaso(caso); } catch (_) { /* sin señal */ }
  try { await cargarFirmasCaso(caso); } catch (_) { /* sin señal */ }
  cargarCierreCaso(caso);
  try { await cargarTercerosDeCaso(caso.key, caso); } catch (_) { /* sin señal */ }

  const rol = state.perfil && state.perfil.rol;
  const esArea = AREA_ROLES.includes(rol);
  const puedeEditar = ['asistente', 'admin'].includes(rol) || esArea;
  const tieneCoords = !!String(d['COORDENADAS ASISTENCIA'] || '').trim();
  const esTelefonica = String(d['ASISTENCIA TELEFONICA'] || '').toUpperCase() === 'SI';
  // El check-in de llegada (GPS) SÓLO aplica al ASISTENTE, que es quien va al
  // lugar del siniestro. El admin y las áreas (back-office) gestionan desde la
  // oficina: editan directamente, NO se les pide reportar llegada. Tampoco se
  // pide en borradores (recién creados en sitio) ni en casos cerrados/cancelados.
  const requiereCheckin = rol === 'asistente' && !caso._borrador && !['CERRADO', 'CANCELADO'].includes(caso.estado);
  // Se puede editar si llegó al sitio (GPS), si marcó atención telefónica, o si
  // el rol no requiere check-in.
  const enSitio = tieneCoords || esTelefonica || !requiereCheckin;

  // Regla clave: el asistente, sin reportar la llegada (o marcar telefónica), no edita.
  aplicarCheckin(caso, puedeEditar, enSitio, requiereCheckin);
}

/** Muestra el banner de llegada y bloquea/desbloquea la edición del caso. */
function aplicarCheckin(caso, puedeEditar, enSitio, requiereCheckin) {
  const editable = puedeEditar && enSitio;
  const d = caso.datos || {};
  const esTelefonica = String(d['ASISTENCIA TELEFONICA'] || '').toUpperCase() === 'SI';

  // Banner: si el caso requiere reportar llegada, o si ya se marcó telefónica.
  const mostrarBanner = puedeEditar && (requiereCheckin || esTelefonica);
  els.checkinBox.classList.toggle('hidden', !mostrarBanner);
  els.checkinBox.classList.toggle('done', enSitio);
  els.btnCheckin.classList.toggle('hidden', enSitio);
  els.btnCheckin.disabled = !puedeEditar || enSitio;
  // Botón "fue telefónica": disponible mientras no se haya reportado llegada/telefónica.
  if (els.btnTelefonica) {
    els.btnTelefonica.classList.toggle('hidden', enSitio);
    els.btnTelefonica.disabled = !puedeEditar || enSitio;
  }

  if (esTelefonica) {
    els.checkinTitulo.textContent = '📞 Asistencia telefónica';
    els.checkinTexto.textContent =
      'Este caso se atendió por teléfono (sin desplazamiento al sitio). Ya puedes completar la información.';
    els.checkinMapa.classList.add('hidden');
    els.checkinMapa.innerHTML = '';
  } else if (!requiereCheckin) {
    els.checkinMapa.classList.add('hidden');
    els.checkinMapa.innerHTML = '';
  } else if (enSitio) {
    const cuando = d['FECHA Y HORA DE LLEGADA'] ? ` · ${d['FECHA Y HORA DE LLEGADA']}` : '';
    els.checkinTitulo.textContent = '✓ Llegada al sitio reportada';
    els.checkinTexto.textContent =
      `Ubicación registrada: ${d['COORDENADAS ASISTENCIA']}${cuando}. Ya puedes completar el caso.`;
    renderMapaCheckin(d['COORDENADAS ASISTENCIA']);
  } else {
    els.checkinTitulo.textContent = 'Reporta tu llegada al sitio';
    els.checkinTexto.textContent =
      'Para atender el caso, confirma que llegaste al sitio (se registra tu GPS y la hora) o marca que fue una atención telefónica.';
    els.checkinMapa.classList.add('hidden');
    els.checkinMapa.innerHTML = '';
  }

  habilitarEdicionCaso(editable);
}

/** Dibuja el mini-mapa del punto donde el asistente reportó la llegada. */
function renderMapaCheckin(texto) {
  const wrap = els.checkinMapa;
  const coords = parseCoords(texto);
  wrap.innerHTML = '';
  if (!coords) { wrap.classList.add('hidden'); return; }

  wrap.classList.remove('hidden');
  const iframe = document.createElement('iframe');
  iframe.src = `https://maps.google.com/maps?q=${coords.lat},${coords.lng}&z=17&hl=es&output=embed`;
  iframe.loading = 'lazy';
  iframe.referrerPolicy = 'no-referrer-when-downgrade';
  wrap.appendChild(iframe);

  const link = document.createElement('a');
  link.href = `https://www.google.com/maps?q=${coords.lat},${coords.lng}`;
  link.target = '_blank';
  link.rel = 'noopener';
  link.className = 'mapa-link';
  link.textContent = `📍 Ver en Google Maps  (${coords.lat}, ${coords.lng})`;
  wrap.appendChild(link);
}

/** Habilita o bloquea los controles de edición del caso (según check-in). */
function habilitarEdicionCaso(on) {
  const esAdmin = state.perfil && state.perfil.rol === 'admin';

  els.btnGuardarDetalle.disabled = !on;
  // El estado es AUTOMÁTICO: el asistente no lo edita. Solo el admin puede
  // forzarlo (p. ej. Cerrado/Cancelado).
  els.detalleEstado.disabled = !esAdmin;
  els.detalleHipotesis.disabled = !on;
  els.btnAgregarTercero.disabled = !on;
  els.casoDetalleCard.querySelectorAll('.campo-caso').forEach(i => { i.disabled = !on; });
  els.formTercero.querySelectorAll('input, select, textarea').forEach(el => { el.disabled = !on; });
  els.detalleCampos.classList.toggle('bloqueado', !on);
  els.formTercero.classList.toggle('bloqueado', !on);
  habilitarAudio(on);
  habilitarFotos(on);
  habilitarCroquis(on);
  habilitarTerceros(on);
  habilitarFirmas(on);
  habilitarCierre(on);

  // El admin puede reasignar SIEMPRE (aunque el caso esté bloqueado por check-in);
  // para el asistente, la reasignación sigue la misma regla que el resto.
  els.detalleAsignar.disabled = esAdmin ? false : !on;

  // Botones de administración (cancelar/eliminar): solo admin, siempre activos.
  els.btnCancelarCaso.classList.toggle('hidden', !esAdmin);
  els.btnEliminarCaso.classList.toggle('hidden', !esAdmin);
  els.adminReasignarNota.classList.toggle('hidden', !esAdmin);
}

/** Guarda solo la reasignación del caso (para el admin, sin depender del check-in). */
async function guardarReasignacion() {
  const caso = state.casoActual;
  if (!caso) return;
  const asignado = els.detalleAsignar.value || null;
  // Si se asigna y el caso aún no arrancó, pasa a "Asignado".
  const nuevoEstado = (asignado && ['REPORTADO'].includes(caso.estado)) ? 'ASIGNADO' : caso.estado;
  const quien = asignado ? (state.usuariosPorId[asignado] || 'un asistente') : 'nadie (sin asignar)';
  try {
    showLoader(true);
    // Borrador local (sin numero_caso todavía): la reasignación se guarda en el
    // dispositivo y sube con la creación del caso al reconectar. No se puede
    // actualizar por numero_caso porque aún es null.
    if (typeof esBorrador === 'function' && esBorrador(caso)) {
      caso.asignado_a = asignado;
      caso.estado = nuevoEstado;
      if (typeof guardarBorrador === 'function') await guardarBorrador(caso);
      els.detalleEstado.value = nuevoEstado;
      showStatus(`Borrador reasignado a ${quien} (se subirá al reconectar).`, 'info');
      actualizarNotificaciones();
      return;
    }
    const { error } = await db
      .from('registro_asistencias')
      .update({ asignado_a: asignado, estado: nuevoEstado })
      .eq('numero_caso', caso.numero_caso);
    if (error) throw error;
    caso.asignado_a = asignado;
    caso.estado = nuevoEstado;
    els.detalleEstado.value = nuevoEstado;
    showStatus(`Caso ${caso.numero_caso} reasignado a ${quien}.`, 'ok');
    actualizarNotificaciones();
  } catch (error) {
    showStatus('Error al reasignar: ' + (error.message || error), 'error');
  } finally {
    showLoader(false);
  }
}

/** Cancela el caso (lo marca como CANCELADO, conservando el registro). */
async function cancelarCaso() {
  const caso = state.casoActual;
  if (!caso) return;
  const motivo = window.prompt(
    `¿Cancelar el caso ${caso.numero_caso}?\nEl caso se conserva pero queda marcado como CANCELADO.\nEscribe el motivo (opcional):`,
    ''
  );
  if (motivo === null) return; // el usuario cerró el diálogo

  // Relee los datos frescos para no borrar evidencia subida en tiempo real.
  let base = caso.datos || {};
  try {
    const { data: fresco } = await db.from('registro_asistencias')
      .select('datos').eq('numero_caso', caso.numero_caso).maybeSingle();
    if (fresco && fresco.datos) base = fresco.datos;
  } catch (_) { /* usa copia local */ }

  const datos = Object.assign({}, base);
  datos['MOTIVO CANCELACION'] = motivo || 'Sin especificar';
  datos['CANCELADO EL'] = formatDate(new Date());

  try {
    showLoader(true);
    const { error } = await db
      .from('registro_asistencias')
      .update({ estado: 'CANCELADO', datos })
      .eq('numero_caso', caso.numero_caso);
    if (error) throw error;
    showStatus(`Caso ${caso.numero_caso} cancelado.`, 'ok');
    actualizarNotificaciones();
    abrirBandeja();
  } catch (error) {
    showStatus('Error al cancelar el caso: ' + (error.message || error), 'error');
  } finally {
    showLoader(false);
  }
}

/** Elimina definitivamente el caso y sus terceros (solo admin). */
async function eliminarCaso() {
  const caso = state.casoActual;
  if (!caso) return;
  const ok = window.confirm(
    `¿ELIMINAR definitivamente el caso ${caso.numero_caso}?\n\nEsto borra el caso y sus terceros de la base de datos. Esta acción NO se puede deshacer.\n\nSi solo quieres suspenderlo, usa "Cancelar caso".`
  );
  if (!ok) return;

  try {
    showLoader(true);
    // Primero los terceros relacionados (misma KEY), luego el caso.
    await db.from('registro_terceros').delete().eq('key', caso.key);
    const { error } = await db
      .from('registro_asistencias')
      .delete()
      .eq('numero_caso', caso.numero_caso);
    if (error) throw error;
    showStatus(`Caso ${caso.numero_caso} eliminado.`, 'ok');
    actualizarNotificaciones();
    abrirBandeja();
  } catch (error) {
    showStatus('Error al eliminar el caso: ' + (error.message || error), 'error');
  } finally {
    showLoader(false);
  }
}

/** Obtiene la ubicación actual del dispositivo (GPS del navegador). */
function obtenerUbicacionActual() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Este dispositivo no permite geolocalización.'));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude.toFixed(6),
        lng: pos.coords.longitude.toFixed(6)
      }),
      err => reject(err),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

/**
 * El asistente marca que la asistencia fue 100% TELEFÓNICA (sin desplazarse al
 * sitio): no se pide GPS, se registra la hora y se desbloquea la edición. El
 * estado del caso pasa a "Telefónica" (automático).
 */
async function reportarTelefonica() {
  const caso = state.casoActual;
  if (!caso) return;
  if (!window.confirm('¿Confirmas que esta asistencia fue 100% telefónica (no fuiste al sitio)?')) return;

  // Relee los datos frescos de la BD para no pisar evidencia subida en tiempo
  // real (fotos/documentos que el gestor u otro dispositivo agregó). Si falla o
  // es un borrador, usa la copia local.
  let base = caso.datos || {};
  if (!(typeof esBorrador === 'function' && esBorrador(caso))) {
    try {
      const { data: fresco } = await db.from('registro_asistencias')
        .select('datos').eq('numero_caso', caso.numero_caso).maybeSingle();
      if (fresco && fresco.datos) base = fresco.datos;
    } catch (_) { /* sin conexión: usa la copia local */ }
  }

  const datos = Object.assign({}, base);
  datos['ASISTENCIA TELEFONICA'] = 'SI';
  datos['HORA DE ATENCION'] = datos['HORA DE ATENCION'] || formatDate(new Date());
  datos['FECHA Y HORA DE LLEGADA'] = datos['FECHA Y HORA DE LLEGADA'] || formatDate(new Date());
  if (!String(datos['NOMBRE ASISTENTE EN SITIO'] || '').trim() && state.perfil && state.perfil.nombre) {
    datos['NOMBRE ASISTENTE EN SITIO'] = state.perfil.nombre;
  }
  const nuevoEstado = ['REPORTADO', 'ASIGNADO'].includes(caso.estado) ? 'TELEFONICA' : caso.estado;

  try {
    showLoader(true);
    let encolado = false;
    if (typeof esBorrador === 'function' && esBorrador(caso)) {
      caso.datos = datos; caso.estado = nuevoEstado;
      await guardarBorrador(caso);
      encolado = true;
    } else if (typeof guardarCasoResiliente === 'function') {
      const r = await guardarCasoResiliente(caso.numero_caso,
        { cambios: datos, estado: nuevoEstado, baseDatos: base });
      encolado = r.encolado;
    } else {
      const { error } = await db
        .from('registro_asistencias')
        .update({ datos, estado: nuevoEstado })
        .eq('numero_caso', caso.numero_caso);
      if (error) throw error;
    }
    caso.datos = datos;
    caso.estado = nuevoEstado;
    showStatus(encolado
      ? 'Asistencia telefónica registrada en el dispositivo. Se subirá al reconectar; ya puedes completar el caso.'
      : 'Asistencia telefónica registrada. Ya puedes completar el caso.',
      encolado ? 'info' : 'ok');
    abrirCaso(caso);
    actualizarNotificaciones();
  } catch (error) {
    showStatus('Error al registrar la asistencia telefónica: ' + (error.message || error), 'error');
  } finally {
    showLoader(false);
  }
}

/** El asistente reporta que llegó al sitio: captura GPS, hora y desbloquea. */
async function reportarLlegada() {
  const caso = state.casoActual;
  if (!caso) return;

  els.btnCheckin.disabled = true;
  els.checkinTexto.textContent = 'Obteniendo tu ubicación (permite el acceso a la ubicación)…';

  let coords;
  try {
    coords = await obtenerUbicacionActual();
  } catch (e) {
    // Respaldo: permitir ingresar las coordenadas a mano si el GPS falla.
    const manual = window.prompt(
      'No se pudo obtener el GPS automáticamente.\nIngresa las coordenadas del sitio (latitud, longitud):',
      ''
    );
    const p = parseCoords(manual || '');
    if (!p) {
      showStatus('No se registró la llegada: se requieren las coordenadas del sitio.', 'error');
      aplicarCheckin(caso, true, false, true);
      return;
    }
    coords = p;
  }

  const coordStr = `${coords.lat}, ${coords.lng}`;
  // Relee los datos frescos de la BD para no pisar evidencia subida en tiempo
  // real (fotos/documentos). Si falla o es un borrador, usa la copia local.
  let base = caso.datos || {};
  if (!(typeof esBorrador === 'function' && esBorrador(caso))) {
    try {
      const { data: fresco } = await db.from('registro_asistencias')
        .select('datos').eq('numero_caso', caso.numero_caso).maybeSingle();
      if (fresco && fresco.datos) base = fresco.datos;
    } catch (_) { /* sin conexión: usa la copia local */ }
  }
  const datos = Object.assign({}, base);
  datos['COORDENADAS ASISTENCIA'] = coordStr;
  datos['FECHA Y HORA DE LLEGADA'] = formatDate(new Date());
  datos['HORA DE ATENCION'] = formatDate(new Date()); // hora de atención = momento del check-in
  datos['LLEGADA TS'] = Date.now(); // marca de tiempo para calcular la duración
  if (!String(datos['NOMBRE ASISTENTE EN SITIO'] || '').trim() && state.perfil && state.perfil.nombre) {
    datos['NOMBRE ASISTENTE EN SITIO'] = state.perfil.nombre;
  }

  // Al llegar al sitio, el caso avanza a "En sitio" si aún no había avanzado.
  const nuevoEstado = ['REPORTADO', 'ASIGNADO'].includes(caso.estado) ? 'EN_SITIO' : caso.estado;

  try {
    showLoader(true);
    // Check-in resiliente: aunque llegues sin señal, la llegada se registra en
    // el dispositivo y se sube al reconectar; así puedes completar el caso ya.
    let encolado = false;
    if (typeof esBorrador === 'function' && esBorrador(caso)) {
      caso.datos = datos; caso.estado = nuevoEstado;
      await guardarBorrador(caso);
      encolado = true;
    } else if (typeof guardarCasoResiliente === 'function') {
      const r = await guardarCasoResiliente(caso.numero_caso,
        { cambios: datos, estado: nuevoEstado, baseDatos: base });
      encolado = r.encolado;
    } else {
      const { error } = await db
        .from('registro_asistencias')
        .update({ datos, estado: nuevoEstado })
        .eq('numero_caso', caso.numero_caso);
      if (error) throw error;
    }

    caso.datos = datos;
    caso.estado = nuevoEstado;
    showStatus(encolado
      ? `Llegada registrada en el dispositivo (${coordStr}). Se subirá al reconectar; ya puedes completar el caso.`
      : `Llegada al sitio reportada (${coordStr}). Ya puedes completar el caso.`,
      encolado ? 'info' : 'ok');
    abrirCaso(caso);
    actualizarNotificaciones();
  } catch (error) {
    showStatus('Error al reportar la llegada: ' + (error.message || error), 'error');
    aplicarCheckin(caso, true, false, true);
  } finally {
    showLoader(false);
  }
}

/** Busca un vehículo del parque por placa (insensible a mayúsculas/espacios). */
function buscarVehiculoParque(placa) {
  const p = normalizeName(placa);
  if (!p) return null;
  return state.parqueRows.find(v => normalizeName(v.placa) === p) || null;
}

/**
 * Prepara los datos que verá el asistente al completar el caso:
 * - Afiliado, correo y celular del afiliado se consultan en el parque
 *   automotor; si no hay dato, se coloca "No encontrado".
 * - "Usuario asistencia" = el usuario que está editando (quien atiende).
 */
async function prepararDatosVistaCaso(caso) {
  const d = Object.assign({}, caso.datos || {});

  if (!state.parqueRows.length) {
    try { state.parqueRows = await fetchParque(); } catch (e) { /* sin parque */ }
  }
  const veh = buscarVehiculoParque(d['PLACA VEHICULO']);

  // Rellena desde el parque solo si el caso aún no tiene el dato; si el parque
  // tampoco lo tiene, deja "No encontrado".
  const desdeParque = (campo, columna) => {
    const actual = String(d[campo] || '').trim();
    if (actual) return actual;
    const val = veh ? String(veh[columna] || '').trim() : '';
    return val || 'No encontrado';
  };
  d['AFILIADOS'] = desdeParque('AFILIADOS', 'propietario');
  d['CORREO AFILIADO'] = desdeParque('CORREO AFILIADO', 'correo_empresa');
  d['CELULAR AFILIADO'] = desdeParque('CELULAR AFILIADO', 'telefono_propietario');

  // El usuario de asistencia y el de logística son quien está logueado editando.
  const yo = (state.perfil && state.perfil.nombre) || '';
  d['USUARIO ASISTENCIA'] = yo || d['USUARIO ASISTENCIA'] || '';
  d['USUARIO LOGISTICA'] = yo || d['USUARIO LOGISTICA'] || '';

  return d;
}

// Campos que el asistente NO edita a mano (se llenan solos):
// - USUARIO ASISTENCIA / USUARIO LOGISTICA = usuario logueado que edita.
// - COORDENADAS ASISTENCIA = se captura con el GPS al reportar la llegada.
// HORA DE ATENCION se llena sola con el check-in, pero SÍ es editable (por si el
// asistente no usó el check-in o hay que corregirla).
const CAMPOS_SOLO_LECTURA = new Set(['USUARIO ASISTENCIA', 'USUARIO LOGISTICA', 'COORDENADAS ASISTENCIA']);

// Campos que se capturan con un catálogo cerrado (selector) en vez de texto libre.
const CAMPOS_OPCIONES = {
  'GRAVEDAD DEL SINIESTRO': ['DAÑOS Y LESIONES', 'HOMICIDIO'],
  'RESPONSABILIDAD DEL CONDUCTOR': ['SI', 'NO', 'POR DEFINIR'],
  'LESIONADOS': ['SI', 'NO', 'POR DEFINIR']
};

// Etiquetas más claras para algunos campos (en vez del nombre crudo de columna).
const CAMPOS_ETIQUETA = {
  'HORA Y FECHA DE ACCION USUARIO': 'Hora y fecha de acción',
  'NOMBRE ASISTENTE EN SITIO': 'Nombre del asistente en sitio',
  'HORA DE ATENCION': 'Hora de atención (check-in · editable)',
  'LESIONADOS': '¿Hay lesionados?'
};

// El formulario del asistente, organizado por secciones lógicas.
const SECCIONES_CASO = [
  { titulo: '👥 Afiliado', campos: ['AFILIADOS', 'CORREO AFILIADO', 'CELULAR AFILIADO'] },
  { titulo: '🧭 Datos de la atención (automático)', campos: ['USUARIO ASISTENCIA', 'USUARIO LOGISTICA', 'NOMBRE ASISTENTE EN SITIO', 'COORDENADAS ASISTENCIA', 'HORA DE ATENCION', 'HORA Y FECHA DE ACCION USUARIO'] },
  { titulo: '📊 Evaluación del siniestro', campos: ['GRAVEDAD DEL SINIESTRO', 'RESPONSABILIDAD DEL CONDUCTOR', 'LESIONADOS'] }
];

/** Crea el control (input/select/textarea) de un campo del caso. */
function crearCampoCaso(campo, datos) {
  const wrap = document.createElement('div');
  wrap.className = CAMPOS_LARGOS.test(campo) ? 'form-field span-2' : 'form-field';

  const label = document.createElement('label');
  label.textContent = CAMPOS_ETIQUETA[campo] || campo;

  // Campos con catálogo cerrado → selector.
  if (CAMPOS_OPCIONES[campo]) {
    const sel = document.createElement('select');
    sel.dataset.campo = campo;
    sel.classList.add('campo-caso');
    const actual = datos[campo] || '';
    const opciones = ['', ...CAMPOS_OPCIONES[campo]];
    if (actual && !opciones.includes(actual)) opciones.push(actual);
    opciones.forEach(o => {
      const op = document.createElement('option');
      op.value = o; op.textContent = o === '' ? '—' : o;
      if (o === actual) op.selected = true;
      sel.appendChild(op);
    });
    // Si hay lesionados (SI) y la gravedad aún no se marcó (o venía como un valor
    // antiguo de "solo daños"/"heridos"), se marca "DAÑOS Y LESIONES" automáticamente
    // (sin degradar un HOMICIDIO ya registrado).
    if (campo === 'LESIONADOS') {
      sel.addEventListener('change', () => {
        if (sel.value !== 'SI') return;
        const gsel = els.detalleCampos.querySelector('select[data-campo="GRAVEDAD DEL SINIESTRO"]');
        if (gsel && ['', 'SOLO DAÑOS', 'HERIDOS'].includes(gsel.value)) gsel.value = 'DAÑOS Y LESIONES';
      });
    }
    wrap.appendChild(label);
    wrap.appendChild(sel);
    return wrap;
  }

  const input = CAMPOS_LARGOS.test(campo)
    ? document.createElement('textarea')
    : document.createElement('input');
  if (input.tagName === 'INPUT') input.type = 'text';
  else input.rows = 2;
  input.value = datos[campo] || '';
  input.dataset.campo = campo;
  input.classList.add('campo-caso');
  if (CAMPOS_SOLO_LECTURA.has(campo)) {
    input.readOnly = true;
    label.textContent = (CAMPOS_ETIQUETA[campo] || campo) + ' (automático)';
  }

  wrap.appendChild(label);
  wrap.appendChild(input);
  return wrap;
}

/** Genera el formulario del asistente, agrupado por secciones. */
function renderCamposCompletar(datos) {
  const cont = els.detalleCampos;
  cont.classList.remove('form-grid');
  cont.innerHTML = '';

  const usados = new Set();
  SECCIONES_CASO.forEach(sec => {
    const bloque = document.createElement('div');
    bloque.className = 'caso-seccion';
    const h = document.createElement('h4');
    h.className = 'caso-seccion-tit';
    h.textContent = sec.titulo;
    bloque.appendChild(h);

    const grid = document.createElement('div');
    grid.className = 'form-grid';
    sec.campos.forEach(campo => {
      if (!CAMPOS_CASO_COMPLETAR.includes(campo)) return;
      usados.add(campo);
      grid.appendChild(crearCampoCaso(campo, datos));
    });
    bloque.appendChild(grid);
    cont.appendChild(bloque);
  });

  // Cualquier campo no ubicado en una sección va a "Otros datos".
  const otros = CAMPOS_CASO_COMPLETAR.filter(c => !usados.has(c));
  if (otros.length) {
    const bloque = document.createElement('div');
    bloque.className = 'caso-seccion';
    bloque.innerHTML = '<h4 class="caso-seccion-tit">📋 Otros datos</h4>';
    const grid = document.createElement('div');
    grid.className = 'form-grid';
    otros.forEach(campo => grid.appendChild(crearCampoCaso(campo, datos)));
    bloque.appendChild(grid);
    cont.appendChild(bloque);
  }
}

/** Guarda los cambios del caso (datos + estado). */
async function guardarDetalleCaso() {
  const caso = state.casoActual;
  if (!caso) return;

  // Relee los datos frescos de la BD para no pisar evidencia guardada en tiempo
  // real (p. ej. fotos del sitio subidas desde otro dispositivo o mientras se
  // llenaba el formulario). Si falla, usa la copia en memoria.
  let base = caso.datos || {};
  try {
    const { data: fresco } = await db.from('registro_asistencias')
      .select('datos').eq('numero_caso', caso.numero_caso).maybeSingle();
    if (fresco && fresco.datos) base = fresco.datos;
  } catch (_) { /* sin conexión: usa la copia local */ }

  const datos = Object.assign({}, base);
  // Todos los campos editables de la tarjeta (incluye daños, versiones escritas).
  els.casoDetalleCard.querySelectorAll('.campo-caso').forEach(inp => {
    datos[inp.dataset.campo] = inp.value.trim();
  });

  // Cierre y ruta (checklist de notificación empresa + responsable).
  if (typeof recogerCierreExtra === 'function') recogerCierreExtra(datos);

  // Hipótesis del siniestro (guarda código, texto y atribución).
  const codHip = els.detalleHipotesis.value;
  if (codHip) {
    const h = state.hipotesisLista.find(x => String(x.codigo) === codHip);
    datos['CODIGO HIPOTESIS'] = codHip;
    datos['HIPOTESIS'] = h ? h.hipotesis : '';
    datos['ATRIBUCION HIPOTESIS'] = h ? h.atribucion : '';
  } else {
    datos['CODIGO HIPOTESIS'] = '';
    datos['HIPOTESIS'] = '';
    datos['ATRIBUCION HIPOTESIS'] = '';
  }

  const asignado = els.detalleAsignar.value || null;

  try {
    showLoader(true);

    // Sube las grabaciones de voz nuevas y registra su ruta en `datos`.
    await subirAudiosCaso(caso, datos);
    // Sube las firmas (conductor / asistente) dibujadas en los pads.
    await subirFirmasCaso(caso, datos);

    // Estado AUTOMÁTICO según el avance del asistente. El admin puede forzar
    // manualmente el cierre o la cancelación desde el desplegable.
    const esAdmin = state.perfil && state.perfil.rol === 'admin';
    const sel = els.detalleEstado.value;
    // Usa la asignación NUEVA (no la vieja) para calcular el estado automático.
    let nuevoEstado = calcularEstadoAuto(Object.assign({}, caso, { asignado_a: asignado }), datos);
    if (esAdmin && ['CERRADO', 'CANCELADO'].includes(sel)) nuevoEstado = sel;
    // Regla de negocio: la ruta "01 · Cerrado" cierra el caso (cierre inmediato).
    if (datos['RUTA CIERRE'] === 'CERRADO') nuevoEstado = 'CERRADO';

    // Marca de fin de atención: al quedar Asistido o Cerrado se congela la
    // duración; si el caso se reabre (vuelve a un estado en curso), se limpia.
    if (['ASISTIDO', 'CERRADO'].includes(nuevoEstado)) {
      if (!datos['FIN ATENCION TS']) {
        datos['FIN ATENCION TS'] = Date.now();
        datos['HORA FIN ATENCION'] = formatDate(new Date());
      }
    } else {
      delete datos['FIN ATENCION TS'];
      delete datos['HORA FIN ATENCION'];
    }

    // Guardado resiliente: si no hay señal, el caso (datos + estado + asignado)
    // queda en la cola y se sube solo al reconectar. El camino online es igual.
    let encolado = false;
    if (typeof esBorrador === 'function' && esBorrador(caso)) {
      // Borrador local: guardamos datos/estado/asignado en el dispositivo; todo
      // sube junto con la creación del caso al reconectar.
      caso.datos = datos; caso.estado = nuevoEstado; caso.asignado_a = asignado;
      await guardarBorrador(caso);
      encolado = true;
    } else if (typeof guardarCasoResiliente === 'function') {
      const r = await guardarCasoResiliente(caso.numero_caso,
        { cambios: datos, estado: nuevoEstado, asignado_a: asignado, baseDatos: base });
      encolado = r.encolado;
    } else {
      const { error } = await db
        .from('registro_asistencias')
        .update({ datos, estado: nuevoEstado, asignado_a: asignado })
        .eq('numero_caso', caso.numero_caso);
      if (error) throw error;
    }

    caso.datos = datos;
    caso.estado = nuevoEstado;
    caso.asignado_a = asignado;
    els.detalleEstado.value = nuevoEstado;
    renderChecklistCaso(caso);
    renderDuracionCaso(caso);
    showStatus(encolado
      ? `Caso guardado en el dispositivo. Se subirá al reconectar (estado: ${ESTADOS_CASO[nuevoEstado] ? ESTADOS_CASO[nuevoEstado].texto : nuevoEstado}).`
      : `Caso actualizado. Estado: ${ESTADOS_CASO[nuevoEstado] ? ESTADOS_CASO[nuevoEstado].texto : nuevoEstado}.`,
      encolado ? 'info' : 'ok');
    actualizarNotificaciones();
  } catch (error) {
    showStatus('Error al guardar el caso: ' + (error.message || error), 'error');
  } finally {
    showLoader(false);
  }
}

/** Carga los terceros del caso y los muestra como tarjetas (ficha completa). */
async function cargarTercerosDeCaso(key, caso) {
  caso = caso || state.casoActual;
  const cont = els.tercerosCasoCont;
  cont.innerHTML = '<div class="tercero-estado">Cargando terceros…</div>';
  els.tercerosCasoTit.textContent = 'Terceros del caso';
  // El formulario arranca oculto: primero se pregunta si desea agregar un tercero.
  if (els.terceroFormWrap) els.terceroFormWrap.classList.add('hidden');
  if (els.btnTerceroSi) els.btnTerceroSi.classList.remove('active');
  if (els.btnTerceroNo) els.btnTerceroNo.classList.remove('active');

  // Borrador: sus terceros viven en el dispositivo (aún no están en el servidor).
  if (caso && caso._borrador) {
    const b = (typeof obtenerBorrador === 'function') ? obtenerBorrador(key) : null;
    const locales = (b && Array.isArray(b.terceros)) ? b.terceros : [];
    cont.innerHTML = '';
    els.tercerosCasoTit.textContent = `Terceros del caso (${locales.length})`;
    if (!locales.length) {
      cont.innerHTML = '<div class="tercero-estado">Sin terceros aún. Agrégalos abajo: se guardan en el dispositivo y subirán con el caso.</div>';
      return;
    }
    locales.forEach((t, i) => {
      const card = construirTerceroCard(t.datos || {}, i);
      cont.appendChild(card);
      try { agregarEvidenciaTerceroCard(card, t.datos || {}); } catch (_) { /* sin señal */ }
      if (typeof editarTerceroEnForm === 'function') {
        const acc = document.createElement('div');
        acc.className = 'tercero-card-acc';
        const btnEd = document.createElement('button');
        btnEd.type = 'button'; btnEd.className = 'secondary'; btnEd.textContent = '✏️ Editar tercero';
        btnEd.addEventListener('click', () => editarTerceroEnForm(t.id_registro, t.datos || {}));
        acc.appendChild(btnEd);
        card.appendChild(acc);
      }
    });
    return;
  }

  try {
    const { data, error } = await db
      .from('registro_terceros')
      .select('id_registro, datos')
      .eq('key', key)
      .order('id', { ascending: true });
    if (error) throw error;

    cont.innerHTML = '';
    if (!data.length) {
      els.tercerosCasoTit.textContent = 'Terceros del caso (0)';
      cont.innerHTML = '<div class="tercero-estado">Sin terceros registrados. Si el siniestro tuvo terceros involucrados, agrégalos abajo.</div>';
      return;
    }
    els.tercerosCasoTit.textContent = `Terceros del caso (${data.length})`;
    // Contratos ya generados del caso (una sola consulta; se reparte por tercero).
    // Sólo para roles que gestionan lo legal (gestor/admin/áreas).
    const puedeContratos = (typeof rolVeContratos === 'function') && rolVeContratos();
    const contratosCaso = puedeContratos
      ? await fetchContratosCaso(state.casoActual && state.casoActual.numero_caso)
      : undefined;
    data.forEach((t, i) => {
      const card = construirTerceroCard(t.datos || {}, i);
      cont.appendChild(card);
      agregarEvidenciaTerceroCard(card, t.datos || {});
      // Acción de editar este tercero dentro del formulario.
      if (typeof editarTerceroEnForm === 'function') {
        const acc = document.createElement('div');
        acc.className = 'tercero-card-acc';
        const btnEd = document.createElement('button');
        btnEd.type = 'button';
        btnEd.className = 'secondary';
        btnEd.textContent = '✏️ Editar tercero';
        btnEd.addEventListener('click', () => editarTerceroEnForm(t.id_registro, t.datos || {}));
        acc.appendChild(btnEd);
        card.appendChild(acc);
      }
      // Generador de contrato legal del tercero (desistimiento / a favor / en
      // contra / mutuo acuerdo). NO se limita a la conciliación: un desistimiento
      // o un "en contra" no son conciliaciones y también necesitan su contrato.
      if (puedeContratos && typeof bloqueContratoTercero === 'function') {
        card.appendChild(bloqueContratoTercero(state.casoActual, t.datos || {}, contratosCaso));
      }
    });
  } catch (error) {
    cont.innerHTML = `<div class="tercero-estado">Error: ${error.message || error}</div>`;
  }
}

// El registro completo del tercero (datos + fotos + firmas) vive en terceros.js
// (guardarTerceroCompleto). Esta sección quedó sólo con la carga de tarjetas.

/* ------------------------------------------------------------------ *
 *  Versiones (escrita / voz) y firmas del caso
 * ------------------------------------------------------------------ */

const CASO_VERSIONES = ['VERSION CONDUCTOR', 'VERSION ASISTENTE'];
const CASO_FIRMAS = ['FIRMA CONDUCTOR', 'FIRMA ASISTENTE EN SITIO'];
const casoFirmaPads = {};

/** Cablea los botones Escrita/Voz de cada widget de versión (una sola vez). */
function initVersionesToggle() {
  document.querySelectorAll('.version-widget').forEach(w => {
    const esc = w.querySelector('.version-escrita');
    const voz = w.querySelector('.version-voz');
    w.querySelectorAll('.vt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const modo = btn.dataset.modo;
        w.querySelectorAll('.vt-btn').forEach(b => b.classList.toggle('active', b === btn));
        esc.classList.toggle('hidden', modo !== 'escrita');
        voz.classList.toggle('hidden', modo !== 'voz');
      });
    });
  });
}

/** Rellena la descripción de daños y las versiones escritas; elige el modo. */
function cargarVersionesCaso(caso) {
  const d = caso.datos || {};
  if (els.detalleDanos) els.detalleDanos.value = d['DESCRIPCION DAÑOS EMPRESA'] || '';
  CASO_VERSIONES.forEach(campo => {
    const w = document.querySelector(`.version-widget[data-campo="${campo}"]`);
    if (!w) return;
    const ta = w.querySelector('textarea[data-campo]');
    if (ta) ta.value = d[campo] || '';
    // Modo por defecto: voz si ya hay audio guardado; si no, escrita.
    const modo = d[campo + ' AUDIO'] ? 'voz' : 'escrita';
    const btn = w.querySelector(`.vt-btn[data-modo="${modo}"]`);
    if (btn) btn.click();
  });
}

/**
 * Cambia una caja de firma entre "ver" (muestra la firma guardada) y "dibujar"
 * (muestra el lienzo). Sólo se ve UNA caja a la vez para no confundir.
 */
function setModoFirma(box, modo) {
  if (!box) return;
  const verFirma = modo === 'ver';
  const canvas = box.querySelector('.caso-firma-canvas');
  const prev = box.querySelector('.caso-firma-prev');
  const limpiar = box.querySelector('.tercero-firma-limpiar');
  if (canvas) canvas.classList.toggle('hidden', verFirma);   // lienzo sólo al dibujar
  if (prev) prev.classList.toggle('hidden', !verFirma);      // preview sólo al ver
  if (limpiar) limpiar.classList.toggle('hidden', verFirma); // "Limpiar" sólo al dibujar
}

/** Inicializa los pads de firma del caso (conductor / asistente). */
function initCasoFirmas() {
  document.querySelectorAll('.caso-firma-canvas').forEach(canvas => {
    const campo = canvas.dataset.campo;
    casoFirmaPads[campo] = iniciarPadFirma(canvas); // helper de terceros.js
    const box = canvas.closest('.tercero-firma-box');
    const limpiar = box && box.querySelector('.tercero-firma-limpiar');
    if (limpiar) limpiar.addEventListener('click', () => limpiarPadFirma(casoFirmaPads[campo]));
  });
}

/** Carga las firmas guardadas del caso (muestra la imagen si existe). */
async function cargarFirmasCaso(caso) {
  const d = caso.datos || {};
  for (const campo of CASO_FIRMAS) {
    const canvas = document.querySelector(`.caso-firma-canvas[data-campo="${campo}"]`);
    if (!canvas) continue;
    limpiarPadFirma(casoFirmaPads[campo]);
    const box = canvas.closest('.tercero-firma-box');
    const prev = box && box.querySelector('.caso-firma-prev');
    if (prev) prev.innerHTML = '';
    const ruta = d[campo];
    let firmada = false;
    if (prev && ruta && /\.(png|jpe?g)$/i.test(String(ruta))) {
      try {
        const { data } = await db.storage.from(BUCKET_FOTOS).createSignedUrl(ruta, 3600);
        if (data && data.signedUrl) {
          prev.innerHTML =
            `<img src="${data.signedUrl}" alt="${campo}"><span>Firmada ✓</span>` +
            `<button type="button" class="secondary caso-firma-refirmar">✏️ Volver a firmar</button>`;
          const btn = prev.querySelector('.caso-firma-refirmar');
          if (btn) btn.addEventListener('click', () => setModoFirma(box, 'dibujar'));
          firmada = true;
        }
      } catch (e) { /* sin firma */ }
    }
    // Firmada → muestra la imagen; sin firma → muestra el lienzo. Nunca las dos.
    setModoFirma(box, firmada ? 'ver' : 'dibujar');
  }
}

/** Sube al Storage las firmas dibujadas y registra su ruta en `datos`. */
async function subirFirmasCaso(caso, datos) {
  for (const campo of CASO_FIRMAS) {
    const blob = await firmaABlob(casoFirmaPads[campo]); // helper de terceros.js
    if (!blob) continue; // sin trazo nuevo → no se modifica
    const slug = campo.replace(/\s+/g, '_');
    const ruta = `${carpetaCaso(caso)}/firmas/${slug}.png`;
    // Sube la firma (o la encola si no hay señal para subirla al reconectar).
    if (typeof subirArchivoResiliente === 'function') {
      await subirArchivoResiliente(BUCKET_FOTOS, ruta, blob, 'image/png');
    } else {
      const { error } = await db.storage.from(BUCKET_FOTOS)
        .upload(ruta, blob, { contentType: 'image/png', upsert: true });
      if (error) throw error;
    }
    datos[campo] = ruta;
  }
  return datos;
}

/** Habilita o bloquea las firmas del caso (según el check-in). */
function habilitarFirmas(on) {
  document.querySelectorAll('.caso-firma-canvas').forEach(c => c.classList.toggle('bloq', !on));
  document.querySelectorAll('#casoFirmasGrid .tercero-firma-limpiar').forEach(b => { b.disabled = !on; });
}
