// Hub NPC interactions (DOM): show an interact button on mobile + a Shop modal during gameplay.
// Keeps systems intact; only adds UI to access existing meta shop from inside the Hub.

import { saveProgression } from "../core/progression.js";
import { AVATARS } from "../core/avatars.js";
import { AURA_NAMES } from "../core/auras.js";
import { STARTER_LOADOUTS, ensureStarterLoadoutProgression, getCoreIdentity, getPassiveRouteMeta, getSkillRouteMeta, normalizeStarterLoadoutKey } from "../core/starterLoadouts.js";
import { RUN_PASSIVES, RUN_SKILLS } from "../core/runUpgrades.js";
import { BIOME_ESSENCE_KEYS, ESSENCE_EXCHANGE_RATE, ESSENCE_META, HUB_GEAR_DEFS, HUB_MATERIAL_KEYS, HUB_MODULE_SLOTS, MATERIAL_META, applyHubBuildToPlayer, applyProgressionSpToPlayer, canCraftHubGear, canEquipHubGear, canExchangeEssence, craftHubGear, ensureHubProgression, equipHubGear, exchangeEssence, getBiomeAccentColor, getBiomeLootProfile, getEquippedHubGearKeys, getEquippedHubSkillCount, getGearPartCount, getGearPrimaryBiomeKey, getGearSourceBiomes, getHubBuildAvailableSp, getHubBuildSpentPoints, getHubCoreKey, getHubGearDef, getHubGearDefsBySlot, getHubGearMaterialCosts, getHubGearPartCost, getHubGearSlotUsage, getMaterialCount, getOwnedPassiveCap, getOwnedSkillCap, HUB_BUILD_EXTRA_SKILL_SLOTS, isHubGearEquipped, isHubGearOwned, resetHubBuildAllocations, setHubCoreKey, setHubPassiveLevel, setHubSkillLevel, unequipHubGear } from "../core/hubBuild.js";
import { getStatsData } from "./hud.js";
import { getSkillDetailRows } from "../weapons/skillPresentation.js";
import {
  ensureShopMeta,
  ensureShopOffers,
  rerollShopOffers,
  replaceOfferSlot,
  getItemById,
  getMetaLevel,
  setMetaLevel,
  getPriceFor,
  getMaxMetaLevel,
} from "../meta/shopMeta.js";

let _inited = false;
let el = {};
let _shopRenderKey = "";
let _basicRenderKey = "";
let _shopRerollLocal = 0;

function make(tag, props = {}, kids = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "style" && v && typeof v === "object") Object.assign(e.style, v);
    else if (k === "className") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, String(v));
  }
  for (const c of kids) e.appendChild(c);
  return e;
}

