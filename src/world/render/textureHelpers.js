import { getBiomeArtAssetSet } from "../biomeArtAssets.js";

const roomTextureCache = new Map();

export function getRoomTexture(url) {
  if (!url) return null;
  let entry = roomTextureCache.get(url);
  if (entry) return entry;
  const img = new Image();
  entry = { img, loaded: false, url };
  img.onload = () => { entry.loaded = true; };
  img.onerror = () => { entry.loaded = false; entry.error = true; };
  img.src = url;
  roomTextureCache.set(url, entry);
  return entry;
}

export function drawImageCoverScreen(ctx, entry, x, y, w, h, alpha = 1, ox = 0, oy = 0, scaleMul = 1) {
  if (!entry?.loaded || !entry?.img) return false;
  const imgW = Math.max(1, Number(entry.img.naturalWidth || entry.img.width) || 1);
  const imgH = Math.max(1, Number(entry.img.naturalHeight || entry.img.height) || 1);
  const scale = Math.max(w / imgW, h / imgH) * Math.max(0.01, scaleMul);
  const dw = imgW * scale;
  const dh = imgH * scale;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.drawImage(entry.img, x + (w - dw) * 0.5 + ox, y + (h - dh) * 0.5 + oy, dw, dh);
  ctx.restore();
  return true;
}

function makeLocalCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(w) || 1);
  c.height = Math.max(1, Math.floor(h) || 1);
  return c;
}

