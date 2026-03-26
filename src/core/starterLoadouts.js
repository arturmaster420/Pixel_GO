export const SKILL_ROUTE_META = {
  bullets: { route: 'mecha', role: 'stable ballistic core', style: 'safe all-round opener' },
  bombs: { route: 'mecha', role: 'area burst follow-up', style: 'explosive room clear' },
  rockets: { route: 'mecha', role: 'lock-on finisher', style: 'ballistic escalation' },
  shrapnelBurst: { route: 'mecha', role: 'close scatter burst', style: 'pressure and screen clear' },
  railVolley: { route: 'mecha', role: 'piercing volley', style: 'ranged burst lane' },
  energyBarrier: { route: 'mecha', role: 'safety frame', style: 'frontline stability' },

  lightning: { route: 'electric', role: 'chain contact core', style: 'fast bounce pressure' },
  electricZone: { route: 'electric', role: 'orbital zone', style: 'area denial' },
  stormStrike: { route: 'electric', role: 'impact burst', style: 'shock tempo spike' },
  arcSpark: { route: 'electric', role: 'micro-chain poke', style: 'rapid chaining' },
  staticPulse: { route: 'electric', role: 'pulse control', style: 'close anti-swarm' },
  energyBomb: { route: 'electric', role: 'evolved electric bomb', style: 'big shock detonation' },

  fireball: { route: 'fire', role: 'burn pressure core', style: 'forward attrition' },
  laser: { route: 'fire', role: 'beam lane', style: 'focused heat damage' },
  flameNova: { route: 'fire', role: 'heat burst ring', style: 'close punish' },
  meteorRain: { route: 'fire', role: 'skyfall barrage', style: 'room-wide burn pressure' },
  magmaLance: { route: 'fire', role: 'piercing magma strike', style: 'elite cracking' },
  fireBomb: { route: 'fire', role: 'evolved fire bomb', style: 'burn explosion' },

  iceWall: { route: 'ice', role: 'spacing frost core', style: 'slow and control' },
  satellites: { route: 'ice', role: 'orbiting frost control', style: 'defensive spacing' },
  iceShards: { route: 'ice', role: 'spread shard volley', style: 'safer ranged clear' },
  frostNova: { route: 'ice', role: 'freeze ring', style: 'panic reset zone' },
  crystalSpear: { route: 'ice', role: 'precision spear', style: 'long poke pickoff' },
  iceBomb: { route: 'ice', role: 'evolved ice bomb', style: 'freeze burst' },

  blackhole: { route: 'dark', role: 'void gravity core', style: 'pull and collapse' },
  spirit: { route: 'dark', role: 'shadow familiar', style: 'sustain pressure' },
  voidBurst: { route: 'dark', role: 'void detonation', style: 'collapse finish' },
  soulDrain: { route: 'dark', role: 'drain tether', style: 'sustain through damage' },
  dreadRing: { route: 'dark', role: 'fear ring', style: 'close control aura' },

  lightHeal: { route: 'light', role: 'holy sustain core', style: 'steady recovery path' },
  summon: { route: 'light', role: 'warden summon', style: 'supportive board control' },
  holyNova: { route: 'light', role: 'holy burst wave', style: 'clean anti-swarm pulse' },
  prismRay: { route: 'light', role: 'focused prism beam', style: 'beam sustain' },
  sanctuary: { route: 'light', role: 'holy field', style: 'safe healing/control zone' },
};

export const PASSIVE_ROUTE_META = {
  damage: { route: 'fire', role: 'raw pressure scaling' },
  attackSpeed: { route: 'mecha', role: 'tempo and output' },
  moveSpeed: { route: 'mecha', role: 'positioning and uptime' },
  hp: { route: 'ice', role: 'durability buffer' },
  hpRegen: { route: 'light', role: 'steady sustain' },
  range: { route: 'electric', role: 'reach and safer control' },
  pickupRadius: { route: 'mecha', role: 'tempo economy' },
  xpGain: { route: 'mecha', role: 'growth pacing' },
  critChance: { route: 'dark', role: 'spike opener' },
  critDamage: { route: 'fire', role: 'burst conversion' },
  lifeSteal: { route: 'dark', role: 'aggressive sustain' },
};

