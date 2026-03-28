import { AVATARS } from "../../core/avatars.js";
import { AURA_NAMES } from "../../core/auras.js";
import { STARTER_LOADOUTS, getCoreIdentity, getPassiveRouteMeta, getSkillRouteMeta } from "../../core/starterLoadouts.js";
import { RUN_PASSIVES, RUN_SKILLS, getVisibleOwnedRunSkills } from "../../core/runUpgrades.js";
import { BIOME_ESSENCE_KEYS, ESSENCE_META, HUB_GEAR_DEFS, HUB_MATERIAL_KEYS, MATERIAL_META, ensureHubProgression, equipHubGear, getEquippedHubGearKeys, getGearPartCount, getGearPrimaryBiomeKey, getGearSourceBiomes, getHubBuildAvailableSp, getHubBuildSpentPoints, getHubCoreKey, getHubGearDef, getHubGearDefsBySlot, getHubGearPartCost, isHubGearEquipped, isHubGearOwned, unequipHubGear } from "../../core/hubBuild.js";
import { getStatsData } from "../hud.js";
import { getSkillDetailRows } from "../../weapons/skillPresentation.js";
import { EVOLUTION_DEFS } from "../../core/skillEvolutionDefs.js";
import { CHARACTER_TABS, getCharacterSelection, getCharacterTab, sameCharacterSelection, setCharacterSelection, setCharacterTab } from "./hubUiState.js";
import { getFrameAccent, getPassiveBiomeKey, getPassiveDefByKey, getSkillBiomeKey, getSkillDefByKey, renderCharacterChip, renderCharacterSectionTitle, renderHeroEquipmentSlot, renderGearIcon, renderMenuSlot, renderSkillIcon, renderWalletBar } from "./hubViewShared.js";
import { gearCostText } from "./buildLabRenderer.js";
import { applyHeroLoadoutPreset, canCreateHero, createHeroForRace, getActiveHero, getActiveHeroSummary, getHeroBiomeMasterySummary, getHeroById, getHeroCombatProfile, getHeroLoadoutPresets, getHeroLoadoutSummary, getSavedCheckpointHeroSummary, listHeroSummaries, renameHeroProfile, retireHeroProfile, saveHeroLoadoutPreset, setActiveHeroId } from "../../core/accountProfile.js";
import { getHeroBiomeMeta } from "../../core/heroBiomes.js";
import { describeHeroBiomeRewardFlow } from "../../core/heroBiomeProgression.js";
import { getCardDefById, getCardIdForSkill, listOwnedCardEntries } from "../../core/cards/cardDefs.js";
import { equipCardOnHero, fillHeroLoadoutSlots, getHeroLoadoutActionPreview, getHeroLoadoutEntries, optimizeHeroLoadout, replaceHeroSkillCardAtSlot, unequipCardFromHero } from "../../core/cards/cardLoadout.js";
import { getProjectedSkillTier } from "../../core/skillRuntimeState.js";
import { getCardLevelCap, getCardUpgradePreview, levelUpCardOnce } from "../../core/cards/cardUpgrade.js";
import { getCardEvolutionPreview, evolveCardStarsOnce } from "../../core/cards/cardEvolution.js";
import { dismantleCardCopyOnce, dismantleCardsBatch, getCardDismantlePreview, getMassDismantlePreview } from "../../core/cards/cardDismantle.js";
import { getCardShardCount, getTotalCardShardCount } from "../../core/cards/cardRewards.js";
import { craftCardCopyFromShards, getCardCraftPreview } from "../../core/cards/cardCrafting.js";

let el = {};
let make = null;
let persistHubState = null;
let setShopMsg = null;

export function configureHeroMenuRenderer(deps = {}) {
  if (deps.el && typeof deps.el === 'object') el = deps.el;
  if (typeof deps.make === 'function') make = deps.make;
  if (typeof deps.persistHubState === 'function') persistHubState = deps.persistHubState;
  if (typeof deps.setShopMsg === 'function') setShopMsg = deps.setShopMsg;
}

function selectCharacterEntry(state, selection, { rerender = true } = {}) {
  if (!state) return false;
  const prev = getCharacterSelection(state);
  if (sameCharacterSelection(prev, selection)) return false;
  setCharacterSelection(state, selection);
  if (rerender) renderCharacterMenu(state, true);
  return true;
}

function flashHeroMenuMessage(text) {
  if (typeof setShopMsg === 'function') setShopMsg(text);
}

function getHeroRosterSelectedId(state, prog) {
  const desired = String(state?._heroRosterSelectedId || '').trim();
  if (desired && getHeroById(prog, desired)) return desired;
  const active = getActiveHero(prog);
  const fallback = String(active?.heroId || prog?.activeHeroId || '');
  if (state) state._heroRosterSelectedId = fallback;
  return fallback;
}

function setHeroRosterSelectedId(state, heroId) {
  if (!state) return '';
  state._heroRosterSelectedId = String(heroId || '').trim();
  return state._heroRosterSelectedId;
}


function getHeroCardViewState(state) {
  if (!state || typeof state !== 'object') return { kindFilter: 'skill', raceFilter: 'all', sortBy: 'power' };
  const src = state._heroCardView && typeof state._heroCardView === 'object' ? state._heroCardView : {};
  const kindFilter = ['all', 'skill', 'passive', 'equipped'].includes(src.kindFilter) ? src.kindFilter : 'skill';
  const raceFilter = String(src.raceFilter || 'all').trim() || 'all';
  const sortBy = ['power', 'name', 'copies', 'race'].includes(src.sortBy) ? src.sortBy : 'power';
  const next = { kindFilter, raceFilter, sortBy };
  state._heroCardView = next;
  return next;
}

function setHeroCardViewState(state, patch = {}) {
  if (!state || typeof state !== 'object') return;
  state._heroCardView = { ...getHeroCardViewState(state), ...(patch || {}) };
  setHeroCardPage(state, 0);
}

function getHeroCardsSubtab(state) {
  if (!state || typeof state !== 'object') return 'collection';
  const raw = String(state._heroCardsSubtab || '').trim().toLowerCase();
  const next = ['collection', 'loadout', 'upgrade'].includes(raw) ? raw : 'collection';
  state._heroCardsSubtab = next;
  setHeroCardPage(state, 0);
  return next;
}

function setHeroCardsSubtab(state, subtab = 'collection') {
  if (!state || typeof state !== 'object') return;
  const next = ['collection', 'loadout', 'upgrade'].includes(String(subtab || '').trim().toLowerCase()) ? String(subtab || '').trim().toLowerCase() : 'collection';
  state._heroCardsSubtab = next;
  setHeroCardPage(state, 0);
}

function getHeroCardPage(state) {
  if (!state || typeof state !== 'object') return 0;
  const raw = Number(state._heroCardPage || 0);
  const next = Number.isFinite(raw) && raw > 0 ? (raw | 0) : 0;
  state._heroCardPage = next;
  return next;
}

function setHeroCardPage(state, page = 0) {
  if (!state || typeof state !== 'object') return;
  const next = Number(page || 0);
  state._heroCardPage = Number.isFinite(next) && next > 0 ? (next | 0) : 0;
}

function clampHeroCardPage(state, totalPages = 1) {
  const maxPage = Math.max(0, (Number(totalPages || 1) | 0) - 1);
  const current = getHeroCardPage(state);
  if (current > maxPage) setHeroCardPage(state, maxPage);
  return getHeroCardPage(state);
}

function getHeroPresetDraftName(state, slotIndex = 0, fallback = '') {
  if (!state || typeof state !== 'object') return String(fallback || '');
  const map = state._heroPresetDraftNames && typeof state._heroPresetDraftNames === 'object' ? state._heroPresetDraftNames : {};
  state._heroPresetDraftNames = map;
  const key = String(slotIndex | 0);
  const value = typeof map[key] === 'string' ? map[key] : '';
  return value || String(fallback || '');
}

function setHeroPresetDraftName(state, slotIndex = 0, value = '') {
  if (!state || typeof state !== 'object') return;
  if (!state._heroPresetDraftNames || typeof state._heroPresetDraftNames !== 'object') state._heroPresetDraftNames = {};
  state._heroPresetDraftNames[String(slotIndex | 0)] = String(value || '').slice(0, 24);
}

function getSkillReplaceState(state) {
  if (!state || typeof state !== 'object') return { pendingCardId: '', targetSlotIndex: -1 };
  const src = state._skillReplaceFlow && typeof state._skillReplaceFlow === 'object' ? state._skillReplaceFlow : {};
  const pendingCardId = String(src.pendingCardId || '').trim();
  const targetSlotIndex = Number.isFinite(Number(src.targetSlotIndex)) ? (Number(src.targetSlotIndex) | 0) : -1;
  const next = { pendingCardId, targetSlotIndex: targetSlotIndex >= 0 ? targetSlotIndex : -1 };
  state._skillReplaceFlow = next;
  return next;
}

function beginSkillReplaceFlow(state, cardId = '') {
  if (!state || typeof state !== 'object') return;
  state._skillReplaceFlow = { pendingCardId: String(cardId || '').trim(), targetSlotIndex: -1 };
}

function setSkillReplaceTargetSlot(state, slotIndex = -1) {
  if (!state || typeof state !== 'object') return;
  const flow = getSkillReplaceState(state);
  state._skillReplaceFlow = { pendingCardId: flow.pendingCardId, targetSlotIndex: Number(slotIndex) >= 0 ? (Number(slotIndex) | 0) : -1 };
}

function clearSkillReplaceFlow(state) {
  if (!state || typeof state !== 'object') return;
  state._skillReplaceFlow = { pendingCardId: '', targetSlotIndex: -1 };
}

function getHeroRenameDraft(state, heroId = '', fallback = '') {
  if (!state || typeof state !== 'object') return String(fallback || '');
  const map = state._heroRenameDrafts && typeof state._heroRenameDrafts === 'object' ? state._heroRenameDrafts : {};
  state._heroRenameDrafts = map;
  const key = String(heroId || '');
  const value = typeof map[key] === 'string' ? map[key] : '';
  return value || String(fallback || '');
}

function setHeroRenameDraft(state, heroId = '', value = '') {
  if (!state || typeof state !== 'object') return;
  if (!state._heroRenameDrafts || typeof state._heroRenameDrafts !== 'object') state._heroRenameDrafts = {};
  state._heroRenameDrafts[String(heroId || '')] = String(value || '').slice(0, 24);
}

function getSkillsMenuScrollTop(state) {
  if (!state || typeof state !== 'object') return 0;
  const raw = Number(state._skillsMenuScrollTop || 0);
  const next = Number.isFinite(raw) && raw > 0 ? raw : 0;
  state._skillsMenuScrollTop = next;
  return next;
}

function setSkillsMenuScrollTop(state, value = 0) {
  if (!state || typeof state !== 'object') return 0;
  const next = Number(value || 0);
  state._skillsMenuScrollTop = Number.isFinite(next) && next > 0 ? next : 0;
  return state._skillsMenuScrollTop;
}

function preserveSkillsMenuScrollFromNode(state, node) {
  try {
    const scroller = node?.closest?.('.skill-vertical-grid') || node?.closest?.('[data-skill-grid-scroller="1"]') || null;
    if (scroller) setSkillsMenuScrollTop(state, Number(scroller.scrollTop || 0) || 0);
  } catch {}
}

function restoreSkillsMenuScroll(state, scroller) {
  if (!scroller) return;
  const apply = () => {
    try {
      const saved = getSkillsMenuScrollTop(state);
      if (saved > 0) scroller.scrollTop = saved;
    } catch {}
  };
  apply();
  try {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        apply();
        requestAnimationFrame(() => apply());
      });
    } else {
      setTimeout(apply, 0);
      setTimeout(apply, 16);
    }
  } catch {}
}

function getHeroCardPowerSortScore(entry, heroBiome = 'mecha') {
  const sameBiome = String(entry?.race || '') === String(heroBiome || '');
  return (entry?.isEquipped ? 1000000 : 0)
    + (sameBiome ? 200000 : 0)
    + Math.max(0, Number(entry?.currentStars || 0) || 0) * 1000
    + Math.max(0, Number(entry?.level || 0) || 0) * 50
    + Math.max(0, Number(entry?.copiesOwned || 0) || 0) * 3;
}

function filterAndSortHeroCards(entries, view, heroBiome = 'mecha') {
  const raceFilter = String(view?.raceFilter || 'all').trim() || 'all';
  let out = Array.isArray(entries) ? entries.slice() : [];
  if (view?.kindFilter === 'skill') out = out.filter((entry) => entry?.kind === 'skill');
  else if (view?.kindFilter === 'passive') out = out.filter((entry) => entry?.kind === 'passive');
  else if (view?.kindFilter === 'equipped') out = out.filter((entry) => !!entry?.isEquipped);
  if (raceFilter !== 'all') {
    const resolvedBiome = raceFilter === 'hero' ? String(heroBiome || 'mecha') : raceFilter;
    out = out.filter((entry) => String(entry?.race || '') === resolvedBiome);
  }
  if (view?.sortBy === 'name') {
    out.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''))
      || Number(b?.currentStars || 0) - Number(a?.currentStars || 0)
      || Number(b?.level || 0) - Number(a?.level || 0));
  } else if (view?.sortBy === 'copies') {
    out.sort((a, b) => Number(b?.copiesOwned || 0) - Number(a?.copiesOwned || 0)
      || Number(b?.currentStars || 0) - Number(a?.currentStars || 0)
      || String(a?.name || '').localeCompare(String(b?.name || '')));
  } else if (view?.sortBy === 'race') {
    out.sort((a, b) => Number(String(b?.race || '') === String(heroBiome || '')) - Number(String(a?.race || '') === String(heroBiome || ''))
      || String(a?.race || '').localeCompare(String(b?.race || ''))
      || Number(b?.currentStars || 0) - Number(a?.currentStars || 0)
      || String(a?.name || '').localeCompare(String(b?.name || '')));
  } else {
    out.sort((a, b) => getHeroCardPowerSortScore(b, heroBiome) - getHeroCardPowerSortScore(a, heroBiome)
      || String(a?.name || '').localeCompare(String(b?.name || '')));
  }
  return out;
}

