// Pixel_GO room-based background renderer (floating tiles + bridge in space).

function clamp(n, a, b) {
  return n < a ? a : (n > b ? b : n);
}

function hsla(h, s, l, a) {
  return `hsla(${h},${s}%,${l}%,${a})`;
}

// Deterministic hash for background stars.
function hash2(ix, iy) {
  let n = (ix * 374761393) ^ (iy * 668265263);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  n = (n ^ (n >>> 16)) >>> 0;
  return n;
}

function rand01(u32) {
  return (u32 & 0xfffffff) / 0xfffffff;
}

// ---- Cosmos (screen-space, multi-layer parallax) ----

function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    // xorshift32
    s ^= (s << 13);
    s ^= (s >>> 17);
    s ^= (s << 5);
    return ((s >>> 0) / 4294967295);
  };
}

function ensureCosmosCache(state) {
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
    for (let i = 0; i < 1500; i++) {
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
    for (let i = 0; i < 480; i++) {
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

  // Dust/noise sheet: very subtle
  cache.dust = mk(512, 512);
  {
    const c = cache.dust;
    const g = c.getContext("2d");
    g.clearRect(0, 0, c.width, c.height);
    for (let i = 0; i < 200; i++) {
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

function drawCosmosScreen(ctx, state) {
  const cam = state.camera;
  const canvas = state.canvas;
  const w = canvas.width || 1;
  const h = canvas.height || 1;
  const cache = ensureCosmosCache(state);

  ctx.save();
  // Cosmos should feel like "space", not a painted rectangle.
  // Render in SCREEN SPACE and apply parallax by camera position.
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Base gradient
  const bg = ctx.createRadialGradient(w * 0.55, h * 0.45, 0, w * 0.55, h * 0.45, Math.max(w, h) * 0.85);
  bg.addColorStop(0, "#070a18");
  bg.addColorStop(0.55, "#040613");
  bg.addColorStop(1, "#02020a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Nebula (slowest)
  if (cache.nebula) {
    ctx.globalAlpha = 0.95;
    drawTiled(ctx, cache.nebula, cam.x * 0.02, cam.y * 0.02, w, h);
  }

  // Far stars
  if (cache.starsFar) {
    ctx.globalAlpha = 0.9;
    drawTiled(ctx, cache.starsFar, cam.x * 0.06, cam.y * 0.06, w, h);
  }

  // Mid stars
  if (cache.starsMid) {
    ctx.globalAlpha = 0.95;
    drawTiled(ctx, cache.starsMid, cam.x * 0.12, cam.y * 0.12, w, h);
  }

  // Dust (closest)
  if (cache.dust) {
    ctx.globalAlpha = 0.18;
    drawTiled(ctx, cache.dust, cam.x * 0.22, cam.y * 0.22, w, h);
  }

  // Vignette for depth
  const vg = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.25, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  ctx.restore();
}

function drawTile(ctx, room, cam, { alpha = 1, fall = 0, label = "" } = {}) {
  const b = room.bounds;
  const x0 = b.minX;
  const x1 = b.maxX;
  const y0 = b.minY + fall;
  const y1 = b.maxY + fall;
  const w = x1 - x0;
  const h = y1 - y0;

  const hue = (room.hue | 0) || 210;

  // 3D illusion: a real "box" with diagonal thickness vector (front-right).
  // Since camera pitch compresses Y, compensate thickness so it still reads as 3D.
  const pitch = (cam && cam.pitch) ? cam.pitch : 1;
  const thickness = clamp(room.side * 0.055, 28, 115);
  const tx = thickness * 0.65;
  const ty = (thickness * 0.85) / (pitch || 1);

  const A = { x: x0, y: y0 };
  const B = { x: x1, y: y0 };
  const C = { x: x1, y: y1 };
  const D = { x: x0, y: y1 };
  const A2 = { x: x0 + tx, y: y0 + ty };
  const B2 = { x: x1 + tx, y: y0 + ty };
  const C2 = { x: x1 + tx, y: y1 + ty };
  const D2 = { x: x0 + tx, y: y1 + ty };

  ctx.save();
  ctx.globalAlpha = alpha;

  // Soft halo (floating feel)
  {
    const cx = (x0 + x1) * 0.5;
    const cy = (y0 + y1) * 0.5 + ty * 0.55;
    const r = Math.max(w, h) * 0.62;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, hsla(hue, 95, 62, 0.10));
    g.addColorStop(0.55, hsla((hue + 40) % 360, 95, 58, 0.05));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Void shadow (under the tile)
  {
    const cx = (x0 + x1) * 0.5 + tx * 0.35;
    const cy = (y0 + y1) * 0.5 + ty * 0.85;
    const rx = w * 0.55;
    const ry = h * 0.45;
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Right face (east)
  ctx.fillStyle = hsla(hue, 26, 16, 0.95);
  ctx.beginPath();
  ctx.moveTo(B.x, B.y);
  ctx.lineTo(C.x, C.y);
  ctx.lineTo(C2.x, C2.y);
  ctx.lineTo(B2.x, B2.y);
  ctx.closePath();
  ctx.fill();

  // Front face (south)
  ctx.fillStyle = hsla(hue, 28, 13, 0.96);
  ctx.beginPath();
  ctx.moveTo(D.x, D.y);
  ctx.lineTo(C.x, C.y);
  ctx.lineTo(C2.x, C2.y);
  ctx.lineTo(D2.x, D2.y);
  ctx.closePath();
  ctx.fill();

  // Top face: "cosmic platform" surface (panels + subtle emissive lines)
  {
    // Slightly darker, metallic surface with a cool tint.
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, hsla(hue, 14, 90, 1));
    g.addColorStop(0.55, hsla(hue, 10, 86, 1));
    g.addColorStop(1, hsla(hue, 12, 82, 1));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.lineTo(C.x, C.y);
    ctx.lineTo(D.x, D.y);
    ctx.closePath();
    ctx.fill();

    // Panel seams (large)
    const stepL = 210;
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 3;
    let vx = Math.ceil(x0 / stepL) * stepL;
    for (; vx < x0 + w; vx += stepL) {
      ctx.beginPath();
      ctx.moveTo(vx, y0);
      ctx.lineTo(vx, y1);
      ctx.stroke();
    }
    let hy = Math.ceil(y0 / stepL) * stepL;
    for (; hy < y0 + h; hy += stepL) {
      ctx.beginPath();
      ctx.moveTo(x0, hy);
      ctx.lineTo(x1, hy);
      ctx.stroke();
    }

    // Micro grid (very subtle)
    const stepS = 105;
    ctx.strokeStyle = hsla(hue, 22, 20, 0.07);
    ctx.lineWidth = 1;
    vx = Math.ceil(x0 / stepS) * stepS;
    for (; vx < x0 + w; vx += stepS) {
      ctx.beginPath();
      ctx.moveTo(vx, y0);
      ctx.lineTo(vx, y1);
      ctx.stroke();
    }

    // Emissive inner border (thin)
    ctx.strokeStyle = hsla(hue, 95, 60, 0.18);
    ctx.lineWidth = 6;
    ctx.strokeRect(x0 + 18, y0 + 18, w - 36, h - 36);

    // Corner beacons (small glows)
    const corners = [
      [x0 + 34, y0 + 34],
      [x1 - 34, y0 + 34],
      [x1 - 34, y1 - 34],
      [x0 + 34, y1 - 34],
    ];
    for (const [cx, cy] of corners) {
      const gg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 44);
      gg.addColorStop(0, hsla((hue + 35) % 360, 95, 65, 0.25));
      gg.addColorStop(0.55, hsla((hue + 35) % 360, 95, 55, 0.10));
      gg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(cx, cy, 44, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }


  // Bevel highlight (top edges)
  ctx.strokeStyle = hsla(hue, 95, 70, 0.35);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(A.x + 8, A.y + 8);
  ctx.lineTo(B.x - 8, B.y + 8);
  ctx.lineTo(C.x - 8, C.y - 8);
  ctx.stroke();

  // Outer border + glow
  ctx.strokeStyle = hsla(hue, 95, 62, 0.22);
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(A.x + 5, A.y + 5);
  ctx.lineTo(B.x - 5, B.y + 5);
  ctx.lineTo(C.x - 5, C.y - 5);
  ctx.lineTo(D.x + 5, D.y - 5);
  ctx.closePath();
  ctx.stroke();

  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(A.x + 2, A.y + 2);
  ctx.lineTo(B.x - 2, B.y + 2);
  ctx.lineTo(C.x - 2, C.y - 2);
  ctx.lineTo(D.x + 2, D.y - 2);
  ctx.closePath();
  ctx.stroke();

  // Label
  if (label) {
    ctx.globalAlpha = alpha * 0.55;
    ctx.fillStyle = "rgba(0,0,0,0.60)";
    ctx.font = "46px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, room.centerX, room.centerY + fall);
  }

  ctx.restore();
}

function drawBridge(ctx, rd, { alpha = 1 } = {}) {
  if (!rd || !rd.bridge || !rd.current || !rd.next) return;
  const br = rd.bridge;
  const from = rd.current;
  const to = rd.next;

  // Bridge spans from current top edge (minY) to next bottom edge (maxY).
  const startY = from.bounds.minY;
  const endY = to.bounds.maxY;
  const t = clamp(br.progress || 0, 0, 1);

  // Built part grows from startY -> endY.
  const builtY = startY + (endY - startY) * t;

  const x0 = br.bounds.minX;
  const x1 = br.bounds.maxX;
  const y0 = Math.min(startY, builtY);
  const y1 = Math.max(startY, builtY);

  // When not built at all, show only a small "construction pad".
  const hasSome = t > 0.02;
  const hue = (from.hue | 0) || 210;
  const pitch = (rd && rd._pitch) ? rd._pitch : 1;
  const thickness = clamp(Math.min(from.side, to.side) * 0.04, 22, 70);
  const tx = thickness * 0.65;
  const ty = (thickness * 0.85) / (pitch || 1);

  ctx.save();
  ctx.globalAlpha = alpha;
  // Clip bridge rendering so its shadow/thickness never bleeds onto the current tile surface.
  ctx.beginPath();
  ctx.rect(x0 - 10000, -100000, 20000, (startY - 2) - (-100000));
  ctx.clip();

  // Base pad (3D slab)
  const padW = (x1 - x0);
  const padH = 32;
  const padX = x0;
  const padY = startY - padH - ty;
  // Top
  ctx.fillStyle = hsla(hue, 14, 88, 1);
  ctx.fillRect(padX, padY, padW, padH);
  // Front thickness
  ctx.fillStyle = hsla(hue, 26, 12, 0.95);
  ctx.beginPath();
  ctx.moveTo(padX, padY + padH);
  ctx.lineTo(padX + padW, padY + padH);
  ctx.lineTo(padX + padW + tx, padY + padH + ty);
  ctx.lineTo(padX + tx, padY + padH + ty);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hsla(hue, 95, 62, 0.25);
  ctx.lineWidth = 6;
  ctx.strokeRect(padX + 4, padY + 4, padW - 8, padH - 8);

  if (hasSome) {
    // Shadow under bridge
    {
      const cx = (x0 + x1) * 0.5 + tx * 0.35;
      let cy = (y0 + y1) * 0.5 + ty * 0.35;
      // Don't let the bridge shadow bleed onto the current tile surface.
      const shadowLimitY = startY - 18;
      if (cy > shadowLimitY) cy = shadowLimitY;
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath();
      ctx.ellipse(cx, cy, (x1 - x0) * 0.52, (y1 - y0) * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Right face
    ctx.fillStyle = hsla(hue, 26, 14, 0.95);
    ctx.beginPath();
    ctx.moveTo(x1, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1 + tx, y1 + ty);
    ctx.lineTo(x1 + tx, y0 + ty);
    ctx.closePath();
    ctx.fill();

    // Front face
    ctx.fillStyle = hsla(hue, 28, 11, 0.96);
    ctx.beginPath();
    ctx.moveTo(x0, y1);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1 + tx, y1 + ty);
    ctx.lineTo(x0 + tx, y1 + ty);
    ctx.closePath();
    ctx.fill();

    // Top
    ctx.fillStyle = hsla(hue, 18, 93, 1);
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

    // Planks / segments
    ctx.strokeStyle = hsla(hue, 30, 20, 0.18);
    ctx.lineWidth = 3;
    const seg = 90;
    let yy = Math.ceil(y0 / seg) * seg;
    for (; yy < y1; yy += seg) {
      ctx.beginPath();
      ctx.moveTo(x0, yy);
      ctx.lineTo(x1, yy);
      ctx.stroke();
    }

    // Glow
    ctx.strokeStyle = hsla(hue, 95, 62, 0.22);
    ctx.lineWidth = 7;
    ctx.strokeRect(x0 + 4, y0 + 4, (x1 - x0) - 8, (y1 - y0) - 8);
  }

  // Construction spark at the front
  if (!br.built) {
    const fx = (x0 + x1) * 0.5;
    const fy = builtY;
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 40);
    g.addColorStop(0, hsla((hue + 40) % 360, 95, 68, 0.65));
    g.addColorStop(0.45, hsla((hue + 40) % 360, 95, 60, 0.25));
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(fx, fy, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.40)";
    ctx.beginPath();
    ctx.arc(fx + 10, fy - 8, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function renderRoomsBackground(ctx, state) {
  const cam = state.camera;
  const canvas = state.canvas;

  // Screen-space space background (with parallax)
  drawCosmosScreen(ctx, state);

  const rd = state.roomDirector;
  if (!rd || !rd.current) return;

  // Render order: prev (falling), current, next.
  const rooms = [];
  if (rd.prev && !rd.prev.removed) rooms.push({ room: rd.prev, kind: "prev" });
  if (rd.current && !rd.current.removed) rooms.push({ room: rd.current, kind: "cur" });
  if (rd.next && !rd.next.removed) rooms.push({ room: rd.next, kind: "next" });

  for (const it of rooms) {
    const r = it.room;
    const fall = (r.collapsing ? (clamp(r.collapseT, 0, 1) * (r.side * 0.25 + 640)) : 0);
    const a = (r.collapsing ? (1 - clamp(r.collapseT, 0, 1)) : 1);
    const label = (r.index === 0 ? "HUB" : `ROOM ${r.index}`);
    drawTile(ctx, r, cam, { alpha: a, fall, label });
  }

  // Bridge between current and next (builds after clear)
  if (rd.current && rd.current.cleared && rd.next && !rd.next.removed) {
    // Pass pitch for proper 3D thickness compensation.
    rd._pitch = cam && cam.pitch ? cam.pitch : 1;
    drawBridge(ctx, rd, { alpha: 1 });
  }
}
