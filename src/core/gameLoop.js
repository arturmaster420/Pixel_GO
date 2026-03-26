import { Player } from "./player.js";
import { Camera } from "./camera.js";
import { initInput } from "./input.js";
import { getKeyboardVector } from "./input.js";
import { setControlMode } from "./mouseController.js";
import { getMoveVectorFromPointer, getAimDirectionForPlayer, isFiringActive } from "./mouseController.js";
import { getAttackRangeForPlayer, getAimRangeForPlayer } from "../weapons/skillSystem.js";
import { RoomSpawnSystem } from "../world/roomSpawnSystem.js";
import { RoomDirector } from "../world/roomDirector.js";
import { renderHUD } from "../ui/hud.js";
import { renderUpgradeMenu, handleUpgradeClick } from "../ui/upgradeMenu.js";
import { renderResurrectionScreen, handleResurrectionClick } from "../ui/resurrectionScreen.js";
import { renderDeathContinueScreen, handleDeathContinueClick } from "../ui/deathContinueScreen.js";
import { renderSettingsMenu, handleSettingsClick } from "../ui/canvasMenuStubs.js";
import {
  saveProgression,
  getStartLevel,
  applyLimitsToPlayer,
} from "./progression.js";
import { initRunUpgrades, applyRunDerivedStats } from "./runUpgrades.js";
import { applyHubBuildToPlayer, applyHubProgressionLoot, applyProgressionSpToPlayer, ensureHubProgression, getEssenceMeta, getHubBuildSpentPoints, importPlayerSnapshotIntoHubBuild } from "./hubBuild.js";
import { rollFloorShopOffersStandard, offerNeedsReplace, isLiveSkillUnlockOffer } from "./floorShop.js";
import { biomeName } from "../world/biomes.js";
import { updateBuffs } from "../buffs/buffs.js";
import { createNetClient, getDefaultWsUrl } from "../net/netClient.js";
import { buildNetMetaPayload } from "../net/metaPayload.js";
import { hideRunUpgradeOverlay } from "../ui/runUpgradeDom.js";
import { isFloorShopOverlayVisible, handleFloorShopHotkey } from "../ui/floorShopDom.js";
import { ensureShopMeta } from "../meta/shopMeta.js";
import { applyStarterLoadoutToPlayer, ensureStarterLoadoutProgression } from "./starterLoadouts.js";
import { hasSkillOrEvolution } from "./skillEvolutionDefs.js";
import {
  renderHubNpcs,
  getNearbyHubNpcForPlayer,
  screenToWorld,
  findNpcAtWorldPos,
} from "../world/hubNpcs.js";
import { clearSavedRunCheckpoint, loadSavedRunCheckpoint, restoreRunCheckpointIntoState, saveRunCheckpointFromState } from "./checkpointRuntime.js";
import { applyNetMetaToPlayer, getPlayerById, getPlayersArr, pickColorForId, syncHostPlayersFromRoomInfo } from "./netPlayerRuntime.js";
import { applyPlayerStateToClient, applySnapshotToClient, maybeSendPlayerState, maybeSendSnapshot, smoothNetEntities, updateNetVisualProjectiles } from "./netSnapshotRuntime.js";
import { buildFloorShopChoices, canPlayerUseFloorShop, ensureFloorShopForPlayer, getCurrentFloorShopBiomeKey, getCurrentFloorShopFloor, getLiveFloorShopOfferForPlayer, openFloorShopOverlay, openFloorShopReplaceOverlay, performFloorShopPurchase, performFloorShopReroll, tryOpenFloorShop } from "./floorShopRuntime.js";
import { REVIVE_CHANNEL_SEC, REVIVE_INTERACT_R, clearTransientWorldStateForHub, getAliveOtherPlayersCount, getCurrentDeathContinueCost, handleDeathContinueAction, maybeEnterDeathContinueOverlay, processRespawnRequests, respawnPlayerToHub, returnRunToHub, returnRunToHubWithProgress, revivePlayerIntoCurrentRun, startReviveById, updateRevives } from "./lifecycleRuntime.js";
import { renderFloatingTexts, updateFloatingTexts, updatePopups, updateXPOrbs } from "./resourceOrbUiRuntime.js";
import { applyProgressionPayloadToLocal, getLocalProgressionAliases } from "./progressionRuntime.js";
import { applyResurrection } from "./progression.js";
import { hideFloorShopOverlay } from "../ui/floorShopDom.js";
import { updateArenaHazards, updatePlayers, updateWeapons } from "./playerRuntime.js";
import { checkPlayerDeath, updateEnemies, updateProjectiles, updateSkillFx } from "./combatRuntime.js";
import { renderBuffAuras, renderEnemies, renderHPBarsWorld, renderPersistentHubCoreOverlay, renderPlayers, renderPopups, renderProjectiles, renderSkillFxWorld, renderSummons, renderWorldBackground, renderXPOrbs } from "./gameRenderRuntime.js";


function reportRuntimePhaseError(state, label, err) {
  try {
    const msg = `${label}: ${err && err.message ? err.message : String(err)}`;
    if (typeof console !== 'undefined' && console.error) console.error('[Pixel_GO runtime]', msg, err);
    state._runtimeErrors ||= new Map();
    const prev = state._runtimeErrors.get(label) || { count: 0, lastAt: 0 };
    const now = Number(state.time || 0);
    prev.count = (prev.count | 0) + 1;
    prev.lastAt = now;
    prev.message = msg;
    state._runtimeErrors.set(label, prev);
    state._runtimeLastError = msg;
    if (state.popups) {
      const shouldPopup = !prev._popupAt || (now - prev._popupAt) > 2.0;
      if (shouldPopup) {
        state.popups.push({ text: `Runtime: ${label}`, time: 2.5 });
        prev._popupAt = now;
      }
    }
  } catch {}
}

function runPhaseSafe(state, label, fn, fallback = undefined) {
  try {
    return fn();
  } catch (err) {
    reportRuntimePhaseError(state, label, err);
    return fallback;
  }
}

