import { updateIceWalls } from "../weapons/iceWall.js";
import { updateBlackholes } from "../weapons/blackhole.js";
import { updateHealPulses } from "../weapons/lightHeal.js";
import { explodeFireball } from "../weapons/fireball.js";
import { explodeIceBall } from "../weapons/iceBall.js";
import { clampPlayerToActiveWalkable, clampEntityToRoomWalkable, clampEnemyToRoomBounds } from "../world/floorCollision.js";
import { HUB_HALF, HUB_CORNER_R, isPointInHub } from "../world/zoneController.js";
import { applyCritToDamage, applyLifeSteal } from "./progression.js";
import { getPlayerById } from "./netPlayerRuntime.js";
import { maybeEnterDeathContinueOverlay } from "./lifecycleRuntime.js";
import { applyFireBurnState, applyIceControlState, explodeBurningEnemy, resolveBurnOwner } from "./heroBiomeCombat.js";

export function updateSkillFx(state, dt) {
  if (!state) return;
  try { updateBlackholes(state, dt); } catch {}
  try { updateIceWalls(state, dt); } catch {}
  try { updateHealPulses(state, dt); } catch {}

  // Explosions are purely visual.
  if (Array.isArray(state._explosions)) {
    for (let i = state._explosions.length - 1; i >= 0; i--) {
      const ex = state._explosions[i];
      if (!ex) { state._explosions.splice(i, 1); continue; }
      ex.t -= dt;
      if (ex.t <= 0) state._explosions.splice(i, 1);
    }
  }
}


