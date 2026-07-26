/**
 * croquis.js
 * Editor de croquis del accidente sobre un lienzo (canvas). Permite ubicar
 * íconos de vehículos (bus, buseta, auto, moto, ciclista, peatón), dibujar
 * flechas de dirección, trazar a mano alzada y poner texto. Exporta una
 * imagen PNG (con marca de agua) que se guarda en Supabase Storage, y también
 * guarda el modelo de objetos (JSON) para poder re-editar el croquis.
 */

const ICONOS_CROQUIS = [
  { emoji: '🚌', nombre: 'Bus' },
  { emoji: '🚐', nombre: 'Buseta' },
  { emoji: '🚗', nombre: 'Auto' },
  { emoji: '🏍️', nombre: 'Moto' },
  { emoji: '🚲', nombre: 'Ciclista' },
  { emoji: '🚶', nombre: 'Peatón' },
  { emoji: '🚚', nombre: 'Camión' },
  { emoji: '💥', nombre: 'Impacto' },
  { emoji: '🤕', nombre: 'Lesionado' },
  { emoji: '🛑', nombre: 'Pare' },
  { emoji: '🚦', nombre: 'Semáforo' },
  { emoji: '🚧', nombre: 'Cono' }
];
const COLORES_CROQUIS = ['#e5322d', '#1455d9', '#111827', '#129d63'];

// Estado del editor
const cq = {
  canvas: null, ctx: null, W: 1000, H: 640,
  fondo: 'cruce',
  color: '#e5322d',
  herramienta: 'sel',
  anchoVia: 58,
  objetos: [],
  seleccionado: null,
  arrastrando: false,
  offset: { x: 0, y: 0 },
  trazoActual: null,
  flechaTemp: null,
  viaTemp: null,
  viaHandle: null,
  arrastrandoVia: false
};

/** Inicializa el editor: paleta, colores, herramientas y eventos del lienzo. */
function initCroquis() {
  cq.canvas = els.croquisCanvas;
  cq.ctx = cq.canvas.getContext('2d');

  // Paleta de íconos
  els.croquisIconos.innerHTML = '';
  ICONOS_CROQUIS.forEach(ic => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'croquis-icono';
    b.innerHTML = `<span>${ic.emoji}</span><small>${ic.nombre}</small>`;
    b.addEventListener('click', () => agregarIcono(ic.emoji));
    els.croquisIconos.appendChild(b);
  });

  // Colores
  els.croquisColores.innerHTML = '';
  COLORES_CROQUIS.forEach((c, i) => {
    const s = document.createElement('button');
    s.type = 'button';
    s.className = 'croquis-color' + (i === 0 ? ' active' : '');
    s.style.background = c;
    s.addEventListener('click', () => {
      cq.color = c;
      els.croquisColores.querySelectorAll('.croquis-color').forEach(x => x.classList.remove('active'));
      s.classList.add('active');
    });
    els.croquisColores.appendChild(s);
  });

  // Herramientas
  document.querySelectorAll('.croquis-tool').forEach(btn => {
    btn.addEventListener('click', () => {
      cq.herramienta = btn.dataset.tool;
      cq.seleccionado = null;
      document.querySelectorAll('.croquis-tool').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      redibujarCroquis();
    });
  });

  els.croquisCalle.addEventListener('click', agregarCalle);
  els.croquisBrujula.addEventListener('click', agregarBrujula);
  els.croquisGirarIzq.addEventListener('click', () => rotarSeleccion(-Math.PI / 12));
  els.croquisGirarDer.addEventListener('click', () => rotarSeleccion(Math.PI / 12));
  els.croquisAncho.addEventListener('change', () => { cq.anchoVia = Number(els.croquisAncho.value) || 58; });
  els.croquisFondo.addEventListener('change', () => { cq.fondo = els.croquisFondo.value; redibujarCroquis(); });
  els.croquisDeshacer.addEventListener('click', () => { cq.objetos.pop(); cq.seleccionado = null; redibujarCroquis(); });
  els.croquisBorrarSel.addEventListener('click', borrarSeleccion);
  els.croquisLimpiar.addEventListener('click', () => {
    if (window.confirm('¿Borrar todo el croquis?')) { cq.objetos = []; cq.seleccionado = null; redibujarCroquis(); }
  });

  // Eventos de puntero (mouse + táctil)
  cq.canvas.addEventListener('pointerdown', croquisDown);
  cq.canvas.addEventListener('pointermove', croquisMove);
  // El pointerup es global; se registra una sola vez aunque initCroquis se
  // llame más de una vez (evita handlers duplicados).
  if (!cq._pointerupWired) {
    window.addEventListener('pointerup', croquisUp);
    cq._pointerupWired = true;
  }
}

