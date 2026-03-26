// Pixel_GO room-based background renderer (floating tiles + bridge in space).

import { biomeByKey } from "./biomes.js";
import { primaryEdgeForSocket } from "./roomRoute.js";
import { renderHubSceneWorld } from "./hub/hubRenderer.js";
import { HUB_ASSET_URLS } from "./hub/hubAssets.js";
import { getBiomeArtAssetSet, getBiomeArtSignature } from "./biomeArtAssets.js";
import { drawBiomeArenaArt, drawImageContainRect, drawImageCoverRect, getRoomTexture, hasLoadedBiomeArenaArt } from "./render/textureHelpers.js";
import { drawCosmosScreen, ensureCosmosCache } from "./render/cosmosBackdrop.js";
import { drawBossArenaOverlay, drawArenaSpecDecor, drawArenaHazards, drawBiomeSurfaceFX, drawNeutralSpaceSurfaceFX } from "./render/arenaFx.js";
import { drawArenaDebugOverlay } from "./render/arenaDebugOverlay.js";
import { drawBridge, drawFloorExitPortal, drawFloorShopNpc, drawGates, drawHubReturnPortal, drawPerimeterBarrier } from "./render/roomSceneObjects.js";
import { drawOrbitalBackdropBehindRoom, ensureRoomStaticArtCache, getRoomStaticArtCacheKey, isLuxurySpaceRoom, peekRoomStaticArtCache } from "./render/roomStaticCache.js";


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

