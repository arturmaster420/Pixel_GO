const STORAGE_KEY = "btm_progress";

import { clampAvatarIndex } from "./avatars.js";
import { clampAuraId } from "./auras.js";

export const MAX_R_TIER = 15;

// ===============================
//  R-Tier configuration
// ===============================

export const UPGRADE_CATEGORIES_BY_RTIER = {
  1: ["attackSpeed", "damage", "moveSpeed"],
  2: ["hp", "hpRegen"],
  3: ["range", "pickupRadius"],
  4: ["score", "xpGain"],
  5: ["critChance", "critDamage"],
  6: ["critChance", "critDamage", "lifeSteal"],
  7: ["critChance", "critDamage", "lifeSteal"],
  8: ["critChance", "critDamage", "lifeSteal"],
  9: ["critChance", "critDamage", "lifeSteal"],
  10: ["critChance", "critDamage", "lifeSteal"],
  11: ["critChance", "critDamage", "lifeSteal"],
  12: ["critChance", "critDamage", "lifeSteal"],
  13: ["critChance", "critDamage", "lifeSteal"],
  14: ["critChance", "critDamage", "lifeSteal"],
  15: ["critChance", "critDamage", "lifeSteal"],
};

export const RES_CAP_CONFIG = {
  attackSpeed:   { baseMax: 10, perRes: 5,  unlockRTier: 1 },
  damage:        { baseMax: 15, perRes: 10, unlockRTier: 1 },
  moveSpeed:     { baseMax: 10, perRes: 5,  unlockRTier: 1 },

  hp:            { baseMax: 20, perRes: 20, unlockRTier: 2 },
  hpRegen:       { baseMax: 10, perRes: 5,  unlockRTier: 2 },

  range:         { baseMax: 10, perRes: 5,  unlockRTier: 3 },
  pickupRadius:  { baseMax: 10, perRes: 5,  unlockRTier: 3 },

  score:         { baseMax: 10, perRes: 5,  unlockRTier: 4 },
  xpGain:        { baseMax: 10, perRes: 5,  unlockRTier: 4 },
};

export const CRIT_CAP_CONFIG = {
  // Crit Chance: appears at R-Tier 5 with 5% cap, +5% per Resurrection.
  // Each meta point = +0.1% crit chance.
  critChance: {
    unlockRTier: 5,
    basePercent: 5,
    perResPercent: 5,
    stepPercent: 0.1,
  },

  // Crit Damage: appears at R-Tier 5 with 20% cap, +20% per Resurrection.
  // Each meta point = +1% crit damage.
  critDamage: {
    unlockRTier: 5,
    basePercent: 20,
    perResPercent: 20,
    stepPercent: 1,
  },

  // Life Steal: appears at R-Tier 6 with 2% cap, +2% per Resurrection.
  // Each meta point = +0.1% life steal.
  lifeSteal: {
    unlockRTier: 6,
    basePercent: 2,
    perResPercent: 2,
    stepPercent: 0.1,
  },
};

export function defaultProgression() {
  return {
    nickname: "Player",
    avatarIndex: 0,
    // Cosmetic only
    auraId: 0,
    roomCode: "",
    totalScore: 0,
    upgradePoints: 0,
    coins: 0,
    skillMeta: {},
    shopOffers: { active: [], passive: [] },
    shopRerollCount: 0,
    metaVersion: 7,
    // Dev override: keep all R-Tiers unlocked by default.
    resurrectedTier: MAX_R_TIER,
    resGuardianKills: 0,
    limits: {
      attackSpeed: 0,
      damage: 0,
      moveSpeed: 0,
      hp: 0,
      range: 0,
      laserOverheat: 0,
      hpRegen: 0,
      xpGain: 0,
      score: 0,
      pickupRadius: 0,
      critChance: 0,
      critDamage: 0,
      lifeSteal: 0,
    },
  };
}

// Sum of all spent meta points
export function computeTotalMetaPoints(limits) {
  if (!limits) return 0;
  let total = 0;
  for (const key in limits) {
    const v = limits[key];
    if (typeof v === "number" && !Number.isNaN(v)) {
      total += v;
    }
  }
  return total;
}

// Per-stat cap for given R-Tier
export function getMaxPointsForStat(resurrectedTier, statKey) {
  // Allow progression up to R-Tier 15
  const r = Math.max(1, Math.min(MAX_R_TIER, resurrectedTier || 1));

  const resCfg = RES_CAP_CONFIG[statKey];
  if (resCfg) {
    if (r < resCfg.unlockRTier) return 0;
    return resCfg.baseMax + resCfg.perRes * (r - resCfg.unlockRTier);
  }

  const critCfg = CRIT_CAP_CONFIG[statKey];
  if (critCfg) {
    if (r < critCfg.unlockRTier) return 0;
    const extraRes = r - critCfg.unlockRTier;
    const maxPercent = critCfg.basePercent + critCfg.perResPercent * extraRes;
    const maxPoints = maxPercent / critCfg.stepPercent;
    return maxPoints;
  }

  // Stats without specific caps (e.g. laserOverheat) are effectively uncapped
  return Infinity;
}

