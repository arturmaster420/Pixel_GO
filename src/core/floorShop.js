// Pixel_GO v0.4 — Floor NPC terminal shop.
// - Uses Skill Points (SP) earned from level-ups and floor clears.
// - Offers are generated per-player, per-floor (host authoritative in co-op).

import { initRunUpgrades, describeRunUpgrade, applyRunUpgrade, RUN_SKILLS } from "./runUpgrades.js";
import { STANDARD_SKILL_KEYS, biomeSkillsFor, getSkillFamily } from "../weapons/skillCatalog.js";
import { biomeName } from "../world/biomes.js";

const MAX_SKILL_LV = 6;
const MAX_ACTIVE_SKILLS = 6;

const SKILL_NAME_BY_KEY = (() => {
  const m = Object.create(null);
  for (const s of (RUN_SKILLS || [])) {
    if (s && s.key) m[String(s.key)] = String(s.name || s.key);
  }
  // Friendly fallbacks
  if (!m.bullets) m.bullets = "Gun";
  if (!m.bombs) m.bombs = "Bombs";
  if (!m.energyBarrier) m.energyBarrier = "Shield";
  return m;
})();

function countActiveSkills(player) {
  const s = player?.runSkills || {};
  let n = 0;
  for (const def of (RUN_SKILLS || [])) {
    const k = def?.key;
    if (!k) continue;
    if (((s[k] | 0) || 0) > 0) n++;
  }
  return n;
}

export function getReplaceCandidates(player, newSkillKey) {
  if (!player) return [];
  initRunUpgrades(player);
  const s = player.runSkills || {};
  const out = [];
  const nk = String(newSkillKey || "");
  for (const def of (RUN_SKILLS || [])) {
    const k = String(def?.key || "");
    if (!k) continue;
    if (k === nk) continue;
    // Do not allow replacing the base gun.
    if (k === "bullets") continue;
    const lv = (s[k] | 0) || 0;
    if (lv > 0) {
      out.push({ key: k, name: SKILL_NAME_BY_KEY[k] || k, level: lv });
    }
  }
  return out;
}

const STANDARD_SKILLS = STANDARD_SKILL_KEYS.map((key) => {
  const def = (RUN_SKILLS || []).find((s) => s && s.key === key);
  return { key, name: String(def?.name || key) };
});

const STANDARD_PASSIVES = [
  { key: "damage", name: "Damage" },
  { key: "attackSpeed", name: "Attack Speed" },
  { key: "moveSpeed", name: "Move Speed" },
  { key: "hp", name: "Max HP" },
  { key: "hpRegen", name: "HP Regen" },
  { key: "range", name: "Range" },
  { key: "pickupRadius", name: "Pickup Radius" },
  { key: "xpGain", name: "XP Gain" },
  { key: "critChance", name: "Crit Chance" },
  { key: "critDamage", name: "Crit Damage" },
  { key: "lifeSteal", name: "Life Steal" },
];

// Biome "affinities" (sold starting from floor 6 via the biome slot)
// Implemented as special run passives (handled in gameLoop combat helpers).
const BIOME_AFFINITIES = {
  electric: { key: "affElectric", name: "Electric Affinity" },
  fire: { key: "affFire", name: "Fire Affinity" },
  ice: { key: "affIce", name: "Ice Affinity" },
  light: { key: "affLight", name: "Light Affinity" },
  dark: { key: "affDark", name: "Dark Affinity" },
};

// Biome active skills (sold in the biome slot starting from floor 6).
const MAX_AFFINITY_LV = 6;

function clamp(n, a, b) {
  return n < a ? a : (n > b ? b : n);
}

