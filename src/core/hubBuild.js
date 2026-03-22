import { MAX_RUN_ACTIVE_SKILLS, RUN_PASSIVES, RUN_SKILLS, initRunUpgrades, applyRunDerivedStats } from "./runUpgrades.js";
import { applyStarterLoadoutToPlayer, getStarterLoadoutDef, normalizeStarterLoadoutKey } from "./starterLoadouts.js";

export const HUB_BUILD_META_VERSION = 5;
export const HUB_BUILD_EXTRA_SKILL_SLOTS = Math.max(0, (MAX_RUN_ACTIVE_SKILLS | 0) - 1);
export const BIOME_ESSENCE_KEYS = ["fire", "ice", "electric", "mecha", "dark", "light"];
export const ESSENCE_EXCHANGE_RATE = 3;
export const HUB_MODULE_SLOTS = 2;
export const HUB_MATERIAL_KEYS = ["salvage", "alloy", "coreShard"];

export const ESSENCE_META = {
  fire: { key: "fire", short: "Fire", label: "Fire Essence", accent: "#ff8c54" },
  ice: { key: "ice", short: "Ice", label: "Ice Essence", accent: "#88c7ff" },
  electric: { key: "electric", short: "Electric", label: "Electric Essence", accent: "#77f6ff" },
  mecha: { key: "mecha", short: "Mecha", label: "Mecha Essence", accent: "#d7deff" },
  dark: { key: "dark", short: "Dark", label: "Dark Essence", accent: "#c49bff" },
  light: { key: "light", short: "Light", label: "Light Essence", accent: "#ffe58a" },
};

export const MATERIAL_META = {
  salvage: { key: "salvage", short: "Salvage", label: "Salvage", accent: "#cfd8ef" },
  alloy: { key: "alloy", short: "Alloy", label: "Alloy Plate", accent: "#9bd6ff" },
  coreShard: { key: "coreShard", short: "Core", label: "Core Shard", accent: "#ffe28d" },
};

