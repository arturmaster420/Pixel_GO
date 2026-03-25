// In-run skill system: replaces weapon stage evolution.
// Skills are leveled during the run via core/runUpgrades.js.

import { fireBullets } from "./bullets.js";
import { fireRockets } from "./rockets.js";
import { fireBombs } from "./bombs.js";
import { fireChainLightning } from "./lightning.js";
import { updateLaser } from "./laser.js";
import { updateSatellites } from "./satellites.js";
import { updateEnergyBarrier } from "./energyBarrier.js";
import { updateSpirit } from "./spirit.js";
import { updateElectricZone } from "./electricZone.js";
import { updateSummonTanks } from "./summonTanks.js";
import { updateFireball } from "./fireball.js";
import { updateIceBall } from "./iceBall.js";
import { spawnBlackhole } from "./blackhole.js";
import { emitHealPulse } from "./lightHeal.js";
import { castStormStrike, castFlameNova, fireIceShards, castVoidBurst, castHolyNova } from "./elementalActives.js";
import { castShrapnelBurst, castRailVolley, castArcSpark, castStaticPulse, castMeteorRain, castMagmaLance, castFrostNova, castCrystalSpear, castSoulDrain, castDreadRing, castPrismRay, castSanctuary } from "./biomeActivesPlus.js";
import { getAimDirectionForPlayer, isFiringActive } from "../core/mouseController.js";
import { getBiomeAlignedSkillDamageMult, getDarkPullMult, getDarkServantProfile, getLightHealMult, getLightServantProfile, getPlayerHeroBiomeKey, triggerElectricSurge } from "../core/heroBiomeCombat.js";

// Shared preferred distance for pets/minions around the player.
// Used to align Summon Tanks spacing with Satellites orbit radius.
const PET_FOLLOW_DIST = 96;


function safeDiv(a, b) {
  const bb = b || 1;
  return a / bb;
}

function getTotalRangeMult(player) {
  const m = player?.metaRangeMult || 1;
  const r = player?.runRangeMult || 1;
  const raw = m * r;
  // Soft-cap range multiplier for readability (prevents extreme late-game sniping).
  const cap = 2.2;
  if (!Number.isFinite(raw) || raw <= cap) return raw;
  return cap + (raw - cap) * 0.25;
}

function getDamageMult(player) {
  const base = player?.baseDamage || 4;
  const dmg = Number.isFinite(player?.damage) ? player.damage : base;
  return safeDiv(dmg, base || 1);
}

const SKILL_DAMAGE_TYPES = {
  bullets: 'mecha',
  bombs: 'mecha',
  rockets: 'mecha',
  energyBomb: 'electric',
  fireBomb: 'fire',
  iceBomb: 'ice',
  energyBarrier: 'mecha',
  electricZone: 'electric',
  lightning: 'electric',
  stormStrike: 'electric',
  laser: 'fire',
  fireball: 'fire',
  flameNova: 'fire',
  satellites: 'ice',
  iceWall: 'ice',
  iceShards: 'ice',
  spirit: 'dark',
  blackhole: 'dark',
  voidBurst: 'dark',
  summon: 'light',
  lightHeal: 'light',
  holyNova: 'light',
  shrapnelBurst: 'mecha',
  railVolley: 'mecha',
  arcSpark: 'electric',
  staticPulse: 'electric',
  meteorRain: 'fire',
  magmaLance: 'fire',
  frostNova: 'ice',
  crystalSpear: 'ice',
  soulDrain: 'dark',
  dreadRing: 'dark',
  prismRay: 'light',
  sanctuary: 'light',
};

function getDamageTypeMult(player, type) {
  const map = player?.runDamageTypeMults;
  const v = map && typeof map === 'object' ? map[type] : 1;
  return (typeof v === 'number' && Number.isFinite(v) && v > 0) ? v : 1;
}

function getSkillDamageMult(player, skillKey) {
  const type = SKILL_DAMAGE_TYPES[String(skillKey || '')] || 'mecha';
  return getDamageMult(player) * getDamageTypeMult(player, type) * getBiomeAlignedSkillDamageMult(player, skillKey);
}


function getMetaSkillLevel(player, skillKey) {
  const m = player && player._metaSkillMeta && typeof player._metaSkillMeta === "object" ? player._metaSkillMeta : null;
  const id = `skill:${skillKey}`;
  const v = m ? m[id] : 0;
  return (typeof v === "number" && Number.isFinite(v)) ? (v | 0) : 0;
}

export function getAimRangeForPlayer(player) {
  // Aim range should track the best available in-run skill (important on mobile auto-aim).
  if (!player) return 220;
  const rMult = getTotalRangeMult(player);
  const s = player.runSkills || {};

  const bulletLvl = (s.bullets || 0) | 0;
  const bulletRange = bulletLvl > 0 ? (220 + (bulletLvl - 1) * 12) * rMult : 0;

  const bombLvl = (s.bombs || 0) | 0;
  const bombRange = bombLvl > 0 ? (200 + (bombLvl - 1) * 8) * rMult : 0;

  const rocketLvl = (s.rockets || 0) | 0;
  const rocketRange = rocketLvl > 0 ? (280 + (rocketLvl - 1) * 10) * rMult : 0;

  const energyBombLvl = (s.energyBomb || 0) | 0;
  const energyBombRange = energyBombLvl > 0 ? (310 + (energyBombLvl - 1) * 12) * rMult : 0;

  const fireBombLvl = (s.fireBomb || 0) | 0;
  const fireBombRange = fireBombLvl > 0 ? (305 + (fireBombLvl - 1) * 12) * rMult : 0;

  const iceBombLvl = (s.iceBomb || 0) | 0;
  const iceBombRange = iceBombLvl > 0 ? (300 + (iceBombLvl - 1) * 12) * rMult : 0;

  const lightLvl = (s.lightning || 0) | 0;
  const lightRange = lightLvl > 0 ? (240 + (lightLvl - 1) * 10) * rMult : 0;

  const laserLvl = (s.laser || 0) | 0;
  const laserRange = laserLvl > 0 ? (260 + (laserLvl - 1) * 15) * rMult : 0;

  const fbLvl = (s.fireball || 0) | 0;
  const fbRange = fbLvl > 0 ? (320 + (fbLvl - 1) * 16) * rMult : 0;

  const bhLvl = (s.blackhole || 0) | 0;
  const bhRange = bhLvl > 0 ? (360 + (bhLvl - 1) * 18) * rMult : 0;

  const ssLvl = (s.stormStrike || 0) | 0;
  const ssRange = ssLvl > 0 ? (340 + (ssLvl - 1) * 14) * rMult : 0;

  const isLvl = (s.iceShards || 0) | 0;
  const isRange = isLvl > 0 ? (300 + (isLvl - 1) * 14) * rMult : 0;

  const vbLvl = (s.voidBurst || 0) | 0;
  const vbRange = vbLvl > 0 ? (320 + (vbLvl - 1) * 14) * rMult : 0;

  const rvLvl = (s.railVolley || 0) | 0;
  const rvRange = rvLvl > 0 ? (320 + (rvLvl - 1) * 12) * rMult : 0;

  const asLvl = (s.arcSpark || 0) | 0;
  const asRange = asLvl > 0 ? (336 + (asLvl - 1) * 14) * rMult : 0;

  const mrLvl = (s.meteorRain || 0) | 0;
  const mrRange = mrLvl > 0 ? (350 + (mrLvl - 1) * 14) * rMult : 0;

  const mlLvl = (s.magmaLance || 0) | 0;
  const mlRange = mlLvl > 0 ? (330 + (mlLvl - 1) * 12) * rMult : 0;

  const csLvl = (s.crystalSpear || 0) | 0;
  const csRange = csLvl > 0 ? (330 + (csLvl - 1) * 12) * rMult : 0;

  const sdLvl = (s.soulDrain || 0) | 0;
  const sdRange = sdLvl > 0 ? (310 + (sdLvl - 1) * 12) * rMult : 0;

  const prLvl = (s.prismRay || 0) | 0;
  const prRange = prLvl > 0 ? (336 + (prLvl - 1) * 14) * rMult : 0;

  return Math.max(220 * rMult, bulletRange, bombRange, rocketRange, energyBombRange, fireBombRange, iceBombRange, lightRange, laserRange, fbRange, bhRange, ssRange, isRange, vbRange, rvRange, asRange, mrRange, mlRange, csRange, sdRange, prRange);
}


