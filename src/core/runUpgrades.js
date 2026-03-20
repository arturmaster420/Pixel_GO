// Run-time (in-run) upgrade system inspired by Magic Survival.
// - Meta upgrades (R-Tier / Stats) remain unchanged and are applied between runs.
// - During a run, each level grants a choice of upgrades (skills or passives).

import { isStandardSkillKey, getSkillFamily } from "../weapons/skillCatalog.js";
import { composeSkillUpgradeDescription, getSkillPresentation } from "../weapons/skillPresentation.js";

export const MAX_RUN_ACTIVE_SKILLS = 6;

export const EVOLUTION_SKILL_KEYS = ["rockets", "energyBomb", "fireBomb", "iceBomb"];

export const EVOLUTION_DEFS = [
  {
    evoKey: "rocketFusion",
    resultKey: "rockets",
    name: "Fuse → Rockets",
    fromKey: "bullets",
    fromName: "Gun",
    resultName: "Rockets",
    fusionFlag: "rocketFusion",
    cooldownResetKey: "rocketCooldown",
  },
  {
    evoKey: "energyBombFusion",
    resultKey: "energyBomb",
    name: "Fuse → Energy Bomb",
    fromKey: "lightning",
    fromName: "Electric Chain",
    resultName: "Energy Bomb",
    fusionFlag: "energyBombFusion",
    cooldownResetKey: "energyBombCooldown",
  },
  {
    evoKey: "fireBombFusion",
    resultKey: "fireBomb",
    name: "Fuse → Fire Bomb",
    fromKey: "fireball",
    fromName: "Fireball",
    resultName: "Fire Bomb",
    fusionFlag: "fireBombFusion",
    cooldownResetKey: "fireBombCooldown",
  },
  {
    evoKey: "iceBombFusion",
    resultKey: "iceBomb",
    name: "Fuse → Ice Bomb",
    fromKey: "iceWall",
    fromName: "Ice Ball",
    resultName: "Ice Bomb",
    fusionFlag: "iceBombFusion",
    cooldownResetKey: "iceBombCooldown",
  },
];

const EVOLUTION_DEF_BY_EVO_KEY = Object.fromEntries(EVOLUTION_DEFS.map((def) => [def.evoKey, def]));

function hasAnyBombEvolution(player) {
  const evo = player?.runEvolutions || {};
  return !!(evo.rocketFusion || evo.energyBombFusion || evo.fireBombFusion || evo.iceBombFusion);
}

function getAvailableEvolutionOffers(player) {
  const skills = player?.runSkills || {};
  const evo = player?.runEvolutions || {};
  if (hasAnyBombEvolution(player)) return [];
  const maxBombs = MAX_RUN_SKILL_LEVEL.bombs || 6;
  if ((skills.bombs | 0) < maxBombs) return [];
  const out = [];
  for (const def of EVOLUTION_DEFS) {
    if (evo[def.fusionFlag]) continue;
    if ((skills[def.fromKey] | 0) < (MAX_RUN_SKILL_LEVEL[def.fromKey] || 6)) continue;
    if ((skills[def.resultKey] | 0) > 0) continue;
    out.push({
      id: `evo:${def.evoKey}`,
      kind: "evolution",
      key: def.evoKey,
      name: def.name,
      from: "MAX",
      to: def.resultName,
      weight: 999,
    });
  }
  return out;
}

export const MAX_RUN_SKILL_LEVEL = {
  bullets: 6,
  bombs: 6,
  rockets: 6,
  energyBomb: 6,
  fireBomb: 6,
  iceBomb: 6,
  satellites: 6,
  energyBarrier: 6,
  spirit: 6,
  summon: 6,
  electricZone: 6,
  laser: 6,
  lightning: 6,
  fireball: 6,
  iceWall: 6,
  blackhole: 6,
  lightHeal: 6,
  stormStrike: 6,
  flameNova: 6,
  iceShards: 6,
  voidBurst: 6,
  holyNova: 6,
  shrapnelBurst: 6,
  railVolley: 6,
  arcSpark: 6,
  staticPulse: 6,
  meteorRain: 6,
  magmaLance: 6,
  frostNova: 6,
  crystalSpear: 6,
  soulDrain: 6,
  dreadRing: 6,
  prismRay: 6,
  sanctuary: 6,
};