export function createGame(canvas, ctx, progression) {
  initInput();
  // Ensure shop meta fields exist (coins, skill meta levels, offers).
  try { ensureShopMeta(progression); } catch {}
  try { ensureStarterLoadoutProgression(progression); } catch {}
  try { ensureHubProgression(progression); } catch {}

  const state = {
    canvas,
    ctx,
    progression,
    mode: "startMenu",
    paused: false,
    player: null,
    players: [],
    camera: null,
    enemies: [],
    projectiles: [],
    rockets: [],
    // Biome skill FX (host-authoritative, replicated via snapshots)
    iceWalls: [],
    blackholes: [],
    healPulses: [],
    _explosions: [],
    xpOrbs: [],
    summons: [],
    buffs: [],
    floatingTexts: [],
    popups: [],
    flags: {
      resGuardianKilledThisRun: false,
    },
    runScore: 0,
    lastRunSummary: null,
    spawnSystem: null,
    time: 0,
    currentZone: 0,
    currentRoomIndex: 0,
    roomDirector: null,
    _laserVisual: null,
    _lightningVisual: null,
    _pauseButtonRect: null,
    _buildButtonRect: null,
    _buildPanelRect: null,
    _buildPanelCloseRect: null,
    _buildSlotRects: null,
    _buildPanelSelectedKey: '',
    _buildPanelOpen: false,
    _statsButtonRect: null,
    _statsPanelRect: null,
    _statsPanelCloseRect: null,
    _statsPanelToggleRect: null,
    _statsPanelOpen: false,
    _statsPanelExpanded: false,
    _savedRunResumeAvailable: false,
    _savedRunCheckpointLoaded: false,
    _savedRunResumePlan: null,
    _netLastAppliedSnapshotAt: 0,
    _netLastAppliedPStateAt: 0,
    meta: {
      xpGainMult: 1,
      scoreMult: 1,
      pickupBonusRadius: 0,
    },
    net: createNetClient(),
    _netLastInputSendAt: 0,
    _netLastSnapshotSendAt: 0,

    // Online-only overlays (so host can keep simulating the world while showing UI)
    overlayMode: null, // 'deathContinue' | 'resurrection' | 'upgrade' | null
    _deathHandled: false,
    _waitingRespawnAck: false,

    // Pixel_GO v0.4: floor shop overlay (local only; host authoritative purchases)
    _floorShopActive: false,
    _shopButtons: [],

    // Host keeps per-player meta snapshots (limits/resTier/etc.)
    _netMetaById: new Map(),

    // Host-authoritative run-upgrade sessions (per-player)
    _runUpNet: {
      sessions: new Map(),
    },

    // Boss-floor safe exit: players can bank the current run in hub and continue
    // later from the next floor portal without losing in-run skills/SP.
    _hubResumeRunActive: false,
    _hubResumeNextFloor: 0,
  };

  // Helpers for weapon/FX modules (avoid circular imports).
  // These are used by biome skills to resolve owners and ally lists.
  state._getPlayerById = (id) => getPlayerById(state, id);
  state.getPlayersArr = (st) => getPlayersArr(st);
  state._returnRunToHubPreserve = () => returnRunToHubWithProgress(state, { syncPersistentRunUnlocks });
  state._saveRunCheckpoint = (opts = null) => saveRunCheckpointFromState(state, opts || {});
  state._restoreSavedRunCheckpoint = (showPopup = false) => restoreRunCheckpointIntoState(state, loadSavedRunCheckpoint(), { showPopup });
  state._clearSavedRunCheckpoint = () => clearSavedRunCheckpoint(state);

  // If opened via invite link, prefill room code
  try {
    const params = new URLSearchParams(location.search || "");
    const raw = params.get("code") || params.get("room");
    if (raw && state.progression) {
      const cleaned = raw.toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
      if (cleaned) state.progression.roomCode = cleaned;
    }
  } catch {}
// Initialize either a fresh preview run or the last saved floor-checkpoint run.
  if (!restoreRunCheckpointIntoState(state, loadSavedRunCheckpoint())) {
    startNewRun(state);
  }
  state.mode = "startMenu";
  state.paused = false;

  // Net callbacks
  state.net.onMessage = (msg) => {
    if (msg.type === "joined") {
      // Persist room code so it stays visible and can be re-used.
      try {
        const rc = (msg.roomCode || "").toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
        if (rc && state.progression) {
          state.progression.roomCode = rc;
          saveProgression(state.progression);
          // Show a quick on-screen hint for sharing.
          if (state.popups) state.popups.push({ text: `Room: ${rc}`, time: 6 });
        }
      } catch {}

      const shouldResumeSavedRun = !!(state._savedRunResumeAvailable && state._hubResumeRunActive && state.player);

      // Enter the run immediately (Host/Join/FastJoin -> gameplay).
      // Start Menu is only for setup / fallback Start button.
      // Critical: rebuild a fresh runtime from CURRENT progression before play.
      // Otherwise the preview-run player created at boot can carry stale skills into arena.
      clearLegacyRunUpgradeState(state, { clearSessions: true });
      try { hideFloorShopOverlay(); } catch {}
      state._floorShopActive = false;
      state.overlayMode = null;
      if (!shouldResumeSavedRun) {
        startNewRun(state);
      } else if (state.player) {
        state.player._lvlUpChoosing = false;
        state.player._lvlUpInvuln = false;
      }

      // Drop stale net caches before entering gameplay so a just-connected client
      // cannot briefly reuse an old snapshot/player-state from a previous room/session.
      if (state.net) {
        state.net.latestSnapshot = null;
        state.net.latestPlayerState = null;
      }

      if (state.net.isHost) {
        // Host immediately plays. Runtime must already be rebuilt from current progression.
        if (state.player) {
          state.player.id = String(state.net.playerId);
          state.player.color = pickColorForId(state.player.id);
          state.player.nickname = state.progression?.nickname || state.player.nickname;
          if (typeof state.progression?.avatarIndex === "number") state.player.avatarIndex = state.progression.avatarIndex | 0;
          if (typeof state.progression?.auraId === "number") state.player.auraId = state.progression.auraId | 0;
        }
        syncHostPlayersFromRoomInfo(state);
        state.mode = "playing";
        state.paused = false;
      } else {
        // Joiner plays immediately; snapshots will correct world state.
        // We still rebuild the local runtime first so current hero skills/cards are clean until first snapshot.
        if (state.player && state.net.playerId) {
          state.player.id = String(state.net.playerId);
          state.player.color = pickColorForId(state.player.id);
          state.player.nickname = state.progression?.nickname || state.player.nickname;
          if (typeof state.progression?.avatarIndex === "number") state.player.avatarIndex = state.progression.avatarIndex | 0;
          if (typeof state.progression?.auraId === "number") state.player.auraId = state.progression.auraId | 0;
        }
        state.mode = "playing";
        state.paused = false;
      }

      // Joiners sync their current meta to host so stats match.
      if (state.net && state.net.status === "connected" && !state.net.isHost) {
        state.net.sendMeta(buildNetMetaPayload(state.progression));
      }
    }
    if (msg.type === "roomInfo") {
      if (state.net.isHost) {
        syncHostPlayersFromRoomInfo(state);
      }
    }

    if (msg.type === "hostLeft") {
      // Joiner cleanup: host disconnected while we might have overlays open.
      if (state.net.isHost) return;
      state._runUpgradeActive = false;
      try { hideRunUpgradeOverlay(); } catch {}
      try { hideFloorShopOverlay(); } catch {}
      if (state.player) {
        state.player._lvlUpChoosing = false;
        state.player._lvlUpInvuln = false;
      }
      state.overlayMode = null;
      state.mode = "startMenu";
      state.paused = false;
      return;
    }

    if (msg.type === "syncMeta") {
      // Host receives a player's meta/progression snapshot.
      if (!state.net.isHost) return;
      const from = String(msg.from || "");
      if (!from) return;
      const meta = msg.meta || null;
      if (meta) state._netMetaById.set(from, meta);
      const p = getPlayerById(state, from);
      if (p && meta) applyNetMetaToPlayer(state, p, meta);
      return;
    }

    if (msg.type === "respawn") {
      // Host: a player requested a death-flow action (continue / hub / legacy respawn).
      if (!state.net.isHost) return;
      const from = String(msg.from || "");
      if (!from) return;
      const payload = msg.payload || null;
      const legacyMeta = msg.meta || null;
      const meta = payload?.meta || legacyMeta || null;
      if (meta) state._netMetaById.set(from, meta);
      const p = getPlayerById(state, from);
      if (p) {
        p._netRespawnRequested = true;
        p._netRespawnRequest = payload || { action: 'legacy', meta };
      }
      return;
    }

    if (msg.type === "coinGain") {
      // Joiner: host credited us meta coins for a picked coin orb.
      if (state.net.isHost) return;
      const to = (msg.to != null ? String(msg.to) : "");
      const myId = state.net?.playerId ? String(state.net.playerId) : (state.player?.id ? String(state.player.id) : "local");
      if (to && to !== myId) return;
      const amt = Number(msg.amount || 0);
      if (!Number.isFinite(amt) || amt === 0) return;
      if (!state.progression) return;
      try { ensureShopMeta(state.progression); } catch {}
      state.progression.coins = Math.max(0, (state.progression.coins | 0) + (amt | 0));
      try { saveProgression(state.progression); } catch {}
      // Small feedback
      try {
        if (state.floatingTexts && state.player) {
          state.floatingTexts.push({ x: state.player.x, y: state.player.y - 40, text: `+${amt}🪙`, time: 0.8 });
        }
      } catch {}
      return;
    }

    if (msg.type === "progGain") {
      // Joiner: host credited us persistent progression resources.
      if (state.net.isHost) return;
      const to = (msg.to != null ? String(msg.to) : "");
      const aliases = getLocalProgressionAliases(state);
      if (to && !aliases.includes(to)) return;
      const payload = (msg.payload && typeof msg.payload === 'object') ? msg.payload : null;
      if (!payload) return;
      applyProgressionPayloadToLocal(state, payload, null);
      return;
    }

    if (msg.type === "startRun") {
      if (state.net.isHost) return;

      // Host started a new run: switch from lobby to gameplay.
      // Joiners keep the world purely snapshot-driven, but we still reset local state
      // so visuals are clean and consistent.
      startNewRun(state);

      if (state.player && state.net.playerId) {
        state.player.id = String(state.net.playerId);
        state.player.color = pickColorForId(state.player.id);
        state.player.nickname = state.progression?.nickname || state.player.nickname;
        if (typeof state.progression?.avatarIndex === "number") state.player.avatarIndex = state.progression.avatarIndex | 0;
      }

      state.mode = "playing";
      state.paused = false;

      // Drop stale snapshots so we don't apply an old frame right after reset.
      if (state.net) {
        state.net.latestSnapshot = null;
        state.net.latestPlayerState = null;
      }

      state.enemies = [];
      state.projectiles = [];
      state.rockets = [];
      state.xpOrbs = [];
      state.buffs = [];
      state.floatingTexts = [];
      state.popups = [];
      return;
    }

    // --- Host-authoritative run-upgrades (level-up choices) ---
    // Rule: ONLY the player who is choosing is frozen. The world does NOT pause.
    // (runPause/runResume are kept for backward-compatibility with older hosts, but they only affect 'by' target.)
    if (msg.type === "runPause") {
      if (state.net.isHost) return;
      const myId = state.net?.playerId ? String(state.net.playerId) : (state.player?.id ? String(state.player.id) : "local");
      const by = (msg.by != null ? String(msg.by) : "");
      if (by && by !== myId) return;
      clearLegacyRunUpgradeState(state);
      return;
    }

    if (msg.type === "runResume") {
      if (state.net.isHost) return;
      clearLegacyRunUpgradeState(state);
      return;
    }

    if (msg.type === "runChoices") {
      if (state.net.isHost) return;
      const myId = state.net?.playerId ? String(state.net.playerId) : (state.player?.id ? String(state.player.id) : "local");
      const to = (msg.to != null ? String(msg.to) : "");
      if (to && to !== myId) return;
      clearLegacyRunUpgradeState(state);
      if (state.popups) state.popups.push({ text: "Run upgrades moved to Floor Shop", time: 1.4 });
      return;
    }

    if (msg.type === "runRequest") {
      if (!state.net?.isHost) return;
      clearLegacyRunUpgradeState(state, { clearSessions: true });
      return;
    }

    if (msg.type === "runPick") {
      if (!state.net.isHost) return;
      clearLegacyRunUpgradeState(state, { clearSessions: true });
      return;
    }
  };

  // Internal sim/update (variable dt for offline/joiners; fixed-step wrapper may call this).
  function updateSim(dt) {
    state.time += dt;

    // Expire one-shot kick notifications (used when a downed player is left behind).
    if (state._kickIdsUntil && state.time >= state._kickIdsUntil) {
      state._kickIdsUntil = 0;
      state._kickIds = null;
    }

    if (typeof state._breachPatchedFlash === "number" && state._breachPatchedFlash > 0) {
      state._breachPatchedFlash -= dt;
      if (state._breachPatchedFlash < 0) state._breachPatchedFlash = 0;
    }

    // Hub NPC proximity marker (used by DOM interaction UI)
    state._hubNearbyNpc = null;

    // Canvas start menu UI is intentionally disabled.
    // The DOM lobby overlay (src/ui/lobbyDom.js) is the only active menu.

    const online = isOnline(state);

    // Joiner client: do not simulate world; send input and apply snapshots.
    if (online && !state.net.isHost) {
      // Joiner client: snapshot-driven.
      // If the host is already running (snapshots coming in) and we're still in the lobby,
      // auto-enter gameplay so we actually "connect into the same match".
      if (state.mode !== "playing" && state.net && state.net.latestSnapshot) {
        startNewRun(state);
        if (state.player && state.net.playerId) {
          state.player.id = String(state.net.playerId);
          state.player.color = pickColorForId(state.player.id);
          state.player.nickname = state.progression?.nickname || state.player.nickname;
          if (typeof state.progression?.avatarIndex === "number") state.player.avatarIndex = state.progression.avatarIndex | 0;
        }
        state.mode = "playing";
        state.paused = false;
      }

      // Clear stale local-only overlays/locks that can block joiner movement after connect.
      if (state._floorShopActive && !isFloorShopOverlayVisible()) state._floorShopActive = false;
      if (state._runUpgradeActive) clearLegacyRunUpgradeState(state);
      if (!isFloorShopOverlayVisible()) state._floorShopActive = false;
      if (!state.overlayMode) state.paused = false;
      if (state.player) {
        state.player._lvlUpChoosing = false;
        state.player._lvlUpInvuln = false;
      }

      // Lightweight client-side prediction for our own movement
      // (we still rely on host for all combat/world state).
      if (state.mode === "playing" && !state.paused && !state._runUpgradeActive && !state._floorShopActive && state.player && typeof state.player.update === "function") {
        if (state.player.hp > 0 && !state.overlayMode && !state.player._lvlUpChoosing) {
          state.player.update(dt, state);
        }
      }

      runPhaseSafe(state, "updatePopups", () => updatePopups(state, dt));

      if (state.mode === "playing") {
        sendLocalInputToHost(state);

        if (state.net.latestPlayerState) {
          applyPlayerStateToClient(state, state.net.latestPlayerState, { canPlayerUseFloorShop, openFloorShopOverlay: (s)=>openFloorShopOverlay(s, { openFloorShopOverlay, syncPersistentRunUnlocks }) });
        }
        if (state.net.latestSnapshot) {
          applySnapshotToClient(state, state.net.latestSnapshot);
        }

        // Joiners: re-calc local stats from replicated global buffs.
        // Use dt=0 so we don't desync buff timers against the host; host is source-of-truth.
        if (state.buffs) {
          try { updateBuffs(state, 0); } catch {}
        }
        // Smooth remote snapshot motion (reduces jitter/"laggy" feel)
        smoothNetEntities(state, dt);
        // Projectiles/rockets are visual-only on joiners; advance them between snapshots.
        updateNetVisualProjectiles(state, dt);
        // Keep camera following our local player smoothly
        if (state.camera && state.player) {
          runPhaseSafe(state, "camera.update", () => state.camera.update(state.player, dt, state));
        }

        syncPersistentRunUnlocks(state);

        // Compute nearby Hub NPC for joiners too (client-side only)
        if (!state.overlayMode && state.player) {
          state._hubNearbyNpc = getNearbyHubNpcForPlayer(state.player, state);
        }
        maybeEnterDeathContinueOverlay(state);
      }

      return;
    }

    if (state.mode !== "playing") {
      // Only animate popups (e.g., death screen messages) when not in gameplay
      runPhaseSafe(state, "updatePopups", () => updatePopups(state, dt));
      return;
    }

    if (state.paused) {
      // When paused: don't move entities or advance timers except popups
      runPhaseSafe(state, "updatePopups", () => updatePopups(state, dt));
      return;
    }

    // Host (online) or offline: simulate world
    // Clear transient weapon visuals each tick (co-op safe).
    if (state._laserVisuals && typeof state._laserVisuals.clear === "function") state._laserVisuals.clear();
    if (state._lightningVisuals && typeof state._lightningVisuals.clear === "function") state._lightningVisuals.clear();
    state._laserVisual = null;
    state._lightningVisual = null;
    runPhaseSafe(state, "updateBuffs", () => updateBuffs(state, dt));
    runPhaseSafe(state, "updatePlayers", () => updatePlayers(state, dt, online, { syncPersistentRunUnlocks }));

    runPhaseSafe(state, "updateRevives", () => updateRevives(state, dt));

    // Permanent HP regen from meta bonuses + in-run regen (HP/s)
    const regenPerSec = (state.player.metaHpRegen || 0) + (state.player.runHpRegen || 0);
    if (regenPerSec > 0 && state.player.hp > 0) {
      state.player.hp = Math.min(
        state.player.maxHP,
        state.player.hp + regenPerSec * dt
      );
    }

    runPhaseSafe(state, "updateArenaHazards", () => updateArenaHazards(state, dt));

    // Pixel_GO: no radial zones.

    runPhaseSafe(state, "updateWeapons", () => updateWeapons(state, dt, online));
    runPhaseSafe(state, "spawnSystem.update", () => state.spawnSystem.update(dt));

    // Track HP drops to mark combat (used by out-of-combat upgrade gating).
    const _hpBefore = new Map();
    for (const pp of getPlayersArr(state)) {
      if (!pp) continue;
      _hpBefore.set(String(pp.id || "local"), pp.hp);
    }

    runPhaseSafe(state, "updateEnemies", () => updateEnemies(state, dt));

    for (const pp of getPlayersArr(state)) {
      if (!pp) continue;
      const prev = _hpBefore.get(String(pp.id || "local"));
      if (typeof prev === "number" && pp.hp < prev - 1e-6) {
        pp._lastCombatAt = state.time;
      }
    }

    // Biome skill effects that act on enemies/world (blackholes, ice walls, heal pulses, explosions).
    runPhaseSafe(state, "updateSkillFx", () => updateSkillFx(state, dt));

    runPhaseSafe(state, "updateProjectiles", () => updateProjectiles(state, dt));
    runPhaseSafe(state, "updateXPOrbs", () => updateXPOrbs(state, dt));

    // Run level-up flow (Magic Survival style)
    if (online && state.net && state.net.isHost) {
      // Per-player: only the leveling player is frozen; the world keeps running.
      hostProcessRunUpgrades(state);
    } else {
      // Offline singleplayer: run-upgrades are opened manually via HUD button.
    }

    updateRunUpgradeAvailability(state);

    runPhaseSafe(state, "updateFloatingTexts", () => updateFloatingTexts(state, dt));
    runPhaseSafe(state, "updatePopups", () => updatePopups(state, dt));

    // Pixel_GO: room transitions + collapse
    if (state.roomDirector && typeof state.roomDirector.update === "function") {
      const canAuthorRooms = !(online && state.net && !state.net.isHost);
      if (canAuthorRooms) {
        try { state.roomDirector.update(dt); } catch {}
      } else {
        try { if (typeof state.roomDirector._applyDynamicBounds === 'function') state.roomDirector._applyDynamicBounds(); } catch {}
      }
    }

    runPhaseSafe(state, "camera.update", () => state.camera.update(state.player, dt, state));

    syncPersistentRunUnlocks(state);

    // Hub NPC proximity (offline + host)
    if (!state.overlayMode && state.player) {
      state._hubNearbyNpc = getNearbyHubNpcForPlayer(state.player, state);
    }
    maybeEnterDeathContinueOverlay(state);
    if (online) {
      runPhaseSafe(state, "processRespawnRequests", () => processRespawnRequests(state, { isOnline, startNewRun, syncPersistentRunUnlocks }));
      runPhaseSafe(state, "maybeSendPlayerState", () => maybeSendPlayerState(state, dt));
      runPhaseSafe(state, "maybeSendSnapshot", () => maybeSendSnapshot(state, dt));
    }
  }

  // Public update: host uses a fixed 60Hz simulation step; everyone else uses frame dt.
  function update(dt) {
    const online = isOnline(state);
    const isHost = !!(online && state.net && state.net.isHost);

    // Fixed-step sim only for the authoritative host while playing.
    if (isHost && state.mode === "playing" && !state.paused) {
      const SIM_DT = 1 / 60;
      state._simAcc = (state._simAcc || 0) + dt;

      // Prevent spiral-of-death if the tab hiccups.
      const MAX_ACC = 0.25;
      if (state._simAcc > MAX_ACC) state._simAcc = MAX_ACC;

      let steps = 0;
      const MAX_STEPS = 10;
      while (state._simAcc >= SIM_DT && steps < MAX_STEPS) {
        updateSim(SIM_DT);
        state._simAcc -= SIM_DT;
        steps++;
      }

      // If we didn't step (very tiny dt), still advance popups/UI time a bit.
      if (steps === 0) {
        updateSim(Math.min(dt, SIM_DT));
      }

      return;
    }

    // Offline or joiners: use frame dt.
    updateSim(dt);
  }

function render() {
    const { canvas, ctx, player } = state;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // World space (with camera): zones + world grid live in world coordinates
    state.camera.applyTransform(ctx);

    runPhaseSafe(state, "renderWorldBackground", () => renderWorldBackground(state, ctx));
    runPhaseSafe(state, "renderHubNpcs", () => renderHubNpcs(ctx, state));
    runPhaseSafe(state, "renderXPOrbs", () => renderXPOrbs(state, ctx));
    runPhaseSafe(state, "renderSkillFxWorld", () => renderSkillFxWorld(state, ctx));
    runPhaseSafe(state, "renderEnemies", () => renderEnemies(state, ctx));
    runPhaseSafe(state, "renderSummons", () => renderSummons(state, ctx));
    runPhaseSafe(state, "renderProjectiles", () => renderProjectiles(state, ctx));
    runPhaseSafe(state, "renderPlayers", () => renderPlayers(state, ctx));
    runPhaseSafe(state, "renderPersistentHubCoreOverlay", () => renderPersistentHubCoreOverlay(ctx, state));
    runPhaseSafe(state, "renderHPBarsWorld", () => renderHPBarsWorld(state, ctx));
    runPhaseSafe(state, "renderBuffAuras", () => renderBuffAuras(state, ctx));

    runPhaseSafe(state, "camera.resetTransform", () => state.camera.resetTransform(ctx));

    runPhaseSafe(state, "renderFloatingTexts", () => renderFloatingTexts(ctx, state));

    if (state.mode === "playing") {
      runPhaseSafe(state, "renderHUD", () => renderHUD(ctx, state));
    }

    runPhaseSafe(state, "renderPopups", () => renderPopups(ctx, state));

    // Online overlays (death screens) that must not stop the host simulation.
    if (state.overlayMode === "deathContinue") {
      renderDeathContinueScreen(ctx, state);
      return;
    }
    if (state.overlayMode === "resurrection") {
      renderResurrectionScreen(ctx, state);
      return;
    }
    if (state.overlayMode === "upgrade") {
      renderUpgradeMenu(ctx, state);
      return;
    }
    if (state.overlayMode === "stats") {
      // Render meta upgrades screen as an overlay (do not stop host simulation).
      renderUpgradeMenu(ctx, { ...state, mode: "stats" });
      return;
    }

    if (state.mode === "resurrection") {
      renderResurrectionScreen(ctx, state);
    } else if (state.mode === "upgrade" || state.mode === "stats") {
      renderUpgradeMenu(ctx, state);
    } else if (state.mode === "startMenu") {
      // Canvas lobby disabled: keep only the world preview behind the DOM lobby.
    } else if (state.mode === "settings") {
      renderSettingsMenu(ctx, state);
    }
  }


  function handlePointerDown(x, y) {
    // Online overlays (death screens) have priority.
    if (state.overlayMode === "deathContinue") {
      const a = handleDeathContinueClick(x, y, state);
      if (a === "continue") {
        handleDeathContinueAction(state, 'continue', { isOnline, startNewRun, syncPersistentRunUnlocks });
      } else if (a === "hub") {
        handleDeathContinueAction(state, 'hub', { isOnline, startNewRun, syncPersistentRunUnlocks });
      }
      return;
    }
    if (state.overlayMode === "resurrection") {
      const a = handleResurrectionClick(x, y, state);
      if (a === "resurrect") {
        applyResurrection(state.progression);
        try { saveProgression(state.progression); } catch {}
        if (isOnline(state) && state.net && state.net.status === "connected" && !state.net.isHost) {
          state.net.sendMeta(buildNetMetaPayload(state.progression));
        }
        state.overlayMode = "upgrade";
      } else if (a === "skip") {
        state.overlayMode = "upgrade";
      }
      return;
    }
    if (state.overlayMode === "upgrade") {
      const a = handleUpgradeClick(x, y, state);
      if (a === "upgrade") {
        // After any upgrade spend, sync meta to host so stats match.
        if (isOnline(state) && state.net && state.net.status === "connected" && !state.net.isHost) {
          state.net.sendMeta(buildNetMetaPayload(state.progression));
        }
      } else if (a === "start") {
        if (isOnline(state)) {
          // In co-op, "start" means respawn (world continues).
          const meta = buildNetMetaPayload(state.progression);
          // Apply immediately locally for responsiveness
          if (state.player) {
            applyNetMetaToPlayer(state, state.player, meta);
            // Host can instantly apply the respawn locally; joiners wait for snapshot.
            if (state.net && state.net.isHost) {
              state.player.hp = state.player.maxHP;
              state.player.x = 0;
              state.player.y = 0;
              state.player.vx = 0;
              state.player.vy = 0;
            }
          }
          // If joiner: ask host to respawn us. If host: mark our own respawn request.
          if (state.net && state.net.status === "connected") {
            if (state.net.isHost) {
              if (state.player) state.player._netRespawnRequested = true;
            } else {
              state.net.requestRespawn(meta);
            }
          }
          state._waitingRespawnAck = true;
          state._deathHandled = true;
          state.overlayMode = null;
        } else {
          // Offline: start a new run as before.
          startNewRun(state);
        }
      } else if (a === "menu") {
        // Return to menu/lobby UI (keep connection / keep host sim running).
        state.overlayMode = null;
        state.mode = "startMenu";
      }
      return;
    }
    if (state.overlayMode === "stats") {
      const a = handleUpgradeClick(x, y, { ...state, mode: "stats" });
      if (a === "upgrade") {
        if (isOnline(state) && state.net && state.net.status === "connected" && !state.net.isHost) {
          state.net.sendMeta(buildNetMetaPayload(state.progression));
        }
      } else if (a === "back" || a === "menu") {
        state.overlayMode = null;
      }
      return;
    }

    // Start menu: canvas UI disabled (DOM lobby handles input).
    if (state.mode === "startMenu") return;

    // Settings screen
    if (state.mode === "settings") {
      const a = handleSettingsClick(x, y, state);
      if (a === "back") {
        state.mode = "startMenu";
      }
      return;
    }

    // Stats & Up screen
    if (state.mode === "stats") {
      const a = handleUpgradeClick(x, y, state);
      if (a === "back") {
        state.mode = "startMenu";
      } else if (a === "start") {
        startNewRun(state);
      }
      return;
    }

    // Resurrection screen clicks
    if (state.mode === "resurrection") {
      var resAction = handleResurrectionClick(x, y, state);
      if (resAction === "resurrect" || resAction === "skip") {
        state.mode = "upgrade";
      }
      return;
    }

    // Upgrade menu clicks
    if (state.mode === "upgrade") {
      var action = handleUpgradeClick(x, y, state);
      if (action === "start") {
        startNewRun(state);
      } else if (action === "menu") {
        state.mode = "startMenu";
      }
      return;
    }

    const buildButtonRect = state._buildButtonRect;
    if (buildButtonRect && x >= buildButtonRect.x && x <= buildButtonRect.x + buildButtonRect.w && y >= buildButtonRect.y && y <= buildButtonRect.y + buildButtonRect.h) {
      state._buildPanelOpen = !state._buildPanelOpen;
      if (state._buildPanelOpen) {
        state._statsPanelOpen = false;
        state._statsPanelExpanded = false;
        if (!state._buildPanelSelectedKey) state._buildPanelSelectedKey = '';
      }
      return true;
    }

    const statsButtonRect = state._statsButtonRect;
    if (statsButtonRect && x >= statsButtonRect.x && x <= statsButtonRect.x + statsButtonRect.w && y >= statsButtonRect.y && y <= statsButtonRect.y + statsButtonRect.h) {
      const openingHeroMenu = state.overlayMode !== 'character';
      state.overlayMode = openingHeroMenu ? 'character' : null;
      state._buildPanelOpen = false;
      state._statsPanelOpen = false;
      state._statsPanelExpanded = false;
      return true;
    }

    if (state._buildPanelOpen) {
      const closeRect = state._buildPanelCloseRect;
      if (closeRect && x >= closeRect.x && x <= closeRect.x + closeRect.w && y >= closeRect.y && y <= closeRect.y + closeRect.h) {
        state._buildPanelOpen = false;
        return true;
      }
      const slotRects = Array.isArray(state._buildSlotRects) ? state._buildSlotRects : [];
      for (const rect of slotRects) {
        if (!rect) continue;
        if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
          state._buildPanelSelectedKey = String(rect.key || '');
          return true;
        }
      }
      const panelRect = state._buildPanelRect;
      if (panelRect) {
        const insidePanel = x >= panelRect.x && x <= panelRect.x + panelRect.w && y >= panelRect.y && y <= panelRect.y + panelRect.h;
        if (insidePanel) return true;
      }
      state._buildPanelOpen = false;
      return true;
    }

    if (state._statsPanelOpen) {
      const toggleRect = state._statsPanelToggleRect;
      if (toggleRect && x >= toggleRect.x && x <= toggleRect.x + toggleRect.w && y >= toggleRect.y && y <= toggleRect.y + toggleRect.h) {
        state._statsPanelExpanded = !state._statsPanelExpanded;
        return true;
      }
      const closeRect = state._statsPanelCloseRect;
      if (closeRect && x >= closeRect.x && x <= closeRect.x + closeRect.w && y >= closeRect.y && y <= closeRect.y + closeRect.h) {
        state._statsPanelOpen = false;
        state._statsPanelExpanded = false;
        return true;
      }
      const panelRect = state._statsPanelRect;
      if (panelRect) {
        const insidePanel = x >= panelRect.x && x <= panelRect.x + panelRect.w && y >= panelRect.y && y <= panelRect.y + panelRect.h;
        if (insidePanel) return true;
      }
      state._statsPanelOpen = false;
      state._statsPanelExpanded = false;
      return true;
    }

    // Pixel_GO: Gate actions (mouse/tap) — must work for host & joiners.
    if (state.mode === "playing" && !state.overlayMode && Array.isArray(state._gateButtons) && state._gateButtons.length) {
      for (const b of state._gateButtons) {
        if (!b) continue;
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          const rd = state.roomDirector;
          const p = state.player;
          if (rd && p) {
            const gateId = b.gateId;
            const action = b.action || 'repair';
            const online = isOnline(state) && state.net && state.net.status === "connected";
            if (!online || (online && state.net.isHost)) {
              const did = (typeof rd.performGateAction === 'function') ? rd.performGateAction(gateId, action, p) : false;
              if (did) state._breachPatchedFlash = 0.6;
            } else {
              // Joiner: send an action via input stream (host-authoritative).
              state._gateActSeq = (state._gateActSeq || 0) + 1;
              state._gateActPending = { gateId, action, seq: state._gateActSeq };
            }
          }
          return true;
        }
      }
    }

    // Pixel_GO: Revive actions (mouse/tap) — on corpses.
    if (state.mode === "playing" && !state.overlayMode && Array.isArray(state._reviveButtons) && state._reviveButtons.length) {
      for (const b of state._reviveButtons) {
        if (!b) continue;
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          const targetId = b.targetId;
          const online = isOnline(state) && state.net && state.net.status === "connected";
          if (!online || (online && state.net.isHost)) {
            try { startReviveById(state, state.player, targetId); } catch {}
          } else {
            state._reviveActSeq = (state._reviveActSeq || 0) + 1;
            state._reviveActPending = { targetId, seq: state._reviveActSeq };
          }
          return true;
        }
      }
    }

    // Pixel_GO v0.4: Floor terminal (NPC shop) open (mouse/tap)
    if (state.mode === "playing" && !state.overlayMode && Array.isArray(state._shopButtons) && state._shopButtons.length) {
      for (const b of state._shopButtons) {
        if (!b) continue;
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          tryOpenFloorShop(state, { openFloorShopOverlay, syncPersistentRunUnlocks });
          return true;
        }
      }
    }




    // Hub NPC tap interaction (mobile-friendly)
    if (state.mode === "playing" && !state.overlayMode && state._hubNearbyNpc) {
      const wp = screenToWorld(x, y, state);
      const npc = findNpcAtWorldPos(wp.x, wp.y, state);
      if (npc && npc.id === state._hubNearbyNpc.id) {
        state._hubNpcTap = npc.kind;
        return;
      }
    }

    // Run-upgrade button hit test (manual open, out of combat)
    var upRect = state._runUpgradeButtonRect;
    if (state.mode === "playing" && upRect) {
      if (
        x >= upRect.x &&
        x <= upRect.x + upRect.w &&
        y >= upRect.y &&
        y <= upRect.y + upRect.h
      ) {
        tryOpenManualRunUpgradeOverlay(state);
        return;
      }
    }

    // Pause button hit test
    var rect = state._pauseButtonRect;
    if (rect) {
      if (
        x >= rect.x &&
        x <= rect.x + rect.w &&
        y >= rect.y &&
        y <= rect.y + rect.h
      ) {
        state.paused = !state.paused;
        return;
      }
    }
    // Control-mode toggle buttons in pause menu
    if (state.mode === "playing" && state.paused) {
      var rectClassic = state._controlModeClassicRect;
      var rectAuto = state._controlModePortraitAutoRect;

      if (rectClassic &&
          x >= rectClassic.x &&
          x <= rectClassic.x + rectClassic.w &&
          y >= rectClassic.y &&
          y <= rectClassic.y + rectClassic.h) {
        setControlMode("oneHand");
        return;
      }

      if (rectAuto &&
          x >= rectAuto.x &&
          x <= rectAuto.x + rectAuto.w &&
          y >= rectAuto.y &&
          y <= rectAuto.y + rectAuto.h) {
        setControlMode("twoHand");
        return;
      }
    }

    return false;
  }

  function handlePointerMove(x, y) {
    // Start menu: canvas UI disabled.
    if (state.mode === "startMenu") return;
  }

  function handlePointerUp(x, y) {
    // Start menu: canvas UI disabled (DOM lobby handles input).
    return;
  }

  // Keyboard shortcut: U now just reminds that run upgrades live in the Floor Shop.
  function isTypingFocus() {
    if (typeof document === "undefined") return false;
    const el = document.activeElement;
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || el.isContentEditable;
  }

  if (typeof window !== "undefined" && !state._runUpKeyBound) {
    state._runUpKeyBound = true;
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      if (e.code !== "KeyU") return;
      if (!state || state.mode !== "playing") return;
      if (isTypingFocus()) return;
      // Don't open on top of other overlays
      if (state.overlayMode) return;
      const did = tryOpenManualRunUpgradeOverlay(state);
      if (did) e.preventDefault();
    });
  }

  // Keyboard shortcut: E for nearest gate action (Pixel_GO)
  if (typeof window !== "undefined" && !state._breachPatchKeyBound) {
    state._breachPatchKeyBound = true;
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      if (e.code !== "KeyE") return;
      if (!state || state.mode !== "playing") return;
      if (isTypingFocus()) return;
      if (state.overlayMode) return;
      if (tryOpenFloorShop(state, { openFloorShopOverlay, syncPersistentRunUnlocks })) {
        e.preventDefault();
        return;
      }
      const rd = state.roomDirector;
      const p = state.player;
      if (!rd || !p || typeof rd.performGateAction !== "function") return;

      // Find nearest gate in current room.
      const room = rd.current;
      const gates = room && Array.isArray(room.breaches) ? room.breaches : [];
      let best = null;
      let bestD2 = Infinity;
      for (const g of gates) {
        if (!g) continue;
        const ip = (typeof rd.getGateInnerPoint === 'function') ? rd.getGateInnerPoint(room, g, 36) : (typeof rd.getBreachInnerPoint === 'function' ? rd.getBreachInnerPoint(room, g, 36) : null);
        if (!ip) continue;
        const dx = p.x - ip.x;
        const dy = p.y - ip.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; best = g; }
      }
      if (!best) return;
      if (bestD2 > (170 * 170)) return;

      const bridgeOpen = !!state._bridgeBuilt;
      const action = (room && room.cleared && bridgeOpen && !best.rewardUsed) ? 'reward' : 'repair';
      const did = rd.performGateAction(best.id, action, p);
      if (did) {
        state._breachPatchedFlash = 0.6;
        e.preventDefault();
      }
    });
  }

  if (typeof window !== "undefined" && !state._floorShopHotkeyBound) {
    state._floorShopHotkeyBound = true;
    window.addEventListener("keydown", (e) => {
      if (!state || state.mode !== "playing") return;
      if (isTypingFocus()) return;
      if (!state._floorShopActive || !isFloorShopOverlayVisible()) return;
      const code = e.code || e.key;
      if (handleFloorShopHotkey(code) || handleFloorShopHotkey(e.key)) {
        e.preventDefault();
      }
    });
  }

  return {
    state,
    get player() {
      return state.player;
    },
    // Used by the DOM-based lobby (fallback Start button): start an offline run.
    startOfflineRun() {
      try { state.net?.disconnect?.(); } catch {}
      if (!(state._savedRunResumeAvailable && state._hubResumeRunActive && state.player)) {
        startNewRun(state);
      }
      state.mode = "playing";
      state.overlayMode = null;
      state.paused = false;
    },
    update,
    render,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}

