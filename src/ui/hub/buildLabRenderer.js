import { STARTER_LOADOUTS, getCoreIdentity, getPassiveRouteMeta, getSkillRouteMeta } from "../../core/starterLoadouts.js";
import { ensureAccountProgression, getActiveHero, getHeroBiomeMasterySummary, getHeroCombatProfile, getHeroLoadoutSummary, normalizeHeroRaceKey } from "../../core/accountProfile.js";
import { getHeroBiomeMeta } from "../../core/heroBiomes.js";
import { describeHeroBiomeRewardFlow } from "../../core/heroBiomeProgression.js";
import { fillHeroLoadoutSlots, getHeroLoadoutEntries, optimizeHeroLoadout } from "../../core/cards/cardLoadout.js";
import { listOwnedCardEntries } from "../../core/cards/cardDefs.js";
import { getCardUpgradePreview, levelUpCardOnce } from "../../core/cards/cardUpgrade.js";
import { getCardEvolutionPreview, evolveCardStarsOnce } from "../../core/cards/cardEvolution.js";
import { getTotalCardShardCount } from "../../core/cards/cardRewards.js";
import { RUN_PASSIVES, RUN_SKILLS } from "../../core/runUpgrades.js";
import { getCanonicalHeroRuntimeProfile } from "../../core/skillRuntimeState.js";
import { BIOME_ESSENCE_KEYS, ESSENCE_EXCHANGE_RATE, ESSENCE_META, HUB_GEAR_DEFS, HUB_MATERIAL_KEYS, HUB_MODULE_SLOTS, MATERIAL_META, RACE_DUST_EXCHANGE_RATE, canCraftHubGear, canEquipHubGear, canExchangeEssence, canExchangeRaceDust, craftHubGear, ensureHubProgression, equipHubGear, getBiomeLootProfile, getEquippedHubGearKeys, getGearPartCount, getGearPrimaryBiomeKey, getGearSourceBiomes, getHubBuildAvailableSp, getHubBuildSpentPoints, getHubCoreKey, getHubGearDef, getHubGearDefsBySlot, getHubGearMaterialCosts, getHubGearPartCost, getHubGearSlotUsage, getMaterialCount, getOwnedPassiveCap, getOwnedSkillCap, getRaceDustCount, HUB_BUILD_EXTRA_SKILL_SLOTS, isHubGearEquipped, isHubGearOwned, unequipHubGear } from "../../core/hubBuild.js";
import { ensureShopMeta, ensureShopOffers, rerollShopOffers, replaceOfferSlot, getItemById, getMetaLevel, setMetaLevel, getPriceFor, getMaxMetaLevel } from "../../meta/shopMeta.js";
import { BUILD_BRANCH_META, getBuildFocus, normalizeBuildFocus, setSectionVisibility } from "./hubUiState.js";
import { formatCorePassiveBonuses, getCorePassiveAffinity, getCoreSkillAffinity, getFrameAccent, getPassiveBiomeKey, getSkillBiomeKey, renderGearIcon, renderSkillIcon, renderWalletBar } from "./hubViewShared.js";

let el = {};
let make = null;
let persistHubState = null;
let setShopMsg = null;
let _shopRerollLocal = 0;
let openCharacterMenu = null;

export function configureBuildLabRenderer(deps = {}) {
  if (deps.el && typeof deps.el === 'object') el = deps.el;
  if (typeof deps.make === 'function') make = deps.make;
  if (typeof deps.persistHubState === 'function') persistHubState = deps.persistHubState;
  if (typeof deps.setShopMsg === 'function') setShopMsg = deps.setShopMsg;
  if (typeof deps.openCharacterMenu === 'function') openCharacterMenu = deps.openCharacterMenu;
}

export function resetBuildLabLocalState() {
  _shopRerollLocal = 0;
  renderBuildLab._key = '';
}

function renderAdjustCard(title, subText, level, maxLevel, onDec, onInc, opts = {}) {
  const accent = String(opts.accent || '#9fd6ff');
  const card = make("div", { className: "shopCard", style: { padding: "12px", border: `1px solid ${accent}55`, boxShadow: `0 0 0 1px ${accent}22 inset` } });
  const topRow = make("div", { style: { display: 'flex', gap: '10px', alignItems: 'center' } });
  if (opts.iconNode) topRow.appendChild(opts.iconNode);
  const titleWrap = make('div', { style: { flex: '1 1 auto' } });
  titleWrap.appendChild(make("div", { className: "top" }, [
    make("div", { className: "name", text: title }),
    make("div", { className: "lvl", text: `Lv ${Math.max(0, level | 0)}/${Math.max(0, maxLevel | 0)}` }),
  ]));
  topRow.appendChild(titleWrap);
  card.appendChild(topRow);
  card.appendChild(make("div", { className: "muted", text: subText, style: { marginTop: "8px", fontSize: "12px", lineHeight: "1.35" } }));
  const actions = make("div", { className: "buyRow", style: { marginTop: "10px", alignItems: "center" } });
  const decBtn = make("button", { type: "button", className: "btn", text: "-1", style: { minWidth: "58px" } });
  const incBtn = make("button", { type: "button", className: "btn", text: "+1", style: { minWidth: "58px" } });
  decBtn.disabled = !(level > 0);
  incBtn.disabled = !(level < maxLevel);
  decBtn.addEventListener("click", onDec);
  incBtn.addEventListener("click", onInc);
  actions.appendChild(decBtn);
  actions.appendChild(make("div", { className: "price", text: `Allocated: ${Math.max(0, level | 0)}` }));
  actions.appendChild(incBtn);
  card.appendChild(actions);
  return card;
}

function renderRuntimeMirrorCard(title, subText, level, maxLevel, opts = {}) {
  const accent = String(opts.accent || '#9fd6ff');
  const card = make("div", { className: "shopCard", style: { padding: "12px", border: `1px solid ${accent}55`, boxShadow: `0 0 0 1px ${accent}22 inset` } });
  const topRow = make("div", { style: { display: 'flex', gap: '10px', alignItems: 'center' } });
  if (opts.iconNode) topRow.appendChild(opts.iconNode);
  const titleWrap = make('div', { style: { flex: '1 1 auto' } });
  titleWrap.appendChild(make("div", { className: "top" }, [
    make("div", { className: "name", text: title }),
    make("div", { className: "lvl", text: `Tier ${Math.max(0, level | 0)}/${Math.max(0, maxLevel | 0)}` }),
  ]));
  topRow.appendChild(titleWrap);
  card.appendChild(topRow);
  card.appendChild(make("div", { className: "muted", text: subText, style: { marginTop: "8px", fontSize: "12px", lineHeight: "1.35" } }));
  const note = String(opts.note || 'Runtime mirror only. Manage cards, upgrades and replacement in Hero Menu → Cards.');
  card.appendChild(make('div', { className: 'muted', text: note, style: { marginTop: '8px', fontSize: '11px', lineHeight: '1.35', color: 'rgba(214,232,255,0.76)' } }));
  const actions = make("div", { className: "buyRow", style: { marginTop: "10px", alignItems: "center", gap: '8px' } });
  actions.appendChild(make("div", { className: "price", text: level > 0 ? `Active in runtime` : 'Not equipped on this hero' }));
  const manageBtn = make("button", { type: "button", className: "btn", text: String(opts.buttonText || 'Open Cards'), style: { minWidth: "112px" } });
  manageBtn.addEventListener('click', () => {
    if (typeof openCharacterMenu === 'function') openCharacterMenu(opts.state || null, 'skills');
  });
  actions.appendChild(manageBtn);
  card.appendChild(actions);
  return card;
}

