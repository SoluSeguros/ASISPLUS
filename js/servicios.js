/**
 * servicios.js
 * Servicios de programación adicionales: módulos que se desarrollan a pedido de
 * un cliente y sólo ve quien los tiene contratados.
 *
 * No son funciones de ASIS PLUS para todo el mundo. El primero es el histórico
 * de infracciones del GRUPO COOMETROPOL, que hasta ahora vivía en un Excel que
 * circulaba por correo.
 *
 * Lo que decide quién ve qué está en la base (`tiene_servicio()` dentro de la
 * RLS), no aquí: esto sólo se encarga de no dibujar una pestaña que el servidor
 * va a devolver vacía, y de darle al administrador dónde asignarlos. Esconder
 * un módulo en el navegador no es seguridad, es decoración.
 */

/* ------------------------------------------------------------------ *
 *  Lo que tiene el usuario que entró
 * ------------------------------------------------------------------ */

/**
 * Las claves de los servicios contratados por este perfil.
 *
 * Si la consulta falla (migración sin aplicar, por ejemplo) devuelve lista
 * vacía: la app queda como estaba, sin el módulo extra, en vez de romperse.
 */
async function serviciosDelPerfil(perfil) {
  if (!perfil || !perfil.id) return [];
  try {
    const { data, error } = await db
      .from('perfil_servicios').select('servicio').eq('perfil_id', perfil.id);
    if (error) throw error;
    return (data || []).map(r => String(r.servicio || '').trim()).filter(Boolean);
  } catch (_) {
    return [];
  }
}

/** ¿El usuario que entró tiene este servicio? */
function tieneServicio(clave) {
  const lista = (state.perfil && state.perfil.servicios) || [];
  return lista.includes(clave);
}

/**
 * Los servicios de OTRO perfil. Sólo el admin puede leerlos (política
 * perfil_servicios_admin) y se usa para que la vista previa de un portal
 * muestre exactamente las pestañas que ve ese usuario, ni una más.
 */
async function serviciosDeOtroPerfil(perfilId) {
  if (!perfilId) return [];
  try {
    const { data, error } = await db
      .from('perfil_servicios').select('servicio').eq('perfil_id', perfilId);
    if (error) throw error;
    return (data || []).map(r => String(r.servicio || '').trim()).filter(Boolean);
  } catch (_) {
    return [];
  }
}

/**
 * ¿El portal que está en pantalla tiene este servicio?
 *
 * En la vista previa del admin NO vale preguntar por los servicios del admin:
 * la pregunta es qué ve el usuario que se está mirando.
 */
function portalTieneServicio(clave) {
  if (state.empresaVistaAdmin) {
    return ((state.empresaVistaServicios) || []).includes(clave);
  }
  return tieneServicio(clave);
}

/* ------------------------------------------------------------------ *
 *  Panel del administrador
 * ------------------------------------------------------------------ */

let _serviciosCatalogo = [];     // [{clave, nombre, descripcion, icono, activo}]
let _serviciosAsignados = {};    // { clave: [perfil_id, ...] }
let _serviciosUsuarios = [];     // la lista de usuarios, para poder asignar

/** Abre la pantalla "Servicios de programación adicionales". */
async function abrirServicios() {
  ocultarPantallas();
  els.serviciosCard.classList.remove('hidden');
  marcarUbicacion('serviciosCard', 'Servicios adicionales');
  await cargarServicios();
}

/** Trae el catálogo, quién tiene cada servicio y la lista de usuarios. */
async function cargarServicios() {
  const cont = els.serviciosBody;
  if (!cont) return;
  cont.innerHTML = '<div class="ehl-estado">Cargando…</div>';
  try {
    showLoader(true);
    const [cat, asig, usuarios] = await Promise.all([
      db.from('servicios_adicionales').select('clave, nombre, descripcion, icono, activo').order('nombre'),
      db.from('perfil_servicios').select('perfil_id, servicio, habilitado_en'),
      llamarAdminUsuarios({ action: 'list' }).catch(() => ({ usuarios: [] }))
    ]);
    if (cat.error) throw cat.error;
    if (asig.error) throw asig.error;

    _serviciosCatalogo = cat.data || [];
    _serviciosUsuarios = (usuarios && usuarios.usuarios) || [];
    _serviciosAsignados = {};
    (asig.data || []).forEach(r => {
      (_serviciosAsignados[r.servicio] = _serviciosAsignados[r.servicio] || []).push(r.perfil_id);
    });
    renderServicios();
  } catch (error) {
    cont.innerHTML = `<div class="ehl-estado">Error: ${escBandeja(error.message || String(error))}</div>`;
  } finally {
    showLoader(false);
  }
}

/** Un usuario por su id, de la lista ya cargada. */
function _usuarioServicio(id) {
  return _serviciosUsuarios.find(u => u.id === id) || null;
}

/** Cómo se nombra a un usuario en esta pantalla. */
function _rotuloUsuarioServicio(u) {
  if (!u) return '(usuario que ya no existe)';
  return [u.nombre || u.email, u.empresa].filter(Boolean).join(' · ');
}

