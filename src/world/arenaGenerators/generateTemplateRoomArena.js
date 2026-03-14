import { resolveSocketPoint, primaryEdgeForSocket } from '../roomRoute.js';
import { generateRoleRoomArena, canHandleTemplate, resolveRole } from './generateRoleRoomArena.js';
function clamp(n, a, b) {
  return n < a ? a : (n > b ? b : n);
}

function rect(id, cx, cy, w, h) {
  return { id, type: 'rect', x: cx - w * 0.5, y: cy - h * 0.5, w, h };
}

function makeNavRect(id, cx, cy, w, h, inset = 8) {
  return rect(id, cx, cy, Math.max(18, w - inset), Math.max(18, h - inset));
}

function centerOf(r) {
  return { x: Number(r?.x || 0) + Number(r?.w || 0) * 0.5, y: Number(r?.y || 0) + Number(r?.h || 0) * 0.5 };
}

function pushPart(parts, nav, id, cx, cy, w, h, navInset = 8) {
  const p = rect(id, cx, cy, w, h);
  parts.push(p);
  nav.push(makeNavRect(`${id}_nav`, cx, cy, w, h, navInset));
  return p;
}

function pushConnector(parts, nav, id, a, b, thickness, navInset = 6, bias = 0) {
  if (!a || !b) return null;
  const ac = centerOf(a);
  const bc = centerOf(b);
  const dx = bc.x - ac.x;
  const dy = bc.y - ac.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const left = dx >= 0 ? a : b;
    const right = dx >= 0 ? b : a;
    const leftEdge = left.x + left.w;
    const rightEdge = right.x;
    const gap = Math.max(26, rightEdge - leftEdge + 20);
    const cx = (leftEdge + rightEdge) * 0.5;
    const cy = (ac.y + bc.y) * 0.5 + bias;
    const h = Math.max(34, thickness);
    parts.push(rect(id, cx, cy, gap, h));
    nav.push(makeNavRect(`${id}_nav`, cx, cy, gap, h, navInset));
    return parts[parts.length - 1];
  }
  const top = dy >= 0 ? a : b;
  const bottom = dy >= 0 ? b : a;
  const topEdge = top.y + top.h;
  const bottomEdge = bottom.y;
  const gap = Math.max(26, bottomEdge - topEdge + 20);
  const cx = (ac.x + bc.x) * 0.5 + bias;
  const cy = (topEdge + bottomEdge) * 0.5;
  const w = Math.max(34, thickness);
  parts.push(rect(id, cx, cy, w, gap));
  nav.push(makeNavRect(`${id}_nav`, cx, cy, w, gap, navInset));
  return parts[parts.length - 1];
}

function boundsFromRects(rects) {
  let out = null;
  for (const r of rects) {
    if (!r) continue;
    const a = { minX: r.x, minY: r.y, maxX: r.x + r.w, maxY: r.y + r.h };
    out = out ? {
      minX: Math.min(out.minX, a.minX),
      minY: Math.min(out.minY, a.minY),
      maxX: Math.max(out.maxX, a.maxX),
      maxY: Math.max(out.maxY, a.maxY),
    } : a;
  }
  return out;
}

function gateAnchorsFromBounds(bounds, centerX, centerY, { entrySocket = '', exitSocket = '', portalSocket = '' } = {}) {
  if (!bounds) return [];
  const out = [];
  const pushSocket = (socket, tag) => {
    const key = String(socket || '');
    if (!key) return;
    const p = resolveSocketPoint(bounds, centerX, centerY, key, { outside: 14, offsetScale: 0.22 });
    out.push({ side: primaryEdgeForSocket(key, 'N'), x: p.x, y: p.y, socket: key, tag });
  };
  pushSocket(entrySocket, 'entry');
  pushSocket(exitSocket, 'exit');
  pushSocket(portalSocket, 'portal');
  if (!out.length) {
    out.push({ side: 'W', x: bounds.minX - 14, y: centerY, tag: 'west_entry' });
    out.push({ side: 'E', x: bounds.maxX + 14, y: centerY, tag: 'east_entry' });
    out.push({ side: 'S', x: centerX, y: bounds.maxY + 14, tag: 'south_entry' });
  }
  return uniqueAnchors(out, 18);
}

function uniqueAnchors(list = [], minDist = 46) {
  const out = [];
  const md2 = minDist * minDist;
  for (const p of list) {
    if (!p || !Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.y))) continue;
    let ok = true;
    for (const q of out) {
      const dx = Number(p.x) - Number(q.x);
      const dy = Number(p.y) - Number(q.y);
      if (dx * dx + dy * dy < md2) { ok = false; break; }
    }
    if (ok) out.push(p);
  }
  return out;
}

