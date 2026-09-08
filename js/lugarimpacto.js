/**
 * lugarimpacto.js
 * Selector de "Lugar de Impacto" (Campo 8.9 del IPAT, Resolución 0011268 de
 * 2012 del Ministerio de Transporte): tipo de vehículo + vista (frontal,
 * lateral, posterior) + tercio donde ocurrió el impacto. Es un campo aparte
 * del croquis libre (js/croquis.js), que sigue existiendo tal cual.
 * Se guarda como un texto legible en caso.datos['LUGAR DE IMPACTO'].
 */

const TIPOS_IMPACTO = [
  { clave: 'MOTO', emoji: '🏍️', nombre: 'Bicicleta / Moto' },
  { clave: 'AUTOMOVIL', emoji: '🚗', nombre: 'Automóvil' },
  { clave: 'BUS', emoji: '🚌', nombre: 'Bus' },
  { clave: 'CAMION', emoji: '🚚', nombre: 'Camión' },
  { clave: 'TRACTOCAMION', emoji: '🚛', nombre: 'Tractocamión' },
  { clave: 'OTRO', emoji: '❓', nombre: 'Otro' }
];

/**
 * Etiquetas de los tercios (vocabulario del Campo 8.9 del IPAT), ORDENADAS DE
 * IZQUIERDA A DERECHA DE LA PANTALLA.
 *
 * CUIDADO CON EL ESPEJO. El manual del IPAT rotula su vista frontal como
 * "Tercio Derecho · Medio · Izquierdo", pero lo hace sobre un dibujo del
 * vehículo VISTO DE FRENTE: ahí el costado derecho del carro queda a la
 * izquierda de quien mira. Esta app no dibuja alzados: usa una sola silueta EN
 * PLANTA (desde arriba, morro hacia arriba) y solo resalta la franja de
 * adelante o la de atrás. Sobre una planta ese espejo NO existe — el conductor
 * mira hacia arriba de la pantalla, así que su derecha es la derecha de la
 * pantalla, se esté marcando el frente o la cola.
 *
 * Copiar el orden del manual tal cual dejaba el frontal invertido: el asistente
 * tocaba el costado derecho del bus y quedaba registrado como izquierdo.
 * Izquierda y derecha son SIEMPRE las del vehículo, como las ve el conductor.
 */
const TERCIOS_POR_VISTA = {
  FRONTAL: ['Tercio Izquierdo', 'Tercio Medio', 'Tercio Derecho'],
  LATERAL: ['Tercio Anterior', 'Tercio Medio', 'Tercio Posterior'],
  POSTERIOR: ['Tercio Izquierdo', 'Tercio Medio', 'Tercio Derecho']
};

// Costados del vehículo (sólo aplican a la vista lateral).
const COSTADOS = [
  { clave: 'IZQUIERDO', nombre: 'Costado izquierdo' },
  { clave: 'DERECHO', nombre: 'Costado derecho' }
];

// Estado de la selección en curso dentro del modal.
const li = { tipo: null, vista: null, costado: null, tercio: null, otroTexto: '' };

// Espacio de coordenadas común (vista en planta, morro hacia arriba) para
// las siluetas de vehículo del Campo 8.9. Todas las siluetas y zonas se
// dibujan sobre esta misma rejilla, tal como en el diagrama de la resolución.
const LI_VIEWBOX = '0 0 100 160';

// Dibujo (líneas del cuerpo) de cada silueta, en el mismo estilo de plano
// técnico del manual del IPAT: vista en planta, sin relleno de color.
const LI_SILUETAS = {
  MOTO: `
    <ellipse cx="50" cy="17" rx="13" ry="9"/>
    <rect x="44" y="9" width="12" height="142" rx="6"/>
    <line x1="27" y1="25" x2="73" y2="25"/>
    <ellipse cx="50" cy="143" rx="13" ry="9"/>
  `,
  AUTOMOVIL: `
    <rect x="14" y="8" width="72" height="144" rx="20"/>
    <rect x="24" y="44" width="52" height="60" rx="10" class="li-vidrio"/>
    <rect x="6" y="26" width="10" height="20" rx="3"/>
    <rect x="84" y="26" width="10" height="20" rx="3"/>
    <rect x="6" y="114" width="10" height="20" rx="3"/>
    <rect x="84" y="114" width="10" height="20" rx="3"/>
  `,
  BUS: `
    <rect x="10" y="6" width="80" height="148" rx="8"/>
    <rect x="18" y="15" width="64" height="16" rx="2" class="li-vidrio"/>
    <rect x="16" y="40" width="68" height="12" rx="2" class="li-ventana"/>
    <rect x="16" y="60" width="68" height="12" rx="2" class="li-ventana"/>
    <rect x="16" y="80" width="68" height="12" rx="2" class="li-ventana"/>
    <rect x="16" y="100" width="68" height="12" rx="2" class="li-ventana"/>
    <rect x="16" y="120" width="68" height="12" rx="2" class="li-ventana"/>
  `,
  CAMION: `
    <rect x="22" y="6" width="56" height="34" rx="6"/>
    <rect x="30" y="12" width="40" height="16" rx="4" class="li-vidrio"/>
    <rect x="10" y="46" width="80" height="108" rx="4"/>
  `,
  TRACTOCAMION: `
    <rect x="26" y="6" width="48" height="32" rx="6"/>
    <rect x="33" y="12" width="34" height="14" rx="3" class="li-vidrio"/>
    <line x1="18" y1="46" x2="82" y2="46" stroke-dasharray="3 3"/>
    <rect x="9" y="50" width="82" height="104" rx="4"/>
  `
};

