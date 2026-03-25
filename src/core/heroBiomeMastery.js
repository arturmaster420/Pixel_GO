import { getHeroBiomeMeta, normalizeHeroBiomeKey } from './heroBiomes.js';

export const HERO_BIOME_MASTERY_VERSION = 1;
export const HERO_BIOME_MASTERY_MAX_LEVEL = 10;

const LEVEL_XP = [0, 40, 100, 180, 290, 430, 610, 840, 1130, 1490];

function toInt(value, fallback = 0) {
  const n = Math.floor(Number(value) || 0);
  return Number.isFinite(n) ? n : fallback;
}

export function getHeroBiomeMasteryThreshold(level = 1) {
  const idx = Math.max(1, Math.min(HERO_BIOME_MASTERY_MAX_LEVEL, toInt(level, 1))) - 1;
  return LEVEL_XP[idx] || 0;
}

export function getHeroBiomeMasteryLevelForXp(totalXp = 0) {
  const xp = Math.max(0, toInt(totalXp, 0));
  let level = 1;
  for (let i = 0; i < LEVEL_XP.length; i += 1) {
    if (xp >= LEVEL_XP[i]) level = i + 1;
  }
  return Math.max(1, Math.min(HERO_BIOME_MASTERY_MAX_LEVEL, level));
}

export function ensureHeroBiomeMastery(rawMastery = null, rawBiome = 'mecha') {
  const biome = normalizeHeroBiomeKey(rawBiome || rawMastery?.biome || 'mecha');
  const totalXp = Math.max(0, toInt(rawMastery?.xp ?? rawMastery?.totalXp, 0));
  const level = getHeroBiomeMasteryLevelForXp(totalXp);
  const nextLevel = Math.min(HERO_BIOME_MASTERY_MAX_LEVEL, level + 1);
  const levelBaseXp = getHeroBiomeMasteryThreshold(level);
  const nextLevelXp = level >= HERO_BIOME_MASTERY_MAX_LEVEL ? levelBaseXp : getHeroBiomeMasteryThreshold(nextLevel);
  const xpIntoLevel = Math.max(0, totalXp - levelBaseXp);
  const xpForNext = Math.max(0, nextLevelXp - levelBaseXp);
  return {
    version: HERO_BIOME_MASTERY_VERSION,
    biome,
    xp: totalXp,
    level,
    xpIntoLevel,
    xpForNext,
    nextLevel,
    capped: level >= HERO_BIOME_MASTERY_MAX_LEVEL,
  };
}

export function grantHeroBiomeMasteryXp(rawMastery = null, rawBiome = 'mecha', amount = 0) {
  const current = ensureHeroBiomeMastery(rawMastery, rawBiome);
  const gain = Math.max(0, toInt(amount, 0));
  const next = ensureHeroBiomeMastery({ ...current, xp: current.xp + gain }, current.biome);
  return {
    ...next,
    gainedXp: gain,
    levelUps: Math.max(0, next.level - current.level),
    previousLevel: current.level,
  };
}

export function getHeroBiomeMasteryXpAward(opts = {}) {
  const source = String(opts?.source || 'room').trim().toLowerCase();
  const sameBiomeEncounter = !!opts?.sameBiomeEncounter;
  const floorNumber = Math.max(1, toInt(opts?.floorNumber, 1));
  const base = source === 'boss' ? 18 : (source === 'elite' ? 7 : 3);
  const floorBonus = source === 'boss'
    ? Math.min(10, Math.floor(floorNumber / 2))
    : (source === 'elite' ? Math.min(6, Math.floor(floorNumber / 3)) : Math.min(4, Math.floor(floorNumber / 4)));
  const matchBonus = sameBiomeEncounter ? (source === 'boss' ? 8 : (source === 'elite' ? 4 : 2)) : 0;
  return Math.max(0, base + floorBonus + matchBonus);
}

export function getHeroBiomeMasteryBonuses(rawMastery = null, rawBiome = 'mecha') {
  const mastery = ensureHeroBiomeMastery(rawMastery, rawBiome);
  const biome = mastery.biome;
  const level = mastery.level;
  const passiveBonuses = {};
  const affinityBonuses = {};
  const damageTypes = {};
  const addPassive = (key, amount) => { if ((amount | 0) > 0) passiveBonuses[key] = Math.max(0, (passiveBonuses[key] | 0) + (amount | 0)); };
  const addAffinity = (key, amount) => { if ((amount | 0) > 0) affinityBonuses[key] = Math.max(0, (affinityBonuses[key] | 0) + (amount | 0)); };
  const addDamage = (key, amount) => {
    const delta = Number(amount || 0);
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.0001) return;
    const next = Number(damageTypes[key] || 0) + delta;
    if (Math.abs(next) > 0.0001) damageTypes[key] = Math.round(next * 1000) / 1000;
  };

  const lane = Math.max(0, Math.floor(level / 2));
  const focus = Math.max(0, Math.floor((level + 1) / 3));
  const capstone = level >= 8 ? 1 : 0;

  switch (biome) {
    case 'electric':
      addPassive('attackSpeed', lane);
      addPassive('moveSpeed', Math.max(0, lane - 1) + capstone);
      addAffinity('affElectric', focus);
      addDamage('electric', 0.02 * level);
      addDamage('fire', -0.006 * Math.max(0, level - 1));
      break;
    case 'fire':
      addPassive('damage', lane);
      addPassive('critDamage', Math.max(0, lane - 1) + capstone);
      addAffinity('affFire', focus);
      addDamage('fire', 0.022 * level);
      addDamage('ice', -0.008 * Math.max(0, level - 1));
      break;
    case 'ice':
      addPassive('hp', lane);
      addPassive('hpRegen', Math.max(0, lane - 1) + capstone);
      addAffinity('affIce', focus);
      addDamage('ice', 0.018 * level);
      addDamage('fire', -0.008 * Math.max(0, level - 1));
      break;
    case 'dark':
      addPassive('critChance', lane);
      addPassive('lifeSteal', Math.max(0, lane - 1) + capstone);
      addAffinity('affDark', focus);
      addDamage('dark', 0.021 * level);
      addDamage('light', -0.01 * Math.max(0, level - 1));
      break;
    case 'light':
      addPassive('hpRegen', lane);
      addPassive('hp', Math.max(0, lane - 1) + capstone);
      addAffinity('affLight', focus);
      addDamage('light', 0.018 * level);
      addDamage('dark', -0.01 * Math.max(0, level - 1));
      break;
    case 'mecha':
    default:
      addPassive('attackSpeed', lane);
      addPassive('moveSpeed', Math.max(0, lane - 1) + capstone);
      addPassive('range', Math.floor(level / 4));
      addDamage('mecha', 0.017 * level);
      addDamage('light', -0.004 * Math.max(0, level - 2));
      addDamage('dark', -0.004 * Math.max(0, level - 2));
      break;
  }

  return {
    mastery,
    passiveBonuses,
    affinityBonuses,
    damageTypes,
    summaryLines: [
      `${getHeroBiomeMeta(biome).label} mastery Lv ${level}`,
      mastery.capped ? 'Mastery capped for this stage.' : `XP ${mastery.xpIntoLevel}/${mastery.xpForNext || 0} toward Lv ${mastery.nextLevel}`,
    ],
  };
}
