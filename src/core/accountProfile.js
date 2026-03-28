import {
  BIOME_ESSENCE_KEYS,
  defaultEssences,
  defaultGearInventory,
  defaultGearParts,
  defaultHubBuild,
  defaultHubGear,
  defaultMaterials,
} from "./hub/hubShared.js";
import { normalizeStarterLoadoutKey } from "./starterLoadouts.js";
import { HERO_BIOME_KEYS, HERO_BIOME_META, getHeroBiomeMeta, normalizeHeroBiomeKey } from "./heroBiomes.js";
import { ensureHeroBiomeMastery, grantHeroBiomeMasteryXp as grantHeroBiomeMasteryXpState, getHeroBiomeMasteryBonuses } from "./heroBiomeMastery.js";
import { CARD_COLLECTION_VERSION, createEmptyCardCollection, ensureCardCollectionState, ensureCardOwnership, getCardDefById, getCardIdForPassive, getCardIdForSkill, getOwnedCardState, getStarterCardIdForRace, getStarterPassiveCardIdForRace, listOwnedCardEntries, normalizeCardIdArray, seedCardCollection } from "./cards/cardDefs.js";
import { buildHeroCombatProfile } from "./cards/cardCombatProjection.js";
import { getCanonicalHeroRuntimeProfile } from "./skillRuntimeState.js";

export const ACCOUNT_PROFILE_VERSION = 1;
export const HERO_PROFILE_VERSION = 2;
export const MAX_HERO_SLOTS = 10;
export const HERO_RACE_KEYS = [...HERO_BIOME_KEYS];
export const HERO_SKILL_CARD_SLOT_LIMIT = 6;
export const HERO_PASSIVE_CARD_SLOT_LIMIT = 6;
export const HERO_LOADOUT_PRESET_LIMIT = 3;

export const HERO_RACE_META = HERO_BIOME_META;

function cloneJsonSafe(value, fallback = null) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

const HERO_PROJECTION_CACHE = new WeakMap();

function buildCompactHeroCardEntry(collection, cardId) {
  const id = String(cardId || '').trim();
  if (!id) return null;
  const def = getCardDefById(id);
  const state = getOwnedCardState(collection, id);
  if (!def || !state || Math.max(0, Number(state.copiesOwned || 0) | 0) <= 0) return null;
  return {
    id,
    key: String(def.sourceKey || ''),
    kind: String(def.kind || ''),
    race: String(def.race || 'mecha'),
    lv: Math.max(1, Number(state.level || 1) | 0),
    st: Math.max(1, Number(state.currentStars || def.baseStars || 1) | 0),
  };
}

function buildHeroProjectionSignature(hero, collection) {
  const heroId = String(hero?.heroId || '').trim();
  const race = normalizeHeroRaceKey(hero?.race || hero?.legacyBridge?.selectedStarterLoadout || 'mecha');
  const mastery = ensureHeroBiomeMastery(hero?.biomeMastery, race);
  const parts = [heroId, race, String(Math.max(1, Number(mastery?.level || 1) | 0)), String(Math.max(0, Number(mastery?.xp || 0) | 0))];
  const pushCards = (ids, kind) => {
    for (const rawId of normalizeCardIdArray(ids, kind)) {
      const id = String(rawId || '').trim();
      const def = getCardDefById(id);
      const state = getOwnedCardState(collection, id);
      parts.push(id);
      parts.push(String(Math.max(1, Number(state?.level || 1) | 0)));
      parts.push(String(Math.max(1, Number(state?.currentStars || def?.baseStars || 1) | 0)));
    }
  };
  pushCards(hero?.equippedSkillCards, 'skill');
  parts.push('|');
  pushCards(hero?.equippedPassiveCards, 'passive');
  return parts.join(':');
}

function buildHeroLoadoutSummaryPayload(hero, combatProfile, collection) {
  const skills = [];
  const passives = [];
  for (const cardId of normalizeCardIdArray(hero?.equippedSkillCards, 'skill')) {
    const entry = buildCompactHeroCardEntry(collection, cardId);
    if (entry) skills.push(entry);
  }
  for (const cardId of normalizeCardIdArray(hero?.equippedPassiveCards, 'passive')) {
    const entry = buildCompactHeroCardEntry(collection, cardId);
    if (entry) passives.push(entry);
  }
  const totals = combatProfile?.summary && typeof combatProfile.summary === 'object' ? combatProfile.summary : {};
  return {
    version: 1,
    heroId: String(hero?.heroId || '').trim(),
    name: sanitizeHeroName(hero?.name, 'Hero'),
    race: normalizeHeroRaceKey(hero?.race || 'mecha'),
    skills,
    passives,
    totals: {
      skillCount: skills.length,
      passiveCount: passives.length,
      totalCardPower: Math.max(0, Number(totals.totalCardPower || 0) | 0),
      sameRaceCards: Math.max(0, Number(totals.sameRaceCards || 0) | 0),
      starBonusTotal: Math.max(0, Number(totals.starBonusTotal || 0) | 0),
      masteryLevel: Math.max(1, Number(totals.masteryLevel || 1) | 0),
    },
  };
}

