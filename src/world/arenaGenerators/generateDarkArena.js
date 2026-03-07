function clamp(n, a, b) {
  return n < a ? a : (n > b ? b : n);
}

function rect(id, cx, cy, w, h) {
  return { id, type: 'rect', x: cx - w * 0.5, y: cy - h * 0.5, w, h };
}

export function generateDarkArena({ roomIndex = 4, centerX = 0, centerY = 0, side = 1200, profile = null, selectedLayoutId = '' }) {
  const useV2 = String(selectedLayoutId || '').includes('_v2');
  const coreW = side * 0.38;
  const coreH = side * 0.35;
  const northW = side * 0.22;
  const northH = side * 0.16;
  const westW = side * 0.16;
  const westH = side * 0.26;
  const eastW = side * 0.18;
  const eastH = side * 0.22;
  const southW = side * 0.26;
  const southH = side * 0.15;
  const pocketW = side * 0.14;
  const pocketH = side * 0.14;
  const bridgeW = clamp(side * 0.11, 96, 132);
  const bridgeH = clamp(side * 0.12, 96, 136);
  const flankDX = side * (useV2 ? 0.22 : 0.26);
  const pocketDX = side * 0.15;
  const northY = centerY - side * 0.23;
  const westY = centerY - side * (useV2 ? 0.12 : 0.03);
  const eastY = centerY + side * (useV2 ? 0.14 : 0.06);
  const southY = centerY + side * (useV2 ? 0.18 : 0.24);
  const pocketY = centerY + side * (useV2 ? 0.28 : 0.18);
  const bossRadius = side * 0.17;

  const platforms = [
    rect('core', centerX, centerY, coreW, coreH),
    rect('north_void', centerX - side * 0.03, northY, northW, northH),
    rect('west_path', centerX - flankDX, westY, westW, westH),
    rect('east_path', centerX + flankDX, eastY, eastW, eastH),
    rect('south_void', centerX + side * 0.02, southY, southW, southH),
    rect('pocket_w', centerX - pocketDX, pocketY, pocketW, pocketH),
    rect('pocket_e', centerX + pocketDX * 1.15, pocketY + side * 0.03, pocketW * 0.92, pocketH * 0.92),
  ];

  const bridges = [
    rect('bridge_n', centerX - side * 0.03, centerY - side * 0.12, bridgeW, side * 0.14),
    rect('bridge_w', centerX - side * 0.16, centerY - side * 0.01, side * 0.14, bridgeH),
    rect('bridge_e', centerX + side * 0.16, centerY + side * 0.03, side * 0.14, bridgeH * 0.88),
    rect('bridge_s', centerX + side * 0.02, centerY + side * 0.15, bridgeW, side * 0.14),
    rect('bridge_sw_pocket', centerX - side * 0.08, centerY + side * 0.16, side * 0.12, clamp(side * 0.08, 72, 100)),
    rect('bridge_se_pocket', centerX + side * 0.10, centerY + side * 0.19, side * 0.11, clamp(side * 0.08, 72, 100)),
  ];

  const decorAnchors = [
    { x: centerX - side * 0.03, y: northY, kind: 'void_obelisk', size: 26 },
    { x: centerX - flankDX, y: westY, kind: 'shadow_spire', size: 22 },
    { x: centerX + flankDX, y: eastY, kind: 'shadow_spire', size: 20 },
    { x: centerX - pocketDX, y: pocketY, kind: 'rift', size: 18 },
    { x: centerX + pocketDX * 1.15, y: pocketY + side * 0.03, kind: 'rift', size: 18 },
  ];

  const coverAnchors = [
    { x: centerX - coreW * 0.18, y: centerY - coreH * 0.10, size: clamp(side * 0.028, 18, 32) },
    { x: centerX + coreW * 0.12, y: centerY + coreH * 0.08, size: clamp(side * 0.026, 16, 30) },
    { x: centerX - side * 0.04, y: centerY + coreH * 0.22, size: clamp(side * 0.024, 16, 28) },
  ];

  const gateAnchors = [
    { side: 'W', x: centerX - side * 0.5, y: centerY - side * 0.08, tag: 'west_void' },
    { side: 'E', x: centerX + side * 0.5, y: centerY + side * 0.10, tag: 'east_void' },
    { side: 'S', x: centerX - side * 0.06, y: centerY + side * 0.5, tag: 'south_shadow' },
  ];

  const spawnAnchors = [
    { x: centerX - side * 0.03, y: northY, tag: 'north_void' },
    { x: centerX - flankDX, y: westY, tag: 'west_flank' },
    { x: centerX + flankDX, y: eastY, tag: 'east_flank' },
    { x: centerX + side * 0.02, y: southY, tag: 'south_void' },
    { x: centerX - pocketDX, y: pocketY, tag: 'pocket_w' },
    { x: centerX + pocketDX * 1.15, y: pocketY + side * 0.03, tag: 'pocket_e' },
  ];

  const hazardAnchors = [
    { x: centerX - side * 0.12, y: centerY - side * 0.02, kind: 'void_fog', r: bridgeW * 0.92 },
    { x: centerX + side * 0.16, y: centerY + side * 0.06, kind: 'phase_pool', r: bridgeW * 0.84 },
    { x: centerX + side * 0.02, y: southY, kind: 'void_sink', r: bridgeW * 0.90 },
  ];

  return {
    layoutId: `${useV2 ? 'dark_void_v2' : 'dark_void_v1'}_r${roomIndex | 0}`,
    profileId: profile?.biomeId || 'dark',
    visualPreset: profile?.visualPreset || 'dark_void_paths',
    geometry: {
      platforms,
      bridges,
      walls: [],
      voidZones: [],
      navZones: [
        rect('core_nav', centerX, centerY, coreW - 28, coreH - 26),
        rect('north_nav', centerX - side * 0.03, northY, northW - 16, northH - 14),
        rect('west_nav', centerX - flankDX, westY, westW - 14, westH - 16),
        rect('east_nav', centerX + flankDX, eastY, eastW - 14, eastH - 16),
        rect('south_nav', centerX + side * 0.02, southY, southW - 18, southH - 14),
        rect('pocket_w_nav', centerX - pocketDX, pocketY, pocketW - 14, pocketH - 14),
        rect('pocket_e_nav', centerX + pocketDX * 1.15, pocketY + side * 0.03, pocketW * 0.92 - 12, pocketH * 0.92 - 12),
        rect('bridge_n_nav', centerX - side * 0.03, centerY - side * 0.12, bridgeW - 10, side * 0.14 - 10),
        rect('bridge_w_nav', centerX - side * 0.16, centerY - side * 0.01, side * 0.14 - 10, bridgeH - 10),
        rect('bridge_e_nav', centerX + side * 0.16, centerY + side * 0.03, side * 0.14 - 10, bridgeH * 0.88 - 10),
        rect('bridge_s_nav', centerX + side * 0.02, centerY + side * 0.15, bridgeW - 10, side * 0.14 - 10),
        rect('bridge_sw_nav', centerX - side * 0.08, centerY + side * 0.16, side * 0.12 - 10, clamp(side * 0.08, 72, 100) - 10),
        rect('bridge_se_nav', centerX + side * 0.10, centerY + side * 0.19, side * 0.11 - 10, clamp(side * 0.08, 72, 100) - 10),
      ],
    },
    anchors: {
      playerStart: { x: centerX, y: centerY + side * 0.10 },
      spawnAnchors,
      gateAnchors,
      decorAnchors,
      coverAnchors,
      hazardAnchors,
      bossSpawn: { x: centerX, y: centerY - side * 0.02 },
      bossMoveNodes: [
        { x: centerX, y: centerY },
        { x: centerX - bossRadius, y: centerY - side * 0.05 },
        { x: centerX + bossRadius, y: centerY + side * 0.02 },
        { x: centerX - pocketDX, y: pocketY },
        { x: centerX + pocketDX * 1.15, y: pocketY + side * 0.03 },
        { x: centerX + side * 0.02, y: southY },
      ],
    },
    hazardZones: [
      { type: 'void_fog', shape: 'circle', x: centerX - side * 0.12, y: centerY - side * 0.02, r: bridgeW * 0.72, interval: 6.2, duration: 1.8, damageScale: 0.09 },
      { type: 'phase_pool', shape: 'circle', x: centerX + side * 0.16, y: centerY + side * 0.06, r: bridgeW * 0.64, interval: 7.6, duration: 1.4, damageScale: 0.08 },
      { type: 'void_sink', shape: 'circle', x: centerX + side * 0.02, y: southY, r: bridgeW * 0.76, interval: 8.0, duration: 1.2, damageScale: 0.10 },
    ],
    bossArena: {
      arenaType: 'dark_abyss',
      center: { x: centerX, y: centerY },
      safeLanes: [
        { x: centerX, y: centerY + side * 0.06, r: bridgeW * 1.06 },
        { x: centerX - side * 0.12, y: centerY + side * 0.12, r: bridgeW * 0.84 },
      ],
      pressureZones: [
        { x: centerX - side * 0.12, y: centerY - side * 0.02, r: bridgeW * 0.82 },
        { x: centerX + side * 0.16, y: centerY + side * 0.06, r: bridgeW * 0.74 },
        { x: centerX + side * 0.02, y: southY, r: bridgeW * 0.86 },
      ],
      phaseNodes: [
        { x: centerX - flankDX, y: westY },
        { x: centerX + flankDX, y: eastY },
        { x: centerX - pocketDX, y: pocketY },
        { x: centerX + pocketDX * 1.15, y: pocketY + side * 0.03 },
      ],
    },
    rules: {
      supportsBridges: true,
      prefersRangedPressure: false,
      slipZones: false,
      fogZones: true,
      radiantBuffNodes: false,
      isHub: false,
      gateAnchorDriven: true,
      flankRoutes: true,
    },
  };
}
