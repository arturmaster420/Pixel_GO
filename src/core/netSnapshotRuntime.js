import { Player } from "./player.js";
import { EVOLUTION_STAGE_KEYS, restoreEvolutionSnapshot, sanitizeRunSkillStages, syncEvolutionState } from "./skillEvolutionDefs.js";
import { applyLimitsToPlayer } from "./progression.js";
import { ensureHubProgression, applyHubBuildToPlayer, applyProgressionSpToPlayer } from "./hubBuild.js";
import { offerNeedsReplace } from "./floorShop.js";
import { getAttackRangeForPlayer } from "../weapons/skillSystem.js";
import { buildProjectedProgFromMeta, getPlayersArr, pickColorForId, sanitizeHeroCombatSummary, sanitizeHeroLoadoutSummary } from "./netPlayerRuntime.js";
import { renderBiomeUnit, biomeKeyFromKind, biomeStyleForKey, biomeRoleFromKind } from "../enemies/biomeVisuals.js";
import { hideFloorShopOverlay } from "../ui/floorShopDom.js";
import { isDirectResourceOrbKind } from "./progressionRuntime.js";
import { WORLD_SCALE } from "../world/zoneController.js";

const NET_RUN_SKILL_ORDER = [
  "bullets", "bombs", "rockets", "energyBomb", "fireBomb", "iceBomb",
  "satellites", "energyBarrier", "spirit", "summon", "electricZone", "laser", "lightning",
  "fireball", "iceWall", "blackhole", "lightHeal", "stormStrike", "flameNova", "iceShards", "voidBurst", "holyNova",
  "shrapnelBurst", "railVolley", "arcSpark", "staticPulse", "meteorRain", "magmaLance", "frostNova", "crystalSpear", "soulDrain", "dreadRing", "prismRay", "sanctuary",
];

function cloneJsonSafe(value, fallback = null) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

export function serializePlayerState(state) {
  const q = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : 0);
  const ps = getPlayersArr(state);

  const encSkills = (p) => {
    const s = p?.runSkills || {};
    return NET_RUN_SKILL_ORDER.map((key) => (s[key] | 0) || 0).join(",");
  };

  const encStages = (p) => {
    const s = sanitizeRunSkillStages(p?.runSkillStages || {});
    return EVOLUTION_STAGE_KEYS.map((key) => (s[key] | 0) || 0).join(",");
  };

  const encFloorShop = (p) => {
    const fs = p && p.floorShop;
    if (!fs || !Array.isArray(fs.offers) || !fs.offers.length) return null;
    // Only replicate the current-floor shop (keeps payload small).
    const curFloor = (state.currentRoomIndex != null ? (state.currentRoomIndex | 0) : 0);
    if ((fs.floor | 0) !== curFloor) return null;
    const offers = fs.offers.slice(0, 3).map((o) => ({
      id: String(o.id || ""),
      kind: String(o.kind || ""),
      key: String(o.key || ""),
      name: String(o.name || ""),
      from: (o.from | 0) || 0,
      to: (o.to | 0) || 0,
      c: (o.spCost | 0) || 0,
      rr: offerNeedsReplace(p, o),
      fm: String(o.family || ""),
      bm: String(o.biome || ""),
    }));
    const sold = Array.isArray(fs.sold) ? fs.sold.slice(0, 3).map((v) => (v ? 1 : 0)) : [0, 0, 0];
    const ackSeq = (p && Number.isFinite(p._shopActAckSeq)) ? (p._shopActAckSeq | 0) : 0;
    return { f: (fs.floor | 0) || 0, o: offers, s: sold, ru: (fs.rerollsUsed | 0) || 0, aq: ackSeq };
  };

  return {
    t: state.time,
    players: ps.map((p) => ({
      id: String(p.id),
      x: q(p.x),
      y: q(p.y),
      vx: q(p.vx),
      vy: q(p.vy),
      hp: p.hp,
      maxHP: p.maxHP,
      level: p.level,
      // Pixel_GO v0.4: Skill Points (SP)
      sp: (p.skillPoints | 0) || 0,
      // Legacy pending level-up UI is disabled; keep field at 0 for backward-compatible snapshots.
      pu: 0,
      // Joiners do not run weapon sim; sync these so their camera/aim feels correct.
      weaponStage: p.weaponStage || 1,
      range: q(Number.isFinite(p.range) ? p.range : getAttackRangeForPlayer(p)),
      nickname: p.nickname || "",
      avatarIndex: p.avatarIndex || 0,
      auraId: p.auraId || 0,
      hid: String(p.activeHeroId || '').slice(0, 24),
      hn: String(p.activeHeroName || p.nickname || '').slice(0, 24),
      hr: String(p.activeHeroRace || p._selectedStarterLoadout || '').slice(0, 12),
      hpw: Math.max(0, (Number(p?._heroCombatSummary?.totalCardPower || p?._heroCombatProfile?.summary?.totalCardPower || 0) | 0) || 0),
      hml: Math.max(1, (Number(p?._heroCombatSummary?.masteryLevel || p?._heroCombatProfile?.summary?.masteryLevel || 1) | 0) || 1),
      color: p.color || pickColorForId(p.id),
      aim: { x: q(p.lastAimDir?.x || 0), y: q(p.lastAimDir?.y || 0) },
      rs: encSkills(p),
      rt: encStages(p),

      // Pixel_GO v0.4: floor terminal offers for THIS player (current floor only)
      fs: encFloorShop(p),

      // Visual/UX replication for joiners (small payload):
      // - Energy Barrier needs shield state to be visible on joiners.
      // - Laser/Lightning visuals are computed only on host.
      eb: (p._energyBarrierVis && p._energyBarrierVis.radius > 0 && (p._energyBarrierShield || 0) > 0)
        ? {
            r: q(p._energyBarrierVis.radius),
            sh: q(Number(p._energyBarrierShield || p._energyBarrierVis.shield || 0)),
            ms: q(Number(p._energyBarrierMaxShield || p._energyBarrierVis.maxShield || 0)),
          }
        : null,

      sv: (p._satelliteVis && (p._satelliteVis.count | 0) > 0)
        ? {
            c: (p._satelliteVis.count | 0) || 0,
            r: q(Number(p._satelliteVis.orbitR || 0)),
            o: q(Number(p._satelliteVis.orbR || 0)),
            s: q(Number(p._satelliteVis.speed || 0)),
          }
        : null,

      spv: (p._spiritVis && Array.isArray(p._spiritVis.list) && p._spiritVis.list.length)
        ? {
            c: p._spiritVis.list.length | 0,
          }
        : null,

      lz: (() => {
        const vis = state._laserVisuals && typeof state._laserVisuals.get === "function" ? state._laserVisuals.get(String(p.id)) : null;
        if (!vis) return null;
        return { x1: q(vis.x1), y1: q(vis.y1), x2: q(vis.x2), y2: q(vis.y2) };
      })(),

      lt: (() => {
        const pts = state._lightningVisuals && typeof state._lightningVisuals.get === "function" ? state._lightningVisuals.get(String(p.id)) : null;
        if (!Array.isArray(pts) || !pts.length) return null;
        const flat = [];
        const maxPts = 6;
        for (let i = 0; i < pts.length && i < maxPts; i++) {
          const pt = pts[i];
          if (!pt) continue;
          flat.push(q(pt.x), q(pt.y));
        }
        return flat.length ? flat : null;
      })(),
    })),
  };
}

