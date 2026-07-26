/**
 * fotos.js
 * Set de fotos del sitio tomadas por el asistente. Cada foto se marca con una
 * "marca de agua" incrustada (ASIS PLUS + fecha/hora + GPS) usando un canvas,
 * y se sube a Supabase Storage (bucket privado "fotos-casos"). Las rutas se
 * guardan en datos['FOTOS SITIO'] del caso.
 */

const BUCKET_FOTOS = 'fotos-casos';

/** Registra los eventos de tomar/elegir foto (una sola vez). */
function initFotos() {
  els.btnTomarFoto.addEventListener('click', tomarFotoSitio);
  els.btnElegirFoto.addEventListener('click', () => els.inputFoto.click());
  els.inputFoto.addEventListener('change', e => {
    const archivos = [...e.target.files];
    e.target.value = ''; // permite volver a elegir la misma
    procesarFotosSitio(archivos);
  });
}

/** Abre la cámara (web/móvil); si no hay, cae al selector de archivos. */
async function tomarFotoSitio() {
  if (!camaraDisponible()) { els.inputFoto.click(); return; }
  const res = await abrirCamara();
  if (res === 'galeria') { els.inputFoto.click(); return; }
  if (res instanceof File) procesarFotosSitio([res]);
}

/** Marca de tiempo legible con hora (siempre incluye hh:mm). */
function selloFechaHora() {
  const n = new Date();
  const p = x => String(x).padStart(2, '0');
  return `${p(n.getDate())}/${p(n.getMonth() + 1)}/${n.getFullYear()} ${p(n.getHours())}:${p(n.getMinutes())}`;
}