export const STARTER_LOADOUTS = [
  {
    key: 'mecha',
    name: 'Mecha Core',
    biomeKey: 'neutral',
    skillKey: 'bullets',
    skillName: 'Gun',
    damageType: 'mecha',
    attackSpeedBonus: 0.1,
    damageBonus: 0.18,
    passiveBonuses: { moveSpeed: 1 },
    favoredSkillKeys: ['bombs', 'shrapnelBurst', 'railVolley', 'energyBarrier', 'rockets'],
    favoredPassiveKeys: ['attackSpeed', 'moveSpeed', 'damage'],
    routeLabel: 'expedition / ballistic',
    summary: 'Stable expedition core that leans into gun tempo, rockets and safe ballistic pressure.',
    desc: 'Start with Gun Lv1. Mecha route: stable pressure, movement tempo and ballistic scaling. +10% Attack Speed, +18% Mecha Damage, +1 Move Speed.',
  },
  {
    key: 'electric',
    name: 'Electric Core',
    biomeKey: 'electric',
    skillKey: 'lightning',
    skillName: 'Electric Chain',
    damageType: 'electric',
    attackSpeedBonus: 0.12,
    damageBonus: 0.22,
    passiveBonuses: { range: 1 },
    favoredSkillKeys: ['electricZone', 'stormStrike', 'arcSpark', 'staticPulse', 'energyBomb'],
    favoredPassiveKeys: ['attackSpeed', 'range', 'moveSpeed'],
    routeLabel: 'chain / shock control',
    summary: 'Fast contact route built around chaining, reach and shock tempo spikes.',
    desc: 'Start with Electric Chain Lv1. Electric route: chain reach, pulse control and fast tempo. +12% Attack Speed, +22% Electric Damage, +1 Range.',
  },
  {
    key: 'fire',
    name: 'Fire Core',
    biomeKey: 'fire',
    skillKey: 'fireball',
    skillName: 'Fireball',
    damageType: 'fire',
    attackSpeedBonus: 0.08,
    damageBonus: 0.24,
    passiveBonuses: { damage: 1 },
    favoredSkillKeys: ['laser', 'flameNova', 'meteorRain', 'magmaLance', 'fireBomb'],
    favoredPassiveKeys: ['damage', 'range', 'critDamage'],
    routeLabel: 'burn / pressure',
    summary: 'Aggressive heat route with strong forward pressure, burn attrition and elite cracking.',
    desc: 'Start with Fireball Lv1. Fire route: burn pressure and explosive heat spikes. +8% Attack Speed, +24% Fire Damage, +1 Damage.',
  },
  {
    key: 'ice',
    name: 'Ice Core',
    biomeKey: 'ice',
    skillKey: 'iceWall',
    skillName: 'Ice Ball',
    damageType: 'ice',
    attackSpeedBonus: 0.06,
    damageBonus: 0.22,
    passiveBonuses: { hp: 1, hpRegen: 1 },
    favoredSkillKeys: ['satellites', 'iceShards', 'frostNova', 'crystalSpear', 'iceBomb'],
    favoredPassiveKeys: ['hp', 'hpRegen', 'range'],
    routeLabel: 'freeze / spacing',
    summary: 'Safer control core focused on spacing, freeze windows and long attrition fights.',
    desc: 'Start with Ice Ball Lv1. Ice route: spacing, freeze tempo and safer attrition. +6% Attack Speed, +22% Ice Damage, +1 Max HP, +1 HP Regen.',
  },
  {
    key: 'dark',
    name: 'Dark Core',
    biomeKey: 'dark',
    skillKey: 'blackhole',
    skillName: 'Blackhole',
    damageType: 'dark',
    attackSpeedBonus: 0.08,
    damageBonus: 0.22,
    passiveBonuses: { critChance: 1, lifeSteal: 1 },
    favoredSkillKeys: ['spirit', 'voidBurst', 'soulDrain', 'dreadRing'],
    favoredPassiveKeys: ['critChance', 'lifeSteal', 'hpRegen'],
    routeLabel: 'void / drain',
    summary: 'Riskier sustain core that collapses packs, drains through pressure and spikes crit starts.',
    desc: 'Start with Blackhole Lv1. Dark route: void collapse, drain and sustain-through-pressure. +8% Attack Speed, +22% Dark Damage, +1 Crit Chance, +1 Life Steal.',
  },
  {
    key: 'light',
    name: 'Light Core',
    biomeKey: 'light',
    skillKey: 'lightHeal',
    skillName: 'Light Heal',
    damageType: 'light',
    attackSpeedBonus: 0.06,
    damageBonus: 0.2,
    passiveBonuses: { hpRegen: 1, range: 1 },
    favoredSkillKeys: ['summon', 'holyNova', 'prismRay', 'sanctuary'],
    favoredPassiveKeys: ['hp', 'hpRegen', 'range'],
    routeLabel: 'sanctuary / sustain',
    summary: 'Holy support core built around safer sustain windows, summons and zone control.',
    desc: 'Start with Light Heal Lv1. Light route: sustain, holy fields and safer recovery windows. +6% Attack Speed, +20% Light Damage, +1 HP Regen, +1 Range.',
  },
];

