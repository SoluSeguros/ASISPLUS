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
 *
 * Si el cambio solo le sirve a algunos roles (por ejemplo, algo del portal de
 * empresa), ponle `roles: ['empresa', 'admin']` a la entrada y solo esos lo
 * verán. Sin `roles`, la novedad es para todos. Existe para no interrumpir al
 * asistente en la vía con un aviso sobre una pantalla que él no abre.
 */

const NOVEDADES_KEY = 'asisplus-novedades-vista';

// De la más nueva a la más vieja.
const NOVEDADES = [
  {
    version: '2.21.0',
    titulo: 'Los documentos dicen qué son, y aparecen los acuerdos',
    puntos: [
      {
        icono: '📄',
        titulo: 'Cada adjunto dice qué es y de cuándo',
        texto: 'Antes salía sólo el nombre del archivo («DESISTIMIENTO (10).pdf»). Ahora cada documento dice <b>qué clase de documento es</b> —desistimiento, declaración, IPAT, historia clínica…—, de qué tipo de archivo se trata y <b>la fecha en que se subió</b>.'
      },
      {
        icono: '🤝',
        titulo: 'Acuerdos firmados del caso',
        texto: 'Si del siniestro salió un acuerdo, ahora se ve en el detalle: <b>de qué tipo es, con quién se acordó, por cuánto, cómo se paga y quién firmó</b>, con el PDF a un clic. Antes el desistimiento aparecía suelto entre los adjuntos, sin decir de qué acuerdo salía, y esa información sólo se veía dentro del flujo de cierre.'
      },
      {
        icono: '🔖',
        titulo: 'El número de caso en el visor',
        texto: 'El Registro de Asistencias no mostraba el número del caso al abrir el detalle. Ahora encabeza la ficha.'
      }
    ]
  },
  {
    version: '2.20.1',
    titulo: 'Reclamaciones y Seguridad Vial ven todos los casos',
    roles: ['seguridad_vial', 'reclamaciones', 'admin'],
    puntos: [
      {
        icono: '🔎',
        titulo: 'El registro completo, además de tu bandeja',
        texto: 'Tu bandeja sigue mostrando lo que te toca atender. Pero ahora tienes también el <b>Registro de Asistencias</b> y <b>Terceros</b> en el inicio: cualquier siniestro, con toda su información (versiones, fotos, documentos y terceros). Para revisar antecedentes de un conductor o un tercero que ya apareció antes, ya no hay que pedirlo.'
      }
    ]
  },
  {
    version: '2.20.0',
    titulo: 'Las versiones, como se deben leer (y oír)',
    puntos: [
      {
        icono: '🗣️',
        titulo: 'La versión del conductor y la del asistente, destacadas',
        texto: 'Son lo que más se lee de un caso, y estaban apretadas en una columna estrecha como un dato más. Ahora ocupan el ancho del detalle, con el relato completo y respetando los saltos de línea.'
      },
      {
        icono: '🔊',
        titulo: 'Las versiones grabadas por fin se pueden oír',
        texto: 'El asistente puede <b>dictar</b> la versión en vez de escribirla. Hasta ahora, en el detalle salía el nombre del archivo: el caso parecía <b>no tener versión</b>. Ahora hay un reproductor ahí mismo, con una etiqueta que avisa si la versión está grabada.'
      },
      {
        icono: '🏢',
        titulo: 'También para la empresa',
        texto: 'El portal de empresa usa la misma pieza que la administración, así que las empresas ven el relato completo y oyen las grabaciones de sus propios casos.'
      }
    ]
  },
  {
    version: '2.19.0',
    titulo: 'La app se actualiza sola',
    puntos: [
      {
        icono: '🔄',
        titulo: 'Ya no hay que recargar a mano',
        texto: 'Antes la app solo miraba si había versión nueva <b>al abrirla</b>. Como se queda abierta todo el día, una mejora podía tardar días en llegarte. Ahora revisa cada pocos minutos y al volver a la pestaña, y se actualiza sola.'
      },
      {
        icono: '🛡️',
        titulo: 'Pero nunca en medio de tu trabajo',
        texto: 'Si estás llenando un caso, subiendo fotos o te quedan cambios por sincronizar, <b>no se recarga</b>: espera a que termines. Solo entonces entra la versión nueva. Si prefieres aplicarla de una, el aviso de siempre sigue ahí.'
      },
      {
        icono: '📄',
        titulo: 'Los datos del caso se leen mejor',
        texto: 'Las horas de llegada y de fin de atención se ven como fecha y no como un número largo, las notificaciones dicen qué se notificó, y <b>los documentos adjuntos ahora se abren</b> con un clic en vez de mostrar un texto ilegible.'
      }
    ]
  },
  {
    version: '2.18.9',
    titulo: 'La empresa ve el caso entero',
    roles: ['empresa', 'admin', 'gestor'],
    puntos: [
      {
        icono: '📋',
        titulo: 'Todos los campos, no una selección',
        texto: 'El detalle mostraba diez campos escogidos a mano. Ahora trae <b>todo lo registrado</b>: la versión del conductor, la hipótesis, la categorización, los lesionados, las observaciones y lo que venga. Si mañana se agrega un campo nuevo, aparece solo.'
      },
      {
        icono: '👥',
        titulo: 'Los terceros involucrados',
        texto: 'Con su ficha completa y su evidencia: cédula, licencia, matrícula y los daños de su vehículo.'
      },
      {
        icono: '🗺️',
        titulo: 'Y el mapa del lugar',
        texto: 'Si el caso tiene coordenadas, se ve dónde pasó y se puede abrir en Google Maps.'
      }
    ]
  },
  {
    version: '2.18.8',
    titulo: 'Un usuario puede tener varias empresas',
    roles: ['admin', 'empresa'],
    puntos: [
      {
        icono: '🏢',
        titulo: 'Porque un vehículo no siempre está a nombre de quien lo opera',
        texto: 'COOMETROPOL tiene <b>11 siniestros</b> con placas que en el parque figuran a nombre de COOINVETRANS, TRANSLAMAYA GUAYABAL, INVETRANS y TRANSCONOR. Su usuario no los veía, porque el vínculo era con <b>una sola</b> empresa.'
      },
      {
        icono: '☑️',
        titulo: 'Se eligen desde el panel de usuarios',
        texto: 'En la columna <b>Empresa</b> de cada usuario hay un botón para marcar todas las que debe ver. La principal aparece resaltada y se sigue cambiando desde la columna «Rol».'
      },
      {
        icono: '🔒',
        titulo: 'Cada empresa sigue viendo solo lo suyo',
        texto: 'El permiso no se abrió: solo dejó de limitarse a un nombre. Un usuario ve los casos, vehículos y terceros de <b>las empresas que tenga marcadas</b>, ni una más.'
      }
    ]
  },
  {
    version: '2.18.7',
    titulo: 'La empresa ve su caso completo',
    roles: ['empresa', 'admin', 'gestor'],
    puntos: [
      {
        icono: '📸',
        titulo: 'Con las fotos y las firmas',
        texto: 'Al abrir un caso desde el portal ya no se ve solo texto: aparecen <b>las fotos del siniestro</b>, la firma del conductor y la del asistente, y la ficha de cada tercero con su evidencia. Es la misma información que ve la administración.'
      },
      {
        icono: '🔽',
        titulo: 'Filtros por año, gravedad y estado',
        texto: 'Además del buscador, tres selectores para acotar el historial. Se suman entre sí y con lo que escribas: <b>2025 + Daños y lesiones</b> deja solo esos. Solo aparecen los valores que la empresa realmente tiene, para que ningún filtro lleve a una lista vacía.'
      },
      {
        icono: '🧹',
        titulo: 'Un botón para volver a empezar',
        texto: 'Cuando hay algo acotando la lista aparece <b>«Limpiar filtros»</b>, y el contador va diciendo cuántos casos se están viendo de cuántos.'
      }
    ]
  },
  {
    version: '2.18.6',
    titulo: 'Las fotos también en el visor de registros',
    roles: ['admin', 'gestor'],
    puntos: [
      {
        icono: '🖼️',
        titulo: 'Al abrir un registro ahora se ven las imágenes',
        texto: 'El visor de «Registro de asistencias» mostraba solo texto: las fotos y las firmas estaban escondidas porque antes no había archivo que mostrar, únicamente su nombre. Ahora aparecen como <b>miniaturas</b>, y al tocarlas se abren en grande.'
      },
      {
        icono: '🧾',
        titulo: 'Las del siniestro y las de cada tercero, por separado',
        texto: 'Arriba, lo que fotografió el asistente del vehículo asegurado, con la firma del conductor y la suya. Abajo, dentro de la ficha de cada tercero, su cédula, licencia, matrícula y los daños de su vehículo.'
      }
    ]
  },
  {
    version: '2.18.5',
    titulo: 'Ya se pueden buscar los casos',
    roles: ['empresa', 'admin', 'gestor', 'asistente', 'seguridad_vial'],
    puntos: [
      {
        icono: '🔍',
        titulo: 'Un buscador en la bandeja y en el historial',
        texto: 'Escribe lo que recuerdes y la lista se va filtrando: <b>número de caso</b>, <b>empresa</b>, <b>placa</b>, <b>número interno</b>, <b>conductor</b>, <b>cédula</b>, <b>dirección</b> o <b>fecha</b>. No hace falta acertar con las tildes ni con las mayúsculas.'
      },
      {
        icono: '➕',
        titulo: 'Varias palabras afinan la búsqueda',
        texto: 'Si escribes más de una, deben aparecer todas. <b>«cootranspinal 2026»</b> trae los de esa empresa en ese año; <b>«TSG045 lesiones»</b>, los de esa placa que dejaron heridos. El orden da igual.'
      },
      {
        icono: '🗄️',
        titulo: 'Los casos antiguos también, si los pides',
        texto: 'La bandeja sigue mostrando el trabajo del día. Para llegar a los 2.707 casos importados, marca <b>«Buscar también en históricos»</b> y busca: se traen una sola vez y quedan listos.'
      }
    ]
  },
  {
    version: '2.18.4',
    titulo: 'Los casos viejos ya tienen sus fotos',
    roles: ['admin', 'gestor'],
    puntos: [
      {
        icono: '📷',
        titulo: 'Se ven las fotos de los casos importados',
        texto: 'Los casos que venían del aplicativo anterior guardaban el <b>nombre</b> de cada foto, pero la imagen no estaba: al abrirlos no había nada que ver. Ya se subieron las <b>36.503</b> imágenes y ahora la galería las muestra como las de cualquier caso.'
      },
      {
        icono: '✍️',
        titulo: 'También las firmas y las fotos del tercero',
        texto: 'Vuelven a aparecer la firma del conductor y la del asistente, y la evidencia del tercero: cédula, licencia, matrícula y los daños de su vehículo.'
      },
      {
        icono: '🗂️',
        titulo: 'Quedaron todos, sin excepción',
        texto: 'Se comprobó uno por uno contra la base: los <b>2.596 casos</b> y los <b>2.191 terceros</b> que tenían evidencia registrada la tienen completa. Ninguno se quedó sin imagen.'
      }
    ]
  },
  {
    version: '2.18.3',
    titulo: 'El historial, más fácil de leer',
    roles: ['empresa', 'admin', 'gestor'],
    puntos: [
      {
        icono: '🟩',
        titulo: 'Una franja de color dice qué tan grave fue',
        texto: 'Cada caso lleva una barra a la izquierda: <b>verde</b> si fue solo daños, <b>naranja</b> si hubo lesiones, <b>rojo</b> si hubo homicidio. Se puede recorrer la lista entera y ver dónde está lo grave sin leer una palabra.'
      },
      {
        icono: '🗓️',
        titulo: 'Cada caso es una tarjeta, no una fila de tabla',
        texto: 'La tabla se estiraba a lo ancho y separaba datos que van juntos: la placa quedaba lejísimos de su conductor. Ahora cada caso agrupa <b>cuándo fue</b>, <b>qué vehículo y quién manejaba</b>, y <b>cómo resultó</b>.'
      },
      {
        icono: '📅',
        titulo: 'La fecha se ve de un vistazo',
        texto: 'Va en un bloque tipo calendario, con el día grande y el mes debajo. La hora y el número de caso pasan a segundo plano: sirven para citar el caso, no para buscarlo.'
      }
    ]
  },
  {
    version: '2.18.2',
    titulo: 'El historial de casos, legible',
    roles: ['empresa', 'admin', 'gestor'],
    puntos: [
      {
        icono: '🔢',
        titulo: 'Los casos viejos ya tienen número',
        texto: 'Los siniestros anteriores al sistema actual salían con un guion en la columna del número, porque nunca lo tuvieron. Ahora llevan uno propio, tipo <b>H-2025-1440</b>, y se puede citar por teléfono o por correo. Los de la app siguen siendo <b>CASO-2026-…</b>, para saber de dónde viene cada uno.'
      },
      {
        icono: '🔽',
        titulo: 'El más reciente va primero',
        texto: 'El listado salía desordenado. La culpa era de ordenar por la fecha en que el caso entró al sistema: los históricos se cargaron todos el mismo día, así que esa fecha no distingue nada. Ahora se ordena por la <b>fecha real del siniestro</b>.'
      },
      {
        icono: '📅',
        titulo: 'Fechas como se leen aquí',
        texto: 'Se veían como 9/1/2026, que se presta a confusión. Ahora salen <b>dd/mm/aaaa</b>, con la hora debajo.'
      },
      {
        icono: '👁️',
        titulo: 'Más información en menos espacio',
        texto: 'La tabla tenía columnas anchas y casi vacías. Ahora cada caso muestra también el <b>conductor</b>, el número interno y el tipo de vehículo, sin ocupar más. En el celular cada caso se ve como una tarjeta.'
      }
    ]
  },
  {
    version: '2.18.1',
    titulo: 'Ver el portal de cualquier empresa',
    roles: ['admin', 'gestor'],
    puntos: [
      {
        icono: '👁️',
        titulo: 'Entra al portal tal como lo ve la empresa',
        texto: 'En <b>Dashboard → Ficha por empresa</b>, el botón <b>«Ver su portal completo»</b> abre la pantalla que ve esa empresa: sus métricas, su historial de casos y su parque. No es una imitación, es la misma pantalla.'
      },
      {
        icono: '📄',
        titulo: 'El historial ahora va por páginas',
        texto: 'Antes se dibujaban todos los casos de golpe. Con empresas de 400 o más eso hacía pesada la pantalla en el celular; ahora van de 50 en 50.'
      },
      {
        icono: '🔢',
        titulo: 'Y se traen completos',
        texto: 'La consulta no pedía más de 1.000 casos, así que una empresa grande habría quedado contada de menos <b>sin avisar</b>. Ya se traen todos.'
      }
    ]
  },
  {
    version: '2.18.0',
    titulo: 'Ficha de siniestralidad por empresa',
    roles: ['empresa', 'admin', 'gestor'],
    puntos: [
      {
        icono: '📊',
        titulo: 'La empresa ya no ve solo una barra por mes',
        texto: 'El portal abre con una <b>ficha completa</b>: cuántos siniestros hubo, si subieron o bajaron frente al periodo anterior, qué tan graves fueron y cuántos fueron responsabilidad del conductor.'
      },
      {
        icono: '⚖️',
        titulo: 'Siniestros por cada 100 vehículos',
        texto: 'Contar casos sueltos hace ver mal a quien tiene más buses. Ahora se mide <b>descontando el tamaño de la flota</b>, que es lo único comparable entre una empresa de 30 vehículos y una de 600.'
      },
      {
        icono: '🚌',
        titulo: 'Qué vehículos y qué conductores repiten',
        texto: 'Dos listas nuevas muestran las placas y los conductores con más siniestros en el periodo. Es lo accionable: revisar ese bus, sentarse con ese conductor.'
      },
      {
        icono: '🕐',
        titulo: 'A qué hora y qué día pasan',
        texto: 'La ficha señala la <b>franja horaria</b> y el <b>día de la semana</b> donde se concentran los siniestros, para ajustar turnos y despachos.'
      },
      {
        icono: '🏢',
        titulo: 'SoluAsistencia ve la misma ficha',
        texto: 'En el Dashboard hay una pestaña <b>Ficha por empresa</b> con exactamente la misma pantalla que ve la empresa, más un comparativo de siniestralidad entre todas. La reunión mensual se hace sobre los mismos números.'
      }
    ]
  },
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
  // Se filtra por rol ANTES de recortar: a quien recién instala hay que
  // mostrarle la última novedad que le sirva A ÉL, no la última de todas
  // (si esa fuera de otro rol, se quedaría sin ver ninguna).
  const mias = NOVEDADES.filter(esParaMiRol);
  if (!vista) return mias.slice(0, 1);
  return mias.filter(n => compararVersiones(n.version, vista) > 0);
}

/** ¿Esta novedad le toca al rol de quien está usando la app ahora? */
function esParaMiRol(n) {
  if (!n.roles || !n.roles.length) return true;   // sin destinatario = para todos
  const rol = (typeof state !== 'undefined' && state.perfil && state.perfil.rol) || '';
  return n.roles.includes(rol);
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
    ver.addEventListener('click', () => {
      const mias = NOVEDADES.filter(esParaMiRol);
      abrirNovedades(mias.slice(0, 1));
    });
  }
}

document.addEventListener('DOMContentLoaded', initNovedadesUI);
