/**
 * offline.js
 * Cola de sincronización (outbox) para trabajar SIN señal en la calle. El
 * asistente puede guardar el caso, tomar fotos, grabar audio y dibujar croquis
 * aunque no haya internet: todo se almacena localmente (IndexedDB) y se sube
 * solo al reconectar.
 *
 * PRINCIPIO: el camino ONLINE no cambia. Estas funciones intentan primero la
 * operación normal; solo si NO hay conexión (o la escritura falla por red)
 * guardan la operación en la cola y devuelven `{ encolado: true }`. Un proceso
 * de flush reintenta la cola en orden (FIFO) cuando vuelve la señal.
 *
 * Limitación conocida (aceptable para trabajo de campo de un asistente por
 * caso): los merges de `datos` son "última escritura gana" a nivel de clave;
 * las fotos usan append idempotente para no pisarse entre sí.
 */

const OUTBOX_DB = 'asisplus-outbox';
const OUTBOX_VER = 1;
let _odb = null;
let _flushActivo = false;

/* ------------------------------------------------------------------ *
 *  IndexedDB (envoltorios en Promesa)
 * ------------------------------------------------------------------ */

function _abrirOutbox() {
  if (_odb) return Promise.resolve(_odb);
  return new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(OUTBOX_DB, OUTBOX_VER); }
    catch (e) { return reject(e); }
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('ops')) d.createObjectStore('ops', { keyPath: 'id', autoIncrement: true });
      if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => { _odb = req.result; resolve(_odb); };
    req.onerror = () => reject(req.error);
  });
}

