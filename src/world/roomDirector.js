import { HUB_HALF } from './zoneController.js';
import { setDynamicWorldBounds } from './mapGenerator.js';
import { buildArenaSpec } from './arenaSpecBuilder.js';
import { buildFloorPlan, getRoomTemplatePreset } from './floorPlanBuilder.js';
import { getRoomGeometryBounds, getRoomWalkRects, clampPointToRects } from './floorCollision.js';
import { resolveSocketPoint, oppositeSocket, primaryEdgeForSocket, socketVector } from './roomRoute.js';
import { scheduleRoomRenderWarmup } from './roomRenderer.js';
import { rollHubLootForRoom } from '../core/hubBuild.js';
import { saveProgression } from '../core/progression.js';

const GAP = 120;
const CONNECTOR_BUILD_DUR = 0.55;
const COLLAPSE_DUR = 0.55;
const FLOOR_EXIT_RADIUS = 70;
const HUB_RETURN_RADIUS = 70;
const HUB_PORTAL_TRIGGER_RADIUS = 42;

function clamp(n, a, b) {
  return n < a ? a : (n > b ? b : n);
}

export function getGateLenForRoomSide(roomSide) {
  return clamp(roomSide * 0.10, 72, 112);
}

export function getGateHalfLenForRoomSide(roomSide) {
  return getGateLenForRoomSide(roomSide) * 0.5;
}

export function getRoomSide(roomIndex = 0, templateKey = 'cross_room', floorNumber = 1) {
  const idx = roomIndex | 0;
  if (idx <= 0) return HUB_HALF * 2;
  const floorNo = Math.max(1, floorNumber | 0);
  const base = 820 + Math.min(380, Math.round(floorNo * 38));
  const scaleByTemplate = (
    templateKey === 'entry_square' ? 0.82 :
    templateKey === 'wide_hall' ? 1.02 :
    templateKey === 'side_pocket' ? 0.90 :
    templateKey === 'ring_path' ? 0.98 :
    templateKey === 'arena_court' ? 1.08 :
    templateKey === 'shrine_node' ? 0.94 :
    templateKey === 'bridge_span' ? 0.88 :
    templateKey === 'crucible_chamber' ? 1.00 :
    templateKey === 'final_room' ? 1.10 :
    0.96
  );
  return Math.round(base * scaleByTemplate);
}

function getConnectorWidth(fromRoom, toRoom) {
  const minSide = Math.min(Number(fromRoom?.side) || 0, Number(toRoom?.side) || 0) || HUB_HALF;
  let width = Math.max(108, Math.min(220, Math.round(minSide * 0.17)));
  const connectorA = String(fromRoom?.connectorSize || 'standard');
  const connectorB = String(toRoom?.connectorSize || 'standard');
  if (connectorA === 'wide' || connectorB === 'wide') width = Math.round(width * 1.18);
  if (connectorA === 'narrow' || connectorB === 'narrow') width = Math.round(width * 0.82);
  return clamp(width, 96, 240);
}

function pointInAabb(x, y, b, pad = 0) {
  if (!b) return false;
  return x >= b.minX - pad && x <= b.maxX + pad && y >= b.minY - pad && y <= b.maxY + pad;
}

function unionAabb(a, b, pad = 0) {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX) - pad,
    maxX: Math.max(a.maxX, b.maxX) + pad,
    minY: Math.min(a.minY, b.minY) - pad,
    maxY: Math.max(a.maxY, b.maxY) + pad,
  };
}

function expandLineAabb(a, b, halfWidth = 18, pad = 8) {
  const hw = Math.max(8, Number(halfWidth) || 18);
  return {
    minX: Math.min(Number(a?.x) || 0, Number(b?.x) || 0) - hw - pad,
    maxX: Math.max(Number(a?.x) || 0, Number(b?.x) || 0) + hw + pad,
    minY: Math.min(Number(a?.y) || 0, Number(b?.y) || 0) - hw - pad,
    maxY: Math.max(Number(a?.y) || 0, Number(b?.y) || 0) + hw + pad,
  };
}

function roomAnchorPoint(room, socket = 'N', outside = 0) {
  const key = String(socket || 'N');
  const anchors = Array.isArray(room?.arenaSpec?.anchors?.gateAnchors) ? room.arenaSpec.anchors.gateAnchors : [];
  if (anchors.length) {
    const exact = anchors.find((a) => String(a?.socket || '') === key);
    if (exact && Number.isFinite(Number(exact.x)) && Number.isFinite(Number(exact.y))) {
      return { x: Number(exact.x), y: Number(exact.y) };
    }
    const side = primaryEdgeForSocket(key, 'N');
    const sameSide = anchors.find((a) => String(a?.side || '') === side);
    if (sameSide && Number.isFinite(Number(sameSide.x)) && Number.isFinite(Number(sameSide.y))) {
      return { x: Number(sameSide.x), y: Number(sameSide.y) };
    }
  }
  if (!room?.bounds) return { x: Number(room?.centerX) || 0, y: Number(room?.centerY) || 0 };
  return resolveSocketPoint(room.bounds, room.centerX, room.centerY, key, { outside, offsetScale: 0.22 });
}

function resolvePortalPoint(room) {
  const hubPortal = room?.arenaSpec?.anchors?.hubNpcAnchors?.portal;
  if (room?.arenaSpec?.rules?.isHub && hubPortal && Number.isFinite(Number(hubPortal.x)) && Number.isFinite(Number(hubPortal.y))) {
    return { x: Number(hubPortal.x), y: Number(hubPortal.y) };
  }
  const rects = getRoomWalkRects(room);
  const desiredSocket = String(room?.portalSocket || room?.exitSocket || oppositeSocket(room?.entrySocket || 'S', 'N') || 'N');
  const desired = roomAnchorPoint(room, desiredSocket, -24);
  const fallback = { x: room.centerX, y: room.centerY };
  if (!rects.length) return desired || fallback;
  return clampPointToRects(desired.x, desired.y, rects, {
    edgePad: 16,
    coverRadius: 0,
    covers: [],
    prefer: { x: room.centerX, y: room.centerY },
  });
}

function resolveHubReturnPortalPoint(room) {
  if (!room || !room.isFloorFinal) return null;
  const rects = getRoomWalkRects(room);
  const desired = roomAnchorPoint(room, 'S', -24);
  const fallback = { x: Number(room?.centerX) || 0, y: (Number(room?.centerY) || 0) + (Number(room?.side) || 0) * 0.28 };
  if (!rects.length) return desired || fallback;
  return clampPointToRects(desired.x, desired.y, rects, {
    edgePad: 16,
    coverRadius: 0,
    covers: [],
    prefer: { x: room.centerX, y: room.centerY },
  });
}


