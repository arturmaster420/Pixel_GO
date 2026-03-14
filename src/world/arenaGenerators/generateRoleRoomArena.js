import { resolveSocketPoint, primaryEdgeForSocket, socketVector } from '../roomRoute.js';
import { buildWalkRectsFromNavZones, clampPointToRects } from '../floorCollision.js';

function clamp(n, a, b) {
  return n < a ? a : (n > b ? b : n);
}

function rect(id, cx, cy, w, h) {
  return { id, type: 'rect', x: cx - w * 0.5, y: cy - h * 0.5, w, h };
}

function circle(id, cx, cy, r) {
  return { id, type: 'circle', x: cx, y: cy, r };
}

function makeNavRect(id, cx, cy, w, h, inset = 8) {
  return rect(id, cx, cy, Math.max(18, w - inset), Math.max(18, h - inset));
}

function makeNavCircle(id, cx, cy, r, inset = 12) {
  return circle(id, cx, cy, Math.max(18, r - inset));
}

function centerOf(r) {
  if (String(r?.type || '') === 'circle') return { x: Number(r?.x || 0), y: Number(r?.y || 0) };
  return { x: Number(r?.x || 0) + Number(r?.w || 0) * 0.5, y: Number(r?.y || 0) + Number(r?.h || 0) * 0.5 };
}

function pushPart(parts, nav, id, cx, cy, w, h, navInset = 8) {
  const p = rect(id, cx, cy, w, h);
  parts.push(p);
  nav.push(makeNavRect(`${id}_nav`, cx, cy, w, h, navInset));
  return p;
}

function pushCircle(parts, nav, id, cx, cy, r, navInset = 14) {
  const p = circle(id, cx, cy, r);
  parts.push(p);
  nav.push(makeNavCircle(`${id}_nav`, cx, cy, r, navInset));
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
    const gap = Math.max(22, rightEdge - leftEdge + 20);
    const cx = (leftEdge + rightEdge) * 0.5;
    const cy = (ac.y + bc.y) * 0.5 + bias;
    const h = Math.max(28, thickness);
    parts.push(rect(id, cx, cy, gap, h));
    nav.push(makeNavRect(`${id}_nav`, cx, cy, gap, h, navInset));
    return parts[parts.length - 1];
  }
  const top = dy >= 0 ? a : b;
  const bottom = dy >= 0 ? b : a;
  const topEdge = top.y + top.h;
  const bottomEdge = bottom.y;
  const gap = Math.max(22, bottomEdge - topEdge + 20);
  const cx = (ac.x + bc.x) * 0.5 + bias;
  const cy = (topEdge + bottomEdge) * 0.5;
  const w = Math.max(28, thickness);
  parts.push(rect(id, cx, cy, w, gap));
  nav.push(makeNavRect(`${id}_nav`, cx, cy, w, gap, navInset));
  return parts[parts.length - 1];
}

function boundsFromRects(rects) {
  let out = null;
  for (const r of rects) {
    if (!r) continue;
    const a = String(r.type || '') === 'circle'
      ? { minX: r.x - r.r, minY: r.y - r.r, maxX: r.x + r.r, maxY: r.y + r.r }
      : { minX: r.x, minY: r.y, maxX: r.x + r.w, maxY: r.y + r.h };
    out = out ? {
      minX: Math.min(out.minX, a.minX),
      minY: Math.min(out.minY, a.minY),
      maxX: Math.max(out.maxX, a.maxX),
      maxY: Math.max(out.maxY, a.maxY),
    } : a;
  }
  return out;
}

function clampPointToBounds(point, bounds, pad = 10) {
  if (!point || !bounds) return point;
  const p = Math.max(0, Number(pad) || 0);
  const minX = Number(bounds.minX) + p;
  const maxX = Number(bounds.maxX) - p;
  const minY = Number(bounds.minY) + p;
  const maxY = Number(bounds.maxY) - p;
  return {
    ...point,
    x: Math.max(minX, Math.min(maxX, Number(point.x) || 0)),
    y: Math.max(minY, Math.min(maxY, Number(point.y) || 0)),
  };
}

function clampPointListToBounds(list = [], bounds, pad = 10) {
  return (Array.isArray(list) ? list : []).map((p) => clampPointToBounds(p, bounds, pad)).filter(Boolean);
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
  }
  return uniqueAnchors(out, 18);
}

function firstCore(core, ...keys) {
  for (const key of keys) {
    if (core && core[key]) return core[key];
  }
  const vals = Object.values(core || {}).filter(Boolean);
  return vals[0] || null;
}

function addDecor(anchors, point, kind, size) {
  if (!point || !kind) return;
  anchors.push({ x: point.x, y: point.y, kind, size });
}

function addCircleHazard(list, point, type, radius, interval, duration, damageScale) {
  if (!point || !type) return;
  list.push({ type, shape: 'circle', x: point.x, y: point.y, r: radius, interval, duration, damageScale });
}

const THEME = {
  neutral: {
    profileId: 'neutral',
    generatorId: 'orbital_atrium',
    visualPreset: 'neutral_orbital_atrium',
    connectorScale: 1.06,
    spanScale: 1.04,
    platformScale: 1.06,
    asymmetry: 0.03,
    sideLift: 0.01,
    hazardKinds: ['scanner_sweep', 'vacuum_pull', 'low_gravity'],
    decorKinds: ['reactor', 'dock', 'cargo', 'garden_pod', 'gravity_well'],
    prefersRangedPressure: false,
    slipZones: false,
    fogZones: false,
    radiantBuffNodes: false,
    movementFeel: 'clean_route_with_balcony_bypass',
    safeLogic: 'honest_balanced_safe_spots',
    pressureStyle: 'lines_of_sight_and_scan_rhythm',
    shapeIdentity: 'atriums_galleries_service_rings',
  },
  electric: {
    profileId: 'electric',
    generatorId: 'storm_spire',
    visualPreset: 'electric_storm_spire',
    connectorScale: 0.80,
    spanScale: 0.90,
    platformScale: 0.92,
    asymmetry: 0.10,
    sideLift: -0.03,
    hazardKinds: ['lightning_sweep', 'chain_arc', 'overload_bloom'],
    decorKinds: ['lightning_rod', 'storm_prism', 'capacitor_petal', 'relay'],
    prefersRangedPressure: true,
    slipZones: false,
    fogZones: false,
    radiantBuffNodes: false,
    movementFeel: 'high_risk_reposition_between_petals',
    safeLogic: 'short_lived_positions_kept_by_tempo',
    pressureStyle: 'storm_pulses_and_open_span_hunts',
    shapeIdentity: 'spires_petals_broken_outer_rings',
  },
  fire: {
    profileId: 'fire',
    generatorId: 'ember_throne',
    visualPreset: 'fire_ember_throne',
    connectorScale: 0.92,
    spanScale: 0.96,
    platformScale: 1.00,
    asymmetry: 0.06,
    sideLift: 0.04,
    hazardKinds: ['heat_field', 'vent_eruption', 'ember_rain'],
    decorKinds: ['ember_brazier', 'altar', 'obsidian_rib', 'reactor'],
    prefersRangedPressure: false,
    slipZones: false,
    fogZones: false,
    radiantBuffNodes: false,
    movementFeel: 'ground_pushes_you_off_melting_islands',
    safeLogic: 'temporary_cool_plates_only',
    pressureStyle: 'area_denial_and_territory_loss',
    shapeIdentity: 'thrones_terraces_molten_forks',
  },
  ice: {
    profileId: 'ice',
    generatorId: 'crystal_fjord',
    visualPreset: 'ice_crystal_fjord',
    connectorScale: 1.12,
    spanScale: 1.14,
    platformScale: 1.08,
    asymmetry: 0.04,
    sideLift: -0.04,
    hazardKinds: ['frost_bloom', 'slip_lane', 'whiteout_pulse'],
    decorKinds: ['crystal_rib', 'aurora_node', 'frost_mirror', 'light_prism'],
    prefersRangedPressure: true,
    slipZones: true,
    fogZones: false,
    radiantBuffNodes: false,
    movementFeel: 'long_lines_sparse_cover_tactical_slip',
    safeLogic: 'rare_beautiful_but_fragile_shelter',
    pressureStyle: 'range_lines_and_fracture_zones',
    shapeIdentity: 'terraces_dual_arcs_fjord_gaps',
  },
  dark: {
    profileId: 'dark',
    generatorId: 'dark_void',
    visualPreset: 'dark_void_fracture',
    connectorScale: 0.84,
    spanScale: 0.88,
    platformScale: 0.94,
    asymmetry: 0.18,
    sideLift: 0.02,
    hazardKinds: ['phase_pool', 'void_mist', 'null_pulse'],
    decorKinds: ['void_obelisk', 'shadow_spire', 'rift', 'dead_lantern'],
    prefersRangedPressure: false,
    slipZones: false,
    fogZones: true,
    radiantBuffNodes: false,
    movementFeel: 'one_main_route_with_risky_flanks',
    safeLogic: 'local_and_suspicious_safe_spots',
    pressureStyle: 'ambush_flank_and_periphery_anxiety',
    shapeIdentity: 'fractured_cores_torn_spans_broken_rings',
  },
  light: {
    profileId: 'light',
    generatorId: 'light_temple',
    visualPreset: 'light_radiant_temple',
    connectorScale: 0.96,
    spanScale: 1.02,
    platformScale: 1.02,
    asymmetry: 0.01,
    sideLift: -0.01,
    hazardKinds: ['ray_sweep', 'prism_burst', 'blessing_node'],
    decorKinds: ['radiant_pylon', 'sun_lens', 'prism', 'sun_dais'],
    prefersRangedPressure: true,
    slipZones: false,
    fogZones: false,
    radiantBuffNodes: true,
    movementFeel: 'clear_axes_and_contested_points_of_power',
    safeLogic: 'visible_nodes_you_must_hold',
    pressureStyle: 'beam_waves_and_buff_control_fights',
    shapeIdentity: 'halos_rays_octagons_and_crowns',
  },
};

