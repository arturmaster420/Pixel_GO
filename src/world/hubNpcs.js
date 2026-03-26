// Hub NPCs (static world objects) — used for in-hub interactions (Shop / Tier Master).
// These are purely client-side visuals + interaction triggers; they do NOT affect simulation/network.

import { isPointInHub, HUB_HALF, HUB_CORNER_R } from "./zoneController.js";

export const HUB_NPCS = (() => {
  const inset = Math.round(Math.max(90, HUB_CORNER_R + 20));
  const xCorner = HUB_HALF - inset;
  const yCorner = -HUB_HALF + inset;

  return [
    {
      id: "shop",
      kind: "shop",
      name: "Merchant",
      emoji: "🛒",
      x: -xCorner,
      y: yCorner,
      r: Math.max(90, Math.round(HUB_HALF * 0.35)),
      scale: 0.5,
    },
    {
      id: "tier",
      kind: "tier",
      name: "Death Shop~Up",
      emoji: "🧙",
      x: xCorner,
      y: yCorner,
      r: Math.max(90, Math.round(HUB_HALF * 0.35)),
      scale: 0.5,
    },
    {
      id: "basic",
      kind: "basic",
      name: "Basic Core",
      emoji: "⚙️",
      x: 0,
      y: yCorner + Math.round(HUB_HALF * 0.08),
      r: Math.max(132, Math.round(HUB_HALF * 0.38)),
      scale: 0.92,
    },
    {
      id: "arsenal",
      kind: "arsenal",
      name: "Arsenal Wing",
      emoji: "🗡️",
      x: -Math.round(HUB_HALF * 0.72),
      y: -Math.round(HUB_HALF * 0.12),
      r: Math.max(110, Math.round(HUB_HALF * 0.28)),
      scale: 0.62,
    },
    {
      id: "forge",
      kind: "forge",
      name: "Forge Wing",
      emoji: "⚒️",
      x: Math.round(HUB_HALF * 0.72),
      y: -Math.round(HUB_HALF * 0.12),
      r: Math.max(110, Math.round(HUB_HALF * 0.28)),
      scale: 0.62,
    },
    {
      id: "essence",
      kind: "essence",
      name: "Essence Conflux",
      emoji: "✨",
      x: -Math.round(HUB_HALF * 0.62),
      y: Math.round(HUB_HALF * 0.44),
      r: Math.max(112, Math.round(HUB_HALF * 0.3)),
      scale: 0.64,
    },
    {
      id: "mastery",
      kind: "mastery",
      name: "Mastery Archive",
      emoji: "📘",
      x: Math.round(HUB_HALF * 0.66),
      y: Math.round(HUB_HALF * 0.44),
      r: Math.max(112, Math.round(HUB_HALF * 0.3)),
      scale: 0.64,
    },
    {
      id: "reset",
      kind: "reset",
      name: "Expedition Reset",
      emoji: "↺",
      x: Math.round(HUB_HALF * 0.16),
      y: -Math.round(HUB_HALF * 0.32),
      r: Math.max(96, Math.round(HUB_HALF * 0.24)),
      scale: 0.58,
    },
  ];
})();

function getActiveHubNpcs(state = null) {
  const fallback = HUB_NPCS;
  const anchors = state?.roomDirector?.current?.arenaSpec?.anchors?.hubNpcAnchors;
  if (!anchors || typeof anchors !== "object") return fallback;

  const npcById = {
    shop: { id: "shop", kind: "shop", name: "Merchant", emoji: "🛒", scale: 0.54, r: 96 },
    tier: { id: "tier", kind: "tier", name: "Death Shop~Up", emoji: "🧙", scale: 0.54, r: 96 },
    basic: { id: "basic", kind: "basic", name: "Basic Core", emoji: "⚙️", scale: 0.96, r: 138 },
    arsenal: { id: "arsenal", kind: "arsenal", name: "Arsenal Wing", emoji: "🗡️", scale: 0.66, r: 112 },
    forge: { id: "forge", kind: "forge", name: "Forge Wing", emoji: "⚒️", scale: 0.66, r: 112 },
    essence: { id: "essence", kind: "essence", name: "Essence Conflux", emoji: "✨", scale: 0.68, r: 116 },
    mastery: { id: "mastery", kind: "mastery", name: "Mastery Archive", emoji: "📘", scale: 0.68, r: 116 },
    reset: { id: "reset", kind: "reset", name: "Expedition Reset", emoji: "↺", scale: 0.60, r: 102 },
  };

  const out = [];
  for (const [id, base] of Object.entries(npcById)) {
    const p = anchors[id];
    if (!p || !Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.y))) continue;
    out.push({ ...base, x: Number(p.x), y: Number(p.y) });
  }
  return out.length ? out : fallback;
}

