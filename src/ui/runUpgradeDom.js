// Simple DOM overlay for in-run level-up choices.

let root = null;
let onPick = null;
let lastChoices = null;

function ensureDom() {
  if (root) return root;

  const style = document.createElement("style");
  style.textContent = `
    #runUpOverlay{ position:fixed; inset:0; display:none; align-items:center; justify-content:center; z-index:60;
      background: rgba(0,0,0,0.55); backdrop-filter: blur(3px); }
    #runUpOverlay .panel{ width:min(980px, 96vw); max-height: 92vh; overflow:auto;
      border:1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 14px 16px;
      background: rgba(12,16,22,0.92); box-shadow: 0 12px 50px rgba(0,0,0,0.45); }
    #runUpOverlay .head{ display:flex; justify-content:space-between; align-items:flex-end; gap:12px; }
    #runUpOverlay h2{ margin:0; font-size: 18px; }
    #runUpOverlay .muted{ opacity:0.75; font-size:12px; line-height:1.25; }
    #runUpOverlay .cards{ display:flex; gap: 12px; margin-top: 12px; flex-wrap: wrap; }
    #runUpOverlay .card{ flex: 1; min-width: 240px; border-radius: 12px; padding: 12px 12px;
      border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.03);
      cursor:pointer; user-select:none; }
    #runUpOverlay .card:hover{ background: rgba(120,170,255,0.10); border-color: rgba(200,220,255,0.22); }
    #runUpOverlay .titleRow{ display:flex; align-items:baseline; justify-content:space-between; gap: 8px; }
    #runUpOverlay .name{ font-size: 14px; font-weight: 700; }
    #runUpOverlay .lvl{ font-size: 12px; opacity: 0.8; }
    #runUpOverlay .desc{ margin-top: 6px; font-size: 12px; opacity: 0.85; line-height: 1.3; }
    #runUpOverlay .hint{ margin-top: 10px; font-size: 12px; opacity: 0.72; }
    @media (max-width: 780px){ #runUpOverlay .cards{ flex-direction: column; } }
  `;
  document.head.appendChild(style);

  root = document.createElement("div");
  root.id = "runUpOverlay";
  root.innerHTML = `
    <div class="panel" tabindex="0">
      <div class="head">
        <div>
          <h2>Level Up</h2>
          <div class="muted">Choose one upgrade</div>
        </div>
        <div class="muted" id="runUpMeta"></div>
      </div>
      <div class="cards" id="runUpCards"></div>
      <div class="hint">Tip: press 1 / 2 / 3</div>
    </div>
  `;
  document.body.appendChild(root);

  const panel = root.querySelector(".panel");
  panel.addEventListener("keydown", (e) => {
    if (!root || root.style.display !== "flex") return;
    const k = e.key;
    if (k === "1" || k === "2" || k === "3") {
      const idx = (k.charCodeAt(0) - 49) | 0;
      if (lastChoices && lastChoices[idx]) {
        e.preventDefault();
        pick(lastChoices[idx]);
      }
    }
  });

  return root;
}

function pick(choice) {
  if (typeof onPick === "function") {
    const cb = onPick;
    onPick = null;
    hideRunUpgradeOverlay();
    cb(choice);
  }
}

export function showRunUpgradeOverlay(choices, metaText, onPickCb) {
  if (typeof document === "undefined") return;
  ensureDom();

  onPick = onPickCb;
  lastChoices = Array.isArray(choices) ? choices.slice(0, 3) : [];

  const cardsEl = root.querySelector("#runUpCards");
  const metaEl = root.querySelector("#runUpMeta");
  cardsEl.innerHTML = "";
  metaEl.textContent = metaText || "";

  for (let i = 0; i < lastChoices.length; i++) {
    const c = lastChoices[i];
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="titleRow">
        <div class="name">${(i + 1)}. ${c.name}</div>
        <div class="lvl">Lv ${c.from} → ${c.to}</div>
      </div>
      <div class="desc">${c.desc || ""}</div>
    `;
    div.addEventListener("click", () => pick(c));
    cardsEl.appendChild(div);
  }

  root.style.display = "flex";
  const panel = root.querySelector(".panel");
  try { panel.focus(); } catch {}
}

export function hideRunUpgradeOverlay() {
  if (!root) return;
  root.style.display = "none";
  lastChoices = null;
}
