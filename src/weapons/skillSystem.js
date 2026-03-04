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
import { getAimDirectionForPlayer, isFiringActive } from "../core/mouseController.js";

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

  const lightLvl = (s.lightning || 0) | 0;
  const lightRange = lightLvl > 0 ? (240 + (lightLvl - 1) * 10) * rMult : 0;

  const laserLvl = (s.laser || 0) | 0;
  const laserRange = laserLvl > 0 ? (260 + (laserLvl - 1) * 15) * rMult : 0;

  return Math.max(220 * rMult, bulletRange, bombRange, rocketRange, lightRange, laserRange);
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

  const lightLvl = (s.lightning || 0) | 0;
  const lightRange = lightLvl > 0 ? (240 + (lightLvl - 1) * 10) * rMult : 0;

  const laserLvl = (s.laser || 0) | 0;
  const laserRange = laserLvl > 0 ? (260 + (laserLvl - 1) * 15) * rMult : 0;

  return Math.max(220 * rMult, bulletRange, bombRange, rocketRange, lightRange, laserRange);
}

function bulletParams(player) {
  const lvl = (player.runSkills?.bullets ?? 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getDamageMult(player);

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
  const dMult = getDamageMult(player);

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
  const dMult = getDamageMult(player);

  // Evolved rockets (obtained via fusion) are intended to feel like a big power spike.
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

function lightningParams(player) {
  const lvl = (player.runSkills?.lightning || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getDamageMult(player);

  const maxTargets = Math.min(7, 2 + Math.floor((lvl - 1) / 4));
  const dmgBase = 22 + (lvl - 1) * 5;
  const chainRange = (240 + (lvl - 1) * 10) * rMult;
  const cd = Math.max(0.95, 2.1 - (lvl - 1) * 0.05);

  return {
    maxTargets,
    damage: dmgBase * dMult,
    chainRange,
    cooldown: cd,
  };
}

function laserParams(player) {
  const lvl = (player.runSkills?.laser || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getDamageMult(player);

  const range = (260 + (lvl - 1) * 15) * rMult;
  const dpsBase = 30 + (lvl - 1) * 14;
  return {
    range,
    dps: dpsBase * dMult,
  };
}

function satellitesParams(player) {
  const lvl = (player.runSkills?.satellites || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getDamageMult(player);

  // Spirit-like progression (requested):
  // - Satellite count increases at lvl 4 and lvl 6 (max 3 in-run)
  // - Shop meta-level can add +2 more satellites (extra at lvl 4 and lvl 6)
  // - Other levels improve orbit radius (range), tick (atkspd), and damage.
  const metaLvl = getMetaSkillLevel(player, "satellites");
  const extraAt4 = metaLvl >= 2 ? 1 : 0;
  const extraAt6 = metaLvl >= 3 ? 1 : 0;

  let count = 1;
  if (lvl >= 4) count += 1 + extraAt4;
  if (lvl >= 6) count += 1 + extraAt6;
  count = Math.min(5, Math.max(1, count));

  // Orbit radius (acts like range) – grows steadily.
  const orbitR = (PET_FOLLOW_DIST + (lvl - 1) * 1.2 + Math.max(0, count - 1) * 1.8) * (0.92 + (rMult - 1) * 0.25);

  // Size step-ups every 3 levels.
  const orbR = 9 + Math.floor((lvl - 1) / 3);

  // Damage per hit – moderate (count is capped low early).
  const hitDamage = (9 + (lvl - 1) * 2.0) * dMult;

  // Tick (atkspd): improves over levels, floor capped.
  const tick = Math.max(0.11, 0.24 - (lvl - 1) * 0.011);

  // Rotation speed (visual + contact opportunities).
  const orbitSpeed = 1.1 + (lvl - 1) * 0.06;

  return { level: lvl, count, orbitR, orbR, hitDamage, tick, orbitSpeed };
}

function energyBarrierParams(player) {
  const lvl = (player.runSkills?.energyBarrier || 0) | 0;
  if (lvl <= 0) return null;

  const rMult = getTotalRangeMult(player);
  const dMult = getDamageMult(player);

  // Early levels: utility first (slow + tiny mitigation), then it grows into a real barrier.
  // This keeps it from hard-locking melee enemies at lvl 1.
  const radiusBase = (lvl <= 3)
    ? (66 + (lvl - 1) * 4)
    : (78 + (lvl - 1) * 5);

  const radius = radiusBase * (0.9 + (rMult - 1) * 0.5);

  // Debuff (always applied while inside the ring)
  const slowMult = 0.85;     // 15% slow
  const dmgMult = 0.95;      // enemies deal 5% less damage

  // Repel + pulse scale in later (lvl 4+). Lvl 1-3 have no repel and no damage.
  let pushSpeed = 0;
  let pulseDamage = 0;

  if (lvl >= 4 && lvl <= 6) {
    pushSpeed = 140 + (lvl - 4) * 35;
    pulseDamage = (10 + (lvl - 4) * 4.0) * dMult;
  } else if (lvl >= 7) {
    pushSpeed = 260 + (lvl - 7) * 24;
    pulseDamage = (16 + (lvl - 7) * 5.5) * dMult;
  }

  const tick = pulseDamage > 0 ? Math.max(0.18, 0.38 - (lvl - 1) * 0.012) : 0.35;

  // Shield durability + cooldown (new):
  // Barrier absorbs incoming damage until the shield is depleted, then disappears and re-forms after cooldown.
  const shieldMax = 28 + (lvl - 1) * 22;
  const cooldown = Math.max(3.5, 10.5 - (lvl - 1) * 0.65);

  return { level: lvl, radius, pushSpeed, pulseDamage, tick, slowMult, dmgMult, shieldMax, cooldown };
}

function spiritParams(player) {
  const lvl = (player.runSkills?.spirit || 0) | 0;
  if (lvl <= 0) return null;

  const rMult = getTotalRangeMult(player);
  const dMult = getDamageMult(player);

  // Extra spirits come from the shop meta-level:
  // metaLvl 1 = unlocked (base: max 3 in-run)
  // metaLvl 2 = +1 extra spirit at lvl 4
  // metaLvl 3+ = +1 extra spirit at lvl 6
  const metaLvl = getMetaSkillLevel(player, "spirit");
  const extraAt4 = metaLvl >= 2 ? 1 : 0;
  const extraAt6 = metaLvl >= 3 ? 1 : 0;

  let count = 1;
  if (lvl >= 4) count += 1 + extraAt4;
  if (lvl >= 6) count += 1 + extraAt6;
  count = Math.min(5, Math.max(1, count));

  // Same growth curve as Basic Shot, but 30% weaker.
  const baseRate = player.attackSpeed || player.baseAttackSpeed || 2.0;
  const rate = baseRate * (1 + (lvl - 1) * 0.05) * 0.70;

  const dmgBase = 4 + (lvl - 1) * 1.1;
  const damage = dmgBase * dMult * 0.70;

  const range = (440 + (lvl - 1) * 12) * rMult * 0.70;

  return { level: lvl, count, range, damage, rate, projectileSpeed: 900 };
}

function electricZoneParams(player) {
  const lvl = (player.runSkills?.electricZone || 0) | 0;
  if (lvl <= 0) return null;
  const rMult = getTotalRangeMult(player);
  const dMult = getDamageMult(player);

  const radius = (140 + (lvl - 1) * 9) * rMult;
  const tick = Math.max(0.16, 0.34 - (lvl - 1) * 0.01);
  const pulseDamage = (22 + (lvl - 1) * 7) * dMult;
  return { level: lvl, radius, tick, pulseDamage };
}

function summonParams(player) {
  const lvl = (player.runSkills?.summon || 0) | 0;
  if (lvl <= 0) return null;

  const metaLvl = getMetaSkillLevel(player, "summon");
  const extraAt4 = metaLvl >= 2 ? 1 : 0;
  const extraAt6 = metaLvl >= 3 ? 1 : 0;

  let count = 1;
  if (lvl >= 4) count += 1 + extraAt4;
  if (lvl >= 6) count += 1 + extraAt6;
  count = Math.min(5, Math.max(1, count));

  // Tank stats scale mostly via HP/DEF and a bit of movespeed.
  // They do NOT attack. They taunt enemies in a radius.
  const hp = 85 + (lvl - 1) * 30;
  const def = Math.min(0.55, 0.15 + (lvl - 1) * 0.015); // damage reduction fraction
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

  return { level: lvl, count, hp, def, moveSpeed, tauntR, radius, followDist: PET_FOLLOW_DIST, cooldown, lureR, tauntHold };
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
}
