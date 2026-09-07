/**
 * audio.js
 * Grabación de la versión hablada (conductor / asistente) desde el micrófono
 * del navegador (MediaRecorder). Se guarda en Supabase Storage (bucket privado
 * "versiones-audio") y se reproduce mediante URLs firmadas temporales.
 *
 * PERSISTENCIA INMEDIATA: al DETENER la grabación el audio se sube y su ruta
 * queda escrita en el caso al instante, sin esperar a "Guardar cambios". El
 * asistente trabaja en la vía: si se le acaba la batería, entra una llamada o
 * cierra la app justo después de que el conductor habló, la grabación NO se
 * pierde. Sin señal queda en la cola offline y sube sola al reconectar.
 */

const BUCKET_AUDIO = 'versiones-audio';
const CAMPOS_AUDIO = ['VERSION CONDUCTOR', 'VERSION ASISTENTE'];

// Grabadores activos por campo (MediaRecorder + stream).
const _grabadores = {};

/* ------------------------------------------------------------------ *
 *  Pantalla encendida mientras se graba
 *
 *  El conductor da su versión hablando uno o dos minutos y nadie toca el
 *  teléfono en ese rato, así que el móvil apaga la pantalla por inactividad.
 *  Eso dejaba la grabación a medias.
 * ------------------------------------------------------------------ */

let _wakeLock = null;

/** ¿Hay alguna grabación en curso ahora mismo? */
function hayGrabacionEnCurso() {
  return Object.keys(_grabadores).some(campo => {
    const g = _grabadores[campo];
    return g && g.mr && g.mr.state === 'recording';
  });
}

/**
 * Pide al sistema que no apague la pantalla. El navegador suelta este permiso
 * por su cuenta en cuanto la pestaña deja de verse, así que hay que volver a
 * pedirlo al regresar (lo hace el listener de `visibilitychange`).
 * Devuelve si quedó activo: no todos los navegadores lo permiten, y algunos lo
 * niegan con la batería baja.
 */
async function mantenerPantallaEncendida() {
  if (!('wakeLock' in navigator)) return false;
  // `released` lo marca el navegador cuando lo suelta por su cuenta. No basta
  // con mirar si tenemos el objeto: seguiriamos creyendo que la pantalla esta
  // retenida cuando ya no lo esta.
  if (_wakeLock && !_wakeLock.released) return true;
  _wakeLock = null;
  try {
    _wakeLock = await navigator.wakeLock.request('screen');
    _wakeLock.addEventListener('release', () => { _wakeLock = null; });
    return true;
  } catch (_) {
    return false;
  }
}

/** Devuelve el control de la pantalla al sistema (vuelve a apagarse sola). */
function soltarPantalla() {
  if (!_wakeLock) return;
  try { _wakeLock.release(); } catch (_) {}
  _wakeLock = null;
}

/** Revoca el Object URL de audio asociado a un widget (evita fuga de memoria). */
function revocarAudioUrl(widget) {
  if (widget && widget._objUrl) {
    try { URL.revokeObjectURL(widget._objUrl); } catch (_) {}
    widget._objUrl = null;
  }
}

/** Registra los eventos de los widgets de grabación (una sola vez). */
function initAudioRecorders() {
  document.querySelectorAll('.audio-rec').forEach(widget => {
    const campo = widget.dataset.campo;
    widget.querySelector('.audio-btn-rec').addEventListener('click', () => iniciarGrabacion(campo, widget));
    widget.querySelector('.audio-btn-stop').addEventListener('click', () => detenerGrabacion(campo, widget));
    widget.querySelector('.audio-btn-del').addEventListener('click', () => eliminarGrabacion(campo, widget));
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // AQUÍ NO SE CORTA LA GRABACIÓN. Apagar la pantalla dispara este mismo
      // evento, y cortarla aquí era justamente el problema: la versión del
      // conductor se terminaba sola a mitad de frase. Sólo se le pide al
      // grabador que entregue lo capturado hasta ahora, para no depender de
      // que llegue el final.
      Object.keys(_grabadores).forEach(campo => {
        const g = _grabadores[campo];
        if (g && g.mr && g.mr.state === 'recording') {
          try { g.mr.requestData(); } catch (_) {}
        }
      });
      return;
    }
    // De vuelta en la app: el navegador ya soltó el permiso de pantalla, así
    // que se vuelve a pedir si la grabación sigue viva.
    if (hayGrabacionEnCurso()) mantenerPantallaEncendida();
  });

  // La página se va de verdad (se cierra la pestaña o se navega fuera): ahí sí
  // hay que cerrar la grabación, porque no habrá otra oportunidad de guardarla.
  window.addEventListener('pagehide', cerrarGrabacionesEnCurso);
}