function isTypingFocus() {
  const a = document.activeElement;
  if (!a) return false;
  const tag = (a.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea";
}

function setShopMsg(msg) {
  if (el.shopMsg) el.shopMsg.textContent = msg || "";
  if (el.buildMsg) el.buildMsg.textContent = msg || "";
  if (!el.shopMsg && !el.buildMsg) return;
  if (msg) {
    clearTimeout(setShopMsg._t);
    setShopMsg._t = setTimeout(() => {
      if (el.shopMsg) el.shopMsg.textContent = "";
      if (el.buildMsg) el.buildMsg.textContent = "";
    }, 1200);
  }
}


function formatCorePassiveBonuses(def) {
  const parts = [];
  const bonuses = def?.passiveBonuses && typeof def.passiveBonuses === "object" ? def.passiveBonuses : {};
  for (const [key, rawAmt] of Object.entries(bonuses)) {
    const amt = Number.isFinite(Number(rawAmt)) ? Math.max(0, Number(rawAmt) | 0) : 0;
    if (amt <= 0) continue;
    const passiveDef = (RUN_PASSIVES || []).find((it) => it && it.key === key);
    parts.push(`+${amt} ${String(passiveDef?.name || key)}`);
  }
  return parts.join(" • ");
}

function getCoreSkillAffinity(coreKey, skillDef) {
  const core = getCoreIdentity(coreKey);
  const favored = Array.isArray(core?.favoredSkillKeys) ? core.favoredSkillKeys : [];
  const skillKey = String(skillDef?.key || "");
  const skillBiome = String(skillDef?.biome || "neutral");
  const coreBiome = String(core?.biomeKey || "neutral");
  if (favored.includes(skillKey)) return 3;
  if (coreBiome === "neutral" || coreKey === "mecha") return skillBiome === "neutral" ? 2 : 0;
  if (skillBiome === coreBiome) return 2;
  return 0;
}

function getCorePassiveAffinity(coreKey, passiveKey) {
  const core = getCoreIdentity(coreKey);
  const favored = Array.isArray(core?.favoredPassiveKeys) ? core.favoredPassiveKeys : [];
  if (favored.includes(String(passiveKey || ""))) return 3;
  return 0;
}


const BUILD_BRANCH_META = {
  all: {
    label: "Wing Navigator",
    title: "Hub Progression Wings",
    hint: "Choose one hub platform to open its own dedicated progression screen.",
    intro: "The hub no longer pushes every system into one wall of cards. Each platform now opens its own focused screen: Arsenal for combat shell, Essence for crystals and exchange, Mastery for passive doctrine, Forge for materials and gear.",
    accent: "#8fd8ff",
  },
  arsenal: {
    label: "Arsenal Wing",
    title: "Arsenal Wing • Combat Shell",
    hint: "Core identity, route shaping and active combat slots.",
    intro: "This wing defines how your expedition fights. Pick your core path, review innate route bonuses and slot the extra active skills that ride under your core shell.",
    accent: "#80d7ff",
  },
  essence: {
    label: "Essence Conflux",
    title: "Essence Conflux • Crystal Treasury",
    hint: "Biome crystal currencies, exchange and route planning.",
    intro: "Every cleared room now feeds your crystal economy. Here you inspect all six colored essences, redirect them through exchange and decide which biome route you want to farm next.",
    accent: "#9fe6ff",
  },
  mastery: {
    label: "Mastery Archive",
    title: "Mastery Archive • Passive Doctrine",
    hint: "Long-form passive scaling and doctrine shaping.",
    intro: "This archive is the quiet half of the build. Spend banked SP on passives that define survivability, reach, damage tempo and hybrid routes without touching your core shell directly.",
    accent: "#c8b2ff",
  },
  forge: {
    label: "Forge Wing",
    title: "Forge Wing • Modules and Relics",
    hint: "Materials, gear forge and equipped hardware.",
    intro: "Bring back salvage, alloys, shards and parts from expeditions, then forge them into real hardware. Modules, relics and core items all live here as their own progression track.",
    accent: "#ffd490",
  },
};

function normalizeBuildFocus(raw) {
  const key = String(raw || "all").trim().toLowerCase();
  return BUILD_BRANCH_META[key] ? key : "all";
}

function getBuildFocus(state) {
  return normalizeBuildFocus(state?._hubBuildFocus || "all");
}

function setBuildFocus(state, focus) {
  if (!state) return "all";
  const next = normalizeBuildFocus(focus);
  state._hubBuildFocus = next;
  return next;
}

function focusMatches(current, target) {
  const focus = normalizeBuildFocus(current);
  return focus === "all" || focus === String(target || "").toLowerCase();
}

function setSectionVisibility(node, visible) {
  if (!node) return;
  node.style.display = visible ? "block" : "none";
}

const CHARACTER_TABS = {
  overview: { label: 'Hero', title: 'Hero Window' },
  skills: { label: 'Skills', title: 'Active Skills' },
  inventory: { label: 'Inventory', title: 'Inventory' },
  settings: { label: 'Options', title: 'Options & Hints' },
};

function normalizeCharacterTab(raw) {
  const key = String(raw || 'overview').trim().toLowerCase();
  return CHARACTER_TABS[key] ? key : 'overview';
}

function setCharacterTab(state, tab) {
  if (!state) return 'overview';
  const next = normalizeCharacterTab(tab);
  state._characterMenuTab = next;
  return next;
}

function getCharacterTab(state) {
  return normalizeCharacterTab(state?._characterMenuTab || 'overview');
}

function getGearIconMeta(def) {
  const key = String(def?.key || '');
  const slot = String(def?.slot || 'module');
  const icon = { glyph: slot === 'relic' ? '✦' : (slot === 'coreItem' ? '◉' : '⬡'), accent: '#9fd6ff' };
  if (key.includes('flame')) return { glyph: '△', accent: ESSENCE_META.fire.accent };
  if (key.includes('cryo')) return { glyph: '❄', accent: ESSENCE_META.ice.accent };
  if (key.includes('chain')) return { glyph: '⚡', accent: ESSENCE_META.electric.accent };
  if (key.includes('overclock') || key.includes('reactor')) return { glyph: '⚙', accent: ESSENCE_META.mecha.accent };
  if (key.includes('void') || key.includes('twilight')) return { glyph: '◈', accent: ESSENCE_META.dark.accent };
  if (key.includes('prism') || key.includes('sanctuary') || key.includes('conduit')) return { glyph: '✧', accent: ESSENCE_META.light.accent };
  if (slot === 'relic') return { glyph: '✦', accent: '#ffe08c' };
  if (slot === 'coreItem') return { glyph: '◉', accent: '#b7deff' };
  return icon;
}

function renderGearIcon(def, size = 34) {
  const meta = getGearIconMeta(def);
  const node = make('div', {
    title: String(def?.name || 'Item'),
    style: {
      width: `${size}px`,
      height: `${size}px`,
      minWidth: `${size}px`,
      borderRadius: '10px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: `${meta.accent}18`,
      border: `1px solid ${meta.accent}66`,
      boxShadow: `0 0 0 1px ${meta.accent}22 inset, 0 6px 14px rgba(0,0,0,0.24)`,
      color: meta.accent,
      fontSize: `${Math.max(14, Math.round(size * 0.48))}px`,
      fontWeight: '700',
      textShadow: '0 1px 0 rgba(0,0,0,0.35)',
    },
  });
  node.textContent = meta.glyph;
  return node;
}

function renderCharacterChip(label, value, accent = 'rgba(255,255,255,0.16)') {
  return make('div', {
    style: {
      padding: '8px 10px',
      borderRadius: '12px',
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${accent}`,
      minWidth: '110px',
    },
  }, [
    make('div', { text: label, style: { fontSize: '11px', color: 'rgba(210,230,255,0.74)', textTransform: 'uppercase', letterSpacing: '0.06em' } }),
    make('div', { text: value, style: { marginTop: '4px', fontSize: '14px', fontWeight: '700', color: '#f6fbff' } }),
  ]);
}

function renderCharacterSectionTitle(title, subtitle = '') {
  const wrap = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' } });
  wrap.appendChild(make('div', { text: title, style: { fontSize: '14px', fontWeight: '800', color: '#f7f7ff', textTransform: 'uppercase', letterSpacing: '0.08em' } }));
  if (subtitle) wrap.appendChild(make('div', { text: subtitle, style: { fontSize: '12px', lineHeight: '1.4', color: 'rgba(220,228,255,0.76)' } }));
  return wrap;
}

function renderHeroEquipmentSlot(label, def = null, opts = {}) {
  const accent = opts.accent || 'rgba(255,210,122,0.22)';
  const box = make('div', {
    style: {
      minHeight: '92px',
      borderRadius: '16px',
      padding: '10px',
      border: `1px solid ${def ? 'rgba(255,215,122,0.48)' : 'rgba(255,255,255,0.12)'}`,
      background: def ? 'linear-gradient(180deg, rgba(36,30,18,0.98), rgba(16,19,28,0.98))' : 'linear-gradient(180deg, rgba(16,20,29,0.96), rgba(10,13,20,0.98))',
      boxShadow: `0 0 0 1px ${accent} inset`,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: '8px',
    },
  });
  box.appendChild(make('div', { text: label, style: { fontSize: '11px', color: 'rgba(219,226,255,0.72)', textTransform: 'uppercase', letterSpacing: '0.07em' } }));
  const row = make('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } });
  row.appendChild(def ? renderGearIcon(def, 30) : make('div', { text: '◻', style: { width: '30px', height: '30px', display: 'grid', placeItems: 'center', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.32)', fontSize: '16px' } }));
  const txt = make('div', { style: { flex: '1 1 auto' } });
  txt.appendChild(make('div', { text: def ? def.name : 'Empty Slot', style: { fontSize: '13px', fontWeight: '700', color: def ? '#fff6dd' : 'rgba(232,240,255,0.72)' } }));
  txt.appendChild(make('div', { text: def ? String(def.style || '') : 'Equip at the matching hub wing', style: { marginTop: '3px', fontSize: '11px', color: 'rgba(214,232,255,0.72)', lineHeight: '1.35' } }));
  row.appendChild(txt);
  box.appendChild(row);
  return box;
}


const SKILL_DEF_BY_KEY = Object.fromEntries((RUN_SKILLS || []).filter(Boolean).map((def) => [String(def.key || ''), def]));
const PASSIVE_DEF_BY_KEY = Object.fromEntries((RUN_PASSIVES || []).filter(Boolean).map((def) => [String(def.key || ''), def]));

function normalizeBiomeFrameKey(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (!key || key === 'neutral' || key === 'station' || key === 'space' || key === 'hub') return 'mecha';
  return ESSENCE_META[key] ? key : 'mecha';
}

function getFrameAccent(key, fallback = '#b8d9ff') {
  return String(getBiomeAccentColor(normalizeBiomeFrameKey(key), fallback) || fallback);
}

function getFrameCss(accent, opts = {}) {
  const empty = !!opts.empty;
  const selected = !!opts.selected;
  return {
    border: `1px solid ${empty ? 'rgba(255,255,255,0.12)' : `${accent}${selected ? 'ff' : '88'}`}`,
    background: empty
      ? 'linear-gradient(180deg, rgba(14,18,27,0.96), rgba(9,12,18,0.98))'
      : `linear-gradient(180deg, ${accent}18, rgba(12,16,24,0.98))`,
    boxShadow: selected
      ? `0 0 0 1px ${accent} inset, 0 0 22px ${accent}55`
      : `0 0 0 1px ${empty ? 'rgba(255,255,255,0.04)' : `${accent}33`} inset`,
  };
}

function getSkillDefByKey(key) {
  return SKILL_DEF_BY_KEY[String(key || '')] || null;
}

function getPassiveDefByKey(key) {
  return PASSIVE_DEF_BY_KEY[String(key || '')] || null;
}

function getSkillBiomeKey(key) {
  const def = getSkillDefByKey(key);
  if (def?.biome) return normalizeBiomeFrameKey(def.biome);
  const routeMeta = getSkillRouteMeta(key);
  return normalizeBiomeFrameKey(routeMeta?.route || 'mecha');
}

function getPassiveBiomeKey(key) {
  const routeMeta = getPassiveRouteMeta(key);
  return normalizeBiomeFrameKey(routeMeta?.route || 'mecha');
}

function getSkillIconMeta(defOrKey) {
  const def = typeof defOrKey === 'string' ? getSkillDefByKey(defOrKey) : defOrKey;
  const key = String(def?.key || defOrKey || '');
  const biomeKey = getSkillBiomeKey(key);
  const accent = getFrameAccent(biomeKey);
  const glyphMap = {
    bullets: '✦', bombs: '⬢', rockets: '➤', energyBarrier: '🛡', satellites: '❄', spirit: '☾', summon: '✧',
    electricZone: '⚡', laser: '☄', lightning: '↯', fireball: '🔥', iceWall: '❅', blackhole: '◉', lightHeal: '✚',
    stormStrike: '⚡', flameNova: '☀', iceShards: '❄', voidBurst: '◈', holyNova: '✦', shrapnelBurst: '✸',
    railVolley: '➠', arcSpark: '⚡', staticPulse: '⌁', meteorRain: '☄', magmaLance: '△', frostNova: '✷',
    crystalSpear: '◇', soulDrain: '☽', dreadRing: '◎', prismRay: '✧', sanctuary: '⬡', energyBomb: '⚡',
    fireBomb: '🔥', iceBomb: '❄'
  };
  return { accent, glyph: glyphMap[key] || '✦' };
}

function renderSkillIcon(defOrKey, size = 34) {
  const meta = getSkillIconMeta(defOrKey);
  return make('div', {
    style: {
      width: `${size}px`,
      height: `${size}px`,
      minWidth: `${size}px`,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '12px',
      border: `1px solid ${meta.accent}88`,
      background: `${meta.accent}1c`,
      color: meta.accent,
      fontSize: `${Math.max(14, Math.round(size * 0.46))}px`,
      fontWeight: '800',
      boxShadow: `0 0 0 1px ${meta.accent}22 inset`,
      textShadow: '0 1px 0 rgba(0,0,0,0.35)',
    },
  }, [document.createTextNode(meta.glyph)]);
}

function setCharacterSelection(state, selection) {
  if (!state) return null;
  state._characterMenuSelection = selection && typeof selection === 'object' ? { ...selection } : null;
  return state._characterMenuSelection;
}

function getCharacterSelection(state) {
  return state?._characterMenuSelection || null;
}

function sameCharacterSelection(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return String(a.kind || '') === String(b.kind || '') && String(a.key || '') === String(b.key || '') && !!a.isCore === !!b.isCore;
}

function selectCharacterEntry(state, selection, { rerender = true } = {}) {
  if (!state) return false;
  const prev = getCharacterSelection(state);
  if (sameCharacterSelection(prev, selection)) return false;
  setCharacterSelection(state, selection);
  if (rerender) renderCharacterMenu(state, true);
  return true;
}

function renderMenuSlot({ label = '', title = '', subtitle = '', accent = '#9fd6ff', icon = null, empty = false, selected = false, onClick = null, badge = '', size = 58, showLabel = true }) {
  const frame = getFrameCss(accent, { empty, selected });
  const hasLabel = !!(showLabel && label);
  const btn = make('button', {
    type: 'button',
    title: title || label || '',
    style: {
      width: `${size}px`,
      minWidth: `${size}px`,
      height: `${size + (hasLabel ? 14 : 0)}px`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: hasLabel ? '4px' : '0',
      borderRadius: '14px',
      cursor: 'pointer',
      padding: hasLabel ? '6px 4px' : '4px',
      position: 'relative',
      color: empty ? 'rgba(220,232,255,0.54)' : '#f6fbff',
      ...frame,
    },
  });
  if (typeof onClick === 'function') btn.addEventListener('click', onClick);
  btn.appendChild(icon || make('div', { text: empty ? '◻' : '⬡', style: { fontSize: '18px', opacity: empty ? '0.42' : '0.92' } }));
  if (hasLabel) btn.appendChild(make('div', { text: label, style: { maxWidth: '100%', fontSize: '10px', lineHeight: '1.05', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.02em' } }));
  if (badge) {
    btn.appendChild(make('div', { text: badge, style: { position: 'absolute', top: '4px', right: '5px', minWidth: '18px', height: '18px', padding: '0 4px', display: 'grid', placeItems: 'center', borderRadius: '999px', background: 'rgba(0,0,0,0.58)', color: '#fff7dc', fontSize: '10px', fontWeight: '800', border: '1px solid rgba(255,255,255,0.08)' } }));
  }
  if (subtitle) btn.appendChild(make('div', { text: subtitle, style: { display: 'none' } }));
  return btn;
}

function buildCharacterActiveSkillSlots(state, player, coreDef) {
  const runSkills = player?.runSkills && typeof player.runSkills === 'object' ? player.runSkills : {};
  const coreKey = String(coreDef?.skillKey || 'bullets');
  const slots = [];
  const pushSkill = (skillKey, isCore = false) => {
    const def = getSkillDefByKey(skillKey) || { key: skillKey, name: skillKey };
    const level = Math.max(0, runSkills?.[skillKey] | 0) || (isCore ? 1 : 0);
    slots.push({ kind: 'skill', key: skillKey, def, level, isCore });
  };
  pushSkill(coreKey, true);
  for (const def of RUN_SKILLS || []) {
    const skillKey = String(def?.key || '');
    if (!skillKey || skillKey === coreKey) continue;
    const level = Math.max(0, runSkills?.[skillKey] | 0);
    if (level <= 0) continue;
    slots.push({ kind: 'skill', key: skillKey, def, level, isCore: false });
    if (slots.length >= 6) break;
  }
  while (slots.length < 6) slots.push({ kind: 'emptySkill', key: `empty-skill-${slots.length}`, def: null, level: 0, isCore: false });
  return slots.slice(0, 6);
}

function buildCharacterGearPreview(prog) {
  const owned = HUB_GEAR_DEFS.filter((def) => isHubGearOwned(prog, def.key));
  const equippedKeys = new Set(getEquippedHubGearKeys(prog));
  owned.sort((a, b) => Number(equippedKeys.has(b.key)) - Number(equippedKeys.has(a.key)) || String(a.name || '').localeCompare(String(b.name || '')));
  const out = owned.slice(0, 6).map((def) => ({ kind: 'gear', key: def.key, def }));
  while (out.length < 6) out.push({ kind: 'emptyGear', key: `empty-gear-${out.length}`, def: null });
  return out;
}

function buildCharacterModuleSlots(prog) {
  const equipped = getHubGearDefsBySlot('module').filter((def) => isHubGearEquipped(prog, def.key));
  const out = [equipped[0] || null, equipped[1] || null].map((def, idx) => ({ kind: def ? 'gear' : 'emptyGear', key: def?.key || `module-${idx}`, def }));
  return out;
}

function buildCharacterTopSlots(prog) {
  const relic = getHubGearDefsBySlot('relic').find((def) => isHubGearEquipped(prog, def.key)) || null;
  const coreItem = getHubGearDefsBySlot('coreItem').find((def) => isHubGearEquipped(prog, def.key)) || null;
  return [
    { label: 'Relic', kind: relic ? 'gear' : 'emptyGear', key: relic?.key || 'top-relic', def: relic },
    { label: 'Core', kind: coreItem ? 'gear' : 'emptyGear', key: coreItem?.key || 'top-core', def: coreItem },
  ];
}

function renderDetailCardShell(title, accent = '#9fd6ff', subtitle = '') {
  const wrap = make('div', { style: { padding: '14px', borderRadius: '18px', background: 'linear-gradient(180deg, rgba(18,22,33,0.98), rgba(9,12,18,0.98))', border: `1px solid ${accent}55`, boxShadow: `0 0 0 1px ${accent}22 inset` } });
  wrap.appendChild(make('div', { text: title, style: { fontSize: '16px', fontWeight: '800', color: '#fff5d7', letterSpacing: '0.03em' } }));
  if (subtitle) wrap.appendChild(make('div', { text: subtitle, style: { marginTop: '6px', fontSize: '12px', lineHeight: '1.45', color: 'rgba(220,232,255,0.80)' } }));
  return wrap;
}

function appendDetailLines(card, lines = []) {
  for (const line of lines) {
    if (!line) continue;
    card.appendChild(make('div', { text: String(line), style: { marginTop: '7px', fontSize: '12px', lineHeight: '1.45', color: 'rgba(232,243,255,0.88)' } }));
  }
}

function createStatsScrollBox(rows = [], expanded = false) {
  const wrap = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '0' } });
  const list = make('div', { style: { maxHeight: expanded ? '380px' : '168px', overflowY: 'auto', paddingRight: '4px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' } });
  for (const row of rows) {
    if (row?.section) {
      list.appendChild(make('div', { text: String(row.section), style: { gridColumn: '1 / -1', marginTop: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,216,122,0.88)' } }));
      continue;
    }
    const card = make('div', { style: { padding: '8px 10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)' } });
    card.appendChild(make('div', { text: String(row.label || 'Stat'), style: { fontSize: '11px', color: 'rgba(210,228,255,0.74)', textTransform: 'uppercase', letterSpacing: '0.05em' } }));
    card.appendChild(make('div', { text: String(row.value || '0'), style: { marginTop: '4px', fontSize: '14px', fontWeight: '700', color: '#f7fbff' } }));
    list.appendChild(card);
  }
  wrap.appendChild(list);
  return wrap;
}

function createSkillPopup(def, level = 0, accent = '#9fd6ff') {
  const rows = (getSkillDetailRows(def?.key, level) || []).slice(0, 8);
  const biomeKey = getSkillBiomeKey(def?.key);
  const routeMeta = getSkillRouteMeta(def?.key);
  const box = make('div', { style: { position: 'absolute', left: '18px', top: '18px', zIndex: '3', width: '248px', padding: '10px 12px', borderRadius: '14px', border: `1px solid ${accent}88`, background: 'rgba(6,10,18,0.96)', boxShadow: '0 14px 34px rgba(0,0,0,0.38)' } });
  box.appendChild(make('div', { text: String(def?.name || def?.key || 'Skill'), style: { fontSize: '14px', fontWeight: '800', color: '#fff4d4' } }));
  box.appendChild(make('div', { text: `${String((ESSENCE_META[biomeKey] || ESSENCE_META.mecha).short || biomeKey).toUpperCase()} • Lv ${Math.max(0, level | 0)}`, style: { marginTop: '3px', fontSize: '11px', color: 'rgba(214,232,255,0.82)', textTransform: 'uppercase', letterSpacing: '0.06em' } }));
  if (def?.desc) box.appendChild(make('div', { text: String(def.desc), style: { marginTop: '7px', fontSize: '12px', lineHeight: '1.35', color: 'rgba(236,244,255,0.90)' } }));
  if (routeMeta?.role || routeMeta?.style) box.appendChild(make('div', { text: [routeMeta?.role, routeMeta?.style].filter(Boolean).join(' • '), style: { marginTop: '6px', fontSize: '11px', lineHeight: '1.35', color: 'rgba(214,232,255,0.72)' } }));
  if (!rows.length) box.appendChild(make('div', { text: 'No detail rows available for this skill yet.', style: { marginTop: '6px', fontSize: '12px', lineHeight: '1.35', color: 'rgba(236,244,255,0.72)' } }));
  for (const row of rows) {
    box.appendChild(make('div', { text: `${row.label}: ${row.value}`, style: { marginTop: '6px', fontSize: '12px', lineHeight: '1.35', color: 'rgba(236,244,255,0.92)' } }));
  }
  return box;
}

function createDetailBody(card, { maxHeight = '100%', compact = false } = {}) {
  const body = make('div', {
    style: {
      marginTop: compact ? '10px' : '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: compact ? '8px' : '10px',
      minHeight: '0',
      maxHeight,
      overflowY: 'auto',
      paddingRight: '4px',
    },
  });
  card.appendChild(body);
  return body;
}

function renderSelectionDetailCard(state, prog, selection, statsData) {
  const sel = selection || { kind: 'overview', key: 'overview' };
  if (sel.kind === 'skill') {
    const def = getSkillDefByKey(sel.key) || { key: sel.key, name: sel.key };
    const biomeKey = getSkillBiomeKey(sel.key);
    const accent = getFrameAccent(biomeKey);
    const routeMeta = getSkillRouteMeta(sel.key);
    const level = Math.max(0, state?.player?.runSkills?.[sel.key] | 0) || Math.max(0, prog?.hubBuild?.skills?.[sel.key] | 0) || (sel.isCore ? 1 : 0);
    const card = renderDetailCardShell(String(def.name || sel.key), accent, `${String(routeMeta.route || biomeKey).toUpperCase()} • ${String(routeMeta.role || 'combat skill')}`);
    const body = createDetailBody(card, { maxHeight: '100%' });
    const top = make('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } });
    top.appendChild(renderSkillIcon(def, 52));
    const txt = make('div');
    txt.appendChild(make('div', { text: level > 0 ? `Active level ${level}` : 'Not currently active', style: { fontSize: '13px', fontWeight: '700', color: '#f6fbff' } }));
    txt.appendChild(make('div', { text: `${String(routeMeta.style || 'general expedition value')}.`, style: { marginTop: '4px', fontSize: '12px', lineHeight: '1.4', color: 'rgba(216,232,255,0.82)' } }));
    top.appendChild(txt);
    body.appendChild(top);
    const detailRows = (getSkillDetailRows(def.key, level) || []).slice(0, 12).map((row) => `${row.label}: ${row.value}`);
    appendDetailLines(body, [
      def?.desc ? String(def.desc) : '',
      `Biome frame: ${String((ESSENCE_META[biomeKey] || ESSENCE_META.mecha).label)}`,
      sel.isCore ? 'This is your current core skill.' : 'This is one of your active expedition skills.',
      ...detailRows,
      !detailRows.length ? 'No expanded stat rows are defined for this skill yet.' : '',
      'Read-only in Hero Menu. Manage skill growth at Arsenal Wing NPC.',
    ]);
    return card;
  }
  if (sel.kind === 'gear') {
    const def = getHubGearDef(sel.key);
    if (!def) return renderDetailCardShell('Empty Slot', '#9fd6ff', 'No item selected.');
    const biomeKey = getGearPrimaryBiomeKey(def);
    const accent = getFrameAccent(biomeKey);
    const card = renderDetailCardShell(def.name, accent, `${String(def.slot || 'gear').toUpperCase()} • ${String(def.style || '')}`);
    const body = createDetailBody(card, { maxHeight: '100%' });
    const top = make('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } });
    top.appendChild(renderGearIcon(def, 52));
    const txt = make('div');
    txt.appendChild(make('div', { text: isHubGearEquipped(prog, def.key) ? 'Equipped' : (isHubGearOwned(prog, def.key) ? 'Owned in inventory' : 'Not crafted yet'), style: { fontSize: '13px', fontWeight: '700', color: '#f6fbff' } }));
    txt.appendChild(make('div', { text: `Parts ${getGearPartCount(prog, def.key)}/${getHubGearPartCost(def)} • ${gearCostText(def)}`, style: { marginTop: '4px', fontSize: '12px', lineHeight: '1.4', color: 'rgba(216,232,255,0.82)' } }));
    top.appendChild(txt);
    body.appendChild(top);
    const effects = [];
    for (const [key, amt] of Object.entries(def.effects?.passives || {})) effects.push(`+${Math.max(0, amt | 0)} ${key}`);
    for (const [key, amt] of Object.entries(def.effects?.damageTypes || {})) effects.push(`+${Math.round(Number(amt || 0) * 100)}% ${key} damage`);
    appendDetailLines(body, [def.desc, effects.length ? `Effects: ${effects.join(' • ')}` : '', 'Read-only in Hero Menu. Craft / equip at Forge Wing NPC.']);
    return card;
  }
  if (sel.kind === 'material') {
    const meta = MATERIAL_META[sel.key] || MATERIAL_META.salvage;
    const accent = String(meta.accent || '#bcd8ff');
    const card = renderDetailCardShell(meta.label, accent, 'Forge material');
    const body = createDetailBody(card, { maxHeight: '100%' });
    appendDetailLines(body, [
      `Count: ${Math.max(0, prog?.materials?.[meta.key] | 0)}`,
      `${meta.short} is used across crafting recipes and longer forge progression.`,
      'Materials are read-only here. Spend them at Forge Wing NPC.',
    ]);
    return card;
  }
  if (sel.kind === 'part') {
    const def = getHubGearDef(sel.key);
    const accent = getFrameAccent(getGearPrimaryBiomeKey(def));
    const card = renderDetailCardShell(`${String(def?.name || sel.key)} Parts`, accent, 'Crafting component');
    const body = createDetailBody(card, { maxHeight: '100%' });
    appendDetailLines(body, [
      `Stored parts: ${getGearPartCount(prog, sel.key)}`,
      `Needed to craft: ${getHubGearPartCost(def)}`,
      'Parts convert expedition farming into item crafting progress at Forge Wing.',
    ]);
    return card;
  }
  if (sel.kind === 'skillHint') {
    const card = renderDetailCardShell('Skill Details', '#9fd6ff', 'Click any active skill slot to inspect it.');
    const body = createDetailBody(card, { maxHeight: '100%' });
    appendDetailLines(body, ['The detail panel shows damage type, cooldown, level, rank and all supported rows for the selected skill.']);
    return card;
  }
  if (sel.kind === 'inventoryHint') {
    const card = renderDetailCardShell('Inventory Details', '#ffe08c', 'Click any item, relic, material or part slot to inspect it.');
    const body = createDetailBody(card, { maxHeight: '100%' });
    appendDetailLines(body, ['Inventory is read-only here. Forge / equip / progression actions remain at their matching hub NPC wings.']);
    return card;
  }
  const coreKey = getHubCoreKey(prog);
  const coreDef = STARTER_LOADOUTS.find((d) => d.key === coreKey) || STARTER_LOADOUTS[0] || null;
  const coreIdentity = getCoreIdentity(coreKey);
  const powerEstimate = Math.round((state?.player?.maxHP || 0) + (statsData?.mainRows?.length || 0) * 13 + getEquippedGearDefs(prog).length * 70);
  const card = renderDetailCardShell(String(coreDef?.name || 'Hero Overview'), getFrameAccent(coreIdentity?.damageType || coreKey), 'Read-only character panel');
  const body = createDetailBody(card, { maxHeight: '100%' });
  const chipRow = make('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' } });
  chipRow.appendChild(renderCharacterChip('Core', String(coreIdentity?.routeLabel || coreDef?.name || coreKey), `${getFrameAccent(coreIdentity?.damageType || coreKey)}44`));
  chipRow.appendChild(renderCharacterChip('Aura', String(AURA_NAMES[Math.max(0, prog?.auraId | 0) % Math.max(1, AURA_NAMES.length)] || 'Default'), `${getFrameAccent(coreIdentity?.damageType || coreKey)}33`));
  chipRow.appendChild(renderCharacterChip('Power', `${powerEstimate}`, 'rgba(255,214,122,0.22)'));
  chipRow.appendChild(renderCharacterChip('Growth', `${getHubBuildSpentPoints(prog)} spent • ${getHubBuildAvailableSp(prog)} free`, 'rgba(154,226,255,0.24)'));
  body.appendChild(chipRow);
  appendDetailLines(body, [
    `${String(coreIdentity?.summary || coreDef?.desc || 'Persistent expedition build.')}`,
    `Starter skill: ${String(coreDef?.skillName || coreDef?.skillKey || 'Core')}`,
    `Allocated SP: ${getHubBuildSpentPoints(prog)} • Free SP: ${getHubBuildAvailableSp(prog)}`,
    `Essences: ${BIOME_ESSENCE_KEYS.reduce((sum, key) => sum + Math.max(0, prog?.essences?.[key] | 0), 0)} • Materials: ${HUB_MATERIAL_KEYS.reduce((sum, key) => sum + Math.max(0, prog?.materials?.[key] | 0), 0)}`,
    statsData?.mainRows?.length ? `Power snapshot: ${statsData.mainRows.slice(0, 4).map((row) => `${row.label} ${row.value}`).join(' • ')}` : '',
  ]);
  return card;
}

function renderInventorySlotGrid(items, renderItem, cols = 6) {
  const grid = make('div', { style: { display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: '10px' } });
  for (const item of items) grid.appendChild(renderItem(item));
  return grid;
}

function renderInventoryGearCard(prog, def) {
  const owned = isHubGearOwned(prog, def.key);
  const equipped = isHubGearEquipped(prog, def.key);
  const partCost = getHubGearPartCost(def);
  const partOwned = getGearPartCount(prog, def.key);
  const sourceBiomes = getGearSourceBiomes(def).map((key) => (ESSENCE_META[key] || ESSENCE_META.mecha).short);
  const card = make('div', {
    className: 'shopCard',
    style: {
      padding: '12px',
      border: `1px solid ${equipped ? 'rgba(255,216,122,0.48)' : 'rgba(255,255,255,0.12)'}`,
      boxShadow: equipped ? '0 0 0 1px rgba(255,214,122,0.18) inset' : '0 0 0 1px rgba(255,255,255,0.04) inset',
      background: 'linear-gradient(180deg, rgba(18,22,33,0.98), rgba(10,13,20,0.98))',
    },
  });
  const top = make('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } });
  top.appendChild(renderGearIcon(def, 34));
  const title = make('div', { style: { flex: '1 1 auto' } });
  title.appendChild(make('div', { text: def.name, style: { fontSize: '14px', fontWeight: '800', color: '#f9f4de' } }));
  title.appendChild(make('div', { text: `${String(def.slot || '').toUpperCase()} • ${def.style}`, style: { marginTop: '4px', fontSize: '11px', color: 'rgba(214,232,255,0.76)', textTransform: 'uppercase', letterSpacing: '0.05em' } }));
  top.appendChild(title);
  top.appendChild(make('div', { text: equipped ? 'EQUIPPED' : (owned ? 'OWNED' : 'LOCKED'), style: { padding: '4px 8px', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.12)', background: equipped ? 'rgba(255,216,122,0.14)' : (owned ? 'rgba(123,196,255,0.12)' : 'rgba(255,255,255,0.05)'), color: equipped ? '#ffe29f' : '#dce8ff', fontSize: '10px', fontWeight: '800', letterSpacing: '0.07em' } }));
  card.appendChild(top);
  card.appendChild(make('div', { text: def.desc, style: { marginTop: '10px', fontSize: '12px', lineHeight: '1.4', color: 'rgba(230,240,255,0.88)' } }));
  const effects = [];
  for (const [key, amt] of Object.entries(def.effects?.passives || {})) effects.push(`+${Math.max(0, amt | 0)} ${key}`);
  for (const [key, amt] of Object.entries(def.effects?.damageTypes || {})) effects.push(`+${Math.round(Number(amt || 0) * 100)}% ${key}`);
  card.appendChild(make('div', { text: effects.length ? `Effects: ${effects.join(' • ')}` : 'Effects: —', style: { marginTop: '8px', fontSize: '11px', lineHeight: '1.4', color: 'rgba(255,232,188,0.86)' } }));
  const lines = [];
  lines.push(owned ? 'Stored in inventory.' : `Parts: ${partOwned}/${partCost}`);
  if (sourceBiomes.length) lines.push(`Routes: ${sourceBiomes.join(' • ')}`);
  lines.push('Manage forge / equip at Forge Wing NPC.');
  card.appendChild(make('div', { text: lines.join('   '), style: { marginTop: '10px', fontSize: '11px', lineHeight: '1.4', color: 'rgba(206,220,244,0.72)' } }));
  return card;
}

function renderSimpleInfoCard(title, lines = [], opts = {}) {
  const card = make('div', {
    className: 'shopCard',
    style: {
      padding: '12px',
      border: `1px solid ${opts.accent || 'rgba(255,255,255,0.16)'}`,
      boxShadow: `0 0 0 1px ${opts.accent || 'rgba(255,255,255,0.08)'} inset`,
      background: opts.background || 'rgba(16,22,34,0.92)',
    },
  });
  card.appendChild(make('div', { className: 'name', text: title, style: { color: '#f3fbff' } }));
  for (const line of lines) {
    if (!line) continue;
    card.appendChild(make('div', { className: 'muted', text: String(line), style: { marginTop: '7px', fontSize: '12px', lineHeight: '1.42', color: 'rgba(232,245,255,0.9)', opacity: '1' } }));
  }
  return card;
}

function renderPartCard(prog, def) {
  const partCost = getHubGearPartCost(def);
  const count = getGearPartCount(prog, def.key);
  const icon = renderGearIcon(def, 30);
  const card = make('div', { className: 'shopCard', style: { padding: '12px' } });
  const row = make('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } });
  row.appendChild(icon);
  const text = make('div', { style: { flex: '1 1 auto' } });
  text.appendChild(make('div', { className: 'name', text: `${def.name} Parts`, style: { color: '#f4fbff' } }));
  text.appendChild(make('div', { className: 'muted', text: `${count}/${partCost} parts stored`, style: { marginTop: '4px', fontSize: '12px', opacity: '1' } }));
  row.appendChild(text);
  row.appendChild(make('div', { className: 'lvl', text: `${count}/${partCost}` }));
  card.appendChild(row);
  card.appendChild(make('div', { className: 'muted', text: `Used to craft ${def.name}. ${def.style}.`, style: { marginTop: '8px', fontSize: '12px', lineHeight: '1.4', opacity: '1' } }));
  return card;
}

function openShop(state) {
  if (!state?.progression) return;
  ensureHubProgression(state.progression);
  ensureShopMeta(state.progression);
  ensureShopOffers(state.progression);
  state.overlayMode = "shop";
  if (el.shopOverlay) el.shopOverlay.style.display = "flex";
  if (el.basicOverlay) el.basicOverlay.style.display = "none";
  if (el.buildOverlay) el.buildOverlay.style.display = "none";
  if (el.characterOverlay) el.characterOverlay.style.display = "none";
  _shopRenderKey = "";
  renderShop(state);
}

function closeShop(state) {
  if (el.shopOverlay) el.shopOverlay.style.display = "none";
  if (state && state.overlayMode === "shop") state.overlayMode = null;
}

function openTier(state) {
  if (!state) return;
  state.overlayMode = "stats";
  closeShop(state);
}

function openBasicSelector(state) {
  if (!state?.progression) return;
  if (state?._hubResumeRunActive) {
    if (state.popups) state.popups.push({ text: "Starter Core locked during saved run", time: 1.5 });
    return;
  }
  ensureStarterLoadoutProgression(state.progression);
  state.overlayMode = "basic";
  closeShop(state);
  if (el.basicOverlay) el.basicOverlay.style.display = "flex";
  if (el.buildOverlay) el.buildOverlay.style.display = "none";
  if (el.characterOverlay) el.characterOverlay.style.display = "none";
  _basicRenderKey = "";
  renderBasicSelector(state);
}

function closeBasicSelector(state) {
  if (el.basicOverlay) el.basicOverlay.style.display = "none";
  _basicRenderKey = "";
  if (state && state.overlayMode === "basic") state.overlayMode = null;
}

function openBuildLab(state, focus = "arsenal") {
  if (!state?.progression) return;
  ensureHubProgression(state.progression);
  state.overlayMode = "build";
  const targetFocus = normalizeBuildFocus(focus || "arsenal");
  setBuildFocus(state, targetFocus === "all" ? "arsenal" : targetFocus);
  closeShop(state);
  if (el.buildOverlay) el.buildOverlay.style.display = "flex";
  if (el.basicOverlay) el.basicOverlay.style.display = "none";
  if (el.characterOverlay) el.characterOverlay.style.display = "none";
  renderBuildLab._key = "";
  renderBuildLab(state, true);
}

function closeBuildLab(state) {
  if (el.buildOverlay) el.buildOverlay.style.display = "none";
  if (state && state.overlayMode === "build") state.overlayMode = null;
  if (state) state._hubBuildFocus = "arsenal";
  renderBuildLab._key = "";
}

function closeCharacterMenu(state) {
  if (el.characterOverlay) el.characterOverlay.style.display = 'none';
  if (state && state.overlayMode === 'character') state.overlayMode = null;
  renderCharacterMenu._key = '';
}

function openCharacterMenu(state, tab = 'overview') {
  if (!state?.progression) return;
  ensureHubProgression(state.progression);
  state.overlayMode = 'character';
  setCharacterTab(state, tab);
  closeShop(state);
  closeBasicSelector(state);
  closeBuildLab(state);
  renderCharacterMenu(state, true);
}

function getEquippedGearDefs(prog) {
  return getEquippedHubGearKeys(prog).map((key) => getHubGearDef(key)).filter(Boolean);
}

function renderCharacterMenu(state, force = false) {
  const prog = state?.progression;
  const player = state?.player;
  if (!prog || !el.characterOverlay || !el.characterLeft || !el.characterContent) return;
  ensureHubProgression(prog);
  const tab = getCharacterTab(state);
  const portrait = window.innerHeight > window.innerWidth;
  const statsData = getStatsData(state) || { mainRows: [], allRows: [] };
  const coreKey = getHubCoreKey(prog);
  const coreDef = STARTER_LOADOUTS.find((d) => d.key === coreKey) || STARTER_LOADOUTS[0] || null;
  const coreIdentity = getCoreIdentity(coreKey);
  const avatar = AVATARS[Math.max(0, prog?.avatarIndex | 0) % Math.max(1, AVATARS.length)] || '🧙';
  const auraName = AURA_NAMES[Math.max(0, prog?.auraId | 0) % Math.max(1, AURA_NAMES.length)] || 'Default';
  const available = getHubBuildAvailableSp(prog);
  const spent = getHubBuildSpentPoints(prog);
  const ownedGear = HUB_GEAR_DEFS.filter((def) => isHubGearOwned(prog, def.key));
  const topSlots = buildCharacterTopSlots(prog);
  const moduleSlots = buildCharacterModuleSlots(prog);
  const skillSlots = buildCharacterActiveSkillSlots(state, player, coreDef);
  const sideGearSlots = buildCharacterGearPreview(prog);
  const defaultSelection = tab === 'skills' ? { kind: 'skillHint', key: 'skills' } : (tab === 'inventory' ? { kind: 'inventoryHint', key: 'inventory' } : { kind: 'overview', key: 'overview' });
  const selected = getCharacterSelection(state) || defaultSelection;
  const statsExpanded = !!state?._characterStatsExpanded;
  const sceneHeight = portrait
    ? Math.max(260, Math.min(Math.round(window.innerWidth * 0.68), Math.round(window.innerHeight * 0.42), 420))
    : Math.max(360, Math.min(window.innerHeight - 150, 760));
  const slotSize = sceneHeight < 320 ? 40 : (sceneHeight < 420 ? 44 : 48);
  const topRowTop = Math.max(30, Math.round(sceneHeight * 0.11));
  const bottomRowBottom = Math.max(10, Math.round(sceneHeight * 0.035));
  const centerTop = Math.max(56, Math.round(sceneHeight * 0.53));
  const avatarSize = Math.max(74, Math.min(92, Math.round(sceneHeight * 0.25)));
  const auraSize = Math.max(128, Math.min(152, Math.round(sceneHeight * 0.42)));
  const key = JSON.stringify({ tab, portrait, avatar: prog?.avatarIndex, aura: prog?.auraId, coreKey, selected, gearCount: Object.keys(prog.gearInventory || {}).length, partCount: Object.keys(prog.gearParts || {}).length, matCount: Object.keys(prog.materials || {}).length, essCount: Object.keys(prog.essences || {}).length, activeKeys: Object.keys(player?.runSkills || {}), passiveKeys: Object.keys(prog?.hubBuild?.passives || {}), hp: player?.hp, maxHP: player?.maxHP, statsExpanded, sceneHeight });
  if (!force && renderCharacterMenu._key === key) return;
  renderCharacterMenu._key = key;

  if (el.characterPanel) {
    el.characterPanel.style.width = portrait ? 'min(980px, 96vw)' : 'min(1320px, 96vw)';
    el.characterPanel.style.height = 'calc(100vh - 16px)';
    el.characterPanel.style.maxHeight = 'calc(100vh - 16px)';
    el.characterPanel.style.overflow = 'hidden';
    el.characterPanel.style.background = 'linear-gradient(180deg, rgba(14,18,28,0.99), rgba(8,10,16,0.99))';
    el.characterPanel.style.border = '1px solid rgba(255,216,122,0.20)';
    el.characterPanel.style.boxShadow = '0 18px 54px rgba(0,0,0,0.42), 0 0 0 1px rgba(255,255,255,0.04) inset';
  }
  if (el.characterLayout) {
    el.characterLayout.style.flexDirection = portrait ? 'column' : 'row';
    el.characterLayout.style.gap = portrait ? '12px' : '16px';
    el.characterLayout.style.flex = '1 1 auto';
    el.characterLayout.style.minHeight = '0';
    el.characterLayout.style.height = '100%';
  }
  if (el.characterLeft) {
    el.characterLeft.style.flex = portrait ? '0 0 auto' : '0 0 34%';
    el.characterLeft.style.minWidth = portrait ? '0' : '300px';
    el.characterLeft.style.minHeight = '0';
    el.characterLeft.style.overflow = 'hidden';
    el.characterLeft.style.display = 'flex';
    el.characterLeft.style.flexDirection = 'column';
  }
  if (el.characterRight) { el.characterRight.style.flex = portrait ? '1 1 auto' : '1 1 66%'; el.characterRight.style.minHeight = '0'; el.characterRight.style.overflow = 'hidden'; }
  if (el.characterTitle) el.characterTitle.textContent = String(prog?.nickname || player?.nickname || 'Hero');
  if (el.characterHp) el.characterHp.textContent = `${Math.max(0, Math.round(player?.hp || 0))}/${Math.max(1, Math.round(player?.maxHP || 1))} HP`;
  if (el.characterWallet) renderWalletBar(el.characterWallet, prog, { compact: true, align: 'right' });
  if (el.characterContent) { el.characterContent.style.flex = '1 1 auto'; el.characterContent.style.minHeight = '0'; el.characterContent.style.overflow = 'hidden'; }

  el.characterTabs.innerHTML = '';
  for (const [tabKey, meta] of Object.entries(CHARACTER_TABS)) {
    const active = tabKey === tab;
    const btn = make('button', {
      className: 'btn',
      type: 'button',
      text: meta.label,
      style: {
        padding: '8px 12px',
        minWidth: portrait ? 'auto' : '112px',
        borderColor: active ? 'rgba(255,216,122,0.52)' : 'rgba(255,255,255,0.12)',
        background: active ? 'linear-gradient(180deg, rgba(112,78,18,0.98), rgba(58,42,12,0.98))' : 'linear-gradient(180deg, rgba(23,28,42,0.98), rgba(12,16,24,0.98))',
        color: active ? '#fff0c8' : '#d8e5ff',
      },
    });
    btn.addEventListener('click', () => { setCharacterTab(state, tabKey); renderCharacterMenu(state, true); });
    el.characterTabs.appendChild(btn);
  }

  el.characterLeft.innerHTML = '';
  const previewCard = make('div', { style: { padding: '8px', borderRadius: '18px', background: 'linear-gradient(180deg, rgba(17,21,31,0.98), rgba(9,12,18,0.98))', border: '1px solid rgba(255,215,122,0.20)', boxShadow: '0 0 0 1px rgba(255,255,255,0.04) inset', overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: '0' } });
  const heroScene = make('div', { style: { position: 'relative', width: '100%', height: `${sceneHeight}px`, minHeight: `${sceneHeight}px`, maxHeight: `${sceneHeight}px`, borderRadius: '20px', background: 'radial-gradient(circle at 50% 34%, rgba(110,132,255,0.20), rgba(12,16,24,0.98) 63%)', overflow: 'hidden', flex: '1 1 auto' } });
  const leftCol = make('div', { style: { position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)', display: 'grid', gridTemplateRows: 'repeat(6, minmax(0, 1fr))', gap: '6px' } });
  skillSlots.forEach((slot) => {
    const def = slot.def;
    const accent = def ? getFrameAccent(getSkillBiomeKey(def.key)) : '#6a7386';
    const isSelected = selected?.kind === 'skill' && selected?.key === slot.key;
    const btn = renderMenuSlot({
      label: '',
      title: def ? `${String(def.name || def.key)} Lv ${slot.level}` : 'Empty active slot',
      accent,
      icon: def ? renderSkillIcon(def, 28) : null,
      empty: !def,
      selected: isSelected,
      badge: slot.level > 0 ? String(slot.level) : '',
      size: slotSize,
      onClick: def ? () => { selectCharacterEntry(state, { kind: 'skill', key: def.key, isCore: !!slot.isCore }); } : null,
      showLabel: false,
    });
    leftCol.appendChild(btn);
  });
  heroScene.appendChild(leftCol);
  const rightCol = make('div', { style: { position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', display: 'grid', gridTemplateRows: 'repeat(6, minmax(0, 1fr))', gap: '6px' } });
  sideGearSlots.forEach((entry, idx) => {
    const def = entry.def;
    const accent = def ? getFrameAccent(getGearPrimaryBiomeKey(def)) : '#6a7386';
    const isSelected = selected?.kind === 'gear' && selected?.key === entry.key;
    rightCol.appendChild(renderMenuSlot({
      label: '',
      title: def ? `${String(def.name || def.key)}` : `Future gear slot ${idx + 1}`,
      accent,
      icon: def ? renderGearIcon(def, 28) : null,
      empty: !def,
      selected: isSelected,
      size: slotSize,
      onClick: def ? () => { selectCharacterEntry(state, { kind: 'gear', key: def.key }); } : null,
      showLabel: false,
    }));
  });
  heroScene.appendChild(rightCol);
  const topRow = make('div', { style: { position: 'absolute', left: '50%', top: `${topRowTop}px`, transform: 'translateX(-50%)', display: 'flex', gap: '8px' } });
  topSlots.forEach((entry) => {
    const def = entry.def;
    const accent = def ? getFrameAccent(getGearPrimaryBiomeKey(def)) : '#6a7386';
    const isSelected = selected?.kind === 'gear' && selected?.key === entry.key;
    topRow.appendChild(renderMenuSlot({
      label: '',
      title: def ? def.name : `${entry.label} slot`,
      accent,
      icon: def ? renderGearIcon(def, 28) : null,
      empty: !def,
      selected: isSelected,
      size: slotSize,
      onClick: def ? () => { selectCharacterEntry(state, { kind: 'gear', key: def.key }); } : null,
      showLabel: false,
    }));
  });
  heroScene.appendChild(topRow);
  const bottomRow = make('div', { style: { position: 'absolute', left: '50%', bottom: `${bottomRowBottom}px`, transform: 'translateX(-50%)', display: 'flex', gap: '8px' } });
  moduleSlots.forEach((entry, idx) => {
    const def = entry.def;
    const accent = def ? getFrameAccent(getGearPrimaryBiomeKey(def)) : '#6a7386';
    const isSelected = selected?.kind === 'gear' && selected?.key === entry.key;
    bottomRow.appendChild(renderMenuSlot({
      label: '',
      title: def ? def.name : `Module slot ${idx + 1}`,
      accent,
      icon: def ? renderGearIcon(def, 28) : null,
      empty: !def,
      selected: isSelected,
      size: slotSize,
      onClick: def ? () => { selectCharacterEntry(state, { kind: 'gear', key: def.key }); } : null,
      showLabel: false,
    }));
  });
  heroScene.appendChild(bottomRow);
  const auraAccent = getFrameAccent(coreIdentity?.damageType || coreKey);
  const center = make('div', { style: { position: 'absolute', left: '50%', top: `${centerTop}px`, transform: 'translate(-50%, -50%)', width: `${Math.max(156, Math.round(sceneHeight * 0.55))}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', textAlign: 'center' } });
  center.appendChild(make('div', { style: { width: `${auraSize}px`, height: `${auraSize}px`, borderRadius: '50%', background: `radial-gradient(circle, ${auraAccent}66, ${auraAccent}08 68%)`, filter: 'blur(4px)', position: 'absolute', zIndex: '0' } }));
  center.appendChild(make('div', { text: avatar, style: { position: 'relative', zIndex: '1', fontSize: `${avatarSize}px`, lineHeight: '1', textShadow: '0 8px 24px rgba(0,0,0,0.36)' } }));
  heroScene.appendChild(center);
  if (tab === 'overview' && selected?.kind === 'skill') {
    try {
      const popupDef = getSkillDefByKey(selected.key);
      const popupLv = Math.max(0, state?.player?.runSkills?.[selected.key] | 0) || Math.max(0, prog?.hubBuild?.skills?.[selected.key] | 0) || 1;
      if (popupDef) heroScene.appendChild(createSkillPopup(popupDef, popupLv, getFrameAccent(getSkillBiomeKey(selected.key))));
    } catch {}
  }
  previewCard.appendChild(heroScene);
  el.characterLeft.appendChild(previewCard);

  el.characterContent.innerHTML = '';

  if (tab === 'overview') {
    const heroWrap = make('div', { style: { display: 'grid', gridTemplateColumns: portrait ? '1fr' : '0.78fr 1.22fr', gap: '12px', minHeight: '0', height: '100%' } });
    const detailCol = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '0', overflow: 'hidden' } });
    detailCol.appendChild(renderCharacterSectionTitle('Hero', 'Core, aura, power and selected quick details live here.'));
    const detailStack = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '0', overflowY: 'auto', paddingRight: '4px' } });
    detailStack.appendChild(renderSelectionDetailCard(state, prog, { kind: 'overview', key: 'overview' }, statsData));
    if (selected?.kind === 'skill' || selected?.kind === 'gear') {
      try {
        detailStack.appendChild(renderSelectionDetailCard(state, prog, selected, statsData));
      } catch (err) {
        detailStack.appendChild(renderSimpleInfoCard('Selected Entry', [String(err?.message || err || 'Could not render selected detail.')], { accent: 'rgba(255,120,120,0.28)' }));
      }
    }
    detailCol.appendChild(detailStack);
    heroWrap.appendChild(detailCol);

    const statsCol = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '0', overflow: 'hidden' } });
    const statsHeader = make('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' } });
    statsHeader.appendChild(renderCharacterSectionTitle('Hero Stats', 'Independent scroll. Expand only this block if you need more numbers.'));
    const toggleBtn = make('button', { className: 'btn', type: 'button', text: statsExpanded ? 'Collapse' : 'Expand', style: { padding: '6px 10px', fontSize: '12px' } });
    toggleBtn.addEventListener('click', () => { state._characterStatsExpanded = !state._characterStatsExpanded; renderCharacterMenu(state, true); });
    statsHeader.appendChild(toggleBtn);
    statsCol.appendChild(statsHeader);
    statsCol.appendChild(createStatsScrollBox(statsData?.allRows || [], statsExpanded));
    heroWrap.appendChild(statsCol);
    el.characterContent.appendChild(heroWrap);
  } else if (tab === 'skills') {
    const skillsWrap = make('div', { style: { display: 'grid', gridTemplateColumns: portrait ? '1fr' : '1.02fr 0.98fr', gap: '12px', minHeight: '0', height: '100%' } });
    const skillsLeft = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '0', overflow: 'hidden' } });
    skillsLeft.appendChild(renderCharacterSectionTitle('Skills', 'Six expedition slots. Empty slots stay marked as EMPTY.'));
    const skillItems = skillSlots.map((slot, idx) => ({ slot, idx }));
    const skillGridHost = make('div', { style: { minHeight: '0', overflowY: 'auto', paddingRight: '4px' } });
    skillGridHost.appendChild(renderInventorySlotGrid(skillItems, ({ slot, idx }) => {
      const def = slot.def;
      const accent = def ? getFrameAccent(getSkillBiomeKey(def.key)) : '#6a7386';
      return renderMenuSlot({
        label: def ? String(def.name || def.key) : 'EMPTY',
        title: def ? `${String(def.name || def.key)} Lv ${slot.level}` : `Empty slot ${idx + 1}`,
        subtitle: def ? `${String(getSkillRouteMeta(def.key)?.role || 'skill')}` : 'No skill equipped',
        accent,
        icon: def ? renderSkillIcon(def, 30) : null,
        empty: !def,
        selected: selected?.kind === 'skill' && selected?.key === slot.key,
        badge: def ? `Lv ${slot.level}` : '',
        onClick: def ? (() => { selectCharacterEntry(state, { kind: 'skill', key: def.key, isCore: !!slot.isCore }); }) : null,
      });
    }, portrait ? 3 : 6));
    skillsLeft.appendChild(skillGridHost);
    skillsWrap.appendChild(skillsLeft);

    const skillsRight = make('div', { style: { minHeight: '0', overflow: 'hidden' } });
    try {
      skillsRight.appendChild(renderSelectionDetailCard(state, prog, selected?.kind === 'skill' ? selected : { kind: 'skillHint', key: 'skills' }, statsData));
    } catch (err) {
      skillsRight.appendChild(renderSimpleInfoCard('Skill Details', [String(err?.message || err || 'Could not render skill detail.')], { accent: 'rgba(255,120,120,0.28)' }));
    }
    skillsWrap.appendChild(skillsRight);
    el.characterContent.appendChild(skillsWrap);
  } else if (tab === 'inventory') {
    const invLayout = make('div', { style: { display: 'grid', gridTemplateColumns: portrait ? '1fr' : '1.10fr 0.90fr', gap: '12px', minHeight: '0', height: '100%' } });
    const invWrap = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px', minHeight: '0', overflowY: 'auto', paddingRight: '4px' } });
    invWrap.appendChild(renderCharacterSectionTitle('Inventory', 'Compact slots with colored biome frames. Click any slot to inspect the item.'));
    const gearItems = HUB_GEAR_DEFS.filter((def) => def.slot !== 'relic' && def.slot !== 'coreItem').map((def) => ({ def, selected: selected?.kind === 'gear' && selected?.key === def.key }));
    invWrap.appendChild(renderInventorySlotGrid(gearItems, ({ def, selected: isSelected }) => renderMenuSlot({ label: isHubGearOwned(prog, def.key) ? String(def.short || def.name || def.key) : 'Locked', title: def.name, accent: getFrameAccent(getGearPrimaryBiomeKey(def)), icon: renderGearIcon(def, 30), empty: !isHubGearOwned(prog, def.key), selected: isSelected, badge: isHubGearEquipped(prog, def.key) ? 'E' : '', onClick: () => { selectCharacterEntry(state, { kind: 'gear', key: def.key }); } }), portrait ? 4 : 6));
    const relicItems = HUB_GEAR_DEFS.filter((def) => def.slot === 'relic' || def.slot === 'coreItem').map((def) => ({ def, selected: selected?.kind === 'gear' && selected?.key === def.key }));
    invWrap.appendChild(renderCharacterSectionTitle('Relics & Core', 'Top-slot artifacts and route-defining items.'));
    invWrap.appendChild(renderInventorySlotGrid(relicItems, ({ def, selected: isSelected }) => renderMenuSlot({ label: isHubGearOwned(prog, def.key) ? String(def.short || def.name || def.key) : 'Locked', title: def.name, accent: getFrameAccent(getGearPrimaryBiomeKey(def)), icon: renderGearIcon(def, 30), empty: !isHubGearOwned(prog, def.key), selected: isSelected, badge: isHubGearEquipped(prog, def.key) ? 'E' : '', onClick: () => { selectCharacterEntry(state, { kind: 'gear', key: def.key }); } }), portrait ? 4 : 4));
    invWrap.appendChild(renderCharacterSectionTitle('Bag', 'Materials and parts earned in expeditions.'));
    const materialItems = HUB_MATERIAL_KEYS.map((key) => ({ key, count: Math.max(0, prog?.materials?.[key] | 0) }));
    invWrap.appendChild(renderInventorySlotGrid(materialItems, ({ key, count }) => { const meta = MATERIAL_META[key] || MATERIAL_META.salvage; return renderMenuSlot({ label: meta.short, title: meta.label, accent: String(meta.accent || '#bcd8ff'), icon: make('div', { text: key === 'coreShard' ? '✦' : (key === 'alloy' ? '⬢' : '◈'), style: { color: meta.accent, fontSize: '20px' } }), empty: count <= 0, selected: selected?.kind === 'material' && selected?.key === key, badge: String(count), onClick: () => { selectCharacterEntry(state, { kind: 'material', key }); } }); }, portrait ? 4 : 6));
    const partItems = HUB_GEAR_DEFS.map((def) => ({ def, count: getGearPartCount(prog, def.key) })).filter((it) => it.count > 0 || getHubGearPartCost(it.def) > 0);
    invWrap.appendChild(renderCharacterSectionTitle('Parts', 'Crafting progress for each item.'));
    invWrap.appendChild(renderInventorySlotGrid(partItems, ({ def, count }) => renderMenuSlot({ label: def.short || def.name, title: `${def.name} Parts`, accent: getFrameAccent(getGearPrimaryBiomeKey(def)), icon: renderGearIcon(def, 28), empty: count <= 0, selected: selected?.kind === 'part' && selected?.key === def.key, badge: `${count}/${getHubGearPartCost(def)}`, onClick: () => { selectCharacterEntry(state, { kind: 'part', key: def.key }); } }), portrait ? 4 : 6));
    invLayout.appendChild(invWrap);

    const invDetail = make('div', { style: { minHeight: '0', overflow: 'hidden' } });
    try {
      invDetail.appendChild(renderSelectionDetailCard(state, prog, ['gear', 'material', 'part'].includes(selected?.kind) ? selected : { kind: 'inventoryHint', key: 'inventory' }, statsData));
    } catch (err) {
      invDetail.appendChild(renderSimpleInfoCard('Inventory Details', [String(err?.message || err || 'Could not render inventory detail.')], { accent: 'rgba(255,120,120,0.28)' }));
    }
    invLayout.appendChild(invDetail);
    el.characterContent.appendChild(invLayout);
  } else if (tab === 'settings') {
    el.characterContent.appendChild(renderSimpleInfoCard('Hero Menu', [ 'This screen is read-only. Upgrade, forge and equip actions live at their matching hub NPC wings.', 'Hero tab shows the portrait, aura, active skills around the hero and a scrollable stat block.', 'Skills tab shows all 6 active slots. Empty slots stay marked as EMPTY.', 'Inventory tab holds gear, relics, materials and parts in slot grids with colored biome frames.' ], { accent: 'rgba(255,216,122,0.28)' }));
  }

  el.characterOverlay.style.display = 'flex';
}

