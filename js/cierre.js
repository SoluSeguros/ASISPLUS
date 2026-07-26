/**
 * cierre.js
 * Fase 1 del "Desarrollo de dependencias": al terminar la atención, el asistente
 * genera el ESTADO DE CIERRE y enruta el caso a una de las 5 dependencias
 * (áreas). Cada ruta muestra sus campos de control, la lista de documentos que
 * la empresa debe reunir (notificación empresa) y permite adjuntar PDF/imágenes.
 * Todo se guarda en `datos` (JSONB); los documentos van al bucket documentos-casos.
 */

const BUCKET_DOCS = 'documentos-casos';

// Las 5 rutas (dependencias) del cierre del siniestro.
const RUTAS_CIERRE = [
  { val: 'CERRADO', label: '01 · Cerrado', responsable: 'Cierre inmediato', desc: 'Transacción, desistimiento o mutuo acuerdo.' },
  { val: 'RECLAMACION_FAVOR', label: '02 · Reclamación a favor', responsable: 'Sergio Córdoba', desc: 'Requiere reclamación a favor.' },
  { val: 'SEG_VIAL_2251', label: '03 · Seguridad Vial 2251', responsable: 'César / Víctor', desc: 'No conciliado en sitio, "solo daños" con afectación de póliza o deducible.' },
  { val: 'SEG_VIAL_LESIONES', label: '04 · Seguridad Vial Lesiones', responsable: 'César / Víctor', desc: 'Intervención de tránsito: audiencia contravencional, fallo y posible reserva/pago.' },
  { val: 'SEG_VIAL_PREJUDICIALES', label: '05 · Seguridad Vial Prejudiciales', responsable: 'César / Víctor', desc: 'Audiencias prejudiciales, procesos penales o demandas.' }
];

// Etapas de seguimiento (sub-estado) por ruta. Se muestran en la bandeja.
const SEGUIMIENTO_RUTA = {
  RECLAMACION_FAVOR: ['RADICADA', 'EN TRAMITE', 'PAGO', 'PROCEDIBILIDAD AGOTADA', 'CERRADA'],
  SEG_VIAL_2251: ['EN TRAMITE', 'TRANSACCION', 'RESERVA ASEGURADORA', 'PAGO', 'CERRADA'],
  SEG_VIAL_LESIONES: ['CITADO A AUDIENCIA', 'EN AUDIENCIA', 'FALLO', 'RESERVA / PAGO', 'CERRADA'],
  SEG_VIAL_PREJUDICIALES: ['CITACION', 'AUDIENCIA PREJUDICIAL', 'PROCESO PENAL', 'DEMANDA', 'CERRADA']
};

// Etiqueta corta + clase de color de cada ruta (para la bandeja).
const RUTA_CHIP = {
  CERRADO: { t: 'Cerrado', c: 'rc-cerrado' },
  RECLAMACION_FAVOR: { t: 'Reclamación', c: 'rc-recl' },
  SEG_VIAL_2251: { t: 'S.Vial 2251', c: 'rc-2251' },
  SEG_VIAL_LESIONES: { t: 'S.Vial Lesiones', c: 'rc-lesiones' },
  SEG_VIAL_PREJUDICIALES: { t: 'S.Vial Prejud.', c: 'rc-prejud' }
};

