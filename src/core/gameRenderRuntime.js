import { renderRoomsBackground } from "../world/roomRenderer.js";
import { getZone, ZONE_RADII, ZONE6_SQUARE_HALF, WORLD_SQUARE_HALF, HUB_HALF, HUB_CORNER_R } from "../world/zoneController.js";
import { REVIVE_CHANNEL_SEC, REVIVE_INTERACT_R } from "./lifecycleRuntime.js";
import { getProgPickupTint } from "./resourceOrbUiRuntime.js";

export function renderPersistentHubCoreOverlay(ctx, state) {
    try {
      const rd = state?.roomDirector;
      const room = rd?.current;
      const spec = room?.arenaSpec;
      const isHub = !!spec?.rules?.isHub || String(room?.biomeKey || '').toLowerCase() === 'hub' || ((room?.index | 0) === 0);
      if (!isHub) return;
      const coreAnchor = spec?.anchors?.hubNpcAnchors?.basic || spec?.anchors?.hubNpcAnchors?.basicCore || spec?.anchors?.hubNpcAnchors?.core || null;
      const center = coreAnchor || spec?.bossArena?.center || { x: room?.centerX || 0, y: room?.centerY || 0 };
      const cx = Number(center?.x) || 0;
      const cy = Number(center?.y) || 0;
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
      const t = Number(state?.time || 0);
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.8);
      const r0 = Math.max(42, (room?.side || 1000) * 0.055);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r0 * 2.8);
      glow.addColorStop(0, `rgba(215,250,255,${0.26 + pulse * 0.10})`);
      glow.addColorStop(0.35, `rgba(130,220,255,${0.14 + pulse * 0.06})`);
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, r0 * 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = `rgba(170,245,255,${0.46 + pulse * 0.18})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, r0 * 1.14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(235,250,255,${0.40 + pulse * 0.14})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(cx, cy, r0 * 0.56, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(232,248,255,${0.36 + pulse * 0.18})`;
      ctx.beginPath();
      ctx.arc(cx, cy, r0 * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } catch {}
  }

  