function buildCharacterActiveSkillSlots(state, player, coreDef) {
  const coreKey = String(coreDef?.skillKey || 'bullets');
  const visible = getVisibleOwnedRunSkills(player, { coreKey, maxSlots: 6 });
  const slots = visible.map((entry) => ({
    kind: 'skill',
    key: entry.key,
    def: entry.def,
    level: entry.level,
    isCore: !!entry.isCore,
  }));
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
  const detail = getSkillDetailPayload(def?.key, Math.max(1, level | 0));
  const rows = Array.isArray(detail.rows) ? detail.rows.slice(0, 8) : [];
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
    const level = getProjectedSkillTier(sel.key, { player: state?.player, heroCombatProfile: state?.player?._heroCombatProfile || prog?.heroCombatProfile || null, fallbackRace: prog?.selectedStarterLoadout || 'mecha', isCore: !!sel.isCore }) || (sel.isCore ? 1 : 0);
    const card = renderDetailCardShell(String(def.name || sel.key), accent, `${String(routeMeta.route || biomeKey).toUpperCase()} • ${String(routeMeta.role || 'combat skill')}`);
    const body = createDetailBody(card, { maxHeight: '100%' });
    const top = make('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } });
    top.appendChild(renderSkillIcon(def, 52));
    const txt = make('div');
    txt.appendChild(make('div', { text: level > 0 ? `Active level ${level}` : 'Not currently active', style: { fontSize: '13px', fontWeight: '700', color: '#f6fbff' } }));
    txt.appendChild(make('div', { text: `${String(routeMeta.style || 'general expedition value')}.`, style: { marginTop: '4px', fontSize: '12px', lineHeight: '1.4', color: 'rgba(216,232,255,0.82)' } }));
    top.appendChild(txt);
    body.appendChild(top);
    const detail = getSkillDetailPayload(def.key, Math.max(1, level | 0));
    const detailRows = Array.isArray(detail.rows) ? detail.rows.slice(0, 12).map((row) => `${row.label}: ${row.value}`) : [];
    appendDetailLines(body, [
      def?.desc ? String(def.desc) : `${String(routeMeta.style || 'Skill effect')}.`,
      `Biome frame: ${String((ESSENCE_META[biomeKey] || ESSENCE_META.mecha).label)}`,
      `Level: ${Math.max(1, level | 0)}${sel.isCore ? ' • Core skill' : ''}`,
      `Role: ${String(routeMeta.role || 'combat skill')} • Style: ${String(routeMeta.style || 'general expedition value')}`,
      ...detailRows,
      !detailRows.length ? 'Damage, cooldown and rank rows will appear here for this skill when defined in presentation data.' : '',
      'Read-only in Hero Menu. Manage card growth at Skill Master NPC.',
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

function renderPassiveCardIcon(passiveKey, size = 34) {
  const accent = getFrameAccent(getPassiveBiomeKey(passiveKey));
  const glyphMap = {
    damage: '✹', attackSpeed: '➚', moveSpeed: '➜', hp: '❤', hpRegen: '✚', range: '◎',
    pickupRadius: '◌', xpGain: '⬡', critChance: '✦', critDamage: '✸', lifeSteal: '☾',
  };
  return make('div', {
    style: {
      width: `${size}px`,
      height: `${size}px`,
      minWidth: `${size}px`,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '12px',
      border: `1px solid ${accent}88`,
      background: `${accent}1c`,
      color: accent,
      fontSize: `${Math.max(14, Math.round(size * 0.42))}px`,
      fontWeight: '800',
      boxShadow: `0 0 0 1px ${accent}22 inset`,
      textShadow: '0 1px 0 rgba(0,0,0,0.35)',
    },
  }, [document.createTextNode(glyphMap[String(passiveKey || '')] || '✦')]);
}

function renderCardIcon(entry, size = 30) {
  if (!entry) return null;
  if (entry.kind === 'skill') return renderSkillIcon(getSkillDefByKey(entry.sourceKey) || entry.sourceKey, size);
  return renderPassiveCardIcon(entry.sourceKey, size);
}

function getCardBiomeMeta(entry) {
  return ESSENCE_META[String(entry?.race || 'mecha').trim()] || ESSENCE_META.mecha;
}

function getBiomeEmoji(biomeKey) {
  switch (String(biomeKey || '').trim()) {
    case 'ice': return '❄️';
    case 'fire': return '🔥';
    case 'electric': return '⚡';
    case 'dark': return '🌑';
    case 'light': return '☀️';
    case 'mecha':
    default: return '🛠️';
  }
}

function getCardEvolutionLine(entry) {
  if (!entry || entry.kind !== 'skill') return '';
  const sourceKey = String(entry.sourceKey || entry.skillId || '').trim();
  if (!sourceKey) return '';
  const evoFrom = EVOLUTION_DEFS.find((def) => String(def.fromKey || '') === sourceKey);
  if (evoFrom) return `Evolution path: ${String(evoFrom.fromName || entry.name || sourceKey)} → ${String(evoFrom.resultName || evoFrom.resultKey || '')} at higher stars.`;
  const evoResult = EVOLUTION_DEFS.find((def) => String(def.resultKey || '') === sourceKey);
  if (evoResult) return `Advanced evolution card: ${String(evoResult.fromName || evoResult.fromKey || '')} route already awakened into ${String(evoResult.resultName || entry.name || sourceKey)}.`;
  return 'Standard route card: grows through stars and level inside its biome.';
}


function runSkillCardLoadoutAction(state, prog, entry, activeHero) {
  const preview = getHeroLoadoutActionPreview(prog, entry?.cardId, activeHero);
  const result = preview?.action === 'unequip'
    ? unequipCardFromHero(prog, entry?.cardId, activeHero)
    : equipCardOnHero(prog, entry?.cardId, activeHero);
  if (result?.ok) {
    if (typeof persistHubState === 'function') persistHubState(state, result.message || 'Skill deck updated.');
    else flashHeroMenuMessage(result.message || 'Skill deck updated.');
  } else {
    flashHeroMenuMessage(result?.message || 'Skill deck action blocked.');
  }
  renderCharacterMenu(state, true);
}

function renderHeroSkillCard(entry, opts = {}) {
  const accent = getFrameAccent(entry?.race || 'mecha');
  const biomeMeta = getCardBiomeMeta(entry);
  const biomeEmoji = getBiomeEmoji(entry?.race || 'mecha');
  const selected = !!opts.selected;
  const tall = Math.max(142, Number(opts.height || 168) || 168);
  const width = Math.max(92, Number(opts.width || 110) || 110);
  const border = selected ? `${accent}` : 'rgba(255,214,122,0.54)';
  const frameGlow = selected ? `0 0 0 2px ${accent}44 inset, 0 10px 22px ${accent}30` : '0 0 0 1px rgba(255,255,255,0.06) inset, 0 10px 18px rgba(0,0,0,0.34)';
  const root = make('div', { style: { position: 'relative', width: `${width}px`, minWidth: `${width}px`, height: `${tall}px` } });
  const button = make('button', {
    type: 'button',
    title: String(opts.title || `${entry?.name || 'Card'} • ${biomeEmoji}`),
    style: {
      position: 'absolute', inset: '0',
      padding: '6px',
      borderRadius: '18px',
      border: `1px solid ${border}`,
      background: `linear-gradient(180deg, rgba(89,28,18,0.96), rgba(43,16,14,0.98) 18%, rgba(24,17,18,0.98) 54%, rgba(12,13,18,0.98))`,
      boxShadow: frameGlow,
      color: '#fff6dd',
      cursor: 'pointer',
      overflow: 'hidden',
      textAlign: 'left',
    },
  });
  if (typeof opts.onClick === 'function') button.addEventListener('click', opts.onClick);

  button.appendChild(make('div', { style: {
    position: 'absolute', inset: '4px', borderRadius: '14px', pointerEvents: 'none',
    border: '1px solid rgba(255,228,162,0.34)', boxShadow: '0 0 0 1px rgba(92,22,16,0.56) inset',
  } }));
  button.appendChild(make('div', { style: {
    position: 'absolute', left: '8px', right: '8px', top: '8px', height: '18px',
    borderRadius: '999px', background: 'linear-gradient(180deg, rgba(255,214,122,0.34), rgba(126,78,24,0.22))',
    border: '1px solid rgba(255,228,162,0.24)', pointerEvents: 'none',
  } }));
  button.appendChild(make('div', { text: getBiomeEmoji(entry?.race || 'mecha'), style: {
    position: 'absolute', left: '10px', top: '8px', fontSize: '15px', lineHeight: '1', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.35))',
  } }));
  button.appendChild(make('div', { text: `Lv${Math.max(1, Number(entry?.level || 1) || 1)}`, style: {
    position: 'absolute', right: '10px', top: '10px', fontSize: '10px', fontWeight: '900', color: '#fff0cf', letterSpacing: '0.08em',
  } }));

  const artHeight = Math.max(58, tall - (opts.actionText ? 84 : 62));
  const art = make('div', { style: {
    position: 'absolute', left: '10px', right: '10px', top: '32px', height: `${artHeight}px`, borderRadius: '16px',
    background: `radial-gradient(circle at 50% 28%, ${accent}44, rgba(255,214,122,0.14) 42%, rgba(16,18,25,0.96) 78%)`,
    border: `1px solid ${accent}44`, display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: `0 0 0 1px ${accent}18 inset`, overflow: 'hidden',
  } });
  art.appendChild(make('div', { style: { position: 'absolute', inset: '8px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' } }));
  art.appendChild(renderCardIcon(entry, Math.max(42, Math.round(width * 0.44))));
  button.appendChild(art);

  const footer = make('div', { style: { position: 'absolute', left: '10px', right: '10px', bottom: opts.actionText ? '36px' : '10px', display: 'flex', flexDirection: 'column', gap: '4px' } });
  footer.appendChild(make('div', { text: String(entry?.name || 'Card'), style: {
    fontSize: '12px', lineHeight: '1.08', fontWeight: '800', color: '#fff3d3',
    textShadow: '0 1px 10px rgba(0,0,0,0.46)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  } }));
  footer.appendChild(make('div', { text: '★'.repeat(Math.max(1, Number(entry?.currentStars || 1) || 1)), style: { fontSize: '11px', color: '#ffe7a8', letterSpacing: '0.08em', textAlign: 'center' } }));
  button.appendChild(footer);
  root.appendChild(button);

  if (opts.actionText) {
    const actionBtn = make('button', { className: 'btn', type: 'button', text: String(opts.actionText), style: {
      position: 'absolute', left: '6px', right: '6px', bottom: '6px', height: '24px', padding: '0 6px',
      borderRadius: '7px', fontSize: '11px', fontWeight: '800', lineHeight: '24px',
      background: opts.actionDisabled ? 'linear-gradient(180deg, rgba(88,102,124,0.98), rgba(54,66,84,0.98))' : 'linear-gradient(180deg, rgba(118,206,255,0.98), rgba(56,146,214,0.98))',
      border: '1px solid rgba(255,255,255,0.22)', color: '#ffffff', cursor: opts.actionDisabled ? 'default' : 'pointer', opacity: opts.actionDisabled ? '0.7' : '1'
    } });
    actionBtn.disabled = !!opts.actionDisabled;
    if (typeof opts.onAction === 'function') actionBtn.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); opts.onAction(ev); });
    root.appendChild(actionBtn);
  }
  return root;
}

function renderSelectedSkillCardShowcase(entry, activeHero, opts = {}) {
  if (!entry) return null;
  const compact = !!opts.compact;
  const accent = getFrameAccent(entry?.race || 'mecha');
  const biomeMeta = getCardBiomeMeta(entry);
  const biomeEmoji = getBiomeEmoji(entry?.race || 'mecha');
  const evoLine = getCardEvolutionLine(entry);
  const cardWidth = compact ? 96 : 122;
  const cardHeight = compact ? 138 : 188;
  const titleSize = compact ? '15px' : '20px';
  const metaSize = compact ? '10px' : '12px';
  const bodySize = compact ? '11px' : '12px';
  const heroName = String(activeHero?.name || 'Hero');
  const heroShort = heroName.length > 12 ? `${heroName.slice(0, 12)}…` : heroName;
  const box = make('div', { style: {
    padding: compact ? '6px' : '14px',
    borderRadius: compact ? '16px' : '18px',
    border: `1px solid ${accent}66`,
    background: `linear-gradient(180deg, ${accent}18, rgba(18,18,26,0.98) 32%, rgba(10,12,18,0.98))`,
    boxShadow: `0 0 0 1px ${accent}22 inset`,
    display: 'grid',
    gridTemplateColumns: `${cardWidth}px 1fr`,
    gap: compact ? '8px' : '14px',
    alignItems: 'stretch',
  } });
  box.appendChild(renderHeroSkillCard(entry, {
    selected: true,
    width: cardWidth,
    height: cardHeight,
    title: `${entry.name} • ${biomeEmoji}`,
  }));
  const right = make('div', { style: { display: 'flex', flexDirection: 'column', gap: compact ? '7px' : '10px', minWidth: '0' } });
  right.appendChild(make('div', { text: String(entry.name || 'Card'), style: { fontSize: titleSize, fontWeight: '900', color: '#fff1ce', letterSpacing: '0.02em', lineHeight: '1.1' } }));
  right.appendChild(make('div', { text: `${entry.kind === 'skill' ? 'Skill Card' : 'Passive Card'} • ${biomeEmoji} • ${'★'.repeat(Math.max(1, Number(entry.currentStars || 1) || 1))}`, style: { fontSize: metaSize, color: 'rgba(238,245,255,0.84)', textTransform: 'uppercase', letterSpacing: compact ? '0.06em' : '0.10em', lineHeight: '1.3' } }));
  const miniGrid = make('div', { style: { display: 'grid', gridTemplateColumns: compact ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: compact ? '6px' : '8px' } });
  [
    ['LV', `${Math.max(1, Number(entry.level || 1) || 1)}`, `${accent}44`],
    ['COPIES', `${Math.max(0, Number(entry.copiesOwned || 0) || 0)}`, 'rgba(255,216,122,0.24)'],
    ['BIOME', biomeEmoji, `${accent}44`],
    ['HERO', heroShort, `${getFrameAccent(activeHero?.race || 'mecha')}33`],
  ].forEach(([label, value, chipAccent]) => {
    miniGrid.appendChild(make('div', { style: { padding: compact ? '6px 7px' : '8px 9px', borderRadius: compact ? '10px' : '12px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${chipAccent}` } }, [
      make('div', { text: label, style: { fontSize: compact ? '8px' : '10px', color: 'rgba(210,230,255,0.70)', textTransform: 'uppercase', letterSpacing: '0.08em' } }),
      make('div', { text: value, style: { marginTop: compact ? '2px' : '4px', fontSize: compact ? '11px' : '13px', fontWeight: '800', color: '#f6fbff', lineHeight: '1.12', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }),
    ]));
  });
  right.appendChild(miniGrid);
  right.appendChild(make('div', { text: evoLine, style: { fontSize: bodySize, lineHeight: compact ? '1.34' : '1.48', color: 'rgba(232,245,255,0.88)' } }));
  if (Array.isArray(entry?.tags) && entry.tags.length) right.appendChild(make('div', { text: `Focus: ${entry.tags.join(' • ')}`, style: { fontSize: bodySize, lineHeight: compact ? '1.3' : '1.42', color: 'rgba(255,235,188,0.88)' } }));
  if (Array.isArray(entry?.routeTags) && entry.routeTags.length) right.appendChild(make('div', { text: `Route: ${entry.routeTags.join(' • ')}`, style: { fontSize: bodySize, lineHeight: compact ? '1.3' : '1.42', color: 'rgba(210,230,255,0.82)' } }));
  box.appendChild(right);
  return box;
}

function getHeroEquippedCardIds(hero) {
  const ids = [];
  for (const id of Array.isArray(hero?.equippedSkillCards) ? hero.equippedSkillCards : []) ids.push(String(id || '').trim());
  for (const id of Array.isArray(hero?.equippedPassiveCards) ? hero.equippedPassiveCards : []) ids.push(String(id || '').trim());
  return ids.filter(Boolean);
}

function getDefaultCardSelection(state, prog) {
  const activeHero = getActiveHero(prog);
  const equippedIds = getHeroEquippedCardIds(activeHero);
  const cards = listOwnedCardEntries(prog?.accountProfile?.cardCollection, { equippedIds, race: '' });
  const current = getCharacterSelection(state);
  const desired = String(current?.kind === 'card' ? current.key : '').trim();
  if (desired && cards.some((entry) => entry.cardId === desired)) return { kind: 'card', key: desired };
  const next = cards[0]?.cardId || '';
  return next ? { kind: 'card', key: next } : { kind: 'cardHint', key: 'cards' };
}

function renderHeroLoadoutSummaryCard(prog, activeHero) {
  const loadout = getHeroLoadoutEntries(prog, activeHero);
  const skillNames = loadout.skillCards.map((card) => `${card.name} Lv${Math.max(1, card.level | 0)}`);
  const passiveNames = loadout.passiveCards.map((card) => `${card.name} Lv${Math.max(1, card.level | 0)}`);
  return renderSimpleInfoCard('Active Hero Loadout', [
    `Hero: ${String(activeHero?.name || 'Hero')} • Biome ${(ESSENCE_META[activeHero?.race || 'mecha'] || ESSENCE_META.mecha).label}`,
    `Skill cards: ${loadout.skillCards.length}/6 • ${skillNames.length ? skillNames.join(' • ') : 'none yet'}`,
    `Passive cards: ${loadout.passiveCards.length}/6 • ${passiveNames.length ? passiveNames.join(' • ') : 'none yet'}`,
    'This stage treats equipped cards as the hero loadout source and projects them back into the legacy hub/combat bridge.',
  ], { accent: `${getFrameAccent(activeHero?.race || 'mecha')}55`, background: 'linear-gradient(180deg, rgba(18,24,36,0.98), rgba(10,13,20,0.98))' });
}

function renderCardDetailCard(state, prog, entry, activeHero, opts = {}) {
  const includeShowcase = opts?.includeShowcase !== false;
  const wrap = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } });
  if (!entry) {
    wrap.appendChild(renderSimpleInfoCard('Card Details', ['No owned card selected yet.', 'Card level up now exists, but you need to select an owned card first.'], { accent: 'rgba(143,216,255,0.28)' }));
    return wrap;
  }
  const accent = getFrameAccent(entry.race || 'mecha');
  const equippedSkillSet = new Set(Array.isArray(activeHero?.equippedSkillCards) ? activeHero.equippedSkillCards : []);
  const equippedPassiveSet = new Set(Array.isArray(activeHero?.equippedPassiveCards) ? activeHero.equippedPassiveCards : []);
  const isEquipped = equippedSkillSet.has(entry.cardId) || equippedPassiveSet.has(entry.cardId);
  const def = getCardDefById(entry.cardId) || entry;
  const evoLine = getCardEvolutionLine(entry);
  if (includeShowcase) wrap.appendChild(renderSelectedSkillCardShowcase(entry, activeHero));
  const detailLines = [
    `${entry.kind === 'skill' ? 'Skill Card' : 'Passive Card'} • ${(ESSENCE_META[entry.race] || ESSENCE_META.mecha).label}`,
    `Stars: ${entry.starsText || '★'.repeat(Math.max(1, entry.currentStars | 0))} (${Math.max(1, entry.currentStars | 0)}/${Math.max(1, def.maxStars || entry.currentStars || 1)})`,
    `Level: ${Math.max(1, entry.level | 0)} / ${getCardLevelCap(entry)} • Copies Owned: ${Math.max(0, entry.copiesOwned | 0)} • Shards: ${Math.max(0, shardCount | 0)}`,
    `Base rarity: ${Math.max(1, def.baseStars || entry.baseStars || 1)}★ • Max stars: ${Math.max(1, def.maxStars || entry.currentStars || 1)}★`,
    `Status: ${isEquipped ? 'equipped on active hero' : 'stored in collection'}`,
    entry.kind === 'skill' ? `Legacy source skill: ${String(entry.sourceKey || '')}` : `Legacy source passive: ${String(entry.sourceKey || '')}`,
    evoLine,
    Array.isArray(entry.tags) && entry.tags.length ? `Tags: ${entry.tags.join(' • ')}` : '',
    Array.isArray(entry.routeTags) && entry.routeTags.length ? `Route: ${entry.routeTags.join(' • ')}` : '',
    String(def.summary || ''),
  ];
  wrap.appendChild(renderSimpleInfoCard(entry.name, detailLines, { accent: `${accent}66`, background: `linear-gradient(180deg, ${accent}18, rgba(10,13,20,0.98))` }));

  const loadout = getHeroLoadoutActionPreview(prog, entry.cardId, activeHero);
  const loadoutCard = renderSimpleInfoCard('Hero Loadout', [
    `Action: ${loadout?.action === 'unequip' ? 'currently equipped on active hero' : 'stored in collection'}`,
    `Slots: ${Math.max(0, loadout?.slotUsed | 0)}/${Math.max(1, loadout?.slotLimit | 0)} ${entry.kind === 'skill' ? 'for active skill cards' : 'for passive cards'}`,
    `Copies free for this hero: ${Math.max(0, loadout?.freeCopies | 0)} • Reserved by other heroes: ${Math.max(0, loadout?.reservedCopiesElsewhere | 0)}`,
    loadout?.ok
      ? (loadout?.canEquip ? 'Ready: equip will add this card to the active hero and immediately refresh the active combat projection.' : 'Ready: unequip will remove this card from the active hero and immediately refresh the active combat projection.')
      : `Blocked: ${String(loadout?.reason || 'requirements not met')}`,
    loadout?.protectedStarter ? 'Protected rule: the hero biome starter card stays equipped for now because the old runtime still needs a stable compatibility bridge.' : 'Shared collection rule: another hero can use a card only if you own a free copy that is not already reserved elsewhere.',
  ], { accent: `${accent}55`, background: 'rgba(14,20,30,0.95)' });
  const loadoutRow = make('div', { style: { marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr', gap: '8px' } });
  const loadoutBtnText = loadout?.action === 'unequip'
    ? (loadout?.canUnequip ? 'Unequip from Active Hero' : 'Unequip Blocked')
    : (loadout?.canEquip ? 'Equip on Active Hero' : 'Equip Blocked');
  const loadoutBtn = make('button', { className: 'btn', type: 'button', text: loadoutBtnText, style: { padding: '10px 12px', opacity: (loadout?.canEquip || loadout?.canUnequip) ? '1' : '0.6' } });
  loadoutBtn.disabled = !(loadout?.canEquip || loadout?.canUnequip);
  loadoutBtn.addEventListener('click', () => {
    const result = loadout?.action === 'unequip'
      ? unequipCardFromHero(prog, entry.cardId, activeHero)
      : equipCardOnHero(prog, entry.cardId, activeHero);
    if (result?.ok) {
      if (typeof persistHubState === 'function') persistHubState(state, result.message || (entry.name + ' loadout updated.'));
      else flashHeroMenuMessage(result.message || (entry.name + ' loadout updated.'));
    } else {
      flashHeroMenuMessage(result?.message || 'Loadout action blocked.');
    }
    renderCharacterMenu(state, true);
  });
  loadoutRow.appendChild(loadoutBtn);
  loadoutCard.appendChild(loadoutRow);
  wrap.appendChild(loadoutCard);

  const preview = getCardUpgradePreview(prog, entry.cardId);
  const evolution = getCardEvolutionPreview(prog, entry.cardId);
  const crafting = getCardCraftPreview(prog, entry.cardId);
  const dismantle = getCardDismantlePreview(prog, entry.cardId);
  const upgradeCard = renderSimpleInfoCard('Level Up', [
    `Cost: ${Math.max(0, preview?.cost?.gold | 0)} Gold • ${Math.max(0, preview?.cost?.essence | 0)} ${(ESSENCE_META[entry.race] || ESSENCE_META.mecha).label} Essence • ${Math.max(1, preview?.cost?.feederCopies | 0)} same-biome feeder`,
    `Wallet: ${Math.max(0, preview?.availableGold | 0)} Gold • ${Math.max(0, preview?.availableEssence | 0)} Essence`,
    `Feeders free: ${Math.max(0, preview?.availableFeederCopies | 0)} copy/copies across ${Math.max(0, preview?.feederCandidates?.length | 0)} card(s)`,
    preview?.feeder ? `Suggested feeder: ${String(preview.feeder.name || preview.feeder.sourceKey || 'Card')} • Lv ${Math.max(1, preview.feeder.level | 0)} • ${'★'.repeat(Math.max(1, preview.feeder.currentStars | 0))} • free x${Math.max(0, preview.feeder.availableCopies | 0)}` : 'Suggested feeder: none yet',
    preview?.canUpgrade ? `Preview: Level ${Math.max(1, preview.target?.level | 0)} → ${Math.max(1, preview.nextLevel | 0)}` : `Blocked: ${String(preview?.reason || 'requirements not met')}`,
    'Auto-feeder rule for this stage: the system only consumes free same-biome copies that are not currently reserved by any hero loadout.',
  ], { accent: 'rgba(255,216,122,0.28)', background: 'rgba(18,22,33,0.94)' });
  const actionRow = make('div', { style: { marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr', gap: '8px' } });
  const upgradeBtn = make('button', { className: 'btn', type: 'button', text: preview?.canUpgrade ? 'Upgrade +1 Level' : 'Upgrade Blocked', style: { padding: '10px 12px', opacity: preview?.canUpgrade ? '1' : '0.6' } });
  upgradeBtn.disabled = !preview?.canUpgrade;
  upgradeBtn.addEventListener('click', () => {
    const result = levelUpCardOnce(prog, entry.cardId);
    if (result?.ok) {
      if (typeof persistHubState === 'function') persistHubState(state, result.message || (entry.name + ' upgraded.'));
      else flashHeroMenuMessage(result.message || (entry.name + ' upgraded.'));
    } else {
      flashHeroMenuMessage(result?.message || 'Level up blocked.');
    }
    renderCharacterMenu(state, true);
  });
  actionRow.appendChild(upgradeBtn);
  upgradeCard.appendChild(actionRow);
  wrap.appendChild(upgradeCard);

  const evolutionCard = renderSimpleInfoCard('Star Evolution', [
    `Cost: ${Math.max(0, evolution?.cost?.gold | 0)} Gold • ${Math.max(0, evolution?.cost?.essence | 0)} ${(ESSENCE_META[entry.race] || ESSENCE_META.mecha).label} Essence • ${Math.max(0, evolution?.cost?.duplicates | 0)} exact duplicate(s)`,
    `Wallet: ${Math.max(0, evolution?.availableGold | 0)} Gold • ${Math.max(0, evolution?.availableEssence | 0)} Essence`,
    `Exact duplicates free: ${Math.max(0, evolution?.availableDuplicates | 0)} • Protected copies: ${Math.max(1, evolution?.protectedCopies | 0)}`,
    evolution?.canEvolve ? `Preview: ${'★'.repeat(Math.max(1, evolution.currentStars | 0))} → ${'★'.repeat(Math.max(1, evolution.nextStars | 0))}` : `Blocked: ${String(evolution?.reason || 'requirements not met')}`,
    'Evolution only consumes exact duplicate copies of this same card. One protected owned copy always stays behind, and equipped copies remain protected by hero loadouts.',
  ], { accent: 'rgba(143,216,255,0.28)', background: 'rgba(15,24,34,0.94)' });
  const evoRow = make('div', { style: { marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr', gap: '8px' } });
  const evoBtn = make('button', { className: 'btn', type: 'button', text: evolution?.canEvolve ? 'Evolve +1 Star' : 'Evolution Blocked', style: { padding: '10px 12px', opacity: evolution?.canEvolve ? '1' : '0.6' } });
  evoBtn.disabled = !evolution?.canEvolve;
  evoBtn.addEventListener('click', () => {
    const result = evolveCardStarsOnce(prog, entry.cardId);
    if (result?.ok) {
      if (typeof persistHubState === 'function') persistHubState(state, result.message || (entry.name + ' evolved.'));
      else flashHeroMenuMessage(result.message || (entry.name + ' evolved.'));
    } else {
      flashHeroMenuMessage(result?.message || 'Evolution blocked.');
    }
    renderCharacterMenu(state, true);
  });
  evoRow.appendChild(evoBtn);
  evolutionCard.appendChild(evoRow);
  wrap.appendChild(evolutionCard);

  const forgeCard = renderSimpleInfoCard('Card Forge', [
    `Cost: ${Math.max(0, crafting?.cost?.gold | 0)} Gold • ${Math.max(0, crafting?.cost?.essence | 0)} ${(ESSENCE_META[entry.race] || ESSENCE_META.mecha).label} Essence • ${Math.max(0, crafting?.cost?.dust | 0)} ${(ESSENCE_META[entry.race] || ESSENCE_META.mecha).label} Dust • ${Math.max(0, crafting?.cost?.shards | 0)} shards`,
    `Wallet: ${Math.max(0, crafting?.availableGold | 0)} Gold • ${Math.max(0, crafting?.availableEssence | 0)} Essence • ${Math.max(0, crafting?.availableDust | 0)} Dust • ${Math.max(0, crafting?.availableShards | 0)} shards`,
    crafting?.canCraft ? `Preview: Copies ${Math.max(0, entry.copiesOwned | 0)} → ${Math.max(0, crafting?.nextCopiesOwned | 0)}` : `Blocked: ${String(crafting?.reason || 'requirements not met')}`,
    'Forge rule for this stage: shards now have a direct long-term purpose. Enough exact shards plus same-biome dust/essence can rebuild one more duplicate of this card for loadout depth or future star evolution.',
  ], { accent: 'rgba(190,164,255,0.30)', background: 'rgba(17,14,28,0.95)' });
  const forgeRow = make('div', { style: { marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr', gap: '8px' } });
  const forgeBtn = make('button', { className: 'btn', type: 'button', text: crafting?.canCraft ? 'Forge +1 Exact Copy' : 'Forge Blocked', style: { padding: '10px 12px', opacity: crafting?.canCraft ? '1' : '0.6' } });
  forgeBtn.disabled = !crafting?.canCraft;
  forgeBtn.addEventListener('click', () => {
    const result = craftCardCopyFromShards(prog, entry.cardId);
    if (result?.ok) {
      if (typeof persistHubState === 'function') persistHubState(state, result.message || (entry.name + ' forged.'));
      else flashHeroMenuMessage(result.message || (entry.name + ' forged.'));
    } else {
      flashHeroMenuMessage(result?.message || 'Forge blocked.');
    }
    renderCharacterMenu(state, true);
  });
  forgeRow.appendChild(forgeBtn);
  forgeCard.appendChild(forgeRow);
  wrap.appendChild(forgeCard);

  const dustLabel = `${(ESSENCE_META[entry.race] || ESSENCE_META.mecha).label} Dust`;
  const dismantleCard = renderSimpleInfoCard('Dismantle', [
    `Rewards per copy: +${Math.max(0, dismantle?.rewards?.dust | 0)} ${dustLabel} • +${Math.max(0, dismantle?.rewards?.essence | 0)} ${(ESSENCE_META[entry.race] || ESSENCE_META.mecha).label} Essence`,
    `Wallet after routing: ${Math.max(0, dismantle?.walletDust | 0)} Dust • ${Math.max(0, dismantle?.walletEssence | 0)} Essence`,
    `Free copies available: ${Math.max(0, dismantle?.availableCopies | 0)} • Protected copies: ${Math.max(1, dismantle?.protectedCopies | 0)}`,
    dismantle?.canDismantle ? 'Preview: dismantle consumes exactly 1 free copy and keeps protected/equipped copies safe.' : `Blocked: ${String(dismantle?.reason || 'requirements not met')}`,
    'Dismantle rule for this stage: only copies above the protected floor can be broken down. The last owned copy and any equipped copies stay locked.',
  ], { accent: 'rgba(255,154,122,0.28)', background: 'rgba(24,16,18,0.94)' });
  const dismantleRow = make('div', { style: { marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr', gap: '8px' } });
  const dismantleBtn = make('button', { className: 'btn', type: 'button', text: dismantle?.canDismantle ? 'Dismantle 1 Free Copy' : 'Dismantle Blocked', style: { padding: '10px 12px', opacity: dismantle?.canDismantle ? '1' : '0.6' } });
  dismantleBtn.disabled = !dismantle?.canDismantle;
  dismantleBtn.addEventListener('click', () => {
    const result = dismantleCardCopyOnce(prog, entry.cardId);
    if (result?.ok) {
      if (typeof persistHubState === 'function') persistHubState(state, result.message || (entry.name + ' dismantled.'));
      else flashHeroMenuMessage(result.message || (entry.name + ' dismantled.'));
    } else {
      flashHeroMenuMessage(result?.message || 'Dismantle blocked.');
    }
    renderCharacterMenu(state, true);
  });
  dismantleRow.appendChild(dismantleBtn);
  dismantleCard.appendChild(dismantleRow);
  wrap.appendChild(dismantleCard);
  return wrap;
}


function renderHeroCardToolbar(state, heroBiome = 'mecha') {
  const view = getHeroCardViewState(state);
  const wrap = make('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' } });
  const kindCard = renderSimpleInfoCard('Filter', [
    `Mode: ${view.kindFilter.toUpperCase()}`,
    'SKILL is the default archive view now. PASSIVE shows support cards, while EQUIPPED isolates the cards already bound to the active hero.',
  ], { accent: 'rgba(143,216,255,0.24)' });
  const kindRow = make('div', { className: 'row', style: { gap: '6px', marginTop: '10px', flexWrap: 'wrap' } });
  [['all', 'All'], ['skill', 'Skills'], ['passive', 'Passives'], ['equipped', 'Equipped']].forEach(([key, label]) => {
    const btn = make('button', { className: 'btn', type: 'button', text: label, style: { padding: '7px 10px', opacity: view.kindFilter === key ? '1' : '0.84' } });
    btn.addEventListener('click', () => { setHeroCardViewState(state, { kindFilter: key }); renderCharacterMenu(state, true); });
    kindRow.appendChild(btn);
  });
  kindCard.appendChild(kindRow);
  wrap.appendChild(kindCard);

  const raceCard = renderSimpleInfoCard('Biome Filter', [
    `Mode: ${view.raceFilter === 'hero' ? 'ACTIVE HERO RACE' : String(view.raceFilter || 'all').toUpperCase()}`,
    'Use HERO to focus on same-biome synergy cards. ALL keeps the full account collection visible.',
  ], { accent: `${getFrameAccent(heroBiome)}33`, background: `${getFrameAccent(heroBiome)}10` });
  const raceRow = make('div', { className: 'row', style: { gap: '6px', marginTop: '10px', flexWrap: 'wrap' } });
  [['all', 'All'], ['hero', 'Hero Biome'], ['mecha', 'Mecha'], ['electric', 'Electric'], ['fire', 'Fire'], ['ice', 'Ice'], ['dark', 'Dark'], ['light', 'Light']].forEach(([key, label]) => {
    const btn = make('button', { className: 'btn', type: 'button', text: label, style: { padding: '7px 10px', opacity: view.raceFilter === key ? '1' : '0.84' } });
    btn.addEventListener('click', () => { setHeroCardViewState(state, { raceFilter: key }); renderCharacterMenu(state, true); });
    raceRow.appendChild(btn);
  });
  raceCard.appendChild(raceRow);
  wrap.appendChild(raceCard);

  const sortCard = renderSimpleInfoCard('Sort', [
    `Order: ${view.sortBy.toUpperCase()}`,
    'POWER prioritizes equipped + same-biome + higher level cards. NAME, COPIES and BIOME help browse the gallery faster.',
  ], { accent: 'rgba(255,216,122,0.28)', background: 'rgba(255,216,122,0.08)' });
  const sortRow = make('div', { className: 'row', style: { gap: '6px', marginTop: '10px', flexWrap: 'wrap' } });
  [['power', 'Power'], ['name', 'Name'], ['copies', 'Copies'], ['race', 'Biome']].forEach(([key, label]) => {
    const btn = make('button', { className: 'btn', type: 'button', text: label, style: { padding: '7px 10px', opacity: view.sortBy === key ? '1' : '0.84' } });
    btn.addEventListener('click', () => { setHeroCardViewState(state, { sortBy: key }); renderCharacterMenu(state, true); });
    sortRow.appendChild(btn);
  });
  sortCard.appendChild(sortRow);
  wrap.appendChild(sortCard);
  return wrap;
}

function renderHeroCardLoadoutTools(state, prog, activeHero) {
  const wrap = renderSimpleInfoCard('Loadout Tools', [
    `Active hero: ${String(activeHero?.name || 'Hero')} • ${(ESSENCE_META[activeHero?.race || 'mecha'] || ESSENCE_META.mecha).label}`,
    'Optimize rebuilds the current hero around the strongest same-biome cards first. Fill Empty keeps current picks and only plugs open slots with the best remaining cards.',
  ], { accent: `${getFrameAccent(activeHero?.race || 'mecha')}55`, background: 'rgba(14,18,27,0.96)' });
  const row = make('div', { className: 'row', style: { gap: '8px', marginTop: '10px', flexWrap: 'wrap' } });
  const optimizeBtn = make('button', { className: 'btn', type: 'button', text: 'Optimize Same-Biome', style: { padding: '8px 10px' } });
  optimizeBtn.addEventListener('click', () => {
    const result = optimizeHeroLoadout(prog, activeHero, { preferRace: true });
    if (result?.ok) {
      if (typeof persistHubState === 'function') persistHubState(state, result.message || 'Hero loadout optimized.');
      else flashHeroMenuMessage(result.message || 'Hero loadout optimized.');
    } else flashHeroMenuMessage(result?.message || 'Optimization blocked.');
    renderCharacterMenu(state, true);
  });
  row.appendChild(optimizeBtn);
  const fillBtn = make('button', { className: 'btn', type: 'button', text: 'Fill Empty Slots', style: { padding: '8px 10px' } });
  fillBtn.addEventListener('click', () => {
    const result = fillHeroLoadoutSlots(prog, activeHero, { preferRace: true });
    if (result?.ok) {
      if (typeof persistHubState === 'function') persistHubState(state, result.message || 'Empty slots filled.');
      else flashHeroMenuMessage(result.message || 'Empty slots filled.');
    } else flashHeroMenuMessage(result?.message || 'Fill blocked.');
    renderCharacterMenu(state, true);
  });
  row.appendChild(fillBtn);
  wrap.appendChild(row);
  return wrap;
}

function renderHeroLoadoutPresetTools(state, prog, activeHero) {
  const presets = getHeroLoadoutPresets(activeHero);
  const hasCheckpoint = !!(activeHero?.heroExpeditionState?.hasCheckpoint);
  const wrap = renderSimpleInfoCard('Loadout Presets', [
    `Active hero: ${String(activeHero?.name || 'Hero')} • ${(ESSENCE_META[activeHero?.race || 'mecha'] || ESSENCE_META.mecha).label}`,
    hasCheckpoint ? 'Preset save/apply is locked while this hero owns a saved expedition checkpoint.' : 'Save the current equipped card shell into one of 3 preset slots, then re-apply it later with one click.',
  ], { accent: 'rgba(186,255,208,0.28)', background: 'rgba(12,20,18,0.96)' });
  const grid = make('div', { style: { display: 'grid', gridTemplateColumns: '1fr', gap: '8px', marginTop: '10px' } });
  presets.forEach((preset, idx) => {
    const card = make('div', { style: { padding: '10px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' } });
    card.appendChild(make('div', { text: `Preset ${idx + 1} • ${(ESSENCE_META[preset?.race || activeHero?.race || 'mecha'] || ESSENCE_META.mecha).label}`, style: { fontSize: '12px', fontWeight: '800', color: '#fff0c8', letterSpacing: '0.04em' } }));
    const input = make('input', { type: 'text', value: getHeroPresetDraftName(state, idx, preset?.name || ''), maxlength: '24', placeholder: `Preset ${idx + 1} name`, style: { width: '100%', marginTop: '8px', padding: '8px 10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(7,10,16,0.82)', color: '#eef7ff', outline: 'none' } });
    input.addEventListener('input', () => setHeroPresetDraftName(state, idx, input.value));
    card.appendChild(input);
    card.appendChild(make('div', { text: `${Array.isArray(preset?.equippedSkillCards) ? preset.equippedSkillCards.length : 0} skill • ${Array.isArray(preset?.equippedPassiveCards) ? preset.equippedPassiveCards.length : 0} passive${preset?.updatedAt ? ` • saved ${new Date(preset.updatedAt).toLocaleDateString()}` : ''}`, style: { marginTop: '8px', fontSize: '11px', lineHeight: '1.4', color: 'rgba(228,240,255,0.84)' } }));
    const row = make('div', { className: 'row', style: { gap: '8px', marginTop: '8px', flexWrap: 'wrap' } });
    const saveBtn = make('button', { className: 'btn', type: 'button', text: 'Save Current', style: { padding: '8px 10px', opacity: hasCheckpoint ? '0.55' : '1' } });
    saveBtn.disabled = hasCheckpoint;
    saveBtn.addEventListener('click', () => {
      const result = saveHeroLoadoutPreset(prog, activeHero, idx, { name: getHeroPresetDraftName(state, idx, preset?.name || '') });
      if (result?.ok) {
        setHeroPresetDraftName(state, idx, result.preset?.name || '');
        if (typeof persistHubState === 'function') persistHubState(state, result.message || 'Preset saved.');
        else flashHeroMenuMessage(result.message || 'Preset saved.');
      } else flashHeroMenuMessage(result?.message || 'Preset save blocked.');
      renderCharacterMenu(state, true);
    });
    row.appendChild(saveBtn);
    const applyBtn = make('button', { className: 'btn', type: 'button', text: 'Apply Preset', style: { padding: '8px 10px', opacity: hasCheckpoint ? '0.55' : '1' } });
    applyBtn.disabled = hasCheckpoint;
    applyBtn.addEventListener('click', () => {
      const result = applyHeroLoadoutPreset(prog, activeHero, idx);
      if (result?.ok) {
        if (typeof persistHubState === 'function') persistHubState(state, result.message || 'Preset applied.');
        else flashHeroMenuMessage(result.message || 'Preset applied.');
      } else flashHeroMenuMessage(result?.message || 'Preset apply blocked.');
      renderCharacterMenu(state, true);
    });
    row.appendChild(applyBtn);
    card.appendChild(row);
    grid.appendChild(card);
  });
  wrap.appendChild(grid);
  return wrap;
}

function renderHeroBatchCardTools(state, prog, activeHero, filteredCards = []) {
  const preview = getMassDismantlePreview(prog, filteredCards.map((entry) => entry.cardId));
  const wrap = renderSimpleInfoCard('Batch Card Tools', [
    `Current view: ${Math.max(0, filteredCards.length | 0)} card entries • Hero ${(ESSENCE_META[activeHero?.race || 'mecha'] || ESSENCE_META.mecha).label}`,
    preview.ok ? `Mass dismantle preview: ${preview.totalCopies} free copies across ${preview.totalCards} card types → +${preview.totalDust} Dust • +${preview.totalEssence} Essence.` : `Mass dismantle preview: ${String(preview.reason || 'Nothing safe to dismantle in current view.')}`,
    'Batch dismantle only touches free copies from the current filtered card view. Protected starter copies and any equipped/reserved copies stay safe.',
  ], { accent: 'rgba(255,154,122,0.26)', background: 'rgba(24,14,16,0.96)' });
  const row = make('div', { className: 'row', style: { gap: '8px', marginTop: '10px', flexWrap: 'wrap' } });
  const btn = make('button', { className: 'btn', type: 'button', text: preview.ok ? 'Dismantle Filtered Free Copies' : 'Batch Dismantle Blocked', style: { padding: '8px 10px', opacity: preview.ok ? '1' : '0.55' } });
  btn.disabled = !preview.ok;
  btn.addEventListener('click', () => {
    const result = dismantleCardsBatch(prog, filteredCards.map((entry) => entry.cardId));
    if (result?.ok) {
      if (typeof persistHubState === 'function') persistHubState(state, result.message || 'Batch dismantle complete.');
      else flashHeroMenuMessage(result.message || 'Batch dismantle complete.');
    } else flashHeroMenuMessage(result?.message || 'Batch dismantle blocked.');
    renderCharacterMenu(state, true);
  });
  row.appendChild(btn);
  wrap.appendChild(row);
  return wrap;
}


function renderHeroCardsSubtabBar(state) {
  const active = getHeroCardsSubtab(state);
  const wrap = make('div', { style: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '8px',
    padding: '8px',
    borderRadius: '18px',
    border: '1px solid rgba(255,214,122,0.18)',
    background: 'linear-gradient(180deg, rgba(29,23,16,0.98), rgba(8,12,18,0.96))',
    boxShadow: '0 0 0 1px rgba(255,214,122,0.08) inset',
  } });
  [['collection', 'Archive'], ['loadout', 'Deck'], ['upgrade', 'Enhance']].forEach(([key, label]) => {
    const selected = active === key;
    const btn = make('button', {
      className: 'btn',
      type: 'button',
      text: label,
      style: {
        padding: '10px 12px',
        borderRadius: '14px',
        border: `1px solid ${selected ? 'rgba(255,216,122,0.42)' : 'rgba(255,255,255,0.10)'}`,
        background: selected ? 'linear-gradient(180deg, rgba(102,68,18,0.98), rgba(58,34,16,0.98))' : 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
        color: selected ? '#fff4cf' : '#d8e6ff',
        fontWeight: '800',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      },
    });
    btn.addEventListener('click', () => {
      setHeroCardsSubtab(state, key);
      renderCharacterMenu(state, true);
    });
    wrap.appendChild(btn);
  });
  return wrap;
}

function renderHeroCardCompactToolbar(state, heroBiome = 'mecha') {
  const view = getHeroCardViewState(state);
  const accent = getFrameAccent(heroBiome);
  const wrap = make('div', { style: {
    padding: '10px', borderRadius: '16px', border: `1px solid ${accent}28`, background: 'linear-gradient(180deg, rgba(15,19,28,0.98), rgba(8,12,18,0.96))',
    boxShadow: `0 0 0 1px ${accent}12 inset`, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px'
  } });
  const makeSegment = (title, items, activeValue, setter) => {
    const seg = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '0' } });
    seg.appendChild(make('div', { text: title, style: { fontSize: '10px', fontWeight: '800', color: 'rgba(214,232,255,0.72)', letterSpacing: '0.12em', textTransform: 'uppercase' } }));
    const pills = make('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', minWidth: '0' } });
    items.forEach(([value, label]) => {
      const selected = activeValue === value;
      const btn = make('button', {
        className: 'btn', type: 'button', text: label,
        style: {
          padding: '6px 8px', fontSize: '10px', borderRadius: '10px', minWidth: '0',
          border: `1px solid ${selected ? accent + '66' : 'rgba(255,255,255,0.10)'}`,
          background: selected ? `${accent}2f` : 'rgba(255,255,255,0.04)',
          color: selected ? '#fff4cf' : '#dce8ff', opacity: selected ? '1' : '0.84'
        }
      });
      btn.addEventListener('click', () => {
        setter(value);
        renderCharacterMenu(state, true);
      });
      pills.appendChild(btn);
    });
    seg.appendChild(pills);
    wrap.appendChild(seg);
  };
  makeSegment('Type', [['skill', 'Skills'], ['passive', 'Passives'], ['equipped', 'Equipped'], ['all', 'All']], view.kindFilter, (value) => setHeroCardViewState(state, { kindFilter: value }));
  makeSegment('Biome', [['hero', 'Hero'], ['all', 'All'], ['mecha', 'Mecha'], ['electric', 'Electric'], ['fire', 'Fire'], ['ice', 'Ice'], ['dark', 'Dark'], ['light', 'Light']], view.raceFilter, (value) => setHeroCardViewState(state, { raceFilter: value }));
  makeSegment('Sort', [['power', 'Power'], ['name', 'Name'], ['copies', 'Copies'], ['race', 'Biome']], view.sortBy, (value) => setHeroCardViewState(state, { sortBy: value }));
  return wrap;
}

function paginateHeroCards(state, cards = [], pageSize = 12) {
  const total = Array.isArray(cards) ? cards.length : 0;
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize | 0)));
  const page = clampHeroCardPage(state, pages);
  const start = page * Math.max(1, pageSize | 0);
  return { page, pages, pageSize, items: (cards || []).slice(start, start + Math.max(1, pageSize | 0)), total };
}

function renderHeroGalleryPager(state, pageInfo) {
  const wrap = make('div', { style: { display: 'grid', gridTemplateColumns: '44px 1fr 44px', gap: '8px', alignItems: 'center' } });
  const prev = make('button', { className: 'btn', type: 'button', text: '◀', style: { padding: '8px 0' } });
  prev.disabled = !pageInfo || pageInfo.page <= 0;
  prev.style.opacity = prev.disabled ? '0.5' : '1';
  prev.addEventListener('click', () => { setHeroCardPage(state, Math.max(0, pageInfo.page - 1)); renderCharacterMenu(state, true); });
  const mid = make('div', { style: { textAlign: 'center', padding: '8px 10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.03)', fontSize: '11px', color: 'rgba(238,245,255,0.86)', fontWeight: '700', letterSpacing: '0.04em' } });
  mid.textContent = `PAGE ${Math.max(1, (pageInfo?.page || 0) + 1)} / ${Math.max(1, pageInfo?.pages || 1)} • ${Math.max(0, pageInfo?.total || 0)} CARDS`;
  const next = make('button', { className: 'btn', type: 'button', text: '▶', style: { padding: '8px 0' } });
  next.disabled = !pageInfo || pageInfo.page >= (pageInfo.pages - 1);
  next.style.opacity = next.disabled ? '0.5' : '1';
  next.addEventListener('click', () => { setHeroCardPage(state, Math.min(pageInfo.pages - 1, pageInfo.page + 1)); renderCharacterMenu(state, true); });
  wrap.appendChild(prev); wrap.appendChild(mid); wrap.appendChild(next);
  return wrap;
}


function renderHeroDeckSlot(entry, state, selectedEntry, label = '', opts = {}) {
  const accent = opts.accent || getFrameAccent(entry?.race || opts.heroBiome || 'mecha');
  const selected = selectedEntry?.cardId && entry?.cardId && selectedEntry.cardId === entry.cardId;
  const size = Math.max(72, Number(opts.size || 82) || 82);
  const isEmpty = !entry;
  const btn = make('button', {
    type: 'button',
    title: isEmpty ? `${label || 'Slot'} • Empty` : `${entry.name} • ${entry.kind}`,
    style: {
      width: `${size}px`,
      minWidth: `${size}px`,
      height: `${size}px`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4px',
      borderRadius: '16px',
      border: `1px solid ${selected ? accent : (isEmpty ? 'rgba(255,255,255,0.12)' : accent + '88')}`,
      background: isEmpty ? 'linear-gradient(180deg, rgba(12,16,25,0.96), rgba(6,10,16,0.96))' : `linear-gradient(180deg, ${accent}22, rgba(16,18,24,0.98))`,
      boxShadow: selected ? `0 0 0 2px ${accent}44 inset, 0 6px 14px ${accent}22` : `0 0 0 1px ${isEmpty ? 'rgba(255,255,255,0.06)' : accent + '22'} inset`,
      color: '#eef6ff',
      cursor: isEmpty ? 'default' : 'pointer',
      position: 'relative',
      padding: '6px',
      textAlign: 'center',
    },
  });
  if (!isEmpty) btn.addEventListener('click', () => selectCharacterEntry(state, { kind: 'card', key: entry.cardId }));
  if (label) btn.appendChild(make('div', { text: label, style: { position: 'absolute', top: '5px', left: '0', right: '0', fontSize: '9px', color: 'rgba(214,232,255,0.58)', letterSpacing: '0.10em', textTransform: 'uppercase' } }));
  if (isEmpty) {
    btn.appendChild(make('div', { text: '+', style: { fontSize: '22px', lineHeight: '1', fontWeight: '700', color: 'rgba(255,255,255,0.26)' } }));
    btn.appendChild(make('div', { text: 'Empty', style: { fontSize: '10px', color: 'rgba(214,232,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.08em' } }));
    return btn;
  }
  const iconWrap = make('div', { style: { width: '38px', height: '38px', borderRadius: '12px', border: `1px solid ${accent}66`, background: `${accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 0 1px ${accent}22 inset` } });
  const icon = renderCardIcon(entry, 24);
  if (icon) iconWrap.appendChild(icon);
  btn.appendChild(iconWrap);
  btn.appendChild(make('div', { text: String(entry.name || 'Card'), style: { fontSize: '10px', lineHeight: '1.15', fontWeight: '700', color: '#fff3d4', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }));
  btn.appendChild(make('div', { text: `Lv ${Math.max(1, Number(entry.level || 1) || 1)} • ${'★'.repeat(Math.max(1, Number(entry.currentStars || 1) || 1))}`.slice(0, 12), style: { fontSize: '9px', color: 'rgba(220,235,255,0.72)' } }));
  return btn;
}

function renderHeroDeckBoard(state, prog, activeHero, selectedEntry, opts = {}) {
  const heroBiome = String(activeHero?.race || 'mecha');
  const accent = getFrameAccent(heroBiome);
  const portrait = !!opts.portrait;
  const skillsOnly = !!opts.skillsOnly;
  const compact = !!opts.compact;
  const slotSize = portrait ? (compact ? 68 : 78) : (compact ? 74 : 84);
  const loadout = getHeroLoadoutEntries(prog, activeHero);
  const skillCards = Array.isArray(loadout?.skillCards) ? loadout.skillCards.slice(0, 6) : [];
  const passiveCards = Array.isArray(loadout?.passiveCards) ? loadout.passiveCards.slice(0, 6) : [];
  while (skillCards.length < 6) skillCards.push(null);
  while (passiveCards.length < 6) passiveCards.push(null);

  const board = make('div', { style: {
    padding: compact ? '10px' : (portrait ? '12px' : '14px'),
    borderRadius: compact ? '18px' : '22px',
    border: `1px solid ${accent}44`,
    background: 'linear-gradient(180deg, rgba(9,13,22,0.98), rgba(5,8,14,0.98))',
    boxShadow: `0 0 0 1px ${accent}16 inset, 0 18px 34px rgba(0,0,0,0.26)`,
    display: 'grid',
    gridTemplateRows: skillsOnly ? '1fr' : (portrait ? 'auto auto auto' : '1fr auto'),
    gap: compact ? '10px' : '12px',
    minHeight: '0'
  } });

  const topZone = make('div', { style: { display: 'grid', gridTemplateColumns: portrait ? '1fr' : `${slotSize}px minmax(0, 1fr) ${slotSize}px`, gap: compact ? '10px' : '12px', alignItems: 'center' } });
  const leftSlots = make('div', { style: { display: 'grid', gridTemplateRows: 'repeat(3, minmax(0, 1fr))', gap: compact ? '8px' : '10px', justifyItems: 'center' } });
  const rightSlots = make('div', { style: { display: 'grid', gridTemplateRows: 'repeat(3, minmax(0, 1fr))', gap: compact ? '8px' : '10px', justifyItems: 'center' } });
  [0,1,2].forEach((idx) => leftSlots.appendChild(renderHeroDeckSlot(skillCards[idx], state, selectedEntry, `S${idx+1}`, { heroBiome, size: slotSize })));
  [3,4,5].forEach((idx) => rightSlots.appendChild(renderHeroDeckSlot(skillCards[idx], state, selectedEntry, `S${idx+1}`, { heroBiome, size: slotSize })));

  const core = make('div', { style: { display: 'flex', flexDirection: 'column', gap: compact ? '8px' : '10px', alignItems: 'center', justifyContent: 'center', minHeight: portrait ? (compact ? '180px' : '220px') : (compact ? '236px' : '300px'), borderRadius: compact ? '20px' : '24px', border: `1px solid ${accent}36`, background: `radial-gradient(circle at 50% 36%, ${accent}22, rgba(12,16,25,0.96) 62%, rgba(5,8,14,0.98))`, boxShadow: `0 0 0 1px ${accent}18 inset` } });
  core.appendChild(make('div', { text: String(activeHero?.name || 'Hero'), style: { fontSize: portrait ? (compact ? '16px' : '18px') : (compact ? '18px' : '20px'), fontWeight: '900', color: '#fff2cf', letterSpacing: '0.03em' } }));
  core.appendChild(make('div', { text: `${(ESSENCE_META[heroBiome] || ESSENCE_META.mecha).label} BIOME`, style: { fontSize: compact ? '10px' : '11px', color: 'rgba(219,235,255,0.72)', textTransform: 'uppercase', letterSpacing: '0.14em' } }));
  const orb = make('div', { style: { width: portrait ? (compact ? '86px' : '110px') : (compact ? '110px' : '148px'), height: portrait ? (compact ? '86px' : '110px') : (compact ? '110px' : '148px'), borderRadius: '50%', border: `1px solid ${accent}55`, background: `radial-gradient(circle at 50% 34%, ${accent}66, rgba(34,48,76,0.42) 34%, rgba(7,11,18,0.98) 74%)`, boxShadow: `0 0 42px ${accent}22, 0 0 0 1px ${accent}24 inset`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f1fbff', fontSize: portrait ? (compact ? '34px' : '46px') : (compact ? '42px' : '58px'), fontWeight: '900', textShadow: '0 0 22px rgba(255,255,255,0.28)' } });
  orb.textContent = String(activeHero?.name || 'H').trim().slice(0,1).toUpperCase() || 'H';
  core.appendChild(orb);
  const summaryRow = make('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' } });
  summaryRow.appendChild(renderCharacterChip('Skills', `${loadout.skillCards.length}/6`, `${accent}44`));
  summaryRow.appendChild(renderCharacterChip('Passives', `${loadout.passiveCards.length}/6`, 'rgba(143,216,255,0.24)'));
  summaryRow.appendChild(renderCharacterChip('Power', `${Math.max(0, Number(getHeroLoadoutSummary(prog, activeHero)?.totalCardPower || 0) || 0)}`, 'rgba(255,216,122,0.24)'));
  core.appendChild(summaryRow);
  core.appendChild(make('div', { text: skillsOnly ? 'Skills tab uses card-skills only: tap a skill card, then place it into any open slot.' : 'Tap a slot card or archive card to inspect it. Deck view keeps the hero stage central for phone-landscape play.', style: { maxWidth: portrait ? '100%' : '360px', textAlign: 'center', fontSize: compact ? '10px' : '11px', lineHeight: '1.45', color: 'rgba(226,239,255,0.72)' } }));

  if (portrait) {
    topZone.appendChild(core);
    const sides = make('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } });
    sides.appendChild(leftSlots);
    sides.appendChild(rightSlots);
    topZone.appendChild(sides);
  } else {
    topZone.appendChild(leftSlots);
    topZone.appendChild(core);
    topZone.appendChild(rightSlots);
  }
  board.appendChild(topZone);

  if (!skillsOnly) {
    const passiveRow = make('div', { style: { display: 'grid', gridTemplateColumns: portrait ? 'repeat(3, minmax(0, 1fr))' : 'repeat(6, minmax(0, 1fr))', gap: compact ? '8px' : '10px', alignItems: 'stretch' } });
    passiveCards.forEach((entry, idx) => passiveRow.appendChild(renderHeroDeckSlot(entry, state, selectedEntry, `P${idx+1}`, { heroBiome, size: portrait ? 78 : 86 })));
    board.appendChild(passiveRow);
  }
  return board;
}

function renderHeroArchiveShelf(state, cards = [], selectedEntry, portrait = false) {
  const cols = portrait ? 3 : 4;
  const host = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '0', overflow: 'hidden', padding: '10px', borderRadius: '18px', border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(10,14,22,0.94)' } });
  host.appendChild(make('div', { text: 'Archive Shelf', style: { fontSize: '12px', fontWeight: '800', color: '#fff0c8', letterSpacing: '0.08em', textTransform: 'uppercase' } }));
  const gridHost = make('div', { style: { minHeight: '0', flex: '1 1 auto', overflow: 'hidden' } });
  if (cards.length) {
    gridHost.appendChild(renderInventorySlotGrid(cards, (entry) => renderHeroSkillCard(entry, {
      selected: selectedEntry?.cardId === entry.cardId,
      width: portrait ? 92 : 96,
      height: portrait ? 142 : 148,
      onClick: () => { selectCharacterEntry(state, { kind: 'card', key: entry.cardId }); },
      title: `${entry.name} • ${entry.kind}`,
    }), cols));
  } else {
    gridHost.appendChild(make('div', { text: 'NO CARDS IN CURRENT PAGE', style: { padding: '24px 0', textAlign: 'center', color: 'rgba(214,232,255,0.42)', fontSize: '12px', letterSpacing: '0.16em', textTransform: 'uppercase' } }));
  }
  host.appendChild(gridHost);
  return host;
}

function renderHeroDeckShelf(title, cards, state, selectedEntry, opts = {}) {
  const portrait = !!opts.portrait;
  const accent = opts.accent || 'rgba(255,216,122,0.24)';
  const card = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', borderRadius: '16px', border: `1px solid ${accent}`, background: 'rgba(11,16,24,0.94)', minHeight: '0' } });
  const head = make('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' } });
  head.appendChild(make('div', { text: title, style: { fontSize: '13px', fontWeight: '800', color: '#fff1cb', letterSpacing: '0.04em', textTransform: 'uppercase' } }));
  head.appendChild(make('div', { text: `${Math.max(0, (cards || []).length)} cards`, style: { fontSize: '10px', color: 'rgba(214,232,255,0.68)', letterSpacing: '0.08em', textTransform: 'uppercase' } }));
  card.appendChild(head);
  if (Array.isArray(cards) && cards.length) {
    card.appendChild(renderInventorySlotGrid(cards, (entry) => renderHeroSkillCard(entry, {
      selected: selectedEntry?.cardId === entry.cardId,
      width: portrait ? 92 : 96,
      height: portrait ? 142 : 148,
      onClick: () => { selectCharacterEntry(state, { kind: 'card', key: entry.cardId }); },
      title: `${entry.name} • ${entry.kind}`,
    }), portrait ? 3 : 4));
  } else {
    card.appendChild(make('div', { text: 'EMPTY', style: { padding: '24px 0', textAlign: 'center', color: 'rgba(214,232,255,0.42)', fontSize: '12px', letterSpacing: '0.16em', textTransform: 'uppercase' } }));
  }
  return card;
}

function renderHeroSelectedCardSummary(state, prog, entry, activeHero, opts = {}) {
  if (!entry) return renderSimpleInfoCard('', [opts?.placeholder === false ? '' : 'Выберите скилл для просмотра подробной информации.'], { accent: 'rgba(143,216,255,0.26)', background: 'linear-gradient(180deg, rgba(12,16,26,0.98), rgba(5,8,14,0.98))' });
  const compact = !!opts.compact;
  const tight = !!opts.tight;
  const accent = getFrameAccent(entry.race || 'mecha');
  const loadout = getHeroLoadoutActionPreview(prog, entry.cardId, activeHero);
  const shell = make('div', { style: { display: 'flex', flexDirection: 'column', gap: compact ? '8px' : '10px', padding: tight ? '8px' : (compact ? '8px' : '12px'), borderRadius: compact ? '18px' : '18px', border: `1px solid ${accent}44`, background: 'linear-gradient(180deg, rgba(10,14,24,0.985), rgba(4,7,13,0.985))', boxShadow: `0 0 0 1px ${accent}18 inset`, minHeight: '0', overflow: 'hidden' } });
  if (tight) {
    const rawRows = getSkillDetailRows(entry?.sourceKey || entry?.key || '', Math.max(1, entry.level | 0));
    const rows = Array.isArray(rawRows) ? rawRows.slice(0, 5) : [];
    const biomeMeta = getCardBiomeMeta(entry);
    const biomeEmoji = getBiomeEmoji(entry?.race || 'mecha');
    const cardWrap = make('div', { style: { display: 'flex', justifyContent: 'center' } });
    cardWrap.appendChild(renderHeroSkillCard(entry, {
      selected: true,
      width: 104,
      height: 148,
      title: `${entry.name} • ${biomeEmoji}`,
    }));
    shell.appendChild(cardWrap);
    shell.appendChild(make('div', { text: String(entry.name || 'Card'), style: { textAlign: 'center', fontSize: '12px', fontWeight: '900', color: '#fff1ce', lineHeight: '1.15' } }));
    const quick = make('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' } });
    [
      ['Lv', `${Math.max(1, entry.level | 0)}`],
      ['Stars', entry.starsText || '★'],
      ['Copies', `${Math.max(0, entry.copiesOwned | 0)}`],
      ['Biome', biomeEmoji],
    ].forEach(([label, value]) => {
      quick.appendChild(make('div', { style: { minWidth: '0', padding: '6px 7px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${accent}33` } }, [
        make('div', { text: label, style: { fontSize: '8px', color: 'rgba(210,230,255,0.70)', textTransform: 'uppercase', letterSpacing: '0.08em' } }),
        make('div', { text: value, style: { marginTop: '2px', fontSize: '10px', fontWeight: '800', color: '#f6fbff', lineHeight: '1.12', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }),
      ]));
    });
    shell.appendChild(quick);
    if (rows.length) {
      const statBox = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', padding: '7px 8px', borderRadius: '12px', background: 'rgba(255,255,255,0.035)', border: `1px solid ${accent}28` } });
      rows.forEach((row) => statBox.appendChild(make('div', { text: row, style: { fontSize: '10px', lineHeight: '1.25', color: 'rgba(232,245,255,0.86)' } })));
      shell.appendChild(statBox);
    }
    const textLines = [];
    const evoLine = getCardEvolutionLine(entry);
    if (evoLine) textLines.push(evoLine);
    if (Array.isArray(entry?.tags) && entry.tags.length) textLines.push(`Focus: ${entry.tags.join(' • ')}`);
    if (Array.isArray(entry?.routeTags) && entry.routeTags.length) textLines.push(`Route: ${entry.routeTags.join(' • ')}`);
    if (textLines.length) {
      shell.appendChild(make('div', { text: textLines.join('\n'), style: { whiteSpace: 'pre-line', fontSize: '10px', lineHeight: '1.28', color: 'rgba(226,239,255,0.82)' } }));
    }
  } else {
    shell.appendChild(renderSelectedSkillCardShowcase(entry, activeHero, { compact }));
    const quick = make('div', { style: { display: 'grid', gridTemplateColumns: compact ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(84px, 1fr))', gap: compact ? '6px' : '8px' } });
    [
      ['Stars', entry.starsText || '★', `${accent}44`],
      ['Lv', `${Math.max(1, entry.level | 0)}`, 'rgba(143,216,255,0.24)'],
      ['Copies', `${Math.max(0, entry.copiesOwned | 0)}`, 'rgba(255,216,122,0.22)'],
    ].forEach(([label, value, chipAccent]) => {
      if (compact) {
        quick.appendChild(make('div', { style: { minWidth: '0', padding: '6px 7px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${chipAccent}` } }, [
          make('div', { text: label, style: { fontSize: '8px', color: 'rgba(210,230,255,0.70)', textTransform: 'uppercase', letterSpacing: '0.08em' } }),
          make('div', { text: value, style: { marginTop: '2px', fontSize: '11px', fontWeight: '800', color: '#f6fbff', lineHeight: '1.12', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }),
        ]));
      } else {
        quick.appendChild(renderCharacterChip(label, value, chipAccent));
      }
    });
    if (!compact && entry?.isEquipped) quick.appendChild(renderCharacterChip('Deck', 'EQUIPPED', `${accent}3a`));
    shell.appendChild(quick);
  }
  const btnRow = make('div', { style: { display: opts?.noActionButton ? 'none' : 'grid', gridTemplateColumns: '1fr', gap: '8px' } });
  const btnText = loadout?.action === 'unequip' ? (loadout?.canUnequip ? 'Remove From Deck' : 'Deck Locked') : (loadout?.action === 'replace' ? (loadout?.canEquip ? `Replace ${String(loadout?.replacementCardName || 'Skill')}` : 'Deck Locked') : (loadout?.canEquip ? 'Place Into Deck' : 'Deck Locked'));
  const btn = make('button', { className: 'btn', type: 'button', text: btnText, style: { padding: compact ? '8px 10px' : '10px 12px', fontSize: compact ? '11px' : '13px', opacity: (loadout?.canEquip || loadout?.canUnequip) ? '1' : '0.6' } });
  btn.disabled = !(loadout?.canEquip || loadout?.canUnequip);
  btn.addEventListener('click', () => {
    const result = loadout?.action === 'unequip' ? unequipCardFromHero(prog, entry.cardId, activeHero) : equipCardOnHero(prog, entry.cardId, activeHero);
    if (result?.ok) {
      if (typeof persistHubState === 'function') persistHubState(state, result.message || 'Deck updated.');
      else flashHeroMenuMessage(result.message || 'Deck updated.');
    } else flashHeroMenuMessage(result?.message || 'Deck action blocked.');
    renderCharacterMenu(state, true);
  });
  btnRow.appendChild(btn);
  shell.appendChild(btnRow);
  return shell;
}

function renderHeroCollectionPanel(state, prog, activeHero, selectedEntry, filteredCards, allCards, heroBiome, portrait = false) {
  const pageInfo = paginateHeroCards(state, filteredCards, portrait ? 6 : 12);
  const layout = make('div', { style: { display: 'grid', gridTemplateColumns: portrait ? '1fr' : '1.24fr 0.76fr', gap: '12px', minHeight: '0', height: '100%' } });
  const left = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '0', overflow: 'hidden' } });
  left.appendChild(renderHeroCardCompactToolbar(state, heroBiome));
  const archive = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '0', padding: '10px', borderRadius: '18px', border: '1px solid rgba(255,216,122,0.14)', background: 'linear-gradient(180deg, rgba(16,19,28,0.98), rgba(8,11,18,0.96))' } });
  const head = make('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' } });
  head.appendChild(make('div', { text: 'Card Archive', style: { fontSize: '14px', fontWeight: '900', color: '#fff1cb', letterSpacing: '0.04em', textTransform: 'uppercase' } }));
  head.appendChild(make('div', { text: `${(ESSENCE_META[heroBiome] || ESSENCE_META.mecha).label} hero • DH/NV style archive page`, style: { fontSize: '11px', color: 'rgba(214,232,255,0.66)' } }));
  archive.appendChild(head);
  const gridHost = make('div', { style: { minHeight: '0', flex: '1 1 auto', overflow: 'hidden' } });
  if (pageInfo.items.length) {
    gridHost.appendChild(renderInventorySlotGrid(pageInfo.items, (entry) => renderHeroSkillCard(entry, {
      selected: selectedEntry?.cardId === entry.cardId,
      width: portrait ? 96 : 104,
      height: portrait ? 150 : 160,
      title: `${entry.name} • ${entry.kind}`,
      onClick: () => { selectCharacterEntry(state, { kind: 'card', key: entry.cardId }); },
    }), portrait ? 3 : 4));
  } else if (allCards.length) {
    gridHost.appendChild(make('div', { text: 'NO CARDS MATCH CURRENT FILTER', style: { padding: '28px 0', textAlign: 'center', color: 'rgba(214,232,255,0.42)', fontSize: '12px', letterSpacing: '0.16em', textTransform: 'uppercase' } }));
  } else {
    gridHost.appendChild(make('div', { text: 'NO CARDS OWNED YET', style: { padding: '28px 0', textAlign: 'center', color: 'rgba(214,232,255,0.42)', fontSize: '12px', letterSpacing: '0.16em', textTransform: 'uppercase' } }));
  }
  archive.appendChild(gridHost);
  archive.appendChild(renderHeroGalleryPager(state, pageInfo));
  left.appendChild(archive);
  layout.appendChild(left);

  const right = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '0', overflowY: 'auto', paddingRight: '4px' } });
  right.appendChild(renderHeroSelectedCardSummary(state, prog, selectedEntry, activeHero));
  layout.appendChild(right);
  return layout;
}