export function applyPlayerStateToClient(state, pstate, callbacks = {}) {
  const canUseFloorShop = (callbacks && typeof callbacks.canPlayerUseFloorShop === "function") ? callbacks.canPlayerUseFloorShop : null;
  const reopenFloorShop = (callbacks && typeof callbacks.openFloorShopOverlay === "function") ? callbacks.openFloorShopOverlay : null;
  if (!pstate || typeof pstate !== "object") return;
  const st = (typeof pstate.t === "number") ? pstate.t : null;
  if (st != null) {
    const last = (typeof state._netLastAppliedPStateAt === "number") ? state._netLastAppliedPStateAt : -Infinity;
    if (st <= last + 1e-6) return;
    state._netLastAppliedPStateAt = st;
  }

  const myId = state.net?.playerId ? String(state.net.playerId) : (state.player?.id ? String(state.player.id) : "local");

  if (!state._netCache) {
    state._netCache = {
      players: new Map(),
      enemies: new Map(),
      projectilesById: new Map(),
      rocketsById: new Map(),
      projectiles: [],
      rockets: [],
      xpOrbs: [],
    };
  }
  const pCache = state._netCache.players;
  const players = state._netCache.playersArr || (state._netCache.playersArr = []);
  players.length = 0;

  // Joiners: host is the only one computing some weapon visuals.
  // Rebuild these maps from the replicated player-state each tick.
  const isJoiner = !!(state.net && !state.net.isHost);
  if (isJoiner) {
    if (!state._laserVisuals || typeof state._laserVisuals.clear !== "function") state._laserVisuals = new Map();
    if (!state._lightningVisuals || typeof state._lightningVisuals.clear !== "function") state._lightningVisuals = new Map();
    state._laserVisuals.clear();
    state._lightningVisuals.clear();
  }

  const seenStamp = (st != null ? st : (state.time || 0));

  for (const sp of (pstate.players || [])) {
    const id = String(sp.id);
    let p = pCache.get(id);
    if (!p) {
      const lvl = (typeof sp.level === "number" && Number.isFinite(sp.level)) ? (sp.level | 0) : 1;
      p = new Player({ x: sp.x || 0, y: sp.y || 0 }, lvl);
      p.id = id;
      p.color = sp.color || pickColorForId(id);
      p.nickname = sp.nickname || `P${id}`;
      p.avatarIndex = typeof sp.avatarIndex === "number" ? (sp.avatarIndex|0) : 0;
      p.auraId = typeof sp.auraId === "number" ? (sp.auraId|0) : 0;
      p.activeHeroId = (typeof sp.hid === 'string' && sp.hid.trim()) ? sp.hid.trim().slice(0, 24) : `hero_remote_${id}`;
      p.activeHeroName = (typeof sp.hn === 'string' && sp.hn.trim()) ? sp.hn.trim().slice(0, 24) : (sp.nickname || `Hero ${id}`);
      p.activeHeroRace = (typeof sp.hr === 'string' && sp.hr.trim()) ? sp.hr.trim() : 'mecha';
      p._heroCombatSummary = sanitizeHeroCombatSummary({ totalCardPower: Number(sp.hpw || 0) || 0, sameRaceCards: 0, starBonusTotal: 0, equippedSkillCards: 0, equippedPassiveCards: 0, masteryLevel: Number(sp.hml || 1) || 1 });
      applyLimitsToPlayer(p, state.progression.limits);
      // Skill meta can be per-player (shop unlocks). If we have it from syncMeta, use it.
      const stored = state._netMetaById?.get(id) || null;
      p._metaSkillMeta = (stored && stored.skillMeta && typeof stored.skillMeta === "object") ? stored.skillMeta : (state.progression?.skillMeta || {});
      p._selectedStarterLoadout = (stored && typeof stored.selectedStarterLoadout === "string") ? stored.selectedStarterLoadout : (state.progression?.selectedStarterLoadout || "mecha");
      const projectedProg = buildProjectedProgFromMeta(state.progression, stored, p._metaSkillMeta, p._selectedStarterLoadout);
      projectedProg.activeHeroId = String(projectedProg.activeHeroId || stored?.activeHeroId || p.activeHeroId || `hero_remote_${id}`).trim() || `hero_remote_${id}`;
      projectedProg.activeHeroName = String(projectedProg.activeHeroName || stored?.activeHeroName || p.activeHeroName || sp.nickname || `Hero ${id}`).trim().slice(0, 24) || `Hero ${id}`;
      projectedProg.activeHeroRace = String(projectedProg.activeHeroRace || stored?.activeHeroRace || p.activeHeroRace || 'mecha').trim() || 'mecha';
      ensureHubProgression(projectedProg);
      applyHubBuildToPlayer(p, projectedProg);
      applyProgressionSpToPlayer(p, projectedProg);
      restoreEvolutionSnapshot(p);
      p._netTx = p.x;
      p._netTy = p.y;
      pCache.set(id, p);
    }

    p._netSeenAt = seenStamp;

    const tx = Number.isFinite(sp.x) ? sp.x : p.x;
    const ty = Number.isFinite(sp.y) ? sp.y : p.y;

    p._netTx = tx;
    p._netTy = ty;

    // Save velocity for light dead-reckoning
    p._netVx = Number.isFinite(sp.vx) ? sp.vx : (p._netVx || 0);
    p._netVy = Number.isFinite(sp.vy) ? sp.vy : (p._netVy || 0);

    // Big correction snap
    const dxC = tx - p.x;
    const dyC = ty - p.y;
    if ((dxC*dxC + dyC*dyC) > 500*500) {
      p.x = tx;
      p.y = ty;
    }

    p.hp = sp.hp;
    p.maxHP = sp.maxHP;
    p.level = sp.level;

    // Pixel_GO v0.4: Skill Points (SP)
    if (typeof sp.sp === "number" && Number.isFinite(sp.sp)) {
      p.skillPoints = sp.sp | 0;
    }

    // Pixel_GO v0.4: floor terminal offers (current floor only)
    if (sp.fs && typeof sp.fs === "object" && Array.isArray(sp.fs.o)) {
      const offers = sp.fs.o.slice(0, 3).map((o) => ({
        id: String(o.id || ""),
        kind: String(o.kind || ""),
        key: String(o.key || ""),
        name: String(o.name || ""),
        from: (o.from | 0) || 0,
        to: (o.to | 0) || 0,
        spCost: (o.c | 0) || 0,
        requiresReplace: !!o.rr,
        family: String(o.fm || ""),
        biome: String(o.bm || ""),
      }));
      const sold = Array.isArray(sp.fs.s) ? sp.fs.s.slice(0, 3).map((v) => !!v) : offers.map(() => false);
      p.floorShop = { floor: (sp.fs.f | 0) || 0, offers, sold, rerollsUsed: (sp.fs.ru | 0) || 0 };
      if (typeof sp.fs.aq === "number" && Number.isFinite(sp.fs.aq)) p._shopActAckSeq = sp.fs.aq | 0;
    } else {
      // If host isn't sending a shop, clear stale one on joiners.
      const curFloor = (state.currentRoomIndex != null ? (state.currentRoomIndex | 0) : 0);
      if (p.floorShop && (p.floorShop.floor | 0) !== curFloor) {
        p.floorShop = null;
      }
    }
    if (typeof sp.pu === "number" && Number.isFinite(sp.pu)) {
      p._pendingLevelUps = 0;
      p._netHostPending = 0;
    } else {
      p._pendingLevelUps = 0;
      p._netHostPending = 0;
    }
    if (typeof sp.weaponStage === "number") p.weaponStage = sp.weaponStage;
    if (typeof sp.range === "number" && Number.isFinite(sp.range)) p.range = sp.range;
    p.nickname = sp.nickname || p.nickname;
    p.avatarIndex = typeof sp.avatarIndex === "number" ? (sp.avatarIndex|0) : p.avatarIndex;
    if (typeof sp.auraId === "number") p.auraId = sp.auraId|0;
    if (typeof sp.hid === 'string' && sp.hid.trim()) p.activeHeroId = sp.hid.trim().slice(0, 24);
    if (typeof sp.hn === 'string' && sp.hn.trim()) p.activeHeroName = sp.hn.trim().slice(0, 24);
    if (typeof sp.hr === 'string' && sp.hr.trim()) p.activeHeroRace = sp.hr.trim();
    const snapHeroCombatSummary = sanitizeHeroCombatSummary({
      totalCardPower: Number(sp.hpw || 0) || 0,
      sameRaceCards: p._heroCombatSummary?.sameRaceCards || 0,
      starBonusTotal: p._heroCombatSummary?.starBonusTotal || 0,
      equippedSkillCards: p._heroCombatSummary?.equippedSkillCards || 0,
      equippedPassiveCards: p._heroCombatSummary?.equippedPassiveCards || 0,
      masteryLevel: Number(sp.hml || p._heroCombatSummary?.masteryLevel || 1) || 1,
    });
    if (snapHeroCombatSummary) p._heroCombatSummary = { ...(p._heroCombatSummary || {}), ...snapHeroCombatSummary };
    p.color = sp.color || p.color;
    if (sp.aim) {
      p.lastAimDir.x = sp.aim.x || 0;
      p.lastAimDir.y = sp.aim.y || 0;
    }

      // Sync run skill levels from host (for HUD + visuals consistency on joiners).
    if (typeof sp.rs === "string" && sp.rs.length) {
      const parts = sp.rs.split(",");
      if (parts.length >= 1) {
        p.runSkills = p.runSkills || {};
        for (let i = 0; i < NET_RUN_SKILL_ORDER.length; i++) {
          const key = NET_RUN_SKILL_ORDER[i];
          p.runSkills[key] = (parts[i] | 0) || 0;
        }
      }
    }
    if (typeof sp.rt === "string" && sp.rt.length) {
      const parts = sp.rt.split(",");
      p.runSkillStages = sanitizeRunSkillStages(p.runSkillStages || {});
      for (let i = 0; i < EVOLUTION_STAGE_KEYS.length; i++) {
        const key = EVOLUTION_STAGE_KEYS[i];
        p.runSkillStages[key] = (parts[i] | 0) || 0;
      }
    }
    syncEvolutionState(p);

    // Energy Barrier visual replication (shield up/down) for joiners.
    if (sp.eb && typeof sp.eb === "object" && Number.isFinite(sp.eb.r) && sp.eb.r > 0) {
      const maxS = Number(sp.eb.ms || 0);
      const curS = Number(sp.eb.sh || 0);
      p._energyBarrierVis = { radius: sp.eb.r, shield: curS, maxShield: maxS };
      p._energyBarrierShield = curS;
      p._energyBarrierMaxShield = maxS;
    } else {
      p._energyBarrierVis = null;
    }

    if (sp.sv && typeof sp.sv === "object" && Number.isFinite(sp.sv.c) && sp.sv.c > 0) {
      p._satelliteVis = {
        count: Math.max(1, sp.sv.c | 0),
        orbitR: Number.isFinite(sp.sv.r) ? sp.sv.r : 60,
        orbR: Number.isFinite(sp.sv.o) ? sp.sv.o : 10,
        speed: Number.isFinite(sp.sv.s) ? sp.sv.s : 1.2,
      };
    } else {
      p._satelliteVis = null;
    }

    if (sp.spv && typeof sp.spv === "object" && Number.isFinite(sp.spv.c) && sp.spv.c > 0) {
      const count = Math.max(1, sp.spv.c | 0);
      p._spiritVis = { list: Array.from({ length: count }, (_, i) => ({ i })) };
    } else {
      p._spiritVis = null;
    }

    // Laser / Lightning visuals for joiners.
    if (isJoiner) {
      if (sp.lz && typeof sp.lz === "object") {
        const lv = { x1: sp.lz.x1 || 0, y1: sp.lz.y1 || 0, x2: sp.lz.x2 || 0, y2: sp.lz.y2 || 0 };
        state._laserVisuals.set(String(id), lv);
      }
      if (Array.isArray(sp.lt) && sp.lt.length >= 4) {
        const pts = [];
        for (let k = 0; k + 1 < sp.lt.length; k += 2) {
          pts.push({ x: sp.lt[k] || 0, y: sp.lt[k + 1] || 0 });
        }
        if (pts.length) state._lightningVisuals.set(String(id), pts);
      }
    }

    players.push(p);
  }

  for (const [id, p] of pCache) {
    if (!p || p._netSeenAt != seenStamp) pCache.delete(id);
  }

  state.players = players;
  const me = players.find((p) => String(p.id) === myId) || players[0] || state.player;
  state.player = me;

  // Joiner-only UX: show "LEVEL UP" feedback locally when our replicated level increases.
  if (state.net && !state.net.isHost && me) {
    const curLv = me.level | 0;
    if (typeof state._netLocalLevel !== "number") {
      state._netLocalLevel = curLv;
    } else {
      const prevLv = state._netLocalLevel | 0;
      if (curLv < prevLv) {
        me._pendingLevelUps = 0;
      }
      if (curLv > prevLv) {
        const diff = curLv - prevLv;
        // Level-ups only grant SP now; do not synthesize legacy pending upgrade choices on joiners.
        me._pendingLevelUps = 0;
        if (state.floatingTexts) {
          state.floatingTexts.push({
            x: me.x,
            y: me.y - 30,
            text: "LEVEL UP!",
            time: 1.2,
          });
        }
        if (state.popups) {
          state.popups.push({
            text: diff > 1 ? `Level Up! +${diff} (Lv ${curLv})` : `Level Up! Lv ${curLv}`,
            time: 2.0,
          });
        }
      }
      state._netLocalLevel = curLv;
    }
  }

  if (state._floorShopReopenOnSync && me && canUseFloorShop && canUseFloorShop(state, me)) {
    const pendingSeq = (state._shopActPending?.seq | 0) || 0;
    const ackSeq = (me && Number.isFinite(me._shopActAckSeq)) ? (me._shopActAckSeq | 0) : 0;
    if (!pendingSeq || ackSeq >= pendingSeq) {
      state._floorShopReopenOnSync = false;
      state._floorShopActive = true;
      state._shopActPending = null;
      if (reopenFloorShop) reopenFloorShop(state);
    }
  }
}

