/**
 * empresa.js
 * Portal de solo lectura para el rol "empresa" (login autogestionable de una
 * compañía transportadora). Solo lectura: la RLS de Supabase ya filtra
 * parque_automotor y registro_asistencias por la empresa del perfil, así que
 * aquí no hace falta (ni se debe) volver a filtrar por empresa en el cliente.
 */

/** Engancha el clic en una fila del historial (abre el detalle de ese caso) y el modal. */
function initEmpresaPortal() {
  if (els.empresaCasosBody) {
    const abrirDesdeFila = event => {
      const fila = event.target.closest('tr[data-idx]');
      if (!fila) return;
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
      if (event.type === 'keydown') event.preventDefault(); // evita el scroll con espacio
      const caso = (state.empresaCasosLista || [])[Number(fila.dataset.idx)];
      if (caso) verDetalleCasoEmpresa(caso);
    };
    els.empresaCasosBody.addEventListener('click', abrirDesdeFila);
    els.empresaCasosBody.addEventListener('keydown', abrirDesdeFila);
  }
  if (els.btnEmpresaCasoCerrar) els.btnEmpresaCasoCerrar.addEventListener('click', cerrarDetalleCasoEmpresa);
  if (els.empresaCasoModal) {
    els.empresaCasoModal.addEventListener('click', event => {
      if (event.target === els.empresaCasoModal) cerrarDetalleCasoEmpresa();
    });
  }
}

/** Abre el portal de empresa: parque propio + historial de casos propio. */
async function abrirEmpresaPortal() {
  ocultarPantallas();
  els.empresaCard.classList.remove('hidden');
  const nombreEmpresa = (state.perfil && state.perfil.empresa) || 'Mi empresa';
  if (els.empresaNombreTitulo) els.empresaNombreTitulo.textContent = nombreEmpresa;
  marcarUbicacion('empresaCard', nombreEmpresa);
  await Promise.all([cargarMisVehiculos(), cargarMisCasos()]);
}

/** Carga el listado de vehículos de la empresa (RLS ya filtra por empresa). */
async function cargarMisVehiculos() {
  const tbody = els.empresaVehiculosBody;
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';
  try {
    const { data, error } = await db
      .from('parque_automotor')
      .select('placa, numero_interno, tipo')
      .order('placa', { ascending: true });
    if (error) throw error;
    if (els.empresaVehiculosCount) els.empresaVehiculosCount.textContent = `(${formatNumber((data || []).length)})`;
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3">Sin vehículos registrados.</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(v => `
      <tr>
        <td>${escBandeja(v.placa || '—')}</td>
        <td>${escBandeja(v.numero_interno || '—')}</td>
        <td>${escBandeja(v.tipo || '—')}</td>
      </tr>`).join('');
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="3">Error: ${escBandeja(error.message || String(error))}</td></tr>`;
  }
}

/** Carga el historial de casos de la empresa (RLS ya filtra por EMPRESA). */
async function cargarMisCasos() {
  const tbody = els.empresaCasosBody;
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
  try {
    const { data, error } = await db
      .from('registro_asistencias')
      .select('numero_caso, estado, datos, creado_en')
      .order('creado_en', { ascending: false });
    if (error) throw error;
    state.empresaCasosLista = data || [];
    if (els.empresaCasosCount) els.empresaCasosCount.textContent = `(${formatNumber((data || []).length)})`;
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4">Sin casos registrados.</td></tr>';
      return;
    }
    // Cada fila abre el detalle completo del caso (clic o Enter/Espacio).
    tbody.innerHTML = data.map((c, i) => {
      const d = c.datos || {};
      const fecha = d['FECHA DEL SINIESTRO'] || '—';
      const placa = d['PLACA VEHICULO'] || '—';
      return `
        <tr class="fila-clic" data-idx="${i}" tabindex="0">
          <td>${escBandeja(c.numero_caso || '—')}</td>
          <td>${escBandeja(fecha)}</td>
          <td>${escBandeja(placa)}</td>
          <td>${escBandeja(c.estado || '—')}</td>
        </tr>`;
    }).join('');
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="4">Error: ${escBandeja(error.message || String(error))}</td></tr>`;
  }
}

/** Muestra el detalle de un caso del historial (mismo patrón de "fila" que el resto de la app). */
function verDetalleCasoEmpresa(caso) {
  const d = caso.datos || {};
  const fila = (lab, val) => val
    ? `<div class="detalle-item"><div class="detalle-lab">${lab}</div><div class="detalle-val">${escBandeja(String(val))}</div></div>`
    : '';

  const idVeh = [d['PLACA VEHICULO'], d['NUMERO INTERNO VEHICULO'] ? `Interno #${d['NUMERO INTERNO VEHICULO']}` : '']
    .filter(Boolean).join(' · ');
  const fechaHora = [d['FECHA DEL SINIESTRO'], d['HORA DEL SINIESTRO']].filter(Boolean).join('  ');

  if (els.empresaCasoTitulo) els.empresaCasoTitulo.textContent = caso.numero_caso ? `Caso N.º ${caso.numero_caso}` : 'Caso histórico';
  if (els.empresaCasoSub) els.empresaCasoSub.textContent = caso.estado || '';

  if (els.empresaCasoBody) {
    els.empresaCasoBody.innerHTML = `
      <h4 class="detalle-seccion-tit">Vehículo</h4>
      <div class="detalle-grid">
        ${fila('Vehículo', idVeh)}
        ${fila('Tipo', d['TIPO DE VEHICULO'])}
        ${fila('Lugar de impacto', d['LUGAR DE IMPACTO'])}
        ${fila('Conductor', d['NOMBRE CONDUCTOR'])}
      </div>

      <h4 class="detalle-seccion-tit">Siniestro</h4>
      <div class="detalle-grid">
        ${fila('Fecha y hora', fechaHora)}
        ${fila('Ruta', d['RUTA'])}
        ${fila('Dirección del lugar', d['DIRECCION DEL LUGAR DEL SINIESTRO'])}
        ${fila('Gravedad', d['GRAVEDAD DEL SINIESTRO'])}
        ${fila('Responsabilidad del conductor', d['RESPONSABILIDAD DEL CONDUCTOR'])}
        ${fila('Descripción de los daños', d['DESCRIPCION DAÑOS EMPRESA'])}
        ${fila('Observaciones', d['OBSERVACIONES'])}
      </div>
    `;
  }
  if (els.empresaCasoModal) els.empresaCasoModal.classList.add('show');
}

function cerrarDetalleCasoEmpresa() {
  if (els.empresaCasoModal) els.empresaCasoModal.classList.remove('show');
}
