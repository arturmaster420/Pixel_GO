import { createBasicMob } from "../enemies/mobBasic.js";
import { createEliteMob } from "../enemies/mobElite.js";
import { createRoamingBoss } from "../enemies/roamingBoss.js";
import { createBiomeMob, createBiomeEliteMob } from "../enemies/biomeMobs.js";
import { getGateHalfLenForRoomSide } from "./roomDirector.js";
import { clampEntityToRoomWalkable, randomPointInRoomWalkable, pointInRoomWalkable } from "./floorCollision.js";

function clamp(n, a, b) {
  return n < a ? a : (n > b ? b : n);
}

function getPartyCount(state) {
  const ps = (state && state.players && state.players.length)
    ? state.players
    : (state && state.player ? [state.player] : []);
  if (!ps.length) return 1;
  const ids = new Set();
  for (const p of ps) {
    if (!p) continue;
    if (p.id != null) ids.add(String(p.id));
  }
  const n = ids.size || ps.length;
  return Math.max(1, n | 0);
}

// Each additional player adds +150% of the base wave size.
// 1p => 1.0x, 2p => 2.5x, 3p => 4.0x, ...
function getPartyWaveScale(partyCount) {
  const extra = Math.max(0, (partyCount | 0) - 1);
  return 1 + 1.5 * extra;
}

function getPlayers(state) {
  const arr = (state.players && state.players.length) ? state.players : (state.player ? [state.player] : []);
  return arr.filter((p) => p && p.hp > 0);
}

function distance2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function randomInRoom(roomOrBounds) {
  if (roomOrBounds && roomOrBounds.arenaSpec) return randomPointInRoomWalkable(roomOrBounds);
  const bounds = roomOrBounds;
  const x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
  const y = bounds.minY + Math.random() * (bounds.maxY - bounds.minY);
  return { x, y };
}

function pickSpawnPos(bounds, players, minDist = 260, tries = 12) {
  const minD2 = minDist * minDist;
  let pos = randomInRoom(bounds);
  for (let i = 0; i < tries; i++) {
    pos = randomInRoom(bounds);
    let ok = true;
    for (const p of players) {
      if (!p) continue;
      if (distance2(pos.x, pos.y, p.x, p.y) < minD2) { ok = false; break; }
    }
    if (ok) return pos;
  }
  return pos;
}

function clampInside(self, roomOrBounds, pad = 10) {
  if (roomOrBounds && roomOrBounds.arenaSpec) {
    clampEntityToRoomWalkable(self, roomOrBounds, { pad });
    return;
  }
  const b = roomOrBounds;
  const r = (self.radius || 20) + pad;
  if (self.x < b.minX + r) self.x = b.minX + r;
  if (self.x > b.maxX - r) self.x = b.maxX - r;
  if (self.y < b.minY + r) self.y = b.minY + r;
  if (self.y > b.maxY - r) self.y = b.maxY - r;
}

function gateLaneHalfSpan(room) {
  return Math.max(14, getGateHalfLenForRoomSide(room?.side || 600) * 0.68);
}

function getGateLaneOffset(entity, room) {
  const span = gateLaneHalfSpan(room);
  return clamp(Number(entity?._gateLaneOffset) || 0, -span, span);
}

function withGateLane(side, point, laneOffset = 0) {
  const p = { x: Number(point?.x) || 0, y: Number(point?.y) || 0 };
  const sideKey = String(side || 'S').toUpperCase();
  if (sideKey === 'W' || sideKey === 'E') p.y += laneOffset;
  else p.x += laneOffset;
  return p;
}

function getGatePointWithLane(rd, room, gate, kind, enemyRadius = 20, laneOffset = 0) {
  if (!rd || !room || !gate) return { x: 0, y: 0 };
  const sideKey = String(gate?.side || 'S').toUpperCase();
  if (kind === 'contact') return withGateLane(sideKey, rd.getGateContactPoint(room, gate, enemyRadius, 2), laneOffset);
  if (kind === 'inner') return withGateLane(sideKey, rd.getGateInnerPoint(room, gate, 54), laneOffset);
  const out = kind === 'outerFar' ? clamp((room.side || 600) * 0.25, 220, 820) : clamp((room.side || 600) * 0.18, 150, 520);
  return withGateLane(sideKey, rd.getGateOuterPoint(room, gate, out), laneOffset);
}

