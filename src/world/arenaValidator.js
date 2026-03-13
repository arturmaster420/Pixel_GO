import { buildWalkRectsFromNavZones } from './floorCollision.js';
function num(v, fallback = 0) {
  return Number.isFinite(v) ? Number(v) : fallback;
}

function rectToAabb(rect) {
  if (!rect || rect.type !== 'rect') return null;
  const x = num(rect.x, NaN);
  const y = num(rect.y, NaN);
  const w = num(rect.w, NaN);
  const h = num(rect.h, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { minX: x, minY: y, maxX: x + w, maxY: y + h };
}

function unionAabb(list) {
  let out = null;
  for (const item of list) {
    const a = rectToAabb(item);
    if (!a) continue;
    out = out ? {
      minX: Math.min(out.minX, a.minX),
      minY: Math.min(out.minY, a.minY),
      maxX: Math.max(out.maxX, a.maxX),
      maxY: Math.max(out.maxY, a.maxY),
    } : a;
  }
  return out;
}

function pointInAabb(p, aabb, pad = 0) {
  if (!p || !aabb) return false;
  const x = num(p.x, NaN);
  const y = num(p.y, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return x >= aabb.minX - pad && x <= aabb.maxX + pad && y >= aabb.minY - pad && y <= aabb.maxY + pad;
}

function rectContainsPoint(rect, p, pad = 0) {
  if (!rect || !p) return false;
  const x = num(p.x, NaN);
  const y = num(p.y, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return x >= rect.minX - pad && x <= rect.maxX + pad && y >= rect.minY - pad && y <= rect.maxY + pad;
}

function rectsTouchOrOverlap(a, b, pad = 0) {
  if (!a || !b) return false;
  return a.minX <= b.maxX + pad && a.maxX >= b.minX - pad && a.minY <= b.maxY + pad && a.maxY >= b.minY - pad;
}

function navReachability(navZones, start, targets = [], pad = 0) {
  const rects = buildWalkRectsFromNavZones(navZones, { seamGap: 14, seamMinOverlap: 18 }).map(rectToAabb).filter(Boolean);
  if (!rects.length) return { ok: false, startIndex: -1, missing: targets.map((_, i) => i) };
  const startIndex = rects.findIndex((r) => rectContainsPoint(r, start, pad));
  if (startIndex < 0) return { ok: false, startIndex, missing: targets.map((_, i) => i) };

  const visited = new Set([startIndex]);
  const stack = [startIndex];
  while (stack.length) {
    const idx = stack.pop();
    const a = rects[idx];
    for (let i = 0; i < rects.length; i++) {
      if (visited.has(i)) continue;
      if (!rectsTouchOrOverlap(a, rects[i], pad)) continue;
      visited.add(i);
      stack.push(i);
    }
  }

  const missing = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    let reachable = false;
    for (const idx of visited) {
      if (rectContainsPoint(rects[idx], t, pad)) {
        reachable = true;
        break;
      }
    }
    if (!reachable) missing.push(i);
  }
  return { ok: missing.length === 0, startIndex, missing };
}

function distSq(a, b) {
  const dx = num(a?.x) - num(b?.x);
  const dy = num(a?.y) - num(b?.y);
  return dx * dx + dy * dy;
}

function push(issues, condition, message) {
  if (condition) issues.push(message);
}

function validateAnchorList(name, list, roomAabb, issues, { minCount = 0, allowOutside = false } = {}) {
  const arr = Array.isArray(list) ? list : [];
  if (arr.length < minCount) issues.push(`missing ${name}`);
  for (let i = 0; i < arr.length; i++) {
    const p = arr[i];
    if (!p || !Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.y))) {
      issues.push(`invalid ${name}[${i}]`);
      continue;
    }
    if (!allowOutside && roomAabb && !pointInAabb(p, roomAabb, 32)) issues.push(`${name}[${i}] outside room`);
  }
  return arr;
}

