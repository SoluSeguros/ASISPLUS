/**
 * terceros.js
 * Registro COMPLETO de un tercero involucrado (campos de la hoja TERCEROS):
 * datos personales, lesiones, vehículo, evidencia fotográfica (cédula, licencia,
 * matrícula y daños), conciliación, consentimiento y firmas. Las fotos y firmas
 * se marcan con agua (fotos) y se suben a Storage (bucket fotos-casos); todo se
 * guarda como una fila de registro_terceros (JSONB) vinculada por KEY.
 */

// Campos de foto del tercero (columna exacta del CSV → etiqueta visible).
const TERCERO_FOTOS = [
  ['FOTO CEDULA PRIMERA CARA', 'Cédula · cara 1'],
  ['FOTO CEDULA SEGUNDA CARA', 'Cédula · cara 2'],
  ['LICENCIA DE CONDUCION PRIMERA CARA', 'Licencia · cara 1'],
  ['LICENCIA DE CONDUCION SEGUNDA CARA', 'Licencia · cara 2'],
  ['MATRICULA PRIMERA CARA', 'Matrícula · cara 1'],
  ['MATRICULA SEGUNDA CARA', 'Matrícula · cara 2'],
  ['FOTO VEHICULO TERCERO DAÑOS', 'Daños vehículo · 1'],
  ['FOTO VEHICULO TERCERO DAÑOS 2', 'Daños vehículo · 2'],
  ['FOTO VEHICULO TERCERO DAÑOS 3', 'Daños vehículo · 3'],
  ['FOTO VEHICULO TERCERO DAÑOS 4', 'Daños vehículo · 4'],
  ['FOTO VEHICULO TERCERO DAÑOS 5', 'Daños vehículo · 5']
];

// Firmas del tercero: se retiraron del formulario (las firmas legales se
// recogen en el módulo de contratos). Vacío = ningún pad ni subida de firma.
const TERCERO_FIRMAS = [];

// Qué muestra el formulario según el TIPO de tercero (app "inteligente"):
//   persona → datos personales (documento, contacto, condición, menor) y lesiones
//   veh     → sección de vehículo (básico: tipo/marca/color)
//   motor   → campos de vehículo a motor (placa, SOAT, RTM, aseguradora, pólizas)
// Un peatón u ocupante no tiene vehículo; un ciclista tiene "vehículo" pero sin
// placa/SOAT; un animal o un bien no es persona (ni lesiones ni documento).
const TERCERO_CATEGORIAS = {
  'OCUPANTE VEHICULO ASEGURADO': { persona: true, lesion: true },
  'OCUPANTE VEHICULO TERCERO':   { persona: true, lesion: true },
  'CONDUCTOR VEHICULO TERCERO':  { persona: true, lesion: true, veh: true, motor: true },
  'PEATON':                      { persona: true, lesion: true },
  'CICLISTA':                    { persona: true, lesion: true, veh: true, motor: false },
  'MOTOCICLISTA':                { persona: true, lesion: true, veh: true, motor: true },
  'SEMOVIENTE / ANIMAL':         { animal: true },
  'DAÑO A PROPIEDAD / INMUEBLE': { propiedad: true },
  'OTRO':                        { persona: true, lesion: true, veh: true, motor: true }
};

// Fotos libres del tercero (estilo formulario de asistencias). Cada ítem:
//   { blob, previewUrl, desc }            → foto nueva aún sin subir
//   { ruta, previewUrl, desc, existente } → foto ya guardada (modo edición)
let terceroFotosLibres = [];
// true mientras se recuperan (async) las URLs firmadas de las fotos ya guardadas
// al entrar en modo edición: evita guardar con la lista de fotos a medio poblar.
let terceroFotosCargando = false;
// Estado de cada pad de firma (col → {canvas, ctx, dibujando, hayTrazo}).
const terceroFirmas = {};
// id_registro del tercero que se está EDITANDO (null = alta de uno nuevo).
let terceroEditando = null;
// datos originales del tercero en edición (para conservar fotos/firmas no reemplazadas).
let terceroDatosOriginal = null;

