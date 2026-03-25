import { RUN_PASSIVES, RUN_SKILLS } from '../runUpgrades.js';
import { STARTER_LOADOUTS, getPassiveRouteMeta, getSkillRouteMeta, normalizeStarterLoadoutKey } from '../starterLoadouts.js';

export const CARD_COLLECTION_VERSION = 3;
export const CARD_KIND_SKILL = 'skill';
export const CARD_KIND_PASSIVE = 'passive';

const EVOLUTION_RESULT_KEYS = new Set(['rockets', 'energyBomb', 'fireBomb', 'iceBomb']);
const STARTER_SKILL_KEYS = new Set(STARTER_LOADOUTS.map((def) => String(def?.skillKey || '')).filter(Boolean));
const STARTER_BY_RACE = Object.fromEntries(STARTER_LOADOUTS.map((def) => [normalizeStarterLoadoutKey(def?.key || 'mecha'), def]));

function normalizeCardRace(rawRace) {
  const key = String(rawRace || '').trim().toLowerCase();
  if (!key || key === 'neutral' || key === 'station' || key === 'space' || key === 'hub') return 'mecha';
  return normalizeStarterLoadoutKey(key);
}

function makeCardId(kind, sourceKey) {
  return `${String(kind || '').trim().toLowerCase()}:${String(sourceKey || '').trim()}`;
}

function getPassiveBaseStars() {
  return 1;
}

function getSkillBaseStars() {
  return 1;
}

