// Pixel_GO v0.4 — Floor NPC terminal overlay.
// Reuses the same style language as runUpgradeDom, but:
// - Shows Skill Points and SP cost per card
// - Doesn't assume it's a level-up screen

let root = null;
let onPick = null;
let onClose = null;
let onReroll = null;
let lastChoices = null;
let _closingByPick = false;

function ensureDom() {
  if (root) return root;
  if (typeof document === "undefined") return null;

  const style = document.createElement("style");
  style.textContent = `
    #floorShopOverlay{ position:fixed; inset:0; display:none; align-items:center; justify-content:center; z-index:65;
      background: rgba(0,0,0,0.55); backdrop-filter: blur(3px); }
    #floorShopOverlay .panel{ width:min(980px, 96vw); max-height: 92vh; overflow:auto;
      border:1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 14px 16px;
      background: rgba(12,16,22,0.92); box-shadow: 0 12px 50px rgba(0,0,0,0.45); }
    #floorShopOverlay .head{ display:flex; justify-content:space-between; align-items:flex-end; gap:12px; }
    #floorShopOverlay h2{ margin:0; font-size: 18px; }
    #floorShopOverlay .muted{ opacity:0.75; font-size:12px; line-height:1.25; }
    #floorShopOverlay .cards{ display:flex; gap: 12px; margin-top: 12px; flex-wrap: wrap; }
    #floorShopOverlay .card{ flex: 1; min-width: 240px; border-radius: 12px; padding: 12px 12px;
      border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.03);
      cursor:pointer; user-select:none; }
    #floorShopOverlay .card:hover{ background: rgba(120,170,255,0.10); border-color: rgba(200,220,255,0.22); }
    #floorShopOverlay .card.disabled{ opacity:0.55; cursor:default; }
    #floorShopOverlay .card.disabled:hover{ background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.14); }
    #floorShopOverlay .titleRow{ display:flex; align-items:baseline; justify-content:space-between; gap: 8px; }
    #floorShopOverlay .name{ font-size: 14px; font-weight: 700; }
    #floorShopOverlay .lvl{ font-size: 12px; opacity: 0.8; }
    #floorShopOverlay .tag{ display:inline-flex; align-items:center; gap:6px; margin-top:6px; padding:2px 8px; border-radius:999px; font-size:11px; opacity:.92; border:1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); }
    .tag.standard{ background: rgba(120,180,255,0.10); }
    .tag.passive{ background: rgba(120,255,170,0.10); }
    .tag.biome{ background: rgba(255,170,120,0.10); }
    .desc{ margin-top: 6px; font-size: 12px; opacity: 0.85; line-height: 1.3; }
    #floorShopOverlay .actions{ display:flex; gap:10px; margin-top:12px; flex-wrap:wrap; }
    #floorShopOverlay .btn{ border:1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.05); color:#fff;
      border-radius:10px; padding:10px 14px; cursor:pointer; font:inherit; }
    #floorShopOverlay .btn:hover{ background: rgba(120,170,255,0.10); border-color: rgba(200,220,255,0.22); }
    #floorShopOverlay .btn:disabled{ opacity:0.5; cursor:default; }
    #floorShopOverlay .hint{ margin-top: 10px; font-size: 12px; opacity: 0.72; }
    @media (max-width: 780px){ #floorShopOverlay .cards{ flex-direction: column; } }
  `;
  document.head.appendChild(style);

  root = document.createElement("div");
  root.id = "floorShopOverlay";
  root.innerHTML = `
    <div class="panel" tabindex="0">
      <div class="head">
        <div>
          <h2 id="floorShopTitle">Terminal</h2>
          <div class="muted" id="floorShopSub">Spend Skill Points (SP)</div>
        </div>
        <div class="muted" id="floorShopMeta"></div>
      </div>
      <div class="cards" id="floorShopCards"></div>
      <div class="actions">
        <button class="btn" id="floorShopRerollBtn" type="button">Reroll</button>
        <button class="btn" id="floorShopCloseBtn" type="button">Close</button>
      </div>
      <div class="hint">Tip: press 1 / 2 / 3 to buy, R to reroll</div>
    </div>
  `;
  document.body.appendChild(root);

  const panel = root.querySelector(".panel");
  panel.addEventListener("keydown", (e) => {
    if (!root || root.style.display !== "flex") return;
    const key = e.code || e.key;
    if (triggerHotkey(key) || triggerHotkey(e.key)) {
      e.preventDefault();
    }
  });

  // Click outside to close
  root.addEventListener("click", (e) => {
    if (e.target === root) hideFloorShopOverlay();
  });

  return root;
}

