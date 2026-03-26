import { BIOME_ESSENCE_KEYS, ESSENCE_META, addEssence, ensureHubProgression } from '../../core/hubBuild.js';
import { ensureAccountProgression, getActiveHero, getHeroBiomeMasterySummary, grantHeroBiomeMasteryXp, normalizeHeroRaceKey } from '../../core/accountProfile.js';
import { applyCardRewardPayload, buildCardRewardPayloadForRace, getTotalCardShardCount, listCardDefsForRace } from '../../core/cards/cardRewards.js';

let shopRenderKey = '';

export const SHOP_ESSENCE_CHESTS = [
  { key: 'small', name: 'Small Crystal Chest', price: 45, rolls: 3, accent: '#8fd8ff', blurb: 'Low-cost chest with a few random essence pulls.' },
  { key: 'medium', name: 'Medium Crystal Chest', price: 110, rolls: 8, accent: '#b7ffb0', blurb: 'Balanced chest with a solid spread of essence drops.' },
  { key: 'grand', name: 'Grand Crystal Chest', price: 240, rolls: 18, accent: '#ffd17d', blurb: 'Large chest with many rolls and the best total essence payout.' },
];

export function resetMerchantRenderKey() {
  shopRenderKey = '';
}

export function rollEssenceChest(prog, chestDef) {
  ensureHubProgression(prog);
  const tallies = {};
  const rolls = Math.max(1, chestDef?.rolls | 0);
  for (let i = 0; i < rolls; i += 1) {
    const key = BIOME_ESSENCE_KEYS[(Math.random() * BIOME_ESSENCE_KEYS.length) | 0] || 'mecha';
    tallies[key] = (tallies[key] | 0) + 1;
    addEssence(prog, key, 1);
  }
  return tallies;
}

export function formatEssenceTallies(tallies) {
  return BIOME_ESSENCE_KEYS
    .filter((key) => (tallies?.[key] | 0) > 0)
    .map((key) => `${(ESSENCE_META[key] || ESSENCE_META.mecha).short || key} +${tallies[key] | 0}`)
    .join(' • ');
}