/** Nombre único de archivo para la foto. */
function nombreArchivoFoto() {
  return `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

/** Divide un texto en varias líneas que quepan en maxWidth (máx 3). */
function envolverTexto(ctx, texto, maxWidth) {
  const palabras = String(texto).split(/\s+/);
  const lineas = [];
  let linea = '';
  palabras.forEach(p => {
    const prueba = linea ? linea + ' ' + p : p;
    if (ctx.measureText(prueba).width > maxWidth && linea) { lineas.push(linea); linea = p; }
    else linea = prueba;
  });
  if (linea) lineas.push(linea);
  return lineas.slice(0, 3);
}

/** Dibuja la marca de agua (banda inferior) sobre el canvas, con descripción opcional. */
function dibujarMarcaAgua(ctx, w, h, caso, desc) {
  const d = (caso && caso.datos) || {};
  // "ASIS PLUS · fecha" en una sola línea para ocupar menos espacio.
  const base = ['ASIS PLUS · ' + selloFechaHora()];
  const coords = String(d['COORDENADAS ASISTENCIA'] || '').trim();
  if (coords) base.push('GPS: ' + coords);

  // Fuente compacta (~2% del ancho) para que la banda no tape la foto.
  const fs = Math.max(12, Math.round(w * 0.020));
  ctx.textBaseline = 'top';

  // Descripción (opcional) al final, en fuente un poco más pequeña (máx. 2 líneas).
  const dfs = Math.round(fs * 0.9);
  ctx.font = `400 ${dfs}px Arial, sans-serif`;
  const descLineas = (desc && String(desc).trim()
    ? envolverTexto(ctx, String(desc).trim(), w - fs * 1.2)
    : []).slice(0, 2);

  const total = base.length + descLineas.length;
  const padX = Math.round(fs * 0.7);
  const padY = Math.round(fs * 0.35);
  const lh = Math.round(fs * 1.22);
  const boxH = lh * total + padY * 2;

  // Banda semitransparente al pie de la foto.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.fillRect(0, h - boxH, w, boxH);

  // Texto con sombra para legibilidad.
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 2;
  let y = h - boxH + padY;
  base.forEach(t => { ctx.font = `700 ${fs}px Arial, sans-serif`; ctx.fillText(t, padX, y); y += lh; });
  descLineas.forEach(t => { ctx.font = `400 ${dfs}px Arial, sans-serif`; ctx.fillText(t, padX, y); y += lh; });
  ctx.shadowBlur = 0;
}

/** Carga una imagen (File), la reduce y le incrusta la marca de agua. */
function marcarAguaFoto(file, caso, desc) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1600;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (Math.max(w, h) > MAX) {
        const s = MAX / Math.max(w, h);
        w = Math.round(w * s); h = Math.round(h * s);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      dibujarMarcaAgua(ctx, w, h, caso, desc);
      canvas.toBlob(
        b => b ? resolve(b) : reject(new Error('No se pudo procesar la imagen.')),
        'image/jpeg', 0.85
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagen no válida.')); };
    img.src = url;
  });
}

/** Procesa las fotos (de cámara o galería): marca de agua, subida y persistencia. */
async function procesarFotosSitio(archivos) {
  if (!archivos || !archivos.length) return;

  const caso = state.casoActual;
  if (!caso) return;
  if (!caso.datos) caso.datos = {};

  try {
    showLoader(true);
    let encoladas = 0;
    for (const file of archivos) {
      if (!file.type.startsWith('image/')) continue;
      const desc = (window.prompt('Descripción de la foto (opcional):', '') || '').trim();
      const blob = await marcarAguaFoto(file, caso, desc);
      const ruta = `${carpetaCaso(caso)}/${nombreArchivoFoto()}.jpg`;

      // Sube el archivo (o lo encola si no hay señal para subirlo al reconectar).
      const up = (typeof subirArchivoResiliente === 'function')
        ? await subirArchivoResiliente(BUCKET_FOTOS, ruta, blob, 'image/jpeg')
        : (await (async () => {
            const { error } = await db.storage.from(BUCKET_FOTOS).upload(ruta, blob, { contentType: 'image/jpeg', upsert: true });
            if (error) throw error; return { encolado: false };
          })());

      const lista = Array.isArray(caso.datos['FOTOS SITIO']) ? caso.datos['FOTOS SITIO'] : [];
      lista.push(ruta);
      caso.datos['FOTOS SITIO'] = lista;

      if (desc) {
        const mapa = descripcionesMapa(caso);
        mapa[ruta] = desc;
        caso.datos['DESCRIPCION FOTOS'] = mapa;
      }

      // Persiste cada foto ni bien se sube (append idempotente). Si no hay
      // señal, queda en la cola y se sube sola al reconectar.
      const per = (typeof persistirFotoResiliente === 'function')
        ? await persistirFotoResiliente(caso, ruta, desc)
        : (await (async () => {
            const { error: upErr } = await db.from('registro_asistencias').update({ datos: caso.datos }).eq('numero_caso', caso.numero_caso);
            if (upErr) throw upErr; return { encolado: false };
          })());

      if (up.encolado || per.encolado) encoladas++;
    }

    await cargarFotosCaso(caso);
    showStatus(encoladas
      ? `Foto(s) guardada(s) en el dispositivo (${encoladas} pendiente(s)). Se subirán al reconectar.`
      : 'Foto(s) agregada(s) al caso.', encoladas ? 'info' : 'ok');
  } catch (error) {
    showStatus('Error al subir la foto: ' + (error.message || error), 'error');
  } finally {
    showLoader(false);
  }
}

/** Muestra la galería de fotos del caso (con URLs firmadas temporales). */
async function cargarFotosCaso(caso) {
  const cont = els.fotosGaleria;
  const lista = Array.isArray(caso.datos && caso.datos['FOTOS SITIO']) ? caso.datos['FOTOS SITIO'] : [];
  els.fotosCasoTit.textContent = `Fotos del vehículo asegurado / sitio (${lista.length})`;
  cont.innerHTML = '';

  if (!lista.length) {
    cont.innerHTML = '<div class="tercero-estado">Aún no hay fotos. Usa "Tomar / agregar foto" en el sitio.</div>';
    return;
  }

  const puedeEditar = ['asistente', 'admin'].includes(state.perfil && state.perfil.rol);
  const mapa = descripcionesMapa(caso);

  for (const ruta of lista) {
    let src = '';
    try {
      const { data } = await db.storage.from(BUCKET_FOTOS).createSignedUrl(ruta, 3600);
      if (data && data.signedUrl) src = data.signedUrl;
    } catch (e) { /* sin url */ }

    const card = document.createElement('div');
    card.className = 'foto-card';

    const a = document.createElement('a');
    a.href = src; a.target = '_blank'; a.rel = 'noopener';
    const im = document.createElement('img');
    im.src = src; im.loading = 'lazy'; im.alt = mapa[ruta] || 'Foto del sitio';
    a.appendChild(im);
    card.appendChild(a);

    // Descripción editable de la foto.
    const desc = document.createElement('input');
    desc.type = 'text';
    desc.className = 'foto-desc';
    desc.placeholder = 'Descripción…';
    desc.value = mapa[ruta] || '';
    desc.disabled = !puedeEditar;
    desc.addEventListener('change', () => guardarDescFoto(caso, ruta, desc.value.trim()));
    card.appendChild(desc);

    if (puedeEditar) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'secondary foto-del';
      del.textContent = 'Eliminar';
      del.addEventListener('click', () => eliminarFoto(caso, ruta));
      card.appendChild(del);
    }
    cont.appendChild(card);
  }
}

/** Devuelve (o crea) el mapa ruta→descripción de las fotos del caso. */
function descripcionesMapa(caso) {
  const m = caso.datos && caso.datos['DESCRIPCION FOTOS'];
  return (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
}

/** Guarda la descripción (metadato) de una foto y la persiste (relee fresco
 *  para no pisar cambios de otro dispositivo; usa referencias nuevas). */
async function guardarDescFoto(caso, ruta, texto) {
  try {
    await persistirDatosCaso(caso, datos => {
      const prev = (datos['DESCRIPCION FOTOS'] && typeof datos['DESCRIPCION FOTOS'] === 'object' && !Array.isArray(datos['DESCRIPCION FOTOS']))
        ? datos['DESCRIPCION FOTOS'] : {};
      const mapa = Object.assign({}, prev); // nueva referencia → se detecta el cambio
      if (texto) mapa[ruta] = texto; else delete mapa[ruta];
      datos['DESCRIPCION FOTOS'] = mapa;
    });
    showStatus('Descripción de la foto guardada.', 'ok');
  } catch (e) {
    showStatus('Error al guardar la descripción: ' + (e.message || e), 'error');
  }
}

/** Elimina una foto del caso (Storage + lista + persistencia). Relee fresco. */
async function eliminarFoto(caso, ruta) {
  if (!window.confirm('¿Eliminar esta foto? No se puede deshacer.')) return;
  try {
    showLoader(true);
    await db.storage.from(BUCKET_FOTOS).remove([ruta]);
    await persistirDatosCaso(caso, datos => {
      datos['FOTOS SITIO'] = (Array.isArray(datos['FOTOS SITIO']) ? datos['FOTOS SITIO'] : []).filter(p => p !== ruta);
      if (datos['DESCRIPCION FOTOS'] && typeof datos['DESCRIPCION FOTOS'] === 'object') {
        const m = Object.assign({}, datos['DESCRIPCION FOTOS']); // nueva referencia
        delete m[ruta];
        datos['DESCRIPCION FOTOS'] = m;
      }
    });
    await cargarFotosCaso(caso);
    showStatus('Foto eliminada.', 'ok');
  } catch (error) {
    showStatus('Error al eliminar la foto: ' + (error.message || error), 'error');
  } finally {
    showLoader(false);
  }
}

/** Habilita o bloquea la captura de fotos (según el check-in). */
function habilitarFotos(on) {
  if (els.btnTomarFoto) els.btnTomarFoto.disabled = !on;
  if (els.btnElegirFoto) els.btnElegirFoto.disabled = !on;
  els.fotosGaleria.querySelectorAll('.foto-del').forEach(b => { b.disabled = !on; });
  els.fotosGaleria.querySelectorAll('.foto-desc').forEach(i => { i.disabled = !on; });
}
