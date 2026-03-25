import { AFFINITY_KEYS, DAMAGE_TYPE_KEYS, PASSIVE_KEYS } from '../hub/hubShared.js';
import { ensureCardCollectionState, getCardDefById, getOwnedCardState, normalizeCardIdArray } from './cardDefs.js';
import { getHeroBiomeMeta } from '../heroBiomes.js';
import { getHeroBiomeMasteryBonuses, ensureHeroBiomeMastery } from '../heroBiomeMastery.js';

export const HERO_COMBAT_PROFILE_VERSION = 2;

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? (n | 0) : fallback;
}

function normalizeRaceKey(rawRace) {
  const key = String(rawRace || '').trim().toLowerCase();
  if (!key || key === 'neutral' || key === 'station' || key === 'space' || key === 'hub') return 'mecha';
  return DAMAGE_TYPE_KEYS.includes(key) ? key : 'mecha';
}

function clampTier(value) {
  return Math.max(1, Math.min(6, toInt(value, 1)));
}

export function getCardCombatTier(cardState, cardDef = null) {
  const def = cardDef || getCardDefById(cardState?.cardId || '');
  if (!def || !cardState) return 1;
  const level = Math.max(1, toInt(cardState.level, 1));
  const bonusStars = Math.max(0, toInt(cardState.currentStars, def.baseStars || 1) - Math.max(1, toInt(def.baseStars, 1)));
  const tierFromLevels = Math.floor((Math.max(1, level) - 1) / 5);
  return clampTier(1 + tierFromLevels + bonusStars);
}

function makeBlankCombatProfile(hero = null) {
  const race = normalizeRaceKey(hero?.race || hero?.legacyBridge?.selectedStarterLoadout || 'mecha');
  const biome = getHeroBiomeMeta(race);
  return {
    version: HERO_COMBAT_PROFILE_VERSION,
    heroId: String(hero?.heroId || '').trim(),
    race,
    biomeKey: biome.key,
    biomeLabel: biome.label,
    biomeStrengths: Array.isArray(biome.strengths) ? [...biome.strengths] : [],
    biomeWeaknesses: Array.isArray(biome.weaknesses) ? [...biome.weaknesses] : [],
    skillTiers: {},
    passiveTiers: {},
    passiveBonuses: {},
    affinityBonuses: {},
    damageTypes: {},
    summary: {
      equippedSkillCards: 0,
      equippedPassiveCards: 0,
      totalCardPower: 0,
      sameRaceCards: 0,
      starBonusTotal: 0,
      masteryLevel: 1,
      masteryXp: 0,
    },
  };
}

function addPassiveBonus(out, key, amount) {
  if (!PASSIVE_KEYS.includes(String(key || ''))) return;
  const next = Math.max(0, toInt(out[key], 0) + Math.max(0, toInt(amount, 0)));
  if (next > 0) out[key] = next;
}

function addAffinityBonus(out, race, amount) {
  const raceKey = normalizeRaceKey(race);
  const map = {
    electric: 'affElectric',
    fire: 'affFire',
    ice: 'affIce',
    light: 'affLight',
    dark: 'affDark',
  };
  const affKey = map[raceKey] || '';
  if (!affKey || !AFFINITY_KEYS.includes(affKey)) return;
  const next = Math.max(0, toInt(out[affKey], 0) + Math.max(0, toInt(amount, 0)));
  if (next > 0) out[affKey] = next;
}

function addDamageTypeBonus(out, race, amount) {
  const raceKey = normalizeRaceKey(race);
  if (!DAMAGE_TYPE_KEYS.includes(raceKey)) return;
  const delta = Number(amount || 0);
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.0001) return;
  const next = Number(out[raceKey] || 0) + delta;
  if (Math.abs(next) < 0.0001) delete out[raceKey];
  else out[raceKey] = Math.round(next * 1000) / 1000;
}

function addAffinityKeyBonus(out, key, amount) {
  const affKey = String(key || '').trim();
  if (!AFFINITY_KEYS.includes(affKey)) return;
  const next = Math.max(0, toInt(out[affKey], 0) + Math.max(0, toInt(amount, 0)));
  if (next > 0) out[affKey] = next;
}