function renderEssenceCard(key, value) {
  const meta = ESSENCE_META[key] || ESSENCE_META.mecha;
  return make("div", {
    className: "shopCard",
    style: {
      padding: "12px",
      border: `1px solid ${meta.accent}55`,
      boxShadow: `0 0 0 1px ${meta.accent}22 inset`,
    },
  }, [
    make("div", { className: "top" }, [
      make("div", { className: "name", text: meta.label }),
      make("div", { className: "lvl", text: `${Math.max(0, value | 0)}` }),
    ]),
    make("div", { className: "muted", text: `${meta.short} biome resource. Used for exchange, gear crafting and biome route progression.`, style: { marginTop: "8px", fontSize: "12px", lineHeight: "1.35" } }),
  ]);
}

function renderMaterialCard(key, value) {
  const meta = MATERIAL_META[key] || MATERIAL_META.salvage;
  return make("div", {
    className: "shopCard",
    style: {
      padding: "12px",
      border: `1px solid ${meta.accent}55`,
      boxShadow: `0 0 0 1px ${meta.accent}22 inset`,
    },
  }, [
    make("div", { className: "top" }, [
      make("div", { className: "name", text: meta.label }),
      make("div", { className: "lvl", text: `${Math.max(0, value | 0)}` }),
    ]),
    make("div", { className: "muted", text: `${meta.short} forge material from expedition rooms and bosses. Used together with essences and gear parts.`, style: { marginTop: "8px", fontSize: "12px", lineHeight: "1.35" } }),
  ]);
}

function renderBiomeRouteCard(biomeKey) {
  const essenceMeta = ESSENCE_META[biomeKey] || ESSENCE_META.mecha;
  const profile = getBiomeLootProfile(biomeKey);
  const preferredNames = (profile?.preferredGearKeys || [])
    .map((gearKey) => getHubGearDef(gearKey))
    .filter(Boolean)
    .map((def) => def.short || def.name)
    .slice(0, 3);
  const mats = [];
  for (const [materialKey, rawAmt] of Object.entries(profile?.bossMaterials || {})) {
    const amt = Math.max(0, Number(rawAmt || 0) | 0);
    if (amt <= 0) continue;
    const meta = MATERIAL_META[materialKey] || MATERIAL_META.salvage;
    mats.push(`${meta.short} x${amt}`);
  }
  return make("div", {
    className: "shopCard",
    style: {
      padding: "12px",
      border: `1px solid ${essenceMeta.accent}55`,
      boxShadow: `0 0 0 1px ${essenceMeta.accent}22 inset`,
    },
  }, [
    make("div", { className: "top" }, [
      make("div", { className: "name", text: `${profile?.label || essenceMeta.short} Route` }),
      make("div", { className: "lvl", text: `${Math.round(Number(profile?.bossItemChance || 0) * 100)}% boss drop` }),
    ]),
    make("div", { className: "muted", text: `Boss favor: ${preferredNames.join(" • ") || "General forge loot"}.`, style: { marginTop: "8px", fontSize: "12px", lineHeight: "1.35" } }),
    make("div", { className: "muted", text: `Boss materials: ${mats.join(" • ") || "Salvage"}. Parts lean ${Math.round(Number(profile?.roomPartChance || 0) * 100)}% toward this route in normal rooms.`, style: { marginTop: "6px", fontSize: "11px", lineHeight: "1.35" } }),
  ]);
}

function formatCardEntryShort(entry) {
  if (!entry) return '—';
  return `${String(entry.name || entry.cardId || 'Card')} • ${String(entry.starsText || '★')} • Lv ${Math.max(1, entry.level | 0)} • Copies ${Math.max(0, entry.copiesOwned | 0)}`;
}