export function getAttackRangeForPlayer(player) {
  if (!player) return 200;
  const rMult = getTotalRangeMult(player);
  const s = player.runSkills || {};

  const bulletLvl = (s.bullets || 0) | 0;
  const bulletRange = bulletLvl > 0 ? (220 + (bulletLvl - 1) * 12) * rMult : 0;

  const bombLvl = (s.bombs || 0) | 0;
  const bombRange = bombLvl > 0 ? (200 + (bombLvl - 1) * 8) * rMult : 0;

  const rocketLvl = (s.rockets || 0) | 0;
  const rocketRange = rocketLvl > 0 ? (280 + (rocketLvl - 1) * 10) * rMult : 0;

  const energyBombLvl = (s.energyBomb || 0) | 0;
  const energyBombRange = energyBombLvl > 0 ? (310 + (energyBombLvl - 1) * 12) * rMult : 0;

  const fireBombLvl = (s.fireBomb || 0) | 0;
  const fireBombRange = fireBombLvl > 0 ? (305 + (fireBombLvl - 1) * 12) * rMult : 0;

  const iceBombLvl = (s.iceBomb || 0) | 0;
  const iceBombRange = iceBombLvl > 0 ? (300 + (iceBombLvl - 1) * 12) * rMult : 0;

  const lightLvl = (s.lightning || 0) | 0;
  const lightRange = lightLvl > 0 ? (240 + (lightLvl - 1) * 10) * rMult : 0;

  const laserLvl = (s.laser || 0) | 0;
  const laserRange = laserLvl > 0 ? (260 + (laserLvl - 1) * 15) * rMult : 0;

  const fbLvl = (s.fireball || 0) | 0;
  const fbRange = fbLvl > 0 ? (320 + (fbLvl - 1) * 16) * rMult : 0;

  const bhLvl = (s.blackhole || 0) | 0;
  const bhRange = bhLvl > 0 ? (360 + (bhLvl - 1) * 18) * rMult : 0;

  const ssLvl = (s.stormStrike || 0) | 0;
  const ssRange = ssLvl > 0 ? (340 + (ssLvl - 1) * 14) * rMult : 0;

  const isLvl = (s.iceShards || 0) | 0;
  const isRange = isLvl > 0 ? (300 + (isLvl - 1) * 14) * rMult : 0;

  const vbLvl = (s.voidBurst || 0) | 0;
  const vbRange = vbLvl > 0 ? (320 + (vbLvl - 1) * 14) * rMult : 0;

  const rvLvl = (s.railVolley || 0) | 0;
  const rvRange = rvLvl > 0 ? (320 + (rvLvl - 1) * 12) * rMult : 0;

  const asLvl = (s.arcSpark || 0) | 0;
  const asRange = asLvl > 0 ? (336 + (asLvl - 1) * 14) * rMult : 0;

  const mrLvl = (s.meteorRain || 0) | 0;
  const mrRange = mrLvl > 0 ? (350 + (mrLvl - 1) * 14) * rMult : 0;

  const mlLvl = (s.magmaLance || 0) | 0;
  const mlRange = mlLvl > 0 ? (330 + (mlLvl - 1) * 12) * rMult : 0;

  const csLvl = (s.crystalSpear || 0) | 0;
  const csRange = csLvl > 0 ? (330 + (csLvl - 1) * 12) * rMult : 0;

  const sdLvl = (s.soulDrain || 0) | 0;
  const sdRange = sdLvl > 0 ? (310 + (sdLvl - 1) * 12) * rMult : 0;

  const prLvl = (s.prismRay || 0) | 0;
  const prRange = prLvl > 0 ? (336 + (prLvl - 1) * 14) * rMult : 0;

  return Math.max(220 * rMult, bulletRange, bombRange, rocketRange, energyBombRange, fireBombRange, iceBombRange, lightRange, laserRange, fbRange, bhRange, ssRange, isRange, vbRange, rvRange, asRange, mrRange, mlRange, csRange, sdRange, prRange);
}

function bulletParams(player) {
  const lvl = (player.runSkills?.bullets ?? 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'bullets');

  const count = 1 + Math.floor((lvl - 1) / 4);
  const spread = count <= 1 ? 0 : 14;

  // Base damage grows with skill level; global multipliers are applied via dMult.
  const dmgBase = 4 + (lvl - 1) * 1.1;

  // Rate is shots/sec. Use player's attackSpeed as the baseline (already includes meta/run/buffs)
  // and allow a small skill-based boost.
  const baseRate = player.attackSpeed || player.baseAttackSpeed || 2.0;
  const rate = baseRate * (1 + (lvl - 1) * 0.05);

  return {
    count,
    spread,
    damage: dmgBase * dMult,
    range: (220 + (lvl - 1) * 12) * rMult,
    rate,
  };
}


function bombsParams(player) {
  const lvl = (player.runSkills?.bombs || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'bombs');

  const count = 1 + Math.floor((lvl - 1) / 5);
  const dmgBase = 12 + (lvl - 1) * 4.2;
  const range = (200 + (lvl - 1) * 8) * rMult;
  const splashRadius = 60 + (lvl - 1) * 4;
  const cd = Math.max(1.2, 2.8 - (lvl - 1) * 0.06);

  return {
    count,
    damage: dmgBase * dMult,
    range,
    splashRadius,
    cooldown: cd,
    speed: 320,
  };
}
function rocketParams(player) {
  const lvl = (player.runSkills?.rockets || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'rockets');

  // Evolved rockets are intended to feel like a big power spike as the upgraded gun route.
  // Level 1 rockets should be slightly stronger than MAX Basic Shot + MAX Bombs combined.
  const count = 1 + Math.floor((lvl - 1) / 4);
  const dmgBase = 150 + (lvl - 1) * 28;
  const range = (300 + (lvl - 1) * 12) * rMult;
  const splashRadius = 85 + (lvl - 1) * 5;
  const cd = Math.max(0.65, 0.85 - (lvl - 1) * 0.02);

  return {
    count,
    damage: dmgBase * dMult,
    range,
    splashRadius,
    cooldown: cd,
  };
}