export const HUB_GEAR_DEFS = [
  {
    key: "module_overclock_coil",
    slot: "module",
    style: "rockets / mecha",
    name: "Overclock Coil",
    short: "Overclock",
    desc: "Pushes your frame harder. Great first mecha module for Gun / Rockets style.",
    costCoins: 70,
    costEssences: { mecha: 6 },
    effects: {
      passives: { attackSpeed: 1 },
      damageTypes: { mecha: 0.12 },
    },
  },
  {
    key: "module_chain_capacitor",
    slot: "module",
    style: "chain / electric",
    name: "Chain Capacitor",
    short: "Capacitor",
    desc: "Stabilizes electric arcs and helps chain skills reach deeper targets.",
    costCoins: 80,
    costEssences: { electric: 6 },
    effects: {
      passives: { range: 1 },
      damageTypes: { electric: 0.18 },
    },
  },
  {
    key: "module_flame_injector",
    slot: "module",
    style: "burn / fire",
    name: "Flame Injector",
    short: "Injector",
    desc: "Feeds hotter pressure into fire skills and supports burn-focused routes.",
    costCoins: 80,
    costEssences: { fire: 6 },
    effects: {
      passives: { damage: 1 },
      damageTypes: { fire: 0.18 },
    },
  },
  {
    key: "module_cryo_prism",
    slot: "module",
    style: "freeze / ice",
    name: "Cryo Prism",
    short: "Cryo Prism",
    desc: "Improves frost stability. Good for spacing, freeze tempo and safer attrition.",
    costCoins: 80,
    costEssences: { ice: 6 },
    effects: {
      passives: { hp: 1 },
      damageTypes: { ice: 0.18 },
    },
  },
  {
    key: "module_void_emitter",
    slot: "module",
    style: "dark / drain",
    name: "Void Emitter",
    short: "Emitter",
    desc: "Condenses void pressure into closer control and stronger dark skill finishers.",
    costCoins: 85,
    costEssences: { dark: 6 },
    effects: {
      passives: { critChance: 1, lifeSteal: 1 },
      damageTypes: { dark: 0.18 },
    },
  },
  {
    key: "module_prism_lens",
    slot: "module",
    style: "light / sanctuary",
    name: "Prism Lens",
    short: "Prism Lens",
    desc: "Refines light into cleaner beams and steadier holy sustain windows.",
    costCoins: 85,
    costEssences: { light: 6 },
    effects: {
      passives: { range: 1, hpRegen: 1 },
      damageTypes: { light: 0.18 },
    },
  },
  {
    key: "relic_void_heart",
    slot: "relic",
    style: "drain / dark",
    name: "Void Heart",
    short: "Void Heart",
    desc: "A dark relic that converts pressure into sustain and deeper drain potential.",
    costCoins: 120,
    costEssences: { dark: 10 },
    effects: {
      passives: { lifeSteal: 2, hpRegen: 1 },
      damageTypes: { dark: 0.2 },
    },
  },
  {
    key: "relic_sanctuary_sigil",
    slot: "relic",
    style: "sanctuary / light",
    name: "Sanctuary Sigil",
    short: "Sigil",
    desc: "Turns the build sturdier and brighter. Best on healing or holy control setups.",
    costCoins: 120,
    costEssences: { light: 10 },
    effects: {
      passives: { hp: 2, hpRegen: 2 },
      damageTypes: { light: 0.2 },
    },
  },
  {
    key: "core_reactor_matrix",
    slot: "coreItem",
    style: "expedition / mecha",
    name: "Reactor Matrix",
    short: "Matrix",
    desc: "A stable expedition core item. Great all-round power spike for persistent pushes.",
    costCoins: 140,
    costEssences: { mecha: 8, electric: 4 },
    effects: {
      passives: { damage: 1, attackSpeed: 1, moveSpeed: 1 },
      damageTypes: { mecha: 0.1 },
    },
  },
  {
    key: "core_elemental_conduit",
    slot: "coreItem",
    style: "beam / burn / freeze / chain",
    name: "Elemental Conduit",
    short: "Conduit",
    desc: "A tri-element catalyst for electric, fire and ice builds with better coverage.",
    costCoins: 150,
    costEssences: { fire: 5, ice: 5, electric: 5 },
    effects: {
      passives: { range: 1 },
      damageTypes: { electric: 0.14, fire: 0.14, ice: 0.14 },
    },
  },
  {
    key: "core_twilight_gem",
    slot: "coreItem",
    style: "drain / sanctuary",
    name: "Twilight Gem",
    short: "Twilight",
    desc: "Fuses light and dark paths. Rewards critical control and hybrid sustain builds.",
    costCoins: 160,
    costEssences: { dark: 6, light: 6 },
    effects: {
      passives: { critChance: 1, critDamage: 1 },
      damageTypes: { dark: 0.12, light: 0.12 },
    },
  },
];