// Total max points for given R-Tier (all stats)
export function getTotalMaxPointsForTier(resurrectedTier) {
  const r = Math.max(1, Math.min(MAX_R_TIER, resurrectedTier || 1));
  let total = 0;

  for (const key in RES_CAP_CONFIG) {
    const cfg = RES_CAP_CONFIG[key];
    if (r < cfg.unlockRTier) continue;
    total += cfg.baseMax + cfg.perRes * (r - cfg.unlockRTier);
  }

  for (const key in CRIT_CAP_CONFIG) {
    const cfg = CRIT_CAP_CONFIG[key];
    if (r < cfg.unlockRTier) continue;
    const extraRes = r - cfg.unlockRTier;
    const maxPercent = cfg.basePercent + cfg.perResPercent * extraRes;
    const maxPoints = maxPercent / cfg.stepPercent;
    total += maxPoints;
  }

  return total;
}

// 70% rule helper for Guardian spawn
export function hasReachedResurrectionThreshold(progression) {
  if (!progression) return false;
  const limits = progression.limits || {};
  const rTier = progression.resurrectedTier || 1;

  const totalMax = getTotalMaxPointsForTier(rTier);
  if (!totalMax || !Number.isFinite(totalMax)) return false;

  const used = computeTotalMetaPoints(limits);
  return used / totalMax >= 0.7;
}

export function loadProgression() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProgression();

    const parsed = JSON.parse(raw) || {};
    const base = defaultProgression();

    const data = {
      nickname:
        typeof parsed.nickname === "string" && parsed.nickname.trim().length
          ? parsed.nickname.trim().slice(0, 16)
          : base.nickname,
      avatarIndex: typeof parsed.avatarIndex === "number" ? Math.max(0, (parsed.avatarIndex|0)) : base.avatarIndex,
      auraId: typeof parsed.auraId === "number" && Number.isFinite(parsed.auraId) ? (parsed.auraId|0) : (base.auraId|0),
      roomCode: typeof parsed.roomCode === "string" ? parsed.roomCode.trim().toUpperCase().slice(0, 8) : base.roomCode,
      totalScore: typeof parsed.totalScore === "number" ? parsed.totalScore : base.totalScore,
      upgradePoints: typeof parsed.upgradePoints === "number" ? parsed.upgradePoints : base.upgradePoints,
      coins: typeof parsed.coins === "number" && Number.isFinite(parsed.coins) ? Math.max(0, Math.floor(parsed.coins)) : (base.coins || 0),
      skillMeta: (parsed.skillMeta && typeof parsed.skillMeta === "object") ? parsed.skillMeta : (base.skillMeta || {}),
      shopOffers: (parsed.shopOffers && typeof parsed.shopOffers === "object") ? parsed.shopOffers : (base.shopOffers || { active: [], passive: [] }),
      shopRerollCount: typeof parsed.shopRerollCount === "number" && Number.isFinite(parsed.shopRerollCount) ? Math.max(0, Math.floor(parsed.shopRerollCount)) : (base.shopRerollCount || 0),
      metaVersion: (typeof parsed.metaVersion === "number" && Number.isFinite(parsed.metaVersion)) ? (parsed.metaVersion | 0) : (base.metaVersion | 0),
      resurrectedTier:
        typeof parsed.resurrectedTier === "number"
          ? parsed.resurrectedTier
          : 1,
      resGuardianKills:
        typeof parsed.resGuardianKills === "number"
          ? parsed.resGuardianKills
          : 0,
      limits: {},
    };

    // Dev override: keep all R-Tiers unlocked (also prevents over-clamping on older saves).
    data.resurrectedTier = MAX_R_TIER;

    const srcLimits = parsed.limits && typeof parsed.limits === "object" ? parsed.limits : {};
    const defLimits = base.limits;

    for (const key in defLimits) {
      const v = srcLimits[key];
      data.limits[key] = typeof v === "number" && !Number.isNaN(v) ? v : 0;
    }

    // Clamp any overcapped stats for this R-Tier
    const rTier = data.resurrectedTier || 1;
    for (const key in data.limits) {
      const maxForStat = getMaxPointsForStat(rTier, key);
      const cur = data.limits[key];
      if (Number.isFinite(maxForStat) && cur > maxForStat) {
        data.limits[key] = maxForStat;
      }
    }

    // Clamp avatar selection to unlocked range (2 per Start Level)
    const startLevel = Math.min(100, Math.floor((data.totalScore || 0) / 1000));
    data.avatarIndex = clampAvatarIndex(startLevel, data.avatarIndex);

    // Clamp aura selection (all auras are selectable)
    data.auraId = clampAuraId(data.auraId);

    return data;
  } catch (err) {
    console.error("[Progression] Failed to load progression", err);
    return defaultProgression();
  }
}