function drawBiomeOrbCirclePlatform(ctx, part, time = 0, { biomeKey = 'neutral', isHub = false } = {}) {
  const cx = Number(part?.x) || 0;
  const cy = Number(part?.y) || 0;
  const r = Number(part?.r) || 0;
  if (!(r > 0)) return;

  const pid = String(part?.id || '').toLowerCase();
  const isNeutralIntroDisc = pid.startsWith('neutral_intro_');
  const biome = String(biomeKey || 'neutral').toLowerCase();
  const pulse = 0.5 + 0.5 * Math.sin(time * 0.55);

  const palettes = {
    neutral: { ring: 'rgba(234,246,255,0.94)', ringGlow: 'rgba(156,226,255,0.22)', innerA: 'rgba(196,236,255,0.16)', innerB: 'rgba(118,188,255,0.08)', innerC: 'rgba(36,72,148,0.10)', star: 'rgba(244,250,255,0.26)', accent: 'rgba(196,234,255,0.12)' },
    electric: { ring: 'rgba(224,255,255,0.94)', ringGlow: 'rgba(118,242,255,0.28)', innerA: 'rgba(194,255,255,0.15)', innerB: 'rgba(92,230,255,0.08)', innerC: 'rgba(12,86,138,0.10)', star: 'rgba(238,255,255,0.30)', accent: 'rgba(132,242,255,0.18)' },
    fire: { ring: 'rgba(255,238,220,0.94)', ringGlow: 'rgba(255,174,112,0.26)', innerA: 'rgba(255,230,198,0.14)', innerB: 'rgba(255,160,92,0.08)', innerC: 'rgba(102,40,20,0.10)', star: 'rgba(255,244,228,0.24)', accent: 'rgba(255,176,108,0.16)' },
    ice: { ring: 'rgba(248,252,255,0.96)', ringGlow: 'rgba(190,228,255,0.26)', innerA: 'rgba(242,250,255,0.14)', innerB: 'rgba(180,218,255,0.08)', innerC: 'rgba(82,128,202,0.10)', star: 'rgba(250,252,255,0.28)', accent: 'rgba(214,238,255,0.14)' },
    dark: { ring: 'rgba(232,220,255,0.88)', ringGlow: 'rgba(158,116,255,0.28)', innerA: 'rgba(210,198,255,0.10)', innerB: 'rgba(118,88,255,0.08)', innerC: 'rgba(18,10,36,0.12)', star: 'rgba(236,230,255,0.24)', accent: 'rgba(174,132,255,0.14)' },
    light: { ring: 'rgba(255,252,240,0.96)', ringGlow: 'rgba(255,222,132,0.28)', innerA: 'rgba(255,248,214,0.12)', innerB: 'rgba(255,228,138,0.08)', innerC: 'rgba(120,90,22,0.10)', star: 'rgba(255,252,236,0.26)', accent: 'rgba(255,232,156,0.14)' },
  };
  const palette = isNeutralIntroDisc
    ? palettes.neutral
    : (palettes[biome] || palettes.neutral);

  const outer = ctx.createRadialGradient(cx, cy, r * 0.72, cx, cy, r * 1.10);
  outer.addColorStop(0, 'rgba(255,255,255,0)');
  outer.addColorStop(0.74, palette.ringGlow);
  outer.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.10, 0, Math.PI * 2);
  ctx.fill();

  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.96);
  core.addColorStop(0, palette.innerA);
  core.addColorStop(0.42, palette.innerB);
  core.addColorStop(1, palette.innerC);
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.955, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.95, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalCompositeOperation = 'screen';

  const cloudCount = isNeutralIntroDisc ? 6 : 5;
  for (let i = 0; i < cloudCount; i++) {
    const ang = time * (0.030 + i * 0.004) + i * 1.31;
    const cloudX = cx + Math.cos(ang) * r * (0.08 + i * 0.058);
    const cloudY = cy + Math.sin(ang * 1.07) * r * (0.06 + i * 0.042);
    const cloudR = r * (0.34 - i * 0.034);
    const nebula = ctx.createRadialGradient(cloudX, cloudY, 0, cloudX, cloudY, Math.max(12, cloudR));
    nebula.addColorStop(0, palette.accent);
    nebula.addColorStop(0.44, palette.innerA);
    nebula.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = nebula;
    ctx.beginPath();
    ctx.arc(cloudX, cloudY, Math.max(12, cloudR), 0, Math.PI * 2);
    ctx.fill();
  }

  const starCount = Math.max(18, Math.round(r * 0.11));
  for (let i = 0; i < starCount; i++) {
    const seed = i * 92821 + Math.round(cx * 0.63) * 131 + Math.round(cy * 0.41) * 271;
    const ang = ((seed % 6283) / 1000) + Math.sin(time * 0.10 + i * 0.17) * 0.008;
    const dist = r * (0.08 + ((seed >>> 3) % 1000) / 1000 * 0.78);
    const sx = cx + Math.cos(ang) * dist;
    const sy = cy + Math.sin(ang * 1.12) * dist * 0.96;
    const sr = Math.max(0.7, r * (0.0020 + (((seed >>> 7) % 100) / 100) * 0.0024));
    const a = 0.16 + (((seed >>> 11) % 100) / 100) * 0.18 + pulse * 0.03;

    ctx.fillStyle = `${palette.star.slice(0, palette.star.lastIndexOf(',') + 1)}${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!isNeutralIntroDisc) {
    ctx.lineWidth = Math.max(2, r * 0.007);
    ctx.strokeStyle = palette.accent;
    if (biome === 'electric') {
      for (let i = 0; i < 3; i++) {
        const a = time * (0.8 + i * 0.16) + i * 2.1;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r * 0.18, cy + Math.sin(a) * r * 0.18);
        ctx.lineTo(cx + Math.cos(a + 0.18) * r * 0.38, cy + Math.sin(a + 0.18) * r * 0.38);
        ctx.lineTo(cx + Math.cos(a - 0.08) * r * 0.56, cy + Math.sin(a - 0.08) * r * 0.56);
        ctx.stroke();
      }
    } else if (biome === 'fire') {
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        const shift = time * 0.25 + i * 2.2;
        for (let t = 0; t <= 14; t++) {
          const a = shift + t * 0.20;
          const rr = r * (0.24 + t / 14 * 0.34) + Math.sin(time * 1.1 + t * 0.6 + i) * r * 0.010;
          const px = cx + Math.cos(a) * rr;
          const py = cy + Math.sin(a * 1.12) * rr * 0.72;
          if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    } else if (biome === 'ice') {
      for (let i = 0; i < 4; i++) {
        const a = i * (Math.PI / 2) + time * 0.06;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * r * 0.42, cy + Math.sin(a) * r * 0.42);
        ctx.stroke();
      }
    } else if (biome === 'dark') {
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        const start = time * 0.10 + i * 2.4;
        for (let t = 0; t <= 14; t++) {
          const a = start + t * 0.24;
          const rr = r * (0.18 + t / 14 * 0.42);
          const wobble = Math.sin(time * 0.7 + t * 0.6 + i) * r * 0.02;
          const px = cx + Math.cos(a) * (rr + wobble);
          const py = cy + Math.sin(a) * (rr - wobble * 0.5);
          if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    } else if (biome === 'light') {
      for (let i = 0; i < 6; i++) {
        const a = time * 0.05 + i * (Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r * 0.12, cy + Math.sin(a) * r * 0.12);
        ctx.lineTo(cx + Math.cos(a) * r * 0.52, cy + Math.sin(a) * r * 0.52);
        ctx.stroke();
      }
    }
  }
  ctx.restore();

  const ring = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  ring.addColorStop(0, palette.ring);
  ring.addColorStop(0.52, 'rgba(234,246,255,0.86)');
  ring.addColorStop(1, palette.ring);
  ctx.strokeStyle = ring;
  ctx.lineWidth = Math.max(10, r * 0.058);
  ctx.beginPath();
  ctx.arc(cx, cy, r - ctx.lineWidth * 0.56, 0, Math.PI * 2);
  ctx.stroke();
}

function chamferedRectPath(ctx, x, y, w, h, cut = 12) {
  const c = Math.max(0, Math.min(cut, Math.min(w, h) * 0.28));
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + c);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x + c, y + h);
  ctx.lineTo(x, y + h - c);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

function drawStationLuxuryTrim(ctx, x, y, w, h, { isBridge = false, isHub = false, pid = '', time = 0, smallModule = false } = {}) {
  if (!(w > 0 && h > 0)) return;
  const majorX = w >= h;
  const cut = smallModule ? Math.min(10, Math.min(w, h) * 0.16) : (isBridge ? Math.min(12, Math.min(w, h) * 0.18) : Math.min(20, Math.min(w, h) * 0.18));
  const hullDark = isHub ? 'rgba(6,18,42,0.98)' : 'rgba(6,16,38,0.98)';
  const hullMid = isHub ? 'rgba(20,60,128,0.98)' : 'rgba(18,48,110,0.98)';
  const hullLight = isHub ? 'rgba(108,188,255,0.96)' : 'rgba(88,156,240,0.94)';
  const trimHot = isHub ? 'rgba(255,236,176,0.88)' : 'rgba(220,238,255,0.74)';
  const trimCool = isHub ? 'rgba(170,242,255,0.62)' : 'rgba(148,212,255,0.50)';
  const laneA = isHub ? 'rgba(188,242,255,0.36)' : 'rgba(176,214,255,0.28)';
  const laneB = isHub ? 'rgba(255,246,214,0.22)' : 'rgba(224,238,255,0.18)';
  const slotCol = isHub ? 'rgba(255,236,182,0.55)' : 'rgba(150,208,255,0.36)';
  const cx = x + w * 0.5;
  const cy = y + h * 0.5;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.30)';
  ctx.shadowBlur = smallModule ? 10 : (isBridge ? 16 : 24);
  ctx.shadowOffsetY = smallModule ? 5 : (isBridge ? 8 : 12);
  chamferedRectPath(ctx, x, y, w, h, cut);
  const hull = ctx.createLinearGradient(x, y, x + (majorX ? 0 : w), y + (majorX ? h : 0));
  hull.addColorStop(0, hullLight);
  hull.addColorStop(0.18, hullMid);
  hull.addColorStop(0.55, hullDark);
  hull.addColorStop(1, isHub ? 'rgba(4,10,24,0.98)' : 'rgba(4,8,20,0.98)');
  ctx.fillStyle = hull;
  ctx.fill();
  ctx.restore();

  const inset = smallModule ? 4 : (isBridge ? 6 : 9);
  ctx.save();
  chamferedRectPath(ctx, x + inset, y + inset, Math.max(1, w - inset * 2), Math.max(1, h - inset * 2), Math.max(4, cut - 4));
  const deck = ctx.createLinearGradient(x, y, x + w, y + h);
  deck.addColorStop(0, 'rgba(16,34,74,0.98)');
  deck.addColorStop(0.55, 'rgba(10,18,40,0.98)');
  deck.addColorStop(1, 'rgba(6,10,24,0.98)');
  ctx.fillStyle = deck;
  ctx.fill();
  ctx.restore();

  ctx.save();
  chamferedRectPath(ctx, x + inset, y + inset, Math.max(1, w - inset * 2), Math.max(1, h - inset * 2), Math.max(4, cut - 4));
  ctx.clip();

  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.75);
  glow.addColorStop(0, isHub ? 'rgba(92,214,255,0.12)' : 'rgba(86,156,255,0.10)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x, y, w, h);

  if (majorX) {
    const laneH = Math.max(10, h * 0.18);
    const laneY = cy - laneH * 0.5;
    const lane = ctx.createLinearGradient(x + 16, laneY, x + w - 16, laneY);
    lane.addColorStop(0, 'rgba(255,255,255,0)');
    lane.addColorStop(0.18, laneA);
    lane.addColorStop(0.5, laneB);
    lane.addColorStop(0.82, laneA);
    lane.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lane;
    ctx.fillRect(x + 16, laneY, Math.max(0, w - 32), laneH);
    ctx.fillStyle = trimCool;
    ctx.fillRect(x + 16, y + 8, Math.max(0, w - 32), 3);
    ctx.fillRect(x + 16, y + h - 11, Math.max(0, w - 32), 3);
  } else {
    const laneW = Math.max(10, w * 0.18);
    const laneX = cx - laneW * 0.5;
    const lane = ctx.createLinearGradient(laneX, y + 16, laneX, y + h - 16);
    lane.addColorStop(0, 'rgba(255,255,255,0)');
    lane.addColorStop(0.18, laneA);
    lane.addColorStop(0.5, laneB);
    lane.addColorStop(0.82, laneA);
    lane.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lane;
    ctx.fillRect(laneX, y + 16, laneW, Math.max(0, h - 32));
    ctx.fillStyle = trimCool;
    ctx.fillRect(x + 8, y + 16, 3, Math.max(0, h - 32));
    ctx.fillRect(x + w - 11, y + 16, 3, Math.max(0, h - 32));
  }

  const panelStep = Math.max(40, Math.min(84, (majorX ? w : h) / 3.3));
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1.2;
  if (majorX) {
    for (let xx = x + 20; xx < x + w - 20; xx += panelStep) {
      ctx.beginPath();
      ctx.moveTo(xx, y + 12);
      ctx.lineTo(xx, y + h - 12);
      ctx.stroke();
    }
  } else {
    for (let yy = y + 20; yy < y + h - 20; yy += panelStep) {
      ctx.beginPath();
      ctx.moveTo(x + 12, yy);
      ctx.lineTo(x + w - 12, yy);
      ctx.stroke();
    }
  }

  const slots = Math.max(3, Math.min(16, Math.floor((majorX ? w : h) / 48)));
  for (let i = 0; i < slots; i++) {
    const t = (i + 0.5) / slots;
    ctx.fillStyle = slotCol;
    if (majorX) {
      const sx = x + w * t - 9;
      ctx.fillRect(sx, y + h - 14, 18, 4);
      if (!isBridge) ctx.fillRect(sx, y + 10, 18, 3);
    } else {
      const sy = y + h * t - 9;
      ctx.fillRect(x + w - 14, sy, 4, 18);
      if (!isBridge) ctx.fillRect(x + 10, sy, 3, 18);
    }
  }


  const isGalleryLike = /gallery|spine|link|bridge|proc|transit/.test(pid);
  const isPodLike = /pod|bal|deck|lookout|service|sidebay/.test(pid);
  const isWingLike = /wing|bay|vest|entry|exit/.test(pid);
  const isCoreLike = /core|rotunda|arena|crown|dais|split|ring|plaza|center/.test(pid);

  if (isGalleryLike) {
    const ribs = Math.max(2, Math.min(10, Math.floor((majorX ? w : h) / 44)));
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 1.1;
    for (let i = 1; i < ribs; i++) {
      const t = i / ribs;
      if (majorX) {
        const xx = x + 14 + (w - 28) * t;
        ctx.beginPath();
        ctx.moveTo(xx, y + 12);
        ctx.lineTo(xx, y + h - 12);
        ctx.stroke();
      } else {
        const yy = y + 14 + (h - 28) * t;
        ctx.beginPath();
        ctx.moveTo(x + 12, yy);
        ctx.lineTo(x + w - 12, yy);
        ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(255,244,198,0.24)';
    if (majorX) {
      ctx.fillRect(x + 12, cy - 2, Math.max(0, w - 24), 4);
    } else {
      ctx.fillRect(cx - 2, y + 12, 4, Math.max(0, h - 24));
    }
  }

  if (isPodLike || isWingLike) {
    ctx.strokeStyle = trimCool;
    ctx.lineWidth = 1.4;
    const pad = 12;
    ctx.strokeRect(x + pad, y + pad, Math.max(0, w - pad * 2), Math.max(0, h - pad * 2));
    ctx.fillStyle = 'rgba(255,244,198,0.18)';
    ctx.fillRect(cx - 10, cy - 3, 20, 6);
  }

  if (isCoreLike && !isBridge) {
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.36);
    halo.addColorStop(0, isHub ? 'rgba(178,240,255,0.26)' : 'rgba(140,208,255,0.20)');
    halo.addColorStop(0.55, isHub ? 'rgba(255,244,198,0.08)' : 'rgba(255,255,255,0.04)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(w, h) * 0.36, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!isBridge && w > 90 && h > 90) {
    ctx.strokeStyle = trimCool;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.22, h * 0.22, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.13, h * 0.13, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (/core|rotunda|arena|crown|dais|split|ring|plaza/.test(pid)) {
      const spokes = /split/.test(pid) ? 3 : 4;
      ctx.strokeStyle = trimHot;
      ctx.lineWidth = 1.6;
      for (let i = 0; i < spokes; i++) {
        const a = ((Math.PI * 2) / spokes) * i + time * 0.05;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * Math.min(w, h) * 0.06, cy + Math.sin(a) * Math.min(w, h) * 0.06);
        ctx.lineTo(cx + Math.cos(a) * Math.min(w, h) * 0.22, cy + Math.sin(a) * Math.min(w, h) * 0.22);
        ctx.stroke();
      }
      const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.22);
      coreGlow.addColorStop(0, isHub ? 'rgba(176,238,255,0.20)' : 'rgba(150,204,255,0.16)');
      coreGlow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = coreGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(w, h) * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  ctx.strokeStyle = trimHot;
  ctx.lineWidth = isBridge ? 2.2 : 2.8;
  chamferedRectPath(ctx, x + 1.5, y + 1.5, Math.max(1, w - 3), Math.max(1, h - 3), Math.max(4, cut - 1.5));
  ctx.stroke();

  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  if (majorX) {
    ctx.beginPath();
    ctx.moveTo(x + 18, y + h);
    ctx.lineTo(x + w - 18, y + h);
    ctx.lineTo(x + w - 28, y + h + (isBridge ? 12 : 18));
    ctx.lineTo(x + 28, y + h + (isBridge ? 12 : 18));
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(x + w, y + 18);
    ctx.lineTo(x + w + (isBridge ? 12 : 18), y + 28);
    ctx.lineTo(x + w + (isBridge ? 12 : 18), y + h - 28);
    ctx.lineTo(x + w, y + h - 18);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function getArenaArtParts(arenaSpec) {
  return Array.isArray(arenaSpec?.geometry?.artParts) ? arenaSpec.geometry.artParts.filter(Boolean) : [];
}

function drawStationMiniModule(ctx, x, y, w, h, { isHub = false, style = 'pod', time = 0, isNeutralIntro = false } = {}) {
  if (!(w > 0 && h > 0)) return;
  if (style === 'rail') {
    ctx.save();
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.18, isHub ? 'rgba(182,242,255,0.42)' : (isNeutralIntro ? 'rgba(196,238,255,0.42)' : 'rgba(168,216,255,0.30)'));
    g.addColorStop(0.52, isHub ? 'rgba(255,240,198,0.32)' : (isNeutralIntro ? 'rgba(244,232,255,0.24)' : 'rgba(222,236,255,0.20)'));
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    if (isNeutralIntro) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(214,246,255,0.16)';
      ctx.fillRect(x + w * 0.18, y, Math.max(2, w * 0.64), h);
    }
    ctx.restore();
    return;
  }
  if (style === 'undercroft') {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    chamferedRectPath(ctx, x, y, w, h, Math.min(6, Math.min(w, h) * 0.2));
    ctx.fill();
    ctx.restore();
    return;
  }
  drawStationLuxuryTrim(ctx, x, y, w, h, { isBridge: false, isHub, pid: style, time, smallModule: true });
  ctx.save();
  ctx.strokeStyle = isHub ? 'rgba(255,244,200,0.24)' : (isNeutralIntro ? 'rgba(220,242,255,0.34)' : 'rgba(184,226,255,0.18)');
  ctx.lineWidth = 1.2;
  if (style === 'fin') {
    ctx.beginPath();
    ctx.moveTo(x + 5, y + h - 5);
    ctx.lineTo(x + w * 0.5, y + 4);
    ctx.lineTo(x + w - 5, y + h - 5);
    ctx.stroke();
  } else if (style === 'satellite') {
    const cx = x + w * 0.5;
    const cy = y + h * 0.5;
    const rr = Math.min(w, h) * 0.18;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
    if (isNeutralIntro) {
      ctx.globalCompositeOperation = 'lighter';
      const orb = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr * 2.8);
      orb.addColorStop(0, 'rgba(248,255,255,0.42)');
      orb.addColorStop(0.32, 'rgba(170,240,255,0.22)');
      orb.addColorStop(0.72, 'rgba(132,146,255,0.12)');
      orb.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = orb;
      ctx.beginPath();
      ctx.arc(cx, cy, rr * 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,244,214,0.36)';
      ctx.beginPath();
      ctx.arc(cx, cy, rr * 1.65, time * 0.2, time * 0.2 + Math.PI * 1.2);
      ctx.stroke();
    }
  }
  if (isNeutralIntro && (style === 'pod' || style === 'fin')) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(212,244,255,0.12)';
    chamferedRectPath(ctx, x + 3, y + 3, Math.max(1, w - 6), Math.max(1, h - 6), Math.min(4, Math.min(w, h) * 0.16));
    ctx.fill();
  }
  ctx.restore();
}

function drawStationArtParts(ctx, room, arenaSpec, time = 0, layer = 'over') {
  const parts = getArenaArtParts(arenaSpec).filter((p) => String(p?.layer || 'over') === String(layer || 'over'));
  if (!parts.length) return;
  const isHub = !!arenaSpec?.rules?.isHub || String(room?.biomeKey || '').toLowerCase() === 'hub' || (room && (room.index | 0) === 0);
  const isNeutralIntro = !!arenaSpec?.rules?.neutralIntroCircleArena;
  if (isNeutralIntro) return;
  ctx.save();
  for (const part of parts) {
    const x = Number(part?.x) || 0;
    const y = Number(part?.y) || 0;
    const w = Number(part?.w) || 0;
    const h = Number(part?.h) || 0;
    if (!(w > 0 && h > 0)) continue;
    drawStationMiniModule(ctx, x, y, w, h, { isHub, style: String(part?.style || 'pod'), time, isNeutralIntro });
  }
  ctx.restore();
}

function roundedRectPath(ctx, x, y, w, h, r = 12) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) * 0.48));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawHubOrbitalDiscBase(ctx, arenaSpec, time = 0) {
  return !!renderHubSceneWorld(ctx, arenaSpec, time);
}

function drawHubSoftModule(ctx, x, y, w, h, { isBridge = false, pid = '', time = 0 } = {}) {
  if (!(w > 0 && h > 0)) return;
  const cx = x + w * 0.5;
  const cy = y + h * 0.5;
  const radius = isBridge ? Math.min(16, Math.min(w, h) * 0.34) : Math.min(22, Math.min(w, h) * 0.26);
  const isCoreLike = /core/.test(pid);
  const isWingLike = /wing|bay/.test(pid);
  const base = ctx.createLinearGradient(x, y, x, y + h);
  base.addColorStop(0, isBridge ? 'rgba(154,208,255,0.82)' : 'rgba(176,220,255,0.92)');
  base.addColorStop(0.18, isBridge ? 'rgba(74,132,220,0.92)' : 'rgba(78,138,236,0.96)');
  base.addColorStop(0.70, 'rgba(18,46,116,0.98)');
  base.addColorStop(1, 'rgba(8,20,62,0.98)');

  ctx.save();
  ctx.shadowColor = 'rgba(80,180,255,0.22)';
  ctx.shadowBlur = isBridge ? 10 : 18;
  ctx.shadowOffsetY = isBridge ? 4 : 7;
  roundedRectPath(ctx, x, y, w, h, radius);
  ctx.fillStyle = base;
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRectPath(ctx, x + 4, y + 4, Math.max(1, w - 8), Math.max(1, h - 8), Math.max(6, radius - 4));
  const inner = ctx.createLinearGradient(x, y, x + w, y + h);
  inner.addColorStop(0, 'rgba(162,224,255,0.20)');
  inner.addColorStop(0.35, 'rgba(96,164,255,0.12)');
  inner.addColorStop(1, 'rgba(8,20,62,0.06)');
  ctx.fillStyle = inner;
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(238,248,255,0.56)';
  ctx.lineWidth = isBridge ? 1.6 : 2.2;
  roundedRectPath(ctx, x + 1.5, y + 1.5, Math.max(1, w - 3), Math.max(1, h - 3), Math.max(5, radius - 1.5));
  ctx.stroke();

  ctx.save();
  const lane = ctx.createLinearGradient(x, y + h * 0.5, x + w, y + h * 0.5);
  lane.addColorStop(0, 'rgba(255,255,255,0)');
  lane.addColorStop(0.12, 'rgba(190,236,255,0.16)');
  lane.addColorStop(0.50, 'rgba(255,255,255,0.28)');
  lane.addColorStop(0.88, 'rgba(190,236,255,0.16)');
  lane.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = lane;
  const laneH = Math.max(4, Math.min(16, h * (isBridge ? 0.18 : 0.12)));
  ctx.fillRect(x + 10, cy - laneH * 0.5, Math.max(1, w - 20), laneH);
  ctx.restore();

  if (!isBridge && (isCoreLike || isWingLike)) {
    ctx.save();
    ctx.strokeStyle = 'rgba(214,240,255,0.22)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.16, h * 0.16, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
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
  for (const part of parts) shapePath(ctx, part);
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
  const visualPreset = String(arenaSpec?.visualPreset || '').toLowerCase();
  const isHubShape = !!arenaSpec?.rules?.isHub || visualPreset === 'hub_core_station' || visualPreset === 'hub_orbital_disc';
  const isNeutralShape = biomeKey === 'neutral' || visualPreset.includes('neutral_') || isHubShape;
  const useLoadedBiomeArtSurface = !isHubShape && hasLoadedBiomeArenaArt(room, 'surface');

  if (useLoadedBiomeArtSurface) {
    ctx.save();
    drawBiomeArenaArt(ctx, room, x0, y0, w, h, {
      layer: 'surface',
      alpha: 1,
      scaleMul: 1.00,
      mode: 'cover',
    });
    ctx.restore();
    return true;
  }

  let coreA = 'rgba(84,100,126,0.96)';
  let coreB = 'rgba(32,40,58,0.96)';
  let bridgeA = 'rgba(106,126,154,0.90)';
  let bridgeB = 'rgba(42,54,78,0.92)';
  let edge = 'rgba(210,230,255,0.20)';
  let glow = 'rgba(120,180,255,0.18)';
  if (isHubShape) {
    coreA = 'rgba(86,126,202,1)'; coreB = 'rgba(14,24,58,1)';
    bridgeA = 'rgba(68,108,184,1)'; bridgeB = 'rgba(10,18,44,1)';
    edge = 'rgba(242,248,255,0.70)'; glow = 'rgba(150,232,255,0.38)';
  } else if (isNeutralShape) {
    coreA = 'rgba(74,110,186,1)'; coreB = 'rgba(10,18,48,1)';
    bridgeA = 'rgba(58,94,168,1)'; bridgeB = 'rgba(8,16,40,1)';
    edge = 'rgba(228,238,255,0.58)'; glow = 'rgba(170,216,255,0.30)';
  } else if (biomeKey === 'electric') {
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
  const hubKind = String(arenaSpec?.geometry?.hubVisual?.kind || '').toLowerCase();
  if (isHubShape && (hubKind === 'orbital_disc' || hubKind === 'art_scene_v1' || hubKind === 'art_scene_v2')) {
    drawHubOrbitalDiscBase(ctx, arenaSpec, time);
    ctx.restore();
    return true;
  }
  if (isNeutralShape && !arenaSpec?.rules?.biomeCircularArena) drawStationArtParts(ctx, room, arenaSpec, time, 'under');
  for (const part of parts) {
    const isCircle = String(part?.type || '') === 'circle';
    const x = Number(part?.x) || 0;
    const y = Number(part?.y) || 0;
    const w = Number(part?.w) || 0;
    const h = Number(part?.h) || 0;
    const r = Number(part?.r) || 0;
    if (!isCircle && (w <= 0 || h <= 0)) continue;
    if (isCircle && !(r > 0)) continue;
    const isBridge = bridges.includes(part);
    if (isHubShape) continue;
    if (isCircle) {
      drawBiomeOrbCirclePlatform(ctx, part, time, { biomeKey, isHub: false });
      continue;
    }
    const shadow = ctx.createRadialGradient(x + w * 0.5, y + h * 0.5, 0, x + w * 0.5, y + h * 0.5, Math.max(w, h) * 0.8);
    shadow.addColorStop(0, 'rgba(0,0,0,0.18)');
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(x - 28, y - 28, w + 56, h + 56);
    if (isNeutralShape) {
      const pid = String(part?.id || '').toLowerCase();
      drawStationLuxuryTrim(ctx, x, y, w, h, { isBridge, isHub: false, pid, time });
    } else {
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
  }
  if (isNeutralShape && !arenaSpec?.rules?.biomeCircularArena) drawStationArtParts(ctx, room, arenaSpec, time, 'over');
  ctx.restore();
  return true;
}


function drawArenaShapeOverlay(ctx, room, arenaSpec, time = 0) {
  const geometry = arenaSpec?.geometry || null;
  const platforms = Array.isArray(geometry?.platforms) ? geometry.platforms : [];
  const bridges = Array.isArray(geometry?.bridges) ? geometry.bridges : [];
  if (!platforms.length && !bridges.length) return;

  const biomeKey = String(room?.biomeKey || '').toLowerCase();
  const visualPreset = String(arenaSpec?.visualPreset || '').toLowerCase();
  const isHubShape = !!arenaSpec?.rules?.isHub || visualPreset === 'hub_core_station' || visualPreset === 'hub_orbital_disc';
  const isNeutralShape = biomeKey === 'neutral' || visualPreset.includes('neutral_') || isHubShape;
  const useLoadedBiomeArtSurface = !isHubShape && hasLoadedBiomeArenaArt(room, 'surface');
  if (useLoadedBiomeArtSurface) return;
  let panelStroke = 'rgba(255,255,255,0.08)';
  let fillCore = 'rgba(16,18,28,0.16)';
  let fillBridge = 'rgba(160,200,255,0.06)';
  if (isHubShape) {
    panelStroke = 'rgba(224,248,255,0.12)';
    fillCore = 'rgba(26,44,82,0.04)';
    fillBridge = 'rgba(148,222,255,0.03)';
  } else if (isNeutralShape) {
    panelStroke = 'rgba(216,236,255,0.10)';
    fillCore = 'rgba(34,52,92,0.03)';
    fillBridge = 'rgba(164,202,255,0.02)';
  } else if (biomeKey === 'electric') {
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

  if (!useLoadedBiomeArtSurface && !isNeutralShape) {
    for (const p of platforms) drawRectLike(p, fillCore, panelStroke, 3);
    for (const b of bridges) drawRectLike(b, fillBridge, panelStroke, 2);
  }

  if (!useLoadedBiomeArtSurface && (biomeKey === 'electric' || biomeKey === 'dark' || biomeKey === 'light')) {
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
  const roomBounds = room?.bounds || null;
  if (!useLoadedBiomeArtSurface && !isHubShape && roomBounds) {
    drawBiomeArenaArt(ctx, room,
      Number(roomBounds.minX) || 0,
      Number(roomBounds.minY) || 0,
      (Number(roomBounds.maxX) || 0) - (Number(roomBounds.minX) || 0),
      (Number(roomBounds.maxY) || 0) - (Number(roomBounds.minY) || 0),
      { layer: 'overlay', mode: 'cover' });
  }
  ctx.restore();
}


export function scheduleRoomRenderWarmup(state) {
  if (!state || typeof window === 'undefined') return;
  const rd = state.roomDirector;
  const rooms = [rd?.current, rd?.next].filter(Boolean);
  const sig = rooms.map((room) => {
    const arenaSpec = getArenaSpec(room);
    return [
      room?.index | 0,
      room?.biomeKey || '',
      arenaSpec?.layoutId || '',
      arenaSpec?.visualPreset || '',
      getBiomeArtSignature(room?.biomeKey || 'neutral'),
    ].join('~');
  }).join('||');
  if (!sig) return;
  if (state._roomRenderWarmupPending && state._roomRenderWarmupSig === sig) return;
  if (state._roomRenderWarmupDoneSig === sig) return;
  state._roomRenderWarmupPending = true;
  state._roomRenderWarmupSig = sig;

  const runner = () => {
    state._roomRenderWarmupPending = false;
    try { ensureCosmosCache(state); } catch {}
    for (const room of rooms) {
      try { getBiomeArtAssetSet(room?.biomeKey || 'neutral'); } catch {}
      const arenaSpec = getArenaSpec(room);
      if (!arenaSpec) continue;
      const biome = biomeByKey(room && room.biomeKey);
      const hue = biome ? (biome.hue | 0) : ((room?.hue | 0) || 210);
      try { ensureRoomStaticArtCache(state, room, arenaSpec, hue, { drawArenaSolidShape, drawArenaShapeOverlay, drawBiomeSurfaceFX, drawNeutralSpaceSurfaceFX, drawArenaSpecDecor, hasLoadedBiomeArenaArt, getBiomeArtSignature }); } catch {}
    }
    state._roomRenderWarmupDoneSig = sig;
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(runner, { timeout: 180 });
  } else {
    window.setTimeout(runner, 16);
  }
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
  const luxurySpace = isLuxurySpaceRoom(room, arenaSpec);
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

  const isHubRoom = !!arenaSpec?.rules?.isHub || String(room?.biomeKey || '').toLowerCase() === 'hub' || ((room?.index | 0) === 0);
  const isNeutralIntroOrbRoom = !!arenaSpec?.rules?.neutralIntroCircleArena;
  const useLoadedBiomeArtSurface = !isHubRoom && hasLoadedBiomeArenaArt(room, 'surface'); // overlay only; never substitute bg on the walkable surface
  if (luxurySpace && !isHubRoom && !isNeutralIntroOrbRoom && !useLoadedBiomeArtSurface) {
    drawOrbitalBackdropBehindRoom(ctx, room, { x0, y0, x1, y1, w, h }, false);
  }

  if (!isHubRoom) {
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
      } else if (visualPreset === 'hub_core_station' || visualPreset === 'hub_orbital_disc' || (room && (room.index | 0) === 0)) {
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

    const cachedArt = (luxurySpace && !isHubRoom) ? peekRoomStaticArtCache(state, room, arenaSpec) : null;
    if (cachedArt) {
      ctx.drawImage(cachedArt.canvas, cachedArt.x, cachedArt.y + fall);
    } else {
      drawArenaSolidShape(ctx, room, arenaSpec, time, { x0, y0, x1, y1, w, h });

      if (!useLoadedBiomeArtSurface) {
        drawArenaShapeOverlay(ctx, room, arenaSpec, time);
        // Biome-specific surface accents (neon / frost / runes / etc.)
        drawBiomeSurfaceFX(ctx, room, { x0, x1, y0, y1, w, h }, { biomeKey: (room && room.biomeKey) || "", hue, time });
        if (!isHubRoom && (!String((room && room.biomeKey) || '').toLowerCase() || String((room && room.biomeKey) || '').toLowerCase() === 'neutral')) {
          drawNeutralSpaceSurfaceFX(ctx, room, { x0, x1, y0, y1, w, h }, { hue, time });
        }
        drawArenaSpecDecor(ctx, room, arenaSpec, time);
      }
    }
    drawArenaHazards(ctx, room, arenaSpec, time);
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
    if (!isHubRoom) {
      drawGates(ctx, state, room, { x0, x1, y0, y1, w, h, fall }, { hue, time });
    }

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
  if (label && state && state._showRoomLabels) {
    const parts = String(label).split(' • ');
    const compactLabel = true;
    ctx.globalAlpha = alpha * 0.035;
    ctx.fillStyle = "rgba(8,12,24,0.28)";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const lx = x0 + 30;
    const ly = y0 + 24;
    ctx.font = "12px sans-serif";
    ctx.fillText(parts[0] || '', lx, ly);
    if (parts.length > 1) {
      ctx.font = "10px sans-serif";
      ctx.fillStyle = "rgba(230,242,255,0.12)";
      ctx.fillText(parts.slice(1).join(' • '), lx, ly + 14);
    }
    if (state && (state.currentRoomIndex | 0) === (room.index | 0)) {
      const objective = String(state._roomObjective || '').trim();
      const nextHint = String(state._roomNextHint || '').trim();
      if (objective) {
        ctx.font = "10px sans-serif";
        ctx.fillStyle = "rgba(180,240,255,0.14)";
        ctx.fillText(objective, lx, ly + 28);
      }
      if (nextHint && room.cleared && !room.isFloorFinal) {
        ctx.font = "10px sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.11)";
        ctx.fillText(nextHint, lx, ly + 40);
      }
    }
  }

  ctx.restore();
}

export function renderRoomsBackground(ctx, state) {
  const cam = state.camera;
  const canvas = state.canvas;

  // Screen-space space background (with parallax)
  drawCosmosScreen(ctx, state, { scheduleRoomRenderWarmup });

  const rd = state.roomDirector;
  if (!rd || !rd.current) return;

  // Clickable gate buttons are computed during rendering.
  // Reset once per frame.
  state._gateButtons = [];
  state._shopButtons = [];

  const currentIsHub = !!rd?.current?.arenaSpec?.rules?.isHub || String(rd?.current?.biomeKey || '').toLowerCase() === 'hub' || ((rd?.current?.index | 0) === 0);

  // Render order: prev (falling), current, next.
  const rooms = [];
  if (currentIsHub) {
    if (rd.current && !rd.current.removed) rooms.push({ room: rd.current, kind: "cur" });
  } else {
    if (rd.prev && !rd.prev.removed) rooms.push({ room: rd.prev, kind: "prev" });
    if (rd.current && !rd.current.removed) rooms.push({ room: rd.current, kind: "cur" });
    if (rd.next && !rd.next.removed) rooms.push({ room: rd.next, kind: "next" });
  }

  for (const it of rooms) {
    const r = it.room;
    const fall = (r.collapsing ? (clamp(r.collapseT, 0, 1) * (r.side * 0.25 + 640)) : 0);
    const a = (r.collapsing ? (1 - clamp(r.collapseT, 0, 1)) : 1);
    const rb = biomeByKey(r && r.biomeKey);
    const suppressLabel = !!r?.arenaSpec?.rules?.cleanGameView;
    const label = suppressLabel ? '' : (r.index === 0
      ? "HUB"
      : `FLOOR ${(r.floorNumber | 0) || 1} • ROOM ${(r.roomOrdinal | 0) || 1}/${(r.totalRooms | 0) || 1}${rb ? ` • ${String(rb.name || '').toUpperCase()}` : ''}`);
    drawTile(ctx, r, cam, { alpha: a, fall, label, time: state.time || 0, state });
  }

  // Bridge rendering:
  // - during normal build: current -> next
  // - during party transition: prev -> current (kept until everyone enters)
  if (!currentIsHub && rd.bridge) {
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

  if (!currentIsHub && rd.current && !rd.current.removed) {
    drawFloorExitPortal(ctx, rd.current, state);
    drawHubReturnPortal(ctx, rd.current, state);
  }
}
