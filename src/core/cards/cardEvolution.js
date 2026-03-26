import { ensureAccountProgression } from '../accountProfile.js';
import { ensureCardCollectionState, getCardDefById } from './cardDefs.js';
import { getReservedCardCopyMap } from './cardUpgrade.js';

function toInt(value, fallback = 0) {
  const n = Math.floor(Number(value) || 0);
  return Number.isFinite(n) ? n : fallback;
}

function getMutableCollection(prog) {
  ensureAccountProgression(prog);
  if (!prog?.accountProfile || typeof prog.accountProfile !== 'object') return null;
  prog.accountProfile.cardCollection = ensureCardCollectionState(prog.accountProfile.cardCollection);
  return prog.accountProfile.cardCollection;
}

export function getCardEvolutionStep(cardLike) {
  const baseStars = Math.max(1, toInt(cardLike?.baseStars, 1));
  const currentStars = Math.max(baseStars, toInt(cardLike?.currentStars ?? baseStars, baseStars));
  return Math.max(1, currentStars - baseStars + 1);
}

export function getCardStarEvolutionCost(cardLike) {
  const currentStars = Math.max(1, toInt(cardLike?.currentStars ?? cardLike?.baseStars, 1));
  const step = getCardEvolutionStep(cardLike);
  const level = Math.max(1, toInt(cardLike?.level, 1));
  return {
    gold: Math.max(120, 120 + currentStars * 85 + level * 12 + (step - 1) * 70),
    essence: Math.max(2, currentStars + step - 1),
    duplicates: step,
  };
}

export function getProtectedCopiesForEvolution(prog, cardId) {
  const reserved = getReservedCardCopyMap(prog);
  const reservedCopies = Math.max(0, toInt(reserved?.[String(cardId || '').trim()], 0));
  return Math.max(1, reservedCopies);
}

export function getAvailableExactDuplicateCopies(prog, cardId) {
  const collection = getMutableCollection(prog);
  const id = String(cardId || '').trim();
  const state = collection?.cards?.[id];
  if (!collection || !state) return 0;
  const copiesOwned = Math.max(0, toInt(state.copiesOwned, 0));
  const protectedCopies = getProtectedCopiesForEvolution(prog, id);
  return Math.max(0, copiesOwned - protectedCopies);
}

export function getCardEvolutionPreview(prog, targetCardId) {
  const collection = getMutableCollection(prog);
  const targetId = String(targetCardId || '').trim();
  const target = collection?.cards?.[targetId] || null;
  const def = getCardDefById(targetId);
  if (!collection || !target || !def) {
    return {
      ok: false,
      canEvolve: false,
      reason: 'Card not owned.',
      target: null,
      targetDef: null,
      cost: { gold: 0, essence: 0, duplicates: 0 },
      currentStars: 0,
      nextStars: 0,
      maxStars: 0,
      availableGold: Math.max(0, toInt(prog?.coins, 0)),
      availableEssence: 0,
      availableDuplicates: 0,
      protectedCopies: 1,
    };
  }

  const currentStars = Math.max(def.baseStars, toInt(target.currentStars ?? def.baseStars, def.baseStars));
  const maxStars = Math.max(currentStars, toInt(def.maxStars, currentStars));
  const cost = getCardStarEvolutionCost(target);
  const availableGold = Math.max(0, toInt(prog?.coins, 0));
  const availableEssence = Math.max(0, toInt(prog?.essences?.[target.race], 0));
  const protectedCopies = getProtectedCopiesForEvolution(prog, targetId);
  const availableDuplicates = getAvailableExactDuplicateCopies(prog, targetId);
  const reasons = [];

  if (currentStars >= maxStars) reasons.push('star cap reached');
  if (availableGold < cost.gold) reasons.push('not enough Gold');
  if (availableEssence < cost.essence) reasons.push(`not enough ${String(target.race || 'mecha')} essence`);
  if (availableDuplicates < cost.duplicates) reasons.push('not enough exact duplicate copies');

  const ok = !reasons.length;
  return {
    ok,
    canEvolve: ok,
    reason: ok ? '' : reasons.join(' • '),
    target,
    targetDef: def,
    cost,
    currentStars,
    nextStars: Math.min(maxStars, currentStars + 1),
    maxStars,
    availableGold,
    availableEssence,
    availableDuplicates,
    protectedCopies,
  };
}

export function evolveCardStarsOnce(prog, targetCardId) {
  const preview = getCardEvolutionPreview(prog, targetCardId);
  if (!preview.canEvolve || !preview.target) {
    return {
      ok: false,
      message: preview.reason ? `Evolution blocked: ${preview.reason}.` : 'Evolution blocked.',
      preview,
    };
  }

  const collection = getMutableCollection(prog);
  const target = collection?.cards?.[preview.target.cardId];
  if (!collection || !target) {
    return { ok: false, message: 'Evolution blocked: card state missing.', preview };
  }

  prog.coins = Math.max(0, Math.max(0, toInt(prog?.coins, 0)) - preview.cost.gold);
  if (!prog.essences || typeof prog.essences !== 'object') prog.essences = {};
  prog.essences[target.race] = Math.max(0, Math.max(0, toInt(prog.essences?.[target.race], 0)) - preview.cost.essence);
  target.currentStars = Math.min(preview.maxStars, Math.max(1, toInt(target.currentStars, 1)) + 1);
  target.copiesOwned = Math.max(preview.protectedCopies, Math.max(0, toInt(target.copiesOwned, 0)) - preview.cost.duplicates);

  return {
    ok: true,
    message: `${String(preview.targetDef?.name || 'Card')} evolved to ${'★'.repeat(Math.max(1, toInt(target.currentStars, 1)))}. Consumed exact duplicate x${preview.cost.duplicates}.`,
    preview: getCardEvolutionPreview(prog, targetCardId),
  };
}