function splitHubLootPayload(payload) {
  const chunks = [];
  if (!payload || typeof payload !== 'object') return chunks;
  const coinAmt = Math.max(0, Number(payload.coins || 0) | 0);
  if (coinAmt > 0) chunks.push({ kind: 'coin', payload: { coins: coinAmt } });
  const essences = payload.essences && typeof payload.essences === 'object' ? payload.essences : {};
  for (const [key, amtRaw] of Object.entries(essences)) {
    const amt = Math.max(0, Number(amtRaw) | 0);
    if (amt > 0) chunks.push({ kind: 'essence', payload: { essences: { [key]: amt } } });
  }
  const raceDust = payload.raceDust && typeof payload.raceDust === 'object' ? payload.raceDust : {};
  for (const [key, amtRaw] of Object.entries(raceDust)) {
    const amt = Math.max(0, Number(amtRaw) | 0);
    if (amt > 0) chunks.push({ kind: 'prog', payload: { raceDust: { [key]: amt } } });
  }
  const materials = payload.materials && typeof payload.materials === 'object' ? payload.materials : {};
  for (const [key, amtRaw] of Object.entries(materials)) {
    const amt = Math.max(0, Number(amtRaw) | 0);
    if (amt > 0) chunks.push({ kind: 'material', payload: { materials: { [key]: amt } } });
  }
  const parts = payload.gearParts && typeof payload.gearParts === 'object' ? payload.gearParts : {};
  for (const [key, amtRaw] of Object.entries(parts)) {
    const amt = Math.max(0, Number(amtRaw) | 0);
    if (amt > 0) chunks.push({ kind: 'gearPart', payload: { gearParts: { [key]: amt } } });
  }
  const items = payload.gearItems && typeof payload.gearItems === 'object' ? payload.gearItems : {};
  for (const [key, amtRaw] of Object.entries(items)) {
    const amt = Math.max(0, Number(amtRaw) | 0);
    if (amt > 0) chunks.push({ kind: 'gearItem', payload: { gearItems: { [key]: amt } } });
  }
  const cardShards = payload.cardShards && typeof payload.cardShards === 'object' ? payload.cardShards : {};
  for (const [key, amtRaw] of Object.entries(cardShards)) {
    const amt = Math.max(0, Number(amtRaw) | 0);
    if (amt > 0) chunks.push({ kind: 'prog', payload: { cardShards: { [key]: amt } } });
  }
  const cardCopies = payload.cardCopies && typeof payload.cardCopies === 'object' ? payload.cardCopies : {};
  for (const [key, amtRaw] of Object.entries(cardCopies)) {
    const amt = Math.max(0, Number(amtRaw) | 0);
    if (amt > 0) chunks.push({ kind: 'prog', payload: { cardCopies: { [key]: amt } } });
  }
  return chunks;
}

function spawnHubLootPickups(state, room, payload) {
  if (!state || !room || !payload || typeof payload !== 'object') return 0;
  const chunks = splitHubLootPayload(payload);
  const xpOrbs = Array.isArray(state.xpOrbs) ? state.xpOrbs : (state.xpOrbs = []);
  const centerX = Number(room.centerX) || 0;
  const centerY = Number(room.centerY) || 0;
  const baseR = Math.max(42, Math.min(120, (Number(room.side) || 840) * 0.07));
  state._resourceGrantSerial = Math.max(0, Number(state._resourceGrantSerial || 0));
  for (let i = 0; i < chunks.length; i++) {
    const a = (Math.PI * 2 * i) / Math.max(1, chunks.length);
    const ring = baseR + (i % 3) * 16;
    const chunk = chunks[i] || null;
    if (!chunk) continue;
    const firstCoin = Math.max(0, Number(chunk.payload?.coins || 0) | 0);
    const firstEssenceKey = chunk.payload?.essences ? Object.keys(chunk.payload.essences)[0] || '' : '';
    const firstDustKey = chunk.payload?.raceDust ? Object.keys(chunk.payload.raceDust)[0] || '' : '';
    const firstMaterialKey = chunk.payload?.materials ? Object.keys(chunk.payload.materials)[0] || '' : '';
    const firstPartKey = chunk.payload?.gearParts ? Object.keys(chunk.payload.gearParts)[0] || '' : '';
    const firstItemKey = chunk.payload?.gearItems ? Object.keys(chunk.payload.gearItems)[0] || '' : '';
    const firstCardShardKey = chunk.payload?.cardShards ? Object.keys(chunk.payload.cardShards)[0] || '' : '';
    const firstCardCopyKey = chunk.payload?.cardCopies ? Object.keys(chunk.payload.cardCopies)[0] || '' : '';
    const amount = Math.max(1, Number(firstCoin || (chunk.payload?.essences?.[firstEssenceKey]) || (chunk.payload?.raceDust?.[firstDustKey]) || (chunk.payload?.materials?.[firstMaterialKey]) || (chunk.payload?.gearParts?.[firstPartKey]) || (chunk.payload?.gearItems?.[firstItemKey]) || (chunk.payload?.cardShards?.[firstCardShardKey]) || (chunk.payload?.cardCopies?.[firstCardCopyKey]) || 1) | 0);
    const orb = {
      x: centerX + Math.cos(a) * ring,
      y: centerY + Math.sin(a) * ring,
      baseY: centerY + Math.sin(a) * ring,
      radius: chunks[i].kind === 'coin' ? 9 : (chunks[i].kind === 'gearItem' ? 12 : (chunks[i].kind === 'gearPart' ? 10 : 9)),
      age: 0,
      spawnDelay: 0.35,
      ttl: 120,
      kind: chunks[i].kind,
      amount,
      grantId: `room:${(room.floorNumber | 0)}:${(room.index | 0)}:${chunks[i].kind}:${++state._resourceGrantSerial}`,
    };
    if (chunk.kind === 'coin') orb.coins = amount;
    if (chunk.kind === 'essence') orb.essenceKey = firstEssenceKey || 'mecha';
    else if (chunk.kind === 'material') orb.materialKey = firstMaterialKey || 'salvage';
    else if (chunk.kind === 'gearPart' || chunk.kind === 'gearItem') orb.gearKey = firstPartKey || firstItemKey || '';
    else if (chunk.kind === 'prog') {
      orb.progKind = chunk.payload?.cardCopies ? 'cardCopy' : (chunk.payload?.cardShards ? 'cardShard' : (chunk.payload?.raceDust ? 'raceDust' : 'resource'));
      orb.progPayload = { ...(chunk.payload || {}), _grantId: orb.grantId };
    }
    xpOrbs.push(orb);
  }
  return chunks.length;
}