// Campos de control por ruta (se guardan como campo-caso → datos JSONB).
// El primer campo de cada área es el "Seguimiento" (sub-estado del proceso).
const CAMPOS_RUTA = {
  CERRADO: [
    { col: 'CIERRE MOTIVO', label: 'Tipo de cierre', tipo: 'select', opciones: ['TRANSACCION', 'DESISTIMIENTO', 'MUTUO ACUERDO', 'OTRO'] },
    { col: 'CIERRE OBSERVACION', label: 'Observación del cierre', tipo: 'textarea' }
  ],
  RECLAMACION_FAVOR: [
    { col: 'SEGUIMIENTO', label: 'Seguimiento del proceso', tipo: 'select', opciones: SEGUIMIENTO_RUTA.RECLAMACION_FAVOR },
    { col: 'RECLAMACION RESULTADO', label: 'Estado de la reclamación', tipo: 'select', opciones: ['EN TRAMITE', 'PAGO', 'PROCEDIBILIDAD AGOTADA'] },
    { col: 'RECLAMACION CONTROL', label: 'Control del proceso de reclamación', tipo: 'textarea' }
  ],
  SEG_VIAL_2251: [
    { col: 'SEGUIMIENTO', label: 'Seguimiento del proceso', tipo: 'select', opciones: SEGUIMIENTO_RUTA.SEG_VIAL_2251 },
    { col: '2251 RESULTADO', label: 'Cierre por', tipo: 'select', opciones: ['EN TRAMITE', 'TRANSACCION', 'RESERVA ASEGURADORA', 'PAGO'] },
    { col: '2251 CONTROL', label: 'Control del proceso', tipo: 'textarea' }
  ],
  SEG_VIAL_LESIONES: [
    { col: 'SEGUIMIENTO', label: 'Seguimiento del proceso', tipo: 'select', opciones: SEGUIMIENTO_RUTA.SEG_VIAL_LESIONES },
    { col: 'LESIONES FECHA AUDIENCIA', label: 'Fecha de audiencia', tipo: 'date' },
    { col: 'LESIONES FALLO', label: 'Fallo', tipo: 'text' },
    { col: 'LESIONES POSIBLE RECLAMACION', label: '¿Posible reclamación?', tipo: 'select', opciones: ['SI', 'NO', 'POR DEFINIR'] },
    { col: 'LESIONES CONTROL', label: 'Control del proceso', tipo: 'textarea' }
  ],
  SEG_VIAL_PREJUDICIALES: [
    { col: 'SEGUIMIENTO', label: 'Seguimiento del proceso', tipo: 'select', opciones: SEGUIMIENTO_RUTA.SEG_VIAL_PREJUDICIALES },
    { col: 'PREJUDICIALES CONTROL', label: 'Control del proceso', tipo: 'textarea' }
  ]
};

/** Devuelve el HTML del chip de ruta + seguimiento para la bandeja. */
function chipRutaBandeja(datos) {
  const d = datos || {};
  const ruta = d['RUTA CIERRE'];
  if (!ruta) return '<span class="muted-mini">—</span>';
  const info = RUTA_CHIP[ruta] || { t: ruta, c: '' };
  const seg = d['SEGUIMIENTO'] || (ruta === 'CERRADO' ? (d['CIERRE MOTIVO'] || '') : '');
  return `<span class="ruta-chip ${info.c}">${info.t}</span>` + (seg ? `<span class="seg-chip">${seg}</span>` : '');
}

// Documentación para "Notificación empresa" (checklist) por ruta.
const DOCS_RUTA = {
  SEG_VIAL_2251: ['Cédula del propietario', 'Cotización de los daños', 'SOAT', 'Tecnomecánica', 'Cédula del conductor', 'Licencia del conductor'],
  SEG_VIAL_LESIONES: ['Citación de audiencia', 'IPAT', 'Poder autenticado por el conductor', 'Documento de identidad', 'Licencia de conducir', 'SOAT', 'Tecnomecánica']
};

/** Inicializa el bloque de cierre (una sola vez). */
function initCierre() {
  // Llena el selector de rutas.
  els.rutaCierre.innerHTML = '<option value="">— Selecciona la ruta de cierre —</option>' +
    RUTAS_CIERRE.map(r => `<option value="${r.val}">${r.label} · ${r.responsable}</option>`).join('');
  els.rutaCierre.classList.add('campo-caso');
  els.rutaCierre.dataset.campo = 'RUTA CIERRE';
  els.rutaCierre.addEventListener('change', () => renderRuta(els.rutaCierre.value));

  els.btnSubirDocRuta.addEventListener('click', () => els.inputDocRuta.click());
  els.inputDocRuta.addEventListener('change', subirDocsRuta);
}