function buildElectricTemplate({ templateKey, centerX, centerY, side, useV2 }) {
  const platforms = [];
  const bridges = [];
  const navZones = [];
  const thin = clamp(side * (useV2 ? 0.070 : 0.078), 64, 104);
  const midThin = clamp(side * 0.082, 76, 118);
  const core = {};

  if (templateKey === 'entry_square') {
    core.south = pushPart(platforms, navZones, 'south_entry', centerX, centerY + side * 0.24, side * 0.18, side * 0.12, 12);
    core.mid = pushPart(platforms, navZones, 'core_node', centerX, centerY + side * 0.04, side * 0.24, side * 0.18, 12);
    core.north = pushPart(platforms, navZones, 'north_node', centerX, centerY - side * 0.18, side * 0.16, side * 0.12, 10);
    core.west = pushPart(platforms, navZones, 'west_flank', centerX - side * 0.22, centerY + side * 0.02, side * 0.14, side * 0.11, 10);
    core.east = pushPart(platforms, navZones, 'east_flank', centerX + side * 0.22, centerY + side * 0.02, side * 0.14, side * 0.11, 10);
    pushConnector(bridges, navZones, 'c_south', core.south, core.mid, thin);
    pushConnector(bridges, navZones, 'c_north', core.mid, core.north, thin);
    pushConnector(bridges, navZones, 'c_west', core.west, core.mid, thin);
    pushConnector(bridges, navZones, 'c_east', core.mid, core.east, thin);
  } else if (templateKey === 'wide_hall') {
    core.left = pushPart(platforms, navZones, 'left_hall', centerX - side * 0.25, centerY + side * 0.02, side * 0.18, side * 0.14, 12);
    core.mid = pushPart(platforms, navZones, 'core_hall', centerX, centerY + side * 0.02, side * 0.26, side * 0.16, 12);
    core.right = pushPart(platforms, navZones, 'right_hall', centerX + side * 0.25, centerY + side * 0.02, side * 0.18, side * 0.14, 12);
    core.north = pushPart(platforms, navZones, 'north_spur', centerX, centerY - side * 0.22, side * 0.14, side * 0.10, 10);
    core.south = pushPart(platforms, navZones, 'south_spur', centerX, centerY + side * 0.26, side * 0.14, side * 0.10, 10);
    pushConnector(bridges, navZones, 'c_left', core.left, core.mid, midThin);
    pushConnector(bridges, navZones, 'c_right', core.mid, core.right, midThin);
    pushConnector(bridges, navZones, 'c_north', core.north, core.mid, thin);
    pushConnector(bridges, navZones, 'c_south', core.mid, core.south, thin);
  } else if (templateKey === 'side_pocket') {
    const pocketLeft = ((Math.round(centerX + centerY) + (useV2 ? 1 : 0)) & 1) === 0;
    core.south = pushPart(platforms, navZones, 'south_entry', centerX, centerY + side * 0.25, side * 0.18, side * 0.12, 12);
    core.mid = pushPart(platforms, navZones, 'core_node', centerX, centerY + side * 0.02, side * 0.24, side * 0.16, 12);
    core.north = pushPart(platforms, navZones, 'north_node', centerX + (pocketLeft ? side * 0.08 : -side * 0.08), centerY - side * 0.21, side * 0.14, side * 0.10, 10);
    core.pocket = pushPart(platforms, navZones, pocketLeft ? 'west_pocket' : 'east_pocket', centerX + (pocketLeft ? -side * 0.24 : side * 0.24), centerY - side * 0.02, side * 0.14, side * 0.12, 10);
    core.ambush = pushPart(platforms, navZones, pocketLeft ? 'east_ambush' : 'west_ambush', centerX + (pocketLeft ? side * 0.22 : -side * 0.22), centerY + side * 0.14, side * 0.12, side * 0.10, 10);
    pushConnector(bridges, navZones, 'c_south', core.south, core.mid, thin);
    pushConnector(bridges, navZones, 'c_north', core.mid, core.north, thin);
    pushConnector(bridges, navZones, 'c_pocket', core.mid, core.pocket, thin * 0.92);
    pushConnector(bridges, navZones, 'c_ambush', core.mid, core.ambush, thin * 0.90, 6, pocketLeft ? side * 0.03 : -side * 0.03);
  } else {
    core.center = pushPart(platforms, navZones, 'core_center', centerX, centerY + side * 0.01, side * 0.24, side * 0.16, 12);
    core.north = pushPart(platforms, navZones, 'north_island', centerX, centerY - side * 0.23, side * 0.16, side * 0.11, 10);
    core.south = pushPart(platforms, navZones, 'south_entry', centerX, centerY + side * 0.25, side * 0.18, side * 0.12, 12);
    core.west = pushPart(platforms, navZones, 'west_island', centerX - side * 0.23, centerY + side * 0.02, side * 0.14, side * 0.11, 10);
    core.east = pushPart(platforms, navZones, 'east_island', centerX + side * 0.23, centerY + side * 0.02, side * 0.14, side * 0.11, 10);
    pushConnector(bridges, navZones, 'c_north', core.center, core.north, thin);
    pushConnector(bridges, navZones, 'c_south', core.south, core.center, thin);
    pushConnector(bridges, navZones, 'c_west', core.west, core.center, thin);
    pushConnector(bridges, navZones, 'c_east', core.center, core.east, thin);
  }

  const spawnAnchors = uniqueAnchors([
    core.north && { x: centerOf(core.north).x, y: centerOf(core.north).y, tag: 'north_node' },
    core.west && { x: centerOf(core.west).x, y: centerOf(core.west).y, tag: 'west_flank' },
    core.east && { x: centerOf(core.east).x, y: centerOf(core.east).y, tag: 'east_flank' },
    core.left && { x: centerOf(core.left).x, y: centerOf(core.left).y, tag: 'left_hall' },
    core.right && { x: centerOf(core.right).x, y: centerOf(core.right).y, tag: 'right_hall' },
    core.pocket && { x: centerOf(core.pocket).x, y: centerOf(core.pocket).y, tag: 'side_pocket' },
    core.ambush && { x: centerOf(core.ambush).x, y: centerOf(core.ambush).y, tag: 'ambush' },
    { x: centerX, y: centerY, tag: 'mid' },
  ]);
  const hazardZones = uniqueAnchors([
    core.west && { x: centerOf(core.west).x * 0.45 + centerX * 0.55, y: centerOf(core.west).y * 0.45 + centerY * 0.55, tag: 'west_pulse' },
    core.east && { x: centerOf(core.east).x * 0.45 + centerX * 0.55, y: centerOf(core.east).y * 0.45 + centerY * 0.55, tag: 'east_pulse' },
    core.north && { x: centerX, y: (centerOf(core.north).y + centerY) * 0.5, tag: 'north_pulse' },
    core.south && { x: centerX, y: (centerOf(core.south).y + centerY) * 0.5, tag: 'south_pulse' },
  ], 70).slice(0, templateKey === 'wide_hall' ? 2 : 3).map((p, i) => ({ type: 'electric_pulse', shape: 'circle', x: p.x, y: p.y, r: clamp(side * 0.060, 34, 72), interval: 6.2 + i * 0.6, duration: 0.9, damageScale: 0.18 + (templateKey === 'side_pocket' ? 0.04 : 0) }));

  return {
    platforms,
    bridges,
    navZones,
    playerStart: { x: centerOf(core.south || core.mid || core.center).x, y: centerOf(core.south || core.mid || core.center).y + Math.min(12, side * 0.01) },
    bossCenter: centerOf(core.mid || core.center || core.north || core.left),
    spawnAnchors,
    coverAnchors: uniqueAnchors([
      core.mid && { x: centerOf(core.mid).x - side * 0.06, y: centerOf(core.mid).y, size: clamp(side * 0.024, 16, 26) },
      core.mid && { x: centerOf(core.mid).x + side * 0.06, y: centerOf(core.mid).y, size: clamp(side * 0.024, 16, 26) },
      core.center && { x: centerOf(core.center).x - side * 0.06, y: centerOf(core.center).y, size: clamp(side * 0.024, 16, 26) },
      core.center && { x: centerOf(core.center).x + side * 0.06, y: centerOf(core.center).y, size: clamp(side * 0.024, 16, 26) },
    ], 30),
    decorAnchors: uniqueAnchors([
      core.north && { x: centerOf(core.north).x, y: centerOf(core.north).y, kind: 'reactor', size: 24 },
      core.west && { x: centerOf(core.west).x, y: centerOf(core.west).y, kind: 'coil', size: 20 },
      core.east && { x: centerOf(core.east).x, y: centerOf(core.east).y, kind: 'coil', size: 20 },
      core.pocket && { x: centerOf(core.pocket).x, y: centerOf(core.pocket).y, kind: 'relay', size: 18 },
    ]),
    hazardAnchors: hazardZones.map((z) => ({ x: z.x, y: z.y, kind: 'bridge_pulse', r: z.r })),
    hazardZones,
    bossMoveNodes: uniqueAnchors([
      core.north && centerOf(core.north),
      core.west && centerOf(core.west),
      core.east && centerOf(core.east),
      core.pocket && centerOf(core.pocket),
      core.center && centerOf(core.center),
      core.mid && centerOf(core.mid),
      { x: centerX, y: centerY },
    ]),
    rules: { supportsBridges: true, prefersRangedPressure: true, slipZones: false, fogZones: false, radiantBuffNodes: false, isHub: false, gateAnchorDriven: false },
  };
}

