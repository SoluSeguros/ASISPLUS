/**
 * vehiculos-empresa.js
 * Alta de vehículos por parte de la propia transportadora, desde su portal.
 *
 * El parque automotor lo cargaba sólo la administración. Para la empresa eso
 * significa que un bus que entró ayer no existe en la app: sus siniestros salen
 * sin tipo, sin modelo y sin propietario, y hay que pedir el alta por fuera y
 * esperar. Aquí la empresa registra sus propios vehículos de dos maneras:
 *
 *   - uno a uno, con el formulario; o
 *   - muchos de golpe, con la plantilla de Excel (que trae una hoja EJEMPLO
 *     ya diligenciada y otra de instrucciones columna por columna).
 *
 * Lo que la empresa NO puede hacer es modificar ni borrar lo que ya está: eso
 * sigue siendo de la administración (política `empresa_insert_parque`). Y dar
 * de alta un vehículo no le muestra ni un caso más: los siniestros se filtran
 * por la EMPRESA que trae el caso, no por el parque.
 *
 * La limpieza final (placa en mayúscula y sin espacios, teléfonos sólo
 * dígitos, llave consecutiva, correo del afiliado heredado) la hace un trigger
 * en la base: el navegador ayuda a que se vea bien, pero no es quien garantiza
 * que entre bien.
 */

/* ------------------------------------------------------------------ *
 *  Las columnas: una sola definición para el formulario, la plantilla
 *  y el importador. Si mañana se agrega una, se agrega aquí y aparece
 *  en los tres sitios a la vez.
 * ------------------------------------------------------------------ */
const VEH_COLUMNAS = [
  {
    col: 'EMPRESA', campo: 'empresa',
    alias: ['EMPRESA', 'COMPANIA', 'AFILIADORA', 'COOPERATIVA'],
    ayuda: 'Nombre tal cual aparece arriba en tu portal. Si sólo administras una empresa, puedes dejar la columna vacía.',
    ejemplos: ['COOMETROPOL', 'COOINVETRANS']
  },
  {
    col: 'PLACA', campo: 'placa',
    alias: ['PLACA', 'PLACAS', 'PLACA VEHICULO', 'PLACA DEL VEHICULO'],
    obliga: true,
    ayuda: 'Obligatoria. Tres letras y tres números (ABC123). Da igual si la escribes con guion, con espacio o en minúscula: se guarda limpia.',
    ejemplos: ['EQS043', 'TPZ433']
  },
  {
    col: 'NUMERO INTERNO', campo: 'numero_interno',
    alias: ['NUMERO INTERNO', 'N INTERNO', 'NO INTERNO', 'INTERNO', 'NUMERO'],
    ayuda: 'El número con el que rueda el vehículo en la empresa.',
    ejemplos: ['75', '136']
  },
  {
    col: 'TIPO', campo: 'tipo',
    alias: ['TIPO', 'CLASE', 'TIPO VEHICULO', 'TIPO DE VEHICULO'],
    ayuda: 'BUS, BUSETA, BUSETON, MICROBUS, AUTOMOVIL, CAMIONETA, CAMPERO, TAXI, ESCALERA…',
    ejemplos: ['BUS', 'MICROBUS']
  },
  {
    col: 'MODELO', campo: 'modelo',
    alias: ['MODELO', 'ANO', 'ANIO', 'ANO MODELO', 'MODELO ANO'],
    ayuda: 'El año del vehículo, cuatro cifras.',
    ejemplos: ['2018', '2021']
  },
  {
    col: 'PROPIETARIO', campo: 'propietario',
    alias: ['PROPIETARIO', 'NOMBRE PROPIETARIO', 'DUENO', 'TITULAR'],
    ayuda: 'Nombre y apellidos de quien figura como dueño.',
    ejemplos: ['JUAN PEREZ GOMEZ', 'MARIA LOPEZ RUIZ']
  },
  {
    col: 'CEDULA PROPIETARIO', campo: 'cedula_propietario',
    alias: ['CEDULA PROPIETARIO', 'CC PROPIETARIO', 'DOCUMENTO PROPIETARIO', 'IDENTIFICACION PROPIETARIO'],
    ayuda: 'Sólo números, sin puntos ni comas.',
    ejemplos: ['71234567', '43987654']
  },
  {
    col: 'TELEFONO PROPIETARIO', campo: 'telefono_propietario',
    alias: ['TELEFONO PROPIETARIO', 'CELULAR PROPIETARIO', 'TEL PROPIETARIO', 'CONTACTO PROPIETARIO'],
    ayuda: 'El celular al que se le avisa cuando su vehículo tiene un siniestro. Sólo números.',
    ejemplos: ['3001234567', '3109876543']
  },
  {
    col: 'CONDUCTOR', campo: 'nombre_conductor',
    alias: ['CONDUCTOR', 'NOMBRE CONDUCTOR', 'NOMBRE DEL CONDUCTOR'],
    ayuda: 'El conductor habitual, si lo hay. No es obligatorio.',
    ejemplos: ['PEDRO RAMIREZ', '']
  },
  {
    col: 'CEDULA CONDUCTOR', campo: 'cedula_conductor',
    alias: ['CEDULA CONDUCTOR', 'CC CONDUCTOR', 'DOCUMENTO CONDUCTOR'],
    ayuda: 'Sólo números.',
    ejemplos: ['98765432', '']
  },
  {
    col: 'TELEFONO CONDUCTOR', campo: 'telefono_conductor',
    alias: ['TELEFONO CONDUCTOR', 'CELULAR CONDUCTOR', 'TEL CONDUCTOR'],
    ayuda: 'Sólo números.',
    ejemplos: ['3151112233', '']
  },
  {
    col: 'ASEGURADORA', campo: 'aseguradora',
    alias: ['ASEGURADORA', 'SEGURO', 'COMPANIA DE SEGUROS'],
    ayuda: 'LA EQUIDAD, SEGUROS BOLIVAR, SURA…',
    ejemplos: ['LA EQUIDAD', 'SEGUROS BOLIVAR']
  }
];