export function serializeSnapshot(state) {
  // Quantize floats to reduce JSON size (helps mobile joiners).
  const q = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : 0);

  const ua = (typeof navigator !== "undefined" && navigator.userAgent) ? navigator.userAgent : "";
  const isMobileHost = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);

  // Union-interest filtering (co-op):
  // Host may have enemies spawned around several players across the map.
  // If we serialize everything, JSON.stringify causes micro-freezes.
  const psAll = getPlayersArr(state);
  const psAlive = psAll.filter((p) => p && p.hp > 0);
  const refs = psAlive.length ? psAlive : psAll;

  const INTEREST_R = (isMobileHost ? 15000 : 16500) * WORLD_SCALE;
  const INTEREST_R2 = INTEREST_R * INTEREST_R;

  const minD2ToPlayers = (x, y) => {
    let best = Infinity;
    for (const p of refs) {
      if (!p) continue;
      const dx = x - p.x;
      const dy = y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
      if (best <= 1200 * 1200) break;
    }
    return best;
  };

  // Soft caps to avoid spikes (server will also apply per-client interest).
  const capEnemies = isMobileHost ? 120 : 160;
  const capProj = isMobileHost ? 84 : 120;
  const capRockets = isMobileHost ? 40 : 56;
  const capOrbs = isMobileHost ? 120 : 160;
  const capSummons = isMobileHost ? 36 : 54;
  const capFx = isMobileHost ? 12 : 18;

  // Enemies (filtered + capped by distance to nearest player)
  const enemySrc = [];
  for (const e of (state.enemies || [])) {
    if (!e || e.dead) continue;
    const d2 = minD2ToPlayers(e.x, e.y);
    if (d2 > INTEREST_R2) continue;
    enemySrc.push({ e, d2 });
  }
  if (enemySrc.length > capEnemies) {
    enemySrc.sort((a, b) => a.d2 - b.d2);
    enemySrc.length = capEnemies;
  }

  // Projectiles
  const projSrc = [];
  for (const b of (state.projectiles || [])) {
    if (!b) continue;
    const d2 = minD2ToPlayers(b.x, b.y);
    if (d2 > INTEREST_R2) continue;
    projSrc.push({ b, d2 });
  }
  if (projSrc.length > capProj) {
    projSrc.sort((a, b) => a.d2 - b.d2);
    projSrc.length = capProj;
  }

  // Rockets
  const rocketSrc = [];
  for (const r of (state.rockets || [])) {
    if (!r) continue;
    const d2 = minD2ToPlayers(r.x, r.y);
    if (d2 > INTEREST_R2) continue;
    rocketSrc.push({ r, d2 });
  }
  if (rocketSrc.length > capRockets) {
    rocketSrc.sort((a, b) => a.d2 - b.d2);
    rocketSrc.length = capRockets;
  }

  // XP orbs
  const orbSrc = [];
  for (const o of (state.xpOrbs || [])) {
    if (!o) continue;
    const d2 = minD2ToPlayers(o.x, o.y);
    if (d2 > INTEREST_R2) continue;
    orbSrc.push({ o, d2 });
  }
  if (orbSrc.length > capOrbs) {
    orbSrc.sort((a, b) => a.d2 - b.d2);
    orbSrc.length = capOrbs;
  }

  // Summons (tanks). Visual-only for joiners.
  const sumSrc = [];
  for (const s of (state.summons || [])) {
    if (!s || !s.isSummon || s.hp <= 0) continue;
    const d2 = minD2ToPlayers(s.x, s.y);
    if (d2 > INTEREST_R2) continue;
    sumSrc.push({ s, d2 });
  }
  if (sumSrc.length > capSummons) {
    sumSrc.sort((a, b) => a.d2 - b.d2);
    sumSrc.length = capSummons;
  }

  // Biome skill FX (small lists)
  const bhSrc = [];
  for (const b of (state.blackholes || [])) {
    if (!b) continue;
    const d2 = minD2ToPlayers(b.x, b.y);
    if (d2 > INTEREST_R2) continue;
    bhSrc.push({ b, d2 });
  }
  if (bhSrc.length > capFx) {
    bhSrc.sort((a, b) => a.d2 - b.d2);
    bhSrc.length = capFx;
  }

  const iwSrc = [];
  for (const w of (state.iceWalls || [])) {
    if (!w) continue;
    const d2 = minD2ToPlayers(w.x, w.y);
    if (d2 > INTEREST_R2) continue;
    iwSrc.push({ w, d2 });
  }
  if (iwSrc.length > capFx) {
    iwSrc.sort((a, b) => a.d2 - b.d2);
    iwSrc.length = capFx;
  }

  const hpSrc = [];
  for (const h of (state.healPulses || [])) {
    if (!h) continue;
    const d2 = minD2ToPlayers(h.x, h.y);
    if (d2 > INTEREST_R2) continue;
    hpSrc.push({ h, d2 });
  }
  if (hpSrc.length > 18) {
    hpSrc.sort((a, b) => a.d2 - b.d2);
    hpSrc.length = 18;
  }

  const exSrc = [];
  for (const ex of (state._explosions || [])) {
    if (!ex) continue;
    const d2 = minD2ToPlayers(ex.x, ex.y);
    if (d2 > INTEREST_R2) continue;
    exSrc.push({ ex, d2 });
  }
  if (exSrc.length > 22) {
    exSrc.sort((a, b) => a.d2 - b.d2);
    exSrc.length = 22;
  }

  return {
    t: state.time,
    runScore: state.runScore,
    zone: state.currentZone,
    room: {
      i: (state.currentRoomIndex != null ? (state.currentRoomIndex | 0) : (state.roomDirector ? (state.roomDirector.roomIndex | 0) : 0)),
      biome: String(state._roomBiome || ""),
      nextBiome: String(state._nextRoomBiome || ""),
      prevBiome: String(state._prevRoomBiome || ""),
      side: (state._roomSide | 0) || 0,
      cleared: !!state._roomCleared,
      hasNext: !!state._roomHasNext,
      bridgeP: (typeof state._bridgeP === 'number' ? state._bridgeP : 0),
      bridgeBuilt: !!state._bridgeBuilt,
      prevI: (state._prevRoomIndex | 0) || 0,
      prevC: !!state._prevRoomCollapsing,
      prevT: (typeof state._prevRoomCollapseT === 'number' ? Math.round(state._prevRoomCollapseT * 100) / 100 : 0),
      bridgeFrom: (state._bridgeFrom | 0) || 0,
      bridgeTo: (state._bridgeTo | 0) || 0,
      wait: !!state._waitForParty,
      kickIds: Array.isArray(state._kickIds) ? state._kickIds.slice(0, 6).map(String) : [],
      // Gate state (small arrays; length == number of gates)
      gateHp: Array.isArray(state._gateHp) ? state._gateHp.map((v) => (typeof v === 'number' ? Math.round(v) : 0)) : [],
      gateMax: Array.isArray(state._gateMax) ? state._gateMax.map((v) => (typeof v === 'number' ? Math.round(v) : 0)) : [],
      gateReward: Array.isArray(state._gateReward) ? state._gateReward.map((v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : 0)) : [],
      gateRepair: Array.isArray(state._gateRepair) ? state._gateRepair.map((v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : 0)) : [],
      gateRepairMode: Array.isArray(state._gateRepairMode) ? state._gateRepairMode.map((v) => (typeof v === 'number' ? (v ? 1 : 0) : 0)) : [],
      gatePressure: Array.isArray(state._gatePressure) ? state._gatePressure.map((v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : 0)) : [],
      gateUsed: Array.isArray(state._gateUsed) ? state._gateUsed.map((v) => (typeof v === 'number' ? (v ? 1 : 0) : 0)) : [],
      killed: (state._roomKilled | 0) || 0,
      quota: (state._roomQuota | 0) || 0,
      waveI: (state._roomWaveIndex | 0) || 0,
      waveN: (state._roomWavesTotal | 0) || 0,
      bossAlive: !!state._roomBossAlive,
      isBoss: !!state._roomIsBoss,
      isMiniBoss: !!state._roomIsMiniBoss,
      floorNumber: (state._floorNumber | 0) || 0,
      roomOrdinal: (state._floorRoomOrdinal | 0) || 0,
      totalRooms: (state._floorRoomsTotal | 0) || 0,
      encounterType: String(state._roomEncounter || ''),
      encounterLabel: String(state._roomEncounterLabel || ''),
      templateKey: String(state._roomTemplateKey || ''),
      templateRole: String(state._roomTemplateRole || ''),
      entrySocket: String(state._roomEntrySocket || ''),
      exitSocket: String(state._roomExitSocket || ''),
      portalSocket: String(state._roomPortalSocket || ''),
      routeStyle: String(state._roomRouteStyle || ''),
      lateralOffset: (typeof state._roomLateralOffset === 'number' ? Math.round(state._roomLateralOffset * 1000) / 1000 : 0),
      centerX: (typeof state._roomCenterX === 'number' ? q(state._roomCenterX) : 0),
      centerY: (typeof state._roomCenterY === 'number' ? q(state._roomCenterY) : 0),
      bridgeFromSocket: String(state._bridgeFromSocket || ''),
      bridgeToSocket: String(state._bridgeToSocket || ''),
      bridgeFromPoint: state._bridgeFromPoint ? { x: q(state._bridgeFromPoint.x || 0), y: q(state._bridgeFromPoint.y || 0) } : null,
      bridgeToPoint: state._bridgeToPoint ? { x: q(state._bridgeToPoint.x || 0), y: q(state._bridgeToPoint.y || 0) } : null,
      nextTemplateKey: String(state._nextRoomTemplateKey || ''),
      nextTemplateRole: String(state._nextRoomTemplateRole || ''),
      nextEntrySocket: String(state._nextRoomEntrySocket || ''),
      nextRouteStyle: String(state._nextRoomRouteStyle || ''),
      nextLateralOffset: (typeof state._nextRoomLateralOffset === 'number' ? Math.round(state._nextRoomLateralOffset * 1000) / 1000 : 0),
      nextCenterX: (typeof state._nextRoomCenterX === 'number' ? q(state._nextRoomCenterX) : 0),
      nextCenterY: (typeof state._nextRoomCenterY === 'number' ? q(state._nextRoomCenterY) : 0),
      nextEncounterType: String(state._nextRoomEncounter || ''),
      nextEncounterLabel: String(state._nextRoomEncounterLabel || ''),
      resumeActive: !!state._hubResumeRunActive,
      resumeFloor: (state._hubResumeNextFloor | 0) || 0,
    },
    flags: {
      resGuardianKilledThisRun: !!(state.flags && state.flags.resGuardianKilledThisRun),
    },
    players: psAll.map((p) => ({
      id: String(p.id),
      x: q(p.x),
      y: q(p.y),
      hp: p.hp,
      maxHP: p.maxHP,
      level: p.level,
      xp: p.xp,
      nextXp: p.nextLevelXp,
      nickname: p.nickname || "",
      avatarIndex: p.avatarIndex || 0,
      color: p.color || pickColorForId(p.id),
      lastAim: { x: q(p.lastAimDir?.x || 0), y: q(p.lastAimDir?.y || 0) },
      rv: (p._reviving && p._reviving.targetId) ? String(p._reviving.targetId) : "",
      rvt: (p._reviving && typeof p._reviving.t === 'number') ? q(p._reviving.t) : 0,
      rvn: (p._reviving && typeof p._reviving.need === 'number') ? q(p._reviving.need) : 0,
    })),
    enemies: enemySrc.map(({ e }) => ({
      id: String(e.id || e._id || `${e.x.toFixed(1)}:${e.y.toFixed(1)}`),
      x: q(e.x),
      y: q(e.y),
      hp: e.hp,
      maxHp: e.maxHp ?? e.maxHP ?? 0,
      radius: e.radius || 20,
      kind: e.kind || e.type || "enemy",
      boss: !!e._isBoss || !!e.isBoss || !!e.boss,
      elite: !!e.isElite || !!e.elite,
    })),
    projectiles: projSrc.map(({ b }) => ({
      id: b.id != null ? b.id : undefined,
      ownerId: b.ownerId != null ? String(b.ownerId) : "",
      type: String(b.type || "bullet"),
      x: q(b.x),
      y: q(b.y),
      vx: q(b.vx),
      vy: q(b.vy),
      radius: b.radius || 4,
      life: q((b.range || 0) - (b.travel || 0)),
    })),
    rockets: rocketSrc.map(({ r }) => ({
      id: r.id != null ? r.id : undefined,
      ownerId: r.ownerId != null ? String(r.ownerId) : "",
      type: r.type || "rocket",
      x: q(r.x),
      y: q(r.y),
      vx: q(r.vx),
      vy: q(r.vy),
      radius: r.radius || 6,
      splashRadius: r.splashRadius || 0,
      life: q((r.range || 0) - (r.travel || 0)),
    })),
    xpOrbs: orbSrc.map(({ o }) => {
      const kind = o.kind || (o.coins ? "coin" : "xp");
      return {
        x: q(o.x),
        y: q(o.y),
        radius: o.radius || 8,
        kind,
        xp: kind === "xp" ? (o.xp || 10) : undefined,
        coins: kind === "coin" ? (o.coins || 1) : undefined,
        amount: isDirectResourceOrbKind(kind) ? ((o.amount | 0) || 1) : undefined,
        grantId: isDirectResourceOrbKind(kind) ? String(o.grantId || '') : undefined,
        essenceKey: kind === 'essence' ? String(o.essenceKey || 'mecha') : undefined,
        materialKey: kind === 'material' ? String(o.materialKey || 'salvage') : undefined,
        gearKey: (kind === 'gearPart' || kind === 'gearItem') ? String(o.gearKey || '') : undefined,
        progKind: kind === 'prog' ? String(o.progKind || '') : undefined,
        progPayload: kind === 'prog' ? cloneJsonSafe(o.progPayload, null) : undefined,
        ownerId: kind === 'prog' ? String(o.ownerId || '') : undefined,
        ownerAliases: kind === 'prog' ? cloneJsonSafe(o.ownerAliases, undefined) : undefined,
      };
    }),

    summons: sumSrc.map(({ s }) => ({
      id: String(s.id || s._id || `smn:${String(s.ownerId || "")}@${(s.x || 0).toFixed(1)}:${(s.y || 0).toFixed(1)}`),
      ownerId: s.ownerId != null ? String(s.ownerId) : "",
      x: q(s.x),
      y: q(s.y),
      hp: s.hp,
      maxHp: s.maxHp ?? s.maxHP ?? 0,
      radius: s.radius || 18,
    })),

    // Global temporary buffs (small list). Needed so joiners can show icons + local notifications.
    buffs: (Array.isArray(state.buffs) ? state.buffs : []).slice(0, 16).map((b) => ({
      type: b.type || "",
      timeLeft: q(b.timeLeft || 0),
      multiplier: q(b.multiplier || 0),
      amount: q(b.amount || 0),
    })),

    fx: {
      bh: bhSrc.map(({ b }) => ({
        id: b.id != null ? b.id : undefined,
        ownerId: b.ownerId != null ? String(b.ownerId) : "",
        x: q(b.x),
        y: q(b.y),
        r: q(b.r || 0),
        t: q(b.t || 0),
      })),
      iw: iwSrc.map(({ w }) => ({
        id: w.id != null ? w.id : undefined,
        ownerId: w.ownerId != null ? String(w.ownerId) : "",
        x: q(w.x),
        y: q(w.y),
        a: q(w.a || 0),
        len: q(w.len || 0),
        thick: q(w.thick || 0),
        t: q(w.t || 0),
      })),
      hp: hpSrc.map(({ h }) => ({
        id: h.id != null ? h.id : undefined,
        x: q(h.x),
        y: q(h.y),
        r: q(h.r || 0),
        t: q(h.t || 0),
      })),
      ex: exSrc.map(({ ex }) => ({
        x: q(ex.x),
        y: q(ex.y),
        r: q(ex.r || 0),
        t: q(ex.t || 0),
        k: String(ex.kind || ""),
      })),
    },
  };
}