function getApproxAlphaTrim(entry) {
  if (!entry?.loaded || !entry?.img) return null;
  if (entry.alphaTrimComputed) return entry.alphaTrim || null;
  entry.alphaTrimComputed = true;
  try {
    const imgW = Math.max(1, Number(entry.img.naturalWidth || entry.img.width) || 1);
    const imgH = Math.max(1, Number(entry.img.naturalHeight || entry.img.height) || 1);
    const maxSide = 512;
    const scale = Math.min(1, maxSide / Math.max(imgW, imgH));
    const sw = Math.max(1, Math.round(imgW * scale));
    const sh = Math.max(1, Math.round(imgH * scale));
    const c = makeLocalCanvas(sw, sh);
    if (!c) return null;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return null;
    g.clearRect(0, 0, sw, sh);
    g.drawImage(entry.img, 0, 0, sw, sh);
    const data = g.getImageData(0, 0, sw, sh).data;
    let minX = sw, minY = sh, maxX = -1, maxY = -1;
    for (let y = 0; y < sh; y++) {
      const row = y * sw * 4;
      for (let x = 0; x < sw; x++) {
        const a = data[row + x * 4 + 3] || 0;
        if (a <= 12) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < minX || maxY < minY) { entry.alphaTrim = null; return null; }
    entry.alphaTrim = { minX: minX / sw, minY: minY / sh, maxX: maxX / sw, maxY: maxY / sh };
    return entry.alphaTrim;
  } catch {
    entry.alphaTrim = null;
    return null;
  }
}

export function drawImageCoverRect(ctx, entry, x, y, w, h, alpha = 1, ox = 0, oy = 0, scaleMul = 1, useAlphaTrim = false) {
  if (!entry?.loaded || !entry?.img) return false;
  const imgW = Math.max(1, Number(entry.img.naturalWidth || entry.img.width) || 1);
  const imgH = Math.max(1, Number(entry.img.naturalHeight || entry.img.height) || 1);
  const trim = useAlphaTrim ? getApproxAlphaTrim(entry) : null;
  const sx = trim ? Math.max(0, Math.min(imgW - 1, Math.floor(trim.minX * imgW))) : 0;
  const sy = trim ? Math.max(0, Math.min(imgH - 1, Math.floor(trim.minY * imgH))) : 0;
  const sw = trim ? Math.max(1, Math.ceil((trim.maxX - trim.minX) * imgW)) : imgW;
  const sh = trim ? Math.max(1, Math.ceil((trim.maxY - trim.minY) * imgH)) : imgH;
  const scale = Math.max(w / sw, h / sh) * Math.max(0.01, scaleMul);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.drawImage(entry.img, sx, sy, sw, sh, x + (w - dw) * 0.5 + ox, y + (h - dh) * 0.5 + oy, dw, dh);
  ctx.restore();
  return true;
}

export function drawImageContainRect(ctx, entry, x, y, w, h, alpha = 1, ox = 0, oy = 0, scaleMul = 1, useAlphaTrim = false) {
  if (!entry?.loaded || !entry?.img) return false;
  const imgW = Math.max(1, Number(entry.img.naturalWidth || entry.img.width) || 1);
  const imgH = Math.max(1, Number(entry.img.naturalHeight || entry.img.height) || 1);
  const trim = useAlphaTrim ? getApproxAlphaTrim(entry) : null;
  const sx = trim ? Math.max(0, Math.min(imgW - 1, Math.floor(trim.minX * imgW))) : 0;
  const sy = trim ? Math.max(0, Math.min(imgH - 1, Math.floor(trim.minY * imgH))) : 0;
  const sw = trim ? Math.max(1, Math.ceil((trim.maxX - trim.minX) * imgW)) : imgW;
  const sh = trim ? Math.max(1, Math.ceil((trim.maxY - trim.minY) * imgH)) : imgH;
  const scale = Math.min(w / sw, h / sh) * Math.max(0.01, scaleMul);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.drawImage(entry.img, sx, sy, sw, sh, x + (w - dw) * 0.5 + ox, y + (h - dh) * 0.5 + oy, dw, dh);
  ctx.restore();
  return true;
}

export function getLoadedBiomeArenaEntry(room, layer = 'surface') {
  const biomeKey = String(room?.biomeKey || 'neutral').toLowerCase();
  const set = getBiomeArtAssetSet(biomeKey);
  const entry = set?.[layer] || null;
  if (entry?.loaded && entry?.img) return entry;
  return null;
}

export function hasLoadedBiomeArenaArt(room, layer = 'surface') {
  return !!getLoadedBiomeArenaEntry(room, layer);
}

export function drawBiomeArenaArt(ctx, room, x0, y0, w, h, opts = {}) {
  // Backward-compatible parser:
  // new: drawBiomeArenaArt(ctx, room, x0, y0, w, h, opts)
  // old: drawBiomeArenaArt(ctx, room, arenaSpec, bounds, layer, time, opts)
  let rx0 = x0, ry0 = y0, rw = w, rh = h;
  let finalOpts = opts;
  if (x0 && typeof x0 === 'object' && y0 && typeof y0 === 'object' && typeof w === 'string') {
    const bounds = y0 || {};
    rx0 = Number(bounds.x0) || 0;
    ry0 = Number(bounds.y0) || 0;
    rw = Number(bounds.w) || 0;
    rh = Number(bounds.h) || 0;
    finalOpts = Object.assign({}, (opts && typeof opts === 'object') ? opts : {}, { layer: w, time: h });
  } else if (x0 && typeof x0 === 'object' && typeof y0 !== 'number') {
    const bounds = x0 || {};
    rx0 = Number(bounds.x0) || 0;
    ry0 = Number(bounds.y0) || 0;
    rw = Number(bounds.w) || 0;
    rh = Number(bounds.h) || 0;
    finalOpts = (y0 && typeof y0 === 'object') ? y0 : {};
  }
  finalOpts = (finalOpts && typeof finalOpts === 'object') ? finalOpts : {};
  const layer = finalOpts.layer || 'surface';
  const entry = getLoadedBiomeArenaEntry(room, layer);
  if (!entry) return false;
  const alpha = Number.isFinite(finalOpts.alpha) ? Number(finalOpts.alpha) : 1;
  const ox = Number.isFinite(finalOpts.ox) ? Number(finalOpts.ox) : 0;
  const oy = Number.isFinite(finalOpts.oy) ? Number(finalOpts.oy) : 0;
  const scaleMul = Number.isFinite(finalOpts.scaleMul) ? Number(finalOpts.scaleMul) : 1;
  const mode = String(finalOpts.mode || 'cover');
  if (mode === 'contain') return drawImageContainRect(ctx, entry, rx0, ry0, rw, rh, alpha, ox, oy, scaleMul, true);
  return drawImageCoverRect(ctx, entry, rx0, ry0, rw, rh, alpha, ox, oy, scaleMul, true);
}
