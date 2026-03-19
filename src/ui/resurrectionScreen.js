import { applyResurrection } from "../core/progression.js";

let lastButtons = [];

export function renderResurrectionScreen(ctx, state) {
  const { canvas, progression, lastRunSummary } = state;
  const w = canvas.width;
  const h = canvas.height;

  const maxDim = Math.max(w, h);
  const isMobile = maxDim < 900;

  const titleFontSize = isMobile ? 22 : 28;
  const bodyFontSize = isMobile ? 13 : 16;

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#ffffff";
  ctx.font = titleFontSize + "px sans-serif";
  ctx.textAlign = "center";

  ctx.fillText("RESURRECTION", w / 2, h / 2 - 150);

  ctx.font = bodyFontSize + "px sans-serif";

  const runScore = lastRunSummary
    ? lastRunSummary.runScore
    : Math.floor(state.runScore);
  const totalScore = lastRunSummary
    ? lastRunSummary.totalScore
    : progression.totalScore;
  const gained = lastRunSummary ? lastRunSummary.gainedPoints : 0;
  const rTier = progression.resurrectedTier || 1;

  ctx.fillText("Guardian of Resurrection defeated!", w / 2, h / 2 - 120);
  ctx.fillText("Score this run: " + runScore, w / 2, h / 2 - 100);
  ctx.fillText("Total Score: " + totalScore, w / 2, h / 2 - 80);
  ctx.fillText("Upgrade Points earned: +" + gained, w / 2, h / 2 - 60);
  ctx.fillText("Current R-Tier: " + rTier, w / 2, h / 2 - 40);

  ctx.fillText(
    "Resurrect to increase R-Tier (up to 15) and reset all meta-limits for a new build.",
    w / 2,
    h / 2 - 10
  );

  lastButtons = [];

  const btnRes = {
    x: w / 2 - 140,
    y: h / 2 + 40,
    w: 120,
    h: 36,
    type: "resurrect",
  };

  const btnSkip = {
    x: w / 2 + 20,
    y: h / 2 + 40,
    w: 120,
    h: 36,
    type: "skip",
  };

  ctx.strokeStyle = "#00ff88";
  ctx.lineWidth = 2;
  ctx.strokeRect(btnRes.x, btnRes.y, btnRes.w, btnRes.h);
  ctx.fillStyle = "#00ff88";
  ctx.textAlign = "center";
  ctx.fillText("RESURECT", btnRes.x + btnRes.w / 2, btnRes.y + 24);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(btnSkip.x, btnSkip.y, btnSkip.w, btnSkip.h);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("SKIP", btnSkip.x + btnSkip.w / 2, btnSkip.y + 24);

  lastButtons.push(btnRes, btnSkip);

  ctx.restore();
}

export function handleResurrectionClick(x, y, state) {
  const btn = lastButtons.find(
    (b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
  );

  if (!btn) return null;

  if (btn.type === "resurrect") {
    applyResurrection(state.progression);
    if (state.flags) {
      state.flags.resGuardianKilledThisRun = false;
    }
    return "resurrect";
  }

  if (btn.type === "skip") {
    if (state.flags) {
      state.flags.resGuardianKilledThisRun = false;
    }
    return "skip";
  }

  return null;
}