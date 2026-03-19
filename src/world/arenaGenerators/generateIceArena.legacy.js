function clamp(n, a, b) {
  return n < a ? a : (n > b ? b : n);
}

function rect(id, cx, cy, w, h) {
  return { id, type: 'rect', x: cx - w * 0.5, y: cy - h * 0.5, w, h };
}

export function generateIceArena({ roomIndex = 4, centerX = 0, centerY = 0, side = 1200, profile = null, selectedLayoutId = '' }) {
  const useV2 = String(selectedLayoutId || '').includes('_v2');

  // Ice should feel: wide space, long sight lines, arc plates, slippery pressure,
  // but still give melee a few shelter / engage points.
  const mainW = side * (useV2 ? 0.72 : 0.76);
  const mainH = side * (useV2 ? 0.30 : 0.34);
  const northW = side * (useV2 ? 0.40 : 0.44);
  const northH = side * 0.16;
  const southW = side * (useV2 ? 0.46 : 0.50);
  const southH = side * 0.16;
  const flankW = side * 0.18;
  const flankH = side * (useV2 ? 0.30 : 0.34);
  const bridgeW = clamp(side * 0.15, 116, 172);
  const bridgeH = clamp(side * 0.13, 96, 138);
  const sideBridgeW = clamp(side * 0.16, 118, 176);
  const flankDX = side * (useV2 ? 0.33 : 0.34);
  const northY = centerY - side * (useV2 ? 0.20 : 0.24);
  const southY = centerY + side * (useV2 ? 0.23 : 0.26);
  const westY = centerY + side * (useV2 ? -0.08 : -0.03);
  const eastY = centerY + side * (useV2 ? 0.08 : 0.03);
  const northBridgeX = centerX + side * (useV2 ? -0.06 : 0.0);
  const southBridgeX = centerX + side * (useV2 ? 0.05 : 0.0);
  const bossRadius = side * 0.20;
  const centerLineY = centerY + side * 0.02;

  const platforms = [
    rect('main', centerX, centerLineY, mainW, mainH),
    rect('north_arc', centerX + side * (useV2 ? -0.12 : 0.0), northY, northW, northH),
    rect('south_arc', centerX + side * (useV2 ? 0.10 : 0.0), southY, southW, southH),
    rect('west_lane', centerX - flankDX, westY, flankW, flankH),
    rect('east_lane', centerX + flankDX, eastY, flankW, flankH),
  ];

  const bridges = [
    rect('bridge_north', northBridgeX, centerY - side * 0.10, bridgeW, side * 0.14),
    rect('bridge_south', southBridgeX, centerY + side * 0.16, bridgeW, side * 0.15),
    rect('bridge_west', centerX - side * 0.22, westY, sideBridgeW, bridgeH),
    rect('bridge_east', centerX + side * 0.22, eastY, sideBridgeW, bridgeH),
  ];

  const decorAnchors = useV2
    ? [
        { x: centerX - side * 0.16, y: northY, kind: 'ice_spire', size: 28 },
        { x: centerX + side * 0.16, y: southY, kind: 'ice_spire', size: 26 },
        { x: centerX - flankDX, y: westY - flankH * 0.18, kind: 'crystal', size: 22 },
        { x: centerX + flankDX, y: eastY + flankH * 0.18, kind: 'crystal', size: 22 },
      ]
    : [
        { x: centerX, y: northY, kind: 'ice_spire', size: 28 },
        { x: centerX, y: southY, kind: 'ice_spire', size: 26 },
        { x: centerX - flankDX, y: westY, kind: 'crystal', size: 22 },
        { x: centerX + flankDX, y: eastY, kind: 'crystal', size: 22 },
      ];

  const coverAnchors = useV2
    ? [
        { x: centerX - mainW * 0.22, y: centerLineY - mainH * 0.02, size: clamp(side * 0.03, 18, 32) },
        { x: centerX + mainW * 0.22, y: centerLineY + mainH * 0.02, size: clamp(side * 0.03, 18, 32) },
        { x: centerX - side * 0.06, y: centerY - side * 0.08, size: clamp(side * 0.026, 16, 28) },
        { x: centerX + side * 0.10, y: centerY + side * 0.10, size: clamp(side * 0.026, 16, 28) },
      ]
    : [
        { x: centerX - mainW * 0.24, y: centerLineY, size: clamp(side * 0.03, 18, 32) },
        { x: centerX + mainW * 0.24, y: centerLineY, size: clamp(side * 0.03, 18, 32) },
        { x: centerX - side * 0.08, y: centerY - side * 0.08, size: clamp(side * 0.026, 16, 28) },
        { x: centerX + side * 0.08, y: centerY + side * 0.10, size: clamp(side * 0.026, 16, 28) },
      ];

  const gateAnchors = useV2
    ? [
        { side: 'W', x: centerX - side * 0.5, y: centerY - side * 0.08, tag: 'west_lane' },
        { side: 'E', x: centerX + side * 0.5, y: centerY + side * 0.08, tag: 'east_lane' },
        { side: 'S', x: centerX + side * 0.10, y: centerY + side * 0.5, tag: 'south_arc' },
      ]
    : [
        { side: 'W', x: centerX - side * 0.5, y: centerY, tag: 'west_lane' },
        { side: 'E', x: centerX + side * 0.5, y: centerY, tag: 'east_lane' },
        { side: 'S', x: centerX, y: centerY + side * 0.5, tag: 'south_arc' },
      ];

  const spawnAnchors = useV2
    ? [
        { x: centerX - side * 0.12, y: northY, tag: 'north_arc' },
        { x: centerX + side * 0.12, y: southY, tag: 'south_arc' },
        { x: centerX - flankDX, y: westY - flankH * 0.18, tag: 'west_upper_lane' },
        { x: centerX + flankDX, y: eastY + flankH * 0.18, tag: 'east_lower_lane' },
        { x: centerX + side * 0.02, y: centerY - side * 0.02, tag: 'open_mid' },
      ]
    : [
        { x: centerX, y: northY, tag: 'north_arc' },
        { x: centerX, y: southY, tag: 'south_arc' },
        { x: centerX - flankDX, y: westY, tag: 'west_lane' },
        { x: centerX + flankDX, y: eastY, tag: 'east_lane' },
        { x: centerX, y: centerY - side * 0.04, tag: 'open_mid' },
      ];

  const hazardAnchors = useV2
    ? [
        { x: centerX - side * 0.18, y: centerY - side * 0.02, kind: 'frost_lane', r: bridgeW * 0.92 },
        { x: centerX + side * 0.14, y: centerY + side * 0.08, kind: 'frost_lane', r: bridgeW * 0.92 },
        { x: centerX + side * 0.10, y: southY, kind: 'slip_zone', r: bridgeW * 0.78 },
      ]
    : [
        { x: centerX - side * 0.18, y: centerLineY, kind: 'frost_lane', r: bridgeW * 0.92 },
        { x: centerX + side * 0.18, y: centerLineY, kind: 'frost_lane', r: bridgeW * 0.92 },
        { x: centerX, y: southY, kind: 'slip_zone', r: bridgeW * 0.78 },
      ];

  const navZones = [
    rect('main_nav', centerX, centerLineY, mainW - 28, mainH - 22),
    rect('north_nav', centerX + side * (useV2 ? -0.12 : 0.0), northY, northW - 20, northH - 16),
    rect('south_nav', centerX + side * (useV2 ? 0.10 : 0.0), southY, southW - 20, southH - 16),
    rect('west_nav', centerX - flankDX, westY, flankW - 16, flankH - 16),
    rect('east_nav', centerX + flankDX, eastY, flankW - 16, flankH - 16),
    rect('bridge_n_nav', northBridgeX, centerY - side * 0.10, bridgeW - 10, side * 0.14 - 10),
    rect('bridge_s_nav', southBridgeX, centerY + side * 0.16, bridgeW - 10, side * 0.15 - 10),
    rect('bridge_w_nav', centerX - side * 0.22, westY, sideBridgeW - 10, bridgeH - 10),
    rect('bridge_e_nav', centerX + side * 0.22, eastY, sideBridgeW - 10, bridgeH - 10),
  ];

  const playerStart = useV2
    ? { x: centerX - side * 0.02, y: centerY + side * 0.10 }
    : { x: centerX, y: centerY + side * 0.10 };

  const bossMoveNodes = useV2
    ? [
        { x: centerX, y: centerLineY },
        { x: centerX - bossRadius, y: centerY - side * 0.04 },
        { x: centerX + bossRadius, y: centerY + side * 0.04 },
        { x: centerX - side * 0.12, y: northY },
        { x: centerX + side * 0.10, y: southY },
        { x: centerX - flankDX, y: westY },
        { x: centerX + flankDX, y: eastY },
      ]
    : [
        { x: centerX, y: centerLineY },
        { x: centerX - bossRadius, y: centerLineY },
        { x: centerX + bossRadius, y: centerLineY },
        { x: centerX, y: centerY - bossRadius * 0.92 },
        { x: centerX, y: centerY + bossRadius * 0.92 },
        { x: centerX - flankDX, y: westY },
        { x: centerX + flankDX, y: eastY },
      ];

  const hazardZones = useV2
    ? [
        { type: 'frost_lane', shape: 'circle', x: centerX - side * 0.18, y: centerY - side * 0.02, r: bridgeW * 0.68, interval: 7.0, duration: 1.7, damageScale: 0.13 },
        { type: 'frost_lane', shape: 'circle', x: centerX + side * 0.14, y: centerY + side * 0.08, r: bridgeW * 0.68, interval: 7.0, duration: 1.7, damageScale: 0.13 },
        { type: 'slip_zone', shape: 'circle', x: centerX + side * 0.10, y: southY, r: bridgeW * 0.56, interval: 8.2, duration: 1.4, damageScale: 0.10 },
      ]
    : [
        { type: 'frost_lane', shape: 'circle', x: centerX - side * 0.18, y: centerLineY, r: bridgeW * 0.68, interval: 7.0, duration: 1.7, damageScale: 0.13 },
        { type: 'frost_lane', shape: 'circle', x: centerX + side * 0.18, y: centerLineY, r: bridgeW * 0.68, interval: 7.0, duration: 1.7, damageScale: 0.13 },
        { type: 'slip_zone', shape: 'circle', x: centerX, y: southY, r: bridgeW * 0.56, interval: 8.2, duration: 1.4, damageScale: 0.10 },
      ];

  return {
    layoutId: `${useV2 ? 'ice_field_v2' : 'ice_field_v1'}_r${roomIndex | 0}`,
    profileId: profile?.biomeId || 'ice',
    visualPreset: profile?.visualPreset || 'ice_open_arc',
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
      bossSpawn: { x: centerX, y: centerY - side * 0.04 },
      bossMoveNodes,
    },
    hazardZones,
    bossArena: {
      arenaType: 'ice_cathedral',
      center: { x: centerX, y: centerLineY },
      safeLanes: useV2
        ? [
            { x: centerX, y: centerLineY, r: bridgeW * 1.16 },
            { x: centerX - side * 0.20, y: centerY - side * 0.06, r: bridgeW * 0.84 },
            { x: centerX + side * 0.20, y: centerY + side * 0.08, r: bridgeW * 0.84 },
          ]
        : [
            { x: centerX, y: centerLineY, r: bridgeW * 1.24 },
            { x: centerX - side * 0.22, y: centerLineY, r: bridgeW * 0.86 },
            { x: centerX + side * 0.22, y: centerLineY, r: bridgeW * 0.86 },
          ],
      pressureZones: useV2
        ? [
            { x: centerX - side * 0.18, y: centerY - side * 0.02, r: bridgeW * 0.78 },
            { x: centerX + side * 0.14, y: centerY + side * 0.08, r: bridgeW * 0.78 },
          ]
        : [
            { x: centerX - side * 0.18, y: centerLineY, r: bridgeW * 0.78 },
            { x: centerX + side * 0.18, y: centerLineY, r: bridgeW * 0.78 },
          ],
      phaseNodes: useV2
        ? [
            { x: centerX - side * 0.12, y: northY },
            { x: centerX - flankDX, y: westY },
            { x: centerX + flankDX, y: eastY },
            { x: centerX + side * 0.10, y: southY },
          ]
        : [
            { x: centerX, y: northY },
            { x: centerX - flankDX, y: westY },
            { x: centerX + flankDX, y: eastY },
            { x: centerX, y: southY },
          ],
    },
    rules: {
      supportsBridges: true,
      prefersRangedPressure: true,
      slipZones: true,
      fogZones: false,
      radiantBuffNodes: false,
      isHub: false,
      gateAnchorDriven: true,
      longSightLines: true,
    },
  };
}