function buildHeroProjectionState(prog, hero) {
  const collection = ensureCardCollectionState(prog?.accountProfile?.cardCollection);
  prog.accountProfile.cardCollection = collection;
  const race = normalizeHeroRaceKey(hero?.race || hero?.legacyBridge?.selectedStarterLoadout || 'mecha');
  hero.race = race;
  hero.biomeMastery = ensureHeroBiomeMastery(hero.biomeMastery, race);
  hero.equippedSkillCards = normalizeCardIdArray(Array.isArray(hero?.equippedSkillCards) ? hero.equippedSkillCards : [], 'skill').slice(0, HERO_SKILL_CARD_SLOT_LIMIT);
  hero.equippedPassiveCards = normalizeCardIdArray(Array.isArray(hero?.equippedPassiveCards) ? hero.equippedPassiveCards : [], 'passive').slice(0, HERO_PASSIVE_CARD_SLOT_LIMIT);
  for (const cardId of hero.equippedSkillCards) ensureCardOwnership(collection, cardId, 1);
  for (const cardId of hero.equippedPassiveCards) ensureCardOwnership(collection, cardId, 1);

  const signature = buildHeroProjectionSignature(hero, collection);
  const cached = HERO_PROJECTION_CACHE.get(hero);
  if (cached?.signature === signature) return cached;

  const baseBridge = hero.legacyBridge && typeof hero.legacyBridge === 'object' ? hero.legacyBridge : {};
  const baseSkillMeta = cloneJsonSafe(baseBridge.skillMeta || {}, {});
  const nextSkillMeta = {};
  for (const [metaKey, raw] of Object.entries(baseSkillMeta)) {
    const amount = Math.max(0, Math.min(99, Math.floor(Number(raw || 0) || 0)));
    if (amount > 0) nextSkillMeta[metaKey] = amount;
  }
  for (const state of Object.values(collection.cards || {})) {
    if (!state || Math.max(0, Math.floor(Number(state.copiesOwned || 0) || 0)) <= 0) continue;
    const def = getCardDefById(state.cardId);
    if (!def) continue;
    if (def.kind === 'skill') setLevelMeta(nextSkillMeta, def.sourceKey, state.level, 'skill');
    else if (def.kind === 'passive') setLevelMeta(nextSkillMeta, def.sourceKey, state.level, 'passive');
  }

  const combatProfile = buildHeroCombatProfile(hero, collection);
  const starterSkillCardId = getStarterCardIdForRace(race);
  const coreSkillKey = String(getCardDefById(starterSkillCardId)?.sourceKey || '');
  const nextHubBuild = defaultHubBuild(race);
  nextHubBuild.coreKey = race;
  const runtimeSkillKeys = [];
  const runtimePassiveKeys = [];
  let coreSkillEquipped = false;

  for (const cardId of hero.equippedSkillCards) {
    const state = getOwnedCardState(collection, cardId);
    const def = getCardDefById(cardId);
    if (!state || !def || def.kind !== 'skill') continue;
    const level = Math.max(1, Math.min(99, Math.floor(Number(state.level || 1) || 1)));
    const combatTier = Math.max(1, Math.min(6, Math.floor(Number(combatProfile?.skillTiers?.[def.sourceKey] || 1) || 1)));
    setLevelMeta(nextSkillMeta, def.sourceKey, level, 'skill');
    if (def.sourceKey) runtimeSkillKeys.push(def.sourceKey);
    if (def.sourceKey && def.sourceKey === coreSkillKey) {
      coreSkillEquipped = true;
      continue;
    }
    if (def.sourceKey && Object.keys(nextHubBuild.skills).length < HERO_SKILL_CARD_SLOT_LIMIT) nextHubBuild.skills[def.sourceKey] = combatTier;
  }

  for (const cardId of hero.equippedPassiveCards) {
    const state = getOwnedCardState(collection, cardId);
    const def = getCardDefById(cardId);
    if (!state || !def || def.kind !== 'passive') continue;
    const level = Math.max(1, Math.min(99, Math.floor(Number(state.level || 1) || 1)));
    const combatTier = Math.max(1, Math.min(6, Math.floor(Number(combatProfile?.passiveTiers?.[def.sourceKey] || 1) || 1)));
    setLevelMeta(nextSkillMeta, def.sourceKey, level, 'passive');
    runtimePassiveKeys.push(def.sourceKey);
    nextHubBuild.passives[def.sourceKey] = combatTier;
  }

  combatProfile.coreSkillKey = coreSkillKey;
  combatProfile.coreSkillEquipped = !!coreSkillEquipped;
  combatProfile.runtimeSkillKeys = runtimeSkillKeys;
  combatProfile.runtimePassiveKeys = runtimePassiveKeys;
  const runtime = getCanonicalHeroRuntimeProfile(combatProfile, race);
  const heroCombatSummary = combatProfile?.summary && typeof combatProfile.summary === 'object'
    ? {
        totalCardPower: Math.max(0, Number(combatProfile.summary.totalCardPower || 0) | 0),
        sameRaceCards: Math.max(0, Number(combatProfile.summary.sameRaceCards || 0) | 0),
        starBonusTotal: Math.max(0, Number(combatProfile.summary.starBonusTotal || 0) | 0),
        equippedSkillCards: Math.max(0, Number(combatProfile.summary.equippedSkillCards || 0) | 0),
        equippedPassiveCards: Math.max(0, Number(combatProfile.summary.equippedPassiveCards || 0) | 0),
        masteryLevel: Math.max(1, Number(combatProfile.summary.masteryLevel || 1) | 0),
      }
    : null;
  const projection = {
    signature,
    race,
    nextSkillMeta,
    nextHubBuild,
    combatProfile: cloneJsonSafe(combatProfile, null),
    runtime: cloneJsonSafe(runtime, null),
    heroCombatSummary: cloneJsonSafe(heroCombatSummary, null),
    loadoutSummary: buildHeroLoadoutSummaryPayload(hero, combatProfile, collection),
  };
  HERO_PROJECTION_CACHE.set(hero, projection);
  return projection;
}

function refreshProgressionHeroProjection(prog, hero, bridge = null) {
  if (!prog || !hero) return null;
  const resolvedBridge = bridge && typeof bridge === 'object' ? bridge : projectHeroLoadoutToLegacyBridge(prog, hero);
  const projection = buildHeroProjectionState(prog, hero);
  prog.activeHeroId = String(hero.heroId || prog.activeHeroId || '').trim() || 'hero_1';
  prog.activeHeroName = sanitizeHeroName(hero.name, prog?.nickname || 'Hero');
  prog.activeHeroRace = normalizeHeroRaceKey(hero.race || resolvedBridge?.selectedStarterLoadout || prog?.selectedStarterLoadout || 'mecha');
  prog.selectedStarterLoadout = prog.activeHeroRace;
  prog.activeHeroLoadoutSummary = cloneJsonSafe(projection.loadoutSummary, null);
  prog.activeHeroRuntime = cloneJsonSafe(projection.runtime, null);
  prog.heroCombatProfile = cloneJsonSafe(resolvedBridge?.heroCombatProfile || projection.combatProfile, null);
  prog.heroCombatSummary = cloneJsonSafe(projection.heroCombatSummary, null);
  return projection;
}

function sanitizeHeroName(rawName, fallback = "Hero") {
  const text = typeof rawName === "string" ? rawName.trim() : "";
  return (text || fallback).slice(0, 24);
}

function normalizeHeroId(rawId, fallback = "hero_1") {
  const text = typeof rawId === "string" ? rawId.trim() : "";
  return text || fallback;
}

function createDefaultLoadoutPreset(race = "mecha", slot = 0, opts = {}) {
  const heroRace = normalizeHeroRaceKey(race);
  return {
    slot: Math.max(0, Math.min(HERO_LOADOUT_PRESET_LIMIT - 1, Number(slot || 0) | 0)),
    name: sanitizeHeroName(opts?.name, `${getHeroRaceMeta(heroRace).short} Preset ${Math.max(1, (Number(slot || 0) | 0) + 1)}`),
    race: heroRace,
    biomeLocked: true,
    equippedSkillCards: normalizeCardIdArray(Array.isArray(opts?.equippedSkillCards) && opts.equippedSkillCards.length ? opts.equippedSkillCards : [getStarterCardIdForRace(heroRace)], "skill"),
    equippedPassiveCards: normalizeCardIdArray(Array.isArray(opts?.equippedPassiveCards) && opts.equippedPassiveCards.length ? opts.equippedPassiveCards : [getStarterPassiveCardIdForRace(heroRace)], "passive"),
    updatedAt: Math.max(0, Number(opts?.updatedAt || 0) || 0),
  };
}

function sanitizeLoadoutPresets(rawPresets, race = "mecha") {
  const heroRace = normalizeHeroRaceKey(race);
  const list = Array.isArray(rawPresets) ? rawPresets : [];
  const out = [];
  for (let i = 0; i < HERO_LOADOUT_PRESET_LIMIT; i += 1) {
    const src = list[i] && typeof list[i] === "object" ? list[i] : {};
    out.push(createDefaultLoadoutPreset(src.race || heroRace, i, src));
  }
  return out;
}

export function normalizeHeroRaceKey(rawRace) {
  return normalizeHeroBiomeKey(rawRace || "mecha");
}

export function getHeroRaceMeta(rawRace) {
  return getHeroBiomeMeta(rawRace);
}

export function defaultRaceDust() {
  const out = {};
  for (const key of BIOME_ESSENCE_KEYS) out[key] = 0;
  return out;
}

export function defaultCardCollection() {
  return createEmptyCardCollection();
}

