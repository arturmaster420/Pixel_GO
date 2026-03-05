import { createBasicMob } from "../enemies/mobBasic.js";
import { createEliteMob } from "../enemies/mobElite.js";
import { createRoamingBoss } from "../enemies/roamingBoss.js";
import { getGateHalfLenForRoomSide } from "./roomDirector.js";

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

function randomInRoom(bounds) {
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

function clampInside(self, bounds, pad = 10) {
  const b = bounds;
  const r = (self.radius || 20) + pad;
  if (self.x < b.minX + r) self.x = b.minX + r;
  if (self.x > b.maxX - r) self.x = b.maxX - r;
  if (self.y < b.minY + r) self.y = b.minY + r;
  if (self.y > b.maxY - r) self.y = b.maxY - r;
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
      if (room) clampInside(self, room.bounds, pad);
      return;
    }

    const gate = rd.getGateById(String(gateId));
    if (!gate) {
      orig(self, dt, state);
      clampInside(self, room.bounds, pad);
      return;
    }

    // Track whether this enemy already entered the room.
    const ge = (self._gateEnter ||= { entered: false });
    const b = room.bounds;
    const halfLen = getGateHalfLenForRoomSide(room.side || 600) * 0.95;
    const sealed = (typeof rd.isGateSealed === 'function') ? rd.isGateSealed(gate) : ((gate.sealHp || 0) > 0.02 || (gate.rewardSealLeft || 0) > 0.02);

    if (!ge.entered) {
      // Outside-phase: approach/attack gate
      const r = (self.radius || 20);
      const baseSpeed = (self.speed || 80);
      // Approach speed: keep it readable + give the player time to react/fix gates.
      // (Previously this was boosted too much and enemies reached the gate instantly.)
      const speed = clamp(baseSpeed * 0.65, 55, 120);

      const target = sealed
        ? rd.getGateContactPoint(room, gate, r, 3)
        : rd.getGateInnerPoint(room, gate, 54);

      const dx = target.x - self.x;
      const dy = target.y - self.y;
      const dist = Math.hypot(dx, dy) || 1;
      self.x += (dx / dist) * speed * dt;
      self.y += (dy / dist) * speed * dt;

      // Barrier: only allow entry through the gate opening when NOT sealed.
      if (gate.side === 'W') {
        const within = Math.abs(self.y - gate.y) <= halfLen;
        const limitOutsideX = b.minX - (r + pad);
        const limitInsideX = b.minX + (r + pad);
        if (sealed || !within) {
          if (self.x > limitOutsideX) self.x = limitOutsideX;
        } else {
          // Open & aligned: allow passing through.
          if (self.x >= limitInsideX) ge.entered = true;
          // Don't allow sneaking in outside the opening.
          if (!within && self.x > limitOutsideX) self.x = limitOutsideX;
        }
      } else if (gate.side === 'E') {
        const within = Math.abs(self.y - gate.y) <= halfLen;
        const limitOutsideX = b.maxX + (r + pad);
        const limitInsideX = b.maxX - (r + pad);
        if (sealed || !within) {
          if (self.x < limitOutsideX) self.x = limitOutsideX;
        } else {
          if (self.x <= limitInsideX) ge.entered = true;
        }
      } else if (gate.side === 'S') {
        const within = Math.abs(self.x - gate.x) <= halfLen;
        const limitOutsideY = b.maxY + (r + pad);
        const limitInsideY = b.maxY - (r + pad);
        if (sealed || !within) {
          if (self.y < limitOutsideY) self.y = limitOutsideY;
        } else {
          if (self.y <= limitInsideY) ge.entered = true;
        }
      }

      // Attack the gate if sealed and we are in contact.
      if (sealed && typeof rd.applyGateDamage === 'function') {
        const cp = rd.getGateContactPoint(room, gate, r, 2);
        const cd2 = distance2(self.x, self.y, cp.x, cp.y);
        const contactR = Math.max(16, r * 0.75);
        const aligned = (gate.side === 'S') ? (Math.abs(self.x - gate.x) <= halfLen) : (Math.abs(self.y - gate.y) <= halfLen);
        if (aligned && cd2 <= contactR * contactR) {
          rd.applyGateDamage(String(gateId), (self.damage || 5) * dt * 0.55, self);
        }
      }

      return;
    }

    // Inside-phase: normal AI + clamp to room.
    orig(self, dt, state);
    clampInside(self, b, pad);
  };
}

