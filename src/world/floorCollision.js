import { clampPointToHubMask, getRandomHubMaskPoint, isHubMaskPointWalkable } from './hub/hubWalkMask.js';

function num(v, fallback = 0) {
  return Number.isFinite(Number(v)) ? Number(v) : fallback;
}

function isHubRoom(room) {
  return !!room?.arenaSpec?.rules?.isHub || String(room?.biomeKey || '').toLowerCase() === 'hub' || ((room?.index | 0) === 0);
}

function asRect(r) {
  if (!r || String(r.type || 'rect') !== 'rect') return null;
  const x = num(r.x, NaN);
  const y = num(r.y, NaN);
  const w = num(r.w, NaN);
  const h = num(r.h, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { id: r.id || '', type: 'rect', x, y, w, h, minX: x, minY: y, maxX: x + w, maxY: y + h };
}

function asCircle(c) {
  if (!c || String(c.type || '') !== 'circle') return null;
  const x = num(c.x, NaN);
  const y = num(c.y, NaN);
  const r = num(c.r, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r) || r <= 0) return null;
  return { id: c.id || '', type: 'circle', x, y, r, w: r * 2, h: r * 2, minX: x - r, minY: y - r, maxX: x + r, maxY: y + r };
}

function asWalkShape(shape) {
  return asRect(shape) || asCircle(shape);
}

function overlap1D(a0, a1, b0, b1) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function makeRect(id, minX, minY, maxX, maxY) {
  const w = Math.max(0, maxX - minX);
  const h = Math.max(0, maxY - minY);
  if (w <= 0 || h <= 0) return null;
  return { id, type: 'rect', x: minX, y: minY, w, h, minX, minY, maxX, maxY };
}

export function buildNavSeamConnectors(rects, { gap = 12, minOverlap = 20, touchThickness = 10 } = {}) {
  const out = [];
  const maxGap = Math.max(0, num(gap, 12));
  const minOL = Math.max(6, num(minOverlap, 20));
  const touch = Math.max(4, num(touchThickness, 10));
  const touchHalf = touch * 0.5;
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i];
    if (!a || a.type !== 'rect') continue;
    for (let j = i + 1; j < rects.length; j++) {
      const b = rects[j];
      if (!b || b.type !== 'rect') continue;

      const xOverlap = overlap1D(a.minX, a.maxX, b.minX, b.maxX);
      const yOverlap = overlap1D(a.minY, a.maxY, b.minY, b.maxY);

      const aAboveB = a.maxY <= b.minY;
      const bAboveA = b.maxY <= a.minY;
      const verticalGap = aAboveB ? (b.minY - a.maxY) : (bAboveA ? (a.minY - b.maxY) : null);
      if (verticalGap !== null && verticalGap <= maxGap && xOverlap >= minOL) {
        const minX = Math.max(a.minX, b.minX);
        const maxX = Math.min(a.maxX, b.maxX);
        const upper = aAboveB ? a : b;
        const lower = aAboveB ? b : a;
        let rect = null;
        if (verticalGap <= 0.001) {
          const seamY = (upper.maxY + lower.minY) * 0.5;
          rect = makeRect(`seam_touch_v_${i}_${j}`, minX, seamY - touchHalf, maxX, seamY + touchHalf);
        } else {
          rect = makeRect(`seam_v_${i}_${j}`, minX, upper.maxY, maxX, lower.minY);
        }
        if (rect) out.push(rect);
      }

      const aLeftB = a.maxX <= b.minX;
      const bLeftA = b.maxX <= a.minX;
      const horizontalGap = aLeftB ? (b.minX - a.maxX) : (bLeftA ? (a.minX - b.maxX) : null);
      if (horizontalGap !== null && horizontalGap <= maxGap && yOverlap >= minOL) {
        const minY = Math.max(a.minY, b.minY);
        const maxY = Math.min(a.maxY, b.maxY);
        const left = aLeftB ? a : b;
        const right = aLeftB ? b : a;
        let rect = null;
        if (horizontalGap <= 0.001) {
          const seamX = (left.maxX + right.minX) * 0.5;
          rect = makeRect(`seam_touch_h_${i}_${j}`, seamX - touchHalf, minY, seamX + touchHalf, maxY);
        } else {
          rect = makeRect(`seam_h_${i}_${j}`, left.maxX, minY, right.minX, maxY);
        }
        if (rect) out.push(rect);
      }
    }
  }
  return out;
}