export function defaultSharedResources() {
  return {
    coins: 0,
    diamonds: 0,
    sp: 0,
    materials: defaultMaterials(),
    essences: defaultEssences(),
    gearParts: defaultGearParts(),
    gearInventory: defaultGearInventory(),
    raceDust: defaultRaceDust(),
  };
}

export function createHeroProfile({ heroId = "hero_1", name = "Hero 1", race = "mecha", legacyBridge = null } = {}) {
  const heroRace = normalizeHeroRaceKey(race);
  const bridge = legacyBridge && typeof legacyBridge === "object" ? legacyBridge : {};
  const bridgeStarter = heroRace;
  return {
    heroVersion: HERO_PROFILE_VERSION,
    heroId: normalizeHeroId(heroId, "hero_1"),
    name: sanitizeHeroName(name, "Hero 1"),
    race: heroRace,
    biomeLocked: true,
    biomeMastery: ensureHeroBiomeMastery(bridge.biomeMastery || null, heroRace),
    equippedSkillCards: normalizeCardIdArray(Array.isArray(bridge.equippedSkillCards) ? bridge.equippedSkillCards : [getStarterCardIdForRace(heroRace)], "skill"),
    equippedPassiveCards: normalizeCardIdArray(Array.isArray(bridge.equippedPassiveCards) ? bridge.equippedPassiveCards : [getStarterPassiveCardIdForRace(heroRace)], "passive"),
    loadoutPresets: sanitizeLoadoutPresets(bridge.loadoutPresets, heroRace),
    gearLoadout: cloneJsonSafe(bridge.gearLoadout || bridge.hubGear || defaultHubGear(), defaultHubGear()),
    heroExpeditionState: cloneJsonSafe(bridge.heroExpeditionState || { hasCheckpoint: false, resumeFloor: 0, lastBiomeKey: "" }, { hasCheckpoint: false, resumeFloor: 0, lastBiomeKey: "" }),
    legacyBridge: {
      selectedStarterLoadout: bridgeStarter,
      hubBuild: (() => { const nextHubBuild = cloneJsonSafe(bridge.hubBuild || defaultHubBuild(bridgeStarter), defaultHubBuild(bridgeStarter)); nextHubBuild.coreKey = bridgeStarter; return nextHubBuild; })(),
      hubGear: cloneJsonSafe(bridge.hubGear || defaultHubGear(), defaultHubGear()),
      skillMeta: cloneJsonSafe(bridge.skillMeta || {}, {}),
      heroCombatProfile: cloneJsonSafe(bridge.heroCombatProfile || null, null),
    },
  };
}

export function defaultAccountProfile() {
  return {
    version: ACCOUNT_PROFILE_VERSION,
    accountId: "local_profile_1",
    maxHeroSlots: MAX_HERO_SLOTS,
    heroOrder: ["hero_1"],
    sharedResources: defaultSharedResources(),
    cardCollection: defaultCardCollection(),
  };
}

export function createInitialHeroFromLegacyProgression(prog, heroId = "hero_1") {
  const fallbackRace = normalizeHeroRaceKey(prog?.hubBuild?.coreKey || prog?.selectedStarterLoadout || "mecha");
  return createHeroProfile({
    heroId,
    name: sanitizeHeroName(prog?.nickname || "Hero 1", "Hero 1"),
    race: fallbackRace,
    legacyBridge: {
      selectedStarterLoadout: fallbackRace,
      hubBuild: cloneJsonSafe(prog?.hubBuild || defaultHubBuild(fallbackRace), defaultHubBuild(fallbackRace)),
      hubGear: cloneJsonSafe(prog?.hubGear || defaultHubGear(), defaultHubGear()),
      skillMeta: cloneJsonSafe(prog?.skillMeta || {}, {}),
      gearLoadout: cloneJsonSafe(prog?.hubGear || defaultHubGear(), defaultHubGear()),
      heroExpeditionState: { hasCheckpoint: false, resumeFloor: 0, lastBiomeKey: "" },
    },
  });
}

function sanitizeSharedResources(src) {
  const base = defaultSharedResources();
  const data = src && typeof src === "object" ? src : {};
  return {
    coins: Math.max(0, Math.floor(Number(data.coins || 0) || 0)),
    diamonds: Math.max(0, Math.floor(Number(data.diamonds || 0) || 0)),
    sp: Math.max(0, Math.floor(Number(data.sp || 0) || 0)),
    materials: cloneJsonSafe(data.materials || base.materials, base.materials),
    essences: cloneJsonSafe(data.essences || base.essences, base.essences),
    gearParts: cloneJsonSafe(data.gearParts || base.gearParts, base.gearParts),
    gearInventory: cloneJsonSafe(data.gearInventory || base.gearInventory, base.gearInventory),
    raceDust: cloneJsonSafe(data.raceDust || base.raceDust, base.raceDust),
  };
}

function sanitizeCardCollection(src) {
  const base = defaultCardCollection();
  const data = src && typeof src === "object" ? src : base;
  const next = ensureCardCollectionState(data);
  seedCardCollection(next, { includeSkills: true, includePassives: false, copies: 1, level: 1, currentStars: 1 });
  return next;
}

function sanitizeHeroExpeditionState(src) {
  const data = src && typeof src === 'object' ? src : {};
  return {
    hasCheckpoint: !!data.hasCheckpoint,
    resumeFloor: Math.max(0, (Number(data.resumeFloor || 0) | 0) || 0),
    lastBiomeKey: String(data.lastBiomeKey || ''),
    savedAt: Math.max(0, Number(data.savedAt || 0) || 0),
    checkpointVersion: Math.max(0, (Number(data.checkpointVersion || 0) | 0) || 0),
  };
}

function sanitizeHeroProfile(rawHero, fallbackId = "hero_1", fallbackRace = "mecha") {
  const src = rawHero && typeof rawHero === "object" ? rawHero : {};
  const race = normalizeHeroRaceKey(src.race || src.legacyBridge?.selectedStarterLoadout || fallbackRace);
  const migratedSkillCards = Array.isArray(src.equippedSkillCards)
    ? src.equippedSkillCards
    : (Array.isArray(src?.legacyBridge?.equippedSkillCards)
      ? src.legacyBridge.equippedSkillCards
      : deriveSkillCardIdsFromHeroBridge(src));
  const migratedPassiveCards = Array.isArray(src.equippedPassiveCards)
    ? src.equippedPassiveCards
    : (Array.isArray(src?.legacyBridge?.equippedPassiveCards)
      ? src.legacyBridge.equippedPassiveCards
      : derivePassiveCardIdsFromHeroBridge(src));
  return createHeroProfile({
    heroId: normalizeHeroId(src.heroId, fallbackId),
    name: sanitizeHeroName(src.name, `Hero ${String(fallbackId).replace(/\D+/g, "") || "1"}`),
    race,
    legacyBridge: {
      biomeMastery: ensureHeroBiomeMastery(src.biomeMastery || src.legacyBridge?.biomeMastery || null, race),
      selectedStarterLoadout: normalizeStarterLoadoutKey(src.legacyBridge?.selectedStarterLoadout || race),
      hubBuild: cloneJsonSafe(src.legacyBridge?.hubBuild || src.hubBuild || defaultHubBuild(race), defaultHubBuild(race)),
      hubGear: cloneJsonSafe(src.legacyBridge?.hubGear || src.gearLoadout || defaultHubGear(), defaultHubGear()),
      skillMeta: cloneJsonSafe(src.legacyBridge?.skillMeta || {}, {}),
      heroCombatProfile: cloneJsonSafe(src.legacyBridge?.heroCombatProfile || null, null),
      equippedSkillCards: migratedSkillCards,
      equippedPassiveCards: migratedPassiveCards,
      loadoutPresets: sanitizeLoadoutPresets(src.loadoutPresets, race),
      gearLoadout: cloneJsonSafe(src.gearLoadout || src.legacyBridge?.hubGear || defaultHubGear(), defaultHubGear()),
      heroExpeditionState: sanitizeHeroExpeditionState(src.heroExpeditionState),
    },
  });
}

