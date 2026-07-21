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

// Tipos de tercero que TIENEN vehículo propio (muestran la sección de vehículo).
const TIPOS_CON_VEHICULO = ['CONDUCTOR VEHICULO TERCERO', 'CICLISTA', 'MOTOCICLISTA', 'OTRO'];
// Tipos que NO son una persona (mascota/animal, daño a bien): se re-etiqueta el nombre.
const TIPOS_NO_PERSONA = ['SEMOVIENTE / ANIMAL', 'DAÑO A PROPIEDAD / INMUEBLE'];

// Fotos libres del tercero (estilo formulario de asistencias). Cada ítem:
//   { blob, previewUrl, desc }            → foto nueva aún sin subir
//   { ruta, previewUrl, desc, existente } → foto ya guardada (modo edición)
let terceroFotosLibres = [];
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
  if (els.terDeseaConciliar) els.terDeseaConciliar.addEventListener('change', adaptarConciliacionTercero);
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
  adaptarFormTercero();
  adaptarLesionTercero();
  adaptarConciliacionTercero();
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
  if (mostrar) els.terNombre.focus();
}

/**
 * Muestra el campo "Tipo de lesión" y lo hace obligatorio sólo si el tercero
 * tiene lesión (SI). Con NO / sin respuesta se oculta y no se exige ni guarda.
 */
function adaptarLesionTercero() {
  if (!els.terTieneLesion || !els.terTipoLesionCampo) return;
  const tieneLesion = els.terTieneLesion.value === 'SI';
  els.terTipoLesionCampo.classList.toggle('hidden', !tieneLesion);
  if (els.terTipoLesion) {
    // 'required' sólo cuando es visible (un required oculto bloquea el envío).
    els.terTipoLesion.required = tieneLesion;
    if (!tieneLesion) els.terTipoLesion.value = '';
  }
}

/**
 * Muestra los detalles de conciliación (tipo, dinero, monto en letras) y hace
 * obligatorio el "Tipo de conciliación" sólo cuando el tercero desea conciliar
 * en sitio (SI). El generador de contrato en la tarjeta también se habilita
 * únicamente para los terceros con conciliación = SI.
 */
function adaptarConciliacionTercero() {
  if (!els.terDeseaConciliar) return;
  const concilia = els.terDeseaConciliar.value === 'SI';
  ['terTipoConciliacionCampo', 'terDineroCampo', 'terMontoLetrasCampo'].forEach(id => {
    if (els[id]) els[id].classList.toggle('hidden', !concilia);
  });
  if (els.terTipoConciliacion) {
    els.terTipoConciliacion.required = concilia; // required sólo si visible
    if (!concilia) els.terTipoConciliacion.value = '';
  }
  // Limpia los otros campos de conciliación cuando se elige NO.
  if (!concilia) {
    if (els.terDineroCampo) els.terDineroCampo.querySelectorAll('input').forEach(i => i.value = '');
    if (els.terMontoLetrasCampo) els.terMontoLetrasCampo.querySelectorAll('input').forEach(i => i.value = '');
  }
}

/** Adapta el formulario al tipo de tercero (muestra/oculta vehículo, re-etiqueta). */
function adaptarFormTercero() {
  const tipo = els.terTipo.value;
  // La sección de vehículo solo aplica a quien conduce/usa un vehículo.
  const muestraVeh = !tipo || TIPOS_CON_VEHICULO.includes(tipo);
  els.terceroSeccionVehiculo.classList.toggle('hidden', !muestraVeh);
  // Secciones específicas por tipo (animal / propiedad).
  els.terceroSeccionAnimal.classList.toggle('hidden', tipo !== 'SEMOVIENTE / ANIMAL');
  els.terceroSeccionPropiedad.classList.toggle('hidden', tipo !== 'DAÑO A PROPIEDAD / INMUEBLE');
  // Re-etiqueta el nombre según sea persona, animal o bien.
  if (tipo === 'SEMOVIENTE / ANIMAL') {
    els.terceroDatosTit.textContent = '🐾 Datos del semoviente / animal';
    els.terNombre.previousElementSibling.textContent = 'Descripción (especie, raza, color) *';
  } else if (tipo === 'DAÑO A PROPIEDAD / INMUEBLE') {
    els.terceroDatosTit.textContent = '🏠 Datos del bien / propiedad';
    els.terNombre.previousElementSibling.textContent = 'Descripción del bien afectado *';
  } else {
    els.terceroDatosTit.textContent = '👤 Datos del tercero';
    els.terNombre.previousElementSibling.textContent = 'Nombre completo *';
  }
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

async function guardarTerceroCompleto(event) {
  event.preventDefault();
  const caso = state.casoActual;
  if (!caso) return;
  const d = caso.datos || {};

  const nombre = (els.terNombre.value || '').trim();
  if (!nombre) { showStatus('El nombre del tercero es obligatorio.', 'error'); return; }

  // 1) Campos de texto/selección/checkbox (data-col).
  let datos = {};
  els.formTercero.querySelectorAll('[data-col]').forEach(el => {
    if (el.closest('.hidden')) return; // ignora secciones ocultas (no aplican a este tipo)
    if (el.type === 'checkbox') { datos[el.dataset.col] = el.checked ? 'SI' : 'NO'; return; }
    const v = (el.value || '').trim();
    if (v) datos[el.dataset.col] = v;
  });

  // ¿Alta nueva o edición de uno existente?
  const editando = Boolean(terceroEditando);
  const idReg = editando ? terceroEditando : (generarKey() + generarKey());

  // En edición: partimos de los datos originales (read-modify-write) para NO
  // perder fotos/firmas ni campos que no estén visibles en el formulario.
  if (editando && terceroDatosOriginal) {
    datos = Object.assign({}, terceroDatosOriginal, datos);
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
      const ruta = `${caso.numero_caso}/terceros/${idReg}/foto_${Date.now()}_${idx++}.jpg`;
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
      const ruta = `${caso.numero_caso}/terceros/${idReg}/${slugCampo(col)}.png`;
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

    limpiarFormTercero();
    mostrarFormTercero(false);
    await cargarTercerosDeCaso(caso.key);
    showStatus(
      encolado
        ? (editando ? 'Cambios del tercero guardados en el dispositivo. Se subirán al reconectar.'
                    : 'Tercero guardado en el dispositivo. Se subirá al reconectar.')
        : (editando ? 'Cambios del tercero guardados.' : 'Tercero registrado con su evidencia.'),
      encolado ? 'info' : 'ok');
  } catch (error) {
    showStatus('Error al guardar el tercero: ' + (error.message || error), 'error');
  } finally {
    showLoader(false);
  }
}

function limpiarFormTercero() {
  els.formTercero.reset();
  descartarFotosLibres(); // vacía las fotos capturadas (y libera memoria)
  renderFotosTercero();
  TERCERO_FIRMAS.forEach(([col]) => limpiarPadFirma(terceroFirmas[col]));
  adaptarFormTercero(); // repone las secciones según el tipo (vacío)
  adaptarLesionTercero(); // oculta el tipo de lesión (sin respuesta)
  adaptarConciliacionTercero(); // oculta los detalles de conciliación
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