const BIOME_LOOT_PROFILES = {
  mecha: {
    key: "mecha",
    label: "Mecha",
    roomMaterials: { salvage: 1 },
    roomBonusChances: { salvage: 0.58, alloy: 0.36 },
    bossMaterials: { salvage: 3, alloy: 2, coreShard: 1 },
    roomPartChance: 0.55,
    bossPartRolls: 3,
    bossItemChance: 0.24,
    preferredGearKeys: ["module_overclock_coil", "core_reactor_matrix"],
  },
  fire: {
    key: "fire",
    label: "Fire",
    roomMaterials: { salvage: 1 },
    roomBonusChances: { salvage: 0.48, alloy: 0.22 },
    bossMaterials: { salvage: 4, alloy: 1, coreShard: 1 },
    roomPartChance: 0.5,
    bossPartRolls: 3,
    bossItemChance: 0.22,
    preferredGearKeys: ["module_flame_injector", "core_elemental_conduit"],
  },
  ice: {
    key: "ice",
    label: "Ice",
    roomMaterials: { salvage: 1 },
    roomBonusChances: { alloy: 0.54, coreShard: 0.08 },
    bossMaterials: { salvage: 2, alloy: 3, coreShard: 1 },
    roomPartChance: 0.5,
    bossPartRolls: 3,
    bossItemChance: 0.22,
    preferredGearKeys: ["module_cryo_prism", "core_elemental_conduit"],
  },
  electric: {
    key: "electric",
    label: "Electric",
    roomMaterials: { salvage: 1 },
    roomBonusChances: { alloy: 0.52, salvage: 0.2 },
    bossMaterials: { salvage: 2, alloy: 3, coreShard: 1 },
    roomPartChance: 0.56,
    bossPartRolls: 3,
    bossItemChance: 0.24,
    preferredGearKeys: ["module_chain_capacitor", "core_elemental_conduit", "core_reactor_matrix"],
  },
  dark: {
    key: "dark",
    label: "Dark",
    roomMaterials: { salvage: 1 },
    roomBonusChances: { coreShard: 0.18, alloy: 0.18 },
    bossMaterials: { salvage: 2, alloy: 1, coreShard: 2 },
    roomPartChance: 0.54,
    bossPartRolls: 3,
    bossItemChance: 0.28,
    preferredGearKeys: ["module_void_emitter", "relic_void_heart", "core_twilight_gem"],
  },
  light: {
    key: "light",
    label: "Light",
    roomMaterials: { salvage: 1 },
    roomBonusChances: { alloy: 0.26, coreShard: 0.18 },
    bossMaterials: { salvage: 2, alloy: 2, coreShard: 2 },
    roomPartChance: 0.54,
    bossPartRolls: 3,
    bossItemChance: 0.28,
    preferredGearKeys: ["module_prism_lens", "relic_sanctuary_sigil", "core_twilight_gem"],
  },
};

const HUB_GEAR_BY_KEY = Object.fromEntries(HUB_GEAR_DEFS.map((def) => [String(def.key), def]));
const ACTIVE_SKILL_KEYS = (RUN_SKILLS || []).filter((def) => def && def.kind === "skill").map((def) => String(def.key || "")).filter(Boolean);
const PASSIVE_KEYS = (RUN_PASSIVES || []).filter((def) => def && def.kind === "passive").map((def) => String(def.key || "")).filter(Boolean);
const AFFINITY_KEYS = ["affElectric", "affFire", "affIce", "affLight", "affDark"];
const DAMAGE_TYPE_KEYS = ["mecha", "electric", "fire", "ice", "light", "dark"];

function clampInt(v, min, max) {
  const n = Number.isFinite(Number(v)) ? (Number(v) | 0) : 0;
  return Math.max(min, Math.min(max, n));
}

export function defaultEssences() {
  return {
    fire: 0,
    ice: 0,
    electric: 0,
    mecha: 0,
    dark: 0,
    light: 0,
  };
}

export function defaultMaterials() {
  return {
    salvage: 0,
    alloy: 0,
    coreShard: 0,
  };
}

export function defaultGearInventory() {
  return {};
}

export function defaultGearParts() {
  return {};
}

export function defaultHubGear() {
  return {
    modules: [null, null],
    relic: null,
    coreItem: null,
  };
}

export function normalizeEssenceKey(raw) {
  const key = String(raw || "").trim().toLowerCase();
  if (key === "neutral" || key === "station" || key === "space" || key === "hub") return "mecha";
  return BIOME_ESSENCE_KEYS.includes(key) ? key : "mecha";
}

export function biomeKeyToEssenceKey(rawBiomeKey) {
  return normalizeEssenceKey(rawBiomeKey);
}

export function getEssenceMeta(key) {
  return ESSENCE_META[normalizeEssenceKey(key)] || ESSENCE_META.mecha;
}

export function getBiomeAccentColor(key, fallback = "#d7deff") {
  return String((ESSENCE_META[normalizeEssenceKey(key)] || {}).accent || fallback);
}

export function getEssenceLabel(key) {
  return getEssenceMeta(key).label;
}

export function normalizeMaterialKey(raw) {
  const key = String(raw || "").trim();
  return HUB_MATERIAL_KEYS.includes(key) ? key : "salvage";
}

