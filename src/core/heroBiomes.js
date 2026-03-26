import { normalizeStarterLoadoutKey } from './starterLoadouts.js';

export const HERO_BIOME_KEYS = ['mecha', 'electric', 'fire', 'ice', 'dark', 'light'];

const META = {
  mecha: {
    key: 'mecha',
    label: 'Mecha',
    short: 'Mecha',
    legacyStarterKey: 'mecha',
    fixedAtCreation: true,
    strengths: ['same-biome mecha amplification', 'strong module overclocking', 'stable pressure shell'],
    weaknesses: ['less elemental utility', 'needs gear/card depth to peak', 'lower sustain than holy routes'],
    combatBonuses: {
      passiveBonuses: { attackSpeed: 1, moveSpeed: 1 },
      damageTypes: { mecha: 0.12, light: -0.03, dark: -0.03 },
      affinityBonuses: {},
    },
  },
  electric: {
    key: 'electric',
    label: 'Electric',
    short: 'Electric',
    legacyStarterKey: 'electric',
    fixedAtCreation: true,
    strengths: ['chain attacks and splash pressure', 'short move-speed surge windows', 'excellent tempo scaling'],
    weaknesses: ['lighter sustain shell', 'off-tempo damage drops fast', 'needs chaining to stay strong'],
    combatBonuses: {
      passiveBonuses: { attackSpeed: 1, moveSpeed: 1 },
      damageTypes: { electric: 0.13, fire: -0.04, mecha: -0.03 },
      affinityBonuses: { affElectric: 1 },
    },
  },
  fire: {
    key: 'fire',
    label: 'Fire',
    short: 'Fire',
    legacyStarterKey: 'fire',
    fixedAtCreation: true,
    strengths: ['burn attrition and ignite pops', 'strong elite cracking', 'best explosive pressure conversion'],
    weaknesses: ['less safe sustain window', 'narrower control shell', 'needs burns to reach full value'],
    combatBonuses: {
      passiveBonuses: { damage: 1, critDamage: 1 },
      damageTypes: { fire: 0.14, ice: -0.06, light: -0.03 },
      affinityBonuses: { affFire: 1 },
    },
  },
  ice: {
    key: 'ice',
    label: 'Ice',
    short: 'Ice',
    legacyStarterKey: 'ice',
    fixedAtCreation: true,
    strengths: ['slow / freeze control', 'durability edge', 'strong long attrition fights'],
    weaknesses: ['slower finishing speed', 'less burst conversion', 'needs control windows to dominate'],
    combatBonuses: {
      passiveBonuses: { hp: 1, hpRegen: 1 },
      damageTypes: { ice: 0.12, fire: -0.06, dark: -0.03 },
      affinityBonuses: { affIce: 1 },
    },
  },
  dark: {
    key: 'dark',
    label: 'Dark',
    short: 'Dark',
    legacyStarterKey: 'dark',
    fixedAtCreation: true,
    strengths: ['pull + dark collapse control', 'drain-based sustain', 'dark servant pressure'],
    weaknesses: ['riskier neutral shell', 'holy matchup penalty', 'needs offense to stay safe'],
    combatBonuses: {
      passiveBonuses: { critChance: 1, lifeSteal: 1 },
      damageTypes: { dark: 0.12, light: -0.08, mecha: -0.03 },
      affinityBonuses: { affDark: 1 },
    },
  },
  light: {
    key: 'light',
    label: 'Light',
    short: 'Light',
    legacyStarterKey: 'light',
    fixedAtCreation: true,
    strengths: ['heal and protection shell', 'holy servant support', 'safe recovery windows'],
    weaknesses: ['lower raw burst ceiling', 'void matchup penalty', 'slower boss finishing speed'],
    combatBonuses: {
      passiveBonuses: { hpRegen: 1, hp: 1 },
      damageTypes: { light: 0.12, dark: -0.08, fire: -0.03 },
      affinityBonuses: { affLight: 1 },
    },
  },
};

export function normalizeHeroBiomeKey(rawBiome) {
  return normalizeStarterLoadoutKey(rawBiome || 'mecha');
}

export function getHeroBiomeMeta(rawBiome) {
  return META[normalizeHeroBiomeKey(rawBiome)] || META.mecha;
}

export function listHeroBiomeMetas() {
  return HERO_BIOME_KEYS.map((key) => getHeroBiomeMeta(key));
}

export const HERO_BIOME_META = META;