export function renderWorldBackground(state, ctx) {
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


export function hubRayT(dx, dy) {
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



    
export function renderEnemies(state, ctx) {
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


export function renderSkillFxWorld(state, ctx) {
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

  // Burst rings (fire / ice / electric / dark / light)
  for (const ex of exs) {
    const p = 1 - Math.max(0, Math.min(1, (ex.t || 0) / 0.35));
    const rr = (ex.r || 0) * (0.65 + p * 0.55);
    let stroke = `rgba(255,120,60,${0.55 * (1 - p)})`;
    if (ex.kind === 'ice') stroke = `rgba(130,220,255,${0.55 * (1 - p)})`;
    else if (ex.kind === 'electric') stroke = `rgba(170,245,255,${0.56 * (1 - p)})`;
    else if (ex.kind === 'dark') stroke = `rgba(186,120,255,${0.56 * (1 - p)})`;
    else if (ex.kind === 'light') stroke = `rgba(255,244,176,${0.56 * (1 - p)})`;
    ctx.beginPath();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 4;
    ctx.arc(ex.x, ex.y, rr, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}


export function renderSummons(state, ctx) {
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


export function renderProjectiles(state, ctx) {
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
      const isIb = (b.type === 'iceball');
      const isIceShard = (b.type === 'iceShard');
      const s = (isFb || isIb || isIceShard) ? Math.max(6, Math.min(14, r * 2.2)) : Math.max(3, Math.min(8, r * 1.8));
      ctx.fillStyle = isFb ? "rgba(255,120,60,0.95)" : ((isIb || isIceShard) ? "rgba(130,220,255,0.95)" : "#f4e9a3");
      ctx.fillRect(b.x - s * 0.5, b.y - s * 0.5, s, s);
    }
      const maxRockets = 80;
  const stepR = rockets.length > maxRockets ? Math.ceil(rockets.length / maxRockets) : 1;

  for (let i = 0; i < rockets.length; i += stepR) {
    const rkt = rockets[i];
    if (!rkt) continue;
    ctx.fillStyle = rkt.type === "bomb" ? "#cfcfcf" : (rkt.type === "fireBomb" ? "#ff8a4c" : (rkt.type === "iceBomb" ? "#9be8ff" : (rkt.type === "energyBomb" ? "#92f7ff" : "#ff7a3c")));
    ctx.fillRect(rkt.x - 2, rkt.y - 2, 4, 4);
  }
} else {
    for (const b of projectiles) {
      if (!b) continue;
      const isFb = (b.type === 'fireball');
      const isIb = (b.type === 'iceball');
      const isIceShard = (b.type === 'iceShard');
      if (isFb || isIb || isIceShard) {
        const r = Math.max(isIceShard ? 4 : 6, (b.radius || (isIceShard ? 5 : 10)));
        ctx.beginPath();
        ctx.fillStyle = (isIb || isIceShard) ? "rgba(130,220,255,0.92)" : "rgba(255,120,60,0.92)";
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.strokeStyle = (isIb || isIceShard) ? "rgba(225,245,255,0.62)" : "rgba(255,220,170,0.55)";
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

    for (const rkt of rockets) {
  if (!rkt) continue;
  ctx.beginPath();
  ctx.fillStyle = rkt.type === "bomb" ? "#cfcfcf" : (rkt.type === "fireBomb" ? "#ff8a4c" : (rkt.type === "iceBomb" ? "#9be8ff" : (rkt.type === "energyBomb" ? "#92f7ff" : "#ff7a3c")));
  ctx.arc(rkt.x, rkt.y, rkt.radius || (rkt.type === "bomb" ? 7 : 6), 0, Math.PI * 2);
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


export function renderXPOrbs(state, ctx) {
  ctx.save();
  for (const orb of state.xpOrbs) {
    const kind = orb.kind || (orb.coins ? "coin" : "xp");
    if (kind === 'prog') {
      const tint = getProgPickupTint(orb);
      const radius = orb.radius || 9;
      const gg = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, radius * 2.4);
      gg.addColorStop(0, tint.glow);
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, radius * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tint.fill;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = `${Math.max(10, Math.floor(radius * 1.35))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tint.glyph || '◆', orb.x, orb.y + 0.5);
      continue;
    }
    ctx.fillStyle = (kind === "coin") ? "#ffd34a" : "#5af2ff";
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, orb.radius || 8, 0, Math.PI * 2);
    ctx.fill();
    if (kind === "coin") {
      ctx.fillStyle = "rgba(255,255,255,0.70)";
      ctx.beginPath();
      ctx.arc(orb.x - 2, orb.y - 2, Math.max(1, (orb.radius || 8) * 0.25), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}


export function renderPlayers(state, ctx) {
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
        const extraAt4 = metaLvl >= 2 ? 1 : 0;
        const extraAt6 = metaLvl >= 3 ? 1 : 0;

        count = 2;
        if (satLvl >= 4) count += 1 + extraAt4;
        if (satLvl >= 6) count += 1 + extraAt6;
        count = Math.min(6, Math.max(2, count));

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
          const vis = p._spiritVis;
          let count = 0;
          if (vis && Array.isArray(vis.list) && vis.list.length) {
            count = Math.max(1, vis.list.length | 0);
          } else {
            const meta = (p._metaSkillMeta && typeof p._metaSkillMeta === "object") ? p._metaSkillMeta : null;
            const metaLvl = meta ? (meta["skill:spirit"] | 0) : 0;
            const extraAt4 = metaLvl >= 2 ? 1 : 0;
            const extraAt6 = metaLvl >= 3 ? 1 : 0;

            count = 2;
            if (spLvl >= 4) count += 1 + extraAt4;
            if (spLvl >= 6) count += 1 + extraAt6;
            count = Math.min(6, Math.max(2, count));
          }

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


export function renderHPBarsWorld(state, ctx) {
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


export function renderBuffAuras(state, ctx) {
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


export function renderPopups(ctx, state) {
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