/**
 * Devuelve las 3 zonas clicables (posición + etiqueta) según la vista, sobre
 * LI_VIEWBOX. En la vista lateral hace falta además el costado: sus tres
 * franjas se dibujan sobre esa mitad del vehículo, no cruzando todo el ancho,
 * para que se vea sobre qué lado se está marcando.
 */
function zonasImpacto(vista, costado) {
  const etiquetas = TERCIOS_POR_VISTA[vista] || [];
  if (vista === 'FRONTAL') {
    return [
      { tercio: etiquetas[0], x: 0, y: 4, w: 33.3, h: 46 },
      { tercio: etiquetas[1], x: 33.3, y: 4, w: 33.4, h: 46 },
      { tercio: etiquetas[2], x: 66.7, y: 4, w: 33.3, h: 46 }
    ];
  }
  if (vista === 'POSTERIOR') {
    return [
      { tercio: etiquetas[0], x: 0, y: 110, w: 33.3, h: 46 },
      { tercio: etiquetas[1], x: 33.3, y: 110, w: 33.4, h: 46 },
      { tercio: etiquetas[2], x: 66.7, y: 110, w: 33.3, h: 46 }
    ];
  }
  if (vista === 'LATERAL') {
    if (!costado) return []; // primero hay que decir cuál de los dos costados
    // Vista en planta: el costado izquierdo del vehículo es la mitad izquierda
    // del dibujo, el derecho la mitad derecha.
    const x = costado === 'DERECHO' ? 50 : 0;
    return [
      { tercio: etiquetas[0], x, y: 4, w: 50, h: 48.7 },
      { tercio: etiquetas[1], x, y: 52.7, w: 50, h: 48.7 },
      { tercio: etiquetas[2], x, y: 101.3, w: 50, h: 48.7 }
    ];
  }
  return [];
}

/**
 * Pinta la silueta del vehículo elegido con las 3 zonas de tercio superpuestas,
 * según la vista elegida (igual idea que el diagrama del Campo 8.9: primero se
 * elige frontal/lateral/posterior y luego se marca el tercio sobre el dibujo).
 */
function renderSiluetaTercios() {
  if (!els.liTercios) return;
  if (!li.tipo || li.tipo === 'OTRO' || !li.vista || !LI_SILUETAS[li.tipo]) {
    els.liTercios.innerHTML = '';
    return;
  }

  // Selector de costado: sólo tiene sentido en la vista lateral, y va aquí
  // pegado al dibujo (no como un paso aparte) porque es parte de señalar dónde
  // fue el golpe.
  const costadoHtml = li.vista !== 'LATERAL' ? '' : `
    <div class="li-costados">
      <span class="li-costados-tit">¿Cuál costado?</span>
      <div class="li-vistas">
        ${COSTADOS.map(c => `
          <button type="button" class="secondary li-tool${li.costado === c.clave ? ' active' : ''}" data-costado="${c.clave}">${c.nombre}</button>
        `).join('')}
      </div>
    </div>
  `;

  const zonas = zonasImpacto(li.vista, li.costado);
  const zonasSvg = zonas.map(z => `
    <g>
      <rect class="li-tool li-zona" data-tercio="${z.tercio}" x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}"></rect>
      <text class="li-zona-label" x="${z.x + z.w / 2}" y="${z.y + z.h / 2}" text-anchor="middle" dominant-baseline="middle">${z.tercio.replace('Tercio ', '')}</text>
    </g>
  `).join('');

  // Lateral sin costado elegido: se pide primero, sin dibujo que confunda.
  const ayudaZonas = (li.vista === 'LATERAL' && !li.costado)
    ? '<p class="li-silueta-ayuda muted">Elige primero de qué costado fue el impacto.</p>'
    : `<p class="li-silueta-ayuda muted">
        El vehículo se ve <b>desde arriba</b>. Toca la zona donde ocurrió el impacto.
        <br><b>Izquierda y derecha son las del vehículo</b>, como las ve el conductor sentado al volante.
      </p>`;

  els.liTercios.innerHTML = costadoHtml + `
    <div class="li-orientacion li-orient-frente">▲ FRENTE del vehículo</div>
    <div class="li-silueta-fila">
      <span class="li-orientacion li-orient-lado">Costado<br>izquierdo</span>
      <div class="li-silueta-wrap">
        <svg viewBox="${LI_VIEWBOX}" class="li-silueta" aria-label="Silueta del vehículo vista desde arriba, con el frente hacia arriba">
          <g class="li-carroceria">${LI_SILUETAS[li.tipo]}</g>
          ${zonasSvg}
        </svg>
      </div>
      <span class="li-orientacion li-orient-lado">Costado<br>derecho</span>
    </div>
    <div class="li-orientacion li-orient-cola">▼ PARTE TRASERA</div>
  ` + ayudaZonas;

  if (li.tercio) {
    const zonaActiva = els.liTercios.querySelector(`.li-zona[data-tercio="${li.tercio}"]`);
    if (zonaActiva) zonaActiva.classList.add('active');
  }
}

