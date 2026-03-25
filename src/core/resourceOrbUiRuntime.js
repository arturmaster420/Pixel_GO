import { saveProgression } from "./progression.js";
import { ESSENCE_META, getHubGearDef, getMaterialMeta } from "./hubBuild.js";
import { applyDirectResourceGrantToLocal, applyProgressionPayloadToLocal, getDirectResourcePayloadFromOrb, getLocalProgressionAliases, isDirectResourceOrbKind } from "./progressionRuntime.js";
import { ensureShopMeta } from "../meta/shopMeta.js";
import { getCardDefById } from "./cards/cardDefs.js";

export function getProgPickupTint(orb) {
  const payload = orb?.progPayload && typeof orb.progPayload === 'object'
    ? orb.progPayload
    : (orb?.kind === 'essence'
      ? { essences: { [String(orb.essenceKey || 'mecha')]: Math.max(1, Number(orb.amount || 1) | 0) } }
      : (orb?.kind === 'material'
        ? { materials: { [String(orb.materialKey || 'salvage')]: Math.max(1, Number(orb.amount || 1) | 0) } }
        : (orb?.kind === 'gearPart'
          ? { gearParts: { [String(orb.gearKey || '')]: Math.max(1, Number(orb.amount || 1) | 0) } }
          : (orb?.kind === 'gearItem'
            ? { gearItems: { [String(orb.gearKey || '')]: Math.max(1, Number(orb.amount || 1) | 0) } }
            : {}))));
  const essences = payload.essences && typeof payload.essences === 'object' ? payload.essences : {};
  for (const key of Object.keys(essences)) {
    const meta = ESSENCE_META[String(key || '').toLowerCase()] || ESSENCE_META.mecha;
    return { fill: meta.accent || '#5af2ff', glow: meta.glow || meta.accent || '#5af2ff', glyph: '◆' };
  }
  const dust = payload.raceDust && typeof payload.raceDust === 'object' ? payload.raceDust : {};
  for (const key of Object.keys(dust)) {
    const meta = ESSENCE_META[String(key || '').toLowerCase()] || ESSENCE_META.mecha;
    return { fill: meta.accent || '#ffab7a', glow: '#ffe1ca', glyph: '✧' };
  }
  const materials = payload.materials && typeof payload.materials === 'object' ? payload.materials : {};
  for (const key of Object.keys(materials)) {
    const meta = getMaterialMeta(key);
    if (String(key) === 'salvage') return { fill: '#b9c2d6', glow: '#dfe7ff', glyph: '◈' };
    if (String(key) === 'alloy') return { fill: '#8ad8ff', glow: '#d8f5ff', glyph: '⬢' };
    if (String(key) === 'coreShard') return { fill: '#c58bff', glow: '#f0d7ff', glyph: '✦' };
    return { fill: '#a9d7ff', glow: '#e8f6ff', glyph: (meta.short || 'M')[0] || 'M' };
  }
  const parts = payload.gearParts && typeof payload.gearParts === 'object' ? payload.gearParts : {};
  for (const key of Object.keys(parts)) {
    const def = getHubGearDef(key);
    return { fill: '#79ffbf', glow: '#d8fff0', glyph: (def?.short || 'P')[0] || 'P' };
  }
  const items = payload.gearItems && typeof payload.gearItems === 'object' ? payload.gearItems : {};
  for (const key of Object.keys(items)) {
    const def = getHubGearDef(key);
    return { fill: '#ff8a6b', glow: '#ffd8cb', glyph: (def?.short || def?.name || 'I')[0] || 'I' };
  }
  const cardShards = payload.cardShards && typeof payload.cardShards === 'object' ? payload.cardShards : {};
  for (const key of Object.keys(cardShards)) {
    const def = getCardDefById(key);
    return { fill: '#b99dff', glow: '#ecdfff', glyph: String(def?.name || 'S')[0] || 'S' };
  }
  const cardCopies = payload.cardCopies && typeof payload.cardCopies === 'object' ? payload.cardCopies : {};
  for (const key of Object.keys(cardCopies)) {
    const def = getCardDefById(key);
    return { fill: '#7fffd3', glow: '#e0fff4', glyph: String(def?.name || 'C')[0] || 'C' };
  }
  return { fill: '#5af2ff', glow: '#c8fbff', glyph: '+' };
}

function applyResourceOrbToLocal(state, orb) {
  if (!state || !orb) return { changed: false, lines: [] };
  if (isDirectResourceOrbKind(String(orb.kind || ''))) {
    return applyDirectResourceGrantToLocal(state, orb);
  }
  const payload = (orb.progPayload && typeof orb.progPayload === 'object') ? orb.progPayload : getDirectResourcePayloadFromOrb(orb);
  return applyProgressionPayloadToLocal(state, payload, orb);
}

