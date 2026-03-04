// Aura cosmetics (ported from Pixel PVP) for Pixel PVE.
// Cosmetic only: selectable by id (0..N-1).

export const AURA_NAMES = [
  'Default',
  'Crown',
  'Predator',
  'Void',
  'Emerald',
  'Frost',
  'Inferno',
  'Prism',
];

function clamp(v, a, b) {
  v = (v | 0);
  return Math.max(a, Math.min(b, v));
}

export function clampAuraId(auraId) {
  return clamp(auraId, 0, AURA_NAMES.length - 1);
}

function hashString(s) {
  const str = String(s ?? '');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function rand01(seed) {
  // xorshift32
  let x = (seed >>> 0) || 1;
  x ^= (x << 13) >>> 0;
  x ^= (x >>> 17) >>> 0;
  x ^= (x << 5) >>> 0;
  return (x >>> 0) / 4294967296;
}

// Draw a soft animated aura behind the emoji.
export function drawAura(ctx, x, y, baseR, nowSec, idSeed, auraId = 0, dead = false, lowFx = false) {
  const aid = clampAuraId(auraId);
  const h = hashString(idSeed);
  const phase = (h % 1024) / 1024 * Math.PI * 2;

  const prism = (aid === 7);
  const prismPal = (() => {
    if (!prism) return null;
    const s = nowSec * 1.35 + phase;
    const r0 = 170 + 70 * Math.sin(s);
    const g0 = 170 + 70 * Math.sin(s + 2.09);
    const b0 = 170 + 70 * Math.sin(s + 4.18);
    const r1 = 160 + 85 * Math.sin(s + 1.1);
    const g1 = 160 + 85 * Math.sin(s + 3.2);
    const b1 = 160 + 85 * Math.sin(s + 5.3);
    const r2 = 130 + 95 * Math.sin(s + 0.4);
    const g2 = 130 + 95 * Math.sin(s + 2.5);
    const b2 = 130 + 95 * Math.sin(s + 4.6);
    const c = (v) => Math.max(0, Math.min(255, v | 0));
    return { a: [c(r0), c(g0), c(b0)], b: [c(r1), c(g1), c(b1)], c: [c(r2), c(g2), c(b2)] };
  })();

  let pal;
  if (prismPal) pal = prismPal;
  else if (aid === 1) pal = { a: [255, 235, 140], b: [255, 190, 70], c: [255, 160, 60] }; // Crown
  else if (aid === 2) pal = { a: [255, 150, 150], b: [255, 90, 70], c: [255, 60, 60] }; // Predator
  else if (aid === 3) pal = { a: [210, 170, 255], b: [150, 110, 255], c: [120, 80, 255] }; // Void
  else if (aid === 4) pal = { a: [170, 255, 200], b: [80, 220, 140], c: [50, 185, 120] }; // Emerald
  else if (aid === 5) pal = { a: [220, 250, 255], b: [150, 220, 255], c: [90, 190, 255] }; // Frost
  else if (aid === 6) pal = { a: [255, 220, 170], b: [255, 145, 80], c: [255, 90, 50] }; // Inferno
  else pal = { a: [220, 245, 255], b: [130, 200, 255], c: [90, 150, 255] }; // Default

  const pulse = 1 + 0.08 * Math.sin(nowSec * 2.35 + phase) + 0.05 * Math.sin(nowSec * 10.4 + phase * 1.7);
  const r = Math.max(6, (baseR || 10) * pulse);
  const outer = r * 1.38;
  const inner = Math.max(0.8, r * 0.14);

  if (dead) {
    const g = ctx.createRadialGradient(x, y, inner, x, y, outer);
    g.addColorStop(0, 'rgba(180,180,180,0.10)');
    g.addColorStop(0.55, 'rgba(140,140,140,0.06)');
    g.addColorStop(1, 'rgba(120,120,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, outer, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Base glow
  {
    const flick = 0.78 + 0.35 * Math.sin(nowSec * 12.5 + phase * 1.3);
    const g = ctx.createRadialGradient(x, y, inner, x, y, outer);
    g.addColorStop(0, `rgba(${pal.a[0]},${pal.a[1]},${pal.a[2]},${0.20 * flick})`);
    g.addColorStop(0.28, `rgba(${pal.b[0]},${pal.b[1]},${pal.b[2]},${0.16 * flick})`);
    g.addColorStop(0.70, `rgba(${pal.c[0]},${pal.c[1]},${pal.c[2]},${0.075 * flick})`);
    g.addColorStop(1, `rgba(${pal.c[0]},${pal.c[1]},${pal.c[2]},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, outer, 0, Math.PI * 2);
    ctx.fill();
  }

  const tick = (nowSec * 14.0) | 0;
  const tongues = lowFx ? 6 : 10;
  for (let i = 0; i < tongues; i++) {
    const s0 = (h ^ (tick + i * 1337)) >>> 0;
    const u0 = rand01(s0);
    const u1 = rand01(s0 + 11);
    const u2 = rand01(s0 + 97);

    const ang = (-Math.PI / 2) + (u0 - 0.5) * (Math.PI * 1.6);
    const dist = r * (0.30 + 0.32 * u1);
    const ox = Math.cos(ang) * dist;
    const oy = Math.sin(ang) * dist;
    const br = r * (0.22 + 0.22 * u2);

    const g = ctx.createRadialGradient(x + ox, y + oy, br * 0.12, x + ox, y + oy, br);
    g.addColorStop(0, 'rgba(255,255,255,0.20)');
    g.addColorStop(0.35, `rgba(${pal.b[0]},${pal.b[1]},${pal.b[2]},0.15)`);
    g.addColorStop(1, `rgba(${pal.c[0]},${pal.c[1]},${pal.c[2]},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x + ox, y + oy, br, 0, Math.PI * 2);
    ctx.fill();
  }

  const tick2 = (nowSec * 22.0) | 0;
  const sparks = lowFx ? 2 : 4;
  for (let i = 0; i < sparks; i++) {
    const s0 = (h ^ (tick2 + i * 733)) >>> 0;
    const u0 = rand01(s0);
    const u1 = rand01(s0 + 19);
    const u2 = rand01(s0 + 211);
    const ang = (u0 * Math.PI * 2);
    const dist = r * (0.82 + 0.28 * u1);
    const ox = Math.cos(ang) * dist;
    const oy = Math.sin(ang) * dist;
    const br = r * (0.10 + 0.06 * u2);
    const g = ctx.createRadialGradient(x + ox, y + oy, br * 0.10, x + ox, y + oy, br);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.45, `rgba(${pal.b[0]},${pal.b[1]},${pal.b[2]},0.08)`);
    g.addColorStop(1, `rgba(${pal.c[0]},${pal.c[1]},${pal.c[2]},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x + ox, y + oy, br, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