/** Cuántas filas se aceptan de un solo archivo (una flota no llega ni cerca). */
const VEH_MAX_IMPORTAR = 1000;

/** Hojas de la plantilla que NUNCA se importan (son material de lectura). */
const VEH_HOJAS_IGNORADAS = ['EJEMPLO', 'INSTRUCCIONES'];

/* ------------------------------------------------------------------ *
 *  Desde dónde se está dando de alta
 * ------------------------------------------------------------------ *
 *  'portal' — la transportadora en su portal: sus empresas, su flota.
 *  'parque' — la administración en "Parque automotor": las 22 empresas y
 *             los 1.785 vehículos.
 *
 *  Es la MISMA maquinaria (el mismo formulario, la misma plantilla, el
 *  mismo importador); lo único que cambia es de dónde salen las empresas
 *  que se pueden elegir y contra qué flota se compara una placa repetida.
 *  Se fija en cada clic, que es cuando se sabe en qué pantalla está la
 *  persona.
 */
let _vehContexto = 'portal';

/** Las empresas del portal que se está viendo (la propia o la de la vista previa). */
function vehEmpresasDelPortal() {
  // En la vista previa del admin, las empresas son las del usuario que se
  // está mirando: la plantilla que se descargue desde ahí tiene que ser la
  // misma que recibiría él.
  if (state.empresaVistaAdmin) return state.empresaVistaAdmin.slice();
  const p = state.perfil || {};
  const lista = (p.empresas && p.empresas.length) ? p.empresas : (p.empresa ? [p.empresa] : []);
  return lista.map(e => String(e || '').trim()).filter(Boolean);
}

/** Todas las empresas que hoy tienen vehículos en el parque. */
function vehEmpresasDelParque() {
  const vistas = new Set();
  (state.parqueRows || []).forEach(v => {
    const e = String(v.empresa || '').trim();
    if (e) vistas.add(e);
  });
  return [...vistas].sort((a, b) => a.localeCompare(b, 'es'));
}

/** La flota contra la que se comprueba si una placa ya está registrada. */
function vehFlotaActual() {
  return _vehContexto === 'parque'
    ? (state.parqueRows || [])
    : (state.empresaVehiculosLista || []);
}

/** Dónde se escribe el resultado de un cargue. */
function _vehCajaResultado() {
  return _vehContexto === 'parque' ? els.parqueResultado : els.empresaVehResultado;
}

