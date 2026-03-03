import { createBasicMob } from "../enemies/mobBasic.js";
import { createEliteMob } from "../enemies/mobElite.js";
import { createRoamingBoss } from "../enemies/roamingBoss.js";

function clamp(n, a, b) {
  return n < a ? a : (n > b ? b : n);
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

function wrapClampUpdate(enemy, bounds, pad = 10) {
  if (!enemy || typeof enemy.update !== "function") return;
  const orig = enemy.update;
  enemy.update = (self, dt, state) => {
    orig(self, dt, state);
    // Clamp to room bounds
    const b = bounds;
    const r = (self.radius || 20) + pad;
    if (self.x < b.minX + r) self.x = b.minX + r;
    if (self.x > b.maxX - r) self.x = b.maxX - r;
    if (self.y < b.minY + r) self.y = b.minY + r;
    if (self.y > b.maxY - r) self.y = b.maxY - r;
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

    this.isMiniBossRoom = false;
    this.isBossRoom = false;

    this._miniBossId = null;
    this._bossId = null;
    this._bossSpawned = false;

    this._spawnTimer = 0;
    this._lastRoomChangeAt = 0;

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
    this._bossSpawned = false;
    this._miniBossId = null;
    this._bossId = null;

    this.isBossRoom = this.roomIndex > 0 && (this.roomIndex % 10 === 0);
    this.isMiniBossRoom = this.roomIndex > 0 && (this.roomIndex % 5 === 0) && !this.isBossRoom;

    // quota/aliveCap (v0.1)
    if (this.roomIndex <= 0) {
      this.quotaTotal = 0;
      this.aliveCap = 0;
    } else {
      this.quotaTotal = 12 + Math.floor(this.roomIndex * 3.0);
      this.aliveCap = Math.min(32, 8 + Math.floor(this.roomIndex * 0.6));
      // Boss rooms: slightly lower quota (boss fight already long)
      if (this.isBossRoom) this.quotaTotal = Math.max(25, Math.floor(this.quotaTotal * 0.75));
      if (this.isMiniBossRoom) this.quotaTotal = Math.max(18, Math.floor(this.quotaTotal * 0.85));
    }

    // For HUD
    if (this.state) {
      this.state._roomQuota = this.quotaTotal | 0;
      this.state._roomKilled = 0;
      this.state._roomAliveCap = this.aliveCap | 0;
      this.state._roomIsBoss = !!this.isBossRoom;
      this.state._roomIsMiniBoss = !!this.isMiniBossRoom;
      this.state._roomBossAlive = false;
    }
  }

  update(dt) {
    const state = this.state;
    const rd = state.roomDirector;
    const room = rd && rd.current;
    if (!room) return;

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
      wrapClampUpdate(boss, bounds, 14);
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
      wrapClampUpdate(mb, bounds, 14);
      state.enemies.push(mb);
      if (state) state._roomBossAlive = true;
    }

    // If current room is already cleared, stop spawning.
    if (room.cleared) return;

    // Spawn cadence
    const spawnInterval = clamp(0.9 - this.roomIndex * 0.005, 0.25, 0.9);
    this._spawnTimer += dt;
    if (this._spawnTimer < spawnInterval) return;
    this._spawnTimer = 0;

    // Don't exceed caps / quota
    const remainingToSpawn = this.quotaTotal - this.spawned;
    if (remainingToSpawn <= 0) return;

    const freeSlots = this.aliveCap - aliveInRoom;
    if (freeSlots <= 0) return;

    const maxBatch = clamp(4 + Math.floor(this.roomIndex / 15), 4, 10);
    const batch = Math.min(remainingToSpawn, freeSlots, maxBatch);

    for (let i = 0; i < batch; i++) {
      const pos = pickSpawnPos(bounds, players, spawnMinDist, 14);

      // Type selection
      const eliteChance = clamp(0.02 + this.roomIndex * 0.0015, 0.02, 0.18);
      const useElite = Math.random() < eliteChance;

      const enemy = useElite ? createEliteMob(zone, pos) : createBasicMob(zone, pos);
      enemy._roomIndex = this.roomIndex;
      enemy._roomId = this.roomId;
      enemy.id = enemy.id || `e_${this.roomIndex}_${this.spawned}_${Math.floor(Math.random() * 1e6)}`;

      wrapClampUpdate(enemy, bounds, 10);
      state.enemies.push(enemy);
      this.spawned++;
    }

    // HUD mirrors
    if (state) {
      state._roomKilled = this.killed | 0;
      state._roomQuota = this.quotaTotal | 0;
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
