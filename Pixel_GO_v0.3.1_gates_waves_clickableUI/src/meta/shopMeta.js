// Hub Shop meta-progression helpers (persistent coins + skill meta-levels).
// Minimal, self-contained module: DOM lobby uses this to render shop; game loop uses ensureShopMeta().

import { RUN_SKILLS, RUN_PASSIVES } from "../core/runUpgrades.js";

const MAX_META_LEVEL = 10;
// Bump when we need to migrate shop defaults.
const SHOP_META_VERSION = 7;

// Defaults:
// - only Gun (basic shot) is available by default
// - everything else is locked until purchased
// - all passives are available by default (can be upgraded in shop later)
const DEFAULT_SKILL_META = {
  "skill:bullets": 1,
  "skill:bombs": 0,
  "skill:satellites": 0,
  "skill:energyBarrier": 0,
  "skill:spirit": 0,
  "skill:summon": 0,
  "skill:electricZone": 0,
  "skill:laser": 0,
  "skill:lightning": 0,
  "skill:rockets": 0,
};

function clampInt(v, a, b) {
  v = (v | 0);
  return Math.max(a, Math.min(b, v));
}

export function ensureShopMeta(prog) {
  if (!prog || typeof prog !== "object") return prog;

  if (!Number.isFinite(prog.coins)) prog.coins = 0;
  prog.coins = Math.max(0, Math.floor(prog.coins));

  if (!prog.skillMeta || typeof prog.skillMeta !== "object") prog.skillMeta = {};
  const sm = prog.skillMeta;

  // One-time migration: v7 locks everything except Gun by default.
  // Keep any explicit upgrades (lvl > 1) intact.
  if (!Number.isFinite(prog.metaVersion)) prog.metaVersion = 0;
  const prevV = (prog.metaVersion | 0);
  if (prevV < SHOP_META_VERSION) {
    for (const s of RUN_SKILLS) {
      if (!s || s.kind !== "skill") continue;
      if (s.key === "bullets") continue;
      const id = `skill:${s.key}`;
      // If the user never explicitly upgraded (old default was 1), lock it now.
      if ((sm[id] | 0) === 1) sm[id] = 0;
    }
    prog.metaVersion = SHOP_META_VERSION;
  }

  // Ensure known skill ids exist
  for (const s of RUN_SKILLS) {
    const id = `skill:${s.key}`;
    const def = (id in DEFAULT_SKILL_META) ? DEFAULT_SKILL_META[id] : 1;
    if (!Number.isFinite(sm[id])) sm[id] = def;
    sm[id] = clampInt(sm[id], 0, MAX_META_LEVEL);
  }
  for (const p of RUN_PASSIVES) {
    const id = `passive:${p.key}`;
    if (!Number.isFinite(sm[id])) sm[id] = 1;
    sm[id] = clampInt(sm[id], 0, MAX_META_LEVEL);
  }

  // Shop offers persist so the table feels stable.
  // active: upgrades for already unlocked skills
  // newSkills: locked/new skills to unlock
  if (!prog.shopOffers || typeof prog.shopOffers !== "object") prog.shopOffers = { active: [], passive: [], newSkills: [] };
  if (!Array.isArray(prog.shopOffers.active)) prog.shopOffers.active = [];
  if (!Array.isArray(prog.shopOffers.passive)) prog.shopOffers.passive = [];
  if (!Array.isArray(prog.shopOffers.newSkills)) prog.shopOffers.newSkills = [];

  // Keep reroll counter (optional), but don't require it.
  if (!Number.isFinite(prog.shopRerollCount)) prog.shopRerollCount = 0;
  prog.shopRerollCount = Math.max(0, Math.floor(prog.shopRerollCount));

  return prog;
}

function buildCatalog() {
  const active = RUN_SKILLS
    .filter((s) => s && s.kind === "skill")
    // Rockets are an evolution (fusion). Keep it out of shop table for now.
    .filter((s) => s.key !== "rockets")
    .map((s) => ({
      id: `skill:${s.key}`,
      key: s.key,
      kind: "skill",
      name: s.name || s.key,
    }));

  const passive = RUN_PASSIVES
    .filter((p) => p && p.kind === "passive")
    .map((p) => ({
      id: `passive:${p.key}`,
      key: p.key,
      kind: "passive",
      name: p.name || p.key,
    }));

  const byId = new Map();
  for (const it of [...active, ...passive]) byId.set(it.id, it);
  return { active, passive, byId };
}

const CATALOG = buildCatalog();

export function getShopCatalog() {
  return CATALOG;
}

export function getMetaLevel(prog, id) {
  const sm = prog?.skillMeta;
  const v = sm && typeof sm === "object" ? sm[id] : 0;
  return Number.isFinite(v) ? clampInt(v, 0, MAX_META_LEVEL) : 0;
}