function renderHeroLoadoutPanel(state, prog, activeHero, selectedEntry, filteredCards, heroBiome, portrait = false) {
  const pageInfo = paginateHeroCards(state, filteredCards, portrait ? 6 : 8);
  const wrap = make('div', { style: { display: 'grid', gridTemplateRows: portrait ? 'auto auto auto' : 'minmax(0, 1fr) auto', gap: '12px', minHeight: '0', height: '100%' } });

  const top = make('div', { style: { display: 'grid', gridTemplateColumns: portrait ? '1fr' : '1.24fr 0.76fr', gap: '12px', minHeight: '0', overflow: 'hidden' } });
  const boardCol = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '0', overflow: 'hidden' } });
  boardCol.appendChild(renderHeroDeckBoard(state, prog, activeHero, selectedEntry, { portrait }));
  top.appendChild(boardCol);

  const side = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '0', overflowY: 'auto', paddingRight: '4px' } });
  side.appendChild(renderHeroSelectedCardSummary(state, prog, selectedEntry, activeHero));
  side.appendChild(renderHeroCardLoadoutTools(state, prog, activeHero));
  side.appendChild(renderHeroLoadoutPresetTools(state, prog, activeHero));
  top.appendChild(side);
  wrap.appendChild(top);

  const archive = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '0', overflow: 'hidden' } });
  archive.appendChild(renderHeroCardCompactToolbar(state, heroBiome));
  archive.appendChild(renderHeroArchiveShelf(state, pageInfo.items, selectedEntry, portrait));
  archive.appendChild(renderHeroGalleryPager(state, pageInfo));
  archive.appendChild(renderHeroBatchCardTools(state, prog, activeHero, filteredCards));
  wrap.appendChild(archive);
  return wrap;
}