function resetLegacyRunUpgradeForPlayer(player) {
  if (!player) return;
  player._pendingLevelUps = 0;
  player._lvlUpChoosing = false;
  player._lvlUpInvuln = false;
}

function clearLegacyRunUpgradeState(state, { clearSessions = false } = {}) {
  if (!state) return;
  state._runUpgradeActive = false;
  state._runUpgradeChoices = null;
  state._runUpPending = 0;
  state._runUpReady = false;
  state._runUpReadyIn = 0;
  state._runUpBlockReason = "disabled";
  try { hideRunUpgradeOverlay(); } catch {}

  if (Array.isArray(state.players)) {
    for (const p of state.players) resetLegacyRunUpgradeForPlayer(p);
  }
  resetLegacyRunUpgradeForPlayer(state.player);

  if (clearSessions && state._runUpNet) {
    try { state._runUpNet.sessions?.clear?.(); } catch {}
    try { state._runUpNet.requests?.clear?.(); } catch {}
  }
}

function startNewRun(state, { preserveSavedCheckpoint = false } = {}) {
  try { ensureShopMeta(state.progression); } catch {}
  try { ensureHubProgression(state.progression); } catch {}
  if (!preserveSavedCheckpoint) clearSavedRunCheckpoint(state);
  // Always start the run from the first level (do NOT scale run start level by score).
  const startLevel = 1;

  state._hubResumeRunActive = false;
  state._hubResumeNextFloor = 0;
  state._savedRunResumePlan = null;

  if (state.flags) {
    state.flags.resGuardianKilledThisRun = false;
  }
  const startPos = { x: 0, y: 0 };

  const player = new Player(startPos, startLevel);
  // Ensure local player has a stable id for offline + net-host mode.
  if (!player.id) player.id = state.net?.playerId ? String(state.net.playerId) : "local";
  player.nickname = state.progression?.nickname || "Player";
  player.avatarIndex = state.progression?.avatarIndex || 0;
  player.auraId = state.progression?.auraId || 0;
  // Meta shop levels used to gate in-run upgrade pool.
  player._metaSkillMeta = state.progression?.skillMeta || {};
  player._selectedStarterLoadout = state.progression?.hubBuild?.coreKey || state.progression?.selectedStarterLoadout || "mecha";
  const meta = applyLimitsToPlayer(player, state.progression.limits);

  state.player = player;
  state.players = [player];
  state.meta = {
    xpGainMult: meta?.xpGainMult ?? 1,
    scoreMult: meta?.scoreMult ?? 1,
    pickupBonusRadius: meta?.pickupBonusRadius ?? 0,
  };

  // Build is now authored in the hub and projected into the runtime combat layer.
  applyHubBuildToPlayer(player, state.progression);
  applyProgressionSpToPlayer(player, state.progression);
  player._deathContinueCount = 0;

  state._deathContinueCount = 0;
  state._deathHandled = false;
  state._waitingRespawnAck = false;
  state.overlayMode = null;

  state.camera = new Camera(state.canvas);
  state.currentZone = 0;

  // Pixel_GO: room-based infinite chain
  state.roomDirector = new RoomDirector(state);
  const roomStart = state.roomDirector?.current?.arenaSpec?.anchors?.playerStart;
  if (roomStart && Number.isFinite(Number(roomStart.x)) && Number.isFinite(Number(roomStart.y))) {
    player.x = Number(roomStart.x);
    player.y = Number(roomStart.y);
  }

  state.enemies = [];
  state.projectiles = [];
  state.rockets = [];
  state.iceWalls = [];
  state.blackholes = [];
  state.healPulses = [];
  state._explosions = [];
  state._nextFxId = 0;
  state.xpOrbs = [];
  state.summons = [];
  state._nextSummonId = 0;
  state._summonTankCD = {};
  state._summonTankTauntTick = {};
  state.buffs = [];
  state.floatingTexts = [];
  state.popups = [];
  state.runScore = 0;
  state.lastRunSummary = null;
  state._laserVisual = null;
  state._lightningVisual = null;
  state._runUpgradeActive = false;
  state._runUpgradeChoices = null;
  state._floorShopActive = false;
  try { hideFloorShopOverlay(); } catch {}
  if (state._runUpNet && state._runUpNet.sessions && typeof state._runUpNet.sessions.clear === "function") {
    state._runUpNet.sessions.clear();
  }
  // Per-player weapon visuals (co-op): avoids overwriting when multiple players use laser/chain.
  state._laserVisuals = new Map();
  state._lightningVisuals = new Map();

  state.spawnSystem = new RoomSpawnSystem(state);
  state.mode = "playing";

  // If we're the host in an online room, re-add remote players after reset.
  if (isOnline(state) && state.net.isHost) {
    syncHostPlayersFromRoomInfo(state);
  }
}

