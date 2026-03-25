import { applyCritToDamage, applyLifeSteal } from "../core/progression.js";
import { getNearestEnemy } from "../enemies/utils.js";
import { applyFireBurnState, applyIceControlState } from "../core/heroBiomeCombat.js";

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

function getPlayersForState(state) {
  const players = typeof state?.getPlayersArr === "function"
    ? state.getPlayersArr(state)
    : (state?.playersArr || (state?.player ? [state.player] : []));
  return Array.isArray(players) ? players : [];
}

function healPlayersInRadius(state, x, y, radius, heal) {
  if (!state || heal <= 0) return;
  const arr = getPlayersForState(state);
  const r2 = radius * radius;
  for (const p of arr) {
    if (!p || p.hp <= 0) continue;
    const dx = p.x - x;
    const dy = p.y - y;
    if (dx * dx + dy * dy > r2) continue;
    p.hp = Math.min(p.maxHP || 100, p.hp + heal);
  }
  if (!Array.isArray(state.healPulses)) state.healPulses = [];
  state.healPulses.push({ id: nextFxId(state), x, y, r: radius, t: 0.55 });
}

export function castShrapnelBurst(player, state, params) {
  if (!player || !state || !params) return false;
  const radius = Math.max(46, Number(params.radius || 0));
  let hits = 0;
  forEachEnemyInRadius(state, player.x, player.y, radius, (e) => {
    const dmg = applyCritToDamage(player, params.damage || 0);
    markEnemyHit(player, e, state, dmg);
    hits += 1;
  });
  if (hits > 0) pushExplosion(state, player.x, player.y, radius, "mecha", 0.30);
  return hits > 0;
}

export function castRailVolley(player, state, params) {
  if (!player || !state || !params) return false;
  const target = getNearestEnemy(player, state.enemies || [], params.castRange);
  if (!target) return false;
  const primary = applyCritToDamage(player, params.damage || 0);
  markEnemyHit(player, target, state, primary);
  const splashR = Math.max(24, Number(params.splashRadius || 0));
  const splashMul = Math.max(0.2, Math.min(1, Number(params.splashMul || 0.5)));
  forEachEnemyInRadius(state, target.x, target.y, splashR, (e) => {
    if (e === target) return;
    const dmg = applyCritToDamage(player, (params.damage || 0) * splashMul);
    markEnemyHit(player, e, state, dmg);
  });
  pushExplosion(state, target.x, target.y, splashR, "mecha", 0.28);
  return true;
}

export function castArcSpark(player, state, params) {
  if (!player || !state || !params) return false;
  const target = getNearestEnemy(player, state.enemies || [], params.castRange);
  if (!target) return false;
  const primary = applyCritToDamage(player, params.damage || 0);
  markEnemyHit(player, target, state, primary);

  const chainRange = Math.max(52, Number(params.chainRange || 0));
  const maxChains = Math.max(1, Number(params.chainTargets || 1) | 0);
  const chainMul = Math.max(0.25, Math.min(1, Number(params.chainMul || 0.72)));
  const used = new Set([target]);
  let anchor = target;
  let chains = 0;
  while (chains < maxChains) {
    let best = null;
    let bestD2 = Infinity;
    for (const e of (state.enemies || [])) {
      if (!e || e.hp <= 0 || used.has(e)) continue;
      const dx = e.x - anchor.x;
      const dy = e.y - anchor.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > chainRange * chainRange) continue;
      if (d2 < bestD2) {
        best = e;
        bestD2 = d2;
      }
    }
    if (!best) break;
    const dmg = applyCritToDamage(player, (params.damage || 0) * chainMul);
    markEnemyHit(player, best, state, dmg);
    used.add(best);
    anchor = best;
    chains += 1;
  }

  pushExplosion(state, target.x, target.y, Math.max(28, chainRange * 0.34), "electric", 0.28);
  return true;
}

