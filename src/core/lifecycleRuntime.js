import { buildFloorPlan } from "../world/floorPlanBuilder.js";
import { saveProgression } from "./progression.js";
import { bankPlayerSpToProgression, ensureHubProgression } from "./hubBuild.js";
import { hideFloorShopOverlay } from "../ui/floorShopDom.js";
import { applyNetMetaToPlayer, getPlayersArr } from "./netPlayerRuntime.js";
import { cloneJsonSafe, loadSavedRunCheckpoint, restoreRunCheckpointIntoState, saveRunCheckpointFromState } from "./checkpointRuntime.js";

export function getAliveOtherPlayersCount(state, self) {
  const ps = getPlayersArr(state);
  let alive = 0;
  const selfId = String(self?.id || '');
  for (const p of ps) {
    if (!p) continue;
    if (String(p.id || '') === selfId) continue;
    if ((p.hp || 0) > 0 && !p._kicked) alive++;
  }
  return alive;
}

export function getCurrentDeathContinueCost(state, player = null) {
  const p = player || state?.player || null;
  const used = Math.max(0, (p?._deathContinueCount | 0) || (state?._deathContinueCount | 0) || 0);
  return Math.max(1, 2 ** Math.min(30, used));
}

export function revivePlayerIntoCurrentRun(state, p) {
  if (!state || !p) return false;
  const room = state.roomDirector?.current || null;
  const start = room?.arenaSpec?.anchors?.playerStart || null;
  p.hp = Math.max(1, p.maxHP | 0);
  p.vx = 0; p.vy = 0; p._reviving = null; p._kicked = false;
  if (start && Number.isFinite(Number(start.x)) && Number.isFinite(Number(start.y))) {
    p.x = Number(start.x); p.y = Number(start.y);
  } else if (room) {
    p.x = Number(room.centerX) || 0; p.y = Number(room.centerY) || 0;
  } else { p.x = 0; p.y = 0; }
  return true;
}

export function returnRunToHub(state, deps = {}) {
  if (!state) return false;
  try { ensureHubProgression(state.progression); } catch {}
  try { if (state.player) bankPlayerSpToProgression(state.player, state.progression); } catch {}
  try { saveProgression(state.progression); } catch {}
  const checkpoint = loadSavedRunCheckpoint();
  if (checkpoint && restoreRunCheckpointIntoState(state, checkpoint, { showPopup: true })) {
    state.mode = 'playing';
    return true;
  }
  state._hubResumeRunActive = false;
  state._hubResumeNextFloor = 0;
  deps.startNewRun?.(state);
  if (state.roomDirector && typeof state.roomDirector.forceSetCurrent === 'function') {
    try { state.roomDirector.forceSetCurrent(0); } catch {}
    try { if (typeof state.roomDirector._ensureNextSpawned === 'function') state.roomDirector._ensureNextSpawned(); } catch {}
    try { if (typeof state.roomDirector._ensureBridge === 'function') state.roomDirector._ensureBridge(); } catch {}
    try { if (typeof state.roomDirector._applyDynamicBounds === 'function') state.roomDirector._applyDynamicBounds(); } catch {}
  }
  try {
    const ss = state.spawnSystem;
    if (ss && typeof ss.onRoomChanged === 'function') ss.onRoomChanged(state.roomDirector?.current || null);
  } catch {}
  const room = state.roomDirector?.current || null;
  const start = room?.arenaSpec?.anchors?.playerStart || room?.exitPortal || { x: 0, y: 0 };
  const ps = getPlayersArr(state);
  for (const p of ps) {
    if (!p) continue;
    p.hp = Math.max(1, p.maxHP | 0); p.vx = 0; p.vy = 0; p._reviving = null; p._kicked = false; p._deathContinueCount = 0;
    if (start && Number.isFinite(Number(start.x)) && Number.isFinite(Number(start.y))) { p.x = Number(start.x) || 0; p.y = Number(start.y) || 0; }
    else { p.x = Number(room?.centerX) || 0; p.y = Number(room?.centerY) || 0; }
  }
  state._deathContinueCount = 0; state._deathHandled = false; state._waitingRespawnAck = false; state.overlayMode = null; state._runUpgradeActive = false; state._runUpgradeChoices = null; state._floorShopActive = false;
  try { hideFloorShopOverlay(); } catch {}
  try { deps.syncPersistentRunUnlocks?.(state); } catch {}
  return true;
}