function applyHubPreview(state) {
  if (!state?.progression || !state?.player) return;
  ensureHubProgression(state.progression);
  if (!isHubPreviewState(state)) return;
  state.player._selectedStarterLoadout = state.progression.selectedStarterLoadout || getHubCoreKey(state.progression);
  applyHubBuildToPlayer(state.player, state.progression);
  applyProgressionSpToPlayer(state.player, state.progression);
}

function persistHubState(state, msg = "") {
  const prog = state?.progression;
  if (!prog) return;
  ensureHubProgression(prog);
  applyHubPreview(state);
  try { saveProgression(prog); } catch {}
  maybeSendMeta(state);
  if (msg) setShopMsg(msg);
}

function renderAdjustCard(title, subText, level, maxLevel, onDec, onInc, opts = {}) {
  const accent = String(opts.accent || '#9fd6ff');
  const card = make("div", { className: "shopCard", style: { padding: "12px", border: `1px solid ${accent}55`, boxShadow: `0 0 0 1px ${accent}22 inset` } });
  const topRow = make("div", { style: { display: 'flex', gap: '10px', alignItems: 'center' } });
  if (opts.iconNode) topRow.appendChild(opts.iconNode);
  const titleWrap = make('div', { style: { flex: '1 1 auto' } });
  titleWrap.appendChild(make("div", { className: "top" }, [
    make("div", { className: "name", text: title }),
    make("div", { className: "lvl", text: `Lv ${Math.max(0, level | 0)}/${Math.max(0, maxLevel | 0)}` }),
  ]));
  topRow.appendChild(titleWrap);
  card.appendChild(topRow);
  card.appendChild(make("div", { className: "muted", text: subText, style: { marginTop: "8px", fontSize: "12px", lineHeight: "1.35" } }));
  const actions = make("div", { className: "buyRow", style: { marginTop: "10px", alignItems: "center" } });
  const decBtn = make("button", { type: "button", className: "btn", text: "-1", style: { minWidth: "58px" } });
  const incBtn = make("button", { type: "button", className: "btn", text: "+1", style: { minWidth: "58px" } });
  decBtn.disabled = !(level > 0);
  incBtn.disabled = !(level < maxLevel);
  decBtn.addEventListener("click", onDec);
  incBtn.addEventListener("click", onInc);
  actions.appendChild(decBtn);
  actions.appendChild(make("div", { className: "price", text: `Allocated: ${Math.max(0, level | 0)}` }));
  actions.appendChild(incBtn);
  card.appendChild(actions);
  return card;
}