/** Convierte el nombre de columna en un nombre de archivo seguro. */
function slugCampo(col) {
  return String(col).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// Etiqueta corta (con emoji) para el tipo de tercero, usada en las tarjetas.
const TERCERO_TIPO_ETIQUETA = {
  'OCUPANTE VEHICULO ASEGURADO': '🚌 Ocupante (asegurado)',
  'OCUPANTE VEHICULO TERCERO': '🚗 Ocupante (tercero)',
  'CONDUCTOR VEHICULO TERCERO': '🚗 Conductor tercero',
  'PEATON': '🚶 Peatón',
  'CICLISTA': '🚲 Ciclista',
  'MOTOCICLISTA': '🏍️ Motociclista',
  'SEMOVIENTE / ANIMAL': '🐾 Animal',
  'DAÑO A PROPIEDAD / INMUEBLE': '🏠 Propiedad',
  'OTRO': 'Otra situación'
};

/** Devuelve la etiqueta amigable del tipo de tercero (o el valor tal cual). */
function etiquetaTipoTercero(tipo) {
  return TERCERO_TIPO_ETIQUETA[String(tipo).trim().toUpperCase()] || tipo;
}

/** Inicializa el formulario de tercero: captura de fotos, firmas y envío. */
function initTerceros() {
  initFotosTercero();
  renderFotosTercero();
  construirPadsFirma();
  els.terTipo.addEventListener('change', adaptarFormTercero);
  if (els.terTieneLesion) els.terTieneLesion.addEventListener('change', adaptarLesionTercero);
  if (els.terTipoConciliacion) els.terTipoConciliacion.addEventListener('change', adaptarConciliacionTercero);
  if (els.terEsMenor) els.terEsMenor.addEventListener('change', adaptarMenorTercero);
  els.formTercero.addEventListener('submit', guardarTerceroCompleto);
  // Pregunta guía: mostrar u ocultar el formulario del tercero.
  els.btnTerceroSi.addEventListener('click', () => { limpiarFormTercero(); mostrarFormTercero(true); });
  els.btnTerceroNo.addEventListener('click', () => mostrarFormTercero(false));
  if (els.btnCancelarEdicionTercero) {
    els.btnCancelarEdicionTercero.addEventListener('click', () => {
      limpiarFormTercero();
      mostrarFormTercero(false);
    });
  }
  construirBotonesContratoForm();
  adaptarFormTercero();
  adaptarLesionTercero();
  adaptarConciliacionTercero();
  adaptarMenorTercero();
}

/** Muestra los datos del representante sólo si el tercero es menor de edad. */
function adaptarMenorTercero() {
  if (!els.terEsMenor || !els.terceroMenorCampos) return;
  els.terceroMenorCampos.classList.toggle('hidden', els.terEsMenor.value !== 'SI');
}

/**
 * Carga un tercero YA guardado en el formulario para editarlo. Las fotos y
 * firmas guardadas se conservan salvo que se vuelvan a capturar.
 */
function editarTerceroEnForm(idRegistro, datos) {
  datos = datos || {};
  terceroEditando = idRegistro;
  terceroDatosOriginal = Object.assign({}, datos);

  // Carga las fotos ya guardadas del tercero para poder verlas/quitarlas.
  cargarFotosTerceroExistentes(datos);

  // Tipo primero (adapta secciones), luego el resto de campos.
  els.terTipo.value = datos['TIPO DE TERCERO'] || '';
  adaptarFormTercero();
  els.formTercero.querySelectorAll('[data-col]').forEach(el => {
    const col = el.dataset.col;
    if (el === els.terTipo) return;
    if (el.type === 'checkbox') { el.checked = String(datos[col] || '').toUpperCase() === 'SI'; return; }
    el.value = datos[col] != null ? datos[col] : '';
  });
  adaptarLesionTercero(); // refleja si tenía lesión (muestra/oculta el tipo)
  adaptarConciliacionTercero(); // refleja si concilió (muestra/oculta detalles)
  adaptarMenorTercero(); // refleja si es menor (muestra/oculta al representante)

  // Modo edición: título, botón y aviso de evidencia.
  if (els.terceroFormTitulo) els.terceroFormTitulo.textContent = '✏️ Editar tercero';
  if (els.btnAgregarTercero) els.btnAgregarTercero.textContent = 'Guardar cambios';
  if (els.btnCancelarEdicionTercero) els.btnCancelarEdicionTercero.classList.remove('hidden');

  mostrarFormTercero(true);
  els.terceroFormWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  showStatus('Editando el tercero. Las fotos y firmas ya guardadas se conservan; vuelve a capturarlas solo si quieres reemplazarlas.', 'ok');
}

/** Sale del modo edición y restaura los textos del formulario. */
function salirModoEdicionTercero() {
  terceroEditando = null;
  terceroDatosOriginal = null;
  if (els.terceroFormTitulo) els.terceroFormTitulo.textContent = 'Agregar tercero';
  if (els.btnAgregarTercero) els.btnAgregarTercero.textContent = 'Guardar tercero';
  if (els.btnCancelarEdicionTercero) els.btnCancelarEdicionTercero.classList.add('hidden');
}

/** Muestra u oculta el formulario para agregar un tercero (flujo guiado). */
function mostrarFormTercero(mostrar) {
  els.terceroFormWrap.classList.toggle('hidden', !mostrar);
  els.btnTerceroSi.classList.toggle('active', mostrar);
  els.btnTerceroNo.classList.toggle('active', !mostrar);
  if (mostrar) {
    actualizarContratoEnForm(); // muestra el generador de contrato según el rol
    els.terNombre.focus();
  }
}

/**
 * Muestra el campo "Tipo de lesión" y lo hace obligatorio sólo si el tercero
 * tiene lesión (SI). Con NO / sin respuesta se oculta y no se exige ni guarda.
 */
function adaptarLesionTercero() {
  if (!els.terTieneLesion || !els.terTipoLesionCampo) return;
  // Si el tipo de tercero ocultó TODA la sección de lesión (animal / propiedad),
  // no hay lesión posible: nada visible ni obligatorio (un required oculto
  // bloquea el envío en silencio).
  const seccionVisible = !(els.terceroSeccionLesion && els.terceroSeccionLesion.classList.contains('hidden'));
  const tieneLesion = seccionVisible && els.terTieneLesion.value === 'SI';
  els.terTipoLesionCampo.classList.toggle('hidden', !tieneLesion);
  if (els.terTipoLesion) {
    // 'required' sólo cuando es visible (un required oculto bloquea el envío).
    els.terTipoLesion.required = tieneLesion;
    if (!tieneLesion) els.terTipoLesion.value = '';
  }
}

/**
 * El "Tipo de conciliación / contrato" es un selector que ES el contrato
 * (desistimiento / a favor / en contra / mutuo acuerdo). El dinero y el monto
 * en letras ya NO se piden aquí: se llenan en el propio contrato. Al elegir un
 * tipo aparece el botón para generarlo; con "Ninguno" se oculta.
 */
function adaptarConciliacionTercero() {
  if (!els.terTipoConciliacion) return;
  actualizarContratoEnForm();
}

/**
 * Adapta el formulario al TIPO de tercero: muestra sólo lo que aplica (la app
 * es "inteligente"). Un peatón u ocupante no ve vehículo/placa/SOAT; un ciclista
 * ve vehículo pero sin placa/SOAT/RTM; un animal o un bien no ven datos de
 * persona ni lesiones (usan su propia sección). Los campos ocultos NO se guardan.
 */
function adaptarFormTercero() {
  const tipo = els.terTipo.value;
  // Por defecto (sin elegir): tratamos como persona; sin vehículo hasta elegir.
  const cfg = TERCERO_CATEGORIAS[tipo] || { persona: true, lesion: true };
  const esAnimal = tipo === 'SEMOVIENTE / ANIMAL';
  const esProp = tipo === 'DAÑO A PROPIEDAD / INMUEBLE';
  const form = els.formTercero;

  // Secciones completas.
  els.terceroSeccionVehiculo.classList.toggle('hidden', !cfg.veh);
  els.terceroSeccionAnimal.classList.toggle('hidden', !esAnimal);
  els.terceroSeccionPropiedad.classList.toggle('hidden', !esProp);
  if (els.terceroSeccionLesion) els.terceroSeccionLesion.classList.toggle('hidden', !cfg.lesion);

  // Campos por grupo (persona / propietario del vehículo / vehículo a motor).
  form.querySelectorAll('.terc-persona').forEach(el => el.classList.toggle('hidden', !cfg.persona));
  form.querySelectorAll('.terc-vehprop').forEach(el => el.classList.toggle('hidden', !cfg.veh));
  form.querySelectorAll('.veh-motor').forEach(el => el.classList.toggle('hidden', !cfg.motor));

  // Si no es persona, oculta también los datos del representante (menor de edad).
  if (!cfg.persona && els.terceroMenorCampos) els.terceroMenorCampos.classList.add('hidden');

  // Título del vehículo según el tipo (bici / moto / carro).
  if (els.terceroVehiculoTit) {
    els.terceroVehiculoTit.textContent =
      tipo === 'CICLISTA' ? '🚲 Bicicleta del tercero'
      : tipo === 'MOTOCICLISTA' ? '🏍️ Motocicleta del tercero'
      : '🚗 Vehículo del tercero';
  }

  // Re-etiqueta el nombre según sea persona, animal o bien.
  if (esAnimal) {
    els.terceroDatosTit.textContent = '🐾 Datos del semoviente / animal';
    els.terNombre.previousElementSibling.textContent = 'Descripción (especie, raza, color) *';
  } else if (esProp) {
    els.terceroDatosTit.textContent = '🏠 Datos del bien / propiedad';
    els.terNombre.previousElementSibling.textContent = 'Descripción del bien afectado *';
  } else {
    els.terceroDatosTit.textContent = '👤 Datos del tercero';
    els.terNombre.previousElementSibling.textContent = 'Nombre completo *';
  }

  // Recalcula el estado de "Tipo de lesión" (visibilidad + required) por si el
  // nuevo tipo ocultó la sección de lesión: así no queda un required oculto que
  // bloquee el guardado en silencio.
  adaptarLesionTercero();
}

/* ---------------- Fotos (captura libre, como el formulario de asistencias) --- */

/** Cablea los botones de tomar/elegir foto del tercero (una sola vez). */
function initFotosTercero() {
  if (els.btnTerceroTomarFoto) {
    els.btnTerceroTomarFoto.addEventListener('click', async () => {
      if (!camaraDisponible()) { els.inputTerceroFoto.click(); return; }
      const res = await abrirCamara();
      if (res === 'galeria') { els.inputTerceroFoto.click(); return; }
      if (res instanceof File) procesarFotosTercero([res]);
    });
  }
  if (els.btnTerceroGaleria) {
    els.btnTerceroGaleria.addEventListener('click', () => els.inputTerceroFoto.click());
  }
  if (els.inputTerceroFoto) {
    els.inputTerceroFoto.addEventListener('change', e => {
      const archivos = [...e.target.files];
      e.target.value = '';
      procesarFotosTercero(archivos);
    });
  }
}

/** Procesa fotos nuevas del tercero: pide descripción, marca de agua y las lista. */
async function procesarFotosTercero(archivos) {
  if (!archivos || !archivos.length) return;
  const caso = state.casoActual || { datos: {} };
  try {
    showLoader(true);
    for (const file of archivos) {
      if (!file.type || !file.type.startsWith('image/')) continue;
      const desc = (window.prompt('¿Qué es esta foto? (ej: cédula frente, licencia, daño lateral):', '') || '').trim();
      const blob = await marcarAguaFoto(file, caso, desc); // reduce + marca de agua
      terceroFotosLibres.push({ blob, previewUrl: URL.createObjectURL(blob), desc });
    }
    renderFotosTercero();
  } catch (err) {
    showStatus('No se pudo procesar la foto: ' + (err.message || err), 'error');
  } finally {
    showLoader(false);
  }
}

/** Dibuja la lista de fotos capturadas del tercero (miniatura + descripción). */
function renderFotosTercero() {
  const cont = els.terceroFotosLista;
  if (!cont) return;
  cont.innerHTML = '';
  if (!terceroFotosLibres.length) {
    cont.innerHTML = '<div class="tercero-estado">Aún no has agregado fotos. Usa “📷 Tomar foto”.</div>';
    return;
  }
  terceroFotosLibres.forEach((it, i) => {
    const card = document.createElement('div');
    card.className = 'tercero-foto-card';

    const im = document.createElement('img');
    im.src = it.previewUrl || '';
    im.alt = it.desc || 'Foto del tercero';
    im.loading = 'lazy';
    card.appendChild(im);

    const cap = document.createElement('div');
    cap.className = 'tercero-foto-cap';
    cap.textContent = it.desc || 'Sin descripción';
    card.appendChild(cap);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'secondary tercero-foto-quitar';
    del.textContent = '🗑 Quitar';
    del.addEventListener('click', () => {
      const [quitada] = terceroFotosLibres.splice(i, 1);
      if (quitada && quitada.blob && quitada.previewUrl) {
        try { URL.revokeObjectURL(quitada.previewUrl); } catch (_) {}
      }
      renderFotosTercero();
    });
    card.appendChild(del);

    cont.appendChild(card);
  });
}

/**
 * Carga en la lista las fotos ya guardadas del tercero (para editarlo). Soporta
 * el formato nuevo (datos['FOTOS TERCERO'] = [{ruta,desc}]) y el antiguo
 * (columnas nombradas FOTO CEDULA…), generando URLs firmadas para verlas.
 */
/** Libera los blobs en memoria y vacía la lista de fotos del tercero. */
function descartarFotosLibres() {
  terceroFotosLibres.forEach(it => {
    if (it.blob && it.previewUrl) { try { URL.revokeObjectURL(it.previewUrl); } catch (_) {} }
  });
  terceroFotosLibres = [];
}

async function cargarFotosTerceroExistentes(datos) {
  terceroFotosCargando = true;
  try {
    descartarFotosLibres();
    renderFotosTercero();
    const items = [];

    const nuevas = Array.isArray(datos['FOTOS TERCERO']) ? datos['FOTOS TERCERO'] : [];
    nuevas.forEach(f => { if (f && f.ruta) items.push({ ruta: f.ruta, desc: f.desc || '' }); });

    // Compatibilidad: fotos antiguas guardadas en columnas nombradas.
    TERCERO_FOTOS.forEach(([col, label]) => {
      const ruta = datos[col];
      if (ruta && typeof ruta === 'string') items.push({ ruta, desc: label });
    });

    for (const it of items) {
      let previewUrl = '';
      try {
        const { data } = await db.storage.from(BUCKET_FOTOS).createSignedUrl(it.ruta, 3600);
        if (data && data.signedUrl) previewUrl = data.signedUrl;
      } catch (_) { /* sin url */ }
      terceroFotosLibres.push({ ruta: it.ruta, desc: it.desc, previewUrl, existente: true });
    }
    renderFotosTercero();
  } finally {
    terceroFotosCargando = false;
  }
}

/* ---------------- Firmas (pad de dibujo) ---------------- */

function construirPadsFirma() {
  const cont = els.terceroFirmasGrid;
  if (!cont) return;
  cont.innerHTML = '';
  TERCERO_FIRMAS.forEach(([col, label]) => {
    const box = document.createElement('div');
    box.className = 'tercero-firma-box';

    const cap = document.createElement('div');
    cap.className = 'tercero-firma-cap';
    cap.innerHTML = `<span>${label}</span>`;
    const limpiar = document.createElement('button');
    limpiar.type = 'button'; limpiar.className = 'secondary tercero-firma-limpiar'; limpiar.textContent = 'Limpiar';
    cap.appendChild(limpiar);

    const canvas = document.createElement('canvas');
    canvas.className = 'tercero-firma-canvas';
    canvas.width = 500; canvas.height = 170;

    box.appendChild(cap);
    box.appendChild(canvas);
    cont.appendChild(box);

    const est = iniciarPadFirma(canvas);
    terceroFirmas[col] = est;
    limpiar.addEventListener('click', () => limpiarPadFirma(est));
  });
}

function iniciarPadFirma(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111827';
  const est = { canvas, ctx, dibujando: false, hayTrazo: false };
  const pos = e => {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height)
    };
  };
  canvas.addEventListener('pointerdown', e => {
    if (canvas.classList.contains('bloq')) return;
    e.preventDefault();
    est.dibujando = true; est.hayTrazo = true;
    const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
  });
  canvas.addEventListener('pointermove', e => {
    if (!est.dibujando) return;
    const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke();
  });
  window.addEventListener('pointerup', () => { est.dibujando = false; });
  return est;
}

