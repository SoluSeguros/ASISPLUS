/**
 * detalle.js
 * Detalle de una asistencia (al hacer clic en una fila del Registro de
 * Asistencias). Muestra todos los campos y, si hay coordenadas, un mapa del
 * lugar del siniestro (Google Maps embebido, sin API key).
 */

// Organización del detalle en secciones lógicas (orden pensado para leerse).
// Cada campo: [clave real en los datos, etiqueta amigable].
const DETALLE_SECCIONES = [
  {
    titulo: 'Siniestro',
    campos: [
      ['FECHA DEL SINIESTRO', 'Fecha'],
      ['HORA DEL SINIESTRO', 'Hora'],
      ['FECHA DE REPORTE', 'Fecha de reporte'],
      ['HORA DE REPORTE', 'Hora de reporte'],
      ['MES DEL REPORTE DEL SINIESTRO', 'Mes de reporte'],
      ['DIRECCION DEL LUGAR DEL SINIESTRO', 'Dirección del lugar'],
      ['RUTA', 'Ruta'],
      ['COORDENADAS ASISTENCIA', 'Coordenadas'],
      ['COORDENADAS DEL SINIESTRO', 'Coordenadas del siniestro'],
      ['HIPOTESIS', 'Hipótesis (causa probable)'],
      ['ATRIBUCION HIPOTESIS', 'Atribución de la hipótesis'],
      ['CODIGO HIPOTESIS', 'Código de hipótesis'],
      ['CATEGORIZACION DEL INCIDENTE', 'Categorización'],
      ['GRAVEDAD DEL SINIESTRO', 'Gravedad'],
      ['LESIONADOS', 'Lesionados'],
      ['RESPONSABILIDAD DEL CONDUCTOR', 'Responsabilidad del conductor'],
      ['ESTADO DEL SINIESTRO', 'Estado del siniestro']
    ]
  },
  {
    titulo: 'Vehículo',
    campos: [
      ['EMPRESA', 'Empresa'],
      ['PLACA VEHICULO', 'Placa'],
      ['NUMERO INTERNO VEHICULO', 'N.º interno'],
      ['TIPO DE VEHICULO', 'Tipo de vehículo'],
      ['PROPIETARIO', 'Propietario'],
      ['ASEGURADORA', 'Aseguradora']
    ]
  },
  {
    titulo: 'Conductor',
    campos: [
      ['NOMBRE CONDUCTOR', 'Nombre'],
      ['CEDULA DEL CONDUCTOR', 'Cédula'],
      ['NUMERO DE CONTACTO', 'Número de contacto']
    ]
  },
  {
    titulo: 'Afiliado',
    campos: [
      ['AFILIADOS', 'Afiliado'],
      ['CORREO AFILIADO', 'Correo'],
      ['CELULAR AFILIADO', 'Celular']
    ]
  },
  {
    titulo: 'Versiones y daños',
    campos: [
      ['VERSION CONDUCTOR', 'Versión del conductor'],
      ['VERSION ASISTENTE', 'Versión del asistente'],
      ['DESCRIPCION DAÑOS EMPRESA', 'Descripción de daños']
    ]
  },
  {
    titulo: 'Gestión de la asistencia',
    campos: [
      ['REPORTADO POR', 'Reportado por'],
      ['USUARIO ASISTENCIA', 'Usuario asistencia'],
      ['USUARIO LOGISTICA', 'Usuario logística'],
      ['NOMBRE ASISTENTE EN SITIO', 'Asistente en sitio'],
      ['FECHA Y HORA DE LLEGADA', 'Llegada al sitio (check-in)'],
      ['HORA DE ATENCION', 'Hora de atención'],
      ['HORA FIN ATENCION', 'Fin de atención'],
      ['HORA Y FECHA DE ACCION USUARIO', 'Fecha/hora de acción']
    ]
  }
];

// Campos de un tercero a mostrar en el detalle (orden legible). El primero
// (NOMBRE COMPLETO) se usa como título de la tarjeta.
const TERCERO_CAMPOS = [
  ['TIPO DE DOCUMENTO', 'Tipo de documento'],
  ['NUMERO DOCUMENTO', 'N.º de documento'],
  ['DE DONDE ES EL DOCUMENTO', 'Expedido en'],
  ['NUMERO CEULAR CONTACTO', 'Celular'],
  ['NUMERO CONTACTO 2', 'Otro contacto'],
  ['CORREO', 'Correo'],
  ['PLACA', 'Placa'],
  ['MARCA', 'Marca'],
  ['COLOR', 'Color'],
  ['TIPO DE VEHICULO', 'Tipo de vehículo'],
  ['CUENTA CON ASEGURDADORA', '¿Cuenta con aseguradora?'],
  ['NOMBRE ASEGURADORA', 'Aseguradora'],
  ['SOAT', 'SOAT'],
  ['RTM', 'RTM'],
  ['POLIZAS', 'Pólizas'],
  ['TIENE ALGUN TIPO DE LESION', '¿Tiene lesión?'],
  ['TIPO DE LESION', 'Tipo de lesión'],
  ['DESEA CONCILIAR EN SITIO', '¿Desea conciliar en sitio?'],
  ['TIPO DE CONCILIACION', 'Tipo de conciliación'],
  ['CONDICION TERCERO', 'Condición'],
  ['TERCERO ES MENOR', '¿Es menor de edad?'],
  ['REPRESENTANTE NOMBRE', 'Representante'],
  ['REPRESENTANTE DOCUMENTO', 'Documento del representante'],
  ['REPRESENTANTE PARENTESCO', 'Parentesco'],
  ['ASISTENTE', 'Asistente'],
  ['HORA Y FECHA  ASISTENTE', 'Fecha/hora del asistente']
];