function pick(choice) {
  if (typeof onPick === "function") {
    _closingByPick = true;
    try {
      onPick(choice);
    } finally {
      _closingByPick = false;
    }
  }
}

function triggerHotkey(key) {
  if (!root || root.style.display !== "flex") return false;
  const k = String(key || '');
  if (k === 'Escape') {
    hideFloorShopOverlay();
    return true;
  }
  if (k === 'r' || k === 'R' || k === 'KeyR') {
    const btn = root.querySelector("#floorShopRerollBtn");
    if (btn && !btn.disabled && typeof onReroll === "function") {
      onReroll();
      return true;
    }
    return false;
  }
  let idx = -1;
  if (k.startsWith('Digit') && k.length === 6) {
    const n = Number(k.slice(5));
    if (Number.isFinite(n) && n >= 1 && n <= 9) idx = (n - 1) | 0;
  } else if (k.length === 1) {
    const cc = k.charCodeAt(0);
    if (cc >= 49 && cc <= 57) idx = (cc - 49) | 0;
  }
  if (idx >= 0 && lastChoices && lastChoices[idx]) {
    pick(lastChoices[idx]);
    return true;
  }
  return false;
}

export function isFloorShopOverlayVisible() {
  return !!(root && root.style.display === "flex");
}

export function handleFloorShopHotkey(key) {
  return triggerHotkey(key);
}

export function showFloorShopOverlay({ title, subtitle, metaText, choices, onPickCb, onCloseCb, onRerollCb, rerollText, rerollDisabled, hint } = {}) {
  if (typeof document === "undefined") return;
  ensureDom();
  if (!root) return;

  onPick = onPickCb;
  onClose = (typeof onCloseCb === 'function') ? onCloseCb : null;
  onReroll = (typeof onRerollCb === 'function') ? onRerollCb : null;
  lastChoices = Array.isArray(choices) ? choices.slice() : [];

  const cardsEl = root.querySelector("#floorShopCards");
  const metaEl = root.querySelector("#floorShopMeta");
  const titleEl = root.querySelector("#floorShopTitle");
  const subEl = root.querySelector("#floorShopSub");
  const rerollBtn = root.querySelector("#floorShopRerollBtn");
  const closeBtn = root.querySelector("#floorShopCloseBtn");

  cardsEl.innerHTML = "";
  metaEl.textContent = metaText || "";
  titleEl.textContent = title || "Terminal";
  subEl.textContent = subtitle || "Spend Skill Points (SP)";

  for (let i = 0; i < lastChoices.length; i++) {
    const c = lastChoices[i];
    const div = document.createElement("div");
    const disabled = !!c.disabled;
    div.className = disabled ? "card disabled" : "card";
    const costTxt = (c.spCost != null) ? `SP ${c.spCost}` : "";
    const tagClass = c.family === "standard" ? "standard" : ((c.family === "passive") ? "passive" : "biome");
    const tagText = c.family === "standard"
      ? "STANDARD"
      : (c.family === "passive"
          ? "PASSIVE"
          : (c.biome ? `BIOME · ${String(c.biome).toUpperCase()}` : "BIOME"));
    div.innerHTML = `
      <div class="titleRow">
        <div class="name">${(i + 1)}. ${c.name}</div>
        <div class="lvl">${costTxt}</div>
      </div>
      <div class="tag ${tagClass}">${tagText}</div>
      <div class="desc">${c.desc || ""}</div>
    `;
    if (!disabled) div.addEventListener("click", () => pick(c));
    cardsEl.appendChild(div);
  }

  if (rerollBtn) {
    rerollBtn.textContent = rerollText || "Reroll";
    rerollBtn.disabled = !!rerollDisabled;
    rerollBtn.onclick = () => { if (!rerollBtn.disabled && typeof onReroll === "function") onReroll(); };
  }
  if (closeBtn) closeBtn.onclick = () => hideFloorShopOverlay();

  // Hint text
  const hintEl = root.querySelector('.hint');
  const n = lastChoices.length | 0;
  if (hintEl) {
    hintEl.textContent = hint || (n <= 0 ? 'Tip: press R to reroll or Close to leave' : `Tip: press 1..${Math.min(9, n)} to buy, R to reroll`);
  }

  root.style.display = "flex";
  const panel = root.querySelector(".panel");
  try { panel.focus(); } catch {}
}

export function hideFloorShopOverlay() {
  if (!root) return;
  root.style.display = "none";
  // If closed without a pick, notify caller so it can unfreeze the player.
  if (!_closingByPick && typeof onClose === 'function') {
    try { onClose(); } catch {}
  }
  _closingByPick = false;
  lastChoices = null;
  onPick = null;
  onClose = null;
  onReroll = null;
}
