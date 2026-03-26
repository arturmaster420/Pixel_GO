// Biome skill: Light Heal
// Periodic healing pulse for the player and nearby allies.

function nextFxId(state) {
  state._nextFxId = (state._nextFxId || 0) + 1;
  return state._nextFxId;
}

export function emitHealPulse(player, state, params) {
  if (!player || !state || !params) return;

  const players = typeof state.getPlayersArr === "function" ? state.getPlayersArr(state) : null;
  const arr = Array.isArray(players) ? players : (state.playersArr || [state.player]);

  const r = Math.max(40, params.radius || 0);
  const r2 = r * r;

  for (const p of arr) {
    if (!p || p.hp <= 0) continue;
    const dx = p.x - player.x;
    const dy = p.y - player.y;
    if (dx * dx + dy * dy > r2) continue;
    p.hp = Math.min(p.maxHP || 100, p.hp + (params.heal || 0));
    const shieldBonus = Math.max(0, Number(params.shieldBonus || 0));
    const maxShield = Math.max(0, Number(p._energyBarrierMaxShield || 0));
    if (shieldBonus > 0 && maxShield > 0) {
      const curShield = Math.max(0, Number(p._energyBarrierShield || 0));
      p._energyBarrierShield = Math.min(maxShield, curShield + shieldBonus);
    }
  }

  if (!Array.isArray(state.healPulses)) state.healPulses = [];
  state.healPulses.push({
    id: nextFxId(state),
    x: player.x,
    y: player.y,
    r: r,
    t: 0.55,
  });
}

export function updateHealPulses(state, dt) {
  if (!state || !Array.isArray(state.healPulses)) return;
  for (let i = state.healPulses.length - 1; i >= 0; i--) {
    const p = state.healPulses[i];
    if (!p) { state.healPulses.splice(i, 1); continue; }
    p.t -= dt;
    if (p.t <= 0) state.healPulses.splice(i, 1);
  }
}