export function netRoomTopologySignature(r) {
  if (!r || typeof r !== "object") return "";
  return [
    (r.i | 0) || 0,
    String(r.biome || ""),
    String(r.nextBiome || ""),
    String(r.prevBiome || ""),
    (r.side | 0) || 0,
    !!r.cleared ? 1 : 0,
    !!r.hasNext ? 1 : 0,
    (r.floorNumber | 0) || 0,
    (r.roomOrdinal | 0) || 0,
    (r.totalRooms | 0) || 0,
    String(r.templateKey || ""),
    String(r.templateRole || ""),
    String(r.entrySocket || ""),
    String(r.exitSocket || ""),
    String(r.portalSocket || ""),
    String(r.routeStyle || ""),
    (typeof r.lateralOffset === "number" ? r.lateralOffset : 0),
    (typeof r.centerX === "number" ? r.centerX : 0),
    (typeof r.centerY === "number" ? r.centerY : 0),
    String(r.nextTemplateKey || ""),
    String(r.nextTemplateRole || ""),
    String(r.nextEntrySocket || ""),
    String(r.nextRouteStyle || ""),
    (typeof r.nextLateralOffset === "number" ? r.nextLateralOffset : 0),
    (typeof r.nextCenterX === "number" ? r.nextCenterX : 0),
    (typeof r.nextCenterY === "number" ? r.nextCenterY : 0),
    String(r.nextEncounterType || ""),
    String(r.nextEncounterLabel || ""),
  ].join("|");
}

