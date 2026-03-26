import {
  HERO_PASSIVE_CARD_SLOT_LIMIT,
  HERO_SKILL_CARD_SLOT_LIMIT,
  ensureAccountProgression,
  getActiveHero,
  getHeroById,
  normalizeHeroRaceKey,
  syncHeroLoadoutToLegacyBridge,
  applyActiveHeroToLegacyProgression,
} from '../accountProfile.js';
import {
  ensureCardCollectionState,
  getCardDefById,
  getOwnedCardState,
  getStarterCardIdForRace,
  listOwnedCardEntries,
  normalizeCardIdArray,
} from './cardDefs.js';
import { getReservedCardCopyMap } from './cardUpgrade.js';

function toInt(value, fallback = 0) {
  const n = Math.floor(Number(value) || 0);
  return Number.isFinite(n) ? n : fallback;
}

function getHeroRef(prog, heroOrId = null) {
  ensureAccountProgression(prog);
  if (heroOrId && typeof heroOrId === 'object') {
    const heroId = String(heroOrId?.heroId || '').trim();
    return heroId ? (getHeroById(prog, heroId) || heroOrId) : heroOrId;
  }
  if (heroOrId) return getHeroById(prog, heroOrId);
  return getActiveHero(prog);
}

function getMutableCollection(prog) {
  ensureAccountProgression(prog);
  if (!prog?.accountProfile || typeof prog.accountProfile !== 'object') return null;
  prog.accountProfile.cardCollection = ensureCardCollectionState(prog.accountProfile.cardCollection);
  return prog.accountProfile.cardCollection;
}

function getArrayKeyForDef(def) {
  return def?.kind === 'passive' ? 'equippedPassiveCards' : 'equippedSkillCards';
}

function getSlotLimit(def) {
  return def?.kind === 'passive' ? HERO_PASSIVE_CARD_SLOT_LIMIT : HERO_SKILL_CARD_SLOT_LIMIT;
}

function removeFirstMatchingCardId(ids, targetId) {
  const next = [];
  let removed = false;
  for (const rawId of Array.isArray(ids) ? ids : []) {
    const id = String(rawId || '').trim();
    if (!removed && id === String(targetId || '').trim()) {
      removed = true;
      continue;
    }
    if (id) next.push(id);
  }
  return next;
}

function getProtectedStarterCardId(hero) {
  const race = normalizeHeroRaceKey(hero?.race || 'mecha');
  return getStarterCardIdForRace(race);
}


function finalizeHeroLoadoutChange(prog, hero) {
  if (!prog || !hero) return;
  syncHeroLoadoutToLegacyBridge(prog, hero.heroId);
  if (getActiveHero(prog)?.heroId === hero.heroId) applyActiveHeroToLegacyProgression(prog);
}

function getReservedCopiesExcludingHero(prog, hero, cardId) {
  const reserved = getReservedCardCopyMap(prog);
  const id = String(cardId || '').trim();
  if (!id) return 0;
  let count = Math.max(0, toInt(reserved[id], 0));
  const skillIds = Array.isArray(hero?.equippedSkillCards) ? hero.equippedSkillCards : [];
  const passiveIds = Array.isArray(hero?.equippedPassiveCards) ? hero.equippedPassiveCards : [];
  for (const rawId of [...skillIds, ...passiveIds]) {
    if (String(rawId || '').trim() === id) count = Math.max(0, count - 1);
  }
  return count;
}

function getSkillReplacementIndex(hero, incomingCardId = '') {
  const ids = normalizeCardIdArray(hero?.equippedSkillCards, 'skill');
  for (let i = ids.length - 1; i >= 0; i -= 1) {
    const id = String(ids[i] || '').trim();
    if (!id) continue;
    if (id === String(incomingCardId || '').trim()) return i;
    return i;
  }
  return -1;
}

export function getHeroLoadoutEntries(prog, heroOrId = null) {
  const collection = getMutableCollection(prog);
  const hero = getHeroRef(prog, heroOrId);
  if (!hero || !collection) return { hero: null, skillCards: [], passiveCards: [] };
  const skillCards = [];
  const passiveCards = [];
  for (const cardId of normalizeCardIdArray(hero.equippedSkillCards, 'skill')) {
    const state = getOwnedCardState(collection, cardId);
    const def = getCardDefById(cardId);
    if (!state || !def) continue;
    skillCards.push({ ...def, ...state, starsText: '★'.repeat(Math.max(1, toInt(state.currentStars, def.baseStars || 1))) });
  }
  for (const cardId of normalizeCardIdArray(hero.equippedPassiveCards, 'passive')) {
    const state = getOwnedCardState(collection, cardId);
    const def = getCardDefById(cardId);
    if (!state || !def) continue;
    passiveCards.push({ ...def, ...state, starsText: '★'.repeat(Math.max(1, toInt(state.currentStars, def.baseStars || 1))) });
  }
  return { hero, skillCards, passiveCards };
}