function renderDoctrineCard(entry, opts = {}) {
  const accent = getFrameAccent(entry?.race || 'mecha');
  const card = make('div', { className: 'shopCard', style: { padding: '12px', border: `1px solid ${accent}55`, boxShadow: `0 0 0 1px ${accent}22 inset` } });
  const top = make('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } });
  const iconNode = entry?.kind === 'passive'
    ? make('div', { text: '⬢', style: { width: '28px', height: '28px', display: 'grid', placeItems: 'center', borderRadius: '10px', color: accent, border: `1px solid ${accent}88`, background: `${accent}1c`, fontSize: '15px', fontWeight: '700' } })
    : renderSkillIcon(entry?.sourceKey || entry?.skillId || entry?.cardId, 28);
  top.appendChild(iconNode);
  const titleWrap = make('div', { style: { flex: '1 1 auto' } });
  titleWrap.appendChild(make('div', { className: 'name', text: String(entry?.name || entry?.cardId || 'Card'), style: { color: '#f4fbff' } }));
  titleWrap.appendChild(make('div', { className: 'muted', text: `${String((entry?.race || 'mecha')).toUpperCase()} • ${String(entry?.starsText || '★')} • Lv ${Math.max(1, entry?.level | 0)}`, style: { marginTop: '4px', fontSize: '12px', lineHeight: '1.35', opacity: '1' } }));
  top.appendChild(titleWrap);
  top.appendChild(make('div', { className: 'lvl', text: opts.slotText || (entry?.kind === 'passive' ? 'PASSIVE' : 'SKILL') }));
  card.appendChild(top);
  card.appendChild(make('div', { className: 'muted', text: String(entry?.summary || 'Card-driven hero doctrine.'), style: { marginTop: '8px', fontSize: '12px', lineHeight: '1.4', opacity: '1' } }));
  card.appendChild(make('div', { className: 'muted', text: `Copies owned ${Math.max(0, entry?.copiesOwned | 0)} • Route ${Array.isArray(entry?.routeTags) && entry.routeTags.length ? entry.routeTags.join(' • ') : 'general'} • Manage equip/upgrade/evolve at Hero Menu → Cards.`, style: { marginTop: '6px', fontSize: '11px', lineHeight: '1.35', color: 'rgba(216,234,255,0.78)', opacity: '1' } }));
  return card;
}


function renderSimpleInfoCard(title, lines = [], opts = {}) {
  const accent = String(opts.accent || 'rgba(159,214,255,0.28)');
  const background = String(opts.background || 'rgba(255,255,255,0.04)');
  const card = make('div', { className: 'shopCard', style: { padding: '12px', border: `1px solid ${accent}`, boxShadow: `0 0 0 1px ${accent.replace('0.28', '0.12')} inset`, background } });
  card.appendChild(make('div', { className: 'name', text: title, style: { color: '#f6fbff' } }));
  for (const line of Array.isArray(lines) ? lines : []) {
    if (!line) continue;
    card.appendChild(make('div', { className: 'muted', text: String(line), style: { marginTop: '7px', fontSize: '12px', lineHeight: '1.42', color: 'rgba(232,245,255,0.9)', opacity: '1' } }));
  }
  return card;
}

const BIOME_EMOJI = {
  ice: '❄️',
  fire: '🔥',
  electric: '⚡',
  dark: '🌑',
  light: '☀️',
  mecha: '🛠️',
};

function getSkillMasterSelectedCardId(state, entries) {
  const list = Array.isArray(entries) ? entries : [];
  const wanted = String(state?._skillMasterSelectedCardId || '').trim();
  if (wanted && list.some((entry) => entry?.cardId === wanted)) return wanted;
  return String(list[0]?.cardId || '').trim();
}

function renderSkillMasterOwnedCard(entry, selected, onClick) {
  const accent = getFrameAccent(entry?.race || 'mecha');
  const emoji = BIOME_EMOJI[String(entry?.race || 'mecha').trim().toLowerCase()] || BIOME_EMOJI.mecha;
  const card = make('button', {
    type: 'button',
    className: 'shopCard',
    style: {
      width: '100%',
      textAlign: 'left',
      padding: '12px',
      border: `1px solid ${selected ? accent : `${accent}55`}`,
      boxShadow: selected ? `0 0 0 1px ${accent} inset, 0 0 20px ${accent}44` : `0 0 0 1px ${accent}22 inset`,
      background: selected ? `linear-gradient(180deg, ${accent}24, rgba(10,15,22,0.98))` : 'linear-gradient(180deg, rgba(20,24,34,0.98), rgba(10,14,22,0.98))',
      cursor: 'pointer',
      borderRadius: '14px',
      color: '#f3fbff',
    },
  });
  if (typeof onClick === 'function') card.addEventListener('click', onClick);
  const top = make('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } });
  top.appendChild(renderSkillIcon(entry?.sourceKey || entry?.skillId || entry?.cardId, 30));
  const title = make('div', { style: { flex: '1 1 auto' } });
  title.appendChild(make('div', { className: 'name', text: String(entry?.name || entry?.cardId || 'Skill Card'), style: { color: '#f6fbff' } }));
  title.appendChild(make('div', { className: 'muted', text: `${emoji} ${String(entry?.starsText || '★')} • Lv ${Math.max(1, entry?.level | 0)}`, style: { marginTop: '4px', fontSize: '12px', lineHeight: '1.35', opacity: '1' } }));
  top.appendChild(title);
  if (entry?.isEquipped) top.appendChild(make('div', { className: 'lvl', text: 'EQUIPPED' }));
  card.appendChild(top);
  card.appendChild(make('div', { className: 'muted', text: `Copies ${Math.max(0, entry?.copiesOwned | 0)} • ${String((ESSENCE_META[entry?.race] || ESSENCE_META.mecha).label)} linked`, style: { marginTop: '8px', fontSize: '11px', lineHeight: '1.35', color: 'rgba(216,234,255,0.82)', opacity: '1' } }));
  return card;
}

function renderSkillMasterSummaryCard(prog, activeHero, selectedEntry, ownedSkills) {
  const heroName = String(activeHero?.name || 'Hero');
  const heroRace = normalizeHeroRaceKey(activeHero?.race || prog?.selectedStarterLoadout || 'mecha');
  const biomeMeta = ESSENCE_META[selectedEntry?.race] || ESSENCE_META.mecha;
  const equippedCount = (Array.isArray(activeHero?.equippedSkillCards) ? activeHero.equippedSkillCards : []).length;
  const lines = [
    `${heroName} • ${heroRace.toUpperCase()} • owned skill cards ${Math.max(0, ownedSkills.length)}`,
    `Equipped skill cards ${Math.max(0, equippedCount)} • Gold ${Math.max(0, prog?.coins | 0)} • 💎 ${Math.max(0, prog?.diamonds | 0)}`,
  ];
  if (selectedEntry) lines.push(`Selected: ${selectedEntry.name} • ${selectedEntry.starsText} • Lv ${Math.max(1, selectedEntry.level | 0)} • ${biomeMeta.label} ${Math.max(0, prog?.essences?.[selectedEntry.race] | 0)}`);
  else lines.push('No owned skill cards yet. Get card copies first, then return to Skill Master.');
  return renderSimpleInfoCard('Skill Master', lines, { accent: 'rgba(128,215,255,0.34)', background: 'rgba(128,215,255,0.08)' });
}

function renderSkillMasterDetail(state, prog, entry) {
  const wrap = make('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' } });
  if (!entry) {
    wrap.appendChild(renderSimpleInfoCard('No skill card selected', [
      'This station only works with owned active skill cards.',
      'Collect a skill card copy, then select it here to level and evolve it.',
    ], { accent: 'rgba(159,214,255,0.28)', background: 'rgba(159,214,255,0.06)' }));
    return wrap;
  }
  const accent = getFrameAccent(entry?.race || 'mecha');
  const biomeMeta = ESSENCE_META[entry?.race] || ESSENCE_META.mecha;
  const upgrade = getCardUpgradePreview(prog, entry.cardId);
  const evolution = getCardEvolutionPreview(prog, entry.cardId);
  const summary = renderSimpleInfoCard(entry.name, [
    `${String(entry.starsText || '★')} • Level ${Math.max(1, entry.level | 0)} • Copies ${Math.max(0, entry.copiesOwned | 0)}`,
    `${biomeMeta.label} wallet: ${Math.max(0, prog?.essences?.[entry.race] | 0)} • Route ${Array.isArray(entry?.routeTags) && entry.routeTags.length ? entry.routeTags.join(' • ') : 'general'}`,
    String(entry?.summary || 'Skill card used by the active hero loadout.'),
    entry?.isEquipped ? 'Currently equipped on the active hero.' : 'Stored in collection. Equip it from Hero Menu → Skills when needed.',
  ], { accent: `${accent}66`, background: `${accent}10` });
  wrap.appendChild(summary);

  const levelCard = renderSimpleInfoCard('Level Up', [
    `Current → Next: Lv ${Math.max(1, upgrade?.target?.level | 0)} → Lv ${Math.max(1, upgrade?.nextLevel | 0)}`,
    `Cost: ${Math.max(0, upgrade?.cost?.gold | 0)} Gold • ${Math.max(0, upgrade?.cost?.essence | 0)} ${biomeMeta.short} Essence`,
    `Wallet: ${Math.max(0, upgrade?.availableGold | 0)} Gold • ${Math.max(0, upgrade?.availableEssence | 0)} ${biomeMeta.short} Essence`,
    upgrade?.canUpgrade ? 'Ready: level up consumes only Gold + matching biome Essence.' : `Blocked: ${String(upgrade?.reason || 'requirements not met')}`,
  ], { accent: 'rgba(255,214,122,0.34)', background: 'rgba(255,214,122,0.08)' });
  const levelRow = make('div', { className: 'row', style: { gap: '8px', marginTop: '10px', flexWrap: 'wrap' } });
  const levelBtn = make('button', { className: 'btn', type: 'button', text: upgrade?.canUpgrade ? 'Level Up +1' : 'Level Up Blocked', style: { padding: '8px 10px', opacity: upgrade?.canUpgrade ? '1' : '0.6' } });
  levelBtn.disabled = !upgrade?.canUpgrade;
  levelBtn.addEventListener('click', () => {
    const result = levelUpCardOnce(prog, entry.cardId);
    if (result?.ok) persistHubState(state, result.message || `${entry.name} upgraded.`);
    else setShopMsg(result?.message || 'Level up blocked.');
    renderBuildLab(state, true);
  });
  levelRow.appendChild(levelBtn);
  levelCard.appendChild(levelRow);
  wrap.appendChild(levelCard);

  const evolveCard = renderSimpleInfoCard('Evolve', [
    `Current → Next: ${'★'.repeat(Math.max(1, evolution?.currentStars | 0))} → ${'★'.repeat(Math.max(1, evolution?.nextStars | 0))}`,
    `Recipe: ${Math.max(0, evolution?.cost?.essence | 0)} ${biomeMeta.short} Essence • ${Math.max(0, evolution?.cost?.duplicates | 0)} exact copies of this same ${'★'.repeat(Math.max(1, evolution?.currentStars | 0))} card`,
    `Wallet: ${Math.max(0, evolution?.availableEssence | 0)} ${biomeMeta.short} Essence • free exact copies ${Math.max(0, evolution?.availableDuplicates | 0)}`,
    evolution?.canEvolve ? 'Ready: evolve consumes Essence + 3 exact copies of the same current star rank.' : `Blocked: ${String(evolution?.reason || 'requirements not met')}`,
  ], { accent: 'rgba(143,216,255,0.34)', background: 'rgba(143,216,255,0.08)' });
  const evolveRow = make('div', { className: 'row', style: { gap: '8px', marginTop: '10px', flexWrap: 'wrap' } });
  const evolveBtn = make('button', { className: 'btn', type: 'button', text: evolution?.canEvolve ? 'Evolve +1 Star' : 'Evolution Blocked', style: { padding: '8px 10px', opacity: evolution?.canEvolve ? '1' : '0.6' } });
  evolveBtn.disabled = !evolution?.canEvolve;
  evolveBtn.addEventListener('click', () => {
    const result = evolveCardStarsOnce(prog, entry.cardId);
    if (result?.ok) persistHubState(state, result.message || `${entry.name} evolved.`);
    else setShopMsg(result?.message || 'Evolution blocked.');
    renderBuildLab(state, true);
  });
  evolveRow.appendChild(evolveBtn);
  evolveCard.appendChild(evolveRow);
  wrap.appendChild(evolveCard);
  return wrap;
}

