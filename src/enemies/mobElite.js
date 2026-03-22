import { getZoneScaling } from "../world/zoneController.js";
import { updateSimpleRoomChase, renderSimpleMob, dropSimpleMobRewards } from "./simpleMobCore.js";

export function createEliteMob(zone, pos) {
  const s = getZoneScaling(zone);
  const scale = 2.5;
  const baseHP = 40;
  const baseDmg = 8;
  const baseSpeed = 110;
  const baseXP = 15;

  const enemy = {
    type: "elite",
    kind: "elite",
    zone,
    x: pos.x,
    y: pos.y,
    radius: 26,
    hp: baseHP * s.hp * scale,
    maxHp: baseHP * s.hp * scale,
    damage: baseDmg * s.damage * scale,
    speed: baseSpeed * s.speed * 1.1,
    xpValue: baseXP * s.xp * scale,
    scoreValue: 20 * zone,
    isBoss: false,
    isGateEnemy: false,
    isElite: true,
    _movementModel: "roomBoundsChase",
    _leashRadius: 480,
  };

  enemy.update = (self, dt, state) => {
    updateSimpleRoomChase(self, dt, state, {
      aggroRange: self.aggroRange || 540,
      leashRadius: self._leashRadius || 480,
      contactShieldMult: 0.25,
    });
  };

  enemy.render = (self, ctx) => {
    renderSimpleMob(self, ctx, { fallbackFill: "#ffa43c", isElite: true });
  };

  enemy.onDeath = (self, state) => {
    dropSimpleMobRewards(self, state, { coinChance: 0.58, coinMin: 2, coinMax: 4, radius: 10, essenceChance: 0.48, materialChance: 0.34, partChance: 0.16 });
  };

  return enemy;
}
