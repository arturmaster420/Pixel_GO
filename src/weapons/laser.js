import { applyCritToDamage, applyLifeSteal } from "../core/progression.js";

// Backward compatible signature:
// updateLaser(player, state, dt, aimDir, isFiring, params?)
// params: { range, dps }
export function updateLaser(player, state, dt, aimDir, isFiring, params = null) {
  const { enemies } = state;

  const maxRange = params && Number.isFinite(params.range) ? params.range : maxRangeForLevel(player.level);

  // Reset visual each frame (co-op safe: store per-player if maps exist)
  if (state._laserVisuals && typeof state._laserVisuals.delete === "function") {
    state._laserVisuals.delete(String(player.id || "local"));
  } else {
    state._laserVisual = null;
  }

  // Laser heat / overheat (simple, run-friendly)
  const maxHeat = Number.isFinite(player.laserMaxHeat) ? player.laserMaxHeat : 100;
  const heatRate = Number.isFinite(player.laserHeatRate) && player.laserHeatRate > 2 ? player.laserHeatRate : 26;
  const coolRate = heatRate * 0.85;
  player.laserHeat = Number.isFinite(player.laserHeat) ? player.laserHeat : 0;

  // Cool down when not firing
  if (!isFiring || !aimDir) {
    player.laserHeat = Math.max(0, player.laserHeat - coolRate * dt);
    if (player._laserOverheated && player.laserHeat <= maxHeat * 0.3) player._laserOverheated = false;
    return;
  }

  // If overheated, keep cooling until safe threshold
  if (player._laserOverheated) {
    player.laserHeat = Math.max(0, player.laserHeat - coolRate * 1.15 * dt);
    if (player.laserHeat <= maxHeat * 0.3) player._laserOverheated = false;
    return;
  }

  // Heat up while firing
  player.laserHeat = Math.min(maxHeat, player.laserHeat + heatRate * dt);
  if (player.laserHeat >= maxHeat) {
    player._laserOverheated = true;
    return;
  }

  // Raycast along aimDir and damage all enemies on the line.
  const ox = player.x;
  const oy = player.y;
  const hitEnemies = [];
  let furthestHit = 0;

  for (const e of enemies) {
    if (e.hp <= 0) continue;

    const ex = e.x - ox;
    const ey = e.y - oy;
    const proj = ex * aimDir.x + ey * aimDir.y;
    if (proj <= 0 || proj > maxRange) continue;

    const px = aimDir.x * proj;
    const py = aimDir.y * proj;
    const dx = ex - px;
    const dy = ey - py;
    const r = (e.radius || 20) + 6;
    if (dx * dx + dy * dy <= r * r) {
      hitEnemies.push({ enemy: e, dist: proj });
      if (proj > furthestHit) furthestHit = proj;
    }
  }

  // Targeting 2.0 memory + aggro (pick closest hit along beam)
  if (hitEnemies.length > 0) {
    // hitEnemies are collected in scan order; choose closest by dist
    let closest = hitEnemies[0];
    for (const h of hitEnemies) {
      if (h.dist < closest.dist) closest = h;
      // Aggro any hit target
      if (h.enemy) {
        h.enemy._lastHitAt = state.time;
        h.enemy._lastHitBy = player.id || "local";
        h.enemy.aggroed = true;
      }
    }
    player.lastPlayerTarget = closest.enemy;
    player.lastPlayerTargetAt = state.time;
  }

  const dps = params && Number.isFinite(params.dps) ? params.dps : laserDpsForLevel(player.level);
  const damage = dps * dt;

  for (const h of hitEnemies) {
    h.enemy.hp -= damage;
    applyLifeSteal(player, damage);
  }

  if (hitEnemies.length > 0) {
    player._lastCombatAt = state.time;
  }

  // Beam length: go to furthest hit, or full range if no hits.
  const beamLen = hitEnemies.length > 0 ? furthestHit : maxRange;

  const vis = {
    x1: ox,
    y1: oy,
    x2: ox + aimDir.x * beamLen,
    y2: oy + aimDir.y * beamLen,
  };

  if (state._laserVisuals && typeof state._laserVisuals.set === "function") {
    state._laserVisuals.set(String(player.id || "local"), vis);
  } else {
    state._laserVisual = vis;
  }
}

function laserDpsForLevel(level) {
  // Laser stage: levels 150–300 (151 levels of scaling)
  const l = Math.max(0, Math.min(150, (level | 0) - 150));
  // Slightly stronger baseline and growth
  return 40 + (l / 150) * 110; // 40 → 150 DPS
}

export function maxRangeForLevel(level) {
  const l = Math.max(0, Math.min(150, (level | 0) - 150));
  // Range grows moderately with level
  return 200 + (l / 150) * 150; // 200 → 350
}