function renderBuildCardSummaryBlock(state, prog) {
  const activeHero = getActiveHero(prog);
  const loadout = getHeroLoadoutEntries(prog, activeHero);
  const raceKey = normalizeHeroRaceKey(activeHero?.race || prog?.selectedStarterLoadout || 'mecha');
  const accent = getFrameAccent(raceKey);
  const wrap = make('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' } });
  const combatProfile = getHeroCombatProfile(prog, activeHero);
  const loadoutSummary = getHeroLoadoutSummary(prog, activeHero);
  const totalDust = Object.values(prog?.accountProfile?.sharedResources?.raceDust || {}).reduce((sum, value) => sum + Math.max(0, Number(value || 0) || 0), 0);
  const raceDust = Math.max(0, prog?.accountProfile?.sharedResources?.raceDust?.[raceKey] | 0);
  const totalShards = getTotalCardShardCount(prog?.accountProfile?.cardCollection);
  const skillCount = loadout?.skillCards?.length || 0;
  const passiveCount = loadout?.passiveCards?.length || 0;
  wrap.appendChild(renderSimpleInfoCard('Active Hero', [
    `${String(activeHero?.name || 'Hero')} • ${raceKey.toUpperCase()}`,
    `Card Power ${Math.max(0, Number(loadoutSummary?.totalCardPower || combatProfile?.summary?.totalCardPower || 0) | 0)} • Same-race cards ${Math.max(0, Number(loadoutSummary?.sameRaceCards || combatProfile?.summary?.sameRaceCards || 0) | 0)}`,
    `Loadout ${skillCount}/6 skills • ${passiveCount}/6 passives`,
  ], { accent: `${accent}55`, background: `${accent}10` }));
  wrap.appendChild(renderSimpleInfoCard('Card Economy', [
    `${(ESSENCE_META[raceKey] || ESSENCE_META.mecha).short} Essence ${Math.max(0, prog?.essences?.[raceKey] | 0)} • ${raceKey.toUpperCase()} Dust ${raceDust}`,
    `Total Dust ${Math.max(0, totalDust | 0)} • Total Shards ${Math.max(0, totalShards | 0)}`,
    'Merchant now sells same-biome card caches and resonance crates for the active hero.',
  ], { accent: 'rgba(255,208,138,0.35)', background: 'rgba(255,208,138,0.08)' }));
  const biomeMeta = getHeroBiomeMeta(raceKey);
  const rewardFlow = describeHeroBiomeRewardFlow(raceKey);
  const masterySummary = getHeroBiomeMasterySummary(prog, activeHero);
  const resonanceCard = renderSimpleInfoCard('Fixed Hero Biome', [
    `${biomeMeta.label} is chosen once at hero creation and stays fixed for this hero.`,
    `Biome mastery: Lv ${Math.max(1, masterySummary?.mastery?.level | 0 || 1)} • XP ${Math.max(0, masterySummary?.mastery?.xp | 0)}`,
    `Strengths: ${(biomeMeta.strengths || []).join(' • ') || '—'}`,
    `Weaknesses: ${(biomeMeta.weaknesses || []).join(' • ') || '—'}`,
    `Mastery bonuses: ${(masterySummary?.bonuses?.summaryLines || []).join(' • ') || 'No mastery bonuses yet.'}`,
    ...rewardFlow,
  ], { accent: `${accent}55`, background: `${accent}10` });
  wrap.appendChild(resonanceCard);

  const actionCard = renderSimpleInfoCard('Card Workflow', [
    'Cards are now the real source of truth for the active hero. This wing is locked to mirror mode so old SP allocation widgets can no longer overwrite the hero loadout.',
    'Open Hero Menu → Cards to equip, upgrade, evolve and dismantle. Return here to inspect how the current hero doctrine is projected into battle.',
  ], { accent: 'rgba(159,214,255,0.35)', background: 'rgba(159,214,255,0.08)' });
  const actionRow = make('div', { className: 'row', style: { gap: '8px', marginTop: '10px', flexWrap: 'wrap' } });
  const optimizeBtn = make('button', { className: 'btn', type: 'button', text: 'Optimize Hero Loadout', style: { padding: '8px 10px' } });
  optimizeBtn.addEventListener('click', () => {
    const result = optimizeHeroLoadout(prog, activeHero, { preferRace: true });
    if (result?.ok) persistHubState(state, result.message || 'Hero loadout optimized.');
    else setShopMsg(result?.message || 'Optimization blocked.');
    renderBuildLab(state, true);
  });
  actionRow.appendChild(optimizeBtn);
  const fillBtn = make('button', { className: 'btn', type: 'button', text: 'Fill Empty Slots', style: { padding: '8px 10px' } });
  fillBtn.addEventListener('click', () => {
    const result = fillHeroLoadoutSlots(prog, activeHero, { preferRace: true });
    if (result?.ok) persistHubState(state, result.message || 'Empty slots filled.');
    else setShopMsg(result?.message || 'Fill blocked.');
    renderBuildLab(state, true);
  });
  actionRow.appendChild(fillBtn);
  const openBtn = make('button', { className: 'btn', type: 'button', text: 'Open Hero Menu • Cards', style: { padding: '8px 10px' } });
  openBtn.addEventListener('click', () => {
    if (typeof openCharacterMenu === 'function') openCharacterMenu(state, 'cards');
  });
  actionRow.appendChild(openBtn);
  actionCard.appendChild(actionRow);
  wrap.appendChild(actionCard);
  return { activeHero, loadout, wrap };
}

export function gearCostText(def) {
  const parts = [`${Math.max(0, def?.costCoins | 0)} Gold`];
  const materialCosts = getHubGearMaterialCosts(def);
  for (const [key, rawAmt] of Object.entries(materialCosts)) {
    const amt = Math.max(0, Number(rawAmt || 0) | 0);
    if (amt <= 0) continue;
    const meta = MATERIAL_META[key] || MATERIAL_META.salvage;
    parts.push(`${amt} ${meta.short}`);
  }
  const essenceCosts = def?.costEssences && typeof def.costEssences === "object" ? def.costEssences : {};
  for (const [key, rawAmt] of Object.entries(essenceCosts)) {
    const amt = Math.max(0, Number(rawAmt || 0) | 0);
    if (amt <= 0) continue;
    const meta = ESSENCE_META[key] || ESSENCE_META.mecha;
    parts.push(`${amt} ${meta.short}`);
  }
  const partCost = getHubGearPartCost(def);
  if (partCost > 0) parts.push(`${partCost} Parts`);
  return parts.join(" • ");
}