/** Convierte coordenadas del evento a coordenadas internas del lienzo. */
function posCroquis(e) {
  const r = cq.canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (cq.W / r.width),
    y: (e.clientY - r.top) * (cq.H / r.height)
  };
}

/* ---------------- Dibujo ---------------- */

function redibujarCroquis() {
  const ctx = cq.ctx;
  ctx.clearRect(0, 0, cq.W, cq.H);
  dibujarFondoCroquis();
  // Las vías construidas van SIEMPRE por debajo del resto.
  cq.objetos.filter(o => o.tipo === 'via').forEach(o => dibujarObjeto(o));
  if (cq.viaTemp) dibujarObjeto(cq.viaTemp);
  cq.objetos.filter(o => o.tipo !== 'via').forEach(o => dibujarObjeto(o));
  if (cq.flechaTemp) dibujarFlecha(cq.flechaTemp);
  if (cq.seleccionado) dibujarSeleccion(cq.seleccionado);
}

function dibujarFondoCroquis() {
  const ctx = cq.ctx, W = cq.W, H = cq.H, road = '#c7ced6';
  ctx.fillStyle = '#eef2f6';
  ctx.fillRect(0, 0, W, H);

  const dash = (x1, y1, x2, y2) => {
    ctx.setLineDash([18, 14]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
  };
  const bandaH = (cy = H / 2, h = H * 0.16) => { ctx.fillStyle = road; ctx.fillRect(0, cy - h / 2, W, h); dash(0, cy, W, cy); };
  const bandaV = (cx = W / 2, w = W * 0.16) => { ctx.fillStyle = road; ctx.fillRect(cx - w / 2, 0, w, H); dash(cx, 0, cx, H); };

  switch (cq.fondo) {
    case 'recta': bandaH(); break;
    case 'vertical': bandaV(); break;
    case 'cruce': bandaH(); bandaV(); break;
    case 'te': {
      const cy = H * 0.34, cx = W / 2, w = W * 0.16;
      bandaH(cy);
      ctx.fillStyle = road; ctx.fillRect(cx - w / 2, cy, w, H - cy); dash(cx, cy, cx, H);
      break;
    }
    case 'doble': {
      const cy = H / 2, h = H * 0.24;
      ctx.fillStyle = road; ctx.fillRect(0, cy - h / 2, W, h);
      dash(0, cy - h / 4, W, cy - h / 4); dash(0, cy + h / 4, W, cy + h / 4);
      ctx.fillStyle = '#bfe3c6'; ctx.fillRect(0, cy - 4, W, 8); // separador central
      break;
    }
    case 'glorieta': {
      bandaH(); bandaV();
      const R = Math.min(W, H) * 0.18;
      ctx.fillStyle = '#eef2f6'; ctx.beginPath(); ctx.arc(W / 2, H / 2, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = road; ctx.lineWidth = H * 0.09; ctx.beginPath(); ctx.arc(W / 2, H / 2, R, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#bfe3c6'; ctx.beginPath(); ctx.arc(W / 2, H / 2, R - H * 0.06, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'cruceSem': {
      bandaH(); bandaV();
      const bx1 = W * 0.42, bx2 = W * 0.58, by1 = H * 0.42, by2 = H * 0.58;
      const rhY = H * 0.42, rhH = H * 0.16, rvX = W * 0.42, rvW = W * 0.16;
      // Pasos peatonales (cebras) en las cuatro aproximaciones
      dibujarCebra(ctx, bx1 - 26, rhY, 20, rhH, true);
      dibujarCebra(ctx, bx2 + 6, rhY, 20, rhH, true);
      dibujarCebra(ctx, rvX, by1 - 26, rvW, 20, false);
      dibujarCebra(ctx, rvX, by2 + 6, rvW, 20, false);
      // Semáforos en las cuatro esquinas
      dibujarSemaforo(ctx, bx1 - 16, by1 - 16);
      dibujarSemaforo(ctx, bx2 + 16, by1 - 16);
      dibujarSemaforo(ctx, bx1 - 16, by2 + 16);
      dibujarSemaforo(ctx, bx2 + 16, by2 + 16);
      break;
    }
    case 'cebra': {
      bandaH();
      dibujarCebra(ctx, W * 0.5 - 14, H * 0.42, 28, H * 0.16, true);
      break;
    }
    case 'y': {
      ctx.strokeStyle = road; ctx.lineWidth = H * 0.14; ctx.lineCap = 'butt';
      const cx = W / 2, cy = H * 0.5;
      ctx.beginPath(); ctx.moveTo(cx, H); ctx.lineTo(cx, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(W * 0.18, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(W * 0.82, 0); ctx.stroke();
      dash(cx, H, cx, cy);
      break;
    }
    case 'curva': {
      ctx.lineCap = 'round';
      ctx.strokeStyle = road; ctx.lineWidth = H * 0.16;
      ctx.beginPath(); ctx.moveTo(0, H * 0.25); ctx.quadraticCurveTo(W * 0.55, H * 0.22, W * 0.62, H); ctx.stroke();
      ctx.setLineDash([18, 14]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, H * 0.25); ctx.quadraticCurveTo(W * 0.55, H * 0.22, W * 0.62, H); ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case 'diagonal': {
      ctx.strokeStyle = road; ctx.lineWidth = H * 0.14; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W, 0); ctx.lineTo(0, H); ctx.stroke();
      break;
    }
    case 'puente': {
      bandaH(); // vía inferior
      const px = W * 0.42, pw = W * 0.16;
      // Sombra del puente sobre la vía inferior
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(px + pw, H * 0.42, 12, H * 0.16);
      // Tablero del puente (vía superior) por encima
      ctx.fillStyle = '#b8c0ca'; ctx.fillRect(px, 0, pw, H);
      // Barandas
      ctx.fillStyle = '#5b6672'; ctx.fillRect(px - 3, 0, 4, H); ctx.fillRect(px + pw - 1, 0, 4, H);
      dash(px + pw / 2, 0, px + pw / 2, H);
      break;
    }
    case 'glorietaSem': {
      bandaH(); bandaV();
      const R = Math.min(W, H) * 0.18;
      ctx.fillStyle = '#eef2f6'; ctx.beginPath(); ctx.arc(W / 2, H / 2, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = road; ctx.lineWidth = H * 0.09; ctx.beginPath(); ctx.arc(W / 2, H / 2, R, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#bfe3c6'; ctx.beginPath(); ctx.arc(W / 2, H / 2, R - H * 0.06, 0, Math.PI * 2); ctx.fill();
      const d = R + 34;
      dibujarSemaforo(ctx, W / 2 + 22, H / 2 - d);
      dibujarSemaforo(ctx, W / 2 - 22, H / 2 + d);
      dibujarSemaforo(ctx, W / 2 - d, H / 2 - 22);
      dibujarSemaforo(ctx, W / 2 + d, H / 2 + 22);
      break;
    }
    case 'ciclo': {
      bandaH();
      const y = H * 0.42 + H * 0.16;
      ctx.fillStyle = '#c0603a'; ctx.fillRect(0, y, W, H * 0.055); // franja de ciclorruta
      ctx.fillStyle = '#fff'; ctx.fillRect(0, y - 2, W, 3);
      ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let x = 70; x < W; x += 170) ctx.fillText('🚲', x, y + H * 0.028);
      break;
    }
    // 'blanco': lienzo limpio
  }
}

/** Rectángulo con esquinas redondeadas (para las etiquetas de calle). */
function rectRedondeado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Dibuja un paso peatonal (cebra) dentro de un rectángulo. */
function dibujarCebra(ctx, x, y, w, h, vertical) {
  ctx.fillStyle = '#ffffff';
  const paso = 13, barra = 7;
  if (vertical) {
    for (let px = x; px < x + w; px += paso) ctx.fillRect(px, y, barra, h);
  } else {
    for (let py = y; py < y + h; py += paso) ctx.fillRect(x, py, w, barra);
  }
}

/** Dibuja un semáforo (caja negra con luces roja/amarilla/verde). */
function dibujarSemaforo(ctx, x, y) {
  const w = 15, h = 36;
  ctx.fillStyle = '#1f2937';
  rectRedondeado(ctx, x - w / 2, y - h / 2, w, h, 4); ctx.fill();
  [['#e5322d', -h * 0.28], ['#f5c000', 0], ['#22a35a', h * 0.28]].forEach(([c, dy]) => {
    ctx.beginPath(); ctx.arc(x, y + dy, 4.5, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
  });
}

function dibujarObjeto(o) {
  const ctx = cq.ctx;
  if (o.tipo === 'via') {
    const cx = (o.cx == null) ? (o.x1 + o.x2) / 2 : o.cx;
    const cy = (o.cy == null) ? (o.y1 + o.y2) / 2 : o.cy;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#c7ced6'; ctx.lineWidth = o.ancho;
    ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.quadraticCurveTo(cx, cy, o.x2, o.y2); ctx.stroke();
    ctx.setLineDash([18, 14]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.quadraticCurveTo(cx, cy, o.x2, o.y2); ctx.stroke();
    ctx.setLineDash([]);
    return;
  }
  if (o.tipo === 'icono') {
    ctx.save();
    ctx.translate(o.x, o.y);
    if (o.rot) ctx.rotate(o.rot);
    ctx.font = `${o.size}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(o.emoji, 0, 0);
    ctx.restore();
  } else if (o.tipo === 'texto') {
    ctx.font = `700 ${o.size}px Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = o.color;
    ctx.fillText(o.text, o.x, o.y);
  } else if (o.tipo === 'calle') {
    ctx.font = `700 ${o.size}px Arial, sans-serif`;
    const w = ctx.measureText(o.text).width, padX = 9, padY = 6;
    rectRedondeado(ctx, o.x, o.y, w + padX * 2, o.size + padY * 2, 7);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.strokeStyle = '#111827'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = o.color || '#111827';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(o.text, o.x + padX, o.y + padY);
  } else if (o.tipo === 'brujula') {
    const r = o.size;
    ctx.save();
    ctx.translate(o.x, o.y);
    if (o.rot) ctx.rotate(o.rot);
    // Círculo
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill();
    ctx.strokeStyle = '#111827'; ctx.lineWidth = 2; ctx.stroke();
    // Aguja norte (roja) y sur (gris)
    ctx.beginPath(); ctx.moveTo(0, -r * 0.55); ctx.lineTo(-r * 0.16, 0); ctx.lineTo(r * 0.16, 0); ctx.closePath();
    ctx.fillStyle = '#e5322d'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, r * 0.55); ctx.lineTo(-r * 0.16, 0); ctx.lineTo(r * 0.16, 0); ctx.closePath();
    ctx.fillStyle = '#6b7280'; ctx.fill();
    // Letras N / S / E / O
    ctx.fillStyle = '#111827'; ctx.font = `700 ${Math.round(r * 0.42)}px Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lr = r * 0.82;
    ctx.fillText('N', 0, -lr);
    ctx.fillText('S', 0, lr);
    ctx.fillText('E', lr, 0);
    ctx.fillText('O', -lr, 0);
    ctx.restore();
  } else if (o.tipo === 'flecha') {
    dibujarFlecha(o);
  } else if (o.tipo === 'trazo') {
    ctx.strokeStyle = o.color; ctx.lineWidth = o.ancho; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    o.puntos.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();
  }
}

function dibujarFlecha(f) {
  const ctx = cq.ctx;
  ctx.strokeStyle = f.color; ctx.fillStyle = f.color; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
  const ang = Math.atan2(f.y2 - f.y1, f.x2 - f.x1), s = 16;
  ctx.beginPath();
  ctx.moveTo(f.x2, f.y2);
  ctx.lineTo(f.x2 - s * Math.cos(ang - Math.PI / 6), f.y2 - s * Math.sin(ang - Math.PI / 6));
  ctx.lineTo(f.x2 - s * Math.cos(ang + Math.PI / 6), f.y2 - s * Math.sin(ang + Math.PI / 6));
  ctx.closePath(); ctx.fill();
}

function cajaObjeto(o) {
  if (o.tipo === 'icono') return { x: o.x - o.size / 2, y: o.y - o.size / 2, w: o.size, h: o.size };
  if (o.tipo === 'texto') {
    cq.ctx.font = `700 ${o.size}px Arial, sans-serif`;
    const w = cq.ctx.measureText(o.text).width;
    return { x: o.x, y: o.y, w, h: o.size };
  }
  if (o.tipo === 'calle') {
    cq.ctx.font = `700 ${o.size}px Arial, sans-serif`;
    const w = cq.ctx.measureText(o.text).width;
    return { x: o.x, y: o.y, w: w + 18, h: o.size + 12 };
  }
  if (o.tipo === 'brujula') {
    const r = o.size * 1.05;
    return { x: o.x - r, y: o.y - r, w: r * 2, h: r * 2 };
  }
  return null;
}

/** Punto medio SOBRE la curva de la vía (donde se muestra la manija para curvar). */
function viaPuntoMedio(o) {
  const cx = (o.cx == null) ? (o.x1 + o.x2) / 2 : o.cx;
  const cy = (o.cy == null) ? (o.y1 + o.y2) / 2 : o.cy;
  return { x: 0.25 * o.x1 + 0.5 * cx + 0.25 * o.x2, y: 0.25 * o.y1 + 0.5 * cy + 0.25 * o.y2 };
}

/** Detecta si el puntero está sobre una manija de la vía: 'p1', 'p2' o 'mid'. */
function manijaViaEn(o, p) {
  if (Math.hypot(p.x - o.x1, p.y - o.y1) < 15) return 'p1';
  if (Math.hypot(p.x - o.x2, p.y - o.y2) < 15) return 'p2';
  const m = viaPuntoMedio(o);
  if (Math.hypot(p.x - m.x, p.y - m.y) < 15) return 'mid';
  return null;
}

/** Dibuja una manija (extremo = cuadro, curvar = círculo). */
function dibujarManija(ctx, x, y, circulo) {
  ctx.lineWidth = 2; ctx.strokeStyle = '#1455d9'; ctx.fillStyle = '#fff';
  if (circulo) {
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1455d9'; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.rect(x - 7, y - 7, 14, 14); ctx.fill(); ctx.stroke();
  }
}

function dibujarSeleccion(o) {
  if (o.tipo === 'via') {
    const ctx = cq.ctx;
    const cx = (o.cx == null) ? (o.x1 + o.x2) / 2 : o.cx;
    const cy = (o.cy == null) ? (o.y1 + o.y2) / 2 : o.cy;
    ctx.setLineDash([9, 6]); ctx.strokeStyle = '#1455d9'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.quadraticCurveTo(cx, cy, o.x2, o.y2); ctx.stroke(); ctx.setLineDash([]);
    const m = viaPuntoMedio(o);
    dibujarManija(ctx, o.x1, o.y1, false);
    dibujarManija(ctx, o.x2, o.y2, false);
    dibujarManija(ctx, m.x, m.y, true);
    return;
  }
  const caja = cajaObjeto(o);
  if (!caja) return;
  const ctx = cq.ctx;
  ctx.setLineDash([6, 4]); ctx.strokeStyle = '#1455d9'; ctx.lineWidth = 2;
  ctx.strokeRect(caja.x - 6, caja.y - 6, caja.w + 12, caja.h + 12);
  ctx.setLineDash([]);
}

/* ---------------- Interacción ---------------- */

function agregarIcono(emoji) {
  const o = { tipo: 'icono', emoji, x: cq.W / 2, y: cq.H / 2, size: 52, rot: 0 };
  cq.objetos.push(o);
  cq.herramienta = 'sel';
  document.querySelectorAll('.croquis-tool').forEach(b => b.classList.toggle('active', b.dataset.tool === 'sel'));
  cq.seleccionado = o;
  redibujarCroquis();
}

function agregarCalle() {
  const nombre = window.prompt('Nombre de la vía (ej. Calle 50, Carrera 30, Autopista Norte):');
  if (!nombre || !nombre.trim()) return;
  const o = { tipo: 'calle', text: nombre.trim(), x: cq.W / 2 - 60, y: cq.H * 0.2, size: 22, color: '#111827' };
  cq.objetos.push(o);
  cq.herramienta = 'sel';
  document.querySelectorAll('.croquis-tool').forEach(b => b.classList.toggle('active', b.dataset.tool === 'sel'));
  cq.seleccionado = o;
  redibujarCroquis();
}

function objetoEn(p) {
  for (let i = cq.objetos.length - 1; i >= 0; i--) {
    const o = cq.objetos[i];
    const caja = cajaObjeto(o);
    if (caja && p.x >= caja.x - 6 && p.x <= caja.x + caja.w + 6 && p.y >= caja.y - 6 && p.y <= caja.y + caja.h + 6) return o;
    if (o.tipo === 'flecha' && distanciaSegmento(p, o) < 10) return o;
    if (o.tipo === 'via' && distanciaVia(p, o) < o.ancho / 2 + 4) return o;
    if (o.tipo === 'trazo' && o.puntos.some(pt => Math.hypot(pt.x - p.x, pt.y - p.y) < 10)) return o;
  }
  return null;
}

/** Distancia mínima de un punto a la vía (recta o curva), muestreando la Bézier. */
function distanciaVia(p, o) {
  const cx = (o.cx == null) ? (o.x1 + o.x2) / 2 : o.cx;
  const cy = (o.cy == null) ? (o.y1 + o.y2) / 2 : o.cy;
  let min = Infinity, px = o.x1, py = o.y1;
  for (let i = 1; i <= 16; i++) {
    const t = i / 16, u = 1 - t;
    const x = u * u * o.x1 + 2 * u * t * cx + t * t * o.x2;
    const y = u * u * o.y1 + 2 * u * t * cy + t * t * o.y2;
    const d = distanciaSegmento(p, { x1: px, y1: py, x2: x, y2: y });
    if (d < min) min = d;
    px = x; py = y;
  }
  return min;
}

function distanciaSegmento(p, f) {
  const dx = f.x2 - f.x1, dy = f.y2 - f.y1;
  const l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(p.x - f.x1, p.y - f.y1);
  let t = ((p.x - f.x1) * dx + (p.y - f.y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (f.x1 + t * dx), p.y - (f.y1 + t * dy));
}

function croquisDown(e) {
  e.preventDefault();
  const p = posCroquis(e);
  const t = cq.herramienta;

  if (t === 'sel') {
    // Si ya hay una vía seleccionada, primero probamos sus manijas (editar).
    if (cq.seleccionado && cq.seleccionado.tipo === 'via') {
      const h = manijaViaEn(cq.seleccionado, p);
      if (h) { cq.viaHandle = h; return; }
    }
    const o = objetoEn(p);
    cq.seleccionado = o;
    if (o && (o.tipo === 'icono' || o.tipo === 'texto' || o.tipo === 'calle' || o.tipo === 'brujula')) {
      cq.arrastrando = true;
      cq.offset = { x: p.x - o.x, y: p.y - o.y };
    } else if (o && o.tipo === 'via') {
      // Al re-seleccionar mostramos sus manijas; el arrastre del cuerpo mueve toda la vía.
      cq.arrastrandoVia = true;
      cq.offset = { x: p.x, y: p.y };
    }
    redibujarCroquis();
  } else if (t === 'via') {
    cq.viaTemp = { tipo: 'via', x1: p.x, y1: p.y, x2: p.x, y2: p.y, ancho: cq.anchoVia };
  } else if (t === 'flecha') {
    cq.flechaTemp = { tipo: 'flecha', x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: cq.color };
  } else if (t === 'lapiz') {
    cq.trazoActual = { tipo: 'trazo', puntos: [p], color: cq.color, ancho: 3 };
  } else if (t === 'texto') {
    const txt = window.prompt('Texto a colocar:');
    if (txt && txt.trim()) { cq.objetos.push({ tipo: 'texto', text: txt.trim(), x: p.x, y: p.y, size: 24, color: cq.color }); redibujarCroquis(); }
  }
}

function croquisMove(e) {
  const p = posCroquis(e);
  if (cq.viaHandle && cq.seleccionado && cq.seleccionado.tipo === 'via') {
    const o = cq.seleccionado;
    if (cq.viaHandle === 'p1') { o.x1 = p.x; o.y1 = p.y; }
    else if (cq.viaHandle === 'p2') { o.x2 = p.x; o.y2 = p.y; }
    else if (cq.viaHandle === 'mid') {
      // Colocamos el punto medio de la curva justo donde el usuario arrastra.
      o.cx = 2 * p.x - 0.5 * (o.x1 + o.x2);
      o.cy = 2 * p.y - 0.5 * (o.y1 + o.y2);
    }
    redibujarCroquis(); return;
  }
  if (cq.arrastrandoVia && cq.seleccionado && cq.seleccionado.tipo === 'via') {
    const o = cq.seleccionado, dx = p.x - cq.offset.x, dy = p.y - cq.offset.y;
    o.x1 += dx; o.y1 += dy; o.x2 += dx; o.y2 += dy;
    if (o.cx != null) { o.cx += dx; o.cy += dy; }
    cq.offset = { x: p.x, y: p.y };
    redibujarCroquis(); return;
  }
  if (cq.arrastrando && cq.seleccionado) {
    cq.seleccionado.x = p.x - cq.offset.x;
    cq.seleccionado.y = p.y - cq.offset.y;
    redibujarCroquis();
  } else if (cq.viaTemp) {
    cq.viaTemp.x2 = p.x; cq.viaTemp.y2 = p.y; redibujarCroquis();
  } else if (cq.flechaTemp) {
    cq.flechaTemp.x2 = p.x; cq.flechaTemp.y2 = p.y; redibujarCroquis();
  } else if (cq.trazoActual) {
    cq.trazoActual.puntos.push(p); redibujarCroquis(); dibujarObjeto(cq.trazoActual);
  }
}

function croquisUp() {
  if (cq.viaTemp) {
    if (Math.hypot(cq.viaTemp.x2 - cq.viaTemp.x1, cq.viaTemp.y2 - cq.viaTemp.y1) > 12) {
      cq.objetos.push(cq.viaTemp);
      // Pasamos a "Mover" y la dejamos seleccionada para curvarla o ajustarla.
      cq.seleccionado = cq.viaTemp;
      cq.herramienta = 'sel';
      document.querySelectorAll('.croquis-tool').forEach(b => b.classList.toggle('active', b.dataset.tool === 'sel'));
    }
    cq.viaTemp = null; redibujarCroquis();
  }
  if (cq.flechaTemp) {
    if (Math.hypot(cq.flechaTemp.x2 - cq.flechaTemp.x1, cq.flechaTemp.y2 - cq.flechaTemp.y1) > 8) cq.objetos.push(cq.flechaTemp);
    cq.flechaTemp = null; redibujarCroquis();
  }
  if (cq.trazoActual) {
    if (cq.trazoActual.puntos.length > 1) cq.objetos.push(cq.trazoActual);
    cq.trazoActual = null; redibujarCroquis();
  }
  cq.arrastrando = false;
  cq.arrastrandoVia = false;
  cq.viaHandle = null;
}

/** Gira el elemento seleccionado (vehículo/ícono o brújula). */
function rotarSeleccion(delta) {
  const o = cq.seleccionado;
  if (!o || (o.tipo !== 'icono' && o.tipo !== 'brujula')) {
    showStatus('Selecciona primero un vehículo, ícono o la brújula para girarlo.', 'info');
    return;
  }
  o.rot = (o.rot || 0) + delta;
  redibujarCroquis();
}

/** Agrega la brújula (rosa de los vientos N/S/E/O). Solo una por croquis. */
function agregarBrujula() {
  const existe = cq.objetos.find(o => o.tipo === 'brujula');
  if (existe) {
    cq.seleccionado = existe;
    cq.herramienta = 'sel';
    document.querySelectorAll('.croquis-tool').forEach(b => b.classList.toggle('active', b.dataset.tool === 'sel'));
    showStatus('Ya hay una brújula. Puedes moverla o girarla (⟲ ⟳).', 'info');
    redibujarCroquis();
    return;
  }
  const o = { tipo: 'brujula', x: cq.W - 110, y: 110, size: 48, rot: 0 };
  cq.objetos.push(o);
  cq.herramienta = 'sel';
  document.querySelectorAll('.croquis-tool').forEach(b => b.classList.toggle('active', b.dataset.tool === 'sel'));
  cq.seleccionado = o;
  redibujarCroquis();
}

function borrarSeleccion() {
  if (!cq.seleccionado) { showStatus('Selecciona primero un elemento del croquis.', 'info'); return; }
  cq.objetos = cq.objetos.filter(o => o !== cq.seleccionado);
  cq.seleccionado = null;
  redibujarCroquis();
}

/* ---------------- Abrir / guardar ---------------- */

/** Abre el editor de croquis (carga el modelo guardado si existe). */
function abrirEditorCroquis() {
  const caso = state.casoActual;
  if (!caso) return;
  const guardado = caso.datos && caso.datos['CROQUIS DATOS'];
  if (guardado) {
    try {
      const m = JSON.parse(guardado);
      cq.objetos = Array.isArray(m.objetos) ? m.objetos : [];
      cq.fondo = m.fondo || 'cruce';
    } catch (e) { cq.objetos = []; cq.fondo = 'cruce'; }
  } else {
    cq.objetos = []; cq.fondo = 'cruce';
  }
  cq.seleccionado = null;
  cq.herramienta = 'sel';
  els.croquisFondo.value = cq.fondo;
  document.querySelectorAll('.croquis-tool').forEach(b => b.classList.toggle('active', b.dataset.tool === 'sel'));
  redibujarCroquis();
  els.croquisModal.classList.add('show');
}

function cerrarEditorCroquis() {
  els.croquisModal.classList.remove('show');
}

/** Exporta el lienzo a PNG con la marca de agua (sin dejarla en el lienzo). */
function exportarCroquisBlob() {
  return new Promise(resolve => {
    dibujarMarcaAgua(cq.ctx, cq.W, cq.H, state.casoActual); // reutiliza la de fotos.js
    cq.canvas.toBlob(b => { redibujarCroquis(); resolve(b); }, 'image/png');
  });
}

/** Guarda el croquis: sube el PNG y persiste el modelo para re-editar. */
async function guardarCroquis() {
  const caso = state.casoActual;
  if (!caso) return;
  if (!caso.datos) caso.datos = {};
  try {
    showLoader(true);
    const blob = await exportarCroquisBlob();
    const ruta = `${carpetaCaso(caso)}/croquis.png`;
    // Sube el PNG (o lo encola si no hay señal para subirlo al reconectar).
    let encolado = false;
    if (typeof subirArchivoResiliente === 'function') {
      const up = await subirArchivoResiliente(BUCKET_FOTOS, ruta, blob, 'image/png');
      encolado = up.encolado;
    } else {
      const { error } = await db.storage.from(BUCKET_FOTOS)
        .upload(ruta, blob, { contentType: 'image/png', upsert: true });
      if (error) throw error;
    }

    const croquisDatos = JSON.stringify({ fondo: cq.fondo, objetos: cq.objetos });
    // Relee fresco y solo cambia las claves del croquis (no pisa otras); si no
    // hay señal, queda en la cola de sincronización.
    caso.datos['CROQUIS'] = ruta;
    caso.datos['CROQUIS DATOS'] = croquisDatos;
    if (typeof persistirDatosCaso === 'function') {
      const per = await persistirDatosCaso(caso, datos => {
        datos['CROQUIS'] = ruta;
        datos['CROQUIS DATOS'] = croquisDatos;
      });
      if (per && per.encolado) encolado = true;
    } else {
      const { error: upErr } = await db.from('registro_asistencias')
        .update({ datos: caso.datos }).eq('numero_caso', caso.numero_caso);
      if (upErr) throw upErr;
    }

    cerrarEditorCroquis();
    await cargarCroquisCaso(caso);
    showStatus(encolado
      ? 'Croquis guardado en el dispositivo. Se subirá al reconectar.'
      : 'Croquis guardado.', encolado ? 'info' : 'ok');
  } catch (error) {
    showStatus('Error al guardar el croquis: ' + (error.message || error), 'error');
  } finally {
    showLoader(false);
  }
}

/** Muestra la vista previa del croquis en el detalle del caso. */
async function cargarCroquisCaso(caso) {
  const cont = els.croquisPreview;
  cont.innerHTML = '';
  const ruta = caso.datos && caso.datos['CROQUIS'];
  if (!ruta) {
    cont.innerHTML = '<div class="tercero-estado">Aún no hay croquis. Ábre el editor para crearlo.</div>';
    return;
  }
  try {
    const { data } = await db.storage.from(BUCKET_FOTOS).createSignedUrl(ruta, 3600);
    if (data && data.signedUrl) {
      const a = document.createElement('a');
      a.href = data.signedUrl; a.target = '_blank'; a.rel = 'noopener';
      const im = document.createElement('img');
      im.src = data.signedUrl; im.loading = 'lazy'; im.alt = 'Croquis del accidente';
      a.appendChild(im);
      cont.appendChild(a);
    }
  } catch (e) { /* sin croquis */ }
}

/** Habilita o bloquea el botón de abrir el croquis (según el check-in). */
function habilitarCroquis(on) {
  if (els.btnAbrirCroquis) els.btnAbrirCroquis.disabled = !on;
}