/** Arma la grilla de tipos de vehículo y engancha los clics internos del modal. */
function initLugarImpacto() {
  if (!els.liTipos) return;

  els.liTipos.innerHTML = '';
  TIPOS_IMPACTO.forEach(t => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'croquis-icono li-tipo';
    b.dataset.tipo = t.clave;
    b.innerHTML = `<span>${t.emoji}</span><small>${t.nombre}</small>`;
    b.addEventListener('click', () => seleccionarTipoImpacto(t.clave));
    els.liTipos.appendChild(b);
  });

  els.liVistas.querySelectorAll('.li-tool').forEach(btn => {
    btn.addEventListener('click', () => seleccionarVistaImpacto(btn.dataset.vista));
  });

  // Los botones de tercio se crean dinámicamente según la vista: un solo
  // listener delegado sobre el contenedor los cubre a todos.
  els.liTercios.addEventListener('click', event => {
    // El costado se revisa primero: sus botones también son `.li-tool`.
    const btnCostado = event.target.closest('[data-costado]');
    if (btnCostado) { seleccionarCostadoImpacto(btnCostado.dataset.costado); return; }

    const btn = event.target.closest('.li-tool[data-tercio]');
    if (!btn) return;
    li.tercio = btn.dataset.tercio;
    els.liTercios.querySelectorAll('.li-zona').forEach(b => b.classList.toggle('active', b === btn));
  });

  if (els.liOtroTexto) {
    els.liOtroTexto.addEventListener('input', () => { li.otroTexto = els.liOtroTexto.value; });
  }
}

function seleccionarTipoImpacto(clave) {
  li.tipo = clave;
  els.liTipos.querySelectorAll('.li-tipo').forEach(b => b.classList.toggle('active', b.dataset.tipo === clave));

  const esOtro = clave === 'OTRO';
  els.liOtroTexto.classList.toggle('hidden', !esOtro);
  els.liTercios.classList.toggle('hidden', esOtro || !li.vista);
  renderSiluetaTercios();
}

/** Elige el costado (vista lateral) y redibuja las franjas sobre ese lado. */
function seleccionarCostadoImpacto(costado) {
  li.costado = costado;
  li.tercio = null; // el tercio pertenece a un costado concreto
  renderSiluetaTercios();
}

function seleccionarVistaImpacto(vista) {
  li.vista = vista;
  li.tercio = null;
  // El costado sólo vive dentro de la vista lateral.
  li.costado = null;
  els.liVistas.querySelectorAll('.li-tool').forEach(b => b.classList.toggle('active', b.dataset.vista === vista));

  const esOtro = li.tipo === 'OTRO';
  els.liTercios.classList.toggle('hidden', esOtro);
  renderSiluetaTercios();
}

