import { biomeByKey } from "../biomes.js";
import { renderHubSceneScreenBackdrop } from "../hub/hubRenderer.js";
import { drawImageCoverScreen, getLoadedBiomeArenaEntry } from "./textureHelpers.js";

function hsla(h, s, l, a) {
  return `hsla(${h},${s}%,${l}%,${a})`;
}

export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    // xorshift32
    s ^= (s << 13);
    s ^= (s >>> 17);
    s ^= (s << 5);
    return ((s >>> 0) / 4294967295);
  };
}


export function ensureCosmosCache(state) {
  const cache = (state._cosmosCache ||= {});
  if (cache.ready) return cache;
  if (typeof document === "undefined") return cache;

  const mk = (w, h) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  };

  // Deterministic seed (just a fun hex constant; must be valid JS)
  const seed = 0xC05A05 ^ 0x1f2e3d4c;
  const rnd = makeRng(seed);

  // Far stars: many tiny, very slow parallax
  cache.starsFar = mk(768, 768);
  {
    const c = cache.starsFar;
    const g = c.getContext("2d");
    g.clearRect(0, 0, c.width, c.height);
    for (let i = 0; i < 300; i++) {
      const x = rnd() * c.width;
      const y = rnd() * c.height;
      const t = rnd();
      const r = t < 0.9 ? 0.9 : 1.6;
      const a = t < 0.9 ? 0.25 + rnd() * 0.25 : 0.45 + rnd() * 0.35;
      g.fillStyle = `rgba(255,255,255,${a})`;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Mid stars: fewer, bigger, a bit of color
  cache.starsMid = mk(768, 768);
  {
    const c = cache.starsMid;
    const g = c.getContext("2d");
    g.clearRect(0, 0, c.width, c.height);
    for (let i = 0; i < 90; i++) {
      const x = rnd() * c.width;
      const y = rnd() * c.height;
      const t = rnd();
      const r = 1.2 + t * 2.6;
      const a = 0.35 + rnd() * 0.55;
      const colorPick = rnd();
      const hue = colorPick < 0.12 ? 210 : (colorPick < 0.22 ? 35 : 0);
      const col = hue ? hsla(hue, 95, 78, a) : `rgba(255,255,255,${a})`;
      // Tiny glow
      const gg = g.createRadialGradient(x, y, 0, x, y, r * 3.2);
      gg.addColorStop(0, col);
      gg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gg;
      g.beginPath();
      g.arc(x, y, r * 3.2, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Nebula sheet: big soft blobs
  cache.nebula = mk(1024, 1024);
  {
    const c = cache.nebula;
    const g = c.getContext("2d");
    g.clearRect(0, 0, c.width, c.height);
    for (let i = 0; i < 10; i++) {
      const x = rnd() * c.width;
      const y = rnd() * c.height;
      const rad = 220 + rnd() * 520;
      const hue = (200 + Math.floor(rnd() * 120)) % 360;
      const a = 0.035 + rnd() * 0.05;
      const gg = g.createRadialGradient(x, y, 0, x, y, rad);
      gg.addColorStop(0, hsla(hue, 85, 55, a));
      gg.addColorStop(0.6, hsla(hue, 85, 45, a * 0.55));
      gg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gg;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Dust/noise sheet: very subtle (closest). Keep sparse to avoid "snow".
  cache.dust = mk(512, 512);
  {
    const c = cache.dust;
    const g = c.getContext("2d");
    g.clearRect(0, 0, c.width, c.height);
    for (let i = 0; i < 8; i++) {
      const x = rnd() * c.width;
      const y = rnd() * c.height;
      const a = 0.03 + rnd() * 0.06;
      const r = 0.8 + rnd() * 1.6;
      g.fillStyle = `rgba(255,255,255,${a})`;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }

  cache.ready = true;
  return cache;
}


function drawTiled(ctx, img, ox, oy, w, h) {
  const tw = img.width || 1;
  const th = img.height || 1;
  const startX = -((ox % tw) + tw) % tw;
  const startY = -((oy % th) + th) % th;
  for (let y = startY - th; y < h + th; y += th) {
    for (let x = startX - tw; x < w + tw; x += tw) {
      ctx.drawImage(img, x, y);
    }
  }
}


export function drawCosmosScreen(ctx, state, deps = {}) {
  const cam = state.camera;
  const canvas = state.canvas;
  const w = canvas.width || 1;
  const h = canvas.height || 1;
  const cache = state?._cosmosCache?.ready ? state._cosmosCache : null;
  if (!cache) {
    try { deps?.scheduleRoomRenderWarmup?.(state); } catch {}
  }
  const biomeKey = String(state._roomBiome || (state.roomDirector && state.roomDirector.current ? state.roomDirector.current.biomeKey : '') || '').toLowerCase();
  const isNeutralSpace = !biomeKey || biomeKey === 'neutral' || biomeKey === 'hub';
  const currentRoom = state?.roomDirector?.current || null;
  const isHubCurrent = !!currentRoom?.arenaSpec?.rules?.isHub || String(currentRoom?.biomeKey || '').toLowerCase() === 'hub' || ((currentRoom?.index | 0) === 0);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (isHubCurrent) {
    renderHubSceneScreenBackdrop(ctx, state, Number(state?.time) || 0);
    ctx.restore();
    return;
  }

  const biomeBgTex = getLoadedBiomeArenaEntry(currentRoom, 'bg');
  const roomBgTex = biomeBgTex || null;
  const bgAlpha = 0.92;
  const bgScale = 1.18;
  const bgParallax = 0.0065;
  const drewRoomBg = drawImageCoverScreen(
    ctx,
    roomBgTex,
    0,
    0,
    w,
    h,
    bgAlpha,
    -cam.x * bgParallax + (biomeBgTex ? Math.sin((Number(state?.time) || 0) * 0.05) * 18 : 0),
    -cam.y * bgParallax + (biomeBgTex ? Math.cos((Number(state?.time) || 0) * 0.04) * 12 : 0),
    bgScale,
  );
  if (!drewRoomBg) {
    const bg = ctx.createRadialGradient(w * 0.56, h * 0.44, 0, w * 0.56, h * 0.44, Math.max(w, h) * 0.95);
    bg.addColorStop(0, '#0a1126');
    bg.addColorStop(0.42, '#060b19');
    bg.addColorStop(1, '#02040c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }

  try {
    const biome = biomeByKey(biomeKey);
    if (biome) {
      const gx = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.9);
      gx.addColorStop(0, `hsla(${biome.hue},95%,40%,0.12)`);
      gx.addColorStop(0.55, `hsla(${(biome.hue + 28) % 360},85%,20%,0.10)`);
      gx.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gx;
      ctx.fillRect(0, 0, w, h);
    }
  } catch {}

  const spaceFxMul = biomeBgTex ? 0.42 : 1;
  if (cache?.nebula) {
    ctx.globalAlpha = 0.34 * spaceFxMul;
    drawTiled(ctx, cache.nebula, cam.x * 0.018, cam.y * 0.018, w, h);
  }
  if (cache?.starsFar) {
    ctx.globalAlpha = 0.34 * spaceFxMul;
    drawTiled(ctx, cache.starsFar, cam.x * 0.05, cam.y * 0.05, w, h);
  }
  if (cache?.starsMid) {
    ctx.globalAlpha = 0.22 * spaceFxMul;
    drawTiled(ctx, cache.starsMid, cam.x * 0.09, cam.y * 0.09, w, h);
  }
  if (cache?.dust) {
    ctx.globalAlpha = 0.04 * spaceFxMul;
    drawTiled(ctx, cache.dust, cam.x * 0.16, cam.y * 0.16, w, h);
  }

  const vg = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.26, w * 0.5, h * 0.5, Math.max(w, h) * 0.76);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  ctx.restore();
}

