/**
 * equidad.js
 * Formulario de declaración de Equidad Seguros, integrado bajo /equidad/.
 *
 * Es la app que el asistente diligencia en el sitio y que firma el conductor;
 * genera el PDF sobre el formato de la aseguradora. Vivía suelta en
 * soluseguros/formatoequidad y había que abrirla aparte, volver a escribir la
 * placa, la fecha, el lugar y los terceros, y recordar el enlace. Ahora entra
 * por el menú y, desde un caso, llega con todo eso ya puesto.
 *
 * Lo de aquí es solo armar ese prellenado: la app vive en equidad/index.html,
 * mismo origen y misma sesión, igual que el módulo de contratos.
 */

/** ¿Quién ve el formulario? El asistente es quien lo diligencia en la vía. */
function rolVeEquidad() {
  const rol = (state.perfil && state.perfil.rol) || '';
  return rol === 'asistente' || rol === 'gestor' || rol === 'admin';
}

/**
 * Las claves son las del formulario (los data-key de equidad/index.html).
 * Solo se llenan las que el caso puede responder sin inventar: el resto
 * —marca, color, capacidad, póliza, relato, responsabilidad— las pone el
 * asistente, que es quien está mirando el vehículo y hablando con la gente.
 */
function construirPrefillEquidad(caso, terceros) {
  const d = (caso && caso.datos) || {};
  const pre = { casoOrigen: (caso && caso.numero_caso) || '' };

  const poner = (clave, valor) => {
    const v = String(valor == null ? '' : valor).trim();
    if (v) pre[clave] = v;
  };

  // --- El hecho ---
  // La fecha va en día/mes/año, que es como la escribe el formato de Equidad.
  poner('fechaSiniestro', fechaDMADeCampo('FECHA DEL SINIESTRO', d['FECHA DEL SINIESTRO']));
  poner('fechaReporte', fechaDMADeCampo('FECHA DE REPORTE', d['FECHA DE REPORTE']));
  poner('horaHecho', d['HORA DEL SINIESTRO']);
  poner('lugarAccidente', d['DIRECCION DEL LUGAR DEL SINIESTRO']);
  poner('direccionHecho', d['DIRECCION DEL LUGAR DEL SINIESTRO']);
  poner('ciudad', d['CIUDAD DEL SINIESTRO']);
  poner('municipio', d['CIUDAD DEL SINIESTRO']);

  // El relato pide el día, el mes y el año por separado.
  const f = fechaDeTexto(d['FECHA DEL SINIESTRO']);
  if (f) {
    poner('diaHecho', String(f.getDate()).padStart(2, '0'));
    poner('mesHecho', EQUIDAD_MESES[f.getMonth()]);
    poner('anioHecho', String(f.getFullYear()));
  }

  // --- El vehículo asegurado ---
  poner('placa', d['PLACA VEHICULO']);
  poner('tipo', d['TIPO DE VEHICULO']);
  poner('asegurado', d['PROPIETARIO'] || d['EMPRESA']);
  poner('tomador', d['EMPRESA']);
  poner('danosVehiculo', d['DESCRIPCION DAÑOS EMPRESA']);

  // Lo que el parque sabe y el caso no (modelo del vehículo, propietario con
  // su cédula y teléfono). Se busca por placa normalizada, igual que el
  // buscador del listado: en el parque hay placas con espacios.
  const veh = _vehiculoDelParque(d['PLACA VEHICULO']);
  if (veh) {
    poner('modelo', veh.modelo);
    poner('tipo', d['TIPO DE VEHICULO'] || veh.tipo);
    poner('asegurado', d['PROPIETARIO'] || veh.propietario || d['EMPRESA']);
    poner('nitAsegurado', veh.cedula_propietario);
    poner('telefono1', veh.telefono_propietario);
  }

  // --- El conductor: es quien declara y quien firma ---
  poner('yoNombre', d['NOMBRE CONDUCTOR']);
  poner('declaranteNumDoc', d['CEDULA DEL CONDUCTOR']);
  poner('documentoConductor', d['CEDULA DEL CONDUCTOR']);
  poner('conductorTelefono', d['NUMERO DE CONTACTO']);
  if (String(d['CEDULA DEL CONDUCTOR'] || '').trim()) {
    pre.declaranteTipoDoc = 'CC';
    pre.conductorTipoDoc = 'CC';
    pre.calidad = 'CONDUCTOR';
  }

  // --- El relato: lo que ya contó el conductor en el caso ---
  poner('relato', d['VERSION CONDUCTOR'] || d['OBSERVACIONES']);

  // --- Terceros: los dos primeros que caben en el formato ---
  // La direccion y el centro medico del herido no se piden al registrar un
  // tercero, asi que esas casillas quedan vacias para que el asistente las
  // llene en el sitio. Los nombres de columna son los de la base, con el
  // "NUMERO CEULAR CONTACTO" tal como viene escrito desde el AppSheet.
  (terceros || []).slice(0, 2).forEach((t, i) => {
    const td = t.datos || t || {};
    const p = 't' + (i + 1);
    poner(p + 'Conductor', td['NOMBRE COMPLETO']);
    poner(p + 'Cedula', td['NUMERO DOCUMENTO']);
    poner(p + 'Telefono', td['NUMERO CEULAR CONTACTO'] || td['NUMERO CONTACTO 2']);
    poner(p + 'Placas', td['PLACA']);
    poner(p + 'Marca', td['MARCA']);
    poner(p + 'Color', td['COLOR']);
    poner(p + 'Danos', td['DESCRIPCION DEL DAÑO A BIEN']);
    poner(p + 'Asegurado', td['NOMBRE ASEGURADORA']);
    poner(p + 'Propietario', td['PROPIETARIO O POSSEDOR DEL VEHICULO']);
  });

  // --- Lesionados: los terceros que reportaron lesión ---
  const heridos = (terceros || []).filter(t => {
    const td = t.datos || t || {};
    return String(td['TIENE ALGUN TIPO DE LESION'] || '').toUpperCase() === 'SI';
  }).slice(0, 3);
  heridos.forEach((t, i) => {
    const td = t.datos || t || {};
    const p = 'l' + (i + 1);
    poner(p + 'Nombre', td['NOMBRE COMPLETO']);
    poner(p + 'Cedula', td['NUMERO DOCUMENTO']);
    poner(p + 'Telefono', td['NUMERO CEULAR CONTACTO'] || td['NUMERO CONTACTO 2']);
    poner(p + 'Lesiones', td['TIPO DE LESION']);
  });
  if (heridos.length) {
    pre.lesionados = 'SI';
    pre.cuantosLesionados = String(heridos.length);
  }

  return pre;
}

