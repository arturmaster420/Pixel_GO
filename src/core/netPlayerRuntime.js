import { Player } from "./player.js";
import { applyLimitsToPlayer } from "./progression.js";
import { applyHubBuildToPlayer, applyProgressionSpToPlayer, ensureHubProgression } from "./hubBuild.js";
import { getStarterLoadoutDef, normalizeStarterLoadoutKey } from "./starterLoadouts.js";

function cloneJsonSafe(value, fallback = null) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function sanitizeHeroCombatSummary(raw) {
  const src = raw && typeof raw === 'object' ? raw : null;
  if (!src) return null;
  return {
    totalCardPower: Math.max(0, (Number(src.totalCardPower || 0) | 0) || 0),
    sameRaceCards: Math.max(0, (Number(src.sameRaceCards || 0) | 0) || 0),
    starBonusTotal: Math.max(0, (Number(src.starBonusTotal || 0) | 0) || 0),
    equippedSkillCards: Math.max(0, (Number(src.equippedSkillCards || 0) | 0) || 0),
    equippedPassiveCards: Math.max(0, (Number(src.equippedPassiveCards || 0) | 0) || 0),
    masteryLevel: Math.max(1, (Number(src.masteryLevel || 1) | 0) || 1),
  };
}

function sanitizeLoadoutCards(rawCards) {
  const out = [];
  if (!Array.isArray(rawCards)) return out;
  for (const raw of rawCards.slice(0, 6)) {
    if (!raw || typeof raw !== 'object') continue;
    const id = String(raw.id || '').trim();
    const key = String(raw.key || '').trim();
    if (!id || !key) continue;
    out.push({
      id,
      key,
      kind: String(raw.kind || '').trim(),
      race: String(raw.race || 'mecha').trim() || 'mecha',
      lv: Math.max(1, (Number(raw.lv || 1) | 0) || 1),
      st: Math.max(1, (Number(raw.st || 1) | 0) || 1),
    });
  }
  return out;
}


function clampTier(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.max(1, Math.min(6, fallback | 0 || 1));
  return Math.max(1, Math.min(6, n | 0));
}