export function weldWalkRects(rects, { seamGap = 12, seamMinOverlap = 20, touchThickness = 10 } = {}) {
  const base = (Array.isArray(rects) ? rects : []).map(asWalkShape).filter(Boolean);
  if (!base.length) return [];
  const seamSources = base.filter((s) => s.type === 'rect');
  const seams = buildNavSeamConnectors(seamSources, { gap: seamGap, minOverlap: seamMinOverlap, touchThickness });
  return seams.length ? base.concat(seams) : base;
}

export function buildWalkRectsFromNavZones(navZones, { seamGap = 12, seamMinOverlap = 20, touchThickness = 10 } = {}) {
  return weldWalkRects(navZones, { seamGap, seamMinOverlap, touchThickness });
}

export function getRoomWalkRects(room) {
  const nav = Array.isArray(room?.arenaSpec?.geometry?.navZones) ? room.arenaSpec.geometry.navZones : [];
  if (nav.length) {
    if (room && room._walkRectCacheSource === nav && Array.isArray(room._walkRectCache) && room._walkRectCache.length) {
      return room._walkRectCache;
    }
    const shapes = buildWalkRectsFromNavZones(nav, { seamGap: 14, seamMinOverlap: 18, touchThickness: 10 });
    if (room) {
      room._walkRectCacheSource = nav;
      room._walkRectCache = shapes;
    }
    if (shapes.length) return shapes;
  }
  const b = room?.bounds;
  if (!b) return [];
  return [{ type: 'rect', x: b.minX, y: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY, minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY }];
}

export function getRoomGeometryBounds(room, pad = 0) {
  const shapes = getRoomWalkRects(room);
  if (!shapes.length) return null;
  let out = null;
  for (const s of shapes) {
    out = out
      ? {
          minX: Math.min(out.minX, s.minX),
          minY: Math.min(out.minY, s.minY),
          maxX: Math.max(out.maxX, s.maxX),
          maxY: Math.max(out.maxY, s.maxY),
        }
      : { minX: s.minX, minY: s.minY, maxX: s.maxX, maxY: s.maxY };
  }
  if (!out) return null;
  return { minX: out.minX - pad, minY: out.minY - pad, maxX: out.maxX + pad, maxY: out.maxY + pad };
}

export function getRoomCoverCircles(room) {
  const covers = Array.isArray(room?.arenaSpec?.anchors?.coverAnchors) ? room.arenaSpec.anchors.coverAnchors : [];
  return covers
    .map((c) => ({ x: num(c?.x, NaN), y: num(c?.y, NaN), r: Math.max(16, num(c?.size, 18)) }))
    .filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y) && c.r > 0);
}

export function pointInRect(x, y, rect, pad = 0) {
  if (!rect) return false;
  return x >= rect.minX + pad && x <= rect.maxX - pad && y >= rect.minY + pad && y <= rect.maxY - pad;
}

function pointInCircle(x, y, circle, pad = 0) {
  if (!circle) return false;
  const rr = Math.max(0, Number(circle.r) - Math.max(0, Number(pad) || 0));
  const dx = x - Number(circle.x || 0);
  const dy = y - Number(circle.y || 0);
  return dx * dx + dy * dy <= rr * rr;
}

function pointInShape(x, y, shape, pad = 0) {
  if (!shape) return false;
  if (shape.type === 'circle') return pointInCircle(x, y, shape, pad);
  return pointInRect(x, y, shape, pad);
}

export function pointInRoomWalkable(room, x, y, pad = 0) {
  if (isHubRoom(room)) {
    const maskHit = isHubMaskPointWalkable(room?.arenaSpec || null, x, y, { pad });
    if (maskHit !== null) return !!maskHit;
  }
  const shapes = getRoomWalkRects(room);
  if (!shapes.length) return false;
  for (const s of shapes) {
    if (pointInShape(x, y, s, pad)) return true;
  }
  return false;
}

