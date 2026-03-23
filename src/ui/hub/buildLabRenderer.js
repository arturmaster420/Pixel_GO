import { STARTER_LOADOUTS, getCoreIdentity, getPassiveRouteMeta, getSkillRouteMeta } from "../../core/starterLoadouts.js";
import { RUN_PASSIVES, RUN_SKILLS } from "../../core/runUpgrades.js";
import { BIOME_ESSENCE_KEYS, ESSENCE_EXCHANGE_RATE, ESSENCE_META, HUB_GEAR_DEFS, HUB_MATERIAL_KEYS, HUB_MODULE_SLOTS, MATERIAL_META, canCraftHubGear, canEquipHubGear, canExchangeEssence, craftHubGear, ensureHubProgression, equipHubGear, getBiomeLootProfile, getEquippedHubGearKeys, getEquippedHubSkillCount, getGearPartCount, getGearPrimaryBiomeKey, getGearSourceBiomes, getHubBuildAvailableSp, getHubBuildSpentPoints, getHubCoreKey, getHubGearDef, getHubGearDefsBySlot, getHubGearMaterialCosts, getHubGearPartCost, getHubGearSlotUsage, getMaterialCount, getOwnedPassiveCap, getOwnedSkillCap, HUB_BUILD_EXTRA_SKILL_SLOTS, isHubGearEquipped, isHubGearOwned, setHubPassiveLevel, setHubSkillLevel, unequipHubGear } from "../../core/hubBuild.js";
import { ensureShopMeta, ensureShopOffers, rerollShopOffers, replaceOfferSlot, getItemById, getMetaLevel, setMetaLevel, getPriceFor, getMaxMetaLevel } from "../../meta/shopMeta.js";
import { BUILD_BRANCH_META, getBuildFocus, normalizeBuildFocus, setSectionVisibility } from "./hubUiState.js";
import { formatCorePassiveBonuses, getCorePassiveAffinity, getCoreSkillAffinity, getFrameAccent, getPassiveBiomeKey, getSkillBiomeKey, renderGearIcon, renderSkillIcon, renderWalletBar } from "./hubViewShared.js";

let el = {};
let make = null;
let persistHubState = null;
let setShopMsg = null;
let _shopRerollLocal = 0;