export function saveProgression(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error("[Progression] Failed to save progression", err);
  }
}

export function getStartLevel(progression) {
  const total = progression?.totalScore || 0;
  return Math.min(100, Math.floor(total / 1000));
}

// Apply meta limits to player stats and return global multipliers
// Apply meta limits to player stats and return global multipliers
export function applyLimitsToPlayer(player, limits) {
  if (!limits) return null;

  const attackPoints = limits.attackSpeed || 0;
  const damagePoints = limits.damage || 0;
  const movePoints = limits.moveSpeed || 0;
  const hpPoints = limits.hp || 0;
  const rangePoints = limits.range || 0;
  const regenPoints = limits.hpRegen || 0;

  const xpGainPoints = limits.xpGain || 0;
  const scorePoints = limits.score || 0;
  const pickupPoints = limits.pickupRadius || 0;
  const critChancePoints = limits.critChance || 0;
  const critDamagePoints = limits.critDamage || 0;
  const lifeStealPoints = limits.lifeSteal || 0;

  const ATTACK_STEP = 0.02;
  const DAMAGE_STEP = 0.02;
  const MOVE_STEP = 0.01;
  const RANGE_STEP = 0.02;

  player.metaAttackMult = 1 + attackPoints * ATTACK_STEP;
  player.metaDamageMult = 1 + damagePoints * DAMAGE_STEP;
  player.metaMoveMult = 1 + movePoints * MOVE_STEP;
  player.metaRangeMult = 1 + rangePoints * RANGE_STEP;

  const baseMaxHP = player.baseMaxHP ?? player.maxHP ?? 100;
  const hpBonus = hpPoints * 5;
  player.baseMaxHP = baseMaxHP;
  player.maxHP = baseMaxHP + hpBonus;
  if (player.hp > player.maxHP) {
    player.hp = player.maxHP;
  }

  // Permanent HP regen (HP/s) from meta
  player.metaHpRegen = regenPoints * 0.25;

  // Crit stats from meta progression
  player.metaCritChance = (critChancePoints * 0.1) / 100;
  player.metaCritDamageMult = 1 + critDamagePoints * 0.01;

  // Life Steal: each point = +0.1% life steal
  player.metaLifeSteal = lifeStealPoints * 0.001;

  // Global non-player stats (XP, score, pickup radius)
  const xpGainMult = 1 + xpGainPoints * 0.005;
  const scoreMult = 1 + scorePoints * 0.02;
  const pickupBonusRadius = pickupPoints * 1;

  return {
    xpGainMult,
    scoreMult,
    pickupBonusRadius,
  };
}

export function applyCritToDamage(player, baseDamage) {
  const chance = (player?.metaCritChance || 0) + (player?.runCritChanceAdd || 0);
  const mult = (player?.metaCritDamageMult || 1) * (player?.runCritDamageMult || 1);

  if (chance > 0 && Math.random() < chance) {
    return baseDamage * mult;
  }

  return baseDamage;
}

// Apply life steal based on damage dealt.
// Life steal is stored on player.metaLifeSteal as a fraction (e.g. 0.02 = 2%).
export function applyLifeSteal(player, dealtDamage) {
  if (!player) return;
  if (!Number.isFinite(dealtDamage) || dealtDamage <= 0) return;

  const ls = (player.metaLifeSteal || 0) + (player.runLifeSteal || 0);
  if (!ls || ls <= 0) return;

  const heal = dealtDamage * ls;
  if (!Number.isFinite(heal) || heal <= 0) return;

  const maxHP = player.maxHP ?? player.baseMaxHP ?? 100;
  player.hp = Math.min(maxHP, player.hp + heal);
}


export function applyResurrection(progression) {
  if (!progression) return;

  const current = progression.resurrectedTier || 1;
  const next = Math.min(MAX_R_TIER, current + 1);
  progression.resurrectedTier = next;

  // При ресуректе сбрасываем общий totalScore,
  // чтобы стартовый уровень нового рана не упирался в старый скор.
  progression.totalScore = 0;

  const base = defaultProgression();
  const newLimits = {};
  for (const key in base.limits) {
    newLimits[key] = 0;
  }
  progression.limits = newLimits;

  saveProgression(progression);
}