function pushOutOfCovers(x, y, radius, covers, fallbackDir = { x: 1, y: 0 }) {
  let outX = x;
  let outY = y;
  for (const c of covers) {
    const rr = c.r + radius + 8;
    const dx = outX - c.x;
    const dy = outY - c.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) continue;
    let len = Math.hypot(dx, dy);
    let nx = 0;
    let ny = 0;
    if (len < 0.0001) {
      const fl = Math.hypot(fallbackDir.x, fallbackDir.y) || 1;
      nx = fallbackDir.x / fl;
      ny = fallbackDir.y / fl;
    } else {
      nx = dx / len;
      ny = dy / len;
    }
    outX = c.x + nx * rr;
    outY = c.y + ny * rr;
  }
  return { x: outX, y: outY };
}

function clampPointToCircle(x, y, circle, pad = 0, prefer = null) {
  const rr = Math.max(1, Number(circle.r || 0) - Math.max(0, Number(pad) || 0));
  const cx = Number(circle.x || 0);
  const cy = Number(circle.y || 0);
  let dx = x - cx;
  let dy = y - cy;
  let len = Math.hypot(dx, dy);
  if (len <= rr) return { x, y };
  if (len < 0.0001) {
    const pdx = x - Number(prefer?.x || cx);
    const pdy = y - Number(prefer?.y || cy);
    len = Math.hypot(pdx, pdy) || 1;
    dx = pdx / len;
    dy = pdy / len;
  } else {
    dx /= len;
    dy /= len;
  }
  return { x: cx + dx * rr, y: cy + dy * rr };
}

function projectPointInsideShape(x, y, shape, pad = 0, prefer = null) {
  if (!shape) return { x, y };
  if (shape.type === 'circle') return clampPointToCircle(x, y, shape, pad, prefer);
  return {
    x: Math.max(shape.minX + pad, Math.min(shape.maxX - pad, x)),
    y: Math.max(shape.minY + pad, Math.min(shape.maxY - pad, y)),
  };
}

export function clampPointToRects(
  x,
  y,
  rects,
  {
    edgePad = 0,
    coverRadius = 0,
    covers = [],
    prefer = null,
  } = {},
) {
  if (!rects.length) return { x, y };

  const pref = prefer || { x, y };
  const pad = Math.max(0, num(edgePad, 0));
  const pushR = Math.max(0, num(coverRadius, 0));

  for (const shape of rects) {
    if (pointInShape(x, y, shape, pad)) {
      const pushed = pushOutOfCovers(x, y, pushR, covers, { x: x - pref.x, y: y - pref.y });
      if (pointInShape(pushed.x, pushed.y, shape, pad)) return pushed;
      return projectPointInsideShape(pushed.x, pushed.y, shape, pad, pref);
    }
  }

  let best = null;
  let bestD2 = Infinity;
  for (const shape of rects) {
    const candidate = projectPointInsideShape(x, y, shape, pad, pref);
    const pushed = pushOutOfCovers(candidate.x, candidate.y, pushR, covers, { x: candidate.x - pref.x, y: candidate.y - pref.y });
    const fixed = pointInShape(pushed.x, pushed.y, shape, pad) ? pushed : projectPointInsideShape(pushed.x, pushed.y, shape, pad, pref);
    const dx = fixed.x - x;
    const dy = fixed.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = fixed;
    }
  }
  return best || { x, y };
}

export function clampEntityToRoomWalkable(entity, room, { pad = 0, prevX = null, prevY = null } = {}) {
  if (!entity || !room) return;
  if (isHubRoom(room)) {
    const fixedHub = clampPointToHubMask(room?.arenaSpec || null, entity.x, entity.y, {
      pad: Math.max(4, num(entity.radius, 18) + pad),
      preferX: Number.isFinite(prevX) ? prevX : null,
      preferY: Number.isFinite(prevY) ? prevY : null,
    });
    if (fixedHub) {
      entity.x = fixedHub.x;
      entity.y = fixedHub.y;
      return;
    }
  }
  const shapes = getRoomWalkRects(room);
  if (!shapes.length) return;
  const covers = getRoomCoverCircles(room);
  const coverRadius = Math.max(4, num(entity.radius, 18) + pad);
  const edgePad = 2;
  const fixed = clampPointToRects(entity.x, entity.y, shapes, {
    edgePad,
    coverRadius,
    covers,
    prefer: {
      x: Number.isFinite(prevX) ? prevX : entity.x,
      y: Number.isFinite(prevY) ? prevY : entity.y,
    },
  });
  entity.x = fixed.x;
  entity.y = fixed.y;
}