export function clearTransientWorldStateForHub(state) {
  if (!state) return;
  state.enemies = []; state.projectiles = []; state.rockets = []; state.iceWalls = []; state.blackholes = []; state.healPulses = []; state._explosions = []; state.xpOrbs = []; state.summons = []; state.buffs = []; state.floatingTexts = []; state.popups = [];
  state._laserVisual = null; state._lightningVisual = null;
  if (state._laserVisuals && typeof state._laserVisuals.clear === 'function') state._laserVisuals.clear();
  if (state._lightningVisuals && typeof state._lightningVisuals.clear === 'function') state._lightningVisuals.clear();
  state._runUpgradeActive = false; state._runUpgradeChoices = null; state._floorShopActive = false; state._buildPanelOpen = false; state._buildPanelSelectedKey = ''; state._statsPanelOpen = false; state._statsPanelExpanded = false;
  try { hideFloorShopOverlay(); } catch {}
}

export function returnRunToHubWithProgress(state, deps = {}) {
  if (!state || !state.roomDirector?.current) return false;
  try { ensureHubProgression(state.progression); } catch {}
  try { if (state.player) bankPlayerSpToProgression(state.player, state.progression); } catch {}
  try { saveProgression(state.progression); } catch {}
  const rd = state.roomDirector;
  const cur = rd.current;
  if (!cur || !cur.isFloorFinal || !cur.cleared) return false;
  const nextFloorNo = Math.max(1, (cur.floorNumber | 0) + 1);
  const prevBiome = String(rd._lastBiomeKey || cur.biomeKey || '');
  const savedPlan = cloneJsonSafe(state._savedRunResumePlan, null) || buildFloorPlan(nextFloorNo, prevBiome);
  clearTransientWorldStateForHub(state);
  state._hubResumeRunActive = true; state._hubResumeNextFloor = nextFloorNo; state._deathHandled = false; state._waitingRespawnAck = false; state.overlayMode = null; state.mode = 'playing';
  try { rd.forceSetCurrent(0); } catch {}
  rd._activeFloorPlan = savedPlan; rd._lastBiomeKey = String(savedPlan?.biomeKey || prevBiome || ''); state._savedRunResumePlan = cloneJsonSafe(savedPlan, null); rd._waitForParty = false;
  try { if (typeof rd._ensureNextSpawned === 'function') rd._ensureNextSpawned(); } catch {}
  try { if (typeof rd._ensureBridge === 'function') rd._ensureBridge(); } catch {}
  try { if (typeof rd._applyDynamicBounds === 'function') rd._applyDynamicBounds(); } catch {}
  const room = rd.current || null;
  const start = room?.arenaSpec?.anchors?.playerStart || room?.exitPortal || { x: 0, y: 0 };
  for (const p of getPlayersArr(state)) {
    if (!p) continue;
    p.hp = Math.max(1, p.maxHP | 0); p.vx = 0; p.vy = 0; p._reviving = null; p._kicked = false;
    if (start && Number.isFinite(Number(start.x)) && Number.isFinite(Number(start.y))) { p.x = Number(start.x) || 0; p.y = Number(start.y) || 0; }
    else { p.x = Number(room?.centerX) || 0; p.y = Number(room?.centerY) || 0; }
  }
  try {
    const ss = state.spawnSystem;
    if (ss && typeof ss.onRoomChanged === 'function') ss.onRoomChanged(room);
  } catch {}
  saveRunCheckpointFromState(state, { savedPlan, nextFloor: nextFloorNo });
  if (state.popups) state.popups.push({ text: `Run saved • Hub • Next Floor ${nextFloorNo}`, time: 2.0 });
  try { deps.syncPersistentRunUnlocks?.(state); } catch {}
  return true;
}

export function maybeEnterDeathContinueOverlay(state) {
  if (!state || state.mode !== 'playing' || !state.player) return;
  const player = state.player;
  if ((player.hp || 0) > 0) {
    state._deathHandled = false; state._waitingRespawnAck = false;
    if (state.overlayMode === 'deathContinue') state.overlayMode = null;
    state._deathContinueCount = Math.max(0, (player._deathContinueCount | 0) || 0);
    return;
  }
  if (state._waitingRespawnAck) return;
  if (state.overlayMode) return;
  if (getAliveOtherPlayersCount(state, player) > 0) return;
  if (state._deathHandled) return;
  state._deathContinueCount = Math.max(0, (player._deathContinueCount | 0) || 0);
  state.overlayMode = 'deathContinue';
  state._deathHandled = true;
}