export function getMaterialMeta(key) {
  return MATERIAL_META[normalizeMaterialKey(key)] || MATERIAL_META.salvage;
}

export function getMaterialCount(prog, key) {
  ensureHubProgression(prog);
  const materialKey = normalizeMaterialKey(key);
  return Math.max(0, clampInt(prog?.materials?.[materialKey], 0, 9999999));
}

export function addMaterial(prog, key, amount) {
  ensureHubProgression(prog);
  const materialKey = normalizeMaterialKey(key);
  const delta = Math.max(0, clampInt(amount, 0, 9999999));
  if (delta <= 0) return 0;
  prog.materials[materialKey] = Math.max(0, getMaterialCount(prog, materialKey) + delta);
  return prog.materials[materialKey] | 0;
}

export function getEssenceCount(prog, key) {
  ensureHubProgression(prog);
  const essenceKey = normalizeEssenceKey(key);
  return Math.max(0, clampInt(prog?.essences?.[essenceKey], 0, 9999999));
}

export function addEssence(prog, key, amount) {
  ensureHubProgression(prog);
  const essenceKey = normalizeEssenceKey(key);
  const delta = Math.max(0, clampInt(amount, 0, 9999999));
  if (delta <= 0) return 0;
  prog.essences[essenceKey] = Math.max(0, getEssenceCount(prog, essenceKey) + delta);
  return prog.essences[essenceKey] | 0;
}

export function canExchangeEssence(prog, fromKey, toKey, rate = ESSENCE_EXCHANGE_RATE) {
  ensureHubProgression(prog);
  const from = normalizeEssenceKey(fromKey);
  const to = normalizeEssenceKey(toKey);
  const exchangeRate = Math.max(1, clampInt(rate, 1, 999));
  if (!from || !to || from === to) return false;
  return getEssenceCount(prog, from) >= exchangeRate;
}

export function exchangeEssence(prog, fromKey, toKey, rate = ESSENCE_EXCHANGE_RATE) {
  ensureHubProgression(prog);
  const from = normalizeEssenceKey(fromKey);
  const to = normalizeEssenceKey(toKey);
  const exchangeRate = Math.max(1, clampInt(rate, 1, 999));
  if (!from || !to || from === to) return false;
  if (getEssenceCount(prog, from) < exchangeRate) return false;
  prog.essences[from] = Math.max(0, getEssenceCount(prog, from) - exchangeRate);
  prog.essences[to] = Math.max(0, getEssenceCount(prog, to) + 1);
  return true;
}

export function defaultHubBuild(coreKey = "mecha") {
  return {
    coreKey: normalizeStarterLoadoutKey(coreKey),
    skills: {},
    passives: {},
  };
}

export function getHubCoreKey(prog) {
  ensureHubProgression(prog);
  return normalizeStarterLoadoutKey(prog?.hubBuild?.coreKey || prog?.selectedStarterLoadout || "mecha");
}

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

export function getHubGearDef(key) {
  return HUB_GEAR_BY_KEY[String(key || "")] || null;
}

export function getGearPrimaryBiomeKey(defOrKey) {
  const def = typeof defOrKey === "string" ? getHubGearDef(defOrKey) : defOrKey;
  if (!def) return "mecha";
  const sourceBiomes = getGearSourceBiomes(def);
  if (Array.isArray(sourceBiomes) && sourceBiomes.length) return normalizeEssenceKey(sourceBiomes[0]);
  const costs = def.costEssences && typeof def.costEssences === "object" ? Object.keys(def.costEssences) : [];
  if (costs.length) return normalizeEssenceKey(costs[0]);
  return "mecha";
}

export function getHubGearPartCost(defOrKey) {
  const def = (defOrKey && typeof defOrKey === "object") ? defOrKey : getHubGearDef(defOrKey);
  if (!def) return 0;
  if (def.slot === "module") return 2;
  if (def.slot === "relic") return 3;
  if (def.slot === "coreItem") return 4;
  return 0;
}