export function buildHeroCombatProfile(hero, collection) {
  const profile = makeBlankCombatProfile(hero);
  const normalized = ensureCardCollectionState(collection);
  const heroRace = profile.race;

  const skillIds = normalizeCardIdArray(hero?.equippedSkillCards, 'skill');
  const passiveIds = normalizeCardIdArray(hero?.equippedPassiveCards, 'passive');

  let sameRaceCards = 0;
  let starBonusTotal = 0;
  let totalCardPower = 0;

  for (const cardId of skillIds) {
    const state = getOwnedCardState(normalized, cardId);
    const def = getCardDefById(cardId);
    if (!state || !def || def.kind !== 'skill') continue;
    const tier = getCardCombatTier(state, def);
    const bonusStars = Math.max(0, toInt(state.currentStars, def.baseStars || 1) - Math.max(1, toInt(def.baseStars, 1)));
    const sameRace = normalizeRaceKey(def.race) === heroRace;

    profile.skillTiers[def.sourceKey] = Math.max(toInt(profile.skillTiers[def.sourceKey], 0), tier);
    profile.summary.equippedSkillCards += 1;
    totalCardPower += tier;
    starBonusTotal += bonusStars;
    if (sameRace) sameRaceCards += 1;

    addDamageTypeBonus(profile.damageTypes, def.race, 0.03 * tier + 0.04 * bonusStars + (sameRace ? 0.06 : 0));
    if (tier >= 4) addPassiveBonus(profile.passiveBonuses, 'damage', 1);
    if (bonusStars > 0) addPassiveBonus(profile.passiveBonuses, 'attackSpeed', Math.min(2, bonusStars));
  }

  for (const cardId of passiveIds) {
    const state = getOwnedCardState(normalized, cardId);
    const def = getCardDefById(cardId);
    if (!state || !def || def.kind !== 'passive') continue;
    const tier = getCardCombatTier(state, def);
    const bonusStars = Math.max(0, toInt(state.currentStars, def.baseStars || 1) - Math.max(1, toInt(def.baseStars, 1)));
    const sameRace = normalizeRaceKey(def.race) === heroRace;

    profile.passiveTiers[def.sourceKey] = Math.max(toInt(profile.passiveTiers[def.sourceKey], 0), tier);
    profile.summary.equippedPassiveCards += 1;
    totalCardPower += tier;
    starBonusTotal += bonusStars;
    if (sameRace) sameRaceCards += 1;

    addDamageTypeBonus(profile.damageTypes, def.race, 0.02 * tier + 0.03 * bonusStars + (sameRace ? 0.04 : 0));
  }

  addPassiveBonus(profile.passiveBonuses, 'damage', Math.floor(totalCardPower / 8));
  addPassiveBonus(profile.passiveBonuses, 'attackSpeed', Math.floor(starBonusTotal / 2));
  addPassiveBonus(profile.passiveBonuses, 'range', Math.floor(sameRaceCards / 3));
  addPassiveBonus(profile.passiveBonuses, 'hpRegen', Math.floor(sameRaceCards / 4));
  addPassiveBonus(profile.passiveBonuses, 'critChance', Math.floor(starBonusTotal / 4));

  if (heroRace !== 'mecha') {
    addAffinityBonus(profile.affinityBonuses, heroRace, Math.min(3, Math.floor(sameRaceCards / 2)));
  } else {
    addDamageTypeBonus(profile.damageTypes, 'mecha', 0.05 * sameRaceCards);
  }
  addDamageTypeBonus(profile.damageTypes, heroRace, 0.05 * sameRaceCards);

  const biomeMeta = getHeroBiomeMeta(heroRace);
  for (const [key, bonus] of Object.entries(biomeMeta?.combatBonuses?.passiveBonuses || {})) addPassiveBonus(profile.passiveBonuses, key, bonus);
  for (const [key, bonus] of Object.entries(biomeMeta?.combatBonuses?.affinityBonuses || {})) addAffinityKeyBonus(profile.affinityBonuses, key, bonus);
  for (const [key, bonus] of Object.entries(biomeMeta?.combatBonuses?.damageTypes || {})) addDamageTypeBonus(profile.damageTypes, key, bonus);

  const masteryState = ensureHeroBiomeMastery(hero?.biomeMastery, heroRace);
  const masteryBonuses = getHeroBiomeMasteryBonuses(masteryState, heroRace);
  for (const [key, bonus] of Object.entries(masteryBonuses?.passiveBonuses || {})) addPassiveBonus(profile.passiveBonuses, key, bonus);
  for (const [key, bonus] of Object.entries(masteryBonuses?.affinityBonuses || {})) addAffinityKeyBonus(profile.affinityBonuses, key, bonus);
  for (const [key, bonus] of Object.entries(masteryBonuses?.damageTypes || {})) addDamageTypeBonus(profile.damageTypes, key, bonus);

  profile.summary.sameRaceCards = sameRaceCards;
  profile.summary.starBonusTotal = starBonusTotal;
  profile.summary.totalCardPower = totalCardPower;
  profile.summary.masteryLevel = Math.max(1, toInt(masteryState?.level, 1));
  profile.summary.masteryXp = Math.max(0, toInt(masteryState?.xp, 0));
  profile.mastery = masteryState;
  profile.masteryLines = Array.isArray(masteryBonuses?.summaryLines) ? [...masteryBonuses.summaryLines] : [];
  return profile;
}