export function ensureAccountProgression(prog) {
  if (!prog || typeof prog !== "object") return prog;

  const accountSrc = prog.accountProfile && typeof prog.accountProfile === "object" ? prog.accountProfile : {};
  const account = {
    version: ACCOUNT_PROFILE_VERSION,
    accountId: typeof accountSrc.accountId === "string" && accountSrc.accountId.trim() ? accountSrc.accountId.trim() : "local_profile_1",
    maxHeroSlots: Math.max(1, Math.min(MAX_HERO_SLOTS, Number(accountSrc.maxHeroSlots || MAX_HERO_SLOTS) | 0 || MAX_HERO_SLOTS)),
    heroOrder: Array.isArray(accountSrc.heroOrder) ? accountSrc.heroOrder.map((id) => String(id || "").trim()).filter(Boolean) : [],
    sharedResources: sanitizeSharedResources(accountSrc.sharedResources),
    cardCollection: sanitizeCardCollection(accountSrc.cardCollection),
  };

  const heroesSrc = Array.isArray(prog.heroes) ? prog.heroes : [];
  const heroes = [];
  const seenIds = new Set();
  for (let i = 0; i < heroesSrc.length; i += 1) {
    const hero = sanitizeHeroProfile(heroesSrc[i], `hero_${i + 1}`, prog?.selectedStarterLoadout || "mecha");
    if (seenIds.has(hero.heroId)) continue;
    seenIds.add(hero.heroId);
    heroes.push(hero);
  }

  if (!heroes.length) {
    const initialHero = createInitialHeroFromLegacyProgression(prog, "hero_1");
    heroes.push(initialHero);
    seenIds.add(initialHero.heroId);
  }

  account.heroOrder = account.heroOrder.filter((id) => seenIds.has(id));
  for (const hero of heroes) {
    if (!account.heroOrder.includes(hero.heroId)) account.heroOrder.push(hero.heroId);
  }

  let activeHeroId = typeof prog.activeHeroId === "string" && prog.activeHeroId.trim() ? prog.activeHeroId.trim() : "";
  if (!seenIds.has(activeHeroId)) activeHeroId = account.heroOrder[0] || heroes[0]?.heroId || "hero_1";

  prog.accountProfile = account;
  prog.heroes = heroes;
  prog.activeHeroId = activeHeroId;
  ensureAllHeroCardFoundations(prog);
  for (const hero of Array.isArray(prog.heroes) ? prog.heroes : []) hero.biomeMastery = ensureHeroBiomeMastery(hero.biomeMastery, hero.race || 'mecha');
  return prog;
}

export function getActiveHero(prog) {
  if (!prog || !Array.isArray(prog.heroes) || !prog.heroes.length) return null;
  const id = typeof prog.activeHeroId === "string" ? prog.activeHeroId : "";
  return prog.heroes.find((hero) => hero?.heroId === id) || prog.heroes[0] || null;
}

export function getHeroById(prog, heroId) {
  if (!prog || !Array.isArray(prog.heroes) || !prog.heroes.length) return null;
  const id = String(heroId || '').trim();
  if (!id) return null;
  return prog.heroes.find((hero) => hero?.heroId === id) || null;
}

export function getHeroCount(prog) {
  return Array.isArray(prog?.heroes) ? prog.heroes.length : 0;
}

