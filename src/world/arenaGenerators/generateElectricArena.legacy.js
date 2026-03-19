function clamp(n, a, b) { return n < a ? a : (n > b ? b : n); }
function rectPlatform(id, cx, cy, w, h) { return { id, type: 'rect', x: cx - w * 0.5, y: cy - h * 0.5, w, h }; }
function rectNav(id, cx, cy, w, h) { return { id, type: 'rect', x: cx - w * 0.5, y: cy - h * 0.5, w, h }; }

export function generateElectricArena({ roomIndex = 4, centerX = 0, centerY = 0, side = 1200, profile = null, selectedLayoutId = '' }) {
  const useV2 = String(selectedLayoutId || '').includes('_v2');
  const mainW = side * (useV2 ? 0.44 : 0.48);
  const mainH = side * (useV2 ? 0.36 : 0.40);
  const islandW = side * 0.18;
  const islandH = side * 0.16;
  const outerW = side * 0.16;
  const outerH = side * 0.14;
  const dx = side * (useV2 ? 0.27 : 0.29);
  const upperY = centerY - side * 0.20;
  const outerY = centerY + side * 0.24;
  const bridgeW = clamp(side * 0.11, 96, 144);
  const bridgeH = clamp(side * 0.10, 88, 128);
  const bossRadius = side * 0.17;

  const platforms = useV2 ? [
    rectPlatform('main', centerX, centerY, mainW, mainH),
    rectPlatform('north', centerX, upperY, islandW * 1.05, islandH),
    rectPlatform('west', centerX - dx, centerY + side * 0.02, islandW * 0.96, islandH * 1.02),
    rectPlatform('east', centerX + dx, centerY + side * 0.02, islandW * 0.96, islandH * 1.02),
    rectPlatform('south', centerX, outerY, outerW * 1.12, outerH * 1.02),
  ] : [
    rectPlatform('main', centerX, centerY, mainW, mainH),
    rectPlatform('north_west', centerX - dx, upperY, islandW, islandH),
    rectPlatform('north_east', centerX + dx, upperY, islandW, islandH),
    rectPlatform('south_west', centerX - dx * 0.78, outerY, outerW, outerH),
    rectPlatform('south_east', centerX + dx * 0.78, outerY, outerW, outerH),
  ];

  const topLinkW = clamp(side * 0.14, 108, 180);
  const topLinkH = clamp(side * 0.10, 84, 120);
  const bottomLinkW = clamp(side * 0.13, 100, 168);
  const bottomLinkH = clamp(side * 0.10, 84, 116);
  const topLinkY = centerY - side * 0.16;
  const bottomLinkY = centerY + side * 0.16;

  const bridges = useV2 ? [
    rectPlatform('bridge_n', centerX, centerY - side * 0.10, bridgeW, side * 0.18),
    rectPlatform('bridge_w', centerX - side * 0.18, centerY + side * 0.01, side * 0.15, bridgeH),
    rectPlatform('bridge_e', centerX + side * 0.18, centerY + side * 0.01, side * 0.15, bridgeH),
    rectPlatform('bridge_s', centerX, centerY + side * 0.15, bridgeW * 0.92, side * 0.16),
  ] : [
    rectPlatform('bridge_nw', centerX - side * 0.22, topLinkY, topLinkW, topLinkH),
    rectPlatform('bridge_ne', centerX + side * 0.22, topLinkY, topLinkW, topLinkH),
    rectPlatform('bridge_sw', centerX - side * 0.17, bottomLinkY, bottomLinkW, bottomLinkH),
    rectPlatform('bridge_se', centerX + side * 0.17, bottomLinkY, bottomLinkW, bottomLinkH),
  ];

  const decorAnchors = useV2 ? [
    { x: centerX, y: upperY, kind: 'reactor', size: 32 },
    { x: centerX - dx, y: centerY + side * 0.02, kind: 'coil', size: 22 },
    { x: centerX + dx, y: centerY + side * 0.02, kind: 'coil', size: 22 },
    { x: centerX, y: outerY, kind: 'dock', size: 20 },
  ] : [
    { x: centerX, y: centerY - side * 0.24, kind: 'reactor', size: 34 },
    { x: centerX - dx, y: upperY, kind: 'coil', size: 24 },
    { x: centerX + dx, y: upperY, kind: 'coil', size: 24 },
    { x: centerX - dx * 0.78, y: outerY, kind: 'dock', size: 20 },
    { x: centerX + dx * 0.78, y: outerY, kind: 'dock', size: 20 },
  ];

  const coverAnchors = [
    { x: centerX - mainW * 0.22, y: centerY + mainH * 0.05, size: clamp(side * 0.028, 18, 34) },
    { x: centerX + mainW * 0.22, y: centerY + mainH * 0.05, size: clamp(side * 0.028, 18, 34) },
  ];

  const gateAnchors = useV2 ? [
    { side: 'W', x: centerX - side * 0.5, y: centerY + side * 0.02, tag: 'west_line' },
    { side: 'E', x: centerX + side * 0.5, y: centerY + side * 0.02, tag: 'east_line' },
    { side: 'S', x: centerX, y: centerY + side * 0.5, tag: 'south_node' },
  ] : [
    { side: 'W', x: centerX - side * 0.5, y: upperY, tag: 'west_node' },
    { side: 'E', x: centerX + side * 0.5, y: upperY, tag: 'east_node' },
    { side: 'S', x: centerX, y: centerY + side * 0.5, tag: 'south_feed' },
  ];

  const spawnAnchors = useV2 ? [
    { x: centerX, y: upperY, tag: 'island_n' },
    { x: centerX - dx, y: centerY + side * 0.02, tag: 'island_w' },
    { x: centerX + dx, y: centerY + side * 0.02, tag: 'island_e' },
    { x: centerX, y: outerY, tag: 'island_s' },
    { x: centerX, y: centerY, tag: 'hub_mid' },
  ] : [
    { x: centerX - dx, y: upperY, tag: 'island_nw' },
    { x: centerX + dx, y: upperY, tag: 'island_ne' },
    { x: centerX - dx * 0.78, y: outerY, tag: 'island_sw' },
    { x: centerX + dx * 0.78, y: outerY, tag: 'island_se' },
    { x: centerX, y: centerY, tag: 'hub_core' },
  ];

  const hazardAnchors = useV2 ? [
    { x: centerX, y: centerY - side * 0.10, kind: 'bridge_pulse', r: bridgeW * 0.8 },
    { x: centerX, y: centerY + side * 0.15, kind: 'bridge_pulse', r: bridgeW * 0.76 },
  ] : [
    { x: centerX - side * 0.22, y: topLinkY, kind: 'bridge_pulse', r: topLinkH * 0.70 },
    { x: centerX + side * 0.22, y: topLinkY, kind: 'bridge_pulse', r: topLinkH * 0.70 },
  ];

  const navZones = useV2 ? [
    rectNav('main_nav', centerX, centerY, mainW - 34, mainH - 34),
    rectNav('n_nav', centerX, upperY, islandW * 1.05 - 18, islandH - 18),
    rectNav('w_nav', centerX - dx, centerY + side * 0.02, islandW * 0.96 - 18, islandH * 1.02 - 18),
    rectNav('e_nav', centerX + dx, centerY + side * 0.02, islandW * 0.96 - 18, islandH * 1.02 - 18),
    rectNav('s_nav', centerX, outerY, outerW * 1.12 - 18, outerH * 1.02 - 18),
    rectNav('bn_nav', centerX, centerY - side * 0.10, bridgeW - 10, side * 0.18 - 10),
    rectNav('bw_nav', centerX - side * 0.18, centerY + side * 0.01, side * 0.15 - 10, bridgeH - 10),
    rectNav('be_nav', centerX + side * 0.18, centerY + side * 0.01, side * 0.15 - 10, bridgeH - 10),
    rectNav('bs_nav', centerX, centerY + side * 0.15, bridgeW * 0.92 - 10, side * 0.16 - 10),
  ] : [
    rectNav('main_nav', centerX, centerY, mainW - 34, mainH - 34),
    rectNav('nw_nav', centerX - dx, upperY, islandW - 18, islandH - 18),
    rectNav('ne_nav', centerX + dx, upperY, islandW - 18, islandH - 18),
    rectNav('sw_nav', centerX - dx * 0.78, outerY, outerW - 18, outerH - 18),
    rectNav('se_nav', centerX + dx * 0.78, outerY, outerW - 18, outerH - 18),
    rectNav('bnw_nav', centerX - side * 0.22, topLinkY, topLinkW - 10, topLinkH - 10),
    rectNav('bne_nav', centerX + side * 0.22, topLinkY, topLinkW - 10, topLinkH - 10),
    rectNav('bsw_nav', centerX - side * 0.17, bottomLinkY, bottomLinkW - 10, bottomLinkH - 10),
    rectNav('bse_nav', centerX + side * 0.17, bottomLinkY, bottomLinkW - 10, bottomLinkH - 10),
  ];

  return {
    layoutId: `${useV2 ? 'electric_chain_v2' : 'electric_chain_v1'}_r${roomIndex | 0}`,
    profileId: profile?.biomeId || 'electric',
    visualPreset: profile?.visualPreset || 'electric_chain_grid',
    geometry: { platforms, bridges, walls: [], voidZones: [], navZones },
    anchors: {
      playerStart: useV2 ? { x: centerX, y: centerY + side * 0.24 } : { x: centerX, y: centerY + mainH * 0.14 },
      spawnAnchors,
      gateAnchors,
      decorAnchors,
      coverAnchors,
      hazardAnchors,
      bossSpawn: { x: centerX, y: centerY - side * 0.06 },
      bossMoveNodes: useV2 ? [
        { x: centerX, y: centerY },
        { x: centerX, y: centerY - bossRadius },
        { x: centerX - bossRadius, y: centerY + side * 0.02 },
        { x: centerX + bossRadius, y: centerY + side * 0.02 },
        { x: centerX, y: outerY },
      ] : [
        { x: centerX, y: centerY },
        { x: centerX - bossRadius, y: centerY },
        { x: centerX + bossRadius, y: centerY },
        { x: centerX, y: centerY - bossRadius },
        { x: centerX - dx * 0.55, y: upperY + islandH * 0.08 },
        { x: centerX + dx * 0.55, y: upperY + islandH * 0.08 },
      ],
    },
    hazardZones: useV2 ? [
      { type: 'electric_pulse', shape: 'circle', x: centerX, y: centerY - side * 0.10, r: bridgeW * 0.66, interval: 6.1, duration: 0.9, damageScale: 0.26 },
      { type: 'electric_pulse', shape: 'circle', x: centerX, y: centerY + side * 0.15, r: bridgeW * 0.62, interval: 6.8, duration: 0.9, damageScale: 0.22 },
    ] : [
      { type: 'electric_pulse', shape: 'circle', x: centerX - side * 0.22, y: topLinkY, r: topLinkH * 0.56, interval: 6.1, duration: 0.9, damageScale: 0.24 },
      { type: 'electric_pulse', shape: 'circle', x: centerX + side * 0.22, y: topLinkY, r: topLinkH * 0.56, interval: 6.1, duration: 0.9, damageScale: 0.24 },
    ],
    bossArena: {
      arenaType: 'electric_hub',
      center: { x: centerX, y: centerY },
      safeLanes: useV2 ? [
        { x: centerX, y: centerY + side * 0.10, r: bridgeW * 1.18 },
        { x: centerX - side * 0.18, y: centerY + side * 0.02, r: bridgeW * 0.86 },
        { x: centerX + side * 0.18, y: centerY + side * 0.02, r: bridgeW * 0.86 },
      ] : [
        { x: centerX, y: centerY + side * 0.12, r: bridgeW * 1.2 },
        { x: centerX, y: centerY - side * 0.04, r: bridgeW * 1.0 },
      ],
      pressureZones: useV2 ? [
        { x: centerX, y: centerY - side * 0.10, r: bridgeW * 0.88 },
        { x: centerX, y: centerY + side * 0.15, r: bridgeW * 0.82 },
      ] : [
        { x: centerX - side * 0.22, y: topLinkY, r: topLinkH * 0.72 },
        { x: centerX + side * 0.22, y: topLinkY, r: topLinkH * 0.72 },
      ],
      phaseNodes: useV2 ? [
        { x: centerX, y: upperY },
        { x: centerX - dx, y: centerY + side * 0.02 },
        { x: centerX + dx, y: centerY + side * 0.02 },
        { x: centerX, y: outerY },
      ] : [
        { x: centerX - dx, y: upperY },
        { x: centerX + dx, y: upperY },
        { x: centerX - dx * 0.78, y: outerY },
        { x: centerX + dx * 0.78, y: outerY },
      ],
    },
    rules: {
      supportsBridges: true,
      prefersRangedPressure: true,
      slipZones: false,
      fogZones: false,
      radiantBuffNodes: false,
      isHub: false,
      gateAnchorDriven: true,
      bridgeCombat: true,
    },
  };
}
