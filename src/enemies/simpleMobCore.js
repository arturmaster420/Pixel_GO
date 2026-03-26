import { pickMobTarget, applyDamageToTarget } from "./utils.js";
import { renderBiomeUnit, biomeKeyFromKind, biomeStyleForKey } from "./biomeVisuals.js";
import { biomeKeyToEssenceKey, getBiomePreferredGearDefs, getBiomeLootProfile } from "../core/hubBuild.js";
import { buildCardRewardPayloadForRace } from "../core/cards/cardRewards.js";
import { getActiveHero } from "../core/accountProfile.js";
import { buildHeroBiomeResonancePayload } from "../core/heroBiomeProgression.js";

export function resolveEnemyRoom(self, state) {
  const rd = state?.roomDirector || null;
  if (!rd) return null;
  const idx = (self?._roomIndex | 0) || 0;
  if (!idx) return rd.current || null;
  if ((rd.current?.index | 0) === idx) return rd.current;
  if ((rd.prev?.index | 0) === idx && rd.prev && !rd.prev.removed) return rd.prev;
  if ((rd.next?.index | 0) === idx && rd.next && !rd.next.removed) return rd.next;
  return null;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function getDebuffedSpeed(self, state) {
  const now = Number(state?.time || 0);
  const barrierDebuffed = (typeof self?._barrierDebuffUntil === "number") && now < self._barrierDebuffUntil;
  const barrierSlow = barrierDebuffed ? Number(self?._barrierSlowMult || 1) : 1;
  const frostLeft = Number(self?._frostLeft || 0);
  const frostLv = Number(self?._frostLv || 0);
  const frostSlow = frostLeft > 0 ? clamp(1 - frostLv * 0.09, 0.58, 1) : 1;
  const frozen = (typeof self?._frozenUntil === 'number') && now < self._frozenUntil;
  if (frozen) return Math.max(4, Number(self?.speed || 0) * 0.04);
  return Math.max(12, Number(self?.speed || 0) * barrierSlow * frostSlow);
}

function getDamageOutMult(self, state) {
  const now = Number(state?.time || 0);
  const barrierDebuffed = (typeof self?._barrierDebuffUntil === "number") && now < self._barrierDebuffUntil;
  return barrierDebuffed ? Number(self?._barrierDmgMult || 1) : 1;
}

function steerTowardPoint(self, tx, ty, speed, dt) {
  const dx = Number(tx || 0) - Number(self?.x || 0);
  const dy = Number(ty || 0) - Number(self?.y || 0);
  const dist = Math.hypot(dx, dy) || 1;
  if (dist <= 0.001) return;
  const step = Math.min(dist, Math.max(0, speed * dt));
  self.x += (dx / dist) * step;
  self.y += (dy / dist) * step;
}

export function updateSimpleRoomChase(self, dt, state, {
  aggroRange = 520,
  leashRadius = 460,
  contactShieldMult = 1,
} = {}) {
  if (!self || !state) return;
  const player = pickMobTarget(self, state, { aggroRange: self.aggroRange || aggroRange });
  if (!player) return;

  const speed = getDebuffedSpeed(self, state);
  const room = resolveEnemyRoom(self, state);
  const roomCenterX = Number(room?.centerX ?? self?._roomCenter?.x ?? self?._spawnAnchor?.x ?? self?.x ?? 0);
  const roomCenterY = Number(room?.centerY ?? self?._roomCenter?.y ?? self?._spawnAnchor?.y ?? self?.y ?? 0);
  const toCenterX = roomCenterX - Number(self?.x || 0);
  const toCenterY = roomCenterY - Number(self?.y || 0);
  const distToCenter = Math.hypot(toCenterX, toCenterY);
  const leash = Math.max(180, Number(self?._leashRadius || leashRadius));

  let aimX = Number(player.x || 0);
  let aimY = Number(player.y || 0);
  if (distToCenter > leash) {
    aimX = roomCenterX;
    aimY = roomCenterY;
  }

  steerTowardPoint(self, aimX, aimY, speed, dt);

  const hitDx = Number(player.x || 0) - Number(self.x || 0);
  const hitDy = Number(player.y || 0) - Number(self.y || 0);
  const hitR = Number(player.radius || 18) + Number(self.radius || 18);
  if (hitDx * hitDx + hitDy * hitDy <= hitR * hitR) {
    if (!player._ghostActive && !player._lvlUpInvuln && !player._lvlUpChoosing) {
      const shieldMult = player._shieldActive ? contactShieldMult : 1.0;
      const inMult = (typeof player._dmgInMult === "number") ? player._dmgInMult : 1.0;
      applyDamageToTarget(player, Number(self.damage || 0) * getDamageOutMult(self, state) * dt * shieldMult * inMult, state, self);
    }
  }
}

export function renderSimpleMob(self, ctx, { fallbackFill = "#ff5f6f", isBasic = false, isElite = false } = {}) {
  const bk = String(self?._biomeKey || biomeKeyFromKind(self?.kind) || "").toLowerCase();
  if (bk) {
    const role = biomeStyleForKey(bk).role;
    renderBiomeUnit(ctx, self, bk, { role, isBasic, isElite });
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.fillStyle = fallbackFill;
  ctx.arc(Number(self?.x || 0), Number(self?.y || 0), Number(self?.radius || 18), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

export function dropSimpleMobRewards(self, state, { coinChance = 0.22, coinMin = 1, coinMax = 1, radius = 8, essenceChance = null, materialChance = null, partChance = null } = {}) {
  if (!self || !state) return;
  const biomeKey = biomeKeyToEssenceKey(self?._biomeKey || biomeKeyFromKind(self?.kind) || 'mecha');
  const isElite = !!self?.isElite;
  const lootProfile = getBiomeLootProfile(biomeKey);
  const preferredDefs = getBiomePreferredGearDefs(biomeKey);
  const xpAmt = Math.max(1, Math.round(Number(self.xpValue || 10) || 10));
  state._resourceGrantSerial = Math.max(0, Number(state._resourceGrantSerial || 0));
  const nextGrantId = (tag) => `${String(self?.id || self?.kind || 'mob')}:${String(tag || 'res')}:${++state._resourceGrantSerial}`;
  const pushProgOrb = (dx, dy, payload, tag, orbRadius = Math.max(8, radius)) => {
    if (!payload || typeof payload !== 'object') return;
    const grantId = nextGrantId(tag);
    state.xpOrbs.push({
      x: self.x + dx,
      y: self.y + dy,
      radius: orbRadius,
      kind: 'prog',
      progKind: tag,
      progPayload: { ...payload, _grantId: grantId },
      age: 0,
      grantId,
    });
  };

  // XP should always drop, even when coins/resources drop too.
  state.xpOrbs.push({
    x: self.x,
    y: self.y,
    radius,
    kind: "xp",
    xp: xpAmt,
    age: 0,
  });

  if (Math.random() < coinChance) {
    const amt = coinMin + (((Math.random() * Math.max(1, coinMax - coinMin + 1)) | 0));
    state.xpOrbs.push({
      x: self.x + 10,
      y: self.y - 6,
      radius,
      kind: "coin",
      coins: amt,
      age: 0,
    });
  }

  const resolvedEssenceChance = Number.isFinite(Number(essenceChance)) ? Number(essenceChance) : (isElite ? 0.48 : 0.26);
  if (Math.random() < resolvedEssenceChance) {
    state.xpOrbs.push({
      x: self.x - 10,
      y: self.y + 4,
      radius: Math.max(8, radius),
      kind: 'essence',
      essenceKey: biomeKey,
      amount: 1,
      age: 0,
      grantId: nextGrantId('essence'),
    });
  }

  const resolvedMaterialChance = Number.isFinite(Number(materialChance)) ? Number(materialChance) : (isElite ? 0.34 : 0.18);
  const matRoll = Math.random();
  if (matRoll < resolvedMaterialChance) {
    let materialKey = 'salvage';
    if (isElite && Math.random() < 0.28) materialKey = 'alloy';
    if (isElite && lootProfile?.bossMaterials?.coreShard && Math.random() < 0.12) materialKey = 'coreShard';
    state.xpOrbs.push({
      x: self.x + 4,
      y: self.y + 12,
      radius: Math.max(8, radius),
      kind: 'material',
      materialKey,
      amount: 1,
      age: 0,
      grantId: nextGrantId('material'),
    });
  }

  const resolvedPartChance = Number.isFinite(Number(partChance)) ? Number(partChance) : (isElite ? 0.16 : 0.07);
  if (preferredDefs.length && Math.random() < resolvedPartChance) {
    const def = preferredDefs[(Math.random() * preferredDefs.length) | 0] || preferredDefs[0];
    if (def?.key) {
      state.xpOrbs.push({
        x: self.x - 4,
        y: self.y - 12,
        radius: Math.max(9, radius),
        kind: 'gearPart',
        gearKey: def.key,
        amount: 1,
        age: 0,
        grantId: nextGrantId('part'),
      });
    }
  }

  const dustChance = isElite ? 0.30 : 0.10;
  if (Math.random() < dustChance) {
    pushProgOrb(12, 12, { raceDust: { [biomeKey]: isElite ? 2 : 1 } }, 'raceDust');
  }

  const shardChance = isElite ? 0.26 : 0.07;
  if (Math.random() < shardChance) {
    const shardPayload = buildCardRewardPayloadForRace(biomeKey, Math.random, {
      shards: isElite ? 2 : 1,
      includeStarter: !isElite,
      includeSkill: true,
      includePassive: true,
    });
    if (shardPayload) pushProgOrb(-12, 12, shardPayload, 'cardShard', Math.max(9, radius));
  }

  if (isElite && Math.random() < 0.08) {
    const copyPayload = buildCardRewardPayloadForRace(biomeKey, Math.random, {
      copies: 1,
      includeStarter: false,
      includeSkill: true,
      includePassive: true,
    });
    if (copyPayload) pushProgOrb(0, -14, copyPayload, 'cardCopy', Math.max(9, radius));
  }

  const heroBiome = getActiveHero(state?.progression)?.race || state?.progression?.activeHeroRace || state?.progression?.selectedStarterLoadout || biomeKey;
  const resonancePayload = buildHeroBiomeResonancePayload(heroBiome, Math.random, {
    source: isElite ? 'elite' : 'room',
    floorNumber: state?.run?.floor || state?.floorNumber || 1,
    sourceBiome: biomeKey,
  });
  if (resonancePayload && (isElite || Math.random() < 0.28)) {
    pushProgOrb(isElite ? -16 : 16, isElite ? -6 : 4, resonancePayload, 'heroResonance', Math.max(9, radius));
  }
}
