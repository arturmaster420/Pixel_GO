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
    for (let i = 0; i < 340; i++) {
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
    for (let i = 0; i < 42; i++) {
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
    ctx.globalAlpha = 0.11;
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

// ---- Gates (cosmic portals on the platform edge) ----

function worldToScreenPitch(wx, wy, state) {
  const cam = state.camera;
  const canvas = state.canvas;
  const w = canvas.width || 1;
  const h = canvas.height || 1;
  const z = cam.zoom || 1;
  const p = cam.pitch || 1;
  return {
    x: (wx - cam.x) * z + w / 2,
    y: (wy - cam.y) * z * p + h / 2,
  };
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) * 0.5));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function drawGates(ctx, state, room, geo, { hue = 210, time = 0 } = {}) {
  const gates = room && Array.isArray(room.breaches) ? room.breaches : null;
  if (!gates || !gates.length) return;

  const fall = geo.fall || 0;
  const pulse = 0.5 + 0.5 * Math.sin(time * 2.4);

  // Gate geometry (match the perimeter barrier gap; spans fully between green barrier ends)
  const gapPad = 6; // must match drawPerimeterBarrier()
  const lenBase = clamp(room.side * 0.10, 72, 112);
  const len = lenBase + gapPad * 2;
  const inD = clamp(room.side * 0.010, 6, 10);
  const outD = clamp(room.side * 0.016, 9, 14);
  const frame = clamp(room.side * 0.008, 4, 7);

  const isCurrent = !!(state && (state.currentRoomIndex | 0) === (room.index | 0));
  const player = isCurrent && state ? state.player : null;
  const rd = state && state.roomDirector;
  const bridgeOpen = !!(state && state._bridgeBuilt);

  const coneLen = clamp(room.side * 0.34, 220, 560);

  const hash01 = (s) => {
    let h = 2166136261 >>> 0;
    const str = String(s || "");
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 1000) / 1000;
  };

  for (const g of gates) {
    if (!g) continue;

    const sealHp = (typeof g.sealHp === 'number') ? g.sealHp : 0;
    const sealMax = (typeof g.sealMax === 'number' && g.sealMax > 0) ? g.sealMax : 1;
    const hpRatio = clamp(sealHp / sealMax, 0, 1);
    const rewardLeft = (typeof g.rewardSealLeft === 'number') ? g.rewardSealLeft : 0;
    const reward = !!g.rewardSealed || (rewardLeft > 0.02);
    const sealed = reward || sealHp > 0.02;
    const pressure = clamp((typeof g.pressure === 'number') ? g.pressure : 0, 0, 1);

    const repairing = !!g.repairActive;
    const repairT = (typeof g.repairT === 'number') ? g.repairT : 0;
    const repairMode = String(g.repairMode || (g._repairMode || "")).toLowerCase();

    // Anchor point on edge (world coords)
    const ax = g.x;
    const ay = (g.y + fall);

    // Outward normal and tangent
    let nx = 0, ny = 0, tx = 0, ty = 0;
    if (g.side === 'W') { nx = -1; ny = 0; tx = 0; ty = 1; }
    else if (g.side === 'E') { nx = 1; ny = 0; tx = 0; ty = 1; }
    else { nx = 0; ny = 1; tx = 1; ty = 0; } // 'S'

    // Color states
    const H_RED = 6;
    const H_BLUE = 205;
    const H_GREEN = 120;
    // Reward-fix in progress should read as "being sealed" (blue-ish), not open red.
    const sealedVisual = sealed || (repairing && repairMode === 'reward');
    let baseHue = reward ? H_GREEN : (sealedVisual ? H_BLUE : H_RED);

    // "Holding pressure" = shake + flicker red when close to breaking.
    const seed = hash01(g.id);
    const flick = 0.5 + 0.5 * Math.sin(time * 28 + seed * 20);
    const danger = clamp(pressure * 0.85 + (1 - hpRatio) * 0.85, 0, 1);
    const rewardRepairing = (!!repairing && repairMode === 'reward' && !reward);
    // During the long reward fix, blink blue/green (not blue/red).
    const sealBlink = rewardRepairing ? (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 10 + seed * 17))) : 0;
    const redPulse = (!rewardRepairing && !reward && sealedVisual) ? (danger * (flick > 0.55 ? 1 : 0)) : 0;

    // Portal center sits ON the barrier line, slightly outside.
    let cx = ax + nx * (outD * 0.55);
    let cy = ay + ny * (outD * 0.55);

    if (sealedVisual && pressure > 0.08 && !reward) {
      const j = 0.8 + pressure * 3.2;
      cx += Math.sin(time * 22 + seed * 30) * j;
      cy += Math.cos(time * 19 + seed * 27) * j;
    }

    // Light cone (like a flashlight) pointing OUT into space
    {
      const L = coneLen;
      const nearW = len * 0.65;
      const farW = len * 2.15;
      const ox = ax + nx * 6;
      const oy = ay + ny * 6;
      const fx = ox + nx * L;
      const fy = oy + ny * L;

      const a0 = reward ? 0.20 : (sealedVisual ? 0.16 : 0.26);
      const aBoost = (sealedVisual && pressure > 0.08) ? (0.10 * pressure) : 0;
      const h = baseHue;

      // Main cone (outward)
      const g0 = ctx.createLinearGradient(ox, oy, fx, fy);
      g0.addColorStop(0, hsla(h, 95, 62, a0 + aBoost));
      g0.addColorStop(0.55, hsla(h, 95, 58, 0.06 + aBoost * 0.4));
      g0.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g0;
      ctx.beginPath();
      ctx.moveTo(ox + tx * nearW * 0.5, oy + ty * nearW * 0.5);
      ctx.lineTo(ox - tx * nearW * 0.5, oy - ty * nearW * 0.5);
      ctx.lineTo(fx - tx * farW * 0.5, fy - ty * farW * 0.5);
      ctx.lineTo(fx + tx * farW * 0.5, fy + ty * farW * 0.5);
      ctx.closePath();
      ctx.fill();

      // Reward-fix blink: add a green pulse cone over the blue seal.
      if (sealBlink > 0.01) {
        const gg = ctx.createLinearGradient(ox, oy, fx, fy);
        gg.addColorStop(0, hsla(H_GREEN, 95, 62, 0.10 + 0.22 * sealBlink));
        gg.addColorStop(0.55, hsla(H_GREEN, 95, 58, 0.04 + 0.10 * sealBlink));
        gg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.moveTo(ox + tx * nearW * 0.5, oy + ty * nearW * 0.5);
        ctx.lineTo(ox - tx * nearW * 0.5, oy - ty * nearW * 0.5);
        ctx.lineTo(fx - tx * farW * 0.5, fy - ty * farW * 0.5);
        ctx.lineTo(fx + tx * farW * 0.5, fy + ty * farW * 0.5);
        ctx.closePath();
        ctx.fill();
      }

      // Flicker red pulses under pressure
      if (redPulse > 0.01) {
        const gr = ctx.createLinearGradient(ox, oy, fx, fy);
        gr.addColorStop(0, hsla(H_RED, 95, 60, 0.10 + 0.22 * redPulse));
        gr.addColorStop(0.55, hsla(H_RED, 95, 58, 0.04 + 0.10 * redPulse));
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.moveTo(ox + tx * nearW * 0.5, oy + ty * nearW * 0.5);
        ctx.lineTo(ox - tx * nearW * 0.5, oy - ty * nearW * 0.5);
        ctx.lineTo(fx - tx * farW * 0.5, fy - ty * farW * 0.5);
        ctx.lineTo(fx + tx * farW * 0.5, fy + ty * farW * 0.5);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Build an oriented rectangle across the wall line (breach/shield)
    const hx = tx * (len * 0.5);
    const hy = ty * (len * 0.5);
    const inx = -nx * inD;
    const iny = -ny * inD;
    const outx = nx * outD;
    const outy = ny * outD;

    const p0 = { x: ax - hx + inx, y: ay - hy + iny };
    const p1 = { x: ax + hx + inx, y: ay + hy + iny };
    const p2 = { x: ax + hx + outx, y: ay + hy + outy };
    const p3 = { x: ax - hx + outx, y: ay - hy + outy };

    // Frame (space-metal)
    {
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.closePath();
      const fg = ctx.createLinearGradient(p0.x, p0.y, p2.x, p2.y);
      fg.addColorStop(0, 'rgba(8,10,14,0.96)');
      fg.addColorStop(1, 'rgba(26,32,42,0.94)');
      ctx.fillStyle = fg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Inner area (inset)
    const iLen = Math.max(16, len - frame * 2);
    const ihx = tx * (iLen * 0.5);
    const ihy = ty * (iLen * 0.5);
    const q0 = { x: ax - ihx + inx, y: ay - ihy + iny };
    const q1 = { x: ax + ihx + inx, y: ay + ihy + iny };
    const q2 = { x: ax + ihx + outx, y: ay + ihy + outy };
    const q3 = { x: ax - ihx + outx, y: ay - ihy + outy };

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(q0.x, q0.y);
    ctx.lineTo(q1.x, q1.y);
    ctx.lineTo(q2.x, q2.y);
    ctx.lineTo(q3.x, q3.y);
    ctx.closePath();
    ctx.clip();

    // OPEN = red breach, SEALED = blue shield, REWARD = green shield.
    if (!sealedVisual) {
      // Red breach: dark void + swirl
      ctx.fillStyle = 'rgba(0,0,0,0.92)';
      ctx.fillRect(ax - len, ay - len, len * 2, len * 2);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = hsla(H_RED, 95, 62, 0.32 + 0.10 * pulse);
      ctx.lineWidth = 2.8;
      const rr = iLen * 0.62;
      const k = time * 1.8 + seed * 9;
      for (let s = -2; s <= 3; s++) {
        const ang = k + s * 0.75;
        ctx.beginPath();
        ctx.arc(ax, ay, rr * (0.55 + 0.08 * (s + 2)), ang, ang + Math.PI * 0.9);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    } else {
      // Sealed gate = sci-fi "battery" shield. Cells drain with HP; reward fix charges green and stays.
      const isRewardDone = !!reward;
      const isRewardRepairing = (!!repairing && repairMode === 'reward' && !reward);
      const need = isRewardRepairing ? 5 : 2;
      const prog = isRewardRepairing ? clamp(repairT / need, 0, 1) : 0;
      const fillRatio = isRewardDone ? 1 : (isRewardRepairing ? prog : hpRatio);

      // Dark cavity behind the energy cells
      ctx.fillStyle = 'rgba(0,0,0,0.90)';
      ctx.fillRect(ax - len, ay - len, len * 2, len * 2);

      // Battery segments
      const segCount = 5;
      const segGap = 6;
      const segLen = (iLen - segGap * (segCount - 1)) / segCount;
      const uMin = -iLen * 0.5;
      const vMin = -inD + frame * 0.85;
      const vMax = outD - frame * 0.85;

      const filled = fillRatio * segCount;
      const blink = isRewardRepairing ? (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 10 + seed * 17))) : 0;

      const pt = (u, v) => ({ x: ax + tx * u + nx * v, y: ay + ty * u + ny * v });

      const hueOn = isRewardDone ? H_GREEN : (isRewardRepairing ? H_GREEN : H_BLUE);
      const hueOff = isRewardDone ? H_GREEN : H_BLUE;

      // Segment outlines (dividers)
      ctx.globalCompositeOperation = 'source-over';

      for (let i = 0; i < segCount; i++) {
        const u0 = uMin + i * (segLen + segGap);
        const u1 = u0 + segLen;

        // Fill from the "bottom" for vertical gates so it reads like a battery icon.
        const j = (g.side === 'W' || g.side === 'E') ? (segCount - 1 - i) : i;
        const val = clamp(filled - j, 0, 1);

        const s0 = pt(u0, vMin);
        const s1 = pt(u1, vMin);
        const s2 = pt(u1, vMax);
        const s3 = pt(u0, vMax);

        // Base cell (dim)
        ctx.fillStyle = 'rgba(10,14,20,0.72)';
        ctx.beginPath();
        ctx.moveTo(s0.x, s0.y);
        ctx.lineTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.lineTo(s3.x, s3.y);
        ctx.closePath();
        ctx.fill();

        // Filled energy
        if (val > 0.001) {
          let aOn = 0.10 + 0.58 * val;
          if (isRewardRepairing) aOn *= (0.55 + 0.45 * blink);

          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = hsla(hueOn, 95, 62, aOn);
          ctx.beginPath();
          ctx.moveTo(s0.x, s0.y);
          ctx.lineTo(s1.x, s1.y);
          ctx.lineTo(s2.x, s2.y);
          ctx.lineTo(s3.x, s3.y);
          ctx.closePath();
          ctx.fill();

          // Inner glow core
          const cu = (u0 + u1) * 0.5;
          const cv = (vMin + vMax) * 0.5;
          const c = pt(cu, cv);
          ctx.fillStyle = hsla(hueOn, 95, 66, 0.06 + 0.18 * val);
          ctx.beginPath();
          ctx.arc(c.x, c.y, Math.max(4, (vMax - vMin) * 0.35), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }

        // Divider / cell frame
        const strokeA = 0.18 + 0.12 * (val > 0.01 ? 1 : 0);
        ctx.strokeStyle = hsla(hueOff, 95, 62, strokeA);
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(s0.x, s0.y);
        ctx.lineTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.lineTo(s3.x, s3.y);
        ctx.closePath();
        ctx.stroke();
      }

      // Under pressure: sparks/cracks and red warning pulses near breaking.
      if (!isRewardDone && !isRewardRepairing && pressure > 0.10) {
        const crackA = clamp(pressure * 0.60 + (1 - hpRatio) * 0.70, 0, 0.92);

        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255,255,255,${0.10 + 0.55 * crackA})`;
        ctx.lineWidth = 1.4;

        for (let i = 0; i < 6; i++) {
          const a = time * (1.6 + i * 0.07) + seed * 6 + i * 1.4;
          const u0 = Math.sin(a) * (iLen * 0.10);
          const v0 = Math.cos(a * 1.3) * ((vMax - vMin) * 0.18);
          const u1 = u0 + Math.cos(a + 0.8) * (iLen * (0.34 + i * 0.03));
          const v1 = v0 + Math.sin(a + 0.8) * ((vMax - vMin) * (0.46 + i * 0.02));
          const pA = pt(u0, v0);
          const pB = pt(u1, v1);
          ctx.beginPath();
          ctx.moveTo(pA.x, pA.y);
          ctx.lineTo(pB.x, pB.y);
          ctx.stroke();
        }

        if (redPulse > 0.01) {
          ctx.fillStyle = hsla(H_RED, 95, 60, 0.08 + 0.30 * redPulse);
          ctx.beginPath();
          ctx.arc(ax, ay, iLen * (0.16 + 0.18 * redPulse), 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalCompositeOperation = 'source-over';
      }
    }

    ctx.restore();

    // Rim highlight (state color)
    const rimHue = reward ? H_GREEN : (sealedVisual ? H_BLUE : H_RED);
    ctx.strokeStyle = hsla(rimHue, 95, 65, 0.34 + 0.10 * pulse);
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(q0.x, q0.y);
    ctx.lineTo(q1.x, q1.y);
    ctx.lineTo(q2.x, q2.y);
    ctx.lineTo(q3.x, q3.y);
    ctx.closePath();
    ctx.stroke();

    // Interaction button (click/tap) directly on the gate (inside side)
    if (player && rd && room.index > 0) {
      const ip = rd.getGateInnerPoint ? rd.getGateInnerPoint(room, g, 46) : rd.getBreachInnerPoint(room, g, 46);
      const dxp = player.x - ip.x;
      const dyp = player.y - ip.y;
      const near = (dxp * dxp + dyp * dyp) <= (170 * 170);

      if (near) {
        const bx = ip.x;
        const by = ip.y - 18;
        const bw = 132;
        const bh = 38;

        let action = null;
        let clickable = false;
        let txt = '';
        let btnHue = rimHue;

        if (reward) {
          clickable = false;
          txt = `SEALED ${Math.ceil(rewardLeft)}s`;
          btnHue = H_GREEN;
        } else if (room.cleared && bridgeOpen && !g.rewardUsed) {
          action = 'reward';
          clickable = !(repairing && repairMode === 'reward');
          const need = 5;
          const t = repairing && repairMode === 'reward' ? repairT : 0;
          txt = repairing && repairMode === 'reward' ? `FIX ${(t).toFixed(1)}/${need}` : 'FIX +XP';
          btnHue = 150;
        } else if (!room.cleared) {
          // Repair during combat if not fully sealed.
          if (sealHp < sealMax * 0.999) {
            action = 'repair';
            clickable = !(repairing && repairMode !== 'reward');
            const need = 2;
            const t = repairing && repairMode !== 'reward' ? repairT : 0;
            txt = repairing && repairMode !== 'reward' ? `FIX ${(t).toFixed(1)}/${need}` : 'FIX';
            btnHue = sealed ? H_BLUE : H_RED;
          } else {
            clickable = false;
            txt = `SEALED ${Math.round(hpRatio * 100)}%`;
            btnHue = H_BLUE;
          }
        } else {
          clickable = false;
          txt = g.rewardUsed ? 'DONE' : 'OK';
        }

        ctx.save();
        ctx.globalAlpha = 0.95;
        const panelX = bx - bw * 0.5;
        const panelY = by - bh * 0.5;
        drawRoundedRect(ctx, panelX, panelY, bw, bh, 10);
        ctx.fillStyle = clickable ? 'rgba(10,14,20,0.72)' : 'rgba(10,10,10,0.55)';
        ctx.fill();
        ctx.strokeStyle = clickable ? hsla(btnHue, 95, 62, 0.44) : 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 2.6;
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, bx, by);
        ctx.restore();

        if (state && clickable && action) {
          const s0 = worldToScreenPitch(panelX, panelY, state);
          const s1 = worldToScreenPitch(panelX + bw, panelY + bh, state);
          const rx = Math.min(s0.x, s1.x);
          const ry = Math.min(s0.y, s1.y);
          const rw = Math.abs(s1.x - s0.x);
          const rh = Math.abs(s1.y - s0.y);
          state._gateButtons.push({ gateId: g.id, action, x: rx, y: ry, w: rw, h: rh });
        }
      }
    }
  }
}

// Visible force-field barrier around the platform perimeter.
// Leaves holes where gates are, so it's clear "where the wall is" and "where the portal is".
function drawPerimeterBarrier(ctx, state, room, { hue = 210, time = 0, fall = 0 } = {}) {
  if (!room || !room.bounds) return;
  const b = room.bounds;
  const x0 = b.minX;
  const x1 = b.maxX;
  const y0 = b.minY + fall;
  const y1 = b.maxY + fall;

  const gates = Array.isArray(room.breaches) ? room.breaches : [];
  const half = clamp(room.side * 0.10, 72, 112) * 0.5;
  const gapPad = 6;

  const gapsW = [];
  const gapsE = [];
  const gapsS = [];

  for (const g of gates) {
    if (!g) continue;
    if (g.side === 'W') gapsW.push([g.y - half - gapPad, g.y + half + gapPad]);
    if (g.side === 'E') gapsE.push([g.y - half - gapPad, g.y + half + gapPad]);
    if (g.side === 'S') gapsS.push([g.x - half - gapPad, g.x + half + gapPad]);
  }

  // Optional: leave a gap for the bridge on the north edge (purely visual).
  const gapsN = [];
  const rd = state && state.roomDirector;
  const br = rd && rd.bridge;
  if (br && (br.fromIndex | 0) === (room.index | 0)) {
    const w = (br.width || 160) * 0.62;
    gapsN.push([room.centerX - w * 0.5, room.centerX + w * 0.5]);
  }

  const merge = (arr) => {
    if (!arr.length) return [];
    arr.sort((a, b) => a[0] - b[0]);
    const out = [arr[0].slice()];
    for (let i = 1; i < arr.length; i++) {
      const cur = arr[i];
      const last = out[out.length - 1];
      if (cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1]);
      else out.push(cur.slice());
    }
    return out;
  };

  const mW = merge(gapsW);
  const mE = merge(gapsE);
  const mS = merge(gapsS);
  const mN = merge(gapsN);

  const strokeA = 0.20 + 0.10 * (0.5 + 0.5 * Math.sin(time * 1.1));
  const glowA = 0.10 + 0.08 * (0.5 + 0.5 * Math.sin(time * 0.9 + 1.4));
  // Barrier is a green force-field (monsters cannot pass).
  const H_GREEN = 120;
  const col = hsla(H_GREEN, 92, 66, strokeA + 0.08);
  const glow = hsla(H_GREEN, 95, 68, glowA + 0.10);

  ctx.save();
  ctx.lineCap = 'round';

  // Glow pass
  ctx.strokeStyle = glow;
  ctx.lineWidth = 10;
  const drawSeg = (xA, yA, xB, yB) => {
    ctx.beginPath();
    ctx.moveTo(xA, yA);
    ctx.lineTo(xB, yB);
    ctx.stroke();
  };

  const drawEdgeWithGapsY = (x, fromY, toY, gaps) => {
    let cur = fromY;
    for (const [g0, g1] of gaps) {
      if (g0 > cur) drawSeg(x, cur, x, Math.min(g0, toY));
      cur = Math.max(cur, g1);
      if (cur >= toY) break;
    }
    if (cur < toY) drawSeg(x, cur, x, toY);
  };

  const drawEdgeWithGapsX = (y, fromX, toX, gaps) => {
    let cur = fromX;
    for (const [g0, g1] of gaps) {
      if (g0 > cur) drawSeg(cur, y, Math.min(g0, toX), y);
      cur = Math.max(cur, g1);
      if (cur >= toX) break;
    }
    if (cur < toX) drawSeg(cur, y, toX, y);
  };

  drawEdgeWithGapsY(x0, y0, y1, mW);
  drawEdgeWithGapsY(x1, y0, y1, mE);
  drawEdgeWithGapsX(y1, x0, x1, mS);
  drawEdgeWithGapsX(y0, x0, x1, mN);

  // Core line pass
  ctx.strokeStyle = col;
  ctx.lineWidth = 4.5;
  drawEdgeWithGapsY(x0, y0, y1, mW);
  drawEdgeWithGapsY(x1, y0, y1, mE);
  drawEdgeWithGapsX(y1, x0, x1, mS);
  drawEdgeWithGapsX(y0, x0, x1, mN);

  // Inner spill of the green barrier onto the platform (makes the field feel 'active').
  const strip = clamp(room.side * 0.03, 18, 44);
  const spillA = 0.10 + 0.06 * (0.5 + 0.5 * Math.sin(time * 1.6 + 0.7));

  const fillEdgeY = (x, fromY, toY, gaps, inward) => {
    let cur = fromY;
    for (const [g0, g1] of gaps) {
      if (g0 > cur) {
        const yA = cur;
        const yB = Math.min(g0, toY);
        const gx = ctx.createLinearGradient(x, 0, x + inward * strip, 0);
        gx.addColorStop(0, hsla(120, 95, 62, spillA));
        gx.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gx;
        const xA = inward > 0 ? x : x - strip;
        ctx.fillRect(xA, yA, strip, yB - yA);
      }
      cur = Math.max(cur, g1);
      if (cur >= toY) break;
    }
    if (cur < toY) {
      const yA = cur;
      const yB = toY;
      const gx = ctx.createLinearGradient(x, 0, x + inward * strip, 0);
      gx.addColorStop(0, hsla(120, 95, 62, spillA));
      gx.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gx;
      const xA = inward > 0 ? x : x - strip;
      ctx.fillRect(xA, yA, strip, yB - yA);
    }
  };

  const fillEdgeX = (y, fromX, toX, gaps, inward) => {
    let cur = fromX;
    for (const [g0, g1] of gaps) {
      if (g0 > cur) {
        const xA = cur;
        const xB = Math.min(g0, toX);
        const gy = ctx.createLinearGradient(0, y, 0, y + inward * strip);
        gy.addColorStop(0, hsla(120, 95, 62, spillA));
        gy.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gy;
        const yA = inward > 0 ? y : y - strip;
        ctx.fillRect(xA, yA, xB - xA, strip);
      }
      cur = Math.max(cur, g1);
      if (cur >= toX) break;
    }
    if (cur < toX) {
      const xA = cur;
      const xB = toX;
      const gy = ctx.createLinearGradient(0, y, 0, y + inward * strip);
      gy.addColorStop(0, hsla(120, 95, 62, spillA));
      gy.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gy;
      const yA = inward > 0 ? y : y - strip;
      ctx.fillRect(xA, yA, xB - xA, strip);
    }
  };

  // West/East spill inward (+x for W, -x for E)
  fillEdgeY(x0, y0, y1, mW, +1);
  fillEdgeY(x1, y0, y1, mE, -1);
  // South/North spill inward (-y for S is upward, +y for N is downward)
  fillEdgeX(y1, x0, x1, mS, -1);
  fillEdgeX(y0, x0, x1, mN, +1);

  ctx.restore();
}

function drawTile(ctx, room, cam, { alpha = 1, fall = 0, label = "", time = 0, state = null } = {}) {
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
  const thickness = clamp(room.side * 0.030, 16, 70);
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

  // Left face (west)
  ctx.fillStyle = hsla(hue, 24, 17, 0.95);
  ctx.beginPath();
  ctx.moveTo(A.x, A.y);
  ctx.lineTo(D.x, D.y);
  ctx.lineTo(D2.x, D2.y);
  ctx.lineTo(A2.x, A2.y);
  ctx.closePath();
  ctx.fill();

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

    // Perimeter barrier (force field) — leaves holes where gates are.
    drawPerimeterBarrier(ctx, state, room, { hue, time, fall });

    // Gates: cosmic portals on the edge (SAS-like spawns)
    drawGates(ctx, state, room, { x0, x1, y0, y1, w, h, fall }, { hue, time });

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

function drawBridge(ctx, rd, from, to, { alpha = 1 } = {}) {
  if (!rd || !rd.bridge || !from || !to) return;
  const br = rd.bridge;

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
  const thickness = clamp(Math.min(from.side, to.side) * 0.025, 14, 48);
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

  // Clickable gate buttons are computed during rendering.
  // Reset once per frame.
  state._gateButtons = [];

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
    drawTile(ctx, r, cam, { alpha: a, fall, label, time: state.time || 0, state });
  }

  // Bridge rendering:
  // - during normal build: current -> next
  // - during party transition: prev -> current (kept until everyone enters)
  if (rd.bridge) {
    const br = rd.bridge;
    const fromIdx = (br.fromIndex | 0);
    const toIdx = (br.toIndex | 0);

    const from = (rd.current && (rd.current.index | 0) === fromIdx) ? rd.current
      : (rd.prev && (rd.prev.index | 0) === fromIdx) ? rd.prev
      : null;

    const to = (rd.next && (rd.next.index | 0) === toIdx) ? rd.next
      : (rd.current && (rd.current.index | 0) === toIdx) ? rd.current
      : null;

    if (from && to && !(to.removed || from.removed)) {
      rd._pitch = cam && cam.pitch ? cam.pitch : 1;
      drawBridge(ctx, rd, from, to, { alpha: 1 });
    }
  }
}