function renderEssenceCard(key, value) {
  const meta = ESSENCE_META[key] || ESSENCE_META.mecha;
  return make("div", {
    className: "shopCard",
    style: {
      padding: "12px",
      border: `1px solid ${meta.accent}55`,
      boxShadow: `0 0 0 1px ${meta.accent}22 inset`,
    },
  }, [
    make("div", { className: "top" }, [
      make("div", { className: "name", text: meta.label }),
      make("div", { className: "lvl", text: `${Math.max(0, value | 0)}` }),
    ]),
    make("div", { className: "muted", text: `${meta.short} biome resource. Used for exchange, gear crafting and biome route progression.`, style: { marginTop: "8px", fontSize: "12px", lineHeight: "1.35" } }),
  ]);
}

function renderMaterialCard(key, value) {
  const meta = MATERIAL_META[key] || MATERIAL_META.salvage;
  return make("div", {
    className: "shopCard",
    style: {
      padding: "12px",
      border: `1px solid ${meta.accent}55`,
      boxShadow: `0 0 0 1px ${meta.accent}22 inset`,
    },
  }, [
    make("div", { className: "top" }, [
      make("div", { className: "name", text: meta.label }),
      make("div", { className: "lvl", text: `${Math.max(0, value | 0)}` }),
    ]),
    make("div", { className: "muted", text: `${meta.short} forge material from expedition rooms and bosses. Used together with essences and gear parts.`, style: { marginTop: "8px", fontSize: "12px", lineHeight: "1.35" } }),
  ]);
}