const ROOM_GRAMMAR_BY_BIOME = {
  neutral: { vestibule: 'arrival_concourse', hall: 'glass_gallery', split: 'transit_junction', pocket: 'dock_alcove', ring: 'service_ring', arena: 'atrium_floor', shrine: 'control_sanctum', bridge: 'suspended_span', crucible: 'pressure_lock_sector', crown: 'orbital_core' },
  electric: { vestibule: 'charged_landing', hall: 'storm_conduit', split: 'arc_fork', pocket: 'capacitor_nest', ring: 'thunder_halo', arena: 'storm_court', shrine: 'charged_sanctum', bridge: 'live_conductor_span', crucible: 'overload_channel', crown: 'storm_eye_crown' },
  fire: { vestibule: 'ember_gate', hall: 'ember_nave', split: 'molten_fork', pocket: 'vent_alcove', ring: 'ash_ring', arena: 'throne_court', shrine: 'furnace_shrine', bridge: 'obsidian_span', crucible: 'heat_crucible', crown: 'throne_crater' },
  ice: { vestibule: 'frost_threshold', hall: 'frozen_terrace', split: 'crystal_fork', pocket: 'snow_hollow', ring: 'aurora_ring', arena: 'fjord_court', shrine: 'crystal_shrine', bridge: 'frozen_span', crucible: 'fracture_lane', crown: 'glacial_crown' },
  dark: { vestibule: 'broken_threshold', hall: 'shadow_hall', split: 'fractured_split', pocket: 'ambush_pocket', ring: 'broken_ring', arena: 'shattered_core', shrine: 'null_shrine', bridge: 'torn_span', crucible: 'void_choke', crown: 'void_crown' },
  light: { vestibule: 'luminous_vestibule', hall: 'radiant_nave', split: 'prism_split', pocket: 'blessing_shrine', ring: 'halo_ring', arena: 'sanctum_arena', shrine: 'prism_sanctum', bridge: 'beam_bridge', crucible: 'prism_crucible', crown: 'radiant_crown' },
};

const TEMPLATE_ROLE_BY_KEY = {
  entry_square: 'vestibule',
  neutral_intro_vestibule: 'vestibule',
  wide_hall: 'hall',
  neutral_intro_hall: 'hall',
  cross_room: 'split',
  neutral_intro_split: 'split',
  side_pocket: 'pocket',
  ring_path: 'ring',
  arena_court: 'arena',
  neutral_intro_arena: 'arena',
  shrine_node: 'shrine',
  bridge_span: 'bridge',
  crucible_chamber: 'crucible',
  final_room: 'crown',
  neutral_intro_crown: 'crown',
};

function resolveRole(templateKey = '', templateRole = '') {
  const role = String(templateRole || '').toLowerCase();
  if (role && ['vestibule', 'hall', 'split', 'pocket', 'ring', 'arena', 'shrine', 'bridge', 'crucible', 'crown'].includes(role)) return role;
  return TEMPLATE_ROLE_BY_KEY[String(templateKey || '').toLowerCase()] || '';
}

function canHandleTemplate(templateKey = '', templateRole = '') {
  return !!resolveRole(templateKey, templateRole);
}

function insideBias(bounds, centerX, centerY, socket, depth, walkRects) {
  if (!bounds) return { x: centerX, y: centerY };
  const raw = resolveSocketPoint(bounds, centerX, centerY, socket || 'S', { outside: -Math.max(20, depth), offsetScale: 0.22 });
  return clampPointToRects(raw.x, raw.y, walkRects, { edgePad: 14, prefer: { x: centerX, y: centerY } });
}




function circleSocketPoint(cx, cy, r, socket = 'N', outside = 0) {
  const vec = socketVector(socket || 'N', 'N');
  const len = Math.hypot(Number(vec?.dx) || 0, Number(vec?.dy) || 0) || 1;
  const nx = (Number(vec?.dx) || 0) / len;
  const ny = (Number(vec?.dy) || 0) / len;
  return { x: cx + nx * (r + outside), y: cy + ny * (r + outside) };
}


function buildBiomeCircleArenaGeometry({ biome = '', role = '', centerX, centerY, side, entrySocket = '', exitSocket = '', portalSocket = '' } = {}) {
  const platforms = [];
  const bridges = [];
  const navZones = [];
  const decorAnchors = [];
  const coverAnchors = [];
  const hazardAnchors = [];
  const hazardZones = [];
  const bossMoveNodes = [];
  const safeLanes = [];
  const pressureZones = [];
  const phaseNodes = [];

  const roleRadiusMul = {
    vestibule: 0.45,
    hall: 0.465,
    split: 0.478,
    pocket: 0.448,
    ring: 0.49,
    arena: 0.505,
    shrine: 0.462,
    bridge: 0.448,
    crucible: 0.488,
    crown: 0.525,
  };
  const biomeRadiusAdd = {
    neutral: 0.0,
    electric: -0.004,
    fire: 0.004,
    ice: 0.010,
    dark: -0.010,
    light: 0.006,
  };
  const radius = clamp(side * ((roleRadiusMul[role] || 0.46) + (biomeRadiusAdd[String(biome || '').toLowerCase()] || 0)), 320, 580);
  const walkInset = clamp(radius * 0.050, 12, 24);
  const platform = pushCircle(platforms, navZones, `${String(biome || 'neutral').toLowerCase()}_${String(role || 'arena').toLowerCase()}_orb`, centerX, centerY, radius, walkInset);

  const entryInner = circleSocketPoint(centerX, centerY, radius * 0.66, entrySocket || 'S', 0);
  const exitInner = circleSocketPoint(centerX, centerY, radius * 0.66, exitSocket || portalSocket || 'N', 0);
  const portalInner = circleSocketPoint(centerX, centerY, radius * 0.72, portalSocket || exitSocket || 'N', 0);
  const playerStart = {
    x: centerX * 0.22 + entryInner.x * 0.78,
    y: centerY * 0.22 + entryInner.y * 0.78,
  };
  const bossCenter = { x: centerX, y: centerY };

  const spawnOutside = radius + clamp(side * 0.10, 96, 148);
  const spawnAnchors = uniqueAnchors([
    circleSocketPoint(centerX, centerY, spawnOutside, 'N', 0),
    circleSocketPoint(centerX, centerY, spawnOutside, 'NE', 0),
    circleSocketPoint(centerX, centerY, spawnOutside, 'E', 0),
    circleSocketPoint(centerX, centerY, spawnOutside, 'SE', 0),
    circleSocketPoint(centerX, centerY, spawnOutside, 'S', 0),
    circleSocketPoint(centerX, centerY, spawnOutside, 'SW', 0),
    circleSocketPoint(centerX, centerY, spawnOutside, 'W', 0),
    circleSocketPoint(centerX, centerY, spawnOutside, 'NW', 0),
  ].map((p, i) => ({ x: p.x, y: p.y, tag: `outer_${i}` })), 72);

  const gateAnchors = uniqueAnchors([
    entrySocket ? { ...circleSocketPoint(centerX, centerY, radius - 4, entrySocket, 0), side: primaryEdgeForSocket(entrySocket, 'S'), socket: entrySocket, tag: 'entry' } : null,
    exitSocket ? { ...circleSocketPoint(centerX, centerY, radius - 4, exitSocket, 0), side: primaryEdgeForSocket(exitSocket, 'N'), socket: exitSocket, tag: 'exit' } : null,
    portalSocket ? { ...circleSocketPoint(centerX, centerY, radius - 4, portalSocket, 0), side: primaryEdgeForSocket(portalSocket, 'N'), socket: portalSocket, tag: 'portal' } : null,
  ].filter(Boolean), 28);

  const orbitR = radius * 0.68;
  bossMoveNodes.push(
    { x: centerX, y: centerY },
    circleSocketPoint(centerX, centerY, orbitR, 'N', 0),
    circleSocketPoint(centerX, centerY, orbitR, 'NE', 0),
    circleSocketPoint(centerX, centerY, orbitR, 'E', 0),
    circleSocketPoint(centerX, centerY, orbitR, 'SE', 0),
    circleSocketPoint(centerX, centerY, orbitR, 'S', 0),
    circleSocketPoint(centerX, centerY, orbitR, 'SW', 0),
    circleSocketPoint(centerX, centerY, orbitR, 'W', 0),
    circleSocketPoint(centerX, centerY, orbitR, 'NW', 0),
  );

  safeLanes.push(
    { x: centerX, y: centerY, r: radius * 0.28 },
    { x: playerStart.x, y: playerStart.y, r: radius * 0.18 },
  );
  pressureZones.push(
    { x: exitInner.x * 0.84 + centerX * 0.16, y: exitInner.y * 0.84 + centerY * 0.16, r: radius * 0.16 },
  );
  phaseNodes.push(
    circleSocketPoint(centerX, centerY, radius * 0.40, 'NE', 0),
    circleSocketPoint(centerX, centerY, radius * 0.40, 'NW', 0),
    circleSocketPoint(centerX, centerY, radius * 0.40, 'SE', 0),
  );

  const coverRadius = clamp(side * 0.020, 14, 24);
  coverAnchors.push(
    { x: centerX - radius * 0.28, y: centerY + radius * 0.06, size: coverRadius },
    { x: centerX + radius * 0.28, y: centerY - radius * 0.06, size: coverRadius },
  );

  return {
    playerStart,
    platforms,
    bridges,
    navZones,
    decorAnchors,
    coverAnchors,
    spawnAnchors,
    gateAnchors,
    hazardAnchors,
    hazardZones,
    safeLanes,
    pressureZones,
    phaseNodes,
    bossCenter,
    bossMoveNodes,
    core: {},
    circlePlatform: platform,
    allowOutsideSpawnAnchors: true,
    skipBiomeIdentity: true,
    biomeCircularArena: true,
  };
}