function resolveTransitionRole(anchor, room) {
  const tag = String(anchor?.tag || '').toLowerCase();
  const socket = String(anchor?.socket || '');
  if (tag.includes('portal') || (socket && socket === String(room?.portalSocket || ''))) return 'portal';
  if (tag.includes('exit') || (socket && socket === String(room?.exitSocket || ''))) return 'exit';
  if (tag.includes('entry') || (socket && socket === String(room?.entrySocket || ''))) return 'entry';
  return 'route';
}

function buildTransitionBreaches(room, director, relation = 'current') {
  const anchors = Array.isArray(room?.arenaSpec?.anchors?.gateAnchors) ? room.arenaSpec.anchors.gateAnchors : [];
  if (!anchors.length) return [];
  const br = director?.bridge || null;
  const bridgeFromHere = !!(br && ((br.fromIndex | 0) === (room?.index | 0)));
  const bridgeToHere = !!(br && ((br.toIndex | 0) === (room?.index | 0)));
  const bridgeProgress = clamp(Number(br?.progress) || 0, 0, 1);
  const bridgeBuilt = !!(br && br.built);
  const out = [];
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    if (!a) continue;
    const role = resolveTransitionRole(a, room);
    let state = 'idle';
    let label = 'ROUTE';
    if (role === 'entry') {
      if (relation === 'next') {
        if (bridgeBuilt && bridgeToHere) { state = 'incoming_open'; label = 'ENTER'; }
        else if (bridgeProgress > 0.02 && bridgeToHere) { state = 'incoming_link'; label = 'LINK'; }
        else { state = 'incoming_locked'; label = 'NEXT'; }
      } else if (relation === 'prev') {
        state = 'spent';
        label = 'PREV';
      } else {
        state = room?.index > 0 ? 'entry' : 'hub';
        label = room?.index > 0 ? 'ENTRY' : 'START';
      }
    } else if (role === 'exit') {
      if (relation === 'prev') {
        state = 'spent';
        label = 'CLEARED';
      } else if (room?.isFloorFinal) {
        state = room?.cleared ? 'spent' : 'locked';
        label = room?.cleared ? 'DONE' : 'BOSS';
      } else if (!room?.cleared) {
        state = 'locked';
        label = 'CLEAR';
      } else if (bridgeFromHere && !bridgeBuilt) {
        state = 'linking';
        label = 'LINK';
      } else if (bridgeFromHere && bridgeBuilt) {
        state = 'open';
        label = 'NEXT';
      } else {
        state = 'ready';
        label = 'READY';
      }
    } else if (role === 'portal') {
      if (!room?.cleared) {
        state = 'locked';
        label = room?.isFloorFinal ? 'CROWN' : 'LOCKED';
      } else {
        state = 'portal_ready';
        label = room?.isFloorFinal ? 'NEXT FLOOR' : 'EXIT';
      }
    } else {
      if (room?.cleared && bridgeFromHere && bridgeBuilt) {
        state = 'open';
        label = 'ROUTE';
      } else if (room?.cleared) {
        state = 'ready';
        label = 'PATH';
      } else {
        state = 'locked';
        label = 'SEALED';
      }
    }
    out.push({
      id: `transition_${room?.index || 0}_${role}_${i}`,
      kind: 'transition',
      role,
      state,
      label,
      side: String(a.side || primaryEdgeForSocket(a.socket || 'N', 'N')),
      socket: String(a.socket || ''),
      x: Number(a.x) || 0,
      y: Number(a.y) || 0,
      progress: bridgeProgress,
      active: !!(relation === 'current' || relation === 'next'),
    });
  }
  return out;
}

function describeRoomObjective(room, director) {
  if (!room) return '';
  if ((room.index | 0) <= 0) return director?.next ? 'START RUN' : 'HUB';
  if (room.isFloorFinal) return room.cleared ? 'ENTER PORTAL' : 'CLEAR CROWN';
  if (!room.cleared) return 'CLEAR ROOM TO OPEN PATH';
  if (director?.bridge && ((director.bridge.fromIndex | 0) === (room.index | 0)) && !director.bridge.built) return 'PATH FORMING';
  if (director?.bridge?.built && director?.next) return 'ENTER NEXT ROOM';
  return 'PATH READY';
}

function computePlacedCenter(fromRoom, roomMeta, nextSide) {
  if (!fromRoom) return { x: 0, y: 0 };
  const step = roomMeta?.placementStep || { dx: 0, dy: -1 };
  let dx = Number(step?.dx) || 0;
  let dy = Number(step?.dy) || 0;
  if (!dx && !dy) dy = -1;
  const curHalf = (Number(fromRoom.side) || HUB_HALF * 2) * 0.5;
  const nextHalf = (Number(nextSide) || HUB_HALF * 2) * 0.5;
  const base = curHalf + GAP + nextHalf;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len;
  const ny = dy / len;
  const perpX = -ny;
  const perpY = nx;
  const lateral = (Number(roomMeta?.lateralOffset) || 0) * Math.min(Number(fromRoom.side) || 0, Number(nextSide) || 0, 980);
  return {
    x: (Number(fromRoom.centerX) || 0) + dx * base + perpX * lateral,
    y: (Number(fromRoom.centerY) || 0) + dy * base + perpY * lateral,
  };
}