function limpiarPadFirma(est) {
  if (!est) return;
  est.ctx.clearRect(0, 0, est.canvas.width, est.canvas.height);
  est.hayTrazo = false;
}

function firmaABlob(est) {
  return new Promise(resolve => {
    if (!est || !est.hayTrazo) return resolve(null);
    est.canvas.toBlob(b => resolve(b), 'image/png');
  });
}

/* ---------------- Guardar ---------------- */

async function guardarTerceroCompleto(event, opciones) {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  opciones = opciones || {};
  const caso = state.casoActual;
  if (!caso) return null;
  const d = caso.datos || {};

  const nombre = (els.terNombre.value || '').trim();
  if (!nombre) { showStatus('El nombre del tercero es obligatorio.', 'error'); return null; }

  // Si aún se están recuperando las fotos ya guardadas (modo edición), esperar:
  // guardar ahora reconstruiría 'FOTOS TERCERO' con la lista a medio poblar y
  // borraría fotos existentes.
  if (terceroFotosCargando) {
    showStatus('Espera un momento: aún se cargan las fotos guardadas del tercero.', 'info');
    return null;
  }

  // 1) Campos de texto/selección/checkbox (data-col). Se separan los VISIBLES
  // (aplican a este tipo) de los OCULTOS (no aplican: p. ej. vehículo en un
  // peatón). Los visibles mandan aunque queden vacíos; los ocultos se descartan.
  const visibles = {};
  const ocultos = [];
  els.formTercero.querySelectorAll('[data-col]').forEach(el => {
    const col = el.dataset.col;
    if (el.closest('.hidden')) { ocultos.push(col); return; }
    if (el.type === 'checkbox') { visibles[col] = el.checked ? 'SI' : 'NO'; return; }
    visibles[col] = (el.value || '').trim();
  });

  // ¿Alta nueva o edición de uno existente?
  const editando = Boolean(terceroEditando);
  const idReg = editando ? terceroEditando : (generarKey() + generarKey());

  let datos;
  if (editando && terceroDatosOriginal) {
    // Edición (read-modify-write): partimos del original para NO perder fotos/
    // firmas ni campos automáticos. Los campos VISIBLES del formulario mandan
    // (incluye vacíos → así se pueden borrar/cambiar), y los campos que ahora
    // están OCULTOS (porque cambió el tipo) se eliminan para no dejar datos
    // contradictorios (p. ej. un peatón con placa/SOAT del tipo anterior).
    datos = Object.assign({}, terceroDatosOriginal);
    ocultos.forEach(col => { delete datos[col]; });
    Object.assign(datos, visibles);
  } else {
    // Alta: sólo se guardan los campos con valor (no ensuciar con vacíos). Los
    // checkbox aportan 'SI'/'NO' (nunca vacío), así que se guardan siempre.
    datos = {};
    Object.keys(visibles).forEach(col => {
      if (visibles[col] !== '') datos[col] = visibles[col];
    });
  }

  // 2) Campos automáticos (del caso / asistente). Al editar se conserva el
  // registro original y sólo se marca la última edición.
  Object.assign(datos, {
    'FECHA SINIESTRO': d['FECHA DEL SINIESTRO'] || d['FECHA Y HORA'] || datos['FECHA SINIESTRO'] || '',
    'PLACA SINIESTRO': d['PLACA VEHICULO'] || datos['PLACA SINIESTRO'] || '',
    'EMPRESA SINIESTRO': d['EMPRESA'] || datos['EMPRESA SINIESTRO'] || '',
    'EMPRESA CONDUCTOR': d['CONDUCTOR'] || d['NOMBRE CONDUCTOR'] || datos['EMPRESA CONDUCTOR'] || '',
    'ASISTENTE': (state.perfil && state.perfil.nombre) || datos['ASISTENTE'] || '',
    'UBICACION REGISTRO': datos['UBICACION REGISTRO'] || d['COORDENADAS ASISTENCIA'] || '',
    'HORA Y FECHA  ASISTENTE': editando ? (datos['HORA Y FECHA  ASISTENTE'] || formatDate(new Date())) : formatDate(new Date())
  });
  if (editando) datos['ULTIMA EDICION'] = formatDate(new Date());

  // Compat con el informe: 'DESEA CONCILIAR EN SITIO' se deriva del tipo de
  // conciliación/contrato elegido (hay tipo → SI; "Ninguno" → NO).
  datos['DESEA CONCILIAR EN SITIO'] = datos['TIPO DE CONCILIACION'] ? 'SI' : 'NO';

  try {
    showLoader(true);

    // 3) Fotos libres: sube las nuevas; conserva las ya guardadas (edición).
    const fotos = [];
    let idx = 0;
    for (const it of terceroFotosLibres) {
      if (it.ruta && !it.blob) { // ya estaba guardada: se conserva tal cual
        fotos.push({ ruta: it.ruta, desc: it.desc || '' });
        continue;
      }
      if (!it.blob) continue;
      const ruta = `${carpetaCaso(caso)}/terceros/${idReg}/foto_${Date.now()}_${idx++}.jpg`;
      if (typeof subirArchivoResiliente === 'function') {
        await subirArchivoResiliente(BUCKET_FOTOS, ruta, it.blob, 'image/jpeg');
      } else {
        const { error } = await db.storage.from(BUCKET_FOTOS)
          .upload(ruta, it.blob, { contentType: 'image/jpeg', upsert: true });
        if (error) throw error;
      }
      fotos.push({ ruta, desc: it.desc || '' });
    }
    datos['FOTOS TERCERO'] = fotos;
    // Migración: si el tercero venía con fotos en columnas nombradas (formato
    // antiguo), se quitan para no mostrarlas duplicadas (ya están en FOTOS TERCERO).
    TERCERO_FOTOS.forEach(([col]) => { delete datos[col]; });

    // 4) Subir firmas (sólo las que se volvieron a firmar).
    for (const [col] of TERCERO_FIRMAS) {
      const blob = await firmaABlob(terceroFirmas[col]);
      if (!blob) continue;
      const ruta = `${carpetaCaso(caso)}/terceros/${idReg}/${slugCampo(col)}.png`;
      if (typeof subirArchivoResiliente === 'function') {
        await subirArchivoResiliente(BUCKET_FOTOS, ruta, blob, 'image/png');
      } else {
        const { error } = await db.storage.from(BUCKET_FOTOS)
          .upload(ruta, blob, { contentType: 'image/png', upsert: true });
        if (error) throw error;
      }
      datos[col] = ruta;
    }

    // 5) Insertar (alta) o actualizar (edición) el tercero, de forma resiliente:
    // si no hay señal, queda en la cola y se sube al reconectar.
    let encolado = false;
    if (typeof guardarTerceroResiliente === 'function') {
      const r = await guardarTerceroResiliente(editando, idReg, caso.key, datos);
      encolado = r.encolado;
    } else if (editando) {
      const { error } = await db.from('registro_terceros')
        .update({ datos }).eq('id_registro', idReg);
      if (error) throw error;
    } else {
      const { error } = await db.from('registro_terceros')
        .insert({ id_registro: idReg, key: caso.key, datos });
      if (error) throw error;
    }

    // Borrador local: guarda el tercero también en el dispositivo para poder
    // verlo/editarlo sin señal (además de la cola que lo subirá).
    if (typeof esBorrador === 'function' && esBorrador(caso)) {
      const b = (typeof obtenerBorrador === 'function') ? obtenerBorrador(caso.key) : null;
      const lista = (b && Array.isArray(b.terceros)) ? b.terceros.slice() : [];
      const i = lista.findIndex(t => t.id_registro === idReg);
      if (i >= 0) lista[i] = { id_registro: idReg, datos: datos };
      else lista.push({ id_registro: idReg, datos: datos });
      caso.terceros = lista;
      await guardarBorrador(caso);
    }

    // Modo silencioso (p. ej. antes de abrir el contrato): NO limpia el
    // formulario, NO recarga la lista y NO muestra aviso, porque el flujo que
    // llamó va a navegar a otra página. Devuelve los datos recién guardados.
    if (opciones.silencioso || typeof opciones.alGuardar === 'function') {
      if (typeof opciones.alGuardar === 'function') await opciones.alGuardar(datos, idReg, encolado);
      return { ok: true, datos, idReg, encolado };
    }

    limpiarFormTercero();
    mostrarFormTercero(false);
    await cargarTercerosDeCaso(caso.key, caso);
    showStatus(
      encolado
        ? (editando ? 'Cambios del tercero guardados en el dispositivo. Se subirán al reconectar.'
                    : 'Tercero guardado en el dispositivo. Se subirá al reconectar.')
        : (editando ? 'Cambios del tercero guardados.' : 'Tercero registrado con su evidencia.'),
      encolado ? 'info' : 'ok');
    return { ok: true, datos, idReg, encolado };
  } catch (error) {
    showStatus('Error al guardar el tercero: ' + (error.message || error), 'error');
    return null;
  } finally {
    showLoader(false);
  }
}