function buildNeutralIntroSceneGeometry({ templateKey = '', role = '', centerX, centerY, side, routeStyle = '', lateralOffset = 0, entrySocket = '', exitSocket = '', portalSocket = '' } = {}) {
  const tk = String(templateKey || '').toLowerCase();
  if (!tk.startsWith('neutral_intro_')) return null;

  const platforms = [];
  const bridges = [];
  const navZones = [];
  const decorAnchors = [];
  const coverAnchors = [];
  const hazardAnchors = [];
  const hazardZones = [];
  const bossMoveNodes = [];
  const safeLanes = [];
  const pressureZones = [];
  const phaseNodes = [];

  const roleRadiusMul = {
    vestibule: 0.46,
    hall: 0.472,
    split: 0.485,
    arena: 0.50,
    crown: 0.515,
  };
  const radius = clamp(side * (roleRadiusMul[role] || 0.46), 320, 560);
  const walkInset = clamp(radius * 0.050, 12, 24);
  const platform = pushCircle(platforms, navZones, `neutral_intro_${role}_disc`, centerX, centerY, radius, walkInset);
  const ringInner = Math.max(56, radius * 0.72);

  const entryPoint = circleSocketPoint(centerX, centerY, ringInner, entrySocket || 'S', 0);
  const exitPoint = circleSocketPoint(centerX, centerY, ringInner, exitSocket || portalSocket || 'N', 0);
  const portalPoint = circleSocketPoint(centerX, centerY, ringInner * 0.96, portalSocket || exitSocket || 'N', 0);

  const playerStart = {
    x: (entryPoint.x * 0.82) + centerX * 0.18,
    y: (entryPoint.y * 0.82) + centerY * 0.18,
  };
  const bossCenter = { x: centerX, y: centerY };

  const spawnOutside = radius + clamp(side * 0.085, 86, 136);
  const spawnDirs = uniqueAnchors([
    circleSocketPoint(centerX, centerY, spawnOutside, 'N', 0),
    circleSocketPoint(centerX, centerY, spawnOutside, 'E', 0),
    circleSocketPoint(centerX, centerY, spawnOutside, 'W', 0),
    circleSocketPoint(centerX, centerY, spawnOutside, 'NE', 0),
    circleSocketPoint(centerX, centerY, spawnOutside, 'NW', 0),
    circleSocketPoint(centerX, centerY, spawnOutside, 'S', 0),
  ].map((p, i) => ({ x: p.x, y: p.y, tag: `outer_${i}` })), 72);

  const gateAnchors = uniqueAnchors([
    entrySocket ? { ...circleSocketPoint(centerX, centerY, radius - 4, entrySocket, 0), side: primaryEdgeForSocket(entrySocket, 'S'), socket: entrySocket, tag: 'entry' } : null,
    exitSocket ? { ...circleSocketPoint(centerX, centerY, radius - 4, exitSocket, 0), side: primaryEdgeForSocket(exitSocket, 'N'), socket: exitSocket, tag: 'exit' } : null,
    portalSocket ? { ...circleSocketPoint(centerX, centerY, radius - 4, portalSocket, 0), side: primaryEdgeForSocket(portalSocket, 'N'), socket: portalSocket, tag: 'portal' } : null,
  ].filter(Boolean), 28);

  const orbitR = radius * 0.72;
  bossMoveNodes.push(
    { x: centerX, y: centerY },
    circleSocketPoint(centerX, centerY, orbitR, 'N', 0),
    circleSocketPoint(centerX, centerY, orbitR, 'E', 0),
    circleSocketPoint(centerX, centerY, orbitR, 'S', 0),
    circleSocketPoint(centerX, centerY, orbitR, 'W', 0),
  );
  safeLanes.push(
    { x: centerX, y: centerY, r: radius * 0.34 },
    { x: playerStart.x, y: playerStart.y, r: radius * 0.22 },
  );
  phaseNodes.push(
    circleSocketPoint(centerX, centerY, radius * 0.48, 'NE', 0),
    circleSocketPoint(centerX, centerY, radius * 0.48, 'NW', 0),
    circleSocketPoint(centerX, centerY, radius * 0.48, 'SE', 0),
  );

  // Keep neutral intro visually clean: no extra baked decor on the disc itself.

  return {
    playerStart,
    platforms,
    bridges,
    navZones,
    decorAnchors,
    coverAnchors,
    spawnAnchors: spawnDirs,
    gateAnchors,
    hazardAnchors,
    hazardZones,
    safeLanes,
    pressureZones,
    phaseNodes,
    bossCenter,
    bossMoveNodes,
    core: {},
    circlePlatform: platform,
    allowOutsideSpawnAnchors: true,
    skipBiomeIdentity: true,
  };
}

