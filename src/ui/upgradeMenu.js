import {
  saveProgression,
  computeTotalMetaPoints,
  getMaxPointsForStat,
  UPGRADE_CATEGORIES_BY_RTIER,
  getTotalMaxPointsForTier,
  getStartLevel,
} from "../core/progression.js";

let lastButtons = [];

const ALL_ITEMS = [
  { key: "attackSpeed", label: "Attack Speed Bonus", step: 1 },
  { key: "damage", label: "Damage Bonus", step: 1 },
  { key: "moveSpeed", label: "Move Speed Bonus", step: 1 },
  { key: "hp", label: "Max HP Bonus", step: 1 },
  { key: "hpRegen", label: "HP Regen", step: 1 },
  { key: "range", label: "Range Bonus", step: 1 },
  { key: "pickupRadius", label: "Pickup Radius Bonus", step: 1 },
  { key: "score", label: "Score Bonus", step: 1 },
  { key: "xpGain", label: "XP Gain Bonus", step: 1 },
  { key: "critChance", label: "Crit Chance Bonus", step: 1 },
  { key: "critDamage", label: "Crit Damage Bonus", step: 1 },
  { key: "lifeSteal", label: "Life Steal", step: 1 },
];

function getItemsForRTier(rTier) {
  // R-Tier: показываем все статы, которые уже открыты на этом или более раннем тире.
  // Проверяем по капам: если maxPoints > 0 для текущего R-Tier, значит стат доступен.
  return ALL_ITEMS.filter((it) => {
    const maxForStat = getMaxPointsForStat(rTier, it.key);
    return Number.isFinite(maxForStat) && maxForStat > 0;
  });
}


