import { getZoneScaling } from "../world/zoneController.js";
import { pickMobTarget, applyDamageToTarget } from "./utils.js";

export function createRoamingBoss(zone, pos) {
  const s = getZoneScaling(zone);
  const scale = 30;

  const baseHP = 80;
  const baseDmg = 10;
  const baseSpeed = 70;
  const baseXP = 50;

  const enemy = {
    type: "roamingBoss",
    isRoamingBoss: true,
    zone,
    x: pos.x,
    y: pos.y,
    radius: 45,
    hp: baseHP * s.hp * scale,
    maxHp: baseHP * s.hp * scale,
    damage: baseDmg * s.damage * 2,
    speed: baseSpeed * s.speed * 1.1,
    xpValue: baseXP * s.xp * 5,
    scoreValue: 300 * zone,
    isBoss: true,
    isGateEnemy: false,
  };

  enemy.update = (self, dt, state) => {
    const player = pickMobTarget(self, state, { aggroRange: 1600 });
    if (!player) return;

    const dx = player.x - self.x;
    const dy = player.y - self.y;
    const dist = Math.hypot(dx, dy) || 1;

    const debuffed = (typeof self._barrierDebuffUntil === "number") && (state.time < self._barrierDebuffUntil);
    const slowMult = debuffed ? (self._barrierSlowMult || 1) : 1;
    const dmgOutMult = debuffed ? (self._barrierDmgMult || 1) : 1;
    const speed = self.speed * slowMult;


    const angleToPlayer = Math.atan2(dy, dx);
    const wanderOffset = Math.sin(state.time * 0.6) * 0.8;
    const angle = angleToPlayer + wanderOffset;

    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    self.x += vx * dt;
    self.y += vy * dt;

    const r = (player.radius || 18) + self.radius;
    if (dx * dx + dy * dy <= r * r) {
      if (!player._ghostActive && !player._lvlUpInvuln && !player._lvlUpChoosing) {
        const mult = player._shieldActive ? 0.4 : 1.0;
        const inMult = (typeof player._dmgInMult === "number") ? player._dmgInMult : 1.0;
        applyDamageToTarget(player, self.damage * dmgOutMult * dt * mult * inMult, state, self);
      }
    }
  };

  enemy.render = (self, ctx) => {
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = "#ff3cbe";
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

  enemy.onDeath = (self, state) => {
    // Drop either XP orb or Coin orb (meta-currency) to reduce upgrade spam.
    const roll = Math.random();
    if (roll < 0.85) {
      const amt = 8 + ((Math.random()*9)|0);
      state.xpOrbs.push({
        x: self.x,
        y: self.y,
        radius: 8,
        kind: "coin",
        coins: amt,
        age: 0,
      });
    } else {
      state.xpOrbs.push({
        x: self.x,
        y: self.y,
        radius: 8,
        kind: "xp",
        xp: self.xpValue,
        age: 0,
      });
    }
  };

  return enemy;
}
