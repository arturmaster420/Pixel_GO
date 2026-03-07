import { HUB_HALF } from "./zoneController.js";
import { setDynamicWorldBounds } from "./mapGenerator.js";
import { rollFloorShopOffers } from "../core/floorShop.js";
import { biomeForFloorIndex } from "./biomes.js";
import { buildArenaSpec } from "./arenaSpecBuilder.js";

// Pixel_GO: infinite rooms in a chain.
// Forward direction = UP on screen = negative Y in world coords.

const GAP = 160; // gap between rooms (world units)
const COLLAPSE_DUR = 1.35; // seconds
const BRIDGE_BUILD_DUR = 1.15; // seconds

// Gates (SAS-like): portals on the platform edge.
// - Gates start OPEN (broken). Mobs come from outside.
// - Player can REPAIR a gate to seal it (needs 2s safe: no hits to player and gate).
// - Mobs attack sealed gates and break them.
// - After clearing waves and the bridge opens, player can do a reward seal (green, 10s) to get XP orbs.
const GATE_INTERACT_R = 170;
const GATE_REPAIR_SAFE_SEC = 2.0;
const GATE_REPAIR_TIME_SEC = 2.0;
// After clearing waves (bridge built) player can do a longer "reward fix".
// It takes 10s to complete, then becomes green for a short time and drops XP.
const GATE_REWARD_REPAIR_TIME_SEC = 5.0;
const GATE_REWARD_SEAL_DUR = 10.0;

function clamp(n, a, b) {
  return n < a ? a : (n > b ? b : n);
}

// Gate opening length along edge (must match renderer + collision)
export function getGateLenForRoomSide(roomSide) {
  return clamp(roomSide * 0.10, 72, 112);
}

export function getGateHalfLenForRoomSide(roomSide) {
  return getGateLenForRoomSide(roomSide) * 0.5;
}

// Room side length
export function getRoomSide(roomIndex) {
  const hubSide = HUB_HALF * 2;
  const idx = (roomIndex | 0);

  // Pixel_GO tuning:
  // - Room 0 (Hub) keeps original hub size
  // - Room 1 is the same size as Hub
  // - Next rooms grow slower than v0.1
  if (idx <= 1) return hubSide;

  const n = idx;
  const GROWTH = 180; // smaller growth than before
  const L = hubSide + GROWTH * Math.sqrt(Math.max(0, n - 1));
  return Math.round(L);
}

function makeRoom(index, centerX, centerY, biomeKey = "") {
  const side = getRoomSide(index);
  const half = side * 0.5;
  const bounds = {
    minX: centerX - half,
    maxX: centerX + half,
    minY: centerY - half,
    maxY: centerY + half,
  };
  const arenaSpec = buildArenaSpec({ roomIndex: index, biomeKey, side, centerX, centerY });

  const gates = makeGates(index, bounds, side, arenaSpec);
  return {
    id: `room_${index}`,
    index,
    biomeKey: String(biomeKey || ""),
    hue: (() => {
      if ((index | 0) <= 0) return 210;
      const biome = Math.floor(((index | 0) - 1) / 10);
      return (210 + biome * 55 + (index | 0) * 7) % 360;
    })(),
    side,
    centerX,
    centerY,
    bounds,
    breaches: gates, // keep legacy field name used elsewhere
    arenaSpec,
    // Floor terminal position (visible after clear). Always deterministic for joiners.
    shopNpc: index > 0 ? { x: centerX, y: centerY + side * 0.18, r: 20 } : null,
    cleared: index === 0,
    collapsing: false,
    collapseT: 0,
    removed: false,
  };
}

function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    // xorshift32
    s ^= (s << 13);
    s ^= (s >>> 17);
    s ^= (s << 5);
    return ((s >>> 0) / 4294967295);
  };
}

