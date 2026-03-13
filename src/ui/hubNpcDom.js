// Hub NPC interactions (DOM): show an interact button on mobile + a Shop modal during gameplay.
// Keeps systems intact; only adds UI to access existing meta shop from inside the Hub.

import { saveProgression } from "../core/progression.js";
import {
  ensureShopMeta,
  ensureShopOffers,
  rerollShopOffers,
  replaceOfferSlot,
  getItemById,
  getMetaLevel,
  setMetaLevel,
  getPriceFor,
  getMaxMetaLevel,
} from "../meta/shopMeta.js";

let _inited = false;
let el = {};
let _shopRenderKey = "";
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
  if (!el.shopMsg) return;
  el.shopMsg.textContent = msg || "";
  if (msg) {
    clearTimeout(setShopMsg._t);
    setShopMsg._t = setTimeout(() => {
      if (el.shopMsg) el.shopMsg.textContent = "";
    }, 1200);
  }
}

function openShop(state) {
  if (!state?.progression) return;
  ensureShopMeta(state.progression);
  ensureShopOffers(state.progression);

  state.overlayMode = "shop";
  if (el.shopOverlay) el.shopOverlay.style.display = "flex";
  _shopRenderKey = "";
  renderShop(state);
}

function closeShop(state) {
  if (el.shopOverlay) el.shopOverlay.style.display = "none";
  if (state && state.overlayMode === "shop") state.overlayMode = null;
}

function openTier(state) {
  // Tier/Meta upgrades screen (canvas). Use overlayMode so co-op host sim keeps running.
  state.overlayMode = "stats";
  // Close shop if open
  closeShop(state);
}


function maybeSendMeta(state) {
  const net = state?.net;
  const prog = state?.progression;
  if (!net || net.status !== "connected" || net.isHost) return;
  if (!prog) return;
  try {
    net.sendMeta({
      nickname: prog.nickname || "Player",
      avatarIndex: prog.avatarIndex || 0,
      resurrectedTier: prog.resurrectedTier || 1,
      totalScore: prog.totalScore || 0,
      upgradePoints: prog.upgradePoints || 0,
      limits: prog.limits || {},
      skillMeta: prog.skillMeta || {},
    });
  } catch {}
}