export function updateEnemies(state, dt) {
  const { enemies } = state;

  // Zone 0 (Hub) is a safe green area. Enemies must never enter it.
  // Enforce it centrally (covers all enemy types, co-op + solo).
  const HUB_PAD = 6; // small padding so enemies don't visually overlap the hub edge

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];

    // Biome status ticks (burn / marks). Applies to all enemy types.
    try {
      if (e) {
        if (typeof e._burnLeft === 'number' && e._burnLeft > 0) {
          e._burnLeft -= dt;
          const dps = (typeof e._burnDps === 'number' ? e._burnDps : 0);
          if (dps > 0) {
            e.hp -= dps * dt;
            e._lastHitAt = state.time;
          }
          if (e._burnLeft <= 0) {
            e._burnLeft = 0;
            e._burnDps = 0;
          }
        }
        if (typeof e._frostLeft === 'number' && e._frostLeft > 0) {
          e._frostLeft -= dt;
          if (e._frostLeft <= 0) { e._frostLeft = 0; e._frostLv = 0; }
        }
        if (typeof e._freezeBuild === 'number' && e._freezeBuild > 0) {
          e._freezeBuild = Math.max(0, e._freezeBuild - dt * 0.18);
        }
        if (typeof e._frozenUntil === 'number' && e._frozenUntil <= state.time) {
          e._frozenUntil = 0;
        }
        if (typeof e._curseLeft === 'number' && e._curseLeft > 0) {
          e._curseLeft -= dt;
          if (e._curseLeft <= 0) { e._curseLeft = 0; e._curseLv = 0; }
        }
      }
    } catch {}

    const _prevEnemyX = Number(e?.x) || 0;
    const _prevEnemyY = Number(e?.y) || 0;

    if (e.update) {
      // Defensive: a single enemy script error must not freeze the whole run.
      // If an enemy update throws, remove that enemy and continue.
      try {
        e.update(e, dt, state);
      } catch (err) {
        try { console.error("Enemy update error:", e && (e.type || e.id), err); } catch {}
        enemies.splice(i, 1);
        continue;
      }
    }

    // Keep enemies outside of the Hub safe contour only when the enemy actually belongs to
    // the Hub room. Applying this globally creates an invisible blocker near world origin in
    // combat rooms that happen to be centered around the same coordinates.
    if (e && !e._ignoreHub) {
      let enemyRoomForHubGuard = null;
      try {
        const rd = state?.roomDirector || null;
        const enemyRoomIndex = (e?._roomIndex | 0) || 0;
        if (rd && enemyRoomIndex > 0) {
          if ((rd.current?.index | 0) === enemyRoomIndex) enemyRoomForHubGuard = rd.current;
          else if ((rd.prev?.index | 0) === enemyRoomIndex && rd.prev && !rd.prev.removed) enemyRoomForHubGuard = rd.prev;
          else if ((rd.next?.index | 0) === enemyRoomIndex && rd.next && !rd.next.removed) enemyRoomForHubGuard = rd.next;
        } else if (rd?.current) {
          enemyRoomForHubGuard = rd.current;
        }
      } catch {}
      const hubRoomGuard = !!(enemyRoomForHubGuard?.arenaSpec?.rules?.isHub || String(enemyRoomForHubGuard?.biomeKey || '').toLowerCase() === 'hub' || ((enemyRoomForHubGuard?.index | 0) === 0));
      if (hubRoomGuard) {
        const er = (e.radius || 20);
        const pad = er + HUB_PAD;
        const ex = (e.x || 0);
        const ey = (e.y || 0);
        if (isPointInHub(ex, ey, pad)) {
          // Project to the nearest point on the padded rounded-square boundary.
          const half = HUB_HALF + pad;
          const cr = Math.min(HUB_CORNER_R + pad, half);
          const inner = Math.max(half - cr, 0);

          const sx = ex < 0 ? -1 : 1;
          const sy = ey < 0 ? -1 : 1;
          const ax = Math.abs(ex);
          const ay = Math.abs(ey);

          let nx = ex;
          let ny = ey;

          // Corner region
          if (ax > inner && ay > inner) {
            const cx = sx * inner;
            const cy = sy * inner;
            let vx = ex - cx;
            let vy = ey - cy;
            const len = Math.hypot(vx, vy) || 0.0001;
            vx /= len;
            vy /= len;
            nx = cx + vx * cr;
            ny = cy + vy * cr;
          } else {
            // Side region: push to the closest side.
            const dx = half - ax;
            const dy = half - ay;
            if (dx <= dy) nx = sx * half;
            else ny = sy * half;
          }

          e.x = nx;
          e.y = ny;
        }
      }
    }

    try {
      const rd = state?.roomDirector || null;
      let enemyRoom = rd?.current || null;
      const enemyRoomIndex = (e?._roomIndex | 0) || 0;
      if (rd && enemyRoomIndex > 0) {
        if ((rd.current?.index | 0) === enemyRoomIndex) enemyRoom = rd.current;
        else if ((rd.prev?.index | 0) === enemyRoomIndex && rd.prev && !rd.prev.removed) enemyRoom = rd.prev;
        else if ((rd.next?.index | 0) === enemyRoomIndex && rd.next && !rd.next.removed) enemyRoom = rd.next;
        else enemyRoom = null;
      }
      if (enemyRoom) {
        if (String(e?._movementModel || '') === 'roomBoundsChase') {
          clampEnemyToRoomBounds(e, enemyRoom, { pad: 2, prevX: _prevEnemyX, prevY: _prevEnemyY });
        } else {
          clampEntityToRoomWalkable(e, enemyRoom, {
            pad: 0,
            prevX: _prevEnemyX,
            prevY: _prevEnemyY,
            useCovers: false,
            maxSnapDistance: Math.max(72, (Number(e?.radius) || 18) * 3.2),
          });
        }
      }
      else if (!enemyRoomIndex) clampPlayerToActiveWalkable(e, state, { pad: 1, prevX: _prevEnemyX, prevY: _prevEnemyY });
    } catch {}

    if (e.hp <= 0 || e._remove) {
      try { explodeBurningEnemy(resolveBurnOwner(state, e), e, state); } catch {}
      // Light affinity: heal the killer on kill.
      try {
        const killerId = e && e._lastHitBy != null ? String(e._lastHitBy) : "";
        if (killerId) {
          const killer = getPlayerById(state, killerId);
          const lv = killer && killer.runPassives ? (killer.runPassives.affLight | 0) : 0;
          if (killer && lv > 0 && killer.hp > 0) {
            const heal = 2 + lv * 2;
            killer.hp = Math.min(killer.maxHP || 999999, killer.hp + heal);
            if (Array.isArray(state.floatingTexts)) {
              state.floatingTexts.push({ x: killer.x, y: killer.y - 42, text: `+${heal} HP`, time: 0.9 });
            }
          }
        }
      } catch {}
      if (!e._noScore) {
        const baseScore = e.scoreValue || 10;
        const scoreMult = state.meta?.scoreMult || 1;
        state.runScore += baseScore * scoreMult;
      }
      if (e.onDeath) {
        e.onDeath(e, state);
      }
      if (state.spawnSystem && typeof state.spawnSystem.onEnemyRemoved === "function") {
        state.spawnSystem.onEnemyRemoved(e, state);
      }
      enemies.splice(i, 1);
    }
  }
}