/** Carga el bloque de cierre con los datos del caso. */
function cargarCierreCaso(caso) {
  const d = caso.datos || {};
  els.rutaCierre.value = d['RUTA CIERRE'] || '';
  renderRuta(els.rutaCierre.value);
  cargarDocsRuta(caso);
}

/** Dibuja los campos de control, el responsable y el checklist de la ruta. */
function renderRuta(ruta) {
  const info = RUTAS_CIERRE.find(r => r.val === ruta);
  const d = (state.casoActual && state.casoActual.datos) || {};

  // Responsable / descripción.
  els.rutaResponsable.innerHTML = info
    ? `<span class="ruta-resp-ico">👤</span> Responsable: <b>${info.responsable}</b><span class="ruta-desc">${info.desc}</span>`
    : '';

  // Campos de control propios de la ruta.
  els.rutaCampos.innerHTML = '';
  (CAMPOS_RUTA[ruta] || []).forEach(c => {
    const wrap = document.createElement('div');
    wrap.className = c.tipo === 'textarea' ? 'form-field span-2' : 'form-field';
    const label = document.createElement('label');
    label.textContent = c.label;
    let input;
    if (c.tipo === 'select') {
      input = document.createElement('select');
      const actual = d[c.col] || '';
      input.innerHTML = '<option value="">—</option>' + c.opciones.map(o => `<option${o === actual ? ' selected' : ''}>${o}</option>`).join('');
    } else if (c.tipo === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 2;
      input.value = d[c.col] || '';
    } else {
      input = document.createElement('input');
      input.type = c.tipo === 'date' ? 'date' : 'text';
      input.value = d[c.col] || '';
    }
    input.classList.add('campo-caso');
    input.dataset.campo = c.col;
    wrap.appendChild(label);
    wrap.appendChild(input);
    els.rutaCampos.appendChild(wrap);
  });

  // Checklist "notificación empresa".
  renderNotifDocs(ruta, d);

  // Habilita/bloquea según el estado de edición actual del caso.
  const bloqueado = els.rutaCierre.disabled;
  habilitarCierre(!bloqueado);
}

/** Dibuja el checklist de documentación para notificar a la empresa. */
function renderNotifDocs(ruta, d) {
  const lista = DOCS_RUTA[ruta];
  if (!lista) { els.rutaNotif.innerHTML = ''; return; }
  const marcados = (d['NOTIF DOCS'] && typeof d['NOTIF DOCS'] === 'object') ? d['NOTIF DOCS'] : {};
  els.rutaNotif.innerHTML =
    `<div class="ruta-notif-tit">📋 Notificación empresa · documentación a reunir</div>` +
    lista.map(doc => {
      const ok = marcados[doc] ? ' checked' : '';
      return `<label class="ruta-notif-item"><input type="checkbox" class="ruta-notif-chk" data-doc="${doc}"${ok}> ${doc}</label>`;
    }).join('');
}

/** Recoge los datos del cierre (checklist) para incluirlos al guardar el caso. */
function recogerCierreExtra(datos) {
  const ruta = els.rutaCierre.value;
  datos['RUTA CIERRE'] = ruta;
  const info = RUTAS_CIERRE.find(r => r.val === ruta);
  datos['RESPONSABLE RUTA'] = info ? info.responsable : '';
  // Checklist de notificación empresa (solo el de la ruta visible).
  const marcados = {};
  els.rutaNotif.querySelectorAll('.ruta-notif-chk').forEach(c => { marcados[c.dataset.doc] = c.checked; });
  if (Object.keys(marcados).length) datos['NOTIF DOCS'] = marcados;
}

/* ---------------- Documentos (PDF) ---------------- */

