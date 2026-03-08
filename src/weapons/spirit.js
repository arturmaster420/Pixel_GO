// Spirit (Magic Survival inspired): small flame(s) above the player that shoot basic shots.
// - In-run: max 3 spirits (lvl 1..6): +1 at lvl 4, +1 at lvl 6
// - Shop meta upgrades can add +2 more (one extra at lvl 4 and lvl 6)

import { getNearestEnemy } from "../enemies/utils.js";

function getOffsets(count) {
  const step = 12;
  const mid = (count - 1) / 2;
  const out = [];
  for (let i = 0; i < count; i++) out.push((i - mid) * step);
  return out;
}

export function updateSpirit(player, state, dt, params) {
  const lvl = params?.level | 0;
  if (!player || !state || lvl <= 0) {
    if (player) player._spiritVis = null;
    return;
  }

  const time = state.time || 0;
  const enemies = state.enemies || [];
  const projectiles = state.projectiles || (state.projectiles = []);

  const count = Math.max(1, params.count | 0);
  const range = params.range || 260;
  const damage = params.damage || 1;
  const rate = params.rate || 1.0; // volleys/sec; each volley fires (count) shots
  const projectileSpeed = params.projectileSpeed || 900;

  // Expose minimal info for rendering.
  player._spiritVis = { count };

  // Cooldown shared across spirits (one volley = count shots).
  player._spiritCd = (player._spiritCd || 0) - dt;
  if (player._spiritCd > 0) return;

  const cd = 1 / Math.max(0.01, rate);
  player._spiritCd = cd;

  const target = getNearestEnemy(player, enemies, range);
  if (!target) return;

  const offsets = getOffsets(count);
  const baseY = player.y - (player.radius || 18) - 16;

  for (let i = 0; i < count; i++) {
    const sx = player.x + offsets[i];
    const sy = baseY + Math.sin(time * 7.0 + i * 1.7) * 1.2;

    const dx = target.x - sx;
    const dy = target.y - sy;
    const d = Math.hypot(dx, dy) || 0.0001;
    const nx = dx / d;
    const ny = dy / d;

    const pid = (state._nextProjectileId = (state._nextProjectileId || 0) + 1);
    projectiles.push({
      id: pid,
      x: sx,
      y: sy,
      ownerId: player.id || "local",
      vx: nx * projectileSpeed,
      vy: ny * projectileSpeed,
      speed: projectileSpeed,
      damage,
      range,
      travel: 0,
      radius: 4,
      type: "spiritShot",
    });
  }
}