function buildFireTemplate({ templateKey, centerX, centerY, side, useV2 }) {
  const platforms = [];
  const bridges = [];
  const navZones = [];
  const thick = clamp(side * 0.10, 92, 142);
  const wide = clamp(side * 0.14, 110, 170);
  const core = {};

  if (templateKey === 'entry_square') {
    core.south = pushPart(platforms, navZones, 'south_staging', centerX, centerY + side * 0.24, side * 0.22, side * 0.14, 12);
    core.mid = pushPart(platforms, navZones, 'forge_core', centerX, centerY + side * 0.03, side * 0.28, side * 0.22, 12);
    core.north = pushPart(platforms, navZones, 'north_chimney', centerX, centerY - side * 0.19, side * 0.18, side * 0.12, 10);
    core.west = pushPart(platforms, navZones, 'west_heat', centerX - side * 0.20, centerY + side * 0.02, side * 0.14, side * 0.10, 10);
    core.east = pushPart(platforms, navZones, 'east_heat', centerX + side * 0.20, centerY + side * 0.02, side * 0.14, side * 0.10, 10);
    pushConnector(bridges, navZones, 'c_south', core.south, core.mid, thick);
    pushConnector(bridges, navZones, 'c_north', core.mid, core.north, thick * 0.92);
    pushConnector(bridges, navZones, 'c_west', core.west, core.mid, thick * 0.90);
    pushConnector(bridges, navZones, 'c_east', core.mid, core.east, thick * 0.90);
  } else if (templateKey === 'wide_hall') {
    core.left = pushPart(platforms, navZones, 'left_forge', centerX - side * 0.24, centerY + side * 0.03, side * 0.22, side * 0.16, 12);
    core.mid = pushPart(platforms, navZones, 'center_forge', centerX, centerY + side * 0.03, side * 0.30, side * 0.18, 12);
    core.right = pushPart(platforms, navZones, 'right_forge', centerX + side * 0.24, centerY + side * 0.03, side * 0.22, side * 0.16, 12);
    core.south = pushPart(platforms, navZones, 'south_basin', centerX, centerY + side * 0.25, side * 0.14, side * 0.10, 10);
    pushConnector(bridges, navZones, 'c_left', core.left, core.mid, wide);
    pushConnector(bridges, navZones, 'c_right', core.mid, core.right, wide);
    pushConnector(bridges, navZones, 'c_south', core.south, core.mid, thick * 0.92);
  } else if (templateKey === 'side_pocket') {
    const pocketLeft = ((Math.round(centerX - centerY) + (useV2 ? 1 : 0)) & 1) === 0;
    core.south = pushPart(platforms, navZones, 'south_staging', centerX, centerY + side * 0.24, side * 0.20, side * 0.12, 12);
    core.mid = pushPart(platforms, navZones, 'forge_lane', centerX, centerY + side * 0.02, side * 0.26, side * 0.18, 12);
    core.north = pushPart(platforms, navZones, 'north_press', centerX, centerY - side * 0.20, side * 0.16, side * 0.10, 10);
    core.pocket = pushPart(platforms, navZones, pocketLeft ? 'west_pocket' : 'east_pocket', centerX + (pocketLeft ? -side * 0.23 : side * 0.23), centerY - side * 0.02, side * 0.15, side * 0.12, 10);
    pushConnector(bridges, navZones, 'c_south', core.south, core.mid, thick);
    pushConnector(bridges, navZones, 'c_north', core.mid, core.north, thick * 0.86);
    pushConnector(bridges, navZones, 'c_pocket', core.mid, core.pocket, thick * 0.76);
  } else {
    core.center = pushPart(platforms, navZones, 'crucible', centerX, centerY + side * 0.02, side * 0.28, side * 0.18, 12);
    core.north = pushPart(platforms, navZones, 'north_arm', centerX, centerY - side * 0.22, side * 0.16, side * 0.10, 10);
    core.south = pushPart(platforms, navZones, 'south_arm', centerX, centerY + side * 0.25, side * 0.18, side * 0.12, 12);
    core.west = pushPart(platforms, navZones, 'west_arm', centerX - side * 0.22, centerY + side * 0.04, side * 0.14, side * 0.11, 10);
    core.east = pushPart(platforms, navZones, 'east_arm', centerX + side * 0.22, centerY + side * 0.04, side * 0.14, side * 0.11, 10);
    pushConnector(bridges, navZones, 'c_north', core.center, core.north, thick * 0.90);
    pushConnector(bridges, navZones, 'c_south', core.south, core.center, thick * 0.95);
    pushConnector(bridges, navZones, 'c_west', core.west, core.center, thick * 0.86);
    pushConnector(bridges, navZones, 'c_east', core.center, core.east, thick * 0.86);
  }

  const hotAnchors = uniqueAnchors([
    core.west && centerOf(core.west),
    core.east && centerOf(core.east),
    core.pocket && centerOf(core.pocket),
    core.north && { x: centerOf(core.north).x, y: centerOf(core.north).y + side * 0.02 },
    { x: centerX, y: centerY + side * 0.08 },
  ], 80);
  const hazardZones = hotAnchors.slice(0, templateKey === 'wide_hall' ? 3 : 2 + (templateKey === 'side_pocket' ? 1 : 0)).map((p, i) => ({ type: i === hotAnchors.length - 1 ? 'vent_blast' : 'heat_zone', shape: 'circle', x: p.x, y: p.y, r: clamp(side * (templateKey === 'wide_hall' ? 0.070 : 0.060), 40, 86), interval: 6.2 + i * 0.6, duration: 1.2 + (i % 2) * 0.2, damageScale: 0.18 + (templateKey === 'side_pocket' ? 0.03 : 0) }));

  return {
    platforms,
    bridges,
    navZones,
    playerStart: { x: centerOf(core.south || core.mid || core.center).x, y: centerOf(core.south || core.mid || core.center).y + 8 },
    bossCenter: centerOf(core.mid || core.center || core.north),
    spawnAnchors: uniqueAnchors([
      core.north && { ...centerOf(core.north), tag: 'north_press' },
      core.west && { ...centerOf(core.west), tag: 'west_flank' },
      core.east && { ...centerOf(core.east), tag: 'east_flank' },
      core.left && { ...centerOf(core.left), tag: 'left_forge' },
      core.right && { ...centerOf(core.right), tag: 'right_forge' },
      core.pocket && { ...centerOf(core.pocket), tag: 'side_pocket' },
      { x: centerX, y: centerY, tag: 'core' },
    ]),
    coverAnchors: uniqueAnchors([
      { x: centerX - side * 0.07, y: centerY + side * 0.02, size: clamp(side * 0.024, 16, 30) },
      { x: centerX + side * 0.07, y: centerY + side * 0.02, size: clamp(side * 0.024, 16, 30) },
    ], 30),
    decorAnchors: uniqueAnchors([
      core.north && { ...centerOf(core.north), kind: 'reactor', size: 24 },
      core.left && { ...centerOf(core.left), kind: 'cargo', size: 20 },
      core.right && { ...centerOf(core.right), kind: 'cargo', size: 20 },
      core.pocket && { ...centerOf(core.pocket), kind: 'vent', size: 20 },
    ]),
    hazardAnchors: hazardZones.map((z) => ({ x: z.x, y: z.y, kind: z.type, r: z.r })),
    hazardZones,
    bossMoveNodes: uniqueAnchors([
      centerOf(core.mid || core.center || core.north),
      core.north && centerOf(core.north),
      core.west && centerOf(core.west),
      core.east && centerOf(core.east),
      core.left && centerOf(core.left),
      core.right && centerOf(core.right),
      core.pocket && centerOf(core.pocket),
    ]),
    rules: { supportsBridges: true, prefersRangedPressure: false, slipZones: false, fogZones: false, radiantBuffNodes: false, isHub: false, gateAnchorDriven: false },
  };
}

