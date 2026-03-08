import { Player } from "./player.js";
import { Camera } from "./camera.js";
import { initInput } from "./input.js";
import { getKeyboardVector } from "./input.js";
import { setControlMode } from "./mouseController.js";
import { getMoveVectorFromPointer, getAimDirectionForPlayer, isFiringActive } from "./mouseController.js";
import { updateSkills, updateSkillsNet, getAttackRangeForPlayer, getAimRangeForPlayer } from "../weapons/skillSystem.js";
import { updateIceWalls } from "../weapons/iceWall.js";
import { updateBlackholes } from "../weapons/blackhole.js";
import { updateHealPulses } from "../weapons/lightHeal.js";
import { explodeFireball } from "../weapons/fireball.js";
import { RoomSpawnSystem } from "../world/roomSpawnSystem.js";
import { RoomDirector } from "../world/roomDirector.js";
import { renderRoomsBackground } from "../world/roomRenderer.js";
import { clampPlayerToActiveWalkable } from "../world/floorCollision.js";
import { renderBiomeUnit, biomeKeyFromKind, biomeStyleForKey, biomeRoleFromKind } from "../enemies/biomeVisuals.js";
import { renderHUD } from "../ui/hud.js";
import { renderUpgradeMenu, handleUpgradeClick } from "../ui/upgradeMenu.js";
import { renderResurrectionScreen, handleResurrectionClick } from "../ui/resurrectionScreen.js";
import { renderSettingsMenu, handleSettingsClick } from "../ui/canvasMenuStubs.js";
import {
  saveProgression,
  getStartLevel,
  applyLimitsToPlayer,
  applyCritToDamage,
  applyLifeSteal,
} from "./progression.js";
import { initRunUpgrades, rollRunUpgrades, applyRunUpgrade } from "./runUpgrades.js";
import { rollFloorShopOffersStandard, rollFloorShopOffers, describeFloorShopOffer, tryBuyFloorShopOfferEx, getReplaceCandidates } from "./floorShop.js";
import { biomeName } from "../world/biomes.js";
import { updateBuffs } from "../buffs/buffs.js";
import { getZone, ZONE_RADII, ZONE6_SQUARE_HALF, WORLD_SQUARE_HALF, HUB_HALF, HUB_CORNER_R, isPointInHub, WORLD_SCALE } from "../world/zoneController.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../world/mapGenerator.js";
import { createNetClient, getDefaultWsUrl } from "../net/netClient.js";
import { showRunUpgradeOverlay, hideRunUpgradeOverlay } from "../ui/runUpgradeDom.js";
import { showFloorShopOverlay, hideFloorShopOverlay } from "../ui/floorShopDom.js";
import { ensureShopMeta } from "../meta/shopMeta.js";
import {
  renderHubNpcs,
  getNearbyHubNpcForPlayer,
  screenToWorld,
  findNpcAtWorldPos,
} from "../world/hubNpcs.js";

export function createGame(canvas, ctx, progression) {
  initInput();
  // Ensure shop meta fields exist (coins, skill meta levels, offers).
  try { ensureShopMeta(progression); } catch {}

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
    players: [],
    net: null,
    _netLastInputSentAt: 0,
    _netLastSnapshotSentAt: 0,
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
    overlayMode: null, // 'resurrection' | 'upgrade' | null
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
  };

  // Helpers for weapon/FX modules (avoid circular imports).
  // These are used by biome skills to resolve owners and ally lists.
  state._getPlayerById = (id) => getPlayerById(state, id);
  state.getPlayersArr = (st) => getPlayersArr(st);

  // Net client (optional)
  state.net = createNetClient();

  
  // If opened via invite link, prefill room code
  try {
    const params = new URLSearchParams(location.search || "");
    const raw = params.get("code") || params.get("room");
    if (raw && state.progression) {
      const cleaned = raw.toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
      if (cleaned) state.progression.roomCode = cleaned;
    }
  } catch {}
// Initialize a preview run so the world/player can render behind the menu.
  startNewRun(state);
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

      // Enter the run immediately (Host/Join/FastJoin -> gameplay).
      // Start Menu is only for setup / fallback Start button.
      if (state.net.isHost) {
        // Host immediately plays. Keep existing world, but ensure local player id matches server id.
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
        state.net.sendMeta(getNetMetaPayload(state.progression));
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
      // Host: a player finished death screens and requests respawn.
      if (!state.net.isHost) return;
      const from = String(msg.from || "");
      if (!from) return;
      const meta = msg.meta || null;
      if (meta) state._netMetaById.set(from, meta);
      const p = getPlayerById(state, from);
      if (p) p._netRespawnRequested = true;
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
      state._runUpgradeActive = true;
      if (state.player) {
        state.player._lvlUpChoosing = true;
        state.player._lvlUpInvuln = true;
        state.player.vx = 0;
        state.player.vy = 0;
      }
      return;
    }

    if (msg.type === "runResume") {
      if (state.net.isHost) return;
      state._runUpgradeActive = false;
      try { hideRunUpgradeOverlay(); } catch {}
      if (state.player) {
        state.player._lvlUpChoosing = false;
        state.player._lvlUpInvuln = false;
      }
      return;
    }

    if (msg.type === "runChoices") {
      if (state.net.isHost) return;
      const myId = state.net?.playerId ? String(state.net.playerId) : (state.player?.id ? String(state.player.id) : "local");
      const to = (msg.to != null ? String(msg.to) : "");
      if (to && to !== myId) return;

      const choices = Array.isArray(msg.choices) ? msg.choices : [];
      if (!choices.length) return;

      state._runUpgradeActive = true;
      if (state.player) {
        state.player._lvlUpChoosing = true;
        state.player._lvlUpInvuln = true;
        state.player.vx = 0;
        state.player.vy = 0;
      }

      showRunUpgradeOverlay(
        choices,
        msg.metaText || `Lv ${state.player?.level || 0}`,
        (choice) => {
          // Send only the id; host validates and applies.
          if (state.net && state.net.status === "connected") {
            state.net.sendRunPick(choice?.id || "");
          // Track pending locally for joiner UX
          if (state.player) {
            state.player._pendingLevelUps = Math.max(0, (state.player._pendingLevelUps || 0) - 1);
          }
          }
          // Immediately resume locally (no global runResume in per-player flow).
          state._runUpgradeActive = false;
          if (state.player) {
            state.player._lvlUpChoosing = false;
            state.player._lvlUpInvuln = false;
          }
        }
      );
      return;
    }



