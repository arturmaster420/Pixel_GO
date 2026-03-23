import {
  DAMAGE_TYPE_KEYS,
  HUB_MODULE_SLOTS,
  PASSIVE_KEYS,
  clampInt,
  defaultHubGear,
  getHubGearDef,
  getHubGearMaterialCosts,
  getHubGearPartCost,
} from "./hubShared.js";
import { ensureHubProgression, sanitizeHubGear } from "./hubBuildState.js";
import { getEssenceCount, getMaterialCount, normalizeEssenceKey, normalizeMaterialKey } from "./hubResources.js";

export function getGearPartCount(prog, key) {
  ensureHubProgression(prog);
  const def = getHubGearDef(key);
  if (!def) return 0;
  return Math.max(0, clampInt(prog?.gearParts?.[def.key], 0, 9999));
}

export function addGearPart(prog, key, amount = 1) {
  ensureHubProgression(prog);
  const def = getHubGearDef(key);
  if (!def) return 0;
  const delta = Math.max(0, clampInt(amount, 0, 9999));
  const current = Math.max(0, Number.isFinite(Number(prog?.gearParts?.[def.key])) ? Math.trunc(Number(prog.gearParts[def.key])) : 0);
  if (delta <= 0) return current;
  const next = Math.min(9999, current + delta);
  prog.gearParts[def.key] = next;
  return next | 0;
}

export function addOwnedGear(prog, key, amount = 1) {
  ensureHubProgression(prog);
  const def = getHubGearDef(key);
  if (!def) return 0;
  const delta = Math.max(0, clampInt(amount, 0, 999));
  const current = Math.max(0, Number.isFinite(Number(prog?.gearInventory?.[def.key])) ? Math.trunc(Number(prog.gearInventory[def.key])) : 0);
  if (delta <= 0) return current;
  const next = Math.min(999, current + delta);
  prog.gearInventory[def.key] = next;
  prog.hubGear = sanitizeHubGear(prog.hubGear, prog.gearInventory);
  return next | 0;
}

export function isHubGearOwned(prog, key) {
  ensureHubProgression(prog);
  return Math.max(0, clampInt(prog?.gearInventory?.[String(key || "")], 0, 999)) > 0;
}

export function isHubGearEquipped(prog, key) {
  ensureHubProgression(prog);
  const gearKey = String(key || "");
  if (!gearKey) return false;
  const g = prog?.hubGear || defaultHubGear();
  return g.relic === gearKey || g.coreItem === gearKey || (Array.isArray(g.modules) && g.modules.includes(gearKey));
}

export function getEquippedHubGearKeys(prog) {
  ensureHubProgression(prog);
  const g = prog?.hubGear || defaultHubGear();
  const out = [];
  if (Array.isArray(g.modules)) {
    for (const key of g.modules) if (key && getHubGearDef(key)) out.push(key);
  }
  if (g.relic && getHubGearDef(g.relic)) out.push(g.relic);
  if (g.coreItem && getHubGearDef(g.coreItem)) out.push(g.coreItem);
  return out;
}

export function getHubGearSlotUsage(prog) {
  ensureHubProgression(prog);
  const g = prog?.hubGear || defaultHubGear();
  const modules = Array.isArray(g.modules) ? g.modules.filter((key) => key && getHubGearDef(key)).length : 0;
  return {
    module: modules,
    relic: g.relic && getHubGearDef(g.relic) ? 1 : 0,
    coreItem: g.coreItem && getHubGearDef(g.coreItem) ? 1 : 0,
  };
}

export function canCraftHubGear(prog, key) {
  ensureHubProgression(prog);
  const def = getHubGearDef(key);
  if (!def || isHubGearOwned(prog, key)) return false;
  if ((prog?.coins | 0) < (def.costCoins | 0)) return false;
  if (getGearPartCount(prog, def.key) < getHubGearPartCost(def)) return false;
  const costs = def.costEssences && typeof def.costEssences === "object" ? def.costEssences : {};
  for (const [essenceKey, rawAmt] of Object.entries(costs)) {
    const amt = Math.max(0, clampInt(rawAmt, 0, 999999));
    if (getEssenceCount(prog, essenceKey) < amt) return false;
  }
  const materialCosts = getHubGearMaterialCosts(def);
  for (const [materialKey, rawAmt] of Object.entries(materialCosts)) {
    const amt = Math.max(0, clampInt(rawAmt, 0, 999999));
    if (getMaterialCount(prog, materialKey) < amt) return false;
  }
  return true;
}

