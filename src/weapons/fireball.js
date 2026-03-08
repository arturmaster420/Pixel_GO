// Biome skill: Fireball (projectile with AoE + burn)

import { applyCritToDamage, applyLifeSteal } from "../core/progression.js";
import { getNearestEnemy } from "../enemies/utils.js";

export function updateFireball(player, state, dt, params) {
  if (!player || !state || !params) return;
  const enemies = state.enemies || [];
  if (!Array.isArray(enemies) || enemies.length <= 0) return;

  player.fireballCooldown = (player.fireballCooldown || 0) - dt;
  if (player.fireballCooldown > 0) return;

  const target = getNearestEnemy(player, enemies, params.range);
  if (!target) {
    // No target: wait a bit and retry.
    player.fireballCooldown = Math.max(0.25, params.cooldown * 0.5);
    return;
  }

  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const d = Math.hypot(dx, dy) || 1;
  const vx = (dx / d) * params.speed;
  const vy = (dy / d) * params.speed;

  if (!Array.isArray(state.projectiles)) state.projectiles = [];
  const pid = (state._nextProjectileId = (state._nextProjectileId || 0) + 1);
  state.projectiles.push({
    id: pid,
    type: "fireball",
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
    splashRadius: params.splashRadius,
    burnDur: params.burnDur,
    burnDps: params.burnDps,
  });

  player._lastCombatAt = state.time;
  player.fireballCooldown = params.cooldown;
}

export function explodeFireball(fb, state) {
  if (!fb || !state) return;
  const enemies = state.enemies || [];
  if (!Array.isArray(enemies) || enemies.length <= 0) return;

  // Use the host-side helper when available (wired in gameLoop); fallback to local.
  const owner = (typeof state._getPlayerById === "function")
    ? (state._getPlayerById(fb.ownerId) || state.player)
    : (state.player);

  const r = Math.max(10, fb.splashRadius || 0);
  const r2 = r * r;

  for (const e of enemies) {
    if (!e || e.hp <= 0) continue;
    const dx = e.x - fb.x;
    const dy = e.y - fb.y;
    if (dx * dx + dy * dy > r2) continue;

    const dmg = applyCritToDamage(owner, fb.damage || 0);
    e.hp -= dmg;
    applyLifeSteal(owner, dmg);
    owner._lastCombatAt = state.time;
    e._lastHitAt = state.time;
    e._lastHitBy = owner.id || "local";
    e.aggroed = true;

    // Strong burn from the fireball itself (independent from affinity).
    const dur = Math.max(e._burnLeft || 0, fb.burnDur || 0);
    const dps = Math.max(e._burnDps || 0, fb.burnDps || 0);
    if (dur > 0 && dps > 0) {
      e._burnLeft = dur;
      e._burnDps = dps;
    }
  }

  if (!Array.isArray(state._explosions)) state._explosions = [];
  state._explosions.push({ x: fb.x, y: fb.y, r: r, t: 0.35, kind: "fire" });
}