function renderGearCard(state, prog, def) {
  const owned = isHubGearOwned(prog, def.key);
  const equipped = isHubGearEquipped(prog, def.key);
  const canCraft = canCraftHubGear(prog, def.key);
  const canEquip = canEquipHubGear(prog, def.key);
  const usage = getHubGearSlotUsage(prog);
  const partCost = getHubGearPartCost(def);
  const partOwned = getGearPartCount(prog, def.key);
  const slotInfo = def.slot === "module"
    ? `Module slot • ${usage.module}/${HUB_MODULE_SLOTS} used`
    : (def.slot === "relic" ? `Relic slot • ${usage.relic ? "occupied" : "empty"}` : `Core Item slot • ${usage.coreItem ? "occupied" : "empty"}`);
  const titleMeta = def.slot === "module" ? "Module" : (def.slot === "relic" ? "Relic" : "Core Item");
  const sourceBiomes = getGearSourceBiomes(def).map((key) => (ESSENCE_META[key] || ESSENCE_META.mecha).short);
  const primaryBiome = getGearPrimaryBiomeKey(def);
  const accent = getFrameAccent(primaryBiome);
  const card = make("div", { className: "shopCard", style: { padding: "12px", border: `1px solid ${accent}55`, boxShadow: `0 0 0 1px ${accent}22 inset` } });
  const heroRow = make("div", { style: { display: "flex", gap: "10px", alignItems: "center" } });
  heroRow.appendChild(renderGearIcon(def, 34));
  const titleWrap = make("div", { style: { flex: "1 1 auto" } });
  titleWrap.appendChild(make("div", { className: "top" }, [
    make("div", { className: "name", text: `${def.name}` }),
    make("div", { className: "lvl", text: equipped ? "EQUIPPED" : (owned ? "OWNED" : titleMeta.toUpperCase()) }),
  ]));
  heroRow.appendChild(titleWrap);
  card.appendChild(heroRow);
  card.appendChild(make("div", { className: "muted", text: `${def.style.toUpperCase()} • ${slotInfo}`, style: { marginTop: "8px", fontSize: "11px", lineHeight: "1.35", letterSpacing: "0.04em", color: "rgba(186,228,255,0.9)", opacity: "1" } }));
  if (sourceBiomes.length) card.appendChild(make("div", { className: "muted", text: `Favored drops: ${sourceBiomes.join(" • ")} bosses / rooms.`, style: { marginTop: "6px", fontSize: "11px", lineHeight: "1.35", color: "rgba(255,236,188,0.9)", opacity: "1" } }));
  card.appendChild(make("div", { className: "muted", text: def.desc, style: { marginTop: "8px", fontSize: "12px", lineHeight: "1.4", color: "rgba(240,248,255,0.92)", opacity: "1" } }));
  const effWrap = make("div", { className: "muted", style: { marginTop: "8px", fontSize: "12px", lineHeight: "1.4" } });
  const effects = [];
  const passives = def.effects?.passives && typeof def.effects.passives === "object" ? def.effects.passives : {};
  const damageTypes = def.effects?.damageTypes && typeof def.effects.damageTypes === "object" ? def.effects.damageTypes : {};
  for (const [key, rawAmt] of Object.entries(passives)) effects.push(`+${Math.max(0, rawAmt | 0)} ${key}`);
  for (const [key, rawAmt] of Object.entries(damageTypes)) effects.push(`+${Math.round(Number(rawAmt || 0) * 100)}% ${key} dmg`);
  effWrap.textContent = effects.length ? `Effects: ${effects.join(" • ")}` : "Effects: —";
  card.appendChild(effWrap);
  const partLine = partCost > 0 ? `Parts: ${partOwned}/${partCost}. Bosses can drop the full item outright.` : "";
  card.appendChild(make("div", { className: "price", text: owned ? (equipped ? "Equipped in active hub build." : "Crafted and ready in inventory.") : `Craft Cost: ${gearCostText(def)}`, style: { marginTop: "10px" } }));
  if (!owned && partLine) card.appendChild(make("div", { className: "muted", text: partLine, style: { marginTop: "6px", fontSize: "11px", lineHeight: "1.35" } }));
  const actions = make("div", { className: "buyRow", style: { marginTop: "10px", alignItems: "center", flexWrap: "wrap", gap: "8px" } });
  const btn = make("button", { className: "btn", type: "button", text: equipped ? "Unequip" : (owned ? "Equip" : "Craft"), style: { minWidth: "100px" } });
  btn.disabled = equipped ? false : (owned ? !canEquip : !canCraft);
  btn.addEventListener("click", () => {
    let ok = false;
    let msg = "";
    if (equipped) {
      ok = unequipHubGear(prog, def.key);
      msg = ok ? `${def.name} unequipped.` : "Cannot unequip.";
    } else if (owned) {
      ok = equipHubGear(prog, def.key);
      msg = ok ? `${def.name} equipped.` : (def.slot === "module" ? `Module slots full (${HUB_MODULE_SLOTS}). Unequip one first.` : `Cannot equip ${def.name}.`);
    } else {
      ok = craftHubGear(prog, def.key);
      msg = ok ? `${def.name} crafted.` : `Need ${gearCostText(def)}.`;
      if (ok) equipHubGear(prog, def.key);
    }
    if (!ok) {
      setShopMsg(msg);
      renderBuildLab(state, true);
      return;
    }
    persistHubState(state, msg);
    renderBuildLab(state, true);
  });
  actions.appendChild(btn);
  if (owned && !equipped && def.slot === "module" && !canEquip) {
    actions.appendChild(make("div", { className: "muted", text: `All ${HUB_MODULE_SLOTS} module slots are occupied.`, style: { fontSize: "11px" } }));
  }
  card.appendChild(actions);
  return card;
}


function getBuildOverviewHtml(buildFocus, data) {
  const { coreDef, coreIdentity, equippedSkills, equippedPassives, totalEssence, totalMaterials, totalOwnedGear, gearUsage } = data;
  const corePassiveText = formatCorePassiveBonuses(coreIdentity);
  if (buildFocus === "arsenal") {
    return `
      <div><b>Skill Master role:</b> upgrade and evolve owned active skill cards for the active hero.</div>
      <div><b>Level Up:</b> Gold + matching biome Essence.</div>
      <div><b>Evolve:</b> matching Essence + 3 exact copies of the same current star rank.</div>
      <div><b>Stars:</b> each star now shows the current evolution stage, starting from 1★.</div>
      <div><b>Hero biome:</b> ${String(coreIdentity?.routeLabel || "general expedition")} • <b>Core:</b> ${String(coreDef?.name || data.coreKey)}</div>
    `;
  }
  if (buildFocus === "essence") {
    return `
      <div><b>Total crystal essences:</b> ${totalEssence}</div>
      <div><b>Exchange rule:</b> ${ESSENCE_EXCHANGE_RATE} source crystals → 1 target crystal</div>
      <div><b>What this wing controls:</b> biome crystal treasury, exchange flow and route farming decisions.</div>
      <div><b>Route reminder:</b> Fire / Ice / Electric / Mecha / Dark / Light all feed different preferred forge targets.</div>
    `;
  }
  if (buildFocus === "mastery") {
    return `
      <div><b>Passives mirrored:</b> ${equippedPassives}</div>
      <div><b>Banked SP available:</b> ${data.available}</div>
      <div><b>Legacy SP mirror:</b> ${data.spent}</div>
      <div><b>What this wing controls:</b> passive doctrine readout, sustain, reach, crit and tempo shaping from the active hero cards.</div>
    `;
  }
  if (buildFocus === "forge") {
    return `
      <div><b>Total forge materials:</b> ${totalMaterials}</div>
      <div><b>Owned gear pieces:</b> ${totalOwnedGear}</div>
      <div><b>Module slots:</b> ${gearUsage.module}/${HUB_MODULE_SLOTS}</div>
      <div><b>Relic:</b> ${gearUsage.relic ? "equipped" : "empty"} • <b>Core Item:</b> ${gearUsage.coreItem ? "equipped" : "empty"}</div>
      <div><b>What this wing controls:</b> materials, crafting, gear parts and equipped expedition hardware.</div>
    `;
  }
  return `
    <div><b>Hub progression wings:</b> Skill Master • Essence Conflux • Mastery Archive • Forge Wing</div>
    <div><b>Active hero core:</b> ${String(coreDef?.name || data.coreKey)}</div>
    <div><b>Total crystal essences:</b> ${totalEssence} • <b>Total forge materials:</b> ${totalMaterials}</div>
  `;
}