export function syncRoomDirectorFromNetRoom(state, r) {
  const rd = state?.roomDirector;
  if (!rd || typeof rd.forceSetCurrent !== 'function' || !r || typeof r !== 'object') return;
  const sig = netRoomTopologySignature(r);
  if (state._netRoomTopologySig !== sig) {
    state._netRoomTopologySig = sig;
    try {
      rd.forceSetCurrent((r.i | 0) || 0, {
        biome: state._roomBiome,
        nextBiome: state._nextRoomBiome,
        prevBiome: state._prevRoomBiome,
        cleared: state._roomCleared,
        hasNext: state._roomHasNext,
        bridgeP: state._bridgeP,
        gateHp: state._gateHp,
        gateMax: state._gateMax,
        gateReward: state._gateReward,
        gateRepair: state._gateRepair,
        gateRepairMode: state._gateRepairMode,
        gatePressure: state._gatePressure,
        gateUsed: state._gateUsed,
        prevI: (r.prevI | 0) || 0,
        prevT: (typeof r.prevT === 'number' ? r.prevT : 0),
        prevCollapsing: !!r.prevC,
        bridgeFrom: (r.bridgeFrom | 0) || 0,
        bridgeTo: (r.bridgeTo | 0) || 0,
        waitForParty: !!r.wait,
        floorNumber: (r.floorNumber | 0) || 0,
        roomOrdinal: (r.roomOrdinal | 0) || 0,
        totalRooms: (r.totalRooms | 0) || 0,
        encounterType: String(r.encounterType || ''),
        encounterLabel: String(r.encounterLabel || ''),
        templateKey: String(r.templateKey || ''),
        templateRole: String(r.templateRole || ''),
        entrySocket: String(r.entrySocket || ''),
        exitSocket: String(r.exitSocket || ''),
        portalSocket: String(r.portalSocket || ''),
        routeStyle: String(r.routeStyle || ''),
        lateralOffset: (typeof r.lateralOffset === 'number' ? r.lateralOffset : 0),
        centerX: (typeof r.centerX === 'number' ? r.centerX : 0),
        centerY: (typeof r.centerY === 'number' ? r.centerY : 0),
        bridgeFromSocket: String(r.bridgeFromSocket || ''),
        bridgeToSocket: String(r.bridgeToSocket || ''),
        bridgeFromPoint: (r.bridgeFromPoint && typeof r.bridgeFromPoint === 'object') ? r.bridgeFromPoint : null,
        bridgeToPoint: (r.bridgeToPoint && typeof r.bridgeToPoint === 'object') ? r.bridgeToPoint : null,
        nextTemplateKey: String(r.nextTemplateKey || ''),
        nextTemplateRole: String(r.nextTemplateRole || ''),
        nextEntrySocket: String(r.nextEntrySocket || ''),
        nextRouteStyle: String(r.nextRouteStyle || ''),
        nextLateralOffset: (typeof r.nextLateralOffset === 'number' ? r.nextLateralOffset : 0),
        nextCenterX: (typeof r.nextCenterX === 'number' ? r.nextCenterX : 0),
        nextCenterY: (typeof r.nextCenterY === 'number' ? r.nextCenterY : 0),
        nextEncounterType: String(r.nextEncounterType || ''),
        nextEncounterLabel: String(r.nextEncounterLabel || ''),
      });
    } catch {}
  }
  try {
    rd._waitForParty = !!r.wait;
    if (rd.current) {
      rd.current.cleared = !!r.cleared;
      if (rd.current) rd.current.shopNpc = null;
    }
    if (rd.bridge) {
      const bp = (typeof r.bridgeP === 'number') ? r.bridgeP : 0;
      rd.bridge.t = bp;
      rd.bridge.progress = bp;
      rd.bridge.built = !!r.bridgeBuilt;
    }
    if (rd.prev) {
      rd.prev.collapsing = !!r.prevC;
      rd.prev.collapseT = (typeof r.prevT === 'number') ? r.prevT : (rd.prev.collapseT || 0);
    }
    if (typeof rd._applyDynamicBounds === 'function') rd._applyDynamicBounds();
  } catch {}
}