function buildRoleGeometry({ role, theme, centerX, centerY, side, routeStyle = '', lateralOffset = 0, entrySocket = '' } = {}) {
  if (theme?.profileId === 'neutral') {
    const grand = buildNeutralGrandGeometry({ role, centerX, centerY, side, routeStyle, lateralOffset, entrySocket });
    if (grand) return grand;
  }
  const platforms = [];
  const bridges = [];
  const navZones = [];
  const decorAnchors = [];
  const coverAnchors = [];
  const bossMoveNodes = [];
  const ruleOffset = clamp(Number(lateralOffset) || 0, -0.28, 0.28);
  const asym = side * theme.asymmetry * (routeStyle === 'diagonal' ? 1.18 : 1) + side * ruleOffset * 0.10;
  const lift = side * theme.sideLift;
  const wide = clamp(side * 0.13 * theme.connectorScale, 80, 186);
  const medium = clamp(side * 0.105 * theme.connectorScale, 70, 150);
  const thin = clamp(side * 0.084 * theme.connectorScale, 58, 126);
  const span = clamp(side * 0.12 * theme.spanScale, 64, 170);
  const big = theme.platformScale;
  const core = {};

  const pocketSide = ((Math.round(centerX + centerY) + (routeStyle === 'diagonal' ? 1 : 0)) & 1) === 0 ? -1 : 1;
  const diagBias = routeStyle === 'diagonal' ? side * 0.04 : 0;

  if (role === 'vestibule') {
    core.entry = pushPart(platforms, navZones, 'vest_entry', centerX + asym * 0.12, centerY + side * 0.24, side * 0.20 * big, side * 0.12, 12);
    core.mid = pushPart(platforms, navZones, 'vest_mid', centerX, centerY + side * 0.05, side * 0.30 * big, side * 0.19, 12);
    core.front = pushPart(platforms, navZones, 'vest_front', centerX - asym * 0.08, centerY - side * 0.20, side * 0.18 * big, side * 0.11, 10);
    core.flank = pushPart(platforms, navZones, 'vest_flank', centerX + pocketSide * side * 0.24, centerY + side * 0.03 + lift, side * 0.14 * big, side * 0.11, 10);
    pushConnector(bridges, navZones, 'c_entry', core.entry, core.mid, medium);
    pushConnector(bridges, navZones, 'c_front', core.mid, core.front, medium);
    pushConnector(bridges, navZones, 'c_flank', core.mid, core.flank, thin);
  } else if (role === 'hall') {
    core.left = pushPart(platforms, navZones, 'hall_left', centerX - side * 0.28 + asym * 0.24, centerY + lift, side * 0.22 * big, side * 0.16, 12);
    core.mid = pushPart(platforms, navZones, 'hall_mid', centerX, centerY + side * 0.01, side * 0.34 * big, side * 0.18, 12);
    core.right = pushPart(platforms, navZones, 'hall_right', centerX + side * 0.28 + asym * 0.24, centerY - lift, side * 0.22 * big, side * 0.16, 12);
    core.back = pushPart(platforms, navZones, 'hall_back', centerX - diagBias, centerY + side * 0.25, side * 0.18, side * 0.10, 10);
    core.front = pushPart(platforms, navZones, 'hall_front', centerX + diagBias, centerY - side * 0.23, side * 0.18, side * 0.10, 10);
    pushConnector(bridges, navZones, 'c_left', core.left, core.mid, wide);
    pushConnector(bridges, navZones, 'c_right', core.mid, core.right, wide);
    pushConnector(bridges, navZones, 'c_back', core.back, core.mid, medium);
    pushConnector(bridges, navZones, 'c_front', core.mid, core.front, medium);
  } else if (role === 'split') {
    core.center = pushPart(platforms, navZones, 'split_core', centerX + asym * 0.12, centerY + side * 0.02, side * 0.28 * big, side * 0.18, 12);
    core.north = pushPart(platforms, navZones, 'split_north', centerX - asym * 0.16, centerY - side * 0.23, side * 0.18, side * 0.11, 10);
    core.south = pushPart(platforms, navZones, 'split_south', centerX + asym * 0.20, centerY + side * 0.26, side * 0.18, side * 0.11, 10);
    core.west = pushPart(platforms, navZones, 'split_west', centerX - side * 0.24, centerY + side * 0.04 + lift, side * 0.15, side * 0.12, 10);
    core.east = pushPart(platforms, navZones, 'split_east', centerX + side * 0.24, centerY - side * 0.02 - lift, side * 0.15, side * 0.12, 10);
    pushConnector(bridges, navZones, 'c_north', core.center, core.north, medium);
    pushConnector(bridges, navZones, 'c_south', core.south, core.center, medium);
    pushConnector(bridges, navZones, 'c_west', core.west, core.center, thin);
    pushConnector(bridges, navZones, 'c_east', core.center, core.east, thin);
  } else if (role === 'pocket' || role === 'shrine') {
    core.entry = pushPart(platforms, navZones, 'pocket_entry', centerX - diagBias * 0.5, centerY + side * 0.24, side * 0.18, side * 0.10, 10);
    core.lane = pushPart(platforms, navZones, 'pocket_lane', centerX, centerY + side * 0.03, side * 0.30 * big, side * 0.18, 12);
    core.front = pushPart(platforms, navZones, 'pocket_front', centerX + asym * 0.20, centerY - side * 0.22, side * 0.16, side * 0.10, 10);
    core.pocket = pushPart(platforms, navZones, role === 'shrine' ? 'shrine_alcove' : 'side_alcove', centerX + pocketSide * side * 0.28, centerY - side * 0.02 + lift, side * 0.18 * big, side * (role === 'shrine' ? 0.13 : 0.11), 10);
    pushConnector(bridges, navZones, 'c_entry', core.entry, core.lane, medium);
    pushConnector(bridges, navZones, 'c_front', core.lane, core.front, medium);
    pushConnector(bridges, navZones, 'c_pocket', core.lane, core.pocket, thin * (role === 'shrine' ? 1.05 : 0.9));
  } else if (role === 'ring') {
    const rx = side * 0.25;
    const ry = side * 0.20;
    core.nw = pushPart(platforms, navZones, 'ring_nw', centerX - rx + asym * 0.08, centerY - ry + lift, side * 0.17, side * 0.12, 10);
    core.ne = pushPart(platforms, navZones, 'ring_ne', centerX + rx + asym * 0.08, centerY - ry - lift, side * 0.17, side * 0.12, 10);
    core.se = pushPart(platforms, navZones, 'ring_se', centerX + rx - asym * 0.08, centerY + ry - lift, side * 0.17, side * 0.12, 10);
    core.sw = pushPart(platforms, navZones, 'ring_sw', centerX - rx - asym * 0.08, centerY + ry + lift, side * 0.17, side * 0.12, 10);
    core.inner = pushPart(platforms, navZones, 'ring_inner', centerX + asym * 0.06, centerY + side * 0.01, side * 0.16, side * 0.11, 10);
    pushConnector(bridges, navZones, 'c_top', core.nw, core.ne, span);
    pushConnector(bridges, navZones, 'c_right', core.ne, core.se, span);
    pushConnector(bridges, navZones, 'c_bottom', core.sw, core.se, span);
    pushConnector(bridges, navZones, 'c_left', core.nw, core.sw, span);
    pushConnector(bridges, navZones, 'c_inner_nw', core.nw, core.inner, thin);
    pushConnector(bridges, navZones, 'c_inner_se', core.inner, core.se, thin);
  } else if (role === 'arena') {
    core.center = pushPart(platforms, navZones, 'arena_core', centerX, centerY + side * 0.02, side * 0.40 * big, side * 0.24, 14);
    core.north = pushPart(platforms, navZones, 'arena_north', centerX - asym * 0.18, centerY - side * 0.24, side * 0.18, side * 0.11, 10);
    core.south = pushPart(platforms, navZones, 'arena_south', centerX + asym * 0.16, centerY + side * 0.28, side * 0.20, side * 0.11, 10);
    core.west = pushPart(platforms, navZones, 'arena_west', centerX - side * 0.30, centerY + side * 0.03 + lift, side * 0.16, side * 0.12, 10);
    core.east = pushPart(platforms, navZones, 'arena_east', centerX + side * 0.30, centerY - side * 0.01 - lift, side * 0.16, side * 0.12, 10);
    pushConnector(bridges, navZones, 'c_north', core.center, core.north, wide);
    pushConnector(bridges, navZones, 'c_south', core.south, core.center, wide);
    pushConnector(bridges, navZones, 'c_west', core.west, core.center, medium);
    pushConnector(bridges, navZones, 'c_east', core.center, core.east, medium);
  } else if (role === 'bridge') {
    core.back = pushPart(platforms, navZones, 'bridge_back', centerX - side * 0.22 - asym * 0.20, centerY + side * 0.14, side * 0.18, side * 0.12, 10);
    core.span = pushPart(platforms, navZones, 'bridge_span_mid', centerX, centerY + side * 0.02, side * 0.16, side * 0.10, 10);
    core.front = pushPart(platforms, navZones, 'bridge_front', centerX + side * 0.24 + asym * 0.12, centerY - side * 0.12, side * 0.18, side * 0.12, 10);
    core.pocket = pushPart(platforms, navZones, 'bridge_pocket', centerX + pocketSide * side * 0.10, centerY - side * 0.20, side * 0.12, side * 0.09, 10);
    pushConnector(bridges, navZones, 'c_back', core.back, core.span, span * 0.84);
    pushConnector(bridges, navZones, 'c_front', core.span, core.front, span * 0.84);
    pushConnector(bridges, navZones, 'c_pocket', core.span, core.pocket, thin * 0.84);
  } else if (role === 'crucible') {
    core.center = pushPart(platforms, navZones, 'crucible_core', centerX + asym * 0.10, centerY + side * 0.02, side * 0.26, side * 0.17, 12);
    core.north = pushPart(platforms, navZones, 'crucible_north', centerX - asym * 0.18, centerY - side * 0.21, side * 0.16, side * 0.10, 10);
    core.south = pushPart(platforms, navZones, 'crucible_south', centerX + asym * 0.18, centerY + side * 0.24, side * 0.16, side * 0.10, 10);
    core.west = pushPart(platforms, navZones, 'crucible_west', centerX - side * 0.21, centerY + side * 0.05 + lift, side * 0.12, side * 0.10, 10);
    core.east = pushPart(platforms, navZones, 'crucible_east', centerX + side * 0.21, centerY - side * 0.01 - lift, side * 0.12, side * 0.10, 10);
    pushConnector(bridges, navZones, 'c_north', core.center, core.north, thin);
    pushConnector(bridges, navZones, 'c_south', core.south, core.center, thin);
    pushConnector(bridges, navZones, 'c_west', core.west, core.center, thin * 0.8);
    pushConnector(bridges, navZones, 'c_east', core.center, core.east, thin * 0.8);
  } else if (role === 'crown') {
    core.dais = pushPart(platforms, navZones, 'crown_dais', centerX, centerY - side * 0.01, side * 0.26, side * 0.18, 12);
    core.top = pushPart(platforms, navZones, 'crown_top', centerX, centerY - side * 0.27, side * 0.20, side * 0.11, 10);
    core.left = pushPart(platforms, navZones, 'crown_left', centerX - side * 0.31 + asym * 0.18, centerY + lift, side * 0.17, side * 0.12, 10);
    core.right = pushPart(platforms, navZones, 'crown_right', centerX + side * 0.31 + asym * 0.08, centerY - lift, side * 0.17, side * 0.12, 10);
    core.bottom = pushPart(platforms, navZones, 'crown_bottom', centerX, centerY + side * 0.29, side * 0.22, side * 0.12, 10);
    core.haloNW = pushPart(platforms, navZones, 'crown_halo_nw', centerX - side * 0.18, centerY - side * 0.14, side * 0.12, side * 0.08, 10);
    core.haloNE = pushPart(platforms, navZones, 'crown_halo_ne', centerX + side * 0.18, centerY - side * 0.14, side * 0.12, side * 0.08, 10);
    core.haloSW = pushPart(platforms, navZones, 'crown_halo_sw', centerX - side * 0.18, centerY + side * 0.13, side * 0.12, side * 0.08, 10);
    core.haloSE = pushPart(platforms, navZones, 'crown_halo_se', centerX + side * 0.18, centerY + side * 0.13, side * 0.12, side * 0.08, 10);
    pushConnector(bridges, navZones, 'c_top', core.dais, core.top, medium);
    pushConnector(bridges, navZones, 'c_bottom', core.bottom, core.dais, medium);
    pushConnector(bridges, navZones, 'c_left', core.left, core.dais, medium);
    pushConnector(bridges, navZones, 'c_right', core.dais, core.right, medium);
    pushConnector(bridges, navZones, 'c_halo_top', core.haloNW, core.haloNE, span * 0.90);
    pushConnector(bridges, navZones, 'c_halo_bottom', core.haloSW, core.haloSE, span * 0.90);
    pushConnector(bridges, navZones, 'c_halo_left', core.haloNW, core.haloSW, span * 0.78);
    pushConnector(bridges, navZones, 'c_halo_right', core.haloNE, core.haloSE, span * 0.78);
    pushConnector(bridges, navZones, 'c_spoke_nw', core.haloNW, core.dais, thin);
    pushConnector(bridges, navZones, 'c_spoke_se', core.dais, core.haloSE, thin);
  } else {
    return null;
  }

  const partsBounds = boundsFromRects([...(platforms || []), ...(bridges || [])]);
  const walkRects = buildWalkRectsFromNavZones(navZones, { seamGap: 14, seamMinOverlap: 18, touchThickness: 10 });
  const playerStart = insideBias(partsBounds, centerX, centerY, entrySocket || 'S', side * 0.14, walkRects);

  return {
    playerStart,
    platforms,
    bridges,
    navZones,
    decorAnchors,
    coverAnchors,
    spawnAnchors: [],
    hazardAnchors: [],
    hazardZones: [],
    bossMoveNodes,
    safeLanes: [],
    pressureZones: [],
    phaseNodes: [],
    bossCenter: centerOf(core.dais || core.center || core.mid || core.lane || core.inner || core.span || core.front || core.top || core.north || core.entry || Object.values(core).find(Boolean)),
    core,
  };
}