export function renderUpgradeMenu(ctx, state) {
  const { canvas, progression, lastRunSummary } = state;
  const w = canvas.width;
  const h = canvas.height;

  const maxDim = Math.max(w, h);
  const isMobile = maxDim < 900;
  const isLandscape = w >= h;

  const titleFontSize = isMobile ? 22 : 28;
  const headerFontSize = isMobile ? 13 : 16;
  const listFontSize = isMobile ? 12 : 14;

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(0, 0, w, h);

  // Header block
  ctx.fillStyle = "#ffffff";
  ctx.font = titleFontSize + "px sans-serif";
  ctx.textAlign = "center";

  const headerY0 = isMobile && !isLandscape ? h * 0.15 : h * 0.12;
  const isStatsScreen = state.mode === "stats";
  ctx.fillText(isStatsScreen ? "STATS & UP" : "YOU DIED", w / 2, headerY0);

  ctx.font = headerFontSize + "px sans-serif";

  const runScore = lastRunSummary
    ? lastRunSummary.runScore
    : Math.floor(state.runScore);
  const totalScore = lastRunSummary
    ? lastRunSummary.totalScore
    : progression.totalScore;
  const gained = lastRunSummary ? lastRunSummary.gainedPoints : 0;

  let yHeader = headerY0 + headerFontSize * 1.8;

  if (!isStatsScreen) {
    ctx.fillText("Score this run: " + runScore, w / 2, yHeader);
    yHeader += headerFontSize * 1.5;
  }

  ctx.fillText("Total Score: " + totalScore, w / 2, yHeader);
  yHeader += headerFontSize * 1.5;

  if (!isStatsScreen) {
    ctx.fillText("Upgrade Points earned: +" + gained, w / 2, yHeader);
    yHeader += headerFontSize * 1.5;
  }

  ctx.fillText("Available Points: " + progression.upgradePoints, w / 2, yHeader);

  if (isStatsScreen) {
    yHeader += headerFontSize * 1.5;
    const startLevel = getStartLevel(progression);
    ctx.fillText("Start level: " + startLevel, w / 2, yHeader);
  }

  const limits = progression.limits || {};
  const rTier = progression.resurrectedTier || 1;
  const usedPoints = computeTotalMetaPoints(limits);
  const totalMax = getTotalMaxPointsForTier(rTier);
  const usedPercent =
    totalMax > 0 ? Math.round((usedPoints / totalMax) * 100) : 0;

  yHeader += headerFontSize * 1.5;
  ctx.fillText(
    "R-Tier: " +
      rTier +
      " (Used Points: " +
      usedPoints +
      " / " +
      totalMax +
      ") " +
      usedPercent +
      "%",

    w / 2,
    yHeader
  );

  lastButtons = [];

  // Helper to format stat text
  function formatStatText(item, val) {
    if (item.key === "hpRegen") {
      const regenPerSec = (val * 0.25).toFixed(2);
      return `${item.label}: ${regenPerSec} HP/s`;
    } else if (
      item.key === "attackSpeed" ||
      item.key === "damage" ||
      item.key === "range"
    ) {
      const perc = (val * 2).toFixed(2);
      return `${item.label}: +${perc}%`;
    } else if (item.key === "moveSpeed") {
      const perc = (val * 1).toFixed(2);
      return `${item.label}: +${perc}%`;
    } else if (item.key === "xpGain") {
      const perc = (val * 0.5).toFixed(2);
      return `${item.label}: +${perc}%`;
    } else if (item.key === "score") {
      const perc = (val * 2).toFixed(2);
      return `${item.label}: +${perc}%`;
    } else if (item.key === "hp") {
      const bonus = (val * 5).toFixed(0);
      return `${item.label}: +${bonus} HP`;
    } else if (item.key === "pickupRadius") {
      const bonus = (val * 1).toFixed(0);
      return `${item.label}: +${bonus} radius`;
    } else if (item.key === "critChance") {
      const perc = (val * 0.1).toFixed(2);
      return `${item.label}: +${perc}%`;
    } else if (item.key === "critDamage") {
      const perc = (val * 1).toFixed(2);
      return `${item.label}: +${perc}%`;
    } else if (item.key === "lifeSteal") {
      const perc = (val * 0.1).toFixed(2);
      return `${item.label}: +${perc}%`;
    }
    return `${item.label}: ${val}`;
  }

  const items = getItemsForRTier(rTier);

  ctx.font = listFontSize + "px sans-serif";
  ctx.textAlign = "left";

  let lastItemY = yHeader;

  if (isMobile && !isLandscape) {
    // Portrait mobile: один вертикальный список статов
    const startY = yHeader + listFontSize * 2.0;
    const lineH = listFontSize * 1.9;
    const marginX = w * 0.08;
    const xText = marginX;
    const xBtn = w - marginX - 40;

    let y = startY;

    for (const item of items) {
      const val = limits[item.key] ?? 0;
      const textValue = formatStatText(item, val);

      ctx.textAlign = "left";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(textValue, xText, y);

      const btn = {
        x: xBtn,
        y: y - 16,
        w: 40,
        h: 24,
        key: item.key,
        step: item.step,
        type: "upgrade",
      };

      const maxForStat = getMaxPointsForStat(rTier, item.key);
      const isCapped =
        Number.isFinite(maxForStat) && val >= maxForStat;
      const canUpgrade =
        progression.upgradePoints > 0 && !isCapped;

      ctx.fillStyle = canUpgrade ? "#3cff9f" : "#555555";
      ctx.fillRect(btn.x, btn.y, btn.w, btn.h);

      ctx.fillStyle = "#000000";
      ctx.textAlign = "center";
      ctx.fillText("+", btn.x + btn.w / 2, btn.y + 17);
      if (Number.isFinite(maxForStat)) {
        ctx.textAlign = "right";
        ctx.fillStyle = "#ffffff";
        const capText = `${val}/${maxForStat}`;
        ctx.fillText(capText, btn.x - 6, y - 2);
      }

      lastButtons.push(btn);

      y += lineH;
    }

    lastItemY = y;
  } else {
    // Landscape mobile + PC: статы по бокам, главный текст сверху по центру
    const columnTop = yHeader + listFontSize * 2.0;
    const lineH = listFontSize * 1.9;

    const leftItems = items.slice(0, 6);
    const rightItems = items.slice(6);

    const xTextLeft = w * 0.10;
    const xBtnLeft = w * 0.38;
    const xTextRight = w * 0.55;
    const xBtnRight = w * 0.83;

    let yLeft = columnTop;
    let yRight = columnTop;

    for (const item of leftItems) {
      const val = limits[item.key] ?? 0;
      const textValue = formatStatText(item, val);

      ctx.textAlign = "left";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(textValue, xTextLeft, yLeft);

      const btn = {
        x: xBtnLeft,
        y: yLeft - 16,
        w: 40,
        h: 24,
        key: item.key,
        step: item.step,
        type: "upgrade",
      };

      const maxForStat = getMaxPointsForStat(rTier, item.key);
      const isCapped =
        Number.isFinite(maxForStat) && val >= maxForStat;
      const canUpgrade =
        progression.upgradePoints > 0 && !isCapped;

      ctx.fillStyle = canUpgrade ? "#3cff9f" : "#555555";
      ctx.fillRect(btn.x, btn.y, btn.w, btn.h);

      ctx.fillStyle = "#000000";
      ctx.textAlign = "center";
      ctx.fillText("+", btn.x + btn.w / 2, btn.y + 17);
      if (Number.isFinite(maxForStat)) {
        ctx.textAlign = "right";
        ctx.fillStyle = "#ffffff";
        const capText = `${val}/${maxForStat}`;
        ctx.fillText(capText, btn.x - 6, yLeft - 2);
      }

      lastButtons.push(btn);

      yLeft += lineH;
    }

    for (const item of rightItems) {
      const val = limits[item.key] ?? 0;
      const textValue = formatStatText(item, val);

      ctx.textAlign = "left";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(textValue, xTextRight, yRight);

      const btn = {
        x: xBtnRight,
        y: yRight - 16,
        w: 40,
        h: 24,
        key: item.key,
        step: item.step,
        type: "upgrade",
      };

      const maxForStat = getMaxPointsForStat(rTier, item.key);
      const isCapped =
        Number.isFinite(maxForStat) && val >= maxForStat;
      const canUpgrade =
        progression.upgradePoints > 0 && !isCapped;

      ctx.fillStyle = canUpgrade ? "#3cff9f" : "#555555";
      ctx.fillRect(btn.x, btn.y, btn.w, btn.h);

      ctx.fillStyle = "#000000";
      ctx.textAlign = "center";
      ctx.fillText("+", btn.x + btn.w / 2, btn.y + 17);
      if (Number.isFinite(maxForStat)) {
        ctx.textAlign = "right";
        ctx.fillStyle = "#ffffff";
        const capText = `${val}/${maxForStat}`;
        ctx.fillText(capText, btn.x - 6, yRight - 2);
      }

      lastButtons.push(btn);

      yRight += lineH;
    }

    lastItemY = Math.max(yLeft, yRight);
  }

  // Bottom buttons
  const btnH = 40;
  let btnY = lastItemY + listFontSize * 2.0;
  const minBottomMargin = isMobile ? 16 : 32;

  if (btnY + btnH > h - minBottomMargin) {
    btnY = h - minBottomMargin - btnH;
  }

  // (isStatsScreen is defined near the header section)
  if (isStatsScreen) {
    const bw = 200;
    const gap = 18;
    const totalW = bw * 2 + gap;
    const x0 = w / 2 - totalW / 2;

    const backBtn = { x: x0, y: btnY, w: bw, h: btnH, type: "back" };
    const startBtn = { x: x0 + bw + gap, y: btnY, w: bw, h: btnH, type: "start" };

    ctx.fillStyle = "#333333";
    ctx.fillRect(backBtn.x, backBtn.y, backBtn.w, backBtn.h);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText("BACK", backBtn.x + backBtn.w / 2, backBtn.y + 26);

    ctx.fillStyle = "#111111";
    ctx.fillRect(startBtn.x, startBtn.y, startBtn.w, startBtn.h);
    ctx.fillStyle = "#3cff9f";
    ctx.fillText("START", startBtn.x + startBtn.w / 2, startBtn.y + 26);

    lastButtons.push(backBtn, startBtn);
  } else {
    // Death upgrade screen: allow returning to the main Menu (requested)
    const gap = 16;
    // Fit 2 buttons on small screens (mobile portrait).
    const bw = Math.max(140, Math.min(200, Math.floor((w * 0.86 - gap) / 2)));
    const totalW = bw * 2 + gap;
    const x0 = w / 2 - totalW / 2;

    const menuBtn = {
      x: x0,
      y: btnY,
      w: bw,
      h: btnH,
      type: "menu",
    };
    const startBtn = {
      x: x0 + bw + gap,
      y: btnY,
      w: bw,
      h: btnH,
      type: "start",
    };

    ctx.fillStyle = "#222222";
    ctx.fillRect(menuBtn.x, menuBtn.y, menuBtn.w, menuBtn.h);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText("MENU/", menuBtn.x + menuBtn.w / 2, menuBtn.y + 26);

    ctx.fillStyle = "#333333";
    ctx.fillRect(startBtn.x, startBtn.y, startBtn.w, startBtn.h);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("START", startBtn.x + startBtn.w / 2, startBtn.y + 26);

    lastButtons.push(menuBtn, startBtn);
  }

  ctx.restore();
}


export function handleUpgradeClick(x, y, state) {
  const btn = lastButtons.find(
    (b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
  );
  if (!btn) return null;

  if (btn.type === "upgrade") {
    const progression = state.progression;
    const limits = progression.limits || {};

    if (progression.upgradePoints <= 0) return null;

    const key = btn.key;
    const step = btn.step;

    const rTier = progression.resurrectedTier || 1;
    const maxForStat = getMaxPointsForStat(rTier, key);
    const current = limits[key] ?? 0;
    const next = current + step;

    if (Number.isFinite(maxForStat) && next > maxForStat) {
      return null;
    }

    limits[key] = next;
    progression.limits = limits;
    progression.upgradePoints -= 1;


    saveProgression(progression);
    return "upgrade";
  }

  if (btn.type === "start") {
    return "start";
  }

  if (btn.type === "menu") {
    return "menu";
  }

  if (btn.type === "back") {
    return "back";
  }

  return null;
}