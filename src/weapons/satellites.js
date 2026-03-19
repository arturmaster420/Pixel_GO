// Satellites (Magic Survival inspired): orbiting orbs that damage enemies on contact.

import { applyCritToDamage, applyLifeSteal } from "../core/progression.js";

export function updateSatellites(player, state, dt, params) {
  const lvl = params?.level | 0;
  if (!player || !state || lvl <= 0) {
    if (player) player._satelliteVis = null;
    return;
  }

  const enemies = state.enemies || [];
  const time = state.time || 0;

  const count = Math.max(1, params.count | 0);
  const orbitR = params.orbitR;
  const orbR = params.orbR;
  const dmg = params.hitDamage;
  const tick = params.tick;

  // Visual params for rendering (client-side for joiners too).
  player._satelliteVis = { count, orbitR, orbR, speed: params.orbitSpeed || 1.2 };

  // Damage tick (avoid per-frame heavy scans).
  player._satelliteTick = (player._satelliteTick || 0) - dt;
  if (player._satelliteTick > 0) return;
  player._satelliteTick = tick;

  const a0 = time * (params.orbitSpeed || 1.2);
  const step = (Math.PI * 2) / Math.max(1, count);

  let didHit = false;

  for (let i = 0; i < count; i++) {
    const a = a0 + i * step;
    const ox = player.x + Math.cos(a) * orbitR;
    const oy = player.y + Math.sin(a) * orbitR;

    for (const e of enemies) {
      if (!e || e.hp <= 0) continue;
      const dx = e.x - ox;
      const dy = e.y - oy;
      const rr = (e.radius || 20) + orbR;
      if (dx * dx + dy * dy <= rr * rr) {
        const dealt = applyCritToDamage(player, dmg);
        e.hp -= dealt;
        applyLifeSteal(player, dealt);
        didHit = true;
        e._lastHitAt = state.time;
        e._lastHitBy = player.id || "local";
        e.aggroed = true;
      }
    }
  }

  if (didHit) {
    player._lastCombatAt = state.time;
  }
}
