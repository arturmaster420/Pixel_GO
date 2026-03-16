import { getZone, getZoneScaling, ZONE_RADII, ZONE6_SQUARE_HALF, ZONE6_CORNER_POINTS, isPointInHub, WORLD_SCALE } from "./zoneController.js";
import { createBasicMob } from "../enemies/mobBasic.js";
import { createEliteMob } from "../enemies/mobElite.js";
import { createZoneSpecialEnemy } from "../enemies/zoneSpecials.js";
import { createRoamingBoss } from "../enemies/roamingBoss.js";
import { createResurrectionGuardian } from "../enemies/resurrectionGuardian.js";
import { createZone6SuperBoss } from "../enemies/zone6SuperBoss.js";
import { hasReachedResurrectionThreshold } from "../core/progression.js";

function randRange(a, b) {
  return a + Math.random() * (b - a);
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// Balance knobs by zone (0 is hub)
const ZONE_GROUPS_PER_CELL = {
  // Zone 1: sparse, "walk a bit → find a pack" pacing.
  // We generate at most 1 group per streamed cell (often 0), and rely on activation distance
  // so packs appear as you approach them instead of dumping many packs at once.
  // NOTE: keep it "one encounter at a time" (enforced later), but ensure exploration
  // doesn't feel empty. We allow 1–2 candidates per cell and filter near the Hub.
  // Zone 1: keep encounters clearly separated.
  // One group per streamed cell yields consistent spacing without feeling empty.
  1: [1, 1],
  2: [2, 4],
  3: [2, 3],
  4: [2, 3],
  5: [3, 4],
  6: [3, 4],
};

const ZONE_TYPE_WEIGHTS = {
  // Zone 1: only basic mobs (no camps / elites / bosses)
  1: { herd: 0.60, patrol: 0.40, camp: 0.00 },
  2: { herd: 0.50, patrol: 0.35, camp: 0.15 },
  3: { herd: 0.45, patrol: 0.35, camp: 0.20 },
  4: { herd: 0.40, patrol: 0.35, camp: 0.25 },
  5: { herd: 0.35, patrol: 0.35, camp: 0.30 },
  6: { herd: 0.30, patrol: 0.35, camp: 0.35 },
};

function pickGroupTypeByZone(zone) {
  const w = ZONE_TYPE_WEIGHTS[zone] || ZONE_TYPE_WEIGHTS[3];
  const r = Math.random();
  if (r < w.camp) return "camp";
  if (r < w.camp + w.patrol) return "patrol";
  return "herd";
}

function herdCountByZone(z) {
  if (z <= 1) return [4, 7];
  if (z === 2) return [5, 8];
  if (z === 3) return [6, 10];
  if (z === 4) return [7, 12];
  return [8, 14]; // zones 5-6
}

function patrolCountByZone(z) {
  if (z <= 1) return [3, 5];
  if (z === 2) return [4, 6];
  if (z === 3) return [5, 8];
  if (z === 4) return [6, 9];
  return [7, 11];
}

function campMinionsByZone(z) {
  if (z <= 1) return [3, 5];
  if (z === 2) return [4, 6];
  if (z === 3) return [5, 8];
  if (z === 4) return [6, 10];
  return [7, 12];
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function smoothstep(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

// Zone 1 pack sizing: companies of 5, ramping up to 10 by the end of Zone 1.
// Keep it conservative near the Hub by using an eased progress curve.
function zone1PackSizeAt(x, y) {
  const r1 = ZONE_RADII[1];
  // Hub is a rounded square; use HUB_HALF (ZONE_RADII[0]) as a stable inner bound.
  const inner = ZONE_RADII[0];
  const r = Math.hypot(x, y);
  let t = (r - inner) / Math.max(1, (r1 - inner));
  t = clamp(t, 0, 1);
  // Start at 5 near the Hub and smoothly ramp towards 10 as you go deeper in Zone 1.
  // Keep the first part conservative so the first encounters are always small.
  // Delay the ramp a bit so the first encounters stay at 5.
  const ramp = smoothstep((t - 0.35) / 0.65);
  const n = Math.round(5 + 5 * ramp);
  return clamp(n, 5, 10);
}

// Balance layer for the long 1–500 weapon curve:
// we scale newly spawned enemies a bit with player level so that
// late stages (laser/chain) still have something to chew on.
function applyLevelZoneBalance(enemy, zone, playerLevel) {
  if (!enemy) return;
  const z = clamp(zone | 0, 1, 6);
  const lvl = clamp(playerLevel | 0, 1, 500);
  const t = (lvl - 1) / 499; // 0..1

  // Level-based multipliers (zone-aware): HP grows more than damage.
  const hpCoef = [0, 0.7, 0.9, 1.4, 2.0, 2.7, 3.4][z];
  const dmgCoef = [0, 0.20, 0.26, 0.38, 0.52, 0.66, 0.82][z];
  const xpCoef = [0, 0.18, 0.20, 0.24, 0.30, 0.36, 0.42][z];

  const hpMul = 1 + t * hpCoef;
  const dmgMul = 1 + t * dmgCoef;
  const xpMul = 1 + t * xpCoef;

  if (Number.isFinite(enemy.hp)) enemy.hp *= hpMul;
  if (Number.isFinite(enemy.maxHp)) enemy.maxHp *= hpMul;
  if (Number.isFinite(enemy.damage)) enemy.damage *= dmgMul;
  if (Number.isFinite(enemy.xpValue)) enemy.xpValue *= xpMul;
  if (Number.isFinite(enemy.scoreValue)) enemy.scoreValue *= xpMul;
}

function randomPointInRing(innerR, outerR) {
  const ang = Math.random() * Math.PI * 2;
  // Uniform by area
  const r = Math.sqrt(Math.random() * (outerR * outerR - innerR * innerR) + innerR * innerR);
  return { x: Math.cos(ang) * r, y: Math.sin(ang) * r };
}

function randomPointInZone(zone) {
  const r1 = ZONE_RADII[1];
  const r2 = ZONE_RADII[2];
  const r3 = ZONE_RADII[3];
  const r4 = ZONE_RADII[4];
  const r5 = ZONE_RADII[5];

  if (zone === 0) return { x: 0, y: 0 };

  // Zone 1 starts immediately outside the Hub (which is a rounded square).
  // Sample within the r1 disk and reject points that fall inside the Hub.
  if (zone === 1) {
    for (let k = 0; k < 40; k++) {
      const ang = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * r1;
      const p = { x: Math.cos(ang) * rr, y: Math.sin(ang) * rr };
      if (!isPointInHub(p.x, p.y)) return p;
    }
    // Fallback (should be rare)
    return randomPointInRing(r1 * 0.15, r1);
  }
  if (zone === 2) return randomPointInRing(r1, r2);
  if (zone === 3) return randomPointInRing(r2, r3);
  if (zone === 4) return randomPointInRing(r3, r4);
  if (zone === 5) return randomPointInRing(r4, r5);

  // Zone 6: outer ring + corners (square), reject points inside Zone 5
  for (let k = 0; k < 20; k++) {
    const useCorner = Math.random() < 0.35;
    let p;
    if (useCorner) {
      p = {
        x: randRange(-ZONE6_SQUARE_HALF, ZONE6_SQUARE_HALF),
        y: randRange(-ZONE6_SQUARE_HALF, ZONE6_SQUARE_HALF),
      };
    } else {
      p = randomPointInRing(r5, ZONE6_SQUARE_HALF);
    }
    if (Math.hypot(p.x, p.y) >= r5) return p;
  }
  // Fallback
  return randomPointInRing(r5, ZONE6_SQUARE_HALF);
}

function cellKey(cx, cy) {
  return cx + "," + cy;
}

export class SpawnSystem {
  constructor(state) {
    this.state = state;

    // World 2.0: group/camp based spawns + timed respawn
    // Balanced density: not too large groups in early zones, still not empty overall.
    // Streaming grid size should scale with world size so density stays similar.
    this.cellSize = 1800 * WORLD_SCALE;
    this.generatedCells = new Set();
    // Streaming cache bookkeeping: prevents unbounded growth when exploring far.
    // Keyed by "cx,cy" strings (same as generatedCells).
    this.cellSeenAt = new Map();
    this.cellGroups = new Map(); // cellKey -> Array<groupId>
    this.groups = new Map();
    this.nextGroupId = 1;

    // Stable enemy ids (important for co-op snapshot caching / smooth rendering)
    this.nextEnemyId = 1;

    // Roaming boss timer (kept, but spawn is world-anchored)
    this.roamingTimer = 0;

    // Zone 6 corner bosses (4 fixed points)
    this.cornerBossNextRespawnAt = [0, 0, 0, 0];
    this.cornerBossAlive = [false, false, false, false];


    // One-per-run spawns (kept)
    this.guardianSpawned = false;
    this.superBossSpawned = false;
    this.superBossPoint = null;

    // Pruning cadence (seconds)
    this._pruneNextAt = 0;

    // Spawn pacing credits (groups-per-second budget).
    // Previously we used a per-tick budget which could explode with high FPS.
    // Credits accumulate with dt and are spent when spawning dormant groups.
    this._spawnCredits = 0;

    // Zone 1 pacing: prevent multiple packs from spawning on top of each other.
    // Keyed by playerId string -> last spawn time.
    this._zone1LastPackAt = new Map();

    // Zone 1 safe-walk buffer outside the Hub.
    // While the player is still within this expanded hub shape, Zone 1 packs won't spawn.
    // IMPORTANT: keep this modest — players should meet the first pack shortly
    // after leaving the Hub, but not right on the border.
    this._zone1HubSafePad = 250; // unscaled (Hub is unscaled)

    // Zone 1 fixed layout (clockface): 12 sectors * 2 spawners.
    // - Mid spawner: 5 mobs, respawn 10s after wipe
    // - Outer spawner (near Zone2 border): 10 mobs
    // This replaces random/streamed Zone1 groups to guarantee stable pacing.
    this._zone1ClockSpawnersCreated = false;
    this._zone1ClockSpawnerIds = [];
    this._ensureZone1ClockSpawners();
  }

	  reset() {
    this.generatedCells.clear();
    this.cellSeenAt.clear();
    this.cellGroups.clear();
    this.groups.clear();
    this.nextGroupId = 1;

    this.nextEnemyId = 1;

    this.roamingTimer = 0;

    // Zone 6 corner bosses (4 fixed points)
    this.cornerBossNextRespawnAt = [0, 0, 0, 0];
    this.cornerBossAlive = [false, false, false, false];

    this.guardianSpawned = false;
    this.superBossSpawned = false;

    // Pick a fixed point for Zone 6 super boss (world-anchored)
    const p = randomPointInZone(6);
    this.superBossPoint = { x: p.x, y: p.y };

    this._pruneNextAt = 0;

    this._spawnCredits = 0;

    this._zone1LastPackAt = new Map();

    this._zone1ClockSpawnersCreated = false;
    this._zone1ClockSpawnerIds = [];
    this._ensureZone1ClockSpawners();
  }

  _ensureZone1ClockSpawners() {
    if (this._zone1ClockSpawnersCreated) return;

    const r1 = ZONE_RADII[1];
    // Keep spawners clearly outside the Hub border, but not too deep.
    // Hub is a rounded square; use HUB_HALF + pad as an inner radial approximation.
    const innerR = (ZONE_RADII[0] || 300) + 450;
    const outerR = Math.max(innerR + 200, r1 - 180);
    const midR = (innerR + outerR) * 0.5;

    const mk = (angRad, r, count, respawnDelaySec, minPlayerR) => {
      const x = Math.sin(angRad) * r;
      const y = -Math.cos(angRad) * r;
      // Safety: never place inside Hub. If it happens (shouldn't), push out.
      let px = x, py = y;
      if (isPointInHub(px, py, this._zone1HubSafePad)) {
        const rr = Math.max(r, innerR + 200);
        px = Math.sin(angRad) * rr;
        py = -Math.cos(angRad) * rr;
      }

      const g = this.createGroup(1, "herd", { x: px, y: py }, null);
      g.fixedCount = count;
      if (Number.isFinite(respawnDelaySec)) g.respawnDelaySec = respawnDelaySec;
      // Trigger fairly locally (player should walk into the "field"),
      // while a separate Zone1 pass guarantees it never goes fully empty.
      g.activationDist = 1350;
      g._zone1ClockMinPlayerR = Number.isFinite(minPlayerR) ? minPlayerR : 0;
      g._zone1ClockSpawner = true;
      this._zone1ClockSpawnerIds.push(g.id);
      return g;
    };

    // 12 sectors (hours): 12 o'clock = up, clockwise.
    for (let i = 0; i < 12; i++) {
      // Each "hour" is a sector between 2 rays (30°).
      // Place spawners INSIDE the sector ("in the field between lines"), not on the rays.
      const baseDeg = i * 30;
      const midAng = (baseDeg + 12) * (Math.PI / 180);   // slightly inside the sector
      const outerAng = (baseDeg + 18) * (Math.PI / 180); // slightly inside the sector

      // Mid spawner: always 5
      mk(midAng, midR, 5, 10, midR - 380);

      // Outer spawner: always 10, near Zone2 border
      // Respawn a bit slower so the outer edge doesn't feel like an endless wall.
      mk(outerAng, outerR, 10, 16, outerR - 420);
    }

    this._zone1ClockSpawnersCreated = true;
  }

  // Zone 1: fixed clockface spawners are meant to feel stable and never "go empty".
  // They should not depend on global spawn credits, otherwise a timing edge case
  // can result in "no mobs at all" in Zone 1.
  _updateZone1ClockSpawners(playersForWorld, playerZones, enemies) {
    if (!this._zone1ClockSpawnersCreated || !this._zone1ClockSpawnerIds || !this._zone1ClockSpawnerIds.length) return false;

    const state = this.state;
    const now = (state && typeof state.time === "number") ? state.time : 0;

    // Prevent stacking packs around the player.
    const blockR = 1800;
    const blockR2 = blockR * blockR;

    // Allow at most 1 clock-spawner to trigger per update to keep pacing readable.
    for (const it of playerZones) {
      if (!it || !it.p) continue;
      const p = it.p;

      const pr = Math.hypot(p.x || 0, p.y || 0);

      // Only outside the Hub (with the same small safe-walk pad).
      if (isPointInHub(p.x, p.y, this._zone1HubSafePad)) continue;

      // Trigger in Zone 1 primarily; allow Zone 2 edge-case near the border.
      const pz = it.z | 0;
      if (pz !== 1 && pz !== 2) continue;

      const pid = (p && p.id != null) ? String(p.id) : "local";
      const last = this._zone1LastPackAt ? (this._zone1LastPackAt.get(pid) || -1e9) : -1e9;
      if ((now - last) < 0.6) continue;

      let hasNear = false;
      for (const e of enemies) {
        if (!e || e.dead) continue;
        const dxE = e.x - p.x;
        const dyE = e.y - p.y;
        if (dxE * dxE + dyE * dyE <= blockR2) { hasNear = true; break; }
      }
      if (hasNear) continue;

      // Find the nearest ready clock spawner around this player.
      // If the player is already in the outer half of Zone 1, prefer the "10" packs.
      const preferOuter = pr >= 1900;

      const pickBest = (onlyOuter) => {
        let best = null;
        let bestD2 = Infinity;
        for (let i = 0; i < this._zone1ClockSpawnerIds.length; i++) {
          const gid = this._zone1ClockSpawnerIds[i];
          const g = gid ? this.groups.get(gid) : null;
          if (!g || g.isWiped || g.spawned) continue;
          if (onlyOuter && ((g.fixedCount | 0) < 10)) continue;

          const minR = g._zone1ClockMinPlayerR || 0;
          if (pr < minR) continue;

          const act = g.activationDist || 1350;
          const dx = g.center.x - p.x;
          const dy = g.center.y - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > act * act) continue;
          if (d2 < bestD2) { best = g; bestD2 = d2; }
        }
        return best;
      };

      let best = preferOuter ? pickBest(true) : null;
      if (!best) best = pickBest(false);

      if (best) {
        if (this._zone1LastPackAt) this._zone1LastPackAt.set(pid, now);
        this.spawnGroup(best, p);
        return true;
      }
    }

    return false;
  }

  ensureEnemyId(e) {
    if (!e) return;
    if (e.id == null) e.id = `e${this.nextEnemyId++}`;
    if (e._id == null) e._id = e.id;
  }

  onZoneChanged(newZone) {
    // Soft zones: reset roaming timer on zone change
    this.roamingTimer = 0;

    // Zone 6 corner bosses (4 fixed points)
    this.cornerBossNextRespawnAt = [0, 0, 0, 0];
    this.cornerBossAlive = [false, false, false, false];

  }

  onEnemyRemoved(enemy, state) {
    // Zone 6 corner boss respawn scheduling
    if (enemy && enemy.isZone6CornerBoss) {
      const idx = enemy.cornerIndex | 0;
      if (idx >= 0 && idx < 4) {
        this.cornerBossAlive[idx] = false;
        this.cornerBossNextRespawnAt[idx] = state.time + 90;
      }
    }

    const gid = enemy && enemy.groupId;
    if (!gid) return;

    const g = this.groups.get(gid);
    if (!g) return;

    g.aliveCount = Math.max(0, (g.aliveCount | 0) - 1);

    if (g.aliveCount <= 0 && g.spawned && !g.isWiped) {
      g.isWiped = true;
      g.spawned = false;
      g.wipedAt = state.time;
      g.nextRespawnAt = state.time + (g.respawnDelaySec || 20);
    }
  }

  // Create a new group object (initially not spawned)
  createGroup(zone, type, center, cellKeyHint = null) {
    const id = "g" + (this.nextGroupId++);
    // Respawn pacing: slightly faster early, slightly slower late
    const z = Math.max(0, Math.min(6, zone | 0));
    const baseRespawn = z <= 2 ? 14 : z === 3 ? 16 : z === 4 ? 18 : 20;
    const respawnDelay = type === "camp" ? baseRespawn + 14 : type === "patrol" ? baseRespawn + 6 : baseRespawn;

    const g = {
      id,
      zone,
      type,
      center: { x: center.x, y: center.y },
      cellKey: cellKeyHint,
      spawned: false,
      aliveCount: 0,
      isWiped: false,
      wipedAt: 0,
      nextRespawnAt: 0,
      respawnDelaySec: respawnDelay,
      // activation distance: spawn only when player is near the group location
      // Early zones spawn a bit closer (so it doesn't feel like "a giant pack appears"),
      // later zones spawn earlier.
      activationDist: ((type === "camp" ? 5400 : type === "patrol" ? 5200 : 4800) + z * 220) * WORLD_SCALE,
    };

    // Zone 1: spawn packs only when the player is fairly close to the pack center.
    // This makes "explore → stumble into a pack" feel, instead of many packs spawning at once.
    if ((zone | 0) === 1) {
      // Slightly larger than one streamed cell so you reliably "find" packs while walking,
      // but still close enough that packs don't pop in from far away.
      // Keep it large enough so packs don't "disappear" due to tight activation,
      // but still close enough to avoid far pop-in.
      g.activationDist = 2000; // world units (Hub is unscaled)
    }

    this.groups.set(id, g);

    // Track which groups belong to which streamed cell so we can prune cheaply.
    if (cellKeyHint) {
      let arr = this.cellGroups.get(cellKeyHint);
      if (!arr) { arr = []; this.cellGroups.set(cellKeyHint, arr); }
      arr.push(id);
    }
    return g;
  }

  spawnGroup(g, triggerPlayer) {
    const { enemies, player } = this.state;
    const z = g.zone;
    const cx = g.center.x;
    const cy = g.center.y;
    const pLevel = (triggerPlayer && triggerPlayer.level) || (player && player.level) || 1;

    const spawned = [];

    const pushEnemy = (e, ai) => {
      if (!e) return;
      // Ensure stable ids for network snapshots
      if (e.id == null) {
        e.id = `e${this.nextEnemyId++}`;
      }
      if (e._id == null) e._id = e.id;
      e.zone = z;
      e.groupId = g.id;
      e.aiMode = ai;
      // defaults for AI behaviors
      e.aggroed = false;
      e.aggroRange = ai === "camp" ? 520 : ai === "patrol" ? 520 : ai === "herdPassive" ? 360 : 500;

      if (ai === "camp") {
        e.campCenter = { x: cx, y: cy };
        e.campRadius = 700;
      } else if (ai === "patrol") {
        e.patrolCenter = { x: cx, y: cy };
        e.patrolRadius = randRange(260, 520);
        e._patrolAngle = Math.random() * Math.PI * 2;
      } else if (ai === "herdPassive") {
        e.herdCenter = { x: cx, y: cy };
        e.herdRadius = randRange(280, 520);
        e._idleAngle = Math.random() * Math.PI * 2;
      }

      // Global balance layer (level-aware)
      applyLevelZoneBalance(e, z, pLevel);

      enemies.push(e);
      spawned.push(e);
    };

    if (g.type === "herd") {
      const [minH, maxH] = herdCountByZone(z);
      // Zone 1: fixed-size companies, ramping towards the end of the zone.
      const count = (z === 1)
        ? (Number.isFinite(g.fixedCount) ? (g.fixedCount | 0) : zone1PackSizeAt(cx, cy))
        : randInt(minH, maxH);
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = randRange(50, 260);
        const pos = { x: cx + Math.cos(ang) * dist, y: cy + Math.sin(ang) * dist };

        if (z === 6) {
          // Zone 6: no basics
          if (Math.random() < 0.6) pushEnemy(createEliteMob(6, pos), "herdPassive");
          else pushEnemy(createZoneSpecialEnemy(6, pos), "herdPassive");
        } else {
          pushEnemy(createBasicMob(z, pos), "herdPassive");
        }
      }
    }

    if (g.type === "patrol") {
      const [minP, maxP] = patrolCountByZone(z);
      // Zone 1: fixed-size companies, ramping towards the end of the zone.
      const count = (z === 1)
        ? (Number.isFinite(g.fixedCount) ? (g.fixedCount | 0) : zone1PackSizeAt(cx, cy))
        : randInt(minP, maxP);
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = randRange(80, 340);
        const pos = { x: cx + Math.cos(ang) * dist, y: cy + Math.sin(ang) * dist };

        if (z === 6) {
          if (Math.random() < 0.75) pushEnemy(createEliteMob(6, pos), "patrol");
          else pushEnemy(createZoneSpecialEnemy(6, pos), "patrol");
        } else {
          // Zone 1 must be "basic-only".
          if (z === 1) {
            pushEnemy(createBasicMob(1, pos), "patrol");
          } else {
            if (Math.random() < 0.25) pushEnemy(createEliteMob(z, pos), "patrol");
            else pushEnemy(createBasicMob(z, pos), "patrol");
          }
        }
      }
    }

    if (g.type === "camp") {
      // Zone 1 must be "basic-only".
      // If a legacy camp group exists in zone 1, spawn a slightly larger basic pack instead.
      if (z === 1) {
        const count = Number.isFinite(g.fixedCount) ? (g.fixedCount | 0) : zone1PackSizeAt(cx, cy);
        for (let i = 0; i < count; i++) {
          const ang = Math.random() * Math.PI * 2;
          const dist = randRange(80, 360);
          const pos = { x: cx + Math.cos(ang) * dist, y: cy + Math.sin(ang) * dist };
          pushEnemy(createBasicMob(1, pos), "herdPassive");
        }
      } else {
        // 1 mini-boss (elite) + minions
        const bossPos = { x: cx + randRange(-60, 60), y: cy + randRange(-60, 60) };
        const boss = createEliteMob(z === 0 ? 1 : z, bossPos);
        // Make it feel like a mini-boss without adding new entity type
        boss.isMiniBoss = true;
        const zf = Math.max(1, z | 0);
        const hpMul = zf <= 1 ? 2.0 : zf === 2 ? 2.3 : zf === 3 ? 2.6 : 2.8;
        const dmgMul = zf <= 1 ? 1.2 : zf === 2 ? 1.25 : 1.35;
        boss.hp *= hpMul;
        boss.maxHp *= hpMul;
        boss.damage *= dmgMul;
        boss.radius = (boss.radius || 26) + (zf <= 2 ? 6 : 8);
        boss.xpValue = (boss.xpValue || 20) * 2.0;
        boss.scoreValue = (boss.scoreValue || 20) * 2.5;
        pushEnemy(boss, "camp");

        const [minM, maxM] = campMinionsByZone(z);
        const minions = randInt(minM, maxM);
        for (let i = 0; i < minions; i++) {
          const ang = Math.random() * Math.PI * 2;
          const dist = randRange(120, 420);
          const pos = { x: cx + Math.cos(ang) * dist, y: cy + Math.sin(ang) * dist };

          if (z === 6) {
            if (Math.random() < 0.6) pushEnemy(createEliteMob(6, pos), "camp");
            else pushEnemy(createZoneSpecialEnemy(6, pos), "camp");
          } else {
            if (Math.random() < 0.2) pushEnemy(createEliteMob(z, pos), "camp");
            else pushEnemy(createBasicMob(z, pos), "camp");
          }
        }
      }
    }

    g.spawned = true;
    g.isWiped = false;
    g.aliveCount = spawned.length;
  }

  ensureCellsAroundPlayer(player) {
    if (!player) return;
    const cs = this.cellSize;

    const now = (this.state && typeof this.state.time === "number") ? this.state.time : 0;

    const pcx = Math.floor(player.x / cs);
    const pcy = Math.floor(player.y / cs);

    // Generate a grid around player (streaming)
    // Scale radius a bit with party size so 7 players don't explode the group count.
    const party = (this.state.players && this.state.players.length) ? this.state.players.length : 1;
    const radius = party >= 4 ? 3 : 4; // 7x7 or 9x9
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const cx = pcx + dx;
        const cy = pcy + dy;
        const key = cellKey(cx, cy);
        // Mark as recently seen (even if already generated) to support pruning.
        this.cellSeenAt.set(key, now);
        if (this.generatedCells.has(key)) continue;
        this.generatedCells.add(key);

        // Create groups per cell depending on zone
        const center = {
          x: (cx + 0.5) * cs + randRange(-cs * 0.25, cs * 0.25),
          y: (cy + 0.5) * cs + randRange(-cs * 0.25, cs * 0.25),
        };

        const zone = getZone(center.x, center.y);
        if (zone === 0) continue; // Hub: no groups
        if ((zone | 0) >= 7) continue; // Zones 7–9: currently content-empty

        const [gMin, gMax] = ZONE_GROUPS_PER_CELL[zone] || [2, 3];
        const count = randInt(gMin, gMax);

        // Zone 1: add a safety buffer around the Hub, so you can step out and walk a bit
        // before meeting the first pack.
        // We treat an expanded rounded-square around the Hub as "no-spawn" area.
        // Zone 1: small buffer so you can step out of the Hub before the first encounter,
        // but not so large that Zone 1 feels empty.
        // Zone 1: allow a short "safe walk" after leaving the Hub.
        // Pad is unscaled because the Hub is unscaled.
        const hubNoSpawnPad = this._zone1HubSafePad;

        for (let k = 0; k < count; k++) {
          const p = {
            x: center.x + randRange(-cs * 0.25, cs * 0.25),
            y: center.y + randRange(-cs * 0.25, cs * 0.25),
          };
          const z = getZone(p.x, p.y);
          if (z === 0) continue;

          // Zone 1: use fixed clockface spawners (no random streamed Zone1 groups).
          if ((z | 0) === 1) continue;

          if ((z | 0) === 1) {
            // Don't place Zone 1 pack centers too close to the Hub.
            if (isPointInHub(p.x, p.y, hubNoSpawnPad)) continue;
          }

          const type = pickGroupTypeByZone(z);

          this.createGroup(z, type, p, key);
        }

        // Ambient orbs: XP/coin pickups that simply lie on the map (not only from mobs).
        // Spawn once per generated cell (streaming). Prefer cells closer to the player so they are actually visible.
        const cellDist = Math.max(Math.abs(dx), Math.abs(dy));
        this.spawnAmbientOrbsForCell(zone, center, cellDist);
      }
    }
  }

  spawnAmbientOrbsForCell(zone, center, cellDist = 0) {
    const state = this.state;
    if (!state || !Array.isArray(state.xpOrbs)) return;

    // Safety cap: avoid runaway ambient-orb generation.
    // We cap by *ambient* count (combat drops should not block ambient spawning).
    if ((state.xpOrbs.length | 0) > 1800) {
      let ambient = 0;
      for (let i = 0; i < state.xpOrbs.length; i++) {
        const o = state.xpOrbs[i];
        if (o && o.ambient) ambient++;
        if (ambient > 1100) return;
      }
    }
    const z0 = zone | 0;
    if (z0 === 0) return;
    if (z0 >= 7) return; // Zones 7–9: currently content-empty

    // Keep ambient orbs near the player so they don't "exist" far away where the player never sees them.
    // As the player explores, new nearby cells will generate their own ambient orbs.
    if ((cellDist | 0) > 2) return;

    // Chance by distance band (keep it present, but not flooding the ground).
    const d = (cellDist | 0);
    const chance =
      d === 0 ? 0.95 :
      d === 1 ? (z0 <= 2 ? 0.70 : z0 <= 4 ? 0.62 : 0.55) :
      (z0 <= 2 ? 0.55 : z0 <= 4 ? 0.45 : 0.38);
    if (Math.random() > chance) return;

    // Ambient orb density (tuned down: previous 3x was too much).
    const ORB_MULT = 1;

    // Visible density: give noticeably more in nearby cells (so you actually see them on the ground).
    // Distant (still within 5x5) cells get fewer to keep total count reasonable.
    let baseCount;
    if (z0 <= 2) baseCount = d === 0 ? randInt(2, 4) : d === 1 ? randInt(1, 3) : randInt(1, 2);
    else if (z0 <= 4) baseCount = d === 0 ? randInt(2, 3) : d === 1 ? randInt(1, 2) : randInt(1, 1);
    else baseCount = d === 0 ? randInt(1, 2) : d === 1 ? randInt(1, 1) : 0;
    const count = baseCount * ORB_MULT;
    if (count <= 0) return;

    const cs = this.cellSize;
    const s = getZoneScaling(z0);
    for (let i = 0; i < count; i++) {
      const x = center.x + randRange(-cs * 0.38, cs * 0.38);
      const y = center.y + randRange(-cs * 0.38, cs * 0.38);
      const z = getZone(x, y) | 0;
      if (z === 0) continue; // don't leak into hub

      const roll = Math.random();
      if (roll < 0.18) {
        state.xpOrbs.push({
          x,
          y,
          radius: 8,
          kind: "coin",
          coins: 1,
          age: 0,
          // They should not "randomly disappear" while you're nearby.
          // Still cleaned up eventually so exploration doesn't accumulate infinite orbs.
          ttl: randRange(420, 720),
          spawnDelay: 0.20,
          ambient: true,
        });
      } else {
        state.xpOrbs.push({
          x,
          y,
          radius: 8,
          kind: "xp",
          xp: Math.max(6, Math.round(6 * (s.xp || 1))),
          age: 0,
          ttl: randRange(420, 720),
          spawnDelay: 0.20,
          ambient: true,
        });
      }
    }
  }

  update(dt) {
    const state = this.state;
    const enemies = state.enemies;

    // Host sim has multiple players in co-op. Spawning must react to ALL players,
    // otherwise only the host sees new camps as they explore.
    const allPlayers = (state.players && state.players.length)
      ? state.players.filter(Boolean)
      : (state.player ? [state.player] : []);

    const alivePlayers = allPlayers.filter((p) => p && p.hp > 0);
    const playersForWorld = alivePlayers.length ? alivePlayers : allPlayers;
    if (!playersForWorld.length) return;

    // Periodic pruning of streaming caches (prevents exponential slowdown when exploring far / long).
    // IMPORTANT: this is host/offline only (joiners are snapshot-driven).
    this._maybePruneStreamingCaches(playersForWorld);

    const playerZones = playersForWorld.map((p) => ({ p, z: getZone(p.x, p.y) }));
    let maxZone = 0;
    let hasNonHub = false;
    for (const it of playerZones) {
      if (!it) continue;
      maxZone = Math.max(maxZone, it.z | 0);
      if ((it.z | 0) !== 0) hasNonHub = true;
    }

    // Zone 0 (Hub): safe (no enemy spawning), but still allow other players to stream groups outside hub.
    if (hasNonHub) {
      for (const it of playerZones) {
        if (!it || (it.z | 0) === 0) continue;
        this.ensureCellsAroundPlayer(it.p);
      }
    }

    // Respawn timer transitions (wipe → ready)
    for (const g of this.groups.values()) {
      if (g.isWiped && state.time >= g.nextRespawnAt) {
        // Becomes dormant again (will spawn when a player approaches)
        g.isWiped = false;
        g.spawned = false;
        g.aliveCount = 0;
      }
    }

    // Zone 1: fixed clockface spawners (12 sectors × 2) should always feel present.
    // Run this pass BEFORE the global credit-budget pass.
    // (This avoids rare cases where Zone 1 ends up empty due to budget/timing.)
    this._updateZone1ClockSpawners(playersForWorld, playerZones, enemies);

    // Spawn dormant groups when ANY player approaches.
    // IMPORTANT: budget is now "groups per second" (credit-based), not per-frame.
    // This makes the first seconds after leaving the Hub feel gradual and prevents
    // runaway spawns on fast machines.
    const baseRatePerSec =
      maxZone >= 6 ? 5 :
      maxZone >= 5 ? 4 :
      maxZone >= 4 ? 3 :
      maxZone >= 3 ? 3 :
      maxZone >= 2 ? 2 :
      // Zone 1: much slower pacing so you "walk a bit" before finding a pack.
      1.0;

    const extraPlayers = Math.max(0, (playersForWorld.length | 0) - 1);
    const extraMul = (maxZone <= 1) ? 0.5 : 1.25;
    let spawnRate = baseRatePerSec + Math.min(6, extraPlayers * extraMul);
    spawnRate = Math.min(10, spawnRate);

    // Accumulate credits only when at least one player is outside the Hub.
    // This prevents "walking out of the Hub" from instantly dumping a stored budget.
    const carryCap = maxZone <= 1 ? 1.0 : maxZone <= 2 ? 2.5 : maxZone <= 4 ? 3.5 : 4.5;
    if (!hasNonHub) {
      this._spawnCredits = 0;
    } else {
      this._spawnCredits = Math.min(carryCap, (this._spawnCredits || 0) + Math.max(0, dt) * spawnRate);
    }
    const budgetStart = Math.floor(this._spawnCredits);
    let spawnBudget = budgetStart;

    if (hasNonHub) {
      for (const g of this.groups.values()) {
        if (spawnBudget <= 0) break;
        if (!g || g.isWiped || g.spawned) continue;
        // Zone 1 fixed clockface spawners are handled by a dedicated pass.
        if (g._zone1ClockSpawner) continue;

        // Only spawn if some player is in same zone AND near the group center
        let triggeredBy = null;
        for (const it of playerZones) {
          if (!it || (it.z | 0) === 0) continue;
          if ((it.z | 0) !== (g.zone | 0)) continue;

          const dx = g.center.x - it.p.x;
          const dy = g.center.y - it.p.y;
          const d2 = dx * dx + dy * dy;
          const act = g.activationDist || 4500;
          if (d2 <= act * act) {
            triggeredBy = it.p;
            break;
          }
        }

        if (triggeredBy) {
          // Zone 1: do not stack packs.
          // If the player already has ANY enemies nearby, wait until they clear/move on.
          if ((g.zone | 0) === 1) {
            // Allow a short "safe walk" after leaving the Hub.
            // Prevents packs from spawning right on the Hub border.
            if (isPointInHub(triggeredBy.x, triggeredBy.y, this._zone1HubSafePad)) continue;

            const pid = (triggeredBy && triggeredBy.id != null) ? String(triggeredBy.id) : "local";
            const last = this._zone1LastPackAt ? (this._zone1LastPackAt.get(pid) || 0) : 0;
            // Small anti-double-trigger window (e.g. multiple groups in the same frame).
            if ((state.time - last) < 0.6) continue;

            // Don't stack packs, but keep the radius local (avoid blocking the whole Zone 1).
            const blockR = 1800;
            const blockR2 = blockR * blockR;
            let hasNear = false;
            for (const e of enemies) {
              if (!e || e.dead) continue;
              const dxE = e.x - triggeredBy.x;
              const dyE = e.y - triggeredBy.y;
              if (dxE * dxE + dyE * dyE <= blockR2) { hasNear = true; break; }
            }
            if (hasNear) continue;

            if (this._zone1LastPackAt) this._zone1LastPackAt.set(pid, state.time);
          }

          this.spawnGroup(g, triggeredBy);
          spawnBudget--;
        }
      }
    }

    // Note: credit spending is handled once at the end of the spawn passes.

    // Despawn far-away spawned groups to prevent global accumulation (key for co-op smoothness).
    // Without this, exploring different zones with multiple players leaves many enemies alive far away,
    // causing constant micro-freezes even on PC.
    if (hasNonHub && this.groups.size > 0) {
      const DESPAWN_DIST = 18000 * WORLD_SCALE;
      const DESPAWN_DIST2 = DESPAWN_DIST * DESPAWN_DIST;
      const DESPAWN_AFTER = 8.0; // seconds far away before unloading

      const toDespawn = [];
      for (const g of this.groups.values()) {
        if (!g || !g.spawned || g.isWiped) continue;

        let minD2 = Infinity;
        for (const it of playerZones) {
          if (!it || (it.z | 0) === 0) continue;
          const dx = g.center.x - it.p.x;
          const dy = g.center.y - it.p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < minD2) minD2 = d2;
          if (minD2 <= DESPAWN_DIST2) break;
        }

        if (minD2 <= DESPAWN_DIST2) {
          g._farSince = 0;
          continue;
        }

        if (!g._farSince) g._farSince = state.time;
        if (state.time - g._farSince >= DESPAWN_AFTER) {
          toDespawn.push(g.id);
          g.spawned = false;
          g.aliveCount = 0;
          g._farSince = 0;
        }
      }

      if (toDespawn.length) {
        const set = new Set(toDespawn);
        for (let i = enemies.length - 1; i >= 0; i--) {
          const e = enemies[i];
          if (!e || !e.groupId) continue;
          if (set.has(e.groupId)) enemies.splice(i, 1);
        }
      }
    }

    // Density helper: if an area feels empty for a player, activate nearest dormant groups.
    // To keep CPU stable with many players, we only check up to 2 players per tick (rotating).
    if (hasNonHub && spawnBudget > 0) {
      const list = playerZones.filter((it) => it && (it.z | 0) !== 0);
      const n = list.length;
      if (n > 0) {
        if (this._densityCursor == null) this._densityCursor = 0;
        const checks = Math.min(n, 2);
        for (let c = 0; c < checks && spawnBudget > 0; c++) {
          const it = list[(this._densityCursor + c) % n];
          const p = it.p;
          const pz2 = it.z | 0;

          // Zone 1: handled by fixed clockface spawners (12 sectors × 2).
          // Do NOT auto-activate arbitrary dormant groups here.
          if (pz2 === 1) {
            continue;
          }

          const nearR = 8200 * WORLD_SCALE;
          const nearR2 = nearR * nearR;
          let nearEnemies = 0;
          const minByZone =
            pz2 >= 6 ? 32 :
            pz2 >= 5 ? 28 :
            pz2 >= 4 ? 24 :
            pz2 >= 3 ? 20 :
            pz2 >= 2 ? 16 :
            12;

          for (const e of enemies) {
            if (!e || e.dead) continue;
            const ex = e.x - p.x;
            const ey = e.y - p.y;
            if (ex * ex + ey * ey <= nearR2) {
              nearEnemies++;
              if (nearEnemies >= minByZone) break;
            }
          }

          if (nearEnemies < minByZone) {
            const candidates = [];
            const maxPickDist = 14000 * WORLD_SCALE;
            const maxPickDist2 = maxPickDist * maxPickDist;

            for (const g of this.groups.values()) {
              if (!g || g.spawned || g.isWiped) continue;
              if ((g.zone | 0) !== pz2) continue;
              const dxg = g.center.x - p.x;
              const dyg = g.center.y - p.y;
              const d2g = dxg * dxg + dyg * dyg;
              if (d2g <= maxPickDist2) candidates.push({ g, d2: d2g });
            }

            candidates.sort((a, b) => a.d2 - b.d2);

            let activated = 0;
            const capActivated = pz2 <= 2 ? 1 : pz2 <= 4 ? 2 : 3;
            for (const cand of candidates) {
              if (spawnBudget <= 0) break;
              if (nearEnemies >= minByZone) break;
              this.spawnGroup(cand.g, p);
              spawnBudget--;
              activated++;
              nearEnemies += (cand.g.aliveCount || 0);
              if (activated >= capActivated) break;
            }
          }
        }

        this._densityCursor = (this._densityCursor + checks) % n;
      }
    }

    // Spend credits used by BOTH the main pass and the density helper.
    // Keep the fractional remainder for smooth pacing.
    if (hasNonHub) {
      const spent = Math.max(0, (budgetStart | 0) - (spawnBudget | 0));
      if (spent > 0) this._spawnCredits = Math.max(0, (this._spawnCredits || 0) - spent);
    }

    // --- Zone 6 Corner Bosses — spawn when ANY player approaches a corner (and respawn after delay)
    const inZone6 = playerZones.filter((it) => it && (it.z | 0) === 6);
    if (inZone6.length && Array.isArray(ZONE6_CORNER_POINTS)) {
      const CORNER_ACT_DIST = 14000 * WORLD_SCALE;
      for (let i = 0; i < ZONE6_CORNER_POINTS.length; i++) {
        const cp = ZONE6_CORNER_POINTS[i];
        if (!cp) continue;

        const exists = enemies.some((e) => e && e.isZone6CornerBoss && e.cornerIndex === i);
        this.cornerBossAlive[i] = exists;
        if (exists) continue;
        if (state.time < (this.cornerBossNextRespawnAt[i] || 0)) continue;

        // Trigger if any Zone6 player is near the corner
        let trigger = null;
        for (const it of inZone6) {
          const dxC = cp.x - it.p.x;
          const dyC = cp.y - it.p.y;
          if (dxC * dxC + dyC * dyC <= CORNER_ACT_DIST * CORNER_ACT_DIST) { trigger = it.p; break; }
        }
        if (!trigger) continue;

        const boss = createRoamingBoss(6, { x: cp.x, y: cp.y });
        boss.isZone6CornerBoss = true;
        boss.cornerIndex = i;
        boss.name = "Corner Boss";
        boss.hp *= 4.8;
        boss.maxHp *= 4.8;
        boss.damage *= 2.0;
        boss.speed *= 1.05;
        boss.radius *= 1.15;
        boss.xpValue *= 3.0;

        const baseOnDeath = boss.onDeath;
        boss.onDeath = (self, st) => {
          if (baseOnDeath) baseOnDeath(self, st);
          // Disabled: corner bosses no longer grant temporary buffs
};

        this.ensureEnemyId(boss);
        applyLevelZoneBalance(boss, 6, (trigger && trigger.level) || 1);
        enemies.push(boss);
        this.cornerBossAlive[i] = true;
      }
    }

    // --- Zone 6 Super Boss spawn (once per run, world-anchored)
    if (inZone6.length && !this.superBossSpawned) {
      const alreadySuper = enemies.some((e) => e && e.isZone6SuperBoss);
      if (!alreadySuper) {
        const p = this.superBossPoint || randomPointInZone(6);
        let lvl = 1;
        for (const it of inZone6) lvl = Math.max(lvl, (it.p && it.p.level) || 1);
        const sb = createZone6SuperBoss(6, { x: p.x, y: p.y });
        this.ensureEnemyId(sb);
        applyLevelZoneBalance(sb, 6, lvl);
        enemies.push(sb);
        this.superBossSpawned = true;
      }
    }

    // --- Resurrection Guardian spawn (zone varies by host R-Tier, once per run, 70% meta usage rule)
    const rTier = (state.progression && state.progression.resurrectedTier) || 1;
    // Never spawn special enemies inside Zone 1 (basic-only zone).
    const guardianZone = Math.max(2, Math.min(5, (rTier | 0) + 1));

    if (!this.guardianSpawned && hasReachedResurrectionThreshold(state.progression)) {
      const candidates = playerZones.filter((it) => it && (it.z | 0) === guardianZone);
      if (candidates.length) {
        const alreadyGuardian = enemies.some((e) => e && (e.isResGuardian || e.isResurrectionGuardian || e.type === "resurrectionGuardian"));
        if (!alreadyGuardian) {
          const tp = candidates[0].p;
          const angleG = Math.random() * Math.PI * 2;
          const distG = 900 + Math.random() * 400;
          const gx = tp.x + Math.cos(angleG) * distG;
          const gy = tp.y + Math.sin(angleG) * distG;
          const g = createResurrectionGuardian(guardianZone, { x: gx, y: gy });
          this.ensureEnemyId(g);
          applyLevelZoneBalance(g, guardianZone, (tp && tp.level) || 1);
          enemies.push(g);
          this.guardianSpawned = true;
        }
      }
    }

    // --- Roaming bosses (kept) — spawn world-anchored in an active zone
    this.roamingTimer += dt;

    const hasRoaming = enemies.some((e) => e && e.isRoamingBoss);
    if (!hasRoaming && hasNonHub) {
      // Zone 1 is "basic-only" — no roaming bosses there.
      if ((maxZone | 0) < 2) {
        // Keep timer running, but don't spawn until players reach Zone 2+.
        return;
      }

      const zoneForRoam = Math.max(2, Math.min(6, maxZone | 0));
      const threshold = 30 + zoneForRoam * 10;

      if (this.roamingTimer >= threshold) {
        this.roamingTimer = 0;

        let ref = null;
        for (const it of playerZones) {
          if (!it || (it.z | 0) === 0) continue;
          if ((it.z | 0) === zoneForRoam) { ref = it.p; break; }
        }
        if (!ref) {
          const any = playerZones.find((it) => it && (it.z | 0) !== 0);
          ref = any ? any.p : playersForWorld[0];
        }

        let p = randomPointInZone(zoneForRoam);
        for (let k = 0; k < 30; k++) {
          let ok = true;
          for (const it of playerZones) {
            if (!it || (it.z | 0) === 0) continue;
            const dx = p.x - it.p.x;
            const dy = p.y - it.p.y;
            if (dx * dx + dy * dy < 1400 * 1400) { ok = false; break; }
          }
          if (ok) break;
          p = randomPointInZone(zoneForRoam);
        }

        const rb = createRoamingBoss(zoneForRoam, { x: p.x, y: p.y });
        this.ensureEnemyId(rb);
        applyLevelZoneBalance(rb, zoneForRoam, (ref && ref.level) || 1);
        enemies.push(rb);
      }
    }
  }


  _maybePruneStreamingCaches(playersForWorld) {
    const state = this.state;
    const now = (state && typeof state.time === "number") ? state.time : 0;
    if (now < (this._pruneNextAt || 0)) return;
    this._pruneNextAt = now + 1.0; // once per second

    const cellsCount = this.generatedCells.size | 0;
    const groupsCount = this.groups.size | 0;
    const orbsCount = (Array.isArray(state?.xpOrbs) ? state.xpOrbs.length : 0) | 0;

    // Only do work when needed (or when we have clear pressure).
    const pressure = (cellsCount > 1400) || (groupsCount > 5200) || (orbsCount > 2600);
    if (!pressure && cellsCount < 900 && groupsCount < 3200 && orbsCount < 1600) return;

    // If pressure is high, prune more aggressively.
    const keepSec = pressure ? 12 : 30;
    const maxRemoveCells = pressure ? 140 : 60;

    const removedGroupIds = [];
    let removedCells = 0;

    // Remove old cells (not seen recently). This bounds group count because groups are per-cell.
    for (const [key, seenAt] of this.cellSeenAt.entries()) {
      if (removedCells >= maxRemoveCells) break;
      if ((now - (seenAt || 0)) < keepSec) continue;

      // Remove groups associated with this cell
      const gids = this.cellGroups.get(key);
      if (gids && gids.length) {
        for (let i = 0; i < gids.length; i++) {
          const gid = gids[i];
          if (!gid) continue;
          this.groups.delete(gid);
          removedGroupIds.push(gid);
        }
      }

      this.cellGroups.delete(key);
      this.generatedCells.delete(key);
      this.cellSeenAt.delete(key);
      removedCells++;
    }

    // If we removed any groups, also cull any remaining enemies that belonged to them.
    // (Otherwise they would keep updating forever without a group record.)
    if (removedGroupIds.length && Array.isArray(state?.enemies) && state.enemies.length) {
      const set = new Set(removedGroupIds);
      const enemies = state.enemies;
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (!e || !e.groupId) continue;
        if (set.has(e.groupId)) enemies.splice(i, 1);
      }
    }

    // Cull far ambient orbs (only ambient) so XP orb updates remain cheap.
    // Keep combat drops untouched.
    if (Array.isArray(state?.xpOrbs) && state.xpOrbs.length) {
      // Ambient orbs are meant to be "in the area". With the world scaled down,
      // we must also keep this radius modest, otherwise exploration accumulates
      // thousands of ambient orbs and eventually blocks new spawns.
      const ORB_CULL_DIST = 7000 * WORLD_SCALE;
      const ORB_CULL_D2 = ORB_CULL_DIST * ORB_CULL_DIST;
      const orbs = state.xpOrbs;

      // Only do the O(N) pass when the list is getting large.
      if ((orbs.length | 0) > 900) {
        for (let i = orbs.length - 1; i >= 0; i--) {
          const o = orbs[i];
          if (!o || !o.ambient) continue;

          let minD2 = Infinity;
          for (let p = 0; p < playersForWorld.length; p++) {
            const pl = playersForWorld[p];
            if (!pl) continue;
            const dx = (pl.x - o.x);
            const dy = (pl.y - o.y);
            const d2 = dx * dx + dy * dy;
            if (d2 < minD2) minD2 = d2;
            if (minD2 <= ORB_CULL_D2) break;
          }
          if (minD2 > ORB_CULL_D2) {
            orbs.splice(i, 1);
          }
        }
      }
    }
  }


}