function renderBiomeRouteCard(biomeKey) {
  const essenceMeta = ESSENCE_META[biomeKey] || ESSENCE_META.mecha;
  const profile = getBiomeLootProfile(biomeKey);
  const preferredNames = (profile?.preferredGearKeys || [])
    .map((gearKey) => getHubGearDef(gearKey))
    .filter(Boolean)
    .map((def) => def.short || def.name)
    .slice(0, 3);
  const mats = [];
  for (const [materialKey, rawAmt] of Object.entries(profile?.bossMaterials || {})) {
    const amt = Math.max(0, Number(rawAmt || 0) | 0);
    if (amt <= 0) continue;
    const meta = MATERIAL_META[materialKey] || MATERIAL_META.salvage;
    mats.push(`${meta.short} x${amt}`);
  }
  return make("div", {
    className: "shopCard",
    style: {
      padding: "12px",
      border: `1px solid ${essenceMeta.accent}55`,
      boxShadow: `0 0 0 1px ${essenceMeta.accent}22 inset`,
    },
  }, [
    make("div", { className: "top" }, [
      make("div", { className: "name", text: `${profile?.label || essenceMeta.short} Route` }),
      make("div", { className: "lvl", text: `${Math.round(Number(profile?.bossItemChance || 0) * 100)}% boss drop` }),
    ]),
    make("div", { className: "muted", text: `Boss favor: ${preferredNames.join(" • ") || "General forge loot"}.`, style: { marginTop: "8px", fontSize: "12px", lineHeight: "1.35" } }),
    make("div", { className: "muted", text: `Boss materials: ${mats.join(" • ") || "Salvage"}. Parts lean ${Math.round(Number(profile?.roomPartChance || 0) * 100)}% toward this route in normal rooms.`, style: { marginTop: "6px", fontSize: "11px", lineHeight: "1.35" } }),
  ]);
}

function gearCostText(def) {
  const parts = [`${Math.max(0, def?.costCoins | 0)} Gold`];
  const materialCosts = getHubGearMaterialCosts(def);
  for (const [key, rawAmt] of Object.entries(materialCosts)) {
    const amt = Math.max(0, Number(rawAmt || 0) | 0);
    if (amt <= 0) continue;
    const meta = MATERIAL_META[key] || MATERIAL_META.salvage;
    parts.push(`${amt} ${meta.short}`);
  }
  const essenceCosts = def?.costEssences && typeof def.costEssences === "object" ? def.costEssences : {};
  for (const [key, rawAmt] of Object.entries(essenceCosts)) {
    const amt = Math.max(0, Number(rawAmt || 0) | 0);
    if (amt <= 0) continue;
    const meta = ESSENCE_META[key] || ESSENCE_META.mecha;
    parts.push(`${amt} ${meta.short}`);
  }
  const partCost = getHubGearPartCost(def);
  if (partCost > 0) parts.push(`${partCost} Parts`);
  return parts.join(" • ");
}

function renderGearCard(state, prog, def) {
  const owned = isHubGearOwned(prog, def.key);
  const equipped = isHubGearEquipped(prog, def.key);
  const canCraft = canCraftHubGear(prog, def.key);
  const canEquip = canEquipHubGear(prog, def.key);
  const usage = getHubGearSlotUsage(prog);
  const partCost = getHubGearPartCost(def);
  const partOwned = getGearPartCount(prog, def.key);
  const slotInfo = def.slot === "module"
    ? `Module slot • ${usage.module}/${HUB_MODULE_SLOTS} used`
    : (def.slot === "relic" ? `Relic slot • ${usage.relic ? "occupied" : "empty"}` : `Core Item slot • ${usage.coreItem ? "occupied" : "empty"}`);
  const titleMeta = def.slot === "module" ? "Module" : (def.slot === "relic" ? "Relic" : "Core Item");
  const sourceBiomes = getGearSourceBiomes(def).map((key) => (ESSENCE_META[key] || ESSENCE_META.mecha).short);
  const primaryBiome = getGearPrimaryBiomeKey(def);
  const accent = getFrameAccent(primaryBiome);
  const card = make("div", { className: "shopCard", style: { padding: "12px", border: `1px solid ${accent}55`, boxShadow: `0 0 0 1px ${accent}22 inset` } });
  const heroRow = make("div", { style: { display: "flex", gap: "10px", alignItems: "center" } });
  heroRow.appendChild(renderGearIcon(def, 34));
  const titleWrap = make("div", { style: { flex: "1 1 auto" } });
  titleWrap.appendChild(make("div", { className: "top" }, [
    make("div", { className: "name", text: `${def.name}` }),
    make("div", { className: "lvl", text: equipped ? "EQUIPPED" : (owned ? "OWNED" : titleMeta.toUpperCase()) }),
  ]));
  heroRow.appendChild(titleWrap);
  card.appendChild(heroRow);
  card.appendChild(make("div", { className: "muted", text: `${def.style.toUpperCase()} • ${slotInfo}`, style: { marginTop: "8px", fontSize: "11px", lineHeight: "1.35", letterSpacing: "0.04em", color: "rgba(186,228,255,0.9)", opacity: "1" } }));
  if (sourceBiomes.length) card.appendChild(make("div", { className: "muted", text: `Favored drops: ${sourceBiomes.join(" • ")} bosses / rooms.`, style: { marginTop: "6px", fontSize: "11px", lineHeight: "1.35", color: "rgba(255,236,188,0.9)", opacity: "1" } }));
  card.appendChild(make("div", { className: "muted", text: def.desc, style: { marginTop: "8px", fontSize: "12px", lineHeight: "1.4", color: "rgba(240,248,255,0.92)", opacity: "1" } }));
  const effWrap = make("div", { className: "muted", style: { marginTop: "8px", fontSize: "12px", lineHeight: "1.4" } });
  const effects = [];
  const passives = def.effects?.passives && typeof def.effects.passives === "object" ? def.effects.passives : {};
  const damageTypes = def.effects?.damageTypes && typeof def.effects.damageTypes === "object" ? def.effects.damageTypes : {};
  for (const [key, rawAmt] of Object.entries(passives)) effects.push(`+${Math.max(0, rawAmt | 0)} ${key}`);
  for (const [key, rawAmt] of Object.entries(damageTypes)) effects.push(`+${Math.round(Number(rawAmt || 0) * 100)}% ${key} dmg`);
  effWrap.textContent = effects.length ? `Effects: ${effects.join(" • ")}` : "Effects: —";
  card.appendChild(effWrap);
  const partLine = partCost > 0 ? `Parts: ${partOwned}/${partCost}. Bosses can drop the full item outright.` : "";
  card.appendChild(make("div", { className: "price", text: owned ? (equipped ? "Equipped in active hub build." : "Crafted and ready in inventory.") : `Craft Cost: ${gearCostText(def)}`, style: { marginTop: "10px" } }));
  if (!owned && partLine) card.appendChild(make("div", { className: "muted", text: partLine, style: { marginTop: "6px", fontSize: "11px", lineHeight: "1.35" } }));
  const actions = make("div", { className: "buyRow", style: { marginTop: "10px", alignItems: "center", flexWrap: "wrap", gap: "8px" } });
  const btn = make("button", { className: "btn", type: "button", text: equipped ? "Unequip" : (owned ? "Equip" : "Craft"), style: { minWidth: "100px" } });
  btn.disabled = equipped ? false : (owned ? !canEquip : !canCraft);
  btn.addEventListener("click", () => {
    let ok = false;
    let msg = "";
    if (equipped) {
      ok = unequipHubGear(prog, def.key);
      msg = ok ? `${def.name} unequipped.` : "Cannot unequip.";
    } else if (owned) {
      ok = equipHubGear(prog, def.key);
      msg = ok ? `${def.name} equipped.` : (def.slot === "module" ? `Module slots full (${HUB_MODULE_SLOTS}). Unequip one first.` : `Cannot equip ${def.name}.`);
    } else {
      ok = craftHubGear(prog, def.key);
      msg = ok ? `${def.name} crafted.` : `Need ${gearCostText(def)}.`;
      if (ok) equipHubGear(prog, def.key);
    }
    if (!ok) {
      setShopMsg(msg);
      renderBuildLab(state, true);
      return;
    }
    persistHubState(state, msg);
    renderBuildLab(state, true);
  });
  actions.appendChild(btn);
  if (owned && !equipped && def.slot === "module" && !canEquip) {
    actions.appendChild(make("div", { className: "muted", text: `All ${HUB_MODULE_SLOTS} module slots are occupied.`, style: { fontSize: "11px" } }));
  }
  card.appendChild(actions);
  return card;
}

function renderWalletBar(container, prog, opts = {}) {
  if (!container) return;
  container.innerHTML = "";
  const compact = !!opts.compact;
  const hideCoins = !!opts.hideCoins;
  const wrap = make("div", { className: "row", style: { gap: compact ? "6px" : "8px", flexWrap: "wrap", alignItems: "center", justifyContent: opts.align === 'right' ? 'flex-end' : 'flex-start' } });
  const coinChip = make("div", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: compact ? "6px" : "8px",
      padding: compact ? "6px 10px" : "8px 12px",
      borderRadius: "999px",
      border: "1px solid rgba(255,215,90,0.34)",
      background: "rgba(255,215,90,0.10)",
      color: "#fff4c7",
      fontSize: compact ? "12px" : "13px",
      boxShadow: "0 0 0 1px rgba(255,215,90,0.08) inset",
    },
  }, [
    make("span", { text: "🪙" }),
    make("span", { text: `${Math.max(0, prog?.coins | 0)}` }),
  ]);
  if (!hideCoins) wrap.appendChild(coinChip);
  for (const key of BIOME_ESSENCE_KEYS) {
    const meta = ESSENCE_META[key] || ESSENCE_META.mecha;
    const count = Math.max(0, prog?.essences?.[key] | 0);
    const chip = make("div", {
      title: meta.label,
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? "6px" : "7px",
        padding: compact ? "6px 9px" : "7px 10px",
        borderRadius: "999px",
        border: `1px solid ${meta.accent}66`,
        background: `${meta.accent}18`,
        color: "#eef8ff",
        fontSize: compact ? "11px" : "12px",
        boxShadow: `0 0 0 1px ${meta.accent}18 inset`,
      },
    });
    const crystal = make("span", {
      style: {
        width: compact ? "10px" : "12px",
        height: compact ? "10px" : "12px",
        display: "inline-block",
        transform: "rotate(45deg)",
        borderRadius: "2px",
        background: meta.accent,
        boxShadow: `0 0 12px ${meta.accent}88`,
      },
    });
    const countEl = make("span", { text: `${count}` });
    chip.appendChild(crystal);
    chip.appendChild(countEl);
    wrap.appendChild(chip);
  }
  container.appendChild(wrap);
}

function getBuildOverviewHtml(buildFocus, data) {
  const { coreDef, coreIdentity, equippedSkills, equippedPassives, totalEssence, totalMaterials, totalOwnedGear, gearUsage } = data;
  const corePassiveText = formatCorePassiveBonuses(coreIdentity);
  if (buildFocus === "arsenal") {
    return `
      <div><b>Current core:</b> ${String(coreDef?.name || data.coreKey)}${coreDef?.skillName ? ` • ${coreDef.skillName}` : ""}</div>
      <div><b>Route:</b> ${String(coreIdentity?.routeLabel || "general expedition")}</div>
      <div><b>Identity:</b> ${String(coreIdentity?.summary || coreDef?.desc || "")}</div>
      <div><b>Innate bonuses:</b> +${Math.round((Number(coreIdentity?.attackSpeedBonus || 0) || 0) * 100)}% Attack Speed • +${Math.round((Number(coreIdentity?.damageBonus || 0) || 0) * 100)}% ${String(coreIdentity?.damageType || data.coreKey)} Damage${corePassiveText ? ` • ${corePassiveText}` : ""}</div>
      <div><b>Extra active skills equipped:</b> ${equippedSkills}/${HUB_BUILD_EXTRA_SKILL_SLOTS}</div>
      <div><b>What this wing controls:</b> core path, route pressure and active combat shell.</div>
    `;
  }
  if (buildFocus === "essence") {
    return `
      <div><b>Total crystal essences:</b> ${totalEssence}</div>
      <div><b>Exchange rule:</b> ${ESSENCE_EXCHANGE_RATE} source crystals → 1 target crystal</div>
      <div><b>What this wing controls:</b> biome crystal treasury, exchange flow and route farming decisions.</div>
      <div><b>Route reminder:</b> Fire / Ice / Electric / Mecha / Dark / Light all feed different preferred forge targets.</div>
    `;
  }
  if (buildFocus === "mastery") {
    return `
      <div><b>Passives equipped:</b> ${equippedPassives}</div>
      <div><b>Banked SP available:</b> ${data.available}</div>
      <div><b>Allocated SP:</b> ${data.spent}</div>
      <div><b>What this wing controls:</b> long-form passive doctrine, sustain, reach, crit and tempo shaping.</div>
    `;
  }
  if (buildFocus === "forge") {
    return `
      <div><b>Total forge materials:</b> ${totalMaterials}</div>
      <div><b>Owned gear pieces:</b> ${totalOwnedGear}</div>
      <div><b>Module slots:</b> ${gearUsage.module}/${HUB_MODULE_SLOTS}</div>
      <div><b>Relic:</b> ${gearUsage.relic ? "equipped" : "empty"} • <b>Core Item:</b> ${gearUsage.coreItem ? "equipped" : "empty"}</div>
      <div><b>What this wing controls:</b> materials, crafting, gear parts and equipped expedition hardware.</div>
    `;
  }
  return `
    <div><b>Hub progression wings:</b> Arsenal Wing • Essence Conflux • Mastery Archive • Forge Wing</div>
    <div><b>Current core:</b> ${String(coreDef?.name || data.coreKey)}</div>
    <div><b>Total crystal essences:</b> ${totalEssence} • <b>Total forge materials:</b> ${totalMaterials}</div>
  `;
}

