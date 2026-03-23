import neutralBgUrl from "../assets/biomes/neutral/neutral_arena_bg_4k.png";
import neutralOverlayUrl from "../assets/biomes/neutral/neutral_arena_overlay_4k.png";
import electricBgUrl from "../assets/biomes/electric/electric_arena_bg_4k.png";
import electricOverlayUrl from "../assets/biomes/electric/electric_arena_overlay_4k.png";
import fireBgUrl from "../assets/biomes/fire/fire_arena_bg_4k.png";
import fireOverlayUrl from "../assets/biomes/fire/fire_arena_overlay_4k.png";
import iceBgUrl from "../assets/biomes/ice/ice_arena_bg_4k.png";
import iceOverlayUrl from "../assets/biomes/ice/ice_arena_overlay_4k.png";
import darkBgUrl from "../assets/biomes/dark/dark_arena_bg_4k.png";
import darkOverlayUrl from "../assets/biomes/dark/dark_arena_overlay_4k.png";
import lightBgUrl from "../assets/biomes/light/light_arena_bg_4k.png";
import lightOverlayUrl from "../assets/biomes/light/light_arena_overlay_4k.png";

const BIOME_ART_URLS = {
  neutral: { bg: neutralBgUrl, overlay: neutralOverlayUrl },
  electric: { bg: electricBgUrl, overlay: electricOverlayUrl },
  fire: { bg: fireBgUrl, overlay: fireOverlayUrl },
  ice: { bg: iceBgUrl, overlay: iceOverlayUrl },
  dark: { bg: darkBgUrl, overlay: darkOverlayUrl },
  light: { bg: lightBgUrl, overlay: lightOverlayUrl },
};

const textureCache = new Map();

function getTexture(url) {
  if (!url) return null;
  let entry = textureCache.get(url);
  if (entry) return entry;
  const img = new Image();
  entry = { img, loaded: false, error: false, url };
  img.onload = () => {
    const isPlaceholder = Number(img.naturalWidth || img.width || 0) <= 1 && Number(img.naturalHeight || img.height || 0) <= 1;
    entry.loaded = !isPlaceholder;
    entry.error = false;
    entry.placeholder = isPlaceholder;
  };
  img.onerror = () => {
    entry.loaded = false;
    entry.error = true;
  };
  img.src = url;
  textureCache.set(url, entry);
  return entry;
}

export function getBiomeArtAssetSet(biomeKey) {
  const key = String(biomeKey || 'neutral').toLowerCase();
  const urls = BIOME_ART_URLS[key] || BIOME_ART_URLS.neutral;
  return {
    bg: getTexture(urls.bg),
    overlay: getTexture(urls.overlay),
  };
}

export function getBiomeArtSignature(biomeKey) {
  const assets = getBiomeArtAssetSet(biomeKey);
  const bg = assets.bg;
  const overlay = assets.overlay;
  return [
    bg?.url || '', bg?.loaded ? '1' : (bg?.placeholder ? 'p' : (bg?.error ? 'e' : '0')),
    overlay?.url || '', overlay?.loaded ? '1' : (overlay?.placeholder ? 'p' : (overlay?.error ? 'e' : '0')),
  ].join('|');
}

export function warmBiomeArtAssets() {
  for (const key of Object.keys(BIOME_ART_URLS)) getBiomeArtAssetSet(key);
}

export { BIOME_ART_URLS };