function isOnline(state) {
  return !!(state.net && state.net.status === "connected" && state.net.roomCode);
}

function syncPersistentRunUnlocks(state) {
  const prog = state?.progression;
  const p = state?.player;
  if (!prog || !p) return;
  try { ensureShopMeta(prog); } catch {}
  let changed = false;
  for (const key of ["rockets", "energyBomb", "fireBomb", "iceBomb"]) {
    const hasSkill = hasSkillOrEvolution(p, key);
    if (!hasSkill) continue;
    const metaId = `skill:${key}`;
    const cur = Number(prog.skillMeta?.[metaId] || 0) || 0;
    if (cur < 1) {
      prog.skillMeta[metaId] = 1;
      changed = true;
    }
  }
  const pts = Math.max(0, Math.floor((typeof prog.deathPoints === "number" ? prog.deathPoints : prog.upgradePoints) || 0));
  if ((prog.upgradePoints | 0) !== pts || (prog.deathPoints | 0) !== pts) {
    prog.upgradePoints = pts;
    prog.deathPoints = pts;
    changed = true;
  }
  if (changed) {
    try { saveProgression(prog); } catch {}
  }
}

function autoApplyRemoteRunUpgrades(state) {
  // Retired together with legacy pending level-up choices.
  clearLegacyRunUpgradeState(state);
}

