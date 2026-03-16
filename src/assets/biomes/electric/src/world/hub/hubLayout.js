function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const ART_REL = {
  core:        { x:  0.0000, y: -0.0550 },
  portal:      { x:  0.0146, y: -0.3960 },
  merchant:    { x: -0.3010, y: -0.3090 },
  tierMaster:  { x:  0.3340, y: -0.3080 },
  left:        { x: -0.3550, y: -0.0540 },
  right:       { x:  0.3900, y: -0.0530 },
  leftBottom:  { x: -0.3170, y:  0.2190 },
  rightBottom: { x:  0.3460, y:  0.2220 },
  start:       { x:  0.0160, y:  0.3330 },
};

function relNode(cx, cy, artSize, rel) {
  return { x: cx + artSize * rel.x, y: cy + artSize * rel.y };
}

function fallbackNodePositions(cx, cy, artSize) {
  return {
    portal: relNode(cx, cy, artSize, ART_REL.portal),
    merchant: relNode(cx, cy, artSize, ART_REL.merchant),
    tierMaster: relNode(cx, cy, artSize, ART_REL.tierMaster),
    left: relNode(cx, cy, artSize, ART_REL.left),
    right: relNode(cx, cy, artSize, ART_REL.right),
    leftBottom: relNode(cx, cy, artSize, ART_REL.leftBottom),
    rightBottom: relNode(cx, cy, artSize, ART_REL.rightBottom),
    start: relNode(cx, cy, artSize, ART_REL.start),
  };
}

export function getHubSceneLayout(arenaSpec) {
  const hv = arenaSpec?.geometry?.hubVisual || null;
  const cx = num(hv?.cx, 0);
  const cy = num(hv?.cy, 0);
  const side = Math.max(520, num(hv?.side, 600));
  const artSize = Math.max(2200, num(hv?.artSize, 0) || 0, side * 4.8);
  const bgSize = artSize * 1.9;
  const corePos = hv?.core || relNode(cx, cy, artSize, ART_REL.core);
  const fallbackNodes = fallbackNodePositions(cx, cy, artSize);
  const nodes = {
    portal: hv?.nodes?.portal || fallbackNodes.portal,
    merchant: hv?.nodes?.merchant || fallbackNodes.merchant,
    tierMaster: hv?.nodes?.tierMaster || fallbackNodes.tierMaster,
    left: hv?.nodes?.left || fallbackNodes.left,
    right: hv?.nodes?.right || fallbackNodes.right,
    leftBottom: hv?.nodes?.leftBottom || fallbackNodes.leftBottom,
    rightBottom: hv?.nodes?.rightBottom || fallbackNodes.rightBottom,
    start: hv?.nodes?.start || fallbackNodes.start,
  };
  const coreSize = artSize * 0.120;
  const coreSparkSize = artSize * 0.042;
  const portalBeamH = artSize * 0.90;
  const portalBeamW = artSize * 0.115;
  const portalBeamBaseY = nodes.portal.y;
  const portalBeamAnchorRatio = 1120 / 1536;
  const nodeGlow = artSize * 0.092;
  return {
    cx,
    cy,
    side,
    artSize,
    bgSize,
    core: corePos,
    coreSize,
    coreSparkSize,
    portalBeamH,
    portalBeamW,
    portalBeamBaseY,
    portalBeamAnchorRatio,
    nodeGlow,
    nodes,
    activeNodes: [
      { id: 'portal', label: 'PORTAL', ...nodes.portal },
      { id: 'merchant', label: 'MERCHANT', ...nodes.merchant },
      { id: 'tierMaster', label: 'TIER MASTER', ...nodes.tierMaster },
      { id: 'start', label: 'START', ...nodes.start },
    ],
    futureNodes: [
      { id: 'left', ...nodes.left },
      { id: 'right', ...nodes.right },
      { id: 'leftBottom', ...nodes.leftBottom },
      { id: 'rightBottom', ...nodes.rightBottom },
    ],
  };
}