/** Detiene toda grabación activa (su `onstop` la guarda). */
function cerrarGrabacionesEnCurso() {
  Object.keys(_grabadores).forEach(campo => {
    const g = _grabadores[campo];
    if (!g || !g.mr || g.mr.state === 'inactive') return;
    const widget = document.querySelector(`.audio-rec[data-campo="${campo}"]`);
    if (widget) detenerGrabacion(campo, widget);
    else { try { g.mr.stop(); } catch (_) {} }
  });
  soltarPantalla();
}

/** Comienza a grabar desde el micrófono. */
async function iniciarGrabacion(campo, widget) {
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    showStatus('Este navegador no permite grabar audio.', 'error');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream);
    const chunks = [];

    mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
      if (!state.audioBlobs) state.audioBlobs = {};
      state.audioBlobs[campo] = blob;
      if (state.audioEliminar) state.audioEliminar[campo] = false;
      revocarAudioUrl(widget); // libera la grabación anterior si la había
      const url = URL.createObjectURL(blob);
      widget._objUrl = url;
      mostrarAudio(widget, url);
      // Se guarda YA (no al pulsar "Guardar cambios"): la voz del conductor no
      // se puede volver a capturar si el asistente sale de la app.
      guardarAudioAhora(campo, blob, widget);
    };

    _grabadores[campo] = { mr, stream };
    // En trozos de un segundo: lo hablado va llegando durante la grabación en
    // vez de sólo al final, así una interrupción no se lleva todo.
    mr.start(1000);

    widget.querySelector('.audio-btn-rec').classList.add('hidden');
    widget.querySelector('.audio-btn-stop').classList.remove('hidden');
    widget.classList.add('grabando');

    widget.querySelector('.audio-status').textContent = '● Grabando…';

    // Que el teléfono no apague la pantalla mientras el conductor habla. Se
    // comprueba el estado después de esperar: si en ese instante ya pulsaron
    // "Detener", no hay que volver a escribir "Grabando" encima.
    const pantallaFija = await mantenerPantallaEncendida();
    if (pantallaFija && mr.state === 'recording') {
      widget.querySelector('.audio-status').textContent = '● Grabando… · la pantalla no se apagará';
    }
  } catch (e) {
    showStatus('No se pudo acceder al micrófono (permite el acceso).', 'error');
  }
}

/** Detiene la grabación en curso. */
function detenerGrabacion(campo, widget) {
  const g = _grabadores[campo];
  if (g && g.mr && g.mr.state !== 'inactive') g.mr.stop();
  widget.querySelector('.audio-btn-rec').classList.remove('hidden');
  widget.querySelector('.audio-btn-stop').classList.add('hidden');
  widget.querySelector('.audio-status').textContent = '';
  widget.classList.remove('grabando');
  // Ya no hay nada grabando: la pantalla vuelve a apagarse sola.
  if (!hayGrabacionEnCurso()) soltarPantalla();
}

/** Muestra el reproductor con el audio (grabado o existente). */
function mostrarAudio(widget, src) {
  const player = widget.querySelector('.audio-player');
  player.src = src;
  player.classList.remove('hidden');
  widget.querySelector('.audio-btn-del').classList.remove('hidden');
  widget.querySelector('.audio-btn-rec').textContent = '● Grabar de nuevo';
}

/** Elimina la grabación actual (marca para borrar la guardada). */
function eliminarGrabacion(campo, widget) {
  revocarAudioUrl(widget);
  if (!state.audioBlobs) state.audioBlobs = {};
  state.audioBlobs[campo] = null;
  if (!state.audioEliminar) state.audioEliminar = {};
  state.audioEliminar[campo] = true;
  const player = widget.querySelector('.audio-player');
  player.pause();
  player.removeAttribute('src');
  player.classList.add('hidden');
  widget.querySelector('.audio-btn-del').classList.add('hidden');
  widget.querySelector('.audio-btn-rec').textContent = '● Grabar';
  // El borrado también se persiste al instante, para que lo que se ve en
  // pantalla sea siempre lo que está guardado.
  borrarAudioAhora(campo);
}

/* ------------------------------------------------------------------ *
 *  Guardado inmediato (al detener la grabación)
 * ------------------------------------------------------------------ */

/**
 * Extensión real del audio. Safari/iOS entrega "audio/mp4", no webm: guardar
 * todo como .webm dejaba archivos con nombre mentiroso que algunos
 * reproductores rechazan.
 */
