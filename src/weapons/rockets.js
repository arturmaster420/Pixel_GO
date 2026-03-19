export function fireRockets(player, state, dir, params) {
  const { rockets } = state;
  const angle = Math.atan2(dir.dy ?? dir.y, dir.dx ?? dir.x);
  const count = Math.max(1, params.count || 1);
  const spreadRad = (12 * Math.PI) / 180;
  const speed = params.speed || 550;
  const radius = params.radius || 6;
  const type = String(params.type || "rocket");

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const offset = (t - 0.5) * spreadRad;
    const a = angle + offset;

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
      radius,
      splashRadius: params.splashRadius,
      type,
      burnDur: params.burnDur,
      burnDps: params.burnDps,
      frostDur: params.frostDur,
      slowDur: params.slowDur,
      slowMult: params.slowMult,
      zapRange: params.zapRange,
      zapTargets: params.zapTargets,
      zapDamage: params.zapDamage,
    });
  }
}