function renderHeroUpgradePanel(state, prog, activeHero, selectedEntry, heroBiome, portrait = false) {
  const layout = make('div', { style: { display: 'grid', gridTemplateColumns: portrait ? '1fr' : '0.74fr 1.26fr', gap: '12px', minHeight: '0', height: '100%' } });
  const left = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '0', overflowY: 'auto', paddingRight: '4px' } });
  left.appendChild(renderHeroSelectedCardSummary(state, prog, selectedEntry, activeHero));
  layout.appendChild(left);
  const right = make('div', { style: { minHeight: '0', overflowY: 'auto', paddingRight: '4px' } });
  right.appendChild(renderCardDetailCard(state, prog, selectedEntry, activeHero, { includeShowcase: false }));
  layout.appendChild(right);
  return layout;
}


function renderSkillMenuToolbar(state, heroBiome) {
  const view = getHeroCardViewState(state);
  const wrap = make('div', { style: { display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', alignItems: 'center', padding: '10px 12px', borderRadius: '16px', border: '1px solid rgba(255,216,122,0.14)', background: 'linear-gradient(180deg, rgba(16,20,30,0.98), rgba(8,11,18,0.96))' } });
  const left = make('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } });
  const setMode = (mode) => {
    if (mode === 'hero') setHeroCardViewState(state, { kindFilter: 'skill', raceFilter: 'hero' });
    else if (mode === 'equipped') setHeroCardViewState(state, { kindFilter: 'equipped', raceFilter: 'all' });
    else setHeroCardViewState(state, { kindFilter: 'skill', raceFilter: 'all' });
    renderCharacterMenu(state, true);
  };
  [
    ['all', 'All Skills', view.kindFilter === 'skill' && view.raceFilter === 'all'],
    ['hero', `${(ESSENCE_META[heroBiome] || ESSENCE_META.mecha).label} Skills`, view.kindFilter === 'skill' && view.raceFilter === 'hero'],
    ['equipped', 'Deck Only', view.kindFilter === 'equipped'],
  ].forEach(([mode, label, active]) => {
    const btn = make('button', { className: 'btn', type: 'button', text: label, style: { padding: '8px 10px', borderRadius: '999px', borderColor: active ? 'rgba(255,216,122,0.52)' : 'rgba(255,255,255,0.12)', background: active ? 'linear-gradient(180deg, rgba(112,78,18,0.98), rgba(58,42,12,0.98))' : 'linear-gradient(180deg, rgba(23,28,42,0.98), rgba(12,16,24,0.98))', color: active ? '#fff0c8' : '#d8e5ff', fontSize: '12px' } });
    btn.addEventListener('click', () => setMode(mode));
    left.appendChild(btn);
  });
  wrap.appendChild(left);
  const sort = make('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' } });
  [['power','Power'],['name','Name']].forEach(([key,label]) => {
    const active = String(view?.sortBy || 'power') === key;
    const btn = make('button', { className: 'btn', type: 'button', text: label, style: { padding: '8px 10px', borderRadius: '999px', borderColor: active ? 'rgba(190,164,255,0.54)' : 'rgba(255,255,255,0.12)', background: active ? 'linear-gradient(180deg, rgba(82,54,130,0.98), rgba(38,26,66,0.98))' : 'linear-gradient(180deg, rgba(23,28,42,0.98), rgba(12,16,24,0.98))', color: active ? '#f1e8ff' : '#d8e5ff', fontSize: '12px' } });
    btn.addEventListener('click', () => { setHeroCardViewState(state, { sortBy: key }); renderCharacterMenu(state, true); });
    sort.appendChild(btn);
  });
  wrap.appendChild(sort);
  return wrap;
}

function renderSkillArchiveGrid(state, prog, cards, selectedEntry, portrait = false) {
  const pageInfo = paginateHeroCards(state, cards, portrait ? 6 : 8);
  const host = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '0', height: '100%', padding: '10px', borderRadius: '18px', border: '1px solid rgba(255,216,122,0.14)', background: 'linear-gradient(180deg, rgba(16,19,28,0.98), rgba(8,11,18,0.96))' } });
  const head = make('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' } });
  head.appendChild(make('div', { text: 'Skill Archive', style: { fontSize: '14px', fontWeight: '900', color: '#fff1cb', letterSpacing: '0.04em', textTransform: 'uppercase' } }));
  head.appendChild(make('div', { text: 'No scrolling. Use pages if everything does not fit on one screen.', style: { fontSize: '11px', color: 'rgba(214,232,255,0.66)' } }));
  host.appendChild(head);
  const gridHost = make('div', { style: { minHeight: '0', flex: '1 1 auto', overflow: 'hidden' } });
  if (pageInfo.items.length) {
    const activeHero = getActiveHero(prog);
    gridHost.appendChild(renderInventorySlotGrid(pageInfo.items, (entry) => {
      const loadout = getHeroLoadoutActionPreview(prog, entry.cardId, activeHero);
      const actionText = loadout?.action === 'unequip'
        ? (loadout?.canUnequip ? 'Unequip' : 'Locked')
        : (loadout?.action === 'replace'
          ? (loadout?.canEquip ? 'Replace' : 'Locked')
          : (loadout?.canEquip ? 'Equip' : 'Locked'));
      return renderHeroSkillCard(entry, {
        selected: selectedEntry?.cardId === entry.cardId,
        width: portrait ? 92 : 96,
        height: portrait ? 142 : 148,
        title: `${entry.name} • ${entry.kind}`,
        onClick: () => { selectCharacterEntry(state, { kind: 'card', key: entry.cardId }); },
        actionText,
        actionDisabled: !(loadout?.canEquip || loadout?.canUnequip),
        onAction: () => runSkillCardLoadoutAction(state, prog, entry, activeHero),
      });
    }, portrait ? 3 : 4));
  } else {
    gridHost.appendChild(make('div', { text: 'NO SKILLS MATCH CURRENT VIEW', style: { padding: '28px 0', textAlign: 'center', color: 'rgba(214,232,255,0.42)', fontSize: '12px', letterSpacing: '0.16em', textTransform: 'uppercase' } }));
  }
  host.appendChild(gridHost);
  host.appendChild(renderHeroGalleryPager(state, pageInfo));
  return host;
}