/* ---------------- Contrato legal DESDE el formulario del tercero ---------- *
 * El contrato (desistimiento / a favor / en contra / mutuo acuerdo) se genera
 * aquí mismo, sin recorrer la tarjeta ni depender de la conciliación: un clic
 * guarda el tercero y abre el módulo de contratos ya prellenado.               */

/** Traduce el valor del selector "Tipo de conciliación" al código de contrato
 *  (desistimiento / afavor / encontra / mutuo) que usa el módulo de contratos. */
function contratoKindDesdeTipo(tipo) {
  const s = String(tipo || '').trim().toLowerCase();
  if (!s) return '';
  const labels = (typeof CONTRATO_TIPO_LABEL !== 'undefined') ? CONTRATO_TIPO_LABEL : {};
  for (const [code, lab] of Object.entries(labels)) {
    if (String(lab).toLowerCase() === s) return code;
  }
  // Respaldo por si el texto no coincide exactamente con la etiqueta.
  if (s.includes('desist')) return 'desistimiento';
  if (s.includes('favor')) return 'afavor';
  if (s.includes('contra')) return 'encontra';
  if (s.includes('mutuo') || s.includes('acuerdo')) return 'mutuo';
  return '';
}

/** Construye (una sola vez) el botón para generar el contrato del tercero. */
function construirBotonesContratoForm() {
  const cont = els.terceroContratoTipos;
  if (!cont || cont.dataset.listo) return;
  cont.innerHTML = '';
  const b = document.createElement('button');
  b.type = 'button'; // NO envía el formulario (solo "Guardar tercero" lo hace)
  b.id = 'btnGenerarContratoTercero';
  b.className = 'primary tercero-contrato-btn';
  b.textContent = '📝 Generar contrato';
  b.addEventListener('click', generarContratoDesdeFormTercero);
  cont.appendChild(b);
  cont.dataset.listo = '1';
}