export function configureBuildLabRenderer(deps = {}) {
  if (deps.el && typeof deps.el === 'object') el = deps.el;
  if (typeof deps.make === 'function') make = deps.make;
  if (typeof deps.persistHubState === 'function') persistHubState = deps.persistHubState;
  if (typeof deps.setShopMsg === 'function') setShopMsg = deps.setShopMsg;
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

function gearCostText(def) {
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
      <div><b>Current core:</b> ${String(coreDef?.name || data.coreKey)}${coreDef?.skillName ? ` • ${coreDef.skillName}` : ""}</div>
      <div><b>Route:</b> ${String(coreIdentity?.routeLabel || "general expedition")}</div>
      <div><b>Identity:</b> ${String(coreIdentity?.summary || coreDef?.desc || "")}</div>
      <div><b>Innate bonuses:</b> +${Math.round((Number(coreIdentity?.attackSpeedBonus || 0) || 0) * 100)}% Attack Speed • +${Math.round((Number(coreIdentity?.damageBonus || 0) || 0) * 100)}% ${String(coreIdentity?.damageType || data.coreKey)} Damage${corePassiveText ? ` • ${corePassiveText}` : ""}</div>
      <div><b>Extra active skills equipped:</b> ${equippedSkills}/${HUB_BUILD_EXTRA_SKILL_SLOTS}</div>
      <div><b>What this wing controls:</b> core path, route pressure and active combat shell.</div>
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
      <div><b>Passives equipped:</b> ${equippedPassives}</div>
      <div><b>Banked SP available:</b> ${data.available}</div>
      <div><b>Allocated SP:</b> ${data.spent}</div>
      <div><b>What this wing controls:</b> long-form passive doctrine, sustain, reach, crit and tempo shaping.</div>
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
    <div><b>Hub progression wings:</b> Arsenal Wing • Essence Conflux • Mastery Archive • Forge Wing</div>
    <div><b>Current core:</b> ${String(coreDef?.name || data.coreKey)}</div>
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
  card.appendChild(make('div', { className: 'muted', text: it ? (it.kind === 'passive' ? `Ownership cap for ${it.name}. Gold raises cap; Arsenal SP allocates it into the active build.` : `Ownership cap for ${it.name}. Gold raises cap; SP equips levels in the build.`) : 'No offer available.', style: { marginTop: '8px', fontSize: '12px', lineHeight: '1.4', opacity: '1' } }));
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

  const buildFocus = normalizeBuildFocus(getBuildFocus(state)) === "all" ? "arsenal" : getBuildFocus(state);
  const key = JSON.stringify({
    focus: buildFocus,
    sp: prog.sp | 0,
    spent: getHubBuildSpentPoints(prog),
    available: getHubBuildAvailableSp(prog),
    core: getHubCoreKey(prog),
    skills: prog.hubBuild?.skills || {},
    passives: prog.hubBuild?.passives || {},
    skillMeta: prog.skillMeta || {},
    materials: prog.materials || {},
    essences: prog.essences || {},
    gearParts: prog.gearParts || {},
    hubGear: prog.hubGear || {},
    gearInventory: prog.gearInventory || {},
    exchangeFrom: el.buildExchangeFrom?.value || "",
    exchangeTo: el.buildExchangeTo?.value || "",
  });
  if (!force && renderBuildLab._key === key) return;
  renderBuildLab._key = key;

  const coreKey = getHubCoreKey(prog);
  const focusMeta = BUILD_BRANCH_META[buildFocus] || BUILD_BRANCH_META.arsenal;
  const spent = getHubBuildSpentPoints(prog);
  const available = getHubBuildAvailableSp(prog);
  const equippedSkills = getEquippedHubSkillCount(prog);
  const equippedPassives = Object.keys(prog.hubBuild?.passives || {}).filter((k) => ((prog.hubBuild?.passives?.[k] | 0) > 0)).length;
  const equippedGearKeys = getEquippedHubGearKeys(prog);
  const gearUsage = getHubGearSlotUsage(prog);
  const totalOwnedGear = HUB_GEAR_DEFS.reduce((sum, def) => sum + (isHubGearOwned(prog, def.key) ? 1 : 0), 0);
  const totalEssence = BIOME_ESSENCE_KEYS.reduce((sum, k) => sum + Math.max(0, prog?.essences?.[k] | 0), 0);
  const totalMaterials = HUB_MATERIAL_KEYS.reduce((sum, k) => sum + Math.max(0, prog?.materials?.[k] | 0), 0);
  const coreDef = STARTER_LOADOUTS.find((d) => d.key === coreKey) || STARTER_LOADOUTS[0] || null;
  const coreIdentity = getCoreIdentity(coreKey);
  const corePassiveText = formatCorePassiveBonuses(coreIdentity);
  const coreButtonText = state?._hubResumeRunActive ? `Core Locked • ${coreKey.toUpperCase()}` : `Open Core Selector • ${coreKey.toUpperCase()}`;
  if (el.buildInfoWrap) {
    if (buildFocus === "arsenal") {
      el.buildInfoWrap.innerHTML = `<div><b>Gold:</b> ${Math.max(0, prog.coins | 0)}</div><div><b>Available SP:</b> ${available}</div><div><b>Allocated:</b> ${spent}</div><div><b>Extra Skill Slots:</b> ${equippedSkills}/${HUB_BUILD_EXTRA_SKILL_SLOTS}</div>`;
    } else if (buildFocus === "essence") {
      el.buildInfoWrap.innerHTML = `<div><b>Gold:</b> ${Math.max(0, prog.coins | 0)}</div><div><b>Total Essences:</b> ${totalEssence}</div><div><b>Exchange:</b> ${ESSENCE_EXCHANGE_RATE} → 1</div><div><b>Biome Routes:</b> ${BIOME_ESSENCE_KEYS.length}</div>`;
    } else if (buildFocus === "mastery") {
      el.buildInfoWrap.innerHTML = `<div><b>Available SP:</b> ${available}</div><div><b>Allocated:</b> ${spent}</div><div><b>Passives Equipped:</b> ${equippedPassives}</div><div><b>Core Route:</b> ${String(coreIdentity?.routeLabel || coreKey)}</div>`;
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
  if (el.buildCoreBtn) {
    el.buildCoreBtn.textContent = coreButtonText;
    el.buildCoreBtn.disabled = !!state?._hubResumeRunActive;
  }
  if (el.buildTitle) el.buildTitle.textContent = focusMeta.title || focusMeta.label;
  if (el.buildIntro) el.buildIntro.textContent = focusMeta.intro || focusMeta.hint;
  if (el.buildBranchHint) el.buildBranchHint.textContent = focusMeta.hint;
  if (el.buildPanel) {
    el.buildPanel.style.border = `1px solid ${focusMeta.accent || "rgba(255,255,255,0.18)"}55`;
    el.buildPanel.style.boxShadow = `0 18px 44px rgba(0,0,0,0.46), 0 0 0 1px ${focusMeta.accent || "rgba(255,255,255,0.12)"}16 inset`;
    el.buildPanel.style.background = `linear-gradient(180deg, rgba(10,16,24,0.985), rgba(8,13,20,0.985)), radial-gradient(circle at top left, ${focusMeta.accent || "#89d8ff"}1f, transparent 46%)`;
  }
  renderWalletBar(el.buildWallet, prog);
  setSectionVisibility(el.buildSectionArsenal, buildFocus === "arsenal");
  setSectionVisibility(el.buildSectionEssence, buildFocus === "essence");
  setSectionVisibility(el.buildSectionMastery, buildFocus === "mastery");
  setSectionVisibility(el.buildSectionForge, buildFocus === "forge");

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
  const canExchange = canExchangeEssence(prog, fromKey, toKey, ESSENCE_EXCHANGE_RATE);
  if (el.buildExchangeBtn) el.buildExchangeBtn.disabled = !canExchange;
  if (el.buildExchangeInfo) {
    const fromMeta = ESSENCE_META[fromKey] || ESSENCE_META.mecha;
    const toMeta = ESSENCE_META[toKey] || ESSENCE_META.mecha;
    el.buildExchangeInfo.textContent = fromKey === toKey
      ? "Choose two different essence types."
      : `Exchange ${ESSENCE_EXCHANGE_RATE} ${fromMeta.short} Essence → 1 ${toMeta.short} Essence.`;
  }

  el.buildGridSkills.innerHTML = "";
  const sortedSkills = [...(RUN_SKILLS || [])].sort((a, b) => {
    const diff = getCoreSkillAffinity(coreKey, b) - getCoreSkillAffinity(coreKey, a);
    if (diff) return diff;
    return String(a?.name || a?.key || "").localeCompare(String(b?.name || b?.key || ""));
  });
  for (const def of sortedSkills) {
    const keySkill = String(def?.key || "");
    if (!keySkill || def?.kind !== "skill") continue;
    const cap = getOwnedSkillCap(prog, keySkill);
    if (cap <= 0) continue;
    const isCoreSkill = keySkill === (STARTER_LOADOUTS.find((d) => d.key === coreKey)?.skillKey || "bullets");
    if (isCoreSkill) continue;
    const lv = Math.max(0, (prog.hubBuild?.skills?.[keySkill] | 0) || 0);
    const routeMeta = getSkillRouteMeta(keySkill);
    const affinity = getCoreSkillAffinity(coreKey, def);
    const affinityText = affinity >= 3 ? 'Favored by current core.' : (affinity >= 2 ? 'Matches current core route.' : 'Off-route utility option.');
    const sub = `${String(routeMeta.route || 'route').toUpperCase()} • ${String(routeMeta.role || 'utility')} • ${String(routeMeta.style || 'general value')}. ${affinityText} Owned cap ${cap}. ${lv > 0 ? "Equipped in expedition build." : "Unallocated."}`;
    const skillAccent = getFrameAccent(getSkillBiomeKey(keySkill));
    el.buildGridSkills.appendChild(renderAdjustCard(String(def?.name || keySkill), sub, lv, cap, () => {
      if (!setHubSkillLevel(prog, keySkill, lv - 1)) return;
      persistHubState(state, `${def?.name || keySkill} -1`);
      renderBuildLab(state, true);
    }, () => {
      if (!setHubSkillLevel(prog, keySkill, lv + 1)) {
        setShopMsg(available <= 0 ? "Need more SP from expedition." : `Extra skill slots full (${HUB_BUILD_EXTRA_SKILL_SLOTS}).`);
        return;
      }
      persistHubState(state, `${def?.name || keySkill} +1`);
      renderBuildLab(state, true);
    }, { accent: skillAccent, iconNode: renderSkillIcon(def, 28) }));
  }

  el.buildGridPassives.innerHTML = "";
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
    const lv = Math.max(0, (prog.hubBuild?.passives?.[keyPassive] | 0) || 0);
    const routeMeta = getPassiveRouteMeta(keyPassive);
    const affinity = getCorePassiveAffinity(coreKey, keyPassive);
    const affinityText = affinity >= 3 ? 'Favored by current core.' : 'Universal passive option.';
    const sub = `${String(routeMeta.route || 'route').toUpperCase()} • ${String(routeMeta.role || 'general scaling')}. ${affinityText} Owned cap ${cap}. Reversible allocation while in hub.`;
    const passiveAccent = getFrameAccent(getPassiveBiomeKey(keyPassive));
    el.buildGridPassives.appendChild(renderAdjustCard(String(def?.name || keyPassive), sub, lv, cap, () => {
      if (!setHubPassiveLevel(prog, keyPassive, lv - 1)) return;
      persistHubState(state, `${def?.name || keyPassive} -1`);
      renderBuildLab(state, true);
    }, () => {
      if (!setHubPassiveLevel(prog, keyPassive, lv + 1)) {
        setShopMsg("Need more SP from expedition.");
        return;
      }
      persistHubState(state, `${def?.name || keyPassive} +1`);
      renderBuildLab(state, true);
    }, { accent: passiveAccent, iconNode: make('div', { text: '⬢', style: { width: '28px', height: '28px', display: 'grid', placeItems: 'center', borderRadius: '10px', color: passiveAccent, border: `1px solid ${passiveAccent}88`, background: `${passiveAccent}1c`, fontSize: '15px', fontWeight: '700' } }) }));
  }

  if (el.buildResetBtn) {
    el.buildResetBtn.disabled = !(spent > 0);
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

