export function fireBombs(player, state, dir, params) {
  const { rockets } = state;
  const angle = Math.atan2(dir.dy ?? dir.y, dir.dx ?? dir.x);
  const count = params.count || 1;
  const spreadRad = (18 * Math.PI) / 180;

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const offset = (t - 0.5) * spreadRad;
    const a = angle + offset;

    const speed = params.speed || 320;

    // Reuse rocket id space for net snapshot smoothing.
    const rid = (state._nextRocketId = (state._nextRocketId || 0) + 1);

    rockets.push({
      id: rid,
      x: player.x,
      y: player.y,
      ownerId: player.id || "local",
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      speed,
      damage: params.damage,
      range: params.range,
      travel: 0,
      radius: params.radius || 7,
      splashRadius: params.splashRadius,
      type: "bomb",
    });
  }
}