function energyBombParams(player) {
  const lvl = (player.runSkills?.energyBomb || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'energyBomb');

  const count = 1 + Math.floor((lvl - 1) / 5);
  const damage = (122 + (lvl - 1) * 24) * dMult;
  const range = (310 + (lvl - 1) * 12) * rMult;
  const splashRadius = 82 + (lvl - 1) * 5;
  const cooldown = Math.max(0.62, 0.82 - (lvl - 1) * 0.022);
  const zapRange = (118 + (lvl - 1) * 7) * rMult;
  const zapTargets = Math.min(4, 1 + Math.floor((lvl - 1) / 2));
  const zapDamage = (28 + (lvl - 1) * 7) * dMult;

  return { count, damage, range, splashRadius, cooldown, zapRange, zapTargets, zapDamage, type: 'energyBomb', speed: 560, radius: 6 };
}

function fireBombParams(player) {
  const lvl = (player.runSkills?.fireBomb || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'fireBomb');

  const count = 1 + Math.floor((lvl - 1) / 5);
  const damage = (132 + (lvl - 1) * 25) * dMult;
  const range = (305 + (lvl - 1) * 12) * rMult;
  const splashRadius = 90 + (lvl - 1) * 6;
  const cooldown = Math.max(0.64, 0.86 - (lvl - 1) * 0.022);
  const burnDur = 1.55 + (lvl - 1) * 0.18;
  const burnDps = (8 + (lvl - 1) * 2.6) * dMult;

  return { count, damage, range, splashRadius, cooldown, burnDur, burnDps, type: 'fireBomb', speed: 540, radius: 6 };
}

function iceBombParams(player) {
  const lvl = (player.runSkills?.iceBomb || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'iceBomb');

  const count = 1 + Math.floor((lvl - 1) / 5);
  const damage = (126 + (lvl - 1) * 23) * dMult;
  const range = (300 + (lvl - 1) * 12) * rMult;
  const splashRadius = 88 + (lvl - 1) * 6;
  const cooldown = Math.max(0.64, 0.85 - (lvl - 1) * 0.021);
  const frostDur = 1.6 + (lvl - 1) * 0.15;
  const slowDur = 1.15 + (lvl - 1) * 0.12;
  const slowMult = Math.max(0.34, 0.72 - (lvl - 1) * 0.04);

  return { count, damage, range, splashRadius, cooldown, frostDur, slowDur, slowMult, type: 'iceBomb', speed: 530, radius: 6 };
}

function lightningParams(player) {
  const lvl = (player.runSkills?.lightning || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'lightning');

  // Starter balance pass: Electric Chain should open around Gun power,
  // but feel different through short-range contact chaining and instant hits.
  const baseRate = player.attackSpeed || player.baseAttackSpeed || 2.0;
  const heroBiome = getPlayerHeroBiomeKey(player);
  const chainBonus = heroBiome === 'electric' ? 1 : 0;
  const maxTargets = Math.min(6, 1 + Math.floor((lvl - 1) / 2) + chainBonus);
  const dmgBase = 4.1 + (lvl - 1) * 1.45;
  const chainRange = (118 + (lvl - 1) * 13) * rMult * (heroBiome === 'electric' ? 1.08 : 1);
  const cd = 1 / Math.max(0.01, baseRate * (1 + (lvl - 1) * 0.04));

  return {
    maxTargets,
    damage: dmgBase * dMult,
    chainRange,
    cooldown: cd,
  };
}

function fireballParams(player) {
  const lvl = (player.runSkills?.fireball || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'fireball');

  // Starter balance pass: keep Fireball close to Gun at level 1,
  // with power budget shifted into burn + light splash instead of raw burst.
  const heroBiome = getPlayerHeroBiomeKey(player);
  const fireBias = heroBiome === 'fire' ? 1.22 : 1;
  const range = (250 + (lvl - 1) * 15) * rMult;
  const speed = 500 + (lvl - 1) * 20;
  const cooldown = Math.max(0.72, 1.15 - (lvl - 1) * 0.045);
  const damage = (5.2 + (lvl - 1) * 2.2) * dMult;
  const splashRadius = (54 + (lvl - 1) * 5) * (heroBiome === 'fire' ? 1.08 : 1);
  const burnDur = (1.2 + (lvl - 1) * 0.16) * fireBias;
  const burnDps = (2.2 + (lvl - 1) * 0.95) * dMult * fireBias;
  const radius = 9 + Math.floor((lvl - 1) / 2);
  return { level: lvl, range, speed, cooldown, damage, splashRadius, burnDur, burnDps, radius };
}

function iceWallParams(player) {
  const lvl = (player.runSkills?.iceWall || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'iceWall');

  // Starter balance pass: Ice Ball opens near Gun power,
  // but pays for that with utility through slow + frost setup.
  const heroBiome = getPlayerHeroBiomeKey(player);
  const iceBias = heroBiome === 'ice' ? 1.18 : 1;
  const range = (248 + (lvl - 1) * 15) * rMult;
  const speed = 490 + (lvl - 1) * 18;
  const cooldown = Math.max(0.76, 1.08 - (lvl - 1) * 0.04);
  const damage = (6.3 + (lvl - 1) * 2.05) * dMult;
  const splashRadius = 58 + (lvl - 1) * 5;
  const slowDur = (1.1 + (lvl - 1) * 0.12) * (heroBiome === 'ice' ? 1.12 : 1);
  const slowMult = Math.max(0.28, Math.max(0.34, 0.68 - (lvl - 1) * 0.04) - (heroBiome === 'ice' ? 0.06 : 0));
  const frostDur = (1.35 + (lvl - 1) * 0.14) * iceBias;
  const radius = 9 + Math.floor((lvl - 1) / 2);
  return { level: lvl, range, speed, cooldown, damage, splashRadius, slowDur, slowMult, frostDur, freezeBuild: heroBiome === 'ice' ? 0.9 : 0.58, radius };
}


function blackholeParams(player) {
  const lvl = (player.runSkills?.blackhole || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'blackhole');

  const cooldown = Math.max(4.6, 8.0 - (lvl - 1) * 0.52);
  const duration = 2.6 + (lvl - 1) * 0.35;
  const radius = ((170 + (lvl - 1) * 18) * (0.95 + (rMult - 1) * 0.25)) * 0.5;
  const pull = (260 + (lvl - 1) * 30) * getDarkPullMult(player);
  const dps = (10 + (lvl - 1) * 4.2) * dMult;
  const castRange = (360 + (lvl - 1) * 18) * rMult;
  return { level: lvl, cooldown, duration, radius, pull, dps, castRange };
}

