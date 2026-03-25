// Hub NPC interactions (DOM): show an interact button on mobile + a Shop modal during gameplay.
// Keeps systems intact; only adds UI to access existing meta shop from inside the Hub.

import { saveProgression } from "../core/progression.js";
import { applyActiveHeroToLegacyProgression } from "../core/accountProfile.js";
import { ensureStarterLoadoutProgression } from "../core/starterLoadouts.js";
import { ESSENCE_EXCHANGE_RATE, ESSENCE_META, HUB_MODULE_SLOTS, RACE_DUST_EXCHANGE_RATE, applyHubBuildToPlayer, applyProgressionSpToPlayer, ensureHubProgression, exchangeEssence, exchangeRaceDust, getHubCoreKey } from "../core/hubBuild.js";
import { ensureShopMeta, rerollShopOffers } from "../meta/shopMeta.js";
import { renderBasicSelectorView, resetBasicSelectorRenderKey } from "./hub/basicSelectorRenderer.js";
import { renderMerchantShop, resetMerchantRenderKey } from "./hub/merchantRenderer.js";
import { sendHubMeta } from "./hub/hubMetaSync.js";
import { BUILD_BRANCH_META, getBuildFocus, isHubPreviewState, normalizeBuildFocus, setBuildFocus, setCharacterTab } from "./hub/hubUiState.js";
import { configureHubViewShared, renderWalletBar } from "./hub/hubViewShared.js";
import { configureHeroMenuRenderer, renderCharacterMenu } from "./hub/heroMenuRenderer.js";
import { configureBuildLabRenderer, renderBuildLab } from "./hub/buildLabRenderer.js";

let _inited = false;
let el = {};
let _shopRerollLocal = 0;


function make(tag, props = {}, kids = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "style" && v && typeof v === "object") Object.assign(e.style, v);
    else if (k === "className") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, String(v));
  }
  for (const c of kids) e.appendChild(c);
  return e;
}

