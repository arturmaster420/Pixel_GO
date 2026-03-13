function clamp(n, a, b) {
  return n < a ? a : (n > b ? b : n);
}

function rect(id, cx, cy, w, h) {
  return { id, type: 'rect', x: cx - w * 0.5, y: cy - h * 0.5, w, h };
}

function linkSpan(distance, aSize, bSize, extra = 120, minSize = 92) {
  return Math.max(minSize, distance - (aSize + bSize) * 0.5 + extra);
}

export function generateDarkArena({ roomIndex = 4, centerX = 0, centerY = 0, side = 1200, profile = null, selectedLayoutId = '' }) {
  const useV2 = String(selectedLayoutId || '').includes('_v2');

  // Dark should feel: broken geometry, empty void, off-axis flanks and unsafe seams.
  // The room must still have one readable safe entry from the south, while west/east are
  // ambush routes with phase pressure.
  const coreW = side * (useV2 ? 0.34 : 0.38);
  const coreH = side * (useV2 ? 0.30 : 0.34);
  const northW = side * (useV2 ? 0.22 : 0.24);
  const northH = side * 0.13;
  const southW = side * (useV2 ? 0.22 : 0.24);
  const southH = side * 0.16;
  const westW = side * (useV2 ? 0.18 : 0.17);
  const westH = side * (useV2 ? 0.28 : 0.26);
  const eastW = side * (useV2 ? 0.20 : 0.18);
  const eastH = side * (useV2 ? 0.24 : 0.22);
  const westPocketW = side * 0.15;
  const westPocketH = side * 0.13;
  const eastPocketW = side * 0.13;
  const eastPocketH = side * 0.12;
  const spineW = clamp(side * 0.10, 88, 128);
  const spineH = clamp(side * 0.11, 86, 132);
  const sideBridgeW = clamp(side * 0.12, 96, 138);
  const sideBridgeH = clamp(side * 0.11, 86, 126);
  const voidLinkBonus = clamp(side * 0.02, 18, 30);

  const coreX = centerX + side * (useV2 ? 0.03 : -0.02);
  const coreY = centerY + side * (useV2 ? -0.03 : -0.01);
  const northX = centerX + side * (useV2 ? -0.13 : -0.08);
  const northY = centerY - side * (useV2 ? 0.27 : 0.23);
  const southX = centerX + side * (useV2 ? -0.16 : -0.06);
  const southY = centerY + side * (useV2 ? 0.27 : 0.24);
  const westX = centerX - side * (useV2 ? 0.29 : 0.26);
  const westY = centerY + side * (useV2 ? -0.02 : -0.10);
  const eastX = centerX + side * (useV2 ? 0.30 : 0.26);
  const eastY = centerY + side * (useV2 ? 0.05 : 0.13);
  const westPocketX = centerX - side * (useV2 ? 0.17 : 0.15);
  const westPocketY = centerY + side * (useV2 ? 0.23 : 0.18);
  const eastPocketX = centerX + side * (useV2 ? 0.15 : 0.18);
  const eastPocketY = centerY + side * (useV2 ? -0.18 : 0.26);
  const bossRadius = side * 0.17;

  const northBridgeW = useV2 ? clamp(spineW + Math.abs(coreX - northX) + northW * 0.24, 138, side * 0.24) : spineW;
  const westBridgeH = useV2 ? clamp(sideBridgeH + Math.abs(coreY - westY) + westH * 0.22, 110, side * 0.22) : sideBridgeH;
  const eastBridgeH = useV2 ? clamp(sideBridgeH + Math.abs(coreY - eastY) + eastH * 0.20, 110, side * 0.22) : sideBridgeH;

  const northLinkH = linkSpan(Math.abs(coreY - northY), coreH, northH, 126, 126) + voidLinkBonus + (useV2 ? clamp(side * 0.04, 48, 120) : 0);
  const southLinkH = linkSpan(Math.abs(coreY - southY), coreH, southH, 132, 132) + (useV2 ? clamp(side * 0.04, 48, 86) : 0);
  const westLinkW = linkSpan(Math.abs(coreX - westX), coreW, westW, 126, 118) + voidLinkBonus + (useV2 ? clamp(side * 0.04, 48, 84) : 0);
  const eastLinkW = linkSpan(Math.abs(coreX - eastX), coreW, eastW, 122, 122) + (useV2 ? clamp(side * 0.03, 36, 72) : 0);

  const platforms = [
    rect('core', coreX, coreY, coreW, coreH),
    rect('north_shard', northX, northY, northW, northH),
    rect('south_entry', southX, southY, southW, southH),
    rect('west_flank', westX, westY, westW, westH),
    rect('east_flank', eastX, eastY, eastW, eastH),
    rect('west_pocket', westPocketX, westPocketY, westPocketW, westPocketH),
    rect('east_pocket', eastPocketX, eastPocketY, eastPocketW, eastPocketH),
  ];

  const bridges = [
    rect('bridge_north', (coreX + northX) * 0.5, (coreY + northY) * 0.5, northBridgeW, northLinkH),
    rect('bridge_south', (coreX + southX) * 0.5, (coreY + southY) * 0.5, spineW, southLinkH),
    rect('bridge_west', (coreX + westX) * 0.5, (coreY + westY) * 0.5, westLinkW, westBridgeH),
    rect('bridge_east', (coreX + eastX) * 0.5, (coreY + eastY) * 0.5, eastLinkW, eastBridgeH),
    rect('bridge_sw', (southX + westPocketX) * 0.5, (southY + westPocketY) * 0.5, sideBridgeW, clamp(side * 0.08, 70, 100)),
    rect('bridge_ne', (northX + eastPocketX) * 0.5, (northY + eastPocketY) * 0.5, sideBridgeW, clamp(side * 0.08, 70, 100)),
  ];

  const decorAnchors = [
    { x: northX, y: northY, kind: 'void_obelisk', size: 26 },
    { x: westX, y: westY - westH * 0.18, kind: 'shadow_spire', size: 22 },
    { x: eastX, y: eastY + eastH * 0.16, kind: 'shadow_spire', size: 22 },
    { x: westPocketX, y: westPocketY, kind: 'rift', size: 20 },
    { x: eastPocketX, y: eastPocketY, kind: 'rift', size: 20 },
  ];

  const coverAnchors = useV2
    ? [
        { x: coreX - coreW * 0.18, y: coreY - coreH * 0.08, size: clamp(side * 0.026, 16, 28) },
        { x: coreX + coreW * 0.10, y: coreY + coreH * 0.14, size: clamp(side * 0.028, 18, 30) },
        { x: southX - southW * 0.08, y: southY, size: clamp(side * 0.024, 16, 28) },
        { x: eastX + eastW * 0.06, y: eastY - eastH * 0.10, size: clamp(side * 0.022, 16, 26) },
      ]
    : [
        { x: coreX - coreW * 0.16, y: coreY - coreH * 0.10, size: clamp(side * 0.026, 16, 28) },
        { x: coreX + coreW * 0.14, y: coreY + coreH * 0.10, size: clamp(side * 0.026, 16, 28) },
        { x: southX, y: southY - southH * 0.02, size: clamp(side * 0.024, 16, 28) },
      ];

  const gateAnchors = [
    { side: 'W', x: centerX - side * 0.5, y: westY - side * 0.03, tag: 'west_flank' },
    { side: 'E', x: centerX + side * 0.5, y: eastY + side * 0.03, tag: 'east_flank' },
    { side: 'S', x: southX, y: centerY + side * 0.5, tag: 'south_entry' },
  ];

  const spawnAnchors = useV2
    ? [
        { x: northX, y: northY, tag: 'north_shard' },
        { x: westX, y: westY - westH * 0.18, tag: 'west_upper_flank' },
        { x: eastX, y: eastY + eastH * 0.16, tag: 'east_lower_flank' },
        { x: westPocketX, y: westPocketY, tag: 'west_pocket' },
        { x: eastPocketX, y: eastPocketY, tag: 'east_pocket' },
        { x: coreX + coreW * 0.10, y: coreY - coreH * 0.14, tag: 'broken_mid' },
      ]
    : [
        { x: northX, y: northY, tag: 'north_shard' },
        { x: westX, y: westY, tag: 'west_flank' },
        { x: eastX, y: eastY, tag: 'east_flank' },
        { x: westPocketX, y: westPocketY, tag: 'west_pocket' },
        { x: eastPocketX, y: eastPocketY, tag: 'east_pocket' },
      ];

  const hazardAnchors = useV2
    ? [
        { x: coreX - side * 0.15, y: coreY - side * 0.02, kind: 'void_fog', r: sideBridgeW * 0.78 },
        { x: coreX + side * 0.18, y: coreY + side * 0.06, kind: 'phase_pool', r: sideBridgeW * 0.72 },
        { x: eastPocketX, y: eastPocketY, kind: 'void_sink', r: sideBridgeW * 0.66 },
      ]
    : [
        { x: coreX - side * 0.16, y: coreY - side * 0.02, kind: 'void_fog', r: sideBridgeW * 0.78 },
        { x: coreX + side * 0.15, y: coreY + side * 0.08, kind: 'phase_pool', r: sideBridgeW * 0.72 },
        { x: eastPocketX, y: eastPocketY, kind: 'void_sink', r: sideBridgeW * 0.66 },
      ];

  const navZones = [
    rect('core_nav', coreX, coreY, coreW - 10, coreH - 10),
    rect('north_nav', northX, northY, northW - 8, northH - 8),
    rect('south_nav', southX, southY, southW - 10, southH - 10),
    rect('west_nav', westX, westY, westW - 10, westH - 10),
    rect('east_nav', eastX, eastY, eastW - 10, eastH - 10),
    rect('west_pocket_nav', westPocketX, westPocketY, westPocketW - 8, westPocketH - 8),
    rect('east_pocket_nav', eastPocketX, eastPocketY, eastPocketW - 8, eastPocketH - 8),
    rect('bridge_n_nav', (coreX + northX) * 0.5, (coreY + northY) * 0.5, northBridgeW - 4, northLinkH - 4),
    rect('bridge_s_nav', (coreX + southX) * 0.5, (coreY + southY) * 0.5, spineW - 4, southLinkH - 4),
    rect('bridge_w_nav', (coreX + westX) * 0.5, (coreY + westY) * 0.5, westLinkW - 4, westBridgeH - 4),
    rect('bridge_e_nav', (coreX + eastX) * 0.5, (coreY + eastY) * 0.5, eastLinkW - 4, eastBridgeH - 4),
    rect('bridge_sw_nav', (southX + westPocketX) * 0.5, (southY + westPocketY) * 0.5, sideBridgeW - 4, clamp(side * 0.08, 70, 100) - 4),
    rect('bridge_ne_nav', (northX + eastPocketX) * 0.5, (northY + eastPocketY) * 0.5, sideBridgeW - 4, clamp(side * 0.08, 70, 100) - 4),
  ];

  const playerStart = useV2
    ? { x: southX - southW * 0.10, y: southY + southH * 0.02 }
    : { x: southX, y: southY + southH * 0.02 };

  const bossMoveNodes = useV2
    ? [
        { x: coreX, y: coreY },
        { x: coreX - bossRadius, y: coreY - side * 0.04 },
        { x: coreX + bossRadius, y: coreY + side * 0.04 },
        { x: northX, y: northY },
        { x: westX, y: westY },
        { x: eastX, y: eastY },
        { x: westPocketX, y: westPocketY },
      ]
    : [
        { x: coreX, y: coreY },
        { x: coreX - bossRadius, y: coreY - side * 0.02 },
        { x: coreX + bossRadius, y: coreY + side * 0.04 },
        { x: northX, y: northY },
        { x: westX, y: westY },
        { x: eastX, y: eastY },
        { x: eastPocketX, y: eastPocketY },
      ];

  const hazardZones = useV2
    ? [
        { type: 'void_fog', shape: 'circle', x: coreX - side * 0.15, y: coreY - side * 0.02, r: sideBridgeW * 0.58, interval: 6.6, duration: 1.7, damageScale: 0.09 },
        { type: 'phase_pool', shape: 'circle', x: coreX + side * 0.18, y: coreY + side * 0.06, r: sideBridgeW * 0.54, interval: 7.4, duration: 1.35, damageScale: 0.08 },
        { type: 'void_sink', shape: 'circle', x: eastPocketX, y: eastPocketY, r: sideBridgeW * 0.48, interval: 8.2, duration: 1.1, damageScale: 0.10 },
      ]
    : [
        { type: 'void_fog', shape: 'circle', x: coreX - side * 0.16, y: coreY - side * 0.02, r: sideBridgeW * 0.58, interval: 6.6, duration: 1.7, damageScale: 0.09 },
        { type: 'phase_pool', shape: 'circle', x: coreX + side * 0.15, y: coreY + side * 0.08, r: sideBridgeW * 0.54, interval: 7.4, duration: 1.35, damageScale: 0.08 },
        { type: 'void_sink', shape: 'circle', x: eastPocketX, y: eastPocketY, r: sideBridgeW * 0.48, interval: 8.2, duration: 1.1, damageScale: 0.10 },
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
      navZones,
    },
    anchors: {
      playerStart,
      spawnAnchors,
      gateAnchors,
      decorAnchors,
      coverAnchors,
      hazardAnchors,
      bossSpawn: { x: coreX, y: coreY - side * 0.02 },
      bossMoveNodes,
    },
    hazardZones,
    bossArena: {
      arenaType: 'dark_abyss',
      center: { x: coreX, y: coreY },
      safeLanes: useV2
        ? [
            { x: southX, y: southY, r: sideBridgeW * 0.92 },
            { x: westPocketX, y: westPocketY, r: sideBridgeW * 0.72 },
          ]
        : [
            { x: southX, y: southY, r: sideBridgeW * 0.94 },
            { x: westPocketX, y: westPocketY, r: sideBridgeW * 0.70 },
          ],
      pressureZones: useV2
        ? [
            { x: coreX - side * 0.15, y: coreY - side * 0.02, r: sideBridgeW * 0.72 },
            { x: coreX + side * 0.18, y: coreY + side * 0.06, r: sideBridgeW * 0.68 },
            { x: eastPocketX, y: eastPocketY, r: sideBridgeW * 0.60 },
          ]
        : [
            { x: coreX - side * 0.16, y: coreY - side * 0.02, r: sideBridgeW * 0.72 },
            { x: coreX + side * 0.15, y: coreY + side * 0.08, r: sideBridgeW * 0.68 },
            { x: eastPocketX, y: eastPocketY, r: sideBridgeW * 0.60 },
          ],
      phaseNodes: [
        { x: northX, y: northY },
        { x: westX, y: westY },
        { x: eastX, y: eastY },
        { x: westPocketX, y: westPocketY },
        { x: eastPocketX, y: eastPocketY },
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
      voidPressure: true,
    },
  };
}