export function getHubGearMaterialCosts(defOrKey) {
  const def = (defOrKey && typeof defOrKey === "object") ? defOrKey : getHubGearDef(defOrKey);
  if (!def) return {};
  if (def.slot === "module") return { salvage: 8, alloy: 2 };
  if (def.slot === "relic") return { salvage: 12, alloy: 4, coreShard: 1 };
  if (def.slot === "coreItem") return { salvage: 16, alloy: 6, coreShard: 2 };
  return {};
}

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
  if (delta <= 0) return getGearPartCount(prog, def.key);
  prog.gearParts[def.key] = Math.max(0, getGearPartCount(prog, def.key) + delta);
  return prog.gearParts[def.key] | 0;
}

export function addOwnedGear(prog, key, amount = 1) {
  ensureHubProgression(prog);
  const def = getHubGearDef(key);
  if (!def) return 0;
  const delta = Math.max(0, clampInt(amount, 0, 999));
  if (delta <= 0) return Math.max(0, clampInt(prog?.gearInventory?.[def.key], 0, 999));
  prog.gearInventory[def.key] = Math.max(0, clampInt(prog?.gearInventory?.[def.key], 0, 999) + delta);
  prog.hubGear = sanitizeHubGear(prog.hubGear, prog.gearInventory);
  return prog.gearInventory[def.key] | 0;
}

export function getBiomeLootProfile(rawBiomeKey) {
  const biomeKey = normalizeEssenceKey(rawBiomeKey);
  return BIOME_LOOT_PROFILES[biomeKey] || BIOME_LOOT_PROFILES.mecha;
}

export function getBiomeCompatibleGearDefs(rawBiomeKey) {
  const biomeKey = normalizeEssenceKey(rawBiomeKey);
  const defs = HUB_GEAR_DEFS.filter((def) => {
    const costs = def?.costEssences && typeof def.costEssences === "object" ? def.costEssences : {};
    return Object.prototype.hasOwnProperty.call(costs, biomeKey);
  });
  if (defs.length) return defs;
  if (biomeKey !== "mecha") return getBiomeCompatibleGearDefs("mecha");
  return HUB_GEAR_DEFS.slice();
}

export function getBiomePreferredGearDefs(rawBiomeKey) {
  const biomeKey = normalizeEssenceKey(rawBiomeKey);
  const profile = getBiomeLootProfile(biomeKey);
  const defs = [];
  for (const gearKey of profile.preferredGearKeys || []) {
    const def = getHubGearDef(gearKey);
    if (def && !defs.includes(def)) defs.push(def);
  }
  if (defs.length) return defs;
  return getBiomeCompatibleGearDefs(biomeKey);
}

export function getGearSourceBiomes(defOrKey) {
  const def = (defOrKey && typeof defOrKey === "object") ? defOrKey : getHubGearDef(defOrKey);
  if (!def) return [];
  const out = [];
  for (const key of BIOME_ESSENCE_KEYS) {
    const profile = getBiomeLootProfile(key);
    if ((profile.preferredGearKeys || []).includes(def.key)) out.push(key);
  }
  return out;
}

export function getHubGearDefsBySlot(slot) {
  const target = String(slot || "").trim();
  return HUB_GEAR_DEFS.filter((def) => def.slot === target);
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
    for (const key of g.modules) if (key && HUB_GEAR_BY_KEY[key]) out.push(key);
  }
  if (g.relic && HUB_GEAR_BY_KEY[g.relic]) out.push(g.relic);
  if (g.coreItem && HUB_GEAR_BY_KEY[g.coreItem]) out.push(g.coreItem);
  return out;
}

export function getHubGearSlotUsage(prog) {
  ensureHubProgression(prog);
  const g = prog?.hubGear || defaultHubGear();
  const modules = Array.isArray(g.modules) ? g.modules.filter((key) => key && HUB_GEAR_BY_KEY[key]).length : 0;
  return {
    module: modules,
    relic: g.relic && HUB_GEAR_BY_KEY[g.relic] ? 1 : 0,
    coreItem: g.coreItem && HUB_GEAR_BY_KEY[g.coreItem] ? 1 : 0,
  };
}