function pickWeightedUnique(items, count) {
  const out = [];
  const pool = items.slice();

  for (let k = 0; k < count && pool.length > 0; k++) {
    let sum = 0;
    for (const it of pool) sum += Math.max(0, it.weight || 0);
    if (sum <= 0) {
      // Fallback: uniform pick
      const idx = (Math.random() * pool.length) | 0;
      out.push(pool.splice(idx, 1)[0]);
      continue;
    }

    let r = Math.random() * sum;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= Math.max(0, pool[i].weight || 0);
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    out.push(pool.splice(idx, 1)[0]);
  }

  return out;
}


function getMetaLevelForUpgrade(player, id) {
  const m = player && player._metaSkillMeta && typeof player._metaSkillMeta === "object" ? player._metaSkillMeta : null;
  const v = m ? m[id] : 0;
  return (typeof v === "number" && Number.isFinite(v)) ? Math.max(0, (v | 0)) : 0;
}

export const RUN_SKILLS = [
  { key: "bullets", name: "Gun", kind: "skill" },
  { key: "bombs", name: "Bombs", kind: "skill" },
  // New early skills (Magic Survival inspired)
  { key: "satellites", name: "Frost Orbit", kind: "skill", biome: "ice" },
  { key: "energyBarrier", name: "Shield", kind: "skill" },
  { key: "spirit", name: "Shadow Spirit", kind: "skill", biome: "dark" },
  { key: "summon", name: "Light Wardens", kind: "skill", biome: "light" },
  { key: "electricZone", name: "Electric Ring", kind: "skill", biome: "electric" },
  // Advanced skills unlock a bit later (prevents early "take everything" power spike).
  { key: "laser", name: "Solar Beam", kind: "skill", biome: "fire" },
  { key: "lightning", name: "Electric Chain", kind: "skill", biome: "electric" },
  // Biome actives (sold via Floor Terminal starting from floor 6)
  { key: "fireball", name: "Fireball", kind: "skill", biome: "fire" },
  { key: "iceWall", name: "Ice Ball", kind: "skill", biome: "ice" },
  { key: "blackhole", name: "Blackhole", kind: "skill", biome: "dark" },
  { key: "lightHeal", name: "Light Heal", kind: "skill", biome: "light" },
  { key: "stormStrike", name: "Storm Strike", kind: "skill", biome: "electric" },
  { key: "flameNova", name: "Flame Nova", kind: "skill", biome: "fire" },
  { key: "iceShards", name: "Glacial Shards", kind: "skill", biome: "ice" },
  { key: "voidBurst", name: "Void Burst", kind: "skill", biome: "dark" },
  { key: "holyNova", name: "Holy Nova", kind: "skill", biome: "light" },
  { key: "shrapnelBurst", name: "Shrapnel Burst", kind: "skill", biome: "neutral" },
  { key: "railVolley", name: "Rail Volley", kind: "skill", biome: "neutral" },
  { key: "arcSpark", name: "Arc Spark", kind: "skill", biome: "electric" },
  { key: "staticPulse", name: "Static Pulse", kind: "skill", biome: "electric" },
  { key: "meteorRain", name: "Meteor Rain", kind: "skill", biome: "fire" },
  { key: "magmaLance", name: "Magma Lance", kind: "skill", biome: "fire" },
  { key: "frostNova", name: "Frost Nova", kind: "skill", biome: "ice" },
  { key: "crystalSpear", name: "Crystal Spear", kind: "skill", biome: "ice" },
  { key: "soulDrain", name: "Soul Drain", kind: "skill", biome: "dark" },
  { key: "dreadRing", name: "Dread Ring", kind: "skill", biome: "dark" },
  { key: "prismRay", name: "Prism Ray", kind: "skill", biome: "light" },
  { key: "sanctuary", name: "Sanctuary", kind: "skill", biome: "light" },
  // Evolution skills are obtained via fusion, not directly.
  { key: "rockets", name: "Rockets", kind: "skill" },
  { key: "energyBomb", name: "Energy Bomb", kind: "skill", biome: "electric" },
  { key: "fireBomb", name: "Fire Bomb", kind: "skill", biome: "fire" },
  { key: "iceBomb", name: "Ice Bomb", kind: "skill", biome: "ice" },
];