function applyBiomeGeometrySignature({ biome, role, theme, built, centerX, centerY, side, routeStyle }) {
  const { platforms, bridges, navZones, core } = built;
  const thin = clamp(side * 0.072 * theme.connectorScale, 52, 112);
  const medium = clamp(side * 0.098 * theme.connectorScale, 66, 138);
  const span = clamp(side * 0.11 * theme.spanScale, 62, 160);
  const diagonal = routeStyle === 'diagonal';
  const sign = ((Math.round(centerX - centerY) + (diagonal ? 1 : 0)) & 1) === 0 ? -1 : 1;

  if (biome === 'neutral') {
    const hub = firstCore(core, 'mid', 'center', 'lane', 'span', 'dais', 'inner', 'front');
    const top = firstCore(core, 'top', 'front', 'north', 'dais', 'mid', 'center');
    const back = firstCore(core, 'bottom', 'back', 'south', 'entry', 'span', 'mid', 'center');
    if (hub) {
      const service = pushPart(platforms, navZones, `neutral_service_${role}`,
        centerX + sign * side * (role === 'crown' ? 0.34 : 0.30),
        centerY - side * 0.04,
        side * 0.13,
        side * 0.10,
        10,
      );
      pushConnector(bridges, navZones, `neutral_service_link_${role}`, hub, service, medium * 0.78);

      const leftShoulder = pushPart(platforms, navZones, `neutral_shoulder_l_${role}`, centerX - side * 0.16, centerY - side * 0.02, side * 0.11, side * 0.09, 10);
      const rightShoulder = pushPart(platforms, navZones, `neutral_shoulder_r_${role}`, centerX + side * 0.16, centerY - side * 0.02, side * 0.11, side * 0.09, 10);
      pushConnector(bridges, navZones, `neutral_shoulder_link_l_${role}`, leftShoulder, hub, thin * 0.88);
      pushConnector(bridges, navZones, `neutral_shoulder_link_r_${role}`, hub, rightShoulder, thin * 0.88);

      if (role === 'vestibule' || role === 'split' || role === 'hall') {
        const overlook = pushPart(platforms, navZones, `neutral_overlook_${role}`, centerX, centerY - side * 0.30, side * 0.14, side * 0.08, 10);
        pushConnector(bridges, navZones, `neutral_overlook_link_${role}`, top || hub, overlook, thin * 0.84);
      }
      if (role === 'vestibule') {
        const dock = pushPart(platforms, navZones, `neutral_dock_${role}`, centerX - sign * side * 0.26, centerY + side * 0.10, side * 0.15, side * 0.10, 10);
        const concourse = pushPart(platforms, navZones, `neutral_concourse_${role}`, centerX, centerY + side * 0.28, side * 0.18, side * 0.09, 10);
        pushConnector(bridges, navZones, `neutral_dock_link_${role}`, hub, dock, thin * 0.82);
        pushConnector(bridges, navZones, `neutral_concourse_link_${role}`, back || hub, concourse, medium * 0.78);
      }
      if (role === 'hall' || role === 'arena' || role === 'crown') {
        const balL = pushPart(platforms, navZones, `neutral_balcony_l_${role}`, centerX - side * 0.18, centerY - side * 0.28, side * 0.13, side * 0.09, 10);
        const balR = pushPart(platforms, navZones, `neutral_balcony_r_${role}`, centerX + side * 0.18, centerY - side * 0.28, side * 0.13, side * 0.09, 10);
        pushConnector(bridges, navZones, `neutral_balcony_link_l_${role}`, balL, top || hub, thin * 0.92);
        pushConnector(bridges, navZones, `neutral_balcony_link_r_${role}`, top || hub, balR, thin * 0.92);
      }
      if (role === 'arena' || role === 'crown') {
        const ringNW = pushPart(platforms, navZones, `neutral_ring_nw_${role}`, centerX - side * 0.17, centerY - side * 0.16, side * 0.11, side * 0.08, 10);
        const ringNE = pushPart(platforms, navZones, `neutral_ring_ne_${role}`, centerX + side * 0.17, centerY - side * 0.16, side * 0.11, side * 0.08, 10);
        const ringSW = pushPart(platforms, navZones, `neutral_ring_sw_${role}`, centerX - side * 0.17, centerY + side * 0.16, side * 0.11, side * 0.08, 10);
        const ringSE = pushPart(platforms, navZones, `neutral_ring_se_${role}`, centerX + side * 0.17, centerY + side * 0.16, side * 0.11, side * 0.08, 10);
        pushConnector(bridges, navZones, `neutral_ring_link_top_${role}`, ringNW, ringNE, span * 0.54);
        pushConnector(bridges, navZones, `neutral_ring_link_bottom_${role}`, ringSW, ringSE, span * 0.54);
        pushConnector(bridges, navZones, `neutral_ring_link_left_${role}`, ringNW, ringSW, thin * 0.76);
        pushConnector(bridges, navZones, `neutral_ring_link_right_${role}`, ringNE, ringSE, thin * 0.76);
      }
      if (role === 'bridge') {
        const railL = pushPart(platforms, navZones, `neutral_bridge_rail_l_${role}`, centerX - side * 0.12, centerY - side * 0.18, side * 0.11, side * 0.07, 10);
        const railR = pushPart(platforms, navZones, `neutral_bridge_rail_r_${role}`, centerX + side * 0.12, centerY - side * 0.18, side * 0.11, side * 0.07, 10);
        pushConnector(bridges, navZones, `neutral_bridge_rail_link_l_${role}`, hub, railL, thin * 0.72);
        pushConnector(bridges, navZones, `neutral_bridge_rail_link_r_${role}`, hub, railR, thin * 0.72);
      }
    }
  } else if (biome === 'electric') {
    const live = firstCore(core, 'span', 'inner', 'mid', 'center', 'dais', 'front');
    if (live) {
      const petalA = pushPart(platforms, navZones, `electric_petal_a_${role}`, centerX - side * 0.20, centerY - side * 0.24, side * 0.11, side * 0.08, 10);
      const petalB = pushPart(platforms, navZones, `electric_petal_b_${role}`, centerX + side * 0.22, centerY + side * 0.16, side * 0.11, side * 0.08, 10);
      pushConnector(bridges, navZones, `electric_petal_link_a_${role}`, live, petalA, thin * 0.78);
      pushConnector(bridges, navZones, `electric_petal_link_b_${role}`, live, petalB, thin * 0.78);
      if (role === 'ring' || role === 'crown' || role === 'arena') {
        const eye = pushPart(platforms, navZones, `electric_eye_${role}`, centerX + sign * side * 0.28, centerY - side * 0.02, side * 0.12, side * 0.08, 10);
        pushConnector(bridges, navZones, `electric_eye_link_${role}`, live, eye, span * 0.60);
      }
    }
  } else if (biome === 'fire') {
    const hot = firstCore(core, 'center', 'mid', 'dais', 'lane', 'span');
    if (hot) {
      const terraceL = pushPart(platforms, navZones, `fire_terrace_l_${role}`, centerX - side * 0.24, centerY + side * 0.20, side * 0.15, side * 0.10, 10);
      const terraceR = pushPart(platforms, navZones, `fire_terrace_r_${role}`, centerX + side * 0.24, centerY + side * 0.08, side * 0.15, side * 0.10, 10);
      pushConnector(bridges, navZones, `fire_terrace_link_l_${role}`, hot, terraceL, medium * 0.84);
      pushConnector(bridges, navZones, `fire_terrace_link_r_${role}`, hot, terraceR, medium * 0.84);
      if (role === 'crown' || role === 'arena' || role === 'crucible') {
        const dais = pushPart(platforms, navZones, `fire_throne_step_${role}`, centerX, centerY - side * 0.30, side * 0.16, side * 0.09, 10);
        pushConnector(bridges, navZones, `fire_throne_link_${role}`, hot, dais, thin * 0.92);
      }
    }
  } else if (biome === 'ice') {
    const open = firstCore(core, 'front', 'north', 'dais', 'center', 'mid', 'span');
    if (open) {
      const wingL = pushPart(platforms, navZones, `ice_wing_l_${role}`, centerX - side * 0.26, centerY - side * 0.18, side * 0.16, side * 0.09, 10);
      const wingR = pushPart(platforms, navZones, `ice_wing_r_${role}`, centerX + side * 0.26, centerY - side * 0.18, side * 0.16, side * 0.09, 10);
      pushConnector(bridges, navZones, `ice_wing_link_l_${role}`, open, wingL, span * 0.72);
      pushConnector(bridges, navZones, `ice_wing_link_r_${role}`, open, wingR, span * 0.72);
      if (role === 'ring' || role === 'bridge' || role === 'crown') {
        const arc = pushPart(platforms, navZones, `ice_arc_${role}`, centerX, centerY + side * 0.26, side * 0.18, side * 0.08, 10);
        const back = firstCore(core, 'bottom', 'back', 'south', 'entry', 'span', 'mid');
        pushConnector(bridges, navZones, `ice_arc_link_${role}`, back || open, arc, span * 0.64);
      }
    }
  } else if (biome === 'dark') {
    const broken = firstCore(core, 'center', 'mid', 'dais', 'lane', 'span', 'inner');
    if (broken) {
      const flankA = pushPart(platforms, navZones, `dark_flank_a_${role}`, centerX - side * 0.32, centerY - side * 0.08, side * 0.14, side * 0.09, 10);
      const flankB = pushPart(platforms, navZones, `dark_flank_b_${role}`, centerX + side * 0.28, centerY + side * 0.18, side * 0.12, side * 0.08, 10);
      pushConnector(bridges, navZones, `dark_flank_link_a_${role}`, broken, flankA, thin * 0.70, 6, -side * 0.03);
      pushConnector(bridges, navZones, `dark_flank_link_b_${role}`, broken, flankB, thin * 0.64, 6, side * 0.04);
      if (role === 'ring' || role === 'split' || role === 'crown') {
        const pocket = pushPart(platforms, navZones, `dark_pocket_${role}`, centerX + sign * side * 0.12, centerY - side * 0.28, side * 0.10, side * 0.07, 10);
        pushConnector(bridges, navZones, `dark_pocket_link_${role}`, broken, pocket, thin * 0.58, 6, sign * side * 0.05);
      }
    }
  } else if (biome === 'light') {
    const sanctum = firstCore(core, 'dais', 'center', 'mid', 'inner', 'lane', 'span');
    if (sanctum) {
      const nodeN = pushPart(platforms, navZones, `light_node_n_${role}`, centerX, centerY - side * 0.28, side * 0.12, side * 0.08, 10);
      const nodeE = pushPart(platforms, navZones, `light_node_e_${role}`, centerX + side * 0.26, centerY, side * 0.12, side * 0.08, 10);
      const nodeW = pushPart(platforms, navZones, `light_node_w_${role}`, centerX - side * 0.26, centerY, side * 0.12, side * 0.08, 10);
      pushConnector(bridges, navZones, `light_node_link_n_${role}`, sanctum, nodeN, medium * 0.86);
      pushConnector(bridges, navZones, `light_node_link_e_${role}`, sanctum, nodeE, medium * 0.86);
      pushConnector(bridges, navZones, `light_node_link_w_${role}`, sanctum, nodeW, medium * 0.86);
      if (role === 'crown' || role === 'ring' || role === 'arena') {
        const halo = pushPart(platforms, navZones, `light_halo_${role}`, centerX, centerY + side * 0.28, side * 0.18, side * 0.08, 10);
        pushConnector(bridges, navZones, `light_halo_link_${role}`, sanctum, halo, span * 0.68);
      }
    }
  }
}