const STARTER_BY_KEY = Object.create(null);
for (const def of STARTER_LOADOUTS) STARTER_BY_KEY[def.key] = def;

function clonePassiveBonuses(src) {
  const out = {};
  const data = src && typeof src === 'object' ? src : {};
  for (const [key, raw] of Object.entries(data)) {
    const amt = Number.isFinite(Number(raw)) ? Math.max(0, Number(raw) | 0) : 0;
    if (amt > 0) out[key] = amt;
  }
  return out;
}

export function normalizeStarterLoadoutKey(key) {
  const k = String(key || '').toLowerCase();
  return STARTER_BY_KEY[k] ? k : 'mecha';
}

export function getStarterLoadoutDef(key) {
  return STARTER_BY_KEY[normalizeStarterLoadoutKey(key)] || STARTER_BY_KEY.mecha;
}

export function getCoreIdentity(key) {
  return getStarterLoadoutDef(key);
}

export function getStarterFavoredSkillKeys(key) {
  return [...(getStarterLoadoutDef(key)?.favoredSkillKeys || [])];
}

export function getStarterFavoredPassiveKeys(key) {
  return [...(getStarterLoadoutDef(key)?.favoredPassiveKeys || [])];
}

export function getSkillRouteMeta(key) {
  const skillKey = String(key || '');
  return SKILL_ROUTE_META[skillKey] || { route: 'mecha', role: 'utility route', style: 'general expedition value' };
}

export function getPassiveRouteMeta(key) {
  const passiveKey = String(key || '');
  return PASSIVE_ROUTE_META[passiveKey] || { route: 'mecha', role: 'general build scaling' };
}

export function ensureStarterLoadoutProgression(prog) {
  if (!prog || typeof prog !== 'object') return prog;
  prog.selectedStarterLoadout = normalizeStarterLoadoutKey(prog.selectedStarterLoadout);
  return prog;
}

export function getStarterSkillKeyFromProgression(prog) {
  return getStarterLoadoutDef(prog?.selectedStarterLoadout).skillKey;
}

export function applyStarterLoadoutToPlayer(player, selectedKey, opts = null) {
  if (!player || typeof player !== 'object') return null;
  const def = getStarterLoadoutDef(selectedKey);
  const s = player.runSkills && typeof player.runSkills === 'object' ? player.runSkills : (player.runSkills = {});
  const grantSkill = !(opts && typeof opts === 'object' && opts.grantSkill === false);

  for (const starterDef of STARTER_LOADOUTS) s[starterDef.skillKey] = 0;
  if (grantSkill) s[def.skillKey] = Math.max(1, (s[def.skillKey] | 0) || 0);

  player._starterLoadoutKey = def.key;
  player._starterSkillKey = def.skillKey;
  player._starterDamageType = def.damageType;
  player._starterAttackSpeedBonus = Number(def.attackSpeedBonus || 0) || 0;
  player._starterDamageBonus = Number(def.damageBonus || 0) || 0;
  player._starterPassiveBonuses = clonePassiveBonuses(def.passiveBonuses);

  const prev = player.runDamageTypeMults && typeof player.runDamageTypeMults === 'object' ? player.runDamageTypeMults : {};
  player.runDamageTypeMults = {
    mecha: 1,
    electric: 1,
    fire: 1,
    ice: 1,
    light: 1,
    dark: 1,
    ...prev,
  };
  player.runDamageTypeMults[def.damageType] = 1 + player._starterDamageBonus;

  return def;
}
