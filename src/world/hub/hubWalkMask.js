import { getHubSceneLayout } from './hubLayout.js';
import { getHubTexture, HUB_ASSET_URLS } from './hubAssets.js';

const HUB_MASK_CACHE = {
  source: null,
  ready: false,
  width: 0,
  height: 0,
  bits: null,
  sparseWalkable: [],
};

function hasDomCanvas() {
  return typeof document !== 'undefined' && !!document.createElement;
}

function getMaskEntry() {
  return getHubTexture(HUB_ASSET_URLS.walkMask);
}

function buildMaskCache(entry) {
  if (!entry?.loaded || !entry?.img || !hasDomCanvas()) return false;
  if (HUB_MASK_CACHE.ready && HUB_MASK_CACHE.source === entry.img) return true;

  const width = Math.max(1, Number(entry.img.naturalWidth || entry.img.width) || 1);
  const height = Math.max(1, Number(entry.img.naturalHeight || entry.img.height) || 1);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(entry.img, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;

  const bits = new Uint8Array(width * height);
  const sparseWalkable = [];
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const idx = row + x;
      const off = idx * 4;
      const r = rgba[off] || 0;
      const g = rgba[off + 1] || 0;
      const b = rgba[off + 2] || 0;
      const a = rgba[off + 3] || 0;
      const lum = (r * 0.299 + g * 0.587 + b * 0.114);
      const walkable = a > 127 && lum >= 127;
      bits[idx] = walkable ? 1 : 0;
      if (walkable && (x % 4 === 0) && (y % 4 === 0)) sparseWalkable.push(idx);
    }
  }

  HUB_MASK_CACHE.source = entry.img;
  HUB_MASK_CACHE.ready = true;
  HUB_MASK_CACHE.width = width;
  HUB_MASK_CACHE.height = height;
  HUB_MASK_CACHE.bits = bits;
  HUB_MASK_CACHE.sparseWalkable = sparseWalkable;
  return true;
}

function ensureMaskReady() {
  const entry = getMaskEntry();
  if (!entry?.loaded || !entry?.img) return null;
  if (!buildMaskCache(entry)) return null;
  return HUB_MASK_CACHE.ready ? HUB_MASK_CACHE : null;
}

export function warmHubWalkMask() {
  return getMaskEntry();
}

export function getDefaultHubMaskLayout({ cx = 0, cy = 0, side = 600 } = {}) {
  return {
    cx,
    cy,
    side,
    artSize: Math.max(2200, side * 4.8),
  };
}

function getLayout(arenaSpec, layoutOverride = null) {
  if (layoutOverride) return layoutOverride;
  if (arenaSpec) return getHubSceneLayout(arenaSpec);
  return getDefaultHubMaskLayout();
}

function worldToMask(layout, cache, x, y) {
  const left = layout.cx - layout.artSize * 0.5;
  const top = layout.cy - layout.artSize * 0.5;
  const u = (x - left) / Math.max(1e-6, layout.artSize);
  const v = (y - top) / Math.max(1e-6, layout.artSize);
  const px = Math.round(u * (cache.width - 1));
  const py = Math.round(v * (cache.height - 1));
  return { px, py };
}

function maskToWorld(layout, cache, px, py) {
  const left = layout.cx - layout.artSize * 0.5;
  const top = layout.cy - layout.artSize * 0.5;
  return {
    x: left + ((px + 0.5) / cache.width) * layout.artSize,
    y: top + ((py + 0.5) / cache.height) * layout.artSize,
  };
}

function pixelWalkable(cache, px, py) {
  if (!cache || !cache.ready) return false;
  if (px < 0 || py < 0 || px >= cache.width || py >= cache.height) return false;
  return cache.bits[py * cache.width + px] === 1;
}

function makeSampleOffsets(radiusPx) {
  const r = Math.max(0, Number(radiusPx) || 0);
  if (r <= 0.75) return [{ x: 0, y: 0 }];
  const q = r * 0.70710678;
  const offsets = [
    { x: 0, y: 0 },
    { x: r, y: 0 },
    { x: -r, y: 0 },
    { x: 0, y: r },
    { x: 0, y: -r },
    { x: q, y: q },
    { x: q, y: -q },
    { x: -q, y: q },
    { x: -q, y: -q },
  ];
  if (r >= 2) {
    const inner = r * 0.55;
    offsets.push(
      { x: inner, y: 0 },
      { x: -inner, y: 0 },
      { x: 0, y: inner },
      { x: 0, y: -inner },
    );
  }
  return offsets;
}

