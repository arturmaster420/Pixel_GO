import { applyRunDerivedStats, initRunUpgrades } from "../runUpgrades.js";
import { restoreEvolutionSnapshot } from "../skillEvolutionDefs.js";
import { applyStarterLoadoutToPlayer, getStarterLoadoutDef, normalizeStarterLoadoutKey } from "../starterLoadouts.js";
import { ACTIVE_SKILL_KEYS, AFFINITY_KEYS, DAMAGE_TYPE_KEYS, PASSIVE_KEYS, clampInt } from "./hubShared.js";
import {
  ensureHubProgression,
  getHubBuildAvailableSp,
  getHubBuildSpentPoints,
  getHubCoreKey,
  getOwnedPassiveCap,
  getOwnedSkillCap,
  sanitizePassives,
  sanitizeSkills,
} from "./hubBuildState.js";
import { getEquippedHubGearKeys, getHubGearAggregateEffects, getHubGearSlotUsage } from "./hubGear.js";
import { getCanonicalHeroRuntimeProfile } from "../skillRuntimeState.js";

function cloneJsonSafe(value, fallback = null) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

export function applyProgressionSpToPlayer(player, prog) {
  if (!player || !prog) return 0;
  ensureHubProgression(prog);
  const available = getHubBuildAvailableSp(prog);
  player.skillPoints = Math.max(0, available | 0);
  return player.skillPoints;
}

export function bankPlayerSpToProgression(player, prog) {
  if (!player || !prog) return 0;
  ensureHubProgression(prog);
  const available = Math.max(0, (player.skillPoints | 0) || 0);
  prog.sp = Math.max(0, getHubBuildSpentPoints(prog) + available);
  return prog.sp;
}

