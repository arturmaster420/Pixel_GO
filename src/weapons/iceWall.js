// Legacy biome skill FX: Ice Wall
// Disabled because forced enemy displacement caused bad arena behavior.

export function spawnIceWall(player, state, params, aimDir) {
  // Retained as a compatibility stub on purpose.
  return;
}

export function updateIceWalls(state, dt) {
  if (!state || !Array.isArray(state.iceWalls) || state.iceWalls.length <= 0) return;
  // Clean up any stale legacy entries without affecting enemies.
  for (let i = state.iceWalls.length - 1; i >= 0; i--) {
    const w = state.iceWalls[i];
    if (!w) { state.iceWalls.splice(i, 1); continue; }
    w.t = Number(w.t || 0) - Number(dt || 0);
    if (w.t <= 0) state.iceWalls.splice(i, 1);
  }
}