if (msg.type === "runRequest") {
  // Joiner requests to open in-run upgrade choices.
  // Host will validate and respond with runChoices(to=playerId).
  if (!state.net?.isHost) return;
  const from = String(msg.from || "");
  if (!from) return;
  if (!state._runUpNet) state._runUpNet = { sessions: new Map(), requests: new Map() };
  if (!state._runUpNet.requests) state._runUpNet.requests = new Map();
  state._runUpNet.requests.set(from, state.time || 0);
  return;
}

    if (msg.type === "runPick") {
      // Host receives a pick from a joiner.
      if (!state.net.isHost) return;
      const from = String(msg.from || "");
      const choiceId = String(msg.choiceId || "");
      if (!from || !choiceId) return;
      hostApplyRunPick(state, from, choiceId);
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

      // Lightweight client-side prediction for our own movement
      // (we still rely on host for all combat/world state).
      if (state.mode === "playing" && !state.paused && !state._runUpgradeActive && !state._floorShopActive && state.player && typeof state.player.update === "function") {
        if (state.player.hp > 0 && !state.overlayMode && !state.player._lvlUpChoosing) {
          state.player.update(dt, state);
        }
      }

      updatePopups(state, dt);

      if (state.mode === "playing") {
        sendLocalInputToHost(state);

        if (state.net.latestPlayerState) {
          applyPlayerStateToClient(state, state.net.latestPlayerState);
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
          state.camera.update(state.player, dt, state);
        }

        // Compute nearby Hub NPC for joiners too (client-side only)
        if (!state.overlayMode && state.player) {
          state._hubNearbyNpc = getNearbyHubNpcForPlayer(state.player, state);
        }
        maybeEnterOnlineDeathOverlay(state);
      }

      return;
    }

    if (state.mode !== "playing") {
      // Only animate popups (e.g., death screen messages) when not in gameplay
      updatePopups(state, dt);
      return;
    }

    if (state.paused) {
      // When paused: don't move entities or advance timers except popups
      updatePopups(state, dt);
      return;
    }

    // Host (online) or offline: simulate world
    // Clear transient weapon visuals each tick (co-op safe).
    if (state._laserVisuals && typeof state._laserVisuals.clear === "function") state._laserVisuals.clear();
    if (state._lightningVisuals && typeof state._lightningVisuals.clear === "function") state._lightningVisuals.clear();
    state._laserVisual = null;
    state._lightningVisual = null;
    updateBuffs(state, dt);
    updatePlayers(state, dt, online);

    updateRevives(state, dt);

    // Permanent HP regen from meta bonuses + in-run regen (HP/s)
    const regenPerSec = (state.player.metaHpRegen || 0) + (state.player.runHpRegen || 0);
    if (regenPerSec > 0 && state.player.hp > 0) {
      state.player.hp = Math.min(
        state.player.maxHP,
        state.player.hp + regenPerSec * dt
      );
    }

    updateArenaHazards(state, dt);

    // Pixel_GO: no radial zones.

    updateWeapons(state, dt, online);
    state.spawnSystem.update(dt);

    // Track HP drops to mark combat (used by out-of-combat upgrade gating).
    const _hpBefore = new Map();
    for (const pp of getPlayersArr(state)) {
      if (!pp) continue;
      _hpBefore.set(String(pp.id || "local"), pp.hp);
    }

    updateEnemies(state, dt);

    for (const pp of getPlayersArr(state)) {
      if (!pp) continue;
      const prev = _hpBefore.get(String(pp.id || "local"));
      if (typeof prev === "number" && pp.hp < prev - 1e-6) {
        pp._lastCombatAt = state.time;
      }
    }

    // If the run-upgrade menu was just opened, briefly repel nearby enemies.
    applyRunUpgradeRepel(state, dt);

    // Biome skill effects that act on enemies/world (blackholes, ice walls, heal pulses, explosions).
    updateSkillFx(state, dt);

    updateProjectiles(state, dt);
    updateXPOrbs(state, dt);

    // Run level-up flow (Magic Survival style)
    if (online && state.net && state.net.isHost) {
      // Per-player: only the leveling player is frozen; the world keeps running.
      hostProcessRunUpgrades(state);
    } else {
      // Offline singleplayer: run-upgrades are opened manually via HUD button.
    }

    updateRunUpgradeAvailability(state);

    updateFloatingTexts(state, dt);
    updatePopups(state, dt);

    // Pixel_GO: room transitions + collapse
    if (state.roomDirector && typeof state.roomDirector.update === "function") {
      try { state.roomDirector.update(dt); } catch {}
    }

    state.camera.update(state.player, dt, state);

    // Hub NPC proximity (offline + host)
    if (!state.overlayMode && state.player) {
      state._hubNearbyNpc = getNearbyHubNpcForPlayer(state.player, state);
    }
    if (online) {
      // Online: no auto-respawn; show local death overlays and wait for respawn requests.
      maybeEnterOnlineDeathOverlay(state);
      processRespawnRequests(state);
        maybeSendPlayerState(state, dt);
        maybeSendSnapshot(state, dt);
    } else {
      checkPlayerDeath(state);
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

    renderWorldBackground(state, ctx);
    renderHubNpcs(ctx, state);
    renderXPOrbs(state, ctx);
    renderSkillFx(state, ctx);
    renderEnemies(state, ctx);
    renderSummons(state, ctx);
    renderProjectiles(state, ctx);
    renderPlayers(state, ctx);
    renderHPBarsWorld(state, ctx);
    renderBuffAuras(state, ctx);

    state.camera.resetTransform(ctx);

    renderFloatingTexts(ctx, state);

    // HUD only during gameplay
    if (state.mode === "playing") {
      renderHUD(ctx, state);
    }

    renderPopups(ctx, state);

    // Online overlays (death screens) that must not stop the host simulation.
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
    if (state.overlayMode === "resurrection") {
      const a = handleResurrectionClick(x, y, state);
      if (a === "resurrect") {
        applyResurrection(state.progression);
        try { saveProgression(state.progression); } catch {}
        if (isOnline(state) && state.net && state.net.status === "connected" && !state.net.isHost) {
          state.net.sendMeta(getNetMetaPayload(state.progression));
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
          state.net.sendMeta(getNetMetaPayload(state.progression));
        }
      } else if (a === "start") {
        if (isOnline(state)) {
          // In co-op, "start" means respawn (world continues).
          const meta = getNetMetaPayload(state.progression);
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
          state.net.sendMeta(getNetMetaPayload(state.progression));
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
          tryOpenFloorShop(state);
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

  // Keyboard shortcut: U to open in-run upgrade choices (manual, out of combat)
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

  return {
    state,
    get player() {
      return state.player;
    },
    // Used by the DOM-based lobby (fallback Start button): start an offline run.
    startOfflineRun() {
      try { state.net?.disconnect?.(); } catch {}
      startNewRun(state);
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

function startNewRun(state) {
  try { ensureShopMeta(state.progression); } catch {}
  // Always start the run from the first level (do NOT scale run start level by score).
  const startLevel = 1;

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
  const meta = applyLimitsToPlayer(player, state.progression.limits);

  state.player = player;
  state.players = [player];
  state.meta = {
    xpGainMult: meta?.xpGainMult ?? 1,
    scoreMult: meta?.scoreMult ?? 1,
    pickupBonusRadius: meta?.pickupBonusRadius ?? 0,
  };

  // Init in-run upgrades (skills/passives)
  initRunUpgrades(player);

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

function getPlayersArr(state) {
  return state.players && state.players.length ? state.players : (state.player ? [state.player] : []);
}

function getPlayerById(state, id) {
  if (!id) return null;
  const sid = String(id);
  for (const p of getPlayersArr(state)) {
    if (p && String(p.id) === sid) return p;
  }
  return null;
}

function pickColorForId(id) {
  const s = String(id);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 80%, 65%)`;
}

function getNetMetaPayload(prog) {
  if (!prog) return null;
  return {
    nickname: prog.nickname || "Player",
    avatarIndex: prog.avatarIndex || 0,
    auraId: prog.auraId || 0,
    resurrectedTier: prog.resurrectedTier || 1,
    totalScore: prog.totalScore || 0,
    upgradePoints: prog.upgradePoints || 0,
    limits: prog.limits || {},
    // Meta shop unlocks used for in-run upgrade pool gating.
    skillMeta: prog.skillMeta || {},
  };
}

function applyNetMetaToPlayer(state, player, meta) {
  if (!player || !meta) return;
  if (typeof meta.nickname === "string") player.nickname = meta.nickname;
  if (typeof meta.avatarIndex === "number") player.avatarIndex = meta.avatarIndex | 0;
  if (typeof meta.auraId === "number") player.auraId = meta.auraId | 0;
  if (meta.limits) {
    // Apply permanent meta bonuses directly (affects crit, damage mult, maxHP, etc.).
    applyLimitsToPlayer(player, meta.limits);
  }
  if (meta.skillMeta && typeof meta.skillMeta === "object") {
    player._metaSkillMeta = meta.skillMeta;
  }
}

function syncHostPlayersFromRoomInfo(state) {
  // Host keeps authoritative simulation; add/remove player entities to match room list.
  const netPlayers = Array.isArray(state.net.roomPlayers) ? state.net.roomPlayers : [];
  const wantedIds = new Set(netPlayers.map((p) => String(p.id)));

  // Ensure local player id matches
  if (state.player && state.net.playerId) {
    state.player.id = String(state.net.playerId);
    wantedIds.add(String(state.player.id));
  }

  // Add missing
  for (const meta of netPlayers) {
    const id = String(meta.id);
    if (!getPlayerById(state, id)) {
      const p = new Player({ x: 0, y: 0 }, 1);
      p.id = id;
      // Skill meta can be per-player (shop unlocks). If we have it from syncMeta, use it.
      const stored = state._netMetaById?.get(id) || null;
      p._metaSkillMeta = (stored && stored.skillMeta && typeof stored.skillMeta === "object") ? stored.skillMeta : (state.progression?.skillMeta || {});
      p.nickname = meta.nickname || `P${id}`;
      p.avatarIndex = meta.avatarIndex || 0;
      p.auraId = (typeof meta.auraId === "number") ? (meta.auraId | 0) : 0;
      p.color = pickColorForId(id);
      // Apply per-player meta (if we have it), otherwise fall back to host meta.
      const storedMeta = stored;
      if (storedMeta) applyNetMetaToPlayer(state, p, storedMeta);
      else applyLimitsToPlayer(p, state.progression.limits);
      initRunUpgrades(p);
      state.players.push(p);
    } else {
      const p = getPlayerById(state, id);
      if (p && meta.nickname) p.nickname = meta.nickname;
      if (p && typeof meta.avatarIndex === "number") p.avatarIndex = meta.avatarIndex | 0;
      if (p && typeof meta.auraId === "number") p.auraId = meta.auraId | 0;
    }
  }

  // Remove unknown (except local)
  const localId = state.player ? String(state.player.id) : null;
  state.players = state.players.filter((p) => {
    if (!p) return false;
    const id = String(p.id);
    if (localId && id === localId) return true;
    return wantedIds.has(id);
  });
}

function updatePlayerFromInput(player, input, dt, state) {
  if (!player || player.hp <= 0) return;
  if (player._reviving) {
    player.vx = 0;
    player.vy = 0;
    return;
  }
  if (player._lvlUpChoosing) {
    player.vx = 0;
    player.vy = 0;
    return;
  }
  const mx = Math.max(-1, Math.min(1, input?.mx ?? 0));
  const my = Math.max(-1, Math.min(1, input?.my ?? 0));
  const len = Math.hypot(mx, my);
  const dirX = len > 1e-3 ? mx / len : 0;
  const dirY = len > 1e-3 ? my / len : 0;

  const speed = player.moveSpeed || player.baseMoveSpeed || 220;
  player.vx = dirX * speed;
  player.vy = dirY * speed;

  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // World bounds
  const bounds = state.spawnSystem?.getWorldBounds ? state.spawnSystem.getWorldBounds() : null;
  // fallback: square bounds using mapGenerator constants
  const minX = (bounds?.minX ?? -WORLD_WIDTH / 2) + player.radius;
  const maxX = (bounds?.maxX ?? WORLD_WIDTH / 2) - player.radius;
  const minY = (bounds?.minY ?? -WORLD_HEIGHT / 2) + player.radius;
  const maxY = (bounds?.maxY ?? WORLD_HEIGHT / 2) - player.radius;
  if (player.x < minX) player.x = minX;
  if (player.x > maxX) player.x = maxX;
  if (player.y < minY) player.y = minY;
  if (player.y > maxY) player.y = maxY;

  // Weapon/skill cooldowns are handled in the skill system.
}

function updateArenaHazards(state, dt) {
  const room = state?.roomDirector?.current;
  if (!room || room?.arenaSpec?.rules?.isHub) return;
  const hazards = Array.isArray(room?.arenaSpec?.hazardZones) ? room.arenaSpec.hazardZones : [];
  if (!hazards.length) return;
  const players = getPlayersArr(state);
  for (const p of players) {
    if (!p || (p.hp || 0) <= 0) continue;
    for (let i = 0; i < hazards.length; i++) {
      const h = hazards[i];
      if (!h) continue;
      const x = Number(h.x) || 0;
      const y = Number(h.y) || 0;
      const r = Math.max(12, Number(h.r) || 26);
      const interval = Math.max(0.5, Number(h.interval) || 6);
      const duration = Math.max(0.15, Math.min(interval, Number(h.duration) || 1));
      const phase = ((state.time || 0) + i * 0.73) % interval;
      if (phase > duration) continue;
      const dx = p.x - x;
      const dy = p.y - y;
      if (dx * dx + dy * dy > r * r) continue;
      const damageScale = Math.max(0.04, Number(h.damageScale) || 0.1);
      const dmg = (8 + Math.min(8, (room.index | 0) * 0.22)) * damageScale * dt;
      if (dmg <= 0) continue;
      p.hp = Math.max(0, (p.hp || 0) - dmg);
      p._lastCombatAt = state.time || 0;
      p._floorHazardHit = (state.time || 0) + 0.12;
    }
  }
}

function updatePlayers(state, dt, online) {
  const players = getPlayersArr(state);
  // Make sure local player's id is aligned if online
  if (online && state.player && state.net.playerId) {
    state.player.id = String(state.net.playerId);
  }

  // Local update
  if (state.player && typeof state.player.update === "function") {
    const blockedByOverlay = !!(online && state.overlayMode);
    const blockedByRunUp = !!state._runUpgradeActive || !!state.player._lvlUpChoosing;
    const blockedByShop = !!state._floorShopActive;
    if (state.player.hp > 0 && !blockedByOverlay && !blockedByRunUp && !blockedByShop && !state.player._reviving) {
      state.player.update(dt, state);
    }
  }

  if (!online) {
    // Offline = single player
    state.players = [state.player];
    if (state.player) clampPlayerToActiveWalkable(state.player, state, { pad: 2 });
    return;
  }

  // Host: update remote players from net inputs
  if (state.net.isHost) {
    for (const p of players) {
      if (!p || String(p.id) === String(state.player.id)) continue;
      const input = state.net.remoteInputs.get(String(p.id)) || {};
      updatePlayerFromInput(p, input, dt, state);

      // Pixel_GO: gate actions from joiners (host-authoritative)
      const ga = input && input.gateAct;
      if (ga && ga.gateId) {
        const seq = (ga.seq | 0) || 0;
        if (!state._gateActLastSeq) state._gateActLastSeq = new Map();
        const last = state._gateActLastSeq.get(String(p.id)) || 0;
        if (seq && seq !== last) {
          state._gateActLastSeq.set(String(p.id), seq);
          const rd = state.roomDirector;
          if (rd && typeof rd.performGateAction === 'function') {
            try {
              const did = rd.performGateAction(String(ga.gateId), String(ga.action || 'repair'), p);
              if (did) state._breachPatchedFlash = 0.35;
            } catch {}
          }
        }
      }

      // Pixel_GO: revive actions from joiners (host-authoritative)
      const ra = input && input.reviveAct;
      if (ra && ra.targetId) {
        const seq = (ra.seq | 0) || 0;
        if (!state._reviveActLastSeq) state._reviveActLastSeq = new Map();
        const last = state._reviveActLastSeq.get(String(p.id)) || 0;
        if (seq && seq !== last) {
          state._reviveActLastSeq.set(String(p.id), seq);
          try { startReviveById(state, p, String(ra.targetId)); } catch {}
        }
      }

      // Pixel_GO v0.4: floor shop purchases from joiners (host-authoritative)
      const sa = input && input.shopAct;
      if (sa && sa.offerId) {
        const seq = (sa.seq | 0) || 0;
        if (!state._shopActLastSeq) state._shopActLastSeq = new Map();
        const last = state._shopActLastSeq.get(String(p.id)) || 0;
        if (seq && seq !== last) {
          state._shopActLastSeq.set(String(p.id), seq);
          try { performFloorShopPurchase(state, p, String(sa.offerId), sa.replaceKey != null ? String(sa.replaceKey) : null); } catch {}
        }
      }
    }
  }

  for (const p of getPlayersArr(state)) {
    if (!p) continue;
    clampPlayerToActiveWalkable(p, state, { pad: 2 });
  }
}

function updateWeapons(state, dt, online) {
  // Local (always)
  if (state.player) {
    const blockedByOverlay = !!(online && state.overlayMode);
    const blockedByRunUpgrade = !!state._runUpgradeActive || !!state.player._lvlUpChoosing;
    const blockedByFloorShop = !!state._floorShopActive;
    if (state.player.hp > 0 && !blockedByOverlay && !blockedByRunUpgrade && !blockedByFloorShop && !state.player._reviving) {
      updateSkills(state.player, state, dt);
    }
  }
  if (!online) return;
  if (!state.net.isHost) return;

  // Remote players (host only)
  for (const p of getPlayersArr(state)) {
    if (!p || String(p.id) === String(state.player.id)) continue;
    if (p.hp <= 0) continue;
    if (p._lvlUpChoosing) continue;
    if (p._reviving) continue;
    const input = state.net.remoteInputs.get(String(p.id)) || {};
    const aim = input?.aim;
    const aimDir = aim && typeof aim.x === "number" && typeof aim.y === "number" ? aim : null;
    const firing = typeof input?.fire === "boolean" ? input.fire : undefined;
    updateSkillsNet(p, state, dt, { aimDir, firing });
  }
}

function autoApplyRemoteRunUpgrades(state) {
  // Minimal co-op behavior: remote players get random upgrades so they don't stall.
  // (Later we can add per-player choice UI + net messages.)
  const localId = state.player ? String(state.player.id) : "local";
  for (const p of getPlayersArr(state)) {
    if (!p || String(p.id) === localId) continue;
    let pending = p._pendingLevelUps || 0;
    while (pending > 0) {
      const choices = rollRunUpgrades(p, 3);
      const pick = choices[(Math.random() * choices.length) | 0];
      applyRunUpgrade(p, pick);
      pending--;
    }
    p._pendingLevelUps = pending;
  }
}

function updateRunUpgradeAvailability(state) {
  const p = state?.player;
  const pending = p ? (p._pendingLevelUps || 0) : 0;
  state._runUpPending = pending;

  // Defaults
  state._runUpReady = false;
  state._runUpReadyIn = 0;
  state._runUpBlockReason = "";

  if (!state || state.mode !== "playing") return;
  if (!p || p.hp <= 0) return;
  if (state.overlayMode) return;
  if (state.paused) return;
  if (state._runUpgradeActive) return;
  if (pending <= 0) return;

  // Out-of-combat gate
  const need = 3.0;
  const tSince = state.time - (Number.isFinite(p._lastCombatAt) ? p._lastCombatAt : -Infinity);
  if (tSince < need) {
    state._runUpReady = false;
    state._runUpReadyIn = Math.max(0, need - tSince);
    state._runUpBlockReason = "combat";
    return;
  }

  // Note: enemy proximity no longer blocks manual upgrades; only out-of-combat timer is used.
  state._runUpReady = true;
}

function applyRunUpgradeRepel(state, dt) {
  if (!state || !state._repelUntil) return;
  if (state.time >= state._repelUntil) return;
  const p = state.player;
  if (!p) return;

  const enemies = Array.isArray(state.enemies) ? state.enemies : [];
  const R = 520;
  const R2 = R * R;
  const basePush = 980; // px/s at point-blank

  for (const e of enemies) {
    if (!e || e.hp <= 0 || e._remove) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= 1e-6 || d2 > R2) continue;
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const ny = dy / d;
    const t = Math.max(0, Math.min(1, 1 - d / R));
    const push = basePush * (0.25 + 0.75 * t);
    e.x += nx * push * dt;
    e.y += ny * push * dt;
  }
}

// ---------------------------------------------------------------------------
// Biome skill FX (host-authoritative)
// ---------------------------------------------------------------------------

function updateSkillFx(state, dt) {
  if (!state) return;
  try { updateBlackholes(state, dt); } catch {}
  try { updateIceWalls(state, dt); } catch {}
  try { updateHealPulses(state, dt); } catch {}

  // Explosions are purely visual.
  if (Array.isArray(state._explosions)) {
    for (let i = state._explosions.length - 1; i >= 0; i--) {
      const ex = state._explosions[i];
      if (!ex) { state._explosions.splice(i, 1); continue; }
      ex.t -= dt;
      if (ex.t <= 0) state._explosions.splice(i, 1);
    }
  }
}

function openManualRunUpgradeOverlay(state) {
  if (!state || state.mode !== "playing") return false;
  if (state._runUpgradeActive) return true;
  if (state.overlayMode || state.paused) return false;
  const p = state.player;
  if (!p || p.hp <= 0) return false;
  const pending = p._pendingLevelUps || 0;
  if (pending <= 0) return false;

  state._runUpgradeActive = true;
  p._lvlUpChoosing = true;
  p._lvlUpInvuln = true;
  p.vx = 0;
  p.vy = 0;

  // Small safety window when opening (mobs fall behind / repel)
  state._repelUntil = state.time + 1.6;

  const choices = rollRunUpgrades(p, 3);
  state._runUpgradeChoices = choices;

  showRunUpgradeOverlay(
    choices,
    `Lv ${p.level} · Pending ${pending}`,
    (choice) => {
      applyRunUpgrade(p, choice);
      p._pendingLevelUps = Math.max(0, (p._pendingLevelUps || 0) - 1);

      // Keep picking until pending is consumed (player chose to open the menu).
      if ((p._pendingLevelUps || 0) > 0) {
        // Allow re-opening immediately with a fresh roll.
        state._runUpgradeActive = false;
        setTimeout(() => {
          if (state.mode === "playing") openManualRunUpgradeOverlay(state);
        }, 0);
        return;
      }

      state._runUpgradeActive = false;
      p._lvlUpChoosing = false;
      p._lvlUpInvuln = false;
    }
  );

  return true;
}

function tryOpenManualRunUpgradeOverlay(state) {
  if (!state || state.mode !== "playing") return false;
  if (state._runUpgradeActive) return true;

  const online = isOnline(state);
  const isJoiner = !!(online && state.net && !state.net.isHost);

  // Joiner: request choices from host (host-authoritative), do NOT roll/apply locally.
  if (isJoiner) {
    updateRunUpgradeAvailability(state);
    if (state._runUpReady) {
      const nowT = state.time || 0;
      if (nowT - (state._runUpLastReqAt || 0) < 0.5) return true;
      state._runUpLastReqAt = nowT;

      if (state.net && state.net.status === "connected" && typeof state.net.sendRunRequest === "function") {
        state.net.sendRunRequest();
        if (state.popups) state.popups.push({ text: "Upgrade requested", time: 1.0 });
        return true;
      }
      if (state.popups) state.popups.push({ text: "Not connected", time: 1.2 });
      return false;
    }

    // Lightweight feedback (same as offline)
    if (state.popups) {
      let msg = "Can't upgrade yet";
      if (state._runUpBlockReason === "combat") {
        msg = `Upgrade: out of combat in ${Math.max(0, state._runUpReadyIn).toFixed(1)}s`;
      } else if ((state._runUpPending || 0) <= 0) {
        msg = "No upgrades pending";
      }
      state.popups.push({ text: msg, time: 1.3 });
    }
    return false;
  }

  // Offline or host: open the menu locally (manual, out of combat).
  updateRunUpgradeAvailability(state);
  if (state._runUpReady) {
    return openManualRunUpgradeOverlay(state);
  }

  // Lightweight feedback
  if (state.popups) {
    let msg = "Can't upgrade yet";
    if (state._runUpBlockReason === "combat") {
      msg = `Upgrade: out of combat in ${Math.max(0, state._runUpReadyIn).toFixed(1)}s`;
    } else if ((state._runUpPending || 0) <= 0) {
      msg = "No upgrades pending";
    }
    state.popups.push({ text: msg, time: 1.3 });
  }
  return false;
}

function maybeOpenRunUpgradeOverlay(state) {
  if (!state || state.mode !== "playing") return false;
  if (state._runUpgradeActive) return true;
  const p = state.player;
  if (!p || p.hp <= 0) return false;
  const pending = p._pendingLevelUps || 0;
  if (pending <= 0) return false;

  // Deprecated auto-open (kept for backward compatibility). Use manual opening instead.
  return false;
}

// ---------------------------------------------------------------------------
// Pixel_GO v0.4: Floor terminal (NPC shop)
// ---------------------------------------------------------------------------

function canPlayerUseFloorShop(state, player) {
  if (!state || !player) return false;
  if (state.mode !== 'playing') return false;
  if (player.hp <= 0) return false;
  const rd = state.roomDirector;
  const room = rd && rd.current;
  if (!room || (room.index | 0) <= 0) return false;
  if (!room.cleared) return false;
  const npc = room.shopNpc || { x: room.centerX, y: room.centerY + (room.side || 600) * 0.18 };
  const dx = player.x - npc.x;
  const dy = player.y - npc.y;
  return (dx * dx + dy * dy) <= (210 * 210);
}

function tryOpenFloorShop(state) {
  if (!state || state.mode !== 'playing') return false;
  if (state._floorShopActive) return true;
  const p = state.player;
  if (!p) return false;
  if (!canPlayerUseFloorShop(state, p)) return false;

  // Ensure we have offers (offline/host should have generated them on floor clear).
  const curFloor = (state.currentRoomIndex != null ? (state.currentRoomIndex | 0) : (state.roomDirector ? (state.roomDirector.roomIndex | 0) : 0));
  if (!p.floorShop || (p.floorShop.floor | 0) !== curFloor || !Array.isArray(p.floorShop.offers)) {
    // Fallback: offline/host generate a fresh set.
    const online = isOnline(state);
    const isHost = !online || !!state.net?.isHost;
    if (isHost) {
      const biomeKey = (state.roomDirector && state.roomDirector.current) ? (state.roomDirector.current.biomeKey || "") : (state._roomBiome || "");
      const offers = rollFloorShopOffers(p, curFloor, biomeKey, 3);
      p.floorShop = { floor: curFloor, offers, sold: offers.map(() => false) };
    }
  }

  const fs = p.floorShop;
  if (!fs || !Array.isArray(fs.offers) || !fs.offers.length) return false;

  const spNow = (p.skillPoints | 0) || 0;
  const choices = [];
  for (let i = 0; i < fs.offers.length; i++) {
    const o = fs.offers[i];
    if (!o) continue;
    if (Array.isArray(fs.sold) && fs.sold[i]) continue;
    const desc = describeFloorShopOffer(p, o);
    const cost = (o.spCost | 0) || 0;
    choices.push({ ...o, desc, disabled: spNow < cost });
  }

  if (!choices.length) {
    if (state.popups) state.popups.push({ text: 'Terminal: nothing to buy', time: 1.2 });
    return false;
  }

  state._floorShopActive = true;
  const biomeKey = (state.roomDirector && state.roomDirector.current) ? (state.roomDirector.current.biomeKey || "") : (state._roomBiome || "");
  const biomeLabel = (curFloor >= 4 && biomeKey) ? ` • Biome: ${biomeName(biomeKey)}` : "";
  showFloorShopOverlay({
    title: 'Terminal',
    subtitle: `Spend Skill Points (SP)${biomeLabel}`,
    metaText: `SP: ${spNow}`,
    choices: choices.slice(0, 3),
    onCloseCb: () => { state._floorShopActive = false; },
    onPickCb: (pick) => {
      // NOTE: overlay is already closed by UI module; keep _floorShopActive until we're done (replace flow)
      if (!pick || pick.disabled) { state._floorShopActive = false; return; }

      const online = isOnline(state);
      const isJoiner = !!(online && state.net && !state.net.isHost);

      // Active skill cap: unlocking a new skill may require replacement.
      if (pick.kind === 'skill' && (pick.from | 0) <= 0 && pick.requiresReplace) {
        const cand = getReplaceCandidates(p, pick.key);
        if (!cand || !cand.length) {
          state._floorShopActive = false;
          if (state.popups) state.popups.push({ text: 'No skill to replace', time: 1.1 });
          return;
        }

        showFloorShopOverlay({
          title: 'Replace Skill',
          subtitle: `Max 6 active skills • Replace one with ${pick.name}`,
          metaText: `SP: ${spNow}`,
          hint: 'Pick a skill to remove (Esc cancels)',
          choices: cand.map((c, i) => ({
            id: `rep_${c.key}`,
            replaceKey: c.key,
            name: `${c.name}  Lv${c.level}`,
            desc: 'Will be removed to make room',
            spCost: null,
          })),
          onCloseCb: () => { state._floorShopActive = false; },
          onPickCb: (rep) => {
            if (!rep || !rep.replaceKey) { state._floorShopActive = false; return; }
            const replaceKey = String(rep.replaceKey);

            if (isJoiner) {
              state._shopActSeq = (state._shopActSeq || 0) + 1;
              state._shopActPending = { offerId: String(pick.id || ''), replaceKey, seq: state._shopActSeq };
              if (state.popups) state.popups.push({ text: 'Buying…', time: 0.8 });
              // keep shop active until we send; then close
              state._floorShopActive = false;
              return;
            }

            const ok = performFloorShopPurchase(state, p, String(pick.id || ''), replaceKey);
            state._floorShopActive = false;
            if (!ok && state.popups) state.popups.push({ text: 'Cannot buy', time: 1.2 });
          },
        });
        return;
      }

      if (isJoiner) {
        // Send purchase request to host.
        state._shopActSeq = (state._shopActSeq || 0) + 1;
        state._shopActPending = { offerId: String(pick.id || ''), replaceKey: null, seq: state._shopActSeq };
        if (state.popups) state.popups.push({ text: 'Buying…', time: 0.8 });
        state._floorShopActive = false;
        return;
      }

      // Offline/host: apply immediately.
      const ok = performFloorShopPurchase(state, p, String(pick.id || ''), null);
      state._floorShopActive = false;
      if (!ok && state.popups) state.popups.push({ text: 'Not enough SP', time: 1.2 });
    },
  });

  return true;
}

function performFloorShopPurchase(state, buyer, offerId, replaceKey) {
  if (!state || !buyer || !offerId) return false;
  if (!canPlayerUseFloorShop(state, buyer)) return false;

  const fs = buyer.floorShop;
  if (!fs || !Array.isArray(fs.offers)) return false;
  const curFloor = (state.currentRoomIndex != null ? (state.currentRoomIndex | 0) : 0);
  if ((fs.floor | 0) !== curFloor) return false;

  const idx = fs.offers.findIndex((o) => o && String(o.id) === String(offerId));
  if (idx < 0) return false;
  if (Array.isArray(fs.sold) && fs.sold[idx]) return false;

  const offer = fs.offers[idx];
  const res = tryBuyFloorShopOfferEx(buyer, offer, replaceKey);
  if (!res || !res.ok) return false;

  if (Array.isArray(fs.sold)) fs.sold[idx] = true;

  // Feedback
  if (Array.isArray(state.floatingTexts)) {
    state.floatingTexts.push({ x: buyer.x, y: buyer.y - 34, text: `-${offer.spCost | 0} SP`, time: 0.8 });
  }
  if (Array.isArray(state.popups)) {
    state.popups.push({ text: `Bought: ${offer.name}`, time: 1.1 });
  }
  return true;
}

// Host-authoritative run-upgrade flow (per-player):
// Each player chooses independently. Only that player is frozen/invulnerable while picking.
// Host sends runChoices(to=playerId) and applies the pick on runPick.
function hostProcessRunUpgrades(state) {
  if (!state || state.mode !== "playing") return;
  if (!isOnline(state) || !state.net?.isHost) return;

  // sessions: playerId -> { choices, metaText, sentAt }
  // requests: playerId -> requestedAt (player pressed Upgrade)
  if (!state._runUpNet) state._runUpNet = { sessions: new Map(), requests: new Map() };
  if (!state._runUpNet.sessions) state._runUpNet.sessions = new Map();
  if (!state._runUpNet.requests) state._runUpNet.requests = new Map();

  const sessions = state._runUpNet.sessions;
  const requests = state._runUpNet.requests;

  const localId = state.player ? String(state.player.id) : "";
  const nowT = state.time || 0;

  for (const p of getPlayersArr(state)) {
    if (!p) continue;
    const id = String(p.id);
    const pending = p._pendingLevelUps || 0;

    // Local host player uses the offline/manual overlay path (U / HUD button).
    // Do not auto-open here.
    if (id === localId) {
      sessions.delete(id);
      requests.delete(id);
      continue;
    }

    // If no pending (or dead), ensure flags cleared and session removed.
    if (p.hp <= 0 || pending <= 0) {
      if (p._lvlUpChoosing) {
        p._lvlUpChoosing = false;
        p._lvlUpInvuln = false;
      }
      sessions.delete(id);
      requests.delete(id);
      continue;
    }

    const s = sessions.get(id);

    if (!s) {
      // No active session: only open when the player explicitly requested it.
      if (p._lvlUpChoosing) {
        p._lvlUpChoosing = false;
        p._lvlUpInvuln = false;
      }

      if (!requests.has(id)) continue;

      // Out-of-combat gate (host-authoritative): no recent HP loss for this player.
      const need = 3.0;
      const tSince = nowT - (Number.isFinite(p._lastCombatAt) ? p._lastCombatAt : -Infinity);
      if (tSince < need) continue;

      const choices = rollRunUpgrades(p, 3);
      const metaText = `${p.nickname || "Player"} · Lv ${p.level} · Pending ${pending}`;
      sessions.set(id, { choices, metaText, sentAt: nowT });

      p._lvlUpChoosing = true;
      p._lvlUpInvuln = true;
      p.vx = 0;
      p.vy = 0;

      if (state.net && state.net.status === "connected") {
        state.net.sendRunChoices(id, choices, metaText);
      }
      continue;
    }

    // Awaiting pick: keep frozen; occasionally re-send choices (helps if UI was missed).
    p._lvlUpChoosing = true;
    p._lvlUpInvuln = true;
    p.vx = 0;
    p.vy = 0;

    if (nowT - (s.sentAt || 0) > 2.5) {
      s.sentAt = nowT;
      if (state.net && state.net.status === "connected") {
        state.net.sendRunChoices(id, s.choices, s.metaText);
      }
    }
  }
}

function hostApplyRunPick(state, fromId, choiceId) {
  if (!state || !state.net?.isHost) return;
  const sid = String(fromId || "");
  if (!sid) return;

  if (!state._runUpNet) state._runUpNet = { sessions: new Map() };
  if (!state._runUpNet.sessions) state._runUpNet.sessions = new Map();
  const sessions = state._runUpNet.sessions;

  if (!state._runUpNet.requests) state._runUpNet.requests = new Map();
  const requests = state._runUpNet.requests;

  const session = sessions.get(sid);
  if (!session) return;

  const player = getPlayerById(state, sid);
  if (!player) {
    sessions.delete(sid);
  try { requests.delete(sid); } catch {}
    return;
  }

  const choices = Array.isArray(session.choices) ? session.choices : [];
  const pick = choices.find((c) => c && c.id === choiceId) || choices[0];
  if (!pick) return;

  applyRunUpgrade(player, pick);
  player._pendingLevelUps = Math.max(0, (player._pendingLevelUps || 0) - 1);

  // Resume this player (next pending level-up will open again on the next tick if needed).
  sessions.delete(sid);
  try { requests.delete(sid); } catch {}
  player._lvlUpChoosing = false;
  player._lvlUpInvuln = false;

  const localId = state.player ? String(state.player.id) : "";
  if (sid === localId) {
    state._runUpgradeActive = false;
    // showRunUpgradeOverlay already hid itself on pick; this is just a safety net.
    try { hideRunUpgradeOverlay(); } catch {}
  }
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

  // Pixel_GO v0.4: floor shop purchases (host-authoritative)
  if (state._shopActPending && state._shopActPending.offerId) {
    input.shopAct = {
      offerId: String(state._shopActPending.offerId),
      replaceKey: (state._shopActPending.replaceKey != null) ? String(state._shopActPending.replaceKey) : null,
      seq: (state._shopActPending.seq | 0) || 0,
    };
  }

  state.net.sendInput(input);
}

function serializePlayerState(state) {
  const q = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : 0);
  const ps = getPlayersArr(state);

  const encSkills = (p) => {
    const s = p?.runSkills || {};
    // bullets,bombs,rockets,satellites,energyBarrier,spirit,summon,electricZone,laser,lightning,fireball,iceWall,blackhole,lightHeal
    return [
      s.bullets | 0,
      s.bombs | 0,
      s.rockets | 0,
      s.satellites | 0,
      s.energyBarrier | 0,
      s.spirit | 0,
      s.summon | 0,
      s.electricZone | 0,
      s.laser | 0,
      s.lightning | 0,
      s.fireball | 0,
      s.iceWall | 0,
      s.blackhole | 0,
      s.lightHeal | 0,
    ].join(",");
  };

  const encFloorShop = (p) => {
    const fs = p && p.floorShop;
    if (!fs || !Array.isArray(fs.offers) || !fs.offers.length) return null;
    // Only replicate the current-floor shop (keeps payload small).
    const curFloor = (state.currentRoomIndex != null ? (state.currentRoomIndex | 0) : 0);
    if ((fs.floor | 0) !== curFloor) return null;
    const offers = fs.offers.slice(0, 3).map((o) => ({
      id: String(o.id || ""),
      kind: String(o.kind || ""),
      key: String(o.key || ""),
      name: String(o.name || ""),
      from: (o.from | 0) || 0,
      to: (o.to | 0) || 0,
      c: (o.spCost | 0) || 0,
    }));
    const sold = Array.isArray(fs.sold) ? fs.sold.slice(0, 3).map((v) => (v ? 1 : 0)) : [0, 0, 0];
    return { f: (fs.floor | 0) || 0, o: offers, s: sold };
  };

  return {
    t: state.time,
    players: ps.map((p) => ({
      id: String(p.id),
      x: q(p.x),
      y: q(p.y),
      vx: q(p.vx),
      vy: q(p.vy),
      hp: p.hp,
      maxHP: p.maxHP,
      level: p.level,
      // Pixel_GO v0.4: Skill Points (SP)
      sp: (p.skillPoints | 0) || 0,
      // Pending in-run upgrade choices (kept in sync for joiners)
      pu: (p._pendingLevelUps || 0) | 0,
      // Joiners do not run weapon sim; sync these so their camera/aim feels correct.
      weaponStage: p.weaponStage || 1,
      range: q(Number.isFinite(p.range) ? p.range : getAttackRangeForPlayer(p)),
      nickname: p.nickname || "",
      avatarIndex: p.avatarIndex || 0,
      auraId: p.auraId || 0,
      color: p.color || pickColorForId(p.id),
      aim: { x: q(p.lastAimDir?.x || 0), y: q(p.lastAimDir?.y || 0) },
      rs: encSkills(p),

      // Pixel_GO v0.4: floor terminal offers for THIS player (current floor only)
      fs: encFloorShop(p),

      // Visual/UX replication for joiners (small payload):
      // - Energy Barrier needs shield state to be visible on joiners.
      // - Laser/Lightning visuals are computed only on host.
      eb: (p._energyBarrierVis && p._energyBarrierVis.radius > 0 && (p._energyBarrierShield || 0) > 0)
        ? {
            r: q(p._energyBarrierVis.radius),
            sh: q(Number(p._energyBarrierShield || p._energyBarrierVis.shield || 0)),
            ms: q(Number(p._energyBarrierMaxShield || p._energyBarrierVis.maxShield || 0)),
          }
        : null,

      lz: (() => {
        const vis = state._laserVisuals && typeof state._laserVisuals.get === "function" ? state._laserVisuals.get(String(p.id)) : null;
        if (!vis) return null;
        return { x1: q(vis.x1), y1: q(vis.y1), x2: q(vis.x2), y2: q(vis.y2) };
      })(),

      lt: (() => {
        const pts = state._lightningVisuals && typeof state._lightningVisuals.get === "function" ? state._lightningVisuals.get(String(p.id)) : null;
        if (!Array.isArray(pts) || !pts.length) return null;
        const flat = [];
        const maxPts = 6;
        for (let i = 0; i < pts.length && i < maxPts; i++) {
          const pt = pts[i];
          if (!pt) continue;
          flat.push(q(pt.x), q(pt.y));
        }
        return flat.length ? flat : null;
      })(),
    })),
  };
}

function applyPlayerStateToClient(state, pstate) {
  if (!pstate || typeof pstate !== "object") return;
  const st = (typeof pstate.t === "number") ? pstate.t : null;
  if (st != null) {
    const last = (typeof state._netLastAppliedPStateAt === "number") ? state._netLastAppliedPStateAt : -Infinity;
    if (st <= last + 1e-6) return;
    state._netLastAppliedPStateAt = st;
  }

  const myId = state.net?.playerId ? String(state.net.playerId) : (state.player?.id ? String(state.player.id) : "local");

  if (!state._netCache) {
    state._netCache = {
      players: new Map(),
      enemies: new Map(),
      projectilesById: new Map(),
      rocketsById: new Map(),
      projectiles: [],
      rockets: [],
      xpOrbs: [],
    };
  }
  const pCache = state._netCache.players;
  const players = state._netCache.playersArr || (state._netCache.playersArr = []);
  players.length = 0;

  // Joiners: host is the only one computing some weapon visuals.
  // Rebuild these maps from the replicated player-state each tick.
  const isJoiner = !!(state.net && !state.net.isHost);
  if (isJoiner) {
    if (!state._laserVisuals || typeof state._laserVisuals.clear !== "function") state._laserVisuals = new Map();
    if (!state._lightningVisuals || typeof state._lightningVisuals.clear !== "function") state._lightningVisuals = new Map();
    state._laserVisuals.clear();
    state._lightningVisuals.clear();
  }

  const seenStamp = (st != null ? st : (state.time || 0));

  for (const sp of (pstate.players || [])) {
    const id = String(sp.id);
    let p = pCache.get(id);
    if (!p) {
      const lvl = (typeof sp.level === "number" && Number.isFinite(sp.level)) ? (sp.level | 0) : 1;
      p = new Player({ x: sp.x || 0, y: sp.y || 0 }, lvl);
      p.id = id;
      p.color = sp.color || pickColorForId(id);
      p.nickname = sp.nickname || `P${id}`;
      p.avatarIndex = typeof sp.avatarIndex === "number" ? (sp.avatarIndex|0) : 0;
      p.auraId = typeof sp.auraId === "number" ? (sp.auraId|0) : 0;
      applyLimitsToPlayer(p, state.progression.limits);
      // Skill meta can be per-player (shop unlocks). If we have it from syncMeta, use it.
      const stored = state._netMetaById?.get(id) || null;
      p._metaSkillMeta = (stored && stored.skillMeta && typeof stored.skillMeta === "object") ? stored.skillMeta : (state.progression?.skillMeta || {});
      initRunUpgrades(p);
      p._netTx = p.x;
      p._netTy = p.y;
      pCache.set(id, p);
    }

    p._netSeenAt = seenStamp;

    const tx = Number.isFinite(sp.x) ? sp.x : p.x;
    const ty = Number.isFinite(sp.y) ? sp.y : p.y;

    p._netTx = tx;
    p._netTy = ty;

    // Save velocity for light dead-reckoning
    p._netVx = Number.isFinite(sp.vx) ? sp.vx : (p._netVx || 0);
    p._netVy = Number.isFinite(sp.vy) ? sp.vy : (p._netVy || 0);

    // Big correction snap
    const dxC = tx - p.x;
    const dyC = ty - p.y;
    if ((dxC*dxC + dyC*dyC) > 500*500) {
      p.x = tx;
      p.y = ty;
    }

    p.hp = sp.hp;
    p.maxHP = sp.maxHP;
    p.level = sp.level;

    // Pixel_GO v0.4: Skill Points (SP)
    if (typeof sp.sp === "number" && Number.isFinite(sp.sp)) {
      p.skillPoints = sp.sp | 0;
    }

    // Pixel_GO v0.4: floor terminal offers (current floor only)
    if (sp.fs && typeof sp.fs === "object" && Array.isArray(sp.fs.o)) {
      const offers = sp.fs.o.slice(0, 3).map((o) => ({
        id: String(o.id || ""),
        kind: String(o.kind || ""),
        key: String(o.key || ""),
        name: String(o.name || ""),
        from: (o.from | 0) || 0,
        to: (o.to | 0) || 0,
        spCost: (o.c | 0) || 0,
      }));
      const sold = Array.isArray(sp.fs.s) ? sp.fs.s.slice(0, 3).map((v) => !!v) : offers.map(() => false);
      p.floorShop = { floor: (sp.fs.f | 0) || 0, offers, sold };
    } else {
      // If host isn't sending a shop, clear stale one on joiners.
      const curFloor = (state.currentRoomIndex != null ? (state.currentRoomIndex | 0) : 0);
      if (p.floorShop && (p.floorShop.floor | 0) !== curFloor) {
        p.floorShop = null;
      }
    }
    if (typeof sp.pu === "number" && Number.isFinite(sp.pu)) {
      p._pendingLevelUps = sp.pu | 0;
      p._netHostPending = p._pendingLevelUps;
    } else {
      p._netHostPending = null;
    }
    if (typeof sp.weaponStage === "number") p.weaponStage = sp.weaponStage;
    if (typeof sp.range === "number" && Number.isFinite(sp.range)) p.range = sp.range;
    p.nickname = sp.nickname || p.nickname;
    p.avatarIndex = typeof sp.avatarIndex === "number" ? (sp.avatarIndex|0) : p.avatarIndex;
    if (typeof sp.auraId === "number") p.auraId = sp.auraId|0;
    p.color = sp.color || p.color;
    if (sp.aim) {
      p.lastAimDir.x = sp.aim.x || 0;
      p.lastAimDir.y = sp.aim.y || 0;
    }

      // Sync run skill levels from host (for HUD + visuals consistency on joiners).
    if (typeof sp.rs === "string" && sp.rs.length) {
      const parts = sp.rs.split(",");
      // bullets,bombs,rockets,satellites,energyBarrier,spirit,summon,electricZone,laser,lightning,fireball,iceWall,blackhole,lightHeal
      if (parts.length >= 10) {
        const b = parts[0] | 0;
        const bo = parts[1] | 0;
        const r = parts[2] | 0;
        const sat = parts[3] | 0;
        const eb = parts[4] | 0;
        const spr = parts[5] | 0;
        const smn = parts[6] | 0;
        const ez = parts[7] | 0;
        const la = parts[8] | 0;
        const li = parts[9] | 0;
        const fb = parts.length >= 11 ? (parts[10] | 0) : 0;
        const iw = parts.length >= 12 ? (parts[11] | 0) : 0;
        const bh = parts.length >= 13 ? (parts[12] | 0) : 0;
        const lh = parts.length >= 14 ? (parts[13] | 0) : 0;
        p.runSkills = p.runSkills || {};
        p.runSkills.bullets = b;
        p.runSkills.bombs = bo;
        p.runSkills.rockets = r;
        p.runSkills.satellites = sat;
        p.runSkills.energyBarrier = eb;
        p.runSkills.spirit = spr;
        p.runSkills.summon = smn;
        p.runSkills.electricZone = ez;
        p.runSkills.laser = la;
        p.runSkills.lightning = li;
        p.runSkills.fireball = fb;
        p.runSkills.iceWall = iw;
        p.runSkills.blackhole = bh;
        p.runSkills.lightHeal = lh;
      }
    }

    // Energy Barrier visual replication (shield up/down) for joiners.
    if (sp.eb && typeof sp.eb === "object" && Number.isFinite(sp.eb.r) && sp.eb.r > 0) {
      const maxS = Number(sp.eb.ms || 0);
      const curS = Number(sp.eb.sh || 0);
      p._energyBarrierVis = { radius: sp.eb.r, shield: curS, maxShield: maxS };
      p._energyBarrierShield = curS;
      p._energyBarrierMaxShield = maxS;
    } else {
      p._energyBarrierVis = null;
    }

    // Laser / Lightning visuals for joiners.
    if (isJoiner) {
      if (sp.lz && typeof sp.lz === "object") {
        const lv = { x1: sp.lz.x1 || 0, y1: sp.lz.y1 || 0, x2: sp.lz.x2 || 0, y2: sp.lz.y2 || 0 };
        state._laserVisuals.set(String(id), lv);
      }
      if (Array.isArray(sp.lt) && sp.lt.length >= 4) {
        const pts = [];
        for (let k = 0; k + 1 < sp.lt.length; k += 2) {
          pts.push({ x: sp.lt[k] || 0, y: sp.lt[k + 1] || 0 });
        }
        if (pts.length) state._lightningVisuals.set(String(id), pts);
      }
    }

    players.push(p);
  }

  for (const [id, p] of pCache) {
    if (!p || p._netSeenAt != seenStamp) pCache.delete(id);
  }

  state.players = players;
  const me = players.find((p) => String(p.id) === myId) || players[0] || state.player;
  state.player = me;

  // Joiner-only UX: show "LEVEL UP" feedback locally when our replicated level increases.
  if (state.net && !state.net.isHost && me) {
    const curLv = me.level | 0;
    if (typeof state._netLocalLevel !== "number") {
      state._netLocalLevel = curLv;
    } else {
      const prevLv = state._netLocalLevel | 0;
      if (curLv < prevLv) {
        me._pendingLevelUps = 0;
      }
      if (curLv > prevLv) {
        const diff = curLv - prevLv;
        // Each level gained usually means one pending run-upgrade choice.
        // In co-op we prefer host-replicated pending (pu) so the count doesn't get stuck.
        const hasHostPending = typeof me._netHostPending === "number" && Number.isFinite(me._netHostPending);
        if (!hasHostPending) {
          me._pendingLevelUps = (me._pendingLevelUps || 0) + diff;
        }
        if (state.floatingTexts) {
          state.floatingTexts.push({
            x: me.x,
            y: me.y - 30,
            text: "LEVEL UP!",
            time: 1.2,
          });
        }
        if (state.popups) {
          state.popups.push({
            text: diff > 1 ? `Level Up! +${diff} (Lv ${curLv})` : `Level Up! Lv ${curLv}`,
            time: 2.0,
          });
        }
      }
      state._netLocalLevel = curLv;
    }
  }
}

function serializeSnapshot(state) {
  // Quantize floats to reduce JSON size (helps mobile joiners).
  const q = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : 0);

  const ua = (typeof navigator !== "undefined" && navigator.userAgent) ? navigator.userAgent : "";
  const isMobileHost = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);

  // Union-interest filtering (co-op):
  // Host may have enemies spawned around several players across the map.
  // If we serialize everything, JSON.stringify causes micro-freezes.
  const psAll = getPlayersArr(state);
  const psAlive = psAll.filter((p) => p && p.hp > 0);
  const refs = psAlive.length ? psAlive : psAll;

  const INTEREST_R = (isMobileHost ? 15000 : 16500) * WORLD_SCALE;
  const INTEREST_R2 = INTEREST_R * INTEREST_R;

  const minD2ToPlayers = (x, y) => {
    let best = Infinity;
    for (const p of refs) {
      if (!p) continue;
      const dx = x - p.x;
      const dy = y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
      if (best <= 1200 * 1200) break;
    }
    return best;
  };

  // Soft caps to avoid spikes (server will also apply per-client interest).
  const capEnemies = isMobileHost ? 260 : 420;
  const capProj = isMobileHost ? 220 : 420;
  const capRockets = isMobileHost ? 90 : 160;
  const capOrbs = isMobileHost ? 260 : 420;
  const capSummons = isMobileHost ? 120 : 220;
  const capFx = isMobileHost ? 28 : 48;

  // Enemies (filtered + capped by distance to nearest player)
  const enemySrc = [];
  for (const e of (state.enemies || [])) {
    if (!e || e.dead) continue;
    const d2 = minD2ToPlayers(e.x, e.y);
    if (d2 > INTEREST_R2) continue;
    enemySrc.push({ e, d2 });
  }
  if (enemySrc.length > capEnemies) {
    enemySrc.sort((a, b) => a.d2 - b.d2);
    enemySrc.length = capEnemies;
  }

  // Projectiles
  const projSrc = [];
  for (const b of (state.projectiles || [])) {
    if (!b) continue;
    const d2 = minD2ToPlayers(b.x, b.y);
    if (d2 > INTEREST_R2) continue;
    projSrc.push({ b, d2 });
  }
  if (projSrc.length > capProj) {
    projSrc.sort((a, b) => a.d2 - b.d2);
    projSrc.length = capProj;
  }

  // Rockets
  const rocketSrc = [];
  for (const r of (state.rockets || [])) {
    if (!r) continue;
    const d2 = minD2ToPlayers(r.x, r.y);
    if (d2 > INTEREST_R2) continue;
    rocketSrc.push({ r, d2 });
  }
  if (rocketSrc.length > capRockets) {
    rocketSrc.sort((a, b) => a.d2 - b.d2);
    rocketSrc.length = capRockets;
  }

  // XP orbs
  const orbSrc = [];
  for (const o of (state.xpOrbs || [])) {
    if (!o) continue;
    const d2 = minD2ToPlayers(o.x, o.y);
    if (d2 > INTEREST_R2) continue;
    orbSrc.push({ o, d2 });
  }
  if (orbSrc.length > capOrbs) {
    orbSrc.sort((a, b) => a.d2 - b.d2);
    orbSrc.length = capOrbs;
  }

  // Summons (tanks). Visual-only for joiners.
  const sumSrc = [];
  for (const s of (state.summons || [])) {
    if (!s || !s.isSummon || s.hp <= 0) continue;
    const d2 = minD2ToPlayers(s.x, s.y);
    if (d2 > INTEREST_R2) continue;
    sumSrc.push({ s, d2 });
  }
  if (sumSrc.length > capSummons) {
    sumSrc.sort((a, b) => a.d2 - b.d2);
    sumSrc.length = capSummons;
  }

  // Biome skill FX (small lists)
  const bhSrc = [];
  for (const b of (state.blackholes || [])) {
    if (!b) continue;
    const d2 = minD2ToPlayers(b.x, b.y);
    if (d2 > INTEREST_R2) continue;
    bhSrc.push({ b, d2 });
  }
  if (bhSrc.length > capFx) {
    bhSrc.sort((a, b) => a.d2 - b.d2);
    bhSrc.length = capFx;
  }

  const iwSrc = [];
  for (const w of (state.iceWalls || [])) {
    if (!w) continue;
    const d2 = minD2ToPlayers(w.x, w.y);
    if (d2 > INTEREST_R2) continue;
    iwSrc.push({ w, d2 });
  }
  if (iwSrc.length > capFx) {
    iwSrc.sort((a, b) => a.d2 - b.d2);
    iwSrc.length = capFx;
  }

  const hpSrc = [];
  for (const h of (state.healPulses || [])) {
    if (!h) continue;
    const d2 = minD2ToPlayers(h.x, h.y);
    if (d2 > INTEREST_R2) continue;
    hpSrc.push({ h, d2 });
  }
  if (hpSrc.length > 18) {
    hpSrc.sort((a, b) => a.d2 - b.d2);
    hpSrc.length = 18;
  }

  const exSrc = [];
  for (const ex of (state._explosions || [])) {
    if (!ex) continue;
    const d2 = minD2ToPlayers(ex.x, ex.y);
    if (d2 > INTEREST_R2) continue;
    exSrc.push({ ex, d2 });
  }
  if (exSrc.length > 22) {
    exSrc.sort((a, b) => a.d2 - b.d2);
    exSrc.length = 22;
  }

  return {
    t: state.time,
    runScore: state.runScore,
    zone: state.currentZone,
    room: {
      i: (state.currentRoomIndex != null ? (state.currentRoomIndex | 0) : (state.roomDirector ? (state.roomDirector.roomIndex | 0) : 0)),
      biome: String(state._roomBiome || ""),
      nextBiome: String(state._nextRoomBiome || ""),
      prevBiome: String(state._prevRoomBiome || ""),
      side: (state._roomSide | 0) || 0,
      cleared: !!state._roomCleared,
      hasNext: !!state._roomHasNext,
      bridgeP: (typeof state._bridgeP === 'number' ? state._bridgeP : 0),
      bridgeBuilt: !!state._bridgeBuilt,
      prevI: (state._prevRoomIndex | 0) || 0,
      prevC: !!state._prevRoomCollapsing,
      prevT: (typeof state._prevRoomCollapseT === 'number' ? Math.round(state._prevRoomCollapseT * 100) / 100 : 0),
      bridgeFrom: (state._bridgeFrom | 0) || 0,
      bridgeTo: (state._bridgeTo | 0) || 0,
      wait: !!state._waitForParty,
      kickIds: Array.isArray(state._kickIds) ? state._kickIds.slice(0, 6).map(String) : [],
      // Gate state (small arrays; length == number of gates)
      gateHp: Array.isArray(state._gateHp) ? state._gateHp.map((v) => (typeof v === 'number' ? Math.round(v) : 0)) : [],
      gateMax: Array.isArray(state._gateMax) ? state._gateMax.map((v) => (typeof v === 'number' ? Math.round(v) : 0)) : [],
      gateReward: Array.isArray(state._gateReward) ? state._gateReward.map((v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : 0)) : [],
      gateRepair: Array.isArray(state._gateRepair) ? state._gateRepair.map((v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : 0)) : [],
      gateRepairMode: Array.isArray(state._gateRepairMode) ? state._gateRepairMode.map((v) => (typeof v === 'number' ? (v ? 1 : 0) : 0)) : [],
      gatePressure: Array.isArray(state._gatePressure) ? state._gatePressure.map((v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : 0)) : [],
      gateUsed: Array.isArray(state._gateUsed) ? state._gateUsed.map((v) => (typeof v === 'number' ? (v ? 1 : 0) : 0)) : [],
      killed: (state._roomKilled | 0) || 0,
      quota: (state._roomQuota | 0) || 0,
      waveI: (state._roomWaveIndex | 0) || 0,
      waveN: (state._roomWavesTotal | 0) || 0,
      bossAlive: !!state._roomBossAlive,
      isBoss: !!state._roomIsBoss,
      isMiniBoss: !!state._roomIsMiniBoss,
    },
    flags: {
      resGuardianKilledThisRun: !!(state.flags && state.flags.resGuardianKilledThisRun),
    },
    players: psAll.map((p) => ({
      id: String(p.id),
      x: q(p.x),
      y: q(p.y),
      hp: p.hp,
      maxHP: p.maxHP,
      level: p.level,
      xp: p.xp,
      nextXp: p.nextLevelXp,
      nickname: p.nickname || "",
      avatarIndex: p.avatarIndex || 0,
      color: p.color || pickColorForId(p.id),
      lastAim: { x: q(p.lastAimDir?.x || 0), y: q(p.lastAimDir?.y || 0) },
      rv: (p._reviving && p._reviving.targetId) ? String(p._reviving.targetId) : "",
      rvt: (p._reviving && typeof p._reviving.t === 'number') ? q(p._reviving.t) : 0,
      rvn: (p._reviving && typeof p._reviving.need === 'number') ? q(p._reviving.need) : 0,
    })),
    enemies: enemySrc.map(({ e }) => ({
      id: String(e.id || e._id || `${e.x.toFixed(1)}:${e.y.toFixed(1)}`),
      x: q(e.x),
      y: q(e.y),
      hp: e.hp,
      maxHp: e.maxHp ?? e.maxHP ?? 0,
      radius: e.radius || 20,
      kind: e.kind || e.type || "enemy",
      boss: !!e._isBoss || !!e.isBoss || !!e.boss,
      elite: !!e.isElite || !!e.elite,
    })),
    projectiles: projSrc.map(({ b }) => ({
      id: b.id != null ? b.id : undefined,
      ownerId: b.ownerId != null ? String(b.ownerId) : "",
      type: String(b.type || "bullet"),
      x: q(b.x),
      y: q(b.y),
      vx: q(b.vx),
      vy: q(b.vy),
      radius: b.radius || 4,
      life: q((b.range || 0) - (b.travel || 0)),
    })),
    rockets: rocketSrc.map(({ r }) => ({
      id: r.id != null ? r.id : undefined,
      ownerId: r.ownerId != null ? String(r.ownerId) : "",
      type: r.type || "rocket",
      x: q(r.x),
      y: q(r.y),
      vx: q(r.vx),
      vy: q(r.vy),
      radius: r.radius || 6,
      splashRadius: r.splashRadius || 0,
      life: q((r.range || 0) - (r.travel || 0)),
    })),
    xpOrbs: orbSrc.map(({ o }) => {
      const kind = o.kind || (o.coins ? "coin" : "xp");
      return {
        x: q(o.x),
        y: q(o.y),
        radius: o.radius || 8,
        kind,
        xp: kind === "xp" ? (o.xp || 10) : undefined,
        coins: kind === "coin" ? (o.coins || 1) : undefined,
      };
    }),

    summons: sumSrc.map(({ s }) => ({
      id: String(s.id || s._id || `smn:${String(s.ownerId || "")}@${(s.x || 0).toFixed(1)}:${(s.y || 0).toFixed(1)}`),
      ownerId: s.ownerId != null ? String(s.ownerId) : "",
      x: q(s.x),
      y: q(s.y),
      hp: s.hp,
      maxHp: s.maxHp ?? s.maxHP ?? 0,
      radius: s.radius || 18,
    })),

    // Global temporary buffs (small list). Needed so joiners can show icons + local notifications.
    buffs: (Array.isArray(state.buffs) ? state.buffs : []).slice(0, 16).map((b) => ({
      type: b.type || "",
      timeLeft: q(b.timeLeft || 0),
      multiplier: q(b.multiplier || 0),
      amount: q(b.amount || 0),
    })),

    fx: {
      bh: bhSrc.map(({ b }) => ({
        id: b.id != null ? b.id : undefined,
        ownerId: b.ownerId != null ? String(b.ownerId) : "",
        x: q(b.x),
        y: q(b.y),
        r: q(b.r || 0),
        t: q(b.t || 0),
      })),
      iw: iwSrc.map(({ w }) => ({
        id: w.id != null ? w.id : undefined,
        ownerId: w.ownerId != null ? String(w.ownerId) : "",
        x: q(w.x),
        y: q(w.y),
        a: q(w.a || 0),
        len: q(w.len || 0),
        thick: q(w.thick || 0),
        t: q(w.t || 0),
      })),
      hp: hpSrc.map(({ h }) => ({
        id: h.id != null ? h.id : undefined,
        x: q(h.x),
        y: q(h.y),
        r: q(h.r || 0),
        t: q(h.t || 0),
      })),
      ex: exSrc.map(({ ex }) => ({
        x: q(ex.x),
        y: q(ex.y),
        r: q(ex.r || 0),
        t: q(ex.t || 0),
        k: String(ex.kind || ""),
      })),
    },
  };
}

function applySnapshotToClient(state, snap) {
  if (!snap || typeof snap !== "object") return;
  // Apply only when snapshot is newer (avoid re-applying the same snap every frame).
  const st = (typeof snap.t === "number") ? snap.t : null;
  if (st != null) {
    const last = (typeof state._netLastAppliedSnapshotAt === "number") ? state._netLastAppliedSnapshotAt : -Infinity;
    if (st <= last + 1e-6) return;
    state._netLastAppliedSnapshotAt = st;
  }

  // Ensure we have a player id
  const myId = state.net?.playerId
    ? String(state.net.playerId)
    : (state.player?.id ? String(state.player.id) : "local");

  // Net caches (reduce GC + allow smoothing)
  if (!state._netCache) {
    state._netCache = {
      players: new Map(),
      enemies: new Map(),
      // Visual-only projectile caches keyed by id (prevents flicker/teleport on joiners)
      projectilesById: new Map(),
      rocketsById: new Map(),
      projectiles: [],
      rockets: [],
      xpOrbs: [],
    };
  }
  const pCache = state._netCache.players;
  const eCache = state._netCache.enemies;
  if (!state._netCache.projectilesById) state._netCache.projectilesById = new Map();
  if (!state._netCache.rocketsById) state._netCache.rocketsById = new Map();
  if (!Array.isArray(state._netCache.projectiles)) state._netCache.projectiles = [];
  if (!Array.isArray(state._netCache.rockets)) state._netCache.rockets = [];
  if (!Array.isArray(state._netCache.xpOrbs)) state._netCache.xpOrbs = [];

  // Players (reuse arrays + avoid per-snapshot Set allocations)
  const players = state._netCache.playersArr || (state._netCache.playersArr = []);
  players.length = 0;
  const seenStamp = (st != null ? st : (state.time || 0));
  for (const sp of (snap.players || [])) {
    const id = String(sp.id);

    let p = pCache.get(id);
    if (!p) {
      const lvl = (typeof sp.level === "number" && Number.isFinite(sp.level)) ? (sp.level | 0) : 1;
      p = new Player({ x: sp.x || 0, y: sp.y || 0 }, lvl);
      p.id = id;
      p.color = sp.color || pickColorForId(id);
      p.nickname = sp.nickname || `P${id}`;
      if (typeof sp.avatarIndex === "number") p.avatarIndex = sp.avatarIndex | 0;
      applyLimitsToPlayer(p, state.progression.limits);
      // Skill meta can be per-player (shop unlocks). If we have it from syncMeta, use it.
      const stored = state._netMetaById?.get(id) || null;
      p._metaSkillMeta = (stored && stored.skillMeta && typeof stored.skillMeta === "object") ? stored.skillMeta : (state.progression?.skillMeta || {});
      // net smoothing targets
      p._netTx = p.x;
      p._netTy = p.y;
      pCache.set(id, p);
    }

    // mark as seen in this snapshot (for pruning)
    p._netSeenAt = seenStamp;

    const tx = Number.isFinite(sp.x) ? sp.x : p.x;
    const ty = Number.isFinite(sp.y) ? sp.y : p.y;

    // For our own player, keep current predicted position and smooth-correct.
    // For others, also smooth (less jitter on phones).
    p._netTx = tx;
    p._netTy = ty;

    // Big correction? snap instantly.
    const dxC = tx - p.x;
    const dyC = ty - p.y;
    if ((dxC * dxC + dyC * dyC) > 600 * 600) {
      p.x = tx;
      p.y = ty;
    }

    p.hp = sp.hp;
    p.maxHP = sp.maxHP;
    p.level = sp.level;
    p.xp = sp.xp;
    p.nextLevelXp = sp.nextXp;
    p.nickname = sp.nickname || p.nickname;
    if (typeof sp.avatarIndex === "number") p.avatarIndex = sp.avatarIndex | 0;
    p.color = sp.color || p.color;
    if (sp.lastAim) {
      p.lastAimDir.x = sp.lastAim.x || 0;
      p.lastAimDir.y = sp.lastAim.y || 0;
    }

    // Revive channel replication
    if (sp.rv) {
      p._reviving = { targetId: String(sp.rv), t: (typeof sp.rvt === 'number' ? sp.rvt : 0), need: (typeof sp.rvn === 'number' ? sp.rvn : 2) };
    } else {
      p._reviving = null;
    }

    players.push(p);
  }
  // Drop missing players
  for (const [id, p] of pCache) {
    if (!p || p._netSeenAt !== seenStamp) pCache.delete(id);
  }
  state.players = players;

  // Our player ref
  const me = players.find((p) => String(p.id) === myId) || players[0] || state.player;
  state.player = me;

  // Enemies (reuse arrays + avoid per-snapshot Set allocations)
  const enemies = state._netCache.enemiesArr || (state._netCache.enemiesArr = []);
  enemies.length = 0;
  for (const se of (snap.enemies || [])) {
    const id = String(se.id);

    let e = eCache.get(id);
    if (!e) {
      e = createNetEnemy(se);
      e.x = Number.isFinite(se.x) ? se.x : 0;
      e.y = Number.isFinite(se.y) ? se.y : 0;
      e._netTx = e.x;
      e._netTy = e.y;
      eCache.set(id, e);
    }

    e._netSeenAt = seenStamp;

    const tx = Number.isFinite(se.x) ? se.x : e.x;
    const ty = Number.isFinite(se.y) ? se.y : e.y;
    e._netTx = tx;
    e._netTy = ty;

    const dxC = tx - e.x;
    const dyC = ty - e.y;
    if ((dxC * dxC + dyC * dyC) > 900 * 900) {
      e.x = tx;
      e.y = ty;
    }

    e.hp = se.hp;
    e.maxHp = se.maxHp;
    e.radius = se.radius || e.radius || 20;
    e.kind = se.kind || e.kind || "enemy";
    e._isBoss = !!se.boss;
    e.isElite = !!se.elite;
    enemies.push(e);
  }
  for (const [id, e] of eCache) {
    if (!e || e._netSeenAt !== seenStamp) eCache.delete(id);
  }
  state.enemies = enemies;

  // Visual-only entities:
  // Keep stable by id so joiners don't see bullets "teleport" or disappear between snapshots.
  // We only render them on joiners (no gameplay/collisions on the client).
  const nowLocal = state.time || 0;
  const grace = 0.30; // keep briefly when missing (snapshot cap/interest fluctuations)

  // Projectiles
  const srcB = Array.isArray(snap.projectiles) ? snap.projectiles : [];
  const bMap = state._netCache.projectilesById;
  for (const b of srcB) {
    if (!b) continue;
    const id = (b.id != null) ? String(b.id) : null;
    if (!id) continue;

    let ob = bMap.get(id);
    const tx = Number.isFinite(b.x) ? b.x : 0;
    const ty = Number.isFinite(b.y) ? b.y : 0;
    if (!ob) {
      ob = {
        id,
        type: String(b.type || "bullet"),
        x: tx,
        y: ty,
        vx: Number.isFinite(b.vx) ? b.vx : 0,
        vy: Number.isFinite(b.vy) ? b.vy : 0,
        radius: b.radius || 4,
        _netTx: tx,
        _netTy: ty,
        _netLife: Number.isFinite(b.life) ? b.life : null,
        _netLastSeenLocalTime: nowLocal,
      };
      bMap.set(id, ob);
    }

    ob._netLastSeenLocalTime = nowLocal;
    ob._netTx = tx;
    ob._netTy = ty;
    if (Number.isFinite(b.vx)) ob.vx = b.vx;
    if (Number.isFinite(b.vy)) ob.vy = b.vy;
    if (b.type != null) ob.type = String(b.type || "bullet");
    ob.radius = b.radius || ob.radius || 4;
    if (Number.isFinite(b.life)) ob._netLife = b.life;

    const dxC = ob._netTx - ob.x;
    const dyC = ob._netTy - ob.y;
    if ((dxC * dxC + dyC * dyC) > 1000 * 1000) {
      ob.x = ob._netTx;
      ob.y = ob._netTy;
    }
  }
  for (const [id, ob] of bMap) {
    const lastSeen = (ob && typeof ob._netLastSeenLocalTime === "number") ? ob._netLastSeenLocalTime : -Infinity;
    if (nowLocal - lastSeen > grace) bMap.delete(id);
  }
  const dstB = state._netCache.projectiles;
  dstB.length = 0;
  for (const ob of bMap.values()) dstB.push(ob);
  state.projectiles = dstB;

  // Rockets
  const srcR = Array.isArray(snap.rockets) ? snap.rockets : [];
  const rMap = state._netCache.rocketsById;
  for (const r of srcR) {
    if (!r) continue;
    const id = (r.id != null) ? String(r.id) : null;
    if (!id) continue;

    let or = rMap.get(id);
    const tx = Number.isFinite(r.x) ? r.x : 0;
    const ty = Number.isFinite(r.y) ? r.y : 0;
    if (!or) {
      or = {
        id,
        x: tx,
        y: ty,
        vx: Number.isFinite(r.vx) ? r.vx : 0,
        vy: Number.isFinite(r.vy) ? r.vy : 0,
        radius: r.radius || 6,
        splashRadius: r.splashRadius || 0,
        _netTx: tx,
        _netTy: ty,
        _netLife: Number.isFinite(r.life) ? r.life : null,
        _netLastSeenLocalTime: nowLocal,
      };
      rMap.set(id, or);
    }

    or._netLastSeenLocalTime = nowLocal;
    or._netTx = tx;
    or._netTy = ty;
    if (Number.isFinite(r.vx)) or.vx = r.vx;
    if (Number.isFinite(r.vy)) or.vy = r.vy;
    or.radius = r.radius || or.radius || 6;
    or.type = r.type || or.type || "rocket";
    or.splashRadius = r.splashRadius || or.splashRadius || 0;
    if (Number.isFinite(r.life)) or._netLife = r.life;

    const dxC = or._netTx - or.x;
    const dyC = or._netTy - or.y;
    if ((dxC * dxC + dyC * dyC) > 1000 * 1000) {
      or.x = or._netTx;
      or.y = or._netTy;
    }
  }
  for (const [id, or] of rMap) {
    const lastSeen = (or && typeof or._netLastSeenLocalTime === "number") ? or._netLastSeenLocalTime : -Infinity;
    if (nowLocal - lastSeen > grace) rMap.delete(id);
  }
  const dstR = state._netCache.rockets;
  dstR.length = 0;
  for (const or of rMap.values()) dstR.push(or);
  state.rockets = dstR;

  const srcO = Array.isArray(snap.xpOrbs) ? snap.xpOrbs : [];
  const dstO = state._netCache.xpOrbs;
  dstO.length = srcO.length;
  for (let i = 0; i < srcO.length; i++) {
    const o = srcO[i] || {};
    let oo = dstO[i];
    if (!oo) {
      oo = dstO[i] = { x: 0, y: 0, xp: 10, coins: 0, kind: "xp", radius: 8, age: 0 };
    }
    oo.x = o.x || 0;
    oo.y = o.y || 0;
    oo.kind = o.kind || (o.coins ? "coin" : "xp");
    oo.xp = (oo.kind === "xp") ? (o.xp || 10) : 0;
    oo.coins = (oo.kind === "coin") ? (o.coins || 1) : 0;
    oo.radius = o.radius || 8;
    oo.age = 0;
  }
  state.xpOrbs = dstO;

  // Summons (visual-only on joiners)
  const srcS = Array.isArray(snap.summons) ? snap.summons : [];
  if (!Array.isArray(state._netCache.summons)) state._netCache.summons = [];
  const dstS = state._netCache.summons;
  dstS.length = srcS.length;
  for (let i = 0; i < srcS.length; i++) {
    const s = srcS[i] || {};
    let os = dstS[i];
    if (!os) {
      os = dstS[i] = { id: "", ownerId: "", x: 0, y: 0, hp: 1, maxHp: 1, radius: 18, isSummon: true };
    }
    os.id = String(s.id || "");
    os.ownerId = s.ownerId != null ? String(s.ownerId) : "";
    os.x = s.x || 0;
    os.y = s.y || 0;
    os.hp = s.hp || 0;
    os.maxHp = s.maxHp || 0;
    os.radius = s.radius || 18;
    os.isSummon = true;
  }
  state.summons = dstS;

  // Biome skill FX (visual-only on joiners; host is authoritative).
  const fx = snap.fx && typeof snap.fx === 'object' ? snap.fx : null;
  if (fx) {
    const bh = Array.isArray(fx.bh) ? fx.bh : [];
    state.blackholes = bh.map((b) => ({
      id: b.id != null ? b.id : undefined,
      ownerId: b.ownerId != null ? String(b.ownerId) : "",
      x: b.x || 0,
      y: b.y || 0,
      r: b.r || 0,
      t: b.t || 0,
    }));
    const iw = Array.isArray(fx.iw) ? fx.iw : [];
    state.iceWalls = iw.map((w) => ({
      id: w.id != null ? w.id : undefined,
      ownerId: w.ownerId != null ? String(w.ownerId) : "",
      x: w.x || 0,
      y: w.y || 0,
      a: w.a || 0,
      len: w.len || 0,
      thick: w.thick || 0,
      t: w.t || 0,
    }));
    const hp = Array.isArray(fx.hp) ? fx.hp : [];
    state.healPulses = hp.map((h) => ({ id: h.id != null ? h.id : undefined, x: h.x || 0, y: h.y || 0, r: h.r || 0, t: h.t || 0 }));
    const ex = Array.isArray(fx.ex) ? fx.ex : [];
    state._explosions = ex.map((e) => ({ x: e.x || 0, y: e.y || 0, r: e.r || 0, t: e.t || 0, kind: e.k || '' }));
  } else {
    state.blackholes = [];
    state.iceWalls = [];
    state.healPulses = [];
    state._explosions = [];
  }

  state.runScore = snap.runScore || 0;
  state.currentZone = snap.zone ?? state.currentZone;
  // Pixel_GO: room sync
  const r = snap.room || null;
  if (r && typeof r === 'object') {
    state.currentRoomIndex = (r.i | 0) || 0;
    state._roomBiome = String(r.biome || "");
    state._nextRoomBiome = String(r.nextBiome || "");
    state._prevRoomBiome = String(r.prevBiome || "");
    state._roomSide = (r.side | 0) || state._roomSide;
    state._roomCleared = !!r.cleared;
    state._roomHasNext = !!r.hasNext;
    state._bridgeP = (typeof r.bridgeP === 'number') ? r.bridgeP : 0;
    state._bridgeBuilt = !!r.bridgeBuilt;
    state._prevRoomIndex = (r.prevI | 0) || 0;
    state._prevRoomCollapsing = !!r.prevC;
    state._prevRoomCollapseT = (typeof r.prevT === 'number') ? r.prevT : 0;
    state._bridgeFrom = (r.bridgeFrom | 0) || 0;
    state._bridgeTo = (r.bridgeTo | 0) || 0;
    state._waitForParty = !!r.wait;
    state._gateHp = Array.isArray(r.gateHp) ? r.gateHp : (state._gateHp || []);
    state._gateMax = Array.isArray(r.gateMax) ? r.gateMax : (state._gateMax || []);
    state._gateReward = Array.isArray(r.gateReward) ? r.gateReward : (state._gateReward || []);
    state._gateRepair = Array.isArray(r.gateRepair) ? r.gateRepair : (state._gateRepair || []);
    state._gateRepairMode = Array.isArray(r.gateRepairMode) ? r.gateRepairMode : (state._gateRepairMode || []);
    state._gatePressure = Array.isArray(r.gatePressure) ? r.gatePressure : (state._gatePressure || []);
    state._gateUsed = Array.isArray(r.gateUsed) ? r.gateUsed : (state._gateUsed || []);
    state._roomKilled = (r.killed | 0) || 0;
    state._roomQuota = (r.quota | 0) || 0;
    state._roomWaveIndex = (r.waveI | 0) || 0;
    state._roomWavesTotal = (r.waveN | 0) || 0;
    state._roomBossAlive = !!r.bossAlive;
    state._roomIsBoss = !!r.isBoss;
    state._roomIsMiniBoss = !!r.isMiniBoss;
    if (state.roomDirector && typeof state.roomDirector.forceSetCurrent === 'function') {
      try {
        state.roomDirector.forceSetCurrent(state.currentRoomIndex, {
          biome: state._roomBiome,
          nextBiome: state._nextRoomBiome,
          prevBiome: state._prevRoomBiome,
          cleared: state._roomCleared,
          hasNext: state._roomHasNext,
          bridgeP: state._bridgeP,
          gateHp: state._gateHp,
          gateMax: state._gateMax,
          gateReward: state._gateReward,
          gateRepair: state._gateRepair,
          gateRepairMode: state._gateRepairMode,
          gatePressure: state._gatePressure,
          gateUsed: state._gateUsed,
          prevI: (r.prevI | 0) || 0,
          prevT: (typeof r.prevT === 'number' ? r.prevT : 0),
          prevCollapsing: !!r.prevC,
          bridgeFrom: (r.bridgeFrom | 0) || 0,
          bridgeTo: (r.bridgeTo | 0) || 0,
          waitForParty: !!r.wait

        });
      } catch {}
    }
  }
  // If host indicates we were left behind, return to start menu.
  if (r && Array.isArray(r.kickIds) && r.kickIds.length) {
    const me = state.player ? String(state.player.id || myId) : myId;
    if (r.kickIds.includes(me)) {
      state.overlayMode = null;
      state.mode = 'startMenu';
      try {
        if (state.net && state.net.status === 'connected' && !state.net.isHost) {
          state.net.disconnect();
        }
      } catch {}
      if (Array.isArray(state.popups)) {
        state.popups.push({ text: 'Left behind', time: 2.0 });
      }
    }
  }
  if (snap.flags && state.flags) {
    state.flags.resGuardianKilledThisRun = !!snap.flags.resGuardianKilledThisRun;
  }

  // Sync global buffs from host -> joiners (so HUD icons and local stat calc can work).
  const srcBuffs = Array.isArray(snap.buffs) ? snap.buffs : [];
  if (!state._netCache) state._netCache = { players: new Map(), enemies: new Map() };
  const dstBuffs = state._netCache.buffsArr || (state._netCache.buffsArr = []);
  dstBuffs.length = srcBuffs.length;
  for (let i = 0; i < srcBuffs.length; i++) {
    const b = srcBuffs[i] || {};
    let ob = dstBuffs[i];
    if (!ob) ob = dstBuffs[i] = { type: "", timeLeft: 0, multiplier: 0, amount: 0 };
    ob.type = (b.type || "").toString();
    ob.timeLeft = typeof b.timeLeft === "number" ? b.timeLeft : 0;
    ob.multiplier = typeof b.multiplier === "number" ? b.multiplier : 0;
    ob.amount = typeof b.amount === "number" ? b.amount : 0;
  }
  state.buffs = dstBuffs;

  // Joiner-only: show notification when a new buff appears (count per type increased).
  if (state.net && !state.net.isHost) {
    const prev = state._netBuffCounts || Object.create(null);
    const next = Object.create(null);
    for (const b of dstBuffs) {
      const t = (b && b.type) ? String(b.type) : "";
      if (!t) continue;
      next[t] = (next[t] || 0) + 1;
    }

    const labelFor = (t) => (
      t === "damage" ? "Damage" :
      t === "attackSpeed" ? "Attack Speed" :
      t === "moveSpeed" ? "Move Speed" :
      t === "regen" ? "Regen" :
      t === "shield" ? "Shield" :
      t === "xpGain" ? "XP Gain" :
      t === "ghost" ? "Ghost" :
      t
    );

    for (const k of Object.keys(next)) {
      const a = next[k] | 0;
      const b = (prev[k] || 0) | 0;
      if (a > b) {
        const label = labelFor(k);
        // Minimal local feedback (we don't know exact world position of the drop).
        if (state.floatingTexts && state.player) {
          state.floatingTexts.push({
            x: state.player.x,
            y: state.player.y - 24,
            text: "BUFF: " + label,
            time: 1.0,
          });
        }
        if (state.popups) {
          state.popups.push({
            text: "Temporary buff: " + label,
            time: 2.0,
          });
        }
      }
    }
    state._netBuffCounts = next;
  }
}

function createNetEnemy(data) {
  const e = {
    id: data.id,
    x: data.x,
    y: data.y,
    hp: data.hp,
    maxHp: data.maxHp,
    radius: data.radius || 20,
    kind: data.kind || "enemy",
    _isBoss: !!data.boss,
    isElite: !!data.elite,
    update: null,
    render(self, ctx) {
      const biomeKey = biomeKeyFromKind(self.kind);
      if (biomeKey && !self._isBoss) {
        renderBiomeUnit(ctx, self, biomeKey, {
          role: biomeRoleFromKind(self.kind) || (self.isElite ? biomeStyleForKey(biomeKey).eliteRole : biomeStyleForKey(biomeKey).role),
          isBasic: String(self.kind || '').toLowerCase().includes('basic'),
          isElite: !!self.isElite,
          time: performance.now() * 0.001,
        });
        return;
      }
      ctx.save();
      ctx.beginPath();
      // Make remote enemies readable (avoid "gray blobs" on clients)
      let col = "#ff5f6f"; // basic
      if (self.isElite) col = "#ffdd57";
      if (self._isBoss) col = "#ff4b7a";
      // better special-case colors
      if (self.kind === "zoneBoss") col = "#9b5bff";
      if (self.kind === "roamingBoss") col = "#ff3cbe";
      if (self.kind === "resurrectionGuardian") col = "#ffdd44";
      if (self.kind === "zone6SuperBoss") col = "#1be7ff";
      ctx.fillStyle = col;
      ctx.globalAlpha = 1.0;
      ctx.arc(self.x, self.y, self.radius, 0, Math.PI * 2);
      ctx.fill();

      // Small HP ring for elites/bosses (helps orientation)
      if (self._isBoss || self.isElite) {
        const ratio = self.maxHp > 0 ? (self.hp / self.maxHp) : 1;
        ctx.strokeStyle = "#ffffff";
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = self._isBoss ? 3 : 2;
        ctx.beginPath();
        ctx.arc(
          self.x,
          self.y,
          self.radius + (self._isBoss ? 7 : 5),
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, ratio))
        );
        ctx.stroke();
      }
      ctx.restore();
    },
  };
  return e;
}

function smoothNetEntities(state, dt) {
  // Exponential smoothing factor: stable across FPS differences
  const k = 1 - Math.exp(-dt * 12);
  const kMe = 1 - Math.exp(-dt * 5);

  const ps = state.players || [];
  const myId = state.player ? String(state.player.id) : null;
  const lookahead = 0.05; // small extrapolation helps hide low tickrate
  for (const p of ps) {
    if (!p || p._netTx == null || p._netTy == null) continue;
    const isMe = myId && String(p.id) === myId;
    const tx = p._netTx + (isMe ? 0 : (p._netVx || 0) * lookahead);
    const ty = p._netTy + (isMe ? 0 : (p._netVy || 0) * lookahead);
    const dx = tx - p.x;
    const dy = ty - p.y;
    if (dx * dx + dy * dy < 0.0001) continue;
    const kk = isMe ? kMe : k;
    p.x += dx * kk;
    p.y += dy * kk;
  }

  const es = state.enemies || [];
  for (const e of es) {
    if (!e || e._netTx == null || e._netTy == null) continue;
    const dx = e._netTx - e.x;
    const dy = e._netTy - e.y;
    if (dx * dx + dy * dy < 0.0001) continue;
    e.x += dx * k;
    e.y += dy * k;
  }
}

function updateNetVisualProjectiles(state, dt) {
  // Joiners only: advance projectiles between low-frequency snapshots for visual continuity.
  if (!isOnline(state) || !state.net || state.net.isHost) return;

  const k = 1 - Math.exp(-dt * 10);

  const bs = state.projectiles || [];
  for (const b of bs) {
    if (!b) continue;
    const vx = Number.isFinite(b.vx) ? b.vx : 0;
    const vy = Number.isFinite(b.vy) ? b.vy : 0;
    b.x += vx * dt;
    b.y += vy * dt;

    if (b._netTx != null && b._netTy != null) {
      b.x += (b._netTx - b.x) * k;
      b.y += (b._netTy - b.y) * k;
    }
    if (typeof b._netLife === "number") b._netLife -= dt;
  }

  const rs = state.rockets || [];
  for (const r of rs) {
    if (!r) continue;
    const vx = Number.isFinite(r.vx) ? r.vx : 0;
    const vy = Number.isFinite(r.vy) ? r.vy : 0;
    r.x += vx * dt;
    r.y += vy * dt;

    if (r._netTx != null && r._netTy != null) {
      r.x += (r._netTx - r.x) * k;
      r.y += (r._netTy - r.y) * k;
    }
    if (typeof r._netLife === "number") r._netLife -= dt;
  }
}

function maybeSendPlayerState(state, dt = 0) {
  if (!state.net || !state.net.isHost) return;
  const now = state.time;

  // 40 Hz players-only state (small payload). Helps joiners keep camera & movement smooth.
  const PSTATE_DT = 1 / 40;
  state._netPStateAcc = (state._netPStateAcc || 0) + (Number.isFinite(dt) ? dt : 0);

  // Prevent huge catch-up spikes if the tab hiccups.
  if (state._netPStateAcc > 0.25) state._netPStateAcc = 0.25;
  if (state._netPStateAcc < PSTATE_DT) return;

  // At most one send per updateSim call to avoid bursts.
  state._netPStateAcc -= PSTATE_DT;
  state._netLastPlayerStateSentAt = now;
  if (typeof state.net.sendPlayerState === "function") {
    state.net.sendPlayerState(serializePlayerState(state));
  }
}

function maybeSendSnapshot(state, dt = 0) {
  if (!state.net || !state.net.isHost) return;
  const now = state.time;

  // Requested net cadence:
  // - 60 Hz authoritative sim (host)
  // - 40 Hz snapshots (SNAP_DT = 1/40)
  const SNAP_DT = 1 / 40;
  state._netSnapAcc = (state._netSnapAcc || 0) + (Number.isFinite(dt) ? dt : 0);

  // Prevent huge catch-up spikes if the tab hiccups.
  if (state._netSnapAcc > 0.25) state._netSnapAcc = 0.25;
  if (state._netSnapAcc < SNAP_DT) return;

  // At most one snapshot per updateSim call to avoid bursts.
  state._netSnapAcc -= SNAP_DT;
  state._netLastSnapshotSendAt = now;
  state.net.sendSnapshot(serializeSnapshot(state));
}

function maybeEnterOnlineDeathOverlay(state) {
  if (!isOnline(state)) return;
  // Pixel_GO uses downed+revive instead of the old death overlay.
  if (state.roomDirector) return;
  if (state.mode !== "playing") return;
  if (!state.player) return;

  // If we already requested a respawn, don't re-open death UI until host revives us.
  if (state._waitingRespawnAck) {
    if (state.player.hp > 0) {
      state._waitingRespawnAck = false;
      state._deathHandled = false;
    } else {
      return;
    }
  }

  // reset when alive
  if (state.player.hp > 0) {
    state._deathHandled = false;
    return;
  }

  if (state._deathHandled || state.overlayMode) return;

  // Award score/points since last life (delta runScore)
  const nowScore = Math.floor(state.runScore || 0);
  const prev = Math.floor(state._lastDeathAwardScore || 0);
  const delta = Math.max(0, nowScore - prev);
  state._lastDeathAwardScore = nowScore;

  state.progression.totalScore = Math.max(0, (state.progression.totalScore || 0) + delta);
  const gainedPoints = Math.max(0, Math.floor(delta / 400));
  state.progression.upgradePoints = Math.max(0, (state.progression.upgradePoints || 0) + gainedPoints);

  state.lastRunSummary = {
    runScore: delta,
    gainedPoints,
    startLevel: state.player.level || getStartLevel(state.progression),
  };
  try { saveProgression(state.progression); } catch {}

  // Show resurrection screen if available, otherwise upgrade screen.
  state.overlayMode = state.flags?.resGuardianKilledThisRun ? "resurrection" : "upgrade";
  state._deathHandled = true;
}

function respawnPlayerToHub(state, p, meta) {
  if (!p) return;
  if (meta) applyNetMetaToPlayer(state, p, meta);
  p.x = 0;
  p.y = 0;
  p.vx = 0;
  p.vy = 0;
  p.hp = p.maxHP;
  // Keep level/xp as-is (co-op world continues)
}

function processRespawnRequests(state) {
  if (!isOnline(state)) return;
  if (!state.net?.isHost) {
    // Joiner respawn is applied by host; locally we only clear overlays.
    return;
  }

  for (const p of getPlayersArr(state)) {
    if (!p) continue;
    if (!p._netRespawnRequested) continue;
    p._netRespawnRequested = false;
    const id = String(p.id);
    const meta = state._netMetaById?.get(id) || null;
    respawnPlayerToHub(state, p, meta);
  }
}


// --- Revive system (Pixel_GO co-op) ----------------------------------------
// When a player dies (hp<=0), they stay as a corpse. Teammates can revive them by channeling.
// During the channel, the reviver cannot move or shoot.
// If a downed player is not revived and the party advances to the next floor, they are kicked to menu.

const REVIVE_INTERACT_R = 140;
const REVIVE_CHANNEL_SEC = 2.0;

function startReviveById(state, reviver, targetId) {
  if (!state || !reviver || (reviver.hp || 0) <= 0) return false;
  if (!targetId) return false;
  if (reviver._reviving) return false;

  const tid = String(targetId);
  const ps = (state.players && state.players.length) ? state.players : (state.player ? [state.player] : []);
  const target = ps.find((p) => p && String(p.id || '') === tid) || null;
  if (!target || (target.hp || 0) > 0) return false;

  const dx = target.x - reviver.x;
  const dy = target.y - reviver.y;
  if (dx * dx + dy * dy > REVIVE_INTERACT_R * REVIVE_INTERACT_R) return false;

  reviver._reviving = { targetId: tid, t: 0, need: REVIVE_CHANNEL_SEC };
  // Stop immediately
  reviver.vx = 0;
  reviver.vy = 0;
  return true;
}

function updateRevives(state, dt) {
  if (!state || !Number.isFinite(dt) || dt <= 0) return;
  const ps = (state.players && state.players.length) ? state.players : (state.player ? [state.player] : []);
  if (!ps.length) return;

  const byId = new Map(ps.filter(Boolean).map((p) => [String(p.id || ''), p]));

  for (const p of ps) {
    if (!p || !p._reviving) continue;
    if ((p.hp || 0) <= 0) { p._reviving = null; continue; }
    const r = p._reviving;
    const t = byId.get(String(r.targetId || '')) || null;
    if (!t || (t.hp || 0) > 0) { p._reviving = null; continue; }

    // Must stay close
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    if (dx * dx + dy * dy > (REVIVE_INTERACT_R * 0.95) * (REVIVE_INTERACT_R * 0.95)) {
      p._reviving = null;
      continue;
    }

    // Channel
    r.t = (r.t || 0) + dt;
    p.vx = 0;
    p.vy = 0;

    if (r.t >= (r.need || REVIVE_CHANNEL_SEC)) {
      // Revive!
      t.hp = Math.max(1, Math.floor((t.maxHP || t.maxHp || 100) * 0.55));
      t._kicked = false;

      p._reviving = null;

      if (Array.isArray(state.floatingTexts)) {
        state.floatingTexts.push({ x: t.x, y: t.y - 28, text: "REVIVED!", time: 1.0 });
      }
    }
  }
}


function updateEnemies(state, dt) {
  const { enemies } = state;

  // Zone 0 (Hub) is a safe green area. Enemies must never enter it.
  // Enforce it centrally (covers all enemy types, co-op + solo).
  const HUB_PAD = 6; // small padding so enemies don't visually overlap the hub edge

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];

    // Biome status ticks (burn / marks). Applies to all enemy types.
    try {
      if (e) {
        if (typeof e._burnLeft === 'number' && e._burnLeft > 0) {
          e._burnLeft -= dt;
          const dps = (typeof e._burnDps === 'number' ? e._burnDps : 0);
          if (dps > 0) {
            e.hp -= dps * dt;
            e._lastHitAt = state.time;
          }
          if (e._burnLeft <= 0) {
            e._burnLeft = 0;
            e._burnDps = 0;
          }
        }
        if (typeof e._frostLeft === 'number' && e._frostLeft > 0) {
          e._frostLeft -= dt;
          if (e._frostLeft <= 0) { e._frostLeft = 0; e._frostLv = 0; }
        }
        if (typeof e._curseLeft === 'number' && e._curseLeft > 0) {
          e._curseLeft -= dt;
          if (e._curseLeft <= 0) { e._curseLeft = 0; e._curseLv = 0; }
        }
      }
    } catch {}

    if (e.update) {
      // Defensive: a single enemy script error must not freeze the whole run.
      // If an enemy update throws, remove that enemy and continue.
      try {
        e.update(e, dt, state);
      } catch (err) {
        try { console.error("Enemy update error:", e && (e.type || e.id), err); } catch {}
        enemies.splice(i, 1);
        continue;
      }
    }

    // Keep enemies outside of the Hub (rounded square).
    if (e && !e._ignoreHub) {
      const er = (e.radius || 20);
      const pad = er + HUB_PAD;
      const ex = (e.x || 0);
      const ey = (e.y || 0);
      if (isPointInHub(ex, ey, pad)) {
        // Project to the nearest point on the padded rounded-square boundary.
        const half = HUB_HALF + pad;
        const cr = Math.min(HUB_CORNER_R + pad, half);
        const inner = Math.max(half - cr, 0);

        const sx = ex < 0 ? -1 : 1;
        const sy = ey < 0 ? -1 : 1;
        const ax = Math.abs(ex);
        const ay = Math.abs(ey);

        let nx = ex;
        let ny = ey;

        // Corner region
        if (ax > inner && ay > inner) {
          const cx = sx * inner;
          const cy = sy * inner;
          let vx = ex - cx;
          let vy = ey - cy;
          const len = Math.hypot(vx, vy) || 0.0001;
          vx /= len;
          vy /= len;
          nx = cx + vx * cr;
          ny = cy + vy * cr;
        } else {
          // Side region: push to the closest side.
          const dx = half - ax;
          const dy = half - ay;
          if (dx <= dy) nx = sx * half;
          else ny = sy * half;
        }

        e.x = nx;
        e.y = ny;
      }
    }

    if (e.hp <= 0 || e._remove) {
      // Light affinity: heal the killer on kill.
      try {
        const killerId = e && e._lastHitBy != null ? String(e._lastHitBy) : "";
        if (killerId) {
          const killer = getPlayerById(state, killerId);
          const lv = killer && killer.runPassives ? (killer.runPassives.affLight | 0) : 0;
          if (killer && lv > 0 && killer.hp > 0) {
            const heal = 2 + lv * 2;
            killer.hp = Math.min(killer.maxHP || 999999, killer.hp + heal);
            if (Array.isArray(state.floatingTexts)) {
              state.floatingTexts.push({ x: killer.x, y: killer.y - 42, text: `+${heal} HP`, time: 0.9 });
            }
          }
        }
      } catch {}
      if (!e._noScore) {
        const baseScore = e.scoreValue || 10;
        const scoreMult = state.meta?.scoreMult || 1;
        state.runScore += baseScore * scoreMult;
      }
      if (e.onDeath) {
        e.onDeath(e, state);
      }
      if (state.spawnSystem && typeof state.spawnSystem.onEnemyRemoved === "function") {
        state.spawnSystem.onEnemyRemoved(e, state);
      }
      enemies.splice(i, 1);
    }
  }
}

function updateProjectiles(state, dt) {
  const { projectiles, rockets, enemies } = state;

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const b = projectiles[i];
    if (b && b.id == null) {
      b.id = (state._nextProjectileId = (state._nextProjectileId || 0) + 1);
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.travel += b.speed * dt;

    // Fireball: explodes on max range.
    if (b.type === 'fireball' && b.travel >= b.range) {
      try { explodeFireball(b, state); } catch {}
      projectiles.splice(i, 1);
      continue;
    }

    if (b.travel >= b.range) {
      projectiles.splice(i, 1);
      continue;
    }

    let hit = false;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      const dx = e.x - b.x;
      const dy = e.y - b.y;
      const r = (e.radius || 20) + (b.radius || 4);
      if (dx * dx + dy * dy <= r * r) {
        // Fireball: explode instead of direct single-target hit.
        if (b.type === 'fireball') {
          hit = true;
          break;
        }
        const owner = getPlayerById(state, b.ownerId) || state.player;
        let dmg = applyCritToDamage(owner, b.damage);

        // Biome marks (Ice/Dark) increase damage vs marked targets.
        try {
          const rp = owner && owner.runPassives ? owner.runPassives : null;
          const iceLv = rp ? (rp.affIce | 0) : 0;
          const darkLv = rp ? (rp.affDark | 0) : 0;
          if (iceLv > 0 && (e._frostLeft || 0) > 0) dmg *= (1 + iceLv * 0.07);
          if (darkLv > 0 && (e._curseLeft || 0) > 0) dmg *= (1 + darkLv * 0.06);
        } catch {}

        e.hp -= dmg;
        applyLifeSteal(owner, dmg);
        owner._lastCombatAt = state.time;
        // Targeting 2.0 memory + aggro
        owner.lastPlayerTarget = e;
        owner.lastPlayerTargetAt = state.time;
        e._lastHitAt = state.time;
        e._lastHitBy = owner.id || "local";
        e.aggroed = true;

        // Apply biome on-hit effects (Fire burn, Ice/Dark mark, Electric zap).
        try {
          const rp = owner && owner.runPassives ? owner.runPassives : null;
          const fireLv = rp ? (rp.affFire | 0) : 0;
          const iceLv = rp ? (rp.affIce | 0) : 0;
          const darkLv = rp ? (rp.affDark | 0) : 0;
          const elecLv = rp ? (rp.affElectric | 0) : 0;

          if (fireLv > 0) {
            const dur = 1.4 + fireLv * 0.35;
            const dps = Math.max((e._burnDps || 0), 2.2 + fireLv * 1.35);
            e._burnLeft = Math.max((e._burnLeft || 0), dur);
            e._burnDps = dps;
          }

          if (iceLv > 0) {
            e._frostLeft = Math.max((e._frostLeft || 0), 2.0);
            e._frostLv = Math.max((e._frostLv || 0), iceLv);
          }

          if (darkLv > 0) {
            e._curseLeft = Math.max((e._curseLeft || 0), 2.4);
            e._curseLv = Math.max((e._curseLv || 0), darkLv);
          }

          if (elecLv > 0 && state && Array.isArray(state.enemies)) {
            const chance = Math.min(0.30, 0.10 + elecLv * 0.04);
            if (Math.random() < chance) {
              const rZap = 160 + elecLv * 24;
              const r2Zap = rZap * rZap;
              let best = null;
              let bestD2 = Infinity;
              for (const ee of state.enemies) {
                if (!ee || ee === e || ee.hp <= 0) continue;
                const dx2 = ee.x - e.x;
                const dy2 = ee.y - e.y;
                const d2 = dx2 * dx2 + dy2 * dy2;
                if (d2 <= r2Zap && d2 < bestD2) { best = ee; bestD2 = d2; }
              }
              if (best) {
                const zapDmg = dmg * (0.22 + elecLv * 0.05);
                best.hp -= zapDmg;
                best._lastHitAt = state.time;
                best._lastHitBy = owner.id || "local";
                if (Array.isArray(state.floatingTexts)) {
                  state.floatingTexts.push({ x: best.x, y: best.y - 22, text: "ZAP", time: 0.5 });
                }
              }
            }
          }
        } catch {}
        hit = true;
        break;
      }
    }

    if (hit) {
      if (b.type === 'fireball') {
        try { explodeFireball(b, state); } catch {}
      }
      projectiles.splice(i, 1);
    }
  }

  for (let i = rockets.length - 1; i >= 0; i--) {
    const rkt = rockets[i];
    if (rkt && rkt.id == null) {
      rkt.id = (state._nextRocketId = (state._nextRocketId || 0) + 1);
    }
    rkt.x += rkt.vx * dt;
    rkt.y += rkt.vy * dt;
    rkt.travel += rkt.speed * dt;

    let explode = false;

    if (rkt.travel >= rkt.range) {
      explode = true;
    } else {
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        const dx = e.x - rkt.x;
        const dy = e.y - rkt.y;
        const rr = (e.radius || 24) + (rkt.radius || 6);
        if (dx * dx + dy * dy <= rr * rr) {
          explode = true;
          break;
        }
      }
    }

    if (explode) {
      explodeRocket(rkt, state);
      rockets.splice(i, 1);
    }
  }
}

function explodeRocket(rocket, state) {
  const { enemies, floatingTexts } = state;
  const r2 = rocket.splashRadius * rocket.splashRadius;

  const owner = getPlayerById(state, rocket.ownerId) || state.player;

  for (const e of enemies) {
    const dx = e.x - rocket.x;
    const dy = e.y - rocket.y;
    if (dx * dx + dy * dy <= r2) {
      let dmg = applyCritToDamage(owner, rocket.damage);
      try {
        const rp = owner && owner.runPassives ? owner.runPassives : null;
        const iceLv = rp ? (rp.affIce | 0) : 0;
        const darkLv = rp ? (rp.affDark | 0) : 0;
        if (iceLv > 0 && (e._frostLeft || 0) > 0) dmg *= (1 + iceLv * 0.07);
        if (darkLv > 0 && (e._curseLeft || 0) > 0) dmg *= (1 + darkLv * 0.06);
      } catch {}
      e.hp -= dmg;
      applyLifeSteal(owner, dmg);
      owner._lastCombatAt = state.time;
      // Targeting 2.0 memory + aggro
      owner.lastPlayerTarget = e;
      owner.lastPlayerTargetAt = state.time;
      e._lastHitAt = state.time;
      e._lastHitBy = owner.id || "local";
      e.aggroed = true;

      // Rocket hit marks/burn in AoE too.
      try {
        const rp = owner && owner.runPassives ? owner.runPassives : null;
        const fireLv = rp ? (rp.affFire | 0) : 0;
        const iceLv = rp ? (rp.affIce | 0) : 0;
        const darkLv = rp ? (rp.affDark | 0) : 0;
        if (fireLv > 0) {
          const dur = 1.2 + fireLv * 0.35;
          const dps = Math.max((e._burnDps || 0), 2.0 + fireLv * 1.25);
          e._burnLeft = Math.max((e._burnLeft || 0), dur);
          e._burnDps = dps;
        }
        if (iceLv > 0) {
          e._frostLeft = Math.max((e._frostLeft || 0), 1.8);
          e._frostLv = Math.max((e._frostLv || 0), iceLv);
        }
        if (darkLv > 0) {
          e._curseLeft = Math.max((e._curseLeft || 0), 2.2);
          e._curseLv = Math.max((e._curseLv || 0), darkLv);
        }
      } catch {}
    }
  }

  floatingTexts.push({
    x: rocket.x,
    y: rocket.y,
    text: "BOOM",
    time: 0.6,
  });
}

function updateXPOrbs(state, dt) {
  const { xpOrbs } = state;
  const players = state.players && state.players.length ? state.players : (state.player ? [state.player] : []);

  for (let i = xpOrbs.length - 1; i >= 0; i--) {
    const orb = xpOrbs[i];
    orb.age = (orb.age || 0) + dt;

    // TTL cleanup (mainly for ambient scattered orbs)
    if (orb.ttl != null && orb.age >= orb.ttl) {
      xpOrbs.splice(i, 1);
      continue;
    }

    // Visual bob should not drift the actual orb position over time.
    if (orb.baseY == null) orb.baseY = orb.y;
    orb.y = orb.baseY + Math.sin(orb.age * 5) * 2;

    // Small pickup delay so newly spawned orbs don't get insta-collected.
    const pickupBlocked = (orb.spawnDelay != null) && (orb.age < orb.spawnDelay);

    for (const player of players) {
      if (pickupBlocked) continue;
      const dx = player.x - orb.x;
      const dy = player.y - orb.y;
      const baseRadius = (player.radius || 18) + (orb.radius || 8);
      const pickupBonus = (state.meta?.pickupBonusRadius || 0) + (player.runPickupBonusRadius || 0);
      const r = baseRadius + pickupBonus;

      if (dx * dx + dy * dy <= r * r) {
        const kind = orb.kind || (orb.coins ? "coin" : "xp");
        if (kind === "coin") {
          const amt = orb.coins || 1;
          // Coins are meta-currency (persistent) and should be credited to the collecting device.
          // Host is authoritative for pickups, so for joiners we send a targeted coinGain message.
          const online = !!(state.net && state.net.status === "connected" && state.net.roomCode);
          if (player === state.player && state.progression) {
            // Host/local device
            try { ensureShopMeta(state.progression); } catch {}
            state.progression.coins = Math.max(0, (state.progression.coins | 0) + (amt | 0));
            try { saveProgression(state.progression); } catch {}
            if (state.floatingTexts) {
              state.floatingTexts.push({ x: orb.x, y: orb.y, text: `+${amt}🪙`, time: 0.8 });
            }
          } else if (online && state.net && state.net.isHost && typeof state.net.sendCoinGain === "function") {
            // Joiner picked it up: notify that client so their local progression saves coins.
            try { state.net.sendCoinGain(String(player.id || ""), amt | 0); } catch {}
          }
          xpOrbs.splice(i, 1);
          break;
        }
        const baseXp = orb.xp || 10;
        const metaMult = (state.meta?.xpGainMult || 1) * (player.runXpGainMult || 1);
        const buffMult = 1 + (state.tempXpGainBoost || 0);
        const xpMultRaw = metaMult * buffMult;
        // Soft-cap XP gain to prevent upgrade spam / snowball.
        // Keeps early boosts meaningful but reduces extreme stacking.
        const xpMult = Math.min(3.0, 1 + (xpMultRaw - 1) * 0.55);
        if (typeof player.gainXP === "function") {
          player.gainXP(baseXp * xpMult, state);
        }
        xpOrbs.splice(i, 1);
        break;
      }
    }
  }
}
function updateFloatingTexts(state, dt) {
  const { floatingTexts } = state;

  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const t = floatingTexts[i];
    t.y -= 20 * dt;
    t.time -= dt;
    if (t.time <= 0) {
      floatingTexts.splice(i, 1);
    }
  }
}


function renderFloatingTexts(ctx, state) {
  var floatingTexts = state.floatingTexts;

  ctx.save();
  ctx.font = "18px sans-serif";
  ctx.textAlign = "center";

  for (var i = 0; i < floatingTexts.length; i++) {
    var t = floatingTexts[i];
    var alpha = t.time / 1.2;
    if (alpha < 0) alpha = 0;
    if (alpha > 1) alpha = 1;
    ctx.fillStyle = "rgba(255,255,255," + alpha.toFixed(2) + ")";
    ctx.fillText(t.text, t.x, t.y);
  }

  ctx.restore();
}
function updatePopups(state, dt) {
  const arr = state.popups;
  for (let i = arr.length - 1; i >= 0; i--) {
    arr[i].time -= dt;
    if (arr[i].time <= 0) {
      arr.splice(i, 1);
    }
  }
}


function renderWorldBackground(state, ctx) {
  // Pixel_GO: room-based background
  if (state && state.roomDirector) {
    try { renderRoomsBackground(ctx, state); } catch {}
    return;
  }

	  // World 2.0 background: readable radial zones.
	  // FX are intentionally OFF for clarity (no fog/patterns/glow).
	  const FX_OFF = true;
  const zoneBase = {
    0: "#0d3a1f", // Hub (safe green)
    1: "#0b101b", // Dust / outskirts
    2: "#0e1821", // Moss
    3: "#0d1426", // Crystals
    4: "#19121e", // Ash
    5: "#0d0b1f", // Space
    6: "#0a0714", // Anomaly (legacy Zone 6)
    7: "#070512", // Outer void
    8: "#05040f", // Deep void
    9: "#03030b", // Abyss (world edge)
  };

  const zoneTint = {
    0: "rgba(46, 210, 120, 0.20)",
    1: "rgba(210, 195, 130, 0.12)",
    2: "rgba(95, 210, 165, 0.12)",
    3: "rgba(120, 190, 255, 0.12)",
    4: "rgba(255, 120, 120, 0.10)",
    5: "rgba(210, 145, 255, 0.10)",
    6: "rgba(255, 80, 220, 0.08)",
    7: "rgba(120, 120, 255, 0.06)",
    8: "rgba(90, 90, 220, 0.05)",
    9: "rgba(70, 70, 200, 0.04)",
  };

  ctx.save();

  // ---------- helpers (lazy patterns) ----------
  const patterns = (state._bgPatterns ||= {});
  function ensurePattern(name) {
    if (patterns[name]) return patterns[name];
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const p = c.getContext("2d");
    if (!p) return null;

    // Clear
    p.clearRect(0, 0, c.width, c.height);

		// A few cheap procedural patterns per zone.
		// IMPORTANT: keep these SUBTLE. Background should never overpower gameplay.
		if (name === "hub") {
			// soft pollen dots (reduced density)
			p.fillStyle = "rgba(180,255,210,0.08)";
			for (let i = 0; i < 22; i++) {
        const x = (i * 73) % 256;
        const y = (i * 131) % 256;
        const r = 1 + ((i * 37) % 3);
        p.beginPath();
        p.arc(x, y, r, 0, Math.PI * 2);
        p.fill();
      }
    }

		if (name === "dust") {
			// speckles + faint streaks (reduced density)
			p.fillStyle = "rgba(220,200,140,0.07)";
			for (let i = 0; i < 35; i++) {
        const x = (i * 29) % 256;
        const y = (i * 97) % 256;
        p.fillRect(x, y, 1, 1);
      }
			p.strokeStyle = "rgba(220,200,140,0.04)";
      p.lineWidth = 1;
			for (let i = 0; i < 5; i++) {
        p.beginPath();
        p.moveTo(0, (i * 23) % 256);
        p.lineTo(256, (i * 23 + 70) % 256);
        p.stroke();
      }
    }

		if (name === "moss") {
			// soft blobs (reduced density)
			for (let i = 0; i < 8; i++) {
        const x = (i * 41) % 256;
        const y = (i * 83) % 256;
        const r = 16 + ((i * 13) % 18);
        const g = p.createRadialGradient(x, y, 0, x, y, r);
				g.addColorStop(0, "rgba(120,255,200,0.08)");
        g.addColorStop(1, "rgba(120,255,200,0.00)");
        p.fillStyle = g;
        p.beginPath();
        p.arc(x, y, r, 0, Math.PI * 2);
        p.fill();
      }
    }

		if (name === "crystal") {
			// shard lines (reduced density)
			p.strokeStyle = "rgba(150,220,255,0.08)";
      p.lineWidth = 1;
			for (let i = 0; i < 10; i++) {
        const x = (i * 47) % 256;
        const y = (i * 59) % 256;
        p.beginPath();
        p.moveTo(x, y);
        p.lineTo(x + 30, y - 18);
        p.stroke();
      }
    }

		if (name === "ash") {
			// smoky arcs (reduced density)
			p.strokeStyle = "rgba(255,150,150,0.06)";
			p.lineWidth = 2;
			for (let i = 0; i < 5; i++) {
        const x = (i * 61) % 256;
        const y = (i * 89) % 256;
        p.beginPath();
        p.arc(x, y, 22 + ((i * 7) % 16), 0, Math.PI);
        p.stroke();
      }
    }

		if (name === "space") {
			// star dust (reduced density)
			p.fillStyle = "rgba(235,225,255,0.10)";
			for (let i = 0; i < 24; i++) {
        const x = (i * 53) % 256;
        const y = (i * 101) % 256;
        const s = (i % 7 === 0) ? 2 : 1;
        p.fillRect(x, y, s, s);
      }
			p.fillStyle = "rgba(200,160,255,0.05)";
			for (let i = 0; i < 3; i++) {
        const x = (i * 97) % 256;
        const y = (i * 37) % 256;
        p.beginPath();
				p.arc(x, y, 16, 0, Math.PI * 2);
        p.fill();
      }
    }

		if (name === "anomaly") {
			// concentric waves (less busy)
			p.strokeStyle = "rgba(255,80,220,0.08)";
      p.lineWidth = 1;
			for (let r = 28; r < 256; r += 40) {
        p.beginPath();
        p.arc(128, 128, r, 0, Math.PI * 2);
        p.stroke();
      }
    }

    patterns[name] = ctx.createPattern(c, "repeat");
    return patterns[name];
  }

  function fillRing(innerR, outerR, style) {
    ctx.beginPath();
    ctx.arc(0, 0, outerR, 0, Math.PI * 2);
    ctx.arc(0, 0, innerR, 0, Math.PI * 2, true);
    ctx.fillStyle = style;
    ctx.fill("evenodd");
  }

  function clipRing(innerR, outerR) {
    ctx.beginPath();
    ctx.arc(0, 0, outerR, 0, Math.PI * 2);
    ctx.arc(0, 0, innerR, 0, Math.PI * 2, true);
    ctx.clip("evenodd");
  }

  // Hub (Zone 0) path: rounded square.
  function pathRoundedRect(x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, Math.min(w, h) * 0.5));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function pathHub() {
    const s = HUB_HALF * 2;
    pathRoundedRect(-HUB_HALF, -HUB_HALF, s, s, HUB_CORNER_R);
  }

  // ---------- visible bounds (world) ----------
  const cam = state.camera;
  const player = state.player;
  const playerZone = player ? (getZone(player.x, player.y) | 0) : 0;
  const zoom = cam?.zoom || 1;
  const halfW = (state.canvas?.width || 800) / (2 * zoom);
  const halfH = (state.canvas?.height || 600) / (2 * zoom);

  const viewMinX = player.x - halfW;
  const viewMaxX = player.x + halfW;
  const viewMinY = player.y - halfH;
  const viewMaxY = player.y + halfH;

  // Perf knobs: mobile joiners can be tight.
  const isJoiner = !!(state.net && state.net.roomCode && !state.net.isHost);
  const w = typeof window !== "undefined" ? (window.innerWidth || 0) : 0;
  const h = typeof window !== "undefined" ? (window.innerHeight || 0) : 0;
  const isSmallMobile = isJoiner && h > w && Math.max(w, h) < 900;

  // ---------- base fills (rings + square) ----------
  // Zone 9 outer square fill (world bounds)
  ctx.fillStyle = zoneBase[9];
  ctx.fillRect(-WORLD_SQUARE_HALF, -WORLD_SQUARE_HALF, WORLD_SQUARE_HALF * 2, WORLD_SQUARE_HALF * 2);

  // Zones 8 → 6 as nested squares (currently content-empty for 7–9, but visible progression)
  ctx.fillStyle = zoneBase[8];
  ctx.fillRect(-ZONE_RADII[8], -ZONE_RADII[8], ZONE_RADII[8] * 2, ZONE_RADII[8] * 2);

  ctx.fillStyle = zoneBase[7];
  ctx.fillRect(-ZONE_RADII[7], -ZONE_RADII[7], ZONE_RADII[7] * 2, ZONE_RADII[7] * 2);

  // Legacy Zone 6 square (keeps old corner space stable)
  ctx.fillStyle = zoneBase[6];
  ctx.fillRect(-ZONE6_SQUARE_HALF, -ZONE6_SQUARE_HALF, ZONE6_SQUARE_HALF * 2, ZONE6_SQUARE_HALF * 2);


  // Fill Zone 5 → Zone 1 as rings (even-odd)
  const r0 = ZONE_RADII[0];
  const r1 = ZONE_RADII[1];
  const r2 = ZONE_RADII[2];
  const r3 = ZONE_RADII[3];
  const r4 = ZONE_RADII[4];
  const r5 = ZONE_RADII[5];

	  // Gradient ring fills for depth (disabled when FX_OFF).
  function ringGradient(innerR, outerR, baseHex, tintRgba) {
	    if (FX_OFF) return baseHex;
    const g = ctx.createRadialGradient(0, 0, innerR, 0, 0, outerR);
    g.addColorStop(0, baseHex);
    g.addColorStop(0.55, baseHex);
    g.addColorStop(1, tintRgba);
    return g;
  }

  fillRing(r4, r5, ringGradient(r4, r5, zoneBase[5], zoneTint[5]));
  fillRing(r3, r4, ringGradient(r3, r4, zoneBase[4], zoneTint[4]));
  fillRing(r2, r3, ringGradient(r2, r3, zoneBase[3], zoneTint[3]));
  fillRing(r1, r2, ringGradient(r1, r2, zoneBase[2], zoneTint[2]));
  fillRing(r0, r1, ringGradient(r0, r1, zoneBase[1], zoneTint[1]));

	  // Hub (rounded square)
  pathHub();
	  if (FX_OFF) {
	    ctx.fillStyle = zoneBase[0];
	  } else {
      // Use diagonal as gradient radius so corners don't look flat.
      const gr = Math.hypot(HUB_HALF, HUB_HALF);
	    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, gr);
	    g.addColorStop(0, "#135a30");
	    g.addColorStop(1, zoneBase[0]);
	    ctx.fillStyle = g;
	  }
  ctx.fill();

	  // ---------- biome textures (disabled) ----------
	  // Draw subtle, repeating patterns clipped to each ring. Cheap and world-anchored.
  function fillPatternInRing(innerR, outerR, patName, alpha) {
    const pat = ensurePattern(patName);
    if (!pat) return;
    ctx.save();
    clipRing(innerR, outerR);
    ctx.globalAlpha = alpha;
    // Nudge so patterns don't perfectly align between zones.
    ctx.translate((patName.length * 37) % 53, (patName.length * 91) % 67);
    ctx.fillStyle = pat;
    ctx.fillRect(viewMinX - 400, viewMinY - 400, (viewMaxX - viewMinX) + 800, (viewMaxY - viewMinY) + 800);
    ctx.restore();
  }

  function fillPatternInHub(patName, alpha) {
    const pat = ensurePattern(patName);
    if (!pat) return;
    ctx.save();
    pathHub();
    ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.translate((patName.length * 37) % 53, (patName.length * 91) % 67);
    ctx.fillStyle = pat;
    ctx.fillRect(viewMinX - 400, viewMinY - 400, (viewMaxX - viewMinX) + 800, (viewMaxY - viewMinY) + 800);
    ctx.restore();
  }

		if (!FX_OFF) {
		  // Patterns were intentionally reduced: too many FX makes gameplay unclear.
		  const patAlpha = isSmallMobile ? 0.18 : 0.28;
		  fillPatternInHub("hub", 0.30 * patAlpha);
		  fillPatternInRing(r0, r1, "dust", 0.32 * patAlpha);
		  fillPatternInRing(r1, r2, "moss", 0.35 * patAlpha);
		  fillPatternInRing(r2, r3, "crystal", 0.30 * patAlpha);
		  fillPatternInRing(r3, r4, "ash", 0.26 * patAlpha);
		  fillPatternInRing(r4, r5, "space", 0.30 * patAlpha);
		  // Zone 6 square: anomaly pattern (not clipped to a ring).
		  {
		    const pat = ensurePattern("anomaly");
		    if (pat) {
		      ctx.save();
					ctx.globalAlpha = isSmallMobile ? 0.05 : 0.07;
		      ctx.fillStyle = pat;
		      ctx.fillRect(viewMinX - 500, viewMinY - 500, (viewMaxX - viewMinX) + 1000, (viewMaxY - viewMinY) + 1000);
		      ctx.restore();
		    }
		  }
		}

  // ---------- parallax fog (combo 2) ----------
  // Draw two sparse fog layers that move slower than the world.
  function hash2(ix, iy, seed) {
    // cheap integer hash -> [0,1)
    let x = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
    x = (x ^ (x >>> 13)) | 0;
    x = (x * 1274126177) | 0;
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  }

  function drawFogLayer(factor, cell, alpha, color) {
    const minX = Math.floor(viewMinX / cell) * cell;
    const maxX = Math.floor(viewMaxX / cell) * cell;
    const minY = Math.floor(viewMinY / cell) * cell;
    const maxY = Math.floor(viewMaxY / cell) * cell;

    ctx.save();
    // Parallax transform around player.
    ctx.translate(player.x, player.y);
    ctx.scale(factor, factor);
    ctx.translate(-player.x, -player.y);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;

    const t = state.time || 0;
    const animX = (t * 8) % cell;
    const animY = (t * 6) % cell;

		const step = isSmallMobile ? 3 : 2;
    for (let y = minY; y <= maxY; y += cell * step) {
      for (let x = minX; x <= maxX; x += cell * step) {
        const r = hash2((x / cell) | 0, (y / cell) | 0, (factor * 100) | 0);
				// higher threshold => fewer blobs
				if (r < 0.82) continue;
        const ox = (hash2((x / cell) | 0, (y / cell) | 0, 11) - 0.5) * cell + animX;
        const oy = (hash2((x / cell) | 0, (y / cell) | 0, 17) - 0.5) * cell + animY;
        const rad = (0.22 + r * 0.38) * cell;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

	  // far fog (disabled)
		if (!FX_OFF) {
			// Keep only ONE subtle layer; two layers felt too "effect-heavy".
			drawFogLayer(0.28, 720, isSmallMobile ? 0.018 : 0.026, "rgba(255,255,255,0.16)");
		}

	// NOTE: Removed the world grid overlay — it added visual noise.

// Clockface overlay (12-hour compass grid)
// - 12 o'clock = up on screen
// - ray density increases with zone: Zone0=12, Zone1=24, Zone2=48, ...
// - rays are clipped per-zone band, so you can see next-zone density before entering
{
  const zPlayer = playerZone;

  // In Hub: do not render clockface rays (clean lobby feel).
  if (zPlayer !== 0) {
    // View bounds (world-space) in this background pass
    const viewMaxR = Math.max(
      Math.hypot(viewMinX, viewMinY),
      Math.hypot(viewMinX, viewMaxY),
      Math.hypot(viewMaxX, viewMinY),
      Math.hypot(viewMaxX, viewMaxY)
    ) + 200;

    // Min distance from origin to the view rectangle (proper, not corners)
    const dx0 = (viewMinX <= 0 && 0 <= viewMaxX) ? 0 : Math.min(Math.abs(viewMinX), Math.abs(viewMaxX));
    const dy0 = (viewMinY <= 0 && 0 <= viewMaxY) ? 0 : Math.min(Math.abs(viewMinY), Math.abs(viewMaxY));
    const viewMinR = Math.hypot(dx0, dy0);

    // Square-metric visibility (for square zones)
    const viewMaxA = Math.max(
      Math.max(Math.abs(viewMinX), Math.abs(viewMinY)),
      Math.max(Math.abs(viewMinX), Math.abs(viewMaxY)),
      Math.max(Math.abs(viewMaxX), Math.abs(viewMinY)),
      Math.max(Math.abs(viewMaxX), Math.abs(viewMaxY))
    ) + 200;
    const viewMinA = Math.max(dx0, dy0);

    const maxRays = isSmallMobile ? 384 : 768;
    const baseAlpha0 = isSmallMobile ? 0.05 : 0.07;
    const desiredRaysForZone = (z) => 12 * Math.pow(2, Math.max(0, (z | 0) - 1)); // Zone1=12, Zone2=24...
// Ray start for Zone 1: exact intersection with Hub contour (rounded-square),
// so rays visibly "exit" the hub outline instead of starting from a circle.
function hubRayT(dx, dy) {
  // Normalize just in case.
  const m = Math.hypot(dx, dy);
  if (m <= 1e-6) return HUB_HALF;
  dx /= m; dy /= m;

  let lo = 0;
  let hi = HUB_HALF * 3; // enough to be outside even on diagonals
  // Ensure hi is outside hub.
  let guard = 0;
  while (guard++ < 10 && isPointInHub(dx * hi, dy * hi, 0)) hi *= 1.4;

  // Binary search boundary.
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) * 0.5;
    if (isPointInHub(dx * mid, dy * mid, 0)) lo = mid;
    else hi = mid;
  }
  return hi;
}



    function drawBandRays(desiredRays, getBandT, alphaBoost = 1.0) {
      // Use a step if desired rays are too dense; keeps the "increasing density" feel without killing perf.
      const step = Math.max(1, Math.ceil(desiredRays / maxRays));
      const effective = Math.max(12, Math.floor(desiredRays / step));

      // Reduce alpha as density rises so it doesn't turn into white noise.
      const alpha = (baseAlpha0 * Math.sqrt(12 / effective)) * alphaBoost;

      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,1)";
      ctx.lineCap = "butt";
      ctx.lineWidth = 1.0 / Math.max(zoom, 0.0001);

      // Minor rays
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      for (let i = 0; i < desiredRays; i += step) {
        const a = (i * Math.PI * 2) / desiredRays;
        // 0 = 12 o'clock (up). Clockwise.
        const dx = Math.sin(a);
        const dy = -Math.cos(a);

        const band = getBandT(dx, dy);
        if (!band) continue;
        const t0 = band.t0;
        const t1 = band.t1;
        if (!(t1 > t0)) continue;

        ctx.moveTo(dx * t0, dy * t0);
        ctx.lineTo(dx * t1, dy * t1);
      }
      ctx.stroke();

      // Emphasize cardinal axes a bit (12/3/6/9)
      ctx.globalAlpha = Math.min(1, alpha * 1.8);
      ctx.lineWidth = 1.4 / Math.max(zoom, 0.0001);
      ctx.beginPath();
      for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
        const dx = Math.sin(a);
        const dy = -Math.cos(a);
        const band = getBandT(dx, dy);
        if (!band) continue;
        const t0 = band.t0;
        const t1 = band.t1;
        if (!(t1 > t0)) continue;
        ctx.moveTo(dx * t0, dy * t0);
        ctx.lineTo(dx * t1, dy * t1);
      }
      ctx.stroke();

      ctx.restore();
    }

    // Zones 1–5: circular bands (radii). Zone0 is Hub (skipped above).
for (let z = 1; z <= 5; z++) {
  const outerR = ZONE_RADII[z];

  // For visibility tests, use a conservative inner radius.
  // Zone 1 starts from the Hub contour (varies by angle), so we use HUB_HALF as a safe minimum.
  const innerVis = (z === 1) ? HUB_HALF : ZONE_RADII[z - 1];

  // If not visible in the current view, skip.
  if (viewMaxR < innerVis || viewMinR > outerR) continue;

  const desired = desiredRaysForZone(z); // Zone1=12, Zone2=24, ...
  if (z === 1) {
    // Start rays exactly on the Hub outline (rounded square).
    drawBandRays(desired, (dx, dy) => ({ t0: hubRayT(dx, dy), t1: Math.min(outerR, viewMaxR) }));
  } else {
    const innerR = ZONE_RADII[z - 1];
    drawBandRays(desired, () => ({ t0: innerR, t1: Math.min(outerR, viewMaxR) }));
  }
}

// Zone 6: between circle r5 and square half 30000 (legacy zone 6 space)
    {
      const innerR = ZONE_RADII[5];
      const outerHalf = ZONE_RADII[6];

      if (viewMaxR >= innerR && viewMinA <= outerHalf) {
        const desired = desiredRaysForZone(6);
        drawBandRays(desired, (dx, dy) => {
          const m = Math.max(Math.abs(dx), Math.abs(dy));
          if (m <= 0.000001) return null;
          const t1 = (outerHalf / m);
          const t0 = innerR;
          return { t0, t1: Math.min(t1, viewMaxR) };
        }, 0.9);
      }
    }

    // Zones 7–9: square shells (half-size bands)
    for (let z = 7; z <= 9; z++) {
      const innerHalf = ZONE_RADII[z - 1];
      const outerHalf = ZONE_RADII[z];

      if (viewMaxA < innerHalf || viewMinA > outerHalf) continue;

      const desired = desiredRaysForZone(z);
      drawBandRays(desired, (dx, dy) => {
        const m = Math.max(Math.abs(dx), Math.abs(dy));
        if (m <= 0.000001) return null;
        const t0 = (innerHalf / m);
        const t1 = (outerHalf / m);
        return { t0, t1: Math.min(t1, viewMaxR) };
      }, 0.85);
    }
  }
}


		// Ring borders (no glow)
		ctx.lineWidth = 1.5;
		ctx.strokeStyle = "rgba(255,255,255,0.14)";
	  ctx.beginPath();
	  for (const rr of [r1, r2, r3, r4, r5]) {
	    ctx.moveTo(rr, 0);
	    ctx.arc(0, 0, rr, 0, Math.PI * 2);
	  }
	  ctx.stroke();

		// Hub border (rounded square)
		if (playerZone === 0) {
			// In Hub: make the contour crisp and easy to read.
			ctx.strokeStyle = "rgba(255,255,255,0.34)";
			ctx.lineWidth = 3.0;
			pathHub();
			ctx.stroke();
			ctx.strokeStyle = "rgba(255,255,255,0.22)";
			ctx.lineWidth = 1.6;
			pathHub();
			ctx.stroke();
		} else {
			ctx.strokeStyle = "rgba(255,255,255,0.16)";
			ctx.lineWidth = 1.6;
			pathHub();
			ctx.stroke();
		}

	// Emphasize outer square border (reduced)
	ctx.strokeStyle = "rgba(255,255,255,0.10)";
	ctx.lineWidth = 1.5;
  ctx.strokeRect(-ZONE6_SQUARE_HALF, -ZONE6_SQUARE_HALF, ZONE6_SQUARE_HALF * 2, ZONE6_SQUARE_HALF * 2);

  ctx.restore();
}

function renderEnemies(state, ctx) {
  const isJoiner = !!(state.net && state.net.roomCode && !state.net.isHost);
  const w = typeof window !== "undefined" ? (window.innerWidth || 0) : 0;
  const h = typeof window !== "undefined" ? (window.innerHeight || 0) : 0;
  const isSmallMobile = isJoiner && h > w && Math.max(w, h) < 900;

  if (isSmallMobile) {
    // Mobile joiners: keep logic identical, but avoid "square" fallback visuals.
    // If a net-proxy enemy has a renderer, use it; otherwise draw a simple circle.
    for (const e of state.enemies) {
      if (!e) continue;
      if (typeof e.render === "function") {
        e.render(e, ctx);
        continue;
      }
      ctx.save();
      ctx.beginPath();
      let col = "#ff5f6f";
      if (e.isElite) col = "#ffdd57";
      if (e.kind === "zoneBoss") col = "#9b5bff";
      if (e.kind === "roamingBoss") col = "#ff3cbe";
      if (e.kind === "resurrectionGuardian") col = "#ffdd44";
      if (e.kind === "zone6SuperBoss") col = "#1be7ff";
      ctx.fillStyle = col;
      ctx.arc(e.x, e.y, e.radius || 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    return;
  }

  for (const e of state.enemies) {
    if (e && e.render) e.render(e, ctx);
  }
}

function renderSkillFx(state, ctx) {
  if (!state || !ctx) return;
  const bhs = Array.isArray(state.blackholes) ? state.blackholes : [];
  const iws = Array.isArray(state.iceWalls) ? state.iceWalls : [];
  const hps = Array.isArray(state.healPulses) ? state.healPulses : [];
  const exs = Array.isArray(state._explosions) ? state._explosions : [];
  if (!bhs.length && !iws.length && !hps.length && !exs.length) return;

  ctx.save();

  // Blackholes (draw behind enemies)
  for (const b of bhs) {
    const r = Math.max(10, b.r || 0);
    const t = Math.max(0, Math.min(1, (b.t || 0) / 3.0));
    // Outer glow
    ctx.beginPath();
    ctx.fillStyle = `rgba(165,100,255,${0.10 + 0.18 * t})`;
    ctx.arc(b.x, b.y, r * 1.15, 0, Math.PI * 2);
    ctx.fill();
    // Core
    ctx.beginPath();
    ctx.fillStyle = "rgba(8,10,14,0.82)";
    ctx.arc(b.x, b.y, r * 0.62, 0, Math.PI * 2);
    ctx.fill();
    // Swirl ring
    ctx.beginPath();
    ctx.strokeStyle = `rgba(210,160,255,${0.35 + 0.25 * t})`;
    ctx.lineWidth = 2.5;
    const a0 = (state.time || 0) * 2.0;
    ctx.arc(b.x, b.y, r * 0.88, a0, a0 + Math.PI * 1.35);
    ctx.stroke();
  }

  // Ice walls
  for (const w of iws) {
    const len = Math.max(40, w.len || 0);
    const thick = Math.max(8, w.thick || 0);
    const ca = Math.cos(w.a || 0);
    const sa = Math.sin(w.a || 0);
    const x1 = w.x - ca * len * 0.5;
    const y1 = w.y - sa * len * 0.5;
    const x2 = w.x + ca * len * 0.5;
    const y2 = w.y + sa * len * 0.5;
    // Glow
    ctx.beginPath();
    ctx.strokeStyle = "rgba(120,220,255,0.25)";
    ctx.lineWidth = thick * 0.75;
    ctx.lineCap = "round";
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    // Core shards
    ctx.beginPath();
    ctx.strokeStyle = "rgba(200,250,255,0.85)";
    ctx.lineWidth = Math.max(2, thick * 0.22);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Heal pulses
  for (const h of hps) {
    const base = Math.max(30, h.r || 0);
    const p = 1 - Math.max(0, Math.min(1, (h.t || 0) / 0.55));
    const rr = base * (0.55 + p * 0.55);
    ctx.beginPath();
    ctx.strokeStyle = `rgba(120,255,210,${0.55 * (1 - p)})`;
    ctx.lineWidth = 3.5;
    ctx.arc(h.x, h.y, rr, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Explosions (fireball)
  for (const ex of exs) {
    const p = 1 - Math.max(0, Math.min(1, (ex.t || 0) / 0.35));
    const rr = (ex.r || 0) * (0.65 + p * 0.55);
    ctx.beginPath();
    ctx.strokeStyle = `rgba(255,120,60,${0.55 * (1 - p)})`;
    ctx.lineWidth = 4;
    ctx.arc(ex.x, ex.y, rr, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function renderSummons(state, ctx) {
  const summons = (state && Array.isArray(state.summons)) ? state.summons : [];
  if (!summons.length) return;

  for (const s of summons) {
    if (!s || !s.isSummon || s.hp <= 0) continue;

    // Body
    ctx.save();
    const r = s.radius || 18;

    ctx.beginPath();
    ctx.fillStyle = "rgba(90,200,255,0.60)";
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();

    // Inner core
    ctx.beginPath();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.arc(s.x - r * 0.18, s.y - r * 0.18, Math.max(3, r * 0.35), 0, Math.PI * 2);
    ctx.fill();

    // Outline
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 2;
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.stroke();

    // HP bar
    const maxHp = s.maxHp || 1;
    const hp = s.hp || 0;
    const ratio = Math.max(0, Math.min(1, hp / maxHp));
    const w = r * 2.2;
    const h = 4;
    const x = s.x - w / 2;
    const y = s.y - r - 10;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(80,255,160,0.85)";
    ctx.fillRect(x, y, w * ratio, h);

    ctx.restore();
  }
}

function renderProjectiles(state, ctx) {
  const { projectiles, rockets, _laserVisual, _lightningVisual, _laserVisuals, _lightningVisuals } = state;

  const isJoiner = !!(state.net && state.net.roomCode && !state.net.isHost);
  const w = typeof window !== "undefined" ? (window.innerWidth || 0) : 0;
  const h = typeof window !== "undefined" ? (window.innerHeight || 0) : 0;
  const isSmallMobile = isJoiner && h > w && Math.max(w, h) < 900;

  ctx.save();

  // On small mobile joiners, rendering thousands of arcs can stutter.
  // Use cheaper rectangles + cap the count.
  if (isSmallMobile) {
    const maxBullets = 220;
    const stepB = projectiles.length > maxBullets ? Math.ceil(projectiles.length / maxBullets) : 1;
    // Bullets + fireballs (rect fallback)
    for (let i = 0; i < projectiles.length; i += stepB) {
      const b = projectiles[i];
      if (!b) continue;
      // Joiners on small mobiles use rectangles for performance; keep bullets readable.
      const r = (b.radius || 4);
      const isFb = (b.type === 'fireball');
      const s = isFb ? Math.max(6, Math.min(14, r * 2.2)) : Math.max(3, Math.min(8, r * 1.8));
      ctx.fillStyle = isFb ? "rgba(255,120,60,0.95)" : "#f4e9a3";
      ctx.fillRect(b.x - s * 0.5, b.y - s * 0.5, s, s);
    }
      const maxRockets = 80;
  const stepR = rockets.length > maxRockets ? Math.ceil(rockets.length / maxRockets) : 1;

  // Bombs (grey) + Rockets (orange)
  ctx.fillStyle = "#cfcfcf";
  for (let i = 0; i < rockets.length; i += stepR) {
    const rkt = rockets[i];
    if (!rkt || rkt.type !== "bomb") continue;
    ctx.fillRect(rkt.x - 2, rkt.y - 2, 4, 4);
  }
  ctx.fillStyle = "#ff7a3c";
  for (let i = 0; i < rockets.length; i += stepR) {
    const rkt = rockets[i];
    if (!rkt || rkt.type === "bomb") continue;
    ctx.fillRect(rkt.x - 2, rkt.y - 2, 4, 4);
  }
} else {
    for (const b of projectiles) {
      if (!b) continue;
      const isFb = (b.type === 'fireball');
      if (isFb) {
        const r = Math.max(6, (b.radius || 10));
        ctx.beginPath();
        ctx.fillStyle = "rgba(255,120,60,0.92)";
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,220,170,0.55)";
        ctx.lineWidth = 2;
        ctx.arc(b.x, b.y, r * 0.7, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.fillStyle = "#f4e9a3";
        ctx.arc(b.x, b.y, b.radius || 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Bombs (grey)
ctx.fillStyle = "#cfcfcf";
for (const rkt of rockets) {
  if (!rkt || rkt.type !== "bomb") continue;
  ctx.beginPath();
  ctx.arc(rkt.x, rkt.y, rkt.radius || 7, 0, Math.PI * 2);
  ctx.fill();
}

// Rockets (orange)
ctx.fillStyle = "#ff7a3c";
for (const rkt of rockets) {
  if (!rkt || rkt.type === "bomb") continue;
  ctx.beginPath();
  ctx.arc(rkt.x, rkt.y, rkt.radius || 6, 0, Math.PI * 2);
  ctx.fill();
}
  }

  // Laser visuals (supports multiple players in co-op)
  const laserList = [];
  if (_laserVisuals && typeof _laserVisuals.forEach === "function") {
    _laserVisuals.forEach((v) => {
      if (v) laserList.push(v);
    });
  } else if (_laserVisual) {
    laserList.push(_laserVisual);
  }
  for (const v of laserList) {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(173,246,255,0.9)";
    ctx.lineWidth = 6;
    ctx.moveTo(v.x1, v.y1);
    ctx.lineTo(v.x2, v.y2);
    ctx.stroke();
  }

  // Lightning visuals (supports multiple players in co-op)
  const lightningList = [];
  if (_lightningVisuals && typeof _lightningVisuals.forEach === "function") {
    _lightningVisuals.forEach((pts) => {
      if (pts && pts.length > 1) lightningList.push(pts);
    });
  } else if (_lightningVisual && _lightningVisual.length > 1) {
    lightningList.push(_lightningVisual);
  }
  for (const pts of lightningList) {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(220,245,255,0.95)";
    ctx.lineWidth = 3;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }

  ctx.restore();
}

function renderXPOrbs(state, ctx) {
  ctx.save();
  for (const orb of state.xpOrbs) {
    const kind = orb.kind || (orb.coins ? "coin" : "xp");
    ctx.fillStyle = (kind === "coin") ? "#ffd34a" : "#5af2ff";
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, orb.radius || 8, 0, Math.PI * 2);
    ctx.fill();
    if (kind === "coin") {
      // small inner highlight
        ctx.fillStyle = "rgba(255,255,255,0.70)";
      ctx.beginPath();
      ctx.arc(orb.x - 2, orb.y - 2, Math.max(1, (orb.radius || 8) * 0.25), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function renderPlayers(state, ctx) {
  const players = state.players && state.players.length ? state.players : (state.player ? [state.player] : []);

  // === Skill visuals (always-on skills) ===
  // Render behind the player sprite for readability.
  ctx.save();
  const now = state.time || 0;

  // Electric Zone ring (jagged lightning circle)
  function _ezHash32(str) {
    // FNV-1a 32-bit
    let h = 2166136261;
    const s = String(str ?? "");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function _ezNoise(a, t, seed) {
    // Cheap smooth-ish noise in [-1..1]
    const s = seed * 0.000001;
    const n1 = Math.sin(a * 7.0 + t * 2.6 + s * 11.0);
    const n2 = Math.sin(a * 13.0 - t * 1.9 + s * 7.0);
    const n3 = Math.sin(a * 23.0 + t * 3.4 + s * 3.0);
    return (n1 * 0.50 + n2 * 0.32 + n3 * 0.18);
  }

  function _drawElectricZoneRing(p, rr, lvl) {
    const seed = _ezHash32(p.id || p.name || "p");
    const t = now;
    const N = 72;
    const amp = Math.max(6, rr * 0.045) * (0.85 + lvl * 0.03);
    const wob = 0.65 + 0.35 * Math.sin(t * 6.5 + seed * 0.001);

    // Build jagged ring points
    const pts = new Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const n = _ezNoise(a, t, seed);
      const r = rr + n * amp;
      pts[i] = {
        x: p.x + Math.cos(a) * r,
        y: p.y + Math.sin(a) * r,
      };
    }

    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // Outer glow
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i <= N; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = `rgba(80,220,255,${0.10 + wob * 0.08})`;
    ctx.lineWidth = 10;
    ctx.stroke();

    // Main lightning ring (white-ish)
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i <= N; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = `rgba(245,255,255,${0.35 + wob * 0.35})`;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Secondary jitter pass for "electric" feel + tiny gaps
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < N; i++) {
      if (((i + (seed & 7)) % 9) === 0) { started = false; continue; }
      const a = (i / N) * Math.PI * 2;
      const n = _ezNoise(a + 0.7, t * 1.2, seed ^ 0x9e3779b9);
      const r = rr + n * (amp * 0.65);
      const x = p.x + Math.cos(a) * r;
      const y = p.y + Math.sin(a) * r;
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(180,245,255,${0.18 + wob * 0.22})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Sparks / bursts on the ring (like the reference)
    const burstCount = 3;
    for (let k = 0; k < burstCount; k++) {
      const a = (seed * 0.0004 + k * 2.25 + t * 0.55) % (Math.PI * 2);
      const n = _ezNoise(a, t * 0.7, seed + k * 991);
      const r = rr + n * (amp * 0.55);
      const cx = p.x + Math.cos(a) * r;
      const cy = p.y + Math.sin(a) * r;
      const rays = 7;
      const base = 16 + (k % 2) * 6;

      ctx.beginPath();
      for (let j = 0; j < rays; j++) {
        const aa = a + (j / rays) * Math.PI * 2 + Math.sin(t * 3.2 + j) * 0.08;
        const len = base + (10 + 10 * Math.abs(Math.sin(t * 2.1 + j + seed * 0.001))) * (0.6 + 0.4 * wob);
        const ex = cx + Math.cos(aa) * len;
        const ey = cy + Math.sin(aa) * len;
        ctx.moveTo(cx, cy);
        ctx.lineTo(ex, ey);
      }
      ctx.strokeStyle = `rgba(255,255,255,${0.40 + wob * 0.35})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.fillStyle = `rgba(180,245,255,${0.20 + wob * 0.25})`;
      ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  for (const p of players) {
    if (!p || p.hp <= 0) continue;
    const s = p.runSkills || {};

    const mR = p.metaRangeMult || 1;
    const rR = p.runRangeMult || 1;
    const rMult = mR * rR;

    // Electric Zone
    const ezLvl = (s.electricZone || 0) | 0;
    if (ezLvl > 0) {
      const rr = (140 + (ezLvl - 1) * 9) * rMult;
      _drawElectricZoneRing(p, rr, ezLvl);
    }

    // Energy Barrier (only when shield is up)
    const ebVis = p._energyBarrierVis;
    if (ebVis && typeof ebVis === "object" && Number.isFinite(ebVis.radius) && ebVis.radius > 0) {
      const rr = ebVis.radius;
      const maxS = Number(ebVis.maxShield || 0);
      const curS = Number(ebVis.shield || 0);
      const ratio = (maxS > 0) ? Math.max(0, Math.min(1, curS / maxS)) : 1;

      const pulse = 0.35 + 0.15 * Math.sin(now * 7.5);
      ctx.beginPath();
      ctx.fillStyle = `rgba(80,220,255,${0.03 + ratio * 0.05})`;
      ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.strokeStyle = `rgba(255,255,255,${0.18 + ratio * (0.22 + pulse * 0.16)})`;
      ctx.lineWidth = 3;
      ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Satellites
    const satLvl = (s.satellites || 0) | 0;
    if (satLvl > 0) {
      // Prefer vis calculated by skillSystem (keeps net clients consistent).
      const vis = p._satelliteVis;

      let count, orbitR, orbR, speed;
      if (vis && typeof vis === "object") {
        count = Math.max(1, vis.count | 0);
        orbitR = Number.isFinite(vis.orbitR) ? vis.orbitR : 60;
        orbR = Number.isFinite(vis.orbR) ? vis.orbR : 10;
        speed = Number.isFinite(vis.speed) ? vis.speed : 1.2;
      } else {
        // Fallback (matches satellitesParams progression).
        const meta = (p._metaSkillMeta && typeof p._metaSkillMeta === "object") ? p._metaSkillMeta : null;
        const metaLvl = meta ? (meta["skill:satellites"] | 0) : 0;
        const extraAt5 = metaLvl >= 2 ? 1 : 0;
        const extraAt9 = metaLvl >= 3 ? 1 : 0;

        count = 1;
        if (satLvl >= 5) count += 1 + extraAt5;
        if (satLvl >= 9) count += 1 + extraAt9;
        count = Math.min(5, Math.max(1, count));

        orbitR = (56 + (satLvl - 1) * 3.0 + Math.max(0, count - 1) * 2.0) * (0.85 + (rMult - 1) * 0.35);
        orbR = 9 + Math.floor((satLvl - 1) / 3);
        speed = 1.1 + (satLvl - 1) * 0.06;
      }

      const a0 = now * speed;
      const step = (Math.PI * 2) / Math.max(1, count);
      for (let i = 0; i < count; i++) {
        const a = a0 + i * step;
        const ox = p.x + Math.cos(a) * orbitR;
        const oy = p.y + Math.sin(a) * orbitR;
        ctx.beginPath();
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.arc(ox, oy, orbR, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = "rgba(80,220,255,0.40)";
        ctx.arc(ox - 3, oy - 3, Math.max(2, orbR * 0.3), 0, Math.PI * 2);
        ctx.fill();
      }
    }

        // Spirit(s)
        const spLvl = (s.spirit || 0) | 0;
        if (spLvl > 0) {
          const meta = (p._metaSkillMeta && typeof p._metaSkillMeta === "object") ? p._metaSkillMeta : null;
          const metaLvl = meta ? (meta["skill:spirit"] | 0) : 0;
          const extraAt5 = metaLvl >= 2 ? 1 : 0;
          const extraAt9 = metaLvl >= 3 ? 1 : 0;

          let count = 1;
          if (spLvl >= 5) count += 1 + extraAt5;
          if (spLvl >= 9) count += 1 + extraAt9;
          count = Math.min(5, Math.max(1, count));

          const baseY = p.y - (p.radius || 18) - 18;
          const step = 12;
          const mid = (count - 1) / 2;

          for (let i = 0; i < count; i++) {
            const ox = p.x + (i - mid) * step;
            const flick = 0.55 + 0.25 * Math.sin(now * 9 + i * 1.3);
            const oy = baseY + Math.sin(now * 7 + i * 1.7) * 1.3;

            const r = 6.5 + flick * 1.5;

            // outer glow
            ctx.beginPath();
            ctx.fillStyle = `rgba(255,130,80,${0.18 + flick * 0.10})`;
            ctx.arc(ox, oy, r * 1.8, 0, Math.PI * 2);
            ctx.fill();

            // flame body
            ctx.beginPath();
            ctx.fillStyle = `rgba(255,175,80,${0.60 + flick * 0.18})`;
            ctx.arc(ox, oy, r, 0, Math.PI * 2);
            ctx.fill();

            // hot core
            ctx.beginPath();
            ctx.fillStyle = "rgba(255,255,255,0.75)";
            ctx.arc(ox - 1.2, oy - 1.8, Math.max(1.2, r * 0.33), 0, Math.PI * 2);
            ctx.fill();
          }
        }
  }
  ctx.restore();

  for (const p of players) {
    if (!p) continue;
    if (typeof p.render === "function") {
      p.render(ctx);
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.fillStyle = p.id === state.player?.id ? "#8fe3ff" : "#7fb0ff";
      ctx.arc(p.x, p.y, p.radius || 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // nicknames
  ctx.save();
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  for (const p of players) {
    if (!p) continue;
    const name = (p.nickname || "").toString().slice(0, 16);
    if (!name) continue;
    // Nickname below the smiley (not above)
    ctx.fillText(name, p.x, p.y + (p.radius || 18) + 24);
  }
  ctx.restore();

  // Revive UI (world-space button on the corpse)
  state._reviveButtons = [];
  if (state.mode === 'playing' && !state.overlayMode) {
    const me = state.player;
    if (me && (me.hp || 0) > 0) {
      const cam = state.camera;
      const cvs = state.canvas;
      const z = cam.zoom || 1;
      const pitch = cam.pitch || 1;
      const w2s = (wx, wy) => ({
        x: (wx - cam.x) * z + (cvs.width || 1) / 2,
        y: (wy - cam.y) * z * pitch + (cvs.height || 1) / 2,
      });

      for (const t of players) {
        if (!t) continue;
        if (String(t.id || '') === String(me.id || '')) continue;
        if ((t.hp || 0) > 0) continue;
        if (t._kicked) continue;

        const dx = t.x - me.x;
        const dy = t.y - me.y;
        if (dx * dx + dy * dy > REVIVE_INTERACT_R * REVIVE_INTERACT_R) continue;

        const btnW = 96;
        const btnH = 30;
        const wx = t.x - btnW * 0.5;
        const wy = t.y - (t.radius || 18) - 52;

        // Draw button in world coords (camera transform already applied)
        ctx.save();
        ctx.translate(wx, wy);
        ctx.fillStyle = 'rgba(20,26,34,0.88)';
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.rect(0, 0, btnW, btnH);
        ctx.fill();
        ctx.stroke();

        const healing = me._reviving && String(me._reviving.targetId || '') === String(t.id || '');
        const pct = healing ? Math.max(0, Math.min(1, (me._reviving.t || 0) / (me._reviving.need || REVIVE_CHANNEL_SEC))) : 0;
        if (healing) {
          ctx.fillStyle = 'rgba(90,220,255,0.25)';
          ctx.fillRect(2, btnH - 6, (btnW - 4) * pct, 4);
        }

        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(healing ? 'Healing…' : 'Heal', btnW / 2, btnH / 2);
        ctx.restore();

        // Register clickable rect in SCREEN space
        const s0 = w2s(wx, wy);
        const s1 = w2s(wx + btnW, wy + btnH);
        const rx = Math.min(s0.x, s1.x);
        const ry = Math.min(s0.y, s1.y);
        const rw = Math.abs(s1.x - s0.x);
        const rh = Math.abs(s1.y - s0.y);
        state._reviveButtons.push({ targetId: String(t.id || ''), x: rx, y: ry, w: rw, h: rh });
      }
    }
  }
}

function renderHPBarsWorld(state, ctx) {
  ctx.save();

  // Enemies
  for (const e of state.enemies) {
    const hp = e.hp;
    const maxHp = e.maxHp ?? e.maxHP ?? 0;
    if (maxHp <= 0 || hp <= 0) continue;

    const ratio = Math.max(0, Math.min(1, hp / maxHp));
    const fullWidth = (e.radius || 20) * 2.2;
    const h = 4;
    const x = e.x - fullWidth / 2;
    const y = e.y - (e.radius || 20) - 10;

    ctx.fillStyle = "#000000";
    ctx.fillRect(x, y, fullWidth, h);
    ctx.fillStyle = "#4cff4c";
    ctx.fillRect(x, y, fullWidth * ratio, h);
  }

  // Players
  const players = state.players && state.players.length ? state.players : (state.player ? [state.player] : []);
  for (const p of players) {
    if (!p) continue;
    // Hide the local player's world HP bar (the green strip above the smiley)
    if (state.player && p.id === state.player.id) continue;
    const hp = p.hp;
    const maxHp = p.maxHP ?? p.maxHp ?? 0;
    if (maxHp > 0 && hp > 0) {
      const ratio = Math.max(0, Math.min(1, hp / maxHp));
      const fullWidth = (p.radius || 18) * 2.4;
      const h = 5;
      const x = p.x - fullWidth / 2;
      const y = p.y - (p.radius || 18) - 14;

      ctx.fillStyle = "#000000";
      ctx.fillRect(x, y, fullWidth, h);
      ctx.fillStyle = p.id === state.player?.id ? "#00ff7a" : "#4aa3ff";
      ctx.fillRect(x, y, fullWidth * ratio, h);
    }
  }

  ctx.restore();
}

function renderBuffAuras(state, ctx) {
  const { buffs } = state;
  if (!buffs || !buffs.length) return;

  ctx.save();
  ctx.globalAlpha = 0.35;

  const players = state.players && state.players.length ? state.players : (state.player ? [state.player] : []);

  for (const b of buffs) {
    switch (b.type) {
      case "damage":
        ctx.strokeStyle = "#ff4b7a";
        break;
      case "attackSpeed":
        ctx.strokeStyle = "#ffdd57";
        break;
      case "moveSpeed":
        ctx.strokeStyle = "#57ff9b";
        break;
      case "regen":
        ctx.strokeStyle = "#57c8ff";
        break;
      case "shield":
        ctx.strokeStyle = "#b857ff";
        break;
      case "ghost":
        ctx.strokeStyle = "#ffffff";
        break;
      default:
        ctx.strokeStyle = "#ffffff";
        break;
    }

    for (const p of players) {
      ctx.beginPath();
      ctx.lineWidth = 3;
      ctx.arc(p.x, p.y, (p.radius || 18) + 10, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function renderPopups(ctx, state) {
  const { canvas, popups } = state;
  const w = canvas.width;

  ctx.save();
  ctx.font = "18px sans-serif";
  ctx.textAlign = "center";

  let y = 40;
  for (const p of popups) {
    const alpha = Math.max(0, Math.min(1, p.time / 2));
    ctx.fillStyle = "rgba(255,255,255," + alpha + ")";
    ctx.fillText(p.text, w / 2, y);
    y += 22;
  }

  ctx.restore();
}

function checkPlayerDeath(state) {
  const { player, progression } = state;
  if (player.hp > 0) return;
  if (state.mode !== "playing") return;

  const runScore = Math.floor(state.runScore);
  const gainedPoints = Math.max(1, Math.floor(runScore / 400));

  progression.totalScore += runScore;
  progression.upgradePoints += gainedPoints;

  if (state.flags && state.flags.resGuardianKilledThisRun) {
    state.mode = "resurrection";
  } else {
    state.mode = "upgrade";
  }

  state.lastRunSummary = {
    runScore,
    totalScore: progression.totalScore,
    gainedPoints,
  };

  saveProgression(progression);
}