export function renderMerchantShop(state, deps) {
  const { el, make, setShopMsg, persistHubState, renderWalletBar, openCharacterMenu } = deps;
  const prog = state?.progression;
  if (!prog) return;
  ensureHubProgression(prog);
  ensureAccountProgression(prog);
  const activeHero = getActiveHero(prog);
  const raceKey = normalizeHeroRaceKey(activeHero?.race || prog?.selectedStarterLoadout || 'mecha');
  const raceMeta = ESSENCE_META[raceKey] || ESSENCE_META.mecha;
  const raceWallet = getHeroRaceWallet(prog, raceKey);
  const totalShards = getTotalCardShardCount(prog?.accountProfile?.cardCollection);
  const masterySummary = getHeroBiomeMasterySummary(prog, activeHero);

  if (el.shopCoins) el.shopCoins.textContent = String(Math.max(0, prog.coins | 0));
  renderWalletBar(el.shopWallet, prog, { compact: true, hideCoins: true, showCardEconomy: true });
  if (el.shopFlowInfo) {
    el.shopFlowInfo.textContent = `Merchant now supports the active hero card economy, forge loop and biome mastery too. ${String(activeHero?.name || 'Hero')} • ${raceMeta.label}: ${raceMeta.short} Essence ${raceWallet.essence}, ${raceMeta.short} Dust ${raceWallet.dust}, Total Shards ${totalShards}, Mastery Lv ${Math.max(1, masterySummary?.mastery?.level | 0 || 1)}.`;
  }
  if (el.shopRerollBtn) el.shopRerollBtn.style.display = 'none';
  if (el.shopRerollCost) el.shopRerollCost.textContent = '—';

  const activeLabel = el.shopGridActive?.previousSibling;
  const passiveLabel = el.shopGridPassive?.previousSibling;
  const newLabel = el.shopGridNew?.previousSibling;
  if (activeLabel) activeLabel.textContent = 'Crystal Chests';
  if (passiveLabel) { passiveLabel.style.display = ''; passiveLabel.textContent = `Hero Card Caches • ${raceMeta.short}`; }
  if (newLabel) { newLabel.style.display = ''; newLabel.textContent = 'Resonance Supplies'; }
  if (el.shopGridPassive) { el.shopGridPassive.style.display = ''; }
  if (el.shopGridNew) { el.shopGridNew.style.display = ''; }
  if (el.shopGridActive) el.shopGridActive.style.display = '';

  const key = JSON.stringify({
    coins: prog.coins | 0,
    essences: prog.essences || {},
    raceDust: prog.accountProfile?.sharedResources?.raceDust || {},
    shards: prog.accountProfile?.cardCollection?.shards || {},
    activeHeroId: prog.activeHeroId || '',
    activeHeroRace: raceKey,
    activeHeroName: activeHero?.name || '',
  });
  if (key === shopRenderKey) return;
  shopRenderKey = key;

  if (el.shopGridActive) {
    el.shopGridActive.innerHTML = '';
    for (const chest of SHOP_ESSENCE_CHESTS) {
      const card = make('div', { className: 'shopCard', style: { padding: '12px', border: `1px solid ${chest.accent}66`, boxShadow: `0 0 0 1px ${chest.accent}22 inset` } });
      const top = make('div', { className: 'top' }, [
        make('div', { className: 'name', text: chest.name, style: { color: '#f6fbff' } }),
        make('div', { className: 'lvl', text: `${chest.rolls} rolls`, style: { color: chest.accent } }),
      ]);
      card.appendChild(top);
      card.appendChild(make('div', { className: 'muted', text: chest.blurb, style: { marginTop: '8px', fontSize: '12px', lineHeight: '1.42', opacity: '1' } }));
      card.appendChild(make('div', { className: 'muted', text: `Possible pulls: ${BIOME_ESSENCE_KEYS.map((key) => (ESSENCE_META[key] || ESSENCE_META.mecha).short).join(' • ')}`, style: { marginTop: '6px', fontSize: '11px', lineHeight: '1.38', color: 'rgba(216,234,255,0.78)', opacity: '1' } }));
      const buyRow = make('div', { className: 'buyRow', style: { marginTop: '10px' } });
      buyRow.appendChild(make('div', { className: 'price', text: `${Math.max(0, chest.price | 0)} Gold` }));
      const btn = make('button', { type: 'button', className: 'btn', text: 'Open Chest' });
      btn.disabled = (prog.coins | 0) < (chest.price | 0);
      btn.addEventListener('click', () => {
        if ((prog.coins | 0) < (chest.price | 0)) {
          setShopMsg('Not enough Gold.');
          return;
        }
        prog.coins = Math.max(0, (prog.coins | 0) - (chest.price | 0));
        const tallies = rollEssenceChest(prog, chest);
        persistHubState(state, `${chest.name}: ${formatEssenceTallies(tallies) || 'No essence rolled.'}`);
        resetMerchantRenderKey();
        renderMerchantShop(state, deps);
      });
      buyRow.appendChild(btn);
      card.appendChild(buyRow);
      el.shopGridActive.appendChild(card);
    }
  }

  const renderOffer = (target, offer) => {
    if (!target || !offer) return;
    const card = make('div', { className: 'shopCard', style: { padding: '12px', border: `1px solid ${offer.accent}66`, boxShadow: `0 0 0 1px ${offer.accent}22 inset` } });
    const top = make('div', { className: 'top' }, [
      make('div', { className: 'name', text: offer.name, style: { color: '#f6fbff' } }),
      make('div', { className: 'lvl', text: raceMeta.short, style: { color: offer.accent } }),
    ]);
    card.appendChild(top);
    for (const line of buildCardOfferLines(prog, offer, raceKey)) {
      card.appendChild(make('div', { className: 'muted', text: line, style: { marginTop: '6px', fontSize: '12px', lineHeight: '1.4', opacity: '1' } }));
    }
    const actionRow = make('div', { className: 'buyRow', style: { marginTop: '10px', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } });
    actionRow.appendChild(make('div', { className: 'price', text: `${Math.max(0, offer.price | 0)} Gold` }));
    const btn = make('button', { type: 'button', className: 'btn', text: 'Buy Cache' });
    btn.disabled = (prog.coins | 0) < (offer.price | 0);
    btn.addEventListener('click', () => buyCardOffer(state, deps, offer));
    actionRow.appendChild(btn);
    if (typeof openCharacterMenu === 'function') {
      const inspectBtn = make('button', { type: 'button', className: 'btn', text: 'Inspect Cards', style: { padding: '8px 10px' } });
      inspectBtn.addEventListener('click', () => openCharacterMenu(state, 'cards'));
      actionRow.appendChild(inspectBtn);
    }
    card.appendChild(actionRow);
    target.appendChild(card);
  };

  if (el.shopGridPassive) {
    el.shopGridPassive.innerHTML = '';
    for (const offer of SHOP_CARD_OFFERS.filter((item) => item.row === 'passive')) renderOffer(el.shopGridPassive, offer);
  }
  if (el.shopGridNew) {
    el.shopGridNew.innerHTML = '';
    for (const offer of SHOP_CARD_OFFERS.filter((item) => item.row === 'new')) renderOffer(el.shopGridNew, offer);
  }
}



