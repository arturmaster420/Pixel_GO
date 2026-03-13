import { fireBullets } from "./bullets.js";
import { fireRockets } from "./rockets.js";
import { updateLaser, maxRangeForLevel as laserMaxRangeForLevel } from "./laser.js";
import { fireChainLightning } from "./lightning.js";
import {
  getAimDirectionForPlayer,
  isFiringActive,
} from "../core/mouseController.js";

export function getWeaponStage(level) {
  // UPDATE 2.0 weapon progression:
  // 1–49   : Stage 1 (Pistol / Bullets)
  // 50–149 : Stage 2 (Rockets)
  // 150–299: Stage 3 (Laser)
  // 300+   : Stage 4 (Chain Lightning)
  // Note: transitions happen at level 50 / 150 / 300.
  if (level < 50) return 1;
  if (level < 150) return 2;
  if (level < 300) return 3;
  return 4;
}

export function updateWeapon(player, state, dt) {
  const stage = getWeaponStage(player.level);
  player.weaponStage = stage;

  const rangeMult = player.metaRangeMult || 1;
  let attackRange = 0;

  // Compute effective attack range for current weapon stage
  if (stage === 1) {
    const params = bulletParamsForLevel(player.level);
    attackRange = params.range * rangeMult;
  } else if (stage === 2) {
    const params = rocketParamsForLevel(player.level);
    attackRange = params.range * rangeMult;
  } else if (stage === 3) {
    const baseRange = laserMaxRangeForLevel(player.level);
    attackRange = baseRange * rangeMult;
  } else if (stage === 4) {
    const params = lightningParamsForLevel(player.level);
    attackRange = params.chainRange * rangeMult;
  }

  const aimDir = getAimDirectionForPlayer(
    player,
    state.camera,
    state.canvas,
    state.enemies,
    attackRange,
    state.time
  );
  if (aimDir) {
    player.lastAimDir.x = aimDir.x;
    player.lastAimDir.y = aimDir.y;
  }

  if (stage === 3) {
    // Laser is continuous: update beam each frame using aimDir & firing state
    updateLaser(player, state, dt, aimDir, isFiringActive());
    // Keep player.range in sync with laser reach for camera / auto-aim
    if (attackRange > 0) {
      player.range = attackRange;
    }
    return;
  }

  if (!isFiringActive()) return;
  // If there is no aim direction (e.g. no enemy in range in portrait) — do not shoot.
  if (!aimDir) return;
  if (player.attackCooldown > 0) return;

  let dx = aimDir.x;
  let dy = aimDir.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;

  if (stage === 1) {
    const params = bulletParamsForLevel(player.level);
    const finalRange = params.range * rangeMult;
    fireBullets(player, state, { dx, dy }, { ...params, range: finalRange });
    player._weaponDamage = params.damage;
    player._weaponAttackSpeed = params.attackSpeed;
    player.range = finalRange;
  } else if (stage === 2) {
    const params = rocketParamsForLevel(player.level);
    const finalRange = params.range * rangeMult;
    fireRockets(player, state, { dx, dy }, { ...params, range: finalRange });
    player._weaponDamage = params.damage;
    player._weaponAttackSpeed = params.attackSpeed;
    player.range = finalRange;
  } else if (stage === 4) {
    const params = lightningParamsForLevel(player.level);
    const finalRange = params.chainRange * rangeMult;
    fireChainLightning(
      player,
      state,
      { ...params, chainRange: finalRange },
      aimDir
    );
    player._weaponDamage = params.damage;
    player._weaponAttackSpeed = params.attackSpeed;
    player.range = finalRange;
  }

  const baseAtk = player._weaponAttackSpeed || player.baseAttackSpeed;
  const metaAttackMult = player.metaAttackMult || 1;
  const atk = baseAtk * metaAttackMult;
  player.attackCooldown = 1 / Math.max(0.1, atk);
}

// Attack range helper (used by net input + UI)
export function getAttackRangeForPlayer(player) {
  const stage = getWeaponStage(player.level);
  const rangeMult = player.metaRangeMult || 1;
  if (stage === 1) return bulletParamsForLevel(player.level).range * rangeMult;
  if (stage === 2) return rocketParamsForLevel(player.level).range * rangeMult;
  if (stage === 3) return laserMaxRangeForLevel(player.level) * rangeMult;
  if (stage === 4) return lightningParamsForLevel(player.level).chainRange * rangeMult;
  return 0;
}