function buildIceTemplate({ templateKey, centerX, centerY, side, useV2 }) {
  const platforms = [];
  const bridges = [];
  const navZones = [];
  const broad = clamp(side * 0.13, 112, 180);
  const medium = clamp(side * 0.11, 96, 152);
  const core = {};

  if (templateKey === 'entry_square') {
    core.south = pushPart(platforms, navZones, 'south_field', centerX, centerY + side * 0.23, side * 0.24, side * 0.14, 12);
    core.mid = pushPart(platforms, navZones, 'open_core', centerX, centerY + side * 0.03, side * 0.34, side * 0.24, 14);
    core.north = pushPart(platforms, navZones, 'north_range', centerX, centerY - side * 0.20, side * 0.22, side * 0.12, 12);
    pushConnector(bridges, navZones, 'c_south', core.south, core.mid, broad);
    pushConnector(bridges, navZones, 'c_north', core.mid, core.north, medium);
  } else if (templateKey === 'wide_hall') {
    core.left = pushPart(platforms, navZones, 'west_arc', centerX - side * 0.28, centerY + side * 0.01, side * 0.22, side * 0.16, 12);
    core.mid = pushPart(platforms, navZones, 'long_lane', centerX, centerY + side * 0.01, side * 0.36, side * 0.20, 14);
    core.right = pushPart(platforms, navZones, 'east_arc', centerX + side * 0.28, centerY + side * 0.01, side * 0.22, side * 0.16, 12);
    core.south = pushPart(platforms, navZones, 'south_start', centerX, centerY + side * 0.24, side * 0.18, side * 0.10, 10);
    pushConnector(bridges, navZones, 'c_left', core.left, core.mid, broad);
    pushConnector(bridges, navZones, 'c_right', core.mid, core.right, broad);
    pushConnector(bridges, navZones, 'c_south', core.south, core.mid, medium);
  } else if (templateKey === 'side_pocket') {
    const pocketLeft = ((Math.round(centerX + centerY) + (useV2 ? 1 : 0)) & 1) === 0;
    core.south = pushPart(platforms, navZones, 'south_start', centerX, centerY + side * 0.24, side * 0.18, side * 0.10, 10);
    core.mid = pushPart(platforms, navZones, 'wide_lane', centerX, centerY + side * 0.02, side * 0.32, side * 0.18, 14);
    core.north = pushPart(platforms, navZones, 'north_arc', centerX, centerY - side * 0.20, side * 0.18, side * 0.10, 10);
    core.pocket = pushPart(platforms, navZones, pocketLeft ? 'west_pocket' : 'east_pocket', centerX + (pocketLeft ? -side * 0.26 : side * 0.26), centerY - side * 0.04, side * 0.18, side * 0.12, 12);
    pushConnector(bridges, navZones, 'c_south', core.south, core.mid, medium);
    pushConnector(bridges, navZones, 'c_north', core.mid, core.north, medium);
    pushConnector(bridges, navZones, 'c_pocket', core.mid, core.pocket, broad * 0.86);
  } else {
    core.center = pushPart(platforms, navZones, 'wide_cross', centerX, centerY + side * 0.01, side * 0.32, side * 0.20, 14);
    core.north = pushPart(platforms, navZones, 'north_arc', centerX, centerY - side * 0.21, side * 0.20, side * 0.12, 12);
    core.south = pushPart(platforms, navZones, 'south_arc', centerX, centerY + side * 0.24, side * 0.20, side * 0.12, 12);
    core.west = pushPart(platforms, navZones, 'west_line', centerX - side * 0.25, centerY + side * 0.01, side * 0.18, side * 0.14, 12);
    core.east = pushPart(platforms, navZones, 'east_line', centerX + side * 0.25, centerY + side * 0.01, side * 0.18, side * 0.14, 12);
    pushConnector(bridges, navZones, 'c_north', core.center, core.north, medium);
    pushConnector(bridges, navZones, 'c_south', core.south, core.center, medium);
    pushConnector(bridges, navZones, 'c_west', core.west, core.center, broad * 0.94);
    pushConnector(bridges, navZones, 'c_east', core.center, core.east, broad * 0.94);
  }

  const frostNodes = uniqueAnchors([
    core.west && centerOf(core.west),
    core.east && centerOf(core.east),
    core.left && centerOf(core.left),
    core.right && centerOf(core.right),
    core.pocket && centerOf(core.pocket),
    core.north && centerOf(core.north),
  ], 78);
  const hazardZones = frostNodes.slice(0, templateKey === 'cross_room' ? 3 : 2).map((p, i) => ({ type: i === frostNodes.length - 1 ? 'slip_zone' : 'frost_lane', shape: 'circle', x: p.x, y: p.y, r: clamp(side * 0.060, 42, 82), interval: 7.0 + i * 0.7, duration: 1.4 + (i % 2) * 0.25, damageScale: i === frostNodes.length - 1 ? 0.08 : 0.10 }));

  return {
    platforms,
    bridges,
    navZones,
    playerStart: { x: centerOf(core.south || core.mid || core.center).x, y: centerOf(core.south || core.mid || core.center).y + 8 },
    bossCenter: centerOf(core.mid || core.center || core.north),
    spawnAnchors: uniqueAnchors([
      core.north && { ...centerOf(core.north), tag: 'north' },
      core.west && { ...centerOf(core.west), tag: 'west' },
      core.east && { ...centerOf(core.east), tag: 'east' },
      core.left && { ...centerOf(core.left), tag: 'left' },
      core.right && { ...centerOf(core.right), tag: 'right' },
      core.pocket && { ...centerOf(core.pocket), tag: 'pocket' },
      { x: centerX, y: centerY, tag: 'core' },
    ]),
    coverAnchors: uniqueAnchors([
      { x: centerX - side * 0.07, y: centerY + side * 0.02, size: clamp(side * 0.020, 14, 22) },
      { x: centerX + side * 0.07, y: centerY + side * 0.02, size: clamp(side * 0.020, 14, 22) },
    ], 30),
    decorAnchors: uniqueAnchors([
      core.north && { ...centerOf(core.north), kind: 'ice_shard', size: 20 },
      core.left && { ...centerOf(core.left), kind: 'ice_arch', size: 18 },
      core.right && { ...centerOf(core.right), kind: 'ice_arch', size: 18 },
      core.pocket && { ...centerOf(core.pocket), kind: 'ice_shard', size: 18 },
    ]),
    hazardAnchors: hazardZones.map((z) => ({ x: z.x, y: z.y, kind: z.type, r: z.r })),
    hazardZones,
    bossMoveNodes: uniqueAnchors([
      centerOf(core.mid || core.center || core.north),
      core.north && centerOf(core.north),
      core.west && centerOf(core.west),
      core.east && centerOf(core.east),
      core.left && centerOf(core.left),
      core.right && centerOf(core.right),
      core.pocket && centerOf(core.pocket),
    ]),
    rules: { supportsBridges: true, prefersRangedPressure: true, slipZones: true, fogZones: false, radiantBuffNodes: false, isHub: false, gateAnchorDriven: false },
  };
}

