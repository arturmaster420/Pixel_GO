import { getControlMode } from "../core/mouseController.js";
import { biomeByKey } from "../world/biomes.js";

function clamp01(n) {
  return n < 0 ? 0 : (n > 1 ? 1 : n);
}

function biomeAccentColor(key) {
  const biome = biomeByKey(key);
  return biome?.accent || "#7ec2ff";
}

function biomeNameUpper(key, fallback = "NEUTRAL") {
  const biome = biomeByKey(key);
  return biome ? String(biome.name || fallback).toUpperCase() : fallback;
}

function encounterLabelUpper(state) {
  return String(state?._roomEncounterLabel || '').toUpperCase();
}

function ensureRoomBannerState(state) {
  if (!state) return null;
  const roomIdx = (state.currentRoomIndex != null ? (state.currentRoomIndex | 0) : 0);
  const floorNo = (state._floorNumber | 0) || 0;
  const roomOrd = (state._floorRoomOrdinal | 0) || 0;
  const roomsTot = (state._floorRoomsTotal | 0) || 0;
  const rd = state.roomDirector || null;
  const currentBiomeKey = String(state._floorBiome || state._roomBiome || rd?.current?.biomeKey || "").toLowerCase();
  const key = `${roomIdx}:${floorNo}:${roomOrd}:${currentBiomeKey}`;
  if (state._hudRoomBannerKey !== key) {
    state._hudRoomBannerKey = key;
    const nextBiomeKey = String(state._nextRoomBiome || rd?.next?.biomeKey || currentBiomeKey || "").toLowerCase();
    const isHub = roomIdx <= 0 || floorNo <= 0;
    state._hudRoomBannerUntil = (state.time || 0) + (isHub ? 2.0 : 2.4);
    state._hudRoomBanner = {
      title: isHub ? "HUB" : `ЭТАЖ ${floorNo}`,
      subtitle: isHub ? "CENTRAL STATION" : `${biomeNameUpper(currentBiomeKey)} • ${encounterLabelUpper(state) || 'ВОЛНЫ'} • КОМНАТА ${roomOrd}/${Math.max(roomOrd, roomsTot)}`,
      detail: isHub
        ? "Портал запускает новый ран"
        : (state._floorExitActive ? "ПЕРЕХОД НА СЛЕДУЮЩИЙ ЭТАЖ ОТКРЫТ" : (nextBiomeKey ? `ДАЛЬШЕ → ${Math.min((roomOrd || 1) + 1, Math.max(roomOrd, roomsTot))}/${Math.max(roomOrd, roomsTot)} • ${biomeNameUpper(nextBiomeKey, 'NEUTRAL')}` : "")),
      accent: biomeAccentColor(currentBiomeKey),
    };
  }
  return state._hudRoomBanner || null;
}

function drawRoomEntryBanner(ctx, state, scaledW, topPanelH) {
  const banner = ensureRoomBannerState(state);
  const until = Number(state?._hudRoomBannerUntil) || 0;
  const now = Number(state?.time) || 0;
  if (!banner || until <= now) return;

  const remain = until - now;
  const fade = remain > 0.55 ? 1 : Math.max(0, Math.min(1, remain / 0.55));
  const width = Math.min(420, Math.max(260, scaledW * 0.34));
  const height = banner.detail ? 84 : 68;
  const x = (scaledW - width) * 0.5;
  const y = topPanelH + 18;

  ctx.save();
  ctx.globalAlpha = 0.94 * fade;
  ctx.fillStyle = "rgba(8,12,18,0.78)";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);

  ctx.fillStyle = banner.accent || "#7ec2ff";
  ctx.fillRect(x, y, width, 4);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.font = "bold 20px sans-serif";
  ctx.fillText(String(banner.title || ""), x + width * 0.5, y + 12);

  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = "12px sans-serif";
  ctx.fillText(String(banner.subtitle || ""), x + width * 0.5, y + 40);

  if (banner.detail) {
    ctx.fillStyle = "rgba(255,255,255,0.60)";
    ctx.font = "11px sans-serif";
    ctx.fillText(String(banner.detail), x + width * 0.5, y + 58);
  }
  ctx.restore();
}

