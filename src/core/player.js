import { getKeyboardVector } from "./input.js";
import { getMoveVectorFromPointer } from "./mouseController.js";
import { getWorldBounds } from "../world/mapGenerator.js";
import { AVATARS } from "./avatars.js";
import { drawAura } from "./auras.js";

export class Player {
  constructor(startPos, startLevel) {
    this.x = startPos.x;
    this.y = startPos.y;
    this.vx = 0;
    this.vy = 0;
    this.radius = 18;
    this.color = "#8fe3ff";

    this.nickname = "";
    this.avatarIndex = 0;
    this.auraId = 0;

    this.level = startLevel || 0;
    // Track run-relative level so XP curve is consistent even if meta startLevel > 0.
    this._runStartLevel = this.level;
    this.xp = 0;

    this.baseMaxHP = 100;
    this.baseMoveSpeed = 220;
    this.baseDamage = 4;
    this.baseAttackSpeed = 2.0;
    this.baseRange = 1.0;

    this.maxHP = this.baseMaxHP;
    this.hp = this.maxHP;

    this.moveSpeed = this.baseMoveSpeed;
    this.damage = this.baseDamage;
    this.attackSpeed = this.baseAttackSpeed;
    this.range = this.baseRange;

    this.maxAttackSpeed = 4.0;
    this.maxDamage = 20.0;
    this.maxMoveSpeed = 380;
    this.rangeLimit = 1.0;

    this.laserHeat = 0;
    this.laserMaxHeat = 100;
    this.laserHeatRate = 1.0;
    this.laserOverheated = false;

    this.attackCooldown = 0;

    // Skill system cooldowns (in-run upgrades)
    this.rocketCooldown = 0;
    this.lightningCooldown = 0;

    // In-run upgrade system (Magic Survival style)
    this._pendingLevelUps = 0;
    this.runSkills = {
      bullets: 1,
      bombs: 0,
      rockets: 0,
      // Satellites are available in the run-upgrade pool by default,
      // but are NOT granted at run start.
      satellites: 0,
      energyBarrier: 0,
      spirit: 0,
      summon: 0,
      electricZone: 0,
      laser: 0,
      lightning: 0,
    };
    this.runEvolutions = {};
    this.runPassives = {
      damage: 0,
      attackSpeed: 0,
      moveSpeed: 0,
      hp: 0,
      hpRegen: 0,
      range: 0,
      pickupRadius: 0,
      xpGain: 0,
      critChance: 0,
      critDamage: 0,
      lifeSteal: 0,
    };
    this._runBaseMaxHP = undefined;

    // Derived run stats (filled by core/runUpgrades.js)
    this.runDamageMult = 1;
    this.runAttackMult = 1;
    this.runMoveMult = 1;
    this.runRangeMult = 1;
    this.runPickupBonusRadius = 0;
    this.runXpGainMult = 1;
    this.runCritChanceAdd = 0;
    this.runCritDamageMult = 1;
    this.runLifeSteal = 0;
    this.runHpRegen = 0;

    this.weaponStage = 1;

    this.lastAimDir = { x: 0, y: 1 };

    // Targeting 2.0 memory (1-Hand autoattack)
    this.lastPlayerTarget = null;
    this.lastPlayerTargetAt = -Infinity;
    this.lastAttacker = null;
    this.lastAttackerAt = -Infinity;

    // Combat marker (used for "out of combat" upgrade gating)
    this._lastCombatAt = -Infinity;
  }

  reset(startPos, startLevel) {
    this.x = startPos.x;
    this.y = startPos.y;
    this.vx = 0;
    this.vy = 0;

    this.level = startLevel || 0;
    this._runStartLevel = this.level;
    this.xp = 0;

    this.maxHP = this.baseMaxHP;
    this.hp = this.maxHP;

    this.moveSpeed = this.baseMoveSpeed;
    this.damage = this.baseDamage;
    this.attackSpeed = this.baseAttackSpeed;
    this.range = this.baseRange;

    this.attackCooldown = 0;
    this.rocketCooldown = 0;
    this.lightningCooldown = 0;
    this.weaponStage = 1;
    this.laserHeat = 0;
    this.laserOverheated = false;

    // Reset in-run upgrades
    this._pendingLevelUps = 0;
    this.runSkills = {
      bullets: 1,
      bombs: 0,
      rockets: 0,
      satellites: 0,
      energyBarrier: 0,
      spirit: 0,
      summon: 0,
      electricZone: 0,
      laser: 0,
      lightning: 0,
    };
    this.runEvolutions = {};
    this.runPassives = {
      damage: 0,
      attackSpeed: 0,
      moveSpeed: 0,
      hp: 0,
      hpRegen: 0,
      range: 0,
      pickupRadius: 0,
      xpGain: 0,
      critChance: 0,
      critDamage: 0,
      lifeSteal: 0,
    };
    this._runBaseMaxHP = undefined;
    this.runDamageMult = 1;
    this.runAttackMult = 1;
    this.runMoveMult = 1;
    this.runRangeMult = 1;
    this.runPickupBonusRadius = 0;
    this.runXpGainMult = 1;
    this.runCritChanceAdd = 0;
    this.runCritDamageMult = 1;
    this.runLifeSteal = 0;
    this.runHpRegen = 0;

    // Targeting 2.0 memory reset
    this.lastPlayerTarget = null;
    this.lastPlayerTargetAt = -Infinity;
    this.lastAttacker = null;
    this.lastAttackerAt = -Infinity;

    this._lastCombatAt = -Infinity;
  }

