/**
 * instalarapp.js
 * Botón "Instalar app": detecta si el dispositivo es iPhone/iPad, Android o
 * un computador, y ofrece el flujo nativo de instalación (Chrome/Edge/
 * Android) o instrucciones paso a paso cuando el navegador no lo ofrece
 * (Safari de iPhone no tiene instalación nativa).
 */

let instalarAppEvento = null;

function appYaInstalada() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function detectarPlataformaInstalacion() {
  const ua = navigator.userAgent || '';
  const esIOS = /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (esIOS) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'escritorio';
}

function initInstalarApp() {
  if (!els.btnInstalarApp) return;

  if (appYaInstalada()) {
    els.btnInstalarApp.classList.add('hidden');
    return;
  }

  els.btnInstalarApp.classList.remove('hidden');
  els.btnInstalarApp.addEventListener('click', abrirInstalarApp);

  // Chrome/Edge/Android avisan con este evento cuando la app se puede
  // instalar de forma nativa; lo guardamos para lanzarlo al tocar el botón.
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    instalarAppEvento = event;
  });

  window.addEventListener('appinstalled', () => {
    instalarAppEvento = null;
    els.btnInstalarApp.classList.add('hidden');
    if (typeof showStatus === 'function') showStatus('ASIS PLUS se instaló correctamente.', 'ok');
  });

  if (els.btnInstalarAppCerrar) els.btnInstalarAppCerrar.addEventListener('click', cerrarInstalarApp);
  if (els.instalarAppModal) {
    els.instalarAppModal.addEventListener('click', event => {
      if (event.target === els.instalarAppModal) cerrarInstalarApp();
    });
  }
}

async function abrirInstalarApp() {
  // Si el navegador ofrece el instalador nativo (Chrome/Edge en Android o
  // escritorio), úsalo directamente: es el flujo más simple para el usuario.
  if (instalarAppEvento) {
    instalarAppEvento.prompt();
    try { await instalarAppEvento.userChoice; } catch (_) { /* el usuario cerró el diálogo nativo */ }
    instalarAppEvento = null;
    return;
  }

  const plataforma = detectarPlataformaInstalacion();
  if (els.instalarAppCuerpo) els.instalarAppCuerpo.innerHTML = pasosInstalacionApp(plataforma);
  if (els.instalarAppModal) els.instalarAppModal.classList.add('show');
}

function cerrarInstalarApp() {
  if (els.instalarAppModal) els.instalarAppModal.classList.remove('show');
}

function pasosInstalacionApp(plataforma) {
  if (plataforma === 'ios') {
    return `
      <p class="muted">En iPhone o iPad, ábrela con <b>Safari</b> (no funciona desde Chrome) y sigue estos pasos:</p>
      <ol class="instalar-pasos">
        <li><span class="instalar-num">1</span> Toca el ícono <b>Compartir</b> (el cuadrado con una flecha hacia arriba) en la barra de Safari.</li>
        <li><span class="instalar-num">2</span> Desplázate hacia abajo y toca <b>“Agregar a inicio”</b>.</li>
        <li><span class="instalar-num">3</span> Toca <b>“Agregar”</b> en la esquina superior derecha.</li>
      </ol>
      <p class="muted">Listo. El ícono de ASIS PLUS quedará en tu pantalla de inicio, como cualquier otra app.</p>
    `;
  }
  if (plataforma === 'android') {
    return `
      <p class="muted">En Android, ábrela con <b>Chrome</b> y sigue estos pasos:</p>
      <ol class="instalar-pasos">
        <li><span class="instalar-num">1</span> Toca el menú <b>⋮</b> en la esquina superior derecha.</li>
        <li><span class="instalar-num">2</span> Toca <b>“Instalar aplicación”</b> o <b>“Agregar a pantalla de inicio”</b>.</li>
        <li><span class="instalar-num">3</span> Confirma tocando <b>“Instalar”</b>.</li>
      </ol>
      <p class="muted">Listo. El ícono de ASIS PLUS quedará en tu pantalla de inicio, como cualquier otra app.</p>
    `;
  }
  return `
    <p class="muted">Desde un computador, busca el ícono de instalar <b>⊕</b> en la barra de direcciones del navegador (Chrome o Edge), o abre el menú del navegador y busca <b>“Instalar ASIS PLUS”</b>.</p>
  `;
}
