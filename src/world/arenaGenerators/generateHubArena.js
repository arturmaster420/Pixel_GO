function makeRect(id, x, y, w, h) {
  return { id, type: 'rect', x, y, w, h };
}

function insetRectNav(id, x, y, w, h, inset = 12) {
  return {
    id: `${id}_nav`,
    type: 'rect',
    x: x + inset,
    y: y + inset,
    w: Math.max(24, w - inset * 2),
    h: Math.max(24, h - inset * 2),
  };
}

function addRect(list, navZones, id, x, y, w, h, inset = 12) {
  const rect = makeRect(id, x, y, w, h);
  list.push(rect);
  navZones.push(insetRectNav(id, x, y, w, h, inset));
  return rect;
}

function addCentered(list, navZones, id, cx, cy, w, h, inset = 10) {
  return addRect(list, navZones, id, cx - w * 0.5, cy - h * 0.5, w, h, inset);
}

function clamp(n, a, b) {
  return n < a ? a : (n > b ? b : n);
}

function addSteppedLine(list, navZones, id, ax, ay, bx, by, thickness = 34, inset = 8) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 8) return [];
  const step = Math.max(thickness * 0.62, 16);
  const count = Math.max(2, Math.ceil(len / step));
  const out = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const x = ax + dx * t;
    const y = ay + dy * t;
    out.push(addCentered(list, navZones, `${id}_${i}`, x, y, thickness, thickness, inset));
  }
  return out;
}

function addEllipseBands(list, navZones, id, cx, cy, rx, ry, bands = 8, inset = 8) {
  const out = [];
  const bandH = Math.max(16, ((ry * 2) / (bands * 2 + 1)) * 1.16);
  for (let i = -bands; i <= bands; i++) {
    const t = i / bands;
    const y = cy + t * ry * 0.97;
    const halfW = rx * Math.sqrt(Math.max(0, 1 - t * t));
    const w = Math.max(bandH * 1.2, halfW * 2);
    out.push(addCentered(list, navZones, `${id}_${i + bands}`, cx, y, w, bandH, inset));
  }
  return out;
}