export function getHeroLoadoutActionPreview(prog, cardId, heroOrId = null) {
  const collection = getMutableCollection(prog);
  const hero = getHeroRef(prog, heroOrId);
  const def = getCardDefById(cardId);
  const id = String(cardId || '').trim();
  const state = collection?.cards?.[id] || null;
  if (!hero || !collection || !def || !state || toInt(state.copiesOwned, 0) <= 0) {
    return {
      ok: false,
      hero: hero || null,
      def: def || null,
      target: state || null,
      action: 'blocked',
      canEquip: false,
      canUnequip: false,
      reason: 'Card not owned.',
      slotLimit: getSlotLimit(def),
      slotUsed: 0,
      freeCopies: 0,
      reservedCopiesElsewhere: 0,
      protectedStarter: false,
      replacementIndex: -1,
      replacementCardId: '',
      replacementCardName: '',
    };
  }

  const arrKey = getArrayKeyForDef(def);
  hero[arrKey] = normalizeCardIdArray(hero[arrKey], def.kind);
  const slotLimit = getSlotLimit(def);
  const slotUsed = hero[arrKey].length;
  const isEquipped = hero[arrKey].includes(id);
  const reservedElsewhere = getReservedCopiesExcludingHero(prog, hero, id);
  const freeCopies = Math.max(0, toInt(state.copiesOwned, 0) - reservedElsewhere - (isEquipped ? 1 : 0));
  const protectedStarter = false;
  let replacementIndex = -1;
  let replacementCardId = '';
  let replacementCardName = '';
  const reasons = [];
  let action = isEquipped ? 'unequip' : 'equip';

  if (!isEquipped) {
    if (freeCopies <= 0) reasons.push('all owned copies are already reserved by other heroes');
    if (slotUsed >= slotLimit) {
      if (def.kind === 'skill') {
        replacementIndex = getSkillReplacementIndex(hero, id);
        if (replacementIndex >= 0) {
          replacementCardId = String(hero[arrKey][replacementIndex] || '').trim();
          const replacementDef = getCardDefById(replacementCardId);
          replacementCardName = String(replacementDef?.name || replacementCardId || '').trim();
          action = 'replace';
        } else {
          reasons.push('no replaceable skill slot');
        }
      } else {
        reasons.push('no free loadout slot');
      }
    }
  }

  const ok = !reasons.length;
  return {
    ok,
    hero,
    def,
    target: state,
    action,
    canEquip: !isEquipped && ok,
    canUnequip: isEquipped && ok,
    reason: ok ? '' : reasons.join(' • '),
    slotLimit,
    slotUsed,
    freeCopies,
    reservedCopiesElsewhere: reservedElsewhere,
    protectedStarter,
    replacementIndex,
    replacementCardId,
    replacementCardName,
  };
}

export function replaceHeroSkillCardAtSlot(prog, incomingCardId, slotIndex = -1, heroOrId = null) {
  const preview = getHeroLoadoutActionPreview(prog, incomingCardId, heroOrId);
  if (!preview?.hero || !preview?.def || preview.def.kind !== 'skill') {
    return { ok: false, message: 'Replace blocked: skill missing.', preview };
  }
  if (preview.action === 'unequip') {
    return { ok: false, message: 'Replace blocked: this skill is already equipped.', preview };
  }
  if (!preview.canEquip) {
    return { ok: false, message: preview.reason ? `Replace blocked: ${preview.reason}.` : 'Replace blocked.', preview };
  }
  const hero = getHeroRef(prog, preview.hero?.heroId || heroOrId);
  if (!hero) return { ok: false, message: 'Replace blocked: hero missing after refresh.', preview };
  const ids = normalizeCardIdArray(hero.equippedSkillCards, 'skill');
  const idx = Math.max(0, Math.min(ids.length - 1, toInt(slotIndex, -1)));
  if (idx < 0 || !ids[idx]) {
    return { ok: false, message: 'Replace blocked: choose an occupied slot first.', preview };
  }
  const outgoingId = String(ids[idx] || '').trim();
  const outgoingDef = getCardDefById(outgoingId);
  if (!outgoingId) {
    return { ok: false, message: 'Replace blocked: chosen slot is empty.', preview };
  }
  if (outgoingId === preview.def.cardId) {
    return { ok: false, message: `${String(preview.def.name || 'Skill')} is already in that slot.`, preview };
  }
  ids[idx] = preview.def.cardId;
  hero.equippedSkillCards = normalizeCardIdArray(ids, 'skill').slice(0, getSlotLimit(preview.def));
  finalizeHeroLoadoutChange(prog, hero);
  return {
    ok: true,
    message: `${String(preview.def.name || 'Skill')} equipped on ${String(hero.name || 'Hero')} • replaced ${String(outgoingDef?.name || 'skill')}.`,
    preview: getHeroLoadoutActionPreview(prog, incomingCardId, hero.heroId),
  };
}

