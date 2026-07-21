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
    seguridad_vial: 'Seguridad Vial'
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
  await cargarUsuarios();
}

/** Carga y muestra la lista de usuarios. */
async function cargarUsuarios() {
  const tbody = els.usuariosBody;
  tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
  try {
    showLoader(true);
    const data = await llamarAdminUsuarios({ action: 'list' });
    renderUsuarios(data.usuarios || []);
  } catch (error) {
    const msg = (typeof escBandeja === 'function') ? escBandeja(error.message) : String(error.message || '');
    tbody.innerHTML = `<tr><td colspan="5">Error: ${msg}</td></tr>`;
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
     ['reclamaciones', 'Reclamaciones'], ['seguridad_vial', 'Seguridad Vial']]
      .forEach(([val, txt]) => {
        const o = document.createElement('option');
        o.value = val; o.textContent = txt;
        if (u.rol === val) o.selected = true;
        sel.appendChild(o);
      });
    sel.addEventListener('change', () => cambiarRolUsuario(u, sel.value));
    tdRol.appendChild(sel);
    tr.appendChild(tdRol);

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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showStatus('Ingresa un correo válido.', 'error');
    return;
  }
  if (password.length < 6) {
    showStatus('La contraseña debe tener al menos 6 caracteres.', 'error');
    return;
  }
  try {
    showLoader(true);
    await llamarAdminUsuarios({
      action: 'create',
      email,
      password,
      rol: els.usuRol.value,
      nombre: els.usuNombre.value.trim()
    });
    showStatus(`Usuario ${email} creado correctamente.`, 'ok');
    els.formUsuario.reset();
    await cargarUsuarios();
  } catch (error) {
    showStatus('Error al crear el usuario: ' + error.message, 'error');
  } finally {
    showLoader(false);
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

/** Cambia el rol de un usuario. */
async function cambiarRolUsuario(u, rol) {
  try {
    showLoader(true);
    await llamarAdminUsuarios({ action: 'rol', id: u.id, rol });
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
