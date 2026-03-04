// Run-time (in-run) upgrade system inspired by Magic Survival.
// - Meta upgrades (R-Tier / Stats) remain unchanged and are applied between runs.
// - During a run, each level grants a choice of upgrades (skills or passives).

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
  { key: "satellites", name: "Satellites", kind: "skill" },
  { key: "energyBarrier", name: "Energy Barrier", kind: "skill" },
  { key: "spirit", name: "Spirit", kind: "skill" },
  { key: "summon", name: "Summon Tanks", kind: "skill" },
  { key: "electricZone", name: "Electric Zone", kind: "skill" },
  // Advanced skills unlock a bit later (prevents early "take everything" power spike).
  { key: "laser", name: "Laser", kind: "skill" },
  { key: "lightning", name: "Chain Lightning", kind: "skill" },
  // Rockets are obtained via evolution (fusion), not directly.
  { key: "rockets", name: "Rockets", kind: "skill" },
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
    // Satellites are in the pool by default (meta unlock), but not granted at run start.
    satellites: (s.satellites ?? 0) | 0,
    energyBarrier: (s.energyBarrier ?? 0) | 0,
    spirit: (s.spirit ?? 0) | 0,
    summon: (s.summon ?? 0) | 0,
    electricZone: (s.electricZone ?? 0) | 0,
    laser: (s.laser ?? 0) | 0,
    lightning: (s.lightning ?? 0) | 0,
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
  };

  // Snapshot of "maxHP after meta" at run start.
  if (!Number.isFinite(player._runBaseMaxHP)) {
    player._runBaseMaxHP = Number.isFinite(player.maxHP) ? player.maxHP : (player.baseMaxHP || 100);
  }

  // Derived cached multipliers (used by updateBuffs and combat helpers)
  applyRunDerivedStats(player);
}