function renderSkillsCardTab(state, prog, portrait = false) {
  const activeHero = getActiveHero(prog);
  const heroBiome = String(activeHero?.race || 'mecha');
  const equippedIds = getHeroEquippedCardIds(activeHero);
  const allCards = listOwnedCardEntries(prog?.accountProfile?.cardCollection, { equippedIds, race: '' }).filter((entry) => entry?.kind === 'skill');
  const view = { ...getHeroCardViewState(state), kindFilter: (getHeroCardViewState(state)?.kindFilter === 'equipped' ? 'equipped' : 'skill') };
  const filteredCards = filterAndSortHeroCards(allCards, view, heroBiome);
  const selected = getDefaultCardSelection(state, prog);
  const selectedEntry = selected?.kind === 'card'
    ? (filteredCards.find((entry) => entry.cardId === selected.key) || allCards.find((entry) => entry.cardId === selected.key) || filteredCards[0] || allCards[0] || null)
    : (filteredCards[0] || allCards[0] || null);

  const wrap = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '0', height: '100%' } });
  wrap.appendChild(renderCharacterSectionTitle('Skills', 'Cards are your skills. This screen keeps only skill cards, deck slots and a selected-card panel so it fits phone-landscape without zooming out.'));
  const chips = make('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } });
  chips.appendChild(renderCharacterChip('Hero', String(activeHero?.name || 'Hero'), `${getFrameAccent(heroBiome)}33`));
  chips.appendChild(renderCharacterChip('Biome', (ESSENCE_META[heroBiome] || ESSENCE_META.mecha).label, `${getFrameAccent(heroBiome)}44`));
  chips.appendChild(renderCharacterChip('Skills', `${allCards.length}`, 'rgba(143,216,255,0.24)'));
  chips.appendChild(renderCharacterChip('Deck', `${Math.min(6, Array.isArray(activeHero?.equippedSkillCards) ? activeHero.equippedSkillCards.filter(Boolean).length : 0)}/6`, 'rgba(255,216,122,0.22)'));
  wrap.appendChild(chips);
  wrap.appendChild(renderSkillMenuToolbar(state, heroBiome));

  const body = make('div', { style: { display: 'grid', gridTemplateColumns: portrait ? '1fr' : '280px minmax(0, 1fr) 320px', gap: '12px', minHeight: '0', flex: '1 1 auto', overflow: 'hidden' } });
  const left = make('div', { style: { minHeight: '0', overflow: 'hidden' } });
  left.appendChild(renderHeroDeckBoard(state, prog, activeHero, selectedEntry, { portrait, skillsOnly: true, compact: true }));
  body.appendChild(left);
  const center = make('div', { style: { minHeight: '0', overflow: 'hidden' } });
  center.appendChild(renderSkillArchiveGrid(state, prog, filteredCards, selectedEntry, portrait));
  body.appendChild(center);
  const right = make('div', { style: { minHeight: '0', overflowY: 'auto', paddingRight: '4px' } });
  right.appendChild(renderHeroSelectedCardSummary(state, prog, selectedEntry, activeHero));
  body.appendChild(right);
  wrap.appendChild(body);
  return wrap;
}

function renderHeroCardsTab(state, prog, portrait = false) {
  const activeHero = getActiveHero(prog);
  const equippedIds = getHeroEquippedCardIds(activeHero);
  const allCards = listOwnedCardEntries(prog?.accountProfile?.cardCollection, { equippedIds, race: '' });
  const heroBiome = activeHero?.race || 'mecha';
  const heroBiomeCards = listOwnedCardEntries(prog?.accountProfile?.cardCollection, { equippedIds, race: heroBiome });
  const view = getHeroCardViewState(state);
  const filteredCards = filterAndSortHeroCards(allCards, view, heroBiome);
  const selected = getDefaultCardSelection(state, prog);
  const selectedEntry = selected?.kind === 'card'
    ? (filteredCards.find((entry) => entry.cardId === selected.key) || allCards.find((entry) => entry.cardId === selected.key) || filteredCards[0] || allCards[0] || null)
    : (filteredCards[0] || allCards[0] || null);
  const subtab = getHeroCardsSubtab(state);

  const wrap = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '0', height: '100%' } });
  wrap.appendChild(renderCharacterSectionTitle('Skill Cards', 'DH5 / NxB NV direction: game-like tabs, paged archive, deck view and a separate enhance panel that fits phone-landscape better.'));
  const chips = make('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } });
  chips.appendChild(renderCharacterChip('Hero', String(activeHero?.name || 'Hero'), `${getFrameAccent(heroBiome)}33`));
  chips.appendChild(renderCharacterChip('Biome', (ESSENCE_META[heroBiome] || ESSENCE_META.mecha).label, `${getFrameAccent(heroBiome)}44`));
  chips.appendChild(renderCharacterChip('Owned', `${allCards.length}`, 'rgba(143,216,255,0.24)'));
  chips.appendChild(renderCharacterChip('Deck', `${equippedIds.length}`, 'rgba(255,216,122,0.22)'));
  chips.appendChild(renderCharacterChip('Biome Cards', `${heroBiomeCards.length}`, 'rgba(186,255,208,0.24)'));
  chips.appendChild(renderCharacterChip('View', subtab === 'collection' ? 'ARCHIVE' : (subtab === 'loadout' ? 'DECK' : 'ENHANCE'), 'rgba(190,164,255,0.24)'));
  wrap.appendChild(chips);
  wrap.appendChild(renderHeroCardsSubtabBar(state));

  const body = make('div', { style: { minHeight: '0', flex: '1 1 auto', overflow: 'hidden' } });
  if (subtab === 'loadout') body.appendChild(renderHeroLoadoutPanel(state, prog, activeHero, selectedEntry, filteredCards, heroBiome, portrait));
  else if (subtab === 'upgrade') body.appendChild(renderHeroUpgradePanel(state, prog, activeHero, selectedEntry, heroBiome, portrait));
  else body.appendChild(renderHeroCollectionPanel(state, prog, activeHero, selectedEntry, filteredCards, allCards, heroBiome, portrait));
  wrap.appendChild(body);
  return wrap;
}



function buildCoopHeroSyncEntries(state) {
  const players = Array.isArray(state?.players) ? state.players : [];
  const localId = String(state?.player?.id || '');
  const out = [];
  for (const player of players) {
    if (!player) continue;
    const id = String(player.id || '').trim();
    if (!id) continue;
    const heroName = String(player.activeHeroName || player.nickname || `Hero ${id}`).trim().slice(0, 24) || `Hero ${id}`;
    const raceKey = String(player.activeHeroRace || player._selectedStarterLoadout || 'mecha').trim() || 'mecha';
    const loadout = player._heroLoadoutSummary || state?._netMetaById?.get(id)?.activeHeroLoadoutSummary || null;
    const combat = player._heroCombatSummary || state?._netMetaById?.get(id)?.heroCombatSummary || player._heroCombatProfile?.summary || null;
    out.push({
      id,
      isLocal: id === localId,
      nickname: String(player.nickname || heroName).trim().slice(0, 16) || heroName,
      heroName,
      raceKey,
      skillCount: Math.max(0, (Number(loadout?.totals?.skillCount || loadout?.skills?.length || combat?.equippedSkillCards || 0) | 0) || 0),
      passiveCount: Math.max(0, (Number(loadout?.totals?.passiveCount || loadout?.passives?.length || combat?.equippedPassiveCards || 0) | 0) || 0),
      totalCardPower: Math.max(0, (Number(loadout?.totals?.totalCardPower || combat?.totalCardPower || 0) | 0) || 0),
      sameRaceCards: Math.max(0, (Number(loadout?.totals?.sameRaceCards || combat?.sameRaceCards || 0) | 0) || 0),
      masteryLevel: Math.max(1, (Number(loadout?.totals?.masteryLevel || combat?.masteryLevel || 1) | 0) || 1),
    });
  }
  out.sort((a, b) => Number(b.isLocal) - Number(a.isLocal) || a.nickname.localeCompare(b.nickname));
  return out;
}

