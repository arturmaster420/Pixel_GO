import { HUB_HALF } from "./zoneController.js";
import { setDynamicWorldBounds } from "./mapGenerator.js";

// Pixel_GO: infinite rooms in a chain.
// Forward direction = UP on screen = negative Y in world coords.

const GAP = 160; // gap between rooms (world units)
const COLLAPSE_DUR = 1.35; // seconds
const BRIDGE_BUILD_DUR = 1.15; // seconds

// Gates (SAS-like "breaches" in the platform edge).
// Player can temporarily patch (close) a gate.
const BREACH_PATCH_DUR = 10.0; // seconds
const BREACH_INTERACT_R = 160; // world units

// Room side length (v0.1 plan)
export function getRoomSide(roomIndex) {
  const hubSide = HUB_HALF * 2;
  const idx = (roomIndex | 0);

  // Pixel_GO tuning:
  // - Room 0 (Hub) keeps original hub size
  // - Room 1 is the same size as Hub
  // - Next rooms grow slower than v0.1
  if (idx <= 1) return hubSide;

  const n = idx;
  const GROWTH = 180; // smaller growth than before (was 350)
  const L = hubSide + GROWTH * Math.sqrt(Math.max(0, n - 1));
  return Math.round(L);
}

function makeRoom(index, centerX, centerY) {
  const side = getRoomSide(index);
  const half = side * 0.5;
  const bounds = {
    minX: centerX - half,
    maxX: centerX + half,
    minY: centerY - half,
    maxY: centerY + half,
  };

  const breaches = makeBreaches(index, bounds);
  return {
    id: `room_${index}`,
    index,
    // Cosmetic theme (biomes every 10 rooms, with slight per-room variation)
    hue: (() => {
      if ((index | 0) <= 0) return 210;
      const biome = Math.floor(((index | 0) - 1) / 10);
      return (210 + biome * 55 + (index | 0) * 7) % 360;
    })(),
    side,
    centerX,
    centerY,
    bounds,
    breaches,
    cleared: index === 0, // hub is always "cleared"
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

function makeBreaches(index, bounds) {
  const idx = index | 0;
  if (idx <= 0) return [];

  // Gates spawn on the edge of the platform in random places.
  // Rules:
  // - Do NOT spawn on the forward edge (north / minY) because the room->next bridge builds there.
  // - Do NOT spawn on the entry segment where the bridge brought us into this room (south / maxY, centered).
  const sides = ["S", "W", "E"]; // south/front, west/left, east/right
  const rnd = makeRng((0xBEE7CA0 ^ Math.imul(idx, 2654435761)) >>> 0);

  // Gate count progression (matches early rooms):
  // room1->1, room2->1, room3->2, room4->2, ... capped.
  const count = Math.max(1, Math.min(6, 1 + Math.floor(Math.max(0, idx - 1) / 2)));

  const sideLen = (bounds.maxX - bounds.minX);
  const margin = Math.max(110, Math.min(240, sideLen * 0.18));

  // Entry bridge lands on SOUTH edge, centered.
  const entryForbidden = Math.max(220, Math.min(520, sideLen * 0.28));
  const entryX0 = (bounds.minX + bounds.maxX) * 0.5 - entryForbidden * 0.5;
  const entryX1 = (bounds.minX + bounds.maxX) * 0.5 + entryForbidden * 0.5;

  const arr = [];
  const used = [];
  const minSep = Math.max(120, Math.min(260, sideLen * 0.22));

  const tryPick = (side) => {
    let x = 0;
    let y = 0;
    if (side === "S") {
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
        // Fallback: pick left/right away from entry.
        const left = rnd() < 0.5;
        x = left ? (bounds.minX + margin) : (bounds.maxX - margin);
        y = bounds.maxY;
      }
    } else if (side === "W") {
      x = bounds.minX;
      y = bounds.minY + margin + rnd() * ((bounds.maxY - bounds.minY) - margin * 2);
    } else {
      x = bounds.maxX;
      y = bounds.minY + margin + rnd() * ((bounds.maxY - bounds.minY) - margin * 2);
    }
    return { x, y };
  };

  for (let i = 0; i < count; i++) {
    let side = sides[Math.floor(rnd() * sides.length)];
    let pos = tryPick(side);

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
        side = sides[Math.floor(rnd() * sides.length)];
        pos = tryPick(side);
      }
    }

    used.push(pos);
    arr.push({
      id: `g_${idx}_${i}`,
      side,
      x: pos.x,
      y: pos.y,
      patchedLeft: 0,
    });
  }
  return arr;
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

export class RoomDirector {
  constructor(state) {
    this.state = state;

    this.prev = null;
    this.current = makeRoom(0, 0, 0);
    this.next = null;

    // Bridge connects current -> next after clear.
    // { fromIndex, toIndex, width, bounds, t, progress, built }
    this.bridge = null;

    this._ensureNextSpawned();
    this._applyDynamicBounds();
  }

