export const STANDARD_SKILL_KEYS = ["bullets", "bombs", "energyBarrier"];

export const BIOME_SKILLS_BY_BIOME = {
  neutral: [
    { key: "bombs", name: "Bombs" },
    { key: "energyBarrier", name: "Shield" },
    { key: "shrapnelBurst", name: "Shrapnel Burst" },
    { key: "railVolley", name: "Rail Volley" },
  ],
  electric: [
    { key: "lightning", name: "Electric Chain" },
    { key: "electricZone", name: "Electric Ring" },
    { key: "stormStrike", name: "Storm Strike" },
    { key: "arcSpark", name: "Arc Spark" },
    { key: "staticPulse", name: "Static Pulse" },
  ],
  fire: [
    { key: "fireball", name: "Fireball" },
    { key: "laser", name: "Solar Beam" },
    { key: "flameNova", name: "Flame Nova" },
    { key: "meteorRain", name: "Meteor Rain" },
    { key: "magmaLance", name: "Magma Lance" },
  ],
  ice: [
    { key: "iceWall", name: "Ice Ball" },
    { key: "satellites", name: "Frost Orbit" },
    { key: "iceShards", name: "Glacial Shards" },
    { key: "frostNova", name: "Frost Nova" },
    { key: "crystalSpear", name: "Crystal Spear" },
  ],
  dark: [
    { key: "blackhole", name: "Blackhole" },
    { key: "spirit", name: "Shadow Spirit" },
    { key: "voidBurst", name: "Void Burst" },
    { key: "soulDrain", name: "Soul Drain" },
    { key: "dreadRing", name: "Dread Ring" },
  ],
  light: [
    { key: "lightHeal", name: "Light Heal" },
    { key: "summon", name: "Light Wardens" },
    { key: "holyNova", name: "Holy Nova" },
    { key: "prismRay", name: "Prism Ray" },
    { key: "sanctuary", name: "Sanctuary" },
  ],
};

export const SKILL_FAMILY_BY_KEY = (() => {
  const out = Object.create(null);
  for (const k of STANDARD_SKILL_KEYS) out[k] = { group: "standard", biome: "", name: "" };
  for (const [biome, defs] of Object.entries(BIOME_SKILLS_BY_BIOME)) {
    for (const def of defs) out[def.key] = { group: "biome", biome, name: def.name || def.key };
  }
  out.rockets = { group: "evolution", biome: "", name: "Rockets" };
  out.energyBomb = { group: "evolution", biome: "electric", name: "Energy Bomb" };
  out.fireBomb = { group: "evolution", biome: "fire", name: "Fire Bomb" };
  out.iceBomb = { group: "evolution", biome: "ice", name: "Ice Bomb" };
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
