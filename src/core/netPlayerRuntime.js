import { Player } from "./player.js";
import { applyLimitsToPlayer } from "./progression.js";
import { applyHubBuildToPlayer, applyProgressionSpToPlayer, ensureHubProgression } from "./hubBuild.js";

function buildProjectedProgFromMeta(fallbackProg, meta, skillMeta, selectedStarterLoadout) {
  return {
    skillMeta: skillMeta || meta?.skillMeta || {},
    selectedStarterLoadout: selectedStarterLoadout || meta?.selectedStarterLoadout || fallbackProg?.selectedStarterLoadout || "mecha",
    sp: Math.max(0, (meta?.sp | 0) || 0),
    hubBuild: (meta?.hubBuild && typeof meta.hubBuild === "object") ? meta.hubBuild : null,
    hubGear: (meta?.hubGear && typeof meta.hubGear === "object") ? meta.hubGear : null,
    gearInventory: (meta?.gearInventory && typeof meta.gearInventory === "object") ? meta.gearInventory : {},
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
      p._selectedStarterLoadout = (stored && typeof stored.selectedStarterLoadout === "string") ? stored.selectedStarterLoadout : (state.progression?.selectedStarterLoadout || "mecha");
      p.nickname = meta.nickname || `P${id}`;
      p.avatarIndex = meta.avatarIndex || 0;
      p.auraId = (typeof meta.auraId === "number") ? (meta.auraId | 0) : 0;
      p.color = pickColorForId(id);
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
