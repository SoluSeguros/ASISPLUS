/**
 * empresa.js
 * Portal de solo lectura para el rol "empresa" (login autogestionable de una
 * compañía transportadora). Solo lectura: la RLS de Supabase ya filtra
 * parque_automotor y registro_asistencias por la empresa del perfil, así que
 * aquí no hace falta (ni se debe) volver a filtrar por empresa en el cliente.
 */

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
    if (els.empresaCasosCount) els.empresaCasosCount.textContent = `(${formatNumber((data || []).length)})`;
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4">Sin casos registrados.</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(c => {
      const d = c.datos || {};
      const fecha = d['FECHA DEL SINIESTRO'] || '—';
      const placa = d['PLACA VEHICULO'] || '—';
      return `
        <tr>
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