function sanitizeMaterials(src) {
  const out = defaultMaterials();
  const data = src && typeof src === "object" ? src : {};
  for (const key of HUB_MATERIAL_KEYS) {
    out[key] = Math.max(0, clampInt(data[key], 0, 9999999));
  }
  return out;
}

function sanitizeEssences(src) {
  const out = defaultEssences();
  const data = src && typeof src === "object" ? src : {};
  for (const key of BIOME_ESSENCE_KEYS) {
    out[key] = Math.max(0, clampInt(data[key], 0, 9999999));
  }
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

function sanitizeHubGear(src, inventory) {
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
    if (!(inv[key] > 0) || seen.has(key)) continue;
    if (idx >= HUB_MODULE_SLOTS) continue;
    out.modules[idx++] = key;
    seen.add(key);
  }
  const relicKey = String(data.relic || "");
  if (relicKey && HUB_GEAR_BY_KEY[relicKey] && HUB_GEAR_BY_KEY[relicKey].slot === "relic" && (inv[relicKey] > 0)) {
    out.relic = relicKey;
  }
  const coreItemKey = String(data.coreItem || "");
  if (coreItemKey && HUB_GEAR_BY_KEY[coreItemKey] && HUB_GEAR_BY_KEY[coreItemKey].slot === "coreItem" && (inv[coreItemKey] > 0)) {
    out.coreItem = coreItemKey;
  }
  return out;
}

function sanitizeSkills(skills, prog, coreSkillKey) {
  const src = skills && typeof skills === "object" ? skills : {};
  const out = {};
  let used = 0;
  for (const key of ACTIVE_SKILL_KEYS) {
    if (!key || key === coreSkillKey) continue;
    const cap = getOwnedSkillCap(prog, key);
    if (cap <= 0) continue;
    const lv = clampInt(src[key], 0, cap);
    if (lv <= 0) continue;
    if (used >= HUB_BUILD_EXTRA_SKILL_SLOTS) continue;
    out[key] = lv;
    used += 1;
  }
  return out;
}