function renderHeroRosterTab(state, prog, portrait = false) {
  const roster = listHeroSummaries(prog);
  const activeHero = getActiveHero(prog);
  const activeSummary = getActiveHeroSummary(prog);
  const savedCheckpointHero = getSavedCheckpointHeroSummary(prog);
  const selectedId = getHeroRosterSelectedId(state, prog);
  const selectedHero = getHeroById(prog, selectedId) || activeHero;
  const selectedSummary = roster.find((entry) => entry.heroId === selectedHero?.heroId) || activeSummary || null;
  const slotsUsed = roster.length;
  const slotsMax = Math.max(1, Number(prog?.accountProfile?.maxHeroSlots || 10) | 0 || 10);
  const switchLocked = !!(savedCheckpointHero && selectedHero && savedCheckpointHero.heroId !== selectedHero.heroId);
  const createLocked = false;

  const wrap = make('div', { style: { display: 'grid', gridTemplateColumns: portrait ? '1fr' : '1.02fr 0.98fr', gap: '12px', minHeight: '0', height: '100%' } });

  const left = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '0', overflow: 'hidden' } });
  left.appendChild(renderCharacterSectionTitle('Hero Roster', savedCheckpointHero ? `Each hero is its own persistent entity. Current saved expedition belongs to ${savedCheckpointHero.name} on Floor ${savedCheckpointHero.resumeFloor || 0}.` : 'Each hero is now its own persistent entity. Saved expeditions are now bound to the hero that created them.'));
  const chips = make('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } });
  chips.appendChild(renderCharacterChip('Active', activeSummary?.name || 'Hero', `${getFrameAccent(activeSummary?.race || 'mecha')}44`));
  chips.appendChild(renderCharacterChip('Biome', (ESSENCE_META[activeSummary?.race || 'mecha'] || ESSENCE_META.mecha).label, `${getFrameAccent(activeSummary?.race || 'mecha')}44`));
  chips.appendChild(renderCharacterChip('Slots', `${slotsUsed}/${slotsMax}`, 'rgba(255,216,122,0.28)'));
  if (savedCheckpointHero) chips.appendChild(renderCharacterChip('Saved Run', `${savedCheckpointHero.name} • F${savedCheckpointHero.resumeFloor || 0}`, `${getFrameAccent(savedCheckpointHero.race || 'mecha')}44`));
  left.appendChild(chips);

  const rosterList = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '0', overflowY: 'auto', paddingRight: '4px' } });
  roster.forEach((entry, idx) => {
    const accent = getFrameAccent(entry.race || 'mecha');
    const selected = entry.heroId === selectedId;
    const btn = make('button', {
      type: 'button',
      className: 'btn',
      style: {
        textAlign: 'left',
        padding: '12px',
        borderRadius: '16px',
        border: `1px solid ${selected ? accent : 'rgba(255,255,255,0.12)'}`,
        background: selected ? `linear-gradient(180deg, ${accent}22, rgba(14,18,27,0.98))` : 'linear-gradient(180deg, rgba(18,22,33,0.98), rgba(9,12,18,0.98))',
        boxShadow: selected ? `0 0 0 1px ${accent}55 inset` : '0 0 0 1px rgba(255,255,255,0.04) inset',
        color: '#eef6ff',
      },
    });
    btn.addEventListener('click', () => {
      setHeroRosterSelectedId(state, entry.heroId);
      renderCharacterMenu(state, true);
    });
    const top = make('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } });
    top.appendChild(make('div', { text: String(idx + 1), style: { width: '28px', height: '28px', borderRadius: '999px', display: 'grid', placeItems: 'center', background: `${accent}22`, border: `1px solid ${accent}66`, color: accent, fontSize: '12px', fontWeight: '800' } }));
    const nameWrap = make('div', { style: { flex: '1 1 auto' } });
    nameWrap.appendChild(make('div', { text: entry.name, style: { fontSize: '14px', fontWeight: '800', color: '#fff4d2' } }));
    nameWrap.appendChild(make('div', { text: `${(ESSENCE_META[entry.race] || ESSENCE_META.mecha).label} • FIXED BIOME`, style: { marginTop: '4px', fontSize: '11px', color: 'rgba(216,232,255,0.78)', textTransform: 'uppercase', letterSpacing: '0.05em' } }));
    top.appendChild(nameWrap);
    top.appendChild(make('div', { text: entry.hasCheckpoint ? `CHECKPOINT • F${entry.resumeFloor || 0}` : (entry.isActive ? 'ACTIVE' : 'STORED'), style: { padding: '4px 8px', borderRadius: '999px', border: `1px solid ${(entry.hasCheckpoint || entry.isActive) ? accent : 'rgba(255,255,255,0.14)'}`, background: (entry.hasCheckpoint || entry.isActive) ? `${accent}22` : 'rgba(255,255,255,0.05)', color: (entry.hasCheckpoint || entry.isActive) ? '#fff1c4' : '#d6e4ff', fontSize: '10px', fontWeight: '800', letterSpacing: '0.07em' } }));
    btn.appendChild(top);
    btn.appendChild(make('div', { text: entry.hasCheckpoint ? `Checkpoint ready: Floor ${entry.resumeFloor || 0} • ${String(entry.lastBiomeKey || 'unknown biome').toUpperCase()} • ${entry.equippedSkillCards} active / ${entry.equippedPassiveCards} passive.` : `Cards foundation: ${entry.equippedSkillCards} active / ${entry.equippedPassiveCards} passive • Click to inspect.`, style: { marginTop: '8px', fontSize: '12px', lineHeight: '1.4', color: 'rgba(230,240,255,0.82)' } }));
    rosterList.appendChild(btn);
  });
  left.appendChild(rosterList);
  wrap.appendChild(left);

  const right = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '0', overflowY: 'auto', paddingRight: '4px' } });
  if (selectedHero) {
    const biomeMeta = getHeroBiomeMeta(selectedHero.race);
    const masterySummary = getHeroBiomeMasterySummary(prog, selectedHero);
    const selectedLoadoutSummary = getHeroLoadoutSummary(prog, selectedHero);
    right.appendChild(renderSimpleInfoCard('Selected Hero', [
      `Name: ${selectedHero.name}`,
      `Biome: ${(ESSENCE_META[selectedHero.race] || ESSENCE_META.mecha).label} • chosen at creation`,
      `Biome mastery: Lv ${Math.max(1, masterySummary?.mastery?.level | 0 || 1)} • XP ${Math.max(0, masterySummary?.mastery?.xp | 0)}`,
      `Runtime core: ${String(selectedHero.race || 'mecha').toUpperCase()}`,
      `Strengths: ${(biomeMeta.strengths || []).join(' • ')}`,
      `Weaknesses: ${(biomeMeta.weaknesses || []).join(' • ')}`,
      `Mastery bonuses: ${(masterySummary?.bonuses?.summaryLines || []).join(' • ') || 'No mastery bonuses yet.'}`,
      `Projected runtime: ${Math.max(0, selectedLoadoutSummary?.equippedSkillCards || 0)} skills • ${Math.max(0, selectedLoadoutSummary?.equippedPassiveCards || 0)} passives • Power ${Math.max(0, selectedLoadoutSummary?.totalCardPower || 0)}`,
      `Preset slots: ${Array.isArray(selectedHero.loadoutPresets) ? selectedHero.loadoutPresets.length : 0} • Cards ${Array.isArray(selectedHero.equippedSkillCards) ? selectedHero.equippedSkillCards.length : 0}/${Array.isArray(selectedHero.equippedPassiveCards) ? selectedHero.equippedPassiveCards.length : 0}`,
      selectedSummary?.hasCheckpoint ? `Status: owns saved expedition for Floor ${selectedSummary.resumeFloor || 0}.` : (selectedSummary?.isActive ? 'Status: currently active in hub/runtime.' : 'Status: stored hero profile.'),
    ], { accent: `${getFrameAccent(selectedHero.race || 'mecha')}55` }));
  }

  const actionCard = make('div', { className: 'shopCard', style: { padding: '12px', border: '1px solid rgba(255,216,122,0.22)', boxShadow: '0 0 0 1px rgba(255,216,122,0.08) inset', background: 'linear-gradient(180deg, rgba(18,22,33,0.98), rgba(10,13,20,0.98))' } });
  actionCard.appendChild(make('div', { className: 'name', text: 'Hero Actions', style: { color: '#fff5d7' } }));
  actionCard.appendChild(make('div', { text: switchLocked ? `Switch blocked: saved expedition is bound to ${savedCheckpointHero?.name || 'another hero'} until you resume or reset that run.` : (savedCheckpointHero ? `You can still activate ${savedCheckpointHero.name} to resume Floor ${savedCheckpointHero.resumeFloor || 0}.` : 'Switching active hero updates the active hub/combat projection immediately.'), style: { marginTop: '8px', fontSize: '12px', lineHeight: '1.45', color: 'rgba(228,240,255,0.88)' } }));
  const activateBtn = make('button', { className: 'btn', type: 'button', text: selectedSummary?.isActive ? 'Already Active' : 'Activate Selected Hero', style: { marginTop: '10px', padding: '9px 12px', opacity: (switchLocked || selectedSummary?.isActive || !selectedHero) ? '0.55' : '1' } });
  activateBtn.disabled = switchLocked || selectedSummary?.isActive || !selectedHero;
  activateBtn.addEventListener('click', () => {
    if (!selectedHero) return;
    if (switchLocked) {
      flashHeroMenuMessage(`Hero switch locked: saved expedition belongs to ${savedCheckpointHero?.name || 'another hero'}.`);
      return;
    }
    if (!setActiveHeroId(prog, selectedHero.heroId)) return;
    if (typeof persistHubState === 'function') persistHubState(state, `${selectedHero.name} is now active.`);
    else flashHeroMenuMessage(`${selectedHero.name} is now active.`);
    renderCharacterMenu(state, true);
  });
  actionCard.appendChild(activateBtn);
  right.appendChild(actionCard);

  if (selectedHero) {
    const heroCount = Array.isArray(prog?.heroes) ? prog.heroes.length : 0;
    const retireBlocked = heroCount <= 1 || !!selectedSummary?.hasCheckpoint;
    const manageCard = make('div', { className: 'shopCard', style: { padding: '12px', border: '1px solid rgba(186,255,208,0.22)', boxShadow: '0 0 0 1px rgba(186,255,208,0.08) inset', background: 'linear-gradient(180deg, rgba(14,22,18,0.98), rgba(10,13,20,0.98))' } });
    manageCard.appendChild(make('div', { className: 'name', text: 'Hero Management', style: { color: '#f0ffe6' } }));
    manageCard.appendChild(make('div', { text: selectedSummary?.hasCheckpoint ? 'Rename is safe, but retiring is blocked while this hero owns a saved expedition.' : 'Rename the selected hero or retire them from the roster when you no longer need the profile.', style: { marginTop: '8px', fontSize: '12px', lineHeight: '1.45', color: 'rgba(228,240,255,0.88)' } }));
    const renameInput = make('input', { type: 'text', value: getHeroRenameDraft(state, selectedHero.heroId, selectedHero.name || ''), maxlength: '24', placeholder: 'Hero name', style: { width: '100%', marginTop: '10px', padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(7,10,16,0.82)', color: '#eef7ff', outline: 'none' } });
    renameInput.addEventListener('input', () => setHeroRenameDraft(state, selectedHero.heroId, renameInput.value));
    manageCard.appendChild(renameInput);
    const manageRow = make('div', { className: 'row', style: { gap: '8px', marginTop: '10px', flexWrap: 'wrap' } });
    const renameBtn = make('button', { className: 'btn', type: 'button', text: 'Rename Hero', style: { padding: '8px 10px' } });
    renameBtn.addEventListener('click', () => {
      const result = renameHeroProfile(prog, selectedHero, getHeroRenameDraft(state, selectedHero.heroId, selectedHero.name || ''));
      if (result?.ok) {
        if (typeof persistHubState === 'function') persistHubState(state, result.message || 'Hero renamed.');
        else flashHeroMenuMessage(result.message || 'Hero renamed.');
      } else flashHeroMenuMessage(result?.message || 'Rename blocked.');
      renderCharacterMenu(state, true);
    });
    manageRow.appendChild(renameBtn);
    const retireBtn = make('button', { className: 'btn', type: 'button', text: retireBlocked ? 'Retire Blocked' : 'Retire Hero', style: { padding: '8px 10px', opacity: retireBlocked ? '0.55' : '1' } });
    retireBtn.disabled = retireBlocked;
    retireBtn.addEventListener('click', () => {
      const result = retireHeroProfile(prog, selectedHero);
      if (result?.ok) {
        if (typeof persistHubState === 'function') persistHubState(state, result.message || 'Hero retired.');
        else flashHeroMenuMessage(result.message || 'Hero retired.');
      } else flashHeroMenuMessage(result?.message || 'Retire blocked.');
      renderCharacterMenu(state, true);
    });
    manageRow.appendChild(retireBtn);
    manageCard.appendChild(manageRow);
    right.appendChild(manageCard);
  }

  const createCard = make('div', { className: 'shopCard', style: { padding: '12px', border: '1px solid rgba(143,216,255,0.20)', boxShadow: '0 0 0 1px rgba(143,216,255,0.08) inset', background: 'linear-gradient(180deg, rgba(15,24,34,0.98), rgba(10,13,20,0.98))' } });
  createCard.appendChild(make('div', { className: 'name', text: 'Create Hero', style: { color: '#eaf8ff' } }));
  createCard.appendChild(make('div', { text: canCreateHero(prog) ? (savedCheckpointHero ? 'Choose the biome during hero creation. That biome is permanent for the hero; saved expeditions stay attached to their owning hero while the account wallet remains shared.' : 'Choose the biome during hero creation. That biome becomes the hero’s fixed nature with its own strengths and weaknesses while account resources stay shared.') : `Roster full: ${slotsUsed}/${slotsMax}.`, style: { marginTop: '8px', fontSize: '12px', lineHeight: '1.45', color: 'rgba(228,240,255,0.88)' } }));
  const input = make('input', {
    type: 'text',
    value: String(state?._heroCreateNameDraft || ''),
    placeholder: 'Optional hero name',
    maxlength: '24',
    style: { width: '100%', marginTop: '10px', padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(7,10,16,0.82)', color: '#eef7ff', outline: 'none' },
  });
  input.addEventListener('input', () => { state._heroCreateNameDraft = String(input.value || '').slice(0, 24); });
  createCard.appendChild(input);
  const raceGrid = make('div', { style: { marginTop: '10px', display: 'grid', gridTemplateColumns: portrait ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))', gap: '8px' } });
  ['mecha', 'electric', 'fire', 'ice', 'dark', 'light'].forEach((raceKey) => {
    const meta = ESSENCE_META[raceKey] || ESSENCE_META.mecha;
    const biomeMeta = getHeroBiomeMeta(raceKey);
    const btn = make('button', { className: 'btn', type: 'button', text: `${meta.label} • ${(biomeMeta.strengths || [])[0] || 'Biome'}`, style: { padding: '10px 8px', borderColor: `${meta.accent}66`, background: `linear-gradient(180deg, ${meta.accent}22, rgba(10,13,20,0.98))`, color: '#f4fbff', opacity: (!canCreateHero(prog) || createLocked) ? '0.55' : '1' } });
    btn.disabled = !canCreateHero(prog) || createLocked;
    btn.addEventListener('click', () => {
      if (createLocked) {
        flashHeroMenuMessage('Create Hero is temporarily locked.');
        return;
      }
      const created = createHeroForRace(prog, raceKey, { name: state?._heroCreateNameDraft || '' });
      if (!created) {
        flashHeroMenuMessage('Hero roster is full.');
        return;
      }
      state._heroCreateNameDraft = '';
      setHeroRosterSelectedId(state, created.heroId);
      if (typeof persistHubState === 'function') persistHubState(state, `${created.name} created with fixed ${meta.label} biome.`);
      else flashHeroMenuMessage(`${created.name} created with fixed ${meta.label} biome.`);
      renderCharacterMenu(state, true);
    });
    raceGrid.appendChild(btn);
  });
  createCard.appendChild(raceGrid);
  right.appendChild(createCard);

  const coopHeroEntries = buildCoopHeroSyncEntries(state);
  if (coopHeroEntries.length) {
    right.appendChild(renderSimpleInfoCard('LAN Hero Sync', coopHeroEntries.map((entry) => {
      const raceLabel = (ESSENCE_META[entry.raceKey] || ESSENCE_META.mecha).label;
      const who = entry.isLocal ? 'You' : entry.nickname;
      return `${who} → ${entry.heroName} • ${raceLabel} • ${entry.skillCount} active / ${entry.passiveCount} passive • Power ${entry.totalCardPower} • M${entry.masteryLevel}${entry.sameRaceCards > 0 ? ` • Same-biome ${entry.sameRaceCards}` : ''}`;
    }), { accent: 'rgba(143,216,255,0.22)', background: 'rgba(10,16,24,0.96)' }));
  }

  right.appendChild(renderSimpleInfoCard('Stage 2 Notes', [
    savedCheckpointHero ? `Saved expedition ownership is now explicit: ${savedCheckpointHero.name} currently owns Resume Floor ${savedCheckpointHero.resumeFloor || 0}.` : 'Heroes now exist as their own saved entities inside the account profile.',
    'Active hero switching projects that hero back into the current legacy hub/combat runtime.',
    'Hero-specific card loadouts are live now, including presets, safe roster management and batch dismantle tools in the Cards tab.',
  ], { accent: 'rgba(255,216,122,0.24)' }));

  wrap.appendChild(right);
  return wrap;
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

function getSkillDetailPayload(skillKey, level = 1) {
  const rows = getSkillDetailRows(skillKey, Math.max(1, level | 0));
  return { rows: Array.isArray(rows) ? rows : [] };
}

function getEquippedGearDefs(prog) {
  return getEquippedHubGearKeys(prog).map((key) => getHubGearDef(key)).filter(Boolean);
}


function getHeroStatValueMap(state, prog, statsData) {
  const activeHero = getActiveHero(prog);
  const activeHeroSummary = getActiveHeroSummary(prog);
  const renderCombatProfile = state?.player?._heroCombatProfile || prog?.heroCombatProfile || getHeroCombatProfile(prog, activeHero) || null;
  const mastery = getHeroBiomeMasterySummary(prog, activeHero?.heroId);
  const map = Object.create(null);
  for (const row of Array.isArray(statsData?.mainRows) ? statsData.mainRows : []) map[String(row?.label || '').toLowerCase()] = String(row?.value || '—');
  const hp = map['hp'] || `${Math.max(0, Math.round(state?.player?.hp || 0))}/${Math.max(1, Math.round(state?.player?.maxHP || 1))}`;
  const attack = map['damage'] || map['dps'] || '0';
  const power = String(Math.max(0, Number(activeHeroSummary?.totalCardPower || getHeroCombatProfile(prog, activeHero)?.summary?.totalCardPower || 0) | 0));
  const defense = String(Math.max(0, Math.round(((state?.player?.maxHP || 0) * 0.12) + (getEquippedHubGearKeys(prog).length * 42) + ((mastery?.level || 0) * 10))));
  return {
    name: String(activeHeroSummary?.name || prog?.nickname || 'Hero'),
    biome: (ESSENCE_META[activeHeroSummary?.race || activeHero?.race || 'mecha'] || ESSENCE_META.mecha).label,
    power,
    hp,
    attack,
    defense,
    mastery: `Lv ${Math.max(0, mastery?.level || 0)}`,
  };
}

function createHeroStageBase(accent = '#8fd8ff', height = 380) {
  const stage = make('div', { style: {
    position: 'relative', height: `${height}px`, minHeight: `${height}px`, borderRadius: '26px',
    background: 'radial-gradient(circle at 50% 34%, rgba(107,136,255,0.18), rgba(10,13,21,0.98) 66%)',
    border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', boxShadow: `0 0 0 1px ${accent}22 inset`
  } });
  stage.appendChild(make('div', { style: { position: 'absolute', left: '50%', top: '54%', transform: 'translate(-50%, -50%)', width: '180px', height: '180px', borderRadius: '50%', background: `radial-gradient(circle, ${accent}42, ${accent}08 70%)`, filter: 'blur(4px)' } }));
  return stage;
}

function renderHeroAvatarCore(state, prog, opts = {}) {
  const activeHeroSummary = getActiveHeroSummary(prog);
  const accent = getFrameAccent(activeHeroSummary?.race || 'mecha');
  const stage = createHeroStageBase(accent, opts.height || 360);
  const avatar = AVATARS[Math.max(0, prog?.avatarIndex | 0) % Math.max(1, AVATARS.length)] || '🧙';
  stage.appendChild(make('div', { text: String(activeHeroSummary?.name || prog?.nickname || 'Hero'), style: { position: 'absolute', left: '50%', top: '14px', transform: 'translateX(-50%)', fontSize: '16px', fontWeight: '800', color: '#fff3d0', letterSpacing: '0.03em' } }));
  stage.appendChild(make('div', { text: avatar, style: { position: 'absolute', left: '50%', top: '52%', transform: 'translate(-50%, -50%)', fontSize: '82px', lineHeight: '1', textShadow: '0 8px 22px rgba(0,0,0,0.42)' } }));
  stage.appendChild(make('div', { text: (ESSENCE_META[activeHeroSummary?.race || 'mecha'] || ESSENCE_META.mecha).label, style: { position: 'absolute', left: '50%', bottom: '18px', transform: 'translateX(-50%)', padding: '6px 12px', borderRadius: '999px', background: `${accent}26`, border: `1px solid ${accent}55`, color: '#f4fbff', fontSize: '12px', fontWeight: '800' } }));
  return stage;
}

function renderCompactHeroCard(state, prog, statsData) {
  const activeHero = getActiveHero(prog);
  const activeHeroSummary = getActiveHeroSummary(prog);
  const accent = getFrameAccent(activeHeroSummary?.race || 'mecha');
  const biomeMeta = getHeroBiomeMeta(activeHeroSummary?.race || activeHero?.race || 'mecha');
  const stats = getHeroStatValueMap(state, prog, statsData);
  const wrap = make('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(260px, 0.78fr) minmax(320px, 1.22fr)', gap: '14px', height: '100%', minHeight: '0' } });
  const left = make('div', { style: { minHeight: '0' } });
  left.appendChild(renderHeroAvatarCore(state, prog, { height: 360 }));
  wrap.appendChild(left);
  const right = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '0' } });
  const info = make('div', { style: { padding: '14px', borderRadius: '22px', border: `1px solid ${accent}44`, background: 'linear-gradient(180deg, rgba(16,20,30,0.98), rgba(8,11,18,0.98))', boxShadow: `0 0 0 1px ${accent}18 inset` } });
  info.appendChild(make('div', { text: 'Hero Data', style: { fontSize: '16px', fontWeight: '900', color: '#fff2cb', textTransform: 'uppercase', letterSpacing: '0.05em' } }));
  const chips = make('div', { style: { marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' } });
  [['Name', stats.name], ['Biome', stats.biome], ['Power', stats.power], ['HP', stats.hp], ['Attack', stats.attack], ['Defense', stats.defense], ['Mastery', stats.mastery]].forEach(([label, value]) => chips.appendChild(renderCharacterChip(label, value, `${accent}33`)));
  info.appendChild(chips);
  right.appendChild(info);
  right.appendChild(renderSimpleInfoCard('Biome Traits', [
    `Strengths: ${(biomeMeta?.strengths || []).join(' • ') || '—'}`,
    `Weaknesses: ${(biomeMeta?.weaknesses || []).join(' • ') || '—'}`,
    describeHeroBiomeRewardFlow(activeHeroSummary?.race || activeHero?.race || 'mecha'),
  ], { accent: `${accent}33` }));
  right.appendChild(renderSimpleInfoCard('Hero Notes', [
    'Hero window is intentionally compact for phone-landscape.',
    'Skills, Gear and Inventory each live on their own separate page now.',
  ], { accent: 'rgba(255,216,122,0.24)' }));
  wrap.appendChild(right);
  return wrap;
}

function getSelectedSkillCardEntry(state, filteredCards) {
  const selected = getCharacterSelection(state);
  const selectedId = String(selected?.key || '');
  const byCardId = filteredCards.find((entry) => entry.cardId === selectedId);
  if (byCardId) return byCardId;
  if (selected?.kind === 'skill') {
    const mappedCardId = getCardIdForSkill(selectedId);
    if (mappedCardId) {
      const bySkillKey = filteredCards.find((entry) => entry.cardId === mappedCardId);
      if (bySkillKey) return bySkillKey;
    }
  }
  return null;
}

function renderModernSkillDeckStage(state, prog, activeHero, selectedEntry, replaceFlow = null, pendingEntry = null) {
  const heroBiome = activeHero?.race || 'mecha';
  const accent = getFrameAccent(heroBiome);
  const stage = createHeroStageBase(accent, 318);
  stage.style.minWidth = '156px';
  stage.style.maxWidth = '156px';
  stage.style.borderRadius = '18px';
  const avatar = AVATARS[Math.max(0, prog?.avatarIndex | 0) % Math.max(1, AVATARS.length)] || '🧙';
  stage.appendChild(make('div', { text: String(activeHero?.name || prog?.nickname || 'Hero'), style: { position: 'absolute', left: '50%', top: '10px', transform: 'translateX(-50%)', fontSize: '13px', fontWeight: '900', color: '#fff3d0', maxWidth: '72%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }));
  stage.appendChild(make('div', { text: avatar, style: { position: 'absolute', left: '50%', top: '53%', transform: 'translate(-50%, -50%)', fontSize: '58px', lineHeight: '1' } }));
  const equipped = getHeroLoadoutEntries(prog, activeHero).skillCards || [];
  const leftY = ['78px', '146px', '214px'];
  const rightY = ['78px', '146px', '214px'];
  const isReplaceMode = !!String(replaceFlow?.pendingCardId || '').trim() && !!pendingEntry;
  for (let i = 0; i < 3; i++) {
    const entry = equipped[i] || null;
    const selectedSlot = isReplaceMode ? replaceFlow?.targetSlotIndex === i : (!!selectedEntry && entry?.cardId === selectedEntry.cardId);
    const btn = renderMenuSlot({
      label: '',
      title: entry ? entry.name : `Skill slot ${i + 1}`,
      accent: entry ? getFrameAccent(entry.race) : '#6a7386',
      icon: entry ? renderCardIcon(entry, 18) : null,
      empty: !entry,
      selected: selectedSlot,
      size: 38,
      onClick: entry ? (() => {
        if (isReplaceMode) {
          setSkillReplaceTargetSlot(state, i);
          renderCharacterMenu(state, true);
        } else selectCharacterEntry(state, { kind: 'card', key: entry.cardId });
      }) : null,
      showLabel: false,
    });
    btn.style.position = 'absolute'; btn.style.left = '10px'; btn.style.top = leftY[i];
    if (isReplaceMode) btn.style.boxShadow = selectedSlot ? `0 0 0 2px ${accent}88 inset, 0 0 14px ${accent}55` : '0 0 0 1px rgba(255,255,255,0.08) inset';
    stage.appendChild(btn);
  }
  for (let i = 0; i < 3; i++) {
    const slotIndex = i + 3;
    const entry = equipped[slotIndex] || null;
    const selectedSlot = isReplaceMode ? replaceFlow?.targetSlotIndex === slotIndex : (!!selectedEntry && entry?.cardId === selectedEntry.cardId);
    const btn = renderMenuSlot({
      label: '',
      title: entry ? entry.name : `Skill slot ${slotIndex + 1}`,
      accent: entry ? getFrameAccent(entry.race) : '#6a7386',
      icon: entry ? renderCardIcon(entry, 18) : null,
      empty: !entry,
      selected: selectedSlot,
      size: 38,
      onClick: entry ? (() => {
        if (isReplaceMode) {
          setSkillReplaceTargetSlot(state, slotIndex);
          renderCharacterMenu(state, true);
        } else selectCharacterEntry(state, { kind: 'card', key: entry.cardId });
      }) : null,
      showLabel: false,
    });
    btn.style.position = 'absolute'; btn.style.right = '10px'; btn.style.top = rightY[i];
    if (isReplaceMode) btn.style.boxShadow = selectedSlot ? `0 0 0 2px ${accent}88 inset, 0 0 14px ${accent}55` : '0 0 0 1px rgba(255,255,255,0.08) inset';
    stage.appendChild(btn);
  }
  if (isReplaceMode) {
    stage.appendChild(make('div', { text: 'Choose a slot to replace', style: { position: 'absolute', left: '50%', bottom: '42px', transform: 'translateX(-50%)', fontSize: '10px', fontWeight: '800', color: '#fff1c6', textAlign: 'center' } }));
  }
  stage.appendChild(make('div', { text: getBiomeEmoji(heroBiome), style: { position: 'absolute', left: '50%', bottom: '12px', transform: 'translateX(-50%)', padding: '5px 10px', borderRadius: '999px', background: `${accent}26`, border: `1px solid ${accent}55`, color: '#f4fbff', fontSize: '12px', fontWeight: '800', lineHeight: '1' } }));
  return stage;
}


function renderHeroSkillActivityPreview(prog, activeHero) {
  const layer = make('div', { style: { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '2' } });
  const entries = getHeroLoadoutEntries(prog, activeHero)?.skillCards || [];
  if (!entries.length) return layer;
  const positions = [
    { left: '27%', top: '28%' },
    { left: '73%', top: '28%' },
    { left: '20%', top: '50%' },
    { left: '80%', top: '50%' },
    { left: '31%', top: '70%' },
    { left: '69%', top: '70%' },
  ];
  const ring = make('div', { style: { position: 'absolute', left: '50%', top: '50%', width: '126px', height: '126px', transform: 'translate(-50%, -50%)', borderRadius: '50%', border: '1px dashed rgba(255,255,255,0.14)', boxShadow: '0 0 24px rgba(120,180,255,0.10) inset' } });
  layer.appendChild(ring);
  entries.slice(0, 6).forEach((entry, idx) => {
    const pos = positions[idx] || positions[0];
    const accent = getFrameAccent(entry?.race || 'mecha');
    const node = make('div', { style: { position: 'absolute', left: pos.left, top: pos.top, transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' } });
    const glow = make('div', { style: { position: 'absolute', width: '38px', height: '38px', borderRadius: '50%', background: `${accent}20`, filter: 'blur(5px)' } });
    node.appendChild(glow);
    const iconWrap = make('div', { style: { position: 'relative', zIndex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '999px', background: 'rgba(8,10,16,0.72)', border: `1px solid ${accent}88`, boxShadow: `0 0 0 1px ${accent}18 inset` } });
    iconWrap.appendChild(renderCardIcon(entry, 18));
    node.appendChild(iconWrap);
    node.appendChild(make('div', { text: String(entry?.name || '').slice(0, 10), style: { maxWidth: '56px', fontSize: '8px', fontWeight: '700', lineHeight: '1', textAlign: 'center', color: 'rgba(240,248,255,0.78)', textShadow: '0 1px 4px rgba(0,0,0,0.45)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }));
    const beam = make('div', { style: { position: 'absolute', left: '50%', top: '50%', width: idx % 2 === 0 ? '48px' : '34px', height: '1px', transform: `translate(-50%, -50%) rotate(${idx * 60}deg)`, background: `linear-gradient(90deg, transparent, ${accent}88, transparent)`, opacity: '0.85' } });
    layer.appendChild(beam);
    layer.appendChild(node);
  });
  layer.appendChild(make('div', { text: `Active skills: ${entries.map((entry) => String(entry?.name || '')).slice(0, 3).join(' • ')}${entries.length > 3 ? '…' : ''}`, style: { position: 'absolute', left: '50%', bottom: '36px', transform: 'translateX(-50%)', maxWidth: '82%', padding: '4px 8px', borderRadius: '999px', background: 'rgba(8,10,16,0.52)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(245,249,255,0.82)', fontSize: '9px', fontWeight: '700', textAlign: 'center', textShadow: '0 1px 4px rgba(0,0,0,0.45)' } }));
  return layer;
}

function renderModernSkillCard(state, prog, activeHero, entry, selected = false, opts = {}) {
  const accent = getFrameAccent(entry?.race || 'mecha');
  const actionPreview = getHeroLoadoutActionPreview(prog, entry?.cardId, activeHero);
  const isEquipped = actionPreview?.action === 'unequip' || !!entry?.isEquipped;
  const canEquip = !!actionPreview?.canEquip;
  const canUnequip = !!actionPreview?.canUnequip;
  const starsCount = Math.max(1, Number(entry?.currentStars || 1) || 1);
  const copies = Math.max(0, Number(entry?.copiesOwned || 0) || 0);
  const level = Math.max(1, Number(entry?.level || 1) || 1);
  const cardWidth = Math.max(84, Number(opts.width || 108) || 108);
  const cardHeight = Math.max(112, Number(opts.height || 126) || 126);
  const iconSize = Math.max(20, Number(opts.iconSize || 24) || 24);
  const titleSize = Math.max(8, Number(opts.titleSize || 8) || 8);
  const bodySize = Math.max(8, Number(opts.bodySize || 8) || 8);
  const buttonSize = Math.max(8, Number(opts.buttonSize || 8) || 8);
  const card = make('div', { style: {
    position: 'relative',
    height: `${cardHeight}px`,
    width: `${cardWidth}px`,
    maxWidth: `${cardWidth}px`,
    minWidth: `${cardWidth}px`,
    justifySelf: 'stretch',
    alignSelf: 'stretch',
    borderRadius: '3px',
    border: `2px solid ${selected ? accent : `${accent}b0`}`,
    background: 'linear-gradient(180deg, rgba(88,76,63,0.98), rgba(65,53,42,0.98) 18%, rgba(45,35,27,1) 52%, rgba(31,23,18,1) 100%)',
    boxShadow: selected ? `0 0 0 1px rgba(255,255,255,0.18) inset, 0 8px 16px rgba(0,0,0,0.26), 0 0 14px ${accent}20` : '0 0 0 1px rgba(255,255,255,0.06) inset, 0 3px 8px rgba(0,0,0,0.22)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    cursor: 'pointer'
  } });
  card.addEventListener('click', (ev) => {
    preserveSkillsMenuScrollFromNode(state, ev.currentTarget);
    selectCharacterEntry(state, { kind: 'card', key: entry.cardId });
  });

  const top = make('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '3px', padding: '2px 3px 0 3px' } });
  const raceMark = make('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: '1' } });
  raceMark.appendChild(make('div', { text: getBiomeEmoji(entry?.race || 'mecha'), style: { fontSize: '10px', fontWeight: '900', color: '#f7eddc', textShadow: '0 1px 1px rgba(0,0,0,0.45)', lineHeight: '1' } }));
  raceMark.appendChild(make('div', { text: `x${copies}`, style: { marginTop: '1px', fontSize: '7px', color: 'rgba(255,245,232,0.82)' } }));
  top.appendChild(raceMark);
  top.appendChild(make('div', { text: `Lv${level}`, style: { minWidth: '26px', textAlign: 'center', padding: '1px 4px', borderRadius: '999px', background: 'rgba(73,60,48,0.94)', border: '1px solid rgba(255,255,255,0.14)', fontSize: '8px', fontWeight: '900', color: '#fff8ed' } }));
  card.appendChild(top);

  const art = make('div', { style: {
    marginTop: '1px',
    marginLeft: '3px',
    marginRight: '3px',
    height: `${Math.max(42, Math.round(cardHeight * 0.38))}px`,
    borderRadius: '3px',
    border: `1px solid ${accent}70`,
    background: `radial-gradient(circle at 50% 24%, rgba(255,255,255,0.08), transparent 44%), linear-gradient(180deg, rgba(255,255,255,0.02), rgba(18,13,10,0.18)), linear-gradient(180deg, rgba(0,0,0,0.10), rgba(31,22,16,0.94))`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  } });
  art.appendChild(renderCardIcon(entry, iconSize));
  if (isEquipped) art.appendChild(make('div', { text: 'E', style: { position: 'absolute', top: '2px', right: '2px', width: '12px', height: '12px', borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(47,132,84,0.92)', border: '1px solid rgba(255,255,255,0.18)', color: '#effff6', fontSize: '7px', fontWeight: '900' } }));
  card.appendChild(art);

  card.appendChild(make('div', { text: String(entry?.name || 'Skill'), style: { marginTop: '3px', minHeight: `${Math.max(18, Math.round(cardHeight * 0.16))}px`, padding: '0 4px', fontSize: `${titleSize}px`, lineHeight: '1.10', fontWeight: '800', color: '#fff4e0', textAlign: 'center', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: '2', overflow: 'hidden', textShadow: '0 1px 1px rgba(0,0,0,0.4)' } }));
  card.appendChild(make('div', { text: '★'.repeat(starsCount), style: { marginTop: '1px', fontSize: `${Math.max(8, titleSize + 1)}px`, minHeight: `${Math.max(10, Math.round(cardHeight * 0.09))}px`, textAlign: 'center', letterSpacing: '0.03em', color: '#f0f0f0', textShadow: '0 1px 2px rgba(0,0,0,0.4)' } }));

  const btn = make('button', { className: 'btn', type: 'button', text: isEquipped ? 'Unequip' : 'Equip', style: {
    marginTop: 'auto',
    marginLeft: '3px',
    marginRight: '3px',
    marginBottom: '3px',
    padding: '3px 3px',
    fontSize: `${buttonSize}px`,
    borderRadius: '0 0 2px 2px',
    lineHeight: '1',
    minHeight: '16px',
    opacity: isEquipped ? (canUnequip ? '1' : '0.55') : (canEquip ? '1' : '0.55'),
    whiteSpace: 'nowrap',
    background: 'linear-gradient(180deg, #84d9ff, #3294e6)',
    border: '1px solid rgba(255,255,255,0.24)',
    color: '#ffffff',
    boxShadow: '0 1px 0 rgba(255,255,255,0.18) inset'
  } });
  btn.disabled = isEquipped ? !canUnequip : !canEquip;
  btn.addEventListener('click', (ev) => {
    preserveSkillsMenuScrollFromNode(state, ev.currentTarget);
    ev.stopPropagation();
    const latest = getHeroLoadoutActionPreview(prog, entry.cardId, activeHero);
    if (latest?.action === 'replace' && latest?.canEquip) {
      beginSkillReplaceFlow(state, entry.cardId);
      setSkillReplaceTargetSlot(state, -1);
      selectCharacterEntry(state, { kind: 'card', key: entry.cardId }, { rerender: false });
      renderCharacterMenu(state, true);
      return;
    }
    const latestEquipped = latest?.action === 'unequip';
    const result = latestEquipped ? unequipCardFromHero(prog, entry.cardId, activeHero) : equipCardOnHero(prog, entry.cardId, activeHero);
    if (result?.ok) {
      clearSkillReplaceFlow(state);
      if (typeof persistHubState === 'function') persistHubState(state, result.message || 'Skill deck updated.');
      else flashHeroMenuMessage(result.message || 'Skill deck updated.');
    } else flashHeroMenuMessage(result?.message || 'Deck action blocked.');
    selectCharacterEntry(state, { kind: 'card', key: entry.cardId }, { rerender: false });
    renderCharacterMenu(state, true);
  });
  card.appendChild(btn);
  return card;
}


function renderSkillReplacePanel(state, prog, activeHero, incomingEntry, targetEntry, targetSlotIndex = -1) {
  const incomingAccent = getFrameAccent(incomingEntry?.race || 'mecha');
  const targetAccent = getFrameAccent(targetEntry?.race || 'mecha');
  const wrap = make('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto', gap: '8px', alignItems: 'stretch', padding: '8px', borderRadius: '12px', border: '1px solid rgba(255,216,122,0.18)', background: 'linear-gradient(180deg, rgba(26,21,16,0.98), rgba(13,10,8,0.98))' } });
  function detail(entry, title, accent) {
    const box = make('div', { style: { minHeight: '90px', padding: '8px', borderRadius: '10px', border: `1px solid ${accent}66`, background: 'rgba(10,12,18,0.82)', display: 'flex', flexDirection: 'column', gap: '4px' } });
    box.appendChild(make('div', { text: title, style: { fontSize: '10px', fontWeight: '900', color: '#fff0c9', textTransform: 'uppercase', letterSpacing: '0.05em' } }));
    if (entry) {
      box.appendChild(make('div', { text: `${entry.name} • ${getBiomeEmoji(entry?.race || 'mecha')}`, style: { fontSize: '12px', fontWeight: '800', color: '#f4fbff' } }));
      let line = `Lv ${Math.max(1, Number(entry.level || 1) || 1)} • ${'★'.repeat(Math.max(1, Number(entry.currentStars || 1) || 1))}`;
      try {
        const skillDef = entry?.sourceKey ? getSkillDefByKey(entry.sourceKey) : null;
        const rows = skillDef ? (getSkillDetailRows(skillDef, Math.max(1, Number(entry.level || 1) || 1)) || []) : [];
        if (Array.isArray(rows) && rows.length) line += ` • ${rows[0]}`;
      } catch {}
      box.appendChild(make('div', { text: line, style: { fontSize: '10px', lineHeight: '1.3', color: 'rgba(214,232,255,0.78)' } }));
    } else {
      box.appendChild(make('div', { text: 'Tap one of the 6 equipped slots on the hero to choose which current skill to replace.', style: { fontSize: '11px', lineHeight: '1.35', color: 'rgba(214,232,255,0.72)' } }));
    }
    return box;
  }
  wrap.appendChild(detail(incomingEntry, 'Incoming skill', incomingAccent));
  wrap.appendChild(detail(targetEntry, targetEntry ? `Current slot ${Math.max(1, targetSlotIndex + 1)}` : 'Current slot', targetEntry ? targetAccent : 'rgba(255,255,255,0.24)'));
  const actions = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center', minWidth: '126px' } });
  const replaceBtn = make('button', { className: 'btn', type: 'button', text: 'Replace', style: { padding: '10px 12px', borderRadius: '10px', opacity: targetEntry ? '1' : '0.55' } });
  replaceBtn.disabled = !incomingEntry || !targetEntry || targetSlotIndex < 0;
  replaceBtn.addEventListener('click', () => {
    const result = replaceHeroSkillCardAtSlot(prog, incomingEntry?.cardId, targetSlotIndex, activeHero);
    if (result?.ok) {
      clearSkillReplaceFlow(state);
      if (typeof persistHubState === 'function') persistHubState(state, result.message || 'Skill replaced.');
      else flashHeroMenuMessage(result.message || 'Skill replaced.');
      selectCharacterEntry(state, { kind: 'card', key: incomingEntry?.cardId }, { rerender: false });
    } else flashHeroMenuMessage(result?.message || 'Replace blocked.');
    renderCharacterMenu(state, true);
  });
  const cancelBtn = make('button', { className: 'btn btnGhost', type: 'button', text: 'Cancel', style: { padding: '10px 12px', borderRadius: '10px' } });
  cancelBtn.addEventListener('click', () => {
    clearSkillReplaceFlow(state);
    renderCharacterMenu(state, true);
  });
  actions.appendChild(replaceBtn);
  actions.appendChild(cancelBtn);
  wrap.appendChild(actions);
  return wrap;
}

function renderSkillsPhoneLandscapeTab(state, prog) {
  try {
    const activeHero = getActiveHero(prog) || null;
    const heroBiome = String(activeHero?.race || 'mecha');
    const accent = getFrameAccent(heroBiome);
    const view = getHeroCardViewState(state);
    const allCards = listOwnedCardEntries(prog?.accountProfile?.cardCollection || {}, { equippedIds: getHeroEquippedCardIds(activeHero) }).filter((entry) => entry?.kind === 'skill');
    let filtered = allCards.slice();
    if (view?.kindFilter === 'equipped') filtered = filtered.filter((entry) => entry?.isEquipped);
    if (view?.raceFilter === 'hero') filtered = filtered.filter((entry) => String(entry?.race || '') === heroBiome);
    const selectedEntry = getSelectedSkillCardEntry(state, filtered.length ? filtered : allCards);
    const replaceFlow = getSkillReplaceState(state);
    const pendingCardId = String(replaceFlow?.pendingCardId || '').trim();
    const pendingEntry = pendingCardId ? (allCards.find((entry) => entry.cardId === pendingCardId) || null) : null;
    if (pendingCardId && !pendingEntry) clearSkillReplaceFlow(state);
    const effectiveReplaceFlow = pendingEntry ? getSkillReplaceState(state) : { pendingCardId: '', targetSlotIndex: -1 };
    const equippedEntries = getHeroLoadoutEntries(prog, activeHero).skillCards || [];
    const targetEntry = effectiveReplaceFlow.targetSlotIndex >= 0 ? (equippedEntries[effectiveReplaceFlow.targetSlotIndex] || null) : null;
    const viewportW = Math.max(760, Number(window.innerWidth || 1280) || 1280);
    const compactLayout = viewportW < 1180;
    const sideWidth = viewportW < 900 ? 156 : (compactLayout ? 172 : 196);
    const shellGap = viewportW < 900 ? 8 : 12;
    const totalWidth = Math.max(760, Math.min(1320, viewportW - 40));
    const centerWidth = Math.max(420, totalWidth - sideWidth * 2 - shellGap * 2);
    const sidePad = viewportW < 900 ? 14 : (compactLayout ? 18 : 26);
    const gridGapX = viewportW < 900 ? 8 : 12;
    const gridGapY = viewportW < 900 ? 10 : 14;
    const cardWidth = Math.max(56, Math.floor((centerWidth - sidePad * 2 - gridGapX * 5) / 6));
    const cardHeight = Math.max(82, Math.round(cardWidth * 1.33));
    const iconSize = viewportW < 900 ? 16 : 20;
    const titleSize = viewportW < 900 ? 7 : 8;
    const buttonSize = viewportW < 900 ? 7 : 8;
    const panelRadius = compactLayout ? '18px' : '22px';

    const wrap = make('div', { style: {
      display: 'grid',
      gridTemplateColumns: `${sideWidth}px ${centerWidth}px ${sideWidth}px`,
      justifyContent: 'center',
      gap: `${shellGap}px`,
      width: '100%',
      height: '100%',
      minHeight: '0',
      alignItems: 'stretch',
      overflow: 'hidden',
      boxSizing: 'border-box'
    } });

    const left = make('div', { style: { minHeight: '0', display: 'flex', flexDirection: 'column', width: `${sideWidth}px` } });
    const stage = renderModernSkillDeckStage(state, prog, activeHero, selectedEntry, effectiveReplaceFlow, pendingEntry);
    stage.style.width = `${sideWidth}px`;
    stage.style.minWidth = `${sideWidth}px`;
    stage.style.maxWidth = `${sideWidth}px`;
    stage.style.height = '100%';
    stage.style.minHeight = compactLayout ? '324px' : '336px';
    stage.style.borderRadius = panelRadius;
    stage.style.background = 'radial-gradient(circle at 50% 34%, rgba(107,136,255,0.20), rgba(8,12,20,0.985) 66%)';
    stage.style.border = '1px solid rgba(255,216,122,0.14)';
    stage.style.boxShadow = `0 0 0 1px ${accent}18 inset`;
    left.appendChild(stage);
    wrap.appendChild(left);

    const center = make('div', { style: { display: 'flex', flexDirection: 'column', gap: compactLayout ? '6px' : '8px', minHeight: '0', width: `${centerWidth}px`, overflow: 'hidden' } });

    if (pendingEntry) center.appendChild(renderSkillReplacePanel(state, prog, activeHero, pendingEntry, targetEntry, effectiveReplaceFlow.targetSlotIndex));

    const gridWrap = make('div', { style: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      gap: '0px',
      minHeight: '0',
      padding: compactLayout ? '8px 8px 8px 8px' : '10px 10px 10px 10px',
      borderRadius: panelRadius,
      border: '1px solid rgba(255,216,122,0.14)',
      background: 'linear-gradient(180deg, rgba(8,12,20,0.985), rgba(4,7,13,0.98))',
      overflow: 'hidden',
      flex: '1 1 auto',
      opacity: pendingEntry ? '0.22' : '1',
      pointerEvents: pendingEntry ? 'none' : 'auto'
    } });

    const deckViewport = make('div', { style: { position: 'relative', minHeight: '0', flex: '1 1 auto', overflow: 'hidden' } });
    const scroller = make('div', { style: {
      display: 'grid',
      gridTemplateColumns: `repeat(6, ${cardWidth}px)`,
      gridAutoRows: `${cardHeight}px`,
      justifyContent: 'center',
      alignContent: 'start',
      columnGap: `${gridGapX}px`,
      rowGap: `${gridGapY}px`,
      overflowX: 'hidden',
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch',
      minHeight: '0',
      height: '100%',
      flex: '1 1 auto',
      scrollbarWidth: 'thin',
      padding: `8px ${sidePad}px ${Math.max(cardHeight + gridGapY + 8, 24)}px ${sidePad}px`,
      boxSizing: 'border-box'
    } });
    scroller.className = 'skill-vertical-grid';
    scroller.dataset.skillGridScroller = '1';
    restoreSkillsMenuScroll(state, scroller);
    scroller.addEventListener('scroll', () => setSkillsMenuScrollTop(state, scroller.scrollTop), { passive: true });

    if (!filtered.length) {
      scroller.appendChild(make('div', { text: 'No skills in this view.', style: { gridColumn: '1 / -1', alignSelf: 'center', padding: '28px 0', textAlign: 'center', color: 'rgba(214,232,255,0.46)' } }));
    } else {
      for (const entry of filtered) {
        scroller.appendChild(renderModernSkillCard(state, prog, getActiveHero(prog), entry, selectedEntry?.cardId === entry.cardId, {
          width: cardWidth,
          height: cardHeight,
          iconSize,
          titleSize,
          buttonSize,
        }));
      }
    }

    deckViewport.appendChild(scroller);
    gridWrap.appendChild(deckViewport);

    center.appendChild(gridWrap);
    wrap.appendChild(center);

    const right = make('div', { style: { display: 'flex', flexDirection: 'column', minHeight: '0', overflow: 'hidden', width: `${sideWidth}px` } });
    const infoCard = selectedEntry
      ? renderHeroSelectedCardSummary(state, prog, selectedEntry, activeHero, { compact: true, tight: true, noActionButton: true, placeholder: false })
      : renderSimpleInfoCard('', ['Выберите скилл для просмотра подробной информации.'], { accent: 'rgba(143,216,255,0.26)', background: 'linear-gradient(180deg, rgba(12,16,26,0.98), rgba(5,8,14,0.98))' });
    infoCard.style.width = '100%';
    infoCard.style.maxWidth = '100%';
    infoCard.style.minWidth = '0';
    infoCard.style.height = '100%';
    infoCard.style.minHeight = '0';
    infoCard.style.overflow = 'hidden';
    infoCard.style.boxSizing = 'border-box';
    right.appendChild(infoCard);
    wrap.appendChild(right);
    return wrap;
  } catch (err) {
    console.error('renderSkillsPhoneLandscapeTab hard fallback', err);
    const fail = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px', height: '100%', borderRadius: '16px', border: '1px solid rgba(255,120,120,0.24)', background: 'linear-gradient(180deg, rgba(18,22,34,0.98), rgba(8,10,16,0.98))' } });
    fail.appendChild(make('div', { text: 'Skills', style: { fontSize: '16px', fontWeight: '900', color: '#fff2cf' } }));
    fail.appendChild(make('div', { text: 'Skills failed to render fully. Safe fallback is shown.', style: { fontSize: '12px', lineHeight: '1.45', color: 'rgba(214,232,255,0.78)' } }));
    const safeCards = listOwnedCardEntries(prog?.accountProfile?.cardCollection || {}).filter((entry) => entry?.kind === 'skill').slice(0, 12);
    const grid = make('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(6, 92px)', gap: '10px', justifyContent: 'center' } });
    safeCards.forEach((entry) => grid.appendChild(renderModernSkillCard(state, prog, getActiveHero(prog), entry, false, { width: 92, height: 122, iconSize: 20, titleSize: 8, buttonSize: 8 })));
    fail.appendChild(grid);
    return fail;
  }
}

function getPseudoGearAssignments(prog) {
  const modules = getHubGearDefsBySlot('module').filter((def) => isHubGearEquipped(prog, def.key));
  const relic = getHubGearDefsBySlot('relic').find((def) => isHubGearEquipped(prog, def.key)) || null;
  const coreItem = getHubGearDefsBySlot('coreItem').find((def) => isHubGearEquipped(prog, def.key)) || null;
  return {
    weapon: modules[0] || null,
    helmet: relic,
    armor: coreItem,
    gloves: modules[1] || null,
    boots: null,
    accessory: null,
  };
}

function renderGearDeckStage(state, prog, selectedKey = '') {
  const activeHeroSummary = getActiveHeroSummary(prog);
  const accent = getFrameAccent(activeHeroSummary?.race || 'mecha');
  const assigned = getPseudoGearAssignments(prog);
  const stage = createHeroStageBase(accent, 372);
  const avatar = AVATARS[Math.max(0, prog?.avatarIndex | 0) % Math.max(1, AVATARS.length)] || '🧙';
  stage.appendChild(make('div', { text: String(activeHeroSummary?.name || prog?.nickname || 'Hero'), style: { position: 'absolute', left: '50%', top: '14px', transform: 'translateX(-50%)', fontSize: '15px', fontWeight: '900', color: '#fff3d0' } }));
  stage.appendChild(make('div', { text: avatar, style: { position: 'absolute', left: '50%', top: '53%', transform: 'translate(-50%, -50%)', fontSize: '78px', lineHeight: '1' } }));
  const leftSlots = [
    { key: 'helmet', label: 'Helmet', top: '86px' },
    { key: 'weapon', label: 'Weapon', top: '168px' },
    { key: 'gloves', label: 'Gloves', top: '250px' },
  ];
  const rightSlots = [
    { key: 'armor', label: 'Armor', top: '86px' },
    { key: 'boots', label: 'Boots', top: '168px' },
    { key: 'accessory', label: 'Accessory', top: '250px' },
  ];
  for (const slot of leftSlots) {
    const def = assigned[slot.key] || null;
    const btn = renderMenuSlot({
      label: '', title: def ? def.name : `${slot.label} slot`, accent: def ? getFrameAccent(getGearPrimaryBiomeKey(def)) : '#6a7386',
      icon: def ? renderGearIcon(def, 24) : null, empty: !def, selected: !!def && String(def.key || '') === String(selectedKey || ''),
      size: 62, onClick: def ? (() => selectCharacterEntry(state, { kind: 'gear', key: def.key })) : null, showLabel: false,
    });
    btn.style.position = 'absolute'; btn.style.left = '18px'; btn.style.top = slot.top; stage.appendChild(btn);
  }
  for (const slot of rightSlots) {
    const def = assigned[slot.key] || null;
    const btn = renderMenuSlot({
      label: '', title: def ? def.name : `${slot.label} slot`, accent: def ? getFrameAccent(getGearPrimaryBiomeKey(def)) : '#6a7386',
      icon: def ? renderGearIcon(def, 24) : null, empty: !def, selected: !!def && String(def.key || '') === String(selectedKey || ''),
      size: 62, onClick: def ? (() => selectCharacterEntry(state, { kind: 'gear', key: def.key })) : null, showLabel: false,
    });
    btn.style.position = 'absolute'; btn.style.right = '18px'; btn.style.top = slot.top; stage.appendChild(btn);
  }
  return stage;
}

function renderModernGearCard(state, prog, def, selected = false) {
  const accent = getFrameAccent(getGearPrimaryBiomeKey(def));
  const owned = isHubGearOwned(prog, def.key);
  const equipped = isHubGearEquipped(prog, def.key);
  const canEquip = owned;
  const card = make('div', { style: { position: 'relative', height: '156px', borderRadius: '16px', padding: '8px', border: `2px solid ${selected ? accent : `${accent}66`}`, background: 'linear-gradient(180deg, rgba(26,30,42,0.98), rgba(11,13,20,0.98))', boxShadow: selected ? `0 0 0 1px ${accent}55 inset, 0 12px 24px ${accent}24` : `0 0 0 1px ${accent}22 inset`, display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'hidden' } });
  card.addEventListener('click', () => selectCharacterEntry(state, { kind: 'gear', key: def.key }));
  const top = make('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '6px' } });
  top.appendChild(make('div', { text: String(def.slot || 'gear').toUpperCase(), style: { fontSize: '10px', fontWeight: '900', color: '#fff2cc', letterSpacing: '0.08em' } }));
  top.appendChild(make('div', { text: owned ? (equipped ? 'ON' : 'OWNED') : 'LOCKED', style: { padding: '3px 7px', borderRadius: '999px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)', fontSize: '10px', fontWeight: '900', color: '#eef7ff' } }));
  card.appendChild(top);
  const art = make('div', { style: { flex: '1 1 auto', borderRadius: '14px', border: `1px solid ${accent}44`, background: `radial-gradient(circle at 50% 28%, ${accent}48, rgba(18,20,28,0.98) 78%)`, display: 'flex', alignItems: 'center', justifyContent: 'center' } });
  art.appendChild(renderGearIcon(def, 42));
  card.appendChild(art);
  card.appendChild(make('div', { text: def.name, style: { minHeight: '28px', fontSize: '11px', lineHeight: '1.15', fontWeight: '800', color: '#fff4d6', textAlign: 'center' } }));
  const btn = make('button', { className: 'btn', type: 'button', text: equipped ? 'Unequip' : 'Equip', style: { padding: '6px 8px', fontSize: '10px', borderRadius: '10px', opacity: canEquip ? '1' : '0.55' } });
  btn.disabled = !canEquip;
  btn.addEventListener('click', (ev) => {
    preserveSkillsMenuScrollFromNode(state, ev.currentTarget);
    ev.stopPropagation();
    if (!owned) return;
    const ok = equipped ? unequipHubGear(prog, def.key) : equipHubGear(prog, def.key);
    if (ok) {
      if (typeof persistHubState === 'function') persistHubState(state, equipped ? `${def.name} unequipped.` : `${def.name} equipped.`);
      else flashHeroMenuMessage(equipped ? `${def.name} unequipped.` : `${def.name} equipped.`);
    } else flashHeroMenuMessage('Gear action blocked.');
    renderCharacterMenu(state, true);
  });
  card.appendChild(btn);
  return card;
}

function renderGearPhoneLandscapeTab(state, prog) {
  const gearDefs = HUB_GEAR_DEFS.slice().sort((a, b) => Number(isHubGearEquipped(prog, b.key)) - Number(isHubGearEquipped(prog, a.key)) || String(a.name || '').localeCompare(String(b.name || '')));
  const selected = getCharacterSelection(state);
  const selectedKey = String(selected?.key || '');
  const wrap = make('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(300px, 0.40fr) minmax(0, 0.60fr)', gap: '12px', height: '100%', minHeight: '0' } });
  const left = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '0' } });
  left.appendChild(renderGearDeckStage(state, prog, selectedKey));
  left.appendChild(renderSimpleInfoCard('Gear Layout', [
    '6 visual slots: weapon, helmet, armor, gloves, boots, accessory.',
    'Current backend still comes from module / relic / core-item foundation, so some visual slots can stay empty until the full 6-slot gear backend is built.',
  ], { accent: 'rgba(255,216,122,0.22)' }));
  wrap.appendChild(left);
  const right = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '0', overflow: 'hidden' } });
  const head = make('div', { style: { padding: '12px 14px', borderRadius: '18px', border: '1px solid rgba(255,216,122,0.14)', background: 'linear-gradient(180deg, rgba(16,19,28,0.98), rgba(8,11,18,0.96))' } });
  head.appendChild(make('div', { text: 'Gear', style: { fontSize: '15px', fontWeight: '900', color: '#fff1cb' } }));
  head.appendChild(make('div', { text: 'Hero gear view follows the DH5-style split: hero on the left, equipable cards on the right.', style: { marginTop: '6px', fontSize: '12px', lineHeight: '1.4', color: 'rgba(214,232,255,0.78)' } }));
  right.appendChild(head);
  const gridWrap = make('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px', minHeight: '0', overflowY: 'auto', padding: '10px', borderRadius: '18px', border: '1px solid rgba(255,216,122,0.14)', background: 'linear-gradient(180deg, rgba(16,19,28,0.98), rgba(8,11,18,0.96))' } });
  for (const def of gearDefs) gridWrap.appendChild(renderModernGearCard(state, prog, def, selectedKey === def.key));
  right.appendChild(gridWrap);
  wrap.appendChild(right);
  return wrap;
}

function renderInventoryPhoneLandscapeTab(state, prog) {
  const wrap = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', height: '100%', minHeight: '0' } });
  wrap.appendChild(renderSimpleInfoCard('Inventory', ['Inventory follows Example 4: no hero on the page, only item grids.', 'Use Gear for equipping; Inventory is for browsing everything you own.'], { accent: 'rgba(159,214,255,0.22)' }));
  const grids = make('div', { style: { display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '12px', minHeight: '0', flex: '1 1 auto', overflow: 'hidden' } });
  const gearCol = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '0', overflowY: 'auto', paddingRight: '4px' } });
  gearCol.appendChild(renderCharacterSectionTitle('Gear Inventory', 'Owned gear pieces.'));
  gearCol.appendChild(renderInventorySlotGrid(HUB_GEAR_DEFS, (def) => renderInventoryGearCard(prog, def), 4));
  grids.appendChild(gearCol);
  const resCol = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '0', overflowY: 'auto', paddingRight: '4px' } });
  resCol.appendChild(renderCharacterSectionTitle('Materials & Parts', 'Resources earned in expeditions.'));
  const materialItems = HUB_MATERIAL_KEYS.map((key) => ({ key, count: Math.max(0, prog?.materials?.[key] | 0) }));
  resCol.appendChild(renderInventorySlotGrid(materialItems, ({ key, count }) => { const meta = MATERIAL_META[key] || MATERIAL_META.salvage; return renderMenuSlot({ label: meta.short, title: meta.label, accent: String(meta.accent || '#bcd8ff'), icon: make('div', { text: key === 'coreShard' ? '✦' : (key === 'alloy' ? '⬢' : '◈'), style: { color: meta.accent, fontSize: '20px' } }), empty: count <= 0, selected: false, badge: String(count) }); }, 3));
  const partItems = HUB_GEAR_DEFS.map((def) => ({ def, count: getGearPartCount(prog, def.key) })).filter((it) => it.count > 0 || getHubGearPartCost(it.def) > 0);
  resCol.appendChild(renderCharacterSectionTitle('Parts', 'Crafting progress per item.'));
  resCol.appendChild(renderInventorySlotGrid(partItems, ({ def, count }) => renderMenuSlot({ label: def.short || def.name, title: `${def.name} Parts`, accent: getFrameAccent(getGearPrimaryBiomeKey(def)), icon: renderGearIcon(def, 28), empty: count <= 0, selected: false, badge: `${count}/${getHubGearPartCost(def)}` }), 3));
  grids.appendChild(resCol);
  wrap.appendChild(grids);
  return wrap;
}

