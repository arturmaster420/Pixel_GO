import { applyLifeSteal } from './progression.js';
import { normalizeHeroBiomeKey } from './heroBiomes.js';
import { getPlayerById } from './netPlayerRuntime.js';

const SKILL_BIOME_BY_KEY = {
  bullets: 'mecha', bombs: 'mecha', rockets: 'mecha', shrapnelBurst: 'mecha', railVolley: 'mecha', energyBarrier: 'mecha',
  satellites: 'ice',
  energyBomb: 'electric', lightning: 'electric', electricZone: 'electric', stormStrike: 'electric', arcSpark: 'electric', staticPulse: 'electric',
  laser: 'fire', fireball: 'fire', flameNova: 'fire', meteorRain: 'fire', magmaLance: 'fire', fireBomb: 'fire',
  iceWall: 'ice', iceShards: 'ice', frostNova: 'ice', crystalSpear: 'ice', iceBomb: 'ice',
  spirit: 'dark', blackhole: 'dark', voidBurst: 'dark', soulDrain: 'dark', dreadRing: 'dark',
  summon: 'light', lightHeal: 'light', holyNova: 'light', prismRay: 'light', sanctuary: 'light',
};

const MECHA_SKILLS = new Set(['bullets', 'bombs', 'rockets', 'energyBarrier', 'shrapnelBurst', 'railVolley']);
const MODULE_SKILLS = new Set(['satellites', 'energyBarrier', 'electricZone']);
const LIGHT_SERVANT_SKILLS = new Set(['summon', 'lightHeal', 'holyNova', 'prismRay', 'sanctuary']);
const DARK_SERVANT_SKILLS = new Set(['spirit', 'blackhole', 'voidBurst', 'soulDrain', 'dreadRing']);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function getSkillBiomeKey(skillKey) {
  return SKILL_BIOME_BY_KEY[String(skillKey || '').trim()] || 'mecha';
}

export function getPlayerHeroBiomeKey(player) {
  return normalizeHeroBiomeKey(player?._heroCombatProfile?.race || player?.activeHeroRace || 'mecha');
}

export function getPlayerHeroMasteryLevel(player) {
  const level = Number(player?._heroCombatProfile?.mastery?.level || 1);
  return Number.isFinite(level) ? Math.max(1, Math.trunc(level)) : 1;
}

export function getPlayerModuleCount(player) {
  const count = Number(player?._heroGearSummary?.moduleCount || player?._heroModuleCount || 0);
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
}

export function isMechaSkillKey(skillKey) {
  return MECHA_SKILLS.has(String(skillKey || ''));
}

export function isModuleSkillKey(skillKey) {
  return MODULE_SKILLS.has(String(skillKey || ''));
}

export function isLightServantSkillKey(skillKey) {
  return LIGHT_SERVANT_SKILLS.has(String(skillKey || ''));
}

export function isDarkServantSkillKey(skillKey) {
  return DARK_SERVANT_SKILLS.has(String(skillKey || ''));
}

export function getBiomeAlignedSkillDamageMult(player, skillKey) {
  const heroBiome = getPlayerHeroBiomeKey(player);
  const skillBiome = getSkillBiomeKey(skillKey);
  const mastery = getPlayerHeroMasteryLevel(player);
  const moduleCount = getPlayerModuleCount(player);
  let mult = 1;

  if (skillBiome === heroBiome) mult += 0.08 + Math.min(0.06, Math.max(0, mastery - 1) * 0.006);

  switch (heroBiome) {
    case 'mecha':
      if (isMechaSkillKey(skillKey)) mult += 0.10 + moduleCount * 0.03;
      if (isModuleSkillKey(skillKey)) mult += 0.10 + moduleCount * 0.05;
      break;
    case 'electric':
      if (skillBiome === 'electric') mult += 0.08 + Math.min(0.04, mastery * 0.004);
      break;
    case 'fire':
      if (skillBiome === 'fire') mult += 0.10 + Math.min(0.05, mastery * 0.005);
      break;
    case 'ice':
      if (skillBiome === 'ice') mult += 0.06 + Math.min(0.04, mastery * 0.004);
      break;
    case 'dark':
      if (skillBiome === 'dark') mult += 0.08 + Math.min(0.05, mastery * 0.005);
      if (isDarkServantSkillKey(skillKey)) mult += 0.05;
      break;
    case 'light':
      if (skillBiome === 'light') mult += 0.06 + Math.min(0.04, mastery * 0.004);
      if (isLightServantSkillKey(skillKey)) mult += 0.07;
      break;
    default:
      break;
  }

  return mult;
}