export function applySnapshotToClient(state, snap) {
  if (!snap || typeof snap !== "object") return;
  // Apply only when snapshot is newer (avoid re-applying the same snap every frame).
  const st = (typeof snap.t === "number") ? snap.t : null;
  if (st != null) {
    const last = (typeof state._netLastAppliedSnapshotAt === "number") ? state._netLastAppliedSnapshotAt : -Infinity;
    if (st <= last + 1e-6) return;
    state._netLastAppliedSnapshotAt = st;
  }

  // Ensure we have a player id
  const myId = state.net?.playerId
    ? String(state.net.playerId)
    : (state.player?.id ? String(state.player.id) : "local");

  // Net caches (reduce GC + allow smoothing)
  if (!state._netCache) {
    state._netCache = {
      players: new Map(),
      enemies: new Map(),
      // Visual-only projectile caches keyed by id (prevents flicker/teleport on joiners)
      projectilesById: new Map(),
      rocketsById: new Map(),
      projectiles: [],
      rockets: [],
      xpOrbs: [],
    };
  }
  const pCache = state._netCache.players;
  const eCache = state._netCache.enemies;
  const recentPstate = false; // Restore stable v0.4.20-style full player rebuild on each authoritative snapshot.
  if (!state._netCache.projectilesById) state._netCache.projectilesById = new Map();
  if (!state._netCache.rocketsById) state._netCache.rocketsById = new Map();
  if (!Array.isArray(state._netCache.projectiles)) state._netCache.projectiles = [];
  if (!Array.isArray(state._netCache.rockets)) state._netCache.rockets = [];
  if (!Array.isArray(state._netCache.xpOrbs)) state._netCache.xpOrbs = [];

  // Players (reuse arrays + avoid per-snapshot Set allocations)
  const players = state._netCache.playersArr || (state._netCache.playersArr = []);
  players.length = 0;
  const seenStamp = (st != null ? st : (state.time || 0));
  if (!recentPstate) {
  for (const sp of (snap.players || [])) {
    const id = String(sp.id);

    let p = pCache.get(id);
    if (!p) {
      const lvl = (typeof sp.level === "number" && Number.isFinite(sp.level)) ? (sp.level | 0) : 1;
      p = new Player({ x: sp.x || 0, y: sp.y || 0 }, lvl);
      p.id = id;
      p.color = sp.color || pickColorForId(id);
      p.nickname = sp.nickname || `P${id}`;
      if (typeof sp.avatarIndex === "number") p.avatarIndex = sp.avatarIndex | 0;
      applyLimitsToPlayer(p, state.progression.limits);
      // Skill meta can be per-player (shop unlocks). If we have it from syncMeta, use it.
      const stored = state._netMetaById?.get(id) || null;
      p._metaSkillMeta = (stored && stored.skillMeta && typeof stored.skillMeta === "object") ? stored.skillMeta : (state.progression?.skillMeta || {});
      p._selectedStarterLoadout = (stored && typeof stored.selectedStarterLoadout === "string") ? stored.selectedStarterLoadout : (state.progression?.selectedStarterLoadout || "mecha");
      // net smoothing targets
      p._netTx = p.x;
      p._netTy = p.y;
      pCache.set(id, p);
    }

    // mark as seen in this snapshot (for pruning)
    p._netSeenAt = seenStamp;

    const tx = Number.isFinite(sp.x) ? sp.x : p.x;
    const ty = Number.isFinite(sp.y) ? sp.y : p.y;

    // For our own player, keep current predicted position and smooth-correct.
    // For others, also smooth (less jitter on phones).
    p._netTx = tx;
    p._netTy = ty;

    // Big correction? snap instantly.
    const dxC = tx - p.x;
    const dyC = ty - p.y;
    if ((dxC * dxC + dyC * dyC) > 600 * 600) {
      p.x = tx;
      p.y = ty;
    }

    p.hp = sp.hp;
    p.maxHP = sp.maxHP;
    p.level = sp.level;
    p.xp = sp.xp;
    p.nextLevelXp = sp.nextXp;
    p.nickname = sp.nickname || p.nickname;
    if (typeof sp.avatarIndex === "number") p.avatarIndex = sp.avatarIndex | 0;
    p.color = sp.color || p.color;
    if (sp.lastAim) {
      p.lastAimDir.x = sp.lastAim.x || 0;
      p.lastAimDir.y = sp.lastAim.y || 0;
    }

    // Revive channel replication
    if (sp.rv) {
      p._reviving = { targetId: String(sp.rv), t: (typeof sp.rvt === 'number' ? sp.rvt : 0), need: (typeof sp.rvn === 'number' ? sp.rvn : 2) };
    } else {
      p._reviving = null;
    }

    players.push(p);
  }
  // Drop missing players
  for (const [id, p] of pCache) {
    if (!p || p._netSeenAt !== seenStamp) pCache.delete(id);
  }
  }
  if (recentPstate) {
    for (const p of pCache.values()) {
      if (p) players.push(p);
    }
  }
  state.players = players;

  // Our player ref
  const me = players.find((p) => String(p.id) === myId) || players[0] || state.player;
  state.player = me;

  // Enemies (reuse arrays + avoid per-snapshot Set allocations)
  const enemies = state._netCache.enemiesArr || (state._netCache.enemiesArr = []);
  enemies.length = 0;
  for (const se of (snap.enemies || [])) {
    const id = String(se.id);

    let e = eCache.get(id);
    if (!e) {
      e = createNetEnemy(se);
      e.x = Number.isFinite(se.x) ? se.x : 0;
      e.y = Number.isFinite(se.y) ? se.y : 0;
      e._netTx = e.x;
      e._netTy = e.y;
      eCache.set(id, e);
    }

    e._netSeenAt = seenStamp;

    const tx = Number.isFinite(se.x) ? se.x : e.x;
    const ty = Number.isFinite(se.y) ? se.y : e.y;
    e._netTx = tx;
    e._netTy = ty;

    const dxC = tx - e.x;
    const dyC = ty - e.y;
    if ((dxC * dxC + dyC * dyC) > 900 * 900) {
      e.x = tx;
      e.y = ty;
    }

    e.hp = se.hp;
    e.maxHp = se.maxHp;
    e.radius = se.radius || e.radius || 20;
    e.kind = se.kind || e.kind || "enemy";
    e._isBoss = !!se.boss;
    e.isElite = !!se.elite;
    enemies.push(e);
  }
  for (const [id, e] of eCache) {
    if (!e || e._netSeenAt !== seenStamp) eCache.delete(id);
  }
  state.enemies = enemies;

  // Visual-only entities:
  // Keep stable by id so joiners don't see bullets "teleport" or disappear between snapshots.
  // We only render them on joiners (no gameplay/collisions on the client).
  const nowLocal = state.time || 0;
  const grace = 0.30; // keep briefly when missing (snapshot cap/interest fluctuations)

  // Projectiles
  const srcB = Array.isArray(snap.projectiles) ? snap.projectiles : [];
  const bMap = state._netCache.projectilesById;
  for (const b of srcB) {
    if (!b) continue;
    const id = (b.id != null) ? String(b.id) : null;
    if (!id) continue;

    let ob = bMap.get(id);
    const tx = Number.isFinite(b.x) ? b.x : 0;
    const ty = Number.isFinite(b.y) ? b.y : 0;
    if (!ob) {
      ob = {
        id,
        type: String(b.type || "bullet"),
        x: tx,
        y: ty,
        vx: Number.isFinite(b.vx) ? b.vx : 0,
        vy: Number.isFinite(b.vy) ? b.vy : 0,
        radius: b.radius || 4,
        _netTx: tx,
        _netTy: ty,
        _netLife: Number.isFinite(b.life) ? b.life : null,
        _netLastSeenLocalTime: nowLocal,
      };
      bMap.set(id, ob);
    }

    ob._netLastSeenLocalTime = nowLocal;
    ob._netTx = tx;
    ob._netTy = ty;
    if (Number.isFinite(b.vx)) ob.vx = b.vx;
    if (Number.isFinite(b.vy)) ob.vy = b.vy;
    if (b.type != null) ob.type = String(b.type || "bullet");
    ob.radius = b.radius || ob.radius || 4;
    if (Number.isFinite(b.life)) ob._netLife = b.life;

    const dxC = ob._netTx - ob.x;
    const dyC = ob._netTy - ob.y;
    if ((dxC * dxC + dyC * dyC) > 1000 * 1000) {
      ob.x = ob._netTx;
      ob.y = ob._netTy;
    }
  }
  for (const [id, ob] of bMap) {
    const lastSeen = (ob && typeof ob._netLastSeenLocalTime === "number") ? ob._netLastSeenLocalTime : -Infinity;
    if (nowLocal - lastSeen > grace) bMap.delete(id);
  }
  const dstB = state._netCache.projectiles;
  dstB.length = 0;
  for (const ob of bMap.values()) dstB.push(ob);
  state.projectiles = dstB;

  // Rockets
  const srcR = Array.isArray(snap.rockets) ? snap.rockets : [];
  const rMap = state._netCache.rocketsById;
  for (const r of srcR) {
    if (!r) continue;
    const id = (r.id != null) ? String(r.id) : null;
    if (!id) continue;

    let or = rMap.get(id);
    const tx = Number.isFinite(r.x) ? r.x : 0;
    const ty = Number.isFinite(r.y) ? r.y : 0;
    if (!or) {
      or = {
        id,
        x: tx,
        y: ty,
        vx: Number.isFinite(r.vx) ? r.vx : 0,
        vy: Number.isFinite(r.vy) ? r.vy : 0,
        radius: r.radius || 6,
        splashRadius: r.splashRadius || 0,
        _netTx: tx,
        _netTy: ty,
        _netLife: Number.isFinite(r.life) ? r.life : null,
        _netLastSeenLocalTime: nowLocal,
      };
      rMap.set(id, or);
    }

    or._netLastSeenLocalTime = nowLocal;
    or._netTx = tx;
    or._netTy = ty;
    if (Number.isFinite(r.vx)) or.vx = r.vx;
    if (Number.isFinite(r.vy)) or.vy = r.vy;
    or.radius = r.radius || or.radius || 6;
    or.type = r.type || or.type || "rocket";
    or.splashRadius = r.splashRadius || or.splashRadius || 0;
    if (Number.isFinite(r.life)) or._netLife = r.life;

    const dxC = or._netTx - or.x;
    const dyC = or._netTy - or.y;
    if ((dxC * dxC + dyC * dyC) > 1000 * 1000) {
      or.x = or._netTx;
      or.y = or._netTy;
    }
  }
  for (const [id, or] of rMap) {
    const lastSeen = (or && typeof or._netLastSeenLocalTime === "number") ? or._netLastSeenLocalTime : -Infinity;
    if (nowLocal - lastSeen > grace) rMap.delete(id);
  }
  const dstR = state._netCache.rockets;
  dstR.length = 0;
  for (const or of rMap.values()) dstR.push(or);
  state.rockets = dstR;

  const srcO = Array.isArray(snap.xpOrbs) ? snap.xpOrbs : [];
  const dstO = state._netCache.xpOrbs;
  dstO.length = srcO.length;
  for (let i = 0; i < srcO.length; i++) {
    const o = srcO[i] || {};
    let oo = dstO[i];
    if (!oo) {
      oo = dstO[i] = { x: 0, y: 0, xp: 10, coins: 0, kind: "xp", radius: 8, age: 0 };
    }
    oo.x = o.x || 0;
    oo.y = o.y || 0;
    oo.kind = o.kind || (o.coins ? "coin" : "xp");
    oo.xp = (oo.kind === "xp") ? (o.xp || 10) : 0;
    oo.coins = (oo.kind === "coin") ? (o.coins || 1) : 0;
    oo.amount = isDirectResourceOrbKind(oo.kind) ? ((o.amount | 0) || 1) : 0;
    oo.grantId = isDirectResourceOrbKind(oo.kind) ? String(o.grantId || '') : '';
    oo.essenceKey = (oo.kind === 'essence') ? String(o.essenceKey || 'mecha') : '';
    oo.materialKey = (oo.kind === 'material') ? String(o.materialKey || 'salvage') : '';
    oo.gearKey = (oo.kind === 'gearPart' || oo.kind === 'gearItem') ? String(o.gearKey || '') : '';
    oo.progKind = (oo.kind === 'prog') ? String(o.progKind || '') : '';
    oo.progPayload = (oo.kind === 'prog' && o.progPayload && typeof o.progPayload === 'object') ? cloneJsonSafe(o.progPayload, null) : null;
    oo.ownerId = (oo.kind === 'prog') ? String(o.ownerId || '') : '';
    oo.ownerAliases = ((oo.kind === 'prog') && Array.isArray(o.ownerAliases)) ? cloneJsonSafe(o.ownerAliases, []) : [];
    oo.radius = o.radius || 8;
    oo.age = 0;
  }
  state.xpOrbs = dstO;

  // Summons (visual-only on joiners)
  const srcS = Array.isArray(snap.summons) ? snap.summons : [];
  if (!Array.isArray(state._netCache.summons)) state._netCache.summons = [];
  const dstS = state._netCache.summons;
  dstS.length = srcS.length;
  for (let i = 0; i < srcS.length; i++) {
    const s = srcS[i] || {};
    let os = dstS[i];
    if (!os) {
      os = dstS[i] = { id: "", ownerId: "", x: 0, y: 0, hp: 1, maxHp: 1, radius: 18, isSummon: true };
    }
    os.id = String(s.id || "");
    os.ownerId = s.ownerId != null ? String(s.ownerId) : "";
    os.x = s.x || 0;
    os.y = s.y || 0;
    os.hp = s.hp || 0;
    os.maxHp = s.maxHp || 0;
    os.radius = s.radius || 18;
    os.isSummon = true;
  }
  state.summons = dstS;

  // Biome skill FX (visual-only on joiners; host is authoritative).
  const fx = snap.fx && typeof snap.fx === 'object' ? snap.fx : null;
  if (fx) {
    const bh = Array.isArray(fx.bh) ? fx.bh : [];
    state.blackholes = bh.map((b) => ({
      id: b.id != null ? b.id : undefined,
      ownerId: b.ownerId != null ? String(b.ownerId) : "",
      x: b.x || 0,
      y: b.y || 0,
      r: b.r || 0,
      t: b.t || 0,
    }));
    const iw = Array.isArray(fx.iw) ? fx.iw : [];
    state.iceWalls = iw.map((w) => ({
      id: w.id != null ? w.id : undefined,
      ownerId: w.ownerId != null ? String(w.ownerId) : "",
      x: w.x || 0,
      y: w.y || 0,
      a: w.a || 0,
      len: w.len || 0,
      thick: w.thick || 0,
      t: w.t || 0,
    }));
    const hp = Array.isArray(fx.hp) ? fx.hp : [];
    state.healPulses = hp.map((h) => ({ id: h.id != null ? h.id : undefined, x: h.x || 0, y: h.y || 0, r: h.r || 0, t: h.t || 0 }));
    const ex = Array.isArray(fx.ex) ? fx.ex : [];
    state._explosions = ex.map((e) => ({ x: e.x || 0, y: e.y || 0, r: e.r || 0, t: e.t || 0, kind: e.k || '' }));
  } else {
    state.blackholes = [];
    state.iceWalls = [];
    state.healPulses = [];
    state._explosions = [];
  }

  state.runScore = snap.runScore || 0;
  state.currentZone = snap.zone ?? state.currentZone;
  // Pixel_GO: room sync
  const r = snap.room || null;
  if (r && typeof r === 'object') {
    state.currentRoomIndex = (r.i | 0) || 0;
    state._roomBiome = String(r.biome || "");
    state._nextRoomBiome = String(r.nextBiome || "");
    state._prevRoomBiome = String(r.prevBiome || "");
    state._roomSide = (r.side | 0) || state._roomSide;
    state._roomCleared = !!r.cleared;
    state._roomHasNext = !!r.hasNext;
    state._bridgeP = (typeof r.bridgeP === 'number') ? r.bridgeP : 0;
    state._bridgeBuilt = !!r.bridgeBuilt;
    state._prevRoomIndex = (r.prevI | 0) || 0;
    state._prevRoomCollapsing = !!r.prevC;
    state._prevRoomCollapseT = (typeof r.prevT === 'number') ? r.prevT : 0;
    state._bridgeFrom = (r.bridgeFrom | 0) || 0;
    state._bridgeTo = (r.bridgeTo | 0) || 0;
    state._waitForParty = !!r.wait;
    state._gateHp = Array.isArray(r.gateHp) ? r.gateHp : (state._gateHp || []);
    state._gateMax = Array.isArray(r.gateMax) ? r.gateMax : (state._gateMax || []);
    state._gateReward = Array.isArray(r.gateReward) ? r.gateReward : (state._gateReward || []);
    state._gateRepair = Array.isArray(r.gateRepair) ? r.gateRepair : (state._gateRepair || []);
    state._gateRepairMode = Array.isArray(r.gateRepairMode) ? r.gateRepairMode : (state._gateRepairMode || []);
    state._gatePressure = Array.isArray(r.gatePressure) ? r.gatePressure : (state._gatePressure || []);
    state._gateUsed = Array.isArray(r.gateUsed) ? r.gateUsed : (state._gateUsed || []);
    state._roomKilled = (r.killed | 0) || 0;
    state._roomQuota = (r.quota | 0) || 0;
    state._roomWaveIndex = (r.waveI | 0) || 0;
    state._roomWavesTotal = (r.waveN | 0) || 0;
    state._roomBossAlive = !!r.bossAlive;
    state._roomIsBoss = !!r.isBoss;
    state._roomIsMiniBoss = !!r.isMiniBoss;
    state._floorNumber = (r.floorNumber | 0) || state._floorNumber || 0;
    state._floorRoomOrdinal = (r.roomOrdinal | 0) || state._floorRoomOrdinal || 0;
    state._floorRoomsTotal = (r.totalRooms | 0) || state._floorRoomsTotal || 0;
    state._roomTemplateKey = String(r.templateKey || state._roomTemplateKey || '');
    state._roomTemplateRole = String(r.templateRole || state._roomTemplateRole || '');
    state._roomEntrySocket = String(r.entrySocket || state._roomEntrySocket || '');
    state._roomExitSocket = String(r.exitSocket || state._roomExitSocket || '');
    state._roomPortalSocket = String(r.portalSocket || state._roomPortalSocket || '');
    state._roomRouteStyle = String(r.routeStyle || state._roomRouteStyle || '');
    state._roomLateralOffset = (typeof r.lateralOffset === 'number') ? r.lateralOffset : (state._roomLateralOffset || 0);
    state._roomCenterX = (typeof r.centerX === 'number') ? r.centerX : (state._roomCenterX || 0);
    state._roomCenterY = (typeof r.centerY === 'number') ? r.centerY : (state._roomCenterY || 0);
    state._bridgeFromSocket = String(r.bridgeFromSocket || state._bridgeFromSocket || '');
    state._bridgeToSocket = String(r.bridgeToSocket || state._bridgeToSocket || '');
    state._bridgeFromPoint = (r.bridgeFromPoint && typeof r.bridgeFromPoint === 'object') ? r.bridgeFromPoint : (state._bridgeFromPoint || null);
    state._bridgeToPoint = (r.bridgeToPoint && typeof r.bridgeToPoint === 'object') ? r.bridgeToPoint : (state._bridgeToPoint || null);
    state._nextRoomTemplateKey = String(r.nextTemplateKey || state._nextRoomTemplateKey || '');
    state._nextRoomTemplateRole = String(r.nextTemplateRole || state._nextRoomTemplateRole || '');
    state._nextRoomEntrySocket = String(r.nextEntrySocket || state._nextRoomEntrySocket || '');
    state._nextRoomRouteStyle = String(r.nextRouteStyle || state._nextRoomRouteStyle || '');
    state._nextRoomLateralOffset = (typeof r.nextLateralOffset === 'number') ? r.nextLateralOffset : (state._nextRoomLateralOffset || 0);
    state._nextRoomCenterX = (typeof r.nextCenterX === 'number') ? r.nextCenterX : (state._nextRoomCenterX || 0);
    state._nextRoomCenterY = (typeof r.nextCenterY === 'number') ? r.nextCenterY : (state._nextRoomCenterY || 0);
    state._nextRoomEncounter = String(r.nextEncounterType || state._nextRoomEncounter || '');
    state._nextRoomEncounterLabel = String(r.nextEncounterLabel || state._nextRoomEncounterLabel || '');
    state._hubResumeRunActive = !!r.resumeActive;
    state._hubResumeNextFloor = (r.resumeFloor | 0) || 0;
    syncRoomDirectorFromNetRoom(state, r);
    if (((r.i | 0) || 0) <= 0) {
      state.overlayMode = null;
      state._floorShopActive = false;
      state._floorShopReopenOnSync = false;
      state._shopActPending = null;
      state._buildPanelOpen = false;
      state._buildPanelSelectedKey = '';
      state._statsPanelOpen = false;
      state._statsPanelExpanded = false;
      try { hideFloorShopOverlay(); } catch {}
    }
  }
  // If host indicates we were left behind, return to start menu.
  if (r && Array.isArray(r.kickIds) && r.kickIds.length) {
    const me = state.player ? String(state.player.id || myId) : myId;
    if (r.kickIds.includes(me)) {
      state.overlayMode = null;
      state.mode = 'startMenu';
      try {
        if (state.net && state.net.status === 'connected' && !state.net.isHost) {
          state.net.disconnect();
        }
      } catch {}
      if (Array.isArray(state.popups)) {
        state.popups.push({ text: 'Left behind', time: 2.0 });
      }
    }
  }
  if (snap.flags && state.flags) {
    state.flags.resGuardianKilledThisRun = !!snap.flags.resGuardianKilledThisRun;
  }

  // Sync global buffs from host -> joiners (so HUD icons and local stat calc can work).
  const srcBuffs = Array.isArray(snap.buffs) ? snap.buffs : [];
  if (!state._netCache) state._netCache = { players: new Map(), enemies: new Map() };
  const dstBuffs = state._netCache.buffsArr || (state._netCache.buffsArr = []);
  dstBuffs.length = srcBuffs.length;
  for (let i = 0; i < srcBuffs.length; i++) {
    const b = srcBuffs[i] || {};
    let ob = dstBuffs[i];
    if (!ob) ob = dstBuffs[i] = { type: "", timeLeft: 0, multiplier: 0, amount: 0 };
    ob.type = (b.type || "").toString();
    ob.timeLeft = typeof b.timeLeft === "number" ? b.timeLeft : 0;
    ob.multiplier = typeof b.multiplier === "number" ? b.multiplier : 0;
    ob.amount = typeof b.amount === "number" ? b.amount : 0;
  }
  state.buffs = dstBuffs;

  // Joiner-only: show notification when a new buff appears (count per type increased).
  if (state.net && !state.net.isHost) {
    const prev = state._netBuffCounts || Object.create(null);
    const next = Object.create(null);
    for (const b of dstBuffs) {
      const t = (b && b.type) ? String(b.type) : "";
      if (!t) continue;
      next[t] = (next[t] || 0) + 1;
    }

    const labelFor = (t) => (
      t === "damage" ? "Damage" :
      t === "attackSpeed" ? "Attack Speed" :
      t === "moveSpeed" ? "Move Speed" :
      t === "regen" ? "Regen" :
      t === "shield" ? "Shield" :
      t === "xpGain" ? "XP Gain" :
      t === "ghost" ? "Ghost" :
      t
    );

    for (const k of Object.keys(next)) {
      const a = next[k] | 0;
      const b = (prev[k] || 0) | 0;
      if (a > b) {
        const label = labelFor(k);
        // Minimal local feedback (we don't know exact world position of the drop).
        if (state.floatingTexts && state.player) {
          state.floatingTexts.push({
            x: state.player.x,
            y: state.player.y - 24,
            text: "BUFF: " + label,
            time: 1.0,
          });
        }
        if (state.popups) {
          state.popups.push({
            text: "Temporary buff: " + label,
            time: 2.0,
          });
        }
      }
    }
    state._netBuffCounts = next;
  }
}