export function equipCardOnHero(prog, cardId, heroOrId = null) {
  const preview = getHeroLoadoutActionPreview(prog, cardId, heroOrId);
  if (!preview.canEquip || !preview.hero || !preview.def) {
    return { ok: false, message: preview.reason ? `Equip blocked: ${preview.reason}.` : 'Equip blocked.', preview };
  }
  const hero = getHeroRef(prog, preview.hero?.heroId || heroOrId);
  if (!hero) return { ok: false, message: 'Equip blocked: hero missing after refresh.', preview };
  const arrKey = getArrayKeyForDef(preview.def);
  let ids = normalizeCardIdArray(hero[arrKey], preview.def.kind);
  let message = `${String(preview.def.name || 'Card')} equipped on ${String(hero.name || 'Hero')}.`;
  if (preview.action === 'replace' && preview.def.kind === 'skill' && preview.replacementIndex >= 0) {
    const replacedName = String(preview.replacementCardName || 'skill').trim() || 'skill';
    ids[preview.replacementIndex] = preview.def.cardId;
    ids = normalizeCardIdArray(ids, preview.def.kind).slice(0, getSlotLimit(preview.def));
    message = `${String(preview.def.name || 'Card')} equipped on ${String(hero.name || 'Hero')} • replaced ${replacedName}.`;
  } else {
    ids.push(preview.def.cardId);
    ids = normalizeCardIdArray(ids, preview.def.kind).slice(0, getSlotLimit(preview.def));
  }
  hero[arrKey] = ids;
  finalizeHeroLoadoutChange(prog, hero);
  return {
    ok: true,
    message,
    preview: getHeroLoadoutActionPreview(prog, cardId, heroOrId),
  };
}

export function unequipCardFromHero(prog, cardId, heroOrId = null) {
  const preview = getHeroLoadoutActionPreview(prog, cardId, heroOrId);
  if (!preview.canUnequip || !preview.hero || !preview.def) {
    return { ok: false, message: preview.reason ? `Unequip blocked: ${preview.reason}.` : 'Unequip blocked.', preview };
  }
  const hero = getHeroRef(prog, preview.hero?.heroId || heroOrId);
  if (!hero) return { ok: false, message: 'Unequip blocked: hero missing after refresh.', preview };
  const arrKey = getArrayKeyForDef(preview.def);
  hero[arrKey] = normalizeCardIdArray(removeFirstMatchingCardId(hero[arrKey], preview.def.cardId), preview.def.kind);
  finalizeHeroLoadoutChange(prog, hero);
  return {
    ok: true,
    message: `${String(preview.def.name || 'Card')} removed from ${String(hero.name || 'Hero')}.`,
    preview: getHeroLoadoutActionPreview(prog, cardId, hero.heroId),
  };
}

export function listHeroLoadoutCandidates(prog, heroOrId = null, kind = '') {
  const hero = getHeroRef(prog, heroOrId);
  const equippedIds = hero ? [...(hero.equippedSkillCards || []), ...(hero.equippedPassiveCards || [])] : [];
  const cards = listOwnedCardEntries(prog?.accountProfile?.cardCollection, { equippedIds, race: '' });
  return cards.filter((entry) => !kind || entry.kind === kind);
}