function countAliveGateEnemies(state, roomIndex, gateId) {
  let n = 0;
  for (const e of (state?.enemies || [])) {
    if (!e || e.dead || (e.hp || 0) <= 0) continue;
    if ((e._roomIndex | 0) !== (roomIndex | 0)) continue;
    if (String(e._spawnGateId || '') !== String(gateId || '')) continue;
    n++;
  }
  return n;
}

function makeGateLaneOffset(load = 0, room = null) {
  const span = gateLaneHalfSpan(room);
  const slots = [-0.72, -0.38, 0, 0.38, 0.72];
  const base = slots[Math.abs(load | 0) % slots.length] * span;
  const jitter = (Math.random() - 0.5) * Math.min(10, span * 0.14);
  return clamp(base + jitter, -span, span);
}


function applyGateCrowdSeparation(self, state, roomIndex, gateId) {
  if (!self || !state || !Array.isArray(state.enemies) || !gateId) return;
  const desiredPad = 6;
  for (const other of state.enemies) {
    if (!other || other === self || other.dead || (other.hp || 0) <= 0) continue;
    if ((other._roomIndex | 0) !== (roomIndex | 0)) continue;
    if (String(other._spawnGateId || '') !== String(gateId || '')) continue;
    const otherGate = other._gateEnter || null;
    if (otherGate?.entered && ((state?.time || 0) - (otherGate.openTime || 0)) > 0.75) continue;
    const minDist = Math.max(24, (self.radius || 18) + (other.radius || 18) + desiredPad);
    let dx = self.x - other.x;
    let dy = self.y - other.y;
    let dist = Math.hypot(dx, dy);
    if (dist >= minDist) continue;
    if (dist < 0.001) {
      const lane = (Number(self._gateLaneOffset) || 0) - (Number(other._gateLaneOffset) || 0);
      dx = Math.abs(lane) > 1 ? lane : ((Math.random() - 0.5) * 2);
      dy = Math.abs(lane) <= 1 ? ((Math.random() - 0.5) * 2) : 0;
      dist = Math.hypot(dx, dy) || 1;
    }
    const push = (minDist - dist) * 0.5;
    const nx = dx / dist;
    const ny = dy / dist;
    self.x += nx * push;
    self.y += ny * push;
  }
}

