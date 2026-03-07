// Pixel_GO v0.4.6 — Biomes (floor themes)
// Floors 1–3: no biome (neutral starter platforms)
// Floors 4+: random biome per floor (anti-repeat)

export const BIOME_LIST = [
  { key: "electric", name: "Electric", hue: 190, accent: "#35f2ff", glow: "rgba(80,255,255,0.75)" },
  { key: "fire", name: "Fire", hue: 18, accent: "#ff6a2a", glow: "rgba(255,140,70,0.75)" },
  { key: "ice", name: "Ice", hue: 210, accent: "#66a9ff", glow: "rgba(120,180,255,0.70)" },
  { key: "light", name: "Light", hue: 52, accent: "#ffe56e", glow: "rgba(255,240,150,0.70)" },
  { key: "dark", name: "Dark", hue: 282, accent: "#b07cff", glow: "rgba(190,120,255,0.65)" },
];

export function biomeByKey(key) {
  const k = String(key || "").toLowerCase();
  return BIOME_LIST.find((b) => b.key === k) || null;
}

export function biomeName(key) {
  const b = biomeByKey(key);
  return b ? b.name : "Neutral";
}

export function pickBiome(prevKey) {
  const prev = String(prevKey || "").toLowerCase();
  const pool = BIOME_LIST.filter((b) => b.key !== prev);
  const pickFrom = pool.length ? pool : BIOME_LIST;
  const idx = (Math.random() * pickFrom.length) | 0;
  return pickFrom[idx].key;
}

export function biomeForFloorIndex(floorIndex, prevBiomeKey) {
  const n = floorIndex | 0;
  if (n < 4) return "";
  return pickBiome(prevBiomeKey);
}