function buildDarkTemplate({ templateKey, centerX, centerY, side, useV2 }) {
  const platforms = [];
  const bridges = [];
  const navZones = [];
  const thin = clamp(side * 0.074, 62, 98);
  const core = {};

  if (templateKey === 'entry_square') {
    core.south = pushPart(platforms, navZones, 'south_safe', centerX - side * 0.04, centerY + side * 0.25, side * 0.18, side * 0.12, 10);
    core.mid = pushPart(platforms, navZones, 'fractured_core', centerX + side * 0.02, centerY + side * 0.04, side * 0.22, side * 0.16, 10);
    core.north = pushPart(platforms, navZones, 'north_shard', centerX - side * 0.10, centerY - side * 0.20, side * 0.16, side * 0.10, 8);
    core.west = pushPart(platforms, navZones, 'west_shadow', centerX - side * 0.25, centerY - side * 0.03, side * 0.14, side * 0.12, 8);
    core.east = pushPart(platforms, navZones, 'east_shadow', centerX + side * 0.26, centerY + side * 0.10, side * 0.13, side * 0.11, 8);
    pushConnector(bridges, navZones, 'c_south', core.south, core.mid, thin);
    pushConnector(bridges, navZones, 'c_north', core.mid, core.north, thin * 0.92);
    pushConnector(bridges, navZones, 'c_west', core.west, core.mid, thin * 0.84, 6, -side * 0.01);
    pushConnector(bridges, navZones, 'c_east', core.mid, core.east, thin * 0.82, 6, side * 0.02);
  } else if (templateKey === 'wide_hall') {
    core.left = pushPart(platforms, navZones, 'left_void_lane', centerX - side * 0.25, centerY + side * 0.02, side * 0.16, side * 0.14, 8);
    core.mid = pushPart(platforms, navZones, 'broken_mid', centerX, centerY + side * 0.02, side * 0.24, side * 0.16, 10);
    core.right = pushPart(platforms, navZones, 'right_void_lane', centerX + side * 0.27, centerY + side * 0.08, side * 0.15, side * 0.12, 8);
    core.north = pushPart(platforms, navZones, 'north_shard', centerX - side * 0.08, centerY - side * 0.20, side * 0.14, side * 0.10, 8);
    core.south = pushPart(platforms, navZones, 'south_safe', centerX - side * 0.04, centerY + side * 0.24, side * 0.16, side * 0.10, 8);
    pushConnector(bridges, navZones, 'c_left', core.left, core.mid, thin * 0.90, 6, -side * 0.02);
    pushConnector(bridges, navZones, 'c_right', core.mid, core.right, thin * 0.84, 6, side * 0.02);
    pushConnector(bridges, navZones, 'c_north', core.mid, core.north, thin * 0.86);
    pushConnector(bridges, navZones, 'c_south', core.south, core.mid, thin * 0.92);
  } else if (templateKey === 'side_pocket') {
    const pocketLeft = ((Math.round(centerX * 0.5 + centerY * 0.7) + (useV2 ? 1 : 0)) & 1) === 0;
    core.south = pushPart(platforms, navZones, 'south_safe', centerX - side * 0.06, centerY + side * 0.25, side * 0.16, side * 0.10, 8);
    core.mid = pushPart(platforms, navZones, 'broken_mid', centerX + side * 0.02, centerY + side * 0.03, side * 0.22, side * 0.16, 10);
    core.north = pushPart(platforms, navZones, 'north_shard', centerX, centerY - side * 0.20, side * 0.14, side * 0.10, 8);
    core.pocket = pushPart(platforms, navZones, pocketLeft ? 'west_pocket' : 'east_pocket', centerX + (pocketLeft ? -side * 0.24 : side * 0.25), centerY + side * 0.12, side * 0.14, side * 0.11, 8);
    core.ambush = pushPart(platforms, navZones, pocketLeft ? 'east_ambush' : 'west_ambush', centerX + (pocketLeft ? side * 0.25 : -side * 0.25), centerY - side * 0.08, side * 0.13, side * 0.10, 8);
    pushConnector(bridges, navZones, 'c_south', core.south, core.mid, thin * 0.92);
    pushConnector(bridges, navZones, 'c_north', core.mid, core.north, thin * 0.86);
    pushConnector(bridges, navZones, 'c_pocket', core.mid, core.pocket, thin * 0.78, 6, pocketLeft ? side * 0.02 : -side * 0.02);
    pushConnector(bridges, navZones, 'c_ambush', core.ambush, core.mid, thin * 0.74, 6, pocketLeft ? -side * 0.02 : side * 0.02);
  } else {
    core.center = pushPart(platforms, navZones, 'fractured_core', centerX + side * 0.01, centerY + side * 0.02, side * 0.24, side * 0.16, 10);
    core.north = pushPart(platforms, navZones, 'north_shard', centerX - side * 0.08, centerY - side * 0.21, side * 0.14, side * 0.10, 8);
    core.south = pushPart(platforms, navZones, 'south_safe', centerX - side * 0.06, centerY + side * 0.24, side * 0.16, side * 0.10, 8);
    core.west = pushPart(platforms, navZones, 'west_flank', centerX - side * 0.26, centerY - side * 0.02, side * 0.14, side * 0.11, 8);
    core.east = pushPart(platforms, navZones, 'east_flank', centerX + side * 0.27, centerY + side * 0.08, side * 0.13, side * 0.11, 8);
    pushConnector(bridges, navZones, 'c_north', core.center, core.north, thin * 0.86);
    pushConnector(bridges, navZones, 'c_south', core.south, core.center, thin * 0.90);
    pushConnector(bridges, navZones, 'c_west', core.west, core.center, thin * 0.80, 6, -side * 0.01);
    pushConnector(bridges, navZones, 'c_east', core.center, core.east, thin * 0.80, 6, side * 0.01);
  }

  const voidCenters = uniqueAnchors([
    core.west && centerOf(core.west),
    core.east && centerOf(core.east),
    core.left && centerOf(core.left),
    core.right && centerOf(core.right),
    core.pocket && centerOf(core.pocket),
    core.ambush && centerOf(core.ambush),
  ], 74);
  const hazardZones = voidCenters.slice(0, templateKey === 'wide_hall' ? 2 : 3).map((p, i) => ({ type: i === 0 ? 'void_fog' : 'phase_pool', shape: 'circle', x: p.x, y: p.y, r: clamp(side * 0.055, 34, 72), interval: 6.8 + i * 0.8, duration: 1.3 + i * 0.2, damageScale: 0.08 + i * 0.01 }));

  return {
    platforms,
    bridges,
    navZones,
    playerStart: { x: centerOf(core.south || core.mid || core.center).x, y: centerOf(core.south || core.mid || core.center).y + 8 },
    bossCenter: centerOf(core.mid || core.center || core.north),
    spawnAnchors: uniqueAnchors([
      core.north && { ...centerOf(core.north), tag: 'north' },
      core.west && { ...centerOf(core.west), tag: 'west' },
      core.east && { ...centerOf(core.east), tag: 'east' },
      core.left && { ...centerOf(core.left), tag: 'left' },
      core.right && { ...centerOf(core.right), tag: 'right' },
      core.pocket && { ...centerOf(core.pocket), tag: 'pocket' },
      core.ambush && { ...centerOf(core.ambush), tag: 'ambush' },
      { x: centerX, y: centerY, tag: 'mid' },
    ]),
    coverAnchors: uniqueAnchors([
      { x: centerX - side * 0.05, y: centerY + side * 0.02, size: clamp(side * 0.024, 16, 28) },
      { x: centerX + side * 0.04, y: centerY - side * 0.01, size: clamp(side * 0.022, 16, 26) },
    ], 28),
    decorAnchors: uniqueAnchors([
      core.north && { ...centerOf(core.north), kind: 'void_obelisk', size: 22 },
      core.west && { ...centerOf(core.west), kind: 'shadow_spire', size: 20 },
      core.east && { ...centerOf(core.east), kind: 'shadow_spire', size: 20 },
      core.pocket && { ...centerOf(core.pocket), kind: 'rift', size: 18 },
      core.ambush && { ...centerOf(core.ambush), kind: 'rift', size: 18 },
    ]),
    hazardAnchors: hazardZones.map((z) => ({ x: z.x, y: z.y, kind: z.type, r: z.r })),
    hazardZones,
    bossMoveNodes: uniqueAnchors([
      centerOf(core.mid || core.center || core.north),
      core.north && centerOf(core.north),
      core.west && centerOf(core.west),
      core.east && centerOf(core.east),
      core.left && centerOf(core.left),
      core.right && centerOf(core.right),
      core.pocket && centerOf(core.pocket),
      core.ambush && centerOf(core.ambush),
    ]),
    rules: { supportsBridges: true, prefersRangedPressure: false, slipZones: false, fogZones: true, radiantBuffNodes: false, isHub: false, gateAnchorDriven: false },
  };
}