function makeRoom({
  serial = 0,
  floorNumber = 0,
  roomOrdinal = 0,
  totalRooms = 0,
  biomeKey = '',
  templateKey = '',
  templateRole = '',
  encounterType = '',
  encounterLabel = '',
  difficultyScale = 1,
  connectorSize = 'standard',
  entrySocket = '',
  exitSocket = '',
  portalSocket = '',
  routeStyle = '',
  lateralOffset = 0,
  centerX = 0,
  centerY = 0,
} = {}) {
  const preset = getRoomTemplatePreset(templateKey);
  const side = getRoomSide(serial, templateKey, floorNumber);
  const half = side * 0.5;
  const containerBounds = {
    minX: centerX - half,
    maxX: centerX + half,
    minY: centerY - half,
    maxY: centerY + half,
  };
  const arenaSpec = buildArenaSpec({
    roomIndex: serial,
    biomeKey,
    templateKey,
    encounterType,
    roomOrdinal,
    totalRooms,
    side,
    centerX,
    centerY,
    entrySocket,
    exitSocket,
    portalSocket,
    templateRole,
    routeStyle,
    lateralOffset,
  });
  const geometryBounds = getRoomGeometryBounds({ arenaSpec }, 0);
  const bounds = geometryBounds || containerBounds;

  return {
    id: serial <= 0 ? 'hub' : `room_${serial}`,
    index: serial | 0,
    floorNumber: floorNumber | 0,
    roomOrdinal: roomOrdinal | 0,
    totalRooms: totalRooms | 0,
    isFloorFinal: !!(roomOrdinal > 0 && roomOrdinal === totalRooms),
    biomeKey: String(biomeKey || ''),
    templateKey: String(templateKey || ''),
    templateRole: String(templateRole || preset.role || ''),
    encounterType: String(encounterType || preset.encounterType || ''),
    encounterLabel: String(encounterLabel || ''),
    difficultyScale: Math.max(0.6, Number(difficultyScale) || Number(preset.difficultyScale) || 1),
    connectorSize: String(connectorSize || preset.connectorSize || 'standard'),
    entrySocket: String(entrySocket || ''),
    exitSocket: String(exitSocket || ''),
    portalSocket: String(portalSocket || ''),
    routeStyle: String(routeStyle || ''),
    lateralOffset: Number(lateralOffset) || 0,
    side,
    centerX,
    centerY,
    bounds,
    containerBounds,
    breaches: [],
    arenaSpec,
    shopNpc: null,
    exitPortal: null,
    hubReturnPortal: null,
    cleared: serial <= 0,
    collapsing: false,
    collapseT: 0,
    removed: false,
  };
}

function makeHubRoom() {
  const room = makeRoom({ serial: 0, floorNumber: 0, roomOrdinal: 0, totalRooms: 0, biomeKey: '', templateKey: 'hub', centerX: 0, centerY: 0, exitSocket: 'N' });
  room.cleared = true;
  room.exitPortal = resolvePortalPoint(room);
  return room;
}

export class RoomDirector {
  constructor(state) {
    this.state = state;
    this.prev = null;
    this.current = makeHubRoom();
    this.next = null;
    this.bridge = null;
    this._waitForParty = false;

    this._lastBiomeKey = '';
    this._serial = 0;
    this._activeFloorPlan = null;

    this._ensureNextSpawned();
    this._ensureBridge();
    this._applyDynamicBounds();
    try { scheduleRoomRenderWarmup(this.state); } catch {}
  }

  get roomIndex() {
    return this.current ? (this.current.index | 0) : 0;
  }

  markCurrentCleared() {
    const room = this.current;
    if (!room || room.cleared) return;
    room.cleared = true;

    const st = this.state;
    try {
      spawnHubLootPickups(st, room, rollHubLootForRoom(room, st?.progression || {}));
    } catch {}

    if (room.isFloorFinal) {
      room.exitPortal = resolvePortalPoint(room);
      room.hubReturnPortal = resolveHubReturnPortalPoint(room);
      this.next = null;
      this.bridge = null;
      try {
        const nextFloorNo = Math.max(1, (room.floorNumber | 0) + 1);
        const prevBiome = String(this._lastBiomeKey || room.biomeKey || '');
        const savedPlan = buildFloorPlan(nextFloorNo, prevBiome);
        this.state._savedRunResumePlan = JSON.parse(JSON.stringify(savedPlan));
        if (typeof this.state?._saveRunCheckpoint === 'function') {
          this.state._saveRunCheckpoint({ savedPlan, nextFloor: nextFloorNo });
        }
      } catch {}
    } else {
      this._ensureNextSpawned();
      this._ensureBridge();
    }

    this._applyDynamicBounds();
    try { scheduleRoomRenderWarmup(this.state); } catch {}
  }

  _ensureFloorShop() {
    const room = this.current;
    if (!room) return;
    // Stage 1 hub-build migration: expedition floor terminals are disabled.
    room.shopNpc = null;
  }

  _getAlivePlayers() {
    const ps = (this.state?.players && this.state.players.length) ? this.state.players : (this.state?.player ? [this.state.player] : []);
    return ps.filter((p) => p && (Number(p.hp) || 0) > 0);
  }

  _countPlayersInAabb(players, bounds, pad = 0) {
    if (!Array.isArray(players) || !players.length || !bounds) return 0;
    let count = 0;
    for (const p of players) {
      if (!p) continue;
      if (pointInAabb(Number(p.x) || 0, Number(p.y) || 0, bounds, pad)) count += 1;
    }
    return count;
  }

  _countPlayersInRadius(players, target, radius) {
    if (!Array.isArray(players) || !players.length || !target) return 0;
    const r2 = Math.max(0, Number(radius) || 0) ** 2;
    let count = 0;
    for (const p of players) {
      if (!p) continue;
      const dx = (Number(p.x) || 0) - (Number(target.x) || 0);
      const dy = (Number(p.y) || 0) - (Number(target.y) || 0);
      if (dx * dx + dy * dy <= r2) count += 1;
    }
    return count;
  }

  _snapAlivePlayersIntoCurrentRoom() {
    if (!this.current) return;
    const alive = this._getAlivePlayers();
    if (!alive.length) return;
    const rects = getRoomWalkRects(this.current);
    const start = this.current?.arenaSpec?.anchors?.playerStart || { x: this.current.centerX, y: this.current.centerY };
    for (const p of alive) {
      if (pointInAabb(Number(p.x) || 0, Number(p.y) || 0, this.current.bounds, 28)) continue;
      const fixed = clampPointToRects(Number(p.x) || 0, Number(p.y) || 0, rects, {
        edgePad: 2,
        coverRadius: Math.max(4, Number(p.radius) || 18),
        covers: [],
        prefer: { x: Number(start.x) || this.current.centerX, y: Number(start.y) || this.current.centerY },
      });
      p.x = fixed.x;
      p.y = fixed.y;
    }
  }

