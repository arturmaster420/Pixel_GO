// Summon Tanks: defensive minions that taunt enemies and soak damage.
// - They do NOT attack.
// - In-run (lvl 1..6): +1 tank at lvl 4, +1 at lvl 6 (max 3).
// - Shop meta upgrades can add +2 more (extra at lvl 4 and lvl 6).

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function getNearestEnemyTo(x, y, enemies, maxRange) {
  let best = null;
  const maxR2 = (maxRange || 999999) ** 2;
  for (const e of enemies) {
    if (!e || e.hp <= 0) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= maxR2 && (!best || d2 < best.d2)) best = { e, d2 };
  }
  return best ? best.e : null;
}

function ensureSummonArray(state) {
  if (!state) return [];
  if (!Array.isArray(state.summons)) state.summons = [];
  return state.summons;
}

function spawnTank(player, state, params, idx, total) {
  const summons = ensureSummonArray(state);
  const ownerId = player?.id ?? "local";
  const pid = (state._nextSummonId = (state._nextSummonId || 0) + 1);

  const ang = (Math.PI * 2) * (idx / Math.max(1, total));
  const r = 36 + (idx % 2) * 10;
  const x = (player?.x || 0) + Math.cos(ang) * r;
  const y = (player?.y || 0) + Math.sin(ang) * r;

  const hp = Math.max(1, params.hp | 0);
  const def = clamp(Number(params.def || 0), 0, 0.75);

  const s = {
    id: `smn:${ownerId}:${pid}`,
    kind: "tank",
    isSummon: true,
    ownerId: String(ownerId),
    x,
    y,
    radius: params.radius || 18,
    hp,
    maxHp: hp,
    def,
    moveSpeed: params.moveSpeed || 95,
    tauntR: params.tauntR || 260,
    age: 0,
  };

  // Used by enemy contact damage (see enemies/* contact hit code)
  s._dmgInMult = clamp(1 - def, 0.15, 1);

  summons.push(s);
  return s;
}

