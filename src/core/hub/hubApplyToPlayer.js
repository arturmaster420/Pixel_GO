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
import { getEquippedHubGearKeys, getHubGearAggregateEffects } from "./hubGear.js";

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

  const nextSkills = player.runSkills && typeof player.runSkills === "object" ? player.runSkills : {};
  for (const key of ACTIVE_SKILL_KEYS) nextSkills[key] = 0;
  player.runSkills = nextSkills;

  const nextPassives = player.runPassives && typeof player.runPassives === "object" ? player.runPassives : {};
  for (const key of PASSIVE_KEYS) nextPassives[key] = 0;
  for (const key of AFFINITY_KEYS) nextPassives[key] = 0;
  player.runPassives = nextPassives;

  applyStarterLoadoutToPlayer(player, coreKey);

  for (const [key, level] of Object.entries(prog.hubBuild.skills || {})) {
    if (!ACTIVE_SKILL_KEYS.includes(key) || key === coreDef.skillKey) continue;
    player.runSkills[key] = Math.max(0, clampInt(level, 0, getOwnedSkillCap(prog, key)));
  }
  for (const [key, level] of Object.entries(prog.hubBuild.passives || {})) {
    if (!PASSIVE_KEYS.includes(key)) continue;
    player.runPassives[key] = Math.max(0, clampInt(level, 0, getOwnedPassiveCap(prog, key)));
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

  applyRunDerivedStats(player);
  const typeMults = player.runDamageTypeMults && typeof player.runDamageTypeMults === "object" ? player.runDamageTypeMults : (player.runDamageTypeMults = {});
  for (const type of DAMAGE_TYPE_KEYS) {
    const bonus = Number(gearEffects.damageTypes?.[type] || 0);
    if (!Number.isFinite(bonus) || bonus <= 0) continue;
    typeMults[type] = Math.max(0.1, Number(typeMults[type] || 1) + bonus);
  }

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