  update(dt) {
    if (this.prev && this.prev.collapsing) {
      this.prev.collapseT += dt / COLLAPSE_DUR;
      if (this.prev.collapseT >= 1) {
        this.prev.removed = true;
        this.prev = null;
      }
    }

    if (this.bridge && !this.bridge.built) {
      this.bridge.t += dt / CONNECTOR_BUILD_DUR;
      this.bridge.progress = clamp(this.bridge.t, 0, 1);
      if (this.bridge.progress >= 0.999) this.bridge.built = true;
    }

    if (!this.current) {
      this._waitForParty = false;
      this._applyDynamicBounds();
      return;
    }

    if (this.current.cleared && !this.current.isFloorFinal) {
      try { this._ensureNextSpawned(); } catch {}
      try { this._ensureBridge(); } catch {}
    }

    const alivePlayers = this._getAlivePlayers();
    const livingCount = alivePlayers.length;
    const isHubRoom = !!this.current?.arenaSpec?.rules?.isHub;
    let waitForParty = false;

    if (this.current.cleared && this.next && this.bridge?.built) {
      if (isHubRoom) {
        const portal = this.current.exitPortal || resolvePortalPoint(this.current);
        if (portal) {
          this.current.exitPortal = portal;
          const readyCount = this._countPlayersInRadius(alivePlayers, portal, HUB_PORTAL_TRIGGER_RADIUS);
          if (livingCount > 0 && readyCount >= livingCount) {
            this._waitForParty = false;
            this._enterNextRoom();
            return;
          }
          waitForParty = readyCount > 0 && readyCount < livingCount;
        }
      } else {
        const readyCount = this._countPlayersInAabb(alivePlayers, this.next.bounds, 12);
        if (livingCount > 0 && readyCount >= livingCount) {
          this._waitForParty = false;
          this._enterNextRoom();
          return;
        }
        waitForParty = readyCount > 0 && readyCount < livingCount;
      }
    } else if (this.current.cleared && this.current.isFloorFinal) {
      const nextReadyCount = this.current.exitPortal ? this._countPlayersInRadius(alivePlayers, this.current.exitPortal, FLOOR_EXIT_RADIUS) : 0;
      const hubReadyCount = this.current.hubReturnPortal ? this._countPlayersInRadius(alivePlayers, this.current.hubReturnPortal, HUB_RETURN_RADIUS) : 0;
      if (livingCount > 0 && hubReadyCount >= livingCount) {
        this._waitForParty = false;
        try {
          if (typeof this.state?._returnRunToHubPreserve === 'function') this.state._returnRunToHubPreserve();
        } catch {}
        return;
      }
      if (livingCount > 0 && nextReadyCount >= livingCount) {
        this._waitForParty = false;
        this._enterNextFloor();
        return;
      }
      waitForParty = (hubReadyCount > 0 && hubReadyCount < livingCount) || (nextReadyCount > 0 && nextReadyCount < livingCount);
    }

    this._waitForParty = waitForParty;
    this._applyDynamicBounds();
  }

  getGateById() { return null; }
  isGateSealed() { return false; }
  canPlayerInteractGate() { return false; }
  getGateInnerPoint(room, gate) { return { x: Number(gate?.x) || room?.centerX || 0, y: Number(gate?.y) || room?.centerY || 0 }; }
  getBreachInnerPoint(room, gate, inset = 24) { return this.getGateInnerPoint(room, gate, inset); }
  getGateOuterPoint(room, gate) { return { x: Number(gate?.x) || room?.centerX || 0, y: Number(gate?.y) || room?.centerY || 0 }; }
  getBreachOuterPoint(room, gate, out = 220) { return this.getGateOuterPoint(room, gate, out); }
  getGateContactPoint(room, gate) { return this.getGateInnerPoint(room, gate, 0); }
  applyGateDamage() {}
  tryStartGateRepair() { return false; }
  tryStartGateRewardRepair() { return false; }
  isWaitingForParty() { return !!this._waitForParty; }

  _makeNextRoomFromPlan(plan, roomMeta, centerX, centerY) {
    const serial = ++this._serial;
    return makeRoom({
      serial,
      floorNumber: plan.floorNumber,
      roomOrdinal: roomMeta.roomOrdinal,
      totalRooms: roomMeta.totalRooms,
      biomeKey: plan.biomeKey,
      templateKey: roomMeta.templateKey,
      templateRole: roomMeta.templateRole,
      encounterType: roomMeta.encounterType,
      encounterLabel: roomMeta.encounterLabel,
      difficultyScale: roomMeta.difficultyScale,
      connectorSize: roomMeta.connectorSize,
      entrySocket: roomMeta.entrySocket,
      exitSocket: roomMeta.exitSocket,
      portalSocket: roomMeta.portalSocket,
      routeStyle: roomMeta.routeStyle,
      lateralOffset: roomMeta.lateralOffset,
      centerX,
      centerY,
    });
  }

  _spawnRoomFromMeta(fromRoom, plan, roomMeta, serialHint = 1) {
    const nextSide = getRoomSide(serialHint, roomMeta.templateKey, plan.floorNumber);
    const placed = computePlacedCenter(fromRoom, roomMeta, nextSide);
    return this._makeNextRoomFromPlan(plan, roomMeta, placed.x, placed.y);
  }

  _ensureNextSpawned() {
    if (!this.current || !this.current.cleared) return;
    if (this.next && !this.next.removed) return;

    if ((this.current.index | 0) <= 0) {
      if (!this._activeFloorPlan) {
        this._activeFloorPlan = buildFloorPlan(1, this._lastBiomeKey);
        this._lastBiomeKey = this._activeFloorPlan.biomeKey || this._lastBiomeKey;
      }
      const meta = this._activeFloorPlan.rooms[0];
      this.current.exitSocket = oppositeSocket(meta?.entrySocket || 'S', 'N');
      this.next = this._spawnRoomFromMeta(this.current, this._activeFloorPlan, meta, 1);
      return;
    }

    if (this.current.isFloorFinal) return;
    let plan = this._activeFloorPlan;
    if (!plan || !Array.isArray(plan.rooms) || !plan.rooms.length) {
      try {
        plan = buildFloorPlan(Math.max(1, this.current.floorNumber | 0), this._lastBiomeKey || this.current.biomeKey || '');
        this._activeFloorPlan = plan;
        this._lastBiomeKey = plan?.biomeKey || this._lastBiomeKey;
      } catch {
        plan = null;
      }
    }
    if (!plan || !Array.isArray(plan.rooms) || !plan.rooms.length) return;
    let nextMeta = plan.rooms[(this.current.roomOrdinal | 0)] || null;
    if (!nextMeta) {
      const fallbackOrdinal = Math.min(plan.rooms.length, Math.max(1, (this.current.roomOrdinal | 0) + 1));
      nextMeta = plan.rooms[fallbackOrdinal - 1] || null;
    }
    if (!nextMeta) return;
    this.next = this._spawnRoomFromMeta(this.current, plan, nextMeta, this._serial + 1);
  }

