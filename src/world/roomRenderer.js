// Pixel_GO room-based background renderer (floating tiles + bridge in space).

import { biomeByKey } from "./biomes.js";

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

function getArenaSpec(room) {
  return room && room.arenaSpec ? room.arenaSpec : null;
}


function drawArenaDebugOverlay(ctx, room, arenaSpec, state = null) {
  if (!arenaSpec) return;
  const validationIssues = Array.isArray(arenaSpec?.validation?.issues) ? arenaSpec.validation.issues : [];
  const shouldDraw = !!(state?._arenaDebug || arenaSpec?.validation?.usedFallback || validationIssues.length);
  if (!shouldDraw) return;

  const geometry = arenaSpec.geometry || {};
  const platforms = Array.isArray(geometry.platforms) ? geometry.platforms : [];
  const bridges = Array.isArray(geometry.bridges) ? geometry.bridges : [];
  const navZones = Array.isArray(geometry.navZones) ? geometry.navZones : [];
  const anchors = arenaSpec.anchors || {};
  const spawnAnchors = Array.isArray(anchors.spawnAnchors) ? anchors.spawnAnchors : [];
  const gateAnchors = Array.isArray(anchors.gateAnchors) ? anchors.gateAnchors : [];
  const decorAnchors = Array.isArray(anchors.decorAnchors) ? anchors.decorAnchors : [];
  const coverAnchors = Array.isArray(anchors.coverAnchors) ? anchors.coverAnchors : [];
  const hazardAnchors = Array.isArray(anchors.hazardAnchors) ? anchors.hazardAnchors : [];
  const bossMoveNodes = Array.isArray(anchors.bossMoveNodes) ? anchors.bossMoveNodes : [];
  const hazards = Array.isArray(arenaSpec.hazardZones) ? arenaSpec.hazardZones : [];
  const bossArena = arenaSpec.bossArena || null;

  ctx.save();
  ctx.setLineDash([8, 7]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(90,210,255,0.40)';
  for (const r of platforms) {
    if (!r || r.type !== 'rect') continue;
    ctx.strokeRect(Number(r.x) || 0, Number(r.y) || 0, Number(r.w) || 0, Number(r.h) || 0);
  }
  ctx.strokeStyle = 'rgba(255,210,120,0.35)';
  for (const r of bridges) {
    if (!r || r.type !== 'rect') continue;
    ctx.strokeRect(Number(r.x) || 0, Number(r.y) || 0, Number(r.w) || 0, Number(r.h) || 0);
  }
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = 'rgba(120,255,140,0.30)';
  for (const r of navZones) {
    if (!r || r.type !== 'rect') continue;
    ctx.strokeRect(Number(r.x) || 0, Number(r.y) || 0, Number(r.w) || 0, Number(r.h) || 0);
  }
  ctx.setLineDash([]);

  const drawPoint = (p, color, size = 8, cross = false) => {
    const x = Number(p?.x) || 0;
    const y = Number(p?.y) || 0;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    if (cross) {
      ctx.beginPath();
      ctx.moveTo(x - size, y - size);
      ctx.lineTo(x + size, y + size);
      ctx.moveTo(x + size, y - size);
      ctx.lineTo(x - size, y + size);
      ctx.stroke();
      return;
    }
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.stroke();
  };

  drawPoint(anchors.playerStart, 'rgba(255,255,255,0.90)', 11);
  drawPoint(anchors.bossSpawn, 'rgba(255,120,120,0.90)', 12, true);
  for (const p of spawnAnchors) drawPoint(p, 'rgba(80,240,120,0.85)', 7);
  for (const p of gateAnchors) drawPoint(p, 'rgba(255,210,80,0.85)', 9);
  for (const p of decorAnchors) drawPoint(p, 'rgba(180,200,255,0.50)', 5);
  for (const p of coverAnchors) drawPoint(p, 'rgba(160,160,160,0.55)', 6);
  for (const p of hazardAnchors) drawPoint(p, 'rgba(255,120,190,0.70)', 6, true);
  for (const p of bossMoveNodes) drawPoint(p, 'rgba(255,150,60,0.85)', 6);

  ctx.strokeStyle = 'rgba(255,80,120,0.28)';
  ctx.fillStyle = 'rgba(255,80,120,0.05)';
  for (const z of hazards) {
    const r = Math.max(12, Number(z?.r) || 24);
    ctx.beginPath();
    ctx.arc(Number(z?.x) || 0, Number(z?.y) || 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  if (bossArena?.center) {
    ctx.strokeStyle = 'rgba(255,255,255,0.20)';
    ctx.beginPath();
    ctx.arc(Number(bossArena.center.x) || 0, Number(bossArena.center.y) || 0, Math.max(40, (room?.side || 700) * 0.06), 0, Math.PI * 2);
    ctx.stroke();
  }

  const lines = [
    `${arenaSpec.validation?.usedFallback ? 'SAFE FALLBACK' : 'ARENA DEBUG'} • ${String(arenaSpec.profileId || '')}/${String(arenaSpec.layoutId || '')}`,
    `platforms:${platforms.length} bridges:${bridges.length} nav:${navZones.length} spawns:${spawnAnchors.length} gates:${gateAnchors.length} hazards:${hazards.length}`,
    ...validationIssues.slice(0, 4).map((s) => `issue: ${String(s)}`),
  ];
  const bx = (room?.bounds?.minX || 0) + 28;
  const by = (room?.bounds?.minY || 0) + 34;
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let maxW = 0;
  for (const line of lines) maxW = Math.max(maxW, ctx.measureText(line).width);
  ctx.fillStyle = validationIssues.length ? 'rgba(50,12,20,0.66)' : 'rgba(8,20,34,0.54)';
  ctx.fillRect(bx - 10, by - 8, maxW + 20, lines.length * 20 + 12);
  let ty = by;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillStyle = i === 0 ? 'rgba(255,245,220,0.94)' : 'rgba(230,240,255,0.86)';
    ctx.fillText(lines[i], bx, ty);
    ty += 20;
  }
  ctx.restore();
}

function rectPath(ctx, r) {
  const x = Number(r?.x) || 0;
  const y = Number(r?.y) || 0;
  const w = Number(r?.w) || 0;
  const h = Number(r?.h) || 0;
  if (w <= 0 || h <= 0) return false;
  ctx.rect(x, y, w, h);
  return true;
}


function getArenaParts(arenaSpec) {
  const geometry = arenaSpec?.geometry || null;
  const platforms = Array.isArray(geometry?.platforms) ? geometry.platforms : [];
  const bridges = Array.isArray(geometry?.bridges) ? geometry.bridges : [];
  return [...platforms, ...bridges].filter(Boolean);
}

function clipToArenaParts(ctx, arenaSpec) {
  const parts = getArenaParts(arenaSpec);
  if (!parts.length) return false;
  ctx.beginPath();
  for (const part of parts) rectPath(ctx, part);
  ctx.clip();
  return true;
}

function drawArenaSolidShape(ctx, room, arenaSpec, time = 0, bounds = null) {
  const geometry = arenaSpec?.geometry || null;
  const platforms = Array.isArray(geometry?.platforms) ? geometry.platforms : [];
  const bridges = Array.isArray(geometry?.bridges) ? geometry.bridges : [];
  const parts = [...platforms, ...bridges].filter(Boolean);
  if (!parts.length || !bounds) return false;

  const biomeKey = String(room?.biomeKey || '').toLowerCase();
  let coreA = 'rgba(84,100,126,0.96)';
  let coreB = 'rgba(32,40,58,0.96)';
  let bridgeA = 'rgba(106,126,154,0.90)';
  let bridgeB = 'rgba(42,54,78,0.92)';
  let edge = 'rgba(210,230,255,0.20)';
  let glow = 'rgba(120,180,255,0.18)';
  if (biomeKey === 'electric') {
    coreA = 'rgba(168,252,255,0.98)'; coreB = 'rgba(34,112,146,0.96)';
    bridgeA = 'rgba(118,244,255,0.92)'; bridgeB = 'rgba(26,94,124,0.96)';
    edge = 'rgba(188,252,255,0.28)'; glow = 'rgba(74,226,255,0.22)';
  } else if (biomeKey === 'fire') {
    coreA = 'rgba(255,198,132,0.98)'; coreB = 'rgba(126,46,22,0.96)';
    bridgeA = 'rgba(255,148,96,0.94)'; bridgeB = 'rgba(98,34,18,0.96)';
    edge = 'rgba(255,214,166,0.24)'; glow = 'rgba(255,132,72,0.18)';
  } else if (biomeKey === 'ice') {
    coreA = 'rgba(238,248,255,0.98)'; coreB = 'rgba(152,192,240,0.96)';
    bridgeA = 'rgba(220,242,255,0.94)'; bridgeB = 'rgba(112,164,226,0.96)';
    edge = 'rgba(255,255,255,0.30)'; glow = 'rgba(188,224,255,0.18)';
  } else if (biomeKey === 'dark') {
    coreA = 'rgba(88,62,132,0.98)'; coreB = 'rgba(20,14,34,0.98)';
    bridgeA = 'rgba(110,76,172,0.94)'; bridgeB = 'rgba(28,18,48,0.98)';
    edge = 'rgba(218,192,255,0.20)'; glow = 'rgba(140,94,255,0.18)';
  } else if (biomeKey === 'light') {
    coreA = 'rgba(255,251,230,0.98)'; coreB = 'rgba(238,206,112,0.98)';
    bridgeA = 'rgba(255,238,172,0.94)'; bridgeB = 'rgba(214,168,70,0.98)';
    edge = 'rgba(255,252,220,0.26)'; glow = 'rgba(255,230,142,0.18)';
  }

  ctx.save();
  for (const part of parts) {
    const x = Number(part?.x) || 0;
    const y = Number(part?.y) || 0;
    const w = Number(part?.w) || 0;
    const h = Number(part?.h) || 0;
    if (w <= 0 || h <= 0) continue;
    const isBridge = bridges.includes(part);
    const shadow = ctx.createRadialGradient(x + w * 0.5, y + h * 0.5, 0, x + w * 0.5, y + h * 0.5, Math.max(w, h) * 0.8);
    shadow.addColorStop(0, 'rgba(0,0,0,0.18)');
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(x - 28, y - 28, w + 56, h + 56);
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, isBridge ? bridgeA : coreA);
    g.addColorStop(1, isBridge ? bridgeB : coreB);
    ctx.shadowColor = glow;
    ctx.shadowBlur = isBridge ? 10 : 16;
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = edge;
    ctx.lineWidth = isBridge ? 2 : 3;
    ctx.strokeRect(x + 1.5, y + 1.5, Math.max(0, w - 3), Math.max(0, h - 3));
  }
  ctx.restore();
  return true;
}


function drawArenaShapeOverlay(ctx, room, arenaSpec, time = 0) {
  const geometry = arenaSpec?.geometry || null;
  const platforms = Array.isArray(geometry?.platforms) ? geometry.platforms : [];
  const bridges = Array.isArray(geometry?.bridges) ? geometry.bridges : [];
  if (!platforms.length && !bridges.length) return;

  const biomeKey = String(room?.biomeKey || '').toLowerCase();
  let panelStroke = 'rgba(255,255,255,0.08)';
  let fillCore = 'rgba(16,18,28,0.16)';
  let fillBridge = 'rgba(160,200,255,0.06)';
  if (biomeKey === 'electric') {
    panelStroke = 'rgba(130,240,255,0.22)';
    fillCore = 'rgba(8,20,32,0.28)';
    fillBridge = 'rgba(70,210,255,0.10)';
  } else if (biomeKey === 'fire') {
    panelStroke = 'rgba(255,170,96,0.20)';
    fillCore = 'rgba(48,18,10,0.24)';
    fillBridge = 'rgba(255,120,60,0.10)';
  } else if (biomeKey === 'ice') {
    panelStroke = 'rgba(235,250,255,0.24)';
    fillCore = 'rgba(180,215,255,0.16)';
    fillBridge = 'rgba(210,240,255,0.12)';
  } else if (biomeKey === 'dark') {
    panelStroke = 'rgba(164,120,255,0.22)';
    fillCore = 'rgba(24,14,34,0.30)';
    fillBridge = 'rgba(92,64,160,0.12)';
  } else if (biomeKey === 'light') {
    panelStroke = 'rgba(255,236,150,0.22)';
    fillCore = 'rgba(255,250,214,0.14)';
    fillBridge = 'rgba(255,224,120,0.12)';
  }

  ctx.save();
  const drawRectLike = (r, fill, stroke, line = 3) => {
    const x = Number(r?.x) || 0;
    const y = Number(r?.y) || 0;
    const w = Number(r?.w) || 0;
    const h = Number(r?.h) || 0;
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = line;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  };

  for (const p of platforms) drawRectLike(p, fillCore, panelStroke, 3);
  for (const b of bridges) drawRectLike(b, fillBridge, panelStroke, 2);

  if (biomeKey === 'electric' || biomeKey === 'dark' || biomeKey === 'light') {
    ctx.strokeStyle = biomeKey === 'electric'
      ? 'rgba(120,245,255,0.36)'
      : (biomeKey === 'dark' ? 'rgba(190,120,255,0.28)' : 'rgba(255,232,132,0.30)');
    ctx.lineWidth = 2;
    const glow = 0.5 + 0.5 * Math.sin(time * (biomeKey === 'dark' ? 1.8 : 3.2));
    for (const b of bridges) {
      const x = Number(b?.x) || 0;
      const y = Number(b?.y) || 0;
      const w = Number(b?.w) || 0;
      const h = Number(b?.h) || 0;
      if (w <= 0 || h <= 0) continue;
      ctx.globalAlpha = 0.28 + glow * (biomeKey === 'dark' ? 0.18 : 0.24);
      if (w > h) {
        ctx.beginPath();
        ctx.moveTo(x + 10, y + h * 0.5);
        ctx.lineTo(x + w - 10, y + h * 0.5);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(x + w * 0.5, y + 10);
        ctx.lineTo(x + w * 0.5, y + h - 10);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}


function drawBossArenaOverlay(ctx, room, arenaSpec, time = 0) {
  const bossArena = arenaSpec?.bossArena || null;
  if (!bossArena || arenaSpec?.rules?.isHub) return;

  const biomeKey = String(room?.biomeKey || '').toLowerCase();
  const safe = Array.isArray(bossArena.safeLanes) ? bossArena.safeLanes : [];
  const pressure = Array.isArray(bossArena.pressureZones) ? bossArena.pressureZones : [];
  const phases = Array.isArray(bossArena.phaseNodes) ? bossArena.phaseNodes : [];
  const center = bossArena.center || null;

  let safeStroke = 'rgba(190,220,255,0.18)';
  let pressureFill = 'rgba(255,120,90,0.05)';
  let pressureStroke = 'rgba(255,180,120,0.16)';
  let phaseStroke = 'rgba(255,255,255,0.12)';
  if (biomeKey === 'electric') {
    safeStroke = 'rgba(130,245,255,0.18)';
    pressureFill = 'rgba(95,240,255,0.05)';
    pressureStroke = 'rgba(135,248,255,0.18)';
    phaseStroke = 'rgba(180,250,255,0.14)';
  } else if (biomeKey === 'fire') {
    safeStroke = 'rgba(255,220,160,0.14)';
    pressureFill = 'rgba(255,115,70,0.07)';
    pressureStroke = 'rgba(255,176,120,0.18)';
    phaseStroke = 'rgba(255,210,170,0.12)';
  } else if (biomeKey === 'ice') {
    safeStroke = 'rgba(255,255,255,0.18)';
    pressureFill = 'rgba(170,225,255,0.05)';
    pressureStroke = 'rgba(230,248,255,0.18)';
    phaseStroke = 'rgba(220,245,255,0.14)';
  } else if (biomeKey === 'dark') {
    safeStroke = 'rgba(170,120,255,0.16)';
    pressureFill = 'rgba(120,70,190,0.07)';
    pressureStroke = 'rgba(185,135,255,0.18)';
    phaseStroke = 'rgba(220,195,255,0.12)';
  } else if (biomeKey === 'light') {
    safeStroke = 'rgba(255,236,150,0.18)';
    pressureFill = 'rgba(255,232,140,0.05)';
    pressureStroke = 'rgba(255,245,190,0.18)';
    phaseStroke = 'rgba(255,245,210,0.12)';
  }

  ctx.save();
  if (center) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.1);
    ctx.strokeStyle = safeStroke;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(Number(center.x) || 0, Number(center.y) || 0, Math.max(56, (room?.side || 700) * (0.07 + pulse * 0.01)), 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.setLineDash([10, 10]);
  for (const z of safe) {
    const r = Math.max(18, Number(z?.r) || 42);
    ctx.strokeStyle = safeStroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(Number(z?.x) || 0, Number(z?.y) || 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.setLineDash([8, 12]);
  for (const z of pressure) {
    const r = Math.max(22, Number(z?.r) || 48);
    ctx.fillStyle = pressureFill;
    ctx.strokeStyle = pressureStroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(Number(z?.x) || 0, Number(z?.y) || 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.strokeStyle = phaseStroke;
  ctx.lineWidth = 2;
  for (const z of phases) {
    const x = Number(z?.x) || 0;
    const y = Number(z?.y) || 0;
    ctx.beginPath();
    ctx.moveTo(x - 10, y);
    ctx.lineTo(x + 10, y);
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x, y + 10);
    ctx.stroke();
  }
  ctx.restore();
}

function drawArenaSpecDecor(ctx, room, arenaSpec, time = 0) {
  const decor = Array.isArray(arenaSpec?.anchors?.decorAnchors) ? arenaSpec.anchors.decorAnchors : [];
  const cover = Array.isArray(arenaSpec?.anchors?.coverAnchors) ? arenaSpec.anchors.coverAnchors : [];
  const walls = Array.isArray(arenaSpec?.geometry?.walls) ? arenaSpec.geometry.walls : [];
  if (!decor.length && !cover.length && !walls.length) return;

  ctx.save();
  for (const d of decor) {
    if (!d) continue;
    const size = Math.max(10, Number(d.size) || 24);
    const x = Number(d.x) || 0;
    const y = Number(d.y) || 0;
    const kind = String(d.kind || 'relay');
    const isReactor = kind === 'reactor' || kind === 'hub_core';
    const isPortal = kind === 'portal_gate';
    const isShop = kind === 'shop_terminal';
    const isTier = kind === 'tier_terminal';
    const isSpawn = kind === 'spawn_pad';
    const isVoidObelisk = kind === 'void_obelisk';
    const isShadowSpire = kind === 'shadow_spire';
    const isRift = kind === 'rift';
    const isRadiantPylon = kind === 'radiant_pylon';
    const isLightPrism = kind === 'prism' || kind === 'light_prism';
    const isAltar = kind === 'altar' || kind === 'sun_dais';
    const isSunLens = kind === 'sun_lens';
    if (isVoidObelisk || isShadowSpire || isRift) {
      if (isRift) {
        ctx.strokeStyle = 'rgba(198,146,255,0.40)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(x, y, size * 1.05, size * 0.56, time * 0.35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x, y, size * 0.68, size * 0.32, -time * 0.5, 0, Math.PI * 2);
        ctx.stroke();
        const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 1.8);
        glow.addColorStop(0, 'rgba(154,88,255,0.26)');
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, size * 1.8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = isVoidObelisk ? 'rgba(16,10,26,0.74)' : 'rgba(12,8,24,0.70)';
        ctx.strokeStyle = isVoidObelisk ? 'rgba(212,186,255,0.30)' : 'rgba(168,118,255,0.26)';
        ctx.lineWidth = isVoidObelisk ? 2.6 : 2.2;
        ctx.beginPath();
        ctx.moveTo(x, y - size * 1.05);
        ctx.lineTo(x + size * 0.56, y - size * 0.08);
        ctx.lineTo(x + size * 0.18, y + size * 0.98);
        ctx.lineTo(x - size * 0.18, y + size * 0.98);
        ctx.lineTo(x - size * 0.56, y - size * 0.08);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(220,196,255,0.18)';
        ctx.beginPath();
        ctx.moveTo(x, y - size * 0.78);
        ctx.lineTo(x, y + size * 0.70);
        ctx.stroke();
        const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 1.6);
        glow.addColorStop(0, isVoidObelisk ? 'rgba(160,116,255,0.16)' : 'rgba(122,72,255,0.12)');
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, size * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      continue;
    }
    if (isRadiantPylon || isLightPrism || isAltar || isSunLens) {
      if (isSunLens) {
        ctx.strokeStyle = 'rgba(255,246,190,0.44)';
        ctx.lineWidth = 2.6;
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          ctx.arc(x, y, size * (0.58 + i * 0.34), 0, Math.PI * 2);
          ctx.stroke();
        }
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI * 2 * i) / 8 + time * 0.18;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * (size * 0.24), y + Math.sin(a) * (size * 0.24));
          ctx.lineTo(x + Math.cos(a) * (size * 1.08), y + Math.sin(a) * (size * 1.08));
          ctx.stroke();
        }
        const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 1.9);
        glow.addColorStop(0, 'rgba(255,242,170,0.28)');
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, size * 1.9, 0, Math.PI * 2);
        ctx.fill();
      } else if (isRadiantPylon) {
        ctx.fillStyle = 'rgba(255,248,224,0.60)';
        ctx.strokeStyle = 'rgba(255,236,156,0.34)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(x, y - size * 1.00);
        ctx.lineTo(x + size * 0.46, y - size * 0.10);
        ctx.lineTo(x + size * 0.16, y + size * 0.92);
        ctx.lineTo(x - size * 0.16, y + size * 0.92);
        ctx.lineTo(x - size * 0.46, y - size * 0.10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,250,225,0.24)';
        ctx.beginPath();
        ctx.moveTo(x, y - size * 0.72);
        ctx.lineTo(x, y + size * 0.64);
        ctx.stroke();
      } else if (isLightPrism) {
        ctx.fillStyle = 'rgba(255,246,214,0.40)';
        ctx.strokeStyle = 'rgba(255,232,148,0.38)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(x, y - size * 0.88);
        ctx.lineTo(x + size * 0.72, y + size * 0.18);
        ctx.lineTo(x, y + size * 0.88);
        ctx.lineTo(x - size * 0.72, y + size * 0.18);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (isAltar) {
        ctx.fillStyle = 'rgba(255,245,210,0.16)';
        ctx.strokeStyle = 'rgba(255,230,154,0.34)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(x, y, size * 0.96, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, size * 0.50, 0, Math.PI * 2);
        ctx.stroke();
      }
      const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 1.7);
      glow.addColorStop(0, 'rgba(255,238,165,0.20)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, size * 1.7, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.fillStyle = isReactor ? 'rgba(10,22,40,0.48)' : 'rgba(8,14,28,0.36)';
    ctx.fillRect(x - size, y - size * 0.5, size * 2, size);
    ctx.strokeStyle = isPortal
      ? 'rgba(150,240,255,0.34)'
      : isShop
        ? 'rgba(180,255,210,0.26)'
        : isTier
          ? 'rgba(255,225,170,0.26)'
          : isReactor
            ? 'rgba(140,238,255,0.28)'
            : 'rgba(200,220,255,0.16)';
    ctx.lineWidth = isPortal ? 3.5 : (isReactor ? 3 : 2);
    ctx.strokeRect(x - size + 1, y - size * 0.5 + 1, size * 2 - 2, size - 2);
    if (kind === 'cargo' || kind === 'dock') {
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - size * 0.8, y);
      ctx.lineTo(x + size * 0.8, y);
      ctx.stroke();
    }
    if (isPortal) {
      ctx.strokeStyle = 'rgba(140,235,255,0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.92, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y - size * 0.9);
      ctx.lineTo(x, y + size * 0.9);
      ctx.stroke();
    }
    if (isShop || isTier || isSpawn) {
      ctx.strokeStyle = isShop ? 'rgba(170,255,205,0.18)' : (isTier ? 'rgba(255,230,170,0.18)' : 'rgba(170,220,255,0.18)');
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - size * 0.55, y);
      ctx.lineTo(x + size * 0.55, y);
      ctx.moveTo(x, y - size * 0.35);
      ctx.lineTo(x, y + size * 0.35);
      ctx.stroke();
    }
    const glow = ctx.createRadialGradient(x, y, 0, x, y, size * (isPortal ? 1.8 : isReactor ? 1.6 : 1.2));
    glow.addColorStop(0, isPortal ? 'rgba(120,220,255,0.28)' : isShop ? 'rgba(170,255,205,0.16)' : isTier ? 'rgba(255,225,170,0.16)' : isReactor ? 'rgba(150,235,255,0.28)' : 'rgba(220,230,255,0.10)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, size * (isPortal ? 1.8 : isReactor ? 1.6 : 1.2), 0, Math.PI * 2);
    ctx.fill();
  }
  for (const c of cover) {
    if (!c) continue;
    const size = Math.max(10, Number(c.size) || 18);
    const x = Number(c.x) || 0;
    const y = Number(c.y) || 0;
    ctx.fillStyle = 'rgba(12,18,30,0.44)';
    ctx.fillRect(x - size, y - size * 0.7, size * 2, size * 1.4);
    ctx.strokeStyle = 'rgba(210,230,255,0.16)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - size + 1, y - size * 0.7 + 1, size * 2 - 2, size * 1.4 - 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.moveTo(x - size * 0.75, y);
    ctx.lineTo(x + size * 0.75, y);
    ctx.stroke();
  }
  if (walls.length) {
    ctx.strokeStyle = 'rgba(220,235,255,0.18)';
    ctx.lineWidth = 4;
    for (const w of walls) {
      if (!w) continue;
      ctx.beginPath();
      ctx.moveTo(Number(w.x1) || 0, Number(w.y1) || 0);
      ctx.lineTo(Number(w.x2) || 0, Number(w.y2) || 0);
      ctx.stroke();
    }
  }
  if (arenaSpec?.rules?.isHub && arenaSpec?.bossArena?.center) {
    const cx = Number(arenaSpec.bossArena.center.x) || 0;
    const cy = Number(arenaSpec.bossArena.center.y) || 0;
    const r = Math.max(70, ((room?.side || 800) * 0.11));
    ctx.strokeStyle = 'rgba(165,245,255,0.30)';
    ctx.lineWidth = 5;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, r + i * 26, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6 + time * 0.08;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r * 0.5), cy + Math.sin(a) * (r * 0.5));
      ctx.lineTo(cx + Math.cos(a) * (r * 1.45), cy + Math.sin(a) * (r * 1.45));
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawArenaHazards(ctx, room, arenaSpec, time = 0) {
  const hazards = Array.isArray(arenaSpec?.hazardZones) ? arenaSpec.hazardZones : [];
  if (!hazards.length) return;
  ctx.save();
  clipToArenaParts(ctx, arenaSpec);
  for (let i = 0; i < hazards.length; i++) {
    const z = hazards[i];
    if (!z) continue;
    const x = Number(z.x) || 0;
    const y = Number(z.y) || 0;
    const r = Math.max(12, Number(z.r) || 22);
    const interval = Math.max(0.5, Number(z.interval) || 6);
    const duration = Math.max(0.15, Math.min(interval, Number(z.duration) || 1));
    const phase = ((time || 0) + i * 0.73) % interval;
    const active = phase <= duration;
    const cooldownP = clamp(phase / interval, 0, 1);
    const activeP = active ? clamp(phase / duration, 0, 1) : 0;
    const type = String(z.type || z.kind || '').toLowerCase();
    const isVoid = type.includes('void') || type.includes('phase') || type.includes('dark');
    const isLight = type.includes('radiant') || type.includes('prism') || type.includes('blessing') || type.includes('solar') || type.includes('light');
    const isElectric = type.includes('electric') || type.includes('pulse') || type.includes('arc');
    const isIce = type.includes('frost') || type.includes('slip') || type.includes('ice');
    const isFire = type.includes('heat') || type.includes('fire') || type.includes('vent');
    let fill = active ? 'rgba(255,140,90,0.16)' : 'rgba(150,200,255,0.05)';
    let stroke = active ? 'rgba(255,185,140,0.34)' : 'rgba(180,220,255,0.16)';
    let glowInner = 'rgba(255,170,120,0.20)';
    if (isElectric) {
      fill = active ? 'rgba(90,236,255,0.18)' : 'rgba(86,176,210,0.06)';
      stroke = active ? 'rgba(168,248,255,0.38)' : 'rgba(132,220,246,0.18)';
      glowInner = active ? 'rgba(120,236,255,0.24)' : 'rgba(92,180,220,0.10)';
    } else if (isIce) {
      fill = active ? 'rgba(196,236,255,0.18)' : 'rgba(170,214,255,0.06)';
      stroke = active ? 'rgba(244,251,255,0.38)' : 'rgba(214,234,255,0.18)';
      glowInner = active ? 'rgba(210,240,255,0.24)' : 'rgba(176,210,255,0.10)';
    } else if (isVoid) {
      fill = active ? 'rgba(146,92,255,0.16)' : 'rgba(108,78,170,0.07)';
      stroke = active ? 'rgba(204,166,255,0.34)' : 'rgba(168,132,240,0.18)';
      glowInner = active ? 'rgba(172,116,255,0.22)' : 'rgba(120,84,210,0.10)';
    } else if (isLight) {
      fill = active ? 'rgba(255,236,146,0.16)' : 'rgba(255,228,160,0.06)';
      stroke = active ? 'rgba(255,247,204,0.36)' : 'rgba(255,236,176,0.18)';
      glowInner = active ? 'rgba(255,236,160,0.22)' : 'rgba(255,224,138,0.10)';
    } else if (isFire) {
      fill = active ? 'rgba(255,140,90,0.16)' : 'rgba(180,110,84,0.06)';
      stroke = active ? 'rgba(255,185,140,0.34)' : 'rgba(255,192,158,0.16)';
      glowInner = active ? 'rgba(255,170,120,0.20)' : 'rgba(180,110,84,0.10)';
    }

    ctx.strokeStyle = stroke;
    ctx.lineWidth = active ? 3 : 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.96, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, r * 0.58, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = active ? 3.2 : 1.8;
    ctx.globalAlpha = active ? 0.72 : 0.34;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.10, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * (active ? (1 - activeP) : (1 - cooldownP)));
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = active ? 2.2 : 1.4;
    if (isElectric) {
      for (let a = 0; a < 4; a++) {
        const ang = Math.PI * 0.25 + a * Math.PI * 0.5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * r * 0.10, Math.sin(ang) * r * 0.10);
        ctx.lineTo(Math.cos(ang) * r * 0.44, Math.sin(ang) * r * 0.44);
        ctx.stroke();
      }
    } else if (isIce) {
      for (let a = 0; a < 3; a++) {
        const ang = a * Math.PI / 3;
        ctx.beginPath();
        ctx.moveTo(-Math.cos(ang) * r * 0.34, -Math.sin(ang) * r * 0.34);
        ctx.lineTo(Math.cos(ang) * r * 0.34, Math.sin(ang) * r * 0.34);
        ctx.stroke();
      }
    } else if (isVoid) {
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.26, r * 0.14, time * 0.35, 0, Math.PI * 2);
      ctx.stroke();
    } else if (isLight) {
      for (let a = 0; a < 4; a++) {
        const ang = a * Math.PI * 0.5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * r * 0.10, Math.sin(ang) * r * 0.10);
        ctx.lineTo(Math.cos(ang) * r * 0.34, Math.sin(ang) * r * 0.34);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.26);
      ctx.lineTo(r * 0.22, r * 0.18);
      ctx.lineTo(-r * 0.22, r * 0.18);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();

    if (active) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8);
      glow.addColorStop(0, glowInner);
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// Extra biome surface FX on the tile top face.
// Goal: each biome should read like a distinct floating platform in space, not just a recolored tile.
function drawBiomeSurfaceFX(ctx, room, { x0, x1, y0, y1, w, h }, { biomeKey, hue, time }) {
  const key = String(biomeKey || "").toLowerCase();
  if (!key) return;

  const seed = ((room.index || 0) * 2654435761) ^ ((hue | 0) * 1013904223) ^ 0x5bd1e995;
  const rnd = makeRng(seed >>> 0);
  const cx = (x0 + x1) * 0.5;
  const cy = (y0 + y1) * 0.5;

  ctx.save();
  const arenaSpec = getArenaSpec(room);
  clipToArenaParts(ctx, arenaSpec);

  if (key === "electric") {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "rgba(8,26,36,0.88)");
    g.addColorStop(1, "rgba(5,18,26,0.90)");
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, w, h);

    ctx.strokeStyle = hsla(hue, 95, 64, 0.44);
    ctx.lineWidth = 4;
    for (let i = 0; i < 7; i++) {
      const yy = y0 + 55 + rnd() * (h - 110);
      ctx.beginPath();
      ctx.moveTo(x0 + 40, yy);
      ctx.lineTo(x0 + w * (0.25 + rnd() * 0.18), yy);
      ctx.lineTo(x0 + w * (0.34 + rnd() * 0.22), yy + (rnd() - 0.5) * 80);
      ctx.lineTo(x1 - 40, yy + (rnd() - 0.5) * 40);
      ctx.stroke();
    }
    ctx.fillStyle = hsla(hue, 95, 68, 0.22);
    for (let i = 0; i < 16; i++) {
      const px = x0 + 60 + rnd() * (w - 120);
      const py = y0 + 60 + rnd() * (h - 120);
      ctx.fillRect(px - 12, py - 12, 24, 24);
    }
  } else if (key === "fire") {
    const g = ctx.createLinearGradient(x0, y0, x0, y1);
    g.addColorStop(0, "rgba(52,19,10,0.84)");
    g.addColorStop(0.55, "rgba(88,30,14,0.82)");
    g.addColorStop(1, "rgba(28,8,6,0.90)");
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, w, h);

    for (let i = 0; i < 6; i++) {
      const lx = x0 + 70 + rnd() * (w - 140);
      const lw = 36 + rnd() * 100;
      const lg = ctx.createLinearGradient(lx, y0, lx + lw, y0);
      lg.addColorStop(0, "rgba(255,180,90,0.00)");
      lg.addColorStop(0.5, "rgba(255,120,50,0.44)");
      lg.addColorStop(1, "rgba(255,220,120,0.00)");
      ctx.fillStyle = lg;
      ctx.fillRect(lx, y0 + 35, lw, h - 70);
    }
    ctx.fillStyle = "rgba(255,160,90,0.15)";
    for (let i = 0; i < 22; i++) {
      const sx = x0 + 40 + rnd() * (w - 80);
      const sy = y1 - 30 - rnd() * (h * 0.45);
      const rr = 2 + rnd() * 4;
      ctx.beginPath();
      ctx.arc(sx, sy - ((time * 22 + i * 11) % 30), rr, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (key === "ice") {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "rgba(212,236,255,0.74)");
    g.addColorStop(1, "rgba(160,206,255,0.78)");
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, w, h);

    ctx.strokeStyle = "rgba(255,255,255,0.48)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 14; i++) {
      const ax = x0 + 40 + rnd() * (w - 80);
      const ay = y0 + 40 + rnd() * (h - 80);
      const bx = ax + (rnd() - 0.5) * 280;
      const by = ay + (rnd() - 0.5) * 220;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.20)";
    for (let i = 0; i < 28; i++) {
      const px = x0 + 30 + rnd() * (w - 60);
      const py = y0 + 30 + rnd() * (h - 60);
      ctx.beginPath();
      ctx.arc(px, py, 1.5 + rnd() * 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (key === "dark") {
    const g = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.max(w, h) * 0.6);
    g.addColorStop(0, "rgba(16,8,26,0.94)");
    g.addColorStop(0.55, "rgba(24,10,40,0.88)");
    g.addColorStop(1, "rgba(7,5,14,0.96)");
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, w, h);

    ctx.strokeStyle = hsla(hue, 55, 44, 0.34);
    ctx.lineWidth = 4;
    for (let i = 0; i < 8; i++) {
      const ax = x0 + 70 + rnd() * (w - 140);
      const ay = y0 + 70 + rnd() * (h - 140);
      const bx = ax + (rnd() - 0.5) * 340;
      const by = ay + (rnd() - 0.5) * 340;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    const fog = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.5);
    fog.addColorStop(0, "rgba(140,90,255,0.18)");
    fog.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fog;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(w, h) * 0.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (key === "light") {
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(w, h) * 0.55);
    g.addColorStop(0, "rgba(255,250,220,0.92)");
    g.addColorStop(0.75, "rgba(255,233,150,0.78)");
    g.addColorStop(1, "rgba(246,212,110,0.74)");
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, w, h);

    ctx.strokeStyle = hsla(hue, 95, 56, 0.28);
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, 120 + i * 75, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12 + time * 0.08;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 70, cy + Math.sin(a) * 70);
      ctx.lineTo(cx + Math.cos(a) * (w * 0.45), cy + Math.sin(a) * (h * 0.45));
      ctx.stroke();
    }
  }

  // Shared sci-fi platform modules so every biome still reads like a man-made tile in space.
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  const moduleSize = Math.max(120, Math.min(210, Math.min(w, h) * 0.18));
  let gx = x0 + 26;
  for (; gx < x1 - 26; gx += moduleSize) {
    let gy = y0 + 26;
    for (; gy < y1 - 26; gy += moduleSize) {
      ctx.strokeRect(gx, gy, Math.min(moduleSize - 14, x1 - gx - 26), Math.min(moduleSize - 14, y1 - gy - 26));
    }
  }

  ctx.restore();
}


