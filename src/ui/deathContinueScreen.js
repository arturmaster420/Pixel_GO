let lastButtons = [];

export function getDeathContinueCost(state) {
  const used = Math.max(0, (state?._deathContinueCount | 0) || 0);
  // Exponential revive pricing: 1, 2, 4, 8, ...
  // Clamp at 2^30 to keep the cost a safe finite integer even in extreme runs.
  return Math.max(1, 2 ** Math.min(30, used));
}

export function renderDeathContinueScreen(ctx, state) {
  const { canvas, player } = state;
  const w = canvas.width;
  const h = canvas.height;
  const cost = getDeathContinueCost(state);
  const sp = Math.max(0, (player?.skillPoints | 0) || 0);
  const canContinue = sp >= cost;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('YOU DIED', w / 2, h * 0.28);

  ctx.font = '16px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(`Continue this run for ${cost} SP`, w / 2, h * 0.28 + 36);
  ctx.fillText(`Current SP: ${sp}`, w / 2, h * 0.28 + 62);
  if (!canContinue) {
    ctx.fillStyle = 'rgba(255,170,170,0.95)';
    ctx.fillText('Not enough SP to continue.', w / 2, h * 0.28 + 88);
  }

  const btnW = 220;
  const btnH = 44;
  const gap = 18;
  const y = h * 0.52;
  const btnContinue = { x: w / 2 - btnW - gap / 2, y, w: btnW, h: btnH, type: 'continue', disabled: !canContinue };
  const btnHub = { x: w / 2 + gap / 2, y, w: btnW, h: btnH, type: 'hub', disabled: false };
  lastButtons = [btnContinue, btnHub];

  for (const b of lastButtons) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = b.type === 'continue' ? (b.disabled ? 'rgba(160,160,160,0.75)' : '#33ff99') : '#ffffff';
    ctx.fillStyle = b.disabled ? 'rgba(90,90,90,0.35)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.type === 'continue' ? (b.disabled ? 'rgba(190,190,190,0.9)' : '#33ff99') : '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    const label = b.type === 'continue' ? `CONTINUE (${cost} SP)` : 'RETURN TO HUB';
    ctx.fillText(label, b.x + b.w / 2, b.y + 28);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.70)';
  ctx.font = '13px sans-serif';
  ctx.fillText('Click a button to choose.', w / 2, y + btnH + 34);

  ctx.restore();
}

export function handleDeathContinueClick(x, y, state) {
  const btn = lastButtons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  if (!btn || btn.disabled) return null;
  return btn.type;
}