// Gate-aware enemy update:
// - while outside (not "entered"), enemies move toward their assigned gate
// - if gate is sealed, they press against it and damage it
// - if gate is open, they pass through the opening and then switch to normal AI
function wrapGateApproachUpdate(enemy, roomIndex, gateId, pad = 10) {
  if (!enemy || typeof enemy.update !== "function") return;
  const orig = enemy.update;

  enemy.update = (self, dt, state) => {
    const rd = state && state.roomDirector;
    const room = rd && rd.current;
    if (!room || (room.index | 0) !== (roomIndex | 0) || !gateId || !rd.getGateById) {
      orig(self, dt, state);
      if (room) clampInside(self, room, pad);
      return;
    }

    const gate = rd.getGateById(String(gateId));
    if (!gate) {
      orig(self, dt, state);
      clampInside(self, room, pad);
      return;
    }

    const ge = (self._gateEnter ||= { entered: false, openTime: 0 });
    const b = room.bounds;
    const halfLen = getGateHalfLenForRoomSide(room.side || 600) * 0.94;
    const laneOffset = getGateLaneOffset(self, room);
    const sealed = (typeof rd.isGateSealed === 'function')
      ? rd.isGateSealed(gate)
      : ((gate.sealHp || 0) > 0.02 || (gate.rewardSealLeft || 0) > 0.02);

    if (!ge.entered) {
      const r = (self.radius || 20);
      const baseSpeed = (self.speed || 80);
      const approachMult = (typeof self.gateApproachMult === "number") ? self.gateApproachMult : 1;
      const speed = clamp(baseSpeed * 0.65 * approachMult, 45, 115);

      const contactPoint = getGatePointWithLane(rd, room, gate, 'contact', r, laneOffset);
      const innerPoint = getGatePointWithLane(rd, room, gate, 'inner', r, laneOffset);
      const target = sealed ? contactPoint : innerPoint;

      const dx = target.x - self.x;
      const dy = target.y - self.y;
      const dist = Math.hypot(dx, dy) || 1;

      const nearGate = distance2(self.x, self.y, contactPoint.x, contactPoint.y) <= Math.max(64, r * 2.2) ** 2;
      if (sealed && nearGate) {
        const sideKey = String(gate.side || 'S').toUpperCase();
        const laneEase = clamp(dt * 6.5, 0, 1);
        if (sideKey === 'W' || sideKey === 'E') {
          self.y += (contactPoint.y - self.y) * laneEase;
        } else {
          self.x += (contactPoint.x - self.x) * laneEase;
        }
      } else {
        self.x += (dx / dist) * speed * dt;
        self.y += (dy / dist) * speed * dt;
      }

      const sideKey = String(gate.side || 'S').toUpperCase();
      if (sideKey === 'W') {
        const within = Math.abs(self.y - contactPoint.y) <= halfLen;
        const limitOutsideX = b.minX - (r + pad);
        const limitInsideX = b.minX + (r + pad);
        if (sealed || !within) {
          if (self.x > limitOutsideX) self.x = limitOutsideX;
        } else if (self.x >= limitInsideX || (pointInRoomWalkable(room, self.x, self.y, 2) && distance2(self.x, self.y, innerPoint.x, innerPoint.y) <= Math.max(18, r * 0.9) ** 2)) {
          ge.entered = true;
          ge.openTime = state?.time || 0;
        }
      } else if (sideKey === 'E') {
        const within = Math.abs(self.y - contactPoint.y) <= halfLen;
        const limitOutsideX = b.maxX + (r + pad);
        const limitInsideX = b.maxX - (r + pad);
        if (sealed || !within) {
          if (self.x < limitOutsideX) self.x = limitOutsideX;
        } else if (self.x <= limitInsideX || (pointInRoomWalkable(room, self.x, self.y, 2) && distance2(self.x, self.y, innerPoint.x, innerPoint.y) <= Math.max(18, r * 0.9) ** 2)) {
          ge.entered = true;
          ge.openTime = state?.time || 0;
        }
      } else if (sideKey === 'N') {
        const within = Math.abs(self.x - contactPoint.x) <= halfLen;
        const limitOutsideY = b.minY - (r + pad);
        const limitInsideY = b.minY + (r + pad);
        if (sealed || !within) {
          if (self.y > limitOutsideY) self.y = limitOutsideY;
        } else if (self.y >= limitInsideY || (pointInRoomWalkable(room, self.x, self.y, 2) && distance2(self.x, self.y, innerPoint.x, innerPoint.y) <= Math.max(18, r * 0.9) ** 2)) {
          ge.entered = true;
          ge.openTime = state?.time || 0;
        }
      } else {
        const within = Math.abs(self.x - contactPoint.x) <= halfLen;
        const limitOutsideY = b.maxY + (r + pad);
        const limitInsideY = b.maxY - (r + pad);
        if (sealed || !within) {
          if (self.y < limitOutsideY) self.y = limitOutsideY;
        } else if (self.y <= limitInsideY || (pointInRoomWalkable(room, self.x, self.y, 2) && distance2(self.x, self.y, innerPoint.x, innerPoint.y) <= Math.max(18, r * 0.9) ** 2)) {
          ge.entered = true;
          ge.openTime = state?.time || 0;
        }
      }

      applyGateCrowdSeparation(self, state, roomIndex, gateId);
      clampInside(self, room, pad);

      if (sealed && typeof rd.applyGateDamage === 'function') {
        const cp = contactPoint;
        const cd2 = distance2(self.x, self.y, cp.x, cp.y);
        const contactR = Math.max(16, r * 0.82);
        const aligned = (sideKey === 'W' || sideKey === 'E')
          ? (Math.abs(self.y - cp.y) <= halfLen)
          : (Math.abs(self.x - cp.x) <= halfLen);
        if (aligned && cd2 <= contactR * contactR) {
          const gateMult = (typeof self.gateDmgMult === "number") ? self.gateDmgMult : 1;
          rd.applyGateDamage(String(gateId), (self.damage || 5) * dt * 0.55 * gateMult, self);
        }
      }

      return;
    }

    orig(self, dt, state);
    clampInside(self, room, pad);
  };
}