function drawNeutralSpaceSurfaceFX(ctx, room, { x0, x1, y0, y1, w, h }, { hue, time }) {
  const arenaSpec = getArenaSpec(room);
  const seed = (((room.index || 0) + 17) * 2246822519) ^ 0x7f4a7c15;
  const rnd = makeRng(seed >>> 0);
  const cx = (x0 + x1) * 0.5;
  const cy = (y0 + y1) * 0.5;
  const isHub = !!(arenaSpec?.rules?.isHub || (room && (room.index | 0) === 0));

  ctx.save();
  clipToArenaParts(ctx, arenaSpec);

  const g = ctx.createLinearGradient(x0, y0, x1, y1);

  if (isHub) {
    g.addColorStop(0, 'rgba(92,115,160,0.98)');
    g.addColorStop(0.5, 'rgba(56,75,116,0.98)');
    g.addColorStop(1, 'rgba(30,42,72,0.99)');
  } else {
    g.addColorStop(0, 'rgba(78,94,124,0.98)');
    g.addColorStop(0.5, 'rgba(42,52,78,0.99)');
    g.addColorStop(1, 'rgba(24,30,46,0.99)');
  }
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, w, h);

  // Orbital rings / lane marks so neutral tiles still feel like station platforms in open space.
  ctx.strokeStyle = isHub ? 'rgba(120,210,255,0.22)' : 'rgba(160,190,255,0.16)';
  ctx.lineWidth = isHub ? 4 : 3;
  for (let i = 0; i < (isHub ? 4 : 3); i++) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * (0.18 + i * 0.12), h * (0.14 + i * 0.09), 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Tech rails / docking strips
  for (let i = 0; i < (isHub ? 5 : 4); i++) {
    const yy = y0 + h * (0.18 + i * 0.17);
    const gg = ctx.createLinearGradient(x0, yy, x1, yy);
    gg.addColorStop(0, 'rgba(255,255,255,0)');
    gg.addColorStop(0.15, isHub ? 'rgba(120,225,255,0.10)' : 'rgba(140,160,255,0.06)');
    gg.addColorStop(0.5, isHub ? 'rgba(120,225,255,0.24)' : 'rgba(180,200,255,0.10)');
    gg.addColorStop(0.85, isHub ? 'rgba(120,225,255,0.10)' : 'rgba(140,160,255,0.06)');
    gg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(x0 + 30, yy - 5, w - 60, 10);
  }

  // Docking modules / reactors
  const moduleCount = isHub ? 8 : 5;
  for (let i = 0; i < moduleCount; i++) {
    const mx = x0 + 50 + rnd() * (w - 100);
    const my = y0 + 50 + rnd() * (h - 100);
    const mw = (isHub ? 46 : 36) + rnd() * (isHub ? 42 : 28);
    const mh = (isHub ? 24 : 20) + rnd() * (isHub ? 26 : 20);
    ctx.fillStyle = isHub ? 'rgba(12,20,38,0.34)' : 'rgba(10,14,28,0.32)';
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = isHub ? 'rgba(135,235,255,0.22)' : 'rgba(200,220,255,0.12)';
    ctx.lineWidth = 2;
    ctx.strokeRect(mx + 1, my + 1, mw - 2, mh - 2);
  }

  // Floating helper beacons around the hub / floor center.
  const beaconCount = isHub ? 6 : 4;
  for (let i = 0; i < beaconCount; i++) {
    const a = (Math.PI * 2 * i) / beaconCount + time * (isHub ? 0.1 : 0.06);
    const rx = cx + Math.cos(a) * w * (isHub ? 0.28 : 0.22);
    const ry = cy + Math.sin(a) * h * (isHub ? 0.22 : 0.18);
    const gg = ctx.createRadialGradient(rx, ry, 0, rx, ry, isHub ? 26 : 18);
    gg.addColorStop(0, isHub ? 'rgba(140,235,255,0.42)' : 'rgba(220,230,255,0.22)');
    gg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(rx, ry, isHub ? 26 : 18, 0, Math.PI * 2);
    ctx.fill();
  }

  if (isHub) {
    // Hub core: central station pad / portal reactor.
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.18);
    cg.addColorStop(0, 'rgba(210,250,255,0.70)');
    cg.addColorStop(0.45, 'rgba(120,220,255,0.24)');
    cg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(w, h) * 0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(170,245,255,0.34)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(w, h) * 0.12, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
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

  // Biome tint (very subtle). Applied in screen-space so it feels like the whole "space" changes.
  try {
    const biomeKey = String(state._roomBiome || (state.roomDirector && state.roomDirector.current ? state.roomDirector.current.biomeKey : "") || "");
    const biome = biomeByKey(biomeKey);
    if (biome) {
      // A bit more "nebula" feel per biome.
      const gx = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.9);
      gx.addColorStop(0, `hsla(${biome.hue},95%,40%,0.26)`);
      gx.addColorStop(0.55, `hsla(${(biome.hue + 30) % 360},85%,22%,0.18)`);
      gx.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = gx;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  } catch {}

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