/* ------------------------------------------------------------------ *
 *  Normalización
 * ------------------------------------------------------------------ */

/** Texto comparable: sin tildes, sin signos, en mayúscula y sin dobles espacios. */
function _vehClave(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

/** La placa como la guarda la base: mayúsculas, sin espacios ni guiones. */
function normalizarPlacaVeh(s) {
  return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * ¿Tiene forma de placa colombiana? Las 1.770 del parque son ABC123; las motos
 * son ABC12D. No se usa para bloquear a una persona que está mirando el
 * formulario —puede insistir—, pero sí para apartar filas en una importación
 * masiva, donde nadie va a revisar la fila 47.
 */
function placaBienFormada(placa) {
  return /^[A-Z]{3}[0-9]{2}[A-Z0-9]$/.test(normalizarPlacaVeh(placa));
}

/* ------------------------------------------------------------------ *
 *  Permisos y estado de la pantalla
 * ------------------------------------------------------------------ */

/** Las empresas en las que se puede dar de alta desde donde se está. */
function vehEmpresasPermitidas() {
  return _vehContexto === 'parque' ? vehEmpresasDelParque() : vehEmpresasDelPortal();
}

/**
 * ¿Se puede escribir desde donde se está?
 *
 * En el parque, el administrador. En el portal, la transportadora y sólo en
 * EL SUYO: el admin que entra por "👁 Ver su portal" está mirando una vista
 * previa. Si pudiera agregar desde ahí vería una pantalla distinta de la que
 * ve la empresa, que es justo lo que esa vista promete no hacer. Para eso
 * tiene los mismos botones en "Parque automotor", donde además alcanza a las
 * 22 empresas y no sólo a las de un usuario.
 */
function puedeAgregarVehiculos() {
  if (_vehContexto === 'parque') return !!(state.perfil && state.perfil.rol === 'admin');
  return !!(state.perfil && state.perfil.rol === 'empresa' &&
    !state.empresaVistaAdmin && vehEmpresasDelPortal().length);
}

/**
 * Pone la barra de alta del portal como corresponda a quién mira.
 *
 * En la vista previa del admin la barra SE VE, con los botones de escribir
 * apagados. Esconderla sería mentir sobre lo que la empresa tiene delante, y
 * esa pantalla existe precisamente para saberlo. La plantilla sí se puede
 * bajar: leer no es escribir, y es la forma de revisar qué le va a llegar.
 */
function actualizarAccionesVehiculos() {
  _vehContexto = 'portal';
  const esPreview = !!state.empresaVistaAdmin;
  const hayEmpresas = vehEmpresasDelPortal().length > 0;
  const mostrar = hayEmpresas && (esPreview || puedeAgregarVehiculos());

  if (els.empresaVehAlta) els.empresaVehAlta.classList.toggle('hidden', !mostrar);
  [els.btnVehNuevo, els.btnVehImportar].forEach(b => {
    if (!b) return;
    b.disabled = esPreview;
    b.title = esPreview ? 'Así lo ve la empresa. Desde la vista previa no se escribe: usa "Parque automotor".' : '';
  });
  if (els.empresaVehNota) {
    els.empresaVehNota.classList.toggle('hidden', esPreview);
  }
  if (els.empresaVehNotaPreview) {
    els.empresaVehNotaPreview.classList.toggle('hidden', !esPreview);
  }
  if (els.empresaVehResultado) els.empresaVehResultado.classList.add('hidden');
}

/**
 * Pone la barra de alta de "Parque automotor" (administración). Se llama al
 * entrar a esa vista y al salir de ella.
 */
function actualizarAccionesParque(visible) {
  _vehContexto = 'parque';
  const mostrar = visible && puedeAgregarVehiculos();
  if (els.parqueBox) els.parqueBox.classList.toggle('hidden', !mostrar);
  if (!mostrar && els.parqueResultado) els.parqueResultado.classList.add('hidden');
}

/* ------------------------------------------------------------------ *
 *  Formulario: un vehículo a la vez
 * ------------------------------------------------------------------ */

/** Campos del modal, en el mismo orden de VEH_COLUMNAS (sin EMPRESA). */
const VEH_FORM = {
  placa: 'vehPlaca',
  numero_interno: 'vehInterno',
  tipo: 'vehTipo',
  modelo: 'vehModelo',
  propietario: 'vehPropietario',
  cedula_propietario: 'vehCedulaProp',
  telefono_propietario: 'vehTelProp',
  nombre_conductor: 'vehConductor',
  cedula_conductor: 'vehCedulaCond',
  telefono_conductor: 'vehTelCond',
  aseguradora: 'vehAseguradora'
};

/** Abre el formulario en blanco, con el selector de empresa si hace falta. */
function abrirVehiculoNuevo() {
  if (!puedeAgregarVehiculos()) return;
  const empresas = vehEmpresasPermitidas();

  Object.values(VEH_FORM).forEach(id => { if (els[id]) els[id].value = ''; });
  if (els.vehPlacaAviso) els.vehPlacaAviso.textContent = '';
  if (els.formVehiculoNuevo) delete els.formVehiculoNuevo.dataset.insistio;

  // Con una sola empresa no hay nada que elegir: se dice cuál es y ya.
  if (els.vehEmpresa) {
    els.vehEmpresa.innerHTML = empresas
      .map(e => `<option value="${escBandeja(e)}">${escBandeja(e)}</option>`).join('');
    els.vehEmpresa.value = empresas[0] || '';
  }
  // En el parque se elige siempre: la administración no tiene "su" empresa.
  const elegir = _vehContexto === 'parque' || empresas.length > 1;
  if (els.vehEmpresaWrap) els.vehEmpresaWrap.classList.toggle('hidden', !elegir);
  if (els.vehNuevoSub) {
    els.vehNuevoSub.textContent = !elegir
      ? (empresas[0] || '')
      : (_vehContexto === 'parque'
          ? 'Elige la empresa a la que pertenece.'
          : 'Elige en cuál de tus empresas queda registrado.');
  }

  if (els.vehiculoNuevoModal) els.vehiculoNuevoModal.classList.add('show');
  if (els.vehPlaca) els.vehPlaca.focus();
}

function cerrarVehiculoNuevo() {
  if (els.vehiculoNuevoModal) els.vehiculoNuevoModal.classList.remove('show');
}

/** ¿Esa placa ya está en la flota que se tiene a la vista? */
function _vehYaRegistrado(placa, empresa) {
  const p = normalizarPlacaVeh(placa);
  return vehFlotaActual().find(v =>
    normalizarPlacaVeh(v.placa) === p &&
    (!empresa || String(v.empresa || '').trim() === String(empresa).trim()));
}

/** Toma el formulario, valida y da de alta el vehículo. */
async function guardarVehiculoNuevo(evento) {
  if (evento) evento.preventDefault();
  if (!puedeAgregarVehiculos()) return;

  const empresas = vehEmpresasPermitidas();
  const empresa = (_vehContexto === 'parque' || empresas.length > 1)
    ? String((els.vehEmpresa && els.vehEmpresa.value) || '').trim()
    : (empresas[0] || '');
  if (!empresa) { showStatus('Elige la empresa del vehículo.', 'error'); return; }

  const placa = normalizarPlacaVeh(els.vehPlaca ? els.vehPlaca.value : '');
  if (!placa) {
    if (els.vehPlacaAviso) els.vehPlacaAviso.textContent = 'La placa es obligatoria.';
    if (els.vehPlaca) els.vehPlaca.focus();
    return;
  }

  const repetido = _vehYaRegistrado(placa, empresa);
  if (repetido) {
    if (els.vehPlacaAviso) {
      els.vehPlacaAviso.textContent =
        `${placa} ya está registrada${repetido.numero_interno ? ` (interno ${repetido.numero_interno})` : ''}.`;
    }
    return;
  }

  // Una placa rara no se bloquea: se avisa y, si insiste, se graba. Puede ser
  // un remolque o una placa de otro país, y nadie quiere pelear con el
  // formulario teniendo el vehículo enfrente.
  if (!placaBienFormada(placa) && els.formVehiculoNuevo &&
      els.formVehiculoNuevo.dataset.insistio !== placa) {
    els.formVehiculoNuevo.dataset.insistio = placa;
    if (els.vehPlacaAviso) {
      els.vehPlacaAviso.textContent =
        `"${placa}" no tiene forma de placa (ABC123). Revísala; si está bien, vuelve a tocar "Registrar vehículo".`;
    }
    return;
  }

  const fila = { empresa: empresa, placa: placa };
  Object.keys(VEH_FORM).forEach(campo => {
    if (campo === 'placa') return;
    const el = els[VEH_FORM[campo]];
    const v = el ? String(el.value || '').trim() : '';
    if (v) fila[campo] = v;
  });

  try {
    showLoader(true);
    const { error } = await db.from('parque_automotor').insert([fila]);
    if (error) throw error;
    cerrarVehiculoNuevo();
    await _vehRecargarListado();
    pintarResultadoVeh(
      `<b>${escBandeja(placa)}</b> quedó registrado en ${escBandeja(empresa)}. ` +
      'Desde ahora sus siniestros van a traer el tipo, el modelo y el propietario.',
      'ok');
    showStatus(`Vehículo ${placa} registrado.`, 'ok');
  } catch (error) {
    showStatus('No se pudo registrar: ' + _vehMensajeError(error), 'error');
  } finally {
    showLoader(false);
  }
}

/**
 * Vuelve a bajar la lista que se está viendo para que el vehículo recién
 * registrado aparezca. En el parque se recarga el maestro completo (también
 * refresca la copia que usa el formulario de casos sin internet); en el portal,
 * la flota y la ficha de siniestralidad, que cuenta sobre el total de vehículos.
 */
async function _vehRecargarListado() {
  if (_vehContexto === 'parque') {
    if (typeof cargarParqueYMostrar === 'function') await cargarParqueYMostrar();
    // cargarParqueYMostrar vuelve a dibujar la vista y por eso repinta la barra.
    actualizarAccionesParque(true);
    return;
  }
  await cargarMisVehiculos();
  renderFichaEmpresaPropia();
  _vehContexto = 'portal';
}

/** Traduce los errores de la base a algo que se pueda leer. */
function _vehMensajeError(error) {
  const m = String((error && (error.message || error.details)) || error || '');
  if (/row-level security|violates row-level/i.test(m)) {
    return 'tu usuario no tiene permiso para registrar vehículos en esa empresa.';
  }
  return m.replace(/^.*?:\s*/, '') || 'error desconocido.';
}

/* ------------------------------------------------------------------ *
 *  Plantilla de importación
 * ------------------------------------------------------------------ */

/**
 * Descarga la plantilla en Excel con tres hojas:
 *
 *   VEHICULOS     — los encabezados, vacía: es donde se escribe.
 *   EJEMPLO       — los mismos encabezados con dos filas diligenciadas.
 *   INSTRUCCIONES — qué va en cada columna y cuál es obligatoria.
 *
 * Los ejemplos van en su propia hoja a propósito: si estuvieran en VEHICULOS,
 * el primer cargue subiría dos buses inventados.
 */
function descargarPlantillaVehiculos() {
  const empresas = vehEmpresasPermitidas();
  const encabezados = VEH_COLUMNAS.map(c => c.col);

  const wb = XLSX.utils.book_new();

  // Hoja 1: para llenar. Sólo el encabezado.
  const hoja = XLSX.utils.aoa_to_sheet([encabezados]);
  hoja['!cols'] = encabezados.map(h => ({ wch: Math.max(h.length + 4, 16) }));
  XLSX.utils.book_append_sheet(wb, hoja, 'VEHICULOS');

  // Hoja 2: el ejemplo. Dos filas, una completa y otra con lo mínimo.
  const ejemplo = [encabezados];
  for (let i = 0; i < 2; i++) {
    ejemplo.push(VEH_COLUMNAS.map(c => {
      if (c.campo === 'empresa') return empresas[Math.min(i, empresas.length - 1)] || c.ejemplos[i] || '';
      return c.ejemplos[i] != null ? c.ejemplos[i] : '';
    }));
  }
  const hojaEj = XLSX.utils.aoa_to_sheet(ejemplo);
  hojaEj['!cols'] = hoja['!cols'];
  XLSX.utils.book_append_sheet(wb, hojaEj, 'EJEMPLO');

  // Hoja 3: las reglas, columna por columna.
  const instr = [
    ['CÓMO LLENAR ESTA PLANTILLA'],
    [''],
    ['1.', 'Escribe los vehículos en la hoja VEHICULOS, uno por fila, debajo de los encabezados.'],
    ['2.', 'No cambies ni borres los encabezados: son los que dicen qué dato va en cada columna.'],
    ['3.', 'La hoja EJEMPLO es sólo para mirar. No se sube: puedes dejarla tal cual.'],
    ['4.', 'Lo único obligatorio es la PLACA. Lo demás se puede completar después.'],
    ['5.', 'Si una placa ya está registrada, el sistema la salta y te lo dice. No se duplica nada.'],
    ['6.', 'Cuando termines, guarda el archivo y súbelo con el botón "Importar desde Excel".'],
    [''],
    ['Empresas en las que puedes registrar:',
      empresas.length > 8
        ? `Las ${empresas.length} del parque. Escribe el nombre EXACTO, igual que aparece en la columna EMPRESA de la tabla.`
        : (empresas.join('  ·  ') || '(ninguna)')],
    [''],
    ['COLUMNA', '¿OBLIGATORIA?', 'QUÉ SE ESCRIBE', 'EJEMPLO']
  ];
  VEH_COLUMNAS.forEach(c => {
    instr.push([c.col, c.obliga ? 'SÍ' : 'No', c.ayuda, c.ejemplos[0] || '']);
  });
  const hojaIns = XLSX.utils.aoa_to_sheet(instr);
  hojaIns['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 78 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, hojaIns, 'INSTRUCCIONES');

  const nombre = (_vehContexto === 'parque' ? 'PARQUE'
    : (empresas.length === 1 ? empresas[0] : 'MI_EMPRESA'))
    .replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase();
  XLSX.writeFile(wb, `PLANTILLA_VEHICULOS_${nombre}.xlsx`);
  showStatus('Plantilla descargada. Llena la hoja VEHICULOS y vuelve a subirla.', 'ok');
}

/* ------------------------------------------------------------------ *
 *  Importación
 * ------------------------------------------------------------------ */

/** La hoja donde está la información: VEHICULOS, o la primera que no sea de lectura. */
function _vehHojaDeDatos(wb) {
  const nombres = wb.SheetNames || [];
  const buscada = nombres.find(n => _vehClave(n) === 'VEHICULOS');
  if (buscada) return buscada;
  return nombres.find(n => !VEH_HOJAS_IGNORADAS.includes(_vehClave(n))) || nombres[0] || '';
}

/** Mapa {encabezado del archivo → campo de la base}, tolerante con sinónimos. */
function _vehMapaColumnas(encabezados) {
  const mapa = {};
  (encabezados || []).forEach(h => {
    const clave = _vehClave(h);
    const col = VEH_COLUMNAS.find(c => c.alias.some(a => _vehClave(a) === clave));
    if (col) mapa[h] = col.campo;
  });
  return mapa;
}

/**
 * Convierte el archivo en tres montones: lo que se va a dar de alta, lo que ya
 * estaba y lo que hay que revisar. Nada se escribe aquí: esto sólo decide.
 */
function _vehClasificarFilas(filas, mapa) {
  const empresas = vehEmpresasPermitidas();
  const nuevos = [], repetidos = [], errores = [];
  const vistas = new Set();   // placas que ya venían antes en el MISMO archivo

  filas.forEach((cruda, i) => {
    const linea = i + 2;   // +1 por el encabezado, +1 porque Excel cuenta desde 1
    const fila = {};
    Object.keys(mapa).forEach(h => {
      const v = String(cruda[h] == null ? '' : cruda[h]).trim();
      if (v) fila[mapa[h]] = v;
    });

    // Fila en blanco (Excel deja cientos al final): no es un error, no existe.
    if (!Object.keys(fila).length) return;

    const placa = normalizarPlacaVeh(fila.placa || '');
    const empresa = String(fila.empresa || '').trim() || (empresas.length === 1 ? empresas[0] : '');

    if (!placa) {
      errores.push({ linea, placa: '(vacía)', motivo: 'Le falta la placa.' });
      return;
    }
    if (!placaBienFormada(placa)) {
      errores.push({ linea, placa, motivo: 'No tiene forma de placa (se espera ABC123).' });
      return;
    }
    if (!empresa) {
      errores.push({ linea, placa, motivo: 'Le falta la empresa y administras varias.' });
      return;
    }
    if (!empresas.some(e => _vehClave(e) === _vehClave(empresa))) {
      errores.push({ linea, placa, motivo: `"${empresa}" no es una de tus empresas.` });
      return;
    }
    // El nombre se guarda como lo tiene la base, no como lo escribieron.
    fila.empresa = empresas.find(e => _vehClave(e) === _vehClave(empresa));
    fila.placa = placa;

    const huella = fila.empresa + '|' + placa;
    if (vistas.has(huella)) {
      errores.push({ linea, placa, motivo: 'Está repetida más arriba en el mismo archivo.' });
      return;
    }
    vistas.add(huella);

    const ya = _vehYaRegistrado(placa, fila.empresa);
    if (ya) { repetidos.push({ linea, placa, empresa: fila.empresa }); return; }

    nuevos.push(fila);
  });

  return { nuevos, repetidos, errores };
}

/**
 * Lee el Excel y da de alta lo que falte.
 *
 * El alta va en un solo insert; si la base rechaza el lote (una placa que se
 * coló entre la lectura y la escritura, por ejemplo), se reintenta fila por
 * fila para que un vehículo malo no tumbe los otros noventa.
 */
async function importarVehiculosDesdeArchivo(archivo) {
  if (!archivo || !puedeAgregarVehiculos()) return;

  try {
    showLoader(true);
    const buffer = await archivo.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });

    const nombreHoja = _vehHojaDeDatos(wb);
    if (!nombreHoja) throw new Error('El archivo no tiene ninguna hoja con datos.');
    // raw:false para que las cédulas y los teléfonos lleguen como texto; si no,
    // Excel los entrega como número y 3001234567 puede salir en notación
    // científica.
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { defval: '', raw: false });
    if (!filas.length) throw new Error(`La hoja "${nombreHoja}" está vacía.`);
    if (filas.length > VEH_MAX_IMPORTAR) {
      throw new Error(`El archivo trae ${formatNumber(filas.length)} filas y el máximo por cargue es ${formatNumber(VEH_MAX_IMPORTAR)}.`);
    }

    const mapa = _vehMapaColumnas(Object.keys(filas[0] || {}));
    if (!Object.values(mapa).includes('placa')) {
      throw new Error('No encontré la columna PLACA. Usa la plantilla: el botón "Descargar plantilla" la genera con los encabezados correctos.');
    }

    const { nuevos, repetidos, errores } = _vehClasificarFilas(filas, mapa);

    let insertados = 0;
    const fallidos = [];
    if (nuevos.length) {
      const { error } = await db.from('parque_automotor').insert(nuevos);
      if (!error) {
        insertados = nuevos.length;
      } else {
        // Reintento uno a uno: se pierde velocidad, no información.
        for (const fila of nuevos) {
          const r = await db.from('parque_automotor').insert([fila]);
          if (r.error) fallidos.push({ linea: '—', placa: fila.placa, motivo: _vehMensajeError(r.error) });
          else insertados++;
        }
      }
    }

    if (insertados) await _vehRecargarListado();
    pintarResumenImportacion({
      hoja: nombreHoja,
      leidas: filas.length,
      insertados: insertados,
      repetidos: repetidos,
      errores: errores.concat(fallidos)
    });
  } catch (error) {
    pintarResultadoVeh('No se pudo leer el archivo: ' + escBandeja(_vehMensajeError(error)), 'error');
  } finally {
    showLoader(false);
  }
}