// Net-friendly weapon update: caller can override aimDir + firing.
export function updateWeaponNet(player, state, dt, opts = {}) {
  const stage = getWeaponStage(player.level);
  player.weaponStage = stage;

  const rangeMult = player.metaRangeMult || 1;
  const attackRange = getAttackRangeForPlayer(player);

  // IMPORTANT (co-op): do NOT auto-compute aim direction for network players.
  // Remote clients already computed their own aim (1-hand auto targeting or 2-hand stick/mouse).
  // If we fall back to local getAimDirectionForPlayer() we will incorrectly use the HOST's
  // control mode / pointer state, causing "aim follows other player" bugs.
  let aimDir = opts.aimDir || null;
  if (aimDir && Math.hypot(aimDir.x || 0, aimDir.y || 0) < 0.001) {
    aimDir = null;
  }

  if (aimDir) {
    player.lastAimDir.x = aimDir.x;
    player.lastAimDir.y = aimDir.y;
  }

  const firing = typeof opts.firing === "boolean" ? opts.firing : true;

  if (stage === 3) {
    updateLaser(player, state, dt, aimDir, firing);
    if (attackRange > 0) player.range = attackRange;
    return;
  }

  if (!firing) return;
  if (!aimDir) return;
  if (player.attackCooldown > 0) return;

  let dx = aimDir.x;
  let dy = aimDir.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;

  if (stage === 1) {
    const params = bulletParamsForLevel(player.level);
    const finalRange = params.range * rangeMult;
    fireBullets(player, state, { dx, dy }, { ...params, range: finalRange });
    player._weaponDamage = params.damage;
    player._weaponAttackSpeed = params.attackSpeed;
    player.range = finalRange;
  } else if (stage === 2) {
    const params = rocketParamsForLevel(player.level);
    const finalRange = params.range * rangeMult;
    fireRockets(player, state, { dx, dy }, { ...params, range: finalRange });
    player._weaponDamage = params.damage;
    player._weaponAttackSpeed = params.attackSpeed;
    player.range = finalRange;
  } else if (stage === 4) {
    const params = lightningParamsForLevel(player.level);
    const finalRange = params.chainRange * rangeMult;
    fireChainLightning(player, state, { ...params, chainRange: finalRange }, aimDir);
    player._weaponDamage = params.damage;
    player._weaponAttackSpeed = params.attackSpeed;
    player.range = finalRange;
  }

  const baseAtk = player._weaponAttackSpeed || player.baseAttackSpeed;
  const metaAttackMult = player.metaAttackMult || 1;
  const atk = baseAtk * metaAttackMult;
  player.attackCooldown = 1 / Math.max(0.1, atk);
}


function bulletParamsForLevel(level) {
  // Stage 1: levels 1–50 mapped to 0–49
  const l = Math.max(0, Math.min(49, (level | 0) - 1));
  const damage = 2 + (l / 49) * 6;

  let count;
  if (l < 10) count = 1;
  else if (l < 20) count = 2;
  else if (l < 30) count = 3;
  else if (l < 40) count = 4;
  else count = 5 + Math.floor((l - 40) / 4); // up to 7 bullets

  const spread = 2 + (l / 49) * 23;
  const attackSpeed = 2 + (l / 49) * 0.5;
  const range = (600 + l * 6) / 3;

  return { damage, count, spread, attackSpeed, range };
}



function rocketParamsForLevel(level) {
  // Stage 2: levels 50–150 mapped to 0–100
  const l = Math.max(0, Math.min(100, (level | 0) - 50));
  const t = l / 100;

  const damage = 22 + t * 48; // 22 → 70

  let count;
  if (l < 20) count = 1;
  else if (l < 35) count = 2;
  else if (l < 50) count = 3;
  else if (l < 65) count = 4;
  else if (l < 80) count = 5;
  else if (l < 92) count = 6;
  else count = 7;

  const splashRadius = 45 + t * 55; // 45 → 100
  const attackSpeed = 0.75 + t * 0.25; // 0.75 → 1.0 shots/sec
  const range = (800 + t * 520) / 3; // 266 → 440 (before meta range)

  return { damage, count, splashRadius, attackSpeed, range };
}


function lightningParamsForLevel(level) {
  // Stage 4: levels 300–500 mapped to 0–200
  const l = Math.max(0, Math.min(200, (level | 0) - 300));
  const t = l / 200;

  // Ricochet progression:
  // start (lvl 300): 1 ricochet  => 2 targets total
  // max (around lvl 470): 6 ricochets => 7 targets total
  const start = 300;
  const end = 470;
  const tt = Math.max(0, Math.min(1, ((level | 0) - start) / (end - start)));
  const ricochets = 1 + Math.floor(tt * 5); // 1 → 6
  const maxTargets = 1 + ricochets; // include the first target

  const damage = 90 + t * 120; // 90 → 210
  const chainRange = 170 + t * 130; // 170 → 300
  const attackSpeed = 2.6 + t * 0.4; // 2.6 → 3.0

  return { damage, chainRange, attackSpeed, maxTargets };
}