function pickGateSpawn(state, room, rd, players, minDist = 260) {
  if (!room || !rd) return null;
  const gates = Array.isArray(room.breaches) ? room.breaches : [];
  if (!gates.length) return null;

  const minD2 = minDist * minDist;
  const cands = [];
  const all = [];
  for (const g of gates) {
    if (!g) continue;
    const ip = rd.getGateInnerPoint ? rd.getGateInnerPoint(room, g, 34) : rd.getBreachInnerPoint(room, g, 34);
    const load = countAliveGateEnemies(state, room.index | 0, g.id);
    const item = { g, ip, load };
    all.push(item);
    let ok = true;
    for (const p of players) {
      if (!p) continue;
      if (distance2(ip.x, ip.y, p.x, p.y) < minD2) { ok = false; break; }
    }
    if (ok) cands.push(item);
  }

  const poolBase = cands.length ? cands : all;
  const minLoad = poolBase.reduce((m, item) => Math.min(m, item.load), Infinity);
  const pool = poolBase.filter((item) => item.load <= minLoad + 1);
  const pick = pool[(Math.random() * pool.length) | 0] || poolBase[0];
  if (!pick) return null;

  const side = (room.side || 600);
  const out = clamp(side * 0.25, 220, 820);
  const laneOffset = makeGateLaneOffset(pick.load, room);
  const op = withGateLane(pick.g.side, (rd.getGateOuterPoint ? rd.getGateOuterPoint(room, pick.g, out) : rd.getBreachOuterPoint(room, pick.g, out)), laneOffset);

  return {
    gateId: pick.g.id,
    side: pick.g.side,
    outside: op,
    laneOffset,
    gateLoad: pick.load,
  };
}

export class RoomSpawnSystem {
  constructor(state) {
    this.state = state;

    this.roomIndex = 0;
    this.roomId = "room_0";

    this.killed = 0;
    this.spawned = 0;
    this.quotaTotal = 0;
    this.aliveCap = 0;

    // Waves (SAS-like): room is cleared after finishing all waves.
    this.wavesTotal = 0;
    this.waveIndex = 0; // 0-based
    this.waveSpawned = 0; // spawned in current wave
    this.waveTarget = 0; // how many to spawn this wave
    this._waveSizes = null;

    // Pause between waves (SAS feel): a short breather after each cleared wave.
    this._waveRestLeft = 0;
    this._pendingWaveAdvance = false;

    this.isMiniBossRoom = false;
    this.isBossRoom = false;

    this._miniBossId = null;
    this._bossId = null;
    this._bossSpawned = false;

    this._spawnTimer = 0;
    this._lastRoomChangeAt = 0;

    this.partyCount = 1;
    this.partyWaveScale = 1;

    // Init from director if present
    const rd = state.roomDirector;
    if (rd && rd.current) this.onRoomChanged(rd.current);
  }

  // Compatibility with old loop
  onZoneChanged() {}