export function randomPointInRoomWalkable(room) {
  if (isHubRoom(room)) {
    const p = getRandomHubMaskPoint(room?.arenaSpec || null, { pad: 20 });
    if (p) return p;
  }
  const shapes = getRoomWalkRects(room);
  if (!shapes.length) {
    const b = room?.bounds;
    if (!b) return { x: 0, y: 0 };
    return { x: (b.minX + b.maxX) * 0.5, y: (b.minY + b.maxY) * 0.5 };
  }
  const weighted = [];
  let total = 0;
  for (const s of shapes) {
    const area = s.type === 'circle' ? Math.PI * s.r * s.r : Math.max(1, s.w * s.h);
    total += Math.max(1, area);
    weighted.push({ s, total });
  }
  const pick = Math.random() * total;
  const hit = weighted.find((w) => pick <= w.total) || weighted[weighted.length - 1];
  const s = hit.s;
  const pad = 20;
  if (s.type === 'circle') {
    const rr = Math.max(4, s.r - pad);
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.sqrt(Math.random()) * rr;
    return {
      x: s.x + Math.cos(ang) * dist,
      y: s.y + Math.sin(ang) * dist,
    };
  }
  return {
    x: s.minX + pad + Math.random() * Math.max(1, s.w - pad * 2),
    y: s.minY + pad + Math.random() * Math.max(1, s.h - pad * 2),
  };
}

export function getActiveWalkRects(state) {
  const rd = state?.roomDirector;
  if (!rd?.current) return [];
  const rects = [];
  const pushRoom = (room) => {
    if (!room || room.removed) return;
    rects.push(...getRoomWalkRects(room));
  };
  pushRoom(rd.current);
  if (rd.prev && !rd.prev.removed) pushRoom(rd.prev);
  if (rd.current?.cleared && rd.next && rd.bridge?.built) pushRoom(rd.next);
  if (rd.bridge) {
    const br = rd.bridge.built && rd.bridge.bounds ? rd.bridge.bounds : (typeof rd._getBridgeBuiltBounds === 'function' ? rd._getBridgeBuiltBounds() : null);
    if (br) {
      rects.push({ type: 'rect', x: br.minX, y: br.minY, w: br.maxX - br.minX, h: br.maxY - br.minY, minX: br.minX, minY: br.minY, maxX: br.maxX, maxY: br.maxY });
    }
  }
  return weldWalkRects(rects, { seamGap: 18, seamMinOverlap: 18, touchThickness: 12 });
}

export function clampPlayerToActiveWalkable(player, state, { pad = 0, prevX = null, prevY = null } = {}) {
  if (!player || !state?.roomDirector?.current) return;
  const rd = state.roomDirector;
  if (isHubRoom(rd.current)) {
    const fixedHub = clampPointToHubMask(rd.current?.arenaSpec || null, player.x, player.y, {
      pad: Math.max(4, num(player.radius, 18) + pad),
      preferX: Number.isFinite(prevX) ? prevX : null,
      preferY: Number.isFinite(prevY) ? prevY : null,
    });
    if (fixedHub) {
      player.x = fixedHub.x;
      player.y = fixedHub.y;
      return;
    }
  }
  const rects = getActiveWalkRects(state);
  if (!rects.length) return;
  const covers = [];
  const rooms = [rd.prev, rd.current, rd.next].filter((r) => r && !r.removed);
  for (const room of rooms) covers.push(...getRoomCoverCircles(room));
  const coverRadius = Math.max(4, num(player.radius, 18) + pad);
  const edgePad = 2;
  const fixed = clampPointToRects(player.x, player.y, rects, {
    edgePad,
    coverRadius,
    covers,
    prefer: {
      x: Number.isFinite(prevX) ? prevX : player.x,
      y: Number.isFinite(prevY) ? prevY : player.y,
    },
  });
  player.x = fixed.x;
  player.y = fixed.y;
}
