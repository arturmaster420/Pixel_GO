import { BIOME_ESSENCE_KEYS, ESSENCE_META, addEssence, ensureHubProgression } from '../../core/hubBuild.js';

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
  const { el, make, setShopMsg, persistHubState, renderWalletBar } = deps;
  const prog = state?.progression;
  if (!prog) return;
  ensureHubProgression(prog);

  if (el.shopCoins) el.shopCoins.textContent = String(Math.max(0, prog.coins | 0));
  renderWalletBar(el.shopWallet, prog, { compact: true, hideCoins: true });
  if (el.shopFlowInfo) {
    el.shopFlowInfo.textContent = 'Spend Gold on crystal chests. Every chest rolls random biome essences and banks them instantly into your progression wallet.';
  }
  if (el.shopRerollBtn) el.shopRerollBtn.style.display = 'none';
  if (el.shopRerollCost) el.shopRerollCost.textContent = '—';

  const activeLabel = el.shopGridActive?.previousSibling;
  const passiveLabel = el.shopGridPassive?.previousSibling;
  const newLabel = el.shopGridNew?.previousSibling;
  if (activeLabel) activeLabel.textContent = 'Crystal Chests';
  if (passiveLabel) passiveLabel.style.display = 'none';
  if (newLabel) newLabel.style.display = 'none';
  if (el.shopGridPassive) { el.shopGridPassive.style.display = 'none'; el.shopGridPassive.innerHTML = ''; }
  if (el.shopGridNew) { el.shopGridNew.style.display = 'none'; el.shopGridNew.innerHTML = ''; }
  if (el.shopGridActive) el.shopGridActive.style.display = '';

  const key = JSON.stringify({ coins: prog.coins | 0, essences: prog.essences || {} });
  if (key === shopRenderKey) return;
  shopRenderKey = key;

  if (!el.shopGridActive) return;
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