function renderOptionsPhoneLandscapeTab(state, prog, portrait = false) {
  const wrap = make('div', { style: { display: 'grid', gridTemplateColumns: portrait ? '1fr' : '0.95fr 1.05fr', gap: '12px', height: '100%', minHeight: '0' } });
  wrap.appendChild(renderSimpleInfoCard('Options', ['Hub lower navigation replaces the old HUD Hero / Build buttons while you are inside the hub.', 'Skills only shows skill cards now: no upgrade, fusion or forge blocks in that menu.', 'Use the dedicated hub wings if you later want deeper progression systems.'], { accent: 'rgba(159,214,255,0.22)' }));
  wrap.appendChild(renderHeroRosterTab(state, prog, portrait));
  return wrap;
}

export function renderCharacterMenu(state, force = false) {
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
  const activeHero = getActiveHero(prog);
  const activeHeroSummary = getActiveHeroSummary(prog);
  let defaultSelection = { kind: 'overview', key: 'overview' };
  try {
    defaultSelection = tab === 'skills'
      ? getDefaultCardSelection(state, prog)
      : (tab === 'gear'
        ? { kind: 'gearHint', key: 'gear' }
        : (tab === 'inventory'
          ? { kind: 'inventoryHint', key: 'inventory' }
          : { kind: 'overview', key: 'overview' }));
  } catch (err) {
    console.error('default character selection failed', err);
  }
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
  const key = JSON.stringify({ tab, portrait, avatar: prog?.avatarIndex, aura: prog?.auraId, coreKey, selected, activeHeroId: activeHeroSummary?.heroId || prog?.activeHeroId, activeHeroName: activeHeroSummary?.name || prog?.nickname, heroCount: Array.isArray(prog?.heroes) ? prog.heroes.length : 0, cardCount: Object.keys(prog?.accountProfile?.cardCollection?.cards || {}).length, gearCount: Object.keys(prog.gearInventory || {}).length, partCount: Object.keys(prog.gearParts || {}).length, matCount: Object.keys(prog.materials || {}).length, essCount: Object.keys(prog.essences || {}).length, activeKeys: Object.keys(player?.runSkills || renderCombatProfile?.skillTiers || {}), passiveKeys: Object.keys(player?.runPassives || renderCombatProfile?.passiveTiers || {}), hp: player?.hp, maxHP: player?.maxHP, statsExpanded, sceneHeight, rosterSelected: state?._heroRosterSelectedId || '' });
  if (!force && renderCharacterMenu._key === key) return;
  renderCharacterMenu._key = key;

  if (el.characterOverlay) {
    el.characterOverlay.style.padding = tab === 'skills'
      ? '8px 10px calc(56px + env(safe-area-inset-bottom, 0px))'
      : '8px 10px calc(72px + env(safe-area-inset-bottom, 0px))';
  }
  if (el.characterPanel) {
    el.characterPanel.style.width = portrait ? 'min(980px, calc(100vw - 12px))' : 'min(1320px, calc(100vw - 12px))';
    const panelHeight = tab === 'skills' ? 'calc(100vh - 66px)' : 'calc(100vh - 82px)';
    el.characterPanel.style.height = panelHeight;
    el.characterPanel.style.maxHeight = panelHeight;
    el.characterPanel.style.overflow = 'hidden';
    el.characterPanel.style.background = 'linear-gradient(180deg, rgba(14,18,28,0.99), rgba(8,10,16,0.99))';
    el.characterPanel.style.border = '1px solid rgba(255,216,122,0.20)';
    el.characterPanel.style.boxShadow = '0 18px 54px rgba(0,0,0,0.42), 0 0 0 1px rgba(255,255,255,0.04) inset';
  }
  if (el.characterLayout) {
    el.characterLayout.style.flexDirection = 'row';
    el.characterLayout.style.gap = '0px';
    el.characterLayout.style.flex = '1 1 auto';
    el.characterLayout.style.minHeight = '0';
    el.characterLayout.style.height = '100%';
  }
  if (el.characterLeft) {
    el.characterLeft.style.flex = '0 0 0px';
    el.characterLeft.style.minWidth = '0';
    el.characterLeft.style.width = '0';
    el.characterLeft.style.minHeight = '0';
    el.characterLeft.style.overflow = 'hidden';
    el.characterLeft.style.display = 'none';
  }
  if (el.characterRight) {
    el.characterRight.style.flex = '1 1 100%';
    el.characterRight.style.minHeight = '0';
    el.characterRight.style.overflow = 'hidden';
  }
  if (el.characterHeader) { el.characterHeader.style.display = 'none'; }
  if (el.characterTitle) { el.characterTitle.textContent = ''; el.characterTitle.style.display = 'none'; }
  if (el.characterHp) el.characterHp.textContent = `${Math.max(0, Math.round(player?.hp || 0))}/${Math.max(1, Math.round(player?.maxHP || 1))} HP`;
  if (el.characterWallet) { el.characterWallet.innerHTML = ''; el.characterWallet.style.display = 'none'; }
  if (el.characterContent) { el.characterContent.style.flex = '1 1 auto'; el.characterContent.style.minHeight = '0'; el.characterContent.style.overflow = 'hidden'; }

  el.characterTabs.innerHTML = '';
  if (el.characterTabs) { el.characterTabs.style.display = 'none'; el.characterTabs.style.gridTemplateColumns = 'repeat(5, minmax(0, 1fr))'; el.characterTabs.style.gap = '8px'; el.characterTabs.style.flexWrap = 'nowrap'; }
  for (const [tabKey, meta] of Object.entries(CHARACTER_TABS)) {
    const active = tabKey === tab;
    const btn = make('button', {
      className: 'btn',
      type: 'button',
      text: meta.label,
      style: {
        padding: '8px 12px',
        minWidth: '0',
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
  const heroName = make('div', { text: String(activeHeroSummary?.name || prog?.nickname || player?.nickname || 'Hero'), style: { position: 'absolute', left: '50%', top: '10px', transform: 'translateX(-50%)', zIndex: '3', fontSize: '14px', fontWeight: '800', color: '#fff3d0', textShadow: '0 2px 12px rgba(0,0,0,0.58)', whiteSpace: 'nowrap', maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' } });
  heroScene.appendChild(heroName);
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
  center.appendChild(make('div', { text: avatar, style: { position: 'relative', zIndex: '3', fontSize: `${avatarSize}px`, lineHeight: '1', textShadow: '0 8px 24px rgba(0,0,0,0.36)' } }));
  heroScene.appendChild(center);
  if (tab === 'skills' || tab === 'gear') heroScene.appendChild(renderHeroSkillActivityPreview(prog, activeHero));
  if (tab === 'overview' && selected?.kind === 'skill') {
    try {
      const popupDef = getSkillDefByKey(selected.key);
      const popupLv = getProjectedSkillTier(selected.key, { player: state?.player, heroCombatProfile: state?.player?._heroCombatProfile || prog?.heroCombatProfile || null, fallbackRace: prog?.selectedStarterLoadout || 'mecha', isCore: false }) || 1;
      if (popupDef) heroScene.appendChild(createSkillPopup(popupDef, popupLv, getFrameAccent(getSkillBiomeKey(selected.key))));
    } catch {}
  }
  previewCard.appendChild(heroScene);
  el.characterLeft.appendChild(previewCard);

  const activeSkillScroller = el.characterContent?.querySelector?.('.skill-vertical-grid') || null;
  if (tab === 'skills' && activeSkillScroller) setSkillsMenuScrollTop(state, activeSkillScroller.scrollTop);
  el.characterContent.innerHTML = '';

  if (tab === 'overview') {
    el.characterContent.appendChild(renderCompactHeroCard(state, prog, statsData));
  } else if (tab === 'skills') {
    try {
      el.characterContent.appendChild(renderSkillsPhoneLandscapeTab(state, prog));
    } catch (err) {
      console.error('Skills tab render failed', err);
      const fail = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px', borderRadius: '16px', border: '1px solid rgba(255,120,120,0.24)', background: 'linear-gradient(180deg, rgba(18,22,34,0.98), rgba(8,10,16,0.98))' } });
      fail.appendChild(make('div', { text: 'Skills', style: { fontSize: '16px', fontWeight: '900', color: '#fff2cf' } }));
      fail.appendChild(make('div', { text: 'The Skills screen failed to render. A safe fallback opened instead.', style: { fontSize: '12px', lineHeight: '1.45', color: 'rgba(214,232,255,0.78)' } }));
      const cards = listOwnedCardEntries(prog?.accountProfile?.cardCollection).filter((entry) => entry?.kind === 'skill').slice(0, 12);
      const grid = make('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(6, 88px)', gap: '4px' } });
      for (const entry of cards) grid.appendChild(renderModernSkillCard(state, prog, getActiveHero(prog), entry, false));
      fail.appendChild(grid);
      el.characterContent.appendChild(fail);
    }
  } else if (tab === 'gear') {
    el.characterContent.appendChild(renderGearPhoneLandscapeTab(state, prog));
  } else if (tab === 'inventory') {
    el.characterContent.appendChild(renderInventoryPhoneLandscapeTab(state, prog));
  } else if (tab === 'settings') {
    el.characterContent.appendChild(renderOptionsPhoneLandscapeTab(state, prog, portrait));
  }

  el.characterOverlay.style.display = 'flex';
  const anchor = state?._characterMenuAnchor || null;
  const animateTick = Number(state?._characterMenuAnimateTick || 0) || 0;
  const shouldAnimateOpen = !!anchor && renderCharacterMenu._animateTick !== animateTick;
  if (shouldAnimateOpen) renderCharacterMenu._animateTick = animateTick;
  if (el.characterPanel && anchor && shouldAnimateOpen) {
    try {
      const rect = el.characterPanel.getBoundingClientRect();
      const px = Math.max(6, Math.min(94, ((Number(anchor.x || 0) - rect.left) / Math.max(1, rect.width)) * 100));
      const py = Math.max(72, Math.min(126, ((Number(anchor.y || 0) - rect.top) / Math.max(1, rect.height)) * 100));
      const startX = (Number(anchor.x || 0) - (rect.left + rect.width * 0.5)) * 0.22;
      const startY = (Number(anchor.y || 0) - (rect.top + rect.height * 0.9)) * 0.22;
      el.characterPanel.style.transformOrigin = `${px}% ${py}%`;
      if (typeof el.characterPanel.animate === 'function') {
        el.characterPanel.animate([
          { transform: `translate(${startX}px, ${startY}px) scale(0.18)`, opacity: 0.34, filter: 'blur(1.5px)' },
          { transform: `translate(${startX * 0.35}px, ${startY * 0.35}px) scale(0.72)`, opacity: 0.82, filter: 'blur(0.3px)' },
          { transform: 'translate(0px, 0px) scale(1)', opacity: 1, filter: 'blur(0px)' }
        ], { duration: 260, easing: 'cubic-bezier(0.18, 0.88, 0.22, 1)' });
      }
    } catch {}
  }
}

