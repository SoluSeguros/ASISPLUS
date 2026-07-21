/**
 * audio.js
 * Grabación de la versión hablada (conductor / asistente) desde el micrófono
 * del navegador (MediaRecorder). El audio grabado se guarda en Supabase
 * Storage (bucket privado "versiones-audio") al guardar el caso, y se
 * reproduce mediante URLs firmadas temporales.
 */

const BUCKET_AUDIO = 'versiones-audio';
const CAMPOS_AUDIO = ['VERSION CONDUCTOR', 'VERSION ASISTENTE'];

// Grabadores activos por campo (MediaRecorder + stream).
const _grabadores = {};

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
    };

    _grabadores[campo] = { mr, stream };
    mr.start();

    widget.querySelector('.audio-btn-rec').classList.add('hidden');
    widget.querySelector('.audio-btn-stop').classList.remove('hidden');
    widget.querySelector('.audio-status').textContent = '● Grabando…';
    widget.classList.add('grabando');
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
}

/**
 * Sube al Storage las grabaciones nuevas y actualiza el objeto `datos` con la
 * ruta de cada audio (o la borra si se eliminó). Devuelve `datos` modificado.
 */
async function subirAudiosCaso(caso, datos) {
  // Cierra grabaciones en curso para no perder audio sin "Detener".
  await finalizarGrabaciones();

  for (const campo of CAMPOS_AUDIO) {
    const blob = state.audioBlobs && state.audioBlobs[campo];
    const slug = campo.replace(/\s+/g, '_');
    const ruta = `${caso.numero_caso}/${slug}.webm`;

    if (blob) {
      // El tipo del blob suele venir como "audio/webm;codecs=opus"; el bucket
      // solo acepta el tipo base ("audio/webm"), así que quitamos el códec.
      const tipo = (blob.type || 'audio/webm').split(';')[0].trim() || 'audio/webm';
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
      try { await db.storage.from(BUCKET_AUDIO).remove([ruta]); } catch (e) { /* ignora */ }
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
