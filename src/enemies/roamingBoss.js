import { getZoneScaling } from "../world/zoneController.js";
import { pickMobTarget, applyDamageToTarget } from "./utils.js";
import { biomeByKey } from "../world/biomes.js";

function clamp(n, a, b) {
  return n < a ? a : (n > b ? b : n);
}

function hsla(h, s, l, a) {
  return `hsla(${h},${s}%,${l}%,${a})`;
}

function bossStyleForBiome(biomeKey) {
  const biome = biomeByKey(biomeKey);
  if (!biome) {
    return {
      hue: 322,
      fill: "#ff3cbe",
      glow: "rgba(255,70,195,0.34)",
      ring: "rgba(255,255,255,0.95)",
      label: "Floor Boss",
    };
  }
  const map = {
    electric: {
      fill: "rgba(80,245,255,0.96)",
      glow: "rgba(70,240,255,0.38)",
      ring: "rgba(185,255,255,0.98)",
      label: "Storm Core",
    },
    fire: {
      fill: "rgba(255,120,70,0.96)",
      glow: "rgba(255,130,60,0.40)",
      ring: "rgba(255,225,190,0.98)",
      label: "Inferno Core",
    },
    ice: {
      fill: "rgba(135,185,255,0.97)",
      glow: "rgba(150,210,255,0.36)",
      ring: "rgba(255,255,255,0.98)",
      label: "Frost Core",
    },
    dark: {
      fill: "rgba(175,120,255,0.96)",
      glow: "rgba(185,110,255,0.34)",
      ring: "rgba(240,225,255,0.98)",
      label: "Void Core",
    },
    light: {
      fill: "rgba(255,235,120,0.97)",
      glow: "rgba(255,240,140,0.36)",
      ring: "rgba(255,255,235,0.98)",
      label: "Prism Core",
    },
  };
  return {
    hue: biome.hue,
    ...(map[biome.key] || map.electric),
    label: map[biome.key]?.label || `${biome.name} Core`,
  };
}

function applyBiomeBossBehavior(enemy, biomeKey) {
  const key = String(biomeKey || "").toLowerCase();
  if (!key) return;

  enemy._biomeKey = key;
  if (key === "electric") {
    enemy.speed *= 1.02;
    enemy._burstCd = 2.2;
    enemy._arenaCastCd = 3.6;
  } else if (key === "fire") {
    enemy.damage *= 1.04;
    enemy._arenaCastCd = 4.2;
  } else if (key === "ice") {
    enemy.hp *= 1.06;
    enemy.maxHp *= 1.06;
    enemy.speed *= 0.95;
    enemy._slowAura = 144;
    enemy._arenaCastCd = 4.4;
  } else if (key === "dark") {
    enemy._phaseCd = 4.4;
    enemy._phaseUntil = 0;
    enemy._arenaCastCd = 4.8;
  } else if (key === "light") {
    enemy._healPulseCd = 3.2;
    enemy.hp *= 1.03;
    enemy.maxHp *= 1.03;
    enemy._arenaCastCd = 4.6;
  }
}

function readArenaList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function copyPoint(p) {
  return p ? { x: Number(p.x) || 0, y: Number(p.y) || 0, r: Number(p.r) || 0 } : null;
}

function chooseArenaTarget(self, pool) {
  if (!pool || !pool.length) return null;
  const idx = ((self._arenaNodeIndex || 0) % pool.length + pool.length) % pool.length;
  const p = pool[idx];
  return p ? { x: Number(p.x) || self.x, y: Number(p.y) || self.y, r: Number(p.r) || 0 } : null;
}