function makeGates(index, bounds, side, arenaSpec = null) {
  const idx = index | 0;
  if (idx <= 0) return [];

  // Gates spawn on the edge of the platform in random places.
  // Rules:
  // - Do NOT spawn on the forward edge (north / minY) because the room->next bridge builds there.
  // - Do NOT spawn on the entry segment where the bridge brought us into this room (south / maxY, centered).
  const sides = ["S", "W", "E"]; // south/back, west/left, east/right
  const rnd = makeRng((0xBEE7CA0 ^ Math.imul(idx, 2654435761)) >>> 0);

  // Gate count progression:
  // room1->1, room2->1, room3->2 ... capped.
  const count = Math.max(1, Math.min(6, 1 + Math.floor(Math.max(0, idx - 1) / 2)));

  const sideLen = (bounds.maxX - bounds.minX);
  const margin = Math.max(110, Math.min(240, sideLen * 0.18));

  // Entry bridge lands on SOUTH edge, centered.
  const entryForbidden = Math.max(220, Math.min(520, sideLen * 0.28));
  const entryX0 = (bounds.minX + bounds.maxX) * 0.5 - entryForbidden * 0.5;
  const entryX1 = (bounds.minX + bounds.maxX) * 0.5 + entryForbidden * 0.5;

  const used = [];
  const minSep = Math.max(120, Math.min(260, sideLen * 0.22));

  const anchorGates = Array.isArray(arenaSpec?.anchors?.gateAnchors) ? arenaSpec.anchors.gateAnchors : [];
  if (anchorGates.length) {
    const sealMax = Math.round(160 + idx * 18);
    return anchorGates.slice(0, 6).map((g, i) => ({
      id: `g_${idx}_${i}` ,
      side: String(g.side || 'S').toUpperCase(),
      x: Number(g.x) || (((bounds.minX + bounds.maxX) * 0.5)),
      y: Number(g.y) || (((bounds.minY + bounds.maxY) * 0.5)),
      sealHp: 0,
      sealMax,
      lastHitAt: -Infinity,
      pressure: 0,
      repairActive: false,
      repairBy: '',
      repairT: 0,
      repairMode: '',
      rewardSealed: false,
      rewardSealLeft: 0,
      rewardUsed: false,
    }));
  }

  const tryPick = (sideChar) => {
    let x = 0;
    let y = 0;
    if (sideChar === "S") {
      // Avoid the entry bridge segment.
      let tries = 16;
      while (tries-- > 0) {
        const tx = bounds.minX + margin + rnd() * ((bounds.maxX - bounds.minX) - margin * 2);
        if (tx >= entryX0 && tx <= entryX1) continue;
        x = tx;
        y = bounds.maxY;
        break;
      }
      if (x === 0 && y === 0) {
        const left = rnd() < 0.5;
        x = left ? (bounds.minX + margin) : (bounds.maxX - margin);
        y = bounds.maxY;
      }
    } else if (sideChar === "W") {
      x = bounds.minX;
      y = bounds.minY + margin + rnd() * ((bounds.maxY - bounds.minY) - margin * 2);
    } else {
      x = bounds.maxX;
      y = bounds.minY + margin + rnd() * ((bounds.maxY - bounds.minY) - margin * 2);
    }
    return { x, y };
  };

  const gates = [];
  for (let i = 0; i < count; i++) {
    let sideChar = sides[Math.floor(rnd() * sides.length)];
    let pos = tryPick(sideChar);

    // De-cluster: try a few times to keep gates separated.
    let ok = false;
    for (let t = 0; t < 18 && !ok; t++) {
      ok = true;
      for (const u of used) {
        const dx = pos.x - u.x;
        const dy = pos.y - u.y;
        if (dx * dx + dy * dy < minSep * minSep) { ok = false; break; }
      }
      if (!ok) {
        sideChar = sides[Math.floor(rnd() * sides.length)];
        pos = tryPick(sideChar);
      }
    }

    used.push(pos);

    const sealMax = Math.round(160 + idx * 18);

    gates.push({
      id: `g_${idx}_${i}`,
      side: sideChar,
      x: pos.x,
      y: pos.y,

      // Seal HP: 0 means OPEN.
      sealHp: 0,
      sealMax,

      // Combat pressure/FX
      lastHitAt: -Infinity,
      pressure: 0,

      // Repair channel
      repairActive: false,
      repairBy: "",
      repairT: 0,
      repairMode: "",

      // Reward seal after clear
      rewardSealed: false,
      rewardSealLeft: 0, // legacy; kept for compatibility
      rewardUsed: false,
    });
  }

  return gates;
}

function unionAabb(a, b, pad = 0) {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX) - pad,
    maxX: Math.max(a.maxX, b.maxX) + pad,
    minY: Math.min(a.minY, b.minY) - pad,
    maxY: Math.max(a.maxY, b.maxY) + pad,
  };
}

function pointInAabb(x, y, b, pad = 0) {
  if (!b) return false;
  return (
    x >= b.minX - pad && x <= b.maxX + pad &&
    y >= b.minY - pad && y <= b.maxY + pad
  );
}

function findPlayerById(state, pid) {
  if (!state || !pid) return null;
  const ps = (state.players && state.players.length) ? state.players : (state.player ? [state.player] : []);
  const sid = String(pid);
  for (const p of ps) {
    if (p && String(p.id || "") === sid) return p;
  }
  return null;
}

function gateIsRewardSealed(g) {
  if (!g) return false;
  if (g.rewardSealed) return true;
  // legacy timed variant
  return (g.rewardSealLeft || 0) > 0.02;
}

function gateIsSealed(g) {
  if (!g) return false;
  if (gateIsRewardSealed(g)) return true;
  return (g.sealHp || 0) > 0.02;
}

export class RoomDirector {
  constructor(state) {
    this.state = state;

    this.prev = null;
    this.current = makeRoom(0, 0, 0, "");
    this.next = null;

    // Biome tracking (host chooses randomly; joiners receive via snapshot)
    this._lastBiomeKey = "";

    // Bridge connects rooms after clear.
    this.bridge = null;

    // When the host steps into the next floor, we keep the previous floor + bridge
    // until ALL alive players enter the new floor.
    this._waitForParty = false;
    this._pendingPrevCollapse = false;

    this._ensureNextSpawned();
    this._applyDynamicBounds();
  }

