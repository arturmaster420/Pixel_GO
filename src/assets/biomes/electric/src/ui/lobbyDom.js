// DOM-based Lobby UI (Pixel PVP style) for Pixel PVE.
// Keeps existing gameplay/net systems intact; this only drives the menu overlay.

import { saveProgression, getStartLevel } from "../core/progression.js";
import { AVATARS, getUnlockedAvatarCount, isAvatarUnlocked } from "../core/avatars.js";
import { AURA_NAMES, clampAuraId } from "../core/auras.js";
import { getDefaultWsUrl } from "../net/netClient.js";
import { ensureShopMeta, ensureShopOffers, rerollShopOffers, replaceOfferSlot, getItemById, getMetaLevel, setMetaLevel, getPriceFor, getMaxMetaLevel } from "../meta/shopMeta.js";

let _inited = false;
let _game = null;
let el = {};
let _lastUnlockedCount = -1;
let _pendingNetAction = null;
let _pendingNetActionSeq = 0;
let _openHookWs = null;
let _shopRenderKey = "";
let _shopRerollLocal = 0;

function $(id) {
  return document.getElementById(id);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function fmtRoom(v) {
  return (v || "")
    .toString()
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

function setTab(tab) {
  const isProfile = tab === "profile";
  const isRecords = tab === "records";
  const isShop = tab === "shop";

  el.tabProfileBtn?.classList.toggle("sel", isProfile);
  el.tabRecordsBtn?.classList.toggle("sel", isRecords);
  el.tabShopBtn?.classList.toggle("sel", isShop);

  if (el.profileTabProfile) el.profileTabProfile.style.display = isProfile ? "block" : "none";
  if (el.profileTabRecords) el.profileTabRecords.style.display = isRecords ? "block" : "none";
  if (el.profileTabShop) el.profileTabShop.style.display = isShop ? "block" : "none";
}

function buildAvatarButtons(state) {
  if (!el.avatarButtons) return;
  el.avatarButtons.innerHTML = "";

  const unlockedCount = getUnlockedAvatarCount(state.progression);
  _lastUnlockedCount = unlockedCount;

  for (let i = 0; i < AVATARS.length; i++) {
    const emoji = AVATARS[i];
    const unlocked = isAvatarUnlocked(state.progression, i);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn avbtn" + (unlocked ? "" : " locked") + ((state.progression.avatarIndex|0) === i ? " sel" : "");
    b.textContent = emoji;
    b.title = unlocked ? `Avatar ${i + 1}` : `Locked (${unlockedCount}/${AVATARS.length})`;
    b.addEventListener("click", () => {
      if (!unlocked) return;
      state.progression.avatarIndex = i;
      try { saveProgression(state.progression); } catch {}
      // reflect selection
      const kids = el.avatarButtons.querySelectorAll(".avbtn");
      kids.forEach((k) => k.classList.remove("sel"));
      b.classList.add("sel");
      if (el.profileAvatarPreview) el.profileAvatarPreview.textContent = AVATARS[i] || "🙂";
    });
    el.avatarButtons.appendChild(b);
  }
}

function connectAndDo(state, action) {
  const net = state.net;
  if (!net) return;

  // Pull latest values from UI (so user doesn't have to press Apply).
  try {
    if (state.progression) {
      state.progression.nickname = (el.nameInput?.value || state.progression.nickname || "Player")
        .toString()
        .trim()
        .slice(0, 16) || "Player";
      state.progression.roomCode = fmtRoom(el.roomCodeInput?.value || state.progression.roomCode || "");
      if (el.roomCodeInput) el.roomCodeInput.value = state.progression.roomCode;
      if (el.nameInput) el.nameInput.value = state.progression.nickname;
      try { saveProgression(state.progression); } catch {}
    }
  } catch {}

  const nickname = (state.progression?.nickname || "Player").toString().slice(0, 16);
  const avatarIndex = state.progression?.avatarIndex || 0;
  const auraId = state.progression?.auraId || 0;
  const roomCode = state.progression?.roomCode || "";

  // Remember the latest requested action.
  // This prevents "double host/join" if the user clicks buttons while WS is still connecting.
  const seq = ++_pendingNetActionSeq;
  _pendingNetAction = { seq, action, nickname, avatarIndex, auraId, roomCode };

  const runAction = (req) => {
    if (!req) return;
    try {
      if (req.action === "host") net.host(req.roomCode, req.nickname, req.avatarIndex, req.auraId);
      else if (req.action === "join") net.join(req.roomCode, req.nickname, req.avatarIndex, req.auraId);
      else net.fastJoin(req.nickname, req.avatarIndex, req.auraId);
    } catch {}
  };

  net.connect(getDefaultWsUrl());

  if (net.ws && net.ws.readyState === 1) {
    const req = _pendingNetAction;
    _pendingNetAction = null;
    runAction(req);
  } else {
    const ws = net.ws;
    if (ws && ws !== _openHookWs) {
      _openHookWs = ws;
      ws.addEventListener("open", () => {
        const req = _pendingNetAction;
        _pendingNetAction = null;
        runAction(req);
      }, { once: true });
    }
  }
}


export function initLobbyDom(game) {
  if (_inited) return;
  _inited = true;
  _game = game;

  el.lobby = $("lobby");
  el.lobbyPingMini = $("lobbyPingMini");
  el.btnMenuFullscreen = $("btnMenuFullscreen");
  el.btnMenuHelp = $("btnMenuHelp");

  el.tabProfileBtn = $("tabProfileBtn");
  el.tabRecordsBtn = $("tabRecordsBtn");
  el.tabShopBtn = $("tabShopBtn");
  el.profileTabProfile = $("profileTabProfile");
  el.profileTabRecords = $("profileTabRecords");
  el.profileTabShop = $("profileTabShop");

  el.profCoins = $("profCoins");
  el.shopCoins = $("shopCoins");
  el.shopMsg = $("shopMsg");
  el.shopGridActive = $("shopGridActive");
  el.shopGridPassive = $("shopGridPassive");
  el.shopGridNew = $("shopGridNew");
  el.btnShopReroll = $("btnShopReroll");
  el.shopRerollCost = $("shopRerollCost");

  el.profileAvatarPreview = $("profileAvatarPreview");
  el.auraSelect = $("auraSelect");
  el.nameInput = $("nameInput");
  el.profLevel = $("profLevel");
  el.profXp = $("profXp");
  el.profAv = $("profAv");
  el.profXpBar = $("profXpBar");
  el.profNext = $("profNext");
  el.profAvatarHint = $("profAvatarHint");
  el.avatarButtons = $("avatarButtons");
  el.btnJoinLeft = $("btnJoinLeft");

  el.recTotalScore = $("recTotalScore");
  el.recRTier = $("recRTier");
  el.recUp = $("recUp");

  el.roomCodeInput = $("roomCodeInput");
  el.btnRoomApply = $("btnRoomApply");
  el.btnCopyInvite = $("btnCopyInvite");
  el.roomCodeStatus = $("roomCodeStatus");
  el.joinError = $("joinError");
  el.lobbyPlayers = $("lobbyPlayers");
  el.lobbyInfo = $("lobbyInfo");

  el.btnHost = $("btnHost");
  el.btnJoinRun = $("btnJoinRun");
  el.btnFastJoin = $("btnFastJoin");
  el.btnStart = $("btnStart");
  el.btnDisconnect = $("btnDisconnect");

  el.netStatus = $("netStatus");
  el.netRoom = $("netRoom");
  el.netPlayers = $("netPlayers");

  // Tabs
  el.tabProfileBtn?.addEventListener("click", () => setTab("profile"));
  el.tabRecordsBtn?.addEventListener("click", () => setTab("records"));
  el.tabShopBtn?.addEventListener("click", () => setTab("shop"));

  // Fullscreen
  el.btnMenuFullscreen?.addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {}
  });

  // Help
  el.btnMenuHelp?.addEventListener("click", () => {
    alert(
      "Pixel PVE\n\nHost / Join / Fast-Join: подключение к кооп-серверу (ws relay 8080).\nStart: оффлайн запуск (fallback).\n\nMobile: 1-Hand (вертикально), PC: 2-Hand."
    );
  });

  // Profile input
  if (el.nameInput) {
    el.nameInput.addEventListener("input", () => {
      const s = (el.nameInput.value || "").toString().trim().slice(0, 16);
      if (_game?.state?.progression) _game.state.progression.nickname = s || "Player";
    });
  }

  // Aura select (cosmetic only; all auras are selectable)
  if (el.auraSelect) {
    el.auraSelect.addEventListener("change", () => {
      const state = _game?.state;
      if (!state || !state.progression) return;
      state.progression.auraId = clampAuraId(Number(el.auraSelect.value) | 0);
      try { saveProgression(state.progression); } catch {}
    });
  }

  // Apply profile
  el.btnJoinLeft?.addEventListener("click", () => {
    const state = _game?.state;
    if (!state || !state.progression) return;
    // sanitize
    state.progression.nickname = (state.progression.nickname || "Player").toString().trim().slice(0, 16) || "Player";
    state.progression.avatarIndex = state.progression.avatarIndex | 0;
    try { saveProgression(state.progression); } catch {}

    // update server profile if connected
    try {
      if (state.net && state.net.status === "connected") {
        state.net.setProfile(state.progression.nickname, state.progression.avatarIndex, state.progression.auraId|0);
      }
    } catch {}
  });

  // Room code apply (just save; actual Join/Host buttons will connect)
  el.btnRoomApply?.addEventListener("click", () => {
    const state = _game?.state;
    if (!state || !state.progression) return;
    state.progression.roomCode = fmtRoom(el.roomCodeInput?.value || "");
    if (el.roomCodeInput) el.roomCodeInput.value = state.progression.roomCode;
    try { saveProgression(state.progression); } catch {}
  });

  // Invite link
  el.btnCopyInvite?.addEventListener("click", async () => {
    const state = _game?.state;
    const room = (state?.net?.roomCode || state?.progression?.roomCode || "").toString();
    const url = `${location.origin}/?code=${encodeURIComponent(room)}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        prompt("Invite link", url);
      }
    } catch {
      prompt("Invite link", url);
    }
  });


  // Shop reroll
  el.btnShopReroll?.addEventListener("click", () => {
    const state = _game?.state;
    const prog = state?.progression;
    if (!prog) return;
    ensureShopMeta(prog);
    const cost = 10 + (_shopRerollLocal | 0) * 5;
    if ((prog.coins | 0) < cost) {
      setShopMsg("Not enough coins for reroll.");
      return;
    }
    prog.coins = Math.max(0, (prog.coins | 0) - cost);
    _shopRerollLocal++;
    rerollShopOffers(prog);
    try { saveProgression(prog); } catch {}
    setShopMsg("Rerolled.");
    _shopRenderKey = "";
  });
  // Network actions
  el.btnHost?.addEventListener("click", () => {
    const state = _game?.state;
    if (!state) return;
    connectAndDo(state, "host");
  });
  el.btnJoinRun?.addEventListener("click", () => {
    const state = _game?.state;
    if (!state) return;
    connectAndDo(state, "join");
  });
  el.btnFastJoin?.addEventListener("click", () => {
    const state = _game?.state;
    if (!state) return;
    connectAndDo(state, "fastJoin");
  });

  // Fallback start (offline)
  el.btnStart?.addEventListener("click", () => {
    const state = _game?.state;
    if (!state) return;
    _pendingNetAction = null;
    _openHookWs = null;
    try { state.net?.disconnect?.(); } catch {}
    if (typeof _game?.startOfflineRun === "function") {
      _game.startOfflineRun();
    } else {
      // worst-case fallback: just enter playing on the preview run
      state.mode = "playing";
    }
  });

  el.btnDisconnect?.addEventListener("click", () => {
    const state = _game?.state;
    _pendingNetAction = null;
    _openHookWs = null;
    try { state?.net?.disconnect?.(); } catch {}
  });
}


function setShopMsg(text) {
  if (!el.shopMsg) return;
  el.shopMsg.textContent = text ? String(text) : "";
}

function renderShop(state) {
  const prog = state?.progression;
  if (!prog) return;
  ensureShopMeta(prog);
  ensureShopOffers(prog);

  // Update coins display
  if (el.profCoins) el.profCoins.textContent = String(prog.coins | 0);
  if (el.shopCoins) el.shopCoins.textContent = String(prog.coins | 0);

  const rerollCost = 10 + (_shopRerollLocal | 0) * 5;
  if (el.shopRerollCost) el.shopRerollCost.textContent = String(rerollCost);

  const offers = prog.shopOffers || { active: [], passive: [], newSkills: [] };

  // Re-render only when needed
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

      const card = document.createElement("div");
      card.className = "shopCard";

      const top = document.createElement("div");
      top.className = "top";
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = it ? it.name : "—";
      const lvl = document.createElement("div");
      lvl.className = "lvl";
      lvl.textContent = `Lv ${metaLvl}/${maxLvl}`;
      top.appendChild(name);
      top.appendChild(lvl);

      const buyRow = document.createElement("div");
      buyRow.className = "buyRow";
      const priceEl = document.createElement("div");
      priceEl.className = "price";
      priceEl.textContent = `Cost: ${price} 🪙`;
      buyRow.appendChild(priceEl);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      const label = metaLvl <= 0 ? "Buy (unlock)" : "Upgrade";
      btn.textContent = label;

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

        // Replace slot with a new random offer of the same kind.
        replaceOfferSlot(prog, kind, i);

        // Reset local reroll cost ramp after purchase.
        _shopRerollLocal = 0;

        try { saveProgression(prog); } catch {}
        setShopMsg("Purchased!");
        _shopRenderKey = ""; // force redraw
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


export function tickLobbyDom(state) {
  if (!_inited || !state) return;

  const show = state.mode === "startMenu";
  if (el.lobby) el.lobby.style.display = show ? "flex" : "none";
  if (!show) return;

  // Ensure progression defaults
  if (!state.progression) return;
  if (!state.progression.nickname) state.progression.nickname = "Player";
  if (typeof state.progression.avatarIndex !== "number") state.progression.avatarIndex = 0;
  if (typeof state.progression.auraId !== "number") state.progression.auraId = 0;
  if (typeof state.progression.roomCode !== "string") state.progression.roomCode = "";

  // Keep inputs in sync (but don't fight user while typing)
  if (el.nameInput && document.activeElement !== el.nameInput) {
    el.nameInput.value = state.progression.nickname;
  }
  if (el.roomCodeInput && document.activeElement !== el.roomCodeInput) {
    el.roomCodeInput.value = state.progression.roomCode;
  }

  // Profile preview
  if (el.profileAvatarPreview) {
    el.profileAvatarPreview.textContent = AVATARS[state.progression.avatarIndex] || "🙂";
  }

  // Aura select (all auras available)
  state.progression.auraId = clampAuraId(state.progression.auraId | 0);
  if (el.auraSelect) {
    if (!el.auraSelect.options || el.auraSelect.options.length !== AURA_NAMES.length) {
      el.auraSelect.innerHTML = "";
      for (let i = 0; i < AURA_NAMES.length; i++) {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = AURA_NAMES[i];
        el.auraSelect.appendChild(opt);
      }
    }
    if (document.activeElement !== el.auraSelect) {
      el.auraSelect.value = String(state.progression.auraId | 0);
    }
  }

  // Level/XP computed from totalScore (same logic as game progression start level)
  const totalScore = state.progression.totalScore || 0;
  const lvl = Math.max(1, (getStartLevel(state.progression) || 0) + 1);
  const xpInLevel = ((totalScore % 1000) + 1000) % 1000;
  const xpToNext = 1000 - xpInLevel;
  const xpPct = xpInLevel / 1000;
  if (el.profLevel) el.profLevel.textContent = String(lvl);
  if (el.profXp) el.profXp.textContent = String(xpInLevel);
  if (el.profNext) el.profNext.textContent = `Next: ${xpToNext}`;
  if (el.profXpBar) el.profXpBar.style.width = `${Math.round(clamp(xpPct, 0, 1) * 100)}%`;

  const unlocked = getUnlockedAvatarCount(state.progression);
  if (el.profAv) el.profAv.textContent = `${unlocked}/${AVATARS.length}`;
  if (el.profAvatarHint) el.profAvatarHint.textContent = `(unlocked ${unlocked}/${AVATARS.length})`;

  // Records summary
  if (el.recTotalScore) el.recTotalScore.textContent = String(totalScore);
  if (el.recRTier) el.recRTier.textContent = String(state.progression.resurrectedTier || 1);
  if (el.recUp) el.recUp.textContent = String(state.progression.upgradePoints || 0);

  // Build avatars once, and rebuild if unlock count changes
  if (el.avatarButtons && (_lastUnlockedCount < 0 || _lastUnlockedCount !== unlocked)) {
    buildAvatarButtons(state);
  }

  // Shop (coins + offers)
  renderShop(state);

  // Net info
  const net = state.net;
  const players = Array.isArray(net?.roomPlayers) ? net.roomPlayers : [];
  const count = players.length || (net?.status === "connected" ? 1 : 0);
  const max = net?.maxPlayers || 7;
  const room = (net?.roomCode || state.progression.roomCode || "").toString();

  if (el.netStatus) el.netStatus.textContent = net?.status || "offline";
  if (el.netRoom) el.netRoom.textContent = room ? room : "—";
  if (el.netPlayers) el.netPlayers.textContent = `${count}/${max}`;

  if (el.lobbyPlayers) {
    el.lobbyPlayers.textContent = `Players on map: ${count}/${max}`;
  }

  if (el.roomCodeStatus) {
    el.roomCodeStatus.textContent = room ? `Room ${room}` : "Public lobby";
  }

  if (el.joinError) {
    el.joinError.textContent = net?.error ? String(net.error) : "";
  }

  if (el.lobbyInfo) {
    if (!net || net.status === "offline") {
      el.lobbyInfo.textContent = "Offline. Press Start or connect via Host/Join/Fast-Join.";
    } else if (net.status === "connecting") {
      el.lobbyInfo.textContent = "Connecting...";
    } else if (net.status === "connected") {
      el.lobbyInfo.textContent = net.isHost ? "Connected (Host)." : "Connected (Join).";
    } else {
      el.lobbyInfo.textContent = net.status;
    }
  }

  // Ping mini (only show if we have a value)
  if (el.lobbyPingMini) {
    const pm = net?.pingMs;
    if (typeof pm === "number" && pm > 0) {
      el.lobbyPingMini.style.display = "inline-flex";
      el.lobbyPingMini.textContent = `Ping: ${pm}`;
    } else {
      el.lobbyPingMini.style.display = "none";
    }
  }
}