function applyBiomeIdentity({ biome, role, theme, built, centerX, centerY, side }) {
  applyBiomeGeometrySignature({ biome, role, theme, built, centerX, centerY, side, routeStyle: built.routeStyle || '' });

  const anchorPool = uniqueAnchors(Object.values(built.core || {}).filter(Boolean).map((r) => ({ ...centerOf(r), tag: r.id })), 52);
  const bossCenter = built.bossCenter || { x: centerX, y: centerY };
  const playerStart = built.playerStart || { x: centerX, y: centerY + side * 0.12 };
  const hazardRadius = clamp(side * (role === 'crown' ? 0.058 : role === 'arena' ? 0.056 : role === 'bridge' ? 0.044 : 0.050), 32, 90);
  const farFromEntry = anchorPool.filter((p) => {
    const dx = Number(p.x) - Number(playerStart.x);
    const dy = Number(p.y) - Number(playerStart.y);
    return dx * dx + dy * dy > Math.pow(Math.max(110, hazardRadius * 1.8), 2);
  });
  const pool = farFromEntry.length ? farFromEntry : anchorPool;
  const hazardCount = role === 'crown' ? 4 : role === 'arena' ? 3 : role === 'ring' ? 3 : role === 'crucible' ? 3 : 2;

  for (let i = 0; i < Math.min(hazardCount, pool.length); i++) {
    const p = pool[i];
    addCircleHazard(
      built.hazardZones,
      p,
      theme.hazardKinds[i % theme.hazardKinds.length],
      hazardRadius * (biome === 'fire' ? 1.06 : biome === 'electric' ? 0.94 : biome === 'ice' ? 1.04 : 1),
      6.0 + i * 0.7,
      0.95 + (biome === 'fire' ? 0.18 : biome === 'light' ? 0.10 : biome === 'dark' ? 0.08 : 0),
      0.08 + (role === 'crucible' ? 0.06 : role === 'crown' ? 0.05 : role === 'arena' ? 0.04 : 0.03) + (biome === 'electric' ? 0.04 : biome === 'fire' ? 0.04 : 0),
    );
  }

  built.hazardAnchors.push(...built.hazardZones.map((z) => ({ x: z.x, y: z.y, kind: z.type, r: z.r })));

  const safeBase = [
    { x: playerStart.x, y: playerStart.y, r: clamp(side * 0.06, 46, 90) },
    { x: bossCenter.x, y: bossCenter.y, r: clamp(side * (role === 'crown' ? 0.082 : 0.070), 54, 108) },
  ];

  if (biome === 'neutral') {
    safeBase.push({ x: centerX, y: centerY - side * 0.22, r: clamp(side * 0.060, 48, 94) });
    built.pressureZones.push(...built.hazardZones.map((z) => ({ x: z.x, y: z.y, r: z.r * 1.06 })));
    built.phaseNodes.push(...uniqueAnchors([{ x: centerX - side * 0.22, y: centerY }, { x: centerX + side * 0.22, y: centerY }], 52));
    addDecor(built.decorAnchors, { x: centerX, y: centerY - side * 0.26 }, 'garden_pod', clamp(side * 0.026, 18, 32));
    addDecor(built.decorAnchors, { x: centerX + side * 0.28, y: centerY + side * 0.02 }, 'gravity_well', clamp(side * 0.024, 18, 30));
    addDecor(built.decorAnchors, bossCenter, 'reactor', clamp(side * 0.028, 18, 34));
    addDecor(built.decorAnchors, { x: centerX - side * 0.30, y: centerY + side * 0.10 }, 'dock', clamp(side * 0.022, 16, 30));
    addDecor(built.decorAnchors, { x: centerX, y: centerY - side * 0.30 }, 'hologrid_pylon', clamp(side * 0.022, 16, 28));
    addDecor(built.decorAnchors, { x: centerX - side * 0.22, y: centerY - side * 0.14 }, 'observation_deck', clamp(side * 0.022, 16, 28));
    addDecor(built.decorAnchors, { x: centerX + side * 0.24, y: centerY - side * 0.08 }, 'relay_balcony', clamp(side * 0.022, 16, 28));
    addDecor(built.decorAnchors, { x: centerX, y: centerY + side * 0.22 }, 'transit_rail', clamp(side * 0.022, 16, 28));
  } else if (biome === 'electric') {
    safeBase[0].r *= 0.88;
    safeBase[1].r *= 0.92;
    safeBase.push({ x: centerX - side * 0.20, y: centerY - side * 0.18, r: clamp(side * 0.048, 40, 74) });
    built.pressureZones.push(...built.hazardZones.map((z) => ({ x: z.x, y: z.y, r: z.r * 1.14 })));
    built.phaseNodes.push(...uniqueAnchors([{ x: centerX + side * 0.20, y: centerY + side * 0.18 }, { x: centerX - side * 0.18, y: centerY + side * 0.12 }], 52));
    addDecor(built.decorAnchors, bossCenter, 'storm_prism', clamp(side * 0.026, 18, 32));
    addDecor(built.decorAnchors, { x: centerX - side * 0.30, y: centerY - side * 0.04 }, 'lightning_rod', clamp(side * 0.024, 16, 30));
    addDecor(built.decorAnchors, { x: centerX + side * 0.30, y: centerY + side * 0.08 }, 'capacitor_petal', clamp(side * 0.024, 16, 30));
  } else if (biome === 'fire') {
    safeBase[0].r *= 0.90;
    safeBase[1].r *= 0.84;
    safeBase.push({ x: centerX - side * 0.18, y: centerY + side * 0.18, r: clamp(side * 0.046, 38, 70) });
    built.pressureZones.push(...built.hazardZones.map((z) => ({ x: z.x, y: z.y, r: z.r * 1.18 })));
    built.phaseNodes.push(...uniqueAnchors([{ x: centerX - side * 0.22, y: centerY - side * 0.04 }, { x: centerX + side * 0.22, y: centerY + side * 0.14 }], 50));
    addDecor(built.decorAnchors, bossCenter, 'altar', clamp(side * 0.028, 18, 34));
    addDecor(built.decorAnchors, { x: centerX - side * 0.26, y: centerY + side * 0.16 }, 'ember_brazier', clamp(side * 0.024, 16, 30));
    addDecor(built.decorAnchors, { x: centerX + side * 0.26, y: centerY - side * 0.02 }, 'obsidian_rib', clamp(side * 0.024, 16, 30));
  } else if (biome === 'ice') {
    safeBase[0].r *= 0.96;
    safeBase[1].r *= 0.90;
    safeBase.push({ x: centerX + side * 0.22, y: centerY - side * 0.18, r: clamp(side * 0.050, 42, 80) });
    built.pressureZones.push(...built.hazardZones.map((z) => ({ x: z.x, y: z.y, r: z.r * 1.08 })));
    built.phaseNodes.push(...uniqueAnchors([{ x: centerX - side * 0.28, y: centerY - side * 0.14 }, { x: centerX + side * 0.28, y: centerY - side * 0.14 }], 54));
    addDecor(built.decorAnchors, bossCenter, 'crystal_rib', clamp(side * 0.028, 18, 34));
    addDecor(built.decorAnchors, { x: centerX - side * 0.28, y: centerY - side * 0.16 }, 'frost_mirror', clamp(side * 0.024, 16, 30));
    addDecor(built.decorAnchors, { x: centerX + side * 0.28, y: centerY - side * 0.16 }, 'aurora_node', clamp(side * 0.024, 16, 30));
  } else if (biome === 'dark') {
    safeBase[0].r *= 0.86;
    safeBase[1].r *= 0.82;
    safeBase.push({ x: centerX + side * 0.12, y: centerY - side * 0.22, r: clamp(side * 0.042, 34, 66) });
    built.pressureZones.push(...built.hazardZones.map((z) => ({ x: z.x, y: z.y, r: z.r * 1.12 })));
    built.pressureZones.push({ x: centerX - side * 0.24, y: centerY + side * 0.04, r: clamp(side * 0.050, 42, 76) });
    built.phaseNodes.push(...uniqueAnchors([{ x: centerX - side * 0.22, y: centerY - side * 0.12 }, { x: centerX + side * 0.24, y: centerY + side * 0.20 }], 50));
    addDecor(built.decorAnchors, bossCenter, 'void_obelisk', clamp(side * 0.028, 18, 34));
    addDecor(built.decorAnchors, { x: centerX - side * 0.24, y: centerY - side * 0.12 }, 'shadow_spire', clamp(side * 0.024, 16, 30));
    addDecor(built.decorAnchors, { x: centerX + side * 0.24, y: centerY + side * 0.18 }, 'rift', clamp(side * 0.024, 16, 30));
  } else if (biome === 'light') {
    safeBase[0].r *= 1.02;
    safeBase[1].r *= 0.96;
    safeBase.push({ x: centerX - side * 0.22, y: centerY, r: clamp(side * 0.052, 42, 82) });
    safeBase.push({ x: centerX + side * 0.22, y: centerY, r: clamp(side * 0.052, 42, 82) });
    built.pressureZones.push(...built.hazardZones.map((z) => ({ x: z.x, y: z.y, r: z.r * 1.06 })));
    built.phaseNodes.push(...uniqueAnchors([{ x: centerX, y: centerY - side * 0.24 }, { x: centerX, y: centerY + side * 0.24 }], 52));
    addDecor(built.decorAnchors, bossCenter, 'sun_dais', clamp(side * 0.028, 18, 34));
    addDecor(built.decorAnchors, { x: centerX, y: centerY - side * 0.24 }, 'radiant_pylon', clamp(side * 0.024, 16, 30));
    addDecor(built.decorAnchors, { x: centerX - side * 0.22, y: centerY }, 'prism', clamp(side * 0.024, 16, 30));
    addDecor(built.decorAnchors, { x: centerX + side * 0.22, y: centerY }, 'sun_lens', clamp(side * 0.024, 16, 30));
  }

  built.safeLanes.push(...uniqueAnchors(safeBase, 54));

  const spawnPool = anchorPool.filter((p) => {
    const dx = Number(p.x) - Number(playerStart.x);
    const dy = Number(p.y) - Number(playerStart.y);
    return dx * dx + dy * dy > 140 * 140;
  });
  built.spawnAnchors.push(...uniqueAnchors((spawnPool.length ? spawnPool : anchorPool).slice(0, role === 'crown' ? 6 : 5).map((p, i) => ({ x: p.x, y: p.y, tag: p.tag || `anchor_${i}` })), 58));

  const coverPool = [
    { x: centerX - side * 0.08, y: centerY + side * 0.03, size: clamp(side * 0.024, 15, 30) },
    { x: centerX + side * 0.08, y: centerY - side * 0.02, size: clamp(side * 0.024, 15, 30) },
    biome === 'ice' ? { x: centerX, y: centerY + side * 0.18, size: clamp(side * 0.018, 14, 22) } : null,
    biome === 'dark' ? { x: centerX - side * 0.16, y: centerY - side * 0.10, size: clamp(side * 0.020, 14, 24) } : null,
    biome === 'light' ? { x: centerX + side * 0.16, y: centerY - side * 0.10, size: clamp(side * 0.020, 14, 24) } : null,
  ].filter(Boolean);
  built.coverAnchors.push(...uniqueAnchors(coverPool, 30));

  built.bossMoveNodes.push(...uniqueAnchors([
    bossCenter,
    ...anchorPool.slice(0, role === 'crown' ? 8 : 6).map((p) => ({ x: p.x, y: p.y })),
    ...built.safeLanes.map((p) => ({ x: p.x, y: p.y })),
  ], 44));
}