function pickUnique(arr, count) {
  const pool = arr.slice();
  const out = [];
  while (out.length < count && pool.length) {
    const idx = (Math.random() * pool.length) | 0;
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

function mkOfferId(floor, slot, kind, key, to) {
  return `fs_${floor}_${slot}_${kind}_${key}_${to}`;
}

function makeSkillOffer(player, floor, slot, def) {
  const s = player.runSkills || {};
  const lv = (s[def.key] | 0) || 0;
  const next = clamp(lv + 1, 1, MAX_SKILL_LV);
  if (lv >= MAX_SKILL_LV) return null;

  // Cost model:
  // - unlocking (lv==0) costs 2 SP (except Gun which is always present)
  // - upgrades cost 1 SP
  const isUnlock = lv <= 0;
  const cost = (def.key === "bullets") ? 1 : (isUnlock ? 2 : 1);

  const activeNow = countActiveSkills(player);
  const needsReplace = isUnlock && activeNow >= MAX_ACTIVE_SKILLS;

  const fam = getSkillFamily(def.key);
  return {
    id: mkOfferId(floor, slot, "skill", def.key, next),
    kind: "skill",
    key: def.key,
    name: def.name,
    from: lv,
    to: next,
    spCost: cost,
    requiresReplace: needsReplace,
    family: fam.group,
    biome: fam.biome || "",
  };
}

function makePassiveOffer(player, floor, slot, def) {
  const p = player.runPassives || {};
  const lv = (p[def.key] | 0) || 0;
  const next = lv + 1;
  return {
    id: mkOfferId(floor, slot, "passive", def.key, next),
    kind: "passive",
    key: def.key,
    name: def.name,
    from: lv,
    to: next,
    spCost: 1,
    family: "passive",
    biome: "",
  };
}

function makeAffinityOffer(player, floor, slot, biomeKey) {
  const b = String(biomeKey || "").toLowerCase();
  const def = BIOME_AFFINITIES[b];
  if (!def) return null;
  const p = player.runPassives || {};
  const lv = (p[def.key] | 0) || 0;
  if (lv >= MAX_AFFINITY_LV) return null;
  const next = lv + 1;

  // Cost model: affinities are impactful -> 2 SP per level.
  const cost = 2;
  return {
    id: mkOfferId(floor, slot, "aff", def.key, next),
    kind: "passive",
    key: def.key,
    name: def.name,
    from: lv,
    to: next,
    spCost: cost,
    _biome: b,
    family: "biome-passive",
    biome: b,
  };
}

export function rollFloorShopOffersStandard(player, floorIndex, count = 3) {
  if (!player) return [];
  initRunUpgrades(player);

  const floor = floorIndex | 0;
  const offers = [];

  // Slot 0: Prefer a skill (keeps the build moving)
  const skillPool = STANDARD_SKILLS
    .map((def, i) => makeSkillOffer(player, floor, 0, def))
    .filter(Boolean);
  if (skillPool.length) {
    offers.push(skillPool[(Math.random() * skillPool.length) | 0]);
  }

  // Slot 1: Passive
  const passDef = STANDARD_PASSIVES[(Math.random() * STANDARD_PASSIVES.length) | 0];
  offers.push(makePassiveOffer(player, floor, 1, passDef));

  // Slot 2: Mixed (skill/passive), avoid duplicates
  const remaining = [];
  for (const def of STANDARD_SKILLS) {
    const o = makeSkillOffer(player, floor, 2, def);
    if (o) remaining.push(o);
  }
  for (const def of STANDARD_PASSIVES) {
    remaining.push(makePassiveOffer(player, floor, 2, def));
  }

  const usedIds = new Set(offers.map((o) => o && o.id));
  const pool2 = remaining.filter((o) => o && !usedIds.has(o.id) && !offers.some((a) => a && a.kind === o.kind && a.key === o.key));
  if (pool2.length) offers.push(pool2[(Math.random() * pool2.length) | 0]);

  // Trim / pad (should be exactly count)
  while (offers.length > count) offers.pop();
  while (offers.length < count) {
    const pDef = STANDARD_PASSIVES[(Math.random() * STANDARD_PASSIVES.length) | 0];
    offers.push(makePassiveOffer(player, floor, offers.length, pDef));
  }

  return offers;
}

// Main v0.4.1 API: floors 1–5 -> standard only, floors 6+ -> standard + passive + biome slot.
export function rollFloorShopOffers(player, floorIndex, biomeKey, count = 3) {
  if (!player) return [];
  initRunUpgrades(player);
  const floor = floorIndex | 0;
  const biome = String(biomeKey || "").toLowerCase();
  const hasBiome = !!biome;

  const offers = [];

  const addLabeledBiomeOffer = (offer) => {
    if (!offer) return null;
    const picked = { ...offer };
    if (picked.kind === 'skill' || picked.family === 'biome-passive') {
      picked.name = `${picked.name} (${biomeName(biome)})`;
    }
    return picked;
  };

  if (hasBiome) {
    const biomeSkillDefs = biomeSkillsFor(biome) || [];
    const biomeSkillOffers = biomeSkillDefs
      .map((def) => makeSkillOffer(player, floor, 0, def))
      .filter(Boolean);
    const guaranteedPool = biomeSkillOffers.filter((o) => (o.from | 0) <= 0);
    const sourcePool = guaranteedPool.length ? guaranteedPool : biomeSkillOffers;
    if (sourcePool.length) {
      offers.push(addLabeledBiomeOffer(sourcePool[(Math.random() * sourcePool.length) | 0]));
    }
  }

  const mixedPool = [];
  for (const def of STANDARD_SKILLS) {
    const o = makeSkillOffer(player, floor, offers.length, def);
    if (o) mixedPool.push(o);
  }
  for (const def of STANDARD_PASSIVES) {
    mixedPool.push(makePassiveOffer(player, floor, offers.length, def));
  }
  if (hasBiome) {
    for (const def of (biomeSkillsFor(biome) || [])) {
      const o = makeSkillOffer(player, floor, offers.length, def);
      if (o) mixedPool.push(addLabeledBiomeOffer(o));
    }
    const aff = makeAffinityOffer(player, floor, offers.length, biome);
    if (aff) mixedPool.push(addLabeledBiomeOffer(aff));
  }

  while (offers.length < count && mixedPool.length) {
    const uniquePool = mixedPool.filter((o) => o && !offers.some((a) => a && a.kind === o.kind && a.key === o.key));
    if (!uniquePool.length) break;
    offers.push(uniquePool[(Math.random() * uniquePool.length) | 0]);
  }

  while (offers.length > count) offers.pop();
  while (offers.length < count) {
    const pDef = STANDARD_PASSIVES[(Math.random() * STANDARD_PASSIVES.length) | 0];
    offers.push(makePassiveOffer(player, floor, offers.length, pDef));
  }

  return offers;
}

export function describeFloorShopOffer(player, offer) {
  if (!player || !offer) return "";
  // Reuse run-upgrade descriptions where possible.
  try {
    const base = describeRunUpgrade(player, offer);
    if (offer.kind === 'skill' && offer.from <= 0 && offer.requiresReplace) {
      return `${base} (Max ${MAX_ACTIVE_SKILLS} active skills: will replace one)`;
    }
    return base;
  } catch {
    return "";
  }
}

export function tryBuyFloorShopOffer(player, offer) {
  return tryBuyFloorShopOfferEx(player, offer, null);
}

export function tryBuyFloorShopOfferEx(player, offer, replaceKey) {
  if (!player || !offer) return { ok: false, reason: "invalid" };
  initRunUpgrades(player);

  // Enforce max active skills (unlocking a new skill may require replacing an existing one).
  if (offer.kind === 'skill' && (offer.from | 0) <= 0) {
    const activeNow = countActiveSkills(player);
    if (activeNow >= MAX_ACTIVE_SKILLS) {
      const rk = String(replaceKey || "");
      if (!rk) return { ok: false, reason: 'need_replace' };
      const cand = getReplaceCandidates(player, offer.key);
      const okCand = cand.some((c) => c && String(c.key) === rk);
      if (!okCand) return { ok: false, reason: 'bad_replace' };
      // Apply replacement (set old skill to 0). Visual cleanup happens naturally on next tick.
      player.runSkills[rk] = 0;
    }
  }

  const cost = (offer.spCost | 0) || 0;
  const sp = (player.skillPoints | 0) || 0;
  if (sp < cost) return { ok: false, reason: "no_sp" };
  player.skillPoints = sp - cost;
  applyRunUpgrade(player, offer);
  return { ok: true };
}
