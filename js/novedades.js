/**
 * novedades.js
 * Aviso de "qué cambió" para el asistente cuando la app se actualiza.
 *
 * El asistente trabaja en la vía y la app se actualiza sola: si algo cambia de
 * sitio o de comportamiento, se entera en el peor momento posible. Este modal
 * se abre UNA vez por versión nueva y le cuenta, en su idioma, qué cambió y qué
 * tiene que revisar.
 *
 * Cómo agregar novedades al publicar una versión: añade una entrada NUEVA al
 * principio de NOVEDADES con la versión de js/version.js. Si una versión no
 * cambia nada que el asistente note (un arreglo interno, por ejemplo), NO la
 * agregues: el aviso pierde su valor si aparece por cosas que no le importan.
 */

const NOVEDADES_KEY = 'asisplus-novedades-vista';

// De la más nueva a la más vieja.
const NOVEDADES = [
  {
    version: '2.17.5',
    titulo: 'Lugar de impacto (IPAT)',
    puntos: [
      {
        icono: '↔️',
        titulo: 'Derecha e izquierda estaban al revés',
        texto: 'En la vista <b>frontal</b>, lo que decía «derecho» era en realidad el costado izquierdo del vehículo. Ya está corregido.'
      },
      {
        icono: '🧭',
        titulo: 'El dibujo ahora te dice cómo está puesto',
        texto: 'El vehículo se ve <b>desde arriba</b>, con el frente hacia arriba. Alrededor del dibujo aparece dónde está el frente, la parte trasera y cada costado. <b>Izquierda y derecha son las del vehículo</b>, como las ve el conductor sentado al volante.'
      },
      {
        icono: '🚌',
        titulo: 'Impacto lateral: ahora se dice de qué costado',
        texto: 'Al elegir <b>Lateral</b> te pregunta si fue el costado izquierdo o el derecho, y las tres franjas se dibujan sobre ese lado.'
      }
    ],
    aviso: 'Si antes de hoy registraste un impacto <b>frontal</b> señalando un costado, revísalo: pudo quedar guardado al revés.'
  },
  {
    version: '2.17.3',
    titulo: 'Grabación de voz',
    puntos: [
      {
        icono: '🔆',
        titulo: 'La pantalla ya no se apaga mientras grabas',
        texto: 'Antes, si el conductor hablaba un rato y nadie tocaba el teléfono, la pantalla se apagaba y la grabación se cortaba a mitad de frase. Ya no pasa.'
      },
      {
        icono: '📱',
        titulo: 'Salirte de la app ya no corta la grabación',
        texto: 'Si te entra una llamada o cambias de aplicación un momento, la grabación sigue.'
      }
    ]
  },
  {
    version: '2.17.0',
    titulo: 'Nada se pierde si te sales',
    puntos: [
      {
        icono: '🎙️',
        titulo: 'La voz se guarda al pulsar «Detener»',
        texto: 'No hay que esperar a «Guardar cambios». Sin señal queda en el teléfono y sube sola al reconectar.'
      },
      {
        icono: '✍️',
        titulo: 'La firma se guarda al levantar el dedo',
        texto: 'Ya no hay que perseguir al conductor para que vuelva a firmar.'
      },
      {
        icono: '💾',
        titulo: 'Lo que escribes se guarda solo',
        texto: 'Mientras llenas el caso se va guardando, incluso sin señal. Si la app se cierra, al volver a abrir el caso lo recuperas.'
      }
    ]
  }
];

/** Compara dos versiones tipo "2.17.5". Devuelve >0 si a es más nueva que b. */
function compararVersiones(a, b) {
  const pa = String(a || '0').split('.').map(Number);
  const pb = String(b || '0').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/**
 * Novedades que este dispositivo aún no ha visto. La primera vez sólo se
 * muestra la última: a quien recién instala la app no le sirve el historial.
 */
function novedadesPendientes() {
  let vista = '';
  try { vista = localStorage.getItem(NOVEDADES_KEY) || ''; } catch (_) { return []; }
  if (!vista) return NOVEDADES.slice(0, 1);
  return NOVEDADES.filter(n => compararVersiones(n.version, vista) > 0);
}

/** Deja constancia de que ya se leyeron, para no repetir el aviso. */
function marcarNovedadesVistas() {
  try { localStorage.setItem(NOVEDADES_KEY, APP_VERSION); } catch (_) { /* modo privado */ }
}

function escNov(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Arma el contenido del modal a partir de una lista de versiones. */
function pintarNovedades(lista) {
  const cuerpo = document.getElementById('novedadesBody');
  if (!cuerpo) return;

  // El texto de cada punto lleva <b> a propósito (lo escribimos nosotros, no
  // viene de la base): sólo se escapan el título y la versión.
  cuerpo.innerHTML = lista.map(n => `
    <section class="nov-version">
      <div class="nov-version-cab">
        <h3>${escNov(n.titulo)}</h3>
        <span class="nov-tag">v${escNov(n.version)}</span>
      </div>
      <ul class="nov-lista">
        ${n.puntos.map(p => `
          <li class="nov-punto">
            <span class="nov-icono" aria-hidden="true">${p.icono}</span>
            <div>
              <b>${escNov(p.titulo)}</b>
              <p>${p.texto}</p>
            </div>
          </li>
        `).join('')}
      </ul>
      ${n.aviso ? `<p class="nov-aviso">⚠️ ${n.aviso}</p>` : ''}
    </section>
  `).join('');
}

function abrirNovedades(lista) {
  const modal = document.getElementById('novedadesModal');
  if (!modal) return;
  pintarNovedades(lista && lista.length ? lista : NOVEDADES.slice(0, 1));
  modal.classList.add('show');
}

function cerrarNovedades() {
  const modal = document.getElementById('novedadesModal');
  if (modal) modal.classList.remove('show');
  marcarNovedadesVistas();
}

/**
 * Muestra el aviso si hay algo nuevo. Se llama al entrar a la app (no en la
 * pantalla de inicio de sesión: allí no hay a quién contárselo).
 */
function initNovedades() {
  const pendientes = novedadesPendientes();
  if (!pendientes.length) return;
  // Un respiro para que el aviso no compita con la carga de la bandeja.
  setTimeout(() => abrirNovedades(pendientes), 900);
}

/** Engancha el botón de cerrar y el número de versión del encabezado. */
function initNovedadesUI() {
  ['btnNovedadesCerrar', 'btnNovedadesCerrarX'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', cerrarNovedades);
  });

  const modal = document.getElementById('novedadesModal');
  if (modal) {
    modal.addEventListener('click', ev => { if (ev.target === modal) cerrarNovedades(); });
  }

  // Tocar la versión del encabezado vuelve a mostrar las novedades: si el
  // asistente cerró el aviso sin leerlo, puede volver a él.
  const ver = document.getElementById('appVersion');
  if (ver) {
    ver.classList.add('app-version-link');
    ver.title = 'Ver qué cambió en esta versión';
    ver.addEventListener('click', () => abrirNovedades(NOVEDADES.slice(0, 1)));
  }
}

document.addEventListener('DOMContentLoaded', initNovedadesUI);