export function applyHubBuildToPlayer(player, prog) {
  if (!player || !prog) return null;
  ensureHubProgression(prog);
  initRunUpgrades(player);

  const coreKey = getHubCoreKey(prog);
  const coreDef = getStarterLoadoutDef(coreKey);
  const baseHeroCombatProfile = prog?.heroCombatProfile && typeof prog.heroCombatProfile === "object" ? cloneJsonSafe(prog.heroCombatProfile, null) : null;
  const explicitHeroRuntime = prog?.activeHeroRuntime && typeof prog.activeHeroRuntime === "object"
    ? getCanonicalHeroRuntimeProfile(prog.activeHeroRuntime, coreKey)
    : null;
  const hasExplicitRuntimeProjection = !!(
    explicitHeroRuntime
    || (baseHeroCombatProfile && (
      Array.isArray(baseHeroCombatProfile.runtimeSkillKeys)
      || Array.isArray(baseHeroCombatProfile.runtimePassiveKeys)
      || typeof baseHeroCombatProfile.coreSkillEquipped === 'boolean'
    ))
  );
  const heroRuntime = explicitHeroRuntime || (baseHeroCombatProfile ? getCanonicalHeroRuntimeProfile(baseHeroCombatProfile, coreKey) : null);
  const heroCombatProfile = baseHeroCombatProfile || (heroRuntime ? {
    heroId: String(prog?.activeHeroId || ''),
    race: String(prog?.activeHeroRace || coreKey),
    summary: cloneJsonSafe(prog?.heroCombatSummary || {}, {}),
  } : null);
  if (heroCombatProfile && heroRuntime) {
    heroCombatProfile.coreSkillKey = String(heroRuntime.coreSkillKey || heroCombatProfile.coreSkillKey || coreDef?.skillKey || '');
    heroCombatProfile.coreSkillEquipped = heroRuntime.coreSkillEquipped !== false;
    heroCombatProfile.runtimeSkillKeys = [...heroRuntime.runtimeSkillKeys];
    heroCombatProfile.runtimePassiveKeys = [...heroRuntime.runtimePassiveKeys];
    heroCombatProfile.skillTiers = { ...(heroCombatProfile.skillTiers && typeof heroCombatProfile.skillTiers === 'object' ? heroCombatProfile.skillTiers : {}), ...heroRuntime.skillTiers };
    heroCombatProfile.passiveTiers = { ...(heroCombatProfile.passiveTiers && typeof heroCombatProfile.passiveTiers === 'object' ? heroCombatProfile.passiveTiers : {}), ...heroRuntime.passiveTiers };
    if (prog?.heroCombatSummary && typeof prog.heroCombatSummary === 'object') {
      heroCombatProfile.summary = { ...(heroCombatProfile.summary && typeof heroCombatProfile.summary === 'object' ? heroCombatProfile.summary : {}), ...cloneJsonSafe(prog.heroCombatSummary, {}) };
    }
  }
  const useHeroCardRuntime = !!heroRuntime && hasExplicitRuntimeProjection;

  const nextSkills = player.runSkills && typeof player.runSkills === "object" ? player.runSkills : {};
  for (const key of ACTIVE_SKILL_KEYS) nextSkills[key] = 0;
  player.runSkills = nextSkills;

  const nextPassives = player.runPassives && typeof player.runPassives === "object" ? player.runPassives : {};
  for (const key of PASSIVE_KEYS) nextPassives[key] = 0;
  for (const key of AFFINITY_KEYS) nextPassives[key] = 0;
  player.runPassives = nextPassives;

  applyStarterLoadoutToPlayer(player, coreKey, { grantSkill: !useHeroCardRuntime });

  if (useHeroCardRuntime && heroRuntime) {
    for (const key of heroRuntime.runtimeSkillKeys) {
      if (!ACTIVE_SKILL_KEYS.includes(key)) continue;
      if (key === heroRuntime.coreSkillKey) continue;
      player.runSkills[key] = Math.max(0, clampInt(heroRuntime.skillTiers?.[key] || 0, 0, 6));
    }
    for (const key of heroRuntime.runtimePassiveKeys) {
      if (!PASSIVE_KEYS.includes(key)) continue;
      player.runPassives[key] = Math.max(0, clampInt(heroRuntime.passiveTiers?.[key] || 0, 0, 6));
    }
  } else {
    for (const [key, level] of Object.entries(prog.hubBuild.skills || {})) {
      if (!ACTIVE_SKILL_KEYS.includes(key) || key === coreDef.skillKey) continue;
      player.runSkills[key] = Math.max(0, clampInt(level, 0, getOwnedSkillCap(prog, key)));
    }
    for (const [key, level] of Object.entries(prog.hubBuild.passives || {})) {
      if (!PASSIVE_KEYS.includes(key)) continue;
      player.runPassives[key] = Math.max(0, clampInt(level, 0, getOwnedPassiveCap(prog, key)));
    }
  }

  const corePassiveBonuses = coreDef?.passiveBonuses && typeof coreDef.passiveBonuses === "object" ? coreDef.passiveBonuses : {};
  for (const [key, bonus] of Object.entries(corePassiveBonuses)) {
    if (!PASSIVE_KEYS.includes(key)) continue;
    player.runPassives[key] = Math.max(0, (player.runPassives[key] | 0) + Math.max(0, clampInt(bonus, 0, 999)));
  }

  const gearEffects = getHubGearAggregateEffects(prog);
  for (const [key, bonus] of Object.entries(gearEffects.passives || {})) {
    if (!PASSIVE_KEYS.includes(key)) continue;
    player.runPassives[key] = Math.max(0, (player.runPassives[key] | 0) + Math.max(0, clampInt(bonus, 0, 999)));
  }

  player.runSkillStages = player.runSkillStages && typeof player.runSkillStages === "object" ? player.runSkillStages : {};
  for (const evoStageKey of Object.keys(player.runSkillStages)) delete player.runSkillStages[evoStageKey];
  player.runEvolutions = player.runEvolutions && typeof player.runEvolutions === "object" ? player.runEvolutions : {};
  for (const evoKey of Object.keys(player.runEvolutions)) delete player.runEvolutions[evoKey];
  restoreEvolutionSnapshot(player);

  if (heroCombatProfile) {
    const resolvedCoreSkillKey = String(heroRuntime?.coreSkillKey || coreDef?.skillKey || '').trim();
    const coreTier = Math.max(0, clampInt((heroRuntime?.skillTiers?.[resolvedCoreSkillKey] || heroCombatProfile?.skillTiers?.[resolvedCoreSkillKey] || 0), 0, 6));
    const coreEnabled = heroRuntime ? (heroRuntime.coreSkillEquipped !== false) : (heroCombatProfile?.coreSkillEquipped !== false);
    if (resolvedCoreSkillKey && coreEnabled && coreTier > 0) player.runSkills[resolvedCoreSkillKey] = Math.max(player.runSkills[resolvedCoreSkillKey] | 0, coreTier);
    for (const [key, bonus] of Object.entries(heroCombatProfile.passiveBonuses || {})) {
      if (!PASSIVE_KEYS.includes(key)) continue;
      player.runPassives[key] = Math.max(0, (player.runPassives[key] | 0) + Math.max(0, clampInt(bonus, 0, 999)));
    }
    for (const [key, bonus] of Object.entries(heroCombatProfile.affinityBonuses || {})) {
      if (!AFFINITY_KEYS.includes(key)) continue;
      player.runPassives[key] = Math.max(0, (player.runPassives[key] | 0) + Math.max(0, clampInt(bonus, 0, 999)));
    }
  }

  applyRunDerivedStats(player);
  const typeMults = {};
  player.runDamageTypeMults = typeMults;
  for (const type of DAMAGE_TYPE_KEYS) {
    typeMults[type] = 1;
    const gearBonus = Number(gearEffects.damageTypes?.[type] || 0);
    if (Number.isFinite(gearBonus) && gearBonus > 0) typeMults[type] = Math.max(0.1, Number(typeMults[type] || 1) + gearBonus);
    const cardBonus = Number(heroCombatProfile?.damageTypes?.[type] || 0);
    if (Number.isFinite(cardBonus) && Math.abs(cardBonus) > 0.0001) typeMults[type] = Math.max(0.1, Number(typeMults[type] || 1) + cardBonus);
  }
  player._heroCombatProfile = heroCombatProfile ? {
    heroId: String(heroCombatProfile.heroId || ''),
    race: String(heroCombatProfile.race || coreKey),
    summary: heroCombatProfile.summary && typeof heroCombatProfile.summary === 'object' ? { ...heroCombatProfile.summary } : {},
    biomeLabel: String(heroCombatProfile.biomeLabel || ''),
    mastery: heroCombatProfile.mastery && typeof heroCombatProfile.mastery === 'object' ? { ...heroCombatProfile.mastery } : null,
    biomeStrengths: Array.isArray(heroCombatProfile.biomeStrengths) ? [...heroCombatProfile.biomeStrengths] : [],
    biomeWeaknesses: Array.isArray(heroCombatProfile.biomeWeaknesses) ? [...heroCombatProfile.biomeWeaknesses] : [],
    coreSkillEquipped: heroRuntime ? (heroRuntime.coreSkillEquipped !== false) : (heroCombatProfile?.coreSkillEquipped !== false),
    runtimeSkillKeys: heroRuntime ? [...heroRuntime.runtimeSkillKeys] : [],
    runtimePassiveKeys: heroRuntime ? [...heroRuntime.runtimePassiveKeys] : [],
    skillTiers: heroRuntime ? { ...heroRuntime.skillTiers } : { ...(heroCombatProfile.skillTiers && typeof heroCombatProfile.skillTiers === 'object' ? heroCombatProfile.skillTiers : {}) },
    passiveTiers: heroRuntime ? { ...heroRuntime.passiveTiers } : { ...(heroCombatProfile.passiveTiers && typeof heroCombatProfile.passiveTiers === 'object' ? heroCombatProfile.passiveTiers : {}) },
  } : null;
  player.activeHeroId = String(prog?.activeHeroId || player.activeHeroId || heroCombatProfile?.heroId || '').trim() || 'hero_1';
  player.activeHeroName = String(prog?.activeHeroName || prog?.nickname || player.activeHeroName || player.nickname || 'Hero').trim().slice(0, 24) || 'Hero';
  player.activeHeroRace = String(prog?.activeHeroRace || prog?.selectedStarterLoadout || coreKey || player.activeHeroRace || 'mecha').trim() || 'mecha';
  player._heroLoadoutSummary = (prog?.activeHeroLoadoutSummary && typeof prog.activeHeroLoadoutSummary === 'object')
    ? cloneJsonSafe(prog.activeHeroLoadoutSummary, null)
    : (player._heroLoadoutSummary || null);
  player._heroCombatSummary = (prog?.heroCombatSummary && typeof prog.heroCombatSummary === 'object')
    ? cloneJsonSafe(prog.heroCombatSummary, null)
    : (heroCombatProfile?.summary && typeof heroCombatProfile.summary === 'object' ? { ...heroCombatProfile.summary } : null);
  const gearSlotUsage = getHubGearSlotUsage(prog);
  player._heroModuleCount = Math.max(0, Number(gearSlotUsage?.module || 0) | 0);
  player._heroGearSummary = {
    moduleCount: player._heroModuleCount,
    relicEquipped: Math.max(0, Number(gearSlotUsage?.relic || 0) | 0),
    coreItemEquipped: Math.max(0, Number(gearSlotUsage?.coreItem || 0) | 0),
    equippedGearKeys: getEquippedHubGearKeys(prog),
  };

  player.hp = Math.min(Math.max(1, Number(player.hp) || 1), Math.max(1, Number(player.maxHP) || 1));
  return {
    coreKey,
    coreDef,
    availableSp: applyProgressionSpToPlayer(player, prog),
    equippedGearKeys: getEquippedHubGearKeys(prog),
    gearEffects,
  };
}

