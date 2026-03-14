import { BIOME_LIST } from './biomes.js';
import { oppositeSocket } from './roomRoute.js';

const ROOM_TEMPLATE_PRESETS = {
  entry_square: {
    key: 'entry_square',
    role: 'vestibule',
    sideScale: 0.82,
    connectorSize: 'wide',
    encounterType: 'warmup',
    difficultyScale: 0.84,
  },
  neutral_intro_vestibule: {
    key: 'neutral_intro_vestibule',
    role: 'vestibule',
    sideScale: 1.02,
    connectorSize: 'wide',
    encounterType: 'warmup',
    difficultyScale: 0.82,
  },
  neutral_intro_hall: {
    key: 'neutral_intro_hall',
    role: 'hall',
    sideScale: 1.05,
    connectorSize: 'wide',
    encounterType: 'swarm',
    difficultyScale: 0.90,
  },
  neutral_intro_split: {
    key: 'neutral_intro_split',
    role: 'split',
    sideScale: 1.04,
    connectorSize: 'wide',
    encounterType: 'gauntlet',
    difficultyScale: 0.98,
  },
  neutral_intro_arena: {
    key: 'neutral_intro_arena',
    role: 'arena',
    sideScale: 1.10,
    connectorSize: 'wide',
    encounterType: 'swarm',
    difficultyScale: 1.06,
  },
  neutral_intro_crown: {
    key: 'neutral_intro_crown',
    role: 'crown',
    sideScale: 1.12,
    connectorSize: 'standard',
    encounterType: 'boss',
    difficultyScale: 1.12,
  },
  wide_hall: {
    key: 'wide_hall',
    role: 'hall',
    sideScale: 1.02,
    connectorSize: 'wide',
    encounterType: 'swarm',
    difficultyScale: 1.06,
  },
  cross_room: {
    key: 'cross_room',
    role: 'split',
    sideScale: 0.96,
    connectorSize: 'standard',
    encounterType: 'gauntlet',
    difficultyScale: 1.00,
  },
  side_pocket: {
    key: 'side_pocket',
    role: 'pocket',
    sideScale: 0.90,
    connectorSize: 'narrow',
    encounterType: 'elite',
    difficultyScale: 1.12,
  },
  ring_path: {
    key: 'ring_path',
    role: 'ring',
    sideScale: 0.98,
    connectorSize: 'standard',
    encounterType: 'swarm',
    difficultyScale: 1.06,
  },
  arena_court: {
    key: 'arena_court',
    role: 'arena',
    sideScale: 1.08,
    connectorSize: 'wide',
    encounterType: 'swarm',
    difficultyScale: 1.14,
  },
  shrine_node: {
    key: 'shrine_node',
    role: 'shrine',
    sideScale: 0.94,
    connectorSize: 'narrow',
    encounterType: 'elite',
    difficultyScale: 1.16,
  },
  bridge_span: {
    key: 'bridge_span',
    role: 'bridge',
    sideScale: 0.88,
    connectorSize: 'narrow',
    encounterType: 'gauntlet',
    difficultyScale: 1.04,
  },
  crucible_chamber: {
    key: 'crucible_chamber',
    role: 'crucible',
    sideScale: 1.00,
    connectorSize: 'standard',
    encounterType: 'gauntlet',
    difficultyScale: 1.20,
  },
  final_room: {
    key: 'final_room',
    role: 'crown',
    sideScale: 1.10,
    connectorSize: 'standard',
    encounterType: 'boss',
    difficultyScale: 1.28,
  },
};

function getMidRoomPool(floorNo = 1) {
  const pool = [
    'wide_hall',
    'cross_room',
    'cross_room',
    'side_pocket',
  ];
  if (floorNo >= 2) pool.push('bridge_span');
  if (floorNo >= 3) pool.push('arena_court', 'ring_path');
  if (floorNo >= 4) pool.push('shrine_node');
  if (floorNo >= 5) pool.push('crucible_chamber');
  if (floorNo >= 7) pool.push('arena_court', 'ring_path', 'bridge_span');
  return pool;
}