  onRoomChanged(room) {
    if (!room) return;

    this.roomIndex = room.index | 0;
    this.roomId = room.id || `room_${this.roomIndex}`;

    // Reset per-room counters
    this.killed = 0;
    this.spawned = 0;
    this._spawnTimer = 0;

    this.wavesTotal = 0;
    this.waveIndex = 0;
    this.waveSpawned = 0;
    this.waveTarget = 0;
    this._waveSizes = null;
    this._bossSpawned = false;
    this._waveRestLeft = 0;
    this._pendingWaveAdvance = false;
    this._miniBossId = null;
    this._bossId = null;

    // Every playable floor ends with its own boss.
    this.isBossRoom = this.roomIndex > 0;
    this.isMiniBossRoom = false;

    // Party scaling (host authoritative): every extra player adds +150% wave size.
    // We compute it on room change, so all wave targets/quota are consistent.
    this.partyCount = getPartyCount(this.state);
    this.partyWaveScale = getPartyWaveScale(this.partyCount);

    // quota/aliveCap (kept) + waves distribution
    if (this.roomIndex <= 0) {
      this.quotaTotal = 0;
      this.aliveCap = 0;
      this.wavesTotal = 0;
      this._waveSizes = [];
    } else {
      this.quotaTotal = 9 + Math.floor(this.roomIndex * 2.0);
      this.aliveCap = Math.min(28, 6 + Math.floor(this.roomIndex * 0.5));
      // Because every floor now ends with a boss, keep the mob quota tighter.
      if (this.isBossRoom) this.quotaTotal = Math.max(8, Math.floor(this.quotaTotal * 0.78));
      // Early floors should stay snappier because every floor already ends with a boss.
      if (this.roomIndex <= 3) {
        this.quotaTotal = Math.max(7, Math.floor(this.quotaTotal * 0.84));
        this.aliveCap = Math.min(this.aliveCap, 6);
      } else if (this.roomIndex <= 6) {
        this.quotaTotal = Math.max(9, Math.floor(this.quotaTotal * 0.90));
        this.aliveCap = Math.min(this.aliveCap, 7);
      }

      // Apply party scaling AFTER boss adjustments.
      // Note: aliveCap stays the same (performance-friendly); only wave size scales.
      this.quotaTotal = Math.max(1, Math.round(this.quotaTotal * this.partyWaveScale));

      // Fewer waves per room so the boss remains the main finale.
      let waves = clamp(this.roomIndex <= 3 ? 2 : 2 + Math.floor(this.roomIndex * 0.65), 2, 8);
      this.wavesTotal = waves;

      // Distribute the quota across waves so total kills stays consistent.
      const base = Math.floor(this.quotaTotal / this.wavesTotal);
      const rem = this.quotaTotal - base * this.wavesTotal;
      this._waveSizes = Array.from({ length: this.wavesTotal }, (_, i) => base + (i < rem ? 1 : 0));
      this.waveIndex = 0;
      this.waveTarget = this._waveSizes[0] || 0;
      this.waveSpawned = 0;
    }

    // For HUD
    if (this.state) {
      this.state._roomQuota = this.quotaTotal | 0;
      this.state._roomKilled = 0;
      this.state._roomAliveCap = this.aliveCap | 0;
      this.state._roomIsBoss = !!this.isBossRoom;
      this.state._roomIsMiniBoss = !!this.isMiniBossRoom;
      this.state._roomBossAlive = false;
      this.state._roomBossArenaType = String(room?.arenaSpec?.bossArena?.arenaType || '');

      this.state._roomWavesTotal = this.wavesTotal | 0;
      this.state._roomWaveIndex = 0;

      // Pre-wave delay before the very first wave on this floor (3s).
      if ((this.roomIndex | 0) > 0) {
        this._waveRestLeft = Math.max(this._waveRestLeft || 0, 3);
        this._pendingWaveAdvance = false;
      }
    }
  }

