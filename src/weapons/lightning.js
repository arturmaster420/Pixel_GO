import { applyCritToDamage, applyLifeSteal } from "../core/progression.js";
import { getNearestEnemy, getChainTargets } from "../enemies/utils.js";

export function fireChainLightning(player, state, params, aimDir) {
  const { enemies, floatingTexts } = state;

  let origin;
  if (aimDir) {
    // Prefer enemy in aim direction
    let best = null;
    const maxR = params.chainRange;
    const maxR2 = maxR * maxR;

    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > maxR2) continue;

      const dist = Math.sqrt(d2);
      const ndx = dx / dist;
      const ndy = dy / dist;
      const dot = ndx * aimDir.x + ndy * aimDir.y;
      if (dot < 0.4) continue;

      if (!best || d2 < best.d2) {
        best = { e, d2 };
      }
    }
    origin = best ? best.e : null;
  } else {
    origin = getNearestEnemy(player, enemies, params.chainRange);
  }

  if (!origin) return;

  player._lastCombatAt = state.time;

  const maxTargets = Math.max(2, params.maxTargets || 2);
  const targets = getChainTargets(origin, enemies, maxTargets, params.chainRange);
  let dmg = params.damage;

  const pts = [{ x: player.x, y: player.y }];
  // Targeting 2.0 memory + aggro
  if (targets && targets.length > 0) {
    player.lastPlayerTarget = targets[0];
    player.lastPlayerTargetAt = state.time;
    for (const tt of targets) {
      if (tt) {
        tt._lastHitAt = state.time;
        tt._lastHitBy = player.id || "local";
        tt.aggroed = true;
      }
    }
  }

  for (const t of targets) {
    pts.push({ x: t.x, y: t.y });
    const critDmg = applyCritToDamage(player, dmg);
    t.hp -= critDmg;
    applyLifeSteal(player, critDmg);
    floatingTexts.push({
      x: t.x,
      y: t.y - 20,
      text: Math.round(critDmg).toString(),
      time: 0.5,
    });
    dmg *= 0.75;
  }

  // Co-op safe visuals
  if (state._lightningVisuals && typeof state._lightningVisuals.set === "function") {
    state._lightningVisuals.set(String(player.id || "local"), pts);
  } else {
    state._lightningVisual = pts;
  }
}