function buildLightTemplate({ templateKey, centerX, centerY, side, useV2 }) {
  const platforms = [];
  const bridges = [];
  const navZones = [];
  const ray = clamp(side * 0.11, 92, 140);
  const slim = clamp(side * 0.095, 82, 126);
  const core = {};

  if (templateKey === 'entry_square') {
    core.south = pushPart(platforms, navZones, 'south_nave', centerX, centerY + side * 0.24, side * 0.20, side * 0.12, 10);
    core.mid = pushPart(platforms, navZones, 'center_dais', centerX, centerY + side * 0.03, side * 0.26, side * 0.18, 12);
    core.north = pushPart(platforms, navZones, 'north_altar', centerX, centerY - side * 0.19, side * 0.18, side * 0.11, 10);
    core.west = pushPart(platforms, navZones, 'west_ray', centerX - side * 0.23, centerY + side * 0.03, side * 0.14, side * 0.10, 8);
    core.east = pushPart(platforms, navZones, 'east_ray', centerX + side * 0.23, centerY + side * 0.03, side * 0.14, side * 0.10, 8);
    pushConnector(bridges, navZones, 'c_south', core.south, core.mid, slim);
    pushConnector(bridges, navZones, 'c_north', core.mid, core.north, slim);
    pushConnector(bridges, navZones, 'c_west', core.west, core.mid, ray * 0.72);
    pushConnector(bridges, navZones, 'c_east', core.mid, core.east, ray * 0.72);
  } else if (templateKey === 'wide_hall') {
    core.left = pushPart(platforms, navZones, 'left_ray', centerX - side * 0.26, centerY + side * 0.02, side * 0.18, side * 0.12, 10);
    core.mid = pushPart(platforms, navZones, 'long_nave', centerX, centerY + side * 0.02, side * 0.32, side * 0.18, 12);
    core.right = pushPart(platforms, navZones, 'right_ray', centerX + side * 0.26, centerY + side * 0.02, side * 0.18, side * 0.12, 10);
    core.north = pushPart(platforms, navZones, 'north_halo', centerX, centerY - side * 0.20, side * 0.16, side * 0.10, 8);
    core.south = pushPart(platforms, navZones, 'south_start', centerX, centerY + side * 0.24, side * 0.16, side * 0.10, 8);
    pushConnector(bridges, navZones, 'c_left', core.left, core.mid, ray * 0.88);
    pushConnector(bridges, navZones, 'c_right', core.mid, core.right, ray * 0.88);
    pushConnector(bridges, navZones, 'c_north', core.mid, core.north, slim);
    pushConnector(bridges, navZones, 'c_south', core.south, core.mid, slim);
  } else if (templateKey === 'side_pocket') {
    const chapelLeft = ((Math.round(centerX - centerY) + (useV2 ? 1 : 0)) & 1) === 0;
    core.south = pushPart(platforms, navZones, 'south_start', centerX, centerY + side * 0.24, side * 0.16, side * 0.10, 8);
    core.mid = pushPart(platforms, navZones, 'center_dais', centerX, centerY + side * 0.02, side * 0.28, side * 0.18, 12);
    core.north = pushPart(platforms, navZones, 'north_halo', centerX, centerY - side * 0.20, side * 0.16, side * 0.10, 8);
    core.pocket = pushPart(platforms, navZones, chapelLeft ? 'west_chapel' : 'east_chapel', centerX + (chapelLeft ? -side * 0.24 : side * 0.24), centerY - side * 0.02, side * 0.15, side * 0.11, 8);
    core.mirror = pushPart(platforms, navZones, chapelLeft ? 'east_ray' : 'west_ray', centerX + (chapelLeft ? side * 0.23 : -side * 0.23), centerY + side * 0.09, side * 0.13, side * 0.10, 8);
    pushConnector(bridges, navZones, 'c_south', core.south, core.mid, slim);
    pushConnector(bridges, navZones, 'c_north', core.mid, core.north, slim);
    pushConnector(bridges, navZones, 'c_pocket', core.mid, core.pocket, ray * 0.70);
    pushConnector(bridges, navZones, 'c_mirror', core.mid, core.mirror, ray * 0.68);
  } else {
    core.center = pushPart(platforms, navZones, 'core_cross', centerX, centerY + side * 0.02, side * 0.28, side * 0.18, 12);
    core.north = pushPart(platforms, navZones, 'north_halo', centerX, centerY - side * 0.20, side * 0.18, side * 0.10, 8);
    core.south = pushPart(platforms, navZones, 'south_nave', centerX, centerY + side * 0.24, side * 0.18, side * 0.11, 8);
    core.west = pushPart(platforms, navZones, 'west_ray', centerX - side * 0.24, centerY + side * 0.02, side * 0.16, side * 0.11, 8);
    core.east = pushPart(platforms, navZones, 'east_ray', centerX + side * 0.24, centerY + side * 0.02, side * 0.16, side * 0.11, 8);
    pushConnector(bridges, navZones, 'c_north', core.center, core.north, slim);
    pushConnector(bridges, navZones, 'c_south', core.south, core.center, slim);
    pushConnector(bridges, navZones, 'c_west', core.west, core.center, ray * 0.78);
    pushConnector(bridges, navZones, 'c_east', core.center, core.east, ray * 0.78);
  }

  const buffNodes = uniqueAnchors([
    core.west && centerOf(core.west),
    core.east && centerOf(core.east),
    core.left && centerOf(core.left),
    core.right && centerOf(core.right),
    core.pocket && centerOf(core.pocket),
    core.mirror && centerOf(core.mirror),
    core.north && centerOf(core.north),
  ], 74);
  const hazardZones = buffNodes.slice(0, templateKey === 'cross_room' ? 3 : 2).map((p, i) => ({ type: i === buffNodes.length - 1 ? 'buff_node' : 'radiant_node', shape: 'circle', x: p.x, y: p.y, r: clamp(side * 0.052, 34, 70), interval: 7.5 + i * 0.8, duration: 1.2 + i * 0.2, damageScale: i === buffNodes.length - 1 ? 0.03 : 0.05 }));

  return {
    platforms,
    bridges,
    navZones,
    playerStart: { x: centerOf(core.south || core.mid || core.center).x, y: centerOf(core.south || core.mid || core.center).y + 8 },
    bossCenter: centerOf(core.mid || core.center || core.north),
    spawnAnchors: uniqueAnchors([
      core.north && { ...centerOf(core.north), tag: 'north' },
      core.west && { ...centerOf(core.west), tag: 'west' },
      core.east && { ...centerOf(core.east), tag: 'east' },
      core.left && { ...centerOf(core.left), tag: 'left' },
      core.right && { ...centerOf(core.right), tag: 'right' },
      core.pocket && { ...centerOf(core.pocket), tag: 'chapel' },
      core.mirror && { ...centerOf(core.mirror), tag: 'mirror' },
      { x: centerX, y: centerY, tag: 'core' },
    ]),
    coverAnchors: uniqueAnchors([
      { x: centerX - side * 0.06, y: centerY + side * 0.02, size: clamp(side * 0.020, 14, 22) },
      { x: centerX + side * 0.06, y: centerY + side * 0.02, size: clamp(side * 0.020, 14, 22) },
    ], 28),
    decorAnchors: uniqueAnchors([
      core.north && { ...centerOf(core.north), kind: 'sun_lens', size: 22 },
      core.west && { ...centerOf(core.west), kind: 'light_prism', size: 18 },
      core.east && { ...centerOf(core.east), kind: 'light_prism', size: 18 },
      core.pocket && { ...centerOf(core.pocket), kind: 'radiant_pylon', size: 18 },
      core.mirror && { ...centerOf(core.mirror), kind: 'radiant_pylon', size: 18 },
    ]),
    hazardAnchors: hazardZones.map((z) => ({ x: z.x, y: z.y, kind: z.type, r: z.r })),
    hazardZones,
    bossMoveNodes: uniqueAnchors([
      centerOf(core.mid || core.center || core.north),
      core.north && centerOf(core.north),
      core.west && centerOf(core.west),
      core.east && centerOf(core.east),
      core.left && centerOf(core.left),
      core.right && centerOf(core.right),
      core.pocket && centerOf(core.pocket),
      core.mirror && centerOf(core.mirror),
    ]),
    rules: { supportsBridges: true, prefersRangedPressure: true, slipZones: false, fogZones: false, radiantBuffNodes: true, isHub: false, gateAnchorDriven: false },
  };
}