  _ensureBridge() {
    if (!this.current || !this.current.cleared || !this.next || this.current.isFloorFinal) return;
    if (this.bridge && (this.bridge.fromIndex | 0) === (this.current.index | 0) && (this.bridge.toIndex | 0) === (this.next.index | 0)) return;

    const width = getConnectorWidth(this.current, this.next);
    const fromSocket = String(this.current.exitSocket || this.next.entrySocket || 'N');
    const toSocket = String(this.next.entrySocket || oppositeSocket(fromSocket, 'S'));
    const fromPoint = roomAnchorPoint(this.current, fromSocket, 0);
    const toPoint = roomAnchorPoint(this.next, toSocket, 0);
    const instant = (this.current.index | 0) <= 0;
    this.bridge = {
      fromIndex: this.current.index | 0,
      toIndex: this.next.index | 0,
      width,
      fromSocket,
      toSocket,
      fromEdge: primaryEdgeForSocket(fromSocket, 'N'),
      toEdge: primaryEdgeForSocket(toSocket, 'S'),
      fromPoint,
      toPoint,
      bounds: expandLineAabb(fromPoint, toPoint, width * 0.5, 8),
      t: instant ? 1 : 0,
      progress: instant ? 1 : 0,
      built: instant,
    };
  }

  _getBridgeBuiltBounds() {
    const br = this.bridge;
    if (!br) return null;
    const p = clamp(br.progress || 0, 0, 1);
    if (p <= 0.001) return null;
    const fromX = Number(br.fromPoint?.x) || 0;
    const fromY = Number(br.fromPoint?.y) || 0;
    const toX = Number(br.toPoint?.x) || 0;
    const toY = Number(br.toPoint?.y) || 0;
    const builtPoint = {
      x: fromX + (toX - fromX) * p,
      y: fromY + (toY - fromY) * p,
    };
    return expandLineAabb(br.fromPoint, builtPoint, (Number(br.width) || 120) * 0.5, 8);
  }

  _enterNextRoom() {
    if (!this.current || !this.next) return;
    const old = this.current;
    old.collapsing = true;
    old.collapseT = 0;
    old.removed = false;
    this.prev = old;

    this.current = this.next;
    this.next = null;
    this.bridge = null;
    this._waitForParty = false;
    this._snapAlivePlayersIntoCurrentRoom();

    try {
      const ss = this.state?.spawnSystem;
      if (ss && typeof ss.onRoomChanged === 'function') ss.onRoomChanged(this.current);
    } catch {}

    this._applyDynamicBounds();
    try { scheduleRoomRenderWarmup(this.state); } catch {}
  }

  _enterNextFloor() {
    if (!this.current || !this.current.isFloorFinal) return;
    const old = this.current;
    const nextFloorNo = Math.max(1, (old.floorNumber | 0) + 1);
    this._activeFloorPlan = buildFloorPlan(nextFloorNo, this._lastBiomeKey || old.biomeKey || '');
    this._lastBiomeKey = this._activeFloorPlan.biomeKey || this._lastBiomeKey;

    const firstMeta = this._activeFloorPlan.rooms[0];
    const nextRoom = this._spawnRoomFromMeta(old, this._activeFloorPlan, firstMeta, this._serial + 1);

    old.collapsing = true;
    old.collapseT = 0;
    old.removed = false;
    this.prev = old;
    this.current = nextRoom;
    this.next = null;
    this.bridge = null;
    this._waitForParty = false;

    const start = this.current?.arenaSpec?.anchors?.playerStart;
    const ps = (this.state?.players && this.state.players.length) ? this.state.players : (this.state?.player ? [this.state.player] : []);
    for (const p of ps) {
      if (!p || (p.hp || 0) <= 0) continue;
      if (start && Number.isFinite(Number(start.x)) && Number.isFinite(Number(start.y))) {
        p.x = Number(start.x);
        p.y = Number(start.y);
      } else {
        p.x = this.current.centerX;
        p.y = this.current.centerY;
      }
    }

    try {
      const ss = this.state?.spawnSystem;
      if (ss && typeof ss.onRoomChanged === 'function') ss.onRoomChanged(this.current);
    } catch {}

    this._applyDynamicBounds();
    try { scheduleRoomRenderWarmup(this.state); } catch {}
  }