function activateArenaCast(self, state, preferredPool, fallbackPool) {
  const pool = (preferredPool && preferredPool.length) ? preferredPool : fallbackPool;
  if (!pool || !pool.length) return;
  const pick = chooseArenaTarget(self, pool);
  if (!pick) return;
  const now = Number(state?.time) || 0;
  const biome = String(self._biomeKey || "");
  const floorIndex = Math.max(1, self._floorIndex | 0);
  const earlyScale = floorIndex <= 3 ? 0.78 : floorIndex <= 6 ? 0.88 : 1.0;
  const baseR = Math.max(58, (Number(pick.r) || self.radius * 2.0) * earlyScale);
  self._activeArenaCast = {
    biome,
    x: pick.x,
    y: pick.y,
    r: baseR,
    warnUntil: now + (biome === 'dark' ? 0.65 : floorIndex <= 4 ? 0.9 : 0.75),
    activeUntil: now + (biome === 'fire' ? 1.9 : biome === 'ice' ? 2.2 : biome === 'light' ? 1.85 : 1.75) * (floorIndex <= 4 ? 0.92 : 1.0),
  };
}

function applyArenaCastEffects(self, state, dt) {
  const cast = self._activeArenaCast;
  if (!cast) return;
  const now = Number(state?.time) || 0;
  if (now >= cast.activeUntil) {
    self._activeArenaCast = null;
    return;
  }
  if (now < cast.warnUntil) return;

  const players = Array.isArray(state?.players) && state.players.length ? state.players : (state?.player ? [state.player] : []);
  const mobs = Array.isArray(state?.enemies) ? state.enemies : [];
  const r2 = cast.r * cast.r;
  const biome = String(cast.biome || self._biomeKey || '');

  for (const p of players) {
    if (!p || p.dead || (p.hp || 0) <= 0) continue;
    const dx = (Number(p.x) || 0) - cast.x;
    const dy = (Number(p.y) || 0) - cast.y;
    if (dx * dx + dy * dy > r2) continue;
    if (biome === 'electric') {
      const dmg = self.damage * 0.14 * dt;
      applyDamageToTarget(p, dmg, state, self);
      p._frostSlow = Math.max(p._frostSlow || 0, 0.06);
    } else if (biome === 'fire') {
      const dmg = self.damage * 0.22 * dt;
      applyDamageToTarget(p, dmg, state, self);
    } else if (biome === 'ice') {
      p._frostSlow = Math.max(p._frostSlow || 0, 0.18);
      const dmg = self.damage * 0.09 * dt;
      applyDamageToTarget(p, dmg, state, self);
    } else if (biome === 'dark') {
      const dmg = self.damage * 0.18 * dt;
      applyDamageToTarget(p, dmg, state, self);
      p._dmgInMult = Math.max(typeof p._dmgInMult === 'number' ? p._dmgInMult : 1, 1.08);
      p._dmgInMultUntil = Math.max(p._dmgInMultUntil || 0, now + 0.25);
    } else if (biome === 'light') {
      const dmg = self.damage * 0.08 * dt;
      applyDamageToTarget(p, dmg, state, self);
    }
  }

  if (biome === 'light') {
    for (const e of mobs) {
      if (!e || e === self || e.dead || (e.hp || 0) <= 0) continue;
      if ((e._roomIndex | 0) !== (self._roomIndex | 0)) continue;
      const dx = (Number(e.x) || 0) - cast.x;
      const dy = (Number(e.y) || 0) - cast.y;
      if (dx * dx + dy * dy > r2) continue;
      e._dmgTakenMult = Math.min(e._dmgTakenMult || 1, 0.82);
      e._lightBuffUntil = Math.max(e._lightBuffUntil || 0, now + 0.22);
    }
  }
}