/** Abre el selector, precargando la selección guardada si ya existe. */
function abrirLugarImpacto() {
  const caso = state.casoActual;
  if (!caso) return;

  li.tipo = null; li.vista = null; li.costado = null; li.tercio = null; li.otroTexto = '';
  els.liTipos.querySelectorAll('.li-tipo').forEach(b => b.classList.remove('active'));
  els.liVistas.querySelectorAll('.li-tool').forEach(b => b.classList.remove('active'));
  els.liTercios.innerHTML = '';
  els.liTercios.classList.add('hidden');
  els.liOtroTexto.classList.add('hidden');
  els.liOtroTexto.value = '';

  const guardado = (caso.datos && caso.datos['LUGAR DE IMPACTO']) || '';
  const partes = guardado.split(' · ');
  const tipoGuardado = TIPOS_IMPACTO.find(t => t.nombre === partes[0]);
  if (tipoGuardado) {
    seleccionarTipoImpacto(tipoGuardado.clave);
    if (tipoGuardado.clave === 'OTRO') {
      els.liOtroTexto.value = partes.slice(1).join(' · ');
      li.otroTexto = els.liOtroTexto.value;
    } else if (partes[1]) {
      seleccionarVistaImpacto(partes[1].toUpperCase());
      // Los registros anteriores traen 3 partes (sin costado); los nuevos, 4.
      let idxTercio = 2;
      if (partes[2] && partes[2].indexOf('Costado') === 0) {
        const c = COSTADOS.find(x => x.nombre === partes[2]);
        if (c) seleccionarCostadoImpacto(c.clave);
        idxTercio = 3;
      }
      const tercio = partes[idxTercio];
      if (tercio) {
        const zonaTercio = els.liTercios.querySelector(`.li-zona[data-tercio="${tercio}"]`);
        if (zonaTercio) { li.tercio = tercio; zonaTercio.classList.add('active'); }
      }
    }
  }

  els.lugarImpactoModal.classList.add('show');
}

function cerrarLugarImpacto() {
  els.lugarImpactoModal.classList.remove('show');
}

/** Arma el texto legible y lo guarda en caso.datos, igual que hace el croquis. */
async function guardarLugarImpacto() {
  const caso = state.casoActual;
  if (!caso) return;

  const tipo = TIPOS_IMPACTO.find(t => t.clave === li.tipo);
  if (!tipo) { showStatus('Elige el tipo de vehículo.', 'error'); return; }

  let texto;
  if (tipo.clave === 'OTRO') {
    if (!li.otroTexto.trim()) { showStatus('Describe el vehículo y el lugar del impacto.', 'error'); return; }
    texto = `${tipo.nombre} · ${li.otroTexto.trim()}`;
  } else {
    if (!li.vista) { showStatus('Elige la vista del impacto.', 'error'); return; }
    if (li.vista === 'LATERAL' && !li.costado) {
      showStatus('Indica de qué costado fue el impacto.', 'error'); return;
    }
    if (!li.tercio) { showStatus('Elige el tercio donde ocurrió el impacto.', 'error'); return; }
    const vistaLegible = li.vista.charAt(0) + li.vista.slice(1).toLowerCase();
    const costado = COSTADOS.find(c => c.clave === li.costado);
    // El costado va como una parte propia (no pegado a "Lateral") para que los
    // registros anteriores, de tres partes, se sigan leyendo igual.
    texto = costado
      ? `${tipo.nombre} · ${vistaLegible} · ${costado.nombre} · ${li.tercio}`
      : `${tipo.nombre} · ${vistaLegible} · ${li.tercio}`;
  }

  try {
    showLoader(true);
    if (!caso.datos) caso.datos = {};
    caso.datos['LUGAR DE IMPACTO'] = texto;
    let encolado = false;
    if (typeof persistirDatosCaso === 'function') {
      const per = await persistirDatosCaso(caso, datos => { datos['LUGAR DE IMPACTO'] = texto; });
      if (per && per.encolado) encolado = true;
    } else {
      const { error } = await db.from('registro_asistencias')
        .update({ datos: caso.datos }).eq('numero_caso', caso.numero_caso);
      if (error) throw error;
    }
    cerrarLugarImpacto();
    cargarLugarImpactoCaso(caso);
    showStatus(encolado
      ? 'Lugar de impacto guardado en el dispositivo. Se subirá al reconectar.'
      : 'Lugar de impacto guardado.', encolado ? 'info' : 'ok');
  } catch (error) {
    showStatus('Error al guardar el lugar de impacto: ' + (error.message || error), 'error');
  } finally {
    showLoader(false);
  }
}

/** Muestra la vista previa (texto) en el detalle del caso. */
function cargarLugarImpactoCaso(caso) {
  if (!els.lugarImpactoPreview) return;
  const texto = caso.datos && caso.datos['LUGAR DE IMPACTO'];
  els.lugarImpactoPreview.textContent = texto || 'Sin registrar';
}

/** Habilita o bloquea el botón (según el check-in), igual que el croquis. */
function habilitarLugarImpacto(on) {
  if (els.btnAbrirLugarImpacto) els.btnAbrirLugarImpacto.disabled = !on;
}
