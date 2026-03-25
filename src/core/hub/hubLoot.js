import { clampInt, getBiomeCompatibleGearDefs, getBiomeLootProfile, getBiomePreferredGearDefs, getEssenceLabel, getHubGearDef } from "./hubShared.js";
import { ensureHubProgression } from "./hubBuildState.js";
import { addEssence, addMaterial, getMaterialMeta, normalizeEssenceKey, normalizeMaterialKey } from "./hubResources.js";
import { addGearPart, addOwnedGear, isHubGearOwned } from "./hubGear.js";
import { applyCardRewardPayload, buildCardRewardPayloadForRace } from "../cards/cardRewards.js";
import { ensureAccountProgression, getActiveHero, grantHeroBiomeMasteryXp } from "../accountProfile.js";
import { buildHeroBiomeResonancePayload } from "../heroBiomeProgression.js";

function addPayloadMapEntry(payload, mapKey, entryKey, amount = 1) {
  const next = Math.max(0, clampInt(amount, 0, 9999999));
  if (!entryKey || next <= 0) return;
  if (!payload[mapKey] || typeof payload[mapKey] !== 'object') payload[mapKey] = {};
  payload[mapKey][entryKey] = Math.max(0, (payload[mapKey][entryKey] | 0) + next);
}

function pickLootDef(defs, rand = Math.random) {
  if (!Array.isArray(defs) || !defs.length) return null;
  const idx = Math.floor(Math.max(0, rand()) * defs.length) % defs.length;
  return defs[idx] || defs[0] || null;
}

function mergePayloadMap(target, source, mapKey) {
  const src = source?.[mapKey] && typeof source[mapKey] === 'object' ? source[mapKey] : {};
  for (const [entryKey, rawAmt] of Object.entries(src)) addPayloadMapEntry(target, mapKey, entryKey, rawAmt);
}

function mergeProgPayload(target, source) {
  if (!target || !source || typeof source !== 'object') return target;
  target.coins = Math.max(0, (target.coins | 0) + Math.max(0, clampInt(source.coins, 0, 9999999)));
  mergePayloadMap(target, source, 'essences');
  mergePayloadMap(target, source, 'raceDust');
  mergePayloadMap(target, source, 'materials');
  mergePayloadMap(target, source, 'gearParts');
  mergePayloadMap(target, source, 'gearItems');
  mergePayloadMap(target, source, 'cardShards');
  mergePayloadMap(target, source, 'cardCopies');
  mergePayloadMap(target, source, 'heroBiomeXp');
  return target;
}

