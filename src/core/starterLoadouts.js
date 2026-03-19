export const STARTER_LOADOUTS = [
  {
    key: 'mecha',
    name: 'Mecha Core',
    biomeKey: 'neutral',
    skillKey: 'bullets',
    skillName: 'Gun',
    damageType: 'mecha',
    attackSpeedBonus: 0.12,
    damageBonus: 0.24,
    desc: 'Start with Gun Lv1. Balanced starter. +12% Attack Speed, +24% Mecha Damage.',
  },
  {
    key: 'electric',
    name: 'Electric Core',
    biomeKey: 'electric',
    skillKey: 'lightning',
    skillName: 'Electric Chain',
    damageType: 'electric',
    attackSpeedBonus: 0.12,
    damageBonus: 0.24,
    desc: 'Start with Electric Chain Lv1. Contact-style chain starter. +12% Attack Speed, +24% Electric Damage.',
  },
  {
    key: 'fire',
    name: 'Fire Core',
    biomeKey: 'fire',
    skillKey: 'fireball',
    skillName: 'Fireball',
    damageType: 'fire',
    attackSpeedBonus: 0.12,
    damageBonus: 0.24,
    desc: 'Start with Fireball Lv1. Burn-focused starter. +12% Attack Speed, +24% Fire Damage.',
  },
  {
    key: 'ice',
    name: 'Ice Core',
    biomeKey: 'ice',
    skillKey: 'iceWall',
    skillName: 'Ice Ball',
    damageType: 'ice',
    attackSpeedBonus: 0.12,
    damageBonus: 0.24,
    desc: 'Start with Ice Ball Lv1. Slow/frost starter. +12% Attack Speed, +24% Ice Damage.',
  },
];

const STARTER_BY_KEY = Object.create(null);
for (const def of STARTER_LOADOUTS) STARTER_BY_KEY[def.key] = def;

export function normalizeStarterLoadoutKey(key) {
  const k = String(key || '').toLowerCase();
  return STARTER_BY_KEY[k] ? k : 'mecha';
}

export function getStarterLoadoutDef(key) {
  return STARTER_BY_KEY[normalizeStarterLoadoutKey(key)] || STARTER_BY_KEY.mecha;
}

export function ensureStarterLoadoutProgression(prog) {
  if (!prog || typeof prog !== 'object') return prog;
  prog.selectedStarterLoadout = normalizeStarterLoadoutKey(prog.selectedStarterLoadout);
  return prog;
}

export function getStarterSkillKeyFromProgression(prog) {
  return getStarterLoadoutDef(prog?.selectedStarterLoadout).skillKey;
}

export function applyStarterLoadoutToPlayer(player, selectedKey) {
  if (!player || typeof player !== 'object') return null;
  const def = getStarterLoadoutDef(selectedKey);
  const s = player.runSkills && typeof player.runSkills === 'object' ? player.runSkills : (player.runSkills = {});

  // Start each run with exactly one selected starter skill at Lv1.
  s.bullets = 0;
  s.lightning = 0;
  s.fireball = 0;
  s.iceWall = 0;
  s[def.skillKey] = Math.max(1, (s[def.skillKey] | 0) || 0);

  player._starterLoadoutKey = def.key;
  player._starterSkillKey = def.skillKey;
  player._starterDamageType = def.damageType;
  player._starterAttackSpeedBonus = Number(def.attackSpeedBonus || 0) || 0;
  player._starterDamageBonus = Number(def.damageBonus || 0) || 0;

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