function updateRunUpgradeAvailability(state) {
  if (!state) return;
  clearLegacyRunUpgradeState(state);
}

function applyRunUpgradeRepel(state, dt) {
  // Retired: enemy displacement during menus caused bad arena behavior.
}

// ---------------------------------------------------------------------------
// Biome skill FX (host-authoritative)
// ---------------------------------------------------------------------------

function openManualRunUpgradeOverlay(state) {
  clearLegacyRunUpgradeState(state);
  if (state && state.popups) state.popups.push({ text: "Run upgrades moved to Floor Shop", time: 1.4 });
  return false;
}

function tryOpenManualRunUpgradeOverlay(state) {
  clearLegacyRunUpgradeState(state);
  if (state && state.popups) state.popups.push({ text: "Run upgrades moved to Floor Shop", time: 1.4 });
  return false;
}

function maybeOpenRunUpgradeOverlay(state) {
  clearLegacyRunUpgradeState(state);
  return false;
}

// ---------------------------------------------------------------------------
// Pixel_GO v0.4: Floor terminal (NPC shop)
// ---------------------------------------------------------------------------

// Host-authoritative run-upgrade flow (per-player):
// Each player chooses independently. Only that player is frozen/invulnerable while picking.
// Host sends runChoices(to=playerId) and applies the pick on runPick.
function hostProcessRunUpgrades(state) {
  // Legacy manual level-up UI is retired in v0.4.15.
  // Host keeps this as a cleanup point so old requests/flags cannot stall a run.
  clearLegacyRunUpgradeState(state, { clearSessions: true });
}