  get roomIndex() {
    return this.current ? (this.current.index | 0) : 0;
  }

  markCurrentCleared() {
    if (!this.current) return;
    if (this.current.cleared) return;
    this.current.cleared = true;

    // Pixel_GO v0.4: award +1 Skill Point for completing this floor.
    // Host/offline only (joiners receive via snapshot).
    try {
      const st = this.state;
      const online = !!(st && st.net && st.net.status === 'connected' && st.net.roomCode);
      const isHost = !online || !!st.net.isHost;
      if (isHost) {
        const ps = (st && st.players && st.players.length) ? st.players : (st && st.player ? [st.player] : []);
        for (const p of ps) {
          if (!p) continue;
          p.skillPoints = ((p.skillPoints | 0) + 1) | 0;
        }
      }
    } catch {}

    // Spawn the floor terminal (NPC) and generate per-player offers.
    try { this._ensureFloorShop(); } catch {}

    this._ensureNextSpawned();
    this._ensureBridge();
    this._applyDynamicBounds();
  }

  _ensureFloorShop() {
    const st = this.state;
    const room = this.current;
    if (!st || !room || (room.index | 0) <= 0) return;

    // Only host/offline generates offers.
    const online = !!(st.net && st.net.status === 'connected' && st.net.roomCode);
    const isHost = !online || !!st.net.isHost;
    if (!isHost) return;

    // Place the terminal slightly behind center (toward south / entry side).
    const side = room.side || 600;
    room.shopNpc = {
      x: room.centerX,
      y: room.centerY + side * 0.18,
      r: 20,
    };

    const ps = (st.players && st.players.length) ? st.players : (st.player ? [st.player] : []);
    for (const p of ps) {
      if (!p) continue;
      // Generate offers once per floor.
      const fs = p.floorShop;
      if (fs && (fs.floor | 0) === (room.index | 0) && Array.isArray(fs.offers) && fs.offers.length) continue;
      const offers = rollFloorShopOffers(p, room.index, room.biomeKey || "", 3);
      p.floorShop = {
        floor: room.index | 0,
        offers,
        sold: offers.map(() => false),
      };
    }
  }

  update(dt) {
    const st = this.state;

    // If a player joined mid-floor and this floor is already cleared, ensure they get offers.
    if (this.current && this.current.cleared) {
      try { this._ensureFloorShop(); } catch {}
    }

    // Update collapse animation and remove collapsed rooms.
    if (this.prev && this.prev.collapsing) {
      this.prev.collapseT += dt / COLLAPSE_DUR;
      if (this.prev.collapseT >= 1) {
        this.prev.collapseT = 1;
        this.prev.removed = true;
        // Once removed, drop reference and also drop the old bridge.
        this.prev = null;
        this.bridge = null;
      }
    }

    // Bridge building
    if (this.bridge && !this.bridge.built) {
      this.bridge.t += dt / BRIDGE_BUILD_DUR;
      if (this.bridge.t >= 1) {
        this.bridge.t = 1;
        this.bridge.progress = 1;
        this.bridge.built = true;
      } else {
        this.bridge.progress = this.bridge.t;
      }
    }

    // Party transition: keep previous floor until everyone is in.
    if (this._waitForParty && this.prev && !this.prev.removed && !this.prev.collapsing) {
      if (this._areAllAlivePlayersInCurrent()) {
        // Start collapsing the previous floor now.
        this.prev.collapsing = true;
        this.prev.collapseT = 0;
        try { this._cleanupRoomEntities(this.prev); } catch {}
        this._waitForParty = false;
        // Kick downed players that were left behind on the previous floor.
        try { this._kickLeftBehindDownedPlayers(); } catch {}
      }
    }

    // Gate timers + repair channels
    const room = this.current;
    if (room && Array.isArray(room.breaches)) {
      const now = (st && typeof st.time === 'number') ? st.time : 0;
      for (const g of room.breaches) {
        if (!g) continue;
        // Reward-sealed gates stay green until the room collapses (no timer).
        // (Legacy: if rewardSealLeft is used, keep it from going negative.)
        if (!g.rewardSealed && (g.rewardSealLeft || 0) > 0) {
          g.rewardSealLeft -= dt;
          if (g.rewardSealLeft < 0) g.rewardSealLeft = 0;
        }

        // Pressure decay
        if ((g.pressure || 0) > 0) {
          // fast decay; gets refreshed by hits
          g.pressure = Math.max(0, g.pressure - dt * 2.6);
        }

        // Repair channel (normal or reward)
        if (g.repairActive) {
          const p = findPlayerById(st, g.repairBy);
          if (!p || p.hp <= 0 || !this.canPlayerInteractGate(p, g)) {
            g.repairActive = false;
            g.repairBy = "";
            g.repairT = 0;
            g.repairMode = "";
            continue;
          }

          const safePlayer = (now - (typeof p._lastDamagedAt === 'number' ? p._lastDamagedAt : -Infinity)) >= GATE_REPAIR_SAFE_SEC;
          const safeGate = (now - (typeof g.lastHitAt === 'number' ? g.lastHitAt : -Infinity)) >= GATE_REPAIR_SAFE_SEC;

          const mode = String(g.repairMode || "normal").toLowerCase();
          const need = (mode === "reward") ? GATE_REWARD_REPAIR_TIME_SEC : GATE_REPAIR_TIME_SEC;

          if (safePlayer && safeGate) {
            g.repairT += dt;
            if (g.repairT >= need) {
              // Completed
              g.repairT = 0;
              g.repairActive = false;
              g.repairBy = "";
              g.repairMode = "";
              g.sealHp = g.sealMax;
              g.pressure = 0;
              g.lastHitAt = -Infinity;

              if (mode === "reward") {
                // Only now: turn green and drop XP.
                if (!g.rewardUsed) {
                  g.rewardUsed = true;
                  g.rewardSealed = true;
                  g.rewardSealLeft = 0;
                  this._spawnGateRewardOrbs(room, g);
                }
              }
            }
          } else {
            // Must be 2 seconds of no pressure.
            g.repairT = 0;
          }
        } else {
          g.repairT = 0;
          g.repairMode = g.repairMode || "";
        }

        // Keep seal hp sane
        if (!Number.isFinite(g.sealHp)) g.sealHp = 0;
        if (!Number.isFinite(g.sealMax) || g.sealMax <= 1) g.sealMax = 200;
        if (g.sealHp < 0) g.sealHp = 0;
        if (g.sealHp > g.sealMax) g.sealHp = g.sealMax;
      }
    }

    // Ensure dynamic bounds are correct (union during transitions).
    this._applyDynamicBounds();

    // Auto-enter next when player steps into next room.
    const p = st && st.player;
    if (!p) return;

    if (this.current && this.current.cleared && this.next && !this.next.removed) {
      // Allow entering only after bridge is built.
      if (this.bridge && this.bridge.built) {
        if (pointInAabb(p.x, p.y, this.next.bounds, 10)) {
          this._enterNextRoom();
        }
      }
    }
  }