function makeArtPart(id, x, y, w, h, style = 'panel', layer = 'over') {
  return { id, type: 'rect', x, y, w, h, style, layer };
}

function addArtPart(list, id, x, y, w, h, style = 'panel', layer = 'over') {
  if (!(w > 0 && h > 0)) return null;
  const part = makeArtPart(id, x, y, w, h, style, layer);
  list.push(part);
  return part;
}

function buildStationArtParts({ biome, role, built, side, isNeutralIntro = false }) {
  const art = [];
  const core = built?.core || {};
  const micro = clamp(side * 0.030, 14, 26);
  const mini = clamp(side * 0.046, 18, 36);
  const rail = clamp(side * 0.010, 4, 8);
  const addLaneMods = (base, prefix, axis = 'x') => {
    if (!base) return;
    if (axis === 'x') {
      addArtPart(art, `${prefix}_rail_top`, base.x + 10, base.y - rail * 0.5, Math.max(10, base.w - 20), rail, 'rail', 'over');
      addArtPart(art, `${prefix}_rail_bot`, base.x + 10, base.y + base.h - rail * 0.5, Math.max(10, base.w - 20), rail, 'rail', 'over');
      addArtPart(art, `${prefix}_pod_l`, base.x + base.w * 0.16, base.y - micro * 0.84, mini, micro * 0.62, 'pod', 'over');
      addArtPart(art, `${prefix}_pod_r`, base.x + base.w * 0.62, base.y + base.h + micro * 0.16, mini * 0.92, micro * 0.58, 'pod', 'over');
      addArtPart(art, `${prefix}_under`, base.x + base.w * 0.18, base.y + base.h + micro * 0.40, base.w * 0.64, micro * 0.72, 'undercroft', 'under');
    } else {
      addArtPart(art, `${prefix}_rail_left`, base.x - rail * 0.5, base.y + 10, rail, Math.max(10, base.h - 20), 'rail', 'over');
      addArtPart(art, `${prefix}_rail_right`, base.x + base.w - rail * 0.5, base.y + 10, rail, Math.max(10, base.h - 20), 'rail', 'over');
      addArtPart(art, `${prefix}_pod_t`, base.x - micro * 0.82, base.y + base.h * 0.16, micro * 0.58, mini, 'pod', 'over');
      addArtPart(art, `${prefix}_pod_b`, base.x + base.w + micro * 0.16, base.y + base.h * 0.58, micro * 0.58, mini * 0.92, 'pod', 'over');
      addArtPart(art, `${prefix}_under`, base.x + base.w + micro * 0.36, base.y + base.h * 0.18, micro * 0.52, base.h * 0.46, 'undercroft', 'under');
    }
  };
  const addCoreMods = (base, prefix) => {
    if (!base) return;
    addArtPart(art, `${prefix}_halo_n`, base.x + base.w * 0.34, base.y - micro * 0.90, base.w * 0.32, micro * 0.66, 'fin', 'over');
    addArtPart(art, `${prefix}_halo_s`, base.x + base.w * 0.34, base.y + base.h + micro * 0.18, base.w * 0.32, micro * 0.66, 'fin', 'over');
    addArtPart(art, `${prefix}_halo_w`, base.x - micro * 0.84, base.y + base.h * 0.34, micro * 0.58, base.h * 0.30, 'fin', 'over');
    addArtPart(art, `${prefix}_halo_e`, base.x + base.w + micro * 0.16, base.y + base.h * 0.34, micro * 0.58, base.h * 0.30, 'fin', 'over');
    addArtPart(art, `${prefix}_under`, base.x + base.w * 0.24, base.y + base.h + micro * 0.46, base.w * 0.52, micro * 0.82, 'undercroft', 'under');
  };

  for (const [key, base] of Object.entries(core)) {
    if (!base || !Number.isFinite(base.x) || !Number.isFinite(base.y)) continue;
    const lower = String(key).toLowerCase();
    const axis = base.w >= base.h ? 'x' : 'y';
    if (/gallery|spine|lane|proc|entry|exit|transit|gate|tail/.test(lower)) addLaneMods(base, lower, axis);
    if (/rotunda|center|core|dais|crown|arena|split/.test(lower)) addCoreMods(base, lower);
    if (/deck|bal|service|sidebay|over|halo/.test(lower)) addLaneMods(base, lower, axis);
  }

  if (isNeutralIntro) {
    return art;
  }
  return art;
}

