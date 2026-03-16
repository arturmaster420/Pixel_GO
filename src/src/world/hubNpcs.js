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
      name: "Tier Master",
      emoji: "🧙",
      x: xCorner,
      y: yCorner,
      r: Math.max(90, Math.round(HUB_HALF * 0.35)),
      scale: 0.5,
    },
  ];
})();

function getActiveHubNpcs(state = null) {
  const fallback = HUB_NPCS;
  const anchors = state?.roomDirector?.current?.arenaSpec?.anchors?.hubNpcAnchors;
  if (!anchors || typeof anchors !== "object") return fallback;

  const npcById = {
    shop: { id: "shop", kind: "shop", name: "Merchant", emoji: "🛒", scale: 0.54, r: 96 },
    tier: { id: "tier", kind: "tier", name: "Tier Master", emoji: "🧙", scale: 0.54, r: 96 },
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
  const p = state.player;
  // Only show NPCs when near hub (prevents clutter).
  if (!p || !isPointInHub(p.x, p.y, 400)) return;

  for (const n of getActiveHubNpcs(state)) {
    // Soft marker
    ctx.save();
    ctx.globalAlpha = 0.9;

    // Base sizes in WORLD units (scaled by camera transform).
    const sc = (typeof n.scale === "number" ? n.scale : 1);
    const base = 46 * sc;
    const ring = 54 * sc;

    // Ring
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 4 * sc;
    ctx.arc(n.x, n.y, ring, 0, Math.PI * 2);
    ctx.stroke();

    // Emoji
    ctx.font = base + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(n.emoji || "🙂", n.x, n.y + 2 * sc);

    // Small name label
    ctx.globalAlpha = 0.75;
    ctx.font = (16 * sc) + "px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(n.name || "", n.x, n.y + 56 * sc);

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
