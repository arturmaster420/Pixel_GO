import { saveProgression } from "./progression.js";
import { describeFloorShopOffer, getFloorShopRerollCost, getLiveReplaceRequirement, getReplaceCandidates, rollFloorShopOffers, rerollFloorShopOffersForPlayer, tryBuyFloorShopOfferEx } from "./floorShop.js";
import { biomeName } from "../world/biomes.js";
import { ensureShopMeta } from "../meta/shopMeta.js";
import { hideFloorShopOverlay, showFloorShopOverlay } from "../ui/floorShopDom.js";
import { EVOLUTION_SKILL_KEYS, getEvolutionResultKey } from "./skillEvolutionDefs.js";

export function canPlayerUseFloorShop(state, player) {
  return false;
}

export function getCurrentFloorShopFloor(state) {
  return (state.currentRoomIndex != null ? (state.currentRoomIndex | 0) : (state.roomDirector ? (state.roomDirector.roomIndex | 0) : 0));
}

export function getCurrentFloorShopBiomeKey(state) {
  return (state.roomDirector && state.roomDirector.current) ? (state.roomDirector.current.biomeKey || '') : (state._roomBiome || '');
}

export function ensureFloorShopForPlayer(state, player) {
  if (!state || !player) return null;
  const curFloor = getCurrentFloorShopFloor(state);
  if (player.floorShop && (player.floorShop.floor | 0) === curFloor && Array.isArray(player.floorShop.offers)) {
    if (!Array.isArray(player.floorShop.sold)) player.floorShop.sold = player.floorShop.offers.map(() => false);
    if (!Number.isFinite(player.floorShop.rerollsUsed)) player.floorShop.rerollsUsed = 0;
    return player.floorShop;
  }
  const online = !!(state.net && state.net.status === 'connected' && state.net.roomCode);
  const isHost = !online || !!state.net?.isHost;
  if (!isHost) return player.floorShop || null;
  const biomeKey = getCurrentFloorShopBiomeKey(state);
  const offers = rollFloorShopOffers(player, curFloor, biomeKey, 3);
  player.floorShop = { floor: curFloor, offers, sold: offers.map(() => false), rerollsUsed: 0 };
  return player.floorShop;
}

export function buildFloorShopChoices(player) {
  const fs = player?.floorShop;
  if (!fs || !Array.isArray(fs.offers)) return [];
  const spNow = (player?.skillPoints | 0) || 0;
  const choices = [];
  for (let i = 0; i < fs.offers.length; i++) {
    const o = fs.offers[i];
    if (!o) continue;
    if (Array.isArray(fs.sold) && fs.sold[i]) continue;
    const replaceReq = getLiveReplaceRequirement(player, o);
    const liveRequiresReplace = !!replaceReq?.needsReplace;
    const liveOffer = { ...o, requiresReplace: liveRequiresReplace, _replaceReq: replaceReq };
    const desc = describeFloorShopOffer(player, liveOffer);
    const cost = (o.spCost | 0) || 0;
    choices.push({ ...liveOffer, desc, disabled: spNow < cost });
  }
  return choices.slice(0, 3);
}

export function getLiveFloorShopOfferForPlayer(player, offerLike) {
  const fs = player?.floorShop;
  if (!fs || !Array.isArray(fs.offers) || !offerLike) return null;
  const offerId = String(offerLike?.id || "");
  if (!offerId) return null;
  return fs.offers.find((o) => o && String(o.id || "") === offerId) || null;
}