export function castStaticPulse(player, state, params) {
  if (!player || !state || !params) return false;
  const radius = Math.max(44, Number(params.radius || 0));
  let hits = 0;
  forEachEnemyInRadius(state, player.x, player.y, radius, (e) => {
    const dmg = applyCritToDamage(player, params.damage || 0);
    markEnemyHit(player, e, state, dmg);
    e._slowLeft = Math.max((e._slowLeft || 0), Number(params.slowDur || 0.8));
    e._slowMult = Math.min((e._slowMult || 1), Math.max(0.45, Number(params.slowMult || 0.8)));
    hits += 1;
  });
  if (hits > 0) pushExplosion(state, player.x, player.y, radius, "electric", 0.34);
  return hits > 0;
}

export function castMeteorRain(player, state, params) {
  if (!player || !state || !params) return false;
  const target = getNearestEnemy(player, state.enemies || [], params.castRange);
  if (!target) return false;
  const count = Math.max(2, (params.count | 0) || 3);
  const spread = Math.max(10, Number(params.spread || 36));
  const splashR = Math.max(24, Number(params.splashRadius || 0));
  let hits = 0;
  for (let i = 0; i < count; i++) {
    const ox = (Math.random() * 2 - 1) * spread;
    const oy = (Math.random() * 2 - 1) * spread;
    const mx = target.x + ox;
    const my = target.y + oy;
    const localHit = forEachEnemyInRadius(state, mx, my, splashR, (e) => {
      const dmg = applyCritToDamage(player, params.damage || 0);
      markEnemyHit(player, e, state, dmg);
      applyFireBurnState(player, e, Number(params.burnDur || 1.2), Number(params.burnDps || 4), 1.0);
      hits += 1;
    });
    if (localHit > 0) pushExplosion(state, mx, my, splashR, "fire", 0.30);
  }
  return hits > 0;
}

export function castMagmaLance(player, state, params) {
  if (!player || !state || !params) return false;
  const target = getNearestEnemy(player, state.enemies || [], params.castRange);
  if (!target) return false;
  const primary = applyCritToDamage(player, params.damage || 0);
  markEnemyHit(player, target, state, primary);
  applyFireBurnState(player, target, Number(params.burnDur || 1.2), Number(params.burnDps || 4), 1.0);
  const splashR = Math.max(22, Number(params.splashRadius || 0));
  const splashMul = Math.max(0.25, Math.min(1, Number(params.splashMul || 0.45)));
  forEachEnemyInRadius(state, target.x, target.y, splashR, (e) => {
    if (e === target) return;
    const dmg = applyCritToDamage(player, (params.damage || 0) * splashMul);
    markEnemyHit(player, e, state, dmg);
    applyFireBurnState(player, e, Number(params.burnDur || 1.2) * 0.8, Number(params.burnDps || 4) * 0.72, 0.72);
  });
  pushExplosion(state, target.x, target.y, splashR, "fire", 0.28);
  return true;
}

export function castFrostNova(player, state, params) {
  if (!player || !state || !params) return false;
  const radius = Math.max(44, Number(params.radius || 0));
  let hits = 0;
  forEachEnemyInRadius(state, player.x, player.y, radius, (e) => {
    const dmg = applyCritToDamage(player, params.damage || 0);
    markEnemyHit(player, e, state, dmg);
    applyIceControlState(player, e, state, { slowDur: Number(params.slowDur || 1.0), slowMult: Number(params.slowMult || 0.7), frostDur: Number(params.frostDur || 1.35), freezeBuild: Number(params.freezeBuild || 0.92) });
    hits += 1;
  });
  if (hits > 0) pushExplosion(state, player.x, player.y, radius, "ice", 0.34);
  return hits > 0;
}

