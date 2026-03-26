import { getStarterLoadoutDef, normalizeStarterLoadoutKey } from "../starterLoadouts.js";
import { getActiveHero, normalizeHeroRaceKey } from "../accountProfile.js";
import {
  ACTIVE_SKILL_KEYS,
  BIOME_ESSENCE_KEYS,
  HUB_BUILD_EXTRA_SKILL_SLOTS,
  HUB_BUILD_META_VERSION,
  HUB_GEAR_BY_KEY,
  HUB_GEAR_DEFS,
  HUB_MATERIAL_KEYS,
  HUB_MODULE_SLOTS,
  PASSIVE_KEYS,
  clampInt,
  defaultEssences,
  defaultGearInventory,
  defaultGearParts,
  defaultHubBuild,
  defaultHubGear,
  defaultMaterials,
} from "./hubShared.js";

export function getOwnedSkillCap(prog, key) {
  const meta = prog?.skillMeta;
  if (!meta || typeof meta !== "object") return 0;
  return Math.max(0, clampInt(meta[`skill:${String(key || "")}`], 0, 99));
}

export function getOwnedPassiveCap(prog, key) {
  const meta = prog?.skillMeta;
  if (!meta || typeof meta !== "object") return 0;
  return Math.max(0, clampInt(meta[`passive:${String(key || "")}`], 0, 99));
}

function sanitizeMaterials(src) {
  const out = defaultMaterials();
  const data = src && typeof src === "object" ? src : {};
  for (const key of HUB_MATERIAL_KEYS) out[key] = Math.max(0, clampInt(data[key], 0, 9999999));
  return out;
}

function sanitizeEssences(src) {
  const out = defaultEssences();
  const data = src && typeof src === "object" ? src : {};
  for (const key of BIOME_ESSENCE_KEYS) out[key] = Math.max(0, clampInt(data[key], 0, 9999999));
  return out;
}

function sanitizeGearParts(src) {
  const out = defaultGearParts();
  const data = src && typeof src === "object" ? src : {};
  for (const def of HUB_GEAR_DEFS) {
    const count = Math.max(0, clampInt(data[def.key], 0, 9999));
    if (count > 0) out[def.key] = count;
  }
  return out;
}

function sanitizeGearInventory(src) {
  const out = defaultGearInventory();
  const data = src && typeof src === "object" ? src : {};
  for (const def of HUB_GEAR_DEFS) {
    const count = Math.max(0, clampInt(data[def.key], 0, 999));
    if (count > 0) out[def.key] = count;
  }
  return out;
}

export function sanitizeHubGear(src, inventory) {
  const out = defaultHubGear();
  const data = src && typeof src === "object" ? src : {};
  const inv = inventory && typeof inventory === "object" ? inventory : defaultGearInventory();
  const modules = Array.isArray(data.modules) ? data.modules : [];
  let idx = 0;
  const seen = new Set();
  for (const rawKey of modules) {
    const key = String(rawKey || "");
    const def = HUB_GEAR_BY_KEY[key];
    if (!def || def.slot !== "module") continue;
    if (!(inv[key] > 0) || seen.has(key) || idx >= HUB_MODULE_SLOTS) continue;
    out.modules[idx++] = key;
    seen.add(key);
  }
  const relicKey = String(data.relic || "");
  if (relicKey && HUB_GEAR_BY_KEY[relicKey] && HUB_GEAR_BY_KEY[relicKey].slot === "relic" && (inv[relicKey] > 0)) out.relic = relicKey;
  const coreItemKey = String(data.coreItem || "");
  if (coreItemKey && HUB_GEAR_BY_KEY[coreItemKey] && HUB_GEAR_BY_KEY[coreItemKey].slot === "coreItem" && (inv[coreItemKey] > 0)) out.coreItem = coreItemKey;
  return out;
}

export function sanitizeSkills(skills, prog, coreSkillKey) {
  const src = skills && typeof skills === "object" ? skills : {};
  const out = {};
  let used = 0;
  for (const key of ACTIVE_SKILL_KEYS) {
    if (!key || key === coreSkillKey) continue;
    const cap = getOwnedSkillCap(prog, key);
    if (cap <= 0) continue;
    const lv = clampInt(src[key], 0, cap);
    if (lv <= 0 || used >= HUB_BUILD_EXTRA_SKILL_SLOTS) continue;
    out[key] = lv;
    used += 1;
  }
  return out;
}

export function sanitizePassives(passives, prog) {
  const src = passives && typeof passives === "object" ? passives : {};
  const out = {};
  for (const key of PASSIVE_KEYS) {
    const cap = getOwnedPassiveCap(prog, key);
    if (cap <= 0) continue;
    const lv = clampInt(src[key], 0, cap);
    if (lv > 0) out[key] = lv;
  }
  return out;
}

