import { updateSkills, updateSkillsNet } from "../weapons/skillSystem.js";
import { clampPlayerToActiveWalkable } from "../world/floorCollision.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../world/mapGenerator.js";
import { getPlayersArr } from "./netPlayerRuntime.js";
import { performFloorShopPurchase, performFloorShopReroll } from "./floorShopRuntime.js";
import { startReviveById } from "./lifecycleRuntime.js";

export function updatePlayerFromInput(player, input, dt, state) {
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


export function updateArenaHazards(state, dt) {
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


export function updatePlayers(state, dt, online, deps = {}) {
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
    state.player._prevWalkX = state.player.x;
    state.player._prevWalkY = state.player.y;
    if (state.player.hp > 0 && !blockedByOverlay && !blockedByRunUp && !blockedByShop && !state.player._reviving) {
      state.player.update(dt, state);
    }
  }

  if (!online) {
    // Offline = single player
    state.players = [state.player];
    if (state.player) clampPlayerToActiveWalkable(state.player, state, {
      pad: 2,
      prevX: Number.isFinite(state.player._prevWalkX) ? state.player._prevWalkX : null,
      prevY: Number.isFinite(state.player._prevWalkY) ? state.player._prevWalkY : null,
    });
    return;
  }

  // Host: update remote players from net inputs
  if (state.net.isHost) {
    for (const p of players) {
      if (!p || String(p.id) === String(state.player.id)) continue;
      const input = state.net.remoteInputs.get(String(p.id)) || {};
      p._prevWalkX = p.x;
      p._prevWalkY = p.y;
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
      if (sa && (sa.offerId || String(sa.action || '') === 'reroll')) {
        const seq = (sa.seq | 0) || 0;
        if (!state._shopActLastSeq) state._shopActLastSeq = new Map();
        const last = state._shopActLastSeq.get(String(p.id)) || 0;
        if (seq && seq !== last) {
          state._shopActLastSeq.set(String(p.id), seq);
          try {
            const action = String(sa.action || 'buy');
            if (action === 'reroll') performFloorShopReroll(state, p, { syncPersistentRunUnlocks: deps.syncPersistentRunUnlocks });
            else performFloorShopPurchase(state, p, String(sa.offerId), sa.replaceKey != null ? String(sa.replaceKey) : null, { syncPersistentRunUnlocks: deps.syncPersistentRunUnlocks });
            p._shopActAckSeq = seq;
          } catch {}
        }
      }
    }
  }

  for (const p of getPlayersArr(state)) {
    if (!p) continue;
    clampPlayerToActiveWalkable(p, state, {
      pad: 2,
      prevX: Number.isFinite(p._prevWalkX) ? p._prevWalkX : null,
      prevY: Number.isFinite(p._prevWalkY) ? p._prevWalkY : null,
    });
  }
}


export function updateWeapons(state, dt, online) {
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