export function createNetEnemy(data) {
  const e = {
    id: data.id,
    x: data.x,
    y: data.y,
    hp: data.hp,
    maxHp: data.maxHp,
    radius: data.radius || 20,
    kind: data.kind || "enemy",
    _isBoss: !!data.boss,
    isElite: !!data.elite,
    update: null,
    render(self, ctx) {
      const biomeKey = biomeKeyFromKind(self.kind);
      if (biomeKey && !self._isBoss) {
        renderBiomeUnit(ctx, self, biomeKey, {
          role: biomeRoleFromKind(self.kind) || (self.isElite ? biomeStyleForKey(biomeKey).eliteRole : biomeStyleForKey(biomeKey).role),
          isBasic: String(self.kind || '').toLowerCase().includes('basic'),
          isElite: !!self.isElite,
          time: performance.now() * 0.001,
        });
        return;
      }
      ctx.save();
      ctx.beginPath();
      // Make remote enemies readable (avoid "gray blobs" on clients)
      let col = "#ff5f6f"; // basic
      if (self.isElite) col = "#ffdd57";
      if (self._isBoss) col = "#ff4b7a";
      // better special-case colors
      if (self.kind === "zoneBoss") col = "#9b5bff";
      if (self.kind === "roamingBoss") col = "#ff3cbe";
      if (self.kind === "resurrectionGuardian") col = "#ffdd44";
      if (self.kind === "zone6SuperBoss") col = "#1be7ff";
      ctx.fillStyle = col;
      ctx.globalAlpha = 1.0;
      ctx.arc(self.x, self.y, self.radius, 0, Math.PI * 2);
      ctx.fill();

      // Small HP ring for elites/bosses (helps orientation)
      if (self._isBoss || self.isElite) {
        const ratio = self.maxHp > 0 ? (self.hp / self.maxHp) : 1;
        ctx.strokeStyle = "#ffffff";
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = self._isBoss ? 3 : 2;
        ctx.beginPath();
        ctx.arc(
          self.x,
          self.y,
          self.radius + (self._isBoss ? 7 : 5),
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, ratio))
        );
        ctx.stroke();
      }
      ctx.restore();
    },
  };
  return e;
}

