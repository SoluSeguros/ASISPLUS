/**
 * usuarios.js
 * Módulo de gestión de usuarios (solo administradores). Toda la operación
 * sensible (crear usuario, cambiar contraseña, rol, eliminar) se hace a través
 * de la Edge Function "admin-usuarios", que valida en el servidor que quien
 * llama es admin y usa la clave de servicio (nunca expuesta al navegador).
 */

/** Nombre legible del rol. */
function nombreRol(rol) {
  const M = {
    admin: 'Administrador',
    gestor: 'Gestor de casos',
    asistente: 'Asistente',
    reclamaciones: 'Reclamaciones',
    seguridad_vial: 'Seguridad Vial',
    empresa: 'Empresa'
  };
  return M[rol] || 'Asistente';
}

/** Invoca la Edge Function de administración de usuarios. */
async function llamarAdminUsuarios(payload) {
  const { data, error } = await db.functions.invoke('admin-usuarios', { body: payload });
  if (error) {
    let msg = 'No se pudo completar la operación.';
    try {
      const cuerpo = await error.context.json();
      if (cuerpo && cuerpo.error) msg = cuerpo.error;
    } catch (_) { /* sin cuerpo */ }
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

/** Abre la pantalla de gestión de usuarios. */
async function abrirUsuarios() {
  ocultarPantallas();
  els.usuariosCard.classList.remove('hidden');
  marcarUbicacion('btnMenuUsuarios', 'Gestión de usuarios');
  els.formUsuario.reset();
  if (els.usuEmpresaWrap) els.usuEmpresaWrap.classList.add('hidden');
  await Promise.all([cargarUsuarios(), cargarListaEmpresas()]);
}

/** Carga las empresas del parque automotor para el selector de "empresa vinculada". */
async function cargarListaEmpresas() {
  if (!els.usuEmpresa) return;
  try {
    const { data, error } = await db.from('parque_automotor').select('empresa');
    if (error) throw error;
    const empresas = [...new Set((data || []).map(v => String(v.empresa || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    state.empresasDisponibles = empresas;
    const actual = els.usuEmpresa.value;
    els.usuEmpresa.innerHTML = '<option value="">— Selecciona —</option>' +
      empresas.map(e => `<option value="${e}">${e}</option>`).join('');
    if (empresas.includes(actual)) els.usuEmpresa.value = actual;
  } catch (error) {
    state.empresasDisponibles = [];
  }
}

/**
 * Empresas ADICIONALES por perfil (perfil_empresas). La principal viene en
 * `u.empresa`, que es lo que devuelve la función edge.
 *
 * Una compañía puede operar vehículos que en el parque figuran a nombre de
 * otra: COOMETROPOL tiene 11 siniestros con placas de COOINVETRANS,
 * TRANSLAMAYA GUAYABAL, INVETRANS y TRANSCONOR. Sin esto su usuario no los ve.
 */
let _extrasPorPerfil = {};

async function cargarEmpresasExtra() {
  _extrasPorPerfil = {};
  try {
    const { data, error } = await db.from('perfil_empresas').select('perfil_id, empresa');
    if (error) throw error;
    (data || []).forEach(r => {
      (_extrasPorPerfil[r.perfil_id] = _extrasPorPerfil[r.perfil_id] || []).push(r.empresa);
    });
  } catch (_) {
    // Si falta la migración, el panel sigue sirviendo con la empresa principal.
    _extrasPorPerfil = {};
  }
}

/** Todas las empresas de un usuario: la principal primero, sin repetir. */
function empresasDeUsuario(u) {
  const lista = [];
  const principal = String(u.empresa || '').trim();
  if (principal) lista.push(principal);
  (_extrasPorPerfil[u.id] || []).forEach(e => {
    const v = String(e || '').trim();
    if (v && !lista.includes(v)) lista.push(v);
  });
  return lista;
}

/** Carga y muestra la lista de usuarios. */
async function cargarUsuarios() {
  const tbody = els.usuariosBody;
  tbody.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';
  try {
    showLoader(true);
    const [data] = await Promise.all([
      llamarAdminUsuarios({ action: 'list' }),
      cargarEmpresasExtra()
    ]);
    renderUsuarios(data.usuarios || []);
  } catch (error) {
    const msg = (typeof escBandeja === 'function') ? escBandeja(error.message) : String(error.message || '');
    tbody.innerHTML = `<tr><td colspan="6">Error: ${msg}</td></tr>`;
    showStatus('Error al cargar usuarios: ' + error.message, 'error');
  } finally {
    showLoader(false);
  }
}

/** Dibuja la tabla de usuarios con acciones. */
function renderUsuarios(usuarios) {
  const tbody = els.usuariosBody;
  els.usuariosCount.textContent = `(${formatNumber(usuarios.length)})`;
  tbody.innerHTML = '';

  usuarios.forEach(u => {
    const tr = document.createElement('tr');

    // Nombre editable (se guarda al salir del campo o con Enter).
    const tdNombre = document.createElement('td');
    const inpNombre = document.createElement('input');
    inpNombre.type = 'text';
    inpNombre.className = 'usuario-nombre-input';
    inpNombre.title = 'Escribe el nombre y pulsa Enter (o sal del campo) para guardarlo';
    // Si el nombre coincide con el correo, es que no se ha puesto → dejar vacío
    // y mostrar el correo como pista para que se note que se puede escribir.
    const nombreReal = (u.nombre && u.nombre !== u.email) ? u.nombre : '';
    inpNombre.value = nombreReal;
    inpNombre.placeholder = '✏️ Escribe el nombre…';
    const guardarNombre = () => {
      const nuevo = inpNombre.value.trim();
      const actual = (u.nombre && u.nombre !== u.email) ? u.nombre : '';
      if (nuevo === actual) return;
      cambiarNombreUsuario(u, nuevo);
    };
    inpNombre.addEventListener('blur', guardarNombre);
    inpNombre.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); inpNombre.blur(); }
    });
    tdNombre.appendChild(inpNombre);
    tr.appendChild(tdNombre);

    const tdEmail = document.createElement('td');
    tdEmail.textContent = u.email || '';
    tr.appendChild(tdEmail);

    // Rol editable
    const tdRol = document.createElement('td');
    const sel = document.createElement('select');
    [['gestor', 'Gestor de casos'], ['asistente', 'Asistente'], ['admin', 'Administrador'],
     ['reclamaciones', 'Reclamaciones'], ['seguridad_vial', 'Seguridad Vial'], ['empresa', 'Empresa']]
      .forEach(([val, txt]) => {
        const o = document.createElement('option');
        o.value = val; o.textContent = txt;
        if (u.rol === val) o.selected = true;
        sel.appendChild(o);
      });
    sel.addEventListener('change', () => {
      if (sel.value === 'empresa') {
        const empresas = state.empresasDisponibles || [];
        const sugerencia = empresas.length
          ? `Escribe el nombre EXACTO de la empresa (debe coincidir con parque_automotor):\n${empresas.join(', ')}`
          : 'Escribe el nombre EXACTO de la empresa (debe coincidir con parque_automotor):';
        const empresa = window.prompt(sugerencia, u.empresa || '');
        if (!empresa) { sel.value = u.rol; return; }
        if (empresas.length && !empresas.includes(empresa.trim())) {
          showStatus('Esa empresa no existe en el parque automotor. Verifica el nombre exacto.', 'error');
          sel.value = u.rol;
          return;
        }
        cambiarRolUsuario(u, 'empresa', empresa.trim());
      } else {
        cambiarRolUsuario(u, sel.value);
      }
    });
    tdRol.appendChild(sel);
    tr.appendChild(tdRol);

    // Empresa(s). El rol empresa puede tener varias: se listan como fichas y
    // se administran en un modal, porque un select suelto no da para esto.
    const tdEmpresa = document.createElement('td');
    if (u.rol === 'empresa') {
      const lista = empresasDeUsuario(u);
      const chips = document.createElement('div');
      chips.className = 'usu-emp-chips';
      if (!lista.length) {
        const vacio = document.createElement('span');
        vacio.className = 'muted';
        vacio.textContent = 'Sin empresa';
        chips.appendChild(vacio);
      }
      lista.forEach((e, i) => {
        const chip = document.createElement('span');
        chip.className = 'usu-emp-chip' + (i === 0 ? ' principal' : '');
        chip.textContent = e;
        if (i === 0) chip.title = 'Empresa principal';
        chips.appendChild(chip);
      });
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'secondary usu-emp-editar';
      btn.textContent = lista.length > 1 ? `Editar (${lista.length})` : 'Agregar';
      btn.addEventListener('click', () => abrirEmpresasUsuario(u));
      chips.appendChild(btn);
      tdEmpresa.appendChild(chips);
    } else {
      tdEmpresa.textContent = u.empresa || '—';
    }
    tr.appendChild(tdEmpresa);

    const tdAcceso = document.createElement('td');
    tdAcceso.textContent = u.ultimo_acceso ? formatTimestamp(u.ultimo_acceso) : 'Nunca';
    tr.appendChild(tdAcceso);

    const tdAcc = document.createElement('td');
    tdAcc.style.whiteSpace = 'nowrap';

    const btnClave = document.createElement('button');
    btnClave.textContent = 'Cambiar clave';
    btnClave.className = 'secondary';
    btnClave.style.padding = '6px 10px';
    btnClave.addEventListener('click', () => cambiarPasswordUsuario(u));

    const btnDel = document.createElement('button');
    btnDel.textContent = 'Eliminar';
    btnDel.className = 'secondary';
    btnDel.style.padding = '6px 10px';
    btnDel.style.marginLeft = '6px';
    btnDel.addEventListener('click', () => eliminarUsuario(u));

    tdAcc.appendChild(btnClave);
    tdAcc.appendChild(btnDel);
    tr.appendChild(tdAcc);

    tbody.appendChild(tr);
  });
}

/** Crea un nuevo usuario. */
async function crearUsuario(event) {
  event.preventDefault();
  const email = els.usuEmail.value.trim();
  const password = els.usuPassword.value;
  const rol = els.usuRol.value;
  const empresa = els.usuEmpresa ? els.usuEmpresa.value : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showStatus('Ingresa un correo válido.', 'error');
    return;
  }
  if (password.length < 6) {
    showStatus('La contraseña debe tener al menos 6 caracteres.', 'error');
    return;
  }
  if (rol === 'empresa' && !empresa) {
    showStatus('Selecciona la empresa a vincular.', 'error');
    return;
  }
  try {
    showLoader(true);
    await llamarAdminUsuarios({
      action: 'create',
      email,
      password,
      rol,
      nombre: els.usuNombre.value.trim(),
      empresa: rol === 'empresa' ? empresa : undefined
    });
    showStatus(`Usuario ${email} creado correctamente.`, 'ok');
    els.formUsuario.reset();
    if (els.usuEmpresaWrap) els.usuEmpresaWrap.classList.add('hidden');
    await cargarUsuarios();
  } catch (error) {
    showStatus('Error al crear el usuario: ' + error.message, 'error');
  } finally {
    showLoader(false);
  }
}

/** Muestra/oculta el selector de empresa según el rol elegido en el formulario. */
function actualizarVisibilidadEmpresa() {
  if (!els.usuEmpresaWrap || !els.usuRol) return;
  const esEmpresa = els.usuRol.value === 'empresa';
  els.usuEmpresaWrap.classList.toggle('hidden', !esEmpresa);
  if (els.usuEmpresa) {
    if (esEmpresa) els.usuEmpresa.setAttribute('required', 'required');
    else els.usuEmpresa.removeAttribute('required');
  }
}

/** Cambia el nombre de un usuario (para que aparezca como asistente en sitio). */
async function cambiarNombreUsuario(u, nombre) {
  try {
    showLoader(true);
    await llamarAdminUsuarios({ action: 'nombre', id: u.id, nombre });
    u.nombre = nombre || u.email;
    showStatus(nombre
      ? `Nombre de ${u.email} guardado: "${nombre}".`
      : `Nombre de ${u.email} borrado.`, 'ok');
  } catch (error) {
    showStatus('Error al guardar el nombre: ' + error.message, 'error');
    await cargarUsuarios();
  } finally {
    showLoader(false);
  }
}

/** Cambia el rol de un usuario (empresa es opcional, requerido solo si rol === 'empresa'). */
async function cambiarRolUsuario(u, rol, empresa) {
  try {
    showLoader(true);
    await llamarAdminUsuarios({ action: 'rol', id: u.id, rol, empresa });
    showStatus(`Rol de ${u.email} actualizado a ${nombreRol(rol)}.`, 'ok');
  } catch (error) {
    showStatus('Error al cambiar el rol: ' + error.message, 'error');
    await cargarUsuarios();
  } finally {
    showLoader(false);
  }
}

/** Cambia la contraseña de un usuario. */
async function cambiarPasswordUsuario(u) {
  const nueva = window.prompt(`Nueva contraseña para ${u.email} (mínimo 6 caracteres):`);
  if (nueva === null) return;
  if (nueva.length < 6) {
    showStatus('La contraseña debe tener al menos 6 caracteres.', 'error');
    return;
  }
  try {
    showLoader(true);
    await llamarAdminUsuarios({ action: 'password', id: u.id, password: nueva });
    showStatus(`Contraseña de ${u.email} actualizada.`, 'ok');
  } catch (error) {
    showStatus('Error al cambiar la contraseña: ' + error.message, 'error');
  } finally {
    showLoader(false);
  }
}

/** Elimina un usuario. */
async function eliminarUsuario(u) {
  if (!window.confirm(`¿Eliminar al usuario ${u.email}? Esta acción no se puede deshacer.`)) return;
  try {
    showLoader(true);
    await llamarAdminUsuarios({ action: 'delete', id: u.id });
    showStatus(`Usuario ${u.email} eliminado.`, 'ok');
    await cargarUsuarios();
  } catch (error) {
    showStatus('Error al eliminar el usuario: ' + error.message, 'error');
  } finally {
    showLoader(false);
  }
}

/* ------------------------------------------------------------------ *
 *  Empresas de un usuario (modal)
 *
 *  El vínculo usuario→empresa dejó de ser uno a uno: una compañía puede
 *  operar vehículos que en el parque figuran a nombre de otra. La principal
 *  sigue en `perfiles.empresa` (la escribe la función edge al crear el
 *  usuario o al cambiarle el rol); las demás viven en `perfil_empresas`,
 *  que el admin escribe directo con su propia política.
 * ------------------------------------------------------------------ */

let _usuEmpresasActual = null;          // usuario que se está editando
let _usuEmpresasSel = new Set();        // lo marcado, se conserva al filtrar

function abrirEmpresasUsuario(u) {
  _usuEmpresasActual = u;
  _usuEmpresasSel = new Set(empresasDeUsuario(u));
  if (els.usuEmpresasSub) {
    els.usuEmpresasSub.textContent =
      (u.nombre && u.nombre !== u.email) ? `${u.nombre} · ${u.email}` : (u.email || '');
  }
  if (els.buscarUsuEmpresas) els.buscarUsuEmpresas.value = '';
  renderEmpresasUsuario();
  if (els.usuEmpresasModal) els.usuEmpresasModal.classList.add('show');
}

function cerrarEmpresasUsuario() {
  if (els.usuEmpresasModal) els.usuEmpresasModal.classList.remove('show');
  _usuEmpresasActual = null;
}

/** Pinta las casillas de todas las empresas del parque, filtradas por el buscador. */
function renderEmpresasUsuario() {
  const cont = els.usuEmpresasLista;
  if (!cont || !_usuEmpresasActual) return;

  const principal = String(_usuEmpresasActual.empresa || '').trim();
  const q = ((els.buscarUsuEmpresas && els.buscarUsuEmpresas.value) || '').trim().toUpperCase();
  const todas = state.empresasDisponibles || [];
  const visibles = q ? todas.filter(e => String(e).toUpperCase().includes(q)) : todas;

  cont.innerHTML = '';
  if (!visibles.length) {
    cont.innerHTML = '<div class="tercero-estado">Ninguna empresa coincide con lo que escribiste.</div>';
    actualizarResumenUsuEmpresas();
    return;
  }

  visibles.forEach(e => {
    const esPrincipal = e === principal;
    const lab = document.createElement('label');
    lab.className = 'usu-emp-item' + (esPrincipal ? ' principal' : '');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = _usuEmpresasSel.has(e);
    // La principal se cambia desde la columna «Rol»: aquí no se puede soltar,
    // porque dejaría al usuario sin la empresa con la que se creó.
    cb.disabled = esPrincipal;
    cb.addEventListener('change', () => {
      if (cb.checked) _usuEmpresasSel.add(e); else _usuEmpresasSel.delete(e);
      actualizarResumenUsuEmpresas();
    });
    const txt = document.createElement('span');
    txt.textContent = esPrincipal ? `${e}  ·  principal` : e;
    lab.appendChild(cb);
    lab.appendChild(txt);
    cont.appendChild(lab);
  });
  actualizarResumenUsuEmpresas();
}

function actualizarResumenUsuEmpresas() {
  if (!els.usuEmpresasResumen) return;
  const n = _usuEmpresasSel.size;
  els.usuEmpresasResumen.textContent =
    n === 1 ? '1 empresa seleccionada' : `${formatNumber(n)} empresas seleccionadas`;
}

/** Guarda la lista. La principal no se toca; las demás se reescriben enteras. */
async function guardarEmpresasUsuario() {
  const u = _usuEmpresasActual;
  if (!u) return;
  const principal = String(u.empresa || '').trim();
  const extras = [..._usuEmpresasSel].filter(e => e && e !== principal);

  try {
    showLoader(true);
    // Borrar y reescribir: son unas pocas filas, y así no hay que calcular
    // diferencias ni se puede quedar a medias con una lista inconsistente.
    const { error: errBorrar } = await db.from('perfil_empresas').delete().eq('perfil_id', u.id);
    if (errBorrar) throw errBorrar;
    if (extras.length) {
      const { error: errInsertar } = await db.from('perfil_empresas')
        .insert(extras.map(empresa => ({ perfil_id: u.id, empresa })));
      if (errInsertar) throw errInsertar;
    }
    cerrarEmpresasUsuario();
    showStatus(`Empresas actualizadas: ${formatNumber(extras.length + (principal ? 1 : 0))}.`, 'ok');
    await cargarUsuarios();
  } catch (error) {
    showStatus('No se pudieron guardar las empresas: ' + (error.message || error), 'error');
  } finally {
    showLoader(false);
  }
}