  xpToNext() {
    // Run-relative leveling curve (slower, less spammy). Keeps pace consistent
    // regardless of meta startLevel.
    const runLvl = Math.max(0, (this.level | 0) - ((this._runStartLevel | 0) || 0));
    // Targets: early upgrades ~25–45s, mid ~45–75s, late ~60–120s.
    // Curve: quadratic with a healthy base.
    const base = 180 + runLvl * 60 + runLvl * runLvl * 8;

    // Make the first ~10 run-levels faster (feel-good onboarding):
    // smoothly ramp from 55% → 100% cost by runLvl 10.
    const ramp = runLvl < 10 ? (0.55 + (runLvl / 10) * 0.45) : 1.0;
    return Math.max(1, Math.floor(base * ramp));
  }

  gainXP(amount, state) {
    // TEMP: speed up run leveling
    amount *= 6;
    this.xp += amount;
    let leveled = false;
    while (this.xp >= this.xpToNext()) {
      this.xp -= this.xpToNext();
      this.level += 1;
      leveled = true;

      // Queue an in-run upgrade choice per level.
      this._pendingLevelUps = (this._pendingLevelUps || 0) + 1;

      // Full HP restore on each level up
      this.hp = this.maxHP;
    }

    if (leveled && state) {
      // Co-op: only show local UI feedback on the owning client.
      // Host simulates ALL players, but we don't want host HUD spam for remote players.
      // Joiners will show their own "LEVEL UP" based on replicated player level.
      if (state.net && state.net.isHost) {
        const localId = state.player ? String(state.player.id) : "";
        const myId = String(this.id || "");
        if (localId && myId && localId !== myId) return;
      }

      if (state.floatingTexts) {
        state.floatingTexts.push({
          x: this.x,
          y: this.y - 30,
          text: "LEVEL UP!",
          time: 1.2,
        });
      }
      if (state.popups) {
        state.popups.push({
          text: "Level Up! Lv " + this.level,
          time: 2.0,
        });
      }
    }
  }

  update(dt, state) {
    const pointerMove = getMoveVectorFromPointer();
    let dirX = pointerMove.x;
    let dirY = pointerMove.y;

    if (Math.hypot(dirX, dirY) < 0.1) {
      const kb = getKeyboardVector();
      dirX = kb.x;
      dirY = kb.y;
    }

    const len = Math.hypot(dirX, dirY);
    if (len > 0.001) {
      dirX /= len;
      dirY /= len;
    } else {
      dirX = 0;
      dirY = 0;
    }

    this.vx = dirX * this.moveSpeed;
    this.vy = dirY * this.moveSpeed;

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const bounds = getWorldBounds();
    const minX = bounds.minX + this.radius;
    const maxX = bounds.maxX - this.radius;
    const minY = bounds.minY + this.radius;
    const maxY = bounds.maxY - this.radius;

    if (this.x < minX) this.x = minX;
    if (this.x > maxX) this.x = maxX;
    if (this.y < minY) this.y = minY;
    if (this.y > maxY) this.y = maxY;

    if (this.y < minY) this.y = minY;
    if (this.y > maxY) this.y = maxY;

    if (this.attackCooldown > 0) {
      this.attackCooldown -= dt;
    }
  }

  render(ctx) {
    ctx.save();

    // === Avatar is the emoji itself ===
    // Color is rendered as an aura: thin ring with soft falloff/glow.
    // Requirement: aura ring must start directly from the emoji (no gap).
    const col = this.color || "#8fe3ff";
    const r = this.radius || 18;

    // Emoji avatar in the center (draw first, aura will be drawn BEHIND it).
    const idx = (this.avatarIndex | 0);
    const emo = AVATARS[idx] || AVATARS[0] || "😀";

    // Use larger font so emoji visually fills the player circle.
    // Then compute aura radius from measured emoji width to avoid "offset" gaps.
    const fontSize = Math.max(12, Math.round(r * 1.95));
    ctx.font = `${fontSize}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const mw = emo ? ctx.measureText(emo).width : fontSize;
    const emojiR = Math.max(mw, fontSize) * 0.5;
    const auraR = emojiR; // ring comes straight from emoji, no extra radius

    // Aura is drawn FIRST so it stays behind the emoji/avatar.
    const nowSec = (typeof performance !== "undefined" && performance.now) ? (performance.now() / 1000) : 0;
    const dead = (this.hp != null) ? (this.hp <= 0) : false;
    drawAura(ctx, this.x, this.y, auraR, nowSec, (this.id || this.nickname || "p"), (this.auraId || 0), dead, false);

	    if (emo) {
	      // No extra shadows/glow — keep the avatar crisp.
	      ctx.fillStyle = "rgba(255,255,255,1)";
	      ctx.fillText(emo, this.x, this.y);
	    }

    // Aim indicator (outside the aura, so it doesn't cut through the emoji)
    const len = Math.hypot(this.lastAimDir.x, this.lastAimDir.y) || 1;
    const nx = this.lastAimDir.x / len;
    const ny = this.lastAimDir.y / len;
    const ax0 = this.x + nx * (auraR + 1);
    const ay0 = this.y + ny * (auraR + 1);
    const ax1 = this.x + nx * (auraR + 14);
    const ay1 = this.y + ny * (auraR + 14);
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    ctx.moveTo(ax0, ay0);
    ctx.lineTo(ax1, ay1);
    ctx.stroke();

    ctx.restore();
  }
}