/* ------------------------------------------------------------------ *
 *  Resultado en pantalla
 * ------------------------------------------------------------------ */

/** Un mensaje suelto en el panel de resultado. */
function pintarResultadoVeh(html, tipo) {
  const caja = _vehCajaResultado();
  if (!caja) return;
  caja.className = `veh-resultado ${tipo === 'error' ? 'es-error' : 'es-ok'}`;
  caja.innerHTML = html;
  caja.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/**
 * El resumen del cargue. Importa tanto lo que entró como lo que NO: una
 * importación que dice "listo" y deja 12 filas afuera en silencio es peor que
 * una que falla.
 */
function pintarResumenImportacion(r) {
  const lista = items => items.slice(0, 30).map(e =>
    `<li>Fila ${escBandeja(e.linea)} · <b>${escBandeja(e.placa)}</b>${e.motivo ? ' — ' + escBandeja(e.motivo) : ''}</li>`).join('') +
    (items.length > 30 ? `<li>…y ${formatNumber(items.length - 30)} más.</li>` : '');

  let html = `<b>Hoja "${escBandeja(r.hoja)}": ${formatNumber(r.leidas)} fila(s) leídas.</b><ul class="veh-res-tot">`;
  html += `<li>✅ <b>${formatNumber(r.insertados)}</b> vehículo(s) registrados.</li>`;
  if (r.repetidos.length) html += `<li>↩️ <b>${formatNumber(r.repetidos.length)}</b> ya estaban registrados (no se duplicaron).</li>`;
  if (r.errores.length) html += `<li>⚠️ <b>${formatNumber(r.errores.length)}</b> no se cargaron.</li>`;
  html += '</ul>';

  if (r.errores.length) {
    html += `<details open><summary>Qué revisar en el archivo</summary><ul class="veh-res-det">${lista(r.errores)}</ul></details>`;
  }
  if (r.repetidos.length) {
    html += `<details><summary>Las que ya estaban</summary><ul class="veh-res-det">${lista(r.repetidos)}</ul></details>`;
  }

  pintarResultadoVeh(html, r.errores.length && !r.insertados ? 'error' : 'ok');
  showStatus(
    r.insertados
      ? `${formatNumber(r.insertados)} vehículo(s) registrados.`
      : 'No se registró ningún vehículo nuevo.',
    r.insertados ? 'ok' : 'error');
}

/* ------------------------------------------------------------------ *
 *  Cableado
 * ------------------------------------------------------------------ */

/**
 * Engancha un trío de botones (agregar · plantilla · importar) a un contexto.
 * El contexto se fija en el clic, no al cablear: es ahí cuando se sabe desde
 * qué pantalla está actuando la persona.
 */
function _vehCablearTrio(contexto, btnNuevo, btnPlantilla, btnImportar, input) {
  if (btnNuevo) {
    btnNuevo.addEventListener('click', () => { _vehContexto = contexto; abrirVehiculoNuevo(); });
  }
  if (btnPlantilla) {
    btnPlantilla.addEventListener('click', () => { _vehContexto = contexto; descargarPlantillaVehiculos(); });
  }
  if (btnImportar && input) {
    btnImportar.addEventListener('click', () => { _vehContexto = contexto; input.click(); });
    input.addEventListener('change', async event => {
      const archivo = event.target.files && event.target.files[0];
      event.target.value = '';   // permite volver a subir el mismo archivo corregido
      _vehContexto = contexto;
      await importarVehiculosDesdeArchivo(archivo);
    });
  }
}

function initVehiculosEmpresa() {
  // Portal de la empresa.
  _vehCablearTrio('portal', els.btnVehNuevo, els.btnVehPlantilla, els.btnVehImportar, els.inputVehExcel);
  // Parque automotor (administración): la misma maquinaria, todas las empresas.
  _vehCablearTrio('parque', els.btnParqueNuevo, els.btnParquePlantilla, els.btnParqueImportar, els.inputParqueExcel);

  if (els.btnVehNuevoCerrar) els.btnVehNuevoCerrar.addEventListener('click', cerrarVehiculoNuevo);
  if (els.formVehiculoNuevo) els.formVehiculoNuevo.addEventListener('submit', guardarVehiculoNuevo);
  if (els.vehiculoNuevoModal) {
    els.vehiculoNuevoModal.addEventListener('click', event => {
      if (event.target === els.vehiculoNuevoModal) cerrarVehiculoNuevo();
    });
  }
  // Al corregir la placa desaparece el aviso anterior (y el "insiste" se
  // reevalúa con la placa nueva, no con la que ya se confirmó).
  if (els.vehPlaca) {
    els.vehPlaca.addEventListener('input', () => {
      if (els.vehPlacaAviso) els.vehPlacaAviso.textContent = '';
    });
  }

}