export function updateProjectiles(state, dt) {
  const { projectiles, rockets, enemies } = state;

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const b = projectiles[i];
    if (b && b.id == null) {
      b.id = (state._nextProjectileId = (state._nextProjectileId || 0) + 1);
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.travel += b.speed * dt;

    // Fireball / Ice Ball: explode on max range.
    if ((b.type === 'fireball' || b.type === 'iceball') && b.travel >= b.range) {
      try { (b.type === 'iceball' ? explodeIceBall : explodeFireball)(b, state); } catch {}
      projectiles.splice(i, 1);
      continue;
    }

    if (b.travel >= b.range) {
      projectiles.splice(i, 1);
      continue;
    }

    let hit = false;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      const dx = e.x - b.x;
      const dy = e.y - b.y;
      const r = (e.radius || 20) + (b.radius || 4);
      if (dx * dx + dy * dy <= r * r) {
        // Fireball / Ice Ball: explode instead of direct single-target hit.
        if (b.type === 'fireball' || b.type === 'iceball') {
          hit = true;
          break;
        }
        const owner = getPlayerById(state, b.ownerId) || state.player;
        let dmg = applyCritToDamage(owner, b.damage);
        if (b.type === 'iceShard') {
          applyIceControlState(owner, e, state, { frostDur: 1.6, slowDur: 0.85, slowMult: 0.78, freezeBuild: 0.52 });
        }
        if (b.type === 'spiritShot') {
          e._curseLeft = Math.max((e._curseLeft || 0), Number(b.curseDur || 1.1));
          e._curseLv = Math.max((e._curseLv || 0), Number(b.curseLv || 1));
        }

        // Biome marks (Ice/Dark) increase damage vs marked targets.
        try {
          const rp = owner && owner.runPassives ? owner.runPassives : null;
          const iceLv = rp ? (rp.affIce | 0) : 0;
          const darkLv = rp ? (rp.affDark | 0) : 0;
          if (iceLv > 0 && (e._frostLeft || 0) > 0) dmg *= (1 + iceLv * 0.07);
          if (darkLv > 0 && (e._curseLeft || 0) > 0) dmg *= (1 + darkLv * 0.06);
        } catch {}

        e.hp -= dmg;
        applyLifeSteal(owner, dmg);
        owner._lastCombatAt = state.time;
        // Targeting 2.0 memory + aggro
        owner.lastPlayerTarget = e;
        owner.lastPlayerTargetAt = state.time;
        e._lastHitAt = state.time;
        e._lastHitBy = owner.id || "local";
        e.aggroed = true;

        // Apply biome on-hit effects (Fire burn, Ice/Dark mark, Electric zap).
        try {
          const rp = owner && owner.runPassives ? owner.runPassives : null;
          const fireLv = rp ? (rp.affFire | 0) : 0;
          const iceLv = rp ? (rp.affIce | 0) : 0;
          const darkLv = rp ? (rp.affDark | 0) : 0;
          const elecLv = rp ? (rp.affElectric | 0) : 0;

          if (fireLv > 0) {
            const dur = 1.4 + fireLv * 0.35;
            const dps = Math.max((e._burnDps || 0), 2.2 + fireLv * 1.35);
            applyFireBurnState(owner, e, dur, dps, 0.7);
          }

          if (iceLv > 0) {
            applyIceControlState(owner, e, state, { frostDur: 2.0, slowDur: 0.95, slowMult: 0.74, freezeBuild: 0.40 + iceLv * 0.08 });
          }

          if (darkLv > 0) {
            e._curseLeft = Math.max((e._curseLeft || 0), 2.4);
            e._curseLv = Math.max((e._curseLv || 0), darkLv);
          }

          if (elecLv > 0 && state && Array.isArray(state.enemies)) {
            const chance = Math.min(0.30, 0.10 + elecLv * 0.04);
            if (Math.random() < chance) {
              const rZap = 160 + elecLv * 24;
              const r2Zap = rZap * rZap;
              let best = null;
              let bestD2 = Infinity;
              for (const ee of state.enemies) {
                if (!ee || ee === e || ee.hp <= 0) continue;
                const dx2 = ee.x - e.x;
                const dy2 = ee.y - e.y;
                const d2 = dx2 * dx2 + dy2 * dy2;
                if (d2 <= r2Zap && d2 < bestD2) { best = ee; bestD2 = d2; }
              }
              if (best) {
                const zapDmg = dmg * (0.22 + elecLv * 0.05);
                best.hp -= zapDmg;
                best._lastHitAt = state.time;
                best._lastHitBy = owner.id || "local";
                if (Array.isArray(state.floatingTexts)) {
                  state.floatingTexts.push({ x: best.x, y: best.y - 22, text: "ZAP", time: 0.5 });
                }
              }
            }
          }
        } catch {}
        hit = true;
        break;
      }
    }

    if (hit) {
      if (b.type === 'fireball' || b.type === 'iceball') {
        try { (b.type === 'iceball' ? explodeIceBall : explodeFireball)(b, state); } catch {}
      }
      projectiles.splice(i, 1);
    }
  }

  for (let i = rockets.length - 1; i >= 0; i--) {
    const rkt = rockets[i];
    if (rkt && rkt.id == null) {
      rkt.id = (state._nextRocketId = (state._nextRocketId || 0) + 1);
    }
    rkt.x += rkt.vx * dt;
    rkt.y += rkt.vy * dt;
    rkt.travel += rkt.speed * dt;

    let explode = false;

    if (rkt.travel >= rkt.range) {
      explode = true;
    } else {
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        const dx = e.x - rkt.x;
        const dy = e.y - rkt.y;
        const rr = (e.radius || 24) + (rkt.radius || 6);
        if (dx * dx + dy * dy <= rr * rr) {
          explode = true;
          break;
        }
      }
    }

    if (explode) {
      explodeRocket(rkt, state);
      rockets.splice(i, 1);
    }
  }
}