export const RUN_PASSIVES = [
  { key: "damage", name: "Damage", kind: "passive" },
  { key: "attackSpeed", name: "Attack Speed", kind: "passive" },
  { key: "moveSpeed", name: "Move Speed", kind: "passive" },
  { key: "hp", name: "Max HP", kind: "passive" },
  { key: "hpRegen", name: "HP Regen", kind: "passive" },
  { key: "range", name: "Range", kind: "passive" },
  { key: "pickupRadius", name: "Pickup Radius", kind: "passive" },
  { key: "xpGain", name: "XP Gain", kind: "passive" },
  { key: "critChance", name: "Crit Chance", kind: "passive" },
  { key: "critDamage", name: "Crit Damage", kind: "passive" },
  { key: "lifeSteal", name: "Life Steal", kind: "passive" },
];

export function initRunUpgrades(player) {
  if (!player) return;

  // Base skill always available.
  // NOTE: merge defaults (do NOT overwrite existing 0 values; bullets may be consumed by evolutions).
  const s = player.runSkills || {};
  player.runSkills = {
    bullets: (s.bullets ?? 1) | 0,
    bombs: (s.bombs ?? 0) | 0,
    rockets: (s.rockets ?? 0) | 0,
    energyBomb: (s.energyBomb ?? 0) | 0,
    fireBomb: (s.fireBomb ?? 0) | 0,
    iceBomb: (s.iceBomb ?? 0) | 0,
    // Satellites are in the pool by default (meta unlock), but not granted at run start.
    satellites: (s.satellites ?? 0) | 0,
    energyBarrier: (s.energyBarrier ?? 0) | 0,
    spirit: (s.spirit ?? 0) | 0,
    summon: (s.summon ?? 0) | 0,
    electricZone: (s.electricZone ?? 0) | 0,
    laser: (s.laser ?? 0) | 0,
    lightning: (s.lightning ?? 0) | 0,
    fireball: (s.fireball ?? 0) | 0,
    iceWall: (s.iceWall ?? 0) | 0,
    blackhole: (s.blackhole ?? 0) | 0,
    lightHeal: (s.lightHeal ?? 0) | 0,
    stormStrike: (s.stormStrike ?? 0) | 0,
    flameNova: (s.flameNova ?? 0) | 0,
    iceShards: (s.iceShards ?? 0) | 0,
    voidBurst: (s.voidBurst ?? 0) | 0,
    holyNova: (s.holyNova ?? 0) | 0,
    shrapnelBurst: (s.shrapnelBurst ?? 0) | 0,
    railVolley: (s.railVolley ?? 0) | 0,
    arcSpark: (s.arcSpark ?? 0) | 0,
    staticPulse: (s.staticPulse ?? 0) | 0,
    meteorRain: (s.meteorRain ?? 0) | 0,
    magmaLance: (s.magmaLance ?? 0) | 0,
    frostNova: (s.frostNova ?? 0) | 0,
    crystalSpear: (s.crystalSpear ?? 0) | 0,
    soulDrain: (s.soulDrain ?? 0) | 0,
    dreadRing: (s.dreadRing ?? 0) | 0,
    prismRay: (s.prismRay ?? 0) | 0,
    sanctuary: (s.sanctuary ?? 0) | 0,
  };
  player.runEvolutions = player.runEvolutions || {};
  // Passives start at 0 (merge defaults).
  const p0 = player.runPassives || {};
  player.runPassives = {
    damage: (p0.damage ?? 0) | 0,
    attackSpeed: (p0.attackSpeed ?? 0) | 0,
    moveSpeed: (p0.moveSpeed ?? 0) | 0,
    hp: (p0.hp ?? 0) | 0,
    hpRegen: (p0.hpRegen ?? 0) | 0,
    range: (p0.range ?? 0) | 0,
    pickupRadius: (p0.pickupRadius ?? 0) | 0,
    xpGain: (p0.xpGain ?? 0) | 0,
    critChance: (p0.critChance ?? 0) | 0,
    critDamage: (p0.critDamage ?? 0) | 0,
    lifeSteal: (p0.lifeSteal ?? 0) | 0,

    // Biome affinities (floor shop only; not rolled by normal level-up pool)
    affElectric: (p0.affElectric ?? 0) | 0,
    affFire: (p0.affFire ?? 0) | 0,
    affIce: (p0.affIce ?? 0) | 0,
    affLight: (p0.affLight ?? 0) | 0,
    affDark: (p0.affDark ?? 0) | 0,
  };

  // Snapshot of "maxHP after meta" at run start.
  if (!Number.isFinite(player._runBaseMaxHP)) {
    player._runBaseMaxHP = Number.isFinite(player.maxHP) ? player.maxHP : (player.baseMaxHP || 100);
  }

  // Per-damage-type multipliers (starter cores / future systems).
  player.runDamageTypeMults = {
    mecha: 1,
    electric: 1,
    fire: 1,
    ice: 1,
    light: 1,
    dark: 1,
  };
  player._starterAttackSpeedBonus = 0;
  player._starterDamageBonus = 0;
  player._starterLoadoutKey = '';
  player._starterSkillKey = '';

  // Derived cached multipliers (used by updateBuffs and combat helpers)
  applyRunDerivedStats(player);
}