function buildNeutralTemplate({ templateKey, centerX, centerY, side, useV2 }) {
  const platforms = [];
  const bridges = [];
  const navZones = [];
  const lane = clamp(side * 0.094, 82, 130);
  const core = {};

  if (templateKey === 'entry_square') {
    core.south = pushPart(platforms, navZones, 'south_dock', centerX, centerY + side * 0.24, side * 0.18, side * 0.12, 10);
    core.mid = pushPart(platforms, navZones, 'center_hall', centerX, centerY + side * 0.02, side * 0.26, side * 0.18, 12);
    core.north = pushPart(platforms, navZones, 'north_console', centerX, centerY - side * 0.20, side * 0.16, side * 0.10, 8);
    pushConnector(bridges, navZones, 'c_south', core.south, core.mid, lane);
    pushConnector(bridges, navZones, 'c_north', core.mid, core.north, lane * 0.9);
  } else if (templateKey === 'wide_hall') {
    core.left = pushPart(platforms, navZones, 'west_module', centerX - side * 0.24, centerY + side * 0.02, side * 0.18, side * 0.12, 10);
    core.mid = pushPart(platforms, navZones, 'center_hall', centerX, centerY + side * 0.02, side * 0.30, side * 0.18, 12);
    core.right = pushPart(platforms, navZones, 'east_module', centerX + side * 0.24, centerY + side * 0.02, side * 0.18, side * 0.12, 10);
    core.south = pushPart(platforms, navZones, 'south_dock', centerX, centerY + side * 0.24, side * 0.16, side * 0.10, 8);
    pushConnector(bridges, navZones, 'c_left', core.left, core.mid, lane);
    pushConnector(bridges, navZones, 'c_right', core.mid, core.right, lane);
    pushConnector(bridges, navZones, 'c_south', core.south, core.mid, lane * 0.9);
  } else if (templateKey === 'side_pocket') {
    const pocketLeft = ((Math.round(centerX + centerY) + (useV2 ? 1 : 0)) & 1) === 0;
    core.south = pushPart(platforms, navZones, 'south_dock', centerX, centerY + side * 0.24, side * 0.16, side * 0.10, 8);
    core.mid = pushPart(platforms, navZones, 'center_hall', centerX, centerY + side * 0.02, side * 0.26, side * 0.18, 12);
    core.north = pushPart(platforms, navZones, 'north_console', centerX, centerY - side * 0.20, side * 0.14, side * 0.10, 8);
    core.pocket = pushPart(platforms, navZones, pocketLeft ? 'west_store' : 'east_store', centerX + (pocketLeft ? -side * 0.24 : side * 0.24), centerY - side * 0.02, side * 0.14, side * 0.10, 8);
    pushConnector(bridges, navZones, 'c_south', core.south, core.mid, lane * 0.92);
    pushConnector(bridges, navZones, 'c_north', core.mid, core.north, lane * 0.88);
    pushConnector(bridges, navZones, 'c_pocket', core.mid, core.pocket, lane * 0.82);
  } else {
    core.center = pushPart(platforms, navZones, 'center_hall', centerX, centerY + side * 0.02, side * 0.28, side * 0.18, 12);
    core.north = pushPart(platforms, navZones, 'north_console', centerX, centerY - side * 0.20, side * 0.16, side * 0.10, 8);
    core.south = pushPart(platforms, navZones, 'south_dock', centerX, centerY + side * 0.24, side * 0.16, side * 0.10, 8);
    core.west = pushPart(platforms, navZones, 'west_module', centerX - side * 0.24, centerY + side * 0.02, side * 0.16, side * 0.10, 8);
    core.east = pushPart(platforms, navZones, 'east_module', centerX + side * 0.24, centerY + side * 0.02, side * 0.16, side * 0.10, 8);
    pushConnector(bridges, navZones, 'c_north', core.center, core.north, lane * 0.88);
    pushConnector(bridges, navZones, 'c_south', core.south, core.center, lane * 0.88);
    pushConnector(bridges, navZones, 'c_west', core.west, core.center, lane * 0.82);
    pushConnector(bridges, navZones, 'c_east', core.center, core.east, lane * 0.82);
  }

  const hazardZones = templateKey === 'wide_hall'
    ? [{ type: 'station_vent', shape: 'circle', x: centerX, y: centerY + side * 0.08, r: clamp(side * 0.045, 28, 54), interval: 6.8, duration: 1.0, damageScale: 0.12 }]
    : [];

  return {
    platforms,
    bridges,
    navZones,
    playerStart: { x: centerOf(core.south || core.mid || core.center).x, y: centerOf(core.south || core.mid || core.center).y + 8 },
    bossCenter: centerOf(core.mid || core.center || core.north),
    spawnAnchors: uniqueAnchors([
      core.north && { ...centerOf(core.north), tag: 'north' },
      core.west && { ...centerOf(core.west), tag: 'west' },
      core.east && { ...centerOf(core.east), tag: 'east' },
      core.left && { ...centerOf(core.left), tag: 'left' },
      core.right && { ...centerOf(core.right), tag: 'right' },
      core.pocket && { ...centerOf(core.pocket), tag: 'pocket' },
      { x: centerX, y: centerY, tag: 'core' },
    ]),
    coverAnchors: uniqueAnchors([
      { x: centerX - side * 0.06, y: centerY + side * 0.02, size: clamp(side * 0.022, 16, 24) },
      { x: centerX + side * 0.06, y: centerY + side * 0.02, size: clamp(side * 0.022, 16, 24) },
    ], 28),
    decorAnchors: uniqueAnchors([
      core.north && { ...centerOf(core.north), kind: 'relay', size: 18 },
      core.left && { ...centerOf(core.left), kind: 'cargo', size: 18 },
      core.right && { ...centerOf(core.right), kind: 'cargo', size: 18 },
      core.pocket && { ...centerOf(core.pocket), kind: 'cargo', size: 16 },
    ]),
    hazardAnchors: hazardZones.map((z) => ({ x: z.x, y: z.y, kind: z.type, r: z.r })),
    hazardZones,
    bossMoveNodes: uniqueAnchors([
      centerOf(core.mid || core.center || core.north),
      core.north && centerOf(core.north),
      core.west && centerOf(core.west),
      core.east && centerOf(core.east),
      core.left && centerOf(core.left),
      core.right && centerOf(core.right),
      core.pocket && centerOf(core.pocket),
    ]),
    rules: { supportsBridges: true, prefersRangedPressure: false, slipZones: false, fogZones: false, radiantBuffNodes: false, isHub: false, gateAnchorDriven: false },
  };
}

