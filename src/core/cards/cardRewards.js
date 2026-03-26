import { ensureAccountProgression, normalizeHeroRaceKey } from '../accountProfile.js';
import { ensureCardCollectionState, getCardDefById, grantCardCopies, listCardDefs } from './cardDefs.js';

function toInt(value, fallback = 0) {
  const n = Math.floor(Number(value) || 0);
  return Number.isFinite(n) ? n : fallback;
}

export function grantCardShards(collection, cardId, amount = 1) {
  const add = Math.max(0, toInt(amount, 0));
  if (!add || !collection || typeof collection !== 'object') return 0;
  const normalized = ensureCardCollectionState(collection);
  const def = getCardDefById(cardId);
  if (!def) return 0;
  normalized.shards[def.cardId] = Math.max(0, toInt(normalized.shards[def.cardId], 0) + add);
  Object.assign(collection, normalized);
  return normalized.shards[def.cardId] | 0;
}

export function getCardShardCount(collection, cardId) {
  const normalized = ensureCardCollectionState(collection);
  const def = getCardDefById(cardId);
  if (!def) return 0;
  return Math.max(0, toInt(normalized.shards?.[def.cardId], 0));
}

export function getTotalCardShardCount(collection) {
  const normalized = ensureCardCollectionState(collection);
  return Object.values(normalized.shards || {}).reduce((sum, raw) => sum + Math.max(0, toInt(raw, 0)), 0);
}

export function listCardDefsForRace(race, opts = {}) {
  const normalizedRace = normalizeHeroRaceKey(race || 'mecha');
  const kind = String(opts?.kind || '').trim().toLowerCase();
  const includeStarter = opts?.includeStarter !== false;
  const includePassive = opts?.includePassive !== false;
  const includeSkill = opts?.includeSkill !== false;
  return listCardDefs().filter((def) => {
    if (!def || def.race !== normalizedRace) return false;
    if (!includeStarter && def.isStarterCore) return false;
    if (def.kind === 'skill' && !includeSkill) return false;
    if (def.kind === 'passive' && !includePassive) return false;
    if (kind && def.kind !== kind) return false;
    return true;
  });
}

export function pickRandomCardDefForRace(race, rand = Math.random, opts = {}) {
  const defs = listCardDefsForRace(race, opts);
  if (!defs.length) return null;
  const roll = Math.max(0, Math.min(0.999999, Number(rand?.() ?? Math.random())));
  const idx = Math.floor(roll * defs.length);
  return defs[idx] || defs[0] || null;
}

export function buildCardRewardPayloadForRace(race, rand = Math.random, opts = {}) {
  const normalizedRace = normalizeHeroRaceKey(race || 'mecha');
  const shardCount = Math.max(0, toInt(opts?.shards, 0));
  const copyCount = Math.max(0, toInt(opts?.copies, 0));
  if (shardCount <= 0 && copyCount <= 0) return null;
  const preferKind = String(opts?.kind || '').trim().toLowerCase();
  const def = pickRandomCardDefForRace(normalizedRace, rand, {
    kind: preferKind,
    includeStarter: opts?.includeStarter !== false,
    includePassive: opts?.includePassive !== false,
    includeSkill: opts?.includeSkill !== false,
  }) || pickRandomCardDefForRace(normalizedRace, rand, { includeStarter: true, includePassive: true, includeSkill: true });
  if (!def) return null;
  const payload = {};
  if (shardCount > 0) payload.cardShards = { [def.cardId]: shardCount };
  if (copyCount > 0) payload.cardCopies = { [def.cardId]: copyCount };
  payload.rewardRace = normalizedRace;
  return payload;
}

export function applyCardRewardPayload(prog, payload) {
  if (!prog || typeof prog !== 'object' || !payload || typeof payload !== 'object') {
    return { changed: false, lines: [] };
  }
  ensureAccountProgression(prog);
  const collection = ensureCardCollectionState(prog?.accountProfile?.cardCollection);
  prog.accountProfile.cardCollection = collection;
  let changed = false;
  const lines = [];

  const shards = payload.cardShards && typeof payload.cardShards === 'object' ? payload.cardShards : {};
  for (const [rawCardId, rawAmt] of Object.entries(shards)) {
    const def = getCardDefById(rawCardId);
    const amount = Math.max(0, toInt(rawAmt, 0));
    if (!def || amount <= 0) continue;
    grantCardShards(collection, def.cardId, amount);
    changed = true;
    lines.push(`+${amount} ${def.name} Shard${amount === 1 ? '' : 's'}`);
  }

  const copies = payload.cardCopies && typeof payload.cardCopies === 'object' ? payload.cardCopies : {};
  for (const [rawCardId, rawAmt] of Object.entries(copies)) {
    const def = getCardDefById(rawCardId);
    const amount = Math.max(0, toInt(rawAmt, 0));
    if (!def || amount <= 0) continue;
    grantCardCopies(collection, def.cardId, amount);
    changed = true;
    lines.push(`+${amount} ${def.name} Cop${amount === 1 ? 'y' : 'ies'}`);
  }

  return { changed, lines };
}