function renderBuildLab(state, force = false) {
  const prog = state?.progression;
  if (!prog || !el.buildGridSkills || !el.buildGridPassives) return;
  ensureHubProgression(prog);

  const buildFocus = normalizeBuildFocus(getBuildFocus(state)) === "all" ? "arsenal" : getBuildFocus(state);
  const key = JSON.stringify({
    focus: buildFocus,
    sp: prog.sp | 0,
    spent: getHubBuildSpentPoints(prog),
    available: getHubBuildAvailableSp(prog),
    core: getHubCoreKey(prog),
    skills: prog.hubBuild?.skills || {},
    passives: prog.hubBuild?.passives || {},
    skillMeta: prog.skillMeta || {},
    materials: prog.materials || {},
    essences: prog.essences || {},
    gearParts: prog.gearParts || {},
    hubGear: prog.hubGear || {},
    gearInventory: prog.gearInventory || {},
    exchangeFrom: el.buildExchangeFrom?.value || "",
    exchangeTo: el.buildExchangeTo?.value || "",
  });
  if (!force && renderBuildLab._key === key) return;
  renderBuildLab._key = key;

  const coreKey = getHubCoreKey(prog);
  const focusMeta = BUILD_BRANCH_META[buildFocus] || BUILD_BRANCH_META.arsenal;
  const spent = getHubBuildSpentPoints(prog);
  const available = getHubBuildAvailableSp(prog);
  const equippedSkills = getEquippedHubSkillCount(prog);
  const equippedPassives = Object.keys(prog.hubBuild?.passives || {}).filter((k) => ((prog.hubBuild?.passives?.[k] | 0) > 0)).length;
  const equippedGearKeys = getEquippedHubGearKeys(prog);
  const gearUsage = getHubGearSlotUsage(prog);
  const totalOwnedGear = HUB_GEAR_DEFS.reduce((sum, def) => sum + (isHubGearOwned(prog, def.key) ? 1 : 0), 0);
  const totalEssence = BIOME_ESSENCE_KEYS.reduce((sum, k) => sum + Math.max(0, prog?.essences?.[k] | 0), 0);
  const totalMaterials = HUB_MATERIAL_KEYS.reduce((sum, k) => sum + Math.max(0, prog?.materials?.[k] | 0), 0);
  const coreDef = STARTER_LOADOUTS.find((d) => d.key === coreKey) || STARTER_LOADOUTS[0] || null;
  const coreIdentity = getCoreIdentity(coreKey);
  const corePassiveText = formatCorePassiveBonuses(coreIdentity);
  const coreButtonText = state?._hubResumeRunActive ? `Core Locked • ${coreKey.toUpperCase()}` : `Open Core Selector • ${coreKey.toUpperCase()}`;
  if (el.buildInfoWrap) {
    if (buildFocus === "arsenal") {
      el.buildInfoWrap.innerHTML = `<div><b>Available SP:</b> ${available}</div><div><b>Allocated:</b> ${spent}</div><div><b>Total SP:</b> ${Math.max(0, prog.sp | 0)}</div><div><b>Extra Skill Slots:</b> ${equippedSkills}/${HUB_BUILD_EXTRA_SKILL_SLOTS}</div>`;
    } else if (buildFocus === "essence") {
      el.buildInfoWrap.innerHTML = `<div><b>Gold:</b> ${Math.max(0, prog.coins | 0)}</div><div><b>Total Essences:</b> ${totalEssence}</div><div><b>Exchange:</b> ${ESSENCE_EXCHANGE_RATE} → 1</div><div><b>Biome Routes:</b> ${BIOME_ESSENCE_KEYS.length}</div>`;
    } else if (buildFocus === "mastery") {
      el.buildInfoWrap.innerHTML = `<div><b>Available SP:</b> ${available}</div><div><b>Allocated:</b> ${spent}</div><div><b>Passives Equipped:</b> ${equippedPassives}</div><div><b>Core Route:</b> ${String(coreIdentity?.routeLabel || coreKey)}</div>`;
    } else if (buildFocus === "forge") {
      el.buildInfoWrap.innerHTML = `<div><b>Gold:</b> ${Math.max(0, prog.coins | 0)}</div><div><b>Materials:</b> ${totalMaterials}</div><div><b>Owned Gear:</b> ${totalOwnedGear}</div><div><b>Hardware Slots:</b> M ${gearUsage.module}/${HUB_MODULE_SLOTS} • R ${gearUsage.relic ? 1 : 0} • C ${gearUsage.coreItem ? 1 : 0}</div>`;
    }
  }
  if (el.buildOverview) {
    el.buildOverview.innerHTML = getBuildOverviewHtml(buildFocus, {
      buildFocus,
      coreKey,
      coreDef,
      coreIdentity,
      available,
      spent,
      equippedSkills,
      equippedPassives,
      equippedGearKeys,
      gearUsage,
      totalOwnedGear,
      totalEssence,
      totalMaterials,
    });
  }
  if (el.buildCoreBtn) {
    el.buildCoreBtn.textContent = coreButtonText;
    el.buildCoreBtn.disabled = !!state?._hubResumeRunActive;
  }
  if (el.buildTitle) el.buildTitle.textContent = focusMeta.title || focusMeta.label;
  if (el.buildIntro) el.buildIntro.textContent = focusMeta.intro || focusMeta.hint;
  if (el.buildBranchHint) el.buildBranchHint.textContent = focusMeta.hint;
  if (el.buildPanel) {
    el.buildPanel.style.border = `1px solid ${focusMeta.accent || "rgba(255,255,255,0.18)"}55`;
    el.buildPanel.style.boxShadow = `0 18px 44px rgba(0,0,0,0.46), 0 0 0 1px ${focusMeta.accent || "rgba(255,255,255,0.12)"}16 inset`;
    el.buildPanel.style.background = `linear-gradient(180deg, rgba(10,16,24,0.985), rgba(8,13,20,0.985)), radial-gradient(circle at top left, ${focusMeta.accent || "#89d8ff"}1f, transparent 46%)`;
  }
  renderWalletBar(el.buildWallet, prog);
  setSectionVisibility(el.buildSectionArsenal, buildFocus === "arsenal");
  setSectionVisibility(el.buildSectionEssence, buildFocus === "essence");
  setSectionVisibility(el.buildSectionMastery, buildFocus === "mastery");
  setSectionVisibility(el.buildSectionForge, buildFocus === "forge");

  if (el.buildEssenceGrid) {
    el.buildEssenceGrid.innerHTML = "";
    for (const essenceKey of BIOME_ESSENCE_KEYS) {
      el.buildEssenceGrid.appendChild(renderEssenceCard(essenceKey, prog?.essences?.[essenceKey] | 0));
    }
  }
  if (el.buildGridMaterials) {
    el.buildGridMaterials.innerHTML = "";
    for (const materialKey of HUB_MATERIAL_KEYS) {
      el.buildGridMaterials.appendChild(renderMaterialCard(materialKey, getMaterialCount(prog, materialKey)));
    }
  }
  if (el.buildGridRoutes) {
    el.buildGridRoutes.innerHTML = "";
    for (const biomeKey of BIOME_ESSENCE_KEYS) {
      el.buildGridRoutes.appendChild(renderBiomeRouteCard(biomeKey));
    }
  }

  if (el.buildExchangeFrom && !el.buildExchangeFrom.options.length) {
    for (const essenceKey of BIOME_ESSENCE_KEYS) {
      const meta = ESSENCE_META[essenceKey] || ESSENCE_META.mecha;
      el.buildExchangeFrom.appendChild(make("option", { value: essenceKey, text: meta.label }));
      el.buildExchangeTo.appendChild(make("option", { value: essenceKey, text: meta.label }));
    }
    el.buildExchangeFrom.value = "fire";
    el.buildExchangeTo.value = "ice";
  }

  const fromKey = String(el.buildExchangeFrom?.value || "fire");
  const toKey = String(el.buildExchangeTo?.value || "ice");
  const canExchange = canExchangeEssence(prog, fromKey, toKey, ESSENCE_EXCHANGE_RATE);
  if (el.buildExchangeBtn) el.buildExchangeBtn.disabled = !canExchange;
  if (el.buildExchangeInfo) {
    const fromMeta = ESSENCE_META[fromKey] || ESSENCE_META.mecha;
    const toMeta = ESSENCE_META[toKey] || ESSENCE_META.mecha;
    el.buildExchangeInfo.textContent = fromKey === toKey
      ? "Choose two different essence types."
      : `Exchange ${ESSENCE_EXCHANGE_RATE} ${fromMeta.short} Essence → 1 ${toMeta.short} Essence.`;
  }

  el.buildGridSkills.innerHTML = "";
  const sortedSkills = [...(RUN_SKILLS || [])].sort((a, b) => {
    const diff = getCoreSkillAffinity(coreKey, b) - getCoreSkillAffinity(coreKey, a);
    if (diff) return diff;
    return String(a?.name || a?.key || "").localeCompare(String(b?.name || b?.key || ""));
  });
  for (const def of sortedSkills) {
    const keySkill = String(def?.key || "");
    if (!keySkill || def?.kind !== "skill") continue;
    const cap = getOwnedSkillCap(prog, keySkill);
    if (cap <= 0) continue;
    const isCoreSkill = keySkill === (STARTER_LOADOUTS.find((d) => d.key === coreKey)?.skillKey || "bullets");
    if (isCoreSkill) continue;
    const lv = Math.max(0, (prog.hubBuild?.skills?.[keySkill] | 0) || 0);
    const routeMeta = getSkillRouteMeta(keySkill);
    const affinity = getCoreSkillAffinity(coreKey, def);
    const affinityText = affinity >= 3 ? 'Favored by current core.' : (affinity >= 2 ? 'Matches current core route.' : 'Off-route utility option.');
    const sub = `${String(routeMeta.route || 'route').toUpperCase()} • ${String(routeMeta.role || 'utility')} • ${String(routeMeta.style || 'general value')}. ${affinityText} Owned cap ${cap}. ${lv > 0 ? "Equipped in expedition build." : "Unallocated."}`;
    const skillAccent = getFrameAccent(getSkillBiomeKey(keySkill));
    el.buildGridSkills.appendChild(renderAdjustCard(String(def?.name || keySkill), sub, lv, cap, () => {
      if (!setHubSkillLevel(prog, keySkill, lv - 1)) return;
      persistHubState(state, `${def?.name || keySkill} -1`);
      renderBuildLab(state, true);
    }, () => {
      if (!setHubSkillLevel(prog, keySkill, lv + 1)) {
        setShopMsg(available <= 0 ? "Need more SP from expedition." : `Extra skill slots full (${HUB_BUILD_EXTRA_SKILL_SLOTS}).`);
        return;
      }
      persistHubState(state, `${def?.name || keySkill} +1`);
      renderBuildLab(state, true);
    }, { accent: skillAccent, iconNode: renderSkillIcon(def, 28) }));
  }

  el.buildGridPassives.innerHTML = "";
  const sortedPassives = [...(RUN_PASSIVES || [])].sort((a, b) => {
    const diff = getCorePassiveAffinity(coreKey, b?.key) - getCorePassiveAffinity(coreKey, a?.key);
    if (diff) return diff;
    return String(a?.name || a?.key || "").localeCompare(String(b?.name || b?.key || ""));
  });
  for (const def of sortedPassives) {
    const keyPassive = String(def?.key || "");
    if (!keyPassive || def?.kind !== "passive") continue;
    const cap = getOwnedPassiveCap(prog, keyPassive);
    if (cap <= 0) continue;
    const lv = Math.max(0, (prog.hubBuild?.passives?.[keyPassive] | 0) || 0);
    const routeMeta = getPassiveRouteMeta(keyPassive);
    const affinity = getCorePassiveAffinity(coreKey, keyPassive);
    const affinityText = affinity >= 3 ? 'Favored by current core.' : 'Universal passive option.';
    const sub = `${String(routeMeta.route || 'route').toUpperCase()} • ${String(routeMeta.role || 'general scaling')}. ${affinityText} Owned cap ${cap}. Reversible allocation while in hub.`;
    const passiveAccent = getFrameAccent(getPassiveBiomeKey(keyPassive));
    el.buildGridPassives.appendChild(renderAdjustCard(String(def?.name || keyPassive), sub, lv, cap, () => {
      if (!setHubPassiveLevel(prog, keyPassive, lv - 1)) return;
      persistHubState(state, `${def?.name || keyPassive} -1`);
      renderBuildLab(state, true);
    }, () => {
      if (!setHubPassiveLevel(prog, keyPassive, lv + 1)) {
        setShopMsg("Need more SP from expedition.");
        return;
      }
      persistHubState(state, `${def?.name || keyPassive} +1`);
      renderBuildLab(state, true);
    }, { accent: passiveAccent, iconNode: make('div', { text: '⬢', style: { width: '28px', height: '28px', display: 'grid', placeItems: 'center', borderRadius: '10px', color: passiveAccent, border: `1px solid ${passiveAccent}88`, background: `${passiveAccent}1c`, fontSize: '15px', fontWeight: '700' } }) }));
  }

  if (el.buildResetBtn) {
    el.buildResetBtn.disabled = !(spent > 0);
  }

  if (el.buildGridModules) {
    el.buildGridModules.innerHTML = "";
    const defs = getHubGearDefsBySlot("module");
    for (const def of defs) el.buildGridModules.appendChild(renderGearCard(state, prog, def));
  }
  if (el.buildGridRelics) {
    el.buildGridRelics.innerHTML = "";
    const defs = getHubGearDefsBySlot("relic");
    for (const def of defs) el.buildGridRelics.appendChild(renderGearCard(state, prog, def));
  }
  if (el.buildGridCoreItems) {
    el.buildGridCoreItems.innerHTML = "";
    const defs = getHubGearDefsBySlot("coreItem");
    for (const def of defs) el.buildGridCoreItems.appendChild(renderGearCard(state, prog, def));
  }
}

function maybeSendMeta(state) {
  const net = state?.net;
  const prog = state?.progression;
  if (!net || net.status !== "connected" || net.isHost) return;
  if (!prog) return;
  try {
    net.sendMeta({
      nickname: prog.nickname || "Player",
      avatarIndex: prog.avatarIndex || 0,
      resurrectedTier: prog.resurrectedTier || 1,
      totalScore: prog.totalScore || 0,
      upgradePoints: (typeof prog.deathPoints === "number" ? prog.deathPoints : prog.upgradePoints) || 0,
      deathPoints: (typeof prog.deathPoints === "number" ? prog.deathPoints : prog.upgradePoints) || 0,
      limits: prog.limits || {},
      skillMeta: prog.skillMeta || {},
      selectedStarterLoadout: prog.selectedStarterLoadout || "mecha",
      sp: Math.max(0, (prog.sp | 0) || 0),
      materials: prog.materials || {},
      essences: prog.essences || {},
      gearParts: prog.gearParts || {},
      hubBuild: prog.hubBuild || null,
      hubGear: prog.hubGear || null,
      gearInventory: prog.gearInventory || {},
    });
  } catch {}
}

function renderBasicSelector(state) {
  const prog = state?.progression;
  if (!prog || !el.basicGrid) return;
  ensureStarterLoadoutProgression(prog);
  const selected = normalizeStarterLoadoutKey(prog.selectedStarterLoadout);
  const key = `${selected}|${STARTER_LOADOUTS.map((d) => d.key).join(',')}`;
  if (key === _basicRenderKey) return;
  _basicRenderKey = key;
  el.basicGrid.innerHTML = "";
  for (const def of STARTER_LOADOUTS) {
    const card = make("button", {
      type: "button",
      className: "shopCard" + (def.key === selected ? " sel" : ""),
      style: {
        textAlign: "left",
        cursor: "pointer",
        border: def.key === selected ? "2px solid rgba(160,235,255,0.95)" : "1px solid rgba(255,255,255,0.20)",
        background: def.key === selected ? "linear-gradient(180deg, rgba(24,44,64,0.98), rgba(10,18,28,0.98))" : "rgba(16,22,34,0.96)",
        color: "#eef8ff",
        boxShadow: def.key === selected ? "0 0 0 1px rgba(255,245,180,0.35), 0 12px 28px rgba(0,0,0,0.35)" : "0 8px 22px rgba(0,0,0,0.26)",
      },
    });
    card.appendChild(make("div", { className: "top" }, [
      make("div", { className: "name", text: `${def.name} — ${def.skillName}`, style: { color: "#f4fbff", textShadow: "0 1px 0 rgba(0,0,0,0.35)" } }),
      make("div", { className: "lvl", text: def.key === selected ? "SELECTED" : "Pick", style: { color: def.key === selected ? "#ffe79a" : "#bfe9ff", fontWeight: "700" } }),
    ]));
    card.appendChild(make("div", { className: "muted", text: def.desc, style: { marginTop: "8px", fontSize: "12px", lineHeight: "1.4", color: "rgba(232,245,255,0.9)", opacity: "1" } }));
    card.appendChild(make("div", { className: "muted", text: `Route: ${String(def.routeLabel || 'general')} • ${String(def.summary || '')}`, style: { marginTop: "6px", fontSize: "11px", lineHeight: "1.45", color: "rgba(216,238,255,0.88)", opacity: "1" } }));
    card.appendChild(make("div", { className: "muted", text: `Favored skills: ${(def.favoredSkillKeys || []).join(', ') || '—'}`, style: { marginTop: "6px", fontSize: "11px", lineHeight: "1.4", color: "rgba(202,230,255,0.84)", opacity: "1" } }));
    card.appendChild(make("div", { className: "muted", text: `Favored passives: ${(def.favoredPassiveKeys || []).join(', ') || '—'}`, style: { marginTop: "4px", fontSize: "11px", lineHeight: "1.4", color: "rgba(202,230,255,0.84)", opacity: "1" } }));
    card.addEventListener("click", () => {
      setHubCoreKey(prog, def.key);
      persistHubState(state, `Core ready: ${def.skillName}`);
      renderBasicSelector(state);
      renderBuildLab(state, true);
    });
    el.basicGrid.appendChild(card);
  }
}

