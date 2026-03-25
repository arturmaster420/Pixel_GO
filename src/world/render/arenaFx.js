import { makeRng } from "./cosmosBackdrop.js";

function clamp(n, a, b) {
  return n < a ? a : (n > b ? b : n);
}

function hsla(h, s, l, a) {
  return `hsla(${h},${s}%,${l}%,${a})`;
}

function getArenaSpec(room) {
  return room && room.arenaSpec ? room.arenaSpec : null;
}

function getArenaParts(arenaSpec) {
  const geometry = arenaSpec?.geometry || null;
  const platforms = Array.isArray(geometry?.platforms) ? geometry.platforms : [];
  const bridges = Array.isArray(geometry?.bridges) ? geometry.bridges : [];
  return [...platforms, ...bridges].filter(Boolean);
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

function shapePath(ctx, r) {
  if (!r) return false;
  if (String(r?.type || '') === 'circle') {
    const x = Number(r?.x) || 0;
    const y = Number(r?.y) || 0;
    const rad = Number(r?.r) || 0;
    if (!(rad > 0)) return false;
    ctx.moveTo(x + rad, y);
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    return true;
  }
  return rectPath(ctx, r);
}

function clipToArenaParts(ctx, arenaSpec) {
  const parts = getArenaParts(arenaSpec);
  if (!parts.length) return false;
  ctx.beginPath();
  for (const part of parts) shapePath(ctx, part);
  ctx.clip();
  return true;
}


export function drawBossArenaOverlay(ctx, room, arenaSpec, time = 0) {
  const bossArena = arenaSpec?.bossArena || null;
  if (!bossArena || arenaSpec?.rules?.isHub) return;
  if (String(room?.biomeKey || '').toLowerCase() === 'neutral') return;

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
export function drawArenaSpecDecor(ctx, room, arenaSpec, time = 0) {
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
    const isLightPrism = kind === 'prism' || kind === 'light_prism' || kind === 'storm_prism';
    const isAltar = kind === 'altar' || kind === 'sun_dais';
    const isSunLens = kind === 'sun_lens';
    const isGardenPod = kind === 'garden_pod';
    const isGravityWell = kind === 'gravity_well';
    const isObservationDeck = kind === 'observation_deck';
    const isHologridPylon = kind === 'hologrid_pylon';
    const isTransitRail = kind === 'transit_rail';
    const isRelayBalcony = kind === 'relay_balcony';
    const isLightningRod = kind === 'lightning_rod';
    const isHubSealRoom = !!arenaSpec?.rules?.isHub || String(room?.biomeKey || '').toLowerCase() === 'hub';
    // Keep the central hub core visible even when the camera moves behind the center.
    // Other large hub anchors are already covered by the baked hub art, but the core gets an
    // extra world-space glow here so it never seems to disappear near the portal side.
    if (isHubSealRoom && (isPortal || isShop || isTier || isSpawn)) {
      continue;
    }
    const isCapacitorPetal = kind === 'capacitor_petal';
    const isEmberBrazier = kind === 'ember_brazier';
    const isObsidianRib = kind === 'obsidian_rib';
    const isCrystalRib = kind === 'crystal_rib';
    const isAuroraNode = kind === 'aurora_node';
    const isFrostMirror = kind === 'frost_mirror';
    const isDeadLantern = kind === 'dead_lantern';
    if (isVoidObelisk || isShadowSpire || isRift || isDeadLantern) {
      if (isDeadLantern) {
        ctx.strokeStyle = 'rgba(198,170,120,0.20)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - size * 0.90);
        ctx.lineTo(x, y - size * 0.18);
        ctx.stroke();
        ctx.fillStyle = 'rgba(18,14,16,0.76)';
        ctx.beginPath();
        ctx.arc(x, y + size * 0.12, size * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,220,160,0.08)';
        ctx.beginPath();
        ctx.arc(x, y + size * 0.12, size * 0.40, 0, Math.PI * 2);
        ctx.stroke();
      } else if (isRift) {
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
    if (isRadiantPylon || isLightPrism || isAltar || isSunLens || isGardenPod || isGravityWell || isObservationDeck || isHologridPylon || isTransitRail || isRelayBalcony || isLightningRod || isCapacitorPetal || isEmberBrazier || isObsidianRib || isCrystalRib || isAuroraNode || isFrostMirror) {
      if (isObservationDeck) {
        ctx.strokeStyle = 'rgba(214,246,255,0.34)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(x, y, size * 0.78, Math.PI, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - size * 0.66, y);
        ctx.lineTo(x + size * 0.66, y);
        ctx.stroke();
      } else if (isHologridPylon) {
        ctx.fillStyle = 'rgba(110,220,255,0.18)';
        ctx.strokeStyle = 'rgba(204,246,255,0.40)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(x, y - size * 0.92);
        ctx.lineTo(x + size * 0.32, y + size * 0.86);
        ctx.lineTo(x - size * 0.32, y + size * 0.86);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (isTransitRail) {
        ctx.strokeStyle = 'rgba(198,226,255,0.34)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(x - size * 0.90, y - size * 0.18);
        ctx.lineTo(x + size * 0.90, y - size * 0.18);
        ctx.moveTo(x - size * 0.90, y + size * 0.18);
        ctx.lineTo(x + size * 0.90, y + size * 0.18);
        ctx.stroke();
      } else if (isRelayBalcony) {
        ctx.fillStyle = 'rgba(188,228,255,0.12)';
        ctx.strokeStyle = 'rgba(220,246,255,0.30)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x - size * 0.84, y - size * 0.42, size * 1.68, size * 0.84, size * 0.20);
        ctx.fill();
        ctx.stroke();
      } else if (isGardenPod) {
        ctx.fillStyle = 'rgba(150,236,214,0.14)';
        ctx.strokeStyle = 'rgba(200,255,240,0.34)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.ellipse(x, y, size * 0.86, size * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - size * 0.60, y);
        ctx.lineTo(x + size * 0.60, y);
        ctx.stroke();
      } else if (isGravityWell) {
        ctx.strokeStyle = 'rgba(180,224,255,0.30)';
        ctx.lineWidth = 2.2;
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          ctx.ellipse(x, y, size * (0.44 + i * 0.20), size * (0.20 + i * 0.10), time * 0.25, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (isLightningRod) {
        ctx.strokeStyle = 'rgba(174,246,255,0.38)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(x, y - size * 0.96);
        ctx.lineTo(x, y + size * 0.90);
        ctx.moveTo(x - size * 0.22, y - size * 0.42);
        ctx.lineTo(x + size * 0.22, y - size * 0.56);
        ctx.lineTo(x - size * 0.12, y - size * 0.08);
        ctx.lineTo(x + size * 0.16, y - size * 0.18);
        ctx.stroke();
      } else if (isCapacitorPetal) {
        ctx.fillStyle = 'rgba(130,232,255,0.16)';
        ctx.strokeStyle = 'rgba(188,248,255,0.34)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI * 0.5;
          ctx.beginPath();
          ctx.ellipse(x + Math.cos(a) * size * 0.24, y + Math.sin(a) * size * 0.24, size * 0.36, size * 0.16, a, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      } else if (isEmberBrazier) {
        ctx.fillStyle = 'rgba(255,170,106,0.18)';
        ctx.strokeStyle = 'rgba(255,204,154,0.34)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(x, y, size * 0.54, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y - size * 0.42);
        ctx.lineTo(x + size * 0.18, y + size * 0.10);
        ctx.lineTo(x - size * 0.12, y + size * 0.16);
        ctx.closePath();
        ctx.stroke();
      } else if (isObsidianRib) {
        ctx.strokeStyle = 'rgba(255,190,140,0.24)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(x - size * 0.60, y + size * 0.48);
        ctx.quadraticCurveTo(x, y - size * 0.90, x + size * 0.60, y + size * 0.48);
        ctx.stroke();
      } else if (isCrystalRib) {
        ctx.strokeStyle = 'rgba(224,245,255,0.34)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(x - size * 0.56, y + size * 0.46);
        ctx.lineTo(x, y - size * 0.88);
        ctx.lineTo(x + size * 0.56, y + size * 0.46);
        ctx.stroke();
      } else if (isAuroraNode) {
        ctx.strokeStyle = 'rgba(202,255,250,0.34)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(x, y, size * 0.54, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - size * 0.42, y);
        ctx.lineTo(x + size * 0.42, y);
        ctx.stroke();
      } else if (isFrostMirror) {
        ctx.fillStyle = 'rgba(224,246,255,0.12)';
        ctx.strokeStyle = 'rgba(242,252,255,0.34)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(x, y - size * 0.86);
        ctx.lineTo(x + size * 0.68, y);
        ctx.lineTo(x, y + size * 0.86);
        ctx.lineTo(x - size * 0.68, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (isSunLens) {
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
export function drawArenaHazards(ctx, room, arenaSpec, time = 0) {
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
    const isVoid = type.includes('void') || type.includes('phase') || type.includes('dark') || type.includes('null') || type.includes('blackout') || type.includes('mist');
    const isLight = type.includes('radiant') || type.includes('prism') || type.includes('blessing') || type.includes('solar') || type.includes('light') || type.includes('ray') || type.includes('beam');
    const isElectric = type.includes('electric') || type.includes('pulse') || type.includes('arc') || type.includes('lightning') || type.includes('overload') || type.includes('storm') || type.includes('conductor');
    const isIce = type.includes('frost') || type.includes('slip') || type.includes('ice') || type.includes('whiteout') || type.includes('crystal') || type.includes('mirror');
    const isFire = type.includes('heat') || type.includes('fire') || type.includes('vent') || type.includes('ember') || type.includes('molten') || type.includes('lava');
    const isNeutral = type.includes('scanner') || type.includes('vacuum') || type.includes('gravity') || type.includes('shutter') || type.includes('rail');
    let fill = active ? 'rgba(255,140,90,0.16)' : 'rgba(150,200,255,0.05)';
    let stroke = active ? 'rgba(255,185,140,0.34)' : 'rgba(180,220,255,0.16)';
    let glowInner = 'rgba(255,170,120,0.20)';
    if (isElectric) {
      fill = active ? 'rgba(90,236,255,0.18)' : 'rgba(86,176,210,0.06)';
      stroke = active ? 'rgba(168,248,255,0.38)' : 'rgba(132,220,246,0.18)';
      glowInner = active ? 'rgba(120,236,255,0.24)' : 'rgba(92,180,220,0.10)';
    } else if (isNeutral) {
      fill = active ? 'rgba(176,220,255,0.14)' : 'rgba(130,166,214,0.05)';
      stroke = active ? 'rgba(220,240,255,0.34)' : 'rgba(176,204,236,0.16)';
      glowInner = active ? 'rgba(196,230,255,0.20)' : 'rgba(140,172,210,0.10)';
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
    } else if (isNeutral) {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.34, 0);
      ctx.lineTo(r * 0.34, 0);
      ctx.moveTo(0, -r * 0.34);
      ctx.lineTo(0, r * 0.34);
      ctx.stroke();
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
export function drawBiomeSurfaceFX(ctx, room, { x0, x1, y0, y1, w, h }, { biomeKey, hue, time }) {
  const arenaSpec = getArenaSpec(room);
  if (arenaSpec?.rules?.biomeCircularArena) return;
  const key = String(biomeKey || "").toLowerCase();
  if (!key) return;
  if (key === 'neutral') {
    drawNeutralSpaceSurfaceFX(ctx, room, { x0, x1, y0, y1, w, h }, { hue, time });
    return;
  }

  const seed = ((room.index || 0) * 2654435761) ^ ((hue | 0) * 1013904223) ^ 0x5bd1e995;
  const rnd = makeRng(seed >>> 0);
  const cx = (x0 + x1) * 0.5;
  const cy = (y0 + y1) * 0.5;

  ctx.save();
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
    for (let i = 0; i < 8; i++) {
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
export function drawNeutralSpaceSurfaceFX(ctx, room, { x0, x1, y0, y1, w, h }, { hue, time }) {
  const arenaSpec = getArenaSpec(room);
  if (arenaSpec?.rules?.neutralIntroCircleArena) return;
  const seed = (((room.index || 0) + 17) * 2246822519) ^ 0x7f4a7c15;
  const rnd = makeRng(seed >>> 0);
  const cx = (x0 + x1) * 0.5;
  const cy = (y0 + y1) * 0.5;
  const isHub = !!(arenaSpec?.rules?.isHub || (room && (room.index | 0) === 0));

  ctx.save();
  if (!clipToArenaParts(ctx, arenaSpec)) {
    ctx.restore();
    return;
  }

  const wash = ctx.createLinearGradient(x0, y0, x1, y1);
  wash.addColorStop(0, isHub ? 'rgba(12,28,68,0.22)' : 'rgba(10,24,60,0.18)');
  wash.addColorStop(0.48, isHub ? 'rgba(18,38,82,0.08)' : 'rgba(14,30,72,0.06)');
  wash.addColorStop(1, isHub ? 'rgba(6,14,34,0.18)' : 'rgba(6,12,28,0.14)');
  ctx.fillStyle = wash;
  ctx.fillRect(x0, y0, w, h);

  const parts = getArenaParts(arenaSpec);
  for (const part of parts) {
    const px = Number(part?.x) || 0;
    const py = Number(part?.y) || 0;
    const pw = Number(part?.w) || 0;
    const ph = Number(part?.h) || 0;
    if (pw <= 0 || ph <= 0) continue;
    const majorX = pw >= ph;
    const lane = ctx.createLinearGradient(majorX ? px : px + pw * 0.5, majorX ? py + ph * 0.5 : py, majorX ? px + pw : px + pw * 0.5, majorX ? py + ph * 0.5 : py + ph);
    lane.addColorStop(0, 'rgba(255,255,255,0)');
    lane.addColorStop(0.15, isHub ? 'rgba(160,232,255,0.06)' : 'rgba(148,208,255,0.04)');
    lane.addColorStop(0.5, isHub ? 'rgba(255,242,214,0.04)' : 'rgba(224,236,255,0.03)');
    lane.addColorStop(0.85, isHub ? 'rgba(160,232,255,0.06)' : 'rgba(148,208,255,0.04)');
    lane.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lane;
    if (majorX) ctx.fillRect(px + 18, py + ph * 0.42, Math.max(0, pw - 36), Math.max(8, ph * 0.12));
    else ctx.fillRect(px + pw * 0.42, py + 18, Math.max(8, pw * 0.12), Math.max(0, ph - 36));

    const trim = ctx.createLinearGradient(px, py, px + pw, py + ph);
    trim.addColorStop(0, 'rgba(255,255,255,0.02)');
    trim.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = trim;
    ctx.fillRect(px, py, pw, ph);
    const slotCount = majorX ? Math.max(2, Math.floor((pw - 36) / 56)) : Math.max(2, Math.floor((ph - 36) / 56));
    ctx.fillStyle = isHub ? 'rgba(255,238,186,0.18)' : 'rgba(142,214,255,0.14)';
    for (let i = 0; i < slotCount; i++) {
      if (majorX) {
        const sx = px + 22 + i * ((pw - 44) / slotCount);
        ctx.fillRect(sx, py + ph - 14, 18, 3);
      } else {
        const sy = py + 22 + i * ((ph - 44) / slotCount);
        ctx.fillRect(px + pw - 14, sy, 3, 18);
      }
    }
  }

  const glintCount = isHub ? 5 : 3;
  for (let i = 0; i < glintCount; i++) {
    const rx = x0 + 40 + rnd() * Math.max(40, w - 80);
    const ry = y0 + 40 + rnd() * Math.max(40, h - 80);
    const gg = ctx.createRadialGradient(rx, ry, 0, rx, ry, isHub ? 26 : 18);
    gg.addColorStop(0, isHub ? 'rgba(208,246,255,0.12)' : 'rgba(184,220,255,0.08)');
    gg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(rx, ry, isHub ? 26 : 18, 0, Math.PI * 2);
    ctx.fill();
  }

  const orbitalSweep = ctx.createLinearGradient(x0, cy - h * 0.045, x1, cy + h * 0.045);
  orbitalSweep.addColorStop(0, 'rgba(255,255,255,0)');
  orbitalSweep.addColorStop(0.5, isHub ? 'rgba(148,236,255,0.04)' : 'rgba(126,182,255,0.03)');
  orbitalSweep.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = orbitalSweep;
  ctx.fillRect(x0, cy - h * 0.045, w, h * 0.09);

  if (isHub) {
    const reactor = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.26);
    reactor.addColorStop(0, 'rgba(212,250,255,0.18)');
    reactor.addColorStop(0.42, 'rgba(120,226,255,0.08)');
    reactor.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = reactor;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(w, h) * 0.26, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ---- Cosmos (screen-space, multi-layer parallax) ----

// ---- Gates (cosmic portals on the platform edge) ----