export function castCrystalSpear(player, state, params) {
  if (!player || !state || !params) return false;
  const target = getNearestEnemy(player, state.enemies || [], params.castRange);
  if (!target) return false;
  const primary = applyCritToDamage(player, params.damage || 0);
  markEnemyHit(player, target, state, primary);
  applyIceControlState(player, target, state, { frostDur: Number(params.frostDur || 1.4), slowDur: Number(params.slowDur || 1.0), slowMult: Number(params.slowMult || 0.64), freezeBuild: Number(params.freezeBuild || 0.76) });
  const splashR = Math.max(22, Number(params.splashRadius || 0));
  const splashMul = Math.max(0.25, Math.min(1, Number(params.splashMul || 0.45)));
  forEachEnemyInRadius(state, target.x, target.y, splashR, (e) => {
    if (e === target) return;
    const dmg = applyCritToDamage(player, (params.damage || 0) * splashMul);
    markEnemyHit(player, e, state, dmg);
    applyIceControlState(player, e, state, { frostDur: Number(params.frostDur || 1.4) * 0.8, slowDur: Number(params.slowDur || 1.0) * 0.8, slowMult: Math.max(0.38, Number(params.slowMult || 0.64) * 1.05), freezeBuild: Number(params.freezeBuild || 0.44) });
  });
  pushExplosion(state, target.x, target.y, splashR, "ice", 0.28);
  return true;
}

export function castSoulDrain(player, state, params) {
  if (!player || !state || !params) return false;
  const target = getNearestEnemy(player, state.enemies || [], params.castRange);
  if (!target) return false;
  const dmg = applyCritToDamage(player, params.damage || 0);
  markEnemyHit(player, target, state, dmg);
  target._curseLeft = Math.max((target._curseLeft || 0), Number(params.curseDur || 2.0));
  target._curseLv = Math.max((target._curseLv || 0), Number(params.curseLv || 1));
  const heal = Math.max(0, Number(params.heal || 0));
  if (heal > 0) player.hp = Math.min(player.maxHP || 100, player.hp + heal);
  pushExplosion(state, target.x, target.y, Math.max(24, Number(params.radius || 42)), "dark", 0.26);
  return true;
}

export function castDreadRing(player, state, params) {
  if (!player || !state || !params) return false;
  const radius = Math.max(44, Number(params.radius || 0));
  let hits = 0;
  forEachEnemyInRadius(state, player.x, player.y, radius, (e) => {
    const dmg = applyCritToDamage(player, params.damage || 0);
    markEnemyHit(player, e, state, dmg);
    e._curseLeft = Math.max((e._curseLeft || 0), Number(params.curseDur || 2.4));
    e._curseLv = Math.max((e._curseLv || 0), Number(params.curseLv || 1));
    hits += 1;
  });
  if (hits > 0) pushExplosion(state, player.x, player.y, radius, "dark", 0.34);
  return hits > 0;
}

export function castPrismRay(player, state, params) {
  if (!player || !state || !params) return false;
  const target = getNearestEnemy(player, state.enemies || [], params.castRange);
  if (!target) return false;
  const primary = applyCritToDamage(player, params.damage || 0);
  markEnemyHit(player, target, state, primary);
  const splashR = Math.max(22, Number(params.splashRadius || 0));
  const splashMul = Math.max(0.25, Math.min(1, Number(params.splashMul || 0.45)));
  forEachEnemyInRadius(state, target.x, target.y, splashR, (e) => {
    if (e === target) return;
    const dmg = applyCritToDamage(player, (params.damage || 0) * splashMul);
    markEnemyHit(player, e, state, dmg);
  });
  healPlayersInRadius(state, player.x, player.y, Math.max(80, Number(params.healRadius || 120)), Number(params.heal || 0));
  pushExplosion(state, target.x, target.y, splashR, "light", 0.30);
  return true;
}

export function castSanctuary(player, state, params) {
  if (!player || !state || !params) return false;
  const radius = Math.max(52, Number(params.radius || 0));
  let hits = 0;
  forEachEnemyInRadius(state, player.x, player.y, radius, (e) => {
    const dmg = applyCritToDamage(player, params.damage || 0);
    markEnemyHit(player, e, state, dmg);
    hits += 1;
  });
  healPlayersInRadius(state, player.x, player.y, Math.max(radius, Number(params.healRadius || radius)), Number(params.heal || 0));
  pushExplosion(state, player.x, player.y, radius, "light", 0.34);
  return hits > 0 || (params.heal || 0) > 0;
}
