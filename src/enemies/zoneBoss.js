import { getZoneScaling, WORLD_SCALE } from "../world/zoneController.js";
import { createBasicMob } from "./mobBasic.js";
import { createEliteMob } from "./mobElite.js";
import { pickMobTarget, applyDamageToTarget } from "./utils.js";

export function createZoneBossGateEncounter(state, gateZone) {
  const { enemies, player } = state;

  const zoneForScaling = gateZone + 1;
  const s = getZoneScaling(zoneForScaling);
  // Keep legacy gate spacing proportional when the world is scaled.
  const gateY = gateZone * 10000 * WORLD_SCALE;

  const baseHP = 200;
  const baseDmg = 20;
  const baseSpeed = 70;
  const baseXP = 200;

  const boss = {
    type: "zoneBoss",
    zone: zoneForScaling,
    x: player.x,
    y: gateY - 400,
    radius: 40,
    hp: baseHP * s.hp * 10,
    maxHp: baseHP * s.hp * 10,
    damage: baseDmg * s.damage,
    speed: baseSpeed * s.speed,
    xpValue: baseXP * s.xp,
    scoreValue: 100 * zoneForScaling,
    isBoss: true,
    isGateEnemy: true,
    zoneGate: gateZone,
  };

  boss.update = (self, dt, state) => {
    const player = pickMobTarget(self, state, { aggroRange: 1200 });
    if (!player) return;
    const dx = player.x - self.x;
    const dy = player.y - self.y;
    const dist = Math.hypot(dx, dy) || 1;

    const debuffed = (typeof self._barrierDebuffUntil === "number") && (state.time < self._barrierDebuffUntil);
    const slowMult = debuffed ? (self._barrierSlowMult || 1) : 1;
    const dmgOutMult = debuffed ? (self._barrierDmgMult || 1) : 1;
    const speed = self.speed * slowMult;


    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;

    self.x += vx * dt;
    self.y += vy * dt;

    const r = (player.radius || 18) + self.radius;
    if (dx * dx + dy * dy <= r * r) {
      if (!player._ghostActive && !player._lvlUpInvuln && !player._lvlUpChoosing) {
        const mult = player._shieldActive ? 0.35 : 1.0;
        const inMult = (typeof player._dmgInMult === "number") ? player._dmgInMult : 1.0;
        applyDamageToTarget(player, self.damage * dmgOutMult * dt * mult * inMult, state, self);
      }
    }
  };

  boss.render = (self, ctx) => {
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = "#9b5bff";
    ctx.arc(self.x, self.y, self.radius, 0, Math.PI * 2);
    ctx.fill();

    const ratio = self.hp / self.maxHp;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      self.x,
      self.y,
      self.radius + 6,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * ratio
    );
    ctx.stroke();

    ctx.restore();
  };

  boss.onDeath = (self, state) => {
    // Drop either XP orb or Coin orb (meta-currency) to reduce upgrade spam.
    const roll = Math.random();
    if (roll < 0.85) {
      const amt = 10 + ((Math.random()*11)|0);
      state.xpOrbs.push({
        x: self.x,
        y: self.y,
        radius: 16,
        kind: "coin",
        coins: amt,
        age: 0,
      });
    } else {
      state.xpOrbs.push({
        x: self.x,
        y: self.y,
        radius: 16,
        kind: "xp",
        xp: self.xpValue,
        age: 0,
      });
    }
    // Disabled: bosses no longer grant temporary buffs
state.floatingTexts.push({
      x: self.x,
      y: self.y - 24,
      text: "BOSS DOWN!",
      time: 1.2,
    });
    state.popups.push({
      text: "Zone Boss defeated!",
      time: 2.5,
    });
  };

  enemies.push(boss);

  const eliteCount = 10 + gateZone * 3;
  const basicCount = 20 + gateZone * 5;

  for (let i = 0; i < eliteCount; i++) {
    const offsetX = (i - eliteCount / 2) * 80;
    const m = createEliteMob(zoneForScaling, {
      x: player.x + offsetX,
      y: gateY - 600,
    });
    m.isGateEnemy = true;
    m.zoneGate = gateZone;
    enemies.push(m);
  }

  for (let i = 0; i < basicCount; i++) {
    const offsetX = (i - basicCount / 2) * 60;
    const m = createBasicMob(zoneForScaling, {
      x: player.x + offsetX,
      y: gateY - 800,
    });
    m.isGateEnemy = true;
    m.zoneGate = gateZone;
    enemies.push(m);
  }
}
