import { ensureAccountProgression } from '../accountProfile.js';
import { ensureCardCollectionState, getCardDefById } from './cardDefs.js';

function toInt(value, fallback = 0) {
  const n = Math.floor(Number(value) || 0);
  return Number.isFinite(n) ? n : fallback;
}

export function getCardLevelCap(cardLike) {
  const stars = Math.max(1, toInt(cardLike?.currentStars ?? cardLike?.baseStars, 1));
  return 5 + stars * 5;
}

export function getCardLevelUpCost(cardLike) {
  const level = Math.max(1, toInt(cardLike?.level, 1));
  const stars = Math.max(1, toInt(cardLike?.currentStars ?? cardLike?.baseStars, 1));
  return {
    gold: Math.max(30, 30 + (level - 1) * 15 + stars * 10),
    essence: Math.max(1, Math.ceil(level / 5)),
    feederCopies: 1,
  };
}

export function getReservedCardCopyMap(prog) {
  ensureAccountProgression(prog);
  const reserved = Object.create(null);
  for (const hero of Array.isArray(prog?.heroes) ? prog.heroes : []) {
    const skillIds = Array.isArray(hero?.equippedSkillCards) ? hero.equippedSkillCards : [];
    const passiveIds = Array.isArray(hero?.equippedPassiveCards) ? hero.equippedPassiveCards : [];
    for (const rawId of [...skillIds, ...passiveIds]) {
      const id = String(rawId || '').trim();
      if (!id) continue;
      reserved[id] = Math.max(0, toInt(reserved[id], 0)) + 1;
    }
  }
  return reserved;
}

function getMutableCollection(prog) {
  ensureAccountProgression(prog);
  if (!prog.accountProfile || typeof prog.accountProfile !== 'object') return null;
  prog.accountProfile.cardCollection = ensureCardCollectionState(prog.accountProfile.cardCollection);
  return prog.accountProfile.cardCollection;
}

export function getAvailableCopiesForCard(prog, cardId) {
  const collection = getMutableCollection(prog);
  if (!collection) return 0;
  const id = String(cardId || '').trim();
  const state = collection.cards?.[id];
  if (!state) return 0;
  const reserved = getReservedCardCopyMap(prog);
  return Math.max(0, toInt(state.copiesOwned, 0) - toInt(reserved[id], 0));
}

export function listCardFeedCandidates(prog, targetCardId) {
  const collection = getMutableCollection(prog);
  const targetDef = getCardDefById(targetCardId);
  if (!collection || !targetDef) return [];
  const reserved = getReservedCardCopyMap(prog);
  const out = [];
  for (const [cardId, state] of Object.entries(collection.cards || {})) {
    if (cardId === targetDef.cardId) continue;
    const def = getCardDefById(cardId);
    if (!def || def.race !== targetDef.race) continue;
    const copiesOwned = Math.max(0, toInt(state?.copiesOwned, 0));
    const reservedCopies = Math.max(0, toInt(reserved[cardId], 0));
    const availableCopies = Math.max(0, copiesOwned - reservedCopies);
    if (availableCopies <= 0) continue;
    out.push({
      ...def,
      ...state,
      reservedCopies,
      availableCopies,
    });
  }
  out.sort((a, b) =>
    Math.max(1, toInt(a.currentStars, 1)) - Math.max(1, toInt(b.currentStars, 1))
    || Math.max(1, toInt(a.level, 1)) - Math.max(1, toInt(b.level, 1))
    || Math.max(0, toInt(a.copiesOwned, 0)) - Math.max(0, toInt(b.copiesOwned, 0))
    || String(a.name || a.sourceKey || '').localeCompare(String(b.name || b.sourceKey || ''))
  );
  return out;
}

export function getSuggestedCardFeeder(prog, targetCardId) {
  return listCardFeedCandidates(prog, targetCardId)[0] || null;
}

export function getCardUpgradePreview(prog, targetCardId) {
  const collection = getMutableCollection(prog);
  const targetId = String(targetCardId || '').trim();
  const target = collection?.cards?.[targetId] || null;
  const def = getCardDefById(targetId);
  if (!collection || !target || !def) {
    return {
      ok: false,
      canUpgrade: false,
      reason: 'Card not owned.',
      target: null,
      targetDef: null,
      cost: { gold: 0, essence: 0, feederCopies: 1 },
      levelCap: 0,
      nextLevel: 0,
      feeder: null,
      feederCandidates: [],
      availableGold: Math.max(0, toInt(prog?.coins, 0)),
      availableEssence: 0,
      availableFeederCopies: 0,
    };
  }

  const cost = getCardLevelUpCost(target);
  const levelCap = getCardLevelCap(target);
  const feederCandidates = listCardFeedCandidates(prog, targetId);
  const feeder = feederCandidates[0] || null;
  const availableGold = Math.max(0, toInt(prog?.coins, 0));
  const availableEssence = Math.max(0, toInt(prog?.essences?.[target.race], 0));
  const availableFeederCopies = feederCandidates.reduce((sum, entry) => sum + Math.max(0, toInt(entry.availableCopies, 0)), 0);
  const reasons = [];

  if (Math.max(1, toInt(target.level, 1)) >= levelCap) reasons.push('level cap reached');
  if (availableGold < cost.gold) reasons.push('not enough Gold');
  if (availableEssence < cost.essence) reasons.push(`not enough ${String(target.race || 'mecha')} essence`);
  if (availableFeederCopies < cost.feederCopies || !feeder) reasons.push('no free same-biome feeder copy');

  const ok = !reasons.length;
  return {
    ok,
    canUpgrade: ok,
    reason: ok ? '' : reasons.join(' • '),
    target,
    targetDef: def,
    cost,
    levelCap,
    nextLevel: Math.min(levelCap, Math.max(1, toInt(target.level, 1)) + 1),
    feeder,
    feederCandidates,
    availableGold,
    availableEssence,
    availableFeederCopies,
  };
}

export function levelUpCardOnce(prog, targetCardId) {
  const preview = getCardUpgradePreview(prog, targetCardId);
  if (!preview.canUpgrade || !preview.target || !preview.feeder) {
    return {
      ok: false,
      message: preview.reason ? `Level up blocked: ${preview.reason}.` : 'Level up blocked.',
      preview,
    };
  }

  const collection = getMutableCollection(prog);
  const target = collection?.cards?.[preview.target.cardId];
  const feeder = collection?.cards?.[preview.feeder.cardId];
  if (!collection || !target || !feeder) {
    return { ok: false, message: 'Level up blocked: card state missing.', preview };
  }

  prog.coins = Math.max(0, Math.max(0, toInt(prog?.coins, 0)) - preview.cost.gold);
  if (!prog.essences || typeof prog.essences !== 'object') prog.essences = {};
  prog.essences[target.race] = Math.max(0, Math.max(0, toInt(prog.essences?.[target.race], 0)) - preview.cost.essence);
  target.level = Math.min(preview.levelCap, Math.max(1, toInt(target.level, 1)) + 1);
  feeder.copiesOwned = Math.max(0, Math.max(0, toInt(feeder.copiesOwned, 0)) - preview.cost.feederCopies);

  return {
    ok: true,
    message: `${String(preview.targetDef?.name || 'Card')} level ${Math.max(1, toInt(target.level, 1))}. Consumed ${String(preview.feeder?.name || 'feeder')} x${preview.cost.feederCopies}.`,
    preview: getCardUpgradePreview(prog, targetCardId),
  };
}
