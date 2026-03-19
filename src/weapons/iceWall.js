// Biome skill: Ice Wall
// Creates temporary barrier segments that strongly slow + push enemies.

import { applyCritToDamage, applyLifeSteal } from "../core/progression.js";

function nextFxId(state) {
  state._nextFxId = (state._nextFxId || 0) + 1;
  return state._nextFxId;
}

export function spawnIceWall(player, state, params, aimDir) {
  if (!player || !state || !params) return;
  if (!Array.isArray(state.iceWalls)) state.iceWalls = [];

  const dir = aimDir && Number.isFinite(aimDir.x) && Number.isFinite(aimDir.y)
    ? aimDir
    : (player.lastAimDir || { x: 0, y: 1 });
  const d = Math.hypot(dir.x, dir.y) || 1;
  const nx = dir.x / d;
  const ny = dir.y / d;

  // Wall line is perpendicular to the aim direction.
  const angle = Math.atan2(ny, nx) + Math.PI * 0.5;
  const cx = player.x + nx * params.placeDist;
  const cy = player.y + ny * params.placeDist;

  state.iceWalls.push({
    id: nextFxId(state),
    ownerId: player.id || "local",
    x: cx,
    y: cy,
    a: angle,
    len: params.length,
    thick: params.thickness,
    t: params.duration,
    tick: 0,
    dmg: params.damage,
    slow: params.slowMult,
    push: params.pushSpeed,
  });
}

// Host/offline: apply ice wall slow/push/damage.
export function updateIceWalls(state, dt) {
  if (!state || !Array.isArray(state.iceWalls) || state.iceWalls.length <= 0) return;
  const enemies = state.enemies || [];
  if (!Array.isArray(enemies) || enemies.length <= 0) {
    // Still decay timers.
    for (let i = state.iceWalls.length - 1; i >= 0; i--) {
      const w = state.iceWalls[i];
      w.t -= dt;
      if (w.t <= 0) state.iceWalls.splice(i, 1);
    }
    return;
  }

  for (let i = state.iceWalls.length - 1; i >= 0; i--) {
    const w = state.iceWalls[i];
    if (!w) { state.iceWalls.splice(i, 1); continue; }
    w.t -= dt;
    if (w.t <= 0) { state.iceWalls.splice(i, 1); continue; }

    // Tick damage in pulses (cheap).
    w.tick = (w.tick || 0) - dt;
    const doTick = w.tick <= 0;
    if (doTick) w.tick = 0.28;

    const ca = Math.cos(w.a);
    const sa = Math.sin(w.a);
    const halfL = (w.len || 160) * 0.5;
    const halfT = (w.thick || 24) * 0.5;

    // For each enemy: transform into wall local space.
    for (const e of enemies) {
      if (!e || e.hp <= 0) continue;
      const dx = e.x - w.x;
      const dy = e.y - w.y;
      // local coords: u along wall, v across wall (normal)
      const u = dx * ca + dy * sa;
      const v = -dx * sa + dy * ca;

      const rad = (e.radius || 20);
      if (Math.abs(u) > halfL + rad) continue;
      if (Math.abs(v) > halfT + rad) continue;

      // Apply a strong temporary slow while intersecting.
      // Reuse the existing "barrier debuff" fields so all enemy AIs respect the slow.
      const slow = Math.max(0.15, w.slow || 0.25);
      e._barrierDebuffUntil = Math.max((e._barrierDebuffUntil || 0), (state.time || 0) + 0.22);
      e._barrierSlowMult = Math.min((e._barrierSlowMult || 1), slow);
      // Do not reduce enemy outgoing damage here (ice wall is about control), keep 1.
      e._barrierDmgMult = Math.min((e._barrierDmgMult || 1), 1);

      // Push enemy away from the wall centerline (prevents just walking through).
      const sign = v >= 0 ? 1 : -1;
      const push = (w.push || 160) * dt * sign;
      // normal in world space is perpendicular to wall direction (across axis)
      const nwx = -sa;
      const nwy = ca;
      e.x += nwx * push;
      e.y += nwy * push;

      if (doTick) {
        const owner = typeof state._getPlayerById === "function" ? (state._getPlayerById(w.ownerId) || state.player) : state.player;
        const dmg = applyCritToDamage(owner, w.dmg || 0);
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