// Floor terminal (NPC shop). Drawn on the platform surface.
// Shows a clickable/tappable button when the player is nearby.
function drawFloorShopNpc(ctx, state, room, geo, { hue = 210, time = 0 } = {}) {
  if (!state || !room) return;
  if ((room.index | 0) <= 0) return;
  if (!room.cleared) return;

  const npc = room.shopNpc || { x: room.centerX, y: room.centerY + (room.side || 600) * 0.18, r: 20 };
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

  const arenaSpec = getArenaSpec(room);
  const geometry = arenaSpec?.geometry || null;
  const platformCount = Array.isArray(geometry?.platforms) ? geometry.platforms.length : 0;
  const bridgeCount = Array.isArray(geometry?.bridges) ? geometry.bridges.length : 0;
  const useGeometryBody = (platformCount + bridgeCount) > 0;
  const biome = biomeByKey(room && room.biomeKey);
  const hue = biome ? (biome.hue | 0) : ((room.hue | 0) || 210);
  const glowCol = biome ? (biome.glow || "rgba(80,255,255,0.6)") : hsla(hue, 95, 62, 0.10);

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
    g.addColorStop(0, glowCol);
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
    const rx = w * (useGeometryBody ? 0.42 : 0.55);
    const ry = h * (useGeometryBody ? 0.34 : 0.45);
    ctx.fillStyle = useGeometryBody ? "rgba(0,0,0,0.26)" : "rgba(0,0,0,0.38)";
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!useGeometryBody) {
    ctx.fillStyle = hsla(hue, 24, 17, 0.95);
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(D.x, D.y);
    ctx.lineTo(D2.x, D2.y);
    ctx.lineTo(A2.x, A2.y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = hsla(hue, 26, 16, 0.95);
    ctx.beginPath();
    ctx.moveTo(B.x, B.y);
    ctx.lineTo(C.x, C.y);
    ctx.lineTo(C2.x, C2.y);
    ctx.lineTo(B2.x, B2.y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = hsla(hue, 28, 13, 0.96);
    ctx.beginPath();
    ctx.moveTo(D.x, D.y);
    ctx.lineTo(C.x, C.y);
    ctx.lineTo(C2.x, C2.y);
    ctx.lineTo(D2.x, D2.y);
    ctx.closePath();
    ctx.fill();
  }

  // Top face: legacy slab for fallback rooms, geometry-only rooms skip square body.
  {
    if (!useGeometryBody) {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      const biomeSurface = String((room && room.biomeKey) || "").toLowerCase();
      const visualPreset = String(arenaSpec?.visualPreset || '');
      if (biomeSurface === "fire") {
        g.addColorStop(0, "rgba(255,188,120,1)");
        g.addColorStop(0.55, "rgba(255,136,82,1)");
        g.addColorStop(1, "rgba(124,52,30,1)");
      } else if (biomeSurface === "ice") {
        g.addColorStop(0, "rgba(236,247,255,1)");
        g.addColorStop(0.55, "rgba(210,232,255,1)");
        g.addColorStop(1, "rgba(166,205,255,1)");
      } else if (biomeSurface === "dark") {
        g.addColorStop(0, "rgba(74,50,106,1)");
        g.addColorStop(0.55, "rgba(42,26,68,1)");
        g.addColorStop(1, "rgba(20,14,34,1)");
      } else if (biomeSurface === "light") {
        g.addColorStop(0, "rgba(255,251,226,1)");
        g.addColorStop(0.55, "rgba(255,239,174,1)");
        g.addColorStop(1, "rgba(240,210,116,1)");
      } else if (biomeSurface === "electric") {
        g.addColorStop(0, "rgba(192,252,255,1)");
        g.addColorStop(0.55, "rgba(125,237,255,1)");
        g.addColorStop(1, "rgba(52,168,204,1)");
      } else if (visualPreset === 'hub_core_station' || (room && (room.index | 0) === 0)) {
        g.addColorStop(0, 'rgba(90,118,164,1)');
        g.addColorStop(0.55, 'rgba(58,78,120,1)');
        g.addColorStop(1, 'rgba(30,42,72,1)');
      } else {
        g.addColorStop(0, 'rgba(92,104,128,1)');
        g.addColorStop(0.55, 'rgba(54,62,84,1)');
        g.addColorStop(1, 'rgba(28,34,48,1)');
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.lineTo(C.x, C.y);
      ctx.lineTo(D.x, D.y);
      ctx.closePath();
      ctx.fill();

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
    }

    drawArenaSolidShape(ctx, room, arenaSpec, time, { x0, y0, x1, y1, w, h });
    drawArenaShapeOverlay(ctx, room, arenaSpec, time);

    // Biome-specific surface accents (neon / frost / runes / etc.)
    drawBiomeSurfaceFX(ctx, room, { x0, x1, y0, y1, w, h }, { biomeKey: (room && room.biomeKey) || "", hue, time });
    if (!((room && room.biomeKey) || '')) {
      drawNeutralSpaceSurfaceFX(ctx, room, { x0, x1, y0, y1, w, h }, { hue, time });
    }
    drawArenaHazards(ctx, room, arenaSpec, time);
    drawArenaSpecDecor(ctx, room, arenaSpec, time);
    drawBossArenaOverlay(ctx, room, arenaSpec, time);

    // Emissive inner border (thin) only for fallback slab rooms.
    if (!useGeometryBody) {
      ctx.strokeStyle = hsla(hue, 95, 60, 0.18);
      ctx.lineWidth = 6;
      ctx.strokeRect(x0 + 18, y0 + 18, w - 36, h - 36);
    }

    // Legacy square perimeter visuals only for fallback slab rooms.
    if (!useGeometryBody) {
      drawPerimeterBarrier(ctx, state, room, { hue, time, fall });
    }
    drawGates(ctx, state, room, { x0, x1, y0, y1, w, h, fall }, { hue, time });

    drawArenaDebugOverlay(ctx, room, arenaSpec, state);

    // Floor terminal (NPC shop) — appears after the floor is cleared.
    drawFloorShopNpc(ctx, state, room, { x0, x1, y0, y1, w, h, fall }, { hue, time });

    // Corner beacons (small glows)
    if (!useGeometryBody) {
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
  }


  if (!useGeometryBody) {
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
  }

  // Label
  if (label) {
    const parts = String(label).split(' • ');
    ctx.globalAlpha = alpha * 0.55;
    ctx.fillStyle = "rgba(0,0,0,0.60)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "46px sans-serif";
    ctx.fillText(parts[0] || '', room.centerX, room.centerY + fall - (parts.length > 1 ? 10 : 0));
    if (parts.length > 1) {
      ctx.font = "18px sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.24)";
      ctx.fillText(parts.slice(1).join(' • '), room.centerX, room.centerY + fall + 26);
    }
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
  const fromBiome = biomeByKey(from && from.biomeKey);
  const toBiome = biomeByKey(to && to.biomeKey);
  const hue = fromBiome ? (fromBiome.hue | 0) : ((from.hue | 0) || 210);
  const toHue = toBiome ? (toBiome.hue | 0) : ((to.hue | 0) || hue);
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
  const padGrad = ctx.createLinearGradient(padX, padY, padX + padW, padY + padH);
  padGrad.addColorStop(0, hsla(hue, 24, 78, 1));
  padGrad.addColorStop(0.55, hsla(hue, 18, 42, 1));
  padGrad.addColorStop(1, hsla(hue, 18, 22, 1));
  ctx.fillStyle = padGrad;
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
    const topGrad = ctx.createLinearGradient((x0 + x1) * 0.5, y1, (x0 + x1) * 0.5, y0);
    topGrad.addColorStop(0, hsla(hue, 24, 72, 1));
    topGrad.addColorStop(0.45, hsla(((hue + toHue) * 0.5) % 360, 18, 42, 1));
    topGrad.addColorStop(1, hsla(toHue, 28, 34, 1));
    ctx.fillStyle = topGrad;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

    const laneW = Math.max(18, (x1 - x0) * 0.24);
    const laneX = (x0 + x1) * 0.5 - laneW * 0.5;
    const laneGrad = ctx.createLinearGradient(0, y1, 0, y0);
    laneGrad.addColorStop(0, hsla(hue, 95, 74, 0.10));
    laneGrad.addColorStop(1, hsla(toHue, 95, 70, 0.18));
    ctx.fillStyle = laneGrad;
    ctx.fillRect(laneX, y0 + 8, laneW, Math.max(0, (y1 - y0) - 16));

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

    // Guidance chevrons toward the next floor
    const chevronPulse = 0.45 + 0.55 * Math.sin((rd?.state?.time || 0) * 4.0);
    const chevronStep = 96;
    const chevronW = Math.max(16, (x1 - x0) * 0.18);
    ctx.fillStyle = hsla(toHue, 95, 72, 0.16 + chevronPulse * 0.10);
    for (let cy = y1 - 34; cy > y0 + 30; cy -= chevronStep) {
      ctx.beginPath();
      ctx.moveTo((x0 + x1) * 0.5, cy - 14);
      ctx.lineTo((x0 + x1) * 0.5 + chevronW, cy + 12);
      ctx.lineTo((x0 + x1) * 0.5, cy + 4);
      ctx.lineTo((x0 + x1) * 0.5 - chevronW, cy + 12);
      ctx.closePath();
      ctx.fill();
    }

    // Glow
    const glowStroke = ctx.createLinearGradient(0, y1, 0, y0);
    glowStroke.addColorStop(0, hsla(hue, 95, 62, 0.18));
    glowStroke.addColorStop(1, hsla(toHue, 95, 68, 0.28));
    ctx.strokeStyle = glowStroke;
    ctx.lineWidth = 7;
    ctx.strokeRect(x0 + 4, y0 + 4, (x1 - x0) - 8, (y1 - y0) - 8);

    const endGlow = ctx.createRadialGradient((x0 + x1) * 0.5, y0 + 8, 0, (x0 + x1) * 0.5, y0 + 8, Math.max(24, (x1 - x0) * 0.7));
    endGlow.addColorStop(0, hsla(toHue, 95, 72, 0.34));
    endGlow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = endGlow;
    ctx.beginPath();
    ctx.arc((x0 + x1) * 0.5, y0 + 8, Math.max(24, (x1 - x0) * 0.7), 0, Math.PI * 2);
    ctx.fill();
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
  state._shopButtons = [];

  // Render order: prev (falling), current, next.
  const rooms = [];
  if (rd.prev && !rd.prev.removed) rooms.push({ room: rd.prev, kind: "prev" });
  if (rd.current && !rd.current.removed) rooms.push({ room: rd.current, kind: "cur" });
  if (rd.next && !rd.next.removed) rooms.push({ room: rd.next, kind: "next" });

  for (const it of rooms) {
    const r = it.room;
    const fall = (r.collapsing ? (clamp(r.collapseT, 0, 1) * (r.side * 0.25 + 640)) : 0);
    const a = (r.collapsing ? (1 - clamp(r.collapseT, 0, 1)) : 1);
    const rb = biomeByKey(r && r.biomeKey);
    const label = (r.index === 0 ? "HUB" : `FLOOR ${r.index}${rb ? ` • ${String(rb.name || '').toUpperCase()}` : ''}`);
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