const BUILDERS = {
  neutral: buildNeutralTemplate,
  electric: buildElectricTemplate,
  fire: buildFireTemplate,
  ice: buildIceTemplate,
  dark: buildDarkTemplate,
  light: buildLightTemplate,
};

export function generateTemplateRoomArena({ biomeKey = '', templateKey = '', roomIndex = 0, centerX = 0, centerY = 0, side = 1200, profile = null, selectedLayoutId = '', entrySocket = '', exitSocket = '', portalSocket = '', templateRole = '', routeStyle = '', lateralOffset = 0 } = {}) {
  const tk = String(templateKey || '').toLowerCase();
  if ((roomIndex | 0) <= 0 || !tk || tk === 'hub') return null;
  const resolvedRole = resolveRole(tk, templateRole);
  const shouldUseRoleGenerator = canHandleTemplate(tk, resolvedRole);
  if (shouldUseRoleGenerator) {
    const roleBuilt = generateRoleRoomArena({ biomeKey, templateKey: tk, templateRole: resolvedRole, roomIndex, centerX, centerY, side, profile, selectedLayoutId, entrySocket, exitSocket, portalSocket, routeStyle, lateralOffset });
    if (roleBuilt) return roleBuilt;
  }
  const biome = String(biomeKey || '').toLowerCase() || 'neutral';
  const builder = BUILDERS[biome] || BUILDERS.neutral;
  const useV2 = String(selectedLayoutId || '').includes('_v2');
  const built = builder({ templateKey: tk, centerX, centerY, side, useV2, biomeKey: biome, templateRole: resolvedRole || templateRole, routeStyle, lateralOffset, entrySocket, exitSocket });
  if (!built) return null;

  const partsBounds = boundsFromRects([...(built.platforms || []), ...(built.bridges || [])]);
  const gateAnchors = gateAnchorsFromBounds(partsBounds, centerX, centerY, { entrySocket, exitSocket, portalSocket });
  const bossCenter = built.bossCenter || { x: centerX, y: centerY };
  const entryBias = entrySocket ? resolveSocketPoint(partsBounds || { minX: centerX - side * 0.5, maxX: centerX + side * 0.5, minY: centerY - side * 0.5, maxY: centerY + side * 0.5 }, centerX, centerY, entrySocket, { outside: -Math.max(24, side * 0.08), offsetScale: 0.22 }) : null;
  const playerStart = entryBias || built.playerStart || { x: centerX, y: centerY + side * 0.12 };
  const pressureZones = (built.hazardZones || []).map((z) => ({ x: z.x, y: z.y, r: z.r * 1.06 }));
  const safeLanes = uniqueAnchors([
    playerStart && { x: playerStart.x, y: playerStart.y, r: clamp(side * 0.06, 48, 88) },
    { x: bossCenter.x, y: bossCenter.y, r: clamp(side * 0.08, 62, 108) },
  ], 54);

  return {
    layoutId: `${biome}_${tk}_${useV2 ? 'v2' : 'v1'}_r${roomIndex | 0}`,
    profileId: profile?.biomeId || biome,
    visualPreset: profile?.visualPreset || biome,
    geometry: {
      platforms: built.platforms || [],
      bridges: built.bridges || [],
      walls: [],
      voidZones: [],
      navZones: built.navZones || [],
    },
    anchors: {
      playerStart,
      spawnAnchors: built.spawnAnchors || [{ x: centerX, y: centerY - side * 0.12 }],
      gateAnchors,
      decorAnchors: built.decorAnchors || [],
      coverAnchors: built.coverAnchors || [],
      hazardAnchors: built.hazardAnchors || [],
      bossSpawn: built.bossCenter || { x: centerX, y: centerY },
      bossMoveNodes: built.bossMoveNodes && built.bossMoveNodes.length ? built.bossMoveNodes : [{ x: centerX, y: centerY }],
    },
    hazardZones: built.hazardZones || [],
    bossArena: {
      arenaType: `${biome}_${tk}`,
      center: bossCenter,
      safeLanes,
      pressureZones,
      phaseNodes: (built.bossMoveNodes || []).slice(0, 6),
    },
    rules: { ...(built.rules || { supportsBridges: true, isHub: false }), routeStyle: String(routeStyle || ''), templateRole: String(resolvedRole || templateRole || ''), lateralOffset: Number(lateralOffset) || 0 },
  };
}
