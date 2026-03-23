import { clampInt, getBiomeCompatibleGearDefs, getBiomeLootProfile, getBiomePreferredGearDefs, getEssenceLabel, getHubGearDef } from "./hubShared.js";
import { ensureHubProgression } from "./hubBuildState.js";
import { addEssence, addMaterial, getMaterialMeta, normalizeEssenceKey, normalizeMaterialKey } from "./hubResources.js";
import { addGearPart, addOwnedGear, isHubGearOwned } from "./hubGear.js";

function pickLootDef(defs, rand = Math.random) {
  if (!Array.isArray(defs) || !defs.length) return null;
  const idx = Math.floor(Math.max(0, rand()) * defs.length) % defs.length;
  return defs[idx] || defs[0] || null;
}

export function rollHubLootForRoom(room, prog, rand = Math.random) {
  ensureHubProgression(prog);
  const biomeKey = normalizeEssenceKey(room?.biomeKey || "");
  const isBoss = !!room?.isFloorFinal;
  const profile = getBiomeLootProfile(biomeKey);
  const preferredDefs = getBiomePreferredGearDefs(biomeKey);
  const compatibleDefs = getBiomeCompatibleGearDefs(biomeKey);
  const payload = { essences: { [biomeKey]: isBoss ? 3 : 1 }, materials: {}, gearParts: {}, gearItems: {} };

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
  return payload;
}

export function applyHubProgressionLoot(prog, payload) {
  ensureHubProgression(prog);
  const out = { changed: false, lines: [] };
  const essences = payload?.essences && typeof payload.essences === "object" ? payload.essences : {};
  for (const [rawKey, rawAmt] of Object.entries(essences)) {
    const amt = Math.max(0, clampInt(rawAmt, 0, 9999999));
    if (amt <= 0) continue;
    const key = normalizeEssenceKey(rawKey);
    addEssence(prog, key, amt);
    out.changed = true;
    out.lines.push(`+${amt} ${getEssenceLabel(key)}`);
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
  return out;
}