export function updateSummonTanks(player, state, dt, params) {
  if (!player || !state) return;

  // In co-op, keep summons authoritative on the host to avoid client-side divergence.
  const online = !!(state.net && state.net.roomCode);
  const isHost = !!(online && state.net.isHost);
  if (online && !isHost) {
    // Still keep a tiny hint so HUD/debug can show the skill exists.
    const desiredCount = params && (params.count | 0) > 0 ? (params.count | 0) : 0;
    player._summonVis = desiredCount > 0 ? { count: desiredCount } : null;
    return;
  }

  const summons = ensureSummonArray(state);
  const ownerId = String(player.id ?? "local");

  // If the skill is not active, remove owned summons (keeps state clean).
  const desiredCount = params && (params.count | 0) > 0 ? (params.count | 0) : 0;
  if (desiredCount <= 0) {
    if (summons.length) {
      state.summons = summons.filter((s) => !(s && s.isSummon && String(s.ownerId) === ownerId));
    }
    player._summonVis = null;
    return;
  }

  // Keep a small rendering hint on the player.
  player._summonVis = { count: desiredCount };

  // Collect owned summons
  let owned = summons.filter((s) => s && s.isSummon && String(s.ownerId) === ownerId && (s.hp | 0) > 0);

  // Spawn missing
  if (owned.length < desiredCount) {
    // Cooldown is per-owner.
    if (!state._summonTankCD) state._summonTankCD = {};
    let cd = Number(state._summonTankCD[ownerId] || 0);
    cd -= dt;

    const spawnCd = Number(params.cooldown || 6.0);
    // Spawn at most one tank per cooldown tick.
    if (cd <= 0) {
      const idx = owned.length;
      spawnTank(player, state, params, idx, desiredCount);
      cd = spawnCd;
    }

    state._summonTankCD[ownerId] = cd;
    owned = summons.filter((s) => s && s.isSummon && String(s.ownerId) === ownerId && (s.hp | 0) > 0);
  }

  // Remove extras (if count reduced)
  if (owned.length > desiredCount) {
    const keep = new Set();
    for (let i = 0; i < desiredCount; i++) keep.add(owned[i].id);
    state.summons = summons.filter((s) => !s || !s.isSummon || String(s.ownerId) !== ownerId || keep.has(s.id));
    owned = state.summons.filter((s) => s && s.isSummon && String(s.ownerId) === ownerId && (s.hp | 0) > 0);
  }

  const enemies = state.enemies || [];
  // Keep tanks far enough from the hero so they don't "drag" packs onto the player.
  // They should form a frontline.
  const followDist = Number(params.followDist || 96);

  // A shared target near the player helps them "tank" in the right place.
  const sharedTargetRange = (params.lureR || params.tauntR || 260) * 1.05;
  const sharedTarget = getNearestEnemyTo(player.x, player.y, enemies, sharedTargetRange);

  // Update each tank
  for (let i = 0; i < owned.length; i++) {
    const s = owned[i];
    if (!s) continue;

    s.age = (s.age || 0) + dt;

    // Refresh stats from params (allows level scaling).
    const newMax = Math.max(1, params.hp | 0);
    if (newMax !== (s.maxHp | 0)) {
      const ratio = s.maxHp > 0 ? clamp(s.hp / s.maxHp, 0, 1) : 1;
      s.maxHp = newMax;
      s.hp = Math.max(1, Math.round(newMax * ratio));
    }
    s.def = clamp(Number(params.def || 0), 0, 0.75);
    s._dmgInMult = clamp(1 - s.def, 0.15, 1);
    s.moveSpeed = params.moveSpeed || s.moveSpeed || 95;
    s.tauntR = params.tauntR || s.tauntR || 260;
    s.radius = params.radius || s.radius || 18;

    // Death cleanup
    if (s.hp <= 0) continue;

    let tx, ty;

    if (sharedTarget && sharedTarget.hp > 0) {
      // Frontline positioning:
      // Target point is defined relative to the PLAYER so the tank never "walks back" into the hero.
      const ex = sharedTarget.x;
      const ey = sharedTarget.y;
      const pdx = ex - player.x;
      const pdy = ey - player.y;
      const distPE = Math.hypot(pdx, pdy) || 1;
      const nx = pdx / distPE;
      const ny = pdy / distPE;

      const standOff = (sharedTarget.radius || 20) + (s.radius || 18) + 14;
      // Desired point on the line to the enemy, but clamped so the tank stays at least followDist away from the hero.
      // This prevents enemies from being pulled onto the player when they collide with the tank.
      const maxFront = Math.max(followDist + 20, Math.min((params.lureR || params.tauntR || 260) * 0.75, 320));
      const desiredFromPlayer = clamp(distPE - standOff, followDist, maxFront);

      tx = player.x + nx * desiredFromPlayer;
      ty = player.y + ny * desiredFromPlayer;

      // Slight side offset so multiple tanks form a line.
      const side = (i - (owned.length - 1) / 2) * 20;
      tx += -ny * side;
      ty += nx * side;
    } else {
      // No enemy: stay near the player.
      const ang = (Math.PI * 2) * (i / Math.max(1, owned.length));
      tx = player.x + Math.cos(ang) * followDist;
      ty = player.y + Math.sin(ang) * followDist;
    }

    const dx = tx - s.x;
    const dy = ty - s.y;
    const d = Math.hypot(dx, dy) || 1;

    const speed = Math.max(55, s.moveSpeed || 95);
    const step = clamp(speed * dt, 0, d);
    s.x += (dx / d) * step;
    s.y += (dy / d) * step;


    // Soft preferred distance from the hero (no hard wall).
    // Allows tanks to pass through the player if they need to reposition,
    // but gently biases them to stay around followDist.
    const px = s.x - player.x;
    const py = s.y - player.y;
    const pd = Math.hypot(px, py) || 1;
    const prefer = followDist * 0.95;
    if (pd < prefer * 0.55) {
      // Tiny nudge outward only when extremely close (prevents "stuck on player").
      const push = (prefer * 0.55 - pd) * 0.08;
      s.x += (px / pd) * push;
      s.y += (py / pd) * push;
    }

    // Soft separation between tanks (prevents stacking).
    for (let j = 0; j < owned.length; j++) {
      if (j === i) continue;
      const o = owned[j];
      if (!o) continue;
      const sx = s.x - o.x;
      const sy = s.y - o.y;
      const sd2 = sx * sx + sy * sy;
      const rr = (s.radius || 18) + (o.radius || 18) + 2;
      if (sd2 > 0.0001 && sd2 < rr * rr) {
        const sd = Math.sqrt(sd2);
        const push = (rr - sd) * 0.35;
        s.x += (sx / sd) * push;
        s.y += (sy / sd) * push;
      }
    }
  }

  // Lure enemies away from the hero: mark enemies near the hero so they prefer a tank.
  if (owned.length && enemies.length) {
    const lureR = Number(params.lureR || params.tauntR || 0);
    const hold = Number(params.tauntHold || 0.85);
    if (lureR > 0 && hold > 0) {
      if (!state._summonTankTauntTick) state._summonTankTauntTick = {};
      let tick = Number(state._summonTankTauntTick[ownerId] || 0);
      tick -= dt;
      if (tick <= 0) {
        const lr2 = lureR * lureR;
        const now = state.time || 0;

        for (const e of enemies) {
          if (!e || e.hp <= 0) continue;
          const dxp = e.x - player.x;
          const dyp = e.y - player.y;
          const d2p = dxp * dxp + dyp * dyp;
          if (d2p > lr2) continue;

          // Choose the nearest tank to the enemy.
          let best = owned[0];
          let bestD2 = Infinity;
          for (const s of owned) {
            const dx = e.x - s.x;
            const dy = e.y - s.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
              bestD2 = d2;
              best = s;
            }
          }

          if (best) {
            e._tauntedBySummonId = best.id;
            e._tauntedUntil = now + hold;
          }
        }

        // Re-apply a few times per second; cheap and keeps enemies redirected.
        tick = 0.22;
      }
      state._summonTankTauntTick[ownerId] = tick;
    }
  }

  // Purge dead summons (simple + safe).
  state.summons = (state.summons || []).filter((s) => s && (!s.isSummon || s.hp > 0));
}