export function craftHubGear(prog, key) {
  ensureHubProgression(prog);
  const def = getHubGearDef(key);
  if (!def || !canCraftHubGear(prog, key)) return false;
  prog.coins = Math.max(0, (prog.coins | 0) - Math.max(0, def.costCoins | 0));
  const partCost = getHubGearPartCost(def);
  if (partCost > 0) prog.gearParts[def.key] = Math.max(0, getGearPartCount(prog, def.key) - partCost);
  const costs = def.costEssences && typeof def.costEssences === "object" ? def.costEssences : {};
  for (const [essenceKey, rawAmt] of Object.entries(costs)) {
    const amt = Math.max(0, clampInt(rawAmt, 0, 999999));
    if (amt <= 0) continue;
    const norm = normalizeEssenceKey(essenceKey);
    prog.essences[norm] = Math.max(0, getEssenceCount(prog, norm) - amt);
  }
  const materialCosts = getHubGearMaterialCosts(def);
  for (const [materialKey, rawAmt] of Object.entries(materialCosts)) {
    const amt = Math.max(0, clampInt(rawAmt, 0, 999999));
    if (amt <= 0) continue;
    const norm = normalizeMaterialKey(materialKey);
    prog.materials[norm] = Math.max(0, getMaterialCount(prog, norm) - amt);
  }
  prog.gearInventory[def.key] = Math.max(1, clampInt(prog?.gearInventory?.[def.key], 0, 999) + 1);
  return true;
}

export function canEquipHubGear(prog, key) {
  ensureHubProgression(prog);
  const def = getHubGearDef(key);
  if (!def || !isHubGearOwned(prog, key)) return false;
  if (isHubGearEquipped(prog, key)) return true;
  const usage = getHubGearSlotUsage(prog);
  if (def.slot === "module") return usage.module < HUB_MODULE_SLOTS;
  return true;
}

export function equipHubGear(prog, key) {
  ensureHubProgression(prog);
  const def = getHubGearDef(key);
  if (!def || !isHubGearOwned(prog, key)) return false;
  if (def.slot === "module") {
    if (isHubGearEquipped(prog, key)) return true;
    const modules = Array.isArray(prog.hubGear?.modules) ? prog.hubGear.modules : (prog.hubGear.modules = [null, null]);
    const idx = modules.findIndex((v) => !v);
    if (idx < 0) return false;
    modules[idx] = def.key;
    prog.hubGear.modules = sanitizeHubGear({ ...prog.hubGear, modules }, prog.gearInventory).modules;
    return true;
  }
  if (def.slot === "relic") {
    prog.hubGear.relic = def.key;
    prog.hubGear = sanitizeHubGear(prog.hubGear, prog.gearInventory);
    return true;
  }
  if (def.slot === "coreItem") {
    prog.hubGear.coreItem = def.key;
    prog.hubGear = sanitizeHubGear(prog.hubGear, prog.gearInventory);
    return true;
  }
  return false;
}

export function unequipHubGear(prog, key) {
  ensureHubProgression(prog);
  const gearKey = String(key || "");
  if (!gearKey) return false;
  let changed = false;
  const modules = Array.isArray(prog.hubGear?.modules) ? prog.hubGear.modules.slice(0, HUB_MODULE_SLOTS) : [null, null];
  for (let i = 0; i < modules.length; i++) {
    if (modules[i] === gearKey) {
      modules[i] = null;
      changed = true;
    }
  }
  if (changed) {
    prog.hubGear.modules = sanitizeHubGear({ ...prog.hubGear, modules }, prog.gearInventory).modules;
    return true;
  }
  if (prog.hubGear?.relic === gearKey) { prog.hubGear.relic = null; return true; }
  if (prog.hubGear?.coreItem === gearKey) { prog.hubGear.coreItem = null; return true; }
  return false;
}

export function getHubGearAggregateEffects(prog) {
  ensureHubProgression(prog);
  const out = { passives: {}, damageTypes: {} };
  for (const gearKey of getEquippedHubGearKeys(prog)) {
    const def = getHubGearDef(gearKey);
    if (!def || !def.effects) continue;
    const passives = def.effects.passives && typeof def.effects.passives === "object" ? def.effects.passives : {};
    const damageTypes = def.effects.damageTypes && typeof def.effects.damageTypes === "object" ? def.effects.damageTypes : {};
    for (const [key, rawAmt] of Object.entries(passives)) {
      if (!PASSIVE_KEYS.includes(key)) continue;
      const amt = Math.max(0, clampInt(rawAmt, 0, 999));
      if (amt <= 0) continue;
      out.passives[key] = (out.passives[key] | 0) + amt;
    }
    for (const [key, rawAmt] of Object.entries(damageTypes)) {
      if (!DAMAGE_TYPE_KEYS.includes(key)) continue;
      const amt = Number(rawAmt || 0);
      if (!Number.isFinite(amt) || amt <= 0) continue;
      out.damageTypes[key] = Number(out.damageTypes[key] || 0) + amt;
    }
  }
  return out;
}
