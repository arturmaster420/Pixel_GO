// Zones 2.0 — radial zones around world center (0,0)
//
// Zone 0 (Hub): safe, no enemies
// Zones 1–5: concentric rings
// Zone 6: outer ring + outer square (corners reserved for bosses)

// Hub shape (Zone 0): rounded square, centered at (0,0)
// NOTE: This is purely for zone logic + visuals. Keep tweaks minimal.
// Hub size tuning: make hub 2x smaller (side 600) and keep corners slightly rounded.
// Global world scale ("make the whole map 2x smaller")
// IMPORTANT: this scales only world-layout distances (zone radii / bounds / streaming).
// Combat feel (weapon ranges, enemy radii, etc.) is intentionally kept in world units.
export const WORLD_SCALE = 0.5;

export const HUB_HALF = 300;          // hub half-size (side = 600). Hub stays unscaled.
export const HUB_CORNER_R = 70;       // rounded corner radius (unscaled)

// Rounded-square hit test (with optional padding).
// Uses standard rounded-rect inclusion: clamp to corner circle.
export function isPointInHub(x, y, pad = 0) {
  const half = HUB_HALF + pad;
  const cr = Math.min(HUB_CORNER_R + pad, half);
  const inner = Math.max(half - cr, 0);

  const ax = Math.abs(x);
  const ay = Math.abs(y);

  // Quick reject
  if (ax > half || ay > half) return false;

  // Inside the straight edges region.
  if (ax <= inner || ay <= inner) return true;

  // Corner circle test.
  const dx = ax - inner;
  const dy = ay - inner;
  return (dx * dx + dy * dy) <= (cr * cr);
}

export const ZONE_RADII = {
  // Map size:
  // Zone 0: Hub (uses HUB_HALF for compatibility; actual hub test is isPointInHub())
  0: HUB_HALF,

  // Zones 1–5: concentric rings
  1: 5000 * WORLD_SCALE,
  2: 10000 * WORLD_SCALE,
  3: 15000 * WORLD_SCALE,
  4: 20000 * WORLD_SCALE,
  5: 25000 * WORLD_SCALE,

  // Zones 6–9: concentric squares (half-size), extending the world bounds.
  // Zone 6 matches the previous world boundary (keeps legacy Zone 6 corner content stable).
  6: 30000 * WORLD_SCALE,
  7: 35000 * WORLD_SCALE,
  8: 40000 * WORLD_SCALE,
  9: 45000 * WORLD_SCALE, // World outer bounds (half-size)
};

export const ZONE6_SQUARE_HALF = ZONE_RADII[6];
export const WORLD_SQUARE_HALF = ZONE_RADII[9];

// Corner points for Zone 6 (structure for future corner bosses)
export const ZONE6_CORNER_POINTS = [
  { x:  ZONE6_SQUARE_HALF, y:  ZONE6_SQUARE_HALF },
  { x: -ZONE6_SQUARE_HALF, y:  ZONE6_SQUARE_HALF },
  { x:  ZONE6_SQUARE_HALF, y: -ZONE6_SQUARE_HALF },
  { x: -ZONE6_SQUARE_HALF, y: -ZONE6_SQUARE_HALF },
];

// Backward-compatible signature:
// - getZone(x, y) recommended
// - getZone(y) legacy (treated as old vertical system fallback)
export function getZone(x, y) {
  if (typeof y === "undefined") {
    // Legacy fallback: keep behavior if any call site still uses getZone(y)
    const yy = x;
    const ay = Math.abs(yy);

    if (ay < ZONE_RADII[1]) return 1;
    if (ay < ZONE_RADII[2]) return 2;
    if (ay < ZONE_RADII[3]) return 3;
    if (ay < ZONE_RADII[4]) return 4;
    if (ay < ZONE_RADII[5]) return 5;

    // Zones 6–9: based on square half-size (legacy-safe approximation)
    if (ay < ZONE_RADII[6]) return 6;
    if (ay < ZONE_RADII[7]) return 7;
    if (ay < ZONE_RADII[8]) return 8;
    return 9;
  }

  // Zone 0 (Hub): rounded square safe area.
  if (isPointInHub(x, y)) return 0;

  const r = Math.hypot(x, y);

  const r1 = ZONE_RADII[1];
  const r2 = ZONE_RADII[2];
  const r3 = ZONE_RADII[3];
  const r4 = ZONE_RADII[4];
  const r5 = ZONE_RADII[5];

  if (r < r1) return 1;
  if (r < r2) return 2;
  if (r < r3) return 3;
  if (r < r4) return 4;
  if (r < r5) return 5;

  // Zones 6–9: square shells (half-size). This preserves the old Zone 6 "corner" space,
  // while allowing 3 new outer zones (currently empty).
  const a = Math.max(Math.abs(x), Math.abs(y));
  if (a < ZONE_RADII[6]) return 6;
  if (a < ZONE_RADII[7]) return 7;
  if (a < ZONE_RADII[8]) return 8;
  return 9;
}

export function getZoneScaling(zone) {
  // Zone 0 shares scaling of Zone 1 (but Zone 0 is safe anyway)
  const idx = Math.max(0, (zone | 0) - 1);
  return {
    // Balanced curve for 1–500 weapon progression:
    // - HP scales stronger than damage (so fights last longer, but don't one-shot)
    // - Speed scales gently (so higher zones feel faster, but still dodgeable)
    hp: 1 + idx * 0.65 + idx * idx * 0.05,
    damage: 1 + idx * 0.35 + idx * idx * 0.03,
    speed: 1 + idx * 0.08 + idx * idx * 0.01,
    xp: 1 + idx * 0.55,
  };
}

// Kept for compatibility (old spawn system used it).
// Zone 0 intentionally omitted (safe).
export const zoneTargetCounts = {
  1: { min: 10, max: 15 },
  2: { min: 15, max: 20 },
  3: { min: 20, max: 25 },
  4: { min: 25, max: 30 },
  5: { min: 30, max: 35 },
  6: { min: 35, max: 40 },
  // Zones 7–9 are currently content-empty (no spawning),
  // but keep counts for future balancing tools.
  7: { min: 40, max: 45 },
  8: { min: 45, max: 50 },
  9: { min: 50, max: 55 },
};


// ------------------------------------------------------------
// Clockface navigation helpers (Stage 1)
//
// Design goal: a simple "12-hour" orientation around world center.
// - 12 o'clock = up on screen
// - hour is derived from the angle of (x,y) relative to the center
// - ring is tied to the current zone number (0..6)
//
// NOTE: No HUD is rendered yet. These helpers are for future UI/coop calls.
// ------------------------------------------------------------

// Returns hour number 1..12.
// 12 o'clock is up (negative Y in canvas coordinates).
export function getClockHour(x, y) {
  // Near center: default to 12.
  if (!Number.isFinite(x) || !Number.isFinite(y) || (x * x + y * y) < 1e-6) return 12;

  // Angle from "up" direction, clockwise.
  // Using canvas convention: +Y is down, so "up" is -Y.
  const ang = Math.atan2(x, -y); // 0 at up, +CW
  let deg = ang * (180 / Math.PI);
  if (deg < 0) deg += 360;

  // Map to closest hour sector (12 sectors, 30° each).
  const idx = Math.floor((deg + 15) / 30) % 12; // 0..11 (rounded)
  return idx === 0 ? 12 : idx;
}

// Returns { hour: 1..12, ring: zone (0..6) }
export function getClockCoords(x, y) {
  return {
    hour: getClockHour(x, y),
    ring: getZone(x, y),
  };
}