/** Construye una sección del detalle con su título y una grilla de campos. */
function construirSeccionDetalle(titulo, items) {
  const sec = document.createElement('div');
  sec.className = 'detalle-seccion';
  const h = document.createElement('h4');
  h.className = 'detalle-seccion-tit';
  h.textContent = titulo;
  sec.appendChild(h);

  const grid = document.createElement('div');
  grid.className = 'detalle-grid';
  items.forEach(x => {
    const item = document.createElement('div');
    item.className = 'detalle-item';
    const lab = document.createElement('div');
    lab.className = 'detalle-lab';
    lab.textContent = x.label;
    const v = document.createElement('div');
    v.className = 'detalle-val';
    v.textContent = x.val;
    item.appendChild(lab);
    item.appendChild(v);
    grid.appendChild(item);
  });
  sec.appendChild(grid);
  return sec;
}

/** Añade una grilla de campos (label/valor) a un contenedor. */
function agregarGrid(cont, items) {
  const grid = document.createElement('div');
  grid.className = 'detalle-grid';
  items.forEach(x => {
    const item = document.createElement('div');
    item.className = 'detalle-item';
    const lab = document.createElement('div');
    lab.className = 'detalle-lab';
    lab.textContent = x.label;
    const v = document.createElement('div');
    v.className = 'detalle-val';
    v.textContent = x.val;
    item.appendChild(lab);
    item.appendChild(v);
    grid.appendChild(item);
  });
  cont.appendChild(grid);
}

/** ¿Tiene valor y es una columna visible? */
function campoConValor(obj, key) {
  const val = obj[key];
  return val !== undefined && val !== null && String(val).trim() !== '' && columnaVisible(key);
}

/** Construye la tarjeta de un tercero involucrado (clic para ficha completa). */
function construirTerceroCard(tercero, idx) {
  const card = document.createElement('div');
  card.className = 'tercero-card';

  const nombre = String(tercero['NOMBRE COMPLETO'] || '').trim() || `Tercero ${idx + 1}`;
  const tipo = String(tercero['TIPO DE TERCERO'] || '').trim();
  const badge = tipo ? `<span class="tercero-tipo-badge">${escBandeja(etiquetaTipoTercero(tipo))}</span>` : '';
  const cab = document.createElement('div');
  cab.className = 'tercero-card-tit';
  // Escapa el nombre (viene de datos del usuario) para no romper el marcado ni inyectar HTML.
  cab.innerHTML = `<span>${idx + 1}. ${escBandeja(nombre)} ${badge}</span><span class="tercero-toggle">Ver ficha completa ▾</span>`;
  card.appendChild(cab);

  // Campos principales (resumen).
  const principales = TERCERO_CAMPOS
    .filter(([key]) => campoConValor(tercero, key))
    .map(([key, label]) => ({ label, val: tercero[key], key }));
  agregarGrid(card, principales);

  // Ficha completa: todos los demás campos con valor (oculta hasta hacer clic).
  // Excluye de la ficha completa lo que ya se muestra arriba (nombre en el
  // título y tipo en el badge), para no repetirlo.
  const yaMostrados = new Set(principales.map(x => x.key).concat(['NOMBRE COMPLETO', 'TIPO DE TERCERO']));
  const resto = Object.keys(tercero)
    .filter(k => !yaMostrados.has(k) && campoConValor(tercero, k))
    .map(k => ({ label: k, val: tercero[k] }));

  const full = document.createElement('div');
  full.className = 'tercero-full hidden';
  if (resto.length) {
    agregarGrid(full, resto);
  } else {
    const p = document.createElement('div');
    p.className = 'tercero-estado';
    p.textContent = 'No hay más datos registrados para este tercero.';
    full.appendChild(p);
  }
  card.appendChild(full);

  const toggle = cab.querySelector('.tercero-toggle');
  cab.style.cursor = 'pointer';
  cab.addEventListener('click', () => {
    const oculto = full.classList.toggle('hidden');
    toggle.textContent = oculto ? 'Ver ficha completa ▾' : 'Ocultar ficha ▴';
  });

  return card;
}