function renderShop(state) {
  const prog = state?.progression;
  if (!prog) return;
  ensureHubProgression(prog);
  ensureShopMeta(prog);
  ensureShopOffers(prog);

  if (el.shopCoins) el.shopCoins.textContent = String(prog.coins | 0);
  renderWalletBar(el.shopWallet, prog, { compact: true, hideCoins: true });
  if (el.shopFlowInfo) {
    const totalEssence = BIOME_ESSENCE_KEYS.reduce((sum, key) => sum + Math.max(0, prog?.essences?.[key] | 0), 0);
    el.shopFlowInfo.textContent = `Hub flow: Gold unlocks caps • SP builds your expedition loadout • Essences (${totalEssence}) and biome route drops come from cleared rooms / bosses. Current core: ${getHubCoreKey(prog).toUpperCase()}.`;
  }

  const rerollCost = 10 + (_shopRerollLocal | 0) * 5;
  if (el.shopRerollCost) el.shopRerollCost.textContent = String(rerollCost);

  const offers = prog.shopOffers || { active: [], passive: [], newSkills: [] };
  const key = JSON.stringify(offers) + "|" + (prog.coins | 0) + "|" + rerollCost;
  if (key === _shopRenderKey) return;
  _shopRenderKey = key;

  const renderRow = (container, kind, ids) => {
    if (!container) return;
    container.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      const id = ids[i];
      const it = id ? getItemById(id) : null;
      const metaLvl = id ? getMetaLevel(prog, id) : 0;
      const price = id ? getPriceFor(id, metaLvl) : 0;
      const maxLvl = getMaxMetaLevel();

      const card = make("div", { className: "shopCard" });

      const top = make("div", { className: "top" });
      const name = make("div", { className: "name", text: it ? it.name : "—" });
      const lvl = make("div", { className: "lvl", text: `Lv ${metaLvl}/${maxLvl}` });
      top.appendChild(name);
      top.appendChild(lvl);

      const buyRow = make("div", { className: "buyRow" });
      const priceEl = make("div", { className: "price", text: `Cost: ${price} 🪙` });
      buyRow.appendChild(priceEl);

      const btn = make("button", { type: "button", className: "btn", text: metaLvl <= 0 ? "Buy (unlock)" : "Upgrade" });
      const disabled = !it || metaLvl >= maxLvl || (prog.coins | 0) < price;
      btn.disabled = disabled;

      if (metaLvl >= maxLvl) {
        btn.textContent = "MAX";
        priceEl.textContent = "MAX";
      } else if ((prog.coins | 0) < price) {
        btn.title = "Not enough gold";
      }

      btn.addEventListener("click", () => {
        if (!it) return;
        ensureShopMeta(prog);
        const cur = getMetaLevel(prog, id);
        const cost = getPriceFor(id, cur);
        if ((prog.coins | 0) < cost) {
          setShopMsg("Not enough gold.");
          return;
        }
        if (cur >= maxLvl) return;

        prog.coins = Math.max(0, (prog.coins | 0) - cost);
        setMetaLevel(prog, id, cur + 1);

        replaceOfferSlot(prog, kind, i);

        _shopRerollLocal = 0;
        try { saveProgression(prog); } catch {}
        maybeSendMeta(state);
        setShopMsg("Purchased!");
        _shopRenderKey = "";
        renderShop(state);
      });

      card.appendChild(top);
      card.appendChild(buyRow);
      card.appendChild(btn);
      container.appendChild(card);
    }
  };

  renderRow(el.shopGridActive, "active", offers.active || []);
  renderRow(el.shopGridPassive, "passive", offers.passive || []);
  renderRow(el.shopGridNew, "new", offers.newSkills || []);
}

export function initHubNpcDom(game) {
  if (_inited) return;
  _inited = true;

  // Interact button (mobile-friendly)
  el.interactWrap = make("div", {
    id: "hubInteractWrap",
    style: {
      position: "fixed",
      left: "50%",
      bottom: "22px",
      transform: "translateX(-50%)",
      zIndex: 9999,
      display: "none",
      pointerEvents: "none",
    },
  });

  el.interactBtn = make("button", {
    id: "btnHubInteract",
    className: "btn",
    type: "button",
    text: "Interact",
    style: {
      pointerEvents: "auto",
      padding: "12px 18px",
      fontSize: "14px",
      borderRadius: "12px",
      boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
    },
  });

  el.interactWrap.appendChild(el.interactBtn);
  document.body.appendChild(el.interactWrap);

  // Shop overlay
  el.shopOverlay = make("div", {
    id: "hubShopOverlay",
    style: {
      position: "fixed",
      inset: "0",
      zIndex: 10000,
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.72)",
      padding: "14px",
    },
  });

  const panel = make("div", {
    className: "panel",
    style: {
      width: "min(560px, 96vw)",
      maxHeight: "92vh",
      overflow: "auto",
    },
  });

  const header = make("div", { className: "header" });
  header.appendChild(make("h2", { text: "Hub Shop" }));
  const closeBtn = make("button", { className: "btn", type: "button", text: "Close", style: { padding: "7px 10px", fontSize: "12px" } });
  closeBtn.addEventListener("click", () => closeShop(game.state));
  header.appendChild(closeBtn);

  const topRow = make("div", { className: "row", style: { justifyContent: "space-between", alignItems: "center", marginTop: "8px" } });
  const coinsInfo = make("div", { style: { fontSize: "13px" } });
  coinsInfo.innerHTML = "<b>Gold:</b> <span id=\"hubShopCoins\">0</span> <span class=\"muted\">🪙</span>";
  topRow.appendChild(coinsInfo);
  const shopWallet = make("div", { id: "hubShopWallet", style: { flex: "1 1 320px" } });
  topRow.appendChild(shopWallet);

  const rerollBtn = make("button", { className: "btn", id: "btnHubShopReroll", type: "button", style: { padding: "8px 10px", whiteSpace: "nowrap" } });
  rerollBtn.innerHTML = "Reroll (<span id=\"hubShopRerollCost\">10</span>)";
  topRow.appendChild(rerollBtn);

  const quickRow = make("div", { className: "row", style: { gap: "8px", marginTop: "10px", flexWrap: "wrap" } });
  const btnBuildLab = make("button", { className: "btn", id: "btnHubBuildLab", type: "button", text: "Wing Navigator", style: { padding: "8px 10px", display: "none" } });
  const btnCoreLab = make("button", { className: "btn", id: "btnHubCoreLab", type: "button", text: "Core Selector", style: { padding: "8px 10px" } });
  const btnArsenalLab = make("button", { className: "btn", type: "button", text: "Arsenal Wing", style: { padding: "8px 10px" } });
  const btnEssenceLab = make("button", { className: "btn", type: "button", text: "Essence Conflux", style: { padding: "8px 10px" } });
  const btnMasteryLab = make("button", { className: "btn", type: "button", text: "Mastery Archive", style: { padding: "8px 10px" } });
  const btnForgeLab = make("button", { className: "btn", type: "button", text: "Forge Wing", style: { padding: "8px 10px" } });
  quickRow.appendChild(btnCoreLab);
  quickRow.appendChild(btnArsenalLab);
  quickRow.appendChild(btnEssenceLab);
  quickRow.appendChild(btnMasteryLab);
  const btnCharacter = make("button", { className: "btn", type: "button", text: "Hero Menu", style: { padding: "8px 10px" } });
  quickRow.appendChild(btnForgeLab);
  quickRow.appendChild(btnCharacter);

  const msg = make("div", { className: "muted", id: "hubShopMsg", style: { minHeight: "16px", marginTop: "6px" } });

  panel.appendChild(header);
  panel.appendChild(topRow);
  panel.appendChild(quickRow);
  panel.appendChild(make("div", { className: "muted", id: "hubShopFlowInfo", style: { marginTop: "6px", fontSize: "12px", lineHeight: "1.45", color: "rgba(240,248,255,0.92)", opacity: "1" } }));
  panel.appendChild(msg);

  panel.appendChild(make("div", { className: "shopLabel", text: "Прокачка" }));
  panel.appendChild(make("div", { className: "shopGrid", id: "hubShopGridActive" }));

  panel.appendChild(make("div", { className: "shopLabel", text: "Пассивки", style: { marginTop: "10px" } }));
  panel.appendChild(make("div", { className: "shopGrid", id: "hubShopGridPassive" }));

  panel.appendChild(make("div", { className: "shopLabel", text: "2nd Rank Skill Up", style: { marginTop: "10px" } }));
  panel.appendChild(make("div", { className: "shopGrid", id: "hubShopGridNew" }));

  panel.appendChild(make("div", { className: "muted", style: { marginTop: "10px", fontSize: "12px", opacity: "0.85" }, text: "Gold unlocks and raises ownership caps. Expedition Build uses banked SP from expeditions to allocate your active build in hub." }));

  el.shopOverlay.appendChild(panel);
  document.body.appendChild(el.shopOverlay);

  el.basicOverlay = make("div", {
    id: "hubBasicOverlay",
    style: {
      position: "fixed",
      inset: "0",
      zIndex: 10000,
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.72)",
      padding: "14px",
    },
  });
  const basicPanel = make("div", { className: "panel", style: { width: "min(680px, 96vw)", maxHeight: "92vh", overflow: "auto" } });
  const basicHeader = make("div", { className: "header" });
  basicHeader.appendChild(make("h2", { text: "Basic Core Selector" }));
  const basicCloseBtn = make("button", { className: "btn", type: "button", text: "Close", style: { padding: "7px 10px", fontSize: "12px" } });
  basicCloseBtn.addEventListener("click", () => closeBasicSelector(game.state));
  basicHeader.appendChild(basicCloseBtn);
  basicPanel.appendChild(basicHeader);
  basicPanel.appendChild(make("div", { className: "muted", style: { marginTop: "8px", marginBottom: "12px", fontSize: "13px", lineHeight: "1.45", color: "rgba(240,248,255,0.95)", opacity: "1" }, text: "Выбери 1 стартовый core. На следующем ране он даст тебе свой базовый скилл Lv1 и бонусы к скорости атаки + урону своей стихии/типа." }));
  el.basicGrid = make("div", { className: "shopGrid", id: "hubBasicGrid" });
  basicPanel.appendChild(el.basicGrid);
  basicPanel.appendChild(make("div", { className: "muted", style: { marginTop: "12px", fontSize: "12px", color: "rgba(232,245,255,0.9)", opacity: "1" }, text: "Сейчас доступны все 6 core-направлений: Mecha / Electric / Fire / Ice / Dark / Light." }));
  el.basicOverlay.appendChild(basicPanel);
  document.body.appendChild(el.basicOverlay);

  el.buildOverlay = make("div", {
    id: "hubBuildOverlay",
    style: {
      position: "fixed",
      inset: "0",
      zIndex: 10000,
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.72)",
      padding: "14px",
    },
  });
  const buildPanel = make("div", { className: "panel", style: { width: "min(820px, 96vw)", maxHeight: "92vh", overflow: "auto" } });
  const buildHeader = make("div", { className: "header" });
  const buildTitle = make("h2", { text: "Expedition Build Lab" });
  buildHeader.appendChild(buildTitle);
  const buildCloseBtn = make("button", { className: "btn", type: "button", text: "Close", style: { padding: "7px 10px", fontSize: "12px" } });
  buildCloseBtn.addEventListener("click", () => closeBuildLab(game.state));
  buildHeader.appendChild(buildCloseBtn);
  buildPanel.appendChild(buildHeader);
  const buildIntro = make("div", { className: "muted", style: { marginTop: "8px", fontSize: "13px", lineHeight: "1.45", color: "rgba(240,248,255,0.95)", opacity: "1" }, text: "Build points are allocated from banked SP. You earn SP in expeditions, then return to hub to distribute it across active skills and passives. Allocation is reversible while in hub." });
  buildPanel.appendChild(buildIntro);
  const buildWallet = make("div", { id: "hubBuildWallet", style: { marginTop: "10px" } });
  buildPanel.appendChild(buildWallet);
  const buildInfo = make("div", { className: "row", style: { justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginTop: "12px" } });
  buildInfo.innerHTML = '<div><b>Available SP:</b> <span id="hubBuildSp">0</span></div><div><b>Allocated:</b> <span id="hubBuildSpent">0</span></div><div><b>Total SP:</b> <span id="hubBuildTotal">0</span></div><div><b>Extra Skill Slots:</b> <span id="hubBuildSlots">0/0</span></div>';
  buildPanel.appendChild(buildInfo);
  const buildMsg = make("div", { className: "muted", id: "hubBuildMsg", style: { minHeight: "16px", marginTop: "6px" } });
  buildPanel.appendChild(buildMsg);
  const buildOverview = make("div", { id: "hubBuildOverview", className: "muted", style: { marginTop: "10px", padding: "10px 12px", borderRadius: "12px", background: "rgba(255,255,255,0.04)", fontSize: "12px", lineHeight: "1.55", color: "rgba(240,248,255,0.95)", opacity: "1" } });
  buildPanel.appendChild(buildOverview);
  const buildBranchHint = make("div", { id: "hubBuildBranchHint", className: "muted", style: { marginTop: "8px", fontSize: "12px", lineHeight: "1.45", color: "rgba(232,245,255,0.9)", opacity: "1" } });
  buildPanel.appendChild(buildBranchHint);
  const buildBranchTabs = make("div", { className: "row", style: { gap: "8px", marginTop: "10px", flexWrap: "wrap", display: "none" } });
  const buildBranchButtons = {};
  for (const [focusKey, meta] of Object.entries(BUILD_BRANCH_META)) {
    const btn = make("button", { className: "btn", type: "button", text: meta.label, style: { padding: "8px 10px", fontSize: "12px" } });
    btn.addEventListener("click", () => {
      setBuildFocus(game.state, focusKey);
      renderBuildLab(game.state, true);
    });
    buildBranchButtons[focusKey] = btn;
    buildBranchTabs.appendChild(btn);
  }
  buildPanel.appendChild(buildBranchTabs);

  el.buildSectionArsenal = make("div", { id: "hubBuildSectionArsenal", style: { marginTop: "12px" } });
  const buildCoreRow = make("div", { className: "row", style: { gap: "8px", marginTop: "12px", flexWrap: "wrap" } });
  const buildCoreBtn = make("button", { className: "btn", type: "button", id: "hubBuildCoreBtn", text: "Open Core Selector", style: { padding: "8px 10px" } });
  const buildResetBtn = make("button", { className: "btn", type: "button", id: "hubBuildResetBtn", text: "Reset Allocations", style: { padding: "8px 10px" } });
  buildCoreRow.appendChild(buildCoreBtn);
  buildCoreRow.appendChild(buildResetBtn);
  el.buildSectionArsenal.appendChild(buildCoreRow);
  el.buildSectionArsenal.appendChild(make("div", { className: "shopLabel", text: "Active Skills • extra slots only", style: { marginTop: "12px" } }));
  el.buildGridSkills = make("div", { className: "shopGrid", id: "hubBuildGridSkills" });
  el.buildSectionArsenal.appendChild(el.buildGridSkills);
  buildPanel.appendChild(el.buildSectionArsenal);

  el.buildSectionEssence = make("div", { id: "hubBuildSectionEssence", style: { marginTop: "12px" } });
  el.buildSectionEssence.appendChild(make("div", { className: "shopLabel", text: "Biome Essences" }));
  el.buildSectionEssence.appendChild(make("div", { className: "muted", style: { marginTop: "6px", fontSize: "12px", lineHeight: "1.4", color: "rgba(232,245,255,0.9)", opacity: "1" }, text: `Each cleared expedition room now feeds your hub economy. Boss/final rooms give extra essence. Exchange rate: ${ESSENCE_EXCHANGE_RATE} → 1.` }));
  el.buildEssenceGrid = make("div", { className: "shopGrid", id: "hubBuildEssenceGrid" });
  el.buildSectionEssence.appendChild(el.buildEssenceGrid);
  el.buildSectionEssence.appendChild(make("div", { className: "shopLabel", text: "Biome Routes", style: { marginTop: "12px" } }));
  el.buildGridRoutes = make("div", { className: "shopGrid", id: "hubBuildGridRoutes" });
  el.buildSectionEssence.appendChild(el.buildGridRoutes);
  const buildExchangeWrap = make("div", { style: { marginTop: "12px", padding: "12px", borderRadius: "12px", background: "rgba(255,255,255,0.04)" } });
  buildExchangeWrap.appendChild(make("div", { className: "shopLabel", text: "Essence Exchange" }));
  const buildExchangeRow = make("div", { className: "row", style: { gap: "8px", marginTop: "8px", flexWrap: "wrap", alignItems: "center" } });
  const buildExchangeFrom = make("select", { id: "hubBuildExchangeFrom", style: { minWidth: "170px", padding: "8px", borderRadius: "10px", background: "rgba(10,18,28,0.96)", color: "#eef8ff", border: "1px solid rgba(255,255,255,0.18)" } });
  const buildExchangeTo = make("select", { id: "hubBuildExchangeTo", style: { minWidth: "170px", padding: "8px", borderRadius: "10px", background: "rgba(10,18,28,0.96)", color: "#eef8ff", border: "1px solid rgba(255,255,255,0.18)" } });
  const buildExchangeBtn = make("button", { className: "btn", type: "button", id: "hubBuildExchangeBtn", text: `Convert ${ESSENCE_EXCHANGE_RATE} → 1`, style: { padding: "8px 10px" } });
  buildExchangeRow.appendChild(buildExchangeFrom);
  buildExchangeRow.appendChild(buildExchangeTo);
  buildExchangeRow.appendChild(buildExchangeBtn);
  buildExchangeWrap.appendChild(buildExchangeRow);
  const buildExchangeInfo = make("div", { id: "hubBuildExchangeInfo", className: "muted", style: { marginTop: "8px", fontSize: "12px", lineHeight: "1.4", color: "rgba(232,245,255,0.9)", opacity: "1" } });
  buildExchangeWrap.appendChild(buildExchangeInfo);
  el.buildSectionEssence.appendChild(buildExchangeWrap);
  buildPanel.appendChild(el.buildSectionEssence);

  el.buildSectionMastery = make("div", { id: "hubBuildSectionMastery", style: { marginTop: "12px" } });
  el.buildSectionMastery.appendChild(make("div", { className: "shopLabel", text: "Passives" }));
  el.buildGridPassives = make("div", { className: "shopGrid", id: "hubBuildGridPassives" });
  el.buildSectionMastery.appendChild(el.buildGridPassives);
  buildPanel.appendChild(el.buildSectionMastery);

  el.buildSectionForge = make("div", { id: "hubBuildSectionForge", style: { marginTop: "12px" } });
  el.buildSectionForge.appendChild(make("div", { className: "shopLabel", text: "Forge Materials" }));
  el.buildSectionForge.appendChild(make("div", { className: "muted", style: { marginTop: "6px", fontSize: "12px", lineHeight: "1.4", color: "rgba(232,245,255,0.9)", opacity: "1" }, text: "Rooms now drop salvage and alloy; final boss rooms can drop core shards, gear parts and sometimes a full item." }));
  el.buildGridMaterials = make("div", { className: "shopGrid", id: "hubBuildGridMaterials" });
  el.buildSectionForge.appendChild(el.buildGridMaterials);
  el.buildSectionForge.appendChild(make("div", { className: "shopLabel", text: "Gear Forge • Modules", style: { marginTop: "12px" } }));
  el.buildSectionForge.appendChild(make("div", { className: "muted", style: { marginTop: "6px", fontSize: "12px", lineHeight: "1.4", color: "rgba(232,245,255,0.9)", opacity: "1" }, text: `Craft and equip gear with Gold + Materials + Essences + Parts. Modules have ${HUB_MODULE_SLOTS} slots; Relic and Core Item have 1 each.` }));
  el.buildGridModules = make("div", { className: "shopGrid", id: "hubBuildGridModules" });
  el.buildSectionForge.appendChild(el.buildGridModules);
  el.buildSectionForge.appendChild(make("div", { className: "shopLabel", text: "Relics", style: { marginTop: "12px" } }));
  el.buildGridRelics = make("div", { className: "shopGrid", id: "hubBuildGridRelics" });
  el.buildSectionForge.appendChild(el.buildGridRelics);
  el.buildSectionForge.appendChild(make("div", { className: "shopLabel", text: "Core Items", style: { marginTop: "12px" } }));
  el.buildGridCoreItems = make("div", { className: "shopGrid", id: "hubBuildGridCoreItems" });
  el.buildSectionForge.appendChild(el.buildGridCoreItems);
  buildPanel.appendChild(el.buildSectionForge);
  el.buildOverlay.appendChild(buildPanel);
  document.body.appendChild(el.buildOverlay);

  el.characterOverlay = make("div", {
    id: "hubCharacterOverlay",
    style: {
      position: "fixed",
      inset: "0",
      zIndex: 10001,
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.76)",
      padding: "10px",
    },
  });
  const characterPanel = make("div", { className: "panel", style: { width: "min(1180px, 96vw)", height: "calc(100vh - 16px)", maxHeight: "calc(100vh - 16px)", overflow: "hidden", display: "flex", flexDirection: "column" } });
  const characterHeader = make("div", { className: "header", style: { paddingBottom: "6px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" } });
  const characterHeaderLeft = make("div", { style: { display: "flex", flexDirection: "column", gap: "4px", minWidth: "0", flex: "1 1 auto" } });
  const characterTitle = make("div", { text: "Hero", style: { fontSize: "18px", fontWeight: "800", color: "#fff3d0", lineHeight: "1.1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } });
  const characterHp = make("div", { text: "0/0 HP", style: { display: "inline-flex", alignItems: "center", width: "fit-content", padding: "3px 10px", borderRadius: "999px", border: "1px solid rgba(159,214,255,0.34)", background: "rgba(159,214,255,0.10)", color: "#f6fbff", fontSize: "11px", fontWeight: "700" } });
  characterHeaderLeft.appendChild(characterTitle);
  characterHeaderLeft.appendChild(characterHp);
  const characterHeaderRight = make("div", { className: "row", style: { gap: "8px", alignItems: "flex-start", flexWrap: "nowrap", justifyContent: "flex-end", minWidth: "0" } });
  const characterWallet = make("div", { id: "heroMenuWallet", style: { flex: "0 1 520px", minWidth: "220px", marginLeft: "auto" } });
  const characterCloseBtn = make("button", { className: "btn", type: "button", text: "Close", style: { padding: "7px 10px", fontSize: "12px" } });
  characterHeaderRight.appendChild(characterWallet);
  characterHeaderRight.appendChild(characterCloseBtn);
  characterHeader.appendChild(characterHeaderLeft);
  characterHeader.appendChild(characterHeaderRight);
  characterPanel.appendChild(characterHeader);
  const characterLayout = make("div", { id: "heroMenuLayout", style: { display: "flex", gap: "12px", marginTop: "6px", alignItems: "stretch", flex: "1 1 auto", minHeight: "0", overflow: "hidden" } });
  const characterLeft = make("div", { id: "heroMenuLeft", style: { flex: "0 0 30%", minWidth: "280px" } });
  const characterRight = make("div", { id: "heroMenuRight", style: { flex: "1 1 70%", display: "flex", flexDirection: "column", gap: "12px" } });
  const characterTabs = make("div", { id: "heroMenuTabs", className: "row", style: { gap: "8px", flexWrap: "wrap", flex: "0 0 auto" } });
  const characterContent = make("div", { id: "heroMenuContent", style: { display: "flex", flexDirection: "column", gap: "10px", flex: "1 1 auto", minHeight: "0", overflow: "hidden" } });
  characterRight.appendChild(characterTabs);
  characterRight.appendChild(characterContent);
  characterLayout.appendChild(characterLeft);
  characterLayout.appendChild(characterRight);
  characterPanel.appendChild(characterLayout);
  el.characterOverlay.appendChild(characterPanel);
  document.body.appendChild(el.characterOverlay);

  // Bind elements
  el.shopCoins = panel.querySelector("#hubShopCoins");
  el.shopWallet = panel.querySelector("#hubShopWallet");
  el.shopRerollCost = panel.querySelector("#hubShopRerollCost");
  el.shopMsg = panel.querySelector("#hubShopMsg");
  el.shopFlowInfo = panel.querySelector("#hubShopFlowInfo");
  el.shopGridActive = panel.querySelector("#hubShopGridActive");
  el.shopGridPassive = panel.querySelector("#hubShopGridPassive");
  el.shopGridNew = panel.querySelector("#hubShopGridNew");
  el.buildInfoWrap = buildInfo;
  el.buildTitle = buildTitle;
  el.buildPanel = buildPanel;
  el.buildIntro = buildIntro;
  el.buildWallet = buildPanel.querySelector("#hubBuildWallet");
  el.buildMsg = buildPanel.querySelector("#hubBuildMsg");
  el.buildCoreBtn = buildPanel.querySelector("#hubBuildCoreBtn");
  el.buildResetBtn = buildPanel.querySelector("#hubBuildResetBtn");
  el.buildOverview = buildPanel.querySelector("#hubBuildOverview");
  el.buildBranchHint = buildPanel.querySelector("#hubBuildBranchHint");
  el.buildBranchButtons = buildBranchButtons;
  el.buildSectionArsenal = buildPanel.querySelector("#hubBuildSectionArsenal");
  el.buildSectionEssence = buildPanel.querySelector("#hubBuildSectionEssence");
  el.buildSectionMastery = buildPanel.querySelector("#hubBuildSectionMastery");
  el.buildSectionForge = buildPanel.querySelector("#hubBuildSectionForge");
  el.buildGridRoutes = buildPanel.querySelector("#hubBuildGridRoutes");
  el.buildExchangeFrom = buildPanel.querySelector("#hubBuildExchangeFrom");
  el.buildExchangeTo = buildPanel.querySelector("#hubBuildExchangeTo");
  el.buildExchangeBtn = buildPanel.querySelector("#hubBuildExchangeBtn");
  el.buildExchangeInfo = buildPanel.querySelector("#hubBuildExchangeInfo");
  el.buildGridMaterials = buildPanel.querySelector("#hubBuildGridMaterials");
  el.buildGridModules = buildPanel.querySelector("#hubBuildGridModules");
  el.buildGridRelics = buildPanel.querySelector("#hubBuildGridRelics");
  el.buildGridCoreItems = buildPanel.querySelector("#hubBuildGridCoreItems");
  el.characterPanel = characterPanel;
  el.characterLayout = characterLayout;
  el.characterLeft = characterLeft;
  el.characterRight = characterRight;
  el.characterTitle = characterTitle;
  el.characterHp = characterHp;
  el.characterWallet = characterWallet;
  el.characterTabs = characterTabs;
  el.characterContent = characterContent;

  btnBuildLab.addEventListener("click", () => openBuildLab(game.state, "arsenal"));
  btnCoreLab.addEventListener("click", () => openBasicSelector(game.state));
  btnArsenalLab.addEventListener("click", () => openBuildLab(game.state, "arsenal"));
  btnEssenceLab.addEventListener("click", () => openBuildLab(game.state, "essence"));
  btnMasteryLab.addEventListener("click", () => openBuildLab(game.state, "mastery"));
  btnForgeLab.addEventListener("click", () => openBuildLab(game.state, "forge"));
  btnCharacter.addEventListener("click", () => openCharacterMenu(game.state, 'overview'));
  characterCloseBtn.addEventListener("click", () => closeCharacterMenu(game.state));
  el.buildCoreBtn.addEventListener("click", () => {
    if (game.state?._hubResumeRunActive) return;
    openBasicSelector(game.state);
  });
  el.buildResetBtn.addEventListener("click", () => {
    const state = game.state;
    const prog = state?.progression;
    if (!prog) return;
    resetHubBuildAllocations(prog);
    persistHubState(state, "Allocations reset.");
    renderBuildLab(state, true);
  });
  el.buildExchangeFrom.addEventListener("change", () => renderBuildLab(game.state, true));
  el.buildExchangeTo.addEventListener("change", () => renderBuildLab(game.state, true));
  el.buildExchangeBtn.addEventListener("click", () => {
    const state = game.state;
    const prog = state?.progression;
    if (!prog) return;
    const fromKey = String(el.buildExchangeFrom?.value || "");
    const toKey = String(el.buildExchangeTo?.value || "");
    if (!exchangeEssence(prog, fromKey, toKey, ESSENCE_EXCHANGE_RATE)) {
      setShopMsg(`Need ${ESSENCE_EXCHANGE_RATE} source essences.`);
      renderBuildLab(state, true);
      return;
    }
    const fromLabel = (ESSENCE_META[fromKey] || ESSENCE_META.mecha).short;
    const toLabel = (ESSENCE_META[toKey] || ESSENCE_META.mecha).short;
    persistHubState(state, `${ESSENCE_EXCHANGE_RATE} ${fromLabel} → 1 ${toLabel}`);
    renderBuildLab(state, true);
  });

  rerollBtn.addEventListener("click", () => {
    const state = game.state;
    const prog = state?.progression;
    if (!prog) return;
    ensureShopMeta(prog);
    const cost = 10 + (_shopRerollLocal | 0) * 5;
    if ((prog.coins | 0) < cost) {
      setShopMsg("Not enough gold.");
      return;
    }
    prog.coins = Math.max(0, (prog.coins | 0) - cost);
    rerollShopOffers(prog);
    _shopRerollLocal = (_shopRerollLocal | 0) + 1;
    try { saveProgression(prog); } catch {}
    maybeSendMeta(state);
    setShopMsg("Rerolled!");
    _shopRenderKey = "";
    renderShop(state);
  });

  // Interact button click
  el.interactBtn.addEventListener("click", () => {
    const state = game.state;
    const n = state?._hubNearbyNpc;
    if (!n) return;
    if (n.kind === "shop") openShop(state);
    else if (n.kind === "tier") openTier(state);
    else if (n.kind === "basic") openBasicSelector(state);
    else if (n.kind === "arsenal") openBuildLab(state, "arsenal");
    else if (n.kind === "essence") openBuildLab(state, "essence");
    else if (n.kind === "mastery") openBuildLab(state, "mastery");
    else if (n.kind === "reset") { if (typeof state._clearSavedRunCheckpoint === "function") state._clearSavedRunCheckpoint(); state._hubResumeNextFloor = 0; state._hubResumeRunActive = false; state._savedRunResumePlan = null; if (state.popups) state.popups.push({ text: "Arena floor reset • Progress kept", time: 2.2 }); }
    else if (n.kind === "forge") openBuildLab(state, "forge");
  });

  // Keyboard: E to interact, Esc to close overlays.
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const state = game.state;
    if (!state || state.mode !== "playing") return;
    if (isTypingFocus()) return;

    if (e.code === "Escape") {
      if (state.overlayMode === "shop") {
        closeShop(state);
        e.preventDefault();
      } else if (state.overlayMode === "basic") {
        closeBasicSelector(state);
        e.preventDefault();
      } else if (state.overlayMode === "build") {
        closeBuildLab(state);
        e.preventDefault();
      } else if (state.overlayMode === "character") {
        closeCharacterMenu(state);
        e.preventDefault();
      } else if (state.overlayMode === "stats") {
        state.overlayMode = null;
        e.preventDefault();
      }
      return;
    }

    if (e.code === "KeyC") {
      if (state.overlayMode === 'character') closeCharacterMenu(state);
      else if (!state.overlayMode) openCharacterMenu(state, 'overview');
      e.preventDefault();
      return;
    }

    if (e.code === "KeyE") {
      if (state.overlayMode) return;
      const n = state._hubNearbyNpc;
      if (!n) return;
      if (n.kind === "shop") openShop(state);
      else if (n.kind === "tier") openTier(state);
      else if (n.kind === "basic") openBasicSelector(state);
      else if (n.kind === "arsenal") openBuildLab(state, "arsenal");
      else if (n.kind === "essence") openBuildLab(state, "essence");
      else if (n.kind === "mastery") openBuildLab(state, "mastery");
    else if (n.kind === "reset") { if (typeof state._clearSavedRunCheckpoint === "function") state._clearSavedRunCheckpoint(); state._hubResumeNextFloor = 0; state._hubResumeRunActive = false; state._savedRunResumePlan = null; if (state.popups) state.popups.push({ text: "Arena floor reset • Progress kept", time: 2.2 }); }
      else if (n.kind === "forge") openBuildLab(state, "forge");
      e.preventDefault();
    }
  });
}