async function subirDocsRuta(event) {
  const archivos = [...event.target.files];
  event.target.value = '';
  const caso = state.casoActual;
  if (!caso || !archivos.length) return;
  if (!caso.datos) caso.datos = {};
  try {
    showLoader(true);
    for (const file of archivos) {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
      const ruta = `${carpetaCaso(caso)}/docs/${Date.now()}_${safe}`;
      const { error } = await db.storage.from(BUCKET_DOCS).upload(ruta, file, { contentType: file.type || 'application/pdf', upsert: false });
      if (error) throw error;
      const nuevo = { ruta, nombre: file.name };
      // Persiste cada documento ni bien se sube (append sobre lo fresco): si uno
      // siguiente falla, los ya subidos quedan registrados (sin huérfanos).
      await persistirDatosCaso(caso, datos => {
        const lista = Array.isArray(datos['DOCUMENTOS RUTA']) ? datos['DOCUMENTOS RUTA'] : [];
        datos['DOCUMENTOS RUTA'] = lista.concat([nuevo]);
      });
    }
    cargarDocsRuta(caso);
    showStatus('Documento(s) adjunto(s).', 'ok');
  } catch (error) {
    showStatus('Error al adjuntar el documento: ' + (error.message || error), 'error');
  } finally {
    showLoader(false);
  }
}

async function cargarDocsRuta(caso) {
  const cont = els.docsRutaLista;
  const lista = Array.isArray(caso.datos && caso.datos['DOCUMENTOS RUTA']) ? caso.datos['DOCUMENTOS RUTA'] : [];
  cont.innerHTML = '';
  if (!lista.length) { cont.innerHTML = '<div class="tercero-estado">Sin documentos adjuntos.</div>'; return; }
  const puedeEditar = ['asistente', 'admin'].includes(state.perfil && state.perfil.rol);
  for (const doc of lista) {
    let url = '';
    try {
      const { data } = await db.storage.from(BUCKET_DOCS).createSignedUrl(doc.ruta, 3600);
      if (data && data.signedUrl) url = data.signedUrl;
    } catch (e) { /* sin url */ }
    const item = document.createElement('div');
    item.className = 'doc-item';
    const esPdf = /\.pdf$/i.test(doc.nombre);
    // Escapa el nombre del archivo (lo elige el usuario) para no romper el marcado.
    const nombreSeguro = (typeof escBandeja === 'function') ? escBandeja(doc.nombre) : doc.nombre;
    item.innerHTML = `<span class="doc-ico">${esPdf ? '📄' : '🖼️'}</span>
      <a href="${encodeURI(url)}" target="_blank" rel="noopener" class="doc-nombre">${nombreSeguro}</a>`;
    if (puedeEditar) {
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'secondary doc-del'; del.textContent = 'Eliminar';
      del.addEventListener('click', () => eliminarDocRuta(caso, doc));
      item.appendChild(del);
    }
    cont.appendChild(item);
  }
}

async function eliminarDocRuta(caso, doc) {
  if (!window.confirm(`¿Eliminar "${doc.nombre}"?`)) return;
  try {
    showLoader(true);
    await db.storage.from(BUCKET_DOCS).remove([doc.ruta]);
    await persistirDatosCaso(caso, datos => {
      datos['DOCUMENTOS RUTA'] = (datos['DOCUMENTOS RUTA'] || []).filter(x => x.ruta !== doc.ruta);
    });
    cargarDocsRuta(caso);
    showStatus('Documento eliminado.', 'ok');
  } catch (error) {
    showStatus('Error al eliminar: ' + (error.message || error), 'error');
  } finally {
    showLoader(false);
  }
}

/** Habilita o bloquea el bloque de cierre (según el check-in). */
function habilitarCierre(on) {
  els.rutaCierre.disabled = !on;
  els.rutaCampos.querySelectorAll('input, select, textarea').forEach(el => { el.disabled = !on; });
  els.rutaNotif.querySelectorAll('input').forEach(el => { el.disabled = !on; });
  if (els.btnSubirDocRuta) els.btnSubirDocRuta.disabled = !on;
  els.docsRutaLista.querySelectorAll('.doc-del').forEach(b => { b.disabled = !on; });
}

/* ================================================================== *
 *  Contratos legales POR TERCERO (Fase 2 de integración)
 *  El contrato nace del tercero afectado: cada tarjeta de tercero del
 *  caso lleva su propio generador. Arma un "prefill" con los datos del
 *  siniestro + los del tercero y abre el módulo /contratos/ ya
 *  autenticado. También lista los contratos ya generados para ese
 *  tercero (match por casoOrigen + documento).
 * ================================================================== */