function lightHealParams(player) {
  const lvl = (player.runSkills?.lightHeal || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const healMult = getLightHealMult(player);
  const lightProfile = getLightServantProfile(player);
  const cooldown = Math.max(4.0, 8.0 - (lvl - 1) * 0.55);
  const radius = (220 + (lvl - 1) * 18) * (0.95 + (rMult - 1) * 0.35) * (lightProfile.shieldBonus > 0 ? 1.05 : 1);
  const heal = (12 + (lvl - 1) * 5) * healMult;
  return { level: lvl, cooldown, radius, heal, shieldBonus: lightProfile.shieldBonus };
}


function laserParams(player) {
  const lvl = (player.runSkills?.laser || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'laser');

  const range = (260 + (lvl - 1) * 15) * rMult;
  const dpsBase = 30 + (lvl - 1) * 14;
  return {
    range,
    dps: dpsBase * dMult,
  };
}


function stormStrikeParams(player) {
  const lvl = (player.runSkills?.stormStrike || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'stormStrike');

  const heroBiome = getPlayerHeroBiomeKey(player);
  const damage = (22 + (lvl - 1) * 8.0) * dMult;
  const castRange = (340 + (lvl - 1) * 14) * rMult;
  const splashRadius = 66 + (lvl - 1) * 6;
  const splashMul = Math.min(0.86, 0.52 + (lvl - 1) * 0.04 + (heroBiome === 'electric' ? 0.05 : 0));
  const cooldown = Math.max(0.75, 2.8 - (lvl - 1) * 0.16);
  return { level: lvl, damage, castRange, splashRadius, splashMul, cooldown };
}

function flameNovaParams(player) {
  const lvl = (player.runSkills?.flameNova || 0) | 0;
  if (lvl <= 0) return null;
  const dMult = getSkillDamageMult(player, 'flameNova');

  const heroBiome = getPlayerHeroBiomeKey(player);
  const fireBias = heroBiome === 'fire' ? 1.2 : 1;
  const radius = (92 + (lvl - 1) * 9) * (heroBiome === 'fire' ? 1.06 : 1);
  const damage = (18 + (lvl - 1) * 6.8) * dMult;
  const burnDur = (1.35 + (lvl - 1) * 0.18) * fireBias;
  const burnDps = (7 + (lvl - 1) * 2.6) * dMult * fireBias;
  const cooldown = Math.max(1.0, 3.4 - (lvl - 1) * 0.19);
  return { level: lvl, radius, damage, burnDur, burnDps, cooldown };
}

function iceShardsParams(player) {
  const lvl = (player.runSkills?.iceShards || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'iceShards');

  const count = Math.min(7, 3 + Math.floor((lvl - 1) / 2));
  const spreadDeg = 28 + (lvl - 1) * 2.5;
  const speed = 560 + (lvl - 1) * 28;
  const range = (300 + (lvl - 1) * 14) * rMult;
  const damage = (11 + (lvl - 1) * 3.8) * dMult;
  const radius = 7 + Math.floor((lvl - 1) / 3);
  const cooldown = Math.max(0.8, 2.3 - (lvl - 1) * 0.12);
  const freezeBuild = getPlayerHeroBiomeKey(player) === 'ice' ? 0.62 : 0.38;
  return { level: lvl, count, spreadDeg, speed, range, damage, radius, cooldown, freezeBuild };
}

function voidBurstParams(player) {
  const lvl = (player.runSkills?.voidBurst || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'voidBurst');

  const darkProfile = getDarkServantProfile(player);
  const damage = (20 + (lvl - 1) * 7.2) * dMult * darkProfile.damageMult;
  const castRange = (320 + (lvl - 1) * 14) * rMult;
  const radius = (72 + (lvl - 1) * 6) * (darkProfile.pullMult > 1 ? 1.06 : 1);
  const curseDur = 2.6 + (lvl - 1) * 0.20 + darkProfile.curseBonus * 0.1;
  const curseLv = 1 + Math.floor((lvl - 1) / 3);
  const cooldown = Math.max(0.9, 3.0 - (lvl - 1) * 0.16);
  return { level: lvl, damage, castRange, radius, curseDur, curseLv, cooldown };
}

function holyNovaParams(player) {
  const lvl = (player.runSkills?.holyNova || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'holyNova');

  const lightProfile = getLightServantProfile(player);
  const damageRadius = (110 + (lvl - 1) * 10) * (0.96 + (rMult - 1) * 0.28);
  const healRadius = (132 + (lvl - 1) * 12) * (0.96 + (rMult - 1) * 0.32) * (lightProfile.shieldBonus > 0 ? 1.04 : 1);
  const damage = (14 + (lvl - 1) * 5.4) * dMult;
  const heal = (6 + (lvl - 1) * 2.4) * lightProfile.healMult;
  const cooldown = Math.max(2.0, 6.0 - (lvl - 1) * 0.30);
  return { level: lvl, damageRadius, healRadius, damage, heal, cooldown };
}

function shrapnelBurstParams(player) {
  const lvl = (player.runSkills?.shrapnelBurst || 0) | 0;
  if (lvl <= 0) return null;
  const dMult = getSkillDamageMult(player, 'shrapnelBurst');
  const radius = 76 + (lvl - 1) * 7;
  const damage = (15 + (lvl - 1) * 5.6) * dMult;
  const cooldown = Math.max(0.95, 2.55 - (lvl - 1) * 0.14);
  return { level: lvl, radius, damage, cooldown };
}

function railVolleyParams(player) {
  const lvl = (player.runSkills?.railVolley || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'railVolley');
  const damage = (26 + (lvl - 1) * 8.2) * dMult;
  const castRange = (320 + (lvl - 1) * 12) * rMult;
  const splashRadius = 46 + (lvl - 1) * 4;
  const splashMul = Math.min(0.8, 0.45 + (lvl - 1) * 0.04);
  const cooldown = Math.max(0.82, 2.3 - (lvl - 1) * 0.12);
  return { level: lvl, damage, castRange, splashRadius, splashMul, cooldown };
}

function arcSparkParams(player) {
  const lvl = (player.runSkills?.arcSpark || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'arcSpark');
  const heroBiome = getPlayerHeroBiomeKey(player);
  const damage = (18 + (lvl - 1) * 6.0) * dMult;
  const castRange = (336 + (lvl - 1) * 14) * rMult;
  const chainRange = (110 + (lvl - 1) * 9) * rMult * (heroBiome === 'electric' ? 1.08 : 1);
  const chainTargets = Math.min(6, 1 + Math.floor((lvl - 1) / 2) + (heroBiome === 'electric' ? 1 : 0));
  const chainMul = Math.min(0.9, 0.64 + (lvl - 1) * 0.04);
  const cooldown = Math.max(0.78, 2.5 - (lvl - 1) * 0.14);
  return { level: lvl, damage, castRange, chainRange, chainTargets, chainMul, cooldown };
}

function staticPulseParams(player) {
  const lvl = (player.runSkills?.staticPulse || 0) | 0;
  if (lvl <= 0) return null;
  const dMult = getSkillDamageMult(player, 'staticPulse');
  const heroBiome = getPlayerHeroBiomeKey(player);
  const radius = 96 + (lvl - 1) * 8;
  const damage = (16 + (lvl - 1) * 5.4) * dMult;
  const slowDur = 0.85 + (lvl - 1) * 0.10;
  const slowMult = Math.max(0.34, Math.max(0.42, 0.82 - (lvl - 1) * 0.045) - (heroBiome === 'electric' ? 0.06 : 0));
  const cooldown = Math.max(0.92, 2.85 - (lvl - 1) * 0.16);
  return { level: lvl, radius, damage, slowDur, slowMult, cooldown };
}

function meteorRainParams(player) {
  const lvl = (player.runSkills?.meteorRain || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'meteorRain');
  const damage = (12 + (lvl - 1) * 4.8) * dMult;
  const castRange = (350 + (lvl - 1) * 14) * rMult;
  const splashRadius = 36 + (lvl - 1) * 4;
  const burnDur = 1.2 + (lvl - 1) * 0.15;
  const burnDps = (4.2 + (lvl - 1) * 1.5) * dMult;
  const count = Math.min(6, 3 + Math.floor((lvl - 1) / 2));
  const spread = 34 + (lvl - 1) * 3;
  const cooldown = Math.max(1.12, 3.5 - (lvl - 1) * 0.18);
  return { level: lvl, damage, castRange, splashRadius, burnDur, burnDps, count, spread, cooldown };
}

function magmaLanceParams(player) {
  const lvl = (player.runSkills?.magmaLance || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'magmaLance');
  const damage = (28 + (lvl - 1) * 8.8) * dMult;
  const castRange = (330 + (lvl - 1) * 12) * rMult;
  const splashRadius = 40 + (lvl - 1) * 4;
  const splashMul = Math.min(0.78, 0.42 + (lvl - 1) * 0.04);
  const burnDur = 1.35 + (lvl - 1) * 0.16;
  const burnDps = (6 + (lvl - 1) * 2.0) * dMult;
  const cooldown = Math.max(0.84, 2.25 - (lvl - 1) * 0.11);
  return { level: lvl, damage, castRange, splashRadius, splashMul, burnDur, burnDps, cooldown };
}

function frostNovaParams(player) {
  const lvl = (player.runSkills?.frostNova || 0) | 0;
  if (lvl <= 0) return null;
  const dMult = getSkillDamageMult(player, 'frostNova');
  const heroBiome = getPlayerHeroBiomeKey(player);
  const radius = 94 + (lvl - 1) * 8;
  const damage = (16 + (lvl - 1) * 5.2) * dMult;
  const slowDur = (1.0 + (lvl - 1) * 0.10) * (heroBiome === 'ice' ? 1.1 : 1);
  const slowMult = Math.max(0.28, Math.max(0.34, 0.72 - (lvl - 1) * 0.04) - (heroBiome === 'ice' ? 0.06 : 0));
  const frostDur = (1.3 + (lvl - 1) * 0.15) * (heroBiome === 'ice' ? 1.16 : 1);
  const cooldown = Math.max(0.96, 2.9 - (lvl - 1) * 0.16);
  return { level: lvl, radius, damage, slowDur, slowMult, frostDur, freezeBuild: heroBiome === 'ice' ? 1.0 : 0.64, cooldown };
}

function crystalSpearParams(player) {
  const lvl = (player.runSkills?.crystalSpear || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'crystalSpear');
  const heroBiome = getPlayerHeroBiomeKey(player);
  const damage = (27 + (lvl - 1) * 8.0) * dMult;
  const castRange = (330 + (lvl - 1) * 12) * rMult;
  const splashRadius = 40 + (lvl - 1) * 4;
  const splashMul = Math.min(0.78, 0.42 + (lvl - 1) * 0.04);
  const frostDur = (1.45 + (lvl - 1) * 0.15) * (heroBiome === 'ice' ? 1.14 : 1);
  const slowDur = (0.95 + (lvl - 1) * 0.10) * (heroBiome === 'ice' ? 1.08 : 1);
  const slowMult = Math.max(0.28, Math.max(0.36, 0.68 - (lvl - 1) * 0.04) - (heroBiome === 'ice' ? 0.05 : 0));
  const cooldown = Math.max(0.86, 2.3 - (lvl - 1) * 0.11);
  return { level: lvl, damage, castRange, splashRadius, splashMul, frostDur, slowDur, slowMult, freezeBuild: heroBiome === 'ice' ? 0.82 : 0.48, cooldown };
}

function soulDrainParams(player) {
  const lvl = (player.runSkills?.soulDrain || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'soulDrain');
  const darkProfile = getDarkServantProfile(player);
  const damage = (22 + (lvl - 1) * 7.0) * dMult * darkProfile.damageMult;
  const castRange = (310 + (lvl - 1) * 12) * rMult;
  const heal = 4 + (lvl - 1) * 1.8;
  const curseDur = 2.2 + (lvl - 1) * 0.18 + darkProfile.curseBonus * 0.08;
  const curseLv = 1 + Math.floor((lvl - 1) / 3);
  const radius = 42 + (lvl - 1) * 3;
  const cooldown = Math.max(0.92, 2.5 - (lvl - 1) * 0.12);
  return { level: lvl, damage, castRange, heal, curseDur, curseLv, radius, cooldown };
}

function dreadRingParams(player) {
  const lvl = (player.runSkills?.dreadRing || 0) | 0;
  if (lvl <= 0) return null;
  const dMult = getSkillDamageMult(player, 'dreadRing');
  const darkProfile = getDarkServantProfile(player);
  const radius = 96 + (lvl - 1) * 8;
  const damage = (17 + (lvl - 1) * 5.4) * dMult * darkProfile.damageMult;
  const curseDur = 2.4 + (lvl - 1) * 0.18 + darkProfile.curseBonus * 0.08;
  const curseLv = 1 + Math.floor((lvl - 1) / 3);
  const cooldown = Math.max(0.96, 3.0 - (lvl - 1) * 0.17);
  return { level: lvl, radius, damage, curseDur, curseLv, cooldown };
}

function prismRayParams(player) {
  const lvl = (player.runSkills?.prismRay || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'prismRay');
  const lightProfile = getLightServantProfile(player);
  const damage = (20 + (lvl - 1) * 6.4) * dMult;
  const castRange = (336 + (lvl - 1) * 14) * rMult;
  const splashRadius = 38 + (lvl - 1) * 4;
  const splashMul = Math.min(0.76, 0.42 + (lvl - 1) * 0.04);
  const heal = (4 + (lvl - 1) * 1.6) * lightProfile.healMult;
  const healRadius = (118 + (lvl - 1) * 8) * (0.96 + (rMult - 1) * 0.28);
  const cooldown = Math.max(0.9, 2.65 - (lvl - 1) * 0.13);
  return { level: lvl, damage, castRange, splashRadius, splashMul, heal, healRadius, cooldown };
}

function sanctuaryParams(player) {
  const lvl = (player.runSkills?.sanctuary || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'sanctuary');
  const lightProfile = getLightServantProfile(player);
  const radius = (106 + (lvl - 1) * 9) * (0.96 + (rMult - 1) * 0.26) * (lightProfile.shieldBonus > 0 ? 1.05 : 1);
  const damage = (14 + (lvl - 1) * 4.8) * dMult;
  const heal = (5 + (lvl - 1) * 2.0) * lightProfile.healMult;
  const healRadius = radius * 1.12;
  const cooldown = Math.max(1.7, 4.2 - (lvl - 1) * 0.20);
  return { level: lvl, radius, damage, heal, healRadius, cooldown };
}

function satellitesParams(player) {
  const lvl = (player.runSkills?.satellites || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'satellites');

  // Spirit-like progression (requested):
  // - Satellite count increases at lvl 4 and lvl 6 (max 3 in-run)
  // - Shop meta-level can add +2 more satellites (extra at lvl 4 and lvl 6)
  // - Other levels improve orbit radius (range), tick (atkspd), and damage.
  const metaLvl = getMetaSkillLevel(player, "satellites");
  const extraAt4 = metaLvl >= 2 ? 1 : 0;
  const extraAt6 = metaLvl >= 3 ? 1 : 0;

  let count = 2;
  if (lvl >= 4) count += 1 + extraAt4;
  if (lvl >= 6) count += 1 + extraAt6;
  count = Math.min(6, Math.max(2, count));

  // Orbit radius (acts like range) – grows steadily.
  const orbitR = (PET_FOLLOW_DIST + (lvl - 1) * 1.2 + Math.max(0, count - 1) * 1.8) * (0.92 + (rMult - 1) * 0.25);

  // Size step-ups every 3 levels.
  const orbR = 9 + Math.floor((lvl - 1) / 3);

  // Damage per hit – moderate (count is capped low early).
  const hitDamage = (9 + (lvl - 1) * 2.0) * dMult;

  // Tick (atkspd): improves over levels, floor capped.
  const tick = Math.max(0.11, 0.24 - (lvl - 1) * 0.011);

  // Rotation speed (visual + contact opportunities).
  const orbitSpeed = 1.35 + (lvl - 1) * 0.12;

  return { level: lvl, count, orbitR, orbR, hitDamage, tick, orbitSpeed };
}

function energyBarrierParams(player) {
  const lvl = (player.runSkills?.energyBarrier || 0) | 0;
  if (lvl <= 0) return null;

  const rMult = getTotalRangeMult(player);
  const dMult = getSkillDamageMult(player, 'energyBarrier');

  // Shield ring: keep the utility aura, but no knockback.
  const radiusBase = (lvl <= 3)
    ? (66 + (lvl - 1) * 4)
    : (78 + (lvl - 1) * 5);

  const radius = radiusBase * (0.9 + (rMult - 1) * 0.5);

  // Debuff (always applied while inside the ring)
  const slowMult = 0.85;     // 15% slow
  const dmgMult = 0.95;      // enemies deal 5% less damage

  // Damage pulse scales in later. There is no knockback anymore.
  let pulseDamage = 0;

  if (lvl >= 4 && lvl <= 6) {
    pulseDamage = (10 + (lvl - 4) * 4.0) * dMult;
  } else if (lvl >= 7) {
    pulseDamage = (16 + (lvl - 7) * 5.5) * dMult;
  }

  const tick = pulseDamage > 0 ? Math.max(0.18, 0.38 - (lvl - 1) * 0.012) : 0.35;

  // Shield durability grows harder now, because it is the main upgrade identity.
  const lightShieldBonus = getPlayerHeroBiomeKey(player) === 'light' ? getLightServantProfile(player).shieldBonus : 0;
  const shieldMax = 40 + (lvl - 1) * 30 + lightShieldBonus;
  const cooldown = Math.max(3.5, 10.5 - (lvl - 1) * 0.65);

  return { level: lvl, radius, pulseDamage, tick, slowMult, dmgMult, shieldMax, cooldown };
}

function spiritParams(player) {
  const lvl = (player.runSkills?.spirit || 0) | 0;
  if (lvl <= 0) return null;

  const rMult = getTotalRangeMult(player);
  const darkProfile = getDarkServantProfile(player);
  const dMult = getSkillDamageMult(player, 'spirit') * darkProfile.damageMult;

  // Extra spirits come from the shop meta-level:
  // metaLvl 1 = unlocked (base: max 3 in-run)
  // metaLvl 2 = +1 extra spirit at lvl 4
  // metaLvl 3+ = +1 extra spirit at lvl 6
  const metaLvl = getMetaSkillLevel(player, "spirit");
  const extraAt4 = metaLvl >= 2 ? 1 : 0;
  const extraAt6 = metaLvl >= 3 ? 1 : 0;

  let count = 2 + Math.max(0, darkProfile.extraCount | 0);
  if (lvl >= 4) count += 1 + extraAt4;
  if (lvl >= 6) count += 1 + extraAt6;
  count = Math.min(6, Math.max(2, count));

  // Same growth curve as Basic Shot, but 30% weaker.
  const baseRate = player.attackSpeed || player.baseAttackSpeed || 2.0;
  const rate = baseRate * (1 + (lvl - 1) * 0.05) * 0.70 * darkProfile.rateMult;

  const dmgBase = 4 + (lvl - 1) * 1.1;
  const damage = dmgBase * dMult * 0.70;

  const range = (440 + (lvl - 1) * 12) * rMult * 0.70;

  return { level: lvl, count, range, damage, rate, projectileSpeed: 900, curseDur: 1.1 + darkProfile.curseBonus * 0.15, curseLv: 1 + Math.floor((lvl - 1) / 3), pullMult: darkProfile.pullMult };
}


function electricZoneParams(player) {
  const lvl = (player.runSkills?.electricZone || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const heroBiome = getPlayerHeroBiomeKey(player);
  const dMult = getSkillDamageMult(player, 'electricZone');

  const radius = (140 + (lvl - 1) * 9) * rMult * (heroBiome === 'electric' ? 1.05 : 1);
  const tick = Math.max(0.16, 0.34 - (lvl - 1) * 0.01);
  const pulseDamage = (22 + (lvl - 1) * 7) * dMult;
  return { level: lvl, radius, tick, pulseDamage };
}

function summonParams(player) {
  const lvl = (player.runSkills?.summon || 0) | 0;
  if (lvl <= 0) return null;

  const lightProfile = getLightServantProfile(player);
  const metaLvl = getMetaSkillLevel(player, "summon");
  const extraAt4 = metaLvl >= 2 ? 1 : 0;
  const extraAt6 = metaLvl >= 3 ? 1 : 0;

  let count = 1 + Math.max(0, lightProfile.extraCount | 0);
  if (lvl >= 4) count += 1 + extraAt4;
  if (lvl >= 6) count += 1 + extraAt6;
  count = Math.min(6, Math.max(1, count));

  // Tank stats scale mostly via HP/DEF and a bit of movespeed.
  // They do NOT attack. They taunt enemies in a radius.
  const hp = 85 + (lvl - 1) * 30 + lightProfile.shieldBonus * 2;
  const def = Math.min(0.65, 0.15 + (lvl - 1) * 0.015 + (lightProfile.shieldBonus > 0 ? 0.04 : 0)); // damage reduction fraction
  // Tanks must be able to get in front of packs and NOT get dragged back to the hero.
  // Keep them meaningfully faster than early mobs; scale gently.
  const moveSpeed = 125 + (lvl - 1) * 5.0;
  const tauntR = 260 + (lvl - 1) * 14;
  const radius = 18 + Math.floor((lvl - 1) / 4);

  // Spawn cooldown: missing tanks are re-summoned over time.
  // Lvl 1: 8.0s -> Lvl 10: 3.5s
  const cooldown = Math.max(3.5, 8.0 - (lvl - 1) * 0.5);

  // "Lure" range around the hero: enemies within this radius will prefer tanks.
  // Slightly larger than taunt radius so tanks can pull from around the hero.
  const lureR = tauntR * 1.8;

  // How long enemies keep a tank as a preferred target before re-evaluating.
  const tauntHold = 0.9;

  return { level: lvl, count, hp, def, moveSpeed, tauntR, radius, followDist: PET_FOLLOW_DIST, cooldown, lureR, tauntHold, smiteRate: lightProfile.smiteRate, smiteDamageMult: lightProfile.smiteDamageMult, healOnSmite: lightProfile.healOnSmite, kind: 'lightWarden' };
}



export function updateSkills(player, state, dt) {
  if (!player || player.hp <= 0) return;

  const aimRange = getAimRangeForPlayer(player);
  const aimDir = getAimDirectionForPlayer(
    player,
    state.camera,
    state.canvas,
    state.enemies,
    aimRange,
    state.time
  );
  const firing = isFiringActive();

  return _updateSkillsImpl(player, state, dt, { aimDir, firing });
}

export function updateSkillsNet(player, state, dt, { aimDir, firing } = {}) {
  if (!player || player.hp <= 0) return;
  return _updateSkillsImpl(player, state, dt, { aimDir, firing });
}

function _updateSkillsImpl(player, state, dt, { aimDir, firing } = {}) {
  // Cache last aim dir for visuals + net playerState
  if (aimDir && Number.isFinite(aimDir.x) && Number.isFinite(aimDir.y)) {
    player.lastAimDir = { x: aimDir.x, y: aimDir.y };
  }

  // Update camera range hint
  player.range = getAttackRangeForPlayer(player);

  // Bullets
  const bp = bulletParams(player);
  player.attackCooldown = (player.attackCooldown || 0) - dt;
  if (bp && firing && aimDir && player.attackCooldown <= 0) {
    fireBullets(player, state, aimDir, {
      count: bp.count,
      spread: bp.spread,
      damage: bp.damage,
      range: bp.range,
    });
    player.attackCooldown = 1 / Math.max(0.01, bp.rate);
  }

  // Bombs
  const gp = bombsParams(player);
  if (gp) {
    player.bombCooldown = (player.bombCooldown || 0) - dt;
    if (firing && aimDir && player.bombCooldown <= 0) {
      fireBombs(player, state, aimDir, {
        count: gp.count,
        damage: gp.damage,
        range: gp.range,
        splashRadius: gp.splashRadius,
        speed: gp.speed,
      });
      player.bombCooldown = gp.cooldown;
    }
  }

  // Rockets
  const rp = rocketParams(player);
  if (rp) {
    player.rocketCooldown = (player.rocketCooldown || 0) - dt;
    if (firing && aimDir && player.rocketCooldown <= 0) {
      fireRockets(player, state, aimDir, {
        count: rp.count,
        damage: rp.damage,
        range: rp.range,
        splashRadius: rp.splashRadius,
      });
      player.rocketCooldown = rp.cooldown;
    }
  }

  const ebp = energyBombParams(player);
  if (ebp) {
    player.energyBombCooldown = (player.energyBombCooldown || 0) - dt;
    if (firing && aimDir && player.energyBombCooldown <= 0) {
      fireRockets(player, state, aimDir, ebp);
      triggerElectricSurge(player, 0.9);
      player.energyBombCooldown = ebp.cooldown;
    }
  }

  const fbp = fireBombParams(player);
  if (fbp) {
    player.fireBombCooldown = (player.fireBombCooldown || 0) - dt;
    if (firing && aimDir && player.fireBombCooldown <= 0) {
      fireRockets(player, state, aimDir, fbp);
      player.fireBombCooldown = fbp.cooldown;
    }
  }

  const ibp = iceBombParams(player);
  if (ibp) {
    player.iceBombCooldown = (player.iceBombCooldown || 0) - dt;
    if (firing && aimDir && player.iceBombCooldown <= 0) {
      fireRockets(player, state, aimDir, ibp);
      player.iceBombCooldown = ibp.cooldown;
    }
  }

  // Chain lightning
  const lp = lightningParams(player);
  if (lp) {
    player.lightningCooldown = (player.lightningCooldown || 0) - dt;
    if (firing && player.lightningCooldown <= 0) {
      fireChainLightning(player, state, {
        damage: lp.damage,
        chainRange: lp.chainRange,
        maxTargets: lp.maxTargets,
      }, aimDir || null);
      triggerElectricSurge(player, 1.0);
      player.lightningCooldown = lp.cooldown;
    }
  }

  // Laser beam (continuous)
  const zp = laserParams(player);
  if (zp) {
    updateLaser(player, state, dt, aimDir || null, !!firing, zp);
  } else {
    // If player has no laser skill, ensure they don't leave stale visuals.
    updateLaser(player, state, dt, null, false, null);
  }

  // New skills (always-on, Magic Survival style)
  const sp = satellitesParams(player);
  if (sp) updateSatellites(player, state, dt, sp);
  else player._satelliteVis = null;

  const eb = energyBarrierParams(player);
  if (eb) updateEnergyBarrier(player, state, dt, eb);
  else player._energyBarrierVis = null;

  const spr = spiritParams(player);
  if (spr) updateSpirit(player, state, dt, spr);
  else player._spiritVis = null;

  const ez = electricZoneParams(player);
  if (ez) updateElectricZone(player, state, dt, ez);
  else player._electricZoneVis = null;

  const su = summonParams(player);
  updateSummonTanks(player, state, dt, su);

  // --- Biome actives (floor shop) ---
  // Fireball (auto-target projectile)
  const fb = fireballParams(player);
  if (fb && firing) {
    updateFireball(player, state, dt, fb);
  }

  // Ice Ball (auto-target projectile with AoE slow)
  const iw = iceWallParams(player);
  if (iw && firing) {
    updateIceBall(player, state, dt, iw);
  }

  // Blackhole
  const bh = blackholeParams(player);
  if (bh && firing) {
    player.blackholeCooldown = (player.blackholeCooldown || 0) - dt;
    if (player.blackholeCooldown <= 0) {
      spawnBlackhole(player, state, bh);
      player.blackholeCooldown = bh.cooldown;
    }
  }

  // Light Heal (does not require firing)
  const lh = lightHealParams(player);
  if (lh) {
    player.lightHealCooldown = (player.lightHealCooldown || 0) - dt;
    if (player.lightHealCooldown <= 0) {
      emitHealPulse(player, state, lh);
      player.lightHealCooldown = lh.cooldown;
    }
  }

  const ss = stormStrikeParams(player);
  if (ss && firing) {
    player.stormStrikeCooldown = (player.stormStrikeCooldown || 0) - dt;
    if (player.stormStrikeCooldown <= 0) {
      if (castStormStrike(player, state, ss)) { triggerElectricSurge(player, 1.1); player.stormStrikeCooldown = ss.cooldown; }
      else player.stormStrikeCooldown = Math.max(0.25, ss.cooldown * 0.45);
    }
  }

  const fn = flameNovaParams(player);
  if (fn && firing) {
    player.flameNovaCooldown = (player.flameNovaCooldown || 0) - dt;
    if (player.flameNovaCooldown <= 0) {
      if (castFlameNova(player, state, fn)) player.flameNovaCooldown = fn.cooldown;
      else player.flameNovaCooldown = Math.max(0.35, fn.cooldown * 0.55);
    }
  }

  const ish = iceShardsParams(player);
  if (ish && firing) {
    player.iceShardsCooldown = (player.iceShardsCooldown || 0) - dt;
    if (player.iceShardsCooldown <= 0) {
      if (fireIceShards(player, state, ish, aimDir || null)) player.iceShardsCooldown = ish.cooldown;
      else player.iceShardsCooldown = Math.max(0.25, ish.cooldown * 0.45);
    }
  }

  const vb = voidBurstParams(player);
  if (vb && firing) {
    player.voidBurstCooldown = (player.voidBurstCooldown || 0) - dt;
    if (player.voidBurstCooldown <= 0) {
      if (castVoidBurst(player, state, vb)) player.voidBurstCooldown = vb.cooldown;
      else player.voidBurstCooldown = Math.max(0.3, vb.cooldown * 0.45);
    }
  }

  const hn = holyNovaParams(player);
  if (hn) {
    player.holyNovaCooldown = (player.holyNovaCooldown || 0) - dt;
    if (player.holyNovaCooldown <= 0) {
      castHolyNova(player, state, hn);
      player.holyNovaCooldown = hn.cooldown;
    }
  }

  const sb = shrapnelBurstParams(player);
  if (sb && firing) {
    player.shrapnelBurstCooldown = (player.shrapnelBurstCooldown || 0) - dt;
    if (player.shrapnelBurstCooldown <= 0) {
      if (castShrapnelBurst(player, state, sb)) player.shrapnelBurstCooldown = sb.cooldown;
      else player.shrapnelBurstCooldown = Math.max(0.25, sb.cooldown * 0.45);
    }
  }

  const rv = railVolleyParams(player);
  if (rv && firing) {
    player.railVolleyCooldown = (player.railVolleyCooldown || 0) - dt;
    if (player.railVolleyCooldown <= 0) {
      if (castRailVolley(player, state, rv)) player.railVolleyCooldown = rv.cooldown;
      else player.railVolleyCooldown = Math.max(0.25, rv.cooldown * 0.45);
    }
  }

  const as = arcSparkParams(player);
  if (as && firing) {
    player.arcSparkCooldown = (player.arcSparkCooldown || 0) - dt;
    if (player.arcSparkCooldown <= 0) {
      if (castArcSpark(player, state, as)) { triggerElectricSurge(player, 1.0); player.arcSparkCooldown = as.cooldown; }
      else player.arcSparkCooldown = Math.max(0.25, as.cooldown * 0.45);
    }
  }

  const stp = staticPulseParams(player);
  if (stp && firing) {
    player.staticPulseCooldown = (player.staticPulseCooldown || 0) - dt;
    if (player.staticPulseCooldown <= 0) {
      if (castStaticPulse(player, state, stp)) { triggerElectricSurge(player, 0.95); player.staticPulseCooldown = stp.cooldown; }
      else player.staticPulseCooldown = Math.max(0.28, stp.cooldown * 0.48);
    }
  }

  const mr = meteorRainParams(player);
  if (mr && firing) {
    player.meteorRainCooldown = (player.meteorRainCooldown || 0) - dt;
    if (player.meteorRainCooldown <= 0) {
      if (castMeteorRain(player, state, mr)) player.meteorRainCooldown = mr.cooldown;
      else player.meteorRainCooldown = Math.max(0.35, mr.cooldown * 0.50);
    }
  }

  const ml = magmaLanceParams(player);
  if (ml && firing) {
    player.magmaLanceCooldown = (player.magmaLanceCooldown || 0) - dt;
    if (player.magmaLanceCooldown <= 0) {
      if (castMagmaLance(player, state, ml)) player.magmaLanceCooldown = ml.cooldown;
      else player.magmaLanceCooldown = Math.max(0.25, ml.cooldown * 0.45);
    }
  }

  const frn = frostNovaParams(player);
  if (frn && firing) {
    player.frostNovaCooldown = (player.frostNovaCooldown || 0) - dt;
    if (player.frostNovaCooldown <= 0) {
      if (castFrostNova(player, state, frn)) player.frostNovaCooldown = frn.cooldown;
      else player.frostNovaCooldown = Math.max(0.28, frn.cooldown * 0.48);
    }
  }

  const cs = crystalSpearParams(player);
  if (cs && firing) {
    player.crystalSpearCooldown = (player.crystalSpearCooldown || 0) - dt;
    if (player.crystalSpearCooldown <= 0) {
      if (castCrystalSpear(player, state, cs)) player.crystalSpearCooldown = cs.cooldown;
      else player.crystalSpearCooldown = Math.max(0.25, cs.cooldown * 0.45);
    }
  }

  const sd = soulDrainParams(player);
  if (sd && firing) {
    player.soulDrainCooldown = (player.soulDrainCooldown || 0) - dt;
    if (player.soulDrainCooldown <= 0) {
      if (castSoulDrain(player, state, sd)) player.soulDrainCooldown = sd.cooldown;
      else player.soulDrainCooldown = Math.max(0.25, sd.cooldown * 0.45);
    }
  }

  const dr = dreadRingParams(player);
  if (dr && firing) {
    player.dreadRingCooldown = (player.dreadRingCooldown || 0) - dt;
    if (player.dreadRingCooldown <= 0) {
      if (castDreadRing(player, state, dr)) player.dreadRingCooldown = dr.cooldown;
      else player.dreadRingCooldown = Math.max(0.30, dr.cooldown * 0.48);
    }
  }

  const pr = prismRayParams(player);
  if (pr && firing) {
    player.prismRayCooldown = (player.prismRayCooldown || 0) - dt;
    if (player.prismRayCooldown <= 0) {
      if (castPrismRay(player, state, pr)) player.prismRayCooldown = pr.cooldown;
      else player.prismRayCooldown = Math.max(0.25, pr.cooldown * 0.45);
    }
  }

  const san = sanctuaryParams(player);
  if (san) {
    player.sanctuaryCooldown = (player.sanctuaryCooldown || 0) - dt;
    if (player.sanctuaryCooldown <= 0) {
      castSanctuary(player, state, san);
      player.sanctuaryCooldown = san.cooldown;
    }
  }
}