export function updateXPOrbs(state, dt) {
  const { xpOrbs } = state;
  const players = state.players && state.players.length ? state.players : (state.player ? [state.player] : []);
  for (let i = xpOrbs.length - 1; i >= 0; i--) {
    const orb = xpOrbs[i];
    orb.age = (orb.age || 0) + dt;
    if (orb.ttl != null && orb.age >= orb.ttl) { xpOrbs.splice(i, 1); continue; }
    if (orb.baseY == null) orb.baseY = orb.y;
    orb.y = orb.baseY + Math.sin(orb.age * 5) * 2;
    const pickupBlocked = (orb.spawnDelay != null) && (orb.age < orb.spawnDelay);
    for (const player of players) {
      if (pickupBlocked) continue;
      const dx = player.x - orb.x, dy = player.y - orb.y;
      const baseRadius = (player.radius || 18) + (orb.radius || 8);
      const pickupBonus = (state.meta?.pickupBonusRadius || 0) + (player.runPickupBonusRadius || 0);
      const r = baseRadius + pickupBonus;
      if (dx * dx + dy * dy > r * r) continue;
      const kind = orb.kind || (orb.coins ? 'coin' : 'xp');
      const online = !!(state.net && state.net.status === 'connected' && state.net.roomCode);
      const localAliases = getLocalProgressionAliases(state);
      const playerId = player?.id != null ? String(player.id) : '';
      const colliderIsLocal = !playerId || localAliases.includes(playerId) || player === state.player;
      const isLocalAuthorityCollector = !!state.progression && ((!online && colliderIsLocal) || (online && state.net?.isHost && colliderIsLocal));
      if (isDirectResourceOrbKind(kind)) {
        const payload = getDirectResourcePayloadFromOrb(orb);
        if (!payload) { xpOrbs.splice(i, 1); break; }
        if (orb.grantId) payload._grantId = String(orb.grantId);
        const targetId = playerId || (state.net?.playerId ? String(state.net.playerId) : 'local');
        if (!online || colliderIsLocal || !state.net?.isHost) applyResourceOrbToLocal(state, orb);
        else if (typeof state.net.sendProgressionGain === 'function') { try { state.net.sendProgressionGain(String(targetId || ''), payload); } catch {} }
        xpOrbs.splice(i, 1); break;
      }
      if (kind === 'prog') {
        const payload = (orb.progPayload && typeof orb.progPayload === 'object') ? orb.progPayload : null;
        const ownerId = orb.ownerId != null ? String(orb.ownerId) : '';
        const ownerAliases = Array.isArray(orb.ownerAliases) ? orb.ownerAliases.map((v) => String(v || '')).filter(Boolean) : [];
        const ownerMatches = !ownerId || ownerId === playerId || localAliases.includes(ownerId) || ownerAliases.includes(playerId) || ownerAliases.some((id) => localAliases.includes(id));
        const orbIsForLocal = !ownerId || localAliases.includes(ownerId) || ownerAliases.some((id) => localAliases.includes(id));
        if (!payload) { xpOrbs.splice(i, 1); break; }
        if (!ownerMatches) continue;
        if ((!online && colliderIsLocal) || (orbIsForLocal && colliderIsLocal)) applyResourceOrbToLocal(state, orb);
        else if (online && state.net?.isHost && typeof state.net.sendProgressionGain === 'function') {
          const targetId = ownerId || playerId;
          try { state.net.sendProgressionGain(String(targetId || playerId || ''), payload); } catch {}
        }
        xpOrbs.splice(i, 1); break;
      }
      if (kind === 'coin') {
        const amt = orb.coins || 1;
        if (isLocalAuthorityCollector) {
          try { ensureShopMeta(state.progression); } catch {}
          state.progression.coins = Math.max(0, (state.progression.coins | 0) + (amt | 0));
          try { saveProgression(state.progression); } catch {}
          if (state.floatingTexts) state.floatingTexts.push({ x: orb.x, y: orb.y, text: `+${amt}🪙`, time: 0.8 });
        } else if (online && state.net?.isHost && typeof state.net.sendCoinGain === 'function') {
          try { state.net.sendCoinGain(String(player.id || ''), amt | 0); } catch {}
        }
        xpOrbs.splice(i, 1); break;
      }
      const baseXp = orb.xp || 10;
      const metaMult = (state.meta?.xpGainMult || 1) * (player.runXpGainMult || 1);
      const buffMult = 1 + (state.tempXpGainBoost || 0);
      const xpMultRaw = metaMult * buffMult;
      const xpMult = Math.min(3.0, 1 + (xpMultRaw - 1) * 0.55);
      if (typeof player.gainXP === 'function') player.gainXP(baseXp * xpMult, state);
      xpOrbs.splice(i, 1); break;
    }
  }
}

export function updateFloatingTexts(state, dt) {
  const { floatingTexts } = state;
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const t = floatingTexts[i]; t.y -= 20 * dt; t.time -= dt;
    if (t.time <= 0) floatingTexts.splice(i, 1);
  }
}

export function renderFloatingTexts(ctx, state) {
  const floatingTexts = state.floatingTexts;
  ctx.save(); ctx.font = '18px sans-serif'; ctx.textAlign = 'center';
  for (let i = 0; i < floatingTexts.length; i++) {
    const t = floatingTexts[i];
    let alpha = t.time / 1.2; if (alpha < 0) alpha = 0; if (alpha > 1) alpha = 1;
    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.restore();
}

export function updatePopups(state, dt) {
  const arr = state.popups;
  for (let i = arr.length - 1; i >= 0; i--) {
    arr[i].time -= dt;
    if (arr[i].time <= 0) arr.splice(i, 1);
  }
}
