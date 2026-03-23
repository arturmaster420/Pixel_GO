export function drawArenaDebugOverlay(ctx, room, arenaSpec, state = null) {
  if (!arenaSpec) return;
  const validationIssues = Array.isArray(arenaSpec?.validation?.issues) ? arenaSpec.validation.issues : [];
  const shouldDraw = !!(state?._arenaDebug || arenaSpec?.validation?.usedFallback || validationIssues.length);
  if (!shouldDraw) return;

  const geometry = arenaSpec.geometry || {};
  const platforms = Array.isArray(geometry.platforms) ? geometry.platforms : [];
  const bridges = Array.isArray(geometry.bridges) ? geometry.bridges : [];
  const navZones = Array.isArray(geometry.navZones) ? geometry.navZones : [];
  const anchors = arenaSpec.anchors || {};
  const spawnAnchors = Array.isArray(anchors.spawnAnchors) ? anchors.spawnAnchors : [];
  const gateAnchors = Array.isArray(anchors.gateAnchors) ? anchors.gateAnchors : [];
  const decorAnchors = Array.isArray(anchors.decorAnchors) ? anchors.decorAnchors : [];
  const coverAnchors = Array.isArray(anchors.coverAnchors) ? anchors.coverAnchors : [];
  const hazardAnchors = Array.isArray(anchors.hazardAnchors) ? anchors.hazardAnchors : [];
  const bossMoveNodes = Array.isArray(anchors.bossMoveNodes) ? anchors.bossMoveNodes : [];
  const hazards = Array.isArray(arenaSpec.hazardZones) ? arenaSpec.hazardZones : [];
  const bossArena = arenaSpec.bossArena || null;

  ctx.save();
  ctx.setLineDash([8, 7]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(90,210,255,0.40)';
  for (const r of platforms) {
    if (!r || r.type !== 'rect') continue;
    ctx.strokeRect(Number(r.x) || 0, Number(r.y) || 0, Number(r.w) || 0, Number(r.h) || 0);
  }
  ctx.strokeStyle = 'rgba(255,210,120,0.35)';
  for (const r of bridges) {
    if (!r || r.type !== 'rect') continue;
    ctx.strokeRect(Number(r.x) || 0, Number(r.y) || 0, Number(r.w) || 0, Number(r.h) || 0);
  }
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = 'rgba(120,255,140,0.30)';
  for (const r of navZones) {
    if (!r || r.type !== 'rect') continue;
    ctx.strokeRect(Number(r.x) || 0, Number(r.y) || 0, Number(r.w) || 0, Number(r.h) || 0);
  }
  ctx.setLineDash([]);

  const drawPoint = (p, color, size = 8, cross = false) => {
    const x = Number(p?.x) || 0;
    const y = Number(p?.y) || 0;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    if (cross) {
      ctx.beginPath();
      ctx.moveTo(x - size, y - size);
      ctx.lineTo(x + size, y + size);
      ctx.moveTo(x + size, y - size);
      ctx.lineTo(x - size, y + size);
      ctx.stroke();
      return;
    }
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.stroke();
  };

  drawPoint(anchors.playerStart, 'rgba(255,255,255,0.90)', 11);
  drawPoint(anchors.bossSpawn, 'rgba(255,120,120,0.90)', 12, true);
  for (const p of spawnAnchors) drawPoint(p, 'rgba(80,240,120,0.85)', 7);
  for (const p of gateAnchors) drawPoint(p, 'rgba(255,210,80,0.85)', 9);
  for (const p of decorAnchors) drawPoint(p, 'rgba(180,200,255,0.50)', 5);
  for (const p of coverAnchors) drawPoint(p, 'rgba(160,160,160,0.55)', 6);
  for (const p of hazardAnchors) drawPoint(p, 'rgba(255,120,190,0.70)', 6, true);
  for (const p of bossMoveNodes) drawPoint(p, 'rgba(255,150,60,0.85)', 6);

  ctx.strokeStyle = 'rgba(255,80,120,0.28)';
  ctx.fillStyle = 'rgba(255,80,120,0.05)';
  for (const z of hazards) {
    const r = Math.max(12, Number(z?.r) || 24);
    ctx.beginPath();
    ctx.arc(Number(z?.x) || 0, Number(z?.y) || 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  if (bossArena?.center) {
    ctx.strokeStyle = 'rgba(255,255,255,0.20)';
    ctx.beginPath();
    ctx.arc(Number(bossArena.center.x) || 0, Number(bossArena.center.y) || 0, Math.max(40, (room?.side || 700) * 0.06), 0, Math.PI * 2);
    ctx.stroke();
  }

  const lines = [
    `${arenaSpec.validation?.usedFallback ? 'SAFE FALLBACK' : 'ARENA DEBUG'} • ${String(arenaSpec.profileId || '')}/${String(arenaSpec.layoutId || '')}`,
    `platforms:${platforms.length} bridges:${bridges.length} nav:${navZones.length} spawns:${spawnAnchors.length} gates:${gateAnchors.length} hazards:${hazards.length}`,
    ...validationIssues.slice(0, 4).map((s) => `issue: ${String(s)}`),
  ];
  const bx = (room?.bounds?.minX || 0) + 28;
  const by = (room?.bounds?.minY || 0) + 34;
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let maxW = 0;
  for (const line of lines) maxW = Math.max(maxW, ctx.measureText(line).width);
  ctx.fillStyle = validationIssues.length ? 'rgba(50,12,20,0.66)' : 'rgba(8,20,34,0.54)';
  ctx.fillRect(bx - 10, by - 8, maxW + 20, lines.length * 20 + 12);
  let ty = by;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillStyle = i === 0 ? 'rgba(255,245,220,0.94)' : 'rgba(230,240,255,0.86)';
    ctx.fillText(lines[i], bx, ty);
    ty += 20;
  }
  ctx.restore();
}