export function applyRunDerivedStats(player) {
  if (!player) return;

  const p = player.runPassives || {};

  // Multipliers are intentionally modest (tuned to reduce snowball / upgrade spam).
  player.runDamageMult = 1 + (p.damage || 0) * 0.08;
  player.runAttackMult = 1 + (p.attackSpeed || 0) * 0.05;
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
const MAX_SKILL_LEVEL = {
  bullets: 6,
  bombs: 6,
  rockets: 6,
  satellites: 6,
  energyBarrier: 6,
  spirit: 6,
  summon: 6,
  electricZone: 6,
  laser: 6,
  lightning: 6,
};
const evo = player.runEvolutions || {};

const attackKeys = ["bullets", "bombs", "satellites", "energyBarrier", "spirit", "summon", "electricZone", "laser", "lightning", "rockets"];
const activeAttackSkills = attackKeys.reduce((acc, k) => acc + (((skills[k] || 0) > 0) ? 1 : 0), 0);

// Evolution: Bullets MAX + Bombs MAX => Rockets
const canFuseRockets =
  !evo.rocketFusion &&
  (skills.bullets | 0) >= (MAX_SKILL_LEVEL.bullets || 6) &&
  (skills.bombs | 0) >= (MAX_SKILL_LEVEL.bombs || 6) &&
  (skills.rockets | 0) <= 0;

if (canFuseRockets) {
  // Put evolution into the skill pool with very high weight so it appears immediately.
  skillItems.push({
    id: "evo:rocketFusion",
    kind: "evolution",
    key: "rocketFusion",
    name: "Fuse → Rockets",
    from: "MAX",
    to: "Rockets",
    weight: 999,
  });
}

for (const s of RUN_SKILLS) {
  const metaId = `skill:${s.key}`;
  const metaLvl = getMetaLevelForUpgrade(player, metaId);
  // Shop gating: locked skills (metaLvl<=0) do not appear in run upgrade pool (except base bullets).
  if (s.key !== "bullets" && metaLvl <= 0) continue;
  // After fusion, we don't offer the consumed components again.
  if (evo.rocketFusion && (s.key === "bullets" || s.key === "bombs")) continue;

  // Gate advanced skills to avoid early "grab all attacks" snowball.
  if (s.key === "laser" && runLevel < 6) continue;
  if (s.key === "lightning" && runLevel < 8) continue;

  const lvl = skills[s.key] | 0;

  // Rockets: only appear after evolution has happened (or already owned).
  if (s.key === "rockets" && lvl <= 0 && !evo.rocketFusion) continue;

  const maxLvl = MAX_SKILL_LEVEL[s.key] || 9999;
  if (lvl >= maxLvl) continue;

  const isBase = s.key === "bullets";

  let w;
  if (isBase) {
    w = 1.0;
  } else if (lvl <= 0) {
    // Unlock weights: bombs are meant to appear early, laser/lightning a bit less.
    w = (s.key === "bombs") ? 9.0 : 6.0;
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

  const hasAnyExtraSkill =
    (skills.bombs || 0) > 0 ||
    (skills.satellites || 0) > 0 ||
    (skills.energyBarrier || 0) > 0 ||
    (skills.spirit || 0) > 0 ||
    (skills.electricZone || 0) > 0 ||
    (skills.laser || 0) > 0 ||
    (skills.lightning || 0) > 0 ||
    (skills.rockets || 0) > 0;

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

export function applyRunUpgrade(player, upgrade) {
  if (!player || !upgrade) return;
  initRunUpgrades(player);

  if (upgrade.kind === "evolution") {
    if (upgrade.key === "rocketFusion") {
      player.runEvolutions = player.runEvolutions || {};
      player.runEvolutions.rocketFusion = true;

      // Consume components and grant rockets.
      player.runSkills.bullets = 0;
      player.runSkills.bombs = 0;

      // Start rockets at level 1. The evolved rockets are tuned to be strong enough
      // to replace both MAX components, so the transition feels meaningful.
      player.runSkills.rockets = Math.max(player.runSkills.rockets | 0, 1);

      // Make it feel immediate.
      player.attackCooldown = 0;
      player.rocketCooldown = 0;
    }

    applyRunDerivedStats(player);
    return;
  }

  if (upgrade.kind === "skill") {
    player.runSkills[upgrade.key] = (player.runSkills[upgrade.key] | 0) + 1;
  } else if (upgrade.kind === "passive") {
    player.runPassives[upgrade.key] = (player.runPassives[upgrade.key] | 0) + 1;
  }

  applyRunDerivedStats(player);
}

export function describeRunUpgrade(player, up) {
  if (!player || !up) return "";

  if (up.kind === "evolution") {
    if (up.key === "rocketFusion") {
      return "Fuse Gun (MAX) + Bombs (MAX) → Rockets (Lv1). Consumes both.";
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
    if (up.key === "laser") {
      return up.from <= 0 ? "Unlock laser beam" : `Lv ${up.from} → ${up.to}: +DPS / +range`;
    }
    if (up.key === "lightning") {
      return up.from <= 0 ? "Unlock chain lightning" : `Lv ${up.from} → ${up.to}: +targets / +damage`;
    }
    if (up.key === "satellites") {
      return up.from <= 0 ? "Orbiting satellites (contact damage)" : `Lv ${up.from} → ${up.to}: +count / +damage`;
    }
    if (up.key === "energyBarrier") {
      return up.from <= 0 ? "Energy barrier (repel + pulse)" : `Lv ${up.from} → ${up.to}: +radius / +damage`;
    }
    if (up.key === "spirit") {
      return up.from <= 0 ? "Spirit flames (auto gun shots)" : `Lv ${up.from} → ${up.to}: +range / +atkspd / +dmg (extra spirits at 4 & 6)`;
    }
    if (up.key === "summon") {
      return up.from <= 0 ? "Summon tanks (taunt + soak)" : `Lv ${up.from} → ${up.to}: +HP / +DEF / faster respawn (extra tanks at 4 & 6)`;
    }
    if (up.key === "electricZone") {
      return up.from <= 0 ? "Electric zone (AoE pulses)" : `Lv ${up.from} → ${up.to}: +radius / +damage`;
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
  return `Lv ${up.from} → ${up.to}`;
}