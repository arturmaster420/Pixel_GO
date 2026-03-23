export function isLuxurySpaceRoom(room, arenaSpec) {
  const biomeKey = String(room?.biomeKey || '').toLowerCase();
  const visualPreset = String(arenaSpec?.visualPreset || '').toLowerCase();
  return biomeKey === 'neutral' || biomeKey === 'hub' || visualPreset.includes('neutral_') || !!arenaSpec?.rules?.isHub || (room && (room.index | 0) === 0);
}

function makeScratchCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = Math.max(32, Math.ceil(w));
  c.height = Math.max(32, Math.ceil(h));
  return c;
}

export function drawOrbitalBackdropBehindRoom(ctx, room, { x0, y0, x1, y1, w, h }, isHub = false) {
  const cx = x0 + w * (isHub ? 1.24 : 1.18);
  const cy = y0 + h * (isHub ? 1.28 : 1.18);
  const r = Math.max(w, h) * (isHub ? 1.28 : 1.14);
  ctx.save();
  const limb = ctx.createRadialGradient(cx, cy, r * 0.68, cx, cy, r);
  limb.addColorStop(0, isHub ? 'rgba(20,46,96,0.10)' : 'rgba(28,62,126,0.10)');
  limb.addColorStop(0.74, isHub ? 'rgba(62,128,236,0.18)' : 'rgba(82,164,255,0.24)');
  limb.addColorStop(0.90, isHub ? 'rgba(210,236,255,0.30)' : 'rgba(228,244,255,0.40)');
  limb.addColorStop(0.95, isHub ? 'rgba(146,224,255,0.20)' : 'rgba(156,222,255,0.24)');
  limb.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = limb; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  const atmosphere = ctx.createRadialGradient(cx, cy, r * 0.90, cx, cy, r * 1.08);
  atmosphere.addColorStop(0, 'rgba(255,255,255,0)');
  atmosphere.addColorStop(0.45, isHub ? 'rgba(120,220,255,0.12)' : 'rgba(132,224,255,0.18)');
  atmosphere.addColorStop(0.75, isHub ? 'rgba(88,184,255,0.08)' : 'rgba(92,196,255,0.12)');
  atmosphere.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = atmosphere; ctx.beginPath(); ctx.arc(cx, cy, r * 1.08, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function getRoomStaticArtCacheKey(room, arenaSpec, getBiomeArtSignature) {
  const b = room?.bounds || null;
  if (!room || !arenaSpec || !b) return '';
  const artSig = getBiomeArtSignature(room?.biomeKey || 'neutral');
  return [room.index | 0, room.biomeKey || '', arenaSpec.layoutId || '', arenaSpec.visualPreset || '', artSig, b.minX | 0, b.minY | 0, b.maxX | 0, b.maxY | 0].join('|');
}

export function peekRoomStaticArtCache(state, room, arenaSpec, getBiomeArtSignature) {
  if (!state || !room || !arenaSpec) return null;
  const map = state._roomStaticArtCache;
  if (!(map instanceof Map)) return null;
  const key = getRoomStaticArtCacheKey(room, arenaSpec, getBiomeArtSignature);
  return key ? (map.get(key) || null) : null;
}

export function ensureRoomStaticArtCache(state, room, arenaSpec, hue, deps = {}) {
  if (!state || !room || !arenaSpec) return null;
  const hasLoadedBiomeArt = /(?:^|\|)1(?:\||$)/.test(deps.getBiomeArtSignature?.(room?.biomeKey || 'neutral'));
  if (!isLuxurySpaceRoom(room, arenaSpec) && !hasLoadedBiomeArt) return null;
  if (typeof document === 'undefined') return null;
  const map = (state._roomStaticArtCache ||= new Map());
  const b = room.bounds || null;
  if (!b) return null;
  const key = getRoomStaticArtCacheKey(room, arenaSpec, deps.getBiomeArtSignature);
  if (!key) return null;
  if (map.has(key)) return map.get(key);
  const pad = 180;
  const canvas = makeScratchCanvas((b.maxX - b.minX) + pad * 2, (b.maxY - b.minY) + pad * 2);
  if (!canvas) return null;
  const g = canvas.getContext('2d');
  g.translate(-b.minX + pad, -b.minY + pad);
  const x0 = b.minX, y0 = b.minY, x1 = b.maxX, y1 = b.maxY, w = x1 - x0, h = y1 - y0;
  const useLoadedBiomeArtSurface = !arenaSpec?.rules?.isHub && deps.hasLoadedBiomeArenaArt?.(room, 'surface');
  deps.drawArenaSolidShape?.(g, room, arenaSpec, 0, { x0, y0, x1, y1, w, h });
  if (!useLoadedBiomeArtSurface) {
    deps.drawArenaShapeOverlay?.(g, room, arenaSpec, 0);
    deps.drawBiomeSurfaceFX?.(g, room, { x0, x1, y0, y1, w, h }, { biomeKey: room.biomeKey || '', hue, time: 0 });
    if (!String(room.biomeKey || '').toLowerCase() || arenaSpec?.rules?.isHub || String(room.biomeKey || '').toLowerCase() === 'neutral') {
      deps.drawNeutralSpaceSurfaceFX?.(g, room, { x0, x1, y0, y1, w, h }, { hue, time: 0 });
    }
    deps.drawArenaSpecDecor?.(g, room, arenaSpec, 0);
  }
  const rec = { canvas, x: b.minX - pad, y: b.minY - pad };
  map.set(key, rec);
  return rec;
}