export function renderHUD(ctx, state) {
  const canvas = state.canvas;
  const player = state.player;
  const progression = state.progression;
  const runScore = state.runScore || 0;
  const buffs = state.buffs || [];

  const w = canvas.width;
  const h = canvas.height;

  ctx.save();

  // Simple responsive scaling: smaller HUD on small screens
  const minSide = Math.min(w, h);
  const uiScale = minSide < 700 ? 0.7 : 1.0;
  ctx.scale(uiScale, uiScale);

  const invScale = 1 / uiScale;
  const scaledW = w * invScale;
  const scaledH = h * invScale;


// Top HUD panel (full-width, DOM-like)
const btnSize = 40;
const margin = 14;

const topPanelX = 0;
const topPanelY = 0;
const topPanelH = 74;

const rowTopH = btnSize;               // HP row (includes Pause)
const rowBottomH = topPanelH - rowTopH; // XP + UP row

// Pause sits flush in the top-right corner (no inset)
const pauseX = scaledW - btnSize;
const pauseY = topPanelY;

// Panel background (match DOM menu feel)
ctx.fillStyle = "rgba(12,16,22,0.90)";
ctx.fillRect(topPanelX, topPanelY, scaledW, topPanelH);
ctx.strokeStyle = "rgba(255,255,255,0.12)";
ctx.strokeRect(topPanelX + 0.5, topPanelY + 0.5, scaledW - 1, topPanelH - 1);

// Room + currencies (top-right info block; Score hidden for now)
const coins = progression && typeof progression.coins === "number" ? Math.floor(progression.coins) : 0;
const coinText = `${coins}`;
const iconR = 6;

// Room status: SOLO / OPEN / <CODE>
let roomState = "SOLO";
try {
  const net = state.net;
  const rc = (
    (net && net.roomCode) ? net.roomCode :
    (progression && progression.roomCode) ? progression.roomCode :
    ""
  ).toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

  if (net && net.status === "connected") {
    if (rc) {
      const count = Array.isArray(net.roomPlayers) ? net.roomPlayers.length : 0;
      roomState = (net.isHost && count <= 1) ? "OPEN" : rc;
    } else {
      roomState = "OPEN";
    }
  } else {
    roomState = "SOLO";
  }
} catch {}

// XP row (bottom) + UP button (stretched to the right edge)
const xpY = topPanelY + rowTopH;
const xpX = topPanelX;

const upMinW = 180;
const upMaxW = 420;
const desiredUpW = Math.min(upMaxW, Math.max(upMinW, Math.round(scaledW * 0.30)));
const upW = desiredUpW;
const upH = rowBottomH;
const upX = scaledW - upW;
const upY = xpY;

// Room + currency layout (between HP bar end and Pause)
const hpEndX = upX;

const infoPad = 10;
const infoX0 = hpEndX + infoPad;
const infoX1 = pauseX - infoPad;

if (infoX1 > infoX0 + 40) {
  const infoY = topPanelY + 10;

  // Floor (Pixel_GO) + Lobby state
  const roomIdx = (state.currentRoomIndex != null ? (state.currentRoomIndex | 0) : 0);
  const rd = state.roomDirector || null;
  const floorNo = (state._floorNumber | 0) || 0;
  const roomOrd = (state._floorRoomOrdinal | 0) || 0;
  const roomsTot = (state._floorRoomsTotal | 0) || 0;
  const currentBiomeKey = String(state._floorBiome || state._roomBiome || rd?.current?.biomeKey || "").toLowerCase();
  const currentBiome = biomeByKey(currentBiomeKey);
  const nextBiomeKey = String(state._nextRoomBiome || rd?.next?.biomeKey || currentBiomeKey || "").toLowerCase();
  const nextBiome = biomeByKey(nextBiomeKey);
  const floorBase = roomIdx <= 0 || floorNo <= 0 ? "HUB" : ("ЭТАЖ " + floorNo);
  const roomProg = (roomIdx <= 0 || floorNo <= 0) ? "" : (` • КОМНАТА ${roomOrd}/${Math.max(roomOrd, roomsTot)}`);
  const floorTag = state._roomIsBoss ? "FINAL" : "";
  const encounterTag = roomIdx <= 0 || floorNo <= 0 ? "" : ((state._roomEncounterLabel || '').toUpperCase() ? (" • " + String(state._roomEncounterLabel || '').toUpperCase()) : "");
  const biomeTag = roomIdx <= 0 || floorNo <= 0 ? "" : (currentBiome ? (" • " + String(currentBiome.name || "").toUpperCase()) : " • NEUTRAL");
  const floorText = floorTag ? (floorBase + biomeTag + roomProg + encounterTag + " • " + floorTag) : (floorBase + biomeTag + roomProg + encounterTag);
  const rk = (state._roomKilled | 0) || 0;
  const rq = (state._roomQuota | 0) || 0;
  const progText = (roomIdx > 0 && rq > 0) ? (rk + "/" + rq) : "";

  const wTot = (state._roomWavesTotal | 0) || 0;
  const wIdx = (state._roomWaveIndex | 0) || 0;
  const waveText = (roomIdx > 0 && wTot > 0)
    ? (wIdx >= wTot ? `Wave ${wTot}/${wTot}` : `Wave ${Math.max(1, wIdx + 1)}/${wTot}`)
    : "";

  const bridgeBuilding = (roomIdx > 0) && !!state._roomCleared && !!state._roomHasNext && !state._bridgeBuilt;
  const bridgeP = typeof state._bridgeP === 'number' ? state._bridgeP : 0;
  const bridgeTxt = state._floorExitActive
    ? 'EXIT READY'
    : (bridgeBuilding ? ("DOOR " + Math.round(clamp01(bridgeP) * 100) + "%" + (nextBiome ? (" → " + String(nextBiome.name || "").toUpperCase()) : "")) : (state._roomCleared && state._roomHasNext ? 'ДАЛЬШЕ ОТКРЫТО' : ''));

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,0.70)";
  ctx.font = "12px sans-serif";
  ctx.fillText("Этаж", infoX0, infoY);

  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "13px sans-serif";
  ctx.fillText(floorText, infoX0, infoY + 14);

  if (progText) {
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "12px sans-serif";
    ctx.fillText("Kills " + progText, infoX0, infoY + 32);
  }

  if (waveText) {
    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.font = "12px sans-serif";
    ctx.fillText(waveText, infoX0 + 126, infoY + 32);
  }

  if (bridgeTxt) {
    ctx.fillStyle = "rgba(255,255,255,0.60)";
    ctx.font = "12px sans-serif";
    ctx.fillText(bridgeTxt, infoX0 + 130, infoY + 32);
  }

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "12px sans-serif";
  ctx.fillText("Lobby", infoX0, infoY + 48);

  ctx.fillStyle = "rgba(255,255,255,0.90)";
  ctx.font = "13px sans-serif";
  ctx.fillText(roomState, infoX0 + 44, infoY + 46);

  if (roomIdx > 0) {
    const pillText = currentBiome ? String(currentBiome.name || "").toUpperCase() : "NEUTRAL";
    ctx.font = "11px sans-serif";
    const pillW = Math.max(72, ctx.measureText(pillText).width + 18);
    const pillX = Math.min(infoX1 - pillW - 56, infoX0 + 172);
    const pillY = infoY + 44;
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(pillX, pillY, pillW, 18);
    ctx.fillStyle = biomeAccentColor(currentBiomeKey);
    ctx.fillRect(pillX, pillY, 4, 18);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(pillX + 0.5, pillY + 0.5, pillW - 1, 17);
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(pillText, pillX + pillW * 0.5 + 2, pillY + 9);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  }

// Coins (right of Room)
  ctx.font = "13px sans-serif";
  const coinNumW = ctx.measureText(coinText).width;
  const coinColW = Math.max(48, iconR * 2 + 6 + coinNumW);

  // Keep some room for the Room block
  const minCoinX = infoX0 + 74;
  const coinX = Math.max(minCoinX, infoX1 - coinColW);

  const coinY = infoY;
  ctx.fillStyle = "rgba(255,215,90,0.95)";
  ctx.beginPath();
  ctx.arc(coinX + iconR, coinY + 7, iconR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "13px sans-serif";
  ctx.fillText(coinText, coinX + iconR * 2 + 6, coinY);

  // Reserve space for future currency (same height)
  const cur2Y = coinY + 16;
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.beginPath();
  ctx.arc(coinX + iconR, cur2Y + 7, iconR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.stroke();
}

// HP bar row (top). Ends at the UP button edge (same as XP bar).
const hpRatio = player.hp / player.maxHP;
const hpX = topPanelX;
const hpY = topPanelY;
const hpW = Math.max(80, hpEndX - hpX);
const hpH = rowTopH;

ctx.fillStyle = "rgba(255,255,255,0.035)";
ctx.fillRect(hpX, hpY, hpW, hpH);

const hpClamped = Math.max(0, Math.min(1, hpRatio));
ctx.fillStyle = "rgba(255,75,110,0.22)";
ctx.fillRect(hpX, hpY, hpW * hpClamped, hpH);

// Bright top line
ctx.fillStyle = "#ff4b6e";
ctx.fillRect(hpX, hpY, hpW * hpClamped, 3);

// Label on HP bar: HP current/max
ctx.fillStyle = "rgba(255,255,255,0.92)";
ctx.font = "14px sans-serif";
ctx.textAlign = "left";
ctx.textBaseline = "middle";
const hpNow = Math.max(0, Math.round(player.hp));
const hpMax = Math.max(1, Math.round(player.maxHP));
ctx.fillText(`HP ${hpNow}/${hpMax}`, margin, hpY + hpH / 2);
ctx.textBaseline = "alphabetic";

// Row separator
ctx.strokeStyle = "rgba(255,255,255,0.12)";
ctx.beginPath();
ctx.moveTo(topPanelX, topPanelY + rowTopH + 0.5);
ctx.lineTo(scaledW, topPanelY + rowTopH + 0.5);
ctx.stroke();

// XP bar ends at UP button edge (no overlap)
// Prefer host-replicated nextLevelXp (co-op joiners) for correct HUD numbers.
let xpNeed = 0;
try {
  xpNeed = Number.isFinite(player.nextLevelXp) && player.nextLevelXp > 0
    ? Math.round(player.nextLevelXp)
    : (typeof player.xpToNext === "function" ? Math.round(player.xpToNext()) : 0);
} catch (e) {
  xpNeed = 0;
}
const xpNow = Math.max(0, Math.round(player.xp || 0));
const xpRatio = xpNeed > 0 ? (xpNow / xpNeed) : 0;
const xpW = Math.max(80, upX - xpX);
const xpH = rowBottomH;

ctx.fillStyle = "rgba(255,255,255,0.035)";
ctx.fillRect(xpX, xpY, xpW, xpH);

const xpClamped = Math.max(0, Math.min(1, xpRatio));
ctx.fillStyle = "rgba(59,209,255,0.20)";
ctx.fillRect(xpX, xpY, xpW * xpClamped, xpH);

// Bright top line
ctx.fillStyle = "#3bd1ff";
ctx.fillRect(xpX, xpY, xpW * xpClamped, 3);

// Label on XP bar: LVL + optional xp current/needed
ctx.fillStyle = "rgba(255,255,255,0.92)";
ctx.font = "14px sans-serif";
ctx.textAlign = "left";
ctx.textBaseline = "middle";
const lvlText = `LVL ${player.level}`;
const xpText = xpNeed > 0 ? `  ${xpNow}/${xpNeed}` : "";
ctx.fillText(lvlText + xpText, margin, xpY + xpH / 2);
ctx.textBaseline = "alphabetic";



// Buff icons row (right-bottom)
  let bx = scaledW - 32;
  const by = scaledH - 40;
  for (let i = 0; i < buffs.length; i++) {
    const b = buffs[i];
    ctx.fillStyle = getBuffColor(b.type);
    ctx.beginPath();
    ctx.arc(bx, by, 10, 0, Math.PI * 2);
    ctx.fill();
    bx -= 26;
  }

  // Pause button (top-right)
  ctx.fillStyle = state.paused ? "rgba(255,80,80,0.9)" : "rgba(0,0,0,0.6)";
  ctx.fillRect(pauseX, pauseY, btnSize, btnSize);
  ctx.strokeStyle = "#ffffff";
  ctx.strokeRect(pauseX, pauseY, btnSize, btnSize);

  ctx.fillStyle = "#ffffff";
  ctx.font = "18px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (state.paused) {
    ctx.fillText("▶", pauseX + btnSize / 2, pauseY + btnSize / 2 + 1);
  } else {
    const barW = 6;
    const gap = 6;
    const centerX = pauseX + btnSize / 2;
    const topY = pauseY + 10;
    const bottomY = pauseY + btnSize - 10;
    ctx.beginPath();
    ctx.moveTo(centerX - gap / 2 - barW, topY);
    ctx.lineTo(centerX - gap / 2 - barW, bottomY);
    ctx.moveTo(centerX + gap / 2 + barW, topY);
    ctx.lineTo(centerX + gap / 2 + barW, bottomY);
    ctx.stroke();
  }

  // Save pause button rect in original screen coordinates
    state._pauseButtonRect = {
    x: pauseX * uiScale,
    y: pauseY * uiScale,
    w: btnSize * uiScale,
    h: btnSize * uiScale,
  };

  // Pixel_GO v0.4: show Skill Points instead of the old in-run upgrade button.
  const sp = (player.skillPoints | 0) || 0;
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(upX, upY, upW, upH);
  ctx.strokeStyle = "rgba(255,255,255,0.30)";
  ctx.strokeRect(upX, upY, upW, upH);

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "14px sans-serif";
  ctx.fillText(`SP: ${sp}`, upX + upW / 2, upY + upH / 2);

  // Disable legacy upgrade button hitbox
  state._runUpgradeButtonRect = null;

  // Pixel_GO: gate interaction is now shown directly on the gate (click/tap).

  // Pause overlay: control mode toggle
  if (state.mode === "playing" && state.paused) {
    const overlayW = scaledW * 0.7;
    const overlayH = 130;
    const overlayX = (scaledW - overlayW) / 2;
    const overlayY = scaledH * 0.2;

    ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    ctx.fillRect(overlayX, overlayY, overlayW, overlayH);
    ctx.strokeStyle = "#ffffff";
    ctx.strokeRect(overlayX, overlayY, overlayW, overlayH);

    ctx.fillStyle = "#ffffff";
    ctx.font = "20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("Control System", overlayX + overlayW / 2, overlayY + 10);

    const btnW = overlayW * 0.4;
    const btnH = 36;
    const gap = 12;
    const btnYControls = overlayY + 60;
    const btnX1 = overlayX + overlayW * 0.5 - btnW - gap * 0.5;
    const btnX2 = overlayX + overlayW * 0.5 + gap * 0.5;

    const currentMode = getControlMode ? getControlMode() : "oneHand";

    function drawModeButton(x, y, label, forMode) {
      const isActive = currentMode === forMode;
      ctx.fillStyle = isActive ? "rgba(80,160,255,0.9)" : "rgba(0,0,0,0.6)";
      ctx.fillRect(x, y, btnW, btnH);
      ctx.strokeStyle = "#ffffff";
      ctx.strokeRect(x, y, btnW, btnH);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "16px sans-serif";
      ctx.fillText(label, x + btnW / 2, y + btnH / 2);
    }

    drawModeButton(btnX1, btnYControls, "1-Hand", "oneHand");
    drawModeButton(btnX2, btnYControls, "2-Hand", "twoHand");

    // Save control mode button rects in original screen coordinates
    state._controlModeClassicRect = {
      x: btnX1 * uiScale,
      y: btnYControls * uiScale,
      w: btnW * uiScale,
      h: btnH * uiScale,
    };
    state._controlModePortraitAutoRect = {
      x: btnX2 * uiScale,
      y: btnYControls * uiScale,
      w: btnW * uiScale,
      h: btnH * uiScale,
    };
  } else {
    state._controlModeClassicRect = null;
    state._controlModePortraitAutoRect = null;
  }

  drawRoomEntryBanner(ctx, state, scaledW, topPanelH);

  ctx.restore();
}


function getBuffColor(type) {
  switch (type) {
    case "damage":
      return "#ff4b7a";
    case "attackSpeed":
      return "#ffdd57";
    case "moveSpeed":
      return "#57ff9b";
    case "regen":
      return "#57c8ff";
    case "shield":
      return "#b857ff";
    case "ghost":
      return "#ffffff";
    default:
      return "#aaaaaa";
  }
}
