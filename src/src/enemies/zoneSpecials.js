import { getZoneScaling } from "../world/zoneController.js";
import { createBasicMob } from "./mobBasic.js";
import { pickMobTarget, applyDamageToTarget } from "./utils.js";

/**
 * Zone-specific special enemies ("mini-boss" style).
 * One main variant per zone:
 * 1 - Bruiser (slow, tanky melee)
 * 2 - Runner (fast chaser)
 * 3 - Sniper (ranged poke)
 * 4 - Swarm Spawner (periodically spawns basic mobs)
 * 5 - Champion (tanky mini-boss)
 */

export function createZoneSpecialEnemy(zone, pos) {
  const z = zone | 0;

  // Zone 6+: mix mini-boss archetypes from all previous zones,
  // but scale them to the current (dangerous) zone.
  if (z >= 6) {
    const pool = [
      createZone1Bruiser,
      createZone2Runner,
      createZone3Sniper,
      createZone4Spawner,
      createZone5Champion,
    ];
    const fn = pool[Math.floor(Math.random() * pool.length)];
    return fn(zone, pos);
  }

  switch (z) {
    case 1:
      return createZone1Bruiser(z, pos);
    case 2:
      return createZone2Runner(z, pos);
    case 3:
      return createZone3Sniper(z, pos);
    case 4:
      return createZone4Spawner(z, pos);
    case 5:
    default:
      return createZone5Champion(z || 5, pos);
  }
}

