export const BUILD_BRANCH_META = {
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

export const CHARACTER_TABS = {
  overview: { label: 'Hero', title: 'Hero Window' },
  skills: { label: 'Skills', title: 'Skills' },
  gear: { label: 'Gear', title: 'Hero Gear' },
  inventory: { label: 'Inventory', title: 'Inventory' },
  settings: { label: 'Options', title: 'Options & Hints' },
};

export function normalizeBuildFocus(raw) {
  const key = String(raw || 'all').trim().toLowerCase();
  return BUILD_BRANCH_META[key] ? key : 'all';
}

export function getBuildFocus(state) {
  return normalizeBuildFocus(state?._hubBuildFocus || 'all');
}

export function setBuildFocus(state, focus) {
  if (!state) return 'all';
  const next = normalizeBuildFocus(focus);
  state._hubBuildFocus = next;
  return next;
}

export function focusMatches(current, target) {
  const focus = normalizeBuildFocus(current);
  return focus === 'all' || focus === String(target || '').toLowerCase();
}

export function setSectionVisibility(node, visible) {
  if (!node) return;
  node.style.display = visible ? 'block' : 'none';
}

export function normalizeCharacterTab(raw) {
  const key = String(raw || 'overview').trim().toLowerCase();
  if (key === 'cards') return 'skills';
  if (key === 'heroes') return 'overview';
  return CHARACTER_TABS[key] ? key : 'overview';
}

export function setCharacterTab(state, tab) {
  if (!state) return 'overview';
  const next = normalizeCharacterTab(tab);
  state._characterMenuTab = next;
  return next;
}

export function getCharacterTab(state) {
  return normalizeCharacterTab(state?._characterMenuTab || 'overview');
}

export function isHubPreviewState(state) {
  const room = state?.player?.room || null;
  const spec = room?.arenaSpec || null;
  const isHubRoom = !!(spec?.rules?.isHub) || String(room?.biomeKey || '').toLowerCase() === 'hub' || ((room?.index | 0) === 0);
  const overlayPreview = ['build', 'basic', 'character', 'shop'].includes(String(state?.overlayMode || ''));
  return !!(state?.player && (isHubRoom || overlayPreview));
}

export function setCharacterSelection(state, selection) {
  if (!state) return null;
  state._characterMenuSelection = selection && typeof selection === 'object' ? { ...selection } : null;
  return state._characterMenuSelection;
}

export function getCharacterSelection(state) {
  return state?._characterMenuSelection || null;
}

export function sameCharacterSelection(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return String(a.kind || '') === String(b.kind || '') && String(a.key || '') === String(b.key || '') && !!a.isCore === !!b.isCore;
}