  get roomIndex() {
    return this.current ? (this.current.index | 0) : 0;
  }

  get portalRect() {
    // Deprecated in Pixel_GO v0.2+: transitions use a building bridge.
    return null;
  }

  markCurrentCleared() {
    if (!this.current) return;
    if (this.current.cleared) return;
    this.current.cleared = true;
    this._ensureNextSpawned();
    this._ensureBridge();
    this._applyDynamicBounds();
  }

  update(dt) {
    // Update collapse animation and remove collapsed rooms.
    if (this.prev && this.prev.collapsing) {
      this.prev.collapseT += dt / COLLAPSE_DUR;
      if (this.prev.collapseT >= 1) {
        this.prev.collapseT = 1;
        this.prev.removed = true;
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

    // Ensure dynamic bounds are correct (union during transitions).
    this._applyDynamicBounds();

    // Update breach patch timers.
    try {
      const brs = this.current && Array.isArray(this.current.breaches) ? this.current.breaches : null;
      if (brs) {
        for (const b of brs) {
          if (!b) continue;
          if ((b.patchedLeft || 0) > 0) {
            b.patchedLeft -= dt;
            if (b.patchedLeft < 0) b.patchedLeft = 0;
          }
        }
      }
    } catch {}

    // Auto-enter next when player steps into next room.
    const st = this.state;
    const p = st && st.player;
    if (!p) return;

    // HUD hint: nearest breach patch interaction.
    try {
      const info = this.getNearestBreachInfo(p);
      if (st) st._breachHint = info;
    } catch {}

    if (this.current && this.current.cleared && this.next && !this.next.removed) {
      // Allow entering only after bridge is built.
      if (this.bridge && this.bridge.built) {
        if (pointInAabb(p.x, p.y, this.next.bounds, 10)) {
          this._enterNextRoom();
        }
      }
    }
  }

  getNearestBreachInfo(player) {
    const room = this.current;
    if (!room || (room.index | 0) <= 0) return null;
    const brs = Array.isArray(room.breaches) ? room.breaches : [];
    let best = null;
    let bestD2 = Infinity;
    for (const b of brs) {
      if (!b) continue;
      const ip = this.getBreachInnerPoint(room, b, 28);
      const dx = player.x - ip.x;
      const dy = player.y - ip.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = b;
      }
    }
    if (!best) return null;
    if (bestD2 > BREACH_INTERACT_R * BREACH_INTERACT_R) return null;
    return {
      gateId: best.id,
      canPatch: true,
      patchedLeft: best.patchedLeft || 0,
    };
  }

  tryPatchNearestBreach(player) {
    const info = this.getNearestBreachInfo(player);
    if (!info || !info.gateId) return false;
    return this.tryPatchGateById(info.gateId, player);
  }

  getGateById(gateId) {
    const room = this.current;
    if (!room || !Array.isArray(room.breaches)) return null;
    return room.breaches.find((g) => g && g.id === gateId) || null;
  }

  canPlayerInteractGate(player, gate) {
    if (!player || !gate || !this.current) return false;
    const ip = this.getBreachInnerPoint(this.current, gate, 28);
    const dx = player.x - ip.x;
    const dy = player.y - ip.y;
    return (dx * dx + dy * dy) <= (BREACH_INTERACT_R * BREACH_INTERACT_R);
  }

  // Host-authoritative: patch (close) a gate for a while.
  tryPatchGateById(gateId, player = null) {
    const gate = this.getGateById(gateId);
    if (!gate) return false;
    if (player && !this.canPlayerInteractGate(player, gate)) return false;
    // If already patched, don't refresh (prevents spam).
    if ((gate.patchedLeft || 0) > 0.05) return false;
    gate.patchedLeft = BREACH_PATCH_DUR;
    return true;
  }

  getBreachInnerPoint(room, breach, inset = 24) {
    const b = room.bounds;
    const side = breach.side;
    if (side === "W") return { x: b.minX + inset, y: breach.y };
    if (side === "E") return { x: b.maxX - inset, y: breach.y };
    if (side === "S") return { x: breach.x, y: b.maxY - inset };
    return { x: breach.x, y: b.minY + inset };
  }

  getBreachOuterPoint(room, breach, out = 80) {
    const b = room.bounds;
    const side = breach.side;
    if (side === "W") return { x: b.minX - out, y: breach.y };
    if (side === "E") return { x: b.maxX + out, y: breach.y };
    if (side === "S") return { x: breach.x, y: b.maxY + out };
    return { x: breach.x, y: b.minY - out };
  }


  /**
   * Joiners: force sync room state from host snapshot.
   * Rebuilds deterministic room positions for the requested roomIndex.
   */
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

    this.prev = null;
    this.current = makeRoom(idx, cx, cy);
    this.current.cleared = idx === 0 ? true : !!o.cleared;

    // Apply breach patches from host snapshot (joiners).
    if (Array.isArray(o.breachPatches) && Array.isArray(this.current.breaches)) {
      for (let i = 0; i < this.current.breaches.length; i++) {
        const v = o.breachPatches[i];
        if (typeof v === 'number' && this.current.breaches[i]) {
          this.current.breaches[i].patchedLeft = Math.max(0, v);
        }
      }
    }
    this.next = null;

    const wantNext = idx === 0 ? true : !!o.hasNext;
    if (wantNext && this.current.cleared) {
      this._ensureNextSpawned();
      this._ensureBridge();
      if (this.bridge && typeof o.bridgeP === 'number') {
        const p = Math.max(0, Math.min(1, o.bridgeP));
        this.bridge.t = p;
        this.bridge.progress = p;
        this.bridge.built = p >= 0.999;
      } else if (this.bridge) {
        // Default for joiners: show bridge as built if host says "hasNext".
        this.bridge.t = 1;
        this.bridge.progress = 1;
        this.bridge.built = true;
      }
    }

    this._applyDynamicBounds();
  }

