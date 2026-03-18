export const STANDARD_SKILL_KEYS = ["bullets", "bombs", "energyBarrier"];

export const BIOME_SKILLS_BY_BIOME = {
  neutral: [
    { key: "bombs", name: "Bombs" },
    { key: "energyBarrier", name: "Shield" },
  ],
  electric: [
    { key: "lightning", name: "Electric Chain" },
    { key: "electricZone", name: "Electric Ring" },
    { key: "stormStrike", name: "Storm Strike" },
  ],
  fire: [
    { key: "fireball", name: "Fireball" },
    { key: "laser", name: "Solar Beam" },
    { key: "flameNova", name: "Flame Nova" },
  ],
  ice: [
    { key: "iceWall", name: "Ice Ball" },
    { key: "satellites", name: "Frost Orbit" },
    { key: "iceShards", name: "Glacial Shards" },
  ],
  dark: [
    { key: "blackhole", name: "Blackhole" },
    { key: "spirit", name: "Shadow Spirit" },
    { key: "voidBurst", name: "Void Burst" },
  ],
  light: [
    { key: "lightHeal", name: "Light Heal" },
    { key: "summon", name: "Light Wardens" },
    { key: "holyNova", name: "Holy Nova" },
  ],
};

export const SKILL_FAMILY_BY_KEY = (() => {
  const out = Object.create(null);
  for (const k of STANDARD_SKILL_KEYS) out[k] = { group: "standard", biome: "", name: "" };
  for (const [biome, defs] of Object.entries(BIOME_SKILLS_BY_BIOME)) {
    for (const def of defs) out[def.key] = { group: "biome", biome, name: def.name || def.key };
  }
  out.rockets = { group: "evolution", biome: "", name: "Rockets" };
  return out;
})();

export function getSkillFamily(key) {
  return SKILL_FAMILY_BY_KEY[String(key || "")] || { group: "other", biome: "", name: String(key || "") };
}

export function isStandardSkillKey(key) {
  return STANDARD_SKILL_KEYS.includes(String(key || ""));
}

export function isBiomeSkillKey(key) {
  const fam = getSkillFamily(key);
  return fam.group === "biome";
}

export function biomeSkillsFor(biomeKey) {
  return BIOME_SKILLS_BY_BIOME[String(biomeKey || "").toLowerCase()] || [];
}