function isWorldPointWalkableWithCache(layout, cache, x, y, pad = 0) {
  const radiusPx = Math.max(0, (Number(pad) || 0) * (cache.width / Math.max(1e-6, layout.artSize)));
  const offsets = makeSampleOffsets(radiusPx);
  for (const off of offsets) {
    const p = worldToMask(layout, cache, x + (off.x / cache.width) * layout.artSize, y + (off.y / cache.height) * layout.artSize);
    if (!pixelWalkable(cache, p.px, p.py)) return false;
  }
  return true;
}

export function isHubMaskPointWalkable(arenaSpec, x, y, { pad = 0, layoutOverride = null } = {}) {
  const cache = ensureMaskReady();
  if (!cache) return null;
  const layout = getLayout(arenaSpec, layoutOverride);
  return isWorldPointWalkableWithCache(layout, cache, x, y, pad);
}

function clampByBinarySearch(layout, cache, x, y, preferX, preferY, pad = 0) {
  if (!Number.isFinite(preferX) || !Number.isFinite(preferY)) return null;
  if (!isWorldPointWalkableWithCache(layout, cache, preferX, preferY, pad)) return null;
  let ax = preferX;
  let ay = preferY;
  let bx = x;
  let by = y;
  for (let i = 0; i < 14; i++) {
    const mx = (ax + bx) * 0.5;
    const my = (ay + by) * 0.5;
    if (isWorldPointWalkableWithCache(layout, cache, mx, my, pad)) {
      ax = mx;
      ay = my;
    } else {
      bx = mx;
      by = my;
    }
  }
  return { x: ax, y: ay };
}

function nearestWalkableAround(layout, cache, x, y, pad = 0, maxSearchPx = 120) {
  const center = worldToMask(layout, cache, x, y);
  const limit = Math.max(8, Math.min(maxSearchPx | 0, Math.max(cache.width, cache.height)));
  for (let r = 1; r <= limit; r++) {
    const steps = Math.max(12, Math.ceil(Math.PI * 2 * r * 0.85));
    let best = null;
    let bestD2 = Infinity;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const px = center.px + Math.round(Math.cos(a) * r);
      const py = center.py + Math.round(Math.sin(a) * r);
      if (!pixelWalkable(cache, px, py)) continue;
      const world = maskToWorld(layout, cache, px, py);
      if (!isWorldPointWalkableWithCache(layout, cache, world.x, world.y, pad)) continue;
      const dx = world.x - x;
      const dy = world.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = world;
      }
    }
    if (best) return best;
  }
  return null;
}

export function clampPointToHubMask(arenaSpec, x, y, {
  pad = 0,
  preferX = null,
  preferY = null,
  layoutOverride = null,
  maxSearchPx = 120,
} = {}) {
  const cache = ensureMaskReady();
  if (!cache) return null;
  const layout = getLayout(arenaSpec, layoutOverride);
  if (isWorldPointWalkableWithCache(layout, cache, x, y, pad)) return { x, y };

  const line = clampByBinarySearch(layout, cache, x, y, preferX, preferY, pad);
  if (line) return line;

  const near = nearestWalkableAround(layout, cache, x, y, pad, maxSearchPx);
  if (near) return near;

  const sparse = cache.sparseWalkable;
  if (sparse && sparse.length) {
    let best = null;
    let bestD2 = Infinity;
    const stride = Math.max(1, Math.floor(sparse.length / 512));
    for (let i = 0; i < sparse.length; i += stride) {
      const idx = sparse[i];
      const px = idx % cache.width;
      const py = (idx / cache.width) | 0;
      const world = maskToWorld(layout, cache, px, py);
      if (!isWorldPointWalkableWithCache(layout, cache, world.x, world.y, pad)) continue;
      const dx = world.x - x;
      const dy = world.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = world;
      }
    }
    if (best) return best;
  }

  return null;
}

export function getRandomHubMaskPoint(arenaSpec, { pad = 0, layoutOverride = null } = {}) {
  const cache = ensureMaskReady();
  if (!cache) return null;
  const layout = getLayout(arenaSpec, layoutOverride);
  const sparse = cache.sparseWalkable;
  if (!sparse || !sparse.length) return null;
  for (let i = 0; i < 64; i++) {
    const idx = sparse[(Math.random() * sparse.length) | 0];
    const px = idx % cache.width;
    const py = (idx / cache.width) | 0;
    const world = maskToWorld(layout, cache, px, py);
    if (isWorldPointWalkableWithCache(layout, cache, world.x, world.y, pad)) return world;
  }
  return null;
}