  update(dt) {
    const state = this.state;
    const rd = state.roomDirector;
    const room = rd && rd.current;
    if (!room) return;

    // If the host is waiting for all alive players to enter this floor, pause spawns.
    if (rd && typeof rd.isWaitingForParty === 'function' && rd.isWaitingForParty()) {
      return;
    }

    // Hub: no spawns
    if ((room.index | 0) <= 0) {
      // Ensure hub is always "cleared" (so room1 exists)
      if (!room.cleared) room.cleared = true;
      return;
    }

    // Ensure counters are synced if room changed without calling onRoomChanged
    if ((room.index | 0) !== (this.roomIndex | 0)) this.onRoomChanged(room);

    const bounds = room.bounds;
    const players = getPlayers(state);

    const hubSide = (state && (state._hubSide | 0) > 0) ? (state._hubSide | 0) : 600;
    const side = room.side || hubSide;
    // Smaller early rooms need smaller minimum spawn distance.
    const spawnMinDist = clamp(180 + (side - hubSide) * 0.02, 150, 320);

    // Count alive enemies in this room
    let aliveInRoom = 0;
    for (const e of (state.enemies || [])) {
      if (!e || e.dead) continue;
      if ((e._roomIndex | 0) !== (this.roomIndex | 0)) continue;
      aliveInRoom++;
    }

    // Each floor now has a finale boss, but it should appear only after the regular waves are done.
    const zone = this._virtualZoneFromRoom(this.roomIndex);

    // If current room is already cleared, stop spawning.
    if (room.cleared) return;

    // Wave progression: if we spawned the full wave and all enemies are dead, advance.
    if (this.wavesTotal > 0 && this.waveIndex < this.wavesTotal) {
      if (this.waveSpawned >= this.waveTarget && aliveInRoom === 0) {
        // Inter-wave break (5s)
        if (this.waveIndex < this.wavesTotal - 1) {
          this._pendingWaveAdvance = true;
          if (this._waveRestLeft <= 0) this._waveRestLeft = 5;
        } else {
          // Last wave finished: proceed immediately to clear check.
          this.waveIndex++;
          this.waveSpawned = 0;
          this.waveTarget = 0;
          if (state) state._roomWaveIndex = this.waveIndex | 0;
        }
      }
    }

    // Handle inter-wave break
    if (this._waveRestLeft > 0) {
      this._waveRestLeft -= dt;
      if (this._waveRestLeft <= 0) {
        this._waveRestLeft = 0;
        if (this._pendingWaveAdvance) {
          this._pendingWaveAdvance = false;
          this.waveIndex++;
          this.waveSpawned = 0;
          this.waveTarget = (this._waveSizes && this._waveSizes[this.waveIndex]) ? this._waveSizes[this.waveIndex] : 0;
          this._spawnTimer = 0;
          if (state) state._roomWaveIndex = this.waveIndex | 0;
        }
      }
      // During the rest period, do not spawn.
      return;
    }

    // After all normal waves are cleared, spawn the floor boss in the room center.
    if (this.wavesTotal > 0 && this.waveIndex >= this.wavesTotal) {
      if (this.isBossRoom && !this._bossSpawned && aliveInRoom === 0) {
        const arenaBossSpawn = room?.arenaSpec?.anchors?.bossSpawn;
        const pos = arenaBossSpawn ? { x: Number(arenaBossSpawn.x) || room.centerX, y: Number(arenaBossSpawn.y) || room.centerY } : { x: room.centerX, y: room.centerY };
        const boss = createRoamingBoss(zone, pos, {
          floorIndex: this.roomIndex,
          biomeKey: room.biomeKey || "",
          bossArena: room?.arenaSpec?.bossArena || null,
          bossMoveNodes: room?.arenaSpec?.anchors?.bossMoveNodes || [],
          hazardZones: room?.arenaSpec?.hazardZones || [],
        });
        boss._roomIndex = this.roomIndex;
        boss._roomId = this.roomId;
        boss._isBoss = true;
        boss._isRoomBoss = true;
        boss.id = boss.id || `boss_${this.roomIndex}_${Math.floor(Math.random() * 1e9)}`;
        this._bossId = boss.id;
        this._bossSpawned = true;
        state.enemies.push(boss);
        if (state) state._roomBossAlive = true;
        return;
      }
      this._checkClearCondition();
      return;
    }

    // Spawn cadence
    const spawnInterval = clamp((this.roomIndex <= 4 ? 1.02 : 0.92) - this.roomIndex * 0.005, 0.28, 1.02);
    this._spawnTimer += dt;
    if (this._spawnTimer < spawnInterval) return;
    this._spawnTimer = 0;

    // Don't exceed caps / wave target
    const remainingInWave = (this.waveTarget | 0) - (this.waveSpawned | 0);
    if (remainingInWave <= 0) return;

    const freeSlots = this.aliveCap - aliveInRoom;
    if (freeSlots <= 0) return;

    const maxBatch = clamp(3 + Math.floor(this.roomIndex / 18), 3, 8);
    const batch = Math.min(remainingInWave, freeSlots, maxBatch);

    for (let i = 0; i < batch; i++) {
      const gPick = pickGateSpawn(state, room, rd, players, spawnMinDist);
      if (!gPick) return;

      // Spawn OUTSIDE the platform so enemies walk in "from behind".
      // Add a small tangential jitter so they don't stack.
      let pos = { x: gPick.outside.x, y: gPick.outside.y };
      const jitter = 26;
      if (gPick.side === 'W' || gPick.side === 'E') {
        pos.y += (Math.random() - 0.5) * jitter * 2;
      } else {
        pos.x += (Math.random() - 0.5) * jitter * 2;
      }

      // Type selection
      const eliteChance = clamp(0.015 + this.roomIndex * 0.0014, 0.015, 0.16);
      const useElite = Math.random() < eliteChance;

      const biomeKey = String(room.biomeKey || "");
      const biomeMobChance = this.roomIndex <= 5 ? 0.30 : 0.42;
      const useBiome = !useElite && biomeKey && (Math.random() < biomeMobChance);
      const enemy = useElite
        ? (biomeKey ? createBiomeEliteMob(biomeKey, zone, pos) : createEliteMob(zone, pos))
        : (useBiome ? createBiomeMob(biomeKey, zone, pos) : createBasicMob(zone, pos));

      // If this is a plain basic mob on a biome floor, tag its kind for joiner visuals.
      if (!useElite && biomeKey && !useBiome) {
        enemy.kind = `${String(biomeKey).toLowerCase()}Basic`;
      }

      // Let even basic mobs inherit a biome tint (for host visuals)
      if (biomeKey && !enemy._biomeKey) enemy._biomeKey = biomeKey;
      enemy._roomIndex = this.roomIndex;
      enemy._roomId = this.roomId;
      enemy.id = enemy.id || `e_${this.roomIndex}_${this.spawned}_${Math.floor(Math.random() * 1e6)}`;

      // Gate-spawned enemies: start outside and keep moving until they enter.
      enemy._spawnGateId = gPick.gateId;
      enemy._gateLaneOffset = Number(gPick.laneOffset) || 0;
      enemy._gateEnter = { entered: false, openTime: 0 };
      // Make sure they actually move from outside (even if far).
      enemy.aggroRange = 5000;
      enemy.aggroed = true;

      wrapGateApproachUpdate(enemy, this.roomIndex, gPick.gateId, 10);
      state.enemies.push(enemy);
      this.spawned++;
      this.waveSpawned++;
    }

    // HUD mirrors
    if (state) {
      state._roomKilled = this.killed | 0;
      state._roomQuota = this.quotaTotal | 0;
      state._roomWavesTotal = this.wavesTotal | 0;
      state._roomWaveIndex = this.waveIndex | 0;
    }
  }