  forceSetCurrent(roomIndex, opts = null) {
    const idx = roomIndex | 0;
    if (idx <= 0) {
      this.prev = null;
      this.current = makeHubRoom();
      this.next = null;
      this.bridge = null;
      this._activeFloorPlan = null;
      this._applyDynamicBounds();
      try { scheduleRoomRenderWarmup(this.state); } catch {}
      return;
    }
    const floorNumber = Math.max(1, Number(opts?.floorNumber) || Number(this.state?._floorNumber) || 1);
    const biomeKey = String(opts?.biomeKey || opts?.biome || this.state?._roomBiome || '');
    const roomOrdinal = Math.max(1, Number(opts?.roomOrdinal) || Number(this.state?._floorRoomOrdinal) || 1);
    const totalRooms = Math.max(roomOrdinal, Number(opts?.totalRooms) || Number(this.state?._floorRoomsTotal) || 4);
    const templateKey = String(opts?.templateKey || this.state?._roomTemplateKey || (roomOrdinal >= totalRooms ? 'final_room' : 'cross_room'));
    const templateRole = String(opts?.templateRole || this.state?._roomTemplateRole || '');
    const entrySocket = String(opts?.entrySocket || this.state?._roomEntrySocket || 'S');
    const exitSocket = String(opts?.exitSocket || this.state?._roomExitSocket || '');
    const portalSocket = String(opts?.portalSocket || this.state?._roomPortalSocket || '');
    const routeStyle = String(opts?.routeStyle || this.state?._roomRouteStyle || '');
    const lateralOffset = Number(opts?.lateralOffset ?? this.state?._roomLateralOffset ?? 0) || 0;
    const centerX = Number(opts?.centerX ?? this.state?._roomCenterX ?? 0) || 0;
    const centerY = Number(opts?.centerY ?? this.state?._roomCenterY ?? 0) || 0;
    this._serial = Math.max(this._serial, idx);
    this.current = makeRoom({
      serial: idx,
      floorNumber,
      roomOrdinal,
      totalRooms,
      biomeKey,
      templateKey,
      templateRole,
      encounterType: String(opts?.encounterType || this.state?._roomEncounter || 'gauntlet'),
      encounterLabel: String(opts?.encounterLabel || this.state?._roomEncounterLabel || 'ВОЛНЫ'),
      difficultyScale: Number(opts?.difficultyScale || 1) || 1,
      connectorSize: String(opts?.connectorSize || 'standard'),
      entrySocket,
      exitSocket,
      portalSocket,
      routeStyle,
      lateralOffset,
      centerX,
      centerY,
    });
    this.current.cleared = !!opts?.cleared;
    if (this.current.cleared && (this.current.index | 0) > 0) {
      if (roomOrdinal >= totalRooms) {
        this.current.exitPortal = resolvePortalPoint(this.current);
        this.current.hubReturnPortal = resolveHubReturnPortalPoint(this.current);
      }
      this.current.shopNpc = null;
    }
    this.prev = null;
    this.next = null;
    this.bridge = null;
    if (!!opts?.hasNext && roomOrdinal < totalRooms) {
      const nextOrdinal = roomOrdinal + 1;
      const nextTemplateKey = String(opts?.nextTemplateKey || (nextOrdinal >= totalRooms ? 'final_room' : 'cross_room'));
      const nextTemplateRole = String(opts?.nextTemplateRole || (nextOrdinal >= totalRooms ? 'crown' : 'split'));
      const nextEntrySocket = String(opts?.nextEntrySocket || oppositeSocket(exitSocket || 'N', 'S'));
      const nextRouteStyle = String(opts?.nextRouteStyle || routeStyle || '');
      const nextLateralOffset = Number(opts?.nextLateralOffset ?? lateralOffset ?? 0) || 0;
      const nextMeta = {
        roomOrdinal: nextOrdinal,
        totalRooms,
        templateKey: nextTemplateKey,
        templateRole: nextTemplateRole,
        entrySocket: nextEntrySocket,
        exitSocket: '',
        portalSocket: '',
        routeStyle: nextRouteStyle,
        lateralOffset: nextLateralOffset,
        placementStep: socketVector(exitSocket || 'N', 'N'),
      };
      const hasPlacedCenter = Number.isFinite(Number(opts?.nextCenterX)) && Number.isFinite(Number(opts?.nextCenterY));
      const placed = hasPlacedCenter
        ? { x: Number(opts?.nextCenterX) || 0, y: Number(opts?.nextCenterY) || 0 }
        : computePlacedCenter(this.current, nextMeta, getRoomSide(idx + 1, nextTemplateKey, floorNumber));
      this.next = makeRoom({
        serial: idx + 1,
        floorNumber,
        roomOrdinal: nextOrdinal,
        totalRooms,
        biomeKey: String(opts?.nextBiome || opts?.nextBiomeKey || biomeKey || ''),
        templateKey: nextTemplateKey,
        templateRole: nextTemplateRole,
        encounterType: String(opts?.nextEncounterType || (nextOrdinal >= totalRooms ? 'boss' : 'gauntlet')),
        encounterLabel: String(opts?.nextEncounterLabel || (nextOrdinal >= totalRooms ? 'БОСС' : 'ВОЛНЫ')),
        difficultyScale: 1,
        connectorSize: 'standard',
        entrySocket: nextEntrySocket,
        exitSocket: '',
        portalSocket: '',
        routeStyle: nextRouteStyle,
        lateralOffset: nextLateralOffset,
        centerX: placed.x,
        centerY: placed.y,
      });
      const width = getConnectorWidth(this.current, this.next);
      const fromPoint = (opts?.bridgeFromPoint && typeof opts.bridgeFromPoint === 'object') ? opts.bridgeFromPoint : roomAnchorPoint(this.current, exitSocket || 'N', 0);
      const toPoint = (opts?.bridgeToPoint && typeof opts.bridgeToPoint === 'object') ? opts.bridgeToPoint : roomAnchorPoint(this.next, this.next.entrySocket || 'S', 0);
      this.bridge = {
        fromIndex: idx,
        toIndex: this.next.index | 0,
        width,
        fromSocket: String(opts?.bridgeFromSocket || exitSocket || 'N'),
        toSocket: String(opts?.bridgeToSocket || this.next.entrySocket || 'S'),
        fromEdge: primaryEdgeForSocket(String(opts?.bridgeFromSocket || exitSocket || 'N'), 'N'),
        toEdge: primaryEdgeForSocket(String(opts?.bridgeToSocket || this.next.entrySocket || 'S'), 'S'),
        fromPoint: { x: Number(fromPoint?.x) || 0, y: Number(fromPoint?.y) || 0 },
        toPoint: { x: Number(toPoint?.x) || 0, y: Number(toPoint?.y) || 0 },
        bounds: expandLineAabb(fromPoint, toPoint, width * 0.5, 8),
        t: Number(opts?.bridgeP) || 0,
        progress: Number(opts?.bridgeP) || 0,
        built: !!opts?.bridgeBuilt,
      };
    }
    this._activeFloorPlan = {
      floorNumber,
      biomeKey,
      rooms: Array.from({ length: totalRooms }, (_, i) => ({
        roomOrdinal: i + 1,
        totalRooms,
        templateKey: i + 1 === totalRooms ? 'final_room' : 'cross_room',
        templateRole: i + 1 === totalRooms ? 'crown' : 'split',
        entrySocket: i + 1 === roomOrdinal ? entrySocket : 'S',
        exitSocket: i + 1 === roomOrdinal ? exitSocket : 'N',
        portalSocket: i + 1 === totalRooms ? portalSocket : '',
        isFinal: i + 1 === totalRooms,
      })),
    };
    this._applyDynamicBounds();
    try { scheduleRoomRenderWarmup(this.state); } catch {}
  }