const STEP_DEFS = {
  N: { dx: 0, dy: -1, exitSockets: ['N', 'upper_offset'] },
  S: { dx: 0, dy: 1, exitSockets: ['S', 'lower_offset'] },
  W: { dx: -1, dy: 0, exitSockets: ['W', 'inner_left'] },
  E: { dx: 1, dy: 0, exitSockets: ['E', 'inner_right'] },
  NW: { dx: -1, dy: -1, exitSockets: ['NW'] },
  NE: { dx: 1, dy: -1, exitSockets: ['NE'] },
  SW: { dx: -1, dy: 1, exitSockets: ['SW'] },
  SE: { dx: 1, dy: 1, exitSockets: ['SE'] },
};

const FIRST_STEP_POOL = ['N', 'E', 'W', 'NE', 'NW', 'SE', 'SW'];

const TEMPLATE_ROUTE_PREFERENCES = {
  entry_square: { pool: ['N', 'E', 'W', 'NE', 'NW', 'SE', 'SW'], bias: 'forward' },
  wide_hall: { pool: ['N', 'E', 'W', 'NE', 'NW'], bias: 'axis' },
  cross_room: { pool: ['N', 'E', 'W', 'NE', 'NW', 'SE', 'SW'], bias: 'mix' },
  side_pocket: { pool: ['E', 'W', 'NE', 'NW', 'SE', 'SW', 'N'], bias: 'turn' },
  ring_path: { pool: ['E', 'W', 'NE', 'NW', 'SE', 'SW'], bias: 'loop' },
  arena_court: { pool: ['N', 'E', 'W', 'NE', 'NW'], bias: 'axis' },
  shrine_node: { pool: ['E', 'W', 'NE', 'NW', 'N'], bias: 'turn' },
  bridge_span: { pool: ['E', 'W', 'NE', 'NW', 'SE', 'SW'], bias: 'bridge' },
  crucible_chamber: { pool: ['N', 'E', 'W', 'NE', 'NW'], bias: 'pressure' },
  final_room: { pool: [], bias: 'crown' },
};

function pickFrom(arr) {
  return arr[(Math.random() * arr.length) | 0] || arr[0];
}

function clampNum(n, a, b) {
  return n < a ? a : (n > b ? b : n);
}

function computeProgressiveRoomDifficulty({ floorNo = 1, roomOrdinal = 1, totalRooms = 4, preset = null, encounterType = '', isFinal = false } = {}) {
  const presetScale = Math.max(0.72, Number(preset?.difficultyScale) || 1);
  if (floorNo <= 1) return clampNum(Number(presetScale.toFixed(3)), 0.72, 1.4);

  const nonBossRooms = Math.max(1, totalRooms - 1);
  const combatOrdinal = Math.min(roomOrdinal, nonBossRooms);
  const tier = Math.max(0, floorNo - 1) * 4.6 + combatOrdinal * 1.0;
  const baseScale = 1 + tier * 0.06;
  const secondRoomBreak = roomOrdinal >= 2 ? 0.05 : 0;
  const evenRoomPush = (!isFinal && roomOrdinal >= 2 && (roomOrdinal % 2 === 0)) ? 0.03 : 0;
  const encounter = String(encounterType || '').toLowerCase();
  const encounterBias = encounter === 'elite' ? 0.04 : encounter === 'swarm' ? 0.02 : encounter === 'boss' ? 0.10 : encounter === 'warmup' ? -0.03 : 0;
  const presetBias = 1 + (presetScale - 1) * 0.20;

  let scale = (baseScale + secondRoomBreak + evenRoomPush) * presetBias + encounterBias;
  if (isFinal) scale += 0.12;
  return clampNum(Number(scale.toFixed(3)), 0.72, 3.60);
}

function pickRoomCount(floorNo = 1) {
  if (floorNo <= 2) return 4;
  if (floorNo <= 4) return Math.random() < 0.55 ? 4 : 5;
  if (floorNo <= 8) {
    const roll = Math.random();
    if (roll < 0.28) return 4;
    if (roll < 0.78) return 5;
    return 6;
  }
  return Math.random() < 0.35 ? 5 : 6;
}

const FLOOR_BIOME_KEYS = ['neutral', ...BIOME_LIST.map((b) => String(b?.key || '').toLowerCase()).filter(Boolean)];

