import { createBasicMob } from "./mobBasic.js";
import { createEliteMob } from "./mobElite.js";
import { renderBiomeUnit, biomeStyleForKey } from "./biomeVisuals.js";

function clamp(n, a, b) {
  return n < a ? a : (n > b ? b : n);
}

const BIOME_FAMILIES = {
  electric: { basic: "spark", elite: "storm" },
  fire: { basic: "brute", elite: "crusher" },
  ice: { basic: "guard", elite: "warden" },
  dark: { basic: "stalker", elite: "reaper" },
  light: { basic: "weaver", elite: "oracle" },
};

function applyBiomeRender(enemy, biomeKey, role, isBasic = false, isElite = false) {
  enemy._biomeKey = biomeKey;
  enemy._biomeRole = role;
  enemy.render = (self, ctx) => {
    renderBiomeUnit(ctx, self, biomeKey, { role, isBasic, isElite });
  };
}

function addBasicBiomeBehavior(m, biomeKey) {
  const baseUpdate = m.update;
  m.update = (self, dt, state) => {
    self._vfxT = (self._vfxT || 0) + dt;
    const target = (state && state.players && state.players.length) ? state.players.find(p => p && p.hp > 0) : state?.player;
    if (target) self._renderAngle = Math.atan2((target.y || 0) - self.y, (target.x || 0) - self.x);
    baseUpdate(self, dt, state);

    if (biomeKey === "dark" && (self._gateEnter?.entered || !self._gateEnter)) {
      self._shadowDashCd = (self._shadowDashCd ?? (2.6 + Math.random() * 1.2)) - dt;
      if (self._shadowDashCd <= 0) {
        self._shadowDashCd = 2.2 + Math.random() * 1.6;
        const ps = (state && state.players && state.players.length) ? state.players : (state?.player ? [state.player] : []);
        let best = null;
        let bd2 = 1e18;
        for (const p of ps) {
          if (!p || p.hp <= 0) continue;
          const dx = p.x - self.x;
          const dy = p.y - self.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bd2) { bd2 = d2; best = p; }
        }
        if (best) {
          const dx = best.x - self.x;
          const dy = best.y - self.y;
          const d = Math.hypot(dx, dy) || 1;
          const step = clamp((self.speed || 80) * 0.35, 35, 85);
          self.x += (dx / d) * step;
          self.y += (dy / d) * step;
        }
      }
    }

    if (biomeKey === "electric") {
      self._sparkArcCd = (self._sparkArcCd || (0.55 + Math.random() * 0.4)) - dt;
      if (self._sparkArcCd <= 0) {
        self._sparkArcCd = 0.55 + Math.random() * 0.45;
        self._vfxT += 0.18;
      }
    }

    if (biomeKey === "fire") {
      const lowHp = (self.hp || 0) <= (self.maxHp || 1) * 0.45;
      self._enrage = lowHp ? 1 : 0;
      if (lowHp) self.speed = Math.max(self.speed, 84);
    }

    if (biomeKey === "ice") {
      self._frostShell = 0.5 + 0.5 * Math.sin(self._vfxT * 1.7);
    }

    if (biomeKey === "light") {
      self._healPulseCd = (self._healPulseCd ?? (1.2 + Math.random() * 0.8)) - dt;
      if (self._healPulseCd <= 0) {
        self._healPulseCd = 1.0 + Math.random() * 1.0;
        const es = state?.enemies || [];
        const R = 110;
        const R2 = R * R;
        for (const e of es) {
          if (!e || e === self || (e.hp || 0) <= 0) continue;
          if ((e._roomIndex | 0) !== (self._roomIndex | 0)) continue;
          const dx = e.x - self.x;
          const dy = e.y - self.y;
          if (dx * dx + dy * dy > R2) continue;
          const maxHp = e.maxHp || e.maxHP || e.hp || 30;
          const heal = Math.max(1, maxHp * 0.015);
          e.hp = Math.min(maxHp, (e.hp || 0) + heal);
        }
      }
    }
  };
}

