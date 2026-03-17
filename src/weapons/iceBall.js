// Biome skill: Ice Ball (projectile with AoE + slow)

import { applyCritToDamage, applyLifeSteal } from "../core/progression.js";
import { getNearestEnemy } from "../enemies/utils.js";

export function updateIceBall(player, state, dt, params) {
  if (!player || !state || !params) return;
  const enemies = state.enemies || [];
  if (!Array.isArray(enemies) || enemies.length <= 0) return;

  player.iceWallCooldown = (player.iceWallCooldown || 0) - dt;
  if (player.iceWallCooldown > 0) return;

  const target = getNearestEnemy(player, enemies, params.range);
  if (!target) {
    player.iceWallCooldown = Math.max(0.25, params.cooldown * 0.5);
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
    type: "iceball",
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
    slowDur: params.slowDur,
    slowMult: params.slowMult,
    frostDur: params.frostDur,
  });

  player._lastCombatAt = state.time;
  player.iceWallCooldown = params.cooldown;
}

export function explodeIceBall(ball, state) {
  if (!ball || !state) return;
  const enemies = state.enemies || [];
  if (!Array.isArray(enemies) || enemies.length <= 0) return;

  const owner = (typeof state._getPlayerById === "function")
    ? (state._getPlayerById(ball.ownerId) || state.player)
    : (state.player);

  const r = Math.max(10, ball.splashRadius || 0);
  const r2 = r * r;
  const now = state.time || 0;

  for (const e of enemies) {
    if (!e || e.hp <= 0) continue;
    const dx = e.x - ball.x;
    const dy = e.y - ball.y;
    if (dx * dx + dy * dy > r2) continue;

    const dmg = applyCritToDamage(owner, ball.damage || 0);
    e.hp -= dmg;
    applyLifeSteal(owner, dmg);
    owner._lastCombatAt = now;
    e._lastHitAt = now;
    e._lastHitBy = owner.id || "local";
    e.aggroed = true;

    const slowDur = Math.max(0.35, Number(ball.slowDur || 0));
    const slowMult = Math.max(0.18, Math.min(0.92, Number(ball.slowMult || 0.72)));
    e._barrierDebuffUntil = Math.max((e._barrierDebuffUntil || 0), now + slowDur);
    e._barrierSlowMult = Math.min((e._barrierSlowMult || 1), slowMult);
    e._barrierDmgMult = Math.min((e._barrierDmgMult || 1), 1);

    const frostDur = Math.max(0.8, Number(ball.frostDur || slowDur));
    e._frostLeft = Math.max((e._frostLeft || 0), frostDur);
    e._frostLv = Math.max((e._frostLv || 0), 1);
  }

  if (!Array.isArray(state._explosions)) state._explosions = [];
  state._explosions.push({ x: ball.x, y: ball.y, r, t: 0.35, kind: "ice" });
}
