import { getZoneScaling } from "../world/zoneController.js";
import { createBasicMob } from "./mobBasic.js";
import { pickMobTarget, applyDamageToTarget } from "./utils.js";

export function createZone6SuperBoss(zone, pos) {
  const s = getZoneScaling(zone);

  const baseHP = 220;
  const baseDmg = 18;
  const baseSpeed = 70;
  const baseXP = 250;

  const enemy = {
    type: "zone6SuperBoss",
    isBoss: true,
    isZone6SuperBoss: true,
    zone,
    x: pos.x,
    y: pos.y,
    radius: 60,
    hp: baseHP * s.hp * 12,
    maxHp: baseHP * s.hp * 12,
    damage: baseDmg * s.damage,
    speed: baseSpeed * s.speed * 0.6, // noticeably slower than other bosses
    regenPerSec: 8 * s.hp, // small but meaningful self-heal
    xpValue: baseXP * s.xp * 6,
    scoreValue: 2000,
    spawnTimer: 0,
  };

  enemy.update = (self, dt, state) => {
    const { enemies } = state;
    const player = pickMobTarget(self, state, { aggroRange: 1800 });
    if (!player) return;

    // Maintain distance: prefers to kite the player at medium range
    const dx = player.x - self.x;
    const dy = player.y - self.y;
    const dist = Math.hypot(dx, dy) || 1;

    const debuffed = (typeof self._barrierDebuffUntil === "number") && (state.time < self._barrierDebuffUntil);
    const slowMult = debuffed ? (self._barrierSlowMult || 1) : 1;
    const dmgOutMult = debuffed ? (self._barrierDmgMult || 1) : 1;
    const speed = self.speed * slowMult;


    const desiredMin = 600;
    const desiredMax = 900;

    let vx = 0;
    let vy = 0;

    if (dist < desiredMin) {
      // Too close → move away from player
      vx = -(dx / dist) * speed;
      vy = -(dy / dist) * speed;
    } else if (dist > desiredMax) {
      // Too far → slowly move closer
      vx = (dx / dist) * (speed * 0.5);
      vy = (dy / dist) * (speed * 0.5);
    }

    self.x += vx * dt;
    self.y += vy * dt;

    // Light self-heal over time
    if (self.regenPerSec > 0 && self.hp > 0) {
      self.hp = Math.min(self.maxHp, self.hp + self.regenPerSec * dt);
    }

    // Summon basic mobs periodically
    self.spawnTimer += dt;
    const spawnInterval = 4.5;
    if (self.spawnTimer >= spawnInterval) {
      self.spawnTimer = 0;

      const count = 3 + Math.floor(Math.random() * 2); // 3–4 basic mobs
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distMinion = self.radius + 80 + Math.random() * 80;
        const mx = self.x + Math.cos(angle) * distMinion;
        const my = self.y + Math.sin(angle) * distMinion;
        const m = createBasicMob(zone, { x: mx, y: my });
        m.isFromSuperBoss = true;
        enemies.push(m);
      }
    }

    // Contact damage if player gets inside the boss radius
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
    ctx.fillStyle = "#1be7ff"; // cyan core
    ctx.arc(self.x, self.y, self.radius, 0, Math.PI * 2);
    ctx.fill();

    // Outer ring to highlight "super boss" status
    ctx.beginPath();
    ctx.strokeStyle = "#ffed00";
    ctx.lineWidth = 4;
    ctx.arc(self.x, self.y, self.radius + 6, 0, Math.PI * 2);
    ctx.stroke();

    // HP ring
    const ratio = self.hp / self.maxHp;
    ctx.beginPath();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.arc(
      self.x,
      self.y,
      self.radius + 12,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * ratio
    );
    ctx.stroke();

    ctx.restore();
  };

  enemy.onDeath = (self, state) => {
    // Drop either XP orb or Coin orb (meta-currency) to reduce upgrade spam.
    const roll = Math.random();
    if (roll < 0.9) {
      const amt = 14 + ((Math.random()*15)|0);
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