export function handleDeathContinueAction(state, action, deps = {}) {
  if (!state || !state.player) return false;
  const player = state.player;
  const cost = getCurrentDeathContinueCost(state, player);
  if (action === 'continue') {
    if (((player.skillPoints | 0) || 0) < cost) {
      if (state.popups) state.popups.push({ text: 'Not enough SP', time: 1.0 });
      return false;
    }
    if (deps.isOnline?.(state) && state.net && !state.net.isHost) {
      player._deathContinueCount = Math.max(0, (player._deathContinueCount | 0) || 0) + 1;
      state._deathContinueCount = player._deathContinueCount | 0;
      state._waitingRespawnAck = true;
      state.overlayMode = null;
      state.net.requestRespawn({ action: 'continue', cost, meta: null });
      return true;
    }
    player.skillPoints = Math.max(0, ((player.skillPoints | 0) || 0) - cost);
    player._deathContinueCount = Math.max(0, (player._deathContinueCount | 0) || 0) + 1;
    state._deathContinueCount = player._deathContinueCount | 0;
    revivePlayerIntoCurrentRun(state, player);
    state.overlayMode = null; state._deathHandled = false; state._waitingRespawnAck = false;
    if (state.popups) state.popups.push({ text: `Continue -${cost} SP`, time: 1.0 });
    return true;
  }
  if (action === 'hub') {
    if (deps.isOnline?.(state) && state.net && !state.net.isHost) {
      state._waitingRespawnAck = true;
      state.overlayMode = null;
      state.net.requestRespawn({ action: 'hub', meta: null });
      return true;
    }
    returnRunToHub(state, deps);
    return true;
  }
  return false;
}

export function respawnPlayerToHub(state, p, meta) {
  if (!p) return;
  if (meta) applyNetMetaToPlayer(state, p, meta);
  p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; p.hp = p.maxHP;
}

export function processRespawnRequests(state, deps = {}) {
  if (!deps.isOnline?.(state)) return;
  if (!state.net?.isHost) return;
  for (const p of getPlayersArr(state)) {
    if (!p || !p._netRespawnRequested) continue;
    p._netRespawnRequested = false;
    const req = p._netRespawnRequest || null;
    p._netRespawnRequest = null;
    const meta = req?.meta || state._netMetaById?.get(String(p.id)) || null;
    const action = String(req?.action || 'legacy');
    if (action === 'continue') {
      const cost = Math.max(0, Number(req?.cost) || getCurrentDeathContinueCost(state, p));
      const sp = Math.max(0, (p.skillPoints | 0) || 0);
      if (sp >= cost) {
        p.skillPoints = sp - cost;
        p._deathContinueCount = Math.max(0, (p._deathContinueCount | 0) || 0) + 1;
        revivePlayerIntoCurrentRun(state, p);
      }
      continue;
    }
    if (action === 'hub') {
      returnRunToHub(state, deps);
      continue;
    }
    respawnPlayerToHub(state, p, meta);
  }
}

export const REVIVE_INTERACT_R = 140;
export const REVIVE_CHANNEL_SEC = 2.0;

export function startReviveById(state, reviver, targetId) {
  if (!state || !reviver || (reviver.hp || 0) <= 0) return false;
  if (!targetId || reviver._reviving) return false;
  const tid = String(targetId);
  const ps = (state.players && state.players.length) ? state.players : (state.player ? [state.player] : []);
  const target = ps.find((p) => p && String(p.id || '') === tid) || null;
  if (!target || (target.hp || 0) > 0) return false;
  const dx = target.x - reviver.x; const dy = target.y - reviver.y;
  if (dx * dx + dy * dy > REVIVE_INTERACT_R * REVIVE_INTERACT_R) return false;
  reviver._reviving = { targetId: tid, t: 0, need: REVIVE_CHANNEL_SEC };
  reviver.vx = 0; reviver.vy = 0;
  return true;
}

export function updateRevives(state, dt) {
  if (!state || !Number.isFinite(dt) || dt <= 0) return;
  const ps = (state.players && state.players.length) ? state.players : (state.player ? [state.player] : []);
  if (!ps.length) return;
  const byId = new Map(ps.filter(Boolean).map((p) => [String(p.id || ''), p]));
  for (const p of ps) {
    if (!p || !p._reviving) continue;
    const r = p._reviving;
    const target = byId.get(String(r.targetId || '')) || null;
    if (!target || (p.hp || 0) <= 0) { p._reviving = null; continue; }
    if ((target.hp || 0) > 0) { p._reviving = null; continue; }
    const dx = target.x - p.x; const dy = target.y - p.y;
    if (dx * dx + dy * dy > (REVIVE_INTERACT_R * 0.95) * (REVIVE_INTERACT_R * 0.95)) { p._reviving = null; continue; }
    p.vx = 0; p.vy = 0;
    r.t = (r.t || 0) + dt;
    if (r.t >= (r.need || REVIVE_CHANNEL_SEC)) {
      revivePlayerIntoCurrentRun(state, target);
      target._deathContinueCount = Math.max(0, (target._deathContinueCount | 0) || 0);
      p._reviving = null;
      if (state.popups) state.popups.push({ text: `Revived ${target.name || 'ally'}`, time: 1.0 });
    }
  }
}
