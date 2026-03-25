import { ensureAccountProgression, defaultRaceDust } from '../accountProfile.js';
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

function getMutableRaceDustWallet(prog) {
  ensureAccountProgression(prog);
  if (!prog?.accountProfile || typeof prog.accountProfile !== 'object') return null;
  if (!prog.accountProfile.sharedResources || typeof prog.accountProfile.sharedResources !== 'object') prog.accountProfile.sharedResources = {};
  const current = prog.accountProfile.sharedResources.raceDust && typeof prog.accountProfile.sharedResources.raceDust === 'object'
    ? prog.accountProfile.sharedResources.raceDust
    : defaultRaceDust();
  prog.accountProfile.sharedResources.raceDust = { ...defaultRaceDust(), ...current };
  return prog.accountProfile.sharedResources.raceDust;
}

export function getProtectedCopiesForDismantle(prog, cardId) {
  const reserved = getReservedCardCopyMap(prog);
  const reservedCopies = Math.max(0, toInt(reserved?.[String(cardId || '').trim()], 0));
  return Math.max(1, reservedCopies);
}

export function getAvailableCopiesForDismantle(prog, cardId) {
  const collection = getMutableCollection(prog);
  const id = String(cardId || '').trim();
  const state = collection?.cards?.[id];
  if (!collection || !state) return 0;
  return Math.max(0, toInt(state.copiesOwned, 0) - getProtectedCopiesForDismantle(prog, id));
}

export function getCardDismantleRewards(cardLike) {
  const rarity = Math.max(1, toInt(cardLike?.rarityBase ?? cardLike?.baseStars, 1));
  const stars = Math.max(rarity, toInt(cardLike?.currentStars ?? rarity, rarity));
  const level = Math.max(1, toInt(cardLike?.level, 1));
  const levelBonus = Math.floor((level - 1) / 2);
  return {
    dust: Math.max(4, 4 + rarity * 4 + Math.max(0, stars - rarity) * 5 + levelBonus),
    essence: Math.max(1, 1 + Math.max(0, rarity - 1) + Math.max(0, stars - rarity)),
  };
}

export function getCardDismantlePreview(prog, targetCardId) {
  const collection = getMutableCollection(prog);
  const targetId = String(targetCardId || '').trim();
  const target = collection?.cards?.[targetId] || null;
  const def = getCardDefById(targetId);
  const raceDust = getMutableRaceDustWallet(prog);
  if (!collection || !target || !def) {
    return {
      ok: false,
      canDismantle: false,
      reason: 'Card not owned.',
      target: null,
      targetDef: null,
      rewards: { dust: 0, essence: 0 },
      protectedCopies: 1,
      availableCopies: 0,
      walletDust: 0,
      walletEssence: 0,
    };
  }

  const protectedCopies = getProtectedCopiesForDismantle(prog, targetId);
  const availableCopies = getAvailableCopiesForDismantle(prog, targetId);
  const rewards = getCardDismantleRewards(target);
  const walletDust = Math.max(0, toInt(raceDust?.[target.race], 0));
  const walletEssence = Math.max(0, toInt(prog?.essences?.[target.race], 0));
  const reasons = [];

  if (availableCopies <= 0) reasons.push('no free copy beyond protected loadout/last copy');

  const ok = !reasons.length;
  return {
    ok,
    canDismantle: ok,
    reason: ok ? '' : reasons.join(' • '),
    target,
    targetDef: def,
    rewards,
    protectedCopies,
    availableCopies,
    walletDust,
    walletEssence,
  };
}