function sanitizePassives(passives, prog) {
  const src = passives && typeof passives === "object" ? passives : {};
  const out = {};
  for (const key of PASSIVE_KEYS) {
    const cap = getOwnedPassiveCap(prog, key);
    if (cap <= 0) continue;
    const lv = clampInt(src[key], 0, cap);
    if (lv <= 0) continue;
    out[key] = lv;
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

  const selected = normalizeStarterLoadoutKey(prog?.hubBuild?.coreKey || prog?.selectedStarterLoadout || "mecha");
  const hb = prog.hubBuild && typeof prog.hubBuild === "object" ? prog.hubBuild : defaultHubBuild(selected);
  const coreKey = normalizeStarterLoadoutKey(hb.coreKey || selected);
  const coreSkillKey = getStarterLoadoutDef(coreKey).skillKey;

  hb.coreKey = coreKey;
  hb.skills = sanitizeSkills(hb.skills, prog, coreSkillKey);
  hb.passives = sanitizePassives(hb.passives, prog);
  prog.hubBuild = hb;
  prog.selectedStarterLoadout = coreKey;
  prog.hubGear = sanitizeHubGear(prog.hubGear, prog.gearInventory);
  return prog;
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

  if (next > current) {
    const delta = next - current;
    if (getHubBuildAvailableSp(prog) < delta) return false;
  }

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

  if (next > current) {
    const delta = next - current;
    if (getHubBuildAvailableSp(prog) < delta) return false;
  }

  if (next <= 0) delete prog.hubBuild.passives[passiveKey];
  else prog.hubBuild.passives[passiveKey] = next;

  prog.hubBuild.passives = sanitizePassives(prog.hubBuild.passives, prog);
  return true;
}

export function setHubCoreKey(prog, key) {
  ensureHubProgression(prog);
  const coreKey = normalizeStarterLoadoutKey(key);
  if (prog.hubBuild.coreKey === coreKey && prog.selectedStarterLoadout === coreKey) return false;
  prog.hubBuild.coreKey = coreKey;
  prog.selectedStarterLoadout = coreKey;
  const coreSkillKey = getStarterLoadoutDef(coreKey).skillKey;
  prog.hubBuild.skills = sanitizeSkills(prog.hubBuild.skills, prog, coreSkillKey);
  return true;
}

export function resetHubBuildAllocations(prog) {
  ensureHubProgression(prog);
  prog.hubBuild.skills = {};
  prog.hubBuild.passives = {};
  return true;
}

function pickLootDef(defs, rand = Math.random) {
  if (!Array.isArray(defs) || !defs.length) return null;
  const idx = Math.floor(Math.max(0, rand()) * defs.length) % defs.length;
  return defs[idx] || defs[0] || null;
}

export function rollHubLootForRoom(room, prog, rand = Math.random) {
  ensureHubProgression(prog);
  const biomeKey = biomeKeyToEssenceKey(room?.biomeKey || "");
  const isBoss = !!room?.isFloorFinal;
  const profile = getBiomeLootProfile(biomeKey);
  const preferredDefs = getBiomePreferredGearDefs(biomeKey);
  const compatibleDefs = getBiomeCompatibleGearDefs(biomeKey);
  const payload = {
    essences: { [biomeKey]: isBoss ? 3 : 1 },
    materials: {},
    gearParts: {},
    gearItems: {},
  };

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

export function canCraftHubGear(prog, key) {
  ensureHubProgression(prog);
  const def = getHubGearDef(key);
  if (!def) return false;
  if (isHubGearOwned(prog, key)) return false;
  if ((prog?.coins | 0) < (def.costCoins | 0)) return false;
  const partCost = getHubGearPartCost(def);
  if (getGearPartCount(prog, def.key) < partCost) return false;
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
  if (!def) return false;
  if (!canCraftHubGear(prog, key)) return false;
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
  if (!def) return false;
  if (!isHubGearOwned(prog, key)) return false;
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
  if (prog.hubGear?.relic === gearKey) {
    prog.hubGear.relic = null;
    return true;
  }
  if (prog.hubGear?.coreItem === gearKey) {
    prog.hubGear.coreItem = null;
    return true;
  }
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

export function applyProgressionSpToPlayer(player, prog) {
  if (!player || !prog) return 0;
  ensureHubProgression(prog);
  const available = getHubBuildAvailableSp(prog);
  player.skillPoints = Math.max(0, available | 0);
  return player.skillPoints;
}

export function bankPlayerSpToProgression(player, prog) {
  if (!player || !prog) return 0;
  ensureHubProgression(prog);
  const available = Math.max(0, (player.skillPoints | 0) || 0);
  prog.sp = Math.max(0, getHubBuildSpentPoints(prog) + available);
  return prog.sp;
}

export function applyHubBuildToPlayer(player, prog) {
  if (!player || !prog) return null;
  ensureHubProgression(prog);
  initRunUpgrades(player);

  const coreKey = getHubCoreKey(prog);
  const coreDef = getStarterLoadoutDef(coreKey);

  const nextSkills = player.runSkills && typeof player.runSkills === "object" ? player.runSkills : {};
  for (const key of ACTIVE_SKILL_KEYS) nextSkills[key] = 0;
  player.runSkills = nextSkills;

  const nextPassives = player.runPassives && typeof player.runPassives === "object" ? player.runPassives : {};
  for (const key of PASSIVE_KEYS) nextPassives[key] = 0;
  for (const key of AFFINITY_KEYS) nextPassives[key] = 0;
  player.runPassives = nextPassives;

  applyStarterLoadoutToPlayer(player, coreKey);

  for (const [key, level] of Object.entries(prog.hubBuild.skills || {})) {
    if (!ACTIVE_SKILL_KEYS.includes(key)) continue;
    if (key === coreDef.skillKey) continue;
    player.runSkills[key] = Math.max(0, clampInt(level, 0, getOwnedSkillCap(prog, key)));
  }
  for (const [key, level] of Object.entries(prog.hubBuild.passives || {})) {
    if (!PASSIVE_KEYS.includes(key)) continue;
    player.runPassives[key] = Math.max(0, clampInt(level, 0, getOwnedPassiveCap(prog, key)));
  }

  const corePassiveBonuses = coreDef?.passiveBonuses && typeof coreDef.passiveBonuses === "object" ? coreDef.passiveBonuses : {};
  for (const [key, bonus] of Object.entries(corePassiveBonuses)) {
    if (!PASSIVE_KEYS.includes(key)) continue;
    player.runPassives[key] = Math.max(0, (player.runPassives[key] | 0) + Math.max(0, clampInt(bonus, 0, 999)));
  }

  const gearEffects = getHubGearAggregateEffects(prog);
  for (const [key, bonus] of Object.entries(gearEffects.passives || {})) {
    if (!PASSIVE_KEYS.includes(key)) continue;
    player.runPassives[key] = Math.max(0, (player.runPassives[key] | 0) + Math.max(0, clampInt(bonus, 0, 999)));
  }

  player.runEvolutions = player.runEvolutions && typeof player.runEvolutions === "object" ? player.runEvolutions : {};
  for (const evoKey of Object.keys(player.runEvolutions)) delete player.runEvolutions[evoKey];

  applyRunDerivedStats(player);
  const typeMults = player.runDamageTypeMults && typeof player.runDamageTypeMults === "object" ? player.runDamageTypeMults : (player.runDamageTypeMults = {});
  for (const type of DAMAGE_TYPE_KEYS) {
    const bonus = Number(gearEffects.damageTypes?.[type] || 0);
    if (!Number.isFinite(bonus) || bonus <= 0) continue;
    typeMults[type] = Math.max(0.1, Number(typeMults[type] || 1) + bonus);
  }

  player.hp = Math.min(Math.max(1, Number(player.hp) || 1), Math.max(1, Number(player.maxHP) || 1));
  return {
    coreKey,
    coreDef,
    availableSp: applyProgressionSpToPlayer(player, prog),
    equippedGearKeys: getEquippedHubGearKeys(prog),
    gearEffects,
  };
}

export function importPlayerSnapshotIntoHubBuild(prog, snapshot) {
  ensureHubProgression(prog);
  if (!snapshot || typeof snapshot !== "object") return false;

  const nextCoreKey = normalizeStarterLoadoutKey(snapshot.selectedStarterLoadout || prog.hubBuild.coreKey || prog.selectedStarterLoadout || "mecha");
  prog.hubBuild.coreKey = nextCoreKey;
  prog.selectedStarterLoadout = nextCoreKey;

  const coreSkillKey = getStarterLoadoutDef(nextCoreKey).skillKey;
  const runSkills = snapshot.runSkills && typeof snapshot.runSkills === "object" ? snapshot.runSkills : {};
  const runPassives = snapshot.runPassives && typeof snapshot.runPassives === "object" ? snapshot.runPassives : {};

  if (!prog.skillMeta || typeof prog.skillMeta !== "object") prog.skillMeta = {};

  for (const key of ACTIVE_SKILL_KEYS) {
    if (!key || key === coreSkillKey) continue;
    const lv = Math.max(0, clampInt(runSkills[key], 0, 99));
    if (lv <= 0) continue;
    const metaKey = `skill:${key}`;
    prog.skillMeta[metaKey] = Math.max(getOwnedSkillCap(prog, key), lv);
  }
  for (const key of PASSIVE_KEYS) {
    const lv = Math.max(0, clampInt(runPassives[key], 0, 99));
    if (lv <= 0) continue;
    const metaKey = `passive:${key}`;
    prog.skillMeta[metaKey] = Math.max(getOwnedPassiveCap(prog, key), lv);
  }

  prog.hubBuild.skills = sanitizeSkills(runSkills, prog, coreSkillKey);
  prog.hubBuild.passives = sanitizePassives(runPassives, prog);
  return true;
}