export function importPlayerSnapshotIntoHubBuild(prog, snapshot) {
  ensureHubProgression(prog);
  if (!snapshot || typeof snapshot !== "object") return false;

  const nextCoreKey = normalizeStarterLoadoutKey(snapshot.selectedStarterLoadout || prog.hubBuild.coreKey || prog.selectedStarterLoadout || "mecha");
  prog.hubBuild.coreKey = nextCoreKey;
  prog.selectedStarterLoadout = nextCoreKey;

  const coreSkillKey = getStarterLoadoutDef(nextCoreKey).skillKey;
  const runSkills = snapshot.runSkills && typeof snapshot.runSkills === "object" ? snapshot.runSkills : {};
  const runPassives = snapshot.runPassives && typeof snapshot.runPassives === "object" ? snapshot.runPassives : {};

  if (!prog.skillMeta || typeof prog.skillMeta !== "object") prog.skillMeta = {};

  for (const key of ACTIVE_SKILL_KEYS) {
    if (!key || key === coreSkillKey) continue;
    const lv = Math.max(0, clampInt(runSkills[key], 0, 99));
    if (lv <= 0) continue;
    const metaKey = `skill:${key}`;
    prog.skillMeta[metaKey] = Math.max(getOwnedSkillCap(prog, key), lv);
  }
  for (const key of PASSIVE_KEYS) {
    const lv = Math.max(0, clampInt(runPassives[key], 0, 99));
    if (lv <= 0) continue;
    const metaKey = `passive:${key}`;
    prog.skillMeta[metaKey] = Math.max(getOwnedPassiveCap(prog, key), lv);
  }

  prog.hubBuild.skills = sanitizeSkills(runSkills, prog, coreSkillKey);
  prog.hubBuild.passives = sanitizePassives(runPassives, prog);
  return true;
}