/**
 * Carga desde Supabase los terceros relacionados con la asistencia (misma KEY)
 * y los añade al contenedor del detalle. Se ejecuta después de pintar el resto.
 */
async function cargarTercerosDelDetalle(key, cont) {
  const sec = document.createElement('div');
  sec.className = 'detalle-seccion';
  const h = document.createElement('h4');
  h.className = 'detalle-seccion-tit';
  h.textContent = 'Terceros involucrados';
  sec.appendChild(h);
  const estado = document.createElement('div');
  estado.className = 'tercero-estado';
  estado.textContent = 'Buscando terceros relacionados…';
  sec.appendChild(estado);
  cont.appendChild(sec);

  if (!key) {
    estado.textContent = 'Esta asistencia no tiene KEY para cruzar con terceros.';
    return;
  }

  try {
    const { data, error } = await db
      .from('registro_terceros')
      .select('datos')
      .eq('key', key);
    if (error) throw error;

    const terceros = (data || []).map(r => r.datos);
    if (!terceros.length) {
      h.textContent = 'Terceros involucrados (0)';
      estado.textContent = 'No se encontraron terceros relacionados con esta asistencia.';
      return;
    }

    h.textContent = `Terceros involucrados (${terceros.length})`;
    estado.remove();
    terceros.forEach((t, i) => {
      const card = construirTerceroCard(t, i);
      sec.appendChild(card);
      agregarEvidenciaTerceroCard(card, t);
    });
  } catch (e) {
    estado.textContent = 'No se pudieron cargar los terceros: ' + (e.message || e);
  }
}

/** Extrae {lat, lng} de un texto tipo "6.165469, -75.616498". */
function parseCoords(texto) {
  const m = String(texto || '').match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
  if (!m) return null;
  return { lat: m[1], lng: m[2] };
}

/** Abre el detalle de una asistencia (fila = objeto de datos). */
function abrirDetalleAsistencia(row) {
  const d = row || {};

  els.detalleAsisTitulo.textContent =
    `${d['EMPRESA'] || 'Asistencia'} · ${d['PLACA VEHICULO'] || ''}`.trim();
  els.detalleAsisSub.textContent = [
    d['FECHA DEL SINIESTRO'], d['HORA DEL SINIESTRO'], d['NOMBRE CONDUCTOR']
  ].filter(Boolean).join('  ·  ');

  // --- Mapa ---
  const coords = parseCoords(d['COORDENADAS ASISTENCIA']) || parseCoords(d['COORDENADAS DEL SINIESTRO']);
  const wrap = els.detalleAsisMapaWrap;
  wrap.innerHTML = '';
  if (coords) {
    const iframe = document.createElement('iframe');
    iframe.src = `https://maps.google.com/maps?q=${coords.lat},${coords.lng}&z=16&hl=es&output=embed`;
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    wrap.appendChild(iframe);

    const link = document.createElement('a');
    link.href = `https://www.google.com/maps?q=${coords.lat},${coords.lng}`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.className = 'mapa-link';
    link.textContent = `📍 Abrir en Google Maps  (${coords.lat}, ${coords.lng})`;
    wrap.appendChild(link);
  } else {
    wrap.innerHTML = '<div class="mapa-sin">📍 Sin coordenadas registradas para mostrar el mapa.</div>';
  }

  // --- Campos organizados por secciones ---
  const cont = els.detalleAsisCampos;
  cont.innerHTML = '';

  const tieneValor = k => {
    const val = d[k];
    return val !== undefined && val !== null && String(val).trim() !== '' && columnaVisible(k);
  };
  const mostrados = new Set();

  DETALLE_SECCIONES.forEach(sec => {
    const items = sec.campos
      .filter(([key]) => tieneValor(key))
      .map(([key, label]) => ({ label, val: d[key], key }));
    if (!items.length) return;
    items.forEach(x => mostrados.add(x.key));
    cont.appendChild(construirSeccionDetalle(sec.titulo, items));
  });

  // Cualquier campo restante (no clasificado) va en "Otros datos".
  const otros = Object.keys(d)
    .filter(k => !mostrados.has(k) && k !== 'TERCEROS' && tieneValor(k))
    .map(k => ({ label: k, val: d[k], key: k }));
  if (otros.length) cont.appendChild(construirSeccionDetalle('Otros datos', otros));

  els.detalleAsisModal.classList.add('show');

  // --- Terceros relacionados (cruce por KEY, desde Supabase) ---
  cargarTercerosDelDetalle(getKey(d, 'KEY'), cont);
}

/** Cierra el detalle y libera el mapa. */
function cerrarDetalleAsistencia() {
  els.detalleAsisModal.classList.remove('show');
  els.detalleAsisMapaWrap.innerHTML = '';
}
