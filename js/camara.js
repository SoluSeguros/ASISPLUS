/**
 * camara.js
 * Captura de foto con la cámara del dispositivo (getUserMedia) que funciona en
 * WEB (escritorio), iOS (Safari) y Android. Abre un modal con video en vivo y
 * un botón para capturar; devuelve un File JPEG. Si no hay cámara disponible o
 * el usuario prefiere la galería, se usa el <input type=file> como respaldo.
 *
 * Notas iOS: el <video> debe tener 'playsinline' y 'muted' para no ir a
 * pantalla completa ni bloquear el autoplay. getUserMedia exige HTTPS (o
 * localhost); en producción la PWA debe servirse por HTTPS.
 */

const cam = { stream: null, facing: 'environment', resolve: null, reqId: 0, _init: false };

/** ¿El dispositivo/navegador permite abrir la cámara en vivo? */
function camaraDisponible() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/** Registra los botones del modal de cámara (una sola vez). */
function initCamara() {
  if (!els.camaraModal || cam._init) return;
  cam._init = true;
  els.btnCamaraCerrar.addEventListener('click', () => cerrarCamara(null));
  els.btnCamaraCancelar.addEventListener('click', () => cerrarCamara(null));
  els.btnCamaraCapturar.addEventListener('click', capturarDeCamara);
  els.btnCamaraCambiar.addEventListener('click', cambiarCamara);
  els.btnCamaraGaleria.addEventListener('click', () => cerrarCamara('galeria'));
}

/**
 * Abre la cámara y resuelve con un File (foto), null (cancelar) o el string
 * 'galeria' si el usuario prefiere elegir un archivo existente.
 */
function abrirCamara() {
  return new Promise(resolve => {
    cam.resolve = resolve;
    cam.facing = 'environment';
    els.camaraError.classList.add('hidden');
    els.camaraModal.classList.add('show');
    iniciarStreamCamara();
  });
}

async function iniciarStreamCamara() {
  detenerStreamCamara();
  els.camaraError.classList.add('hidden');
  els.btnCamaraCapturar.disabled = true;
  // Token de esta petición: si mientras se concede el permiso se cierra la
  // cámara o se cambia de lente, el stream que llegue tarde se descartará.
  const req = (cam.reqId = cam.reqId + 1);
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: cam.facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });
  } catch (e) {
    // Respaldo: sin especificar cámara (algunos equipos no aceptan facingMode).
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (e2) {
      if (req === cam.reqId) mostrarErrorCamara(e2);
      return;
    }
  }
  // ¿Se cerró el modal o se pidió otra cámara mientras tanto? Apaga este stream
  // (evita que la cámara quede encendida con el modal cerrado).
  if (req !== cam.reqId || !els.camaraModal.classList.contains('show')) {
    stream.getTracks().forEach(t => t.stop());
    return;
  }
  cam.stream = stream;
  els.camaraVideo.srcObject = cam.stream;
  els.camaraVideo.setAttribute('playsinline', ''); // iOS
  try { await els.camaraVideo.play(); } catch (e) { /* autoplay */ }
  els.btnCamaraCapturar.disabled = false;
}

function mostrarErrorCamara(e) {
  const msg = (e && (e.name === 'NotAllowedError'))
    ? 'Permiso de cámara denegado. Actívalo en el navegador o usa "Elegir de galería".'
    : 'No se pudo abrir la cámara. Usa "Elegir de galería".';
  els.camaraError.textContent = msg;
  els.camaraError.classList.remove('hidden');
}

/** Alterna entre cámara trasera (environment) y frontal (user). */
function cambiarCamara() {
  cam.facing = cam.facing === 'environment' ? 'user' : 'environment';
  iniciarStreamCamara();
}

/** Toma la foto del fotograma actual del video y cierra devolviendo el File. */
function capturarDeCamara() {
  const v = els.camaraVideo;
  if (!v.videoWidth) return;
  const canvas = document.createElement('canvas');
  canvas.width = v.videoWidth;
  canvas.height = v.videoHeight;
  canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
  canvas.toBlob(b => {
    if (!b) { cerrarCamara(null); return; }
    const file = new File([b], `camara_${Date.now()}.jpg`, { type: 'image/jpeg' });
    cerrarCamara(file);
  }, 'image/jpeg', 0.9);
}

function detenerStreamCamara() {
  if (cam.stream) { cam.stream.getTracks().forEach(t => t.stop()); cam.stream = null; }
  if (els.camaraVideo) els.camaraVideo.srcObject = null;
}

function cerrarCamara(resultado) {
  cam.reqId += 1; // invalida cualquier getUserMedia aún en vuelo
  detenerStreamCamara();
  els.camaraModal.classList.remove('show');
  const r = cam.resolve; cam.resolve = null;
  if (r) r(resultado);
}
