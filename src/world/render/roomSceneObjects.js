import { biomeByKey } from "../biomes.js";
import { primaryEdgeForSocket } from "../roomRoute.js";

function clamp(n, a, b) {
  return n < a ? a : (n > b ? b : n);
}

function hsla(h, s, l, a) {
  return `hsla(${h},${s}%,${l}%,${a})`;
}

export function worldToScreenPitch(wx, wy, state) {
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
export function drawRoundedRect(ctx, x, y, w, h, r) {
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
export function drawTransitionGate(ctx, state, room, gate, fall, time) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 3.0 + (room?.index || 0) * 0.3);
  const len = clamp((room?.side || 820) * 0.10, 72, 112) + 12;
  const depthIn = clamp((room?.side || 820) * 0.012, 7, 11);
  const depthOut = clamp((room?.side || 820) * 0.018, 10, 16);
  const ax = Number(gate?.x) || Number(room?.centerX) || 0;
  const ay = (Number(gate?.y) || Number(room?.centerY) || 0) + (Number(fall) || 0);
  let nx = 0, ny = 0, tx = 0, ty = 0;
  if (gate?.side === 'W') { nx = -1; ny = 0; tx = 0; ty = 1; }
  else if (gate?.side === 'E') { nx = 1; ny = 0; tx = 0; ty = 1; }
  else if (gate?.side === 'N') { nx = 0; ny = -1; tx = 1; ty = 0; }
  else { nx = 0; ny = 1; tx = 1; ty = 0; }

  const stateKey = String(gate?.state || 'idle');
  let hue = 205;
  let alphaA = 0.16;
  let alphaB = 0.48;
  if (stateKey === 'locked') { hue = 24; alphaA = 0.18; alphaB = 0.62; }
  else if (stateKey === 'linking' || stateKey === 'incoming_link') { hue = 192; alphaA = 0.18; alphaB = 0.70; }
  else if (stateKey === 'open' || stateKey === 'incoming_open' || stateKey === 'ready') { hue = 138; alphaA = 0.16; alphaB = 0.64; }
  else if (stateKey === 'portal_ready') { hue = 48; alphaA = 0.22; alphaB = 0.78; }
  else if (stateKey === 'spent') { hue = 210; alphaA = 0.08; alphaB = 0.20; }
  else if (stateKey === 'entry' || stateKey === 'incoming_locked') { hue = 216; alphaA = 0.12; alphaB = 0.36; }

  const hx = tx * (len * 0.5);
  const hy = ty * (len * 0.5);
  const inx = -nx * depthIn;
  const iny = -ny * depthIn;
  const outx = nx * depthOut;
  const outy = ny * depthOut;
  const p0 = { x: ax - hx + inx, y: ay - hy + iny };
  const p1 = { x: ax + hx + inx, y: ay + hy + iny };
  const p2 = { x: ax + hx + outx, y: ay + hy + outy };
  const p3 = { x: ax - hx + outx, y: ay - hy + outy };

  const glowLen = clamp((room?.side || 820) * 0.26, 160, 360);
  const glowFar = { x: ax + nx * glowLen, y: ay + ny * glowLen };
  const gg = ctx.createLinearGradient(ax, ay, glowFar.x, glowFar.y);
  gg.addColorStop(0, hsla(hue, 95, 64, alphaB * (0.72 + pulse * 0.22)));
  gg.addColorStop(0.5, hsla(hue, 95, 58, alphaA * (0.8 + pulse * 0.12)));
  gg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.lineTo(glowFar.x + tx * len * 0.72, glowFar.y + ty * len * 0.72);
  ctx.lineTo(glowFar.x - tx * len * 0.72, glowFar.y - ty * len * 0.72);
  ctx.closePath();
  ctx.fill();

  const fill = ctx.createLinearGradient(p0.x, p0.y, p2.x, p2.y);
  fill.addColorStop(0, 'rgba(10,14,20,0.92)');
  fill.addColorStop(1, hsla(hue, 95, 60, 0.16 + pulse * 0.08));
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hsla(hue, 95, 68, 0.34 + pulse * 0.14);
  ctx.lineWidth = 2.8;
  ctx.stroke();

  const chevronCount = stateKey === 'portal_ready' ? 4 : 3;
  const chevronStep = len * 0.18;
  const chevronW = Math.max(10, len * 0.10);
  ctx.fillStyle = hsla(hue, 95, 72, 0.18 + pulse * 0.12);
  for (let i = 0; i < chevronCount; i++) {
    const dist = 18 + i * chevronStep + (stateKey === 'linking' || stateKey === 'incoming_link' ? pulse * 10 : 0);
    const cx = ax + nx * dist;
    const cy = ay + ny * dist;
    ctx.beginPath();
    ctx.moveTo(cx + nx * 12, cy + ny * 12);
    ctx.lineTo(cx - nx * 8 + tx * chevronW, cy - ny * 8 + ty * chevronW);
    ctx.lineTo(cx - nx * 2, cy - ny * 2);
    ctx.lineTo(cx - nx * 8 - tx * chevronW, cy - ny * 8 - ty * chevronW);
    ctx.closePath();
    ctx.fill();
  }

  const player = (state && (state.currentRoomIndex | 0) === (room?.index | 0)) ? state.player : null;
  if (!player) return;
  const hintX = ax - nx * 42;
  const hintY = ay - ny * 42;
  const dx = player.x - hintX;
  const dy = player.y - hintY;
  if ((dx * dx + dy * dy) > (220 * 220)) return;
  const text = String(gate?.label || '').trim();
  if (!text) return;
  const bw = Math.max(88, text.length * 8 + 30);
  const bh = 30;
  const bx = hintX;
  const by = hintY - 20;
  ctx.save();
  drawRoundedRect(ctx, bx - bw * 0.5, by - bh * 0.5, bw, bh, 9);
  ctx.fillStyle = 'rgba(8,12,18,0.76)';
  ctx.fill();
  ctx.strokeStyle = hsla(hue, 95, 68, 0.44);
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx, by);
  ctx.restore();
}
export function drawGates(ctx, state, room, geo, { hue = 210, time = 0 } = {}) {
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
    if (String(g.kind || '') === 'transition') {
      drawTransitionGate(ctx, state, room, g, fall, time);
      continue;
    }

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

// Floor terminal (NPC shop). Drawn on the platform surface.
// Shows a clickable/tappable button when the player is nearby.
export function drawFloorShopNpc(ctx, state, room, geo, { hue = 210, time = 0 } = {}) {
  if (!state || !room) return;
  if ((room.index | 0) <= 0) return;
  if (!room.cleared) return;
  if (!room.shopNpc) return;

  const npc = room.shopNpc;
  const x = npc.x;
  const y = npc.y + (geo.fall || 0);

  // Terminal body
  ctx.save();
  ctx.globalAlpha = 0.95;

  const bw = 38;
  const bh = 28;
  const baseCol = hsla((hue + 190) % 360, 20, 18, 0.9);
  ctx.fillStyle = baseCol;
  drawRoundedRect(ctx, x - bw * 0.5, y - bh * 0.5, bw, bh, 6);
  ctx.fill();

  // Screen glow
  const gg = ctx.createRadialGradient(x, y - 6, 0, x, y - 6, 30);
  gg.addColorStop(0, hsla((hue + 120) % 360, 95, 65, 0.22));
  gg.addColorStop(0.55, hsla((hue + 120) % 360, 95, 55, 0.10));
  gg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.arc(x, y - 6, 30, 0, Math.PI * 2);
  ctx.fill();

  // Small "antenna" / beacon
  ctx.strokeStyle = hsla((hue + 130) % 360, 95, 62, 0.55);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 16);
  ctx.lineTo(x, y - 28);
  ctx.stroke();
  ctx.fillStyle = hsla((hue + 130) % 360, 95, 62, 0.65);
  ctx.beginPath();
  ctx.arc(x, y - 30, 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Interaction button
  const player = state.player;
  if (!player) return;

  const dx = player.x - npc.x;
  const dy = player.y - npc.y;
  const near = (dx * dx + dy * dy) <= (190 * 190);
  if (!near) return;

  const bx = npc.x;
  const by = npc.y - 46;
  const bwBtn = 150;
  const bhBtn = 40;

  ctx.save();
  ctx.globalAlpha = 0.95;
  const panelX = bx - bwBtn * 0.5;
  const panelY = by - bhBtn * 0.5;
  drawRoundedRect(ctx, panelX, panelY, bwBtn, bhBtn, 10);
  ctx.fillStyle = 'rgba(10,14,20,0.72)';
  ctx.fill();
  ctx.strokeStyle = hsla((hue + 120) % 360, 95, 62, 0.55);
  ctx.lineWidth = 2.6;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('UPGRADE TERMINAL', bx, by);
  ctx.restore();

  // Register clickable rect (screen space, with pitch transform)
  const s0 = worldToScreenPitch(panelX, panelY, state);
  const s1 = worldToScreenPitch(panelX + bwBtn, panelY + bhBtn, state);
  const rx = Math.min(s0.x, s1.x);
  const ry = Math.min(s0.y, s1.y);
  const rw = Math.abs(s1.x - s0.x);
  const rh = Math.abs(s1.y - s0.y);
  if (!Array.isArray(state._shopButtons)) state._shopButtons = [];
  state._shopButtons.push({ x: rx, y: ry, w: rw, h: rh, floor: room.index | 0 });
}

// Visible force-field barrier around the platform perimeter.
// Leaves holes where gates are, so it's clear "where the wall is" and "where the portal is".
export function drawPerimeterBarrier(ctx, state, room, { hue = 210, time = 0, fall = 0 } = {}) {
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

  // Optional: leave a gap where the live transition actually leaves the room.
  const gapsN = [];
  const rd = state && state.roomDirector;
  const br = rd && rd.bridge;
  if (br && (br.fromIndex | 0) === (room.index | 0)) {
    const w = (br.width || 160) * 0.62;
    const anchor = br.fromPoint || { x: room.centerX, y: room.bounds.minY };
    const edge = primaryEdgeForSocket(br.fromSocket || br.fromEdge || 'N', 'N');
    if (edge === 'N') gapsN.push([anchor.x - w * 0.5, anchor.x + w * 0.5]);
    else if (edge === 'S') gapsS.push([anchor.x - w * 0.5, anchor.x + w * 0.5]);
    else if (edge === 'W') gapsW.push([anchor.y - w * 0.5, anchor.y + w * 0.5]);
    else if (edge === 'E') gapsE.push([anchor.y - w * 0.5, anchor.y + w * 0.5]);
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


export function drawBridge(ctx, rd, from, to, { alpha = 1 } = {}) {
  if (!rd || !rd.bridge || !from || !to) return;
  const br = rd.bridge;
  const t = clamp(br.progress || 0, 0, 1);
  const start = br.fromPoint || { x: from.centerX, y: from.bounds.minY };
  const end = br.toPoint || { x: to.centerX, y: to.bounds.maxY };
  const built = {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };
  const hasSome = t > 0.02;

  const fromBiome = biomeByKey(from && from.biomeKey);
  const toBiome = biomeByKey(to && to.biomeKey);
  const hue = fromBiome ? (fromBiome.hue | 0) : ((from.hue | 0) || 210);
  const toHue = toBiome ? (toBiome.hue | 0) : ((to.hue | 0) || hue);
  const thickness = Math.max(16, (br.width || 140) * 0.22);
  const nx = built.x - start.x;
  const ny = built.y - start.y;
  const len = Math.hypot(nx, ny) || 1;
  const ux = nx / len;
  const uy = ny / len;
  const px = -uy;
  const py = ux;
  const hw = thickness * 0.5;

  const q0 = { x: start.x + px * hw, y: start.y + py * hw };
  const q1 = { x: start.x - px * hw, y: start.y - py * hw };
  const q2 = { x: built.x - px * hw, y: built.y - py * hw };
  const q3 = { x: built.x + px * hw, y: built.y + py * hw };

  const padDepth = 28;
  const padLen = Math.max(30, thickness * 1.2);
  const padA = { x: start.x - ux * padLen + px * (thickness * 0.72), y: start.y - uy * padLen + py * (thickness * 0.72) };
  const padB = { x: start.x - ux * padLen - px * (thickness * 0.72), y: start.y - uy * padLen - py * (thickness * 0.72) };
  const padC = { x: start.x - px * (thickness * 0.72), y: start.y - py * (thickness * 0.72) };
  const padD = { x: start.x + px * (thickness * 0.72), y: start.y + py * (thickness * 0.72) };

  ctx.save();
  ctx.globalAlpha = alpha;

  const bodyGrad = ctx.createLinearGradient(start.x, start.y, built.x, built.y);
  bodyGrad.addColorStop(0, hsla(hue, 28, 72, 1));
  bodyGrad.addColorStop(0.45, hsla(((hue + toHue) * 0.5) % 360, 18, 42, 1));
  bodyGrad.addColorStop(1, hsla(toHue, 28, 34, 1));

  const padGrad = ctx.createLinearGradient(padA.x, padA.y, padB.x, padB.y);
  padGrad.addColorStop(0, hsla(hue, 24, 78, 1));
  padGrad.addColorStop(0.55, hsla(hue, 18, 42, 1));
  padGrad.addColorStop(1, hsla(hue, 18, 22, 1));

  ctx.fillStyle = padGrad;
  ctx.beginPath();
  ctx.moveTo(padA.x, padA.y);
  ctx.lineTo(padB.x, padB.y);
  ctx.lineTo(padC.x, padC.y);
  ctx.lineTo(padD.x, padD.y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hsla(hue, 95, 62, 0.25);
  ctx.lineWidth = 4;
  ctx.stroke();

  if (hasSome) {
    const shadowCx = (start.x + built.x) * 0.5 + px * 4;
    const shadowCy = (start.y + built.y) * 0.5 + py * 4 + 8;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(shadowCx, shadowCy, Math.max(18, len * 0.42), Math.max(10, thickness * 0.48), Math.atan2(uy, ux), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(q0.x, q0.y);
    ctx.lineTo(q1.x, q1.y);
    ctx.lineTo(q2.x, q2.y);
    ctx.lineTo(q3.x, q3.y);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = hsla(toHue, 95, 68, 0.28);
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.strokeStyle = hsla(hue, 30, 20, 0.18);
    ctx.lineWidth = 2;
    const segStep = 92;
    for (let d = segStep; d < len; d += segStep) {
      const mx = start.x + ux * d;
      const my = start.y + uy * d;
      ctx.beginPath();
      ctx.moveTo(mx - px * hw, my - py * hw);
      ctx.lineTo(mx + px * hw, my + py * hw);
      ctx.stroke();
    }

    const laneW = hw * 0.48;
    ctx.strokeStyle = hsla(toHue, 95, 70, 0.22);
    ctx.lineWidth = Math.max(4, laneW);
    ctx.beginPath();
    ctx.moveTo(start.x + px * 0, start.y + py * 0);
    ctx.lineTo(built.x + px * 0, built.y + py * 0);
    ctx.stroke();

    const chevronPulse = 0.45 + 0.55 * Math.sin((rd?.state?.time || 0) * 4.0);
    const chevronStep = 96;
    const chevronW = Math.max(12, thickness * 0.5);
    ctx.fillStyle = hsla(toHue, 95, 72, 0.16 + chevronPulse * 0.10);
    for (let d = len - 34; d > 34; d -= chevronStep) {
      const cx = start.x + ux * d;
      const cy = start.y + uy * d;
      ctx.beginPath();
      ctx.moveTo(cx + ux * 14, cy + uy * 14);
      ctx.lineTo(cx - ux * 8 + px * chevronW, cy - uy * 8 + py * chevronW);
      ctx.lineTo(cx - ux * 2, cy - uy * 2);
      ctx.lineTo(cx - ux * 8 - px * chevronW, cy - uy * 8 - py * chevronW);
      ctx.closePath();
      ctx.fill();
    }

    const endGlow = ctx.createRadialGradient(built.x, built.y, 0, built.x, built.y, Math.max(24, thickness * 1.8));
    endGlow.addColorStop(0, hsla(toHue, 95, 72, 0.34));
    endGlow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = endGlow;
    ctx.beginPath();
    ctx.arc(built.x, built.y, Math.max(24, thickness * 1.8), 0, Math.PI * 2);
    ctx.fill();
  }

  if (!br.built) {
    const g = ctx.createRadialGradient(built.x, built.y, 0, built.x, built.y, 40);
    g.addColorStop(0, hsla((hue + 40) % 360, 95, 68, 0.65));
    g.addColorStop(0.45, hsla((hue + 40) % 360, 95, 60, 0.25));
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(built.x, built.y, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.40)';
    ctx.beginPath();
    ctx.arc(built.x + px * 6, built.y + py * 6, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
export function drawFloorExitPortal(ctx, room, state) {
  const portal = room?.exitPortal || null;
  if (!portal || !room?.cleared || !room?.isFloorFinal) return;
  const time = Number(state?.time) || 0;
  const pulse = 0.5 + 0.5 * Math.sin(time * 3.1);
  const r = 46 + pulse * 8;
  const gate = Array.isArray(room?.breaches) ? room.breaches.find((g) => g && g.role === 'portal') : null;
  ctx.save();
  if (gate) {
    const guide = ctx.createLinearGradient(gate.x, gate.y, portal.x, portal.y);
    guide.addColorStop(0, 'rgba(255,230,150,0.10)');
    guide.addColorStop(0.5, 'rgba(160,220,255,0.20)');
    guide.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = guide;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(gate.x, gate.y);
    ctx.lineTo(portal.x, portal.y);
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(portal.x, portal.y, 0, portal.x, portal.y, r * 1.8);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.24, 'rgba(120,220,255,0.82)');
  g.addColorStop(0.62, 'rgba(80,120,255,0.28)');
  g.addColorStop(1, 'rgba(80,120,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(portal.x, portal.y, r * 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(220,245,255,0.95)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(portal.x, portal.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(160,210,255,0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(portal.x, portal.y, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,248,220,0.82)';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NEXT FLOOR', portal.x, portal.y - r - 18);
  ctx.restore();
}
export function drawHubReturnPortal(ctx, room, state) {
  const portal = room?.hubReturnPortal || null;
  if (!portal || !room?.cleared || !room?.isFloorFinal) return;
  const time = Number(state?.time) || 0;
  const pulse = 0.5 + 0.5 * Math.sin(time * 2.7 + 0.6);
  const r = 42 + pulse * 7;
  ctx.save();
  const g = ctx.createRadialGradient(portal.x, portal.y, 0, portal.x, portal.y, r * 1.9);
  g.addColorStop(0, 'rgba(255,255,240,0.96)');
  g.addColorStop(0.24, 'rgba(255,226,140,0.84)');
  g.addColorStop(0.58, 'rgba(120,255,205,0.24)');
  g.addColorStop(1, 'rgba(120,255,205,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(portal.x, portal.y, r * 1.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,245,190,0.96)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(portal.x, portal.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(170,255,228,0.72)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(portal.x, portal.y, r * 0.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,248,220,0.84)';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RETURN HUB', portal.x, portal.y - r - 18);
  ctx.restore();
}