export function dismantleCardCopyOnce(prog, targetCardId) {
  const preview = getCardDismantlePreview(prog, targetCardId);
  if (!preview.canDismantle || !preview.target) {
    return {
      ok: false,
      message: preview.reason ? `Dismantle blocked: ${preview.reason}.` : 'Dismantle blocked.',
      preview,
    };
  }

  const collection = getMutableCollection(prog);
  const raceDust = getMutableRaceDustWallet(prog);
  const target = collection?.cards?.[preview.target.cardId];
  if (!collection || !raceDust || !target) {
    return { ok: false, message: 'Dismantle blocked: card state missing.', preview };
  }

  target.copiesOwned = Math.max(preview.protectedCopies, Math.max(0, toInt(target.copiesOwned, 0)) - 1);
  raceDust[target.race] = Math.max(0, toInt(raceDust[target.race], 0)) + Math.max(0, toInt(preview.rewards.dust, 0));
  if (!prog.essences || typeof prog.essences !== 'object') prog.essences = {};
  prog.essences[target.race] = Math.max(0, toInt(prog.essences?.[target.race], 0)) + Math.max(0, toInt(preview.rewards.essence, 0));

  return {
    ok: true,
    message: `${String(preview.targetDef?.name || 'Card')} dismantled into +${preview.rewards.dust} ${(target.race || 'mecha')} Dust and +${preview.rewards.essence} ${(target.race || 'mecha')} Essence.`,
    preview: getCardDismantlePreview(prog, targetCardId),
  };
}


export function getMassDismantlePreview(prog, cardIds = []) {
  const ids = [...new Set((Array.isArray(cardIds) ? cardIds : []).map((id) => String(id || '').trim()).filter(Boolean))];
  const entries = [];
  let totalCopies = 0;
  let totalDust = 0;
  let totalEssence = 0;
  for (const id of ids) {
    const preview = getCardDismantlePreview(prog, id);
    if (!preview?.target || !preview?.targetDef) continue;
    const count = Math.max(0, toInt(preview.availableCopies, 0));
    if (count <= 0) continue;
    const dust = Math.max(0, toInt(preview.rewards?.dust, 0)) * count;
    const essence = Math.max(0, toInt(preview.rewards?.essence, 0)) * count;
    entries.push({
      cardId: id,
      name: String(preview.targetDef.name || id),
      race: String(preview.target.race || 'mecha'),
      copies: count,
      dust,
      essence,
    });
    totalCopies += count;
    totalDust += dust;
    totalEssence += essence;
  }
  return {
    ok: entries.length > 0,
    entries,
    totalCards: entries.length,
    totalCopies,
    totalDust,
    totalEssence,
    reason: entries.length ? '' : 'No free copies in the current selection.',
  };
}

export function dismantleCardsBatch(prog, cardIds = []) {
  const preview = getMassDismantlePreview(prog, cardIds);
  if (!preview.ok) return { ok: false, message: preview.reason || 'Mass dismantle blocked.', preview };
  const collection = getMutableCollection(prog);
  const raceDust = getMutableRaceDustWallet(prog);
  if (!collection || !raceDust) return { ok: false, message: 'Mass dismantle blocked: missing card wallets.', preview };
  if (!prog.essences || typeof prog.essences !== 'object') prog.essences = {};

  for (const entry of preview.entries) {
    const state = collection?.cards?.[entry.cardId];
    if (!state) continue;
    const protectedCopies = getProtectedCopiesForDismantle(prog, entry.cardId);
    const removeCopies = Math.max(0, Math.min(entry.copies, Math.max(0, toInt(state.copiesOwned, 0) - protectedCopies)));
    if (removeCopies <= 0) continue;
    state.copiesOwned = Math.max(protectedCopies, Math.max(0, toInt(state.copiesOwned, 0) - removeCopies));
    raceDust[entry.race] = Math.max(0, toInt(raceDust?.[entry.race], 0)) + Math.max(0, entry.dust);
    prog.essences[entry.race] = Math.max(0, toInt(prog.essences?.[entry.race], 0)) + Math.max(0, entry.essence);
  }

  return {
    ok: true,
    message: `Mass dismantle complete: ${preview.totalCopies} free cop${preview.totalCopies === 1 ? 'y' : 'ies'} converted into +${preview.totalDust} Dust and +${preview.totalEssence} Essence.`,
    preview: getMassDismantlePreview(prog, cardIds),
  };
}
