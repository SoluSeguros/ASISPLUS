/**
 * instalarapp.js
 * Botón "Instalar app": detecta la plataforma exacta (iPhone/iPad, Android,
 * Mac, Windows u otro computador) y ofrece el flujo nativo de instalación
 * (Chrome/Edge/Android) o instrucciones paso a paso propias de esa
 * plataforma cuando el navegador no lo ofrece (Safari no tiene instalación
 * nativa por evento, ni en iPhone ni en Mac).
 */

let instalarAppEvento = null;

// Título del botón (tooltip) por plataforma detectada.
const INSTALAR_TITULOS = {
  ios: 'Instalar en iPhone/iPad',
  android: 'Instalar en Android',
  mac: 'Instalar en Mac',
  windows: 'Instalar en Windows',
  escritorio: 'Instalar ASIS PLUS'
};

function appYaInstalada() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// Se registra apenas carga este archivo (no dentro de initInstalarApp, que se
// llama después de que TODOS los demás módulos terminan de cargar) para no
// arriesgarse a perder el evento si Chrome/Android lo dispara temprano.
// A propósito NO se llama event.preventDefault(): así, cuando el navegador
// decide que la app se puede instalar, también muestra su propio aviso
// nativo (el ícono ⊕ en la barra de direcciones, o el banner de Android) sin
// que el usuario tenga que encontrar y tocar nuestro botón. Igual guardamos
// el evento por si el usuario prefiere instalar desde nuestro botón.
window.addEventListener('beforeinstallprompt', event => {
  instalarAppEvento = event;
});

function detectarPlataformaInstalacion() {
  const ua = navigator.userAgent || '';
  const plat = navigator.platform || '';
  const esIOS = /iphone|ipad|ipod/i.test(ua) ||
    (plat === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (esIOS) return 'ios';
  if (/android/i.test(ua)) return 'android';
  if (/mac/i.test(plat) || /macintosh/i.test(ua)) return 'mac';
  if (/win/i.test(plat) || /windows/i.test(ua)) return 'windows';
  return 'escritorio';
}

function initInstalarApp() {
  if (!els.btnInstalarApp) return;

  if (appYaInstalada()) {
    els.btnInstalarApp.classList.add('hidden');
    return;
  }

  els.btnInstalarApp.classList.remove('hidden');
  els.btnInstalarApp.title = INSTALAR_TITULOS[detectarPlataformaInstalacion()] || 'Instalar ASIS PLUS en tu dispositivo';
  els.btnInstalarApp.addEventListener('click', abrirInstalarApp);

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
    try {
      await instalarAppEvento.prompt();
      await instalarAppEvento.userChoice;
      instalarAppEvento = null;
      return;
    } catch (_) {
      // El evento ya se usó (p. ej. el usuario ya vio/cerró el aviso nativo
      // del navegador): sigue con las instrucciones manuales de abajo.
      instalarAppEvento = null;
    }
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
  if (plataforma === 'windows') {
    return `
      <p class="muted">En Windows, con <b>Chrome</b> o <b>Edge</b>, sigue estos pasos:</p>
      <ol class="instalar-pasos">
        <li><span class="instalar-num">1</span> Busca el ícono de instalar <b>⊕</b> al final de la barra de direcciones.</li>
        <li><span class="instalar-num">2</span> Si no lo ves, abre el menú <b>⋮</b> (arriba a la derecha) y busca <b>“Instalar ASIS PLUS”</b>.</li>
        <li><span class="instalar-num">3</span> Confirma tocando <b>“Instalar”</b>.</li>
      </ol>
      <p class="muted">Listo. Quedará como un programa más, con su propio ícono y ventana, sin pestañas del navegador alrededor.</p>
    `;
  }
  if (plataforma === 'mac') {
    return `
      <p class="muted">En Mac, con <b>Chrome</b> o <b>Edge</b>, busca el ícono de instalar <b>⊕</b> en la barra de direcciones y toca <b>“Instalar”</b>.</p>
      <p class="muted">Si usas <b>Safari</b>: abre el menú <b>Archivo</b> → <b>“Agregar al Dock…”</b> (Safari 17 o más reciente). En versiones anteriores de Safari esta opción no existe; usa Chrome o Edge para instalarla.</p>
      <p class="muted">Listo. Quedará como una app más, con su propio ícono en el Dock.</p>
    `;
  }
  return `
    <p class="muted">Busca el ícono de instalar <b>⊕</b> en la barra de direcciones del navegador (Chrome o Edge), o abre el menú del navegador y busca <b>“Instalar ASIS PLUS”</b>.</p>
  `;
}