const CONTRATO_TIPO_LABEL = {
  desistimiento: 'Desistimiento',
  afavor: 'A Favor',
  encontra: 'En Contra',
  mutuo: 'Mutuo Acuerdo'
};

/** Normaliza una fecha del caso a formato yyyy-mm-dd para el <input type=date>. */
function fechaContratoISO(v) {
  if (!v) return '';
  const s = String(v).trim();
  // Ya viene ISO (yyyy-mm-dd...) → recorta a 10.
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // dd/mm/yyyy o dd-mm-yyyy.
  m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

/**
 * ¿El rol actual puede generar contratos? Incluye al ASISTENTE porque la
 * conciliación EN SITIO —y su contrato— la hace él en el lugar del accidente
 * (aparece por tercero solo cuando el tercero marca "Desea conciliar = SÍ").
 * También gestor, admin y áreas jurídicas (reclamaciones, seguridad vial).
 */
function rolVeContratos() {
  const rol = (state.perfil && state.perfil.rol) || 'asistente';
  const areas = (typeof AREA_ROLES !== 'undefined') ? AREA_ROLES : ['reclamaciones', 'seguridad_vial'];
  return rol === 'asistente' || rol === 'gestor' || rol === 'admin' || areas.includes(rol);
}

/** Trae los contratos generados para este caso (una sola consulta por caso). */
async function fetchContratosCaso(numeroCaso) {
  if (!numeroCaso) return [];
  try {
    const { data, error } = await db.from('firma_cases')
      .select('id, public_token, form_data, pdf_storage_path, status, created_at')
      .eq('form_data->>casoOrigen', numeroCaso)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (_) {
    return null; // null = no se pudo consultar (permisos)
  }
}

/**
 * Construye el objeto de prellenado a partir del caso y del tercero.
 * El tercero es el COMPARECIENTE (afectado); el conductor/vehículo salen
 * del siniestro.
 */
function construirPrefillContrato(caso, terceroDatos, tipo) {
  const d = (caso && caso.datos) || {};
  const t = terceroDatos || {};
  const ciudad = d['CIUDAD DEL SINIESTRO'] || '';
  const esMenor = String(t['TERCERO ES MENOR'] || '').toUpperCase() === 'SI';

  const pre = {
    contractKind: tipo || 'desistimiento',
    casoOrigen: (caso && caso.numero_caso) || '',
    // Datos del hecho (del siniestro).
    fecha: fechaContratoISO(d['FECHA DEL SINIESTRO'] || d['FECHA Y HORA']),
    ciudadHecho: ciudad,
    ciudadFirma: ciudad,
    lugarHecho: d['DIRECCION DEL LUGAR DEL SINIESTRO'] || '',
    // Vehículo 1 = asegurado (bus) · Vehículo 2 = tercero.
    placa: d['PLACA VEHICULO'] || '',
    interno: d['NUMERO INTERNO VEHICULO'] || '',
    placa2: t['PLACA'] || '',
    empresa: d['EMPRESA'] || '',
    // Conductor asegurado (bloque conductor del contrato).
    conductorNombre: d['NOMBRE CONDUCTOR'] || '',
    conductorCedula: d['CEDULA DEL CONDUCTOR'] || '',
    // COMPARECIENTE = tercero afectado (en TODOS los tipos, criterio del cliente).
    nombre: t['NOMBRE COMPLETO'] || '',
    cedula: t['NUMERO DOCUMENTO'] || '',
    ciudadCedula: t['DE DONDE ES EL DOCUMENTO'] || '',
    condicionComp: String(t['CONDICION TERCERO'] || '').toLowerCase(),
    // IMPLICADO / otra parte = conductor asegurado (nuestro).
    implicado: d['NOMBRE CONDUCTOR'] || '',
    cedulaImp: d['CEDULA DEL CONDUCTOR'] || '',
    ciudadCedulaImp: '',
    condicionImp: (d['NOMBRE CONDUCTOR'] || '') ? 'conductor' : ''
  };

  // Tercero menor de edad: firma su REPRESENTANTE (pasa a ser el compareciente)
  // y el menor (el tercero) va en los campos del menor.
  if (esMenor) {
    pre.tipo = 'menor';
    pre.nombreMenor = t['NOMBRE COMPLETO'] || '';
    pre.docMenor = t['NUMERO DOCUMENTO'] || '';
    pre.parentesco = t['REPRESENTANTE PARENTESCO'] || '';
    pre.nombre = t['REPRESENTANTE NOMBRE'] || '';
    pre.cedula = t['REPRESENTANTE DOCUMENTO'] || '';
    pre.ciudadCedula = '';
  }

  return pre;
}

/** Codifica el prefill y navega al formulario de contratos. */
function abrirFormularioContrato(prefill) {
  let b64;
  try {
    b64 = btoa(unescape(encodeURIComponent(JSON.stringify(prefill))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch (_) {
    showStatus('No se pudo preparar el contrato.', 'error');
    return;
  }
  window.location.href = `contratos/formularios2.html?prefill=${b64}`;
}

/** Abre el PDF firmado del bucket signed-documents mediante URL firmada. */
async function verPdfContrato(path) {
  try {
    const { data, error } = await db.storage.from('signed-documents').createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) throw error || new Error('sin url');
    window.open(data.signedUrl, '_blank', 'noopener');
  } catch (_) {
    showStatus('No se pudo abrir el PDF del contrato.', 'error');
  }
}

/**
 * Devuelve un bloque de UI (para insertar en la tarjeta de un tercero) con:
 *  - selector de tipo de contrato + botón "Generar contrato"
 *  - lista de los contratos ya generados para ESE tercero
 * `contratos` es el resultado de fetchContratosCaso (array | null).
 */
function bloqueContratoTercero(caso, terceroDatos, contratos) {
  const t = terceroDatos || {};
  const wrap = document.createElement('div');
  wrap.className = 'tercero-contrato';

  const tit = document.createElement('div');
  tit.className = 'tercero-contrato-tit';
  tit.textContent = '📑 Contrato legal de este tercero';
  wrap.appendChild(tit);

  const fila = document.createElement('div');
  fila.className = 'tercero-contrato-fila';

  const sel = document.createElement('select');
  sel.className = 'tercero-contrato-tipo';
  Object.entries(CONTRATO_TIPO_LABEL).forEach(([val, label]) => {
    const o = document.createElement('option');
    o.value = val; o.textContent = label;
    sel.appendChild(o);
  });
  fila.appendChild(sel);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'primary';
  btn.textContent = '📝 Generar contrato';
  btn.addEventListener('click', () => {
    const prefill = construirPrefillContrato(caso, t, sel.value);
    abrirFormularioContrato(prefill);
  });
  fila.appendChild(btn);
  wrap.appendChild(fila);

  // Lista de contratos ya generados para este tercero.
  const lista = document.createElement('div');
  lista.className = 'docs-lista';
  const doc = String(t['NUMERO DOCUMENTO'] || '').trim();
  if (contratos === null) {
    lista.innerHTML = '<div class="tercero-estado">No se pudo consultar contratos (permisos). Míralos en el módulo de contratos.</div>';
  } else {
    const propios = contratos.filter(row => {
      const fd = row.form_data || {};
      // Empareja por documento si el tercero lo tiene; si no, por nombre.
      if (doc) return String(fd.cedula || '').trim() === doc;
      return (fd.nombre || '').trim() && (fd.nombre || '').trim() === String(t['NOMBRE COMPLETO'] || '').trim();
    });
    if (!propios.length) {
      lista.innerHTML = '<div class="tercero-estado">Aún no hay contratos para este tercero.</div>';
    } else {
      propios.forEach(row => lista.appendChild(itemContratoGenerado(row)));
    }
  }
  wrap.appendChild(lista);

  return wrap;
}

/** Escape local (reutiliza el de casos.js si está cargado). */
function escC(v) {
  if (typeof escBandeja === 'function') return escBandeja(v);
  return String(v == null ? '' : v).replace(/[&<>"']/g, m => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

/** Formatea un valor a pesos colombianos. Acepta número crudo o texto con
 *  separadores de miles ("1.500.000") y coma decimal ("1.500.000,50"). */
function fmtPesos(v) {
  let s = String(v == null ? '' : v).trim().replace(/[^\d.,-]/g, '');
  s = s.replace(/\./g, '').replace(',', '.'); // quita miles y normaliza decimal
  const n = Number(s);
  if (!isFinite(n) || !n) return '';
  return '$' + n.toLocaleString('es-CO');
}

/**
 * Tarjeta de un contrato ya generado, con la información precisa y concisa
 * parseada de form_data (misma lógica del visor de la app de contratos):
 * valor conciliado, fecha del hecho, pago (banco/cuenta), firmas y estado.
 */
function itemContratoGenerado(row) {
  const fd = row.form_data || {};
  const tipo = CONTRATO_TIPO_LABEL[fd.contractKind] || 'Contrato';
  const conPdf = Boolean(row.pdf_storage_path);
  const confirmado = row.status === 'confirmed' || row.status === 'confirmado';

  const item = document.createElement('div');
  item.className = 'contrato-item';

  // Encabezado: tipo + estado.
  const estadoTxt = confirmado ? '✓ Confirmado' : (conPdf ? '📄 Con PDF' : '✏️ Borrador');
  const estadoCls = confirmado ? 'ci-ok' : (conPdf ? 'ci-pdf' : 'ci-borr');
  const head = document.createElement('div');
  head.className = 'contrato-item-head';
  head.innerHTML = `<span class="contrato-tipo">📑 ${escC(tipo)}</span>` +
    `<span class="contrato-estado ${estadoCls}">${estadoTxt}</span>`;
  item.appendChild(head);

  // Detalles precisos y concisos.
  const filas = [];
  if (fd.nombre || fd.cedula) {
    filas.push(`👤 ${escC(fd.nombre || 'Compareciente')}${fd.cedula ? ' · C.C. ' + escC(fd.cedula) : ''}`);
  }
  const pesos = fmtPesos(fd.valor);
  if (fd.valorTexto || pesos) {
    filas.push(`💰 ${escC(fd.valorTexto || '')}${pesos ? ' <b>(' + pesos + ')</b>' : ''}`);
  }
  if (fd.fecha) filas.push(`🗓️ Hecho: ${escC(fd.fecha)}`);
  if (fd.banco || fd.cuenta) {
    filas.push(`🏦 ${escC(fd.banco || '')}${fd.cuenta ? ' · cta ' + escC(fd.cuenta) : ''}`);
  }
  if (fd.titularCuenta) filas.push(`💳 Titular: ${escC(fd.titularCuenta)}`);
  filas.push(`✍️ Firmas: compareciente ${fd.firmaCompareciente ? '✅' : '⬜'} · conductor ${fd.firmaConductor ? '✅' : '⬜'}`);

  const det = document.createElement('div');
  det.className = 'contrato-item-det';
  det.innerHTML = filas.map(f => `<div>${f}</div>`).join('');
  item.appendChild(det);

  // Acciones.
  const acc = document.createElement('div');
  acc.className = 'contrato-item-acc';
  if (conPdf) {
    const ver = document.createElement('button');
    ver.type = 'button';
    ver.className = 'secondary';
    ver.textContent = '👁 Ver PDF';
    ver.addEventListener('click', () => verPdfContrato(row.pdf_storage_path));
    acc.appendChild(ver);
  }
  const seguir = document.createElement('a');
  seguir.href = `contratos/formularios2.html?caso=${encodeURIComponent(row.id)}&token=${encodeURIComponent(row.public_token)}`;
  seguir.className = 'secondary';
  seguir.style.textDecoration = 'none';
  seguir.textContent = conPdf ? '✏️ Editar / re-firmar' : '✍ Continuar';
  acc.appendChild(seguir);
  item.appendChild(acc);

  return item;
}
