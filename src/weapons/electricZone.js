// Electric Zone (Magic Survival inspired): AoE around the player that pulses damage.

import { applyCritToDamage, applyLifeSteal } from "../core/progression.js";

export function updateElectricZone(player, state, dt, params) {
  const lvl = params?.level | 0;
  if (!player || !state || lvl <= 0) {
    if (player) player._electricZoneVis = null;
    return;
  }

  const enemies = state.enemies || [];
  const r = params.radius;

  player._electricZoneVis = { radius: r };

  player._electricZoneTick = (player._electricZoneTick || 0) - dt;
  if (player._electricZoneTick > 0) return;
  player._electricZoneTick = params.tick;

  const r2 = r * r;
  let didHit = false;
  for (const e of enemies) {
    if (!e || e.hp <= 0) continue;
    const dx = e.x - player.x;
    const dy = e.y - player.y;
    if (dx * dx + dy * dy <= r2) {
      const dealt = applyCritToDamage(player, params.pulseDamage);
      e.hp -= dealt;
      applyLifeSteal(player, dealt);
      didHit = true;
      e._lastHitAt = state.time;
      e._lastHitBy = player.id || "local";
      e.aggroed = true;
    }
  }

  if (didHit) player._lastCombatAt = state.time;
}