const BIOME_TEMPLATE_WEIGHTS = {
  neutral: { wide_hall: 1.4, cross_room: 1.2, side_pocket: 1.0, bridge_span: 1.1, ring_path: 1.0, arena_court: 1.0, shrine_node: 0.95, crucible_chamber: 0.95 },
  electric: { wide_hall: 0.9, cross_room: 1.0, side_pocket: 0.95, bridge_span: 1.5, ring_path: 1.45, arena_court: 1.15, shrine_node: 1.0, crucible_chamber: 1.15 },
  fire: { wide_hall: 1.0, cross_room: 0.95, side_pocket: 1.0, bridge_span: 0.85, ring_path: 0.8, arena_court: 1.35, shrine_node: 1.1, crucible_chamber: 1.45 },
  ice: { wide_hall: 1.4, cross_room: 1.0, side_pocket: 0.9, bridge_span: 1.1, ring_path: 1.2, arena_court: 1.05, shrine_node: 1.0, crucible_chamber: 0.95 },
  dark: { wide_hall: 0.85, cross_room: 1.25, side_pocket: 1.35, bridge_span: 1.05, ring_path: 1.1, arena_court: 1.0, shrine_node: 1.15, crucible_chamber: 1.1 },
  light: { wide_hall: 1.15, cross_room: 1.0, side_pocket: 0.95, bridge_span: 1.0, ring_path: 1.3, arena_court: 1.15, shrine_node: 1.4, crucible_chamber: 1.05 },
};

function pickWeightedTemplate(pool = [], weights = {}, prevTemplateKey = '') {
  const entries = [];
  let total = 0;
  for (const key of pool) {
    const repeatPenalty = key === prevTemplateKey ? 0.55 : 1;
    const w = Math.max(0.01, Number(weights[key]) || 1) * repeatPenalty;
    total += w;
    entries.push({ key, w });
  }
  if (!entries.length) return 'cross_room';
  let roll = Math.random() * total;
  for (const it of entries) {
    roll -= it.w;
    if (roll <= 0) return it.key;
  }
  return entries[0].key;
}

function chooseMidTemplate({ floorNo = 1, biomeKey = '', prevTemplateKey = '', elitePlaced = false, remainingSlots = 0 } = {}) {
  const allowElite = floorNo >= 2 && (!elitePlaced || (floorNo >= 7 && remainingSlots >= 2 && Math.random() < 0.22));
  const eliteKeys = new Set(['side_pocket', 'shrine_node']);
  const pool = getMidRoomPool(floorNo).filter((key) => allowElite || !eliteKeys.has(key));
  const weights = BIOME_TEMPLATE_WEIGHTS[String(biomeKey || '').toLowerCase()] || {};
  let picked = pickWeightedTemplate(pool, weights, prevTemplateKey);
  if (!allowElite && (picked === 'side_pocket' || picked === 'shrine_node')) picked = floorNo >= 3 ? 'ring_path' : 'cross_room';
  return picked;
}

function chooseSocketForStep(stepKey = 'N') {
  const def = STEP_DEFS[String(stepKey || 'N')] || STEP_DEFS.N;
  return pickFrom(def.exitSockets);
}

function stepFromSocket(socket = 'N') {
  const key = String(socket || 'N');
  return STEP_DEFS[key] ? key : (
    key === 'upper_offset' ? 'N' :
    key === 'lower_offset' ? 'S' :
    key === 'inner_left' ? 'W' :
    key === 'inner_right' ? 'E' :
    'N'
  );
}

function isBacktrack(prevStep = '', nextStep = '') {
  if (!prevStep || !nextStep) return false;
  return !!(STEP_DEFS[prevStep] && STEP_DEFS[nextStep] && STEP_DEFS[prevStep].dx === -STEP_DEFS[nextStep].dx && STEP_DEFS[prevStep].dy === -STEP_DEFS[nextStep].dy);
}

function scoreStep(stepKey, { prevStep = '', templateKey = '', occupied = new Set(), gx = 0, gy = 0, remaining = 0 } = {}) {
  const def = STEP_DEFS[stepKey] || STEP_DEFS.N;
  const nx = gx + def.dx;
  const ny = gy + def.dy;
  const key = `${nx}:${ny}`;
  if (occupied.has(key)) return -9999;

  const pref = TEMPLATE_ROUTE_PREFERENCES[templateKey] || TEMPLATE_ROUTE_PREFERENCES.cross_room;
  let score = 10;
  if (isBacktrack(prevStep, stepKey)) score -= 30;
  if (prevStep && prevStep === stepKey) score -= 4;
  if (pref.bias === 'axis' && (def.dx === 0 || def.dy === 0)) score += 4;
  if (pref.bias === 'turn' && prevStep && prevStep !== stepKey) score += 5;
  if (pref.bias === 'mix' && def.dx && def.dy) score += 2;
  if (pref.bias === 'loop' && def.dx) score += 4;
  if (pref.bias === 'bridge' && (def.dx || def.dy)) score += 2.5;
  if (pref.bias === 'pressure' && def.dy < 0) score += 3;
  if (remaining <= 1 && def.dy > 0) score -= 3;
  if (Math.abs(nx) + Math.abs(ny) > 4) score -= 4;
  score += Math.random() * 2.6;
  return score;
}

