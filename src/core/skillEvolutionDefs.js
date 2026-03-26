export const EVOLUTION_SKILL_KEYS = ["rockets", "energyBomb", "fireBomb", "iceBomb"];
export const EVOLUTION_STAGE_KEYS = ["rockets", "energyBomb", "fireBomb", "iceBomb"];

export const EVOLUTION_DEFS = [
  {
    evoKey: "rocketFusion",
    legacyFlagKey: "rocketFusion",
    stageKey: "rockets",
    resultKey: "rockets",
    name: "Evolve: Rockets",
    fromKey: "bullets",
    fromName: "Gun",
    resultName: "Rockets",
    cooldownResetKey: "rocketCooldown",
  },
  {
    evoKey: "energyBombFusion",
    legacyFlagKey: "energyBombFusion",
    stageKey: "energyBomb",
    resultKey: "energyBomb",
    name: "Evolve: Energy Bomb",
    fromKey: "lightning",
    fromName: "Electric Chain",
    resultName: "Energy Bomb",
    cooldownResetKey: "energyBombCooldown",
  },
  {
    evoKey: "fireBombFusion",
    legacyFlagKey: "fireBombFusion",
    stageKey: "fireBomb",
    resultKey: "fireBomb",
    name: "Evolve: Fire Bomb",
    fromKey: "fireball",
    fromName: "Fireball",
    resultName: "Fire Bomb",
    cooldownResetKey: "fireBombCooldown",
  },
  {
    evoKey: "iceBombFusion",
    legacyFlagKey: "iceBombFusion",
    stageKey: "iceBomb",
    resultKey: "iceBomb",
    name: "Evolve: Ice Bomb",
    fromKey: "iceWall",
    fromName: "Ice Ball",
    resultName: "Ice Bomb",
    cooldownResetKey: "iceBombCooldown",
  },
];

export function createEmptyRunSkillStages() {
  return {
    rockets: 0,
    energyBomb: 0,
    fireBomb: 0,
    iceBomb: 0,
  };
}

export function sanitizeRunSkillStages(raw) {
  const base = createEmptyRunSkillStages();
  const src = raw && typeof raw === 'object' ? raw : {};
  for (const key of EVOLUTION_STAGE_KEYS) base[key] = Math.max(0, (src[key] | 0) || 0);
  return base;
}

export const EVOLUTION_DEF_BY_ANY_KEY = Object.fromEntries(
  EVOLUTION_DEFS.flatMap((def) => [
    [def.resultKey, def],
    [def.stageKey, def],
    [def.evoKey, def],
    [def.legacyFlagKey, def],
  ])
);

export function getEvolutionDef(defOrKey) {
  if (!defOrKey) return null;
  if (typeof defOrKey === 'object') return defOrKey;
  return EVOLUTION_DEF_BY_ANY_KEY[String(defOrKey)] || null;
}

export function getEvolutionResultKey(defOrKey) {
  return getEvolutionDef(defOrKey)?.resultKey || '';
}

export function getEvolutionLegacyFlagKey(defOrKey) {
  return getEvolutionDef(defOrKey)?.legacyFlagKey || '';
}

export function getRunSkillStages(player) {
  const stages = sanitizeRunSkillStages(player?.runSkillStages || {});
  const evo = player?.runEvolutions || {};
  const skills = player?.runSkills || {};
  for (const def of EVOLUTION_DEFS) {
    if ((stages[def.stageKey] | 0) > 0) continue;
    if ((skills[def.resultKey] | 0) > 0 || evo?.[def.legacyFlagKey]) {
      stages[def.stageKey] = Math.max(1, stages[def.stageKey] | 0);
    }
  }
  return stages;
}

export function ensureSkillEvolutionState(player) {
  if (!player || typeof player !== 'object') return { stages: {}, evolutions: {} };
  player.runSkills = player.runSkills && typeof player.runSkills === 'object' ? player.runSkills : {};
  player.runSkillStages = sanitizeRunSkillStages(player.runSkillStages || {});
  player.runEvolutions = player.runEvolutions && typeof player.runEvolutions === 'object' ? player.runEvolutions : {};
  return syncEvolutionState(player);
}