export const SHOP_CARD_OFFERS = [
  { key: 'skill_cache', row: 'passive', name: 'Hero Skill Cache', price: 95, kind: 'skill', copies: 1, shards: 4, dust: 2, essence: 1, accent: '#9fd6ff', blurb: 'Targets the active hero biome and tries to hand out an active skill card copy plus shards.' },
  { key: 'passive_codex', row: 'passive', name: 'Passive Codex', price: 90, kind: 'passive', copies: 1, shards: 4, dust: 2, essence: 1, accent: '#d8b2ff', blurb: 'Targets the active hero biome and leans toward passive doctrine cards.' },
  { key: 'twin_sigil', row: 'passive', name: 'Twin Sigil Chest', price: 140, kind: '', copies: 1, shards: 6, dust: 3, essence: 2, accent: '#ffd995', blurb: 'Mixed same-biome card chest with stronger shard support for the current hero.' },
  { key: 'shard_bundle', row: 'new', name: 'Shard Bundle', price: 60, kind: 'skill', copies: 0, shards: 8, dust: 0, essence: 0, accent: '#8fd8ff', blurb: 'Cheap same-biome shard bundle for the active hero card pool.' },
  { key: 'dust_cache', row: 'new', name: 'Dust Cache', price: 55, kind: '', copies: 0, shards: 0, dust: 6, essence: 1, accent: '#ffb58c', blurb: 'No cards inside — just same-biome Dust and a small essence top-up.' },
  { key: 'forge_fuel', row: 'new', name: 'Forge Fuel Cache', price: 92, kind: '', copies: 0, shards: 10, dust: 8, essence: 1, accent: '#d4b4ff', blurb: 'Forge-focused bundle for rebuilding exact card duplicates through the new shard+dust forge path.' },
  { key: 'memory_imprint', row: 'new', name: 'Memory Imprint', price: 118, kind: 'passive', copies: 0, shards: 12, dust: 5, essence: 2, accent: '#8df0ff', blurb: 'Heavy shard packet for biome-bound doctrine growth, especially good before forging or star evolution.' },
  { key: 'mastery_lecture', row: 'new', name: 'Biome Chronicle', price: 135, kind: '', copies: 0, shards: 4, dust: 4, essence: 2, masteryXp: 42, accent: '#c7ff9d', blurb: 'Directly trains the active hero biome. Good when you want the hero itself to grow stronger, not just its cards.' },
  { key: 'resonance_crate', row: 'new', name: 'Resonance Crate', price: 165, kind: '', copies: 1, shards: 6, dust: 4, essence: 2, masteryXp: 20, accent: '#ffe08c', blurb: 'Best all-round hero card offer: copy, shards, dust, essence and a little biome mastery for the active hero.' },
];