function ellipseEdgePoint(cx, cy, rx, ry, tx, ty, shrink = 0.97) {
  const dx = tx - cx;
  const dy = ty - cy;
  const denom = Math.sqrt((dx * dx) / Math.max(1, rx * rx) + (dy * dy) / Math.max(1, ry * ry)) || 1;
  return { x: cx + (dx / denom) * shrink, y: cy + (dy / denom) * shrink };
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

export function generateHubArena({ roomIndex = 0, centerX = 0, centerY = 0, side = 600, profile = null }) {
  const platforms = [];
  const bridges = [];
  const navZones = [];
  const decorAnchors = [];
  const coverAnchors = [];
  const spawnAnchors = [];
  const gateAnchors = [];
  const hazardAnchors = [];
  const walls = [];
  const hazardZones = [];

  const artSize = Math.max(2200, side * 4.8);

  // Walkable footprint tuned to the visible GOLD geometry of this specific HUB asset.
  // Center = inside the middle of the 3 thick outer gold rings.
  const centerRx = artSize * 0.300;
  const centerRy = artSize * 0.148;

  const nodes = {
    portal: relNode(centerX, centerY, artSize, ART_REL.portal),
    merchant: relNode(centerX, centerY, artSize, ART_REL.merchant),
    tierMaster: relNode(centerX, centerY, artSize, ART_REL.tierMaster),
    left: relNode(centerX, centerY, artSize, ART_REL.left),
    right: relNode(centerX, centerY, artSize, ART_REL.right),
    leftBottom: relNode(centerX, centerY, artSize, ART_REL.leftBottom),
    rightBottom: relNode(centerX, centerY, artSize, ART_REL.rightBottom),
    start: relNode(centerX, centerY, artSize, ART_REL.start),
  };
  const core = relNode(centerX, centerY, artSize, ART_REL.core);

  addEllipseBands(platforms, navZones, 'hub_core_disc', core.x, core.y, centerRx, centerRy, 28, 1);

  const podConfig = {
    portal: { rx: artSize * 0.080, ry: artSize * 0.038, bands: 12, bridgeT: artSize * 0.022 },
    merchant: { rx: artSize * 0.082, ry: artSize * 0.039, bands: 12, bridgeT: artSize * 0.022 },
    tierMaster: { rx: artSize * 0.082, ry: artSize * 0.039, bands: 12, bridgeT: artSize * 0.022 },
    left: { rx: artSize * 0.055, ry: artSize * 0.030, bands: 10, bridgeT: artSize * 0.019 },
    right: { rx: artSize * 0.055, ry: artSize * 0.030, bands: 10, bridgeT: artSize * 0.019 },
    leftBottom: { rx: artSize * 0.084, ry: artSize * 0.041, bands: 12, bridgeT: artSize * 0.023 },
    rightBottom: { rx: artSize * 0.084, ry: artSize * 0.041, bands: 12, bridgeT: artSize * 0.023 },
    start: { rx: artSize * 0.084, ry: artSize * 0.041, bands: 12, bridgeT: artSize * 0.023 },
  };

  const platformByKey = {};
  for (const [key, pos] of Object.entries(nodes)) {
    const cfg = podConfig[key];
    platformByKey[key] = addEllipseBands(platforms, navZones, `hub_${key}_pod`, pos.x, pos.y, cfg.rx, cfg.ry, cfg.bands, 1);
  }

  for (const [key, pos] of Object.entries(nodes)) {
    const cfg = podConfig[key];
    const start = ellipseEdgePoint(core.x, core.y, centerRx, centerRy, pos.x, pos.y, 0.965);
    const end = ellipseEdgePoint(pos.x, pos.y, cfg.rx, cfg.ry, core.x, core.y, 0.965);
    addSteppedLine(bridges, navZones, `hub_bridge_${key}`, start.x, start.y, end.x, end.y, Math.max(20, cfg.bridgeT), 1);
  }

  const playerStart = { x: nodes.start.x, y: nodes.start.y };

  gateAnchors.push(
    { side: 'N', x: nodes.portal.x, y: nodes.portal.y - podConfig.portal.ry * 0.25, socket: 'N', tag: 'portal_main' },
    { side: 'S', x: nodes.start.x, y: nodes.start.y + podConfig.start.ry * 0.68, socket: 'S', tag: 'arrival_entry' },
  );

  decorAnchors.push(
    { x: core.x, y: core.y, kind: 'hub_core', size: 64 },
    { x: nodes.portal.x, y: nodes.portal.y, kind: 'portal_gate', size: 52 },
    { x: nodes.merchant.x, y: nodes.merchant.y, kind: 'shop_terminal', size: 32 },
    { x: nodes.tierMaster.x, y: nodes.tierMaster.y, kind: 'tier_terminal', size: 32 },
    { x: nodes.start.x, y: nodes.start.y, kind: 'spawn_pad', size: 28 },
    { x: nodes.left.x, y: nodes.left.y, kind: 'future_node', size: 18 },
    { x: nodes.right.x, y: nodes.right.y, kind: 'future_node', size: 18 },
    { x: nodes.leftBottom.x, y: nodes.leftBottom.y, kind: 'future_node', size: 18 },
    { x: nodes.rightBottom.x, y: nodes.rightBottom.y, kind: 'future_node', size: 18 },
  );

  spawnAnchors.push(
    { x: nodes.merchant.x, y: nodes.merchant.y, tag: 'merchant' },
    { x: nodes.tierMaster.x, y: nodes.tierMaster.y, tag: 'tier' },
    { x: nodes.portal.x, y: nodes.portal.y, tag: 'portal' },
    { x: nodes.start.x, y: nodes.start.y, tag: 'start' },
    { x: core.x, y: core.y, tag: 'core' },
  );

  const innerR = Math.min(centerRx, centerRy) * 0.82;
  const haloR = Math.max(centerRx, centerRy) * 1.16;
  const bossCenter = { x: core.x, y: core.y };

  const hubVisual = {
    kind: 'orbital_disc',
    style: 'arcane_octagon',
    cx: centerX,
    cy: centerY,
    side,
    artSize,
    mainR: Math.max(centerRx, centerRy),
    innerR,
    haloR,
    coreR: innerR * 0.44,
    core,
    nodes,
  };

  return {
    layoutId: `hub_art_scene_v4_r${roomIndex | 0}`,
    profileId: profile?.biomeId || 'hub',
    visualPreset: profile?.visualPreset || 'hub_orbital_disc',
    geometry: {
      platforms,
      bridges,
      walls,
      voidZones: [],
      navZones,
      artParts: [],
      hubVisual,
    },
    anchors: {
      playerStart,
      shopAnchor: nodes.merchant,
      spawnAnchors,
      gateAnchors,
      decorAnchors,
      coverAnchors,
      hazardAnchors,
      bossSpawn: bossCenter,
      bossMoveNodes: [
        bossCenter,
        nodes.portal,
        nodes.merchant,
        nodes.tierMaster,
        nodes.left,
        nodes.right,
        nodes.leftBottom,
        nodes.rightBottom,
        nodes.start,
      ],
      hubNpcAnchors: {
        shop: nodes.merchant,
        tier: nodes.tierMaster,
        portal: nodes.portal,
        spawn: nodes.start,
      },
    },
    hazardZones,
    bossArena: {
      arenaType: 'hub_none',
      center: bossCenter,
      safeLanes: [
        { x: bossCenter.x, y: bossCenter.y, r: innerR * 0.92 },
        { x: nodes.merchant.x, y: nodes.merchant.y, r: artSize * 0.058 },
        { x: nodes.tierMaster.x, y: nodes.tierMaster.y, r: artSize * 0.058 },
      ],
      pressureZones: [],
      phaseNodes: [nodes.portal],
    },
    rules: {
      supportsBridges: true,
      prefersRangedPressure: false,
      slipZones: false,
      fogZones: false,
      radiantBuffNodes: false,
      isHub: true,
      gateAnchorDriven: true,
      sceneAssembler: 'art_scene_v2',
      moduleFamily: 'orbital_hub',
      cleanGameView: true,
    },
  };
}