export function openFloorShopReplaceOverlay(state, player, pick, deps = {}) {
  if (!state || !player || !pick) return false;
  const livePick = getLiveFloorShopOfferForPlayer(player, pick) || pick;
  const replaceReq = pick?._replaceReq || getLiveReplaceRequirement(player, livePick);
  const liveIsUnlock = String(livePick?.kind || '') === 'skill' && ((replaceReq?.liveLevel | 0) <= 0);
  const needsReplace = !!replaceReq?.needsReplace;
  if (!(liveIsUnlock && needsReplace)) return false;

  const cand = Array.isArray(replaceReq?.candidates) && replaceReq.candidates.length
    ? replaceReq.candidates
    : getReplaceCandidates(player, livePick.key);
  if (!cand || !cand.length) {
    if (state.popups) state.popups.push({ text: 'No skill to replace', time: 1.1 });
    return true;
  }

  const online = !!(state.net && state.net.status === 'connected' && state.net.roomCode);
  const isJoiner = !!(online && state.net && !state.net.isHost);

  showFloorShopOverlay({
    title: 'Replace Skill',
    subtitle: `Max 6 active skills • Replace one with ${livePick.name}`,
    metaText: `SP: ${(player.skillPoints | 0) || 0}`,
    hint: 'Pick a skill to remove (Esc returns)',
    choices: cand.map((c) => ({
      id: `rep_${c.key}`,
      replaceKey: c.key,
      name: `${c.name}  Lv${c.level}`,
      desc: 'Will be removed to make room',
      spCost: null,
    })),
    onCloseCb: () => { deps.openFloorShopOverlay?.(state); },
    onPickCb: (rep) => {
      if (!rep || !rep.replaceKey) return;
      const replaceKey = String(rep.replaceKey);
      if (isJoiner) {
        state._shopActSeq = (state._shopActSeq || 0) + 1;
        state._shopActPending = { action: 'buy', offerId: String(livePick.id || ''), replaceKey, seq: state._shopActSeq };
        state._floorShopReopenOnSync = true;
        hideFloorShopOverlay();
        state._floorShopActive = false;
        if (state.popups) state.popups.push({ text: 'Buying…', time: 0.8 });
        return;
      }
      const res = performFloorShopPurchase(state, player, String(livePick.id || ''), replaceKey, deps);
      if (!res?.ok && state.popups) state.popups.push({ text: res?.reason === 'bad_replace' ? 'Cannot replace' : 'Cannot buy', time: 1.2 });
      deps.openFloorShopOverlay?.(state);
    },
  });
  return true;
}

export function openFloorShopOverlay(state, deps = {}) {
  if (!state || state.mode !== 'playing') return false;
  const p = state.player;
  if (!p) return false;
  const fs = ensureFloorShopForPlayer(state, p);
  if (!fs || !Array.isArray(fs.offers)) return false;

  const curFloor = getCurrentFloorShopFloor(state);
  const biomeKey = getCurrentFloorShopBiomeKey(state);
  const biomeLabel = (curFloor >= 4 && biomeKey) ? ` • Biome: ${biomeName(biomeKey)}` : '';
  const spNow = (p.skillPoints | 0) || 0;
  const rerollCost = getFloorShopRerollCost(fs);
  const choices = buildFloorShopChoices(p);

  const emptyHint = (!choices.length && rerollCost <= 0) ? 'All offers bought here. Close terminal.' : null;

  showFloorShopOverlay({
    title: 'Terminal',
    subtitle: `Spend Skill Points (SP)${biomeLabel}`,
    metaText: `SP: ${spNow} • Reroll ${Math.min(3, (fs.rerollsUsed | 0) || 0)}/3${rerollCost > 0 ? ` • Next ${rerollCost} SP` : ' • Maxed'}`,
    choices,
    rerollText: rerollCost > 0 ? `Reroll • ${rerollCost} SP` : 'Reroll Maxed',
    rerollDisabled: !(rerollCost > 0) || spNow < rerollCost,
    hint: emptyHint || undefined,
    onRerollCb: () => {
      const online = !!(state.net && state.net.status === 'connected' && state.net.roomCode);
      const isJoiner = !!(online && state.net && !state.net.isHost);
      if (!(rerollCost > 0)) return;
      if (spNow < rerollCost) {
        if (state.popups) state.popups.push({ text: 'Not enough SP', time: 1.2 });
        return;
      }
      if (isJoiner) {
        state._shopActSeq = (state._shopActSeq || 0) + 1;
        state._shopActPending = { action: 'reroll', seq: state._shopActSeq };
        state._floorShopReopenOnSync = true;
        hideFloorShopOverlay();
        state._floorShopActive = false;
        if (state.popups) state.popups.push({ text: 'Rerolling…', time: 0.8 });
        return;
      }
      const ok = performFloorShopReroll(state, p, deps);
      if (!ok) {
        if (state.popups) state.popups.push({ text: 'Cannot reroll', time: 1.2 });
        return;
      }
      deps.openFloorShopOverlay?.(state);
    },
    onCloseCb: () => { state._floorShopActive = false; },
    onPickCb: (pick) => {
      if (!pick || pick.disabled) return;
      const online = !!(state.net && state.net.status === 'connected' && state.net.roomCode);
      const isJoiner = !!(online && state.net && !state.net.isHost);
      const livePick = getLiveFloorShopOfferForPlayer(p, pick) || pick;
      if (openFloorShopReplaceOverlay(state, p, livePick, deps)) return;
      if (isJoiner) {
        state._shopActSeq = (state._shopActSeq || 0) + 1;
        state._shopActPending = { action: 'buy', offerId: String(livePick.id || ''), replaceKey: null, seq: state._shopActSeq };
        state._floorShopReopenOnSync = true;
        hideFloorShopOverlay();
        state._floorShopActive = false;
        if (state.popups) state.popups.push({ text: 'Buying…', time: 0.8 });
        return;
      }
      const res = performFloorShopPurchase(state, p, String(livePick.id || ''), null, deps);
      if (!res?.ok) {
        if (res?.reason === 'need_replace' || res?.reason === 'bad_replace' || getLiveReplaceRequirement(p, livePick)?.needsReplace) {
          if (openFloorShopReplaceOverlay(state, p, { ...livePick, _replaceReq: getLiveReplaceRequirement(p, livePick) }, deps)) return;
        }
        if (state.popups) state.popups.push({ text: res?.reason === 'no_sp' ? 'Not enough SP' : 'Cannot buy', time: 1.2 });
      }
      deps.openFloorShopOverlay?.(state);
    },
  });
  return true;
}