/**
 * Dibuja una tarjeta por servicio con quién lo tiene.
 *
 * Importa mostrar también los que NO tiene nadie: un módulo desarrollado y sin
 * asignar es trabajo hecho que el cliente no está viendo.
 */
function renderServicios() {
  const cont = els.serviciosBody;
  if (!cont) return;

  if (!_serviciosCatalogo.length) {
    cont.innerHTML = '<div class="ehl-estado">Todavía no hay servicios adicionales registrados.</div>';
    return;
  }

  cont.innerHTML = _serviciosCatalogo.map(s => {
    const ids = _serviciosAsignados[s.clave] || [];
    const filas = ids.map(id => {
      const u = _usuarioServicio(id);
      return `
        <li class="srv-usuario">
          <span class="srv-usuario-nom">${escBandeja(_rotuloUsuarioServicio(u))}</span>
          ${u && u.email ? `<span class="srv-usuario-mail">${escBandeja(u.email)}</span>` : ''}
          <button type="button" class="secondary srv-quitar"
                  data-servicio="${escBandeja(s.clave)}" data-perfil="${escBandeja(id)}">Quitar</button>
        </li>`;
    }).join('');

    // Sólo se ofrecen los que todavía no lo tienen: una lista con los mismos
    // nombres repetidos obliga a recordar a quién ya se le dio.
    const candidatos = _serviciosUsuarios
      .filter(u => !ids.includes(u.id))
      .sort((a, b) => String(a.nombre || a.email).localeCompare(String(b.nombre || b.email), 'es'));

    return `
      <section class="srv-card">
        <header class="srv-head">
          <span class="srv-ico">${escBandeja(s.icono || '🧩')}</span>
          <div class="srv-titulo">
            <h3>${escBandeja(s.nombre)}</h3>
            <p>${escBandeja(s.descripcion || '')}</p>
          </div>
          <span class="srv-contador">${ids.length
            ? `${formatNumber(ids.length)} usuario(s)`
            : 'Sin asignar'}</span>
        </header>
        ${ids.length
          ? `<ul class="srv-usuarios">${filas}</ul>`
          : '<p class="srv-vacio">Nadie lo tiene habilitado todavía.</p>'}
        <div class="srv-asignar">
          <select class="srv-select" data-servicio="${escBandeja(s.clave)}" aria-label="Usuario al que dar acceso">
            <option value="">— Elige un usuario —</option>
            ${candidatos.map(u => `<option value="${escBandeja(u.id)}">${escBandeja(_rotuloUsuarioServicio(u))}</option>`).join('')}
          </select>
          <button type="button" class="success srv-dar" data-servicio="${escBandeja(s.clave)}">+ Dar acceso</button>
        </div>
      </section>`;
  }).join('');
}

/** Habilita un servicio a un usuario. */
async function darServicio(clave, perfilId) {
  if (!clave || !perfilId) { showStatus('Elige el usuario al que le vas a dar el acceso.', 'error'); return; }
  try {
    showLoader(true);
    const { error } = await db.from('perfil_servicios')
      .insert([{ perfil_id: perfilId, servicio: clave }]);
    if (error) throw error;
    await cargarServicios();
    showStatus('Acceso habilitado. El usuario lo verá la próxima vez que entre.', 'ok');
  } catch (error) {
    showStatus('No se pudo habilitar: ' + (error.message || error), 'error');
  } finally {
    showLoader(false);
  }
}

/** Le quita un servicio a un usuario (los datos NO se borran, deja de verlos). */
async function quitarServicio(clave, perfilId) {
  const u = _usuarioServicio(perfilId);
  if (!confirm(`¿Quitarle "${(_serviciosCatalogo.find(s => s.clave === clave) || {}).nombre || clave}" a ${_rotuloUsuarioServicio(u)}?\n\nDejará de ver el módulo. La información NO se borra.`)) return;
  try {
    showLoader(true);
    const { error } = await db.from('perfil_servicios')
      .delete().eq('perfil_id', perfilId).eq('servicio', clave);
    if (error) throw error;
    await cargarServicios();
    showStatus('Acceso retirado.', 'ok');
  } catch (error) {
    showStatus('No se pudo retirar: ' + (error.message || error), 'error');
  } finally {
    showLoader(false);
  }
}

function initServicios() {
  if (els.btnMenuServicios) els.btnMenuServicios.addEventListener('click', abrirServicios);
  if (els.btnServiciosVolver) els.btnServiciosVolver.addEventListener("click", ocultarPantallas);
  if (els.btnRefrescarServicios) els.btnRefrescarServicios.addEventListener('click', cargarServicios);
  // Delegación: las tarjetas se redibujan enteras en cada cambio, así que
  // enganchar botón por botón obligaría a recablear todo cada vez.
  if (els.serviciosBody) {
    els.serviciosBody.addEventListener('click', event => {
      const dar = event.target.closest('.srv-dar');
      if (dar) {
        const sel = els.serviciosBody.querySelector(`.srv-select[data-servicio="${dar.dataset.servicio}"]`);
        darServicio(dar.dataset.servicio, sel ? sel.value : '');
        return;
      }
      const quitar = event.target.closest('.srv-quitar');
      if (quitar) quitarServicio(quitar.dataset.servicio, quitar.dataset.perfil);
    });
  }
}
