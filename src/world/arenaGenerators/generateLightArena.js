function clamp(n, a, b) {
  return n < a ? a : (n > b ? b : n);
}

function rect(id, cx, cy, w, h) {
  return { id, type: 'rect', x: cx - w * 0.5, y: cy - h * 0.5, w, h };
}

export function generateLightArena({ roomIndex = 4, centerX = 0, centerY = 0, side = 1200, profile = null, selectedLayoutId = '' }) {
  const useV2 = String(selectedLayoutId || '').includes('_v2');
  const coreW = side * 0.38;
  const coreH = side * 0.38;
  const northW = side * 0.22;
  const northH = side * 0.16;
  const southW = side * 0.22;
  const southH = side * 0.16;
  const westW = side * 0.16;
  const westH = side * 0.24;
  const eastW = side * 0.16;
  const eastH = side * 0.24;
  const crownW = side * 0.44;
  const crownH = side * 0.18;
  const ringBridge = clamp(side * 0.12, 96, 132);
  const spokeW = clamp(side * 0.10, 88, 118);
  const sideDX = side * 0.27;
  const northY = centerY - side * (useV2 ? 0.18 : 0.24);
  const southY = centerY + side * (useV2 ? 0.28 : 0.24);
  const flankY = centerY + (useV2 ? side * 0.04 : 0);
  const crownY = centerY - side * (useV2 ? 0.14 : 0.02);
  const bossRadius = side * 0.19;

  const platforms = [
    rect('core', centerX, centerY, coreW, coreH),
    rect('north_ray', centerX, northY, northW, northH),
    rect('south_ray', centerX, southY, southW, southH),
    rect('west_arc', centerX - sideDX, flankY, westW, westH),
    rect('east_arc', centerX + sideDX, flankY, eastW, eastH),
    rect('crown_ring', centerX, crownY, crownW, crownH),
  ];

  const bridges = [
    rect('bridge_n', centerX, centerY - side * 0.12, spokeW, side * 0.14),
    rect('bridge_s', centerX, centerY + side * 0.12, spokeW, side * 0.14),
    rect('bridge_w', centerX - side * 0.17, centerY, side * 0.14, ringBridge),
    rect('bridge_e', centerX + side * 0.17, centerY, side * 0.14, ringBridge),
    rect('bridge_crown_l', centerX - side * 0.11, crownY, side * 0.14, clamp(side * 0.08, 72, 100)),
    rect('bridge_crown_r', centerX + side * 0.11, crownY, side * 0.14, clamp(side * 0.08, 72, 100)),
  ];

  const decorAnchors = [
    { x: centerX, y: northY, kind: 'radiant_pylon', size: 26 },
    { x: centerX, y: southY, kind: 'radiant_pylon', size: 24 },
    { x: centerX - sideDX, y: flankY, kind: 'prism', size: 22 },
    { x: centerX + sideDX, y: flankY, kind: 'prism', size: 22 },
    { x: centerX - side * 0.14, y: crownY, kind: 'altar', size: 18 },
    { x: centerX + side * 0.14, y: crownY, kind: 'altar', size: 18 },
  ];

  const coverAnchors = [
    { x: centerX - coreW * 0.18, y: centerY, size: clamp(side * 0.026, 16, 30) },
    { x: centerX + coreW * 0.18, y: centerY, size: clamp(side * 0.026, 16, 30) },
    { x: centerX, y: centerY - coreH * 0.18, size: clamp(side * 0.024, 16, 28) },
  ];

  const gateAnchors = [
    { side: 'W', x: centerX - side * 0.5, y: centerY, tag: 'west_ray' },
    { side: 'E', x: centerX + side * 0.5, y: centerY, tag: 'east_ray' },
    { side: 'S', x: centerX, y: centerY + side * 0.5, tag: 'south_ray' },
  ];

  const spawnAnchors = [
    { x: centerX, y: northY, tag: 'north_ray' },
    { x: centerX, y: southY, tag: 'south_ray' },
    { x: centerX - sideDX, y: flankY, tag: 'west_arc' },
    { x: centerX + sideDX, y: flankY, tag: 'east_arc' },
    { x: centerX - side * 0.14, y: crownY, tag: 'crown_left' },
    { x: centerX + side * 0.14, y: crownY, tag: 'crown_right' },
  ];

  const hazardAnchors = [
    { x: centerX - sideDX, y: flankY, kind: 'radiant_node', r: ringBridge * 0.86 },
    { x: centerX + sideDX, y: flankY, kind: 'radiant_node', r: ringBridge * 0.86 },
    { x: centerX, y: northY, kind: 'prism_lane', r: spokeW * 0.92 },
  ];

  return {
    layoutId: `${useV2 ? 'light_temple_v2' : 'light_temple_v1'}_r${roomIndex | 0}`,
    profileId: profile?.biomeId || 'light',
    visualPreset: profile?.visualPreset || 'light_radiant_temple',
    geometry: {
      platforms,
      bridges,
      walls: [],
      voidZones: [],
      navZones: [
        rect('core_nav', centerX, centerY, coreW - 26, coreH - 26),
        rect('north_nav', centerX, northY, northW - 16, northH - 14),
        rect('south_nav', centerX, southY, southW - 16, southH - 14),
        rect('west_nav', centerX - sideDX, flankY, westW - 14, westH - 16),
        rect('east_nav', centerX + sideDX, flankY, eastW - 14, eastH - 16),
        rect('crown_nav', centerX, crownY, crownW - 18, crownH - 16),
        rect('bridge_n_nav', centerX, centerY - side * 0.12, spokeW - 10, side * 0.14 - 10),
        rect('bridge_s_nav', centerX, centerY + side * 0.12, spokeW - 10, side * 0.14 - 10),
        rect('bridge_w_nav', centerX - side * 0.17, centerY, side * 0.14 - 10, ringBridge - 10),
        rect('bridge_e_nav', centerX + side * 0.17, centerY, side * 0.14 - 10, ringBridge - 10),
        rect('bridge_cl_nav', centerX - side * 0.11, crownY, side * 0.14 - 10, clamp(side * 0.08, 72, 100) - 10),
        rect('bridge_cr_nav', centerX + side * 0.11, crownY, side * 0.14 - 10, clamp(side * 0.08, 72, 100) - 10),
      ],
    },
    anchors: {
      playerStart: { x: centerX, y: centerY + side * 0.10 },
      spawnAnchors,
      gateAnchors,
      decorAnchors,
      coverAnchors,
      hazardAnchors,
      bossSpawn: { x: centerX, y: centerY - side * 0.03 },
      bossMoveNodes: [
        { x: centerX, y: centerY },
        { x: centerX - bossRadius, y: centerY },
        { x: centerX + bossRadius, y: centerY },
        { x: centerX, y: centerY - bossRadius },
        { x: centerX - sideDX, y: flankY },
        { x: centerX + sideDX, y: flankY },
      ],
    },
    hazardZones: [
      { type: 'radiant_node', shape: 'circle', x: centerX - sideDX, y: flankY, r: ringBridge * 0.66, interval: 7.0, duration: 1.4, damageScale: 0.06 },
      { type: 'radiant_node', shape: 'circle', x: centerX + sideDX, y: flankY, r: ringBridge * 0.66, interval: 7.0, duration: 1.4, damageScale: 0.06 },
      { type: 'prism_lane', shape: 'circle', x: centerX, y: northY, r: spokeW * 0.74, interval: 8.5, duration: 1.2, damageScale: 0.08 },
    ],
    bossArena: {
      arenaType: 'light_crown',
      center: { x: centerX, y: centerY },
      safeLanes: [
        { x: centerX, y: centerY, r: spokeW * 1.28 },
        { x: centerX, y: centerY + side * 0.12, r: spokeW * 0.96 },
      ],
      pressureZones: [
        { x: centerX - sideDX, y: flankY, r: ringBridge * 0.80 },
        { x: centerX + sideDX, y: flankY, r: ringBridge * 0.80 },
      ],
      phaseNodes: [
        { x: centerX, y: northY },
        { x: centerX - sideDX, y: flankY },
        { x: centerX + sideDX, y: flankY },
        { x: centerX, y: southY },
      ],
    },
    rules: {
      supportsBridges: true,
      prefersRangedPressure: true,
      slipZones: false,
      fogZones: false,
      radiantBuffNodes: true,
      isHub: false,
      gateAnchorDriven: true,
      radiantPaths: true,
    },
  };
}