export function createZone1Bruiser(zone, pos) {
  const s = getZoneScaling(zone);

  const baseHP = 90;
  const baseDmg = 10;
  const baseSpeed = 65;
  const baseXP = 20;

  const enemy = {
    type: "zone1Bruiser",
    zone,
    x: pos.x,
    y: pos.y,
    radius: 26,
    hp: baseHP * s.hp,
    maxHp: baseHP * s.hp,
    damage: baseDmg * s.damage,
    speed: baseSpeed * s.speed,
    xpValue: baseXP * s.xp,
    scoreValue: 20 * zone,
    isBoss: false,
    isGateEnemy: false,
    isElite: true,
  };

  enemy.update = (self, dt, state) => {
    const player = pickMobTarget(self, state, { aggroRange: 900 });
    if (!player) return;
    const dx = player.x - self.x;
    const dy = player.y - self.y;
    const dist = Math.hypot(dx, dy) || 1;

    const debuffed = (typeof self._barrierDebuffUntil === "number") && (state.time < self._barrierDebuffUntil);
    const slowMult = debuffed ? (self._barrierSlowMult || 1) : 1;
    const dmgOutMult = debuffed ? (self._barrierDmgMult || 1) : 1;
    const baseSpeed = self.speed;
    const speed = baseSpeed * slowMult;


    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;

    self.x += vx * dt;
    self.y += vy * dt;

    const r = (player.radius || 18) + self.radius;
    if (dx * dx + dy * dy <= r * r) {
      if (!player._ghostActive && !player._lvlUpInvuln && !player._lvlUpChoosing) {
        const mult = player._shieldActive ? 0.2 : 1.0;
        const inMult = (typeof player._dmgInMult === "number") ? player._dmgInMult : 1.0;
        applyDamageToTarget(player, self.damage * dmgOutMult * dt * mult * inMult, state, self);
      }
    }
  };

  enemy.render = (self, ctx) => {
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = "#ffb347"; // warm orange tank
    ctx.arc(self.x, self.y, self.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  enemy.onDeath = (self, state) => {
    // Drop either XP orb or Coin orb (meta-currency) to reduce upgrade spam.
    const roll = Math.random();
    if (roll < 0.35) {
      const amt = 1 + ((Math.random()*2)|0);
      state.xpOrbs.push({
        x: self.x,
        y: self.y,
        radius: 8,
        kind: "coin",
        coins: amt,
        age: 0,
      });
    } else {
      state.xpOrbs.push({
        x: self.x,
        y: self.y,
        radius: 8,
        kind: "xp",
        xp: self.xpValue,
        age: 0,
      });
    }
  };

  return enemy;
}

export function createZone2Runner(zone, pos) {
  const s = getZoneScaling(zone);

  const baseHP = 45;
  const baseDmg = 7;
  const baseSpeed = 150;
  const baseXP = 18;

  const enemy = {
    type: "zone2Runner",
    zone,
    x: pos.x,
    y: pos.y,
    radius: 18,
    hp: baseHP * s.hp,
    maxHp: baseHP * s.hp,
    damage: baseDmg * s.damage,
    speed: baseSpeed * s.speed,
    xpValue: baseXP * s.xp,
    scoreValue: 22 * zone,
    isBoss: false,
    isGateEnemy: false,
    isElite: true,
  };

  enemy.update = (self, dt, state) => {
    const player = pickMobTarget(self, state, { aggroRange: 950 });
    if (!player) return;
    const dx = player.x - self.x;
    const dy = player.y - self.y;
    const dist = Math.hypot(dx, dy) || 1;

    const debuffed = (typeof self._barrierDebuffUntil === "number") && (state.time < self._barrierDebuffUntil);
    const slowMult = debuffed ? (self._barrierSlowMult || 1) : 1;
    const dmgOutMult = debuffed ? (self._barrierDmgMult || 1) : 1;
    const baseSpeed = self.speed;
    const speed = baseSpeed * slowMult;


    // Runner: accelerates when far, slows a bit when close
    let moveSpeed = speed;
    if (dist > 260) moveSpeed *= 1.8;
    else if (dist > 140) moveSpeed *= 1.3;

    const vx = (dx / dist) * moveSpeed;
    const vy = (dy / dist) * moveSpeed;

    self.x += vx * dt;
    self.y += vy * dt;

    const r = (player.radius || 18) + self.radius;
    if (dx * dx + dy * dy <= r * r) {
      if (!player._ghostActive && !player._lvlUpInvuln && !player._lvlUpChoosing) {
        const mult = player._shieldActive ? 0.2 : 1.0;
        // Incoming damage multiplier (some buffs/debuffs adjust damage taken)
        const inMult = (typeof player._dmgInMult === "number") ? player._dmgInMult : 1.0;
        applyDamageToTarget(player, self.damage * dmgOutMult * dt * mult * inMult, state, self);
      }
    }
  };

  enemy.render = (self, ctx) => {
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = "#f4ff5a"; // bright yellow runner
    ctx.arc(self.x, self.y, self.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  enemy.onDeath = (self, state) => {
    state.xpOrbs.push({
      x: self.x,
      y: self.y,
      radius: 9,
      xp: self.xpValue,
      age: 0,
    });
  };

  return enemy;
}

export function createZone3Sniper(zone, pos) {
  const s = getZoneScaling(zone);

  const baseHP = 35;
  const baseDmg = 12;
  const baseSpeed = 85;
  const baseXP = 24;

  const enemy = {
    type: "zone3Sniper",
    zone,
    x: pos.x,
    y: pos.y,
    radius: 18,
    hp: baseHP * s.hp,
    maxHp: baseHP * s.hp,
    damage: baseDmg * s.damage,
    speed: baseSpeed * s.speed,
    xpValue: baseXP * s.xp,
    scoreValue: 26 * zone,
    isBoss: false,
    isGateEnemy: false,
    isElite: true,
    _shootTimer: 0,
    _shootInterval: 2.4,
    _shootFlash: 0,
    _aimDx: 0,
    _aimDy: 0,
  };

  enemy.update = (self, dt, state) => {
    const player = pickMobTarget(self, state, { aggroRange: 1250 });
    if (!player) return;
    const dx = player.x - self.x;
    const dy = player.y - self.y;
    const dist = Math.hypot(dx, dy) || 1;

    const debuffed = (typeof self._barrierDebuffUntil === "number") && (state.time < self._barrierDebuffUntil);
    const slowMult = debuffed ? (self._barrierSlowMult || 1) : 1;
    const dmgOutMult = debuffed ? (self._barrierDmgMult || 1) : 1;
    const baseSpeed = self.speed;
    const speed = baseSpeed * slowMult;


    // Maintain some distance: move closer if too far, back off if too close
    const desired = 420;
    let moveSpeed = speed * 0.8;

    if (dist > desired + 80) {
      // move closer
    } else if (dist < desired - 80) {
      // back off
      moveSpeed *= -1;
    } else {
      moveSpeed = 0;
    }

    if (moveSpeed !== 0) {
      const vx = (dx / dist) * moveSpeed;
      const vy = (dy / dist) * moveSpeed;
      self.x += vx * dt;
      self.y += vy * dt;
    }

    // Shooting logic
    self._shootTimer += dt;
    self._shootFlash = Math.max(0, self._shootFlash - dt * 3);

    self._aimDx = dx / dist;
    self._aimDy = dy / dist;

    const inRange = dist < 325;

    if (inRange && self._shootTimer >= self._shootInterval) {
      self._shootTimer = 0;
      self._shootFlash = 0.25;

      if (!player._ghostActive && !player._lvlUpInvuln && !player._lvlUpChoosing) {
        const mult = player._shieldActive ? 0.4 : 1.0;
        // Discrete hit, not per-second
        applyDamageToTarget(player, self.damage * dmgOutMult * mult, state, self);
      }
    }
  };

  enemy.render = (self, ctx) => {
    ctx.save();

    // Draw sniper body
    ctx.beginPath();
    ctx.fillStyle = "#70d6ff"; // cyan-ish sniper
    ctx.arc(self.x, self.y, self.radius, 0, Math.PI * 2);
    ctx.fill();

    // Draw aim line when recently fired
    if (self._shootFlash > 0) {
      const len = 260;
      const ax = self.x + (self._aimDx || 1) * len;
      const ay = self.y + (self._aimDy || 0) * len;

      ctx.beginPath();
      ctx.globalAlpha = self._shootFlash;
      ctx.moveTo(self.x, self.y);
      ctx.lineTo(ax, ay);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  };

  enemy.onDeath = (self, state) => {
    state.xpOrbs.push({
      x: self.x,
      y: self.y,
      radius: 10,
      xp: self.xpValue,
      age: 0,
    });
  };

  return enemy;
}

export function createZone4Spawner(zone, pos) {
  const s = getZoneScaling(zone);

  const baseHP = 70;
  const baseDmg = 6;
  const baseSpeed = 60;
  const baseXP = 30;

  const enemy = {
    type: "zone4Spawner",
    zone,
    x: pos.x,
    y: pos.y,
    radius: 24,
    hp: baseHP * s.hp,
    maxHp: baseHP * s.hp,
    damage: baseDmg * s.damage,
    speed: baseSpeed * s.speed,
    xpValue: baseXP * s.xp,
    scoreValue: 30 * zone,
    isBoss: false,
    isGateEnemy: false,
    isElite: true,
    _spawnTimer: 0,
    _spawnInterval: 6.0,
    // Summoner rule: spawns a wave of N minions, then stops until ALL wave summons are dead.
    _summonWaveId: 1,
    _summonWaveTarget: 10,
    _summonSpawnedInWave: 0,
  };

  enemy.update = (self, dt, state) => {
    const { enemies } = state;
    const player = pickMobTarget(self, state, { aggroRange: 1100 });
    if (!player) return;

    // Slow drift toward player
    const dx = player.x - self.x;
    const dy = player.y - self.y;
    const dist = Math.hypot(dx, dy) || 1;

    const debuffed = (typeof self._barrierDebuffUntil === "number") && (state.time < self._barrierDebuffUntil);
    const slowMult = debuffed ? (self._barrierSlowMult || 1) : 1;
    const dmgOutMult = debuffed ? (self._barrierDmgMult || 1) : 1;
    const baseSpeed = self.speed;
    const speed = baseSpeed * slowMult;


    const vx = (dx / dist) * speed * 0.6;
    const vy = (dy / dist) * speed * 0.6;

    self.x += vx * dt;
    self.y += vy * dt;

    // Contact damage
    const r = (player.radius || 18) + self.radius;
    if (dx * dx + dy * dy <= r * r) {
      if (!player._ghostActive && !player._lvlUpInvuln && !player._lvlUpChoosing) {
        const mult = player._shieldActive ? 0.2 : 1.0;
        const inMult = (typeof player._dmgInMult === "number") ? player._dmgInMult : 1.0;
        applyDamageToTarget(player, self.damage * dmgOutMult * dt * mult * inMult, state, self);
      }
    }

    // Spawn basic mobs periodically (summoner rule: wave cap)
    self._spawnTimer += dt;

    if (self._spawnTimer >= self._spawnInterval) {
      self._spawnTimer = 0;

      const ownerId = self._id || self.id;
      const waveId = self._summonWaveId | 0;
      const target = Math.max(1, self._summonWaveTarget | 0);

      // Count alive summons from the CURRENT wave.
      let aliveInWave = 0;
      if (ownerId) {
        for (const e of enemies) {
          if (!e || e.dead || e.hp <= 0) continue;
          if (e.summonedBy !== ownerId) continue;
          if ((e.summonWaveId | 0) !== waveId) continue;
          aliveInWave++;
        }
      }

      // If wave is complete, only reset when ALL wave summons are dead.
      if ((self._summonSpawnedInWave | 0) >= target) {
        if (aliveInWave === 0) {
          self._summonWaveId = (waveId + 1) | 0;
          self._summonSpawnedInWave = 0;
        }
        return;
      }

      // Still spawning this wave.
      const remaining = target - (self._summonSpawnedInWave | 0);
      const count = Math.min(2, remaining);
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distSpawn = 120 + Math.random() * 60;
        const sx = self.x + Math.cos(angle) * distSpawn;
        const sy = self.y + Math.sin(angle) * distSpawn;

        const mob = createBasicMob(zone, { x: sx, y: sy });
        mob.isSummoned = true;
        if (ownerId) {
          mob.summonedBy = ownerId;
          mob.summonWaveId = waveId;
        }
        // Tie summons to the same group for proper despawn/cleanup.
        if (self.groupId) mob.groupId = self.groupId;
        if (state && state.spawnSystem && typeof state.spawnSystem.ensureEnemyId === "function") {
          state.spawnSystem.ensureEnemyId(mob);
        }
        enemies.push(mob);
        // Keep group aliveCount consistent so wipe/respawn doesn't desync.
        if (self.groupId && state && state.spawnSystem && state.spawnSystem.groups && typeof state.spawnSystem.groups.get === "function") {
          const g = state.spawnSystem.groups.get(self.groupId);
          if (g && g.spawned && !g.isWiped) g.aliveCount = (g.aliveCount | 0) + 1;
        }
      }
      self._summonSpawnedInWave = (self._summonSpawnedInWave | 0) + count;
    }
  };

  enemy.render = (self, ctx) => {
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = "#b388ff"; // purple-ish spawner
    ctx.arc(self.x, self.y, self.radius, 0, Math.PI * 2);
    ctx.fill();

    // inner core
    ctx.beginPath();
    ctx.fillStyle = "#ffffff";
    ctx.arc(self.x, self.y, self.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  enemy.onDeath = (self, state) => {
    state.xpOrbs.push({
      x: self.x,
      y: self.y,
      radius: 12,
      xp: self.xpValue,
      age: 0,
    });
  };

  return enemy;
}

export function createZone5Champion(zone, pos) {
  const s = getZoneScaling(zone);

  const baseHP = 200;
  const baseDmg = 16;
  const baseSpeed = 75;
  const baseXP = 80;

  const enemy = {
    type: "zone5Champion",
    zone,
    x: pos.x,
    y: pos.y,
    radius: 30,
    hp: baseHP * s.hp,
    maxHp: baseHP * s.hp,
    damage: baseDmg * s.damage,
    speed: baseSpeed * s.speed,
    xpValue: baseXP * s.xp,
    scoreValue: 60 * zone,
    isBoss: false,
    isGateEnemy: false,
    isElite: true,
  };

  enemy.update = (self, dt, state) => {
    const player = pickMobTarget(self, state, { aggroRange: 1200 });
    if (!player) return;
    const dx = player.x - self.x;
    const dy = player.y - self.y;
    const dist = Math.hypot(dx, dy) || 1;

    const debuffed = (typeof self._barrierDebuffUntil === "number") && (state.time < self._barrierDebuffUntil);
    const slowMult = debuffed ? (self._barrierSlowMult || 1) : 1;
    const dmgOutMult = debuffed ? (self._barrierDmgMult || 1) : 1;
    const baseSpeed = self.speed;
    const speed = baseSpeed * slowMult;


    // Slightly slower approach, but heavier hit
    const vx = (dx / dist) * speed * 0.9;
    const vy = (dy / dist) * speed * 0.9;

    self.x += vx * dt;
    self.y += vy * dt;

    const r = (player.radius || 18) + self.radius;
    if (dx * dx + dy * dy <= r * r) {
      if (!player._ghostActive && !player._lvlUpInvuln && !player._lvlUpChoosing) {
        const mult = player._shieldActive ? 0.25 : 1.0;
        const inMult = (typeof player._dmgInMult === "number") ? player._dmgInMult : 1.0;
        // Champion hits a bit more on contact
        applyDamageToTarget(player, self.damage * dmgOutMult * dt * mult * inMult, state, self);
      }
    }
  };

  enemy.render = (self, ctx) => {
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = "#ff4b5c"; // strong red champion
    ctx.arc(self.x, self.y, self.radius, 0, Math.PI * 2);
    ctx.fill();

    // simple ring to separate from normal mobs
    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.arc(self.x, self.y, self.radius + 4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  };

  enemy.onDeath = (self, state) => {
    state.xpOrbs.push({
      x: self.x,
      y: self.y,
      radius: 14,
      xp: self.xpValue,
      age: 0,
    });
  };

  return enemy;
}