function pickGateSpawn(room, rd, players, minDist = 260) {
  if (!room || !rd) return null;
  const gates = Array.isArray(room.breaches) ? room.breaches : [];
  if (!gates.length) return null;

  const minD2 = minDist * minDist;
  const cands = [];
  const all = [];
  for (const g of gates) {
    if (!g) continue;
    const ip = rd.getGateInnerPoint ? rd.getGateInnerPoint(room, g, 34) : rd.getBreachInnerPoint(room, g, 34);
    all.push({ g, ip });
    let ok = true;
    for (const p of players) {
      if (!p) continue;
      if (distance2(ip.x, ip.y, p.x, p.y) < minD2) { ok = false; break; }
    }
    if (ok) cands.push({ g, ip });
  }

  const pool = cands.length ? cands : all;
  const pick = pool[(Math.random() * pool.length) | 0];

  // Spawn far outside the platform ("from beyond the map bounds").
  // Keep it noticeably beyond any dynamic bounds so enemies visibly travel in.
  const side = (room.side || 600);
  // Spawn outside the platform but not too far (so room1 isn't empty for 10+ seconds).
  const out = clamp(side * 0.25, 220, 820);
  const op = rd.getGateOuterPoint ? rd.getGateOuterPoint(room, pick.g, out) : rd.getBreachOuterPoint(room, pick.g, out);

  return {
    gateId: pick.g.id,
    side: pick.g.side,
    outside: op,
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

    this.isBossRoom = this.roomIndex > 0 && (this.roomIndex % 10 === 0);
    this.isMiniBossRoom = this.roomIndex > 0 && (this.roomIndex % 5 === 0) && !this.isBossRoom;

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
      this.quotaTotal = 12 + Math.floor(this.roomIndex * 3.0);
      this.aliveCap = Math.min(32, 8 + Math.floor(this.roomIndex * 0.6));
      // Boss rooms: slightly lower quota (boss fight already long)
      if (this.isBossRoom) this.quotaTotal = Math.max(25, Math.floor(this.quotaTotal * 0.75));
      if (this.isMiniBossRoom) this.quotaTotal = Math.max(18, Math.floor(this.quotaTotal * 0.85));

      // Apply party scaling AFTER boss adjustments.
      // Note: aliveCap stays the same (performance-friendly); only wave size scales.
      this.quotaTotal = Math.max(1, Math.round(this.quotaTotal * this.partyWaveScale));

      // Waves per room: 1->3, 2->5, 3->7 ... capped
      let waves = clamp(2 * this.roomIndex + 1, 3, 21);
      if (this.isBossRoom) waves = Math.min(waves, 11);
      if (this.isMiniBossRoom) waves = Math.min(waves, 9);
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

    // Boss/mini-boss spawn (once)
    const zone = this._virtualZoneFromRoom(this.roomIndex);

    if (this.isBossRoom && !this._bossSpawned) {
      const pos = { x: room.centerX, y: room.centerY };
      const boss = createRoamingBoss(zone, pos);
      boss._roomIndex = this.roomIndex;
      boss._roomId = this.roomId;
      boss._isBoss = true;
      boss._isRoomBoss = true;
      boss.id = boss.id || `boss_${this.roomIndex}_${Math.floor(Math.random() * 1e9)}`;
      this._bossId = boss.id;
      this._bossSpawned = true;
      wrapGateApproachUpdate(boss, this.roomIndex, null, 14);
      state.enemies.push(boss);
      if (state) state._roomBossAlive = true;
    }

    if (this.isMiniBossRoom && !this._bossSpawned) {
      const pos = { x: room.centerX, y: room.centerY };
      const mb = createEliteMob(zone, pos);
      // Turn it into a mini-boss
      mb.isBoss = true;
      mb._isMiniBoss = true;
      mb.radius = Math.max(mb.radius || 26, 36);
      mb.hp *= 6;
      mb.maxHp *= 6;
      mb.damage *= 1.6;
      mb.speed *= 0.95;
      mb.scoreValue = (mb.scoreValue || 0) + 120 * zone;

      mb._roomIndex = this.roomIndex;
      mb._roomId = this.roomId;
      mb.id = mb.id || `miniboss_${this.roomIndex}_${Math.floor(Math.random() * 1e9)}`;
      this._miniBossId = mb.id;
      this._bossSpawned = true;
      wrapGateApproachUpdate(mb, this.roomIndex, null, 14);
      state.enemies.push(mb);
      if (state) state._roomBossAlive = true;
    }

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

    // If all waves finished, wait for clear check (kills + boss + alive==0)
    if (this.wavesTotal > 0 && this.waveIndex >= this.wavesTotal) {
      this._checkClearCondition();
      return;
    }

    // Spawn cadence
    const spawnInterval = clamp(0.9 - this.roomIndex * 0.005, 0.25, 0.9);
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
      const gPick = pickGateSpawn(room, rd, players, spawnMinDist);
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
      const eliteChance = clamp(0.02 + this.roomIndex * 0.0015, 0.02, 0.18);
      const useElite = Math.random() < eliteChance;

      const enemy = useElite ? createEliteMob(zone, pos) : createBasicMob(zone, pos);
      enemy._roomIndex = this.roomIndex;
      enemy._roomId = this.roomId;
      enemy.id = enemy.id || `e_${this.roomIndex}_${this.spawned}_${Math.floor(Math.random() * 1e6)}`;

      // Gate-spawned enemies: start outside and keep moving until they enter.
      enemy._spawnGateId = gPick.gateId;
      enemy._gateEnter = { entered: false };
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

    // Boss rooms must have boss dead.
    if (this.isBossRoom) {
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