function extAudio(mime) {
  const t = String(mime || '').toLowerCase();
  if (t.includes('mp4') || t.includes('m4a') || t.includes('aac')) return 'm4a';
  if (t.includes('ogg')) return 'ogg';
  if (t.includes('mpeg') || t.includes('mp3')) return 'mp3';
  if (t.includes('wav')) return 'wav';
  return 'webm';
}

/** Ruta en Storage del audio de un campo, según el tipo del blob. */
function rutaAudio(caso, campo, mime) {
  return `${carpetaCaso(caso)}/${campo.replace(/\s+/g, '_')}.${extAudio(mime)}`;
}

/** Tipo MIME base (sin el ";codecs=…" que el bucket no acepta). */
function tipoAudioBase(blob) {
  return (blob && blob.type ? blob.type : 'audio/webm').split(';')[0].trim() || 'audio/webm';
}

/**
 * Sube la grabación y escribe su ruta en el caso EN EL MOMENTO. Deja
 * `state.audioBlobs[campo]` en null para que `subirAudiosCaso` no la resuba.
 * Si algo falla, el blob se conserva en memoria y el guardado del caso lo
 * reintenta: nunca se pierde en silencio.
 */
async function guardarAudioAhora(campo, blob, widget) {
  const caso = state.casoActual;
  if (!caso || !blob) return;
  const st = widget && widget.querySelector('.audio-status');
  if (st) st.textContent = '⏳ Guardando…';
  try {
    const tipo = tipoAudioBase(blob);
    const ruta = rutaAudio(caso, campo, tipo);

    const up = (typeof subirArchivoResiliente === 'function')
      ? await subirArchivoResiliente(BUCKET_AUDIO, ruta, blob, tipo)
      : (await (async () => {
          const { error } = await db.storage.from(BUCKET_AUDIO).upload(ruta, blob, { upsert: true, contentType: tipo });
          if (error) throw error;
          return { encolado: false };
        })());

    const per = (typeof persistirDatosCaso === 'function')
      ? await persistirDatosCaso(caso, datos => { datos[campo + ' AUDIO'] = ruta; })
      : (await (async () => {
          caso.datos = caso.datos || {};
          caso.datos[campo + ' AUDIO'] = ruta;
          const { error } = await db.from('registro_asistencias')
            .update({ datos: caso.datos }).eq('numero_caso', caso.numero_caso);
          if (error) throw error;
          return { encolado: false };
        })());

    state.audioBlobs[campo] = null; // ya está a salvo
    if (state.audioEliminar) state.audioEliminar[campo] = false;
    const pendiente = up.encolado || per.encolado;
    if (st) st.textContent = pendiente ? '📥 Guardado en el dispositivo' : '✅ Guardado';
    showStatus(pendiente
      ? 'Grabación guardada en el dispositivo. Se subirá al reconectar.'
      : 'Grabación guardada en el caso.', pendiente ? 'info' : 'ok');
    if (typeof renderChecklistCaso === 'function') { try { renderChecklistCaso(caso); } catch (_) {} }
  } catch (e) {
    // El blob sigue en state.audioBlobs: "Guardar cambios" lo vuelve a intentar.
    if (st) st.textContent = '⚠ Sin guardar (pulsa Guardar cambios)';
    showStatus('No se pudo guardar la grabación todavía: ' + (e.message || e), 'error');
  }
}

/** Quita del caso la referencia al audio de un campo (borrado inmediato). */
async function borrarAudioAhora(campo) {
  const caso = state.casoActual;
  if (!caso) return;
  const ruta = caso.datos && caso.datos[campo + ' AUDIO'];
  if (!ruta) return; // no había nada guardado: nada que borrar
  try {
    if (typeof persistirDatosCaso === 'function') {
      await persistirDatosCaso(caso, datos => { datos[campo + ' AUDIO'] = ''; });
    }
    try { await db.storage.from(BUCKET_AUDIO).remove([ruta]); } catch (_) { /* el archivo puede no existir */ }
    state.audioEliminar[campo] = false; // ya aplicado
    if (typeof renderChecklistCaso === 'function') { try { renderChecklistCaso(caso); } catch (_) {} }
  } catch (e) {
    // Si no se pudo, la marca sigue puesta y "Guardar cambios" lo reintenta.
  }
}