function getHeroRaceWallet(prog, race) {
  ensureAccountProgression(prog);
  const key = normalizeHeroRaceKey(race || 'mecha');
  const dust = Math.max(0, prog?.accountProfile?.sharedResources?.raceDust?.[key] | 0);
  const essence = Math.max(0, prog?.essences?.[key] | 0);
  return { dust, essence };
}

function addRaceDust(prog, race, amount = 0) {
  ensureAccountProgression(prog);
  const key = normalizeHeroRaceKey(race || 'mecha');
  const add = Math.max(0, Number(amount || 0) | 0);
  if (!add) return 0;
  const dustWallet = prog.accountProfile.sharedResources.raceDust && typeof prog.accountProfile.sharedResources.raceDust === 'object'
    ? prog.accountProfile.sharedResources.raceDust
    : {};
  prog.accountProfile.sharedResources.raceDust = { mecha: 0, electric: 0, fire: 0, ice: 0, dark: 0, light: 0, ...dustWallet };
  prog.accountProfile.sharedResources.raceDust[key] = Math.max(0, Number(prog.accountProfile.sharedResources.raceDust[key] || 0) | 0) + add;
  return prog.accountProfile.sharedResources.raceDust[key] | 0;
}

function buildCardOfferLines(prog, offer, raceKey) {
  const defs = listCardDefsForRace(raceKey, { kind: offer?.kind || '', includeStarter: true, includePassive: true, includeSkill: true }).slice(0, 3).map((def) => def?.name).filter(Boolean);
  return [
    offer.blurb,
    `Target biome: ${(ESSENCE_META[raceKey] || ESSENCE_META.mecha).label}. Example pool: ${defs.join(' • ') || 'same-biome cards'}.`,
    `Bundle: ${offer.copies ? `+${offer.copies} copy` : 'no direct copy'}${offer.shards ? ` • +${offer.shards} shards` : ''}${offer.dust ? ` • +${offer.dust} dust` : ''}${offer.essence ? ` • +${offer.essence} essence` : ''}${offer.masteryXp ? ` • +${offer.masteryXp} mastery XP` : ''}`,
  ];
}

function buyCardOffer(state, deps, offer) {
  const prog = state?.progression;
  if (!prog || !offer) return;
  ensureHubProgression(prog);
  ensureAccountProgression(prog);
  if ((prog.coins | 0) < (offer.price | 0)) {
    deps.setShopMsg('Not enough Gold.');
    return;
  }
  const activeHero = getActiveHero(prog);
  const raceKey = normalizeHeroRaceKey(activeHero?.race || prog?.selectedStarterLoadout || 'mecha');
  prog.coins = Math.max(0, (prog.coins | 0) - (offer.price | 0));
  const payload = buildCardRewardPayloadForRace(raceKey, Math.random, { kind: offer.kind || '', copies: offer.copies, shards: offer.shards, includeStarter: true, includePassive: true, includeSkill: true });
  const applied = applyCardRewardPayload(prog, payload || {});
  if (offer.dust) addRaceDust(prog, raceKey, offer.dust);
  if (offer.essence) addEssence(prog, raceKey, offer.essence);
  const masteryResult = offer.masteryXp ? grantHeroBiomeMasteryXp(prog, activeHero, offer.masteryXp) : null;
  const lines = [];
  if (applied?.lines?.length) lines.push(...applied.lines);
  if (offer.dust) lines.push(`+${offer.dust} ${(ESSENCE_META[raceKey] || ESSENCE_META.mecha).short} Dust`);
  if (offer.essence) lines.push(`+${offer.essence} ${(ESSENCE_META[raceKey] || ESSENCE_META.mecha).short} Essence`);
  if (offer.masteryXp) lines.push(`+${offer.masteryXp} ${(ESSENCE_META[raceKey] || ESSENCE_META.mecha).short} Mastery XP`);
  if ((masteryResult?.levelUps | 0) > 0) lines.push(`Mastery Lv ${masteryResult?.mastery?.level || 1}`);
  deps.persistHubState(state, `${offer.name}: ${lines.join(' • ') || 'No loot.'}`);
  resetMerchantRenderKey();
  renderMerchantShop(state, deps);
}
