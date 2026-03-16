import { getZoneScaling } from "../world/zoneController.js";
import { pickMobTarget, applyDamageToTarget } from "./utils.js";

export function createResurrectionGuardian(zone, pos) {
  // Scale by actual spawn zone (RT1 -> Zone2, etc.)
  const s = getZoneScaling(zone);

  const baseHP = 400;
  const baseDmg = 35;
  const baseSpeed = 80;
  const baseXP = 200;

  const enemy = {
    type: "resurrectionGuardian",
    isResGuardian: true,
    // compatibility flag (some systems check this name)
    isResurrectionGuardian: true,
    zone,
    x: pos.x,
    y: pos.y,
    radius: 40,
    hp: baseHP * s.hp,
    maxHp: baseHP * s.hp,
    damage: baseDmg * s.damage,
    speed: baseSpeed * s.speed,
    xpValue: baseXP * s.xp,
    scoreValue: 200,
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


    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;

    self.x += vx * dt;
    self.y += vy * dt;
  };

  // Optional hook (not all collision paths use it), keep safe signature.
  enemy.onHitPlayer = (self, player, state) => {
    if (!player._lvlUpInvuln && !player._lvlUpChoosing) {
      const dmgOutMult = (typeof self._barrierDebuffUntil === "number" && state && state.time < self._barrierDebuffUntil) ? (self._barrierDmgMult || 1) : 1;
      applyDamageToTarget(player, self.damage * dmgOutMult, state, self);
    }
    // Targeting memory handled by applyDamageToTarget
  };

  enemy.onDeath = (self, state) => {
    if (state.flags) {
      state.flags.resGuardianKilledThisRun = true;
    }
    if (state.progression) {
      state.progression.resGuardianKills =
        (state.progression.resGuardianKills || 0) + 1;
    }

    if (state.popups) {
      state.popups.push({
        text: "Guardian of Resurrection defeated!",
        time: 3.0,
      });
    }

    if (state.floatingTexts) {
      state.floatingTexts.push({
        x: self.x,
        y: self.y - 24,
        text: "RESURECTION READY",
        time: 1.8,
      });
    }
  };

  enemy.render = (self, ctx) => {
    ctx.save();

    ctx.fillStyle = "#ffdd44";
    ctx.beginPath();
    ctx.arc(self.x, self.y, self.radius, 0, Math.PI * 2);
    ctx.fill();

    const ratio = self.hp / self.maxHp;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
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

  return enemy;
}