/** Los meses como los escribe el relato del formato ("octubre"). */
const EQUIDAD_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * El vehículo del parque que corresponde a esa placa.
 *
 * Compara sin espacios ni guiones: en el parque hay 121 placas escritas como
 * "TPZ 433" y en el caso llegan como "TPZ433".
 */
function _vehiculoDelParque(placa) {
  const p = String(placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!p) return null;
  const lista = (state.parqueRows && state.parqueRows.length)
    ? state.parqueRows
    : (state.empresaVehiculosLista || []);
  return lista.find(v =>
    String(v.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === p) || null;
}

/** Los terceros que ya están cargados para este caso. */
async function _tercerosDelCaso(caso) {
  const clave = (caso && caso.key) || (caso && caso.datos && getKey(caso.datos, 'KEY')) || '';
  if (!clave) return [];
  try {
    const { data, error } = await db.from('registro_terceros')
      .select('datos').eq('key', clave);
    if (error) throw error;
    return data || [];
  } catch (_) {
    // Sin señal o sin permiso: el formulario abre igual, solo que sin terceros.
    return [];
  }
}

/** Codifica el prellenado y abre el formulario. */
function _irAEquidad(prefill, numeroCaso) {
  const partes = [];
  if (prefill) {
    try {
      partes.push('prefill=' + btoa(unescape(encodeURIComponent(JSON.stringify(prefill))))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
    } catch (_) {
      showStatus('No se pudo preparar el formulario con los datos del caso.', 'error');
    }
  }
  if (numeroCaso) partes.push('volver=' + encodeURIComponent(numeroCaso));
  window.location.href = 'equidad/index.html' + (partes.length ? '?' + partes.join('&') : '');
}

/** Abre el formulario en blanco (desde el menú). */
function abrirEquidad() {
  _irAEquidad(null, '');
}

/**
 * Abre el formulario con los datos del caso que se está atendiendo.
 *
 * Los terceros se consultan en el momento: el asistente los va registrando
 * mientras atiende, y lo que vale es lo que haya cuando toca el botón.
 */
async function abrirEquidadDelCaso() {
  const caso = state.casoActual;
  if (!caso) return;
  try {
    showLoader(true);
    const terceros = await _tercerosDelCaso(caso);
    _irAEquidad(construirPrefillEquidad(caso, terceros), caso.numero_caso || '');
  } finally {
    showLoader(false);
  }
}
