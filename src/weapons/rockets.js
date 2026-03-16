export function fireRockets(player, state, dir, params) {
  const { rockets } = state;
  const angle = Math.atan2(dir.dy ?? dir.y, dir.dx ?? dir.x);
  const count = params.count;
  const spreadRad = (12 * Math.PI) / 180;

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const offset = (t - 0.5) * spreadRad;
    const a = angle + offset;
    const speed = 550;

    // Stable id for net snapshot caching (joiners render rockets smoothly between snapshots)
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
      radius: 6,
      splashRadius: params.splashRadius,
      type: "rocket",
    });
  }
}