export function getElectricSurgeProfile(player) {
  const biome = getPlayerHeroBiomeKey(player);
  if (biome !== 'electric') return { duration: 0, mult: 1 };
  const mastery = getPlayerHeroMasteryLevel(player);
  return {
    duration: 0.75 + Math.min(0.45, Math.max(0, mastery - 1) * 0.03),
    mult: 1.12 + Math.min(0.16, mastery * 0.012),
  };
}

export function triggerElectricSurge(player, intensity = 1) {
  if (!player) return;
  const profile = getElectricSurgeProfile(player);
  if (!(profile.duration > 0 && profile.mult > 1)) return;
  const scale = clamp(Number(intensity || 1), 0.65, 1.65);
  player._heroMoveBurstLeft = Math.max(Number(player._heroMoveBurstLeft || 0), profile.duration * scale);
  player._heroMoveBurstMult = Math.max(Number(player._heroMoveBurstMult || 1), 1 + (profile.mult - 1) * scale);
}

export function stepHeroMoveBurst(player, dt) {
  if (!player) return 1;
  const left = Number(player._heroMoveBurstLeft || 0);
  if (!(left > 0)) {
    player._heroMoveBurstLeft = 0;
    player._heroMoveBurstMult = 1;
    return 1;
  }
  const next = Math.max(0, left - Math.max(0, Number(dt || 0)));
  player._heroMoveBurstLeft = next;
  if (next <= 0) {
    player._heroMoveBurstMult = 1;
    return 1;
  }
  return Math.max(1, Number(player._heroMoveBurstMult || 1));
}

export function getIceFreezeProfile(player) {
  const biome = getPlayerHeroBiomeKey(player);
  const mastery = getPlayerHeroMasteryLevel(player);
  if (biome === 'ice') {
    return {
      buildMult: 1.2 + Math.min(0.4, mastery * 0.03),
      duration: 0.48 + Math.min(0.34, mastery * 0.025),
      threshold: 1.0,
      slowBoost: 0.92,
    };
  }
  return {
    buildMult: 0.72,
    duration: 0.24,
    threshold: 1.1,
    slowBoost: 1.0,
  };
}

export function applyIceControlState(owner, enemy, state, opts = {}) {
  if (!enemy) return;
  const now = Number(state?.time || 0);
  const frostDur = Math.max(0, Number(opts.frostDur || 0));
  const slowDur = Math.max(0, Number(opts.slowDur || 0));
  const slowMultIn = Number(opts.slowMult || 1);
  const freezeBuild = Math.max(0, Number(opts.freezeBuild || 0));
  const extraDur = Math.max(0, Number(opts.freezeExtraDur || 0));
  const profile = getIceFreezeProfile(owner);

  if (slowDur > 0) {
    const slowMult = clamp(Math.min(slowMultIn, profile.slowBoost), 0.14, 0.96);
    enemy._barrierDebuffUntil = Math.max(Number(enemy._barrierDebuffUntil || 0), now + slowDur);
    enemy._barrierSlowMult = Math.min(Number(enemy._barrierSlowMult || 1), slowMult);
    enemy._barrierDmgMult = Math.min(Number(enemy._barrierDmgMult || 1), 1);
  }
  if (frostDur > 0) {
    enemy._frostLeft = Math.max(Number(enemy._frostLeft || 0), frostDur);
    enemy._frostLv = Math.max(Number(enemy._frostLv || 0), 1);
  }

  const nextBuild = Math.max(0, Number(enemy._freezeBuild || 0) + freezeBuild * profile.buildMult);
  enemy._freezeBuild = nextBuild;
  if (nextBuild >= profile.threshold) {
    enemy._freezeBuild = Math.max(0, nextBuild - profile.threshold * 0.86);
    enemy._frozenUntil = Math.max(Number(enemy._frozenUntil || 0), now + profile.duration + extraDur);
  }
}

export function applyFireBurnState(owner, enemy, dur, dps, scale = 1) {
  if (!enemy) return;
  const burnDur = Math.max(0, Number(dur || 0));
  const burnDps = Math.max(0, Number(dps || 0));
  if (!(burnDur > 0 && burnDps > 0)) return;
  enemy._burnLeft = Math.max(Number(enemy._burnLeft || 0), burnDur);
  enemy._burnDps = Math.max(Number(enemy._burnDps || 0), burnDps);
  if (owner?.id != null) enemy._burnBy = String(owner.id || 'local');
  enemy._burnExplosionScale = Math.max(Number(enemy._burnExplosionScale || 0), Math.max(0.25, Number(scale || 1)));
}