/**
 * Muestra el generador de contrato SÓLO cuando hay un tipo de conciliación/
 * contrato elegido y el rol puede generarlo. Actualiza el texto del botón con
 * el tipo seleccionado.
 */
function actualizarContratoEnForm() {
  const wrap = els.terceroContratoForm;
  if (!wrap) return;
  construirBotonesContratoForm();
  const puede = (typeof rolVeContratos === 'function') ? rolVeContratos() : false;
  const tipo = els.terTipoConciliacion ? els.terTipoConciliacion.value : '';
  wrap.classList.toggle('hidden', !(puede && tipo));
  const btn = document.getElementById('btnGenerarContratoTercero');
  if (btn && tipo) btn.textContent = `📝 Generar contrato: ${tipo}`;
}

/** Lee del formulario del tercero los campos visibles (data-col) a un objeto. */
function leerDatosTerceroForm() {
  const datos = {};
  els.formTercero.querySelectorAll('[data-col]').forEach(el => {
    if (el.closest('.hidden')) return; // ignora secciones ocultas del tipo actual
    if (el.type === 'checkbox') { datos[el.dataset.col] = el.checked ? 'SI' : 'NO'; return; }
    const v = (el.value || '').trim();
    if (v) datos[el.dataset.col] = v;
  });
  return datos;
}