export function explodeRocket(rocket, state) {
  const { enemies, floatingTexts } = state;
  const r2 = rocket.splashRadius * rocket.splashRadius;

  const owner = getPlayerById(state, rocket.ownerId) || state.player;
  const kind = String(rocket?.type || 'rocket');
  const hitList = [];

  for (const e of enemies) {
    const dx = e.x - rocket.x;
    const dy = e.y - rocket.y;
    if (dx * dx + dy * dy <= r2) {
      hitList.push(e);
      let dmg = applyCritToDamage(owner, rocket.damage);
      try {
        const rp = owner && owner.runPassives ? owner.runPassives : null;
        const iceLv = rp ? (rp.affIce | 0) : 0;
        const darkLv = rp ? (rp.affDark | 0) : 0;
        if (iceLv > 0 && (e._frostLeft || 0) > 0) dmg *= (1 + iceLv * 0.07);
        if (darkLv > 0 && (e._curseLeft || 0) > 0) dmg *= (1 + darkLv * 0.06);
      } catch {}
      e.hp -= dmg;
      applyLifeSteal(owner, dmg);
      owner._lastCombatAt = state.time;
      owner.lastPlayerTarget = e;
      owner.lastPlayerTargetAt = state.time;
      e._lastHitAt = state.time;
      e._lastHitBy = owner.id || "local";
      e.aggroed = true;

      try {
        const rp = owner && owner.runPassives ? owner.runPassives : null;
        const fireLv = rp ? (rp.affFire | 0) : 0;
        const iceLv = rp ? (rp.affIce | 0) : 0;
        const darkLv = rp ? (rp.affDark | 0) : 0;
        if (fireLv > 0) {
          const dur = 1.2 + fireLv * 0.35;
          const dps = Math.max((e._burnDps || 0), 2.0 + fireLv * 1.25);
          applyFireBurnState(owner, e, dur, dps, 0.65);
        }
        if (iceLv > 0) {
          applyIceControlState(owner, e, state, { frostDur: 1.8, slowDur: 0.9, slowMult: 0.76, freezeBuild: 0.36 + iceLv * 0.08 });
        }
        if (darkLv > 0) {
          e._curseLeft = Math.max((e._curseLeft || 0), 2.2);
          e._curseLv = Math.max((e._curseLv || 0), darkLv);
        }
      } catch {}

      if (kind === 'fireBomb') {
        const burnDur = Math.max((e._burnLeft || 0), Number(rocket.burnDur || 1.4));
        const burnDps = Math.max((e._burnDps || 0), Number(rocket.burnDps || 6));
        applyFireBurnState(owner, e, burnDur, burnDps, 1.0);
      } else if (kind === 'iceBomb') {
        applyIceControlState(owner, e, state, { frostDur: Number(rocket.frostDur || 1.6), slowDur: Number(rocket.slowDur || 1.0), slowMult: Number(rocket.slowMult || 0.72), freezeBuild: 0.74 });
      }
    }
  }

  if (kind === 'energyBomb') {
    const zapRange = Math.max(40, Number(rocket.zapRange || 120));
    const zapTargets = Math.max(0, Number(rocket.zapTargets || 0) | 0);
    const zapDamage = Math.max(0, Number(rocket.zapDamage || 0));
    if (zapTargets > 0 && zapDamage > 0) {
      const already = new Set(hitList);
      const nearby = [];
      const zr2 = zapRange * zapRange;
      for (const e of enemies) {
        if (!e || e.hp <= 0 || already.has(e)) continue;
        const dx = e.x - rocket.x;
        const dy = e.y - rocket.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > zr2) continue;
        nearby.push({ e, d2 });
      }
      nearby.sort((a, b) => a.d2 - b.d2);
      for (const { e } of nearby.slice(0, zapTargets)) {
        const dmg = applyCritToDamage(owner, zapDamage);
        e.hp -= dmg;
        applyLifeSteal(owner, dmg);
        owner._lastCombatAt = state.time;
        owner.lastPlayerTarget = e;
        owner.lastPlayerTargetAt = state.time;
        e._lastHitAt = state.time;
        e._lastHitBy = owner.id || "local";
        e.aggroed = true;
      }
    }
  }

  if (Array.isArray(state._explosions)) {
    const exKind = kind === 'fireBomb' ? 'fire' : (kind === 'iceBomb' ? 'ice' : (kind === 'energyBomb' ? 'electric' : ''));
    if (exKind) state._explosions.push({ x: rocket.x, y: rocket.y, r: rocket.splashRadius || 70, t: 0.34, kind: exKind });
  }

  floatingTexts.push({
    x: rocket.x,
    y: rocket.y,
    text: kind === 'fireBomb' ? 'FIRE' : (kind === 'iceBomb' ? 'ICE' : (kind === 'energyBomb' ? 'ZAP' : 'BOOM')),
    time: 0.6,
  });
}


export function checkPlayerDeath(state) {
  // Retired for Pixel_GO room-runs. Death is now handled by the in-run continue / hub overlay.
  maybeEnterDeathContinueOverlay(state);
}