export function smoothNetEntities(state, dt) {
  // Exponential smoothing factor: stable across FPS differences
  const k = 1 - Math.exp(-dt * 12);
  const kMe = 1 - Math.exp(-dt * 5);

  const ps = state.players || [];
  const myId = state.player ? String(state.player.id) : null;
  const lookahead = 0.05; // small extrapolation helps hide low tickrate
  for (const p of ps) {
    if (!p || p._netTx == null || p._netTy == null) continue;
    const isMe = myId && String(p.id) === myId;
    const tx = p._netTx + (isMe ? 0 : (p._netVx || 0) * lookahead);
    const ty = p._netTy + (isMe ? 0 : (p._netVy || 0) * lookahead);
    const dx = tx - p.x;
    const dy = ty - p.y;
    if (dx * dx + dy * dy < 0.0001) continue;
    const kk = isMe ? kMe : k;
    p.x += dx * kk;
    p.y += dy * kk;
  }

  const es = state.enemies || [];
  for (const e of es) {
    if (!e || e._netTx == null || e._netTy == null) continue;
    const dx = e._netTx - e.x;
    const dy = e._netTy - e.y;
    if (dx * dx + dy * dy < 0.0001) continue;
    e.x += dx * k;
    e.y += dy * k;
  }
}

export function updateNetVisualProjectiles(state, dt) {
  // Joiners only: advance projectiles between low-frequency snapshots for visual continuity.
  if (!state?.net || state.net.isHost) return;

  const k = 1 - Math.exp(-dt * 10);

  const bs = state.projectiles || [];
  for (const b of bs) {
    if (!b) continue;
    const vx = Number.isFinite(b.vx) ? b.vx : 0;
    const vy = Number.isFinite(b.vy) ? b.vy : 0;
    b.x += vx * dt;
    b.y += vy * dt;

    if (b._netTx != null && b._netTy != null) {
      b.x += (b._netTx - b.x) * k;
      b.y += (b._netTy - b.y) * k;
    }
    if (typeof b._netLife === "number") b._netLife -= dt;
  }

  const rs = state.rockets || [];
  for (const r of rs) {
    if (!r) continue;
    const vx = Number.isFinite(r.vx) ? r.vx : 0;
    const vy = Number.isFinite(r.vy) ? r.vy : 0;
    r.x += vx * dt;
    r.y += vy * dt;

    if (r._netTx != null && r._netTy != null) {
      r.x += (r._netTx - r.x) * k;
      r.y += (r._netTy - r.y) * k;
    }
    if (typeof r._netLife === "number") r._netLife -= dt;
  }
}

export function maybeSendPlayerState(state, dt = 0) {
  if (!state.net || !state.net.isHost) return;
  const now = state.time;

  // 40 Hz players-only state (small payload). Helps joiners keep camera & movement smooth.
  const PSTATE_DT = 1 / 40;
  state._netPStateAcc = (state._netPStateAcc || 0) + (Number.isFinite(dt) ? dt : 0);

  // Prevent huge catch-up spikes if the tab hiccups.
  if (state._netPStateAcc > 0.25) state._netPStateAcc = 0.25;
  if (state._netPStateAcc < PSTATE_DT) return;

  // At most one send per updateSim call to avoid bursts.
  state._netPStateAcc -= PSTATE_DT;
  state._netLastPlayerStateSentAt = now;
  if (typeof state.net.sendPlayerState === "function") {
    state.net.sendPlayerState(serializePlayerState(state));
  }
}

export function maybeSendSnapshot(state, dt = 0) {
  if (!state.net || !state.net.isHost) return;
  const now = state.time;

  // Requested net cadence:
  // - 60 Hz authoritative sim (host)
  // - 20 Hz full snapshots; 40 Hz players-only state stays separate for smoother movement.
  const SNAP_DT = 1 / 20;
  state._netSnapAcc = (state._netSnapAcc || 0) + (Number.isFinite(dt) ? dt : 0);

  // Prevent huge catch-up spikes if the tab hiccups.
  if (state._netSnapAcc > 0.25) state._netSnapAcc = 0.25;
  if (state._netSnapAcc < SNAP_DT) return;

  // At most one snapshot per updateSim call to avoid bursts.
  state._netSnapAcc -= SNAP_DT;
  state._netLastSnapshotSendAt = now;
  state.net.sendSnapshot(serializeSnapshot(state));
}