  // ---- Gate helpers -------------------------------------------------------

  getGateById(gateId) {
    const room = this.current;
    if (!room || !Array.isArray(room.breaches)) return null;
    return room.breaches.find((g) => g && g.id === gateId) || null;
  }

  isGateSealed(gate) {
    return gateIsSealed(gate);
  }

  canPlayerInteractGate(player, gate) {
    if (!player || !gate || !this.current) return false;
    const ip = this.getGateInnerPoint(this.current, gate, 34);
    const dx = player.x - ip.x;
    const dy = player.y - ip.y;
    return (dx * dx + dy * dy) <= (GATE_INTERACT_R * GATE_INTERACT_R);
  }

  getGateInnerPoint(room, gate, inset = 24) {
    const b = room.bounds;
    const side = gate.side;
    if (side === "W") return { x: b.minX + inset, y: gate.y };
    if (side === "E") return { x: b.maxX - inset, y: gate.y };
    if (side === "S") return { x: gate.x, y: b.maxY - inset };
    return { x: gate.x, y: b.minY + inset };
  }

  // Backwards-compatible aliases (older code used "breach" naming).
  getBreachInnerPoint(room, gate, inset = 24) {
    return this.getGateInnerPoint(room, gate, inset);
  }

  // Point just OUTSIDE the edge (used for spawning/approach)
  getGateOuterPoint(room, gate, out = 220) {
    const b = room.bounds;
    const side = gate.side;
    if (side === "W") return { x: b.minX - out, y: gate.y };
    if (side === "E") return { x: b.maxX + out, y: gate.y };
    if (side === "S") return { x: gate.x, y: b.maxY + out };
    return { x: gate.x, y: b.minY - out };
  }

  getBreachOuterPoint(room, gate, out = 220) {
    return this.getGateOuterPoint(room, gate, out);
  }

  // Point right at the gate face OUTSIDE (used so mobs "push" the closed gate)
  getGateContactPoint(room, gate, enemyRadius = 20, pad = 2) {
    const b = room.bounds;
    const r = (enemyRadius || 20) + pad;
    const side = gate.side;
    if (side === "W") return { x: b.minX - r, y: gate.y };
    if (side === "E") return { x: b.maxX + r, y: gate.y };
    if (side === "S") return { x: gate.x, y: b.maxY + r };
    return { x: gate.x, y: b.minY - r };
  }

