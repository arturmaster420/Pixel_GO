// Pixel_GO v0.4 — Floor NPC terminal shop.
// - Uses Skill Points (SP) earned from level-ups and cleared rooms.
// - Offers are generated per-player, per-floor (host authoritative in co-op).

import { initRunUpgrades, describeRunUpgrade, applyRunUpgrade, tryApplyRunUpgrade, RUN_SKILLS, MAX_RUN_SKILL_LEVEL, MAX_RUN_ACTIVE_SKILLS, EVOLUTION_DEFS, EVOLUTION_SKILL_KEYS } from "./runUpgrades.js";
import { biomeSkillsFor, getSkillFamily } from "../weapons/skillCatalog.js";
import { getStarterLoadoutDef } from "./starterLoadouts.js";
import { biomeName } from "../world/biomes.js";

const MAX_SKILL_LV = 6;
const MAX_ACTIVE_SKILLS = MAX_RUN_ACTIVE_SKILLS;

export const FLOOR_SHOP_REROLL_COSTS = [1, 3, 5];

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

export function getLiveOfferSkillLevel(player, offer) {
  if (!player || !offer || String(offer.kind || '') !== 'skill') return 0;
  const key = String(offer.key || '');
  if (!key) return 0;
  return ((player?.runSkills?.[key] | 0) || 0);
}

export function isLiveSkillUnlockOffer(player, offer) {
  return String(offer?.kind || '') === 'skill' && getLiveOfferSkillLevel(player, offer) <= 0;
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
    const lv = (s[k] | 0) || 0;
    if (lv > 0) {
      out.push({ key: k, name: SKILL_NAME_BY_KEY[k] || k, level: lv });
    }
  }
  return out;
}

const STARTER_STANDARD_SKILL_KEYS = ["bullets", "lightning", "fireball", "iceWall"];

function getStarterStandardSkillDef(player) {
  const requestedKey = String(player?._starterSkillKey || '').trim();
  const loadoutKey = String(player?._selectedStarterLoadout || '').trim();
  const fallbackKey = String(getStarterLoadoutDef(loadoutKey).skillKey || '').trim();
  const starterKey = STARTER_STANDARD_SKILL_KEYS.includes(requestedKey)
    ? requestedKey
    : (STARTER_STANDARD_SKILL_KEYS.includes(fallbackKey) ? fallbackKey : 'bullets');
  const def = (RUN_SKILLS || []).find((s) => s && s.key === starterKey);
  return def ? { key: starterKey, name: String(def.name || starterKey) } : null;
}

function getBiomeSkillOfferDefsForPlayer(player, biomeKey) {
  const biome = String(biomeKey || '').toLowerCase();
  const out = [...(biomeSkillsFor(biome) || [])];
  if (biome === 'neutral' || biome === 'mecha' || biome === 'mechanoid' || biome === '') {
    const starterDef = getStarterStandardSkillDef(player);
    if (starterDef && !out.some((def) => def && def.key === starterDef.key)) out.push(starterDef);
  }
  return out;
}

function getFloorShopSkillOfferDefs(player) {
  const out = [];
  const starterDef = getStarterStandardSkillDef(player);
  if (starterDef) out.push(starterDef);
  for (const key of EVOLUTION_SKILL_KEYS) {
    const hasSkill = !!(((player?.runSkills?.[key] | 0) > 0) || EVOLUTION_DEFS.some((def) => def.resultKey === key && player?.runEvolutions?.[def.fusionFlag]));
    if (!hasSkill || out.some((def) => def && def.key === key)) continue;
    const def = (RUN_SKILLS || []).find((s) => s && s.key === key);
    out.push({ key, name: String(def?.name || key) });
  }
  return out;
}



export function getLiveReplaceRequirement(player, offer) {
  if (!player || !offer) return { needsReplace: false, candidates: [], activeCount: 0, liveLevel: 0 };
  const liveLevel = getLiveOfferSkillLevel(player, offer);
  const isUnlock = String(offer?.kind || '') === 'skill' && liveLevel <= 0;
  const activeCount = countActiveSkills(player);
  const needsReplace = !!(isUnlock && activeCount >= MAX_ACTIVE_SKILLS);
  const candidates = needsReplace ? getReplaceCandidates(player, offer?.key) : [];
  return { needsReplace, candidates, activeCount, liveLevel };
}

export function offerNeedsReplace(player, offer) {
  return !!getLiveReplaceRequirement(player, offer)?.needsReplace;
}

export function getFloorShopRerollCost(fs) {
  const used = Math.max(0, (fs?.rerollsUsed | 0) || 0);
  return FLOOR_SHOP_REROLL_COSTS[used] || 0;
}

export function canRerollFloorShop(fs) {
  return getFloorShopRerollCost(fs) > 0;
}

export function rerollFloorShopOffersForPlayer(player, floorIndex, biomeKey, count = 3) {
  if (!player) return null;
  initRunUpgrades(player);
  const floor = floorIndex | 0;
  const biome = String(biomeKey || "").toLowerCase();
  const prev = player.floorShop || null;
  const used = Math.max(0, ((prev?.rerollsUsed | 0) || 0));
  const offers = rollFloorShopOffers(player, floor, biome, count);
  const next = { floor, offers, sold: offers.map(() => false), rerollsUsed: used + 1 };
  player.floorShop = next;
  return next;
}

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
  const cost = (def.key === "bullets") ? 1 : (EVOLUTION_SKILL_KEYS.includes(def.key) ? 2 : (isUnlock ? 2 : 1));

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