function sanitizeRuntimeKeyArray(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const value of raw) {
    const key = String(value || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function sanitizeRuntimeTierMap(raw, fallbackKeys = []) {
  const out = {};
  const src = raw && typeof raw === 'object' ? raw : null;
  const keys = new Set(fallbackKeys);
  if (src) {
    for (const key of Object.keys(src)) keys.add(String(key || '').trim());
  }
  for (const key of keys) {
    if (!key) continue;
    out[key] = clampTier(src?.[key] || 1, 1);
  }
  return out;
}

function sanitizeActiveHeroRuntime(raw, heroCombatProfile = null, loadoutSummary = null, fallbackRace = 'mecha') {
  const src = raw && typeof raw === 'object' ? raw : null;
  const profile = heroCombatProfile && typeof heroCombatProfile === 'object' ? heroCombatProfile : null;
  const loadout = loadoutSummary && typeof loadoutSummary === 'object' ? loadoutSummary : null;
  if (!src && !profile && !loadout) return null;
  const race = normalizeStarterLoadoutKey(src?.race || profile?.race || loadout?.race || fallbackRace || 'mecha');
  const coreSkillKey = String(src?.coreSkillKey || getStarterLoadoutDef(race)?.skillKey || '').trim();

  let runtimeSkillKeys = sanitizeRuntimeKeyArray(src?.runtimeSkillKeys);
  if (!runtimeSkillKeys.length && Array.isArray(loadout?.skills)) runtimeSkillKeys = sanitizeRuntimeKeyArray(loadout.skills.map((entry) => entry?.key));
  if (!runtimeSkillKeys.length && profile?.skillTiers) runtimeSkillKeys = sanitizeRuntimeKeyArray(Object.keys(profile.skillTiers));

  let runtimePassiveKeys = sanitizeRuntimeKeyArray(src?.runtimePassiveKeys);
  if (!runtimePassiveKeys.length && Array.isArray(loadout?.passives)) runtimePassiveKeys = sanitizeRuntimeKeyArray(loadout.passives.map((entry) => entry?.key));
  if (!runtimePassiveKeys.length && profile?.passiveTiers) runtimePassiveKeys = sanitizeRuntimeKeyArray(Object.keys(profile.passiveTiers));

  const skillTiers = sanitizeRuntimeTierMap(src?.skillTiers || profile?.skillTiers, runtimeSkillKeys);
  const passiveTiers = sanitizeRuntimeTierMap(src?.passiveTiers || profile?.passiveTiers, runtimePassiveKeys);

  return {
    version: Math.max(1, (Number(src?.version || 1) | 0) || 1),
    signature: String(src?.signature || '').trim(),
    heroId: String(src?.heroId || profile?.heroId || loadout?.heroId || '').trim(),
    race,
    coreSkillKey,
    coreSkillEquipped: src?.coreSkillEquipped !== false && (profile?.coreSkillEquipped !== false),
    runtimeSkillKeys,
    runtimePassiveKeys,
    skillTiers,
    passiveTiers,
  };
}

function buildHubBuildFromHeroRuntime(runtime, fallbackHubBuild = null) {
  if (!runtime) return (fallbackHubBuild && typeof fallbackHubBuild === 'object') ? fallbackHubBuild : null;
  const skillKeys = sanitizeRuntimeKeyArray(runtime.runtimeSkillKeys);
  const passiveKeys = sanitizeRuntimeKeyArray(runtime.runtimePassiveKeys);
  if (!skillKeys.length && !passiveKeys.length) {
    return { coreKey: normalizeStarterLoadoutKey(runtime.race || 'mecha'), skills: {}, passives: {} };
  }
  const hubBuild = { coreKey: normalizeStarterLoadoutKey(runtime.race || 'mecha'), skills: {}, passives: {} };
  for (const key of skillKeys) {
    if (!key || key === runtime.coreSkillKey) continue;
    hubBuild.skills[key] = clampTier(runtime.skillTiers?.[key] || 1, 1);
  }
  for (const key of passiveKeys) {
    if (!key) continue;
    hubBuild.passives[key] = clampTier(runtime.passiveTiers?.[key] || 1, 1);
  }
  return hubBuild;
}

function mergeHeroCombatProfileWithRuntime(heroCombatProfile, runtime, heroCombatSummary) {
  const profile = heroCombatProfile && typeof heroCombatProfile === 'object' ? cloneJsonSafe(heroCombatProfile, {}) : {};
  if (!runtime) return profile && Object.keys(profile).length ? profile : null;
  profile.heroId = String(profile.heroId || runtime.heroId || '').trim();
  profile.race = String(profile.race || runtime.race || 'mecha').trim() || 'mecha';
  profile.coreSkillEquipped = runtime.coreSkillEquipped !== false;
  profile.runtimeSkillKeys = [...runtime.runtimeSkillKeys];
  profile.runtimePassiveKeys = [...runtime.runtimePassiveKeys];
  profile.skillTiers = { ...(profile.skillTiers && typeof profile.skillTiers === 'object' ? profile.skillTiers : {}), ...runtime.skillTiers };
  profile.passiveTiers = { ...(profile.passiveTiers && typeof profile.passiveTiers === 'object' ? profile.passiveTiers : {}), ...runtime.passiveTiers };
  if (heroCombatSummary && typeof heroCombatSummary === 'object') {
    profile.summary = { ...(profile.summary && typeof profile.summary === 'object' ? profile.summary : {}), ...heroCombatSummary };
  }
  return profile;
}

function sanitizeHeroLoadoutSummary(raw) {
  const src = raw && typeof raw === 'object' ? raw : null;
  if (!src) return null;
  return {
    version: Math.max(1, (Number(src.version || 1) | 0) || 1),
    heroId: String(src.heroId || '').trim(),
    name: String(src.name || 'Hero').trim().slice(0, 24) || 'Hero',
    race: String(src.race || 'mecha').trim() || 'mecha',
    skills: sanitizeLoadoutCards(src.skills),
    passives: sanitizeLoadoutCards(src.passives),
    totals: sanitizeHeroCombatSummary(src.totals || src.summary || null) || {
      totalCardPower: 0,
      sameRaceCards: 0,
      starBonusTotal: 0,
      equippedSkillCards: Array.isArray(src.skills) ? Math.min(6, src.skills.length | 0) : 0,
      equippedPassiveCards: Array.isArray(src.passives) ? Math.min(6, src.passives.length | 0) : 0,
      masteryLevel: 1,
    },
  };
}

export function buildProjectedProgFromMeta(fallbackProg, meta, skillMeta, selectedStarterLoadout) {
  const activeHeroLoadoutSummary = sanitizeHeroLoadoutSummary(meta?.activeHeroLoadoutSummary);
  const activeHeroRace = String(meta?.activeHeroRace || activeHeroLoadoutSummary?.race || selectedStarterLoadout || meta?.selectedStarterLoadout || fallbackProg?.selectedStarterLoadout || 'mecha').trim() || 'mecha';
  const activeHeroRuntime = sanitizeActiveHeroRuntime(meta?.activeHeroRuntime, meta?.heroCombatProfile, activeHeroLoadoutSummary, activeHeroRace);
  const canonicalCoreKey = normalizeStarterLoadoutKey(activeHeroRuntime?.race || activeHeroRace || meta?.activeHeroRace || activeHeroLoadoutSummary?.race || selectedStarterLoadout || meta?.selectedStarterLoadout || fallbackProg?.selectedStarterLoadout || 'mecha');
  return {
    skillMeta: skillMeta || meta?.skillMeta || {},
    selectedStarterLoadout: canonicalCoreKey,
    sp: Math.max(0, (meta?.sp | 0) || 0),
    hubBuild: buildHubBuildFromHeroRuntime(activeHeroRuntime, (meta?.hubBuild && typeof meta.hubBuild === "object") ? meta.hubBuild : null),
    hubGear: (meta?.hubGear && typeof meta.hubGear === "object") ? meta.hubGear : null,
    gearInventory: (meta?.gearInventory && typeof meta.gearInventory === "object") ? meta.gearInventory : {},
    activeHeroId: String(meta?.activeHeroId || activeHeroRuntime?.heroId || '').trim() || 'hero_1',
    activeHeroName: String(meta?.activeHeroName || meta?.nickname || activeHeroLoadoutSummary?.name || 'Hero').trim().slice(0, 24) || 'Hero',
    activeHeroRace,
    activeHeroLoadoutSummary,
    activeHeroRuntime,
    heroCombatProfile: mergeHeroCombatProfileWithRuntime(meta?.heroCombatProfile, activeHeroRuntime, sanitizeHeroCombatSummary(meta?.heroCombatSummary)),
    heroCombatSummary: sanitizeHeroCombatSummary(meta?.heroCombatSummary),
  };
}

export function getPlayersArr(state) {
  return state.players && state.players.length ? state.players : (state.player ? [state.player] : []);
}

export function getPlayerById(state, id) {
  if (!id) return null;
  const sid = String(id);
  for (const p of getPlayersArr(state)) {
    if (p && String(p.id) === sid) return p;
  }
  return null;
}

export function pickColorForId(id) {
  const s = String(id);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 80%, 65%)`;
}

export function applyNetMetaToPlayer(state, player, meta) {
  if (!player || !meta) return;
  if (typeof meta.nickname === "string") player.nickname = meta.nickname;
  if (typeof meta.avatarIndex === "number") player.avatarIndex = meta.avatarIndex | 0;
  if (typeof meta.auraId === "number") player.auraId = meta.auraId | 0;
  if (typeof meta.activeHeroId === 'string' && meta.activeHeroId.trim()) player.activeHeroId = meta.activeHeroId.trim();
  if (typeof meta.activeHeroName === 'string' && meta.activeHeroName.trim()) player.activeHeroName = meta.activeHeroName.trim().slice(0, 24);
  if (typeof meta.activeHeroRace === 'string' && meta.activeHeroRace.trim()) {
    player.activeHeroRace = meta.activeHeroRace.trim();
    player._selectedStarterLoadout = meta.activeHeroRace.trim();
  }
  player._heroLoadoutSummary = sanitizeHeroLoadoutSummary(meta?.activeHeroLoadoutSummary) || player._heroLoadoutSummary || null;
  player._heroCombatSummary = sanitizeHeroCombatSummary(meta?.heroCombatSummary)
    || sanitizeHeroCombatSummary(meta?.heroCombatProfile?.summary)
    || player._heroCombatSummary
    || null;
  if (meta.limits) applyLimitsToPlayer(player, meta.limits);
  if (meta.skillMeta && typeof meta.skillMeta === "object") player._metaSkillMeta = meta.skillMeta;
  if (typeof meta.selectedStarterLoadout === "string") player._selectedStarterLoadout = meta.selectedStarterLoadout;

  const projectedProg = buildProjectedProgFromMeta(state?.progression, meta, player._metaSkillMeta, player._selectedStarterLoadout);
  ensureHubProgression(projectedProg);
  applyHubBuildToPlayer(player, projectedProg);
  applyProgressionSpToPlayer(player, projectedProg);
}

export function syncHostPlayersFromRoomInfo(state) {
  const netPlayers = Array.isArray(state.net?.roomPlayers) ? state.net.roomPlayers : [];
  const wantedIds = new Set(netPlayers.map((p) => String(p.id)));

  if (state.player && state.net?.playerId) {
    state.player.id = String(state.net.playerId);
    wantedIds.add(String(state.player.id));
  }

  for (const meta of netPlayers) {
    const id = String(meta.id);
    if (!getPlayerById(state, id)) {
      const p = new Player({ x: 0, y: 0 }, 1);
      p.id = id;
      const stored = state._netMetaById?.get(id) || null;
      p._metaSkillMeta = (stored && stored.skillMeta && typeof stored.skillMeta === "object") ? stored.skillMeta : (state.progression?.skillMeta || {});
      p._selectedStarterLoadout = (stored && typeof stored.activeHeroRace === "string" && stored.activeHeroRace.trim())
        ? stored.activeHeroRace.trim()
        : ((stored && typeof stored.selectedStarterLoadout === "string") ? stored.selectedStarterLoadout : (state.progression?.selectedStarterLoadout || "mecha"));
      p.nickname = meta.nickname || `P${id}`;
      p.avatarIndex = meta.avatarIndex || 0;
      p.auraId = (typeof meta.auraId === "number") ? (meta.auraId | 0) : 0;
      p.color = pickColorForId(id);
      p.activeHeroId = String(stored?.activeHeroId || '').trim() || `hero_remote_${id}`;
      p.activeHeroName = String(stored?.activeHeroName || p.nickname || `Hero ${id}`).trim().slice(0, 24) || `Hero ${id}`;
      p.activeHeroRace = String(stored?.activeHeroRace || p._selectedStarterLoadout || 'mecha').trim() || 'mecha';
      p._heroLoadoutSummary = sanitizeHeroLoadoutSummary(stored?.activeHeroLoadoutSummary) || null;
      p._heroCombatSummary = sanitizeHeroCombatSummary(stored?.heroCombatSummary)
        || sanitizeHeroCombatSummary(stored?.heroCombatProfile?.summary)
        || null;
      if (stored) applyNetMetaToPlayer(state, p, stored);
      else applyLimitsToPlayer(p, state.progression.limits);
      const projectedProg = buildProjectedProgFromMeta(state.progression, stored, p._metaSkillMeta, p._selectedStarterLoadout);
      ensureHubProgression(projectedProg);
      applyHubBuildToPlayer(p, projectedProg);
      applyProgressionSpToPlayer(p, projectedProg);
      state.players.push(p);
    } else {
      const p = getPlayerById(state, id);
      if (p && meta.nickname) p.nickname = meta.nickname;
      if (p && typeof meta.avatarIndex === "number") p.avatarIndex = meta.avatarIndex | 0;
      if (p && typeof meta.auraId === "number") p.auraId = meta.auraId | 0;
      const stored = state._netMetaById?.get(id) || null;
      if (p && stored) {
        p.activeHeroId = String(stored?.activeHeroId || p.activeHeroId || '').trim() || p.activeHeroId || `hero_remote_${id}`;
        p.activeHeroName = String(stored?.activeHeroName || p.activeHeroName || p.nickname || `Hero ${id}`).trim().slice(0, 24) || `Hero ${id}`;
        p.activeHeroRace = String(stored?.activeHeroRace || p.activeHeroRace || p._selectedStarterLoadout || 'mecha').trim() || 'mecha';
        p._heroLoadoutSummary = sanitizeHeroLoadoutSummary(stored?.activeHeroLoadoutSummary) || p._heroLoadoutSummary || null;
        p._heroCombatSummary = sanitizeHeroCombatSummary(stored?.heroCombatSummary)
          || sanitizeHeroCombatSummary(stored?.heroCombatProfile?.summary)
          || p._heroCombatSummary
          || null;
      }
    }
  }

  const localId = state.player ? String(state.player.id) : null;
  state.players = state.players.filter((p) => {
    if (!p) return false;
    const id = String(p.id);
    if (localId && id === localId) return true;
    return wantedIds.has(id);
  });
}

export { cloneJsonSafe, sanitizeHeroCombatSummary, sanitizeHeroLoadoutSummary, sanitizeActiveHeroRuntime };
