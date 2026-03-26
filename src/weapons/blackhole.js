// Biome skill: Blackhole
// Spawns a temporary singularity that pulls enemies and deals damage over time.

import { applyCritToDamage, applyLifeSteal } from "../core/progression.js";
import { getNearestEnemy } from "../enemies/utils.js";

function nextFxId(state) {
  state._nextFxId = (state._nextFxId || 0) + 1;
  return state._nextFxId;
}

export function spawnBlackhole(player, state, params) {
  if (!player || !state || !params) return;
  const enemies = state.enemies || [];
  if (!Array.isArray(enemies) || enemies.length <= 0) return;

  const target = getNearestEnemy(player, enemies, params.castRange);
  if (!target) return;

  if (!Array.isArray(state.blackholes)) state.blackholes = [];
  state.blackholes.push({
    id: nextFxId(state),
    ownerId: player.id || "local",
    x: target.x,
    y: target.y,
    r: params.radius,
    pull: params.pull,
    dps: params.dps,
    t: params.duration,
    tick: 0,
  });
}

export function updateBlackholes(state, dt) {
  if (!state || !Array.isArray(state.blackholes) || state.blackholes.length <= 0) return;
  const enemies = state.enemies || [];

  for (let i = state.blackholes.length - 1; i >= 0; i--) {
    const b = state.blackholes[i];
    if (!b) { state.blackholes.splice(i, 1); continue; }
    b.t -= dt;
    if (b.t <= 0) { state.blackholes.splice(i, 1); continue; }

    b.tick = (b.tick || 0) - dt;
    const doTick = b.tick <= 0;
    if (doTick) b.tick = 0.2;

    const r = Math.max(10, b.r || 0);
    const r2 = r * r;
    for (const e of enemies) {
      if (!e || e.hp <= 0) continue;
      const dx = b.x - e.x;
      const dy = b.y - e.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const d = Math.sqrt(Math.max(1e-6, d2));
      const ux = dx / d;
      const uy = dy / d;

      // Bosses resist pull.
      const bossResist = (e._isBoss || e.isBoss || e.boss) ? 0.25 : 1.0;
      const pull = (b.pull || 0) * bossResist;
      e.x += ux * pull * dt;
      e.y += uy * pull * dt;

      if (doTick) {
        const owner = typeof state._getPlayerById === "function" ? (state._getPlayerById(b.ownerId) || state.player) : state.player;
        const dmg = applyCritToDamage(owner, (b.dps || 0) * 0.2);
        e.hp -= dmg;
        applyLifeSteal(owner, dmg);
        owner._lastCombatAt = state.time;
        e._lastHitAt = state.time;
        e._lastHitBy = owner.id || "local";
        e.aggroed = true;
      }
    }
  }
}