export function generateRoleRoomArena({ biomeKey = '', templateKey = '', templateRole = '', roomIndex = 0, centerX = 0, centerY = 0, side = 1200, profile = null, entrySocket = '', exitSocket = '', portalSocket = '', routeStyle = '', lateralOffset = 0 } = {}) {
  const tk = String(templateKey || '').toLowerCase();
  if ((roomIndex | 0) <= 0 || tk === 'hub') return null;
  const role = resolveRole(tk, templateRole);
  if (!role) return null;
  const biome = String(biomeKey || '').toLowerCase() || 'neutral';
  const theme = THEME[biome] || THEME.neutral;
  const isNeutralIntro = tk.startsWith('neutral_intro_');
  const roomSide = isNeutralIntro ? side * (role === 'arena' || role === 'crown' ? 1.12 : 1.08) : side;
  const built = buildBiomeCircleArenaGeometry({ biome, role, centerX, centerY, side: roomSide, entrySocket, exitSocket, portalSocket }) || buildNeutralIntroSceneGeometry({ templateKey: tk, role, centerX, centerY, side: roomSide, routeStyle, lateralOffset, entrySocket, exitSocket, portalSocket }) || buildRoleGeometry({ role, theme, centerX, centerY, side: roomSide, routeStyle, lateralOffset, entrySocket, exitSocket });
  if (!built) return null;
  built.routeStyle = routeStyle;
  if (!built.skipBiomeIdentity) applyBiomeIdentity({ biome, role, theme, built, centerX, centerY, side });

  const bounds = boundsFromRects([...(built.platforms || []), ...(built.bridges || [])]);
  if (bounds) {
    built.playerStart = clampPointToBounds(built.playerStart, bounds, 16);
    if (!built.allowOutsideSpawnAnchors) built.spawnAnchors = clampPointListToBounds(built.spawnAnchors, bounds, 18);
    built.decorAnchors = clampPointListToBounds(built.decorAnchors, bounds, 14);
    built.coverAnchors = clampPointListToBounds(built.coverAnchors, bounds, 16);
    built.hazardAnchors = clampPointListToBounds(built.hazardAnchors, bounds, 16);
    built.safeLanes = clampPointListToBounds(built.safeLanes, bounds, 18);
    built.pressureZones = clampPointListToBounds(built.pressureZones, bounds, 18);
    built.phaseNodes = clampPointListToBounds(built.phaseNodes, bounds, 18);
    built.bossMoveNodes = clampPointListToBounds(built.bossMoveNodes, bounds, 18);
    built.bossCenter = clampPointToBounds(built.bossCenter, bounds, 20);
    built.hazardZones = clampPointListToBounds(built.hazardZones, bounds, 18);
  }
  const gateAnchors = Array.isArray(built.gateAnchors) && built.gateAnchors.length ? built.gateAnchors : gateAnchorsFromBounds(bounds, centerX, centerY, { entrySocket, exitSocket, portalSocket });
  const grammarName = ROOM_GRAMMAR_BY_BIOME[biome]?.[role] || role;
  const artParts = buildStationArtParts({ biome, role, built, side: roomSide, isNeutralIntro });

  return {
    layoutId: `${biome}_${role}_${roomIndex | 0}`,
    profileId: profile?.biomeId || theme.profileId,
    generatorId: profile?.generatorId || theme.generatorId,
    visualPreset: profile?.visualPreset || theme.visualPreset,
    geometry: {
      platforms: built.platforms || [],
      bridges: built.bridges || [],
      walls: [],
      voidZones: role === 'ring' ? [{ id: 'ring_void', type: 'circle', x: centerX, y: centerY, r: clamp(side * 0.10, 54, 96) }] : [],
      navZones: built.navZones || [],
      artParts,
    },
    anchors: {
      playerStart: built.playerStart || { x: centerX, y: centerY + side * 0.12 },
      spawnAnchors: built.spawnAnchors || [{ x: centerX, y: centerY - side * 0.12, tag: 'north' }],
      gateAnchors,
      decorAnchors: built.decorAnchors || [],
      coverAnchors: built.coverAnchors || [],
      hazardAnchors: built.hazardAnchors || [],
      bossSpawn: built.bossCenter || { x: centerX, y: centerY },
      bossMoveNodes: built.bossMoveNodes && built.bossMoveNodes.length ? built.bossMoveNodes : [{ x: centerX, y: centerY }],
    },
    hazardZones: built.hazardZones || [],
    bossArena: {
      arenaType: `${biome}_${role}`,
      center: built.bossCenter || { x: centerX, y: centerY },
      safeLanes: built.safeLanes || [],
      pressureZones: built.pressureZones || [],
      phaseNodes: built.phaseNodes || [],
    },
    rules: {
      supportsBridges: true,
      prefersRangedPressure: !!theme.prefersRangedPressure,
      slipZones: !!theme.slipZones,
      fogZones: !!theme.fogZones,
      radiantBuffNodes: !!theme.radiantBuffNodes,
      isHub: false,
      gateAnchorDriven: false,
      routeStyle: String(routeStyle || ''),
      templateRole: role,
      lateralOffset: Number(lateralOffset) || 0,
      biomeGeneratorId: theme.generatorId,
      roomGrammar: grammarName,
      movementFeel: theme.movementFeel,
      safeLogic: theme.safeLogic,
      pressureStyle: theme.pressureStyle,
      shapeIdentity: theme.shapeIdentity,
      sceneAssembler: built.biomeCircularArena ? 'biome_circle_arena_v1' : (isNeutralIntro ? (built.circlePlatform ? 'neutral_circle_intro_v1' : 'station_modules_v2') : 'role_modules_v2'),
      neutralIntroCircleArena: !!built.circlePlatform,
      biomeCircularArena: !!built.biomeCircularArena,
      spawnAnchorsOutside: !!built.allowOutsideSpawnAnchors,
    },
  };
}

export { canHandleTemplate, resolveRole };