function chooseRouteStep({ prevStep = '', currentTemplateKey = '', occupied = new Set(), gx = 0, gy = 0, remaining = 0, first = false } = {}) {
  const pref = TEMPLATE_ROUTE_PREFERENCES[currentTemplateKey] || TEMPLATE_ROUTE_PREFERENCES.cross_room;
  const basePool = first ? FIRST_STEP_POOL.slice() : (Array.isArray(pref.pool) && pref.pool.length ? pref.pool.slice() : Object.keys(STEP_DEFS));
  const uniquePool = Array.from(new Set(basePool));
  let best = uniquePool[0] || 'N';
  let bestScore = -Infinity;
  for (const stepKey of uniquePool) {
    const score = scoreStep(stepKey, { prevStep, templateKey: currentTemplateKey, occupied, gx, gy, remaining });
    if (score > bestScore) {
      bestScore = score;
      best = stepKey;
    }
  }
  return best;
}

function makeConnectionMeta(stepKey = 'N', currentTemplateKey = 'cross_room') {
  const step = STEP_DEFS[stepKey] || STEP_DEFS.N;
  const isDiagonal = !!(step.dx && step.dy);
  const offsetSign = Math.random() < 0.5 ? -1 : 1;
  const baseOffset = currentTemplateKey === 'side_pocket' || currentTemplateKey === 'shrine_node' ? 0.22 : currentTemplateKey === 'wide_hall' || currentTemplateKey === 'arena_court' ? 0.10 : currentTemplateKey === 'bridge_span' ? 0.18 : 0.15;
  const offset = isDiagonal ? offsetSign * 0.08 : offsetSign * baseOffset;
  return {
    stepKey,
    dx: step.dx,
    dy: step.dy,
    exitSocket: chooseSocketForStep(stepKey),
    routeStyle: isDiagonal ? 'diagonal' : (Math.abs(offset) >= 0.18 ? 'offset' : 'axis'),
    lateralOffset: offset,
  };
}

function choosePortalSocket(entrySocket = 'S') {
  const entry = String(entrySocket || 'S');
  if (entry === 'N' || entry === 'upper_offset') return Math.random() < 0.5 ? 'E' : 'NE';
  if (entry === 'S' || entry === 'lower_offset') return Math.random() < 0.5 ? 'N' : 'NW';
  if (entry === 'W' || entry === 'inner_left') return Math.random() < 0.5 ? 'E' : 'NE';
  if (entry === 'E' || entry === 'inner_right') return Math.random() < 0.5 ? 'W' : 'NW';
  return oppositeSocket(entry, 'N');
}

export function pickRandomFloorBiome(prevBiomeKey = '') {
  const prev = String(prevBiomeKey || '').toLowerCase();
  const pool = FLOOR_BIOME_KEYS.map((key) => ({ key, weight: 1.0 }));
  const filtered = pool.filter((it) => it.key !== prev);
  const source = filtered.length ? filtered : pool;
  const total = source.reduce((sum, it) => sum + (it.weight || 1), 0);
  let roll = Math.random() * total;
  for (const it of source) {
    roll -= (it.weight || 1);
    if (roll <= 0) return it.key;
  }
  return source[0]?.key || 'neutral';
}