  onEnemyRemoved(enemy) {
    if (!enemy) return;
    if (enemy._roomCleanup) return;

    const idx = enemy._roomIndex | 0;
    if (idx !== (this.roomIndex | 0)) return;

    // Only count actual kills (hp <= 0) and not forced removals.
    if ((enemy.hp || 0) <= 0) {
      this.killed++;
      if (this.state) this.state._roomKilled = this.killed | 0;
    }

    // Boss/mini-boss death tracking
    if (this.isBossRoom && enemy._isRoomBoss) {
      if (this.state) this.state._roomBossAlive = false;
    }
    if (this.isMiniBossRoom && enemy._isMiniBoss) {
      if (this.state) this.state._roomBossAlive = false;
    }

    this._checkClearCondition();
  }

  _checkClearCondition() {
    const state = this.state;
    const rd = state.roomDirector;
    const room = rd && rd.current;
    if (!room) return;

    // If the host is waiting for all alive players to enter this floor, pause spawns.
    if (rd && typeof rd.isWaitingForParty === 'function' && rd.isWaitingForParty()) {
      return;
    }
    if (room.index !== this.roomIndex) return;
    if (room.cleared) return;

    // Must meet kill quota.
    if (this.killed < this.quotaTotal) return;

    // Boss rooms must actually spawn their finale boss before the floor can clear.
    if (this.isBossRoom) {
      if (!this._bossSpawned) return;
      const bossAlive = (state.enemies || []).some((e) => e && !e.dead && (e._roomIndex | 0) === this.roomIndex && e._isRoomBoss && e.hp > 0);
      if (bossAlive) return;
    }

    if (this.isMiniBossRoom) {
      const mbAlive = (state.enemies || []).some((e) => e && !e.dead && (e._roomIndex | 0) === this.roomIndex && e._isMiniBoss && e.hp > 0);
      if (mbAlive) return;
    }

    // Also ensure no other enemies in the room remain.
    const anyAlive = (state.enemies || []).some((e) => e && !e.dead && (e._roomIndex | 0) === this.roomIndex && e.hp > 0);
    if (anyAlive) return;

    // Clear!
    try { rd.markCurrentCleared(); } catch {}
  }

  _virtualZoneFromRoom(roomIndex) {
    if ((roomIndex | 0) <= 0) return 0;
    return 1 + Math.floor(((roomIndex | 0) - 1) / 10);
  }
}