export function ensureHubProgression(prog) {
  if (!prog || typeof prog !== "object") return prog;
  prog.sp = Math.max(0, clampInt(prog.sp, 0, 9999999));
  prog.materials = sanitizeMaterials(prog.materials);
  prog.essences = sanitizeEssences(prog.essences);
  prog.gearParts = sanitizeGearParts(prog.gearParts);
  prog.gearInventory = sanitizeGearInventory(prog.gearInventory);
  prog.hubBuildMetaVersion = HUB_BUILD_META_VERSION;

  const activeHeroRace = normalizeHeroRaceKey(getActiveHero(prog)?.race || prog?.selectedStarterLoadout || "mecha");
  const selected = normalizeStarterLoadoutKey(activeHeroRace || prog?.hubBuild?.coreKey || prog?.selectedStarterLoadout || "mecha");
  const hb = prog.hubBuild && typeof prog.hubBuild === "object" ? prog.hubBuild : defaultHubBuild(selected);
  const coreKey = normalizeStarterLoadoutKey(activeHeroRace || hb.coreKey || selected);
  const coreSkillKey = getStarterLoadoutDef(coreKey).skillKey;

  hb.coreKey = coreKey;
  hb.skills = sanitizeSkills(hb.skills, prog, coreSkillKey);
  hb.passives = sanitizePassives(hb.passives, prog);
  prog.hubBuild = hb;
  prog.selectedStarterLoadout = coreKey;
  prog.hubGear = sanitizeHubGear(prog.hubGear, prog.gearInventory);
  return prog;
}

export function getHubCoreKey(prog) {
  ensureHubProgression(prog);
  const activeHeroRace = normalizeHeroRaceKey(getActiveHero(prog)?.race || prog?.selectedStarterLoadout || "mecha");
  return normalizeStarterLoadoutKey(activeHeroRace || prog?.hubBuild?.coreKey || prog?.selectedStarterLoadout || "mecha");
}

export function getHubBuildSpentPoints(prog) {
  ensureHubProgression(prog);
  let total = 0;
  const skills = prog?.hubBuild?.skills || {};
  const passives = prog?.hubBuild?.passives || {};
  for (const key of Object.keys(skills)) total += Math.max(0, clampInt(skills[key], 0, 999));
  for (const key of Object.keys(passives)) total += Math.max(0, clampInt(passives[key], 0, 999));
  return total;
}

export function getHubBuildAvailableSp(prog) {
  ensureHubProgression(prog);
  return Math.max(0, (prog.sp | 0) - getHubBuildSpentPoints(prog));
}

export function getEquippedHubSkillCount(prog) {
  ensureHubProgression(prog);
  return Object.keys(prog?.hubBuild?.skills || {}).filter((key) => ((prog?.hubBuild?.skills?.[key] | 0) > 0)).length;
}

export function setHubSkillLevel(prog, key, nextLevel) {
  ensureHubProgression(prog);
  const skillKey = String(key || "").trim();
  if (!skillKey) return false;
  const coreSkillKey = getStarterLoadoutDef(getHubCoreKey(prog)).skillKey;
  if (skillKey === coreSkillKey) return false;

  const cap = getOwnedSkillCap(prog, skillKey);
  const current = Math.max(0, clampInt(prog?.hubBuild?.skills?.[skillKey], 0, cap));
  const next = Math.max(0, clampInt(nextLevel, 0, cap));
  if (next === current) return false;

  const slotsUsed = getEquippedHubSkillCount(prog);
  const openingNewSlot = current <= 0 && next > 0;
  if (openingNewSlot && slotsUsed >= HUB_BUILD_EXTRA_SKILL_SLOTS) return false;
  if (next > current && getHubBuildAvailableSp(prog) < (next - current)) return false;

  if (next <= 0) delete prog.hubBuild.skills[skillKey];
  else prog.hubBuild.skills[skillKey] = next;
  prog.hubBuild.skills = sanitizeSkills(prog.hubBuild.skills, prog, coreSkillKey);
  return true;
}

export function setHubPassiveLevel(prog, key, nextLevel) {
  ensureHubProgression(prog);
  const passiveKey = String(key || "").trim();
  if (!passiveKey) return false;
  const cap = getOwnedPassiveCap(prog, passiveKey);
  const current = Math.max(0, clampInt(prog?.hubBuild?.passives?.[passiveKey], 0, cap));
  const next = Math.max(0, clampInt(nextLevel, 0, cap));
  if (next === current) return false;
  if (next > current && getHubBuildAvailableSp(prog) < (next - current)) return false;

  if (next <= 0) delete prog.hubBuild.passives[passiveKey];
  else prog.hubBuild.passives[passiveKey] = next;
  prog.hubBuild.passives = sanitizePassives(prog.hubBuild.passives, prog);
  return true;
}

export function setHubCoreKey(prog, key) {
  ensureHubProgression(prog);
  const activeHeroRace = normalizeHeroRaceKey(getActiveHero(prog)?.race || prog?.selectedStarterLoadout || "mecha");
  const requested = normalizeStarterLoadoutKey(key);
  const coreKey = activeHeroRace || requested;
  const changed = !(prog.hubBuild.coreKey === coreKey && prog.selectedStarterLoadout === coreKey);
  prog.hubBuild.coreKey = coreKey;
  prog.selectedStarterLoadout = coreKey;
  const coreSkillKey = getStarterLoadoutDef(coreKey).skillKey;
  prog.hubBuild.skills = sanitizeSkills(prog.hubBuild.skills, prog, coreSkillKey);
  return changed && requested === coreKey;
}

export function resetHubBuildAllocations(prog) {
  ensureHubProgression(prog);
  prog.hubBuild.skills = {};
  prog.hubBuild.passives = {};
  return true;
}