function makeIntroRoomMeta({ roomOrdinal = 1, totalRooms = 5, templateKey = 'cross_room', biomeKey = 'neutral', encounterType = '', difficultyScale = 1, connectorSize = 'standard', entrySocket = '', exitSocket = '', portalSocket = '', placementStep = null, routeStyle = 'axis', lateralOffset = 0, gridX = 0, gridY = 0 } = {}) {
  const preset = getRoomTemplatePreset(templateKey);
  const resolvedEncounter = String(encounterType || preset.encounterType || 'gauntlet');
  return {
    roomOrdinal,
    totalRooms,
    templateKey,
    templateRole: preset.role || 'room',
    sideScale: preset.sideScale,
    connectorSize: connectorSize || preset.connectorSize || 'standard',
    encounterType: resolvedEncounter,
    encounterLabel: getEncounterLabel(resolvedEncounter, preset.role || ''),
    difficultyScale: Math.max(0.65, Number(difficultyScale) || Number(preset.difficultyScale) || 1),
    isFinal: roomOrdinal === totalRooms,
    biomeKey,
    floorNumber: 1,
    entrySocket: String(entrySocket || ''),
    exitSocket: String(exitSocket || ''),
    placementStep,
    routeStyle: String(routeStyle || 'axis'),
    lateralOffset: Number(lateralOffset) || 0,
    gridX,
    gridY,
    portalSocket: String(portalSocket || ''),
  };
}

function buildNeutralIntroFloorPlan() {
  const biomeKey = 'neutral';
  const totalRooms = 5;
  const rooms = [
    makeIntroRoomMeta({ roomOrdinal: 1, totalRooms, templateKey: 'neutral_intro_vestibule', biomeKey, encounterType: 'warmup', difficultyScale: 0.78, connectorSize: 'wide', entrySocket: 'S', exitSocket: 'N', placementStep: { dx: 0, dy: -1 }, routeStyle: 'axis', lateralOffset: 0, gridX: 0, gridY: -1 }),
    makeIntroRoomMeta({ roomOrdinal: 2, totalRooms, templateKey: 'neutral_intro_hall', biomeKey, encounterType: 'swarm', difficultyScale: 0.88, connectorSize: 'wide', entrySocket: 'S', exitSocket: 'E', placementStep: { dx: 0, dy: -1 }, routeStyle: 'axis', lateralOffset: -0.05, gridX: 0, gridY: -2 }),
    makeIntroRoomMeta({ roomOrdinal: 3, totalRooms, templateKey: 'neutral_intro_split', biomeKey, encounterType: 'gauntlet', difficultyScale: 0.96, connectorSize: 'wide', entrySocket: 'W', exitSocket: 'E', placementStep: { dx: 1, dy: 0 }, routeStyle: 'axis', lateralOffset: 0.10, gridX: 1, gridY: -2 }),
    makeIntroRoomMeta({ roomOrdinal: 4, totalRooms, templateKey: 'neutral_intro_arena', biomeKey, encounterType: 'swarm', difficultyScale: 1.04, connectorSize: 'wide', entrySocket: 'W', exitSocket: 'N', placementStep: { dx: 1, dy: 0 }, routeStyle: 'axis', lateralOffset: 0.06, gridX: 2, gridY: -2 }),
    makeIntroRoomMeta({ roomOrdinal: 5, totalRooms, templateKey: 'neutral_intro_crown', biomeKey, encounterType: 'boss', difficultyScale: 1.10, connectorSize: 'standard', entrySocket: 'S', exitSocket: '', portalSocket: 'N', placementStep: { dx: 0, dy: -1 }, routeStyle: 'axis', lateralOffset: 0, gridX: 2, gridY: -3 }),
  ];
  return {
    floorNumber: 1,
    biomeKey,
    planKind: 'neutral_intro',
    rooms,
  };
}

export function getRoomTemplatePreset(templateKey = 'cross_room') {
  return ROOM_TEMPLATE_PRESETS[String(templateKey || 'cross_room')] || ROOM_TEMPLATE_PRESETS.cross_room;
}

export function getEncounterLabel(encounterType = '', templateRole = '') {
  switch (String(templateRole || '').toLowerCase()) {
    case 'vestibule': return 'ВХОД';
    case 'split': return 'РАЗВИЛКА';
    case 'pocket': return 'ЗАСАДА';
    case 'ring': return 'КОЛЬЦО';
    case 'arena': return 'АРЕНА';
    case 'shrine': return 'СВЯТЫНЯ';
    case 'bridge': return 'ПЕРЕХОД';
    case 'crucible': return 'ГОРНИЛО';
    case 'crown': return 'БОСС';
    default:
      switch (String(encounterType || '').toLowerCase()) {
        case 'warmup': return 'РАЗМИНКА';
        case 'swarm': return 'РОЙ';
        case 'elite': return 'ЭЛИТА';
        case 'boss': return 'БОСС';
        default: return 'ВОЛНЫ';
      }
  }
}

