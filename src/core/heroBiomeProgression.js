import { normalizeEssenceKey } from './hub/hubShared.js';
import { buildCardRewardPayloadForRace } from './cards/cardRewards.js';
import { getHeroBiomeMeta, normalizeHeroBiomeKey } from './heroBiomes.js';
import { getHeroBiomeMasteryXpAward } from './heroBiomeMastery.js';

const TUNING = {
  mecha: {
    room: { gold: 1, essence: 1, dust: 0, shards: 1, copyChance: 0.00, kind: 'skill' },
    elite: { gold: 2, essence: 1, dust: 1, shards: 1, copyChance: 0.02, kind: 'skill' },
    boss: { gold: 5, essence: 2, dust: 2, shards: 3, copyChance: 0.10, kind: 'skill' },
  },
  electric: {
    room: { gold: 0, essence: 1, dust: 0, shards: 1, copyChance: 0.00, kind: 'skill' },
    elite: { gold: 1, essence: 1, dust: 1, shards: 2, copyChance: 0.03, kind: 'skill' },
    boss: { gold: 4, essence: 2, dust: 2, shards: 4, copyChance: 0.12, kind: 'skill' },
  },
  fire: {
    room: { gold: 1, essence: 1, dust: 0, shards: 1, copyChance: 0.00, kind: 'skill' },
    elite: { gold: 2, essence: 1, dust: 1, shards: 2, copyChance: 0.03, kind: 'skill' },
    boss: { gold: 5, essence: 2, dust: 2, shards: 3, copyChance: 0.14, kind: 'skill' },
  },
  ice: {
    room: { gold: 0, essence: 1, dust: 1, shards: 1, copyChance: 0.00, kind: 'passive' },
    elite: { gold: 1, essence: 1, dust: 1, shards: 2, copyChance: 0.03, kind: 'passive' },
    boss: { gold: 4, essence: 2, dust: 3, shards: 3, copyChance: 0.11, kind: 'passive' },
  },
  dark: {
    room: { gold: 1, essence: 0, dust: 1, shards: 1, copyChance: 0.00, kind: 'passive' },
    elite: { gold: 2, essence: 1, dust: 1, shards: 2, copyChance: 0.03, kind: 'passive' },
    boss: { gold: 5, essence: 2, dust: 2, shards: 4, copyChance: 0.12, kind: 'passive' },
  },
  light: {
    room: { gold: 0, essence: 1, dust: 0, shards: 1, copyChance: 0.00, kind: 'passive' },
    elite: { gold: 1, essence: 1, dust: 1, shards: 2, copyChance: 0.02, kind: 'passive' },
    boss: { gold: 4, essence: 3, dust: 2, shards: 3, copyChance: 0.10, kind: 'passive' },
  },
};

function toInt(value, fallback = 0) {
  const n = Math.floor(Number(value) || 0);
  return Number.isFinite(n) ? n : fallback;
}

function addPayloadMapEntry(payload, mapKey, entryKey, amount = 1) {
  const next = Math.max(0, toInt(amount, 0));
  if (!payload || !mapKey || !entryKey || next <= 0) return;
  if (!payload[mapKey] || typeof payload[mapKey] !== 'object') payload[mapKey] = {};
  payload[mapKey][entryKey] = Math.max(0, toInt(payload[mapKey][entryKey], 0) + next);
}

function scaleAmount(base, multiplier = 1) {
  return Math.max(0, Math.round(Math.max(0, Number(base || 0)) * Math.max(0, Number(multiplier || 0))));
}

export function getHeroBiomeRewardTuning(rawBiome) {
  const key = normalizeHeroBiomeKey(rawBiome || 'mecha');
  return TUNING[key] || TUNING.mecha;
}