export function getBurnExplosionProfile(player) {
  const biome = getPlayerHeroBiomeKey(player);
  const mastery = getPlayerHeroMasteryLevel(player);
  if (biome === 'fire') {
    return {
      enabled: true,
      radiusMult: 1.15 + Math.min(0.22, mastery * 0.015),
      damageScale: 1.15 + Math.min(0.30, mastery * 0.02),
    };
  }
  return {
    enabled: true,
    radiusMult: 1,
    damageScale: 0.82,
  };
}

export function explodeBurningEnemy(owner, enemy, state) {
  if (!enemy || !state) return false;
  if ((enemy._burnExploded || false) || !((enemy._burnLeft || 0) > 0 || (enemy._burnDps || 0) > 0)) return false;
  const profile = getBurnExplosionProfile(owner);
  if (!profile.enabled) return false;
  enemy._burnExploded = true;

  const radius = Math.max(34, (Number(enemy.radius || 18) * 2.8) * profile.radiusMult);
  const damage = Math.max(6, Number(enemy._burnDps || 0) * (2.2 * profile.damageScale) + Number(enemy._burnExplosionScale || 0) * 6);
  const r2 = radius * radius;
  const enemies = Array.isArray(state.enemies) ? state.enemies : [];

  for (const other of enemies) {
    if (!other || other === enemy || other.hp <= 0) continue;
    const dx = Number(other.x || 0) - Number(enemy.x || 0);
    const dy = Number(other.y || 0) - Number(enemy.y || 0);
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    const falloff = 1 - Math.min(1, Math.sqrt(d2) / Math.max(1, radius));
    const dealt = damage * (0.5 + falloff * 0.5);
    other.hp -= dealt;
    if (owner) {
      applyLifeSteal(owner, dealt);
      owner._lastCombatAt = state.time;
      other._lastHitAt = state.time;
      other._lastHitBy = owner.id || 'local';
      other.aggroed = true;
    }
    applyFireBurnState(owner, other, 0.95, Math.max(2, Number(enemy._burnDps || 0) * 0.45), 0.55);
  }

  if (!Array.isArray(state._explosions)) state._explosions = [];
  state._explosions.push({ x: enemy.x, y: enemy.y, r: radius, t: 0.36, kind: 'fire' });
  if (Array.isArray(state.floatingTexts)) {
    state.floatingTexts.push({ x: enemy.x, y: enemy.y - 22, text: 'IGNITE', time: 0.55 });
  }
  return true;
}

export function getLightServantProfile(player) {
  const biome = getPlayerHeroBiomeKey(player);
  const mastery = getPlayerHeroMasteryLevel(player);
  const moduleCount = getPlayerModuleCount(player);
  if (biome !== 'light') {
    return { extraCount: 0, smiteRate: 0, smiteDamageMult: 1, healOnSmite: 0, healMult: 1, shieldBonus: 0 };
  }
  return {
    extraCount: mastery >= 6 ? 1 : 0,
    smiteRate: Math.max(0.9, 1.8 - mastery * 0.05),
    smiteDamageMult: 1.1 + Math.min(0.35, mastery * 0.025) + moduleCount * 0.04,
    healOnSmite: 1 + Math.floor(mastery / 4),
    healMult: 1.12 + Math.min(0.28, mastery * 0.018),
    shieldBonus: 8 + mastery * 2 + moduleCount * 4,
  };
}

export function getDarkServantProfile(player) {
  const biome = getPlayerHeroBiomeKey(player);
  const mastery = getPlayerHeroMasteryLevel(player);
  if (biome !== 'dark') {
    return { extraCount: 0, damageMult: 1, rateMult: 1, curseBonus: 0, pullMult: 1 };
  }
  return {
    extraCount: mastery >= 6 ? 1 : 0,
    damageMult: 1.12 + Math.min(0.32, mastery * 0.022),
    rateMult: 1.08 + Math.min(0.24, mastery * 0.016),
    curseBonus: 0.45 + mastery * 0.05,
    pullMult: 1.12 + Math.min(0.3, mastery * 0.02),
  };
}

export function getLightHealMult(player) {
  return getLightServantProfile(player).healMult || 1;
}

export function getDarkPullMult(player) {
  return getDarkServantProfile(player).pullMult || 1;
}

export function resolveBurnOwner(state, enemy) {
  const burnBy = String(enemy?._burnBy || enemy?._lastHitBy || '');
  if (!burnBy) return state?.player || null;
  return getPlayerById(state, burnBy) || state?.player || null;
}