export function applyRunDerivedStats(player) {
  if (!player) return;

  const p = player.runPassives || {};

  // Multipliers are intentionally modest (tuned to reduce snowball / upgrade spam).
  player.runDamageMult = 1 + (p.damage || 0) * 0.08;
  player.runAttackMult = (1 + (p.attackSpeed || 0) * 0.05) * (1 + Math.max(0, Number(player._starterAttackSpeedBonus || 0)));
  player.runMoveMult = 1 + (p.moveSpeed || 0) * 0.05;
  player.runRangeMult = 1 + (p.range || 0) * 0.045;

  player.runPickupBonusRadius = (p.pickupRadius || 0) * 10;
  player.runXpGainMult = 1 + (p.xpGain || 0) * 0.045;

  // Run crit is additive to meta crit.
  player.runCritChanceAdd = (p.critChance || 0) * 0.015;
  player.runCritDamageMult = 1 + (p.critDamage || 0) * 0.12;
  player.runLifeSteal = (p.lifeSteal || 0) * 0.004;

  player.runHpRegen = (p.hpRegen || 0) * 0.35;
  const hpBonus = (p.hp || 0) * 12;
  const baseMax = Number.isFinite(player._runBaseMaxHP) ? player._runBaseMaxHP : (player.maxHP || 100);
  player.maxHP = baseMax + hpBonus;
  if (player.hp > player.maxHP) player.hp = player.maxHP;
}