function deriveSkillCardIdsFromHeroBridge(hero) {
  const out = [];
  const seen = new Set();
  const race = normalizeHeroRaceKey(hero?.race || hero?.legacyBridge?.selectedStarterLoadout || 'mecha');
  const push = (cardId) => {
    const id = String(cardId || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  const legacyProfile = hero?.legacyBridge?.heroCombatProfile;
  const includeStarter = legacyProfile && typeof legacyProfile === 'object'
    ? legacyProfile.coreSkillEquipped !== false
    : true;
  if (includeStarter) push(getStarterCardIdForRace(race));
  const skillKeys = hero?.legacyBridge?.hubBuild?.skills && typeof hero.legacyBridge.hubBuild.skills === 'object' ? hero.legacyBridge.hubBuild.skills : {};
  for (const [skillKey, rawLevel] of Object.entries(skillKeys)) {
    if ((rawLevel | 0) <= 0) continue;
    push(getCardIdForSkill(skillKey));
  }
  return normalizeCardIdArray(out, 'skill').slice(0, HERO_SKILL_CARD_SLOT_LIMIT);
}

function derivePassiveCardIdsFromHeroBridge(hero) {
  const out = [];
  const seen = new Set();
  const race = normalizeHeroRaceKey(hero?.race || hero?.legacyBridge?.selectedStarterLoadout || 'mecha');
  const push = (cardId) => {
    const id = String(cardId || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  push(getStarterPassiveCardIdForRace(race));
  const passiveKeys = hero?.legacyBridge?.hubBuild?.passives && typeof hero.legacyBridge.hubBuild.passives === 'object' ? hero.legacyBridge.hubBuild.passives : {};
  for (const [passiveKey, rawLevel] of Object.entries(passiveKeys)) {
    if ((rawLevel | 0) <= 0) continue;
    push(getCardIdForPassive(passiveKey));
  }
  return normalizeCardIdArray(out, 'passive').slice(0, HERO_PASSIVE_CARD_SLOT_LIMIT);
}

function mergeHeroCardIds(currentIds, derivedIds, kind = '') {
  const out = [];
  const seen = new Set();
  const pushMany = (items) => {
    for (const raw of Array.isArray(items) ? items : []) {
      const ids = normalizeCardIdArray([raw], kind);
      const id = ids[0];
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  };
  pushMany(currentIds);
  pushMany(derivedIds);
  return out.slice(0, kind === 'passive' ? HERO_PASSIVE_CARD_SLOT_LIMIT : HERO_SKILL_CARD_SLOT_LIMIT);
}

function ensureHeroCardFoundation(prog, hero) {
  if (!prog || !hero || typeof hero !== 'object') return hero;
  const collection = prog?.accountProfile?.cardCollection;
  if (!collection || typeof collection !== 'object') return hero;

  const hasExplicitSkillLoadout = Array.isArray(hero.equippedSkillCards);
  const hasExplicitPassiveLoadout = Array.isArray(hero.equippedPassiveCards);
  const fallbackSkills = hasExplicitSkillLoadout
    ? hero.equippedSkillCards
    : (Array.isArray(hero?.legacyBridge?.equippedSkillCards)
      ? hero.legacyBridge.equippedSkillCards
      : deriveSkillCardIdsFromHeroBridge(hero));
  const fallbackPassives = hasExplicitPassiveLoadout
    ? hero.equippedPassiveCards
    : (Array.isArray(hero?.legacyBridge?.equippedPassiveCards)
      ? hero.legacyBridge.equippedPassiveCards
      : derivePassiveCardIdsFromHeroBridge(hero));

  hero.equippedSkillCards = normalizeCardIdArray(fallbackSkills, 'skill').slice(0, HERO_SKILL_CARD_SLOT_LIMIT);
  hero.equippedPassiveCards = normalizeCardIdArray(fallbackPassives, 'passive').slice(0, HERO_PASSIVE_CARD_SLOT_LIMIT);

  for (const cardId of hero.equippedSkillCards) ensureCardOwnership(collection, cardId, 1);
  for (const cardId of hero.equippedPassiveCards) ensureCardOwnership(collection, cardId, 1);
  return hero;
}

function ensureAllHeroCardFoundations(prog) {
  if (!prog || typeof prog !== 'object') return prog;
  prog.accountProfile.cardCollection = sanitizeCardCollection(prog.accountProfile.cardCollection);
  for (const hero of Array.isArray(prog.heroes) ? prog.heroes : []) ensureHeroCardFoundation(prog, hero);
  return prog;
}

export function getHeroExpeditionState(prog, heroOrId = null) {
  ensureAccountProgression(prog);
  const hero = heroOrId && typeof heroOrId === 'object'
    ? heroOrId
    : (heroOrId ? getHeroById(prog, heroOrId) : getActiveHero(prog));
  if (!hero) return sanitizeHeroExpeditionState(null);
  hero.heroExpeditionState = sanitizeHeroExpeditionState(hero.heroExpeditionState);
  return hero.heroExpeditionState;
}

export function setHeroExpeditionState(prog, heroOrId = null, nextState = null) {
  ensureAccountProgression(prog);
  const hero = heroOrId && typeof heroOrId === 'object'
    ? heroOrId
    : (heroOrId ? getHeroById(prog, heroOrId) : getActiveHero(prog));
  if (!hero) return null;
  hero.heroExpeditionState = sanitizeHeroExpeditionState(nextState);
  return hero.heroExpeditionState;
}

export function clearHeroExpeditionState(prog, heroOrId = null) {
  return setHeroExpeditionState(prog, heroOrId, { hasCheckpoint: false, resumeFloor: 0, lastBiomeKey: '', savedAt: 0, checkpointVersion: 0 });
}

export function clearAllHeroExpeditionStates(prog) {
  ensureAccountProgression(prog);
  for (const hero of Array.isArray(prog?.heroes) ? prog.heroes : []) {
    hero.heroExpeditionState = sanitizeHeroExpeditionState(null);
  }
  return prog;
}

export function getSavedCheckpointHero(prog) {
  ensureAccountProgression(prog);
  return (Array.isArray(prog?.heroes) ? prog.heroes : []).find((hero) => !!hero?.heroExpeditionState?.hasCheckpoint) || null;
}

export function getSavedCheckpointHeroSummary(prog) {
  const hero = getSavedCheckpointHero(prog);
  if (!hero) return null;
  const state = sanitizeHeroExpeditionState(hero.heroExpeditionState);
  return {
    heroId: hero.heroId,
    name: hero.name,
    race: normalizeHeroRaceKey(hero.race),
    resumeFloor: state.resumeFloor,
    lastBiomeKey: state.lastBiomeKey,
    savedAt: state.savedAt,
    checkpointVersion: state.checkpointVersion,
  };
}

export function canCreateHero(prog) {
  ensureAccountProgression(prog);
  const maxSlots = Math.max(1, Number(prog?.accountProfile?.maxHeroSlots || MAX_HERO_SLOTS) | 0 || MAX_HERO_SLOTS);
  return getHeroCount(prog) < maxSlots;
}

export function listHeroSummaries(prog) {
  ensureAccountProgression(prog);
  const activeId = String(prog?.activeHeroId || '');
  return (prog.heroes || []).map((hero) => {
    const race = normalizeHeroRaceKey(hero?.race || hero?.legacyBridge?.selectedStarterLoadout || 'mecha');
    const expeditionState = sanitizeHeroExpeditionState(hero?.heroExpeditionState);
    const summary = {
      heroId: String(hero?.heroId || ''),
      name: sanitizeHeroName(hero?.name, 'Hero'),
      race,
      isActive: String(hero?.heroId || '') === activeId,
      coreKey: normalizeStarterLoadoutKey(hero?.legacyBridge?.hubBuild?.coreKey || hero?.legacyBridge?.selectedStarterLoadout || race),
      equippedSkillCards: Array.isArray(hero?.equippedSkillCards) ? hero.equippedSkillCards.length : 0,
      equippedPassiveCards: Array.isArray(hero?.equippedPassiveCards) ? hero.equippedPassiveCards.length : 0,
      hasCheckpoint: !!expeditionState.hasCheckpoint,
      resumeFloor: expeditionState.resumeFloor,
      lastBiomeKey: expeditionState.lastBiomeKey,
    };
    return summary;
  });
}

function buildDefaultHeroName(race, heroIndex = 1) {
  const meta = getHeroRaceMeta(race);
  return sanitizeHeroName(`${meta.short} Hero ${heroIndex}`, `Hero ${heroIndex}`);
}

function getNextHeroId(prog) {
  const taken = new Set((prog?.heroes || []).map((hero) => String(hero?.heroId || '').trim()).filter(Boolean));
  for (let i = 1; i <= MAX_HERO_SLOTS * 4; i += 1) {
    const candidate = `hero_${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `hero_${Date.now()}`;
}

export function createHeroForRace(prog, race, opts = {}) {
  if (!prog || typeof prog !== 'object') return null;
  ensureAccountProgression(prog);
  if (!canCreateHero(prog)) return null;
  captureActiveHeroLegacyState(prog);

  const heroRace = normalizeHeroRaceKey(race || 'mecha');
  const heroId = getNextHeroId(prog);
  const heroIndex = getHeroCount(prog) + 1;
  const activeHero = getActiveHero(prog);
  const templateSkillMeta = cloneJsonSafe(activeHero?.legacyBridge?.skillMeta || prog?.skillMeta || {}, {});
  const templateGear = cloneJsonSafe(activeHero?.legacyBridge?.hubGear || defaultHubGear(), defaultHubGear());
  const nextHero = createHeroProfile({
    heroId,
    name: sanitizeHeroName(opts?.name, buildDefaultHeroName(heroRace, heroIndex)),
    race: heroRace,
    legacyBridge: {
      selectedStarterLoadout: heroRace,
      hubBuild: defaultHubBuild(heroRace),
      hubGear: templateGear,
      skillMeta: templateSkillMeta,
      gearLoadout: templateGear,
      heroExpeditionState: { hasCheckpoint: false, resumeFloor: 0, lastBiomeKey: '' },
    },
  });

  prog.heroes.push(nextHero);
  if (!Array.isArray(prog.accountProfile.heroOrder)) prog.accountProfile.heroOrder = [];
  if (!prog.accountProfile.heroOrder.includes(heroId)) prog.accountProfile.heroOrder.push(heroId);
  ensureHeroCardFoundation(prog, nextHero);
  syncHeroLoadoutToLegacyBridge(prog, nextHero);
  return getHeroById(prog, heroId) || nextHero;
}

export const createHeroForBiome = createHeroForRace;

function setLevelMeta(meta, key, level, kind = '') {
  const srcKey = String(key || '').trim();
  if (!srcKey) return;
  const levelCap = Math.max(1, Math.min(99, Math.floor(Number(level || 1) || 1)));
  const metaKey = `${String(kind || '').trim()}:${srcKey}`;
  meta[metaKey] = Math.max(Math.floor(Number(meta[metaKey] || 0) || 0), levelCap);
}

function projectHeroLoadoutToLegacyBridge(prog, hero) {
  if (!prog || !hero) return null;
  ensureAccountProgression(prog);
  const projection = buildHeroProjectionState(prog, hero);
  const baseBridge = hero.legacyBridge && typeof hero.legacyBridge === 'object' ? hero.legacyBridge : {};
  hero.legacyBridge = {
    selectedStarterLoadout: projection.race,
    hubBuild: cloneJsonSafe(projection.nextHubBuild, defaultHubBuild(projection.race)),
    hubGear: cloneJsonSafe(hero.gearLoadout || baseBridge.hubGear || defaultHubGear(), defaultHubGear()),
    skillMeta: cloneJsonSafe(projection.nextSkillMeta, {}),
    heroCombatProfile: cloneJsonSafe(projection.combatProfile, null),
  };
  return hero.legacyBridge;
}

export function syncHeroLoadoutToLegacyBridge(prog, heroOrId = null) {
  if (!prog || typeof prog !== 'object') return null;
  const rawHero = heroOrId && typeof heroOrId === 'object'
    ? heroOrId
    : (heroOrId
      ? ((Array.isArray(prog?.heroes) ? prog.heroes : []).find((entry) => entry?.heroId === String(heroOrId || '').trim()) || null)
      : ((Array.isArray(prog?.heroes) ? prog.heroes : []).find((entry) => entry?.heroId === String(prog?.activeHeroId || '').trim()) || (Array.isArray(prog?.heroes) ? prog.heroes[0] : null)));
  if (rawHero) {
    const race = normalizeHeroRaceKey(rawHero?.race || rawHero?.legacyBridge?.selectedStarterLoadout || 'mecha');
    const starterSkillCardId = getStarterCardIdForRace(race);
    rawHero.equippedSkillCards = normalizeCardIdArray(Array.isArray(rawHero?.equippedSkillCards) ? rawHero.equippedSkillCards : [], 'skill').slice(0, HERO_SKILL_CARD_SLOT_LIMIT);
    rawHero.equippedPassiveCards = normalizeCardIdArray(Array.isArray(rawHero?.equippedPassiveCards) ? rawHero.equippedPassiveCards : [], 'passive').slice(0, HERO_PASSIVE_CARD_SLOT_LIMIT);
    rawHero.legacyBridge = rawHero.legacyBridge && typeof rawHero.legacyBridge === 'object' ? rawHero.legacyBridge : {};
    rawHero.legacyBridge.heroCombatProfile = rawHero.legacyBridge.heroCombatProfile && typeof rawHero.legacyBridge.heroCombatProfile === 'object' ? rawHero.legacyBridge.heroCombatProfile : {};
    rawHero.legacyBridge.heroCombatProfile.coreSkillEquipped = rawHero.equippedSkillCards.includes(starterSkillCardId);
  }
  const targetHeroId = String(rawHero?.heroId || (typeof heroOrId === 'string' ? heroOrId : '') || prog?.activeHeroId || '').trim();
  ensureAccountProgression(prog);
  const hero = targetHeroId ? getHeroById(prog, targetHeroId) : getActiveHero(prog);
  if (!hero) return null;
  return projectHeroLoadoutToLegacyBridge(prog, hero);
}

export function applyLegacyHubBuildToHeroLoadout(prog, heroOrId = null) {
  if (!prog || typeof prog !== 'object') return null;
  ensureAccountProgression(prog);
  const hero = heroOrId && typeof heroOrId === 'object'
    ? heroOrId
    : (heroOrId ? getHeroById(prog, heroOrId) : getActiveHero(prog));
  if (!hero) return null;

  const race = normalizeHeroRaceKey(hero?.race || hero?.legacyBridge?.selectedStarterLoadout || prog?.selectedStarterLoadout || 'mecha');
  const collection = ensureCardCollectionState(prog?.accountProfile?.cardCollection);
  prog.accountProfile.cardCollection = collection;

  hero.race = race;
  if (prog.hubBuild && typeof prog.hubBuild === 'object') prog.hubBuild.coreKey = race;
  prog.selectedStarterLoadout = race;
  hero.name = sanitizeHeroName(hero.name, sanitizeHeroName(prog?.nickname || 'Hero', 'Hero'));
  hero.gearLoadout = cloneJsonSafe(prog?.hubGear || hero?.gearLoadout || defaultHubGear(), defaultHubGear());

  const nextSkillIds = [];
  const starterCardId = getStarterCardIdForRace(race);
  if (starterCardId) {
    ensureCardOwnership(collection, starterCardId, 1);
    nextSkillIds.push(starterCardId);
  }
  for (const [skillKey, rawLevel] of Object.entries(prog?.hubBuild?.skills || {})) {
    if ((Number(rawLevel || 0) | 0) <= 0) continue;
    const cardId = getCardIdForSkill(skillKey);
    if (!cardId) continue;
    ensureCardOwnership(collection, cardId, 1);
    nextSkillIds.push(cardId);
  }

  const nextPassiveIds = [];
  for (const [passiveKey, rawLevel] of Object.entries(prog?.hubBuild?.passives || {})) {
    if ((Number(rawLevel || 0) | 0) <= 0) continue;
    const cardId = getCardIdForPassive(passiveKey);
    if (!cardId) continue;
    ensureCardOwnership(collection, cardId, 1);
    nextPassiveIds.push(cardId);
  }

  hero.equippedSkillCards = normalizeCardIdArray(nextSkillIds, 'skill').slice(0, HERO_SKILL_CARD_SLOT_LIMIT);
  hero.equippedPassiveCards = normalizeCardIdArray(nextPassiveIds, 'passive').slice(0, HERO_PASSIVE_CARD_SLOT_LIMIT);

  const nextCombatProfile = buildHeroCombatProfile(hero, collection);
  hero.legacyBridge = {
    selectedStarterLoadout: race,
    hubBuild: cloneJsonSafe(prog?.hubBuild || defaultHubBuild(race), defaultHubBuild(race)),
    hubGear: cloneJsonSafe(prog?.hubGear || defaultHubGear(), defaultHubGear()),
    skillMeta: cloneJsonSafe(prog?.skillMeta || {}, {}),
    heroCombatProfile: cloneJsonSafe(nextCombatProfile, null),
  };
  prog.heroCombatProfile = cloneJsonSafe(nextCombatProfile, null);
  return hero;
}

export const projectLegacyHubBuildIntoHeroLoadout = applyLegacyHubBuildToHeroLoadout;

export function getHeroBiomeMastery(prog, heroOrId = null) {
  ensureAccountProgression(prog);
  const hero = heroOrId && typeof heroOrId === 'object' ? heroOrId : (heroOrId ? getHeroById(prog, heroOrId) : getActiveHero(prog));
  if (!hero) return ensureHeroBiomeMastery(null, 'mecha');
  hero.biomeMastery = ensureHeroBiomeMastery(hero.biomeMastery, hero.race || 'mecha');
  return hero.biomeMastery;
}

export function grantHeroBiomeMasteryXp(prog, heroOrId = null, amount = 0) {
  ensureAccountProgression(prog);
  const hero = heroOrId && typeof heroOrId === 'object' ? heroOrId : (heroOrId ? getHeroById(prog, heroOrId) : getActiveHero(prog));
  if (!hero) return { ok: false, message: 'No hero for mastery gain.' };
  const next = grantHeroBiomeMasteryXpState(hero.biomeMastery, hero.race || 'mecha', amount);
  if (Math.max(0, Number(next.gainedXp || 0) | 0) <= 0) return { ok: false, message: 'No mastery XP gained.', hero, mastery: getHeroBiomeMastery(prog, hero) };
  hero.biomeMastery = ensureHeroBiomeMastery(next, hero.race || 'mecha');
  syncHeroLoadoutToLegacyBridge(prog, hero);
  if (getActiveHero(prog)?.heroId === hero.heroId) applyActiveHeroToLegacyProgression(prog);
  return { ok: true, hero, mastery: hero.biomeMastery, levelUps: Math.max(0, Number(next.levelUps || 0) | 0), gainedXp: Math.max(0, Number(next.gainedXp || 0) | 0), message: `${hero.name} gained ${Math.max(0, Number(next.gainedXp || 0) | 0)} ${getHeroRaceMeta(hero.race || 'mecha').short} Mastery XP.` };
}

export function getHeroBiomeMasterySummary(prog, heroOrId = null) {
  const hero = heroOrId && typeof heroOrId === 'object' ? heroOrId : (heroOrId ? getHeroById(prog, heroOrId) : getActiveHero(prog));
  const mastery = getHeroBiomeMastery(prog, hero);
  const bonuses = getHeroBiomeMasteryBonuses(mastery, hero?.race || mastery.biome || 'mecha');
  return { hero, mastery, bonuses };
}

export function getActiveHeroSummary(prog) {
  return getHeroLoadoutSummary(prog, getActiveHero(prog));
}

export function getHeroCombatProfile(prog, heroOrId = null) {
  if (!prog || typeof prog !== 'object') return null;
  ensureAccountProgression(prog);
  const hero = heroOrId && typeof heroOrId === 'object'
    ? heroOrId
    : (heroOrId ? getHeroById(prog, heroOrId) : getActiveHero(prog));
  if (!hero) return cloneJsonSafe(prog?.heroCombatProfile || null, null);

  const bridge = projectHeroLoadoutToLegacyBridge(prog, hero);
  const projection = buildHeroProjectionState(prog, hero);
  const nextProfile = cloneJsonSafe(bridge?.heroCombatProfile || projection.combatProfile || null, null);

  hero.legacyBridge = {
    ...(hero.legacyBridge && typeof hero.legacyBridge === 'object' ? hero.legacyBridge : {}),
    heroCombatProfile: cloneJsonSafe(nextProfile, null),
  };
  if (getActiveHero(prog)?.heroId === hero.heroId) {
    refreshProgressionHeroProjection(prog, hero, bridge);
  }
  return nextProfile;
}

export function getHeroLoadoutSummary(prog, heroOrId = null) {
  if (!prog || typeof prog !== 'object') return null;
  ensureAccountProgression(prog);
  const hero = heroOrId && typeof heroOrId === 'object'
    ? heroOrId
    : (heroOrId ? getHeroById(prog, heroOrId) : getActiveHero(prog));
  if (!hero) return null;

  const mastery = ensureHeroBiomeMastery(hero.biomeMastery, hero.race);
  hero.biomeMastery = mastery;
  const combat = getHeroCombatProfile(prog, hero) || {};
  const summary = combat?.summary && typeof combat.summary === 'object' ? combat.summary : {};

  return {
    heroId: hero.heroId,
    name: hero.name,
    race: normalizeHeroRaceKey(hero.race),
    masteryLevel: Math.max(1, Number(summary.masteryLevel || mastery.level || 1) | 0),
    masteryXp: Math.max(0, Number(summary.masteryXp || mastery.xp || 0) | 0),
    equippedSkillCards: Math.max(0, Array.isArray(hero.equippedSkillCards) ? hero.equippedSkillCards.length : 0),
    equippedPassiveCards: Math.max(0, Array.isArray(hero.equippedPassiveCards) ? hero.equippedPassiveCards.length : 0),
    totalCardPower: Math.max(0, Number(summary.totalCardPower || 0) | 0),
    sameRaceCards: Math.max(0, Number(summary.sameRaceCards || 0) | 0),
    starBonusTotal: Math.max(0, Number(summary.starBonusTotal || 0) | 0),
    combatProfile: combat,
  };
}

export function captureSharedLegacyResourcesToAccount(prog) {
  if (!prog || typeof prog !== "object") return prog;
  ensureAccountProgression(prog);
  prog.accountProfile.sharedResources = sanitizeSharedResources({
    coins: prog.coins,
    diamonds: prog.diamonds,
    sp: prog.sp,
    materials: prog.materials,
    essences: prog.essences,
    gearParts: prog.gearParts,
    gearInventory: prog.gearInventory,
    raceDust: prog.accountProfile?.sharedResources?.raceDust,
  });
  return prog;
}

export function applySharedAccountResourcesToLegacyProgression(prog) {
  if (!prog || typeof prog !== "object") return prog;
  ensureAccountProgression(prog);
  const shared = sanitizeSharedResources(prog.accountProfile?.sharedResources);
  prog.coins = shared.coins;
  prog.diamonds = shared.diamonds;
  prog.sp = shared.sp;
  prog.materials = cloneJsonSafe(shared.materials, defaultMaterials());
  prog.essences = cloneJsonSafe(shared.essences, defaultEssences());
  prog.gearParts = cloneJsonSafe(shared.gearParts, defaultGearParts());
  prog.gearInventory = cloneJsonSafe(shared.gearInventory, defaultGearInventory());
  return prog;
}

export function captureActiveHeroLegacyState(prog) {
  if (!prog || typeof prog !== "object") return prog;
  ensureAccountProgression(prog);
  const hero = getActiveHero(prog);
  if (!hero) return prog;

  const nextRace = normalizeHeroRaceKey(hero.race || prog?.selectedStarterLoadout || "mecha");
  hero.race = nextRace;
  hero.biomeMastery = ensureHeroBiomeMastery(hero.biomeMastery, nextRace);
  hero.name = sanitizeHeroName(hero.name, sanitizeHeroName(prog?.nickname || "Hero", "Hero"));
  hero.equippedSkillCards = Array.isArray(hero.equippedSkillCards) ? hero.equippedSkillCards : [];
  hero.equippedPassiveCards = Array.isArray(hero.equippedPassiveCards) ? hero.equippedPassiveCards : [];
  hero.gearLoadout = cloneJsonSafe(prog?.hubGear || hero.gearLoadout || defaultHubGear(), defaultHubGear());
  hero.legacyBridge = {
    selectedStarterLoadout: nextRace,
    hubBuild: (() => { const nextHubBuild = cloneJsonSafe(prog?.hubBuild || defaultHubBuild(nextRace), defaultHubBuild(nextRace)); nextHubBuild.coreKey = nextRace; return nextHubBuild; })(),
    hubGear: cloneJsonSafe(prog?.hubGear || defaultHubGear(), defaultHubGear()),
    skillMeta: cloneJsonSafe(prog?.skillMeta || {}, {}),
  };
  ensureHeroCardFoundation(prog, hero);
  syncHeroLoadoutToLegacyBridge(prog, hero);
  return prog;
}

export function applyActiveHeroToLegacyProgression(prog) {
  if (!prog || typeof prog !== "object") return prog;
  ensureAccountProgression(prog);
  const hero = getActiveHero(prog);
  if (!hero) return prog;

  const bridge = syncHeroLoadoutToLegacyBridge(prog, hero) || (hero.legacyBridge && typeof hero.legacyBridge === "object" ? hero.legacyBridge : {});
  const race = normalizeHeroRaceKey(hero.race || bridge.selectedStarterLoadout || prog?.selectedStarterLoadout || "mecha");
  hero.race = race;
  hero.biomeMastery = ensureHeroBiomeMastery(hero.biomeMastery, race);
  prog.selectedStarterLoadout = race;
  prog.nickname = sanitizeHeroName(hero.name, prog?.nickname || 'Hero').slice(0, 16) || 'Hero';
  prog.skillMeta = cloneJsonSafe(bridge.skillMeta || {}, {});
  prog.hubBuild = cloneJsonSafe(bridge.hubBuild || defaultHubBuild(race), defaultHubBuild(race));
  prog.hubBuild.coreKey = normalizeStarterLoadoutKey(prog?.hubBuild?.coreKey || race);
  prog.hubGear = cloneJsonSafe(hero.gearLoadout || bridge.hubGear || defaultHubGear(), defaultHubGear());
  refreshProgressionHeroProjection(prog, hero, bridge);
  return prog;
}

export function setActiveHeroId(prog, nextHeroId) {
  if (!prog || typeof prog !== "object") return false;
  ensureAccountProgression(prog);
  captureActiveHeroLegacyState(prog);
  const nextId = String(nextHeroId || "").trim();
  if (!nextId) return false;
  const exists = prog.heroes.some((hero) => hero?.heroId === nextId);
  if (!exists || prog.activeHeroId === nextId) return false;
  prog.activeHeroId = nextId;
  applyActiveHeroToLegacyProgression(prog);
  return true;
}


export function getHeroLoadoutPresets(hero) {
  if (!hero || typeof hero !== 'object') return sanitizeLoadoutPresets(null, 'mecha');
  hero.loadoutPresets = sanitizeLoadoutPresets(hero.loadoutPresets, hero.race || 'mecha');
  return hero.loadoutPresets;
}

export function saveHeroLoadoutPreset(prog, heroOrId = null, slotIndex = 0, opts = {}) {
  ensureAccountProgression(prog);
  const hero = heroOrId && typeof heroOrId === 'object' ? heroOrId : (heroOrId ? getHeroById(prog, heroOrId) : getActiveHero(prog));
  if (!hero) return { ok: false, message: 'No active hero.' };
  if (getHeroExpeditionState(prog, hero).hasCheckpoint) return { ok: false, message: 'Preset save blocked: hero has a saved expedition checkpoint.' };
  const slot = Math.max(0, Math.min(HERO_LOADOUT_PRESET_LIMIT - 1, Number(slotIndex || 0) | 0));
  const presets = getHeroLoadoutPresets(hero);
  presets[slot] = createDefaultLoadoutPreset(hero.race, slot, {
    name: opts?.name,
    equippedSkillCards: hero.equippedSkillCards,
    equippedPassiveCards: hero.equippedPassiveCards,
    updatedAt: Date.now(),
  });
  hero.loadoutPresets = presets;
  return { ok: true, preset: presets[slot], message: `${hero.name} preset ${slot + 1} saved.` };
}

export function applyHeroLoadoutPreset(prog, heroOrId = null, slotIndex = 0) {
  ensureAccountProgression(prog);
  const hero = heroOrId && typeof heroOrId === 'object' ? heroOrId : (heroOrId ? getHeroById(prog, heroOrId) : getActiveHero(prog));
  if (!hero) return { ok: false, message: 'No active hero.' };
  if (getHeroExpeditionState(prog, hero).hasCheckpoint) return { ok: false, message: 'Preset apply blocked: hero has a saved expedition checkpoint.' };
  const slot = Math.max(0, Math.min(HERO_LOADOUT_PRESET_LIMIT - 1, Number(slotIndex || 0) | 0));
  const presets = getHeroLoadoutPresets(hero);
  const preset = presets[slot];
  if (!preset) return { ok: false, message: 'Preset missing.' };
  hero.race = normalizeHeroRaceKey(hero.race || 'mecha');
  hero.equippedSkillCards = normalizeCardIdArray(preset.equippedSkillCards, 'skill').slice(0, HERO_SKILL_CARD_SLOT_LIMIT);
  hero.equippedPassiveCards = normalizeCardIdArray(preset.equippedPassiveCards, 'passive').slice(0, HERO_PASSIVE_CARD_SLOT_LIMIT);
  hero.legacyBridge = {
    ...(hero.legacyBridge && typeof hero.legacyBridge === 'object' ? hero.legacyBridge : {}),
    selectedStarterLoadout: hero.race,
    hubBuild: defaultHubBuild(hero.race),
  };
  ensureHeroCardFoundation(prog, hero);
  syncHeroLoadoutToLegacyBridge(prog, hero);
  if (getActiveHero(prog)?.heroId === hero.heroId) applyActiveHeroToLegacyProgression(prog);
  return { ok: true, preset, message: `${hero.name} applied ${preset.name}.` };
}

export function renameHeroProfile(prog, heroOrId = null, newName = '') {
  ensureAccountProgression(prog);
  const hero = heroOrId && typeof heroOrId === 'object' ? heroOrId : (heroOrId ? getHeroById(prog, heroOrId) : getActiveHero(prog));
  if (!hero) return { ok: false, message: 'Hero not found.' };
  const name = sanitizeHeroName(newName, hero.name || 'Hero');
  if (!name) return { ok: false, message: 'Rename blocked: empty hero name.' };
  hero.name = name;
  if (getActiveHero(prog)?.heroId === hero.heroId) applyActiveHeroToLegacyProgression(prog);
  return { ok: true, hero, message: `Hero renamed to ${name}.` };
}

export function retireHeroProfile(prog, heroOrId = null) {
  ensureAccountProgression(prog);
  const hero = heroOrId && typeof heroOrId === 'object' ? heroOrId : (heroOrId ? getHeroById(prog, heroOrId) : getActiveHero(prog));
  if (!hero) return { ok: false, message: 'Hero not found.' };
  if ((prog?.heroes?.length || 0) <= 1) return { ok: false, message: 'Retire blocked: at least one hero must remain.' };
  if (getHeroExpeditionState(prog, hero).hasCheckpoint) return { ok: false, message: 'Retire blocked: hero still owns a saved expedition checkpoint.' };
  const idx = (prog.heroes || []).findIndex((entry) => entry?.heroId === hero.heroId);
  if (idx < 0) return { ok: false, message: 'Hero not found.' };
  prog.heroes.splice(idx, 1);
  if (Array.isArray(prog?.accountProfile?.heroOrder)) prog.accountProfile.heroOrder = prog.accountProfile.heroOrder.filter((id) => id !== hero.heroId);
  if (String(prog.activeHeroId || '') === hero.heroId) {
    const fallback = prog.heroes[0] || null;
    prog.activeHeroId = String(fallback?.heroId || '');
    if (fallback) applyActiveHeroToLegacyProgression(prog);
  }
  return { ok: true, message: `${hero.name} retired from the roster.` };
}