function isTypingFocus() {
  const a = document.activeElement;
  if (!a) return false;
  const tag = (a.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea";
}

function setShopMsg(msg) {
  if (el.shopMsg) el.shopMsg.textContent = msg || "";
  if (el.buildMsg) el.buildMsg.textContent = msg || "";
  if (!el.shopMsg && !el.buildMsg) return;
  if (msg) {
    clearTimeout(setShopMsg._t);
    setShopMsg._t = setTimeout(() => {
      if (el.shopMsg) el.shopMsg.textContent = "";
      if (el.buildMsg) el.buildMsg.textContent = "";
    }, 1200);
  }
}


function openShop(state) {
  if (!state?.progression) return;
  ensureHubProgression(state.progression);
  state.overlayMode = "shop";
  if (el.shopOverlay) el.shopOverlay.style.display = "flex";
  if (el.buildOverlay) el.buildOverlay.style.display = "none";
  if (el.basicOverlay) el.basicOverlay.style.display = "none";
  if (el.characterOverlay) el.characterOverlay.style.display = "none";
  resetMerchantRenderKey();
  renderMerchantShop(state, { el, make, setShopMsg, persistHubState, renderWalletBar, openCharacterMenu });
}

function closeShop(state) {
  if (el.shopOverlay) el.shopOverlay.style.display = "none";
  if (state && state.overlayMode === "shop") state.overlayMode = null;
}

function openTier(state) {
  if (!state) return;
  state.overlayMode = "stats";
  closeShop(state);
}

function openBasicSelector(state) {
  if (!state?.progression) return;
  if (state?._hubResumeRunActive) {
    if (state.popups) state.popups.push({ text: "Hero biome locked during saved run", time: 1.5 });
    return;
  }
  ensureStarterLoadoutProgression(state.progression);
  state.overlayMode = "basic";
  closeShop(state);
  if (el.basicOverlay) el.basicOverlay.style.display = "flex";
  if (el.buildOverlay) el.buildOverlay.style.display = "none";
  if (el.characterOverlay) el.characterOverlay.style.display = "none";
  resetBasicSelectorRenderKey();
  renderBasicSelectorView(state, { el, make, persistHubState, renderBuildLab });
}

function closeBasicSelector(state) {
  if (el.basicOverlay) el.basicOverlay.style.display = "none";
  resetBasicSelectorRenderKey();
  if (state && state.overlayMode === "basic") state.overlayMode = null;
}

function openBuildLab(state, focus = "arsenal") {
  if (!state?.progression) return;
  ensureHubProgression(state.progression);
  state.overlayMode = "build";
  const targetFocus = normalizeBuildFocus(focus || "arsenal");
  setBuildFocus(state, targetFocus === "all" ? "arsenal" : targetFocus);
  closeShop(state);
  if (el.buildOverlay) el.buildOverlay.style.display = "flex";
  if (el.basicOverlay) el.basicOverlay.style.display = "none";
  if (el.characterOverlay) el.characterOverlay.style.display = "none";
  renderBuildLab._key = "";
  renderBuildLab(state, true);
}

function closeBuildLab(state) {
  if (el.buildOverlay) el.buildOverlay.style.display = "none";
  if (state && state.overlayMode === "build") state.overlayMode = null;
  if (state) state._hubBuildFocus = "arsenal";
  renderBuildLab._key = "";
}

function closeCharacterMenu(state) {
  if (el.characterOverlay) el.characterOverlay.style.display = 'none';
  if (state && state.overlayMode === 'character') state.overlayMode = null;
  renderCharacterMenu._key = '';
}

function openCharacterMenu(state, tab = 'overview') {
  if (!state?.progression) return;
  ensureHubProgression(state.progression);
  const anchorBtn = el?.hubNavButtons?.[tab] || null;
  if (anchorBtn && typeof anchorBtn.getBoundingClientRect === 'function') {
    const rect = anchorBtn.getBoundingClientRect();
    state._characterMenuAnchor = {
      x: rect.left + rect.width * 0.5,
      y: rect.top + rect.height * 0.5,
      width: rect.width,
      height: rect.height,
    };
  }
  state.overlayMode = 'character';
  setCharacterTab(state, tab);
  state._characterMenuAnimateTick = (state._characterMenuAnimateTick | 0) + 1;
  closeShop(state);
  closeBasicSelector(state);
  closeBuildLab(state);
  renderCharacterMenu(state, true);
}


function applyHubPreview(state) {
  if (!state?.progression || !state?.player) return;
  ensureHubProgression(state.progression);
  if (!isHubPreviewState(state)) return;
  state.player._selectedStarterLoadout = state.progression.selectedStarterLoadout || getHubCoreKey(state.progression);
  applyHubBuildToPlayer(state.player, state.progression);
  applyProgressionSpToPlayer(state.player, state.progression);
}

function persistHubState(state, msg = "") {
  const prog = state?.progression;
  if (!prog) return;
  ensureHubProgression(prog);
  applyHubPreview(state);
  try { saveProgression(prog); } catch {}
  sendHubMeta(state);
  if (msg) setShopMsg(msg);
}



export function initHubNpcDom(game) {

  if (_inited) return;
  _inited = true;

  // Interact button (mobile-friendly)
  el.interactWrap = make("div", {
    id: "hubInteractWrap",
    style: {
      position: "fixed",
      left: "50%",
      bottom: "22px",
      transform: "translateX(-50%)",
      zIndex: 9999,
      display: "none",
      pointerEvents: "auto",
    },
  });

  el.interactBtn = make("button", {
    id: "btnHubInteract",
    className: "btn",
    type: "button",
    text: "Interact",
    style: {
      pointerEvents: "auto",
      padding: "12px 18px",
      fontSize: "14px",
      borderRadius: "12px",
      boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
    },
  });

  el.interactWrap.appendChild(el.interactBtn);
  document.body.appendChild(el.interactWrap);

  el.hubHudWallet = make("div", {
    id: "hubHudWallet",
    style: {
      position: "fixed",
      left: "12px",
      right: "12px",
      top: "10px",
      zIndex: 9997,
      display: "none",
      padding: "8px 10px",
      borderRadius: "18px",
      border: "1px solid rgba(255,255,255,0.12)",
      background: "linear-gradient(180deg, rgba(10,14,24,0.86), rgba(7,10,16,0.92))",
      boxShadow: "0 10px 24px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,255,255,0.04) inset",
      pointerEvents: "none",
      overflowX: "auto",
      scrollbarWidth: "none",
      WebkitOverflowScrolling: "touch",
    },
  });
  document.body.appendChild(el.hubHudWallet);

  el.hubNavBar = make("div", {
    id: "hubBottomNav",
    style: {
      position: "fixed",
      left: "0",
      right: "0",
      bottom: "0",
      transform: "none",
      zIndex: 9998,
      display: "none",
      gap: "8px",
      alignItems: "center",
      justifyContent: "space-evenly",
      padding: "8px 12px calc(8px + env(safe-area-inset-bottom, 0px))",
      borderRadius: "18px 18px 0 0",
      border: "1px solid rgba(255,255,255,0.12)",
      background: "linear-gradient(180deg, rgba(10,14,24,0.94), rgba(7,10,16,0.96))",
      boxShadow: "0 10px 28px rgba(0,0,0,0.34), 0 0 0 1px rgba(255,255,255,0.04) inset",
      pointerEvents: "auto",
      flexWrap: "nowrap",
      width: "100vw",
      boxSizing: "border-box",
    },
  });
  const hubNavDefs = [
    ["settings", "Options"],
    ["inventory", "Inventory"],
    ["gear", "Gear"],
    ["skills", "Skills"],
    ["overview", "Hero"],
  ];
  el.hubNavButtons = {};
  for (const [tabKey, label] of hubNavDefs) {
    const btn = make("button", { className: "btn", type: "button", text: label, style: { padding: "10px 8px", minWidth: "0", flex: "1 1 0", borderRadius: "12px", whiteSpace: "nowrap", fontSize: "13px" } });
    btn.addEventListener("click", () => openCharacterMenu(game.state, tabKey));
    el.hubNavButtons[tabKey] = btn;
    el.hubNavBar.appendChild(btn);
  }
  document.body.appendChild(el.hubNavBar);

  // Shop overlay
  el.shopOverlay = make("div", {
    id: "hubShopOverlay",
    style: {
      position: "fixed",
      inset: "0",
      zIndex: 10000,
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.72)",
      padding: "14px",
    },
  });

  const panel = make("div", {
    className: "panel",
    style: {
      width: "min(560px, 96vw)",
      maxHeight: "92vh",
      overflow: "auto",
    },
  });

  const header = make("div", { className: "header" });
  header.appendChild(make("h2", { text: "Hub Shop" }));
  const closeBtn = make("button", { className: "btn", type: "button", text: "Close", style: { padding: "7px 10px", fontSize: "12px" } });
  closeBtn.addEventListener("click", () => closeShop(game.state));
  header.appendChild(closeBtn);

  const topRow = make("div", { className: "row", style: { justifyContent: "space-between", alignItems: "center", marginTop: "8px" } });
  const coinsInfo = make("div", { style: { fontSize: "13px" } });
  coinsInfo.innerHTML = "<b>Gold:</b> <span id=\"hubShopCoins\">0</span> <span class=\"muted\">🪙</span>";
  topRow.appendChild(coinsInfo);
  const shopWallet = make("div", { id: "hubShopWallet", style: { flex: "1 1 320px" } });
  topRow.appendChild(shopWallet);

  const rerollBtn = make("button", { className: "btn", id: "btnHubShopReroll", type: "button", style: { padding: "8px 10px", whiteSpace: "nowrap" } });
  rerollBtn.innerHTML = "Reroll (<span id=\"hubShopRerollCost\">10</span>)";
  topRow.appendChild(rerollBtn);

  const quickRow = make("div", { className: "row", style: { gap: "8px", marginTop: "10px", flexWrap: "wrap" } });
  const btnBuildLab = make("button", { className: "btn", id: "btnHubBuildLab", type: "button", text: "Wing Navigator", style: { padding: "8px 10px", display: "none" } });
  const btnCoreLab = make("button", { className: "btn", id: "btnHubCoreLab", type: "button", text: "Hero Biome", style: { padding: "8px 10px" } });
  const btnArsenalLab = make("button", { className: "btn", type: "button", text: "Arsenal Wing", style: { padding: "8px 10px" } });
  const btnEssenceLab = make("button", { className: "btn", type: "button", text: "Essence Conflux", style: { padding: "8px 10px" } });
  const btnMasteryLab = make("button", { className: "btn", type: "button", text: "Mastery Archive", style: { padding: "8px 10px" } });
  const btnForgeLab = make("button", { className: "btn", type: "button", text: "Forge Wing", style: { padding: "8px 10px" } });
  quickRow.appendChild(btnCoreLab);
  quickRow.appendChild(btnArsenalLab);
  quickRow.appendChild(btnEssenceLab);
  quickRow.appendChild(btnMasteryLab);
  const btnCharacter = make("button", { className: "btn", type: "button", text: "Hero Menu", style: { padding: "8px 10px" } });
  quickRow.appendChild(btnForgeLab);
  quickRow.appendChild(btnCharacter);

  const msg = make("div", { className: "muted", id: "hubShopMsg", style: { minHeight: "16px", marginTop: "6px" } });

  panel.appendChild(header);
  panel.appendChild(topRow);
  panel.appendChild(quickRow);
  panel.appendChild(make("div", { className: "muted", id: "hubShopFlowInfo", style: { marginTop: "6px", fontSize: "12px", lineHeight: "1.45", color: "rgba(240,248,255,0.92)", opacity: "1" } }));
  panel.appendChild(msg);

  panel.appendChild(make("div", { className: "shopLabel", text: "Прокачка" }));
  panel.appendChild(make("div", { className: "shopGrid", id: "hubShopGridActive" }));

  panel.appendChild(make("div", { className: "shopLabel", text: "Пассивки", style: { marginTop: "10px" } }));
  panel.appendChild(make("div", { className: "shopGrid", id: "hubShopGridPassive" }));

  panel.appendChild(make("div", { className: "shopLabel", text: "2nd Rank Skill Up", style: { marginTop: "10px" } }));
  panel.appendChild(make("div", { className: "shopGrid", id: "hubShopGridNew" }));

  panel.appendChild(make("div", { className: "muted", style: { marginTop: "10px", fontSize: "12px", opacity: "0.85" }, text: "Cards now define the hero; this Arsenal wing is the compatibility bridge. Gold still raises ownership caps, while Expedition SP now remaps the active hero’s equipped cards into the current live runtime." }));

  el.shopOverlay.appendChild(panel);
  document.body.appendChild(el.shopOverlay);

  el.basicOverlay = make("div", {
    id: "hubBasicOverlay",
    style: {
      position: "fixed",
      inset: "0",
      zIndex: 10000,
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.72)",
      padding: "14px",
    },
  });
  const basicPanel = make("div", { className: "panel", style: { width: "min(680px, 96vw)", maxHeight: "92vh", overflow: "auto" } });
  const basicHeader = make("div", { className: "header" });
  basicHeader.appendChild(make("h2", { text: "Hero Biome Alignment" }));
  const basicCloseBtn = make("button", { className: "btn", type: "button", text: "Close", style: { padding: "7px 10px", fontSize: "12px" } });
  basicCloseBtn.addEventListener("click", () => closeBasicSelector(game.state));
  basicHeader.appendChild(basicCloseBtn);
  basicPanel.appendChild(basicHeader);
  basicPanel.appendChild(make("div", { className: "muted", style: { marginTop: "8px", marginBottom: "12px", fontSize: "13px", lineHeight: "1.45", color: "rgba(240,248,255,0.95)", opacity: "1" }, text: "Выбери 1 стартовый core. На следующем ране он даст тебе свой базовый скилл Lv1 и бонусы к скорости атаки + урону своей стихии/типа." }));
  el.basicGrid = make("div", { className: "shopGrid", id: "hubBasicGrid" });
  basicPanel.appendChild(el.basicGrid);
  basicPanel.appendChild(make("div", { className: "muted", style: { marginTop: "12px", fontSize: "12px", color: "rgba(232,245,255,0.9)", opacity: "1" }, text: "Сейчас доступны все 6 core-направлений: Mecha / Electric / Fire / Ice / Dark / Light." }));
  el.basicOverlay.appendChild(basicPanel);
  document.body.appendChild(el.basicOverlay);

  el.buildOverlay = make("div", {
    id: "hubBuildOverlay",
    style: {
      position: "fixed",
      inset: "0",
      zIndex: 10000,
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.72)",
      padding: "14px",
    },
  });
  const buildPanel = make("div", { className: "panel", style: { width: "min(820px, 96vw)", maxHeight: "92vh", overflow: "auto" } });
  const buildHeader = make("div", { className: "header" });
  const buildTitle = make("h2", { text: "Expedition Build Lab" });
  buildHeader.appendChild(buildTitle);
  const buildCloseBtn = make("button", { className: "btn", type: "button", text: "Close", style: { padding: "7px 10px", fontSize: "12px" } });
  buildCloseBtn.addEventListener("click", () => closeBuildLab(game.state));
  buildHeader.appendChild(buildCloseBtn);
  buildPanel.appendChild(buildHeader);
  const buildIntro = make("div", { className: "muted", style: { marginTop: "8px", fontSize: "13px", lineHeight: "1.45", color: "rgba(240,248,255,0.95)", opacity: "1" }, text: "Build points are allocated from banked SP. You earn SP in expeditions, then return to hub to distribute it across active skills and passives. Allocation is reversible while in hub." });
  buildPanel.appendChild(buildIntro);
  const buildWallet = make("div", { id: "hubBuildWallet", style: { marginTop: "10px" } });
  buildPanel.appendChild(buildWallet);
  const buildInfo = make("div", { className: "row", style: { justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginTop: "12px" } });
  buildInfo.innerHTML = '<div><b>Available SP:</b> <span id="hubBuildSp">0</span></div><div><b>Allocated:</b> <span id="hubBuildSpent">0</span></div><div><b>Total SP:</b> <span id="hubBuildTotal">0</span></div><div><b>Extra Skill Slots:</b> <span id="hubBuildSlots">0/0</span></div>';
  buildPanel.appendChild(buildInfo);
  const buildMsg = make("div", { className: "muted", id: "hubBuildMsg", style: { minHeight: "16px", marginTop: "6px" } });
  buildPanel.appendChild(buildMsg);
  const buildOverview = make("div", { id: "hubBuildOverview", className: "muted", style: { marginTop: "10px", padding: "10px 12px", borderRadius: "12px", background: "rgba(255,255,255,0.04)", fontSize: "12px", lineHeight: "1.55", color: "rgba(240,248,255,0.95)", opacity: "1" } });
  buildPanel.appendChild(buildOverview);
  const buildBranchHint = make("div", { id: "hubBuildBranchHint", className: "muted", style: { marginTop: "8px", fontSize: "12px", lineHeight: "1.45", color: "rgba(232,245,255,0.9)", opacity: "1" } });
  buildPanel.appendChild(buildBranchHint);
  const buildBranchTabs = make("div", { className: "row", style: { gap: "8px", marginTop: "10px", flexWrap: "wrap", display: "none" } });
  const buildBranchButtons = {};
  for (const [focusKey, meta] of Object.entries(BUILD_BRANCH_META)) {
    const btn = make("button", { className: "btn", type: "button", text: meta.label, style: { padding: "8px 10px", fontSize: "12px" } });
    btn.addEventListener("click", () => {
      setBuildFocus(game.state, focusKey);
      renderBuildLab(game.state, true);
    });
    buildBranchButtons[focusKey] = btn;
    buildBranchTabs.appendChild(btn);
  }
  buildPanel.appendChild(buildBranchTabs);

  el.buildSectionArsenal = make("div", { id: "hubBuildSectionArsenal", style: { marginTop: "12px" } });
  const buildCoreRow = make("div", { className: "row", style: { gap: "8px", marginTop: "12px", flexWrap: "wrap" } });
  const buildCoreBtn = make("button", { className: "btn", type: "button", id: "hubBuildCoreBtn", text: "Inspect Hero Biome", style: { padding: "8px 10px" } });
  const buildResetBtn = make("button", { className: "btn", type: "button", id: "hubBuildResetBtn", text: "Sync Runtime Mirror", style: { padding: "8px 10px" } });
  buildCoreRow.appendChild(buildCoreBtn);
  buildCoreRow.appendChild(buildResetBtn);
  el.buildSectionArsenal.appendChild(buildCoreRow);
  const buildGoldWrap = make('div', { style: { marginTop: '12px' } });
  buildGoldWrap.appendChild(make('div', { className: 'shopLabel', text: 'Gold/SP Doctrine • compatibility bridge' }));
  const buildGoldTop = make('div', { className: 'row', style: { justifyContent: 'space-between', gap: '10px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' } });
  const buildGoldCoins = make('div', { id: 'hubBuildGoldCoins', style: { fontSize: '13px' } });
  buildGoldCoins.innerHTML = '<b>Gold:</b> <span id="hubBuildGoldCoinsValue">0</span>';
  const buildGoldRerollBtn = make('button', { className: 'btn', type: 'button', id: 'hubBuildGoldRerollBtn', style: { padding: '8px 10px', whiteSpace: 'nowrap' } });
  buildGoldRerollBtn.innerHTML = 'Reroll (<span id="hubBuildGoldRerollCost">10</span>)';
  buildGoldTop.appendChild(buildGoldCoins);
  buildGoldTop.appendChild(buildGoldRerollBtn);
  buildGoldWrap.appendChild(buildGoldTop);
  buildGoldWrap.appendChild(make('div', { className: 'shopLabel', text: 'Skill Ownership', style: { marginTop: '10px' } }));
  const buildGoldActive = make('div', { className: 'shopGrid', id: 'hubBuildGoldActive' });
  buildGoldWrap.appendChild(buildGoldActive);
  buildGoldWrap.appendChild(make('div', { className: 'shopLabel', text: 'Passive Ownership', style: { marginTop: '10px' } }));
  const buildGoldPassive = make('div', { className: 'shopGrid', id: 'hubBuildGoldPassive' });
  buildGoldWrap.appendChild(buildGoldPassive);
  buildGoldWrap.appendChild(make('div', { className: 'shopLabel', text: '2nd Rank Skill Up', style: { marginTop: '10px' } }));
  const buildGoldNew = make('div', { className: 'shopGrid', id: 'hubBuildGoldNew' });
  buildGoldWrap.appendChild(buildGoldNew);
  el.buildSectionArsenal.appendChild(buildGoldWrap);
  const buildCardWrap = make('div', { id: 'hubBuildCardWrap', style: { marginTop: '12px', padding: '12px', borderRadius: '14px', background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(159,214,255,0.16)' } });
  buildCardWrap.appendChild(make('div', { className: 'shopLabel', text: 'Hero Card Doctrine' }));
  buildCardWrap.appendChild(make('div', { className: 'muted', style: { marginTop: '6px', fontSize: '12px', lineHeight: '1.45', color: 'rgba(232,245,255,0.9)', opacity: '1' }, text: 'The active hero now drives this wing through equipped skill cards, passive cards, stars and race synergy. Legacy ownership/SP controls below remain as the bridge into the current combat runtime.' }));
  el.buildCardSummary = make('div', { id: 'hubBuildCardSummary', style: { marginTop: '10px' } });
  buildCardWrap.appendChild(el.buildCardSummary);
  buildCardWrap.appendChild(make('div', { className: 'shopLabel', text: 'Equipped Skill Cards', style: { marginTop: '10px' } }));
  el.buildCardGridSkills = make('div', { className: 'shopGrid', id: 'hubBuildCardGridSkills' });
  buildCardWrap.appendChild(el.buildCardGridSkills);
  buildCardWrap.appendChild(make('div', { className: 'shopLabel', text: 'Equipped Passive Cards', style: { marginTop: '10px' } }));
  el.buildCardGridPassives = make('div', { className: 'shopGrid', id: 'hubBuildCardGridPassives' });
  buildCardWrap.appendChild(el.buildCardGridPassives);
  el.buildSectionArsenal.appendChild(buildCardWrap);
  el.buildSectionArsenal.appendChild(make('div', { className: 'muted', style: { marginTop: '8px', fontSize: '12px', lineHeight: '1.45', color: 'rgba(232,245,255,0.9)', opacity: '1' }, text: 'Legacy Arsenal bridge: Gold still raises ownership caps, but the SP controls below now remap the active hero’s cards into the current live expedition build.' }));
  el.buildSectionArsenal.appendChild(make("div", { className: "shopLabel", text: "Active Skills • SP allocation", style: { marginTop: "12px" } }));
  el.buildGridSkills = make("div", { className: "shopGrid", id: "hubBuildGridSkills" });
  el.buildSectionArsenal.appendChild(el.buildGridSkills);
  buildPanel.appendChild(el.buildSectionArsenal);

  el.buildSectionEssence = make("div", { id: "hubBuildSectionEssence", style: { marginTop: "12px" } });
  el.buildSectionEssence.appendChild(make("div", { className: "shopLabel", text: "Biome Essences" }));
  el.buildSectionEssence.appendChild(make("div", { className: "muted", style: { marginTop: "6px", fontSize: "12px", lineHeight: "1.4", color: "rgba(232,245,255,0.9)", opacity: "1" }, text: `Each cleared expedition room now feeds your hub economy. Boss/final rooms give extra essence. Exchange rate: ${ESSENCE_EXCHANGE_RATE} → 1.` }));
  el.buildEssenceGrid = make("div", { className: "shopGrid", id: "hubBuildEssenceGrid" });
  el.buildSectionEssence.appendChild(el.buildEssenceGrid);
  el.buildSectionEssence.appendChild(make("div", { className: "shopLabel", text: "Biome Routes", style: { marginTop: "12px" } }));
  el.buildGridRoutes = make("div", { className: "shopGrid", id: "hubBuildGridRoutes" });
  el.buildSectionEssence.appendChild(el.buildGridRoutes);
  const buildExchangeWrap = make("div", { style: { marginTop: "12px", padding: "12px", borderRadius: "12px", background: "rgba(255,255,255,0.04)" } });
  buildExchangeWrap.appendChild(make("div", { className: "shopLabel", text: "Biome Currency Exchange" }));
  const buildExchangeRow = make("div", { className: "row", style: { gap: "8px", marginTop: "8px", flexWrap: "wrap", alignItems: "center" } });
  const buildExchangeMode = make("select", { id: "hubBuildExchangeMode", style: { minWidth: "150px", padding: "8px", borderRadius: "10px", background: "rgba(10,18,28,0.96)", color: "#eef8ff", border: "1px solid rgba(255,255,255,0.18)" } }, [
    make("option", { value: "essence", text: `Essence ${ESSENCE_EXCHANGE_RATE} → 1` }),
    make("option", { value: "dust", text: `Dust ${RACE_DUST_EXCHANGE_RATE} → 1` }),
  ]);
  const buildExchangeFrom = make("select", { id: "hubBuildExchangeFrom", style: { minWidth: "170px", padding: "8px", borderRadius: "10px", background: "rgba(10,18,28,0.96)", color: "#eef8ff", border: "1px solid rgba(255,255,255,0.18)" } });
  const buildExchangeTo = make("select", { id: "hubBuildExchangeTo", style: { minWidth: "170px", padding: "8px", borderRadius: "10px", background: "rgba(10,18,28,0.96)", color: "#eef8ff", border: "1px solid rgba(255,255,255,0.18)" } });
  const buildExchangeBtn = make("button", { className: "btn", type: "button", id: "hubBuildExchangeBtn", text: `Convert Essence ${ESSENCE_EXCHANGE_RATE} → 1`, style: { padding: "8px 10px" } });
  buildExchangeRow.appendChild(buildExchangeMode);
  buildExchangeRow.appendChild(buildExchangeFrom);
  buildExchangeRow.appendChild(buildExchangeTo);
  buildExchangeRow.appendChild(buildExchangeBtn);
  buildExchangeWrap.appendChild(buildExchangeRow);
  const buildExchangeInfo = make("div", { id: "hubBuildExchangeInfo", className: "muted", style: { marginTop: "8px", fontSize: "12px", lineHeight: "1.4", color: "rgba(232,245,255,0.9)", opacity: "1" } });
  buildExchangeWrap.appendChild(buildExchangeInfo);
  el.buildSectionEssence.appendChild(buildExchangeWrap);
  buildPanel.appendChild(el.buildSectionEssence);

  el.buildSectionMastery = make("div", { id: "hubBuildSectionMastery", style: { marginTop: "12px" } });
  el.buildSectionMastery.appendChild(make("div", { className: "shopLabel", text: "Passives" }));
  el.buildGridPassives = make("div", { className: "shopGrid", id: "hubBuildGridPassives" });
  el.buildSectionMastery.appendChild(el.buildGridPassives);
  buildPanel.appendChild(el.buildSectionMastery);

  el.buildSectionForge = make("div", { id: "hubBuildSectionForge", style: { marginTop: "12px" } });
  el.buildSectionForge.appendChild(make("div", { className: "shopLabel", text: "Forge Materials" }));
  el.buildSectionForge.appendChild(make("div", { className: "muted", style: { marginTop: "6px", fontSize: "12px", lineHeight: "1.4", color: "rgba(232,245,255,0.9)", opacity: "1" }, text: "Rooms now drop salvage and alloy; final boss rooms can drop core shards, gear parts and sometimes a full item." }));
  el.buildGridMaterials = make("div", { className: "shopGrid", id: "hubBuildGridMaterials" });
  el.buildSectionForge.appendChild(el.buildGridMaterials);
  el.buildSectionForge.appendChild(make("div", { className: "shopLabel", text: "Gear Forge • Modules", style: { marginTop: "12px" } }));
  el.buildSectionForge.appendChild(make("div", { className: "muted", style: { marginTop: "6px", fontSize: "12px", lineHeight: "1.4", color: "rgba(232,245,255,0.9)", opacity: "1" }, text: `Craft and equip gear with Gold + Materials + Essences + Parts. Modules have ${HUB_MODULE_SLOTS} slots; Relic and Core Item have 1 each.` }));
  el.buildGridModules = make("div", { className: "shopGrid", id: "hubBuildGridModules" });
  el.buildSectionForge.appendChild(el.buildGridModules);
  el.buildSectionForge.appendChild(make("div", { className: "shopLabel", text: "Relics", style: { marginTop: "12px" } }));
  el.buildGridRelics = make("div", { className: "shopGrid", id: "hubBuildGridRelics" });
  el.buildSectionForge.appendChild(el.buildGridRelics);
  el.buildSectionForge.appendChild(make("div", { className: "shopLabel", text: "Core Items", style: { marginTop: "12px" } }));
  el.buildGridCoreItems = make("div", { className: "shopGrid", id: "hubBuildGridCoreItems" });
  el.buildSectionForge.appendChild(el.buildGridCoreItems);
  buildPanel.appendChild(el.buildSectionForge);
  el.buildOverlay.appendChild(buildPanel);
  document.body.appendChild(el.buildOverlay);

  el.characterOverlay = make("div", {
    id: "hubCharacterOverlay",
    style: {
      position: "fixed",
      inset: "0",
      zIndex: 10001,
      display: "none",
      alignItems: "flex-start",
      justifyContent: "center",
      background: "rgba(0,0,0,0.76)",
      padding: "8px 10px calc(72px + env(safe-area-inset-bottom, 0px))",
    },
  });
  const characterPanel = make("div", { className: "panel", style: { width: "min(1180px, 96vw)", height: "calc(100vh - 84px)", maxHeight: "calc(100vh - 84px)", overflow: "hidden", display: "flex", flexDirection: "column" } });
  const characterHeader = make("div", { className: "header", style: { paddingBottom: "6px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" } });
  const characterHeaderLeft = make("div", { style: { display: "flex", flexDirection: "column", gap: "4px", minWidth: "0", flex: "1 1 auto" } });
  const characterTitle = make("div", { text: "Hero", style: { fontSize: "18px", fontWeight: "800", color: "#fff3d0", lineHeight: "1.1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } });
  const characterHp = make("div", { text: "0/0 HP", style: { display: "inline-flex", alignItems: "center", width: "fit-content", padding: "3px 10px", borderRadius: "999px", border: "1px solid rgba(159,214,255,0.34)", background: "rgba(159,214,255,0.10)", color: "#f6fbff", fontSize: "11px", fontWeight: "700" } });
  characterHeaderLeft.appendChild(characterTitle);
  characterHeaderLeft.appendChild(characterHp);
  const characterHeaderRight = make("div", { className: "row", style: { gap: "8px", alignItems: "flex-start", flexWrap: "nowrap", width: "auto", boxSizing: "border-box", justifyContent: "flex-end", minWidth: "0", marginLeft: "auto" } });
  const characterWallet = make("div", { id: "heroMenuWallet", style: { flex: "0 1 520px", minWidth: "220px", marginLeft: "auto" } });
  characterHeaderRight.appendChild(characterWallet);
  characterHeader.appendChild(characterHeaderLeft);
  characterHeader.appendChild(characterHeaderRight);
  characterPanel.appendChild(characterHeader);
  const characterLayout = make("div", { id: "heroMenuLayout", style: { display: "flex", gap: "12px", marginTop: "6px", alignItems: "stretch", flex: "1 1 auto", minHeight: "0", overflow: "hidden" } });
  const characterLeft = make("div", { id: "heroMenuLeft", style: { flex: "0 0 30%", minWidth: "280px" } });
  const characterRight = make("div", { id: "heroMenuRight", style: { flex: "1 1 70%", display: "flex", flexDirection: "column", gap: "12px" } });
  const characterTabs = make("div", { id: "heroMenuTabs", className: "row", style: { gap: "8px", flexWrap: "wrap", flex: "0 0 auto" } });
  const characterContent = make("div", { id: "heroMenuContent", style: { display: "flex", flexDirection: "column", gap: "10px", flex: "1 1 auto", minHeight: "0", overflow: "hidden" } });
  characterRight.appendChild(characterTabs);
  characterRight.appendChild(characterContent);
  characterLayout.appendChild(characterLeft);
  characterLayout.appendChild(characterRight);
  characterPanel.appendChild(characterLayout);
  el.characterOverlay.appendChild(characterPanel);
  document.body.appendChild(el.characterOverlay);

  // Bind elements
  el.shopCoins = panel.querySelector("#hubShopCoins");
  el.shopWallet = panel.querySelector("#hubShopWallet");
  el.shopRerollCost = panel.querySelector("#hubShopRerollCost");
  el.shopRerollBtn = panel.querySelector("#btnHubShopReroll");
  el.shopMsg = panel.querySelector("#hubShopMsg");
  el.shopFlowInfo = panel.querySelector("#hubShopFlowInfo");
  el.shopGridActive = panel.querySelector("#hubShopGridActive");
  el.shopGridPassive = panel.querySelector("#hubShopGridPassive");
  el.shopGridNew = panel.querySelector("#hubShopGridNew");
  el.buildInfoWrap = buildInfo;
  el.buildTitle = buildTitle;
  el.buildPanel = buildPanel;
  el.buildIntro = buildIntro;
  el.buildWallet = buildPanel.querySelector("#hubBuildWallet");
  el.buildMsg = buildPanel.querySelector("#hubBuildMsg");
  el.buildCoreBtn = buildPanel.querySelector("#hubBuildCoreBtn");
  el.buildResetBtn = buildPanel.querySelector("#hubBuildResetBtn");
  el.buildOverview = buildPanel.querySelector("#hubBuildOverview");
  el.buildBranchHint = buildPanel.querySelector("#hubBuildBranchHint");
  el.buildBranchButtons = buildBranchButtons;
  el.buildSectionArsenal = buildPanel.querySelector("#hubBuildSectionArsenal");
  el.buildSectionEssence = buildPanel.querySelector("#hubBuildSectionEssence");
  el.buildSectionMastery = buildPanel.querySelector("#hubBuildSectionMastery");
  el.buildSectionForge = buildPanel.querySelector("#hubBuildSectionForge");
  el.buildGridRoutes = buildPanel.querySelector("#hubBuildGridRoutes");
  el.buildExchangeMode = buildPanel.querySelector("#hubBuildExchangeMode");
  el.buildExchangeFrom = buildPanel.querySelector("#hubBuildExchangeFrom");
  el.buildExchangeTo = buildPanel.querySelector("#hubBuildExchangeTo");
  el.buildExchangeBtn = buildPanel.querySelector("#hubBuildExchangeBtn");
  el.buildExchangeInfo = buildPanel.querySelector("#hubBuildExchangeInfo");
  el.buildGridMaterials = buildPanel.querySelector("#hubBuildGridMaterials");
  el.buildGridModules = buildPanel.querySelector("#hubBuildGridModules");
  el.buildGridRelics = buildPanel.querySelector("#hubBuildGridRelics");
  el.buildGridCoreItems = buildPanel.querySelector("#hubBuildGridCoreItems");
  el.buildGoldCoins = buildPanel.querySelector('#hubBuildGoldCoinsValue');
  el.buildGoldRerollCost = buildPanel.querySelector('#hubBuildGoldRerollCost');
  el.buildGoldRerollBtn = buildPanel.querySelector('#hubBuildGoldRerollBtn');
  el.buildGoldActive = buildPanel.querySelector('#hubBuildGoldActive');
  el.buildGoldPassive = buildPanel.querySelector('#hubBuildGoldPassive');
  el.buildGoldNew = buildPanel.querySelector('#hubBuildGoldNew');
  el.characterHeader = characterHeader;
  el.characterPanel = characterPanel;
  el.characterLayout = characterLayout;
  el.characterLeft = characterLeft;
  el.characterRight = characterRight;
  el.characterTitle = characterTitle;
  el.characterHp = characterHp;
  el.characterWallet = characterWallet;
  el.characterTabs = characterTabs;
  el.characterContent = characterContent;

  configureHubViewShared({ make });
  configureHeroMenuRenderer({ el, make, persistHubState, setShopMsg });
  configureBuildLabRenderer({ el, make, persistHubState, setShopMsg, openCharacterMenu });

  el.characterOverlay.addEventListener("pointerdown", (e) => {
    if (e.target === el.characterOverlay) closeCharacterMenu(game.state);
  });

  btnBuildLab.addEventListener("click", () => openBuildLab(game.state, "arsenal"));
  btnCoreLab.addEventListener("click", () => openBasicSelector(game.state));
  btnArsenalLab.addEventListener("click", () => openBuildLab(game.state, "arsenal"));
  btnEssenceLab.addEventListener("click", () => openBuildLab(game.state, "essence"));
  btnMasteryLab.addEventListener("click", () => openBuildLab(game.state, "mastery"));
  btnForgeLab.addEventListener("click", () => openBuildLab(game.state, "forge"));
  btnCharacter.addEventListener("click", () => openCharacterMenu(game.state, 'overview'));
  el.buildCoreBtn.addEventListener("click", () => {
    if (game.state?._hubResumeRunActive) return;
    openBasicSelector(game.state);
  });
  el.buildResetBtn.addEventListener("click", () => {
    const state = game.state;
    const prog = state?.progression;
    if (!prog) return;
    applyActiveHeroToLegacyProgression(prog);
    persistHubState(state, "Canonical hero runtime mirrored.");
    renderBuildLab(state, true);
  });
  el.buildExchangeMode.addEventListener("change", () => renderBuildLab(game.state, true));
  el.buildExchangeFrom.addEventListener("change", () => renderBuildLab(game.state, true));
  el.buildExchangeTo.addEventListener("change", () => renderBuildLab(game.state, true));
  el.buildExchangeBtn.addEventListener("click", () => {
    const state = game.state;
    const prog = state?.progression;
    if (!prog) return;
    const fromKey = String(el.buildExchangeFrom?.value || "");
    const toKey = String(el.buildExchangeTo?.value || "");
    const mode = String(el.buildExchangeMode?.value || 'essence').trim().toLowerCase() === 'dust' ? 'dust' : 'essence';
    const rate = mode === 'dust' ? RACE_DUST_EXCHANGE_RATE : ESSENCE_EXCHANGE_RATE;
    const ok = mode === 'dust'
      ? exchangeRaceDust(prog, fromKey, toKey, rate)
      : exchangeEssence(prog, fromKey, toKey, rate);
    if (!ok) {
      setShopMsg(`Need ${rate} source ${mode}.`);
      renderBuildLab(state, true);
      return;
    }
    const fromLabel = (ESSENCE_META[fromKey] || ESSENCE_META.mecha).short;
    const toLabel = (ESSENCE_META[toKey] || ESSENCE_META.mecha).short;
    persistHubState(state, `${rate} ${fromLabel} ${mode === 'dust' ? 'Dust' : 'Essence'} → 1 ${toLabel} ${mode === 'dust' ? 'Dust' : 'Essence'}`);
    renderBuildLab(state, true);
  });

  rerollBtn.addEventListener("click", () => {
    const state = game.state;
    const prog = state?.progression;
    if (!prog) return;
    ensureShopMeta(prog);
    const cost = 10 + (_shopRerollLocal | 0) * 5;
    if ((prog.coins | 0) < cost) {
      setShopMsg("Not enough gold.");
      return;
    }
    prog.coins = Math.max(0, (prog.coins | 0) - cost);
    rerollShopOffers(prog);
    _shopRerollLocal = (_shopRerollLocal | 0) + 1;
    try { saveProgression(prog); } catch {}
    sendHubMeta(state);
    setShopMsg("Rerolled!");
    resetMerchantRenderKey();
    renderMerchantShop(state, { el, make, setShopMsg, persistHubState, renderWalletBar, openCharacterMenu });
  });

  // Interact button click
  el.interactBtn.addEventListener("click", () => {
    const state = game.state;
    const n = state?._hubNearbyNpc;
    if (!n) return;
    if (n.kind === "shop") openShop(state);
    else if (n.kind === "tier") openTier(state);
    else if (n.kind === "basic") openBasicSelector(state);
    else if (n.kind === "arsenal") openBuildLab(state, "arsenal");
    else if (n.kind === "essence") openBuildLab(state, "essence");
    else if (n.kind === "mastery") openBuildLab(state, "mastery");
    else if (n.kind === "reset") { if (typeof state._clearSavedRunCheckpoint === "function") state._clearSavedRunCheckpoint(); state._hubResumeNextFloor = 0; state._hubResumeRunActive = false; state._savedRunResumePlan = null; if (state.popups) state.popups.push({ text: "Arena floor reset • Progress kept", time: 2.2 }); }
    else if (n.kind === "forge") openBuildLab(state, "forge");
  });

  // Keyboard: E to interact, Esc to close overlays.
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const state = game.state;
    if (!state || state.mode !== "playing") return;
    if (isTypingFocus()) return;

    if (e.code === "Escape") {
      if (state.overlayMode === "shop") {
        closeShop(state);
        e.preventDefault();
      } else if (state.overlayMode === "basic") {
        closeBasicSelector(state);
        e.preventDefault();
      } else if (state.overlayMode === "build") {
        closeBuildLab(state);
        e.preventDefault();
      } else if (state.overlayMode === "character") {
        closeCharacterMenu(state);
        e.preventDefault();
      } else if (state.overlayMode === "stats") {
        state.overlayMode = null;
        e.preventDefault();
      }
      return;
    }

    if (e.code === "KeyC") {
      if (state.overlayMode === 'character') closeCharacterMenu(state);
      else if (!state.overlayMode) openCharacterMenu(state, 'overview');
      e.preventDefault();
      return;
    }

    if (e.code === "KeyE") {
      if (state.overlayMode) return;
      const n = state._hubNearbyNpc;
      if (!n) return;
      if (n.kind === "shop") openShop(state);
      else if (n.kind === "tier") openTier(state);
      else if (n.kind === "basic") openBasicSelector(state);
      else if (n.kind === "arsenal") openBuildLab(state, "arsenal");
      else if (n.kind === "essence") openBuildLab(state, "essence");
      else if (n.kind === "mastery") openBuildLab(state, "mastery");
    else if (n.kind === "reset") { if (typeof state._clearSavedRunCheckpoint === "function") state._clearSavedRunCheckpoint(); state._hubResumeNextFloor = 0; state._hubResumeRunActive = false; state._savedRunResumePlan = null; if (state.popups) state.popups.push({ text: "Arena floor reset • Progress kept", time: 2.2 }); }
      else if (n.kind === "forge") openBuildLab(state, "forge");
      e.preventDefault();
    }
  });
}

export function tickHubNpcDom(state) {
  if (!_inited || !state) return;

  // Tap interaction from canvas (mobile): gameLoop can set this flag.
  if (state._hubNpcTap && !state.overlayMode) {
    const k = String(state._hubNpcTap);
    state._hubNpcTap = null;
    if (k === "shop") openShop(state);
    else if (k === "tier") openTier(state);
    else if (k === "basic") openBasicSelector(state);
    else if (k === "arsenal") openBuildLab(state, "arsenal");
    else if (k === "essence") openBuildLab(state, "essence");
    else if (k === "mastery") openBuildLab(state, "mastery");
    else if (k === "reset") { if (typeof state._clearSavedRunCheckpoint === "function") state._clearSavedRunCheckpoint(); state._hubResumeNextFloor = 0; state._hubResumeRunActive = false; state._savedRunResumePlan = null; if (state.popups) state.popups.push({ text: "Arena floor reset • Progress kept", time: 2.2 }); }
    else if (k === "forge") openBuildLab(state, "forge");
  }

  const inHub = !!isHubPreviewState(state);
  const showInteract = state.mode === "playing" && !state.overlayMode && !!state._hubNearbyNpc;
  if (el.interactWrap) el.interactWrap.style.display = showInteract ? "block" : "none";
  const showHubNav = state.mode === "playing" && inHub && (!state.overlayMode || state.overlayMode === 'character');
  if (el.hubNavBar) el.hubNavBar.style.display = showHubNav ? "flex" : "none";
  const showHubHudWallet = state.mode === "playing" && inHub && !state.overlayMode;
  if (el.hubHudWallet) {
    el.hubHudWallet.style.display = showHubHudWallet ? "block" : "none";
    if (showHubHudWallet) {
      renderWalletBar(el.hubHudWallet, state.progression, { compact: true, showCardEconomy: true, align: 'left' });
      const row = el.hubHudWallet.firstElementChild;
      if (row && row.style) {
        row.style.flexWrap = 'nowrap';
        row.style.minWidth = 'max-content';
        row.style.justifyContent = 'flex-start';
      }
    }
  }
  if (showHubNav && el.hubNavButtons) {
    const currentTab = String(state._characterMenuTab || 'overview');
    for (const [tabKey, btn] of Object.entries(el.hubNavButtons)) {
      const active = currentTab === tabKey && state.overlayMode === 'character';
      btn.style.borderColor = active ? 'rgba(255,216,122,0.56)' : 'rgba(255,255,255,0.12)';
      btn.style.background = active ? 'linear-gradient(180deg, rgba(112,78,18,0.98), rgba(58,42,12,0.98))' : 'linear-gradient(180deg, rgba(23,28,42,0.98), rgba(12,16,24,0.98))';
      btn.style.color = active ? '#fff0c8' : '#d8e5ff';
    }
  }

  if (showInteract && el.interactBtn) {
    const n = state._hubNearbyNpc;
    const labelMap = {
      shop: "Shop (E)",
      tier: "Death Shop~Up (E)",
      basic: state._hubResumeRunActive ? "Biome Locked" : "Hero Biome (E)",
      arsenal: "Arsenal Wing (E)",
      essence: "Essence Conflux (E)",
      mastery: "Mastery Archive (E)",
      reset: "Reset Expedition (E)",
      forge: "Forge Wing (E)",
    };
    el.interactBtn.textContent = labelMap[n.kind] || "Interact (E)";
  }

  // Shop overlay visibility
  const showShop = state.overlayMode === "shop";
  if (el.shopOverlay) el.shopOverlay.style.display = showShop ? "flex" : "none";
  if (showShop) renderMerchantShop(state, { el, make, setShopMsg, persistHubState, renderWalletBar });

  const showBasic = state.overlayMode === "basic";
  if (el.basicOverlay) el.basicOverlay.style.display = showBasic ? "flex" : "none";
  if (showBasic) renderBasicSelectorView(state, { el, make, persistHubState, renderBuildLab });

  const showBuild = state.overlayMode === "build";
  if (el.buildOverlay) el.buildOverlay.style.display = showBuild ? "flex" : "none";
  if (showBuild) renderBuildLab(state);

  const showCharacter = state.overlayMode === 'character';
  if (el.characterOverlay) el.characterOverlay.style.display = showCharacter ? 'flex' : 'none';
  if (showCharacter) renderCharacterMenu(state);
}