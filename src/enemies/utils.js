export function getNearestEnemy(player, enemies, maxRange) {
  let best = null;
  const maxR2 = (maxRange || 999999) * (maxRange || 999999);

  for (const e of enemies) {
    if (e.hp <= 0) continue;
    const dx = e.x - player.x;
    const dy = e.y - player.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < maxR2) {
      if (!best || d2 < best.d2) {
        best = { e, d2 };
      }
    }
  }

  return best ? best.e : null;
}

export function getChainTargets(first, enemies, maxTargets, range) {
  const result = [first];
  let current = first;

  while (result.length < maxTargets) {
    let best = null;
    const maxR2 = range * range;

    for (const e of enemies) {
      if (e === current || e.hp <= 0 || result.includes(e)) continue;
      const dx = e.x - current.x;
      const dy = e.y - current.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= maxR2) {
        if (!best || d2 < best.d2) {
          best = { e, d2 };
        }
      }
    }

    if (!best) break;
    result.push(best.e);
    current = best.e;
  }

  return result;
}

// --- Damage helper -----------------------------------------------------------

/**
 * Apply damage to a target (player or summon) with shared rules.
 * - Supports Energy Barrier shield on players (absorbs damage, breaks, then recharges after cooldown).
 * - Keeps enemy targeting memory on players.
 */
export function applyDamageToTarget(target, amount, state, sourceEnemy = null) {
  if (!target || !Number.isFinite(amount) || amount <= 0) return 0;
  if (!Number.isFinite(target.hp) || target.hp <= 0) return 0;

  const now = (state && typeof state.time === "number") ? state.time : 0;

  // Energy Barrier shield: absorb damage while barrier is up.
  // Only applies to real players (summons should take damage normally).
  const isSummon = !!target.isSummon;
  if (!isSummon) {
    const ebLvl = (target.runSkills && target.runSkills.energyBarrier) ? (target.runSkills.energyBarrier | 0) : 0;
    const downUntil = (typeof target._energyBarrierDownUntil === "number") ? target._energyBarrierDownUntil : 0;
    if (ebLvl > 0 && (!downUntil || now >= downUntil)) {
      const shield = Number(target._energyBarrierShield || 0);
      if (shield > 0) {
        const absorbed = Math.min(amount, shield);
        target._energyBarrierShield = shield - absorbed;
        amount -= absorbed;

        // Even if fully absorbed, this still counts as combat.
        target._lastCombatAt = now;

        if (target._energyBarrierShield <= 0) {
          target._energyBarrierShield = 0;
          const cd = Math.max(0.25, Number(target._energyBarrierCooldown || 6.0));
          target._energyBarrierDownUntil = now + cd;
          // Hide visuals immediately; updateEnergyBarrier will keep it down until cooldown ends.
          target._energyBarrierVis = null;
        }
      }
    }
  }

  // Apply remaining damage to HP.
  if (amount > 0) {
    target.hp -= amount;
    if (target.hp < 0) target.hp = 0;
  }

  // Targeting memory (players only).
  if (!isSummon && sourceEnemy) {
    target.lastAttacker = sourceEnemy;
    target.lastAttackerAt = now;
    target._lastCombatAt = now;
  }

  return amount;
}

// --- Co-op targeting helpers -------------------------------------------------

export function getLivingPlayers(state) {
  const ps = (state && state.players && state.players.length) ? state.players : (state && state.player ? [state.player] : []);
  return ps.filter((p) => p && p.hp > 0);
}

/**
 * Pick a target player for an enemy.
 * Rules:
 *  - prefer a recent attacker for a short window (if still alive and reasonably close)
 *  - otherwise pick the nearest living player
 */
export function pickMobTarget(self, state, opts = {}) {
  const players = getLivingPlayers(state);

  // Summon Tanks support: enemies can be taunted by friendly summons within their taunt radius.
  const summons = (state && Array.isArray(state.summons)) ? state.summons : [];
  const livingSummons = summons.filter((s) => s && s.isSummon && s.hp > 0);

  if (!players.length && !livingSummons.length) return state?.player || null;

  const now = state?.time || 0;

  // If the enemy is currently taunted by a summon (lure), stick to that summon briefly.
  if (self && typeof self._tauntedUntil === "number" && self._tauntedUntil > now && self._tauntedBySummonId) {
    const sid = String(self._tauntedBySummonId);
    const forced = livingSummons.find((s) => s && String(s.id) === sid);
    if (forced) return forced;
  }

  const x = self?.x || 0;
  const y = self?.y || 0;
  const aggroRange = Number.isFinite(opts.aggroRange) ? opts.aggroRange : (Number.isFinite(self?.aggroRange) ? self.aggroRange : 520);
  const attackerMemorySec = Number.isFinite(opts.attackerMemorySec) ? opts.attackerMemorySec : 3.0;
  const allowSwitchDist = Number.isFinite(opts.allowSwitchDist) ? opts.allowSwitchDist : (aggroRange * 1.8);

  let nearest = players[0];
  let nearestD2 = Infinity;
  for (const p of players) {
    const dx = p.x - x;
    const dy = p.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < nearestD2) {
      nearestD2 = d2;
      nearest = p;
    }
  }

  // If any summon is within its own taunt radius, prefer the nearest such summon.
  let bestSummon = null;
  let bestSummonD2 = Infinity;
  for (const s of livingSummons) {
    const tr = Number.isFinite(s.tauntR) ? s.tauntR : 0;
    if (tr <= 0) continue;
    const dx = s.x - x;
    const dy = s.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= tr * tr && d2 < bestSummonD2) {
      bestSummonD2 = d2;
      bestSummon = s;
    }
  }
  if (bestSummon) return bestSummon;


  const lastHitAt = self && typeof self._lastHitAt === "number" ? self._lastHitAt : null;
  const lastHitBy = self && self._lastHitBy != null ? String(self._lastHitBy) : null;

  if (lastHitAt != null && lastHitBy && (now - lastHitAt) <= attackerMemorySec) {
    const attacker = players.find((p) => String(p.id) === lastHitBy);
    if (attacker) {
      const dx = attacker.x - x;
      const dy = attacker.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= allowSwitchDist * allowSwitchDist) {
        return attacker;
      }
    }
  }

  return nearest;
}