export function rollRunUpgrades(player, count = 3) {
  if (!player) return [];
  initRunUpgrades(player);

  const skills = player.runSkills || {};
  const pass = player.runPassives || {};
  const runLevel = player.level | 0;

  const skillItems = [];
  const passiveItems = [];

  // Skills (unlock weight high; upgrades stay relevant)
const evo = player.runEvolutions || {};

const attackKeys = ["bullets", "bombs", "satellites", "energyBarrier", "spirit", "summon", "electricZone", "laser", "lightning", "fireball", "iceWall", "blackhole", "lightHeal", "stormStrike", "flameNova", "iceShards", "voidBurst", "holyNova", "shrapnelBurst", "railVolley", "arcSpark", "staticPulse", "meteorRain", "magmaLance", "frostNova", "crystalSpear", "soulDrain", "dreadRing", "prismRay", "sanctuary", "rockets", "energyBomb", "fireBomb", "iceBomb"];
const activeAttackSkills = attackKeys.reduce((acc, k) => acc + (((skills[k] || 0) > 0) ? 1 : 0), 0);

for (const evoOffer of getAvailableEvolutionOffers(player)) {
  skillItems.push(evoOffer);
}

for (const s of RUN_SKILLS) {
  const fam = getSkillFamily(s.key);
  const isStandard = isStandardSkillKey(s.key);
  const metaId = `skill:${s.key}`;
  const metaLvl = getMetaLevelForUpgrade(player, metaId);
  // Standard level-up pool now stays clean: standard actives only + evolution.
  if (!isStandard && !EVOLUTION_SKILL_KEYS.includes(s.key)) continue;
  // Shop gating: locked skills (metaLvl<=0) do not appear in run upgrade pool (except base bullets).
  if (s.key !== "bullets" && metaLvl <= 0) continue;
  // After a bomb-fusion evolution, we no longer offer the consumed base parts again.
  if (hasAnyBombEvolution(player) && s.key === "bombs") continue;
  if (evo.rocketFusion && s.key === "bullets") continue;
  if (evo.energyBombFusion && s.key === "lightning") continue;
  if (evo.fireBombFusion && s.key === "fireball") continue;
  if (evo.iceBombFusion && s.key === "iceWall") continue;

  const lvl = skills[s.key] | 0;

  // Evolution-result skills: only appear after evolution has happened (or already owned).
  if (EVOLUTION_SKILL_KEYS.includes(s.key) && lvl <= 0 && !EVOLUTION_DEFS.some((def) => def.resultKey === s.key && evo[def.fusionFlag])) continue;

  const maxLvl = MAX_RUN_SKILL_LEVEL[s.key] || 9999;
  if (lvl >= maxLvl) continue;

  const isBase = s.key === "bullets";

  let w;
  if (isBase) {
    w = 1.0;
  } else if (lvl <= 0) {
    // Unlock weights: bombs are meant to appear early, laser/lightning a bit less.
    w = (s.key === "bombs") ? 9.0 : (EVOLUTION_SKILL_KEYS.includes(s.key) ? 7.5 : 6.0);
  } else {
    w = Math.max(1.6, 3.6 - (lvl - 1) * 0.14);
  }

  // Meta weight: higher shop metaLevel makes the option appear a bit more often.
  if (metaLvl > 1) {
    const mm = 1 + Math.min(0.6, (metaLvl - 1) * 0.12);
    w *= mm;
  }

  // Soft anti-snowball: reduce chance to unlock NEW attacking skills when you already have many.
  const skipAntiSnowball = (s.key === "energyBarrier" || s.key === "spirit" || s.key === "summon" || s.key === "electricZone");
  if (!isBase && lvl <= 0 && !skipAntiSnowball) {
    if (activeAttackSkills >= 3) w *= 0.12;
    else if (activeAttackSkills >= 2) w *= 0.25;
  }

  skillItems.push({
    id: `skill:${s.key}`,
    kind: "skill",
    key: s.key,
    name: s.name,
    from: lvl,
    to: lvl + 1,
    weight: w,
    requiresReplace: lvl <= 0 && activeAttackSkills >= MAX_RUN_ACTIVE_SKILLS,
  });
}
  // Passives (some appear later to avoid "dead" early picks)
  for (const pdef of RUN_PASSIVES) {
    const k = pdef.key;
    const metaId = `passive:${k}`;
    const metaLvl = getMetaLevelForUpgrade(player, metaId);
    if (metaLvl <= 0) continue;
    if ((k === "critChance" || k === "critDamage") && runLevel < 8) continue;
    if (k === "lifeSteal" && runLevel < 12) continue;
    if (k === "xpGain" && runLevel < 4) continue;

    const lvl = pass[k] | 0;

    let w = lvl <= 0 ? 3.2 : Math.max(0.8, 2.6 - lvl * 0.12);
    if (metaLvl > 1) {
      const mm = 1 + Math.min(0.5, (metaLvl - 1) * 0.10);
      w *= mm;
    }

    // Small per-passive tuning
    if (k === "damage") w *= 1.10;
    if (k === "hp") w *= 1.05;
    if (k === "pickupRadius") w *= 0.90;
    if (k === "xpGain") w *= 0.85;
    if (k === "range") w *= 0.95;
    if (k === "hpRegen") w *= 0.90;
    if (k === "critChance" || k === "critDamage") w *= 0.75;
    if (k === "lifeSteal") w *= 0.60;

    passiveItems.push({
      id: `passive:${k}`,
      kind: "passive",
      key: k,
      name: pdef.name,
      from: lvl,
      to: lvl + 1,
      weight: w,
    });
  }

  const hasAnyExtraSkill = (RUN_SKILLS || []).some((def) => {
    const key = String(def?.key || "");
    return key && key !== "bullets" && ((skills[key] | 0) > 0);
  });

  // Composition for readability: 1 skill + 1 passive + (rest any)
  const picks = [];

  if (count >= 1 && skillItems.length) {
    const evoItem = skillItems.find((it) => it.kind === "evolution");
    if (evoItem) picks.push(evoItem);
    else picks.push(...pickWeightedUnique(skillItems, 1));
  }

  if (count >= 2 && passiveItems.length) {
    const p = pickWeightedUnique(passiveItems, 1);
    if (p.length) picks.push(p[0]);
  }

  // Fill remaining from combined pool (excluding already picked)
  while (picks.length < count) {
    const pool = [...skillItems, ...passiveItems].filter(
      (it) => !picks.some((p) => p.id === it.id)
    );
    if (pool.length <= 0) break;
    const next = pickWeightedUnique(pool, 1);
    if (!next.length) break;
    picks.push(next[0]);
  }

// Ensure at least 1 non-base skill appears if the player has none yet.
if (!hasAnyExtraSkill) {
  const hasNonBase = picks.some((p) => p.kind === "skill" && p.key !== "bullets");
  if (!hasNonBase) {
    // Prefer Bombs as the first "real" attack skill.
    const forcedKey = "bombs";
    const forcedItem = skillItems.find((it) => it.kind === "skill" && it.key === forcedKey);
    if (forcedItem) {
      const replIdx = picks.findIndex((p) => p.kind !== "skill");
      if (replIdx >= 0) picks[replIdx] = forcedItem;
      else if (picks.length > 0) picks[picks.length - 1] = forcedItem;
    }
  }
}


  // Attach descriptions
  for (const it of picks) {
    it.desc = describeRunUpgrade(player, it);
  }

  return picks;
}

