import { getZoneScaling } from "../world/zoneController.js";
import { updateSimpleRoomChase, renderSimpleMob, dropSimpleMobRewards } from "./simpleMobCore.js";

export function createBasicMob(zone, pos) {
  const s = getZoneScaling(zone);
  const baseHP = 30;
  const baseDmg = 6;
  const baseSpeed = 90;
  const baseXP = 10;

  const enemy = {
    type: "basic",
    kind: "basic",
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
    _movementModel: "roomBoundsChase",
    _leashRadius: 440,
  };

  enemy.update = (self, dt, state) => {
    updateSimpleRoomChase(self, dt, state, {
      aggroRange: self.aggroRange || 520,
      leashRadius: self._leashRadius || 440,
      contactShieldMult: 0.2,
    });
  };

  enemy.render = (self, ctx) => {
    renderSimpleMob(self, ctx, { fallbackFill: "#ff5f6f", isBasic: true });
  };

  enemy.onDeath = (self, state) => {
    dropSimpleMobRewards(self, state, { coinChance: 0.24, coinMin: 1, coinMax: 1, radius: 8, essenceChance: 0.26, materialChance: 0.18, partChance: 0.07 });
  };

  return enemy;
}