function hasAnyBombEvolution(player) {
  const evo = player?.runEvolutions || {};
  return !!(evo.rocketFusion || evo.energyBombFusion || evo.fireBombFusion || evo.iceBombFusion);
}

function getEvolutionOffers(player, floor, slot) {
  const s = player?.runSkills || {};
  const evo = player?.runEvolutions || {};
  if (hasAnyBombEvolution(player)) return [];
  if ((s.bombs | 0) < (MAX_RUN_SKILL_LEVEL.bombs || 6)) return [];
  const out = [];
  for (const def of EVOLUTION_DEFS) {
    if (evo[def.fusionFlag]) continue;
    if ((s[def.fromKey] | 0) < (MAX_RUN_SKILL_LEVEL[def.fromKey] || 6)) continue;
    if ((s[def.resultKey] | 0) > 0) continue;
    out.push({
      id: mkOfferId(floor, slot, "evolution", def.evoKey, 1),
      kind: "evolution",
      key: def.evoKey,
      name: def.name,
      from: 0,
      to: 1,
      spCost: 5,
      family: "evolution",
      biome: String(def.biome || ""),
    });
  }
  return out;
}

export function rollFloorShopOffersStandard(player, floorIndex, count = 3) {
  if (!player) return [];
  initRunUpgrades(player);

  const floor = floorIndex | 0;
  const offers = [];

  // Slot 0: Prefer a skill (keeps the build moving). Evolution can also appear here.
  const skillDefs = getFloorShopSkillOfferDefs(player);
  const evoOffers = getEvolutionOffers(player, floor, 0);
  const skillPool = skillDefs
    .map((def, i) => makeSkillOffer(player, floor, 0, def))
    .filter(Boolean);
  if (evoOffers.length) skillPool.unshift(...evoOffers);
  if (skillPool.length) {
    offers.push(skillPool[(Math.random() * skillPool.length) | 0]);
  }

  // Slot 1: Passive
  const passDef = STANDARD_PASSIVES[(Math.random() * STANDARD_PASSIVES.length) | 0];
  offers.push(makePassiveOffer(player, floor, 1, passDef));

  // Slot 2: Mixed (skill/passive), avoid duplicates
  const remaining = [];
  const evoOffer2 = getEvolutionOffers(player, floor, 2);
  if (evoOffer2.length) remaining.push(...evoOffer2);
  for (const def of skillDefs) {
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
  const rawBiome = String(biomeKey || "").toLowerCase();
  const biome = rawBiome || 'neutral';
  const hasBiome = !!biome;

  const offers = [];
  const skillDefs = getFloorShopSkillOfferDefs(player);

  const addLabeledBiomeOffer = (offer) => {
    if (!offer) return null;
    const picked = { ...offer };
    if (picked.kind === 'skill' || picked.family === 'biome-passive') {
      picked.name = `${picked.name} (${biomeName(biome)})`;
    }
    return picked;
  };

  const evoOffer = getEvolutionOffers(player, floor, 0);
  if (evoOffer.length) offers.push(evoOffer[(Math.random() * evoOffer.length) | 0]);

  if (hasBiome && offers.length < count) {
    const biomeSkillDefs = getBiomeSkillOfferDefsForPlayer(player, biome) || [];
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
  const evoOfferMixed = getEvolutionOffers(player, floor, offers.length);
  if (evoOfferMixed.length) mixedPool.push(...evoOfferMixed);
  for (const def of skillDefs) {
    const o = makeSkillOffer(player, floor, offers.length, def);
    if (o) mixedPool.push(o);
  }
  for (const def of STANDARD_PASSIVES) {
    mixedPool.push(makePassiveOffer(player, floor, offers.length, def));
  }
  if (hasBiome) {
    for (const def of (getBiomeSkillOfferDefsForPlayer(player, biome) || [])) {
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
    if (offerNeedsReplace(player, offer)) {
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

  const liveReq = getLiveReplaceRequirement(player, offer);
  if (liveReq.needsReplace) {
    const rk = String(replaceKey || "");
    if (!rk) return { ok: false, reason: 'need_replace' };
    const okCand = (liveReq.candidates || []).some((c) => c && String(c.key) === rk);
    if (!okCand) return { ok: false, reason: 'bad_replace' };
    // Apply replacement (set old skill to 0). Visual cleanup happens naturally on next tick.
    player.runSkills[rk] = 0;
  }

  const cost = (offer.spCost | 0) || 0;
  const sp = (player.skillPoints | 0) || 0;
  if (sp < cost) return { ok: false, reason: "no_sp" };
  player.skillPoints = sp - cost;
  const liveOffer = String(offer?.kind || '') === 'skill'
    ? { ...offer, from: liveReq.liveLevel | 0, to: Math.max(1, ((liveReq.liveLevel | 0) + 1)) }
    : offer;
  const applied = tryApplyRunUpgrade(player, liveOffer, replaceKey);
  if (!applied || !applied.ok) {
    player.skillPoints = sp;
    return applied || { ok: false, reason: "apply_failed" };
  }
  return { ok: true };
}
