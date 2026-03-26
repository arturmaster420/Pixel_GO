import { ensureAccountProgression } from '../accountProfile.js';
import { ensureCardCollectionState, getCardDefById, getOwnedCardState, grantCardCopies } from './cardDefs.js';
import { getCardShardCount } from './cardRewards.js';

function toInt(value, fallback = 0) {
  const n = Math.floor(Number(value) || 0);
  return Number.isFinite(n) ? n : fallback;
}

function getMutableCollection(prog) {
  ensureAccountProgression(prog);
  const collection = ensureCardCollectionState(prog?.accountProfile?.cardCollection);
  prog.accountProfile.cardCollection = collection;
  return collection;
}

function getMutableDustWallet(prog) {
  ensureAccountProgression(prog);
  const wallet = prog?.accountProfile?.sharedResources?.raceDust && typeof prog.accountProfile.sharedResources.raceDust === 'object'
    ? prog.accountProfile.sharedResources.raceDust
    : {};
  prog.accountProfile.sharedResources.raceDust = { mecha: 0, electric: 0, fire: 0, ice: 0, dark: 0, light: 0, ...wallet };
  return prog.accountProfile.sharedResources.raceDust;
}

function buildCraftCost(target, def) {
  const baseStars = Math.max(1, toInt(def?.baseStars, 1));
  const currentStars = Math.max(baseStars, toInt(target?.currentStars, baseStars));
  const extraStars = Math.max(0, currentStars - baseStars);
  return {
    gold: 50 + (baseStars * 35) + (extraStars * 25),
    essence: 1 + baseStars + extraStars,
    dust: 3 + (baseStars * 2) + (extraStars * 2),
    shards: 8 + (baseStars * 4) + (currentStars * 2),
  };
}

export function getCardCraftPreview(prog, cardId) {
  ensureAccountProgression(prog);
  const collection = getMutableCollection(prog);
  const dustWallet = getMutableDustWallet(prog);
  const id = String(cardId || '').trim();
  const def = getCardDefById(id);
  const target = getOwnedCardState(collection, id);
  if (!def || !target || toInt(target.copiesOwned, 0) <= 0) {
    return {
      ok: false,
      canCraft: false,
      targetDef: def || null,
      target: target || null,
      cost: { gold: 0, essence: 0, dust: 0, shards: 0 },
      availableGold: Math.max(0, toInt(prog?.coins, 0)),
      availableEssence: 0,
      availableDust: 0,
      availableShards: 0,
      nextCopiesOwned: Math.max(0, toInt(target?.copiesOwned, 0)),
      reason: 'Card not owned yet.',
    };
  }
  const cost = buildCraftCost(target, def);
  const availableGold = Math.max(0, toInt(prog?.coins, 0));
  const availableEssence = Math.max(0, toInt(prog?.essences?.[target.race], 0));
  const availableDust = Math.max(0, toInt(dustWallet?.[target.race], 0));
  const availableShards = Math.max(0, getCardShardCount(collection, def.cardId));
  const reasons = [];
  if (availableGold < cost.gold) reasons.push('not enough Gold');
  if (availableEssence < cost.essence) reasons.push('not enough same-biome Essence');
  if (availableDust < cost.dust) reasons.push('not enough same-biome Dust');
  if (availableShards < cost.shards) reasons.push('not enough exact card shards');
  return {
    ok: !reasons.length,
    canCraft: !reasons.length,
    targetDef: def,
    target,
    cost,
    availableGold,
    availableEssence,
    availableDust,
    availableShards,
    nextCopiesOwned: Math.max(0, toInt(target.copiesOwned, 0)) + 1,
    reason: reasons.join(' • '),
  };
}

export function craftCardCopyFromShards(prog, cardId) {
  const preview = getCardCraftPreview(prog, cardId);
  if (!preview.canCraft || !preview.target || !preview.targetDef) {
    return { ok: false, message: preview.reason ? `Forge blocked: ${preview.reason}.` : 'Forge blocked.', preview };
  }
  const collection = getMutableCollection(prog);
  const dustWallet = getMutableDustWallet(prog);
  prog.coins = Math.max(0, toInt(prog.coins, 0) - preview.cost.gold);
  prog.essences[preview.target.race] = Math.max(0, toInt(prog?.essences?.[preview.target.race], 0) - preview.cost.essence);
  dustWallet[preview.target.race] = Math.max(0, toInt(dustWallet?.[preview.target.race], 0) - preview.cost.dust);
  const nextShards = Math.max(0, getCardShardCount(collection, preview.targetDef.cardId) - preview.cost.shards);
  collection.shards[preview.targetDef.cardId] = nextShards;
  grantCardCopies(collection, preview.targetDef.cardId, 1);
  const updated = getOwnedCardState(collection, preview.targetDef.cardId);
  return {
    ok: true,
    message: `${String(preview.targetDef.name || 'Card')} forged into +1 exact copy. -${preview.cost.shards} shards • -${preview.cost.dust} ${String(preview.target.race || 'mecha')} Dust • -${preview.cost.essence} Essence • -${preview.cost.gold} Gold.`,
    preview: getCardCraftPreview(prog, cardId),
    target: updated,
  };
}