export function getNearbyHubNpcForPlayer(player, state = null) {
  if (!player) return null;
  const inHub = state?.roomDirector?.current?.index <= 0 ? true : isPointInHub(player.x, player.y, 10);
  if (!inHub) return null;

  let best = null;
  let bestD2 = Infinity;
  for (const n of getActiveHubNpcs(state)) {
    const dx = player.x - n.x;
    const dy = player.y - n.y;
    const d2 = dx * dx + dy * dy;
    const r = n.r || 120;
    if (d2 <= r * r && d2 < bestD2) {
      best = n;
      bestD2 = d2;
    }
  }
  return best;
}

export function renderHubNpcs(ctx, state) {
  // world-space render (camera already applied)
  if (!state || state.mode !== "playing") return;
  const room = state?.roomDirector?.current;
  const isHubRoom = !!room && (((room.index | 0) <= 0) || !!room?.arenaSpec?.rules?.isHub || String(room?.biomeKey || '').toLowerCase() === 'hub');
  if (!isHubRoom) return;

  for (const n of getActiveHubNpcs(state)) {
    // Soft marker
    ctx.save();
    ctx.globalAlpha = 0.9;

    // Base sizes in WORLD units (scaled by camera transform).
    const sc = (typeof n.scale === "number" ? n.scale : 1);
    const base = 46 * sc;
    const ring = 54 * sc;

    const isBasic = n.kind === "basic";
    const pulse = 0.82 + 0.18 * Math.sin((state.time || 0) * 3.4);

    // Glow / beacon for high-importance NPCs.
    if (isBasic) {
      const glow = ctx.createRadialGradient(n.x, n.y, ring * 0.18, n.x, n.y, ring * 1.95);
      glow.addColorStop(0, `rgba(120,220,255,${0.28 * pulse})`);
      glow.addColorStop(0.42, `rgba(120,220,255,${0.16 * pulse})`);
      glow.addColorStop(1, 'rgba(120,220,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(n.x, n.y, ring * 2.0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ring
    ctx.beginPath();
    ctx.strokeStyle = isBasic ? `rgba(150,240,255,${0.62 + 0.14 * pulse})` : "rgba(255,255,255,0.22)";
    ctx.lineWidth = (isBasic ? 6 : 4) * sc;
    ctx.arc(n.x, n.y, ring * (isBasic ? (1.02 + 0.06 * pulse) : 1), 0, Math.PI * 2);
    ctx.stroke();

    if (isBasic) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(255,245,180,${0.45 + 0.10 * pulse})`;
      ctx.lineWidth = 2.5 * sc;
      ctx.arc(n.x, n.y, ring * 1.28, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Emoji
    ctx.font = (isBasic ? base * 1.16 : base) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = isBasic ? 'rgba(0,20,28,0.95)' : 'rgba(0,0,0,0.65)';
    ctx.lineWidth = (isBasic ? 6 : 4) * sc;
    ctx.strokeText(n.emoji || "🙂", n.x, n.y + 2 * sc);
    ctx.fillStyle = "#fff";
    ctx.fillText(n.emoji || "🙂", n.x, n.y + 2 * sc);

    // Small name label with contrast backing.
    const label = n.name || "";
    ctx.font = ((isBasic ? 18 : 16) * sc) + "px sans-serif";
    const tw = ctx.measureText(label).width;
    const padX = 10 * sc;
    const padY = 5 * sc;
    const lx = n.x - tw * 0.5 - padX;
    const ly = n.y + 46 * sc;
    const lw = tw + padX * 2;
    const lh = (isBasic ? 24 : 22) * sc;
    ctx.fillStyle = isBasic ? 'rgba(8,22,32,0.88)' : 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(lx, ly, lw, lh, 8 * sc);
    else ctx.rect(lx, ly, lw, lh);
    ctx.fill();
    ctx.strokeStyle = isBasic ? 'rgba(150,240,255,0.65)' : 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5 * sc;
    ctx.stroke();
    ctx.fillStyle = isBasic ? 'rgba(245,252,255,0.98)' : 'rgba(255,255,255,0.9)';
    ctx.fillText(label, n.x, ly + lh * 0.5 + 0.5 * sc);

    ctx.restore();
  }
}

// Convert world position to screen position for prompt placement.
export function worldToScreen(wx, wy, state) {
  const cam = state.camera;
  const canvas = state.canvas;
  const w = canvas.width;
  const h = canvas.height;
  const z = cam.zoom || 1;
  const sx = (wx - cam.x) * z + w / 2;
  const sy = (wy - cam.y) * z + h / 2;
  return { x: sx, y: sy };
}

export function screenToWorld(sx, sy, state) {
  const cam = state.camera;
  const canvas = state.canvas;
  const w = canvas.width;
  const h = canvas.height;
  const z = cam.zoom || 1;
  const wx = (sx - w / 2) / z + cam.x;
  const wy = (sy - h / 2) / z + cam.y;
  return { x: wx, y: wy };
}

export function findNpcAtWorldPos(wx, wy, state = null) {
  for (const n of getActiveHubNpcs(state)) {
    const dx = wx - n.x;
    const dy = wy - n.y;
    const r = (n.r || 120) * 0.9;
    if (dx * dx + dy * dy <= r * r) return n;
  }
  return null;
}