export function describeHeroBiomeRewardFlow(rawBiome) {
  const key = normalizeHeroBiomeKey(rawBiome || 'mecha');
  const meta = getHeroBiomeMeta(key);
  const tuning = getHeroBiomeRewardTuning(key);
  const room = tuning.room || {};
  const boss = tuning.boss || {};
  return [
    `${meta.label} heroes drip their own biome currency every expedition, not just room-biome currency.`,
    `Room clear resonance: +${Math.max(0, room.essence | 0)} ${meta.short} Essence${Math.max(0, room.shards | 0) ? ` • +${Math.max(0, room.shards | 0)} shard` : ''}${Math.max(0, room.gold | 0) ? ` • +${Math.max(0, room.gold | 0)} Gold` : ''}.`,
    `Boss resonance: +${Math.max(0, boss.essence | 0)} ${meta.short} Essence • +${Math.max(0, boss.dust | 0)} ${meta.short} Dust • +${Math.max(0, boss.shards | 0)} shard${Math.max(0, boss.shards | 0) === 1 ? '' : 's'}${Math.max(0, boss.copyChance || 0) > 0 ? ` • ${Math.round(Math.max(0, boss.copyChance || 0) * 100)}% exact-copy chance` : ''}.`,
    `The same expedition also feeds ${meta.short} mastery, so the hero's fixed biome grows stronger over time even outside direct card drops.`,
  ];
}

export function buildHeroBiomeResonancePayload(rawBiome, rand = Math.random, opts = {}) {
  const biome = normalizeHeroBiomeKey(rawBiome || 'mecha');
  const sourceType = String(opts?.source || 'room').trim().toLowerCase() || 'room';
  const stage = sourceType === 'boss' ? 'boss' : (sourceType === 'elite' ? 'elite' : 'room');
  const floorNumber = Math.max(1, toInt(opts?.floorNumber, 1));
  const sourceBiome = normalizeEssenceKey(opts?.sourceBiome || biome);
  const sameBiomeEncounter = !!sourceBiome && sourceBiome === biome;
  const tuning = getHeroBiomeRewardTuning(biome)[stage] || getHeroBiomeRewardTuning(biome).room || {};
  const multiplier = sameBiomeEncounter ? 1.5 : 1.0;
  const payload = {
    coins: scaleAmount(tuning.gold || 0, multiplier),
    essences: {},
    raceDust: {},
    cardShards: {},
    cardCopies: {},
    heroBiomeXp: {},
    rewardRace: biome,
    resonanceBiome: biome,
    resonanceMatched: sameBiomeEncounter ? 1 : 0,
  };

  addPayloadMapEntry(payload, 'essences', biome, scaleAmount(tuning.essence || 0, multiplier));
  addPayloadMapEntry(payload, 'raceDust', biome, scaleAmount(tuning.dust || 0, multiplier));
  const masteryXp = getHeroBiomeMasteryXpAward({ source: stage, sameBiomeEncounter, floorNumber });
  addPayloadMapEntry(payload, 'heroBiomeXp', biome, masteryXp);

  const shardCount = scaleAmount(tuning.shards || 0, multiplier);
  if (shardCount > 0) {
    const shardPayload = buildCardRewardPayloadForRace(biome, rand, {
      kind: tuning.kind || '',
      shards: shardCount,
      copies: 0,
      includeStarter: true,
      includeSkill: true,
      includePassive: true,
    });
    if (shardPayload?.cardShards) {
      for (const [cardId, amount] of Object.entries(shardPayload.cardShards)) addPayloadMapEntry(payload, 'cardShards', cardId, amount);
    }
  }

  const baseCopyChance = Math.max(0, Number(tuning.copyChance || 0));
  const floorBonus = stage === 'room' ? Math.min(0.06, Math.floor(floorNumber / 4) * 0.01) : Math.min(0.08, Math.floor(floorNumber / 3) * 0.01);
  const resolvedCopyChance = Math.min(0.95, baseCopyChance + floorBonus + (sameBiomeEncounter ? 0.06 : 0));
  if (resolvedCopyChance > 0 && Math.max(0, Math.min(0.999999, Number(rand?.() ?? Math.random()))) < resolvedCopyChance) {
    const copyPayload = buildCardRewardPayloadForRace(biome, rand, {
      kind: tuning.kind || '',
      copies: 1,
      shards: 0,
      includeStarter: false,
      includeSkill: true,
      includePassive: true,
    });
    if (copyPayload?.cardCopies) {
      for (const [cardId, amount] of Object.entries(copyPayload.cardCopies)) addPayloadMapEntry(payload, 'cardCopies', cardId, amount);
    }
  }

  const hasValue = Math.max(0, payload.coins | 0) > 0
    || Object.keys(payload.essences || {}).length > 0
    || Object.keys(payload.raceDust || {}).length > 0
    || Object.keys(payload.cardShards || {}).length > 0
    || Object.keys(payload.cardCopies || {}).length > 0
    || Object.keys(payload.heroBiomeXp || {}).length > 0;
  return hasValue ? payload : null;
}