/**
 * Guarda el tercero y abre su contrato (del tipo elegido arriba), prellenado.
 * El prellenado se arma con lo que hay AHORA en el formulario, así el contrato
 * SIEMPRE abre aunque el guardado en el servidor tarde o falle (se navega igual;
 * el tercero se guarda en segundo plano para conservar su ficha).
 */
async function generarContratoDesdeFormTercero() {
  const caso = state.casoActual;
  if (!caso) { showStatus('Abre primero el caso para generar el contrato.', 'error'); return; }
  if (typeof construirPrefillContrato !== 'function' || typeof abrirFormularioContrato !== 'function') {
    showStatus('El módulo de contratos no está disponible.', 'error');
    return;
  }
  const tipo = els.terTipoConciliacion ? els.terTipoConciliacion.value : '';
  const kind = contratoKindDesdeTipo(tipo);
  if (!kind) { showStatus('Elige primero el tipo de conciliación / contrato.', 'error'); return; }

  // Los datos del tercero son OPCIONALES: sólo sirven para PRELLENAR el contrato
  // (ahorrar retipearlos). Lo que esté escrito se copia; lo que falte se llena
  // dentro del propio contrato.
  const datosForm = leerDatosTerceroForm();
  const prefill = construirPrefillContrato(caso, datosForm, kind);
  // Si escribiste el nombre, además se guarda el tercero (best-effort) para
  // conservar su ficha y enlazar el contrato. Si no, se abre el contrato directo.
  const tieneNombre = !!String(datosForm['NOMBRE COMPLETO'] || '').trim();
  if (tieneNombre) {
    try { await guardarTerceroCompleto(null, { silencioso: true }); } catch (_) { /* se navega igual */ }
  }
  // Abre el módulo de contratos SIEMPRE, ya prellenado con lo disponible.
  abrirFormularioContrato(prefill);
}