export function tickHubNpcDom(state) {
  if (!_inited || !state) return;

  // Tap interaction from canvas (mobile): gameLoop can set this flag.
  if (state._hubNpcTap && !state.overlayMode) {
    const k = String(state._hubNpcTap);
    state._hubNpcTap = null;
    if (k === "shop") openShop(state);
    else if (k === "tier") openTier(state);
    else if (k === "basic") openBasicSelector(state);
    else if (k === "arsenal") openBuildLab(state, "arsenal");
    else if (k === "essence") openBuildLab(state, "essence");
    else if (k === "mastery") openBuildLab(state, "mastery");
    else if (k === "reset") { if (typeof state._clearSavedRunCheckpoint === "function") state._clearSavedRunCheckpoint(); state._hubResumeNextFloor = 0; state._hubResumeRunActive = false; state._savedRunResumePlan = null; if (state.popups) state.popups.push({ text: "Arena floor reset • Progress kept", time: 2.2 }); }
    else if (k === "forge") openBuildLab(state, "forge");
  }

  const showInteract = state.mode === "playing" && !state.overlayMode && !!state._hubNearbyNpc;
  if (el.interactWrap) el.interactWrap.style.display = showInteract ? "block" : "none";

  if (showInteract && el.interactBtn) {
    const n = state._hubNearbyNpc;
    const labelMap = {
      shop: "Shop (E)",
      tier: "Death Shop~Up (E)",
      basic: state._hubResumeRunActive ? "Basic Core Locked" : "Basic Core (E)",
      arsenal: "Arsenal Wing (E)",
      essence: "Essence Conflux (E)",
      mastery: "Mastery Archive (E)",
      reset: "Reset Expedition (E)",
      forge: "Forge Wing (E)",
    };
    el.interactBtn.textContent = labelMap[n.kind] || "Interact (E)";
  }

  // Shop overlay visibility
  const showShop = state.overlayMode === "shop";
  if (el.shopOverlay) el.shopOverlay.style.display = showShop ? "flex" : "none";
  if (showShop) renderShop(state);

  const showBasic = state.overlayMode === "basic";
  if (el.basicOverlay) el.basicOverlay.style.display = showBasic ? "flex" : "none";
  if (showBasic) renderBasicSelector(state);

  const showBuild = state.overlayMode === "build";
  if (el.buildOverlay) el.buildOverlay.style.display = showBuild ? "flex" : "none";
  if (showBuild) renderBuildLab(state);

  const showCharacter = state.overlayMode === 'character';
  if (el.characterOverlay) el.characterOverlay.style.display = showCharacter ? 'flex' : 'none';
  if (showCharacter) renderCharacterMenu(state);
}