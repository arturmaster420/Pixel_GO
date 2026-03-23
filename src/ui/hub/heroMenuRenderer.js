import { AVATARS } from "../../core/avatars.js";
import { AURA_NAMES } from "../../core/auras.js";
import { STARTER_LOADOUTS, getCoreIdentity, getPassiveRouteMeta, getSkillRouteMeta } from "../../core/starterLoadouts.js";
import { RUN_PASSIVES, RUN_SKILLS, getVisibleOwnedRunSkills } from "../../core/runUpgrades.js";
import { ESSENCE_META, HUB_GEAR_DEFS, HUB_MATERIAL_KEYS, MATERIAL_META, ensureHubProgression, getEquippedHubGearKeys, getGearPartCount, getGearPrimaryBiomeKey, getGearSourceBiomes, getHubBuildAvailableSp, getHubBuildSpentPoints, getHubCoreKey, getHubGearDef, getHubGearDefsBySlot, getHubGearPartCost, isHubGearEquipped, isHubGearOwned } from "../../core/hubBuild.js";
import { getStatsData } from "../hud.js";
import { getSkillDetailRows } from "../../weapons/skillPresentation.js";
import { CHARACTER_TABS, getCharacterSelection, getCharacterTab, sameCharacterSelection, setCharacterSelection, setCharacterTab } from "./hubUiState.js";
import { getFrameAccent, getPassiveBiomeKey, getPassiveDefByKey, getSkillBiomeKey, getSkillDefByKey, renderCharacterChip, renderCharacterSectionTitle, renderHeroEquipmentSlot, renderGearIcon, renderMenuSlot, renderSkillIcon, renderWalletBar } from "./hubViewShared.js";

let el = {};
let make = null;

export function configureHeroMenuRenderer(deps = {}) {
  if (deps.el && typeof deps.el === 'object') el = deps.el;
  if (typeof deps.make === 'function') make = deps.make;
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
    const detail = getSkillDetailPayload(def.key, Math.max(1, level | 0));
    const detailRows = Array.isArray(detail.rows) ? detail.rows.slice(0, 12).map((row) => `${row.label}: ${row.value}`) : [];
    appendDetailLines(body, [
      def?.desc ? String(def.desc) : `${String(routeMeta.style || 'Skill effect')}.`,
      `Biome frame: ${String((ESSENCE_META[biomeKey] || ESSENCE_META.mecha).label)}`,
      `Level: ${Math.max(1, level | 0)}${sel.isCore ? ' • Core skill' : ''}`,
      `Role: ${String(routeMeta.role || 'combat skill')} • Style: ${String(routeMeta.style || 'general expedition value')}`,
      ...detailRows,
      !detailRows.length ? 'Damage, cooldown and rank rows will appear here for this skill when defined in presentation data.' : '',
      'Read-only in Hero Menu. Manage ownership caps and SP allocation at Arsenal Wing NPC.',
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

function getSkillDetailPayload(skillKey, level = 1) {
  const rows = getSkillDetailRows(skillKey, Math.max(1, level | 0));
  return { rows: Array.isArray(rows) ? rows : [] };
}

function getEquippedGearDefs(prog) {
  return getEquippedHubGearKeys(prog).map((key) => getHubGearDef(key)).filter(Boolean);
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
  if (el.characterTitle) { el.characterTitle.textContent = ''; el.characterTitle.style.display = 'none'; }
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
  const heroName = make('div', { text: String(prog?.nickname || player?.nickname || 'Hero'), style: { position: 'absolute', left: '50%', top: '10px', transform: 'translateX(-50%)', zIndex: '3', fontSize: '14px', fontWeight: '800', color: '#fff3d0', textShadow: '0 2px 12px rgba(0,0,0,0.58)', whiteSpace: 'nowrap', maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' } });
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