/** Reinicia un widget de audio a su estado vacío. */
function resetAudioWidget(widget) {
  revocarAudioUrl(widget);
  const player = widget.querySelector('.audio-player');
  player.pause();
  player.removeAttribute('src');
  player.classList.add('hidden');
  widget.querySelector('.audio-btn-del').classList.add('hidden');
  widget.querySelector('.audio-btn-stop').classList.add('hidden');
  const rec = widget.querySelector('.audio-btn-rec');
  rec.classList.remove('hidden');
  rec.textContent = '● Grabar';
  widget.querySelector('.audio-status').textContent = '';
  widget.classList.remove('grabando');
}

/**
 * Carga las grabaciones existentes de un caso (si las hay) y reinicia el
 * estado de audio. Usa URLs firmadas temporales para reproducir.
 */
async function cargarAudiosCaso(caso) {
  state.audioBlobs = {};
  state.audioEliminar = {};
  const d = caso.datos || {};

  for (const campo of CAMPOS_AUDIO) {
    const widget = document.querySelector(`.audio-rec[data-campo="${campo}"]`);
    if (!widget) continue;
    resetAudioWidget(widget);

    const ruta = d[campo + ' AUDIO'];
    if (!ruta) continue;
    try {
      const { data, error } = await db.storage
        .from(BUCKET_AUDIO)
        .createSignedUrl(ruta, 3600);
      if (!error && data && data.signedUrl) mostrarAudio(widget, data.signedUrl);
    } catch (e) { /* sin audio */ }
  }
}

/**
 * Finaliza cualquier grabación aún en curso (el usuario pudo pulsar "Guardar"
 * sin "Detener") y espera a que el blob quede listo en `state.audioBlobs`.
 * Sin esto, la grabación activa se perdería al guardar.
 */
async function finalizarGrabaciones() {
  const pendientes = [];
  for (const campo of Object.keys(_grabadores)) {
    const g = _grabadores[campo];
    if (g && g.mr && g.mr.state !== 'inactive') {
      pendientes.push(new Promise(resolve => {
        const anterior = g.mr.onstop;
        g.mr.onstop = (ev) => { if (anterior) anterior.call(g.mr, ev); resolve(); };
        try { g.mr.stop(); } catch (_) { resolve(); }
      }));
      const widget = document.querySelector(`.audio-rec[data-campo="${campo}"]`);
      if (widget) detenerGrabacion(campo, widget);
    }
  }
  if (pendientes.length) await Promise.all(pendientes);
  soltarPantalla();
}

/**
 * RED DE SEGURIDAD al guardar el caso. Lo normal es que el audio ya se haya
 * subido al detener la grabación (`guardarAudioAhora`); aquí solo queda lo que
 * falló entonces o lo que se acaba de grabar sin pulsar "Detener".
 * Actualiza `datos` con la ruta de cada audio (o la borra si se eliminó).
 */
async function subirAudiosCaso(caso, datos) {
  // Cierra grabaciones en curso para no perder audio sin "Detener".
  await finalizarGrabaciones();

  for (const campo of CAMPOS_AUDIO) {
    const blob = state.audioBlobs && state.audioBlobs[campo];

    if (blob) {
      // El tipo del blob suele venir como "audio/webm;codecs=opus"; el bucket
      // solo acepta el tipo base ("audio/webm"), así que quitamos el códec.
      const tipo = tipoAudioBase(blob);
      const ruta = rutaAudio(caso, campo, tipo);
      // Sube el audio (o lo encola si no hay señal para subirlo al reconectar).
      if (typeof subirArchivoResiliente === 'function') {
        await subirArchivoResiliente(BUCKET_AUDIO, ruta, blob, tipo);
      } else {
        const { error } = await db.storage.from(BUCKET_AUDIO)
          .upload(ruta, blob, { upsert: true, contentType: tipo });
        if (error) throw error;
      }
      datos[campo + ' AUDIO'] = ruta;
      state.audioBlobs[campo] = null; // ya subido/encolado: no repetir
    } else if (state.audioEliminar && state.audioEliminar[campo]) {
      // Borra la ruta REALMENTE guardada (no una recalculada): la extensión
      // depende del navegador que grabó (webm en Android, m4a en iPhone).
      const ruta = datos[campo + ' AUDIO'] || (caso.datos && caso.datos[campo + ' AUDIO']);
      if (ruta) { try { await db.storage.from(BUCKET_AUDIO).remove([ruta]); } catch (e) { /* ignora */ } }
      datos[campo + ' AUDIO'] = '';
    }
  }
  return datos;
}

/** Habilita o bloquea los controles de grabación (según el check-in). */
function habilitarAudio(on) {
  document.querySelectorAll('#audioGrid button').forEach(b => { b.disabled = !on; });
  const grid = els.audioGrid;
  if (grid) grid.classList.toggle('bloqueado', !on);
}