export function buildFloorPlan(floorNumber = 1, prevBiomeKey = '') {
  const floorNo = Math.max(1, floorNumber | 0);
  if (floorNo === 1) return buildNeutralIntroFloorPlan();

  const biomeKey = pickRandomFloorBiome(prevBiomeKey);
  const totalRooms = pickRoomCount(floorNo);

  const rooms = [];
  let prevTemplateKey = 'entry_square';
  let elitePlaced = false;

  for (let i = 1; i <= totalRooms; i++) {
    let templateKey = 'cross_room';
    if (i === 1) templateKey = 'entry_square';
    else if (i === totalRooms) templateKey = 'final_room';
    else {
      const remainingSlots = totalRooms - i;
      if (!elitePlaced && floorNo >= 3 && remainingSlots === 1) {
        templateKey = floorNo >= 4 && Math.random() < 0.45 ? 'shrine_node' : 'side_pocket';
      } else {
        templateKey = chooseMidTemplate({ floorNo, biomeKey, prevTemplateKey, elitePlaced, remainingSlots });
      }
    }

    const preset = getRoomTemplatePreset(templateKey);
    const encounterType = preset.encounterType || 'gauntlet';
    if (encounterType === 'elite') elitePlaced = true;
    prevTemplateKey = templateKey;

    rooms.push({
      roomOrdinal: i,
      totalRooms,
      templateKey,
      templateRole: preset.role || 'room',
      sideScale: preset.sideScale,
      connectorSize: preset.connectorSize || 'standard',
      encounterType,
      encounterLabel: getEncounterLabel(encounterType, preset.role || ''),
      difficultyScale: computeProgressiveRoomDifficulty({ floorNo, roomOrdinal: i, totalRooms, preset, encounterType, isFinal: i === totalRooms }),
      isFinal: i === totalRooms,
      biomeKey,
      floorNumber: floorNo,
      entrySocket: '',
      exitSocket: '',
      placementStep: null,
      routeStyle: 'axis',
      lateralOffset: 0,
      gridX: 0,
      gridY: 0,
      portalSocket: '',
    });
  }

  let gx = 0;
  let gy = 0;
  let prevStep = '';
  const occupied = new Set(['0:0']);

  if (rooms.length) {
    const firstStep = chooseRouteStep({ prevStep: '', currentTemplateKey: rooms[0].templateKey, occupied, gx, gy, remaining: rooms.length, first: true });
    const firstConn = makeConnectionMeta(firstStep, rooms[0].templateKey);
    gx += firstConn.dx;
    gy += firstConn.dy;
    occupied.add(`${gx}:${gy}`);
    rooms[0].entrySocket = oppositeSocket(firstConn.exitSocket, 'S');
    rooms[0].placementStep = { dx: firstConn.dx, dy: firstConn.dy };
    rooms[0].routeStyle = firstConn.routeStyle;
    rooms[0].lateralOffset = firstConn.lateralOffset;
    rooms[0].gridX = gx;
    rooms[0].gridY = gy;
    prevStep = firstStep;
  }

  for (let i = 0; i < rooms.length - 1; i++) {
    const current = rooms[i];
    const next = rooms[i + 1];
    const remaining = rooms.length - (i + 1);
    const stepKey = chooseRouteStep({ prevStep, currentTemplateKey: current.templateKey, occupied, gx, gy, remaining, first: false });
    const conn = makeConnectionMeta(stepKey, current.templateKey);
    current.exitSocket = conn.exitSocket;
    current.routeStyle = conn.routeStyle;
    current.lateralOffset = conn.lateralOffset;
    current.stepKey = conn.stepKey;

    gx += conn.dx;
    gy += conn.dy;
    occupied.add(`${gx}:${gy}`);

    next.entrySocket = oppositeSocket(conn.exitSocket, 'S');
    next.placementStep = { dx: conn.dx, dy: conn.dy };
    next.routeStyle = conn.routeStyle;
    next.lateralOffset = conn.lateralOffset;
    next.gridX = gx;
    next.gridY = gy;
    prevStep = stepKey;
  }

  if (rooms.length) {
    const last = rooms[rooms.length - 1];
    last.portalSocket = choosePortalSocket(last.entrySocket || 'S');
  }

  return {
    floorNumber: floorNo,
    biomeKey,
    rooms,
  };
}