function makeTags(...values) {
  const out = [];
  const seen = new Set();
  for (const raw of values) {
    const text = String(raw || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function createSkillCardDef(skillDef) {
  const key = String(skillDef?.key || '').trim();
  if (!key) return null;
  const routeMeta = getSkillRouteMeta(key);
  const race = normalizeCardRace(routeMeta?.route || skillDef?.biome || 'mecha');
  const baseStars = getSkillBaseStars(key);
  return {
    cardId: makeCardId(CARD_KIND_SKILL, key),
    kind: CARD_KIND_SKILL,
    sourceKey: key,
    skillId: key,
    passiveId: '',
    name: String(skillDef?.name || key),
    race,
    rarityBase: baseStars,
    baseStars,
    maxStars: 3,
    isStarterCore: STARTER_SKILL_KEYS.has(key),
    routeTags: makeTags(routeMeta?.route || race),
    tags: makeTags(routeMeta?.role, routeMeta?.style, skillDef?.kind),
    summary: String(routeMeta?.style || routeMeta?.role || 'Skill card'),
  };
}

function createPassiveCardDef(passiveDef) {
  const key = String(passiveDef?.key || '').trim();
  if (!key) return null;
  const routeMeta = getPassiveRouteMeta(key);
  const race = normalizeCardRace(routeMeta?.route || 'mecha');
  const baseStars = getPassiveBaseStars(key);
  return {
    cardId: makeCardId(CARD_KIND_PASSIVE, key),
    kind: CARD_KIND_PASSIVE,
    sourceKey: key,
    skillId: '',
    passiveId: key,
    name: String(passiveDef?.name || key),
    race,
    rarityBase: baseStars,
    baseStars,
    maxStars: 3,
    isStarterCore: false,
    routeTags: makeTags(routeMeta?.route || race),
    tags: makeTags(routeMeta?.role, passiveDef?.kind),
    summary: String(routeMeta?.role || 'Passive card'),
  };
}

const CARD_DEFS = [];
const CARD_DEF_BY_ID = Object.create(null);

for (const def of RUN_SKILLS) {
  const card = createSkillCardDef(def);
  if (!card) continue;
  CARD_DEFS.push(card);
  CARD_DEF_BY_ID[card.cardId] = card;
}
for (const def of RUN_PASSIVES) {
  const card = createPassiveCardDef(def);
  if (!card) continue;
  CARD_DEFS.push(card);
  CARD_DEF_BY_ID[card.cardId] = card;
}

export function listCardDefs() {
  return CARD_DEFS.slice();
}

export function listSkillCardDefs() {
  return CARD_DEFS.filter((entry) => entry?.kind === CARD_KIND_SKILL);
}

export function listPassiveCardDefs() {
  return CARD_DEFS.filter((entry) => entry?.kind === CARD_KIND_PASSIVE);
}

export function getCardDefById(cardId) {
  return CARD_DEF_BY_ID[String(cardId || '').trim()] || null;
}

export function getCardIdForSkill(skillKey) {
  const key = String(skillKey || '').trim();
  return CARD_DEF_BY_ID[makeCardId(CARD_KIND_SKILL, key)] ? makeCardId(CARD_KIND_SKILL, key) : '';
}

export function getCardIdForPassive(passiveKey) {
  const key = String(passiveKey || '').trim();
  return CARD_DEF_BY_ID[makeCardId(CARD_KIND_PASSIVE, key)] ? makeCardId(CARD_KIND_PASSIVE, key) : '';
}

export function getStarterCardIdForRace(rawRace) {
  const race = normalizeCardRace(rawRace || 'mecha');
  const starter = STARTER_BY_RACE[race] || STARTER_BY_RACE.mecha;
  return getCardIdForSkill(starter?.skillKey || 'bullets');
}

export function getStarterPassiveCardIdForRace(rawRace) {
  const race = normalizeCardRace(rawRace || 'mecha');
  const starter = STARTER_BY_RACE[race] || STARTER_BY_RACE.mecha;
  const passiveKey = Array.isArray(starter?.favoredPassiveKeys) ? starter.favoredPassiveKeys[0] : '';
  return getCardIdForPassive(passiveKey || 'moveSpeed');
}

export function createEmptyCardCollection() {
  return {
    version: CARD_COLLECTION_VERSION,
    cards: {},
    shards: {},
  };
}

export function createCardState(cardId, overrides = {}) {
  const def = getCardDefById(cardId);
  if (!def) return null;
  const copiesOwned = Math.max(0, Math.floor(Number(overrides.copiesOwned ?? overrides.copies ?? 0) || 0));
  const currentStars = Math.max(def.baseStars, Math.min(def.maxStars, Math.floor(Number(overrides.currentStars ?? overrides.starsCurrent ?? def.baseStars) || def.baseStars)));
  const level = Math.max(1, Math.floor(Number(overrides.level ?? 1) || 1));
  return {
    cardId: def.cardId,
    kind: def.kind,
    sourceKey: def.sourceKey,
    skillId: def.skillId || '',
    passiveId: def.passiveId || '',
    race: def.race,
    rarityBase: def.rarityBase,
    baseStars: def.baseStars,
    currentStars,
    level,
    copiesOwned,
    tags: Array.isArray(def.tags) ? def.tags.slice() : [],
    routeTags: Array.isArray(def.routeTags) ? def.routeTags.slice() : [],
  };
}

export function normalizeCardState(rawState, cardId) {
  const def = getCardDefById(cardId || rawState?.cardId || '');
  if (!def) return null;
  const src = rawState && typeof rawState === 'object' ? rawState : {};
  return createCardState(def.cardId, {
    copiesOwned: src.copiesOwned,
    currentStars: src.currentStars,
    level: src.level,
  });
}

export function ensureCardCollectionState(rawCollection) {
  const src = rawCollection && typeof rawCollection === 'object' ? rawCollection : createEmptyCardCollection();
  const next = createEmptyCardCollection();
  const incomingVersion = Math.max(0, Math.floor(Number(src.version || 0) || 0));
  const cards = src.cards && typeof src.cards === 'object' ? src.cards : {};
  for (const [cardId, rawState] of Object.entries(cards)) {
    const normalized = normalizeCardState(rawState, cardId);
    if (!normalized) continue;
    if (incomingVersion > 0 && incomingVersion < CARD_COLLECTION_VERSION && normalized.kind === CARD_KIND_SKILL) {
      normalized.currentStars = 1;
    }
    normalized.currentStars = Math.max(1, Math.min(3, Math.floor(Number(normalized.currentStars || 1) || 1)));
    next.cards[normalized.cardId] = normalized;
  }
  const shards = src.shards && typeof src.shards === 'object' ? src.shards : {};
  for (const [cardId, rawValue] of Object.entries(shards)) {
    if (!getCardDefById(cardId)) continue;
    next.shards[cardId] = Math.max(0, Math.floor(Number(rawValue || 0) || 0));
  }
  return next;
}

export function seedCardCollection(collection, { includeSkills = true, includePassives = false, copies = 1, level = 1, currentStars = 1 } = {}) {
  if (!collection || typeof collection !== 'object') return collection;
  const normalized = ensureCardCollectionState(collection);
  const minCopies = Math.max(0, Math.floor(Number(copies || 0) || 0));
  const baseLevel = Math.max(1, Math.floor(Number(level || 1) || 1));
  const baseStars = Math.max(1, Math.min(3, Math.floor(Number(currentStars || 1) || 1)));
  for (const def of CARD_DEFS) {
    if (!def) continue;
    if ((!includeSkills && def.kind === CARD_KIND_SKILL) || (!includePassives && def.kind === CARD_KIND_PASSIVE)) continue;
    if (!normalized.cards[def.cardId]) normalized.cards[def.cardId] = createCardState(def.cardId, { copiesOwned: 0, level: baseLevel, currentStars: baseStars });
    normalized.cards[def.cardId].copiesOwned = Math.max(minCopies, Math.floor(Number(normalized.cards[def.cardId].copiesOwned || 0) || 0));
    normalized.cards[def.cardId].level = Math.max(1, Math.floor(Number(normalized.cards[def.cardId].level || baseLevel) || baseLevel));
    normalized.cards[def.cardId].currentStars = Math.max(1, Math.min(3, Math.floor(Number(normalized.cards[def.cardId].currentStars || baseStars) || baseStars)));
  }
  Object.assign(collection, normalized);
  return collection;
}

export function ensureCardOwnership(collection, cardId, copies = 1) {
  const nextCopies = Math.max(0, Math.floor(Number(copies || 0) || 0));
  if (!collection || typeof collection !== 'object') return null;
  const normalized = ensureCardCollectionState(collection);
  const def = getCardDefById(cardId);
  if (!def) return null;
  if (!normalized.cards[def.cardId]) normalized.cards[def.cardId] = createCardState(def.cardId, { copiesOwned: 0 });
  if (nextCopies > normalized.cards[def.cardId].copiesOwned) normalized.cards[def.cardId].copiesOwned = nextCopies;
  Object.assign(collection, normalized);
  return collection.cards[def.cardId];
}

export function grantCardCopies(collection, cardId, copies = 1) {
  const add = Math.max(0, Math.floor(Number(copies || 0) || 0));
  if (!add || !collection || typeof collection !== 'object') return null;
  const normalized = ensureCardCollectionState(collection);
  const def = getCardDefById(cardId);
  if (!def) return null;
  if (!normalized.cards[def.cardId]) normalized.cards[def.cardId] = createCardState(def.cardId, { copiesOwned: 0 });
  normalized.cards[def.cardId].copiesOwned += add;
  Object.assign(collection, normalized);
  return collection.cards[def.cardId];
}

export function getOwnedCardState(collection, cardId) {
  if (!collection || typeof collection !== 'object') return null;
  const normalized = ensureCardCollectionState(collection);
  return normalized.cards[String(cardId || '').trim()] || null;
}

export function listOwnedCardStates(collection) {
  const normalized = ensureCardCollectionState(collection);
  return Object.values(normalized.cards).filter((entry) => Math.max(0, entry?.copiesOwned | 0) > 0);
}

export function listOwnedCardEntries(collection, opts = {}) {
  const race = opts?.race ? normalizeCardRace(opts.race) : '';
  const equippedIds = new Set(Array.isArray(opts?.equippedIds) ? opts.equippedIds.map((id) => String(id || '').trim()).filter(Boolean) : []);
  return listOwnedCardStates(collection)
    .map((state) => {
      const def = getCardDefById(state.cardId);
      if (!def) return null;
      const entry = {
        ...def,
        ...state,
        starsText: '★'.repeat(Math.max(0, state.currentStars | 0)),
        isEquipped: equippedIds.has(state.cardId),
      };
      return entry;
    })
    .filter(Boolean)
    .filter((entry) => !race || entry.race === race)
    .sort((a, b) => Number(b.isEquipped) - Number(a.isEquipped)
      || Number(b.currentStars || 0) - Number(a.currentStars || 0)
      || Number(b.level || 0) - Number(a.level || 0)
      || String(a.name || '').localeCompare(String(b.name || '')));
}

export function normalizeCardIdArray(rawIds, kind = '') {
  const out = [];
  const seen = new Set();
  const items = Array.isArray(rawIds) ? rawIds : [];
  for (const raw of items) {
    const id = String(raw || '').trim();
    const def = getCardDefById(id);
    if (!def) continue;
    if (kind && def.kind !== kind) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