  _ensureNextSpawned() {
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

    this.next = makeRoom(nextIndex, nextCenterX, nextCenterY);
  }

  _ensureBridge() {
    if (!this.current || !this.current.cleared) return;
    if (!this.next || this.next.removed) return;
    const from = this.current;
    const to = this.next;

    // If already built for this pair — keep.
    if (this.bridge && (this.bridge.fromIndex | 0) === (from.index | 0) && (this.bridge.toIndex | 0) === (to.index | 0)) {
      return;
    }

    const width = Math.max(140, Math.min(240, Math.round(Math.min(from.side, to.side) * 0.16)));

    // Connect from current top edge (minY) to next bottom edge (maxY).
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

    // Collapse previous room when player enters next.
    this.prev = this.current;
    this.prev.collapsing = true;
    this.prev.collapseT = 0;

    // Mark previous room entities for cleanup (no score, no drops).
    try { this._cleanupRoomEntities(this.prev); } catch {}

    this.current = this.next;
    this.next = null;
    this.bridge = null;

    // Notify systems.
    try {
      if (this.state) {
        this.state.currentRoomIndex = this.current.index | 0;
        // Host/joiner: keep zone-like number for legacy systems (optional)
        this.state.currentZone = this._virtualZoneFromRoom(this.current.index | 0);
      }
    } catch {}

    // Spawn system can reset per-room counters.
    try {
      const ss = this.state && this.state.spawnSystem;
      if (ss && typeof ss.onRoomChanged === "function") ss.onRoomChanged(this.current);
    } catch {}


    // If we just left Hub, we want the next rooms to be locked behind us (no return).
    // We don't keep older rooms beyond `prev`.

    // Bounds after enter: only current (until cleared, then union with next).
    this._applyDynamicBounds();
  }

  _applyDynamicBounds() {
    if (!this.current) return;

    const base = this.current.bounds;

    // During transition phase: allow moving onto the built bridge and into next.
    // While bridge is building, keep bounds locked to current only.
    let union = base;
    const hasNext = !!(this.current.cleared && this.next && !this.next.removed);
    if (hasNext) {
      this._ensureBridge();

      // Allow stepping onto the already-built part of the bridge while it constructs.
      const builtPart = this._getBridgeBuiltBounds();
      if (builtPart) union = unionAabb(union, builtPart, 16);

      // When fully built: include the whole bridge + next room.
      if (this.bridge && this.bridge.built) {
        union = unionAabb(union, this.bridge.bounds, 20);
        union = unionAabb(union, this.next.bounds, 20);
      }
    }

    setDynamicWorldBounds(union);

    // Keep state helper fields.
    if (this.state) {
      this.state.currentRoomIndex = this.current.index | 0;
      this.state._roomSide = this.current.side | 0;
      this.state._hubSide = getRoomSide(0) | 0;
      this.state._roomCleared = !!this.current.cleared;
      this.state._roomHasNext = !!(this.next && !this.next.removed);

      // Bridge sync helpers
      this.state._bridgeP = this.bridge ? (this.bridge.progress || 0) : 0;
      this.state._bridgeBuilt = !!(this.bridge && this.bridge.built);

      // Breach patch sync helper
      const brs = this.current && Array.isArray(this.current.breaches) ? this.current.breaches : [];
      this.state._breachPatches = brs.map((b) => (b && typeof b.patchedLeft === 'number') ? b.patchedLeft : 0);
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

    // Visual objects: clear anything still inside the collapsed room bounds.
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
    // summons are persistent by design, but we remove them if left behind.
    clearArr('summons');
  }


  _virtualZoneFromRoom(roomIndex) {
    const n = roomIndex | 0;
    if (n <= 0) return 0;
    return 1 + Math.floor((n - 1) / 10);
  }
}