export function rollHubLootForRoom(room, prog, rand = Math.random) {
  ensureHubProgression(prog);
  const biomeKey = normalizeEssenceKey(room?.biomeKey || "");
  const isBoss = !!room?.isFloorFinal;
  const floorNumber = Math.max(1, Number(room?.floorNumber || 1) | 0);
  const profile = getBiomeLootProfile(biomeKey);
  const preferredDefs = getBiomePreferredGearDefs(biomeKey);
  const compatibleDefs = getBiomeCompatibleGearDefs(biomeKey);
  const payload = { coins: Math.max(4, (isBoss ? 16 : 6) + floorNumber * (isBoss ? 3 : 1)), essences: { [biomeKey]: isBoss ? 3 : 1 }, raceDust: {}, materials: {}, gearParts: {}, gearItems: {}, cardShards: {}, cardCopies: {} };

  addPayloadMapEntry(payload, 'raceDust', biomeKey, isBoss ? 3 + Math.floor(floorNumber / 3) : (1 + ((floorNumber - 1) >= 4 ? 1 : 0)));

  const shardPayload = buildCardRewardPayloadForRace(biomeKey, rand, {
    shards: isBoss ? (2 + Math.min(2, Math.floor(floorNumber / 5))) : (rand() < 0.38 ? 1 : 0),
    includeStarter: true,
    includeSkill: true,
    includePassive: true,
  });
  if (shardPayload?.cardShards) {
    for (const [cardId, amt] of Object.entries(shardPayload.cardShards)) addPayloadMapEntry(payload, 'cardShards', cardId, amt);
  }

  if (isBoss || rand() < Math.min(0.42, 0.12 + floorNumber * 0.02)) {
    const copyPayload = buildCardRewardPayloadForRace(biomeKey, rand, {
      copies: isBoss ? 1 : (rand() < 0.45 ? 1 : 0),
      includeStarter: !isBoss,
      includeSkill: true,
      includePassive: true,
    });
    if (copyPayload?.cardCopies) {
      for (const [cardId, amt] of Object.entries(copyPayload.cardCopies)) addPayloadMapEntry(payload, 'cardCopies', cardId, amt);
    }
  }

  const baseMaterials = isBoss ? (profile.bossMaterials || {}) : (profile.roomMaterials || {});
  for (const [materialKey, rawAmt] of Object.entries(baseMaterials)) {
    const amt = Math.max(0, clampInt(rawAmt, 0, 9999));
    if (amt > 0) payload.materials[materialKey] = Math.max(0, (payload.materials[materialKey] | 0) + amt);
  }
  if (isBoss) {
    const forced = pickLootDef(preferredDefs, rand);
    if (forced) payload.gearParts[forced.key] = Math.max(0, (payload.gearParts[forced.key] | 0) + 1);
  }

  const chanceMap = profile.roomBonusChances || {};
  for (const [materialKey, rawChance] of Object.entries(chanceMap)) {
    const chance = Number(rawChance || 0);
    if (!Number.isFinite(chance) || chance <= 0) continue;
    if (rand() < chance) payload.materials[materialKey] = Math.max(0, (payload.materials[materialKey] | 0) + 1);
  }

  let partRolls = isBoss ? Math.max(1, clampInt(profile.bossPartRolls, 1, 12)) : (rand() < Number(profile.roomPartChance || 0) ? 1 : 0);
  while (partRolls-- > 0) {
    const usePreferred = preferredDefs.length && (isBoss || rand() < 0.72);
    const def = pickLootDef(usePreferred ? preferredDefs : compatibleDefs, rand) || pickLootDef(compatibleDefs, rand);
    if (!def) continue;
    payload.gearParts[def.key] = Math.max(0, (payload.gearParts[def.key] | 0) + 1);
  }

  const bossItemChance = Number(profile.bossItemChance || 0);
  if (isBoss && compatibleDefs.length && rand() < bossItemChance) {
    const def = pickLootDef(preferredDefs.length ? preferredDefs : compatibleDefs, rand);
    if (def) payload.gearItems[def.key] = Math.max(0, (payload.gearItems[def.key] | 0) + 1);
  }

  const activeHero = getActiveHero(prog);
  const heroBiome = String(activeHero?.race || prog?.activeHeroRace || prog?.selectedStarterLoadout || biomeKey || 'mecha');
  const resonancePayload = buildHeroBiomeResonancePayload(heroBiome, rand, {
    source: isBoss ? 'boss' : 'room',
    floorNumber,
    sourceBiome: biomeKey,
  });
  if (resonancePayload) mergeProgPayload(payload, resonancePayload);
  return payload;
}

