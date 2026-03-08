function num(v, fallback = 0) {
  return Number.isFinite(Number(v)) ? Number(v) : fallback;
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
    if (!a) continue;
    for (let j = i + 1; j < rects.length; j++) {
      const b = rects[j];
      if (!b) continue;

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
  const base = (Array.isArray(rects) ? rects : []).map(asRect).filter(Boolean);
  if (!base.length) return [];
  const seams = buildNavSeamConnectors(base, { gap: seamGap, minOverlap: seamMinOverlap, touchThickness });
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
    const rects = buildWalkRectsFromNavZones(nav, { seamGap: 14, seamMinOverlap: 18, touchThickness: 10 });
    if (room) {
      room._walkRectCacheSource = nav;
      room._walkRectCache = rects;
    }
    if (rects.length) return rects;
  }
  const b = room?.bounds;
  if (!b) return [];
  return [{ x: b.minX, y: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY, minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY }];
}

export function getRoomGeometryBounds(room, pad = 0) {
  const rects = getRoomWalkRects(room);
  if (!rects.length) return null;
  let out = null;
  for (const r of rects) {
    out = out
      ? {
          minX: Math.min(out.minX, r.minX),
          minY: Math.min(out.minY, r.minY),
          maxX: Math.max(out.maxX, r.maxX),
          maxY: Math.max(out.maxY, r.maxY),
        }
      : { minX: r.minX, minY: r.minY, maxX: r.maxX, maxY: r.maxY };
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

export function pointInRoomWalkable(room, x, y, pad = 0) {
  const rects = getRoomWalkRects(room);
  if (!rects.length) return false;
  for (const r of rects) {
    if (pointInRect(x, y, r, pad)) return true;
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
      len = 1;
    } else {
      nx = dx / len;
      ny = dy / len;
    }
    outX = c.x + nx * rr;
    outY = c.y + ny * rr;
  }
  return { x: outX, y: outY };
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

  for (const r of rects) {
    if (pointInRect(x, y, r, pad)) {
      const pushed = pushOutOfCovers(x, y, pushR, covers, { x: x - pref.x, y: y - pref.y });
      if (pointInRect(pushed.x, pushed.y, r, pad)) return pushed;
      return {
        x: Math.max(r.minX + pad, Math.min(r.maxX - pad, pushed.x)),
        y: Math.max(r.minY + pad, Math.min(r.maxY - pad, pushed.y)),
      };
    }
  }

  let best = null;
  let bestD2 = Infinity;
  for (const r of rects) {
    const cx = Math.max(r.minX + pad, Math.min(r.maxX - pad, x));
    const cy = Math.max(r.minY + pad, Math.min(r.maxY - pad, y));
    const pushed = pushOutOfCovers(cx, cy, pushR, covers, { x: cx - pref.x, y: cy - pref.y });
    const fx = Math.max(r.minX + pad, Math.min(r.maxX - pad, pushed.x));
    const fy = Math.max(r.minY + pad, Math.min(r.maxY - pad, pushed.y));
    const dx = fx - x;
    const dy = fy - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = { x: fx, y: fy };
    }
  }
  return best || { x, y };
}

export function clampEntityToRoomWalkable(entity, room, { pad = 0, prevX = null, prevY = null } = {}) {
  if (!entity || !room) return;
  const rects = getRoomWalkRects(room);
  if (!rects.length) return;
  const covers = getRoomCoverCircles(room);
  const coverRadius = Math.max(4, num(entity.radius, 18) + pad);
  const edgePad = 2;
  const fixed = clampPointToRects(entity.x, entity.y, rects, {
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
  const rects = getRoomWalkRects(room);
  if (!rects.length) {
    const b = room?.bounds;
    if (!b) return { x: 0, y: 0 };
    return { x: (b.minX + b.maxX) * 0.5, y: (b.minY + b.maxY) * 0.5 };
  }
  const weighted = [];
  let total = 0;
  for (const r of rects) {
    const area = Math.max(1, r.w * r.h);
    total += area;
    weighted.push({ r, total });
  }
  const pick = Math.random() * total;
  const hit = weighted.find((w) => pick <= w.total) || weighted[weighted.length - 1];
  const r = hit.r;
  const pad = 20;
  return {
    x: r.minX + pad + Math.random() * Math.max(1, r.w - pad * 2),
    y: r.minY + pad + Math.random() * Math.max(1, r.h - pad * 2),
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
      rects.push({ x: br.minX, y: br.minY, w: br.maxX - br.minX, h: br.maxY - br.minY, minX: br.minX, minY: br.minY, maxX: br.maxX, maxY: br.maxY });
    }
  }
  return weldWalkRects(rects, { seamGap: 18, seamMinOverlap: 18, touchThickness: 12 });
}

export function clampPlayerToActiveWalkable(player, state, { pad = 0, prevX = null, prevY = null } = {}) {
  if (!player || !state?.roomDirector?.current) return;
  const rects = getActiveWalkRects(state);
  if (!rects.length) return;
  const covers = [];
  const rd = state.roomDirector;
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