function renderMetaOfferCard(state, prog, kind, offerId, index, targetContainer) {
  if (!targetContainer) return;
  const it = offerId ? getItemById(offerId) : null;
  const metaLvl = offerId ? getMetaLevel(prog, offerId) : 0;
  const price = offerId ? getPriceFor(offerId, metaLvl) : 0;
  const maxLvl = getMaxMetaLevel();
  const accentKey = it?.kind === 'passive' ? getPassiveBiomeKey(it?.key) : getSkillBiomeKey(it?.key);
  const accent = getFrameAccent(accentKey || 'mecha');
  const routeMeta = it?.kind === 'passive' ? getPassiveRouteMeta(it?.key) : getSkillRouteMeta(it?.key);
  const card = make('div', { className: 'shopCard', style: { padding: '12px', border: `1px solid ${accent}55`, boxShadow: `0 0 0 1px ${accent}22 inset` } });
  const top = make('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } });
  const iconNode = it ? (it.kind === 'passive'
    ? make('div', { text: '⬢', style: { width: '28px', height: '28px', display: 'grid', placeItems: 'center', borderRadius: '10px', color: accent, border: `1px solid ${accent}88`, background: `${accent}1c`, fontSize: '15px', fontWeight: '700' } })
    : renderSkillIcon(it.key, 28)) : null;
  if (iconNode) top.appendChild(iconNode);
  const titleWrap = make('div', { style: { flex: '1 1 auto' } });
  titleWrap.appendChild(make('div', { className: 'name', text: it ? it.name : '—', style: { color: '#f4fbff' } }));
  titleWrap.appendChild(make('div', { className: 'muted', text: it ? `${String((routeMeta?.route || accentKey || 'route')).toUpperCase()} • Lv ${metaLvl}/${maxLvl}` : 'No offer', style: { marginTop: '4px', fontSize: '12px', lineHeight: '1.35', opacity: '1' } }));
  top.appendChild(titleWrap);
  top.appendChild(make('div', { className: 'lvl', text: `Lv ${metaLvl}/${maxLvl}` }));
  card.appendChild(top);
  card.appendChild(make('div', { className: 'muted', text: it ? (it.kind === 'passive' ? `Unlocks and upgrades ${it.name}. Gold raises owned card power; equip it from Hero Menu → Cards to project it into the active hero.` : `Unlocks and upgrades ${it.name}. Gold raises owned card power; equip it from Hero Menu → Cards to project it into the active hero.`) : 'No offer available.', style: { marginTop: '8px', fontSize: '12px', lineHeight: '1.4', opacity: '1' } }));
  const actionRow = make('div', { className: 'buyRow', style: { marginTop: '10px', alignItems: 'center' } });
  actionRow.appendChild(make('div', { className: 'price', text: metaLvl >= maxLvl ? 'MAX' : `${price} Gold` }));
  const btn = make('button', { type: 'button', className: 'btn', text: metaLvl <= 0 ? 'Unlock' : 'Upgrade' });
  const disabled = !it || metaLvl >= maxLvl || (prog.coins | 0) < price;
  btn.disabled = disabled;
  if (metaLvl >= maxLvl) btn.textContent = 'MAX';
  btn.addEventListener('click', () => {
    if (!it) return;
    ensureShopMeta(prog);
    const cur = getMetaLevel(prog, offerId);
    const cost = getPriceFor(offerId, cur);
    if ((prog.coins | 0) < cost) { setShopMsg('Not enough Gold.'); return; }
    if (cur >= maxLvl) return;
    prog.coins = Math.max(0, (prog.coins | 0) - cost);
    setMetaLevel(prog, offerId, cur + 1);
    replaceOfferSlot(prog, kind, index);
    _shopRerollLocal = 0;
    persistHubState(state, `${it.name} upgraded.`);
    renderBuildLab(state, true);
  });
  actionRow.appendChild(btn);
  card.appendChild(actionRow);
  targetContainer.appendChild(card);
}

function renderArsenalGoldUpgrades(state, prog) {
  ensureShopMeta(prog);
  ensureShopOffers(prog);
  if (el.buildGoldCoins) el.buildGoldCoins.textContent = String(Math.max(0, prog.coins | 0));
  const rerollCost = 10 + (_shopRerollLocal | 0) * 5;
  if (el.buildGoldRerollCost) el.buildGoldRerollCost.textContent = String(rerollCost);
  if (el.buildGoldRerollBtn) {
    el.buildGoldRerollBtn.disabled = (prog.coins | 0) < rerollCost;
    el.buildGoldRerollBtn.onclick = () => {
      if ((prog.coins | 0) < rerollCost) { setShopMsg('Not enough Gold.'); return; }
      prog.coins = Math.max(0, (prog.coins | 0) - rerollCost);
      rerollShopOffers(prog);
      _shopRerollLocal += 1;
      persistHubState(state, 'Arsenal offers rerolled.');
      renderBuildLab(state, true);
    };
  }
  const offers = prog.shopOffers || { active: [], passive: [], newSkills: [] };
  if (el.buildGoldActive) {
    el.buildGoldActive.innerHTML = '';
    for (let i = 0; i < 3; i++) renderMetaOfferCard(state, prog, 'active', offers.active?.[i], i, el.buildGoldActive);
  }
  if (el.buildGoldPassive) {
    el.buildGoldPassive.innerHTML = '';
    for (let i = 0; i < 3; i++) renderMetaOfferCard(state, prog, 'passive', offers.passive?.[i], i, el.buildGoldPassive);
  }
  if (el.buildGoldNew) {
    el.buildGoldNew.innerHTML = '';
    for (let i = 0; i < 3; i++) renderMetaOfferCard(state, prog, 'new', offers.newSkills?.[i], i, el.buildGoldNew);
  }
}

export function renderBuildLab(state, force = false) {
  const prog = state?.progression;
  if (!prog || !el.buildGridSkills || !el.buildGridPassives) return;
  ensureHubProgression(prog);
  ensureAccountProgression(prog);

  const buildFocus = normalizeBuildFocus(getBuildFocus(state)) === "all" ? "arsenal" : getBuildFocus(state);
  const activeHero = getActiveHero(prog);
  const activeHeroCombat = getHeroCombatProfile(prog, activeHero) || null;
  const activeHeroRuntime = getCanonicalHeroRuntimeProfile(activeHeroCombat, getHubCoreKey(prog));
  const key = JSON.stringify({
    focus: buildFocus,
    sp: prog.sp | 0,
    spent: getHubBuildSpentPoints(prog),
    available: getHubBuildAvailableSp(prog),
    core: getHubCoreKey(prog),
    runtimeSkills: activeHeroRuntime.runtimeSkillKeys,
    runtimePassives: activeHeroRuntime.runtimePassiveKeys,
    skillTiers: activeHeroRuntime.skillTiers,
    passiveTiers: activeHeroRuntime.passiveTiers,
    skillMeta: prog.skillMeta || {},
    materials: prog.materials || {},
    essences: prog.essences || {},
    gearParts: prog.gearParts || {},
    hubGear: prog.hubGear || {},
    gearInventory: prog.gearInventory || {},
    activeHeroId: prog.activeHeroId || '',
    heroes: Array.isArray(prog.heroes) ? prog.heroes.map((hero) => {
      const summary = getHeroLoadoutSummary(prog, hero);
      return ({ id: hero?.heroId, name: hero?.name, race: hero?.race, skills: hero?.equippedSkillCards || [], passives: hero?.equippedPassiveCards || [], power: summary?.totalCardPower || 0 });
    }) : [],
    raceDust: prog.accountProfile?.sharedResources?.raceDust || {},
    shards: prog.accountProfile?.cardCollection?.shards || {},
    exchangeFrom: el.buildExchangeFrom?.value || "",
    exchangeTo: el.buildExchangeTo?.value || "",
    exchangeMode: el.buildExchangeMode?.value || 'essence',
    skillMasterCardId: String(state?._skillMasterSelectedCardId || ''),
  });
  if (!force && renderBuildLab._key === key) return;
  renderBuildLab._key = key;

  const coreKey = getHubCoreKey(prog);
  const focusMeta = BUILD_BRANCH_META[buildFocus] || BUILD_BRANCH_META.arsenal;
  const spent = getHubBuildSpentPoints(prog);
  const available = getHubBuildAvailableSp(prog);
  const equippedSkills = Math.max(0, activeHeroRuntime.runtimeSkillKeys.filter((key) => key && key !== activeHeroRuntime.coreSkillKey).length);
  const equippedPassives = Math.max(0, activeHeroRuntime.runtimePassiveKeys.length);
  const equippedGearKeys = getEquippedHubGearKeys(prog);
  const gearUsage = getHubGearSlotUsage(prog);
  const totalOwnedGear = HUB_GEAR_DEFS.reduce((sum, def) => sum + (isHubGearOwned(prog, def.key) ? 1 : 0), 0);
  const totalEssence = BIOME_ESSENCE_KEYS.reduce((sum, k) => sum + Math.max(0, prog?.essences?.[k] | 0), 0);
  const totalMaterials = HUB_MATERIAL_KEYS.reduce((sum, k) => sum + Math.max(0, prog?.materials?.[k] | 0), 0);
  const coreDef = STARTER_LOADOUTS.find((d) => d.key === coreKey) || STARTER_LOADOUTS[0] || null;
  const coreIdentity = getCoreIdentity(coreKey);
  const corePassiveText = formatCorePassiveBonuses(coreIdentity);
  const coreButtonText = `Biome Locked • ${coreKey.toUpperCase()}`;
  if (el.buildInfoWrap) {
    if (buildFocus === "arsenal") {
      const ownedSkillCards = listOwnedCardEntries(prog?.accountProfile?.cardCollection, { equippedIds: activeHero?.equippedSkillCards || [], race: '' }).filter((entry) => entry?.kind === 'skill');
      el.buildInfoWrap.innerHTML = `<div><b>Gold:</b> ${Math.max(0, prog.coins | 0)}</div><div><b>💎 Diamonds:</b> ${Math.max(0, prog.diamonds | 0)}</div><div><b>Owned Skill Cards:</b> ${ownedSkillCards.length}</div><div><b>Equipped on Hero:</b> ${Math.max(0, activeHero?.equippedSkillCards?.length || 0)}</div>`;
    } else if (buildFocus === "essence") {
      el.buildInfoWrap.innerHTML = `<div><b>Gold:</b> ${Math.max(0, prog.coins | 0)}</div><div><b>Total Essences:</b> ${totalEssence}</div><div><b>Exchange:</b> Essence/Dust ${ESSENCE_EXCHANGE_RATE} → 1</div><div><b>Biome Routes:</b> ${BIOME_ESSENCE_KEYS.length}</div>`;
    } else if (buildFocus === "mastery") {
      el.buildInfoWrap.innerHTML = `<div><b>Available SP:</b> ${available}</div><div><b>Legacy SP Mirror:</b> ${spent}</div><div><b>Passives Mirrored:</b> ${equippedPassives}</div><div><b>Hero Biome:</b> ${String(coreIdentity?.routeLabel || coreKey)}</div>`;
    } else if (buildFocus === "forge") {
      el.buildInfoWrap.innerHTML = `<div><b>Gold:</b> ${Math.max(0, prog.coins | 0)}</div><div><b>Materials:</b> ${totalMaterials}</div><div><b>Owned Gear:</b> ${totalOwnedGear}</div><div><b>Hardware Slots:</b> M ${gearUsage.module}/${HUB_MODULE_SLOTS} • R ${gearUsage.relic ? 1 : 0} • C ${gearUsage.coreItem ? 1 : 0}</div>`;
    }
  }
  if (el.buildOverview) {
    el.buildOverview.innerHTML = getBuildOverviewHtml(buildFocus, {
      buildFocus,
      coreKey,
      coreDef,
      coreIdentity,
      available,
      spent,
      equippedSkills,
      equippedPassives,
      equippedGearKeys,
      gearUsage,
      totalOwnedGear,
      totalEssence,
      totalMaterials,
    });
  }
  if (el.buildTitle) el.buildTitle.textContent = focusMeta.title || focusMeta.label;
  if (el.buildIntro) el.buildIntro.textContent = focusMeta.intro || focusMeta.hint;
  if (el.buildBranchHint) el.buildBranchHint.textContent = focusMeta.hint;
  if (el.buildPanel) {
    el.buildPanel.style.border = `1px solid ${focusMeta.accent || "rgba(255,255,255,0.18)"}55`;
    el.buildPanel.style.boxShadow = `0 18px 44px rgba(0,0,0,0.46), 0 0 0 1px ${focusMeta.accent || "rgba(255,255,255,0.12)"}16 inset`;
    el.buildPanel.style.background = `linear-gradient(180deg, rgba(10,16,24,0.985), rgba(8,13,20,0.985)), radial-gradient(circle at top left, ${focusMeta.accent || "#89d8ff"}1f, transparent 46%)`;
  }
  renderWalletBar(el.buildWallet, prog, {
    compact: true,
    showEssences: buildFocus !== 'arsenal',
    showCardEconomy: buildFocus === 'forge',
  });
  setSectionVisibility(el.buildSectionArsenal, buildFocus === "arsenal");
  setSectionVisibility(el.buildSectionEssence, buildFocus === "essence");
  setSectionVisibility(el.buildSectionMastery, buildFocus === "mastery");
  setSectionVisibility(el.buildSectionForge, buildFocus === "forge");

  if (el.buildCardSummary) el.buildCardSummary.innerHTML = '';
  if (el.buildGridSkills) el.buildGridSkills.innerHTML = '';
  if (el.buildSkillMasterDetail) el.buildSkillMasterDetail.innerHTML = '';
  if (buildFocus === 'arsenal') {
    const equippedIds = Array.isArray(activeHero?.equippedSkillCards) ? activeHero.equippedSkillCards : [];
    const ownedSkills = listOwnedCardEntries(prog?.accountProfile?.cardCollection, { equippedIds, race: '' }).filter((entry) => entry?.kind === 'skill');
    const selectedCardId = getSkillMasterSelectedCardId(state, ownedSkills);
    state._skillMasterSelectedCardId = selectedCardId;
    const selectedEntry = ownedSkills.find((entry) => entry?.cardId === selectedCardId) || null;
    if (el.buildCardSummary) el.buildCardSummary.appendChild(renderSkillMasterSummaryCard(prog, activeHero, selectedEntry, ownedSkills));
    if (el.buildGridSkills) {
      if (!ownedSkills.length) el.buildGridSkills.appendChild(renderSimpleInfoCard('No owned skill cards', ['Skill Master only works with owned active skill cards.', 'Get at least one copy from rewards or cards, then return here to grow it.'], { accent: 'rgba(159,214,255,0.28)', background: 'rgba(159,214,255,0.06)' }));
      else for (const entry of ownedSkills) el.buildGridSkills.appendChild(renderSkillMasterOwnedCard(entry, entry.cardId === selectedCardId, () => {
        state._skillMasterSelectedCardId = entry.cardId;
        renderBuildLab(state, true);
      }));
    }
    if (el.buildSkillMasterDetail) el.buildSkillMasterDetail.appendChild(renderSkillMasterDetail(state, prog, selectedEntry));
  }

  if (el.buildEssenceGrid) {
    el.buildEssenceGrid.innerHTML = "";
    for (const essenceKey of BIOME_ESSENCE_KEYS) {
      el.buildEssenceGrid.appendChild(renderEssenceCard(essenceKey, prog?.essences?.[essenceKey] | 0));
    }
  }
  if (el.buildGridMaterials) {
    el.buildGridMaterials.innerHTML = "";
    for (const materialKey of HUB_MATERIAL_KEYS) {
      el.buildGridMaterials.appendChild(renderMaterialCard(materialKey, getMaterialCount(prog, materialKey)));
    }
  }
  if (el.buildGridRoutes) {
    el.buildGridRoutes.innerHTML = "";
    for (const biomeKey of BIOME_ESSENCE_KEYS) {
      el.buildGridRoutes.appendChild(renderBiomeRouteCard(biomeKey));
    }
  }

  if (el.buildExchangeFrom && !el.buildExchangeFrom.options.length) {
    for (const essenceKey of BIOME_ESSENCE_KEYS) {
      const meta = ESSENCE_META[essenceKey] || ESSENCE_META.mecha;
      el.buildExchangeFrom.appendChild(make("option", { value: essenceKey, text: meta.label }));
      el.buildExchangeTo.appendChild(make("option", { value: essenceKey, text: meta.label }));
    }
    el.buildExchangeFrom.value = "fire";
    el.buildExchangeTo.value = "ice";
  }

  const fromKey = String(el.buildExchangeFrom?.value || "fire");
  const toKey = String(el.buildExchangeTo?.value || "ice");
  const exchangeMode = String(el.buildExchangeMode?.value || 'essence').trim().toLowerCase() === 'dust' ? 'dust' : 'essence';
  const exchangeRate = exchangeMode === 'dust' ? RACE_DUST_EXCHANGE_RATE : ESSENCE_EXCHANGE_RATE;
  const canExchange = exchangeMode === 'dust'
    ? canExchangeRaceDust(prog, fromKey, toKey, exchangeRate)
    : canExchangeEssence(prog, fromKey, toKey, exchangeRate);
  if (el.buildExchangeBtn) {
    el.buildExchangeBtn.disabled = !canExchange;
    el.buildExchangeBtn.textContent = exchangeMode === 'dust' ? `Transmute Dust ${exchangeRate} → 1` : `Convert Essence ${exchangeRate} → 1`;
  }
  if (el.buildExchangeInfo) {
    const fromMeta = ESSENCE_META[fromKey] || ESSENCE_META.mecha;
    const toMeta = ESSENCE_META[toKey] || ESSENCE_META.mecha;
    const fromCount = exchangeMode === 'dust' ? getRaceDustCount(prog, fromKey) : (prog?.essences?.[fromKey] | 0);
    const toCount = exchangeMode === 'dust' ? getRaceDustCount(prog, toKey) : (prog?.essences?.[toKey] | 0);
    el.buildExchangeInfo.textContent = fromKey === toKey
      ? `Choose two different biome types for ${exchangeMode}.`
      : `${exchangeMode === 'dust' ? 'Dust transmute' : 'Essence exchange'}: ${exchangeRate} ${fromMeta.short} ${exchangeMode === 'dust' ? 'Dust' : 'Essence'} → 1 ${toMeta.short} ${exchangeMode === 'dust' ? 'Dust' : 'Essence'} • Wallet ${fromCount} → ${toCount}.`;
  }

  if (el.buildGridPassives) el.buildGridPassives.innerHTML = "";
  const sortedPassives = [...(RUN_PASSIVES || [])].sort((a, b) => {
    const diff = getCorePassiveAffinity(coreKey, b?.key) - getCorePassiveAffinity(coreKey, a?.key);
    if (diff) return diff;
    return String(a?.name || a?.key || "").localeCompare(String(b?.name || b?.key || ""));
  });
  for (const def of sortedPassives) {
    const keyPassive = String(def?.key || "");
    if (!keyPassive || def?.kind !== "passive") continue;
    const cap = getOwnedPassiveCap(prog, keyPassive);
    if (cap <= 0) continue;
    const lv = Math.max(0, Number(activeHeroRuntime.passiveTiers?.[keyPassive] || 0) | 0);
    const liveState = lv > 0 ? 'Equipped on the active hero and projected into runtime.' : 'Not equipped on the active hero.';
    const routeMeta = getPassiveRouteMeta(keyPassive);
    const affinity = getCorePassiveAffinity(coreKey, keyPassive);
    const affinityText = affinity >= 3 ? 'Favored by current core.' : 'Universal passive option.';
    const sub = `${String(routeMeta.route || 'route').toUpperCase()} • ${String(routeMeta.role || 'general scaling')}. ${affinityText} Owned cap ${cap}. ${liveState}`;
    const passiveAccent = getFrameAccent(getPassiveBiomeKey(keyPassive));
    el.buildGridPassives.appendChild(renderRuntimeMirrorCard(String(def?.name || keyPassive), sub, lv, cap, { accent: passiveAccent, iconNode: make('div', { text: '⬢', style: { width: '28px', height: '28px', display: 'grid', placeItems: 'center', borderRadius: '10px', color: passiveAccent, border: `1px solid ${passiveAccent}88`, background: `${passiveAccent}1c`, fontSize: '15px', fontWeight: '700' } }), state }));
  }

  if (el.buildGridModules) {
    el.buildGridModules.innerHTML = "";
    const defs = getHubGearDefsBySlot("module");
    for (const def of defs) el.buildGridModules.appendChild(renderGearCard(state, prog, def));
  }
  if (el.buildGridRelics) {
    el.buildGridRelics.innerHTML = "";
    const defs = getHubGearDefsBySlot("relic");
    for (const def of defs) el.buildGridRelics.appendChild(renderGearCard(state, prog, def));
  }
  if (el.buildGridCoreItems) {
    el.buildGridCoreItems.innerHTML = "";
    const defs = getHubGearDefsBySlot("coreItem");
    for (const def of defs) el.buildGridCoreItems.appendChild(renderGearCard(state, prog, def));
  }
}