export function validateArenaSpec(arenaSpec) {
  const issues = [];
  if (!arenaSpec || typeof arenaSpec !== 'object') {
    return { ok: false, issues: ['missing arenaSpec'], stats: { platformCount: 0, bridgeCount: 0, navCount: 0 } };
  }

  const geometry = arenaSpec.geometry || null;
  const platforms = Array.isArray(geometry?.platforms) ? geometry.platforms : [];
  const bridges = Array.isArray(geometry?.bridges) ? geometry.bridges : [];
  const navZones = Array.isArray(geometry?.navZones) ? geometry.navZones : [];
  const roomAabb = unionAabb([...platforms, ...bridges]);
  const navAabb = unionAabb(navZones);

  push(issues, !platforms.length, 'missing platform geometry');
  push(issues, !roomAabb, 'invalid room geometry');
  push(issues, !navZones.length, 'missing nav zones');
  push(issues, !navAabb, 'invalid nav geometry');

  const start = arenaSpec?.anchors?.playerStart;
  push(issues, !start || !Number.isFinite(Number(start.x)) || !Number.isFinite(Number(start.y)), 'missing player start');
  push(issues, !!start && !!navAabb && !pointInAabb(start, navAabb, 20), 'player start outside nav');

  const bossArena = arenaSpec?.bossArena || null;
  const bossCenter = bossArena?.center || null;
  push(issues, !bossArena || !bossCenter, 'missing boss arena metadata');
  push(issues, !!bossCenter && !!roomAabb && !pointInAabb(bossCenter, roomAabb, 56), 'boss center outside room');

  const spawnAnchors = validateAnchorList('spawnAnchors', arenaSpec?.anchors?.spawnAnchors, roomAabb, issues, { minCount: 1 });
  const gateAnchors = validateAnchorList('gateAnchors', arenaSpec?.anchors?.gateAnchors, roomAabb, issues, { minCount: arenaSpec?.rules?.isHub ? 0 : 0, allowOutside: true });
  const coverAnchors = validateAnchorList('coverAnchors', arenaSpec?.anchors?.coverAnchors, roomAabb, issues, { minCount: 0 });
  const decorAnchors = validateAnchorList('decorAnchors', arenaSpec?.anchors?.decorAnchors, roomAabb, issues, { minCount: 0 });
  const bossMoveNodes = validateAnchorList('bossMoveNodes', arenaSpec?.anchors?.bossMoveNodes, roomAabb, issues, { minCount: 1 });
  const shopAnchor = arenaSpec?.anchors?.shopAnchor;
  if (shopAnchor && (!Number.isFinite(Number(shopAnchor.x)) || !Number.isFinite(Number(shopAnchor.y)))) issues.push('invalid shopAnchor');

  const hubNpcAnchors = arenaSpec?.anchors?.hubNpcAnchors || null;
  if (hubNpcAnchors && typeof hubNpcAnchors === 'object') {
    for (const [key, p] of Object.entries(hubNpcAnchors)) {
      if (!p || !Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.y))) issues.push(`invalid hubNpcAnchors.${key}`);
      else if (roomAabb && !pointInAabb(p, roomAabb, 32)) issues.push(`hubNpcAnchors.${key} outside room`);
    }
  }

  const hazardZones = Array.isArray(arenaSpec?.hazardZones) ? arenaSpec.hazardZones : [];
  for (let i = 0; i < hazardZones.length; i++) {
    const h = hazardZones[i];
    if (!h || !Number.isFinite(Number(h.x)) || !Number.isFinite(Number(h.y))) {
      issues.push(`invalid hazardZones[${i}]`);
      continue;
    }
    if (roomAabb && !pointInAabb(h, roomAabb, 56)) issues.push(`hazardZones[${i}] outside room`);
    if (start && distSq(start, h) < Math.pow(Math.max(44, num(h.r, 42) * 0.55), 2)) issues.push(`hazardZones[${i}] too close to player start`);
  }

  const safeLanes = Array.isArray(bossArena?.safeLanes) ? bossArena.safeLanes : [];
  const pressureZones = Array.isArray(bossArena?.pressureZones) ? bossArena.pressureZones : [];
  const phaseNodes = Array.isArray(bossArena?.phaseNodes) ? bossArena.phaseNodes : [];
  validateAnchorList('bossArena.safeLanes', safeLanes, roomAabb, issues, { minCount: 0 });
  validateAnchorList('bossArena.pressureZones', pressureZones, roomAabb, issues, { minCount: 0 });
  validateAnchorList('bossArena.phaseNodes', phaseNodes, roomAabb, issues, { minCount: 0 });

  if (start && spawnAnchors.length) {
    let farEnough = false;
    for (const s of spawnAnchors) {
      if (distSq(start, s) >= Math.pow(110, 2)) { farEnough = true; break; }
    }
    if (!farEnough) issues.push('spawnAnchors too close to player start');
  }

  for (let i = 0; i < gateAnchors.length; i++) {
    const g = gateAnchors[i];
    if (!g) continue;
    const side = String(g.side || '').toUpperCase();
    if (side && !['N', 'S', 'E', 'W'].includes(side)) issues.push(`gateAnchors[${i}] invalid side`);
  }

  if (start && navZones.length) {
    const reachTargets = [];
    const labels = [];
    if (shopAnchor && Number.isFinite(Number(shopAnchor.x)) && Number.isFinite(Number(shopAnchor.y))) {
      reachTargets.push(shopAnchor);
      labels.push('shopAnchor not reachable from player start');
    }
    for (let i = 0; i < Math.min(2, spawnAnchors.length); i++) {
      const s = spawnAnchors[i];
      if (s && Number.isFinite(Number(s.x)) && Number.isFinite(Number(s.y))) {
        reachTargets.push(s);
        labels.push(`spawnAnchors[${i}] not reachable from player start`);
      }
    }
    if (hubNpcAnchors && typeof hubNpcAnchors === 'object') {
      for (const key of ['shop', 'tier', 'portal']) {
        const p = hubNpcAnchors[key];
        if (p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))) {
          reachTargets.push(p);
          labels.push(`hubNpcAnchors.${key} not reachable from player start`);
        }
      }
    }
    const reach = navReachability(navZones, start, reachTargets, 6);
    if (reach.startIndex < 0) issues.push('player start not inside any nav island');
    for (const idx of reach.missing) issues.push(labels[idx] || `nav target ${idx} unreachable from player start`);
  }

  const stats = {
    platformCount: platforms.length,
    bridgeCount: bridges.length,
    navCount: navZones.length,
    spawnCount: spawnAnchors.length,
    gateCount: gateAnchors.length,
    coverCount: coverAnchors.length,
    decorCount: decorAnchors.length,
    hazardCount: hazardZones.length,
    bossMoveNodeCount: bossMoveNodes.length,
  };

  return {
    ok: issues.length === 0,
    issues,
    stats,
    bounds: roomAabb || null,
    navBounds: navAabb || null,
  };
}