function _idb(store, mode, fn) {
  return _abrirOutbox().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const os = t.objectStore(store);
    const r = fn(os);
    t.oncomplete = () => resolve(r && r.result !== undefined ? r.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

const _add = (store, val) => _idb(store, 'readwrite', os => os.add(val));
const _del = (store, key) => _idb(store, 'readwrite', os => os.delete(key));
const _put = (store, val) => _idb(store, 'readwrite', os => os.put(val));
const _get = (store, key) => _idb(store, 'readonly', os => os.get(key));
function _all(store) {
  return _abrirOutbox().then(d => new Promise((resolve, reject) => {
    const out = [];
    const cur = d.transaction(store, 'readonly').objectStore(store).openCursor();
    cur.onsuccess = () => { const c = cur.result; if (c) { out.push(c.value); c.continue(); } else resolve(out); };
    cur.onerror = () => reject(cur.error);
  }));
}

/* ------------------------------------------------------------------ *
 *  Utilidades
 * ------------------------------------------------------------------ */

/** ¿Estamos sin conexión confirmada? */
function _sinConexion() {
  return (typeof estaEnLinea === 'function') ? !estaEnLinea() : !navigator.onLine;
}

/** ¿El error parece de red (y no un rechazo del servidor)?
 * Un mensaje VACÍO NO se considera de red: así un rechazo del servidor sin
 * texto no se encola ni bloquea la cola en bucle (se cuenta como intento). */
function _esErrorRed(e) {
  const m = String((e && e.message) || e || '').toLowerCase();
  return m.includes('fetch') || m.includes('network') || m.includes('failed')
      || m.includes('timeout') || m.includes('load failed') || m.includes('offline');
}

/** Delta de claves cambiadas de `full` respecto de `base` (para no pisar
 * claves que no tocó el usuario al sincronizar). */
function _delta(base, full) {
  const d = {};
  base = base || {};
  Object.keys(full || {}).forEach(k => { if (full[k] !== base[k]) d[k] = full[k]; });
  return d;
}

/** Encola una operación y refresca el indicador de pendientes. */
async function _encolar(op) {
  op.ts = Date.now();
  op.intentos = 0;
  const id = await _add('ops', op);
  actualizarBadgePendientes();
  return id;
}

/* ------------------------------------------------------------------ *
 *  Helpers resilientes que usan los puntos de escritura de la app
 * ------------------------------------------------------------------ */

/** ¿El servidor rechazó SOBRESCRIBIR un archivo que ya existe? */
function _esRechazoDeReemplazo(e) {
  const m = String((e && e.message) || e || '').toLowerCase();
  return m.includes('row-level security') || m.includes('violates row-level');
}

/**
 * Sube un archivo a Storage reemplazando el que hubiera en esa ruta.
 *
 * Varias evidencias del caso viven en una ruta FIJA (la firma del conductor, el
 * croquis, las firmas de los terceros): volver a firmar debe pisar el archivo
 * anterior, no crear otro. Eso se pide con `upsert: true`, que por dentro es un
 * UPDATE sobre el archivo existente.
 *
 * Si el bucket no tiene permitido ese UPDATE, el servidor responde "new row
 * violates row-level security policy" y el reemplazo falla SIEMPRE (la primera
 * subida entra, las siguientes no). Cuando pasa, se hace en dos pasos —borrar y
 * subir— que sí están permitidos y dejan el mismo resultado.
 */
async function _subirReemplazando(bucket, ruta, blob, contentType) {
  const opciones = { upsert: true, contentType: contentType || undefined };
  const { error } = await db.storage.from(bucket).upload(ruta, blob, opciones);
  if (!error) return;
  if (!_esRechazoDeReemplazo(error)) throw error;

  // Camino de respaldo: borrar y volver a subir.
  await db.storage.from(bucket).remove([ruta]);
  const { error: error2 } = await db.storage.from(bucket).upload(ruta, blob, opciones);
  if (error2) throw error2;
}

/**
 * Sube un archivo a Storage; si no hay señal, lo guarda en la cola (con su
 * blob) para subirlo al reconectar. Devuelve { encolado }.
 */
async function subirArchivoResiliente(bucket, ruta, blob, contentType) {
  if (_sinConexion()) { await _encolarSubida(bucket, ruta, blob, contentType); return { encolado: true }; }
  try {
    await _subirReemplazando(bucket, ruta, blob, contentType);
    return { encolado: false };
  } catch (e) {
    if (_esErrorRed(e)) { await _encolarSubida(bucket, ruta, blob, contentType); return { encolado: true }; }
    throw e; // error real del servidor (p. ej. MIME no permitido): que se vea
  }
}

async function _encolarSubida(bucket, ruta, blob, contentType) {
  const blobId = await _add('blobs', { blob });
  await _encolar({ tipo: 'subir', bucket, ruta, blobId, contentType });
}

/**
 * Guarda el caso (datos + estado + asignado) de forma resiliente. `cambios` es
 * el objeto `datos` completo ya construido por quien llama. ONLINE escribe ese
 * datos (construido sobre lo fresco). OFFLINE encola SOLO el DELTA (las claves
 * que el usuario cambió), para que al sincronizar no pise evidencia (fotos,
 * etc.) que otro dispositivo agregó en paralelo. Devuelve { encolado }.
 */
async function guardarCasoResiliente(numeroCaso, { cambios, estado, asignado_a, baseDatos }) {
  const encolarDelta = () => _encolar({
    tipo: 'guardar-caso', numero_caso: numeroCaso,
    cambios: _delta(baseDatos, cambios), estado, asignado_a
  });
  if (_sinConexion()) { await encolarDelta(); return { encolado: true }; }
  try {
    const upd = { datos: cambios };
    if (estado) upd.estado = estado;
    if (asignado_a !== undefined) upd.asignado_a = asignado_a;
    const { error } = await db.from('registro_asistencias').update(upd).eq('numero_caso', numeroCaso);
    if (error) throw error;
    return { encolado: false };
  } catch (e) {
    if (_esErrorRed(e)) { await encolarDelta(); return { encolado: true }; }
    throw e;
  }
}

/**
 * Encola un merge (a nivel de clave) de `cambios` en `datos`. Lo usa
 * `persistirDatosCaso` como respaldo cuando no hay señal: el camino online
 * sigue aplicando el cambio sobre datos FRESCOS (así el append es correcto).
 */
async function encolarMergeDatos(numeroCaso, cambios) {
  await _encolar({ tipo: 'merge', numero_caso: numeroCaso, cambios });
  return { encolado: true };
}

/**
 * Encola la CREACIÓN de un caso nuevo (borrador) para subirlo al reconectar.
 * El caso ya trae su `key` (única): en el servidor se hace upsert por esa key,
 * así que reintentar NO duplica el caso.
 */
async function encolarInsertCaso(payload) {
  await _encolar({ tipo: 'insert-caso', fila: payload });
  return { encolado: true };
}

/* ------------------------------------------------------------------ *
 *  Borradores locales (casos creados/editados SIN señal). Viven en
 *  localStorage por su `key`; su `datos` se mantiene aquí y sube ENTERO
 *  al reconectar (dentro de la op insert-caso). Las fotos/croquis/firmas
 *  son referencias dentro de `datos` (sus blobs se suben aparte por ruta).
 * ------------------------------------------------------------------ */
const BORRADORES_KEY = 'asisplus-borradores';

function _leerBorradores() {
  try { return JSON.parse(localStorage.getItem(BORRADORES_KEY) || '{}') || {}; }
  catch (e) { return {}; }
}
function _escribirBorradores(obj) {
  try { localStorage.setItem(BORRADORES_KEY, JSON.stringify(obj)); } catch (e) { /* cuota */ }
}

/** ¿Este caso es un borrador local (creado sin señal, aún sin subir)? */
function esBorrador(caso) { return !!(caso && caso._borrador); }

/** Lista los borradores locales (para mostrarlos en la bandeja). */
function listarBorradores() {
  const obj = _leerBorradores();
  return Object.keys(obj).map(k => obj[k]);
}
/** Obtiene un borrador por su key (o null). */
function obtenerBorrador(key) { return _leerBorradores()[key] || null; }
/** Elimina un borrador (tras subirse). */
function eliminarBorrador(key) { const o = _leerBorradores(); delete o[key]; _escribirBorradores(o); }

/**
 * Guarda/actualiza un borrador local y refleja su estado en la op insert-caso
 * ya encolada (para que suba con lo último). `caso` trae key, datos, estado,
 * asignado_a y opcionalmente `terceros` (para verlos sin señal).
 */
async function guardarBorrador(caso) {
  const o = _leerBorradores();
  const prev = o[caso.key] || {};
  o[caso.key] = {
    key: caso.key,
    numero_caso: null,
    estado: caso.estado || prev.estado || 'REPORTADO',
    asignado_a: (caso.asignado_a !== undefined ? caso.asignado_a : prev.asignado_a) || null,
    datos: caso.datos || prev.datos || {},
    terceros: caso.terceros || prev.terceros || [],
    creado_en: prev.creado_en || caso.creado_en || new Date().toISOString(),
    _borrador: true
  };
  _escribirBorradores(o);
  // Refleja datos/estado/asignado en la op insert-caso encolada.
  try {
    const ops = await _all('ops');
    const op = ops.find(x => x.tipo === 'insert-caso' && x.fila && x.fila.key === caso.key);
    if (op) {
      op.fila.datos = o[caso.key].datos;
      op.fila.estado = o[caso.key].estado;
      op.fila.asignado_a = o[caso.key].asignado_a;
      await _put('ops', op);
    }
  } catch (e) { /* si no hay op aún, insert-caso se encola por separado */ }
  actualizarBadgePendientes();
}

/** ¿Estamos sin conexión? (expuesto para quien no incluye conexion.js) */
function offlineSinConexion() { return _sinConexion(); }
/** ¿El error parece de red? (expuesto para los puntos de escritura) */
function offlineEsErrorRed(e) { return _esErrorRed(e); }

/**
 * Persiste una foto del sitio (append idempotente para no pisar fotos de otros
 * dispositivos). Si no hay señal, encola.
 */
async function persistirFotoResiliente(caso, ruta, desc) {
  // Borrador: la referencia va dentro de su `datos` (sube con el insert-caso).
  if (esBorrador(caso)) {
    const datos = caso.datos || (caso.datos = {});
    const lista = Array.isArray(datos['FOTOS SITIO']) ? datos['FOTOS SITIO'] : [];
    if (!lista.includes(ruta)) lista.push(ruta);
    datos['FOTOS SITIO'] = lista;
    if (desc) {
      const mapa = (datos['DESCRIPCION FOTOS'] && typeof datos['DESCRIPCION FOTOS'] === 'object') ? datos['DESCRIPCION FOTOS'] : {};
      mapa[ruta] = desc; datos['DESCRIPCION FOTOS'] = mapa;
    }
    await guardarBorrador(caso);
    return { encolado: true };
  }
  const payload = { tipo: 'append-foto', numero_caso: caso.numero_caso, ruta, desc: desc || '' };
  if (_sinConexion()) { await _encolar(payload); return { encolado: true }; }
  try {
    // Reusa el ejecutor: relee fresco y hace APPEND (no pisa fotos ni otras
    // claves que otro dispositivo haya cambiado), igual que en el flush.
    await _ejecutarOp(payload);
    return { encolado: false };
  } catch (e) {
    if (_esErrorRed(e)) { await _encolar(payload); return { encolado: true }; }
    throw e;
  }
}

/**
 * Alta o edición resiliente de un tercero. Si no hay señal, encola la
 * operación (insert o update) para ejecutarla al reconectar.
 */
async function guardarTerceroResiliente(editando, idRegistro, key, datos) {
  const payload = editando
    ? { tipo: 'update-tercero', id_registro: idRegistro, datos }
    : { tipo: 'insert-tercero', fila: { id_registro: idRegistro, key, datos } };
  if (_sinConexion()) { await _encolar(payload); return { encolado: true }; }
  try {
    let error;
    if (editando) ({ error } = await db.from('registro_terceros').update({ datos }).eq('id_registro', idRegistro));
    else ({ error } = await db.from('registro_terceros').insert({ id_registro: idRegistro, key, datos }));
    if (error) throw error;
    return { encolado: false };
  } catch (e) {
    if (_esErrorRed(e)) { await _encolar(payload); return { encolado: true }; }
    throw e;
  }
}

/* ------------------------------------------------------------------ *
 *  Ejecución de la cola (flush)
 * ------------------------------------------------------------------ */

async function _ejecutarOp(op) {
  if (op.tipo === 'subir') {
    const rec = await _get('blobs', op.blobId);
    if (!rec || !rec.blob) {
      // El blob se perdió del dispositivo: la ruta ya quedó escrita en `datos`,
      // así que avisamos para que se vuelva a capturar (no fallamos en silencio).
      if (typeof showStatus === 'function') {
        showStatus('Un archivo quedó pendiente pero se perdió del dispositivo. Vuelve a capturarlo (foto/audio).', 'error');
      }
      return;
    }
    await _subirReemplazando(op.bucket, op.ruta, rec.blob, op.contentType);
    await _del('blobs', op.blobId);
    return;
  }

  if (op.tipo === 'guardar-caso') {
    // La base la aporta la relectura fresca (op.baseDatos casi siempre viene
    // vacío). Si el SELECT falla, NO seguimos: escribir Object.assign({}, delta)
    // borraría el resto de `datos` (fotos, etc.). Lanzamos para reintentar.
    let base = op.baseDatos || {};
    const { data, error: errLeer } = await db.from('registro_asistencias')
      .select('datos').eq('numero_caso', op.numero_caso).maybeSingle();
    if (errLeer) throw errLeer;
    if (data && data.datos) base = data.datos;
    const datos = Object.assign({}, base, op.cambios || {});
    const upd = { datos };
    if (op.estado) upd.estado = op.estado;
    if (op.asignado_a !== undefined) upd.asignado_a = op.asignado_a;
    const { error } = await db.from('registro_asistencias').update(upd).eq('numero_caso', op.numero_caso);
    if (error) throw error;
    return;
  }

  if (op.tipo === 'merge') {
    // Igual que 'guardar-caso': sin base fresca confirmada NO escribimos (un
    // merge sobre {} borraría el resto de `datos`). Si el SELECT falla, reintenta.
    let base = {};
    const { data, error: errLeer } = await db.from('registro_asistencias')
      .select('datos').eq('numero_caso', op.numero_caso).maybeSingle();
    if (errLeer) throw errLeer;
    if (data && data.datos) base = data.datos;
    const datos = Object.assign({}, base, op.cambios || {});
    const { error } = await db.from('registro_asistencias').update({ datos }).eq('numero_caso', op.numero_caso);
    if (error) throw error;
    return;
  }

  if (op.tipo === 'append-foto') {
    // Sin base fresca confirmada NO escribimos (se perderían otras fotos/campos).
    let base = {};
    const { data, error: errLeer } = await db.from('registro_asistencias')
      .select('datos').eq('numero_caso', op.numero_caso).maybeSingle();
    if (errLeer) throw errLeer;
    if (data && data.datos) base = data.datos;
    const datos = Object.assign({}, base);
    const lista = Array.isArray(datos['FOTOS SITIO']) ? datos['FOTOS SITIO'].slice() : [];
    if (!lista.includes(op.ruta)) lista.push(op.ruta);
    datos['FOTOS SITIO'] = lista;
    if (op.desc) {
      const mapa = (datos['DESCRIPCION FOTOS'] && typeof datos['DESCRIPCION FOTOS'] === 'object') ? datos['DESCRIPCION FOTOS'] : {};
      mapa[op.ruta] = op.desc;
      datos['DESCRIPCION FOTOS'] = mapa;
    }
    const { error } = await db.from('registro_asistencias').update({ datos }).eq('numero_caso', op.numero_caso);
    if (error) throw error;
    return;
  }

  if (op.tipo === 'insert-caso') {
    // upsert por key (columna única): si el insert llegó al servidor pero se
    // cayó la red antes de la respuesta, el reintento no duplica el caso.
    const { error } = await db.from('registro_asistencias')
      .upsert(op.fila, { onConflict: 'key' });
    if (error) throw error;
    return;
  }

  if (op.tipo === 'insert-tercero') {
    // upsert por id_registro (columna única): si el insert llegó al servidor
    // pero la red se cayó antes de la respuesta, el reintento no duplica.
    const { error } = await db.from('registro_terceros')
      .upsert(op.fila, { onConflict: 'id_registro' });
    if (error) throw error;
    return;
  }

  if (op.tipo === 'update-tercero') {
    const { error } = await db.from('registro_terceros').update({ datos: op.datos }).eq('id_registro', op.id_registro);
    if (error) throw error;
    return;
  }
}

/** A qué caso pertenece una operación (para no adelantar las que dependen de ella). */
function _casoDeOp(op) {
  if (!op) return '';
  if (op.numero_caso) return 'caso:' + op.numero_caso;
  if (op.tipo === 'insert-caso' && op.fila && op.fila.key) return 'key:' + op.fila.key;
  return ''; // subidas de archivo y terceros: no dependen de otra operación
}

/** Qué era la operación, en palabras, para poder avisar de qué se trata. */
function _describirOp(op) {
  switch (op && op.tipo) {
    case 'subir':          return 'un archivo (' + (op.ruta || '') + ')';
    case 'insert-caso':    return 'la creación de un caso';
    case 'guardar-caso':
    case 'merge':          return 'cambios del caso ' + (op.numero_caso || '');
    case 'append-foto':    return 'una foto del caso ' + (op.numero_caso || '');
    case 'insert-tercero':
    case 'update-tercero': return 'los datos de un tercero';
    default:               return 'una operación pendiente';
  }
}

// Reintentos antes de dar una operación por imposible. Con los ciclos de flush
// (al reconectar, al volver a la app y cada 45 s) esto da varios minutos de
// margen para un fallo transitorio del servidor.
const MAX_INTENTOS_OP = 10;

/**
 * Procesa la cola en orden. Se detiene ante el primer fallo de red (para
 * conservar el orden y reintentar luego). Un fallo del servidor NO detiene la
 * cola: solo aparta las operaciones del MISMO caso, que dependen de ella, y
 * sigue con el resto. Si una operación se repite como imposible, se descarta
 * diciendo qué era, para no dejar la cola atascada para siempre.
 */
async function sincronizarPendientes() {
  if (_flushActivo) return;
  if (_sinConexion()) return;
  _flushActivo = true;
  try {
    const ops = await _all('ops');
    ops.sort((a, b) => a.id - b.id);
    let subidas = 0;
    // Casos con una operación fallida en este ciclo: sus operaciones siguientes
    // se dejan para el próximo (van en orden y dependen de la que fallo). El
    // resto de la cola —otros casos, archivos, terceros— sigue subiendo.
    const frenados = new Set();
    for (const op of ops) {
      const suCaso = _casoDeOp(op);
      if (suCaso && frenados.has(suCaso)) continue;
      try {
        await _ejecutarOp(op);
        await _del('ops', op.id);
        // Si acaba de subirse la creación del caso, el borrador local ya sobra.
        if (op.tipo === 'insert-caso' && op.fila && op.fila.key) eliminarBorrador(op.fila.key);
        subidas++;
      } catch (e) {
        if (_esErrorRed(e)) break; // se cayó la red: reintenta en el próximo ciclo
        // Error del servidor: reintenta unas cuantas veces; si persiste, descarta.
        op.intentos = (op.intentos || 0) + 1;
        if (op.intentos >= MAX_INTENTOS_OP) {
          await _del('ops', op.id);
          if (op.blobId) { try { await _del('blobs', op.blobId); } catch (_) {} }
          if (typeof showStatus === 'function') {
            showStatus('No se pudo subir ' + _describirOp(op) + ' y se descartó: ' +
              (e.message || e) + '. Si era evidencia del sitio, vuelve a capturarla.', 'error');
          }
        } else {
          await _put('ops', op);
          // Antes aquí había un `break`: una sola operación imposible frenaba
          // TODA la cola y los pendientes se acumulaban sin subir ninguno.
          if (suCaso) frenados.add(suCaso);
        }
      }
    }
    actualizarBadgePendientes();
    if (subidas > 0 && typeof showStatus === 'function') {
      const rest = await _contarPendientes();
      showStatus(rest > 0
        ? `Sincronizados ${subidas} cambios pendientes. Quedan ${rest} por subir.`
        : `✅ Todos los cambios pendientes se sincronizaron (${subidas}).`, 'ok');
    }
  } catch (_) { /* IndexedDB no disponible u otro fallo: se reintenta luego */ }
  finally { _flushActivo = false; }
}

/* ------------------------------------------------------------------ *
 *  Indicador de pendientes (badge en el header)
 * ------------------------------------------------------------------ */

async function _contarPendientes() {
  try { const ops = await _all('ops'); return ops.length; }
  catch (_) { return 0; }
}

async function actualizarBadgePendientes() {
  let badge = document.getElementById('syncPendientes');
  const chip = document.getElementById('conexionChip');
  if (!badge && chip && chip.parentNode) {
    badge = document.createElement('span');
    badge.id = 'syncPendientes';
    badge.className = 'sync-pendientes hidden';
    badge.title = 'Cambios guardados en este dispositivo, pendientes de subir';
    badge.addEventListener('click', () => sincronizarPendientes());
    chip.parentNode.insertBefore(badge, chip.nextSibling);
  }
  if (!badge) return;
  const n = await _contarPendientes();
  if (n > 0) {
    badge.textContent = `⏳ ${n} por subir`;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

/* ------------------------------------------------------------------ *
 *  Arranque
 * ------------------------------------------------------------------ */

function initOffline() {
  actualizarBadgePendientes();
  // Intenta vaciar la cola al cargar y cuando vuelva la conexión.
  sincronizarPendientes();
  window.addEventListener('online', () => setTimeout(sincronizarPendientes, 500));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizarPendientes(); });
  // Respaldo periódico.
  setInterval(() => { if (!document.hidden && !_sinConexion()) sincronizarPendientes(); }, 45000);
}

document.addEventListener('DOMContentLoaded', initOffline);