  _cleanupRoomEntities(room) {
    if (!room || !this.state) return;
    const st = this.state;
    const idx = room.index | 0;
    const killInArr = (name) => {
      const arr = Array.isArray(st[name]) ? st[name] : null;
      if (!arr) return;
      for (let i = arr.length - 1; i >= 0; i--) {
        const o = arr[i];
        if (!o) continue;
        if ((o._roomIndex | 0) === idx) arr.splice(i, 1);
      }
    };
    for (const e of (st.enemies || [])) {
      if (!e) continue;
      if ((e._roomIndex | 0) !== idx) continue;
      e._roomCleanup = true;
      e._remove = true;
      e.hp = 0;
    }
    killInArr('projectiles');
    killInArr('rockets');
    killInArr('xpOrbs');
    killInArr('summons');
  }

  _virtualZoneFromRoom(roomIndex) {
    const room = this.current;
    const floorNo = room?.floorNumber || 1;
    return 1 + Math.floor(Math.max(0, floorNo - 1) / 3);
  }

  _applyDynamicBounds() {
    if (!this.current) return;
    if (this.prev && !this.prev.removed) this.prev.breaches = buildTransitionBreaches(this.prev, this, 'prev');
    if (this.current) this.current.breaches = buildTransitionBreaches(this.current, this, 'current');
    if (this.next && !this.next.removed) this.next.breaches = buildTransitionBreaches(this.next, this, 'next');
    let union = this.current.bounds;
    if (this.prev && !this.prev.removed) union = unionAabb(union, this.prev.bounds, 20);
    if (this.bridge) {
      const built = this.bridge.built ? this.bridge.bounds : this._getBridgeBuiltBounds();
      if (built) union = unionAabb(union, built, 16);
    }
    if (this.current.cleared && this.next && this.bridge?.built) union = unionAabb(union, this.next.bounds, 20);
    setDynamicWorldBounds(union);

    const st = this.state;
    if (!st) return;
    st.currentRoomIndex = this.current.index | 0;
    st.currentZone = this._virtualZoneFromRoom(this.current.index | 0);
    st._roomSide = this.current.side | 0;
    st._hubSide = getRoomSide(0) | 0;
    st._roomCleared = !!this.current.cleared;
    st._roomHasNext = !!(this.next && !this.next.removed);
    st._roomBiome = String(this.current.biomeKey || '');
    st._nextRoomBiome = String((this.next && !this.next.removed) ? (this.next.biomeKey || '') : '');
    st._bridgeP = this.bridge ? (this.bridge.progress || 0) : 0;
    st._bridgeBuilt = !!(this.bridge && this.bridge.built);
    st._bridgeFrom = this.bridge ? (this.bridge.fromIndex | 0) : 0;
    st._bridgeTo = this.bridge ? (this.bridge.toIndex | 0) : 0;
    st._bridgeFromSocket = this.bridge ? String(this.bridge.fromSocket || '') : '';
    st._bridgeToSocket = this.bridge ? String(this.bridge.toSocket || '') : '';
    st._bridgeFromPoint = this.bridge?.fromPoint ? { ...this.bridge.fromPoint } : null;
    st._bridgeToPoint = this.bridge?.toPoint ? { ...this.bridge.toPoint } : null;
    st._waitForParty = !!this._waitForParty;
    st._gateButtons = [];
    st._gateHp = [];
    st._gateMax = [];
    st._gateReward = [];
    st._gateRepair = [];
    st._gateRepairMode = [];
    st._gatePressure = [];
    st._gateUsed = [];

    st._floorNumber = this.current.floorNumber | 0;
    st._floorRoomOrdinal = this.current.roomOrdinal | 0;
    st._floorRoomsTotal = this.current.totalRooms | 0;
    st._floorBiome = String(this.current.biomeKey || '');
    st._roomEncounter = String(this.current.encounterType || '');
    st._roomEncounterLabel = String(this.current.encounterLabel || '');
    st._roomTemplateKey = String(this.current.templateKey || '');
    st._roomTemplateRole = String(this.current.templateRole || '');
    st._roomEntrySocket = String(this.current.entrySocket || '');
    st._roomExitSocket = String(this.current.exitSocket || '');
    st._roomPortalSocket = String(this.current.portalSocket || '');
    st._roomRouteStyle = String(this.current.routeStyle || '');
    st._roomLateralOffset = Number(this.current.lateralOffset) || 0;
    st._roomCenterX = Number(this.current.centerX) || 0;
    st._roomCenterY = Number(this.current.centerY) || 0;
    st._nextRoomTemplateKey = String((this.next && !this.next.removed) ? (this.next.templateKey || '') : '');
    st._nextRoomTemplateRole = String((this.next && !this.next.removed) ? (this.next.templateRole || '') : '');
    st._nextRoomEntrySocket = String((this.next && !this.next.removed) ? (this.next.entrySocket || '') : '');
    st._nextRoomRouteStyle = String((this.next && !this.next.removed) ? (this.next.routeStyle || '') : '');
    st._nextRoomLateralOffset = Number((this.next && !this.next.removed) ? (this.next.lateralOffset || 0) : 0) || 0;
    st._nextRoomCenterX = Number((this.next && !this.next.removed) ? (this.next.centerX || 0) : 0) || 0;
    st._nextRoomCenterY = Number((this.next && !this.next.removed) ? (this.next.centerY || 0) : 0) || 0;
    st._nextRoomEncounter = String((this.next && !this.next.removed) ? (this.next.encounterType || '') : '');
    st._nextRoomEncounterLabel = String((this.next && !this.next.removed) ? (this.next.encounterLabel || '') : '');
    st._floorExitActive = !!(this.current.cleared && this.current.isFloorFinal && this.current.exitPortal);
    st._floorExitPortal = this.current.exitPortal ? { ...this.current.exitPortal } : null;
    st._hubReturnPortalActive = !!(this.current.cleared && this.current.isFloorFinal && this.current.hubReturnPortal);
    st._hubReturnPortal = this.current.hubReturnPortal ? { ...this.current.hubReturnPortal } : null;
    st._roomObjective = describeRoomObjective(this.current, this);
    st._roomNextHint = (this.next && !this.next.removed) ? `${String(this.next.templateRole || this.next.encounterLabel || this.next.encounterType || 'NEXT').toUpperCase()} • ${String(this.next.biomeKey || this.current.biomeKey || '').toUpperCase()}` : '';
    st._roomLabel = this.current.index <= 0 ? 'HUB' : `FLOOR ${this.current.floorNumber} • ROOM ${this.current.roomOrdinal}/${this.current.totalRooms} • ${this.current.encounterLabel || this.current.encounterType || 'WAVES'}`;
    st._roomIsBoss = !!this.current.isFloorFinal;
    st._roomIsMiniBoss = false;
  }
}