export function setMetaLevel(prog, id, lvl) {
  if (!prog || typeof prog !== "object") return;
  ensureShopMeta(prog);
  prog.skillMeta[id] = clampInt(lvl, 0, MAX_META_LEVEL);
}

export function getPriceFor(id, metaLevel) {
  const isSkill = id.startsWith("skill:");
  const unlockBase = isSkill ? 50 : 30;
  const upgradeBase = isSkill ? 35 : 22;

  if ((metaLevel | 0) <= 0) return unlockBase;
  // Upgrade price grows modestly.
  const p = upgradeBase * Math.pow(1.55, Math.max(0, (metaLevel | 0) - 1));
  return Math.max(1, Math.round(p));
}

function pickRandom(pool, used) {
  if (!pool || pool.length === 0) return null;
  // Try a few times to avoid duplicates.
  for (let t = 0; t < 12; t++) {
    const it = pool[(Math.random() * pool.length) | 0];
    if (!it) continue;
    if (used && used.has(it.id)) continue;
    return it;
  }
  // Fallback: linear scan
  for (const it of pool) {
    if (!it) continue;
    if (used && used.has(it.id)) continue;
    return it;
  }
  return null;
}

export function ensureShopOffers(prog) {
  ensureShopMeta(prog);
  const offers = prog.shopOffers;

  const used = new Set();
  // Normalize to ids
  offers.active = Array.isArray(offers.active) ? offers.active.filter(Boolean).map(String) : [];
  offers.passive = Array.isArray(offers.passive) ? offers.passive.filter(Boolean).map(String) : [];
  offers.newSkills = Array.isArray(offers.newSkills) ? offers.newSkills.filter(Boolean).map(String) : [];

  // Remove unknown ids
  offers.active = offers.active.filter((id) => CATALOG.byId.has(id));
  offers.passive = offers.passive.filter((id) => CATALOG.byId.has(id));
  offers.newSkills = offers.newSkills.filter((id) => CATALOG.byId.has(id));

  // Enforce rows intent:
  // - active: only unlocked skills (meta > 0)
  // - newSkills: only locked skills (meta <= 0)
  offers.active = offers.active.filter((id) => getMetaLevel(prog, id) > 0);
  offers.newSkills = offers.newSkills.filter((id) => getMetaLevel(prog, id) <= 0);

  const unlockedActivePool = CATALOG.active.filter((it) => getMetaLevel(prog, it.id) > 0);
  const lockedActivePool = CATALOG.active.filter((it) => getMetaLevel(prog, it.id) <= 0);

  for (const id of offers.active) used.add(id);
  for (const id of offers.passive) used.add(id);
  for (const id of offers.newSkills) used.add(id);

  while (offers.active.length < 3) {
    const it = pickRandom(unlockedActivePool, used);
    if (!it) break;
    offers.active.push(it.id);
    used.add(it.id);
  }
  while (offers.passive.length < 3) {
    const it = pickRandom(CATALOG.passive, used);
    if (!it) break;
    offers.passive.push(it.id);
    used.add(it.id);
  }

  while (offers.newSkills.length < 3) {
    const it = pickRandom(lockedActivePool, used);
    if (!it) break;
    offers.newSkills.push(it.id);
    used.add(it.id);
  }

  // Trim extras
  offers.active = offers.active.slice(0, 3);
  offers.passive = offers.passive.slice(0, 3);
  offers.newSkills = offers.newSkills.slice(0, 3);

  return offers;
}

export function rerollShopOffers(prog) {
  ensureShopMeta(prog);
  const offers = prog.shopOffers;
  offers.active = [];
  offers.passive = [];
  offers.newSkills = [];
  ensureShopOffers(prog);
  prog.shopRerollCount = (prog.shopRerollCount | 0) + 1;
  return offers;
}

export function replaceOfferSlot(prog, kind, idx) {
  ensureShopMeta(prog);
  const offers = ensureShopOffers(prog);

  const unlockedActivePool = CATALOG.active.filter((it) => getMetaLevel(prog, it.id) > 0);
  const lockedActivePool = CATALOG.active.filter((it) => getMetaLevel(prog, it.id) <= 0);

  const list = kind === "passive" ? offers.passive : (kind === "new" ? offers.newSkills : offers.active);
  const pool = kind === "passive" ? CATALOG.passive : (kind === "new" ? lockedActivePool : unlockedActivePool);

  const used = new Set([...offers.active, ...offers.passive, ...(offers.newSkills || [])]);
  // Remove current slot from used so it can be replaced (but we are going to replace it anyway).
  const curId = list[idx];
  if (curId) used.delete(curId);

  const it = pickRandom(pool, used);
  if (it) list[idx] = it.id;
  else list[idx] = curId || null;

  return offers;
}

export function getItemById(id) {
  return CATALOG.byId.get(id) || null;
}

export function getMaxMetaLevel() {
  return MAX_META_LEVEL;
}