export function syncEvolutionState(player) {
  if (!player || typeof player !== 'object') return { stages: {}, evolutions: {} };
  player.runSkillStages = sanitizeRunSkillStages(player.runSkillStages || {});
  player.runEvolutions = player.runEvolutions && typeof player.runEvolutions === 'object' ? player.runEvolutions : {};
  const stages = getRunSkillStages(player);
  for (const def of EVOLUTION_DEFS) {
    const unlocked = (stages[def.stageKey] | 0) > 0 || (player.runSkills?.[def.resultKey] | 0) > 0;
    if (!unlocked) continue;
    player.runSkillStages[def.stageKey] = Math.max(1, player.runSkillStages[def.stageKey] | 0);
    player.runEvolutions[def.legacyFlagKey] = true;
  }
  return { stages: player.runSkillStages, evolutions: player.runEvolutions };
}

export function getRunSkillStageLevel(player, defOrKey) {
  const def = getEvolutionDef(defOrKey);
  if (!def) return 0;
  const stages = getRunSkillStages(player);
  return Math.max(0, (stages?.[def.stageKey] | 0) || 0);
}

export function restoreEvolutionSnapshot(player, snapshot = null) {
  if (!player || typeof player !== 'object') return { stages: {}, evolutions: {} };
  const src = snapshot && typeof snapshot === 'object' ? snapshot : {};
  player.runSkillStages = sanitizeRunSkillStages(src.runSkillStages || player.runSkillStages || {});
  player.runEvolutions = src.runEvolutions && typeof src.runEvolutions === 'object' ? { ...src.runEvolutions } : (player.runEvolutions && typeof player.runEvolutions === 'object' ? { ...player.runEvolutions } : {});
  return syncEvolutionState(player);
}

export function isEvolutionUnlocked(player, defOrKey) {
  const def = getEvolutionDef(defOrKey);
  if (!def) return false;
  const stages = getRunSkillStages(player);
  return !!((stages?.[def.stageKey] | 0) > 0 || ((player?.runSkills?.[def.resultKey] | 0) > 0));
}

export function hasSkillOrEvolution(player, key) {
  const def = getEvolutionDef(key);
  if (def) return isEvolutionUnlocked(player, def) || ((player?.runSkills?.[def.resultKey] | 0) > 0);
  return ((player?.runSkills?.[String(key || '')] | 0) > 0);
}

export function hasAnyBombEvolution(player) {
  return EVOLUTION_DEFS.some((def) => isEvolutionUnlocked(player, def));
}

export function shouldHideBaseSkillAfterEvolution(player, skillKey) {
  const key = String(skillKey || '');
  if (!key) return false;
  if (hasAnyBombEvolution(player) && key === 'bombs') return true;
  return EVOLUTION_DEFS.some((def) => isEvolutionUnlocked(player, def) && def.fromKey === key);
}

export function getEvolutionResultForBaseSkill(player, skillKey) {
  const key = String(skillKey || '');
  const def = EVOLUTION_DEFS.find((it) => it.fromKey === key && isEvolutionUnlocked(player, it));
  return def?.resultKey || key;
}

export function applyEvolutionUnlock(player, defOrKey, options = {}) {
  const def = getEvolutionDef(defOrKey);
  if (!player || !def) return false;
  const { consumeBase = true, grantLevel = 1 } = options;
  syncEvolutionState(player);
  player.runSkillStages[def.stageKey] = Math.max(grantLevel | 0, player.runSkillStages[def.stageKey] | 0, 1);
  player.runEvolutions[def.legacyFlagKey] = true;
  player.runSkills = player.runSkills && typeof player.runSkills === 'object' ? player.runSkills : {};
  if (consumeBase) {
    player.runSkills[def.fromKey] = 0;
    player.runSkills.bombs = 0;
  }
  player.runSkills[def.resultKey] = Math.max(grantLevel | 0, player.runSkills[def.resultKey] | 0, 1);
  if (def.cooldownResetKey) player[def.cooldownResetKey] = 0;
  return true;
}