  // Apply damage to a sealed gate (host-authoritative).
  applyGateDamage(gateId, amount, sourceEnemy = null) {
    const g = this.getGateById(gateId);
    if (!g) return false;

    // Reward-sealed gates are invulnerable.
    if (gateIsRewardSealed(g)) return false;

    if (!Number.isFinite(amount) || amount <= 0) return false;
    if ((g.sealHp || 0) <= 0) {
      // Already open.
      return false;
    }

    const now = (this.state && typeof this.state.time === 'number') ? this.state.time : 0;
    g.lastHitAt = now;
    g.pressure = Math.min(1, (g.pressure || 0) + 0.55);

    g.sealHp -= amount;
    if (g.sealHp < 0) g.sealHp = 0;
    // If gate breaks, cancel any repair channel.
    if (g.sealHp <= 0.01) {
      g.sealHp = 0;
      g.repairActive = false;
      g.repairBy = "";
      g.repairT = 0;
      g.repairMode = "";
    }

    return true;
  }

  // Start a repair channel on a gate.
  startRepairGateById(gateId, player) {
    const g = this.getGateById(gateId);
    if (!g) return false;
    if (!player || !this.canPlayerInteractGate(player, g)) return false;

    if (g.repairActive) return false;

    // Can't repair if already reward-sealed.
    if (gateIsRewardSealed(g)) return false;

    // Only allow if the gate is open/broken or damaged.
    if ((g.sealHp || 0) >= (g.sealMax || 1) * 0.999) return false;

    g.repairActive = true;
    g.repairBy = String(player.id || "local");
    g.repairT = 0;
    g.repairMode = "normal";
    return true;
  }

  // Start a reward fix channel (10s). Only on completion it becomes green and spawns XP.
  startRewardFixGateById(gateId, player) {
    const room = this.current;
    const g = this.getGateById(gateId);
    if (!room || !g) return false;
    if (!player || !this.canPlayerInteractGate(player, g)) return false;

    // Require bridge open (matches "opened bridge" request).
    if (!(room.cleared && this.bridge && this.bridge.built)) return false;

    if (g.rewardUsed) return false;
    if (g.repairActive) return false;

    g.repairActive = true;
    g.repairBy = String(player.id || "local");
    g.repairT = 0;
    g.repairMode = "reward";
    return true;
  }

  // Unified gate action entry point (used by click/tap + net inputs).
  performGateAction(gateId, action, player) {
    const a = String(action || "").toLowerCase();
    if (a === "reward" || a === "rewardseal" || a === "seal") {
      return this.startRewardFixGateById(gateId, player);
    }
    // default: repair
    return this.startRepairGateById(gateId, player);
  }

  _spawnGateRewardOrbs(room, gate) {
    const st = this.state;
    if (!st || !Array.isArray(st.xpOrbs)) return;

    const n = room.index | 0;
    const bracket = Math.floor(Math.max(0, n - 1) / 10);
    const maxOrbs = 2 + bracket; // 1-10 => 2, 11-20 => 3, etc.
    const count = 1 + Math.floor(Math.random() * maxOrbs);

    const zone = this._virtualZoneFromRoom(n);
    const baseXp = 10 * Math.max(1, zone);

    const ip = this.getGateInnerPoint(room, gate, 44);
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 10 + Math.random() * 22;
      st.xpOrbs.push({
        x: ip.x + Math.cos(ang) * rad,
        y: ip.y + Math.sin(ang) * rad,
        radius: 8,
        kind: "xp",
        xp: baseXp,
        age: 0,
      });
    }

