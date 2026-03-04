import { getZoneScaling } from "../world/zoneController.js";
import { pickMobTarget, applyDamageToTarget } from "./utils.js";

export function createBasicMob(zone, pos) {
  const s = getZoneScaling(zone);

  const baseHP = 30;
  const baseDmg = 6;
  const baseSpeed = 90;
  const baseXP = 10;

  const enemy = {
    type: "basic",
    zone,
    x: pos.x,
    y: pos.y,
    radius: 20,
    hp: baseHP * s.hp,
    maxHp: baseHP * s.hp,
    damage: baseDmg * s.damage,
    speed: baseSpeed * s.speed,
    xpValue: baseXP * s.xp,
    scoreValue: 10 * zone,
    isBoss: false,
    isGateEnemy: false,
    isElite: false,
  };

  enemy.update = (self, dt, state) => {
    const player = pickMobTarget(self, state, { aggroRange: self.aggroRange || 450 });
    if (!player) return;
    const dx = player.x - self.x;
    const dy = player.y - self.y;
    const dist = Math.hypot(dx, dy) || 1;

    const debuffed = (typeof self._barrierDebuffUntil === "number") && (state.time < self._barrierDebuffUntil);
    const slowMult = debuffed ? (self._barrierSlowMult || 1) : 1;
    const dmgOutMult = debuffed ? (self._barrierDmgMult || 1) : 1;
    const speed = self.speed * slowMult;


    // World 2.0 AI: optional group behaviors (herd/patrol/camp)
    let moveVx = (dx / dist) * speed;
    let moveVy = (dy / dist) * speed;

    const ai = self.aiMode;
    if (ai && !self.aggroed) {
      const ar = self.aggroRange || 450;
      const d2 = dx * dx + dy * dy;

      const wasHitRecently =
        typeof self._lastHitAt === "number" && state.time - self._lastHitAt <= 3.0;

      const campTriggered =
        ai === "camp" &&
        self.campCenter &&
        typeof self.campRadius === "number" &&
        d2 <= self.campRadius * self.campRadius;

      if (d2 <= ar * ar || wasHitRecently || campTriggered) {
        self.aggroed = true;
      } else {
        // Idle behavior (stay around center / patrol route)
        if (ai === "patrol" && self.patrolCenter) {
          self._patrolAngle = (self._patrolAngle || 0) + dt * 0.9;
          const pr = self.patrolRadius || 360;
          const tx = self.patrolCenter.x + Math.cos(self._patrolAngle) * pr;
          const ty = self.patrolCenter.y + Math.sin(self._patrolAngle) * pr;

          const tdx = tx - self.x;
          const tdy = ty - self.y;
          const td = Math.hypot(tdx, tdy) || 1;
          moveVx = (tdx / td) * speed * 0.45;
          moveVy = (tdy / td) * speed * 0.45;
        } else {
          const center = ai === "camp" ? self.campCenter : self.herdCenter;
          if (center) {
            self._idleAngle = (self._idleAngle || 0) + dt * 0.6;
            const rad = ai === "camp" ? (self.campRadius || 650) : (self.herdRadius || 420);
            const tx = center.x + Math.cos(self._idleAngle) * rad * 0.4;
            const ty = center.y + Math.sin(self._idleAngle) * rad * 0.4;

            const tdx = tx - self.x;
            const tdy = ty - self.y;
            const td = Math.hypot(tdx, tdy) || 1;
            moveVx = (tdx / td) * speed * 0.35;
            moveVy = (tdy / td) * speed * 0.35;
          } else {
            // No center — stand still
            moveVx = 0;
            moveVy = 0;
          }
        }
      }
    }

    self.x += moveVx * dt;
    self.y += moveVy * dt;

    const r = (player.radius || 18) + self.radius;
    if (dx * dx + dy * dy <= r * r) {
      if (!player._ghostActive && !player._lvlUpInvuln && !player._lvlUpChoosing) {
        const mult = player._shieldActive ? 0.2 : 1.0;
        const inMult = (typeof player._dmgInMult === "number") ? player._dmgInMult : 1.0;
        applyDamageToTarget(player, self.damage * dmgOutMult * dt * mult * inMult, state, self);
      }
    }
  };

  enemy.render = (self, ctx) => {
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = "#ff5f6f";
    ctx.arc(self.x, self.y, self.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  enemy.onDeath = (self, state) => {
    // Drop either XP orb or Coin orb (meta-currency) to reduce upgrade spam.
    const roll = Math.random();
    if (roll < 0.22) {
      const amt = 1;
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