function limpiarFormTercero() {
  els.formTercero.reset();
  descartarFotosLibres(); // vacía las fotos capturadas (y libera memoria)
  renderFotosTercero();
  TERCERO_FIRMAS.forEach(([col]) => limpiarPadFirma(terceroFirmas[col]));
  adaptarFormTercero(); // repone las secciones según el tipo (vacío)
  adaptarLesionTercero(); // oculta el tipo de lesión (sin respuesta)
  adaptarConciliacionTercero(); // oculta los detalles de conciliación
  adaptarMenorTercero(); // oculta los datos del representante
  salirModoEdicionTercero(); // vuelve el formulario a modo "alta"
}

/** Bloquea/activa el formulario de tercero según el check-in del asistente. */
function habilitarTerceros(on) {
  if (els.btnTerceroTomarFoto) els.btnTerceroTomarFoto.disabled = !on;
  if (els.btnTerceroGaleria) els.btnTerceroGaleria.disabled = !on;
  if (els.terceroFotosLista) els.terceroFotosLista.querySelectorAll('button').forEach(b => { b.disabled = !on; });
  if (els.terConsentimiento) els.terConsentimiento.disabled = !on;
}

/** Añade a la tarjeta del tercero su evidencia fotográfica con URLs firmadas. */
async function agregarEvidenciaTerceroCard(card, datos) {
  // Formato nuevo (fotos libres con descripción) + compatibilidad con el antiguo.
  const items = [];
  const nuevas = Array.isArray(datos['FOTOS TERCERO']) ? datos['FOTOS TERCERO'] : [];
  nuevas.forEach(f => { if (f && f.ruta) items.push({ ruta: f.ruta, label: f.desc || 'Foto' }); });
  [...TERCERO_FOTOS, ...TERCERO_FIRMAS].forEach(([col, label]) => {
    if (datos[col]) items.push({ ruta: datos[col], label });
  });
  if (!items.length) return;

  const sec = document.createElement('div');
  sec.className = 'tercero-evidencia';
  const h = document.createElement('div');
  h.className = 'tercero-evidencia-tit';
  h.textContent = `📎 Evidencia (${items.length})`;
  const grid = document.createElement('div');
  grid.className = 'tercero-evidencia-grid';
  sec.appendChild(h);
  sec.appendChild(grid);
  card.appendChild(sec);

  for (const { ruta, label } of items) {
    let src = '';
    try {
      const { data } = await db.storage.from(BUCKET_FOTOS).createSignedUrl(ruta, 3600);
      if (data && data.signedUrl) src = data.signedUrl;
    } catch (e) { /* sin url */ }
    const a = document.createElement('a');
    a.className = 'tercero-evi-item';
    a.href = src; a.target = '_blank'; a.rel = 'noopener';
    const im = document.createElement('img');
    im.src = src; im.loading = 'lazy'; im.alt = label;
    const cap = document.createElement('small');
    cap.textContent = label;
    a.appendChild(im); a.appendChild(cap);
    grid.appendChild(a);
  }
}