function renderShop(state) {
  const prog = state?.progression;
  if (!prog) return;
  ensureShopMeta(prog);
  ensureShopOffers(prog);

  if (el.shopCoins) el.shopCoins.textContent = String(prog.coins | 0);

  const rerollCost = 10 + (_shopRerollLocal | 0) * 5;
  if (el.shopRerollCost) el.shopRerollCost.textContent = String(rerollCost);

  const offers = prog.shopOffers || { active: [], passive: [], newSkills: [] };
  const key = JSON.stringify(offers) + "|" + (prog.coins | 0) + "|" + rerollCost;
  if (key === _shopRenderKey) return;
  _shopRenderKey = key;

  const renderRow = (container, kind, ids) => {
    if (!container) return;
    container.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      const id = ids[i];
      const it = id ? getItemById(id) : null;
      const metaLvl = id ? getMetaLevel(prog, id) : 0;
      const price = id ? getPriceFor(id, metaLvl) : 0;
      const maxLvl = getMaxMetaLevel();

      const card = make("div", { className: "shopCard" });

      const top = make("div", { className: "top" });
      const name = make("div", { className: "name", text: it ? it.name : "—" });
      const lvl = make("div", { className: "lvl", text: `Lv ${metaLvl}/${maxLvl}` });
      top.appendChild(name);
      top.appendChild(lvl);

      const buyRow = make("div", { className: "buyRow" });
      const priceEl = make("div", { className: "price", text: `Cost: ${price} 🪙` });
      buyRow.appendChild(priceEl);

      const btn = make("button", { type: "button", className: "btn", text: metaLvl <= 0 ? "Buy (unlock)" : "Upgrade" });
      const disabled = !it || metaLvl >= maxLvl || (prog.coins | 0) < price;
      btn.disabled = disabled;

      if (metaLvl >= maxLvl) {
        btn.textContent = "MAX";
        priceEl.textContent = "MAX";
      } else if ((prog.coins | 0) < price) {
        btn.title = "Not enough coins";
      }

      btn.addEventListener("click", () => {
        if (!it) return;
        ensureShopMeta(prog);
        const cur = getMetaLevel(prog, id);
        const cost = getPriceFor(id, cur);
        if ((prog.coins | 0) < cost) {
          setShopMsg("Not enough coins.");
          return;
        }
        if (cur >= maxLvl) return;

        prog.coins = Math.max(0, (prog.coins | 0) - cost);
        setMetaLevel(prog, id, cur + 1);

        replaceOfferSlot(prog, kind, i);

        _shopRerollLocal = 0;
        try { saveProgression(prog); } catch {}
        maybeSendMeta(state);
        setShopMsg("Purchased!");
        _shopRenderKey = "";
        renderShop(state);
      });

      card.appendChild(top);
      card.appendChild(buyRow);
      card.appendChild(btn);
      container.appendChild(card);
    }
  };

  renderRow(el.shopGridActive, "active", offers.active || []);
  renderRow(el.shopGridPassive, "passive", offers.passive || []);
  renderRow(el.shopGridNew, "new", offers.newSkills || []);
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
      pointerEvents: "none",
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
  coinsInfo.innerHTML = "<b>Coins:</b> <span id=\"hubShopCoins\">0</span> <span class=\"muted\">🪙</span>";
  topRow.appendChild(coinsInfo);

  const rerollBtn = make("button", { className: "btn", id: "btnHubShopReroll", type: "button", style: { padding: "8px 10px", whiteSpace: "nowrap" } });
  rerollBtn.innerHTML = "Reroll (<span id=\"hubShopRerollCost\">10</span>)";
  topRow.appendChild(rerollBtn);

  const msg = make("div", { className: "muted", id: "hubShopMsg", style: { minHeight: "16px", marginTop: "6px" } });

  panel.appendChild(header);
  panel.appendChild(topRow);
  panel.appendChild(msg);

  panel.appendChild(make("div", { className: "shopLabel", text: "Прокачка" }));
  panel.appendChild(make("div", { className: "shopGrid", id: "hubShopGridActive" }));

  panel.appendChild(make("div", { className: "shopLabel", text: "Пассивки", style: { marginTop: "10px" } }));
  panel.appendChild(make("div", { className: "shopGrid", id: "hubShopGridPassive" }));

  panel.appendChild(make("div", { className: "shopLabel", text: "Новые скиллы", style: { marginTop: "10px" } }));
  panel.appendChild(make("div", { className: "shopGrid", id: "hubShopGridNew" }));

  panel.appendChild(make("div", { className: "muted", style: { marginTop: "10px", fontSize: "12px", opacity: "0.85" }, text: "Подойди к NPC в хабе и нажми E/Interact. Покупка открывает/прокачивает скиллы навсегда." }));

  el.shopOverlay.appendChild(panel);
  document.body.appendChild(el.shopOverlay);

  // Bind elements
  el.shopCoins = panel.querySelector("#hubShopCoins");
  el.shopRerollCost = panel.querySelector("#hubShopRerollCost");
  el.shopMsg = panel.querySelector("#hubShopMsg");
  el.shopGridActive = panel.querySelector("#hubShopGridActive");
  el.shopGridPassive = panel.querySelector("#hubShopGridPassive");
  el.shopGridNew = panel.querySelector("#hubShopGridNew");

  rerollBtn.addEventListener("click", () => {
    const state = game.state;
    const prog = state?.progression;
    if (!prog) return;
    ensureShopMeta(prog);
    const cost = 10 + (_shopRerollLocal | 0) * 5;
    if ((prog.coins | 0) < cost) {
      setShopMsg("Not enough coins.");
      return;
    }
    prog.coins = Math.max(0, (prog.coins | 0) - cost);
    rerollShopOffers(prog);
    _shopRerollLocal = (_shopRerollLocal | 0) + 1;
    try { saveProgression(prog); } catch {}
    maybeSendMeta(state);
    setShopMsg("Rerolled!");
    _shopRenderKey = "";
    renderShop(state);
  });

  // Interact button click
  el.interactBtn.addEventListener("click", () => {
    const state = game.state;
    const n = state?._hubNearbyNpc;
    if (!n) return;
    if (n.kind === "shop") openShop(state);
    else if (n.kind === "tier") openTier(state);
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
      } else if (state.overlayMode === "stats") {
        state.overlayMode = null;
        e.preventDefault();
      }
      return;
    }

    if (e.code === "KeyE") {
      if (state.overlayMode) return;
      const n = state._hubNearbyNpc;
      if (!n) return;
      if (n.kind === "shop") openShop(state);
      else if (n.kind === "tier") openTier(state);
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
  }

  const showInteract = state.mode === "playing" && !state.overlayMode && !!state._hubNearbyNpc;
  if (el.interactWrap) el.interactWrap.style.display = showInteract ? "block" : "none";

  if (showInteract && el.interactBtn) {
    const n = state._hubNearbyNpc;
    el.interactBtn.textContent = n.kind === "tier" ? "Tier / Upgrades (E)" : "Shop (E)";
  }

  // Shop overlay visibility
  const showShop = state.overlayMode === "shop";
  if (el.shopOverlay) el.shopOverlay.style.display = showShop ? "flex" : "none";
  if (showShop) renderShop(state);
}
