/**
 * auth.js
 * Control de acceso con Supabase Auth. La aplicación permanece oculta tras
 * una pantalla de inicio de sesión hasta que el usuario se autentica. Sin
 * sesión, las políticas RLS impiden ver cualquier dato.
 */

// Usuario actualmente montado. Evita re-montar la app (y reiniciar timers,
// recargar perfil, reabrir el caso) cuando el evento es un simple refresco de
// token — que dispara onAuthStateChange con la MISMA sesión cada hora / al
// reenfocar la pestaña.
let _authUserActual = null;

/** Inicializa el control de sesión y reacciona a cambios de autenticación. */
async function initAuth() {
  const { data } = await db.auth.getSession();
  _authUserActual = data.session ? data.session.user.id : null;
  if (data.session) mostrarApp(data.session.user);
  else mostrarLogin();

  db.auth.onAuthStateChange((_event, session) => {
    const nuevoId = session && session.user ? session.user.id : null;
    if (nuevoId === _authUserActual) return; // mismo usuario (refresh) → no recargar
    _authUserActual = nuevoId;
    if (session) {
      mostrarApp(session.user);
    } else {
      // La sesión terminó (caducó el token, se invalidó o SIGNED_OUT): limpia
      // timers y estado, no solo al pulsar "Cerrar sesión".
      limpiarSesionLocal();
      mostrarLogin();
    }
  });
}

/**
 * Detiene todos los sondeos y borra el estado en memoria del usuario. Es
 * idempotente: se puede llamar al cerrar sesión, al caducar la sesión o antes
 * de montar otra cuenta.
 */
function limpiarSesionLocal() {
  state.parqueRows = [];
  state.perfil = null;
  state.casoActual = null;
  state.perfilesLista = [];
  state.usuariosPorId = {};
  if (state.notifTimer) { clearInterval(state.notifTimer); state.notifTimer = null; }
  if (state.presenceTimer) { clearInterval(state.presenceTimer); state.presenceTimer = null; }
  if (state.conectadosTimer) { clearInterval(state.conectadosTimer); state.conectadosTimer = null; }
  if (els.btnNotif) els.btnNotif.classList.add('hidden');
}

/** Inicia sesión con correo y contraseña. */
async function iniciarSesion(email, password) {
  els.loginError.textContent = '';
  els.loginSubmit.disabled = true;
  els.loginSubmit.textContent = 'Entrando...';
  try {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // El cambio de UI lo maneja onAuthStateChange.
  } catch (error) {
    els.loginError.textContent = 'Correo o contraseña incorrectos.';
  } finally {
    els.loginSubmit.disabled = false;
    els.loginSubmit.textContent = 'Entrar';
  }
}

/** Cierra la sesión actual. */
async function cerrarSesion() {
  await db.auth.signOut();
  limpiarSesionLocal(); // detiene timers y borra el estado en memoria
  clearPreviousData();
  showAppSections(false);
}

/** Muestra la aplicación (usuario autenticado) y carga su perfil/rol. */
function mostrarApp(user) {
  // Si venía otra sesión activa (cambio de cuenta), detén sus timers antes de
  // montar la nueva para no duplicar sondeos.
  limpiarSesionLocal();
  els.loginOverlay.classList.remove('show');
  els.appContent.classList.remove('hidden');
  els.headerUser.classList.remove('hidden');
  els.userEmail.textContent = user && user.email ? user.email : '';
  limpiarUbicacion();
  cargarPerfil(user);
}

/** Muestra la pantalla de inicio de sesión (sin sesión). */
function mostrarLogin() {
  els.loginOverlay.classList.add('show');
  els.appContent.classList.add('hidden');
  els.headerUser.classList.add('hidden');
}