function hostApplyRunPick(state, fromId, choiceId, replaceKey = null) {
  clearLegacyRunUpgradeState(state, { clearSessions: true });
}


function sendLocalInputToHost(state) {
  if (state.mode !== "playing") return;
  if (state.paused) return;
  if (state._runUpgradeActive) return;
  // throttle
  const now = state.time;
  if (now - (state._netLastInputSendAt || 0) < 0.05) return;
  state._netLastInputSendAt = now;

  const p = state.player;
  if (!p) return;
  if (p.hp <= 0) return;
  if (state.overlayMode) return;
  if (state.mode !== "playing") return;

  // movement: pointer/joystick -> fallback to keyboard
  const mv = getMoveVectorFromPointer();
  let mx = mv.x;
  let my = mv.y;
  if (Math.hypot(mx, my) < 0.01) {
    const kb = getKeyboardVector();
    mx = kb.x;
    my = kb.y;
  }

  const aim = getAimDirectionForPlayer(
    p,
    state.camera,
    state.canvas,
    state.enemies,
    getAimRangeForPlayer(p),
    state.time
  );

  const input = {
    mx,
    my,
    aim: aim ? { x: aim.x, y: aim.y } : null,
    fire: isFiringActive(),
  };

  // While reviving, movement and shooting are disabled.
  if (p._reviving) {
    input.mx = 0;
    input.my = 0;
    input.fire = false;
  }

  // While floor shop overlay is open, movement and shooting are disabled.
  if (state._floorShopActive) {
    input.mx = 0;
    input.my = 0;
    input.fire = false;
  }

  // Pixel_GO: one-shot-ish gate actions (patched by seq on host).
  if (state._gateActPending && state._gateActPending.gateId) {
    input.gateAct = {
      gateId: String(state._gateActPending.gateId),
      action: String(state._gateActPending.action || 'repair'),
      seq: (state._gateActPending.seq | 0) || 0,
    };
  }

  // Pixel_GO: one-shot-ish revive actions.
  if (state._reviveActPending && state._reviveActPending.targetId) {
    input.reviveAct = {
      targetId: String(state._reviveActPending.targetId),
      seq: (state._reviveActPending.seq | 0) || 0,
    };
  }

  // Pixel_GO v0.4: floor shop actions (host-authoritative)
  if (state._shopActPending && (state._shopActPending.offerId || state._shopActPending.action)) {
    input.shopAct = {
      action: String(state._shopActPending.action || 'buy'),
      offerId: String(state._shopActPending.offerId || ''),
      replaceKey: (state._shopActPending.replaceKey != null) ? String(state._shopActPending.replaceKey) : null,
      seq: (state._shopActPending.seq | 0) || 0,
    };
  }

  state.net.sendInput(input);
}

// --- Revive system (Pixel_GO co-op) ----------------------------------------
// When a player dies (hp<=0), they stay as a corpse. Teammates can revive them by channeling.
// During the channel, the reviver cannot move or shoot.
// If a downed player is not revived and the party advances to the next floor, they are kicked to menu.