    // Small floating text feedback
    if (Array.isArray(st.floatingTexts)) {
      st.floatingTexts.push({
        x: ip.x,
        y: ip.y - 24,
        text: `+XP x${count}`,
        time: 1.2,
      });
    }
  }

  // ---- Joiner sync --------------------------------------------------------

  forceSetCurrent(roomIndex, opts = null) {
    const o = opts || {};
    const idx = roomIndex | 0;
    let cx = 0;
    let cy = 0;

    // Walk the chain deterministically to compute centerY for idx.
    let prevSide = getRoomSide(0);
    for (let i = 1; i <= idx; i++) {
      const side = getRoomSide(i);
      const prevHalf = prevSide * 0.5;
      const half = side * 0.5;
      cy = cy - (prevHalf + GAP + half);
      prevSide = side;
    }

    // Optionally compute previous floor center if host kept it.
    const prevIdx = (typeof o.prevI === 'number') ? (o.prevI | 0) : 0;
    let pcy = 0;
    if (prevIdx > 0 && prevIdx < idx) {
      let pPrevSide = getRoomSide(0);
      for (let i = 1; i <= prevIdx; i++) {
        const side = getRoomSide(i);
        const prevHalf = pPrevSide * 0.5;
        const half = side * 0.5;
        pcy = pcy - (prevHalf + GAP + half);
        pPrevSide = side;
      }
    }

    this.prev = (prevIdx > 0 && prevIdx < idx) ? makeRoom(prevIdx, cx, pcy, (o.prevBiome || "")) : null;
    if (this.prev) {
      this.prev.cleared = true;
      this.prev.collapsing = !!o.prevCollapsing;
      this.prev.collapseT = typeof o.prevT === 'number' ? clamp(o.prevT, 0, 1) : 0;
      this.prev.removed = false;
    }
    this.current = makeRoom(idx, cx, cy, (o.biome || ""));
    this.current.cleared = idx === 0 ? true : !!o.cleared;

    this._waitForParty = !!o.waitForParty;

    // Apply gate states from host snapshot.
    const gates = Array.isArray(this.current.breaches) ? this.current.breaches : [];
    const hpArr = Array.isArray(o.gateHp) ? o.gateHp : null;
    const maxArr = Array.isArray(o.gateMax) ? o.gateMax : null;
    const rewardArr = Array.isArray(o.gateReward) ? o.gateReward : null;
    const repairArr = Array.isArray(o.gateRepair) ? o.gateRepair : null;
    const repairModeArr = Array.isArray(o.gateRepairMode) ? o.gateRepairMode : null;
    const pressArr = Array.isArray(o.gatePressure) ? o.gatePressure : null;
    const usedArr = Array.isArray(o.gateUsed) ? o.gateUsed : null;

    for (let i = 0; i < gates.length; i++) {
      const g = gates[i];
      if (!g) continue;
      if (hpArr && typeof hpArr[i] === 'number') g.sealHp = Math.max(0, hpArr[i]);
      if (maxArr && typeof maxArr[i] === 'number') g.sealMax = Math.max(1, maxArr[i]);
      if (rewardArr && typeof rewardArr[i] === 'number') {
        const rv = rewardArr[i];
        g.rewardSealed = rv > 0.5;
        g.rewardSealLeft = 0;
      }
      if (repairArr && typeof repairArr[i] === 'number') {
        const v = Math.max(0, repairArr[i]);
        g.repairActive = v > 0.001;
        g.repairT = v;
      }
      if (repairModeArr && typeof repairModeArr[i] === 'number') {
        const m = (repairModeArr[i] | 0);
        if (g.repairActive) g.repairMode = (m === 1) ? 'reward' : 'normal';
      } else {
        if (g.repairActive) g.repairMode = 'normal';
      }
      if (pressArr && typeof pressArr[i] === 'number') g.pressure = clamp(pressArr[i], 0, 1);
      if (usedArr && typeof usedArr[i] === 'number') g.rewardUsed = usedArr[i] > 0;
    }

    this.next = null;

    // If host kept a bridge from previous floor to current, reconstruct it.
    const bFrom = (typeof o.bridgeFrom === 'number') ? (o.bridgeFrom | 0) : 0;
    const bTo = (typeof o.bridgeTo === 'number') ? (o.bridgeTo | 0) : 0;
    if (bFrom > 0 && bTo === idx && this.prev && (this.prev.index | 0) === bFrom) {
      // Build a full bridge between prev -> current.
      const from = this.prev;
      const to = this.current;
      const width = Math.max(140, Math.min(240, Math.round(Math.min(from.side, to.side) * 0.16)));
      const startY = from.bounds.minY;
      const endY = to.bounds.maxY;
      const minY = Math.min(startY, endY);
      const maxY = Math.max(startY, endY);
      const bx = from.centerX;
      const bounds = { minX: bx - width * 0.5, maxX: bx + width * 0.5, minY, maxY };
      this.bridge = { fromIndex: from.index | 0, toIndex: to.index | 0, width, bounds, startY, endY, t: 1, progress: 1, built: true };
    } else {
      this.bridge = null;
    }

    const wantNext = idx === 0 ? true : !!o.hasNext;
    if (wantNext && this.current.cleared) {
      this._ensureNextSpawned(String(o.nextBiome || ""));
      this._ensureBridge();
      if (this.bridge && typeof o.bridgeP === 'number') {
        const p = Math.max(0, Math.min(1, o.bridgeP));
        this.bridge.t = p;
        this.bridge.progress = p;
        this.bridge.built = p >= 0.999;
      } else if (this.bridge) {
        this.bridge.t = 1;
        this.bridge.progress = 1;
        this.bridge.built = true;
      }
    }

    this._applyDynamicBounds();
  }

  // ---- Room chain ---------------------------------------------------------

  _ensureNextSpawned(overrideBiomeKey = "") {
    if (!this.current) return;
    if (!this.current.cleared) return;
    if (this.next && !this.next.removed) return;

    const nextIndex = (this.current.index | 0) + 1;
    const nextSide = getRoomSide(nextIndex);
    const curHalf = this.current.side * 0.5;
    const nextHalf = nextSide * 0.5;

    // Forward is negative Y.
    const nextCenterX = this.current.centerX;
    const nextCenterY = this.current.centerY - (curHalf + GAP + nextHalf);

    // Pick biome for the next floor (floors 1–5 are neutral). Anti-repeat from current biome.
    const forced = String(overrideBiomeKey || "");
    const nextBiome = forced || biomeForFloorIndex(nextIndex, this.current ? (this.current.biomeKey || "") : this._lastBiomeKey);
    this.next = makeRoom(nextIndex, nextCenterX, nextCenterY, nextBiome);
  }

  _ensureBridge() {
    if (!this.current || !this.current.cleared) return;
    if (!this.next || this.next.removed) return;
    const from = this.current;
    const to = this.next;

    if (this.bridge && (this.bridge.fromIndex | 0) === (from.index | 0) && (this.bridge.toIndex | 0) === (to.index | 0)) {
      return;
    }

    const width = Math.max(140, Math.min(240, Math.round(Math.min(from.side, to.side) * 0.16)));

    const startY = from.bounds.minY;
    const endY = to.bounds.maxY;
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);

    const bx = from.centerX;
    const bounds = {
      minX: bx - width * 0.5,
      maxX: bx + width * 0.5,
      minY,
      maxY,
    };

    this.bridge = {
      fromIndex: from.index | 0,
      toIndex: to.index | 0,
      width,
      bounds,
      startY,
      endY,
      t: 0,
      progress: 0,
      built: false,
    };
  }

  _getBridgeBuiltBounds() {
    const br = this.bridge;
    if (!br || !this.current || !this.next) return null;
    const p = Math.max(0, Math.min(1, br.progress || 0));
    if (p <= 0.001) return null;
    const startY = br.startY;
    const endY = br.endY;
    const builtY = startY + (endY - startY) * p;
    return {
      minX: br.bounds.minX,
      maxX: br.bounds.maxX,
      minY: Math.min(startY, builtY),
      maxY: Math.max(startY, builtY),
    };
  }

  _enterNextRoom() {
    if (!this.next || !this.current) return;

    // Transition: move current -> next, but keep the previous floor + bridge
    // until ALL alive players enter the new floor.
    this.prev = this.current;
    this.prev.collapsing = false;
    this.prev.collapseT = 0;
    this.prev.removed = false;

    this.current = this.next;
    this.next = null;

    // Track last biome for anti-repeat.
    this._lastBiomeKey = this.current ? (this.current.biomeKey || "") : this._lastBiomeKey;

    // Now we are "waiting for party" on the new floor.
    this._waitForParty = true;


    // Notify systems.
    try {
      if (this.state) {
        this.state.currentRoomIndex = this.current.index | 0;
        this.state.currentZone = this._virtualZoneFromRoom(this.current.index | 0);
      }
    } catch {}

    try {
      const ss = this.state && this.state.spawnSystem;
      if (ss && typeof ss.onRoomChanged === "function") ss.onRoomChanged(this.current);
    } catch {}

    this._applyDynamicBounds();
  }

  isWaitingForParty() {
    return !!this._waitForParty;
  }

  _areAllAlivePlayersInCurrent(pad = 26) {
    const st = this.state;
    const b = this.current && this.current.bounds;
    if (!st || !b) return true;
    const ps = (st.players && st.players.length) ? st.players : (st.player ? [st.player] : []);
    for (const p of ps) {
      if (!p) continue;
      if (p._kicked) continue;
      if ((p.hp || 0) <= 0) continue; // alive players only
      if (!pointInAabb(p.x, p.y, b, pad)) return false;
    }
    return true;
  }

  _kickLeftBehindDownedPlayers() {
    const st = this.state;
    if (!st) return;
    const curIdx = this.current ? (this.current.index | 0) : 0;
    const curB = this.current ? this.current.bounds : null;

    const ps = (st.players && st.players.length) ? st.players : (st.player ? [st.player] : []);
    const kick = [];
    for (const p of ps) {
      if (!p) continue;
      if ((p.hp || 0) > 0) continue; // only downed/dead
      // If their corpse is not in the current floor bounds, they were left behind.
      if (!curB || !pointInAabb(p.x, p.y, curB, 28)) {
        kick.push(String(p.id || ""));
        p._kicked = true;
      }
    }

    if (kick.length) {
      st._kickIds = kick;
      st._kickIdsUntil = (typeof st.time === 'number' ? st.time : 0) + 2.0;
    }
  }

  _applyDynamicBounds() {
    if (!this.current) return;

    const base = this.current.bounds;

    // Dynamic bounds should include any active floors + bridge parts.
    let union = base;

    // If we are waiting for party (host entered next), keep previous floor + bridge in bounds.
    if (this.prev && !this.prev.removed) {
      union = unionAabb(union, this.prev.bounds, 20);
    }
    if (this.bridge && this.prev && !this.prev.removed) {
      union = unionAabb(union, this.bridge.bounds, 22);
    }

    // During "clear -> build bridge -> enter next" phase: allow moving onto the built bridge and into next.
    const hasNext = !!(this.current.cleared && this.next && !this.next.removed);
    if (hasNext) {
      this._ensureBridge();

      const builtPart = this._getBridgeBuiltBounds();
      if (builtPart) union = unionAabb(union, builtPart, 16);

      if (this.bridge && this.bridge.built) {
        union = unionAabb(union, this.bridge.bounds, 20);
        union = unionAabb(union, this.next.bounds, 20);
      }
    }

    setDynamicWorldBounds(union);

    // Keep state helper fields for HUD/snapshots.
    if (this.state) {
      this.state.currentRoomIndex = this.current.index | 0;
      this.state._roomSide = this.current.side | 0;
      this.state._hubSide = getRoomSide(0) | 0;
      this.state._roomCleared = !!this.current.cleared;
      this.state._roomHasNext = !!(this.next && !this.next.removed);

      // Biomes (floors 1–5 are neutral, 6+ randomized by host)
      this.state._roomBiome = String(this.current.biomeKey || "");
      this.state._nextRoomBiome = String((this.next && !this.next.removed) ? (this.next.biomeKey || "") : "");
      this.state._prevRoomBiome = String((this.prev && !this.prev.removed) ? (this.prev.biomeKey || "") : "");
      this.state._arenaLayoutId = String(this.current?.arenaSpec?.layoutId || "");
      this.state._arenaProfileId = String(this.current?.arenaSpec?.profileId || "");
      this.state._arenaVisualPreset = String(this.current?.arenaSpec?.visualPreset || "");
      this.state._arenaValidationIssues = Array.isArray(this.current?.arenaSpec?.validation?.issues) ? this.current.arenaSpec.validation.issues.slice(0, 8) : [];
      this.state._arenaValidationOk = !!this.current?.arenaSpec?.validation?.ok;
      this.state._arenaUsedFallback = !!this.current?.arenaSpec?.validation?.usedFallback;
      this.state._arenaValidationStats = this.current?.arenaSpec?.validation?.stats || null;

      this.state._bridgeP = this.bridge ? (this.bridge.progress || 0) : 0;
      this.state._bridgeBuilt = !!(this.bridge && this.bridge.built);


      this.state._prevRoomIndex = this.prev && !this.prev.removed ? (this.prev.index | 0) : 0;
      this.state._prevRoomCollapsing = !!(this.prev && this.prev.collapsing);
      this.state._prevRoomCollapseT = this.prev ? (this.prev.collapseT || 0) : 0;
      this.state._bridgeFrom = this.bridge ? (this.bridge.fromIndex | 0) : 0;
      this.state._bridgeTo = this.bridge ? (this.bridge.toIndex | 0) : 0;
      this.state._waitForParty = !!this._waitForParty;

      const gs = this.current && Array.isArray(this.current.breaches) ? this.current.breaches : [];
      this.state._gateHp = gs.map((g) => (g && typeof g.sealHp === 'number') ? g.sealHp : 0);
      this.state._gateMax = gs.map((g) => (g && typeof g.sealMax === 'number') ? g.sealMax : 0);
      this.state._gateReward = gs.map((g) => (g && (g.rewardSealed || ((g.rewardSealLeft || 0) > 0.02))) ? 1 : 0);
      this.state._gateRepair = gs.map((g) => (g && g.repairActive) ? (g.repairT || 0) : 0);
      this.state._gateRepairMode = gs.map((g) => (g && g.repairActive && String(g.repairMode || '').toLowerCase() === 'reward') ? 1 : 0);
      this.state._gatePressure = gs.map((g) => (g && typeof g.pressure === 'number') ? g.pressure : 0);
      this.state._gateUsed = gs.map((g) => (g && g.rewardUsed) ? 1 : 0);
    }
  }

  _cleanupRoomEntities(room) {
    if (!room || !this.state) return;
    const st = this.state;
    const b = room.bounds;

    // Enemies: force-remove without rewards.
    const es = Array.isArray(st.enemies) ? st.enemies : [];
    for (const e of es) {
      if (!e) continue;
      if ((e._roomIndex | 0) !== (room.index | 0)) continue;
      e._roomCleanup = true;
      e._noScore = true;
      e.onDeath = null;
      e.hp = 0;
      e._remove = true;
    }

    const inRoom = (o) => o && typeof o.x === 'number' && typeof o.y === 'number' && (o.x >= b.minX && o.x <= b.maxX && o.y >= b.minY && o.y <= b.maxY);

    const clearArr = (arrName) => {
      const arr = Array.isArray(st[arrName]) ? st[arrName] : null;
      if (!arr) return;
      for (let i = arr.length - 1; i >= 0; i--) {
        const o = arr[i];
        if (inRoom(o)) arr.splice(i, 1);
      }
    };

    clearArr('projectiles');
    clearArr('rockets');
    clearArr('xpOrbs');
    clearArr('summons');
  }

  _virtualZoneFromRoom(roomIndex) {
    const n = roomIndex | 0;
    if (n <= 0) return 0;
    return 1 + Math.floor((n - 1) / 10);
  }
}
