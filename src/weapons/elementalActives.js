import { applyCritToDamage, applyLifeSteal } from "../core/progression.js";
import { getNearestEnemy } from "../enemies/utils.js";

function nextFxId(state) {
  state._nextFxId = (state._nextFxId || 0) + 1;
  return state._nextFxId;
}

function markEnemyHit(owner, enemy, state, damage) {
  if (!owner || !enemy || !state) return;
  enemy.hp -= damage;
  applyLifeSteal(owner, damage);
  owner._lastCombatAt = state.time;
  owner.lastPlayerTarget = enemy;
  owner.lastPlayerTargetAt = state.time;
  enemy._lastHitAt = state.time;
  enemy._lastHitBy = owner.id || "local";
  enemy.aggroed = true;
}

function forEachEnemyInRadius(state, x, y, radius, fn) {
  const enemies = state?.enemies || [];
  if (!Array.isArray(enemies) || !enemies.length) return 0;
  const r2 = radius * radius;
  let hits = 0;
  for (const e of enemies) {
    if (!e || e.hp <= 0) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    if (dx * dx + dy * dy > r2) continue;
    hits += 1;
    fn(e, dx, dy);
  }
  return hits;
}

function pushExplosion(state, x, y, r, kind, t = 0.35) {
  if (!Array.isArray(state._explosions)) state._explosions = [];
  state._explosions.push({ x, y, r, t, kind });
}

export function castStormStrike(player, state, params) {
  if (!player || !state || !params) return false;
  const target = getNearestEnemy(player, state.enemies || [], params.castRange);
  if (!target) return false;

  const owner = player;
  const primary = applyCritToDamage(owner, params.damage || 0);
  markEnemyHit(owner, target, state, primary);

  const splashR = Math.max(24, Number(params.splashRadius || 0));
  const splashMul = Math.max(0.2, Math.min(1, Number(params.splashMul || 0.55)));
  forEachEnemyInRadius(state, target.x, target.y, splashR, (e) => {
    if (e === target) return;
    const dmg = applyCritToDamage(owner, (params.damage || 0) * splashMul);
    markEnemyHit(owner, e, state, dmg);
  });

  pushExplosion(state, target.x, target.y, splashR, "electric", 0.32);
  return true;
}

export function castFlameNova(player, state, params) {
  if (!player || !state || !params) return false;
  const radius = Math.max(40, Number(params.radius || 0));
  let hits = 0;
  forEachEnemyInRadius(state, player.x, player.y, radius, (e) => {
    const dmg = applyCritToDamage(player, params.damage || 0);
    markEnemyHit(player, e, state, dmg);
    e._burnLeft = Math.max((e._burnLeft || 0), Number(params.burnDur || 1.2));
    e._burnDps = Math.max((e._burnDps || 0), Number(params.burnDps || 4));
    hits += 1;
  });
  if (hits > 0) pushExplosion(state, player.x, player.y, radius, "fire", 0.38);
  return hits > 0;
}

export function fireIceShards(player, state, params, aimDir = null) {
  if (!player || !state || !params) return false;
  const enemies = state.enemies || [];
  const target = getNearestEnemy(player, enemies, params.range);
  let dir = aimDir;
  if (!dir && target) {
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const d = Math.hypot(dx, dy) || 1;
    dir = { x: dx / d, y: dy / d };
  }
  if (!dir) return false;

  if (!Array.isArray(state.projectiles)) state.projectiles = [];
  const count = Math.max(1, params.count | 0);
  const spread = Number(params.spreadDeg || 0) * (Math.PI / 180);
  const start = -spread * 0.5;
  const step = count <= 1 ? 0 : spread / (count - 1);
  const baseA = Math.atan2(dir.y, dir.x);

  for (let i = 0; i < count; i++) {
    const a = baseA + start + step * i;
    const vx = Math.cos(a) * params.speed;
    const vy = Math.sin(a) * params.speed;
    const pid = (state._nextProjectileId = (state._nextProjectileId || 0) + 1);
    state.projectiles.push({
      id: pid,
      type: "iceShard",
      x: player.x,
      y: player.y,
      ownerId: player.id || "local",
      vx,
      vy,
      speed: params.speed,
      damage: params.damage,
      range: params.range,
      travel: 0,
      radius: params.radius,
    });
  }
  player._lastCombatAt = state.time;
  return true;
}

export function castVoidBurst(player, state, params) {
  if (!player || !state || !params) return false;
  const target = getNearestEnemy(player, state.enemies || [], params.castRange);
  if (!target) return false;
  const radius = Math.max(36, Number(params.radius || 0));
  let hits = 0;
  forEachEnemyInRadius(state, target.x, target.y, radius, (e) => {
    const dmg = applyCritToDamage(player, params.damage || 0);
    markEnemyHit(player, e, state, dmg);
    e._curseLeft = Math.max((e._curseLeft || 0), Number(params.curseDur || 2.6));
    e._curseLv = Math.max((e._curseLv || 0), Number(params.curseLv || 1));
    hits += 1;
  });
  if (hits > 0) pushExplosion(state, target.x, target.y, radius, "dark", 0.34);
  return hits > 0;
}

export function castHolyNova(player, state, params) {
  if (!player || !state || !params) return false;
  const damageRadius = Math.max(44, Number(params.damageRadius || 0));
  const healRadius = Math.max(damageRadius, Number(params.healRadius || 0));
  let hits = 0;
  forEachEnemyInRadius(state, player.x, player.y, damageRadius, (e) => {
    const dmg = applyCritToDamage(player, params.damage || 0);
    markEnemyHit(player, e, state, dmg);
    hits += 1;
  });

  const players = typeof state.getPlayersArr === "function" ? state.getPlayersArr(state) : null;
  const arr = Array.isArray(players) ? players : (state.playersArr || [state.player]);
  const r2 = healRadius * healRadius;
  for (const p of arr) {
    if (!p || p.hp <= 0) continue;
    const dx = p.x - player.x;
    const dy = p.y - player.y;
    if (dx * dx + dy * dy > r2) continue;
    p.hp = Math.min(p.maxHP || 100, p.hp + (params.heal || 0));
  }

  if (!Array.isArray(state.healPulses)) state.healPulses = [];
  state.healPulses.push({ id: nextFxId(state), x: player.x, y: player.y, r: healRadius, t: 0.55 });
  if (hits > 0) pushExplosion(state, player.x, player.y, damageRadius, "light", 0.34);
  return true;
}