export function tryOpenFloorShop(state, deps = {}) {
  if (!state || state.mode !== 'playing') return false;
  if (state._floorShopActive) return true;
  const p = state.player;
  if (!p) return false;
  if (!canPlayerUseFloorShop(state, p)) return false;
  state._floorShopActive = true;
  const ok = openFloorShopOverlay(state, deps);
  if (!ok) state._floorShopActive = false;
  return ok;
}

export function performFloorShopPurchase(state, buyer, offerId, replaceKey, deps = {}) {
  if (!state || !buyer || !offerId) return { ok: false, reason: 'invalid' };
  if (!canPlayerUseFloorShop(state, buyer)) return { ok: false, reason: 'cannot_use' };
  const fs = buyer.floorShop;
  if (!fs || !Array.isArray(fs.offers)) return { ok: false, reason: 'no_shop' };
  const curFloor = getCurrentFloorShopFloor(state);
  if ((fs.floor | 0) !== curFloor) return { ok: false, reason: 'wrong_floor' };
  const idx = fs.offers.findIndex((o) => o && String(o.id) === String(offerId));
  if (idx < 0) return { ok: false, reason: 'offer_missing' };
  if (Array.isArray(fs.sold) && fs.sold[idx]) return { ok: false, reason: 'sold' };
  const offer = fs.offers[idx];
  const res = tryBuyFloorShopOfferEx(buyer, offer, replaceKey);
  if (!res || !res.ok) return res || { ok: false, reason: 'apply_failed' };
  if (Array.isArray(fs.sold)) fs.sold[idx] = true;
  if (Array.isArray(state.floatingTexts)) {
    state.floatingTexts.push({ x: buyer.x, y: buyer.y - 34, text: `-${offer.spCost | 0} SP`, time: 0.8 });
  }
  if (offer) {
    const rawOfferKey = String(offer.key || '');
    const evoResultKey = getEvolutionResultKey(rawOfferKey);
    const unlockKey = evoResultKey || (EVOLUTION_SKILL_KEYS.includes(rawOfferKey) ? rawOfferKey : '');
    if (unlockKey) {
      try {
        ensureShopMeta(state.progression);
        const metaId = `skill:${unlockKey}`;
        const cur = Number(state.progression?.skillMeta?.[metaId] || 0) || 0;
        if (state.progression && cur < 1) {
          state.progression.skillMeta[metaId] = 1;
          saveProgression(state.progression);
        }
      } catch {}
    }
  }
  try { deps.syncPersistentRunUnlocks?.(state); } catch {}
  if (Array.isArray(state.popups)) {
    state.popups.push({ text: `Bought: ${offer.name}`, time: 1.1 });
  }
  return { ok: true };
}

export function performFloorShopReroll(state, buyer, deps = {}) {
  if (!state || !buyer) return false;
  if (!canPlayerUseFloorShop(state, buyer)) return false;
  const fs = ensureFloorShopForPlayer(state, buyer);
  const curFloor = getCurrentFloorShopFloor(state);
  if (!fs || (fs.floor | 0) !== curFloor) return false;
  const cost = getFloorShopRerollCost(fs);
  if (!(cost > 0)) return false;
  const sp = (buyer.skillPoints | 0) || 0;
  if (sp < cost) return false;
  buyer.skillPoints = sp - cost;
  const next = rerollFloorShopOffersForPlayer(buyer, curFloor, getCurrentFloorShopBiomeKey(state), 3);
  if (!next) {
    buyer.skillPoints = sp;
    return false;
  }
  if (Array.isArray(state.floatingTexts)) {
    state.floatingTexts.push({ x: buyer.x, y: buyer.y - 34, text: `-${cost | 0} SP`, time: 0.8 });
  }
  if (Array.isArray(state.popups)) {
    state.popups.push({ text: `Terminal reroll (${(next.rerollsUsed | 0)}/3)`, time: 1.0 });
  }
  return true;
}