function getHeroCardPowerScore(hero, entry, opts = {}) {
  const heroRace = normalizeHeroRaceKey(hero?.race || 'mecha');
  const preferRace = opts?.preferRace !== false;
  const sameRace = entry?.race === heroRace;
  const routeHits = Array.isArray(entry?.routeTags) ? entry.routeTags.filter((tag) => String(tag || '').trim() === heroRace).length : 0;
  let score = 0;
  score += sameRace ? (preferRace ? 200000 : 25000) : 0;
  score += Math.max(0, toInt(entry?.currentStars, entry?.baseStars || 1)) * 1000;
  score += Math.max(1, toInt(entry?.level, 1)) * 50;
  score += Math.min(99, Math.max(0, toInt(entry?.copiesOwned, 0))) * 3;
  score += Math.min(9, routeHits) * 120;
  if (entry?.isStarterCore) score += entry?.kind === 'skill' ? 150000 : 1200;
  if (entry?.kind === 'passive' && sameRace) score += 1600;
  return score;
}

function buildHeroOptimizedIds(prog, hero, kind = 'skill', opts = {}) {
  const collection = getMutableCollection(prog);
  const slotLimit = kind === 'passive' ? HERO_PASSIVE_CARD_SLOT_LIMIT : HERO_SKILL_CARD_SLOT_LIMIT;
  const heroRace = normalizeHeroRaceKey(hero?.race || 'mecha');
  const currentIds = normalizeCardIdArray(kind === 'passive' ? hero?.equippedPassiveCards : hero?.equippedSkillCards, kind);
  const starterCardId = kind === 'skill' ? getStarterCardIdForRace(heroRace) : '';
  const nextIds = [];
  const seen = new Set();

  if (starterCardId) {
    nextIds.push(starterCardId);
    seen.add(starterCardId);
  }

  if (opts?.fillOnly) {
    for (const cardId of currentIds) {
      if (!cardId || seen.has(cardId)) continue;
      const state = getOwnedCardState(collection, cardId);
      const def = getCardDefById(cardId);
      if (!state || !def || def.kind !== kind) continue;
      nextIds.push(cardId);
      seen.add(cardId);
      if (nextIds.length >= slotLimit) return nextIds.slice(0, slotLimit);
    }
  }

  const entries = listOwnedCardEntries(collection, { equippedIds: [...(hero?.equippedSkillCards || []), ...(hero?.equippedPassiveCards || [])], race: '' })
    .filter((entry) => entry?.kind === kind)
    .sort((a, b) => getHeroCardPowerScore(hero, b, opts) - getHeroCardPowerScore(hero, a, opts)
      || Number(b.currentStars || 0) - Number(a.currentStars || 0)
      || Number(b.level || 0) - Number(a.level || 0)
      || String(a.name || '').localeCompare(String(b.name || '')));

  for (const entry of entries) {
    const cardId = String(entry?.cardId || '').trim();
    if (!cardId || seen.has(cardId)) continue;
    const reservedElsewhere = getReservedCopiesExcludingHero(prog, hero, cardId);
    const alreadyKept = nextIds.includes(cardId) ? 1 : 0;
    const freeCopies = Math.max(0, toInt(entry?.copiesOwned, 0) - reservedElsewhere - alreadyKept);
    if (freeCopies <= 0) continue;
    nextIds.push(cardId);
    seen.add(cardId);
    if (nextIds.length >= slotLimit) break;
  }

  return nextIds.slice(0, slotLimit);
}

export function optimizeHeroLoadout(prog, heroOrId = null, opts = {}) {
  const hero = getHeroRef(prog, heroOrId);
  if (!hero) return { ok: false, message: 'No active hero.' };
  const nextSkillIds = buildHeroOptimizedIds(prog, hero, 'skill', opts);
  const nextPassiveIds = buildHeroOptimizedIds(prog, hero, 'passive', opts);
  hero.equippedSkillCards = normalizeCardIdArray(nextSkillIds, 'skill').slice(0, HERO_SKILL_CARD_SLOT_LIMIT);
  hero.equippedPassiveCards = normalizeCardIdArray(nextPassiveIds, 'passive').slice(0, HERO_PASSIVE_CARD_SLOT_LIMIT);
  finalizeHeroLoadoutChange(prog, hero);
  const modeText = opts?.fillOnly ? 'empty slots filled' : 'loadout optimized';
  return {
    ok: true,
    hero,
    skillCount: hero.equippedSkillCards.length,
    passiveCount: hero.equippedPassiveCards.length,
    message: `${String(hero.name || 'Hero')} ${modeText} for ${normalizeHeroRaceKey(hero.race).toUpperCase()} alignment.`,
  };
}

export function fillHeroLoadoutSlots(prog, heroOrId = null, opts = {}) {
  return optimizeHeroLoadout(prog, heroOrId, { ...opts, fillOnly: true, preferRace: opts?.preferRace !== false });
}