export function applyHubProgressionLoot(prog, payload) {
  ensureHubProgression(prog);
  ensureAccountProgression(prog);
  const out = { changed: false, lines: [] };
  const coinGain = Math.max(0, clampInt(payload?.coins, 0, 9999999));
  if (coinGain > 0) {
    prog.coins = Math.max(0, (prog.coins | 0) + coinGain);
    out.changed = true;
    out.lines.push(`+${coinGain} Gold`);
  }
  const essences = payload?.essences && typeof payload.essences === "object" ? payload.essences : {};
  for (const [rawKey, rawAmt] of Object.entries(essences)) {
    const amt = Math.max(0, clampInt(rawAmt, 0, 9999999));
    if (amt <= 0) continue;
    const key = normalizeEssenceKey(rawKey);
    addEssence(prog, key, amt);
    out.changed = true;
    out.lines.push(`+${amt} ${getEssenceLabel(key)}`);
  }
  const raceDust = payload?.raceDust && typeof payload.raceDust === 'object' ? payload.raceDust : {};
  const dustWallet = prog?.accountProfile?.sharedResources?.raceDust && typeof prog.accountProfile.sharedResources.raceDust === 'object'
    ? prog.accountProfile.sharedResources.raceDust
    : null;
  for (const [rawKey, rawAmt] of Object.entries(raceDust)) {
    const amt = Math.max(0, clampInt(rawAmt, 0, 9999999));
    if (amt <= 0 || !dustWallet) continue;
    const key = normalizeEssenceKey(rawKey);
    dustWallet[key] = Math.max(0, (dustWallet[key] | 0) + amt);
    out.changed = true;
    out.lines.push(`+${amt} ${getEssenceLabel(key)} Dust`);
  }
  const materials = payload?.materials && typeof payload.materials === "object" ? payload.materials : {};
  for (const [rawKey, rawAmt] of Object.entries(materials)) {
    const amt = Math.max(0, clampInt(rawAmt, 0, 9999999));
    if (amt <= 0) continue;
    const key = normalizeMaterialKey(rawKey);
    addMaterial(prog, key, amt);
    out.changed = true;
    out.lines.push(`+${amt} ${getMaterialMeta(key).label}`);
  }
  const parts = payload?.gearParts && typeof payload.gearParts === "object" ? payload.gearParts : {};
  for (const [gearKey, rawAmt] of Object.entries(parts)) {
    const amt = Math.max(0, clampInt(rawAmt, 0, 9999));
    const def = getHubGearDef(gearKey);
    if (!def || amt <= 0) continue;
    addGearPart(prog, def.key, amt);
    out.changed = true;
    out.lines.push(`+${amt} ${def.short || def.name} Part`);
  }
  const items = payload?.gearItems && typeof payload.gearItems === "object" ? payload.gearItems : {};
  for (const [gearKey, rawAmt] of Object.entries(items)) {
    const amt = Math.max(0, clampInt(rawAmt, 0, 99));
    const def = getHubGearDef(gearKey);
    if (!def || amt <= 0) continue;
    if (isHubGearOwned(prog, def.key)) {
      const bonusParts = Math.max(2, amt);
      addGearPart(prog, def.key, bonusParts);
      out.changed = true;
      out.lines.push(`DUPLICATE ${def.short || def.name} → +${bonusParts} Parts`);
    } else {
      addOwnedGear(prog, def.key, amt);
      out.changed = true;
      out.lines.push(`DROP: ${def.name}`);
    }
  }
  const masteryPayload = payload?.heroBiomeXp && typeof payload.heroBiomeXp === 'object' ? payload.heroBiomeXp : {};
  const activeHero = getActiveHero(prog);
  for (const [rawKey, rawAmt] of Object.entries(masteryPayload)) {
    const amt = Math.max(0, clampInt(rawAmt, 0, 9999999));
    if (amt <= 0 || !activeHero) continue;
    const key = normalizeEssenceKey(rawKey);
    if (key !== normalizeEssenceKey(activeHero.race || 'mecha')) continue;
    const granted = grantHeroBiomeMasteryXp(prog, activeHero, amt);
    if (!granted?.ok) continue;
    out.changed = true;
    out.lines.push(`+${amt} ${(getEssenceLabel(key) || key)} Mastery XP`);
    if ((granted.levelUps | 0) > 0) out.lines.push(`${activeHero.name} mastery Lv ${granted.mastery?.level || granted.level || 1}`);
  }
  const cardRewards = applyCardRewardPayload(prog, payload);
  if (cardRewards?.changed) {
    out.changed = true;
    out.lines.push(...(cardRewards.lines || []));
  }
  return out;
}
