import { MAX_RUN_ACTIVE_SKILLS, RUN_PASSIVES, RUN_SKILLS } from "../runUpgrades.js";
import { normalizeStarterLoadoutKey } from "../starterLoadouts.js";

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
    effects: { passives: { attackSpeed: 1 }, damageTypes: { mecha: 0.12 } },
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
    effects: { passives: { range: 1 }, damageTypes: { electric: 0.18 } },
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
    effects: { passives: { damage: 1 }, damageTypes: { fire: 0.18 } },
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
    effects: { passives: { hp: 1 }, damageTypes: { ice: 0.18 } },
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
    effects: { passives: { critChance: 1, lifeSteal: 1 }, damageTypes: { dark: 0.18 } },
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
    effects: { passives: { range: 1, hpRegen: 1 }, damageTypes: { light: 0.18 } },
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
    effects: { passives: { lifeSteal: 2, hpRegen: 1 }, damageTypes: { dark: 0.2 } },
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
    effects: { passives: { hp: 2, hpRegen: 2 }, damageTypes: { light: 0.2 } },
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
    effects: { passives: { damage: 1, attackSpeed: 1, moveSpeed: 1 }, damageTypes: { mecha: 0.1 } },
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
    effects: { passives: { range: 1 }, damageTypes: { electric: 0.14, fire: 0.14, ice: 0.14 } },
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
    effects: { passives: { critChance: 1, critDamage: 1 }, damageTypes: { dark: 0.12, light: 0.12 } },
  },
];

const BIOME_LOOT_PROFILES = {
  mecha: {
    key: "mecha", label: "Mecha", roomMaterials: { salvage: 1 }, roomBonusChances: { salvage: 0.58, alloy: 0.36 },
    bossMaterials: { salvage: 3, alloy: 2, coreShard: 1 }, roomPartChance: 0.55, bossPartRolls: 3, bossItemChance: 0.24,
    preferredGearKeys: ["module_overclock_coil", "core_reactor_matrix"],
  },
  fire: {
    key: "fire", label: "Fire", roomMaterials: { salvage: 1 }, roomBonusChances: { salvage: 0.48, alloy: 0.22 },
    bossMaterials: { salvage: 4, alloy: 1, coreShard: 1 }, roomPartChance: 0.5, bossPartRolls: 3, bossItemChance: 0.22,
    preferredGearKeys: ["module_flame_injector", "core_elemental_conduit"],
  },
  ice: {
    key: "ice", label: "Ice", roomMaterials: { salvage: 1 }, roomBonusChances: { alloy: 0.54, coreShard: 0.08 },
    bossMaterials: { salvage: 2, alloy: 3, coreShard: 1 }, roomPartChance: 0.5, bossPartRolls: 3, bossItemChance: 0.22,
    preferredGearKeys: ["module_cryo_prism", "core_elemental_conduit"],
  },
  electric: {
    key: "electric", label: "Electric", roomMaterials: { salvage: 1 }, roomBonusChances: { alloy: 0.52, salvage: 0.2 },
    bossMaterials: { salvage: 2, alloy: 3, coreShard: 1 }, roomPartChance: 0.56, bossPartRolls: 3, bossItemChance: 0.24,
    preferredGearKeys: ["module_chain_capacitor", "core_elemental_conduit", "core_reactor_matrix"],
  },
  dark: {
    key: "dark", label: "Dark", roomMaterials: { salvage: 1 }, roomBonusChances: { coreShard: 0.18, alloy: 0.18 },
    bossMaterials: { salvage: 2, alloy: 1, coreShard: 2 }, roomPartChance: 0.54, bossPartRolls: 3, bossItemChance: 0.28,
    preferredGearKeys: ["module_void_emitter", "relic_void_heart", "core_twilight_gem"],
  },
  light: {
    key: "light", label: "Light", roomMaterials: { salvage: 1 }, roomBonusChances: { alloy: 0.26, coreShard: 0.18 },
    bossMaterials: { salvage: 2, alloy: 2, coreShard: 2 }, roomPartChance: 0.54, bossPartRolls: 3, bossItemChance: 0.28,
    preferredGearKeys: ["module_prism_lens", "relic_sanctuary_sigil", "core_twilight_gem"],
  },
};

export const HUB_GEAR_BY_KEY = Object.fromEntries(HUB_GEAR_DEFS.map((def) => [String(def.key), def]));
export const ACTIVE_SKILL_KEYS = (RUN_SKILLS || []).filter((def) => def && def.kind === "skill").map((def) => String(def.key || "")).filter(Boolean);
export const PASSIVE_KEYS = (RUN_PASSIVES || []).filter((def) => def && def.kind === "passive").map((def) => String(def.key || "")).filter(Boolean);
export const AFFINITY_KEYS = ["affElectric", "affFire", "affIce", "affLight", "affDark"];
export const DAMAGE_TYPE_KEYS = ["mecha", "electric", "fire", "ice", "light", "dark"];

export function clampInt(v, min, max) {
  const n = Number.isFinite(Number(v)) ? (Number(v) | 0) : 0;
  return Math.max(min, Math.min(max, n));
}

export function toPositiveInt(v, max = 9999999) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const whole = Math.trunc(n);
  if (whole <= 0) return 0;
  return Math.min(max, whole);
}

export function defaultEssences() {
  return { fire: 0, ice: 0, electric: 0, mecha: 0, dark: 0, light: 0 };
}

export function defaultMaterials() {
  return { salvage: 0, alloy: 0, coreShard: 0 };
}

export function defaultGearInventory() { return {}; }
export function defaultGearParts() { return {}; }

export function defaultHubGear() {
  return { modules: [null, null], relic: null, coreItem: null };
}

export function defaultHubBuild(coreKey = "mecha") {
  return { coreKey: normalizeStarterLoadoutKey(coreKey), skills: {}, passives: {} };
}

export function normalizeEssenceKey(raw) {
  const key = String(raw || "").trim().toLowerCase();
  if (key === "neutral" || key === "station" || key === "space" || key === "hub") return "mecha";
  return BIOME_ESSENCE_KEYS.includes(key) ? key : "mecha";
}

export function biomeKeyToEssenceKey(rawBiomeKey) { return normalizeEssenceKey(rawBiomeKey); }
export function getEssenceMeta(key) { return ESSENCE_META[normalizeEssenceKey(key)] || ESSENCE_META.mecha; }
export function getBiomeAccentColor(key, fallback = "#d7deff") { return String((ESSENCE_META[normalizeEssenceKey(key)] || {}).accent || fallback); }
export function getEssenceLabel(key) { return getEssenceMeta(key).label; }

export function normalizeMaterialKey(raw) {
  const key = String(raw || "").trim();
  return HUB_MATERIAL_KEYS.includes(key) ? key : "salvage";
}

export function getMaterialMeta(key) { return MATERIAL_META[normalizeMaterialKey(key)] || MATERIAL_META.salvage; }
export function getHubGearDef(key) { return HUB_GEAR_BY_KEY[String(key || "")] || null; }

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

export function getGearPrimaryBiomeKey(defOrKey) {
  const def = typeof defOrKey === "string" ? getHubGearDef(defOrKey) : defOrKey;
  if (!def) return "mecha";
  const sourceBiomes = getGearSourceBiomes(def);
  if (sourceBiomes.length) return normalizeEssenceKey(sourceBiomes[0]);
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

export function getHubGearDefsBySlot(slot) {
  const target = String(slot || "").trim();
  return HUB_GEAR_DEFS.filter((def) => def.slot === target);
}