function addEliteBiomeBehavior(m, biomeKey) {
  const baseUpdate = m.update;
  m.update = (self, dt, state) => {
    self._vfxT = (self._vfxT || 0) + dt;
    const target = (state && state.players && state.players.length) ? state.players.find(p => p && p.hp > 0) : state?.player;
    if (target) self._renderAngle = Math.atan2((target.y || 0) - self.y, (target.x || 0) - self.x);
    baseUpdate(self, dt, state);

    if (biomeKey === "electric") {
      self._stormPulseCd = (self._stormPulseCd ?? 1.45) - dt;
      if (self._stormPulseCd <= 0) {
        self._stormPulseCd = 1.35 + Math.random() * 0.55;
        self._vfxT += 0.35;
      }
    } else if (biomeKey === "fire") {
      const hpRatio = (self.hp || 0) / Math.max(1, self.maxHp || 1);
      if (hpRatio <= 0.60) self.speed = Math.max(self.speed, self._baseBiomeSpeed * 1.10);
      if (hpRatio <= 0.35) self.damage = Math.max(self.damage, self._baseBiomeDamage * 1.16);
    } else if (biomeKey === "ice") {
      self._wardenShell = 0.55 + 0.45 * Math.sin(self._vfxT * 1.2);
    } else if (biomeKey === "dark") {
      self._reaperJumpCd = (self._reaperJumpCd ?? (2.1 + Math.random() * 0.7)) - dt;
      if (self._reaperJumpCd <= 0) {
        self._reaperJumpCd = 1.9 + Math.random() * 0.8;
        const ps = (state && state.players && state.players.length) ? state.players : (state?.player ? [state.player] : []);
        let best = null;
        let bd2 = 1e18;
        for (const p of ps) {
          if (!p || p.hp <= 0) continue;
          const dx = p.x - self.x;
          const dy = p.y - self.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bd2) { bd2 = d2; best = p; }
        }
        if (best) {
          const dx = best.x - self.x;
          const dy = best.y - self.y;
          const d = Math.hypot(dx, dy) || 1;
          const step = clamp((self.speed || 110) * 0.55, 62, 120);
          self.x += (dx / d) * step;
          self.y += (dy / d) * step;
        }
      }
    } else if (biomeKey === "light") {
      self._oraclePulseCd = (self._oraclePulseCd ?? (1.7 + Math.random() * 0.6)) - dt;
      if (self._oraclePulseCd <= 0) {
        self._oraclePulseCd = 1.55 + Math.random() * 0.65;
        const es = state?.enemies || [];
        const R = 135;
        const R2 = R * R;
        for (const e of es) {
          if (!e || e === self || (e.hp || 0) <= 0) continue;
          if ((e._roomIndex | 0) !== (self._roomIndex | 0)) continue;
          const dx = e.x - self.x;
          const dy = e.y - self.y;
          if (dx * dx + dy * dy > R2) continue;
          const maxHp = e.maxHp || e.maxHP || e.hp || 40;
          e.hp = Math.min(maxHp, (e.hp || 0) + Math.max(2, maxHp * 0.025));
        }
      }
    }
  };
}

function makeBiomeMob(biomeKey, zone, pos) {
  const m = createBasicMob(zone, pos);
  const family = BIOME_FAMILIES[biomeKey] || { basic: "mob", elite: "elite" };
  m.kind = `${biomeKey}${family.basic[0].toUpperCase() + family.basic.slice(1)}`;

  if (biomeKey === "fire") {
    m.gateDmgMult = 1.25;
    m.speed *= 1.05;
  } else if (biomeKey === "ice") {
    m.hp *= 1.35; m.maxHp *= 1.35;
    m.speed *= 0.82; m.radius *= 1.08;
  } else if (biomeKey === "electric") {
    m.speed *= 1.12; m.damage *= 0.92; m.gateApproachMult = 1.05; m.radius *= 0.94;
  } else if (biomeKey === "dark") {
    m.gateDmgMult = 1.15;
  } else if (biomeKey === "light") {
    m.hp *= 0.92; m.maxHp *= 0.92;
  }

  applyBiomeRender(m, biomeKey, family.basic, false, false);
  addBasicBiomeBehavior(m, biomeKey);
  return m;
}

function makeBiomeElite(biomeKey, zone, pos) {
  const m = createEliteMob(zone, pos);
  const family = BIOME_FAMILIES[biomeKey] || { basic: "mob", elite: "elite" };
  m.kind = `${biomeKey}${family.elite[0].toUpperCase() + family.elite.slice(1)}Elite`;
  m._baseBiomeSpeed = m.speed;
  m._baseBiomeDamage = m.damage;

  if (biomeKey === "electric") {
    m.speed *= 1.16;
    m.damage *= 0.92;
    m.radius *= 0.95;
  } else if (biomeKey === "fire") {
    m.hp *= 1.18; m.maxHp *= 1.18;
    m.damage *= 1.10; m.gateDmgMult = 1.35;
    m.radius *= 1.05;
  } else if (biomeKey === "ice") {
    m.hp *= 1.22; m.maxHp *= 1.22;
    m.speed *= 0.88; m.radius *= 1.10;
  } else if (biomeKey === "dark") {
    m.speed *= 1.07;
    m.damage *= 1.04;
  } else if (biomeKey === "light") {
    m.hp *= 1.06; m.maxHp *= 1.06;
    m.speed *= 0.96;
  }

  m._baseBiomeSpeed = m.speed;
  m._baseBiomeDamage = m.damage;
  applyBiomeRender(m, biomeKey, family.elite, false, true);
  addEliteBiomeBehavior(m, biomeKey);
  return m;
}

export function createBiomeMob(biomeKey, zone, pos) {
  const key = String(biomeKey || "").toLowerCase();
  if (!key || !BIOME_FAMILIES[key]) return createBasicMob(zone, pos);
  return makeBiomeMob(key, zone, pos);
}

export function createBiomeEliteMob(biomeKey, zone, pos) {
  const key = String(biomeKey || "").toLowerCase();
  if (!key || !BIOME_FAMILIES[key]) return createEliteMob(zone, pos);
  return makeBiomeElite(key, zone, pos);
}

export function biomeRoleForKey(biomeKey, isElite = false) {
  const style = biomeStyleForKey(biomeKey);
  return isElite ? (style.eliteRole || style.role) : style.role;
}