function countActiveRunSkills(player) {
  const s = player?.runSkills || {};
  let n = 0;
  for (const def of (RUN_SKILLS || [])) {
    const k = String(def?.key || "");
    if (!k) continue;
    if (((s[k] | 0) || 0) > 0) n++;
  }
  return n;
}

function getRunUpgradeReplaceCandidates(player, newSkillKey) {
  initRunUpgrades(player);
  const s = player?.runSkills || {};
  const nk = String(newSkillKey || "");
  const out = [];
  for (const def of (RUN_SKILLS || [])) {
    const k = String(def?.key || "");
    if (!k || k === nk) continue;
    const lv = (s[k] | 0) || 0;
    if (lv > 0) out.push({ key: k, level: lv });
  }
  return out;
}

export function tryApplyRunUpgrade(player, upgrade, replaceKey = null) {
  if (!player || !upgrade) return { ok: false, reason: "invalid" };
  initRunUpgrades(player);

  if (upgrade.kind === "skill" && (upgrade.from | 0) <= 0) {
    const activeNow = countActiveRunSkills(player);
    if (activeNow >= MAX_RUN_ACTIVE_SKILLS) {
      const rk = String(replaceKey || "");
      if (!rk) return { ok: false, reason: "need_replace" };
      const cand = getRunUpgradeReplaceCandidates(player, upgrade.key);
      const okCand = cand.some((c) => c && String(c.key) === rk);
      if (!okCand) return { ok: false, reason: "bad_replace" };
      player.runSkills[rk] = 0;
    }
  }

  if (upgrade.kind === "evolution") {
    const def = EVOLUTION_DEF_BY_EVO_KEY[String(upgrade.key || "")];
    if (def) {
      player.runEvolutions = player.runEvolutions || {};
      player.runEvolutions[def.fusionFlag] = true;
      player.runSkills[def.fromKey] = 0;
      player.runSkills.bombs = 0;
      player.runSkills[def.resultKey] = Math.max(player.runSkills[def.resultKey] | 0, 1);
      player.attackCooldown = 0;
      if (def.cooldownResetKey) player[def.cooldownResetKey] = 0;
    }

    applyRunDerivedStats(player);
    return { ok: true };
  }

  if (upgrade.kind === "skill") {
    player.runSkills[upgrade.key] = (player.runSkills[upgrade.key] | 0) + 1;
  } else if (upgrade.kind === "passive") {
    player.runPassives[upgrade.key] = (player.runPassives[upgrade.key] | 0) + 1;
  }

  applyRunDerivedStats(player);
  return { ok: true };
}

export function applyRunUpgrade(player, upgrade, replaceKey = null) {
  tryApplyRunUpgrade(player, upgrade, replaceKey);
}