export function createRoamingBoss(zone, pos, opts = {}) {
  const s = getZoneScaling(zone);
  const floorIndex = Math.max(1, opts.floorIndex | 0);
  const biomeKey = String(opts.biomeKey || "").toLowerCase();
  const style = bossStyleForBiome(biomeKey);

  const floorScale = 1 + floorIndex * 0.08;
  const zoneScale = 1 + Math.max(0, zone - 1) * 0.12;
  const earlyBossScale = floorIndex <= 3 ? 0.72 : floorIndex <= 6 ? 0.84 : 1.0;

  const baseHP = 78;
  const baseDmg = 8;
  const baseSpeed = 68;
  const baseXP = 65;

  const bossArena = opts.bossArena || null;
  const bossMoveNodes = readArenaList(opts.bossMoveNodes).map(copyPoint).filter(Boolean);
  const hazardZones = readArenaList(opts.hazardZones).map(copyPoint).filter(Boolean);
  const safeLanes = readArenaList(bossArena?.safeLanes).map(copyPoint).filter(Boolean);
  const pressureZones = readArenaList(bossArena?.pressureZones).map(copyPoint).filter(Boolean);
  const phaseNodes = readArenaList(bossArena?.phaseNodes).map(copyPoint).filter(Boolean);

  const enemy = {
    type: biomeKey ? `${biomeKey}FloorBoss` : "roamingBoss",
    kind: biomeKey ? `${biomeKey}FloorBoss` : "roamingBoss",
    isRoamingBoss: true,
    zone,
    x: pos.x,
    y: pos.y,
    radius: (32 + Math.min(8, floorIndex * 0.28)) * (floorIndex <= 4 ? 0.92 : 1),
    hp: baseHP * s.hp * 5.4 * floorScale * zoneScale * earlyBossScale,
    maxHp: baseHP * s.hp * 5.4 * floorScale * zoneScale * earlyBossScale,
    damage: baseDmg * s.damage * 1.04 * floorScale * (floorIndex <= 4 ? 0.86 : 1),
    speed: baseSpeed * s.speed * (floorIndex <= 3 ? 0.96 : 1),
    xpValue: baseXP * s.xp * (4 + floorIndex * 0.2),
    scoreValue: 240 * floorIndex,
    isBoss: true,
    isGateEnemy: false,
    _bossStyle: style,
    _floorIndex: floorIndex,
    _bossArenaType: String(bossArena?.arenaType || ''),
    _bossArenaCenter: copyPoint(bossArena?.center) || { x: pos.x, y: pos.y, r: 0 },
    _bossSafeLanes: safeLanes,
    _bossPressureZones: pressureZones,
    _bossPhaseNodes: phaseNodes,
    _bossMoveNodes: bossMoveNodes,
    _bossHazardZones: hazardZones,
    _arenaNodeIndex: 0,
    _arenaMoveCd: floorIndex <= 4 ? 3.2 : 2.8,
    _arenaCastCd: floorIndex <= 4 ? 4.8 : 4.2,
    _activeArenaCast: null,
  };

  applyBiomeBossBehavior(enemy, biomeKey);

  enemy.update = (self, dt, state) => {
    const player = pickMobTarget(self, state, { aggroRange: 2000 });
    if (!player) return;

    const dx = player.x - self.x;
    const dy = player.y - self.y;
    const dist = Math.hypot(dx, dy) || 1;

    const debuffed = (typeof self._barrierDebuffUntil === "number") && (state.time < self._barrierDebuffUntil);
    const slowMult = debuffed ? (self._barrierSlowMult || 1) : 1;
    const dmgOutMult = debuffed ? (self._barrierDmgMult || 1) : 1;
    let speed = self.speed * slowMult;

    const key = String(self._biomeKey || "");
    if (key === "electric") {
      self._burstCd = (self._burstCd || 1.4) - dt;
      if (self._burstCd <= 0) {
        self._burstCd = self._floorIndex <= 4 ? 2.6 : 2.3;
        speed *= self._floorIndex <= 4 ? 1.34 : 1.55;
      }
    }
    if (key === "dark") {
      self._phaseCd = (self._phaseCd || 2.7) - dt;
      if (self._phaseCd <= 0) {
        self._phaseCd = self._floorIndex <= 4 ? 4.8 : 4.2;
        self._phaseUntil = state.time + (self._floorIndex <= 4 ? 0.38 : 0.55);
      }
      if ((self._phaseUntil || 0) > state.time) {
        self._dmgTakenMult = 0.35;
        speed *= 1.35;
      } else {
        self._dmgTakenMult = 1;
      }
    }
    if (key === "ice") {
      const aura = self._slowAura || 0;
      if (dist <= aura) {
        speed *= 1.04;
        player._frostSlow = Math.max(player._frostSlow || 0, 0.10);
      }
    }

    self._arenaMoveCd = (self._arenaMoveCd || 2.8) - dt;
    if (self._arenaMoveCd <= 0) {
      self._arenaMoveCd = 2.6 + ((floorIndex % 3) * 0.2);
      const movePool = self._bossMoveNodes?.length ? self._bossMoveNodes : (self._bossPhaseNodes?.length ? self._bossPhaseNodes : self._bossSafeLanes);
      if (movePool && movePool.length) self._arenaNodeIndex = ((self._arenaNodeIndex || 0) + 1) % movePool.length;
    }

    const movePool = self._bossMoveNodes?.length ? self._bossMoveNodes : (self._bossPhaseNodes?.length ? self._bossPhaseNodes : self._bossSafeLanes);
    const node = chooseArenaTarget(self, movePool);
    const nodeDx = node ? (node.x - self.x) : 0;
    const nodeDy = node ? (node.y - self.y) : 0;
    const nodeDist = Math.hypot(nodeDx, nodeDy) || 1;

    const angleToPlayer = Math.atan2(dy, dx);
    const orbit = Math.sin(state.time * 0.8 + floorIndex * 0.35) * 0.6;
    let vx = Math.cos(angleToPlayer + orbit) * 0.74;
    let vy = Math.sin(angleToPlayer + orbit) * 0.74;
    if (node) {
      vx += (nodeDx / nodeDist) * 0.48;
      vy += (nodeDy / nodeDist) * 0.48;
    }
    const vLen = Math.hypot(vx, vy) || 1;
    self.x += (vx / vLen) * speed * dt;
    self.y += (vy / vLen) * speed * dt;

    self._arenaCastCd = (self._arenaCastCd || 4.2) - dt;
    if (self._arenaCastCd <= 0) {
      const pressure = self._bossPressureZones?.length ? self._bossPressureZones : self._bossHazardZones;
      const safe = self._bossSafeLanes?.length ? self._bossSafeLanes : movePool;
      self._arenaCastCd = key === 'electric' ? 3.7 : key === 'fire' ? 4.0 : key === 'ice' ? 4.4 : key === 'dark' ? 4.8 : 4.6;
      if (key === 'dark' && self._bossPhaseNodes?.length) {
        const jump = chooseArenaTarget(self, self._bossPhaseNodes);
        if (jump) {
          self.x = jump.x;
          self.y = jump.y;
          self._phaseUntil = state.time + 0.45;
        }
      }
      activateArenaCast(self, state, pressure, safe);
    }
    applyArenaCastEffects(self, state, dt);

    if (key === "light") {
      self._healPulseCd = (self._healPulseCd || 2.2) - dt;
      if (self._healPulseCd <= 0) {
        self._healPulseCd = self._floorIndex <= 4 ? 2.8 : 2.2;
        const es = Array.isArray(state.enemies) ? state.enemies : [];
        for (const e of es) {
          if (!e || e === self || e.dead || (e.hp || 0) <= 0) continue;
          if ((e._roomIndex | 0) !== (self._roomIndex | 0)) continue;
          const ex = e.x - self.x;
          const ey = e.y - self.y;
          if (ex * ex + ey * ey > 180 * 180) continue;
          const maxHp = e.maxHp || e.hp || 1;
          e.hp = Math.min(maxHp, (e.hp || 0) + maxHp * (self._floorIndex <= 4 ? 0.02 : 0.03));
        }
      }
    }

    const es = Array.isArray(state.enemies) ? state.enemies : [];
    for (const e of es) {
      if (!e || e.dead || (e.hp || 0) <= 0) continue;
      if ((e._lightBuffUntil || 0) <= state.time && typeof e._lightBuffUntil === 'number') {
        if (e !== self) e._dmgTakenMult = 1;
      }
    }
    const ps = Array.isArray(state.players) && state.players.length ? state.players : (state.player ? [state.player] : []);
    for (const p of ps) {
      if (!p) continue;
      if ((p._dmgInMultUntil || 0) <= state.time && typeof p._dmgInMultUntil === 'number') {
        p._dmgInMult = 1;
      }
    }

    const r = (player.radius || 18) + self.radius;
    if (dx * dx + dy * dy <= r * r) {
      if (!player._ghostActive && !player._lvlUpInvuln && !player._lvlUpChoosing) {
        const mult = player._shieldActive ? 0.4 : 1.0;
        const inMult = (typeof player._dmgInMult === "number") ? player._dmgInMult : 1.0;
        let touchDamage = self.damage * dmgOutMult * dt * mult * inMult;
        if (key === "fire") touchDamage *= self._floorIndex <= 4 ? 1.02 : 1.08;
        if (key === "ice") touchDamage *= self._floorIndex <= 4 ? 0.92 : 0.96;
        applyDamageToTarget(player, touchDamage, state, self);
      }
    }
  };

  enemy.render = (self, ctx) => {
    const st = self._bossStyle || style;
    const t = (self._vfxT = (self._vfxT || 0) + 1 / 60);
    self._lastRenderTime = t;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.1 + self.x * 0.001);
    const r = self.radius || 38;

    ctx.save();

    ctx.fillStyle = st.glow;
    ctx.beginPath();
    ctx.arc(self.x, self.y, r * (1.7 + pulse * 0.12), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = st.fill;
    ctx.beginPath();
    ctx.arc(self.x, self.y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = hsla(st.hue || 322, 92, 70, 0.95);
    ctx.lineWidth = Math.max(3, r * 0.12);
    ctx.beginPath();
    ctx.arc(self.x, self.y, r * (1.18 + pulse * 0.06), -Math.PI / 2, -Math.PI / 2 + Math.PI * 1.7);
    ctx.stroke();

    ctx.strokeStyle = "rgba(10,10,16,0.45)";
    ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.beginPath();
    ctx.arc(self.x - r * 0.1, self.y - r * 0.1, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();

    const cast = self._activeArenaCast;
    if (cast) {
      const now = self._lastRenderTime || 0;
      const active = now >= (cast.warnUntil || 0);
      ctx.fillStyle = active
        ? (cast.biome === 'electric' ? 'rgba(95,240,255,0.16)' : cast.biome === 'fire' ? 'rgba(255,120,70,0.18)' : cast.biome === 'ice' ? 'rgba(180,225,255,0.16)' : cast.biome === 'dark' ? 'rgba(155,95,255,0.14)' : 'rgba(255,236,135,0.16)')
        : 'rgba(255,255,255,0.06)';
      ctx.strokeStyle = active
        ? (cast.biome === 'electric' ? 'rgba(150,248,255,0.54)' : cast.biome === 'fire' ? 'rgba(255,176,120,0.54)' : cast.biome === 'ice' ? 'rgba(255,255,255,0.58)' : cast.biome === 'dark' ? 'rgba(210,165,255,0.46)' : 'rgba(255,245,180,0.58)')
        : 'rgba(255,255,255,0.22)';
      ctx.lineWidth = active ? 4 : 2.5;
      ctx.beginPath();
      ctx.arc(cast.x, cast.y, cast.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    const ratio = clamp((self.hp || 0) / Math.max(1, self.maxHp || 1), 0, 1);
    ctx.strokeStyle = st.ring;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(self.x, self.y, r + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.fillText(st.label || "Floor Boss", self.x, self.y - r - 18);

    ctx.restore();
  };

  enemy.onDeath = (self, state) => {
    const biome = biomeByKey(self._biomeKey || "");
    const coinAmt = 16 + ((Math.random() * 12) | 0) + Math.floor(floorIndex * 0.6);
    const xpAmt = Math.round((self.xpValue || 30) * 0.9);
    state.xpOrbs.push({
      x: self.x,
      y: self.y,
      radius: 10,
      kind: "coin",
      coins: coinAmt,
      age: 0,
      color: biome?.accent || undefined,
    });
    state.xpOrbs.push({
      x: self.x + 16,
      y: self.y - 12,
      radius: 9,
      kind: "xp",
      xp: xpAmt,
      age: 0,
      color: biome?.accent || undefined,
    });
  };

  return enemy;
}