export function describeRunUpgrade(player, up) {
  if (!player || !up) return "";

  if (up.kind === "skill") {
    const rich = composeSkillUpgradeDescription(up.key, up.from, up.to);
    if (rich) return rich;
  }

  if (up.kind === "evolution") {
    const def = EVOLUTION_DEF_BY_EVO_KEY[String(up.key || "")];
    if (def) {
      return `Fuse ${def.fromName} (MAX) + Bombs (MAX) → ${def.resultName} (Lv1). Consumes both.`;
    }
    return "Evolution";
  }

  if (up.kind === "skill") {
    if (up.key === "bullets") {
      return `Lv ${up.from} → ${up.to}: +shot power / sometimes +extra shots`;
    }
    if (up.key === "bombs") {
      return up.from <= 0 ? "Unlock bombs (AoE)" : `Lv ${up.from} → ${up.to}: +damage / +AoE / faster`;
    }
    if (up.key === "rockets") {
      return up.from <= 0 ? "Rockets (via fusion)" : `Lv ${up.from} → ${up.to}: +damage / +AoE / faster`;
    }
    if (up.key === "energyBomb") {
      return up.from <= 0 ? "Energy Bomb (via fusion)" : `Lv ${up.from} → ${up.to}: +zap damage / +AoE / faster`;
    }
    if (up.key === "fireBomb") {
      return up.from <= 0 ? "Fire Bomb (via fusion)" : `Lv ${up.from} → ${up.to}: +burn / +AoE / faster`;
    }
    if (up.key === "iceBomb") {
      return up.from <= 0 ? "Ice Bomb (via fusion)" : `Lv ${up.from} → ${up.to}: +frost / +AoE / stronger slow`;
    }
    if (up.key === "laser") {
      return up.from <= 0 ? "Unlock solar beam" : `Lv ${up.from} → ${up.to}: +DPS / +range`;
    }
    if (up.key === "lightning") {
      return up.from <= 0 ? "Unlock electric chain" : `Lv ${up.from} → ${up.to}: +targets / +damage`;
    }
    if (up.key === "satellites") {
      return up.from <= 0 ? "Unlock frost orbit (2 icy shards around you)" : `Lv ${up.from} → ${up.to}: +count / +rotation speed / +damage`;
    }
    if (up.key === "energyBarrier") {
      return up.from <= 0 ? "Unlock shield ring (absorb + pulse)" : `Lv ${up.from} → ${up.to}: +shield absorb / +radius / +damage`;
    }
    if (up.key === "spirit") {
      return up.from <= 0 ? "Unlock shadow spirit (auto shots)" : `Lv ${up.from} → ${up.to}: +range / +atkspd / +dmg (extra spirits at 4 & 6)`;
    }
    if (up.key === "summon") {
      return up.from <= 0 ? "Unlock light wardens (taunt + soak)" : `Lv ${up.from} → ${up.to}: +HP / +DEF / faster respawn (extra tanks at 4 & 6)`;
    }
    if (up.key === "electricZone") {
      return up.from <= 0 ? "Unlock electric ring (AoE pulses)" : `Lv ${up.from} → ${up.to}: +radius / +damage`;
    }
    if (up.key === "fireball") {
      return up.from <= 0 ? "Unlock fireball (AoE + burn)" : `Lv ${up.from} → ${up.to}: +damage / +AoE / faster`;
    }
    if (up.key === "iceWall") {
      return up.from <= 0 ? "Unlock ice ball (AoE + slow)" : `Lv ${up.from} → ${up.to}: +damage / +AoE / stronger slow`;
    }
    if (up.key === "blackhole") {
      return up.from <= 0 ? "Unlock blackhole (pull + DoT)" : `Lv ${up.from} → ${up.to}: +radius / +pull / +damage`;
    }
    if (up.key === "lightHeal") {
      return up.from <= 0 ? "Unlock light heal (pulse heal)" : `Lv ${up.from} → ${up.to}: +heal / +radius / faster`;
    }
    if (up.key === "stormStrike") {
      return up.from <= 0 ? "Unlock storm strike (targeted lightning burst)" : `Lv ${up.from} → ${up.to}: +damage / +AoE / faster`;
    }
    if (up.key === "flameNova") {
      return up.from <= 0 ? "Unlock flame nova (close AoE + burn)" : `Lv ${up.from} → ${up.to}: +damage / +radius / burn`;
    }
    if (up.key === "iceShards") {
      return up.from <= 0 ? "Unlock glacial shards (spread volley)" : `Lv ${up.from} → ${up.to}: +shards / +damage / faster`;
    }
    if (up.key === "voidBurst") {
      return up.from <= 0 ? "Unlock void burst (curse blast)" : `Lv ${up.from} → ${up.to}: +damage / +radius / faster`;
    }
    if (up.key === "holyNova") {
      return up.from <= 0 ? "Unlock holy nova (AoE + heal)" : `Lv ${up.from} → ${up.to}: +damage / +heal / +radius`;
    }
    if (up.key === "shrapnelBurst") {
      return up.from <= 0 ? "Unlock shrapnel burst (close mecha blast)" : `Lv ${up.from} → ${up.to}: +damage / +radius / faster`;
    }
    if (up.key === "railVolley") {
      return up.from <= 0 ? "Unlock rail volley (heavy mecha burst)" : `Lv ${up.from} → ${up.to}: +damage / +AoE / faster`;
    }
    if (up.key === "arcSpark") {
      return up.from <= 0 ? "Unlock arc spark (chain burst)" : `Lv ${up.from} → ${up.to}: +damage / +chains / faster`;
    }
    if (up.key === "staticPulse") {
      return up.from <= 0 ? "Unlock static pulse (close electric shockwave)" : `Lv ${up.from} → ${up.to}: +damage / +radius / stronger slow`;
    }
    if (up.key === "meteorRain") {
      return up.from <= 0 ? "Unlock meteor rain (falling fire blasts)" : `Lv ${up.from} → ${up.to}: +damage / +meteors / faster`;
    }
    if (up.key === "magmaLance") {
      return up.from <= 0 ? "Unlock magma lance (heavy fire pierce)" : `Lv ${up.from} → ${up.to}: +damage / +burn / +AoE`;
    }
    if (up.key === "frostNova") {
      return up.from <= 0 ? "Unlock frost nova (close freeze pulse)" : `Lv ${up.from} → ${up.to}: +damage / +radius / stronger slow`;
    }
    if (up.key === "crystalSpear") {
      return up.from <= 0 ? "Unlock crystal spear (heavy ice strike)" : `Lv ${up.from} → ${up.to}: +damage / +frost / +AoE`;
    }
    if (up.key === "soulDrain") {
      return up.from <= 0 ? "Unlock soul drain (dark burst + self-heal)" : `Lv ${up.from} → ${up.to}: +damage / +heal / faster`;
    }
    if (up.key === "dreadRing") {
      return up.from <= 0 ? "Unlock dread ring (close curse wave)" : `Lv ${up.from} → ${up.to}: +damage / +radius / stronger curse`;
    }
    if (up.key === "prismRay") {
      return up.from <= 0 ? "Unlock prism ray (light burst + heal)" : `Lv ${up.from} → ${up.to}: +damage / +heal / +AoE`;
    }
    if (up.key === "sanctuary") {
      return up.from <= 0 ? "Unlock sanctuary (holy zone heal)" : `Lv ${up.from} → ${up.to}: +damage / +heal / +radius`;
    }
    return `Lv ${up.from} → ${up.to}`;
  }

  const k = up.key;
  if (k === "damage") return `+10% damage (stacking)`;
  if (k === "attackSpeed") return `+6% attack speed (stacking)`;
  if (k === "moveSpeed") return `+5% move speed (stacking)`;
  if (k === "hp") return `+12 Max HP (stacking)`;
  if (k === "hpRegen") return `+0.35 HP/s (stacking)`;
  if (k === "range") return `+6% range (stacking)`;
  if (k === "pickupRadius") return `+10 pickup radius (stacking)`;
  if (k === "xpGain") return `+6% XP gain (stacking)`;
  if (k === "critChance") return `+1.5% crit chance (stacking)`;
  if (k === "critDamage") return `+12% crit damage (stacking)`;
  if (k === "lifeSteal") return `+0.4% life steal (stacking)`;
  if (k === "affElectric") return `Electric Affinity: on-hit chance to zap a nearby enemy (stacking)`;
  if (k === "affFire") return `Fire Affinity: burning DoT on-hit (stacking)`;
  if (k === "affIce") return `Ice Affinity: frost mark → extra damage vs marked (stacking)`;
  if (k === "affLight") return `Light Affinity: heal a bit on kill (stacking)`;
  if (k === "affDark") return `Dark Affinity: curse mark → extra damage vs cursed (stacking)`;
  return `Lv ${up.from} → ${up.to}`;
}