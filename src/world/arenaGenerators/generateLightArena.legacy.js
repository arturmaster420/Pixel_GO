function clamp(n, a, b) {
  return n < a ? a : (n > b ? b : n);
}

function rect(id, cx, cy, w, h) {
  return { id, type: 'rect', x: cx - w * 0.5, y: cy - h * 0.5, w, h };
}

function linkSpan(distance, aSize, bSize, extra = 120, minSize = 92) {
  return Math.max(minSize, distance - (aSize + bSize) * 0.5 + extra);
}

export function generateLightArena({ roomIndex = 4, centerX = 0, centerY = 0, side = 1200, profile = null, selectedLayoutId = '' }) {
  const useV2 = String(selectedLayoutId || '').includes('_v2');

  // Light should feel like a radiant temple: clean symmetry, halo/crown, readable rays and
  // a safe south nave that opens into a brighter boss platform above.
  const coreW = side * (useV2 ? 0.35 : 0.37);
  const coreH = side * (useV2 ? 0.31 : 0.34);
  const northW = side * (useV2 ? 0.22 : 0.20);
  const northH = side * (useV2 ? 0.14 : 0.13);
  const southW = side * (useV2 ? 0.24 : 0.22);
  const southH = side * (useV2 ? 0.16 : 0.15);
  const westW = side * (useV2 ? 0.18 : 0.17);
  const westH = side * (useV2 ? 0.23 : 0.22);
  const eastW = side * (useV2 ? 0.18 : 0.17);
  const eastH = side * (useV2 ? 0.23 : 0.22);
  const haloWingW = side * (useV2 ? 0.18 : 0.16);
  const haloWingH = side * (useV2 ? 0.12 : 0.11);
  const haloCapW = side * (useV2 ? 0.20 : 0.18);
  const haloCapH = side * (useV2 ? 0.11 : 0.10);

  const spokeW = clamp(side * (useV2 ? 0.10 : 0.12), 92, useV2 ? 124 : 144);
  const lateralBridgeH = clamp(side * (useV2 ? 0.10 : 0.13), 84, useV2 ? 116 : 146);
  const haloBridgeW = clamp(side * (useV2 ? 0.10 : 0.12), 90, useV2 ? 120 : 144);
  const haloBridgeH = clamp(side * (useV2 ? 0.08 : 0.11), 70, useV2 ? 96 : 122);
  const templeLinkBonus = clamp(side * 0.026, 36, 60);

  const coreX = centerX;
  const coreY = centerY + side * (useV2 ? 0.03 : 0.02);
  const southX = centerX;
  const southY = centerY + side * (useV2 ? 0.30 : 0.27);
  const westX = centerX - side * (useV2 ? 0.29 : 0.27);
  const westY = centerY + side * (useV2 ? 0.01 : 0.00);
  const eastX = centerX + side * (useV2 ? 0.29 : 0.27);
  const eastY = centerY + side * (useV2 ? 0.01 : 0.00);
  const haloCapX = centerX;
  const haloCapY = centerY - side * (useV2 ? 0.19 : 0.17);
  const haloLeftX = centerX - side * (useV2 ? 0.17 : 0.15);
  const haloRightX = centerX + side * (useV2 ? 0.17 : 0.15);
  const haloWingY = centerY - side * (useV2 ? 0.18 : 0.16);
  const northX = centerX;
  const northY = centerY - side * (useV2 ? 0.34 : 0.31);

  const northLinkH = linkSpan(Math.abs(coreY - haloCapY), coreH, haloCapH, 126, 120) + templeLinkBonus;
  const northApexLinkH = linkSpan(Math.abs(haloCapY - northY), haloCapH, northH, 108, 88);
  const southLinkH = linkSpan(Math.abs(coreY - southY), coreH, southH, 132, 124) + templeLinkBonus + (useV2 ? 0 : clamp(side * 0.04, 44, 76));
  const westLinkW = linkSpan(Math.abs(coreX - westX), coreW, westW, 122, 114);
  const eastLinkW = linkSpan(Math.abs(coreX - eastX), coreW, eastW, 122, 114);
  const haloLeftLinkW = linkSpan(Math.abs(haloCapX - haloLeftX), haloCapW, haloWingW, 88, 84);
  const haloRightLinkW = linkSpan(Math.abs(haloCapX - haloRightX), haloCapW, haloWingW, 88, 84);

  const platforms = [
    rect('core_dais', coreX, coreY, coreW, coreH),
    rect('south_nave', southX, southY, southW, southH),
    rect('west_ray', westX, westY, westW, westH),
    rect('east_ray', eastX, eastY, eastW, eastH),
    rect('halo_cap', haloCapX, haloCapY, haloCapW, haloCapH),
    rect('halo_left', haloLeftX, haloWingY, haloWingW, haloWingH),
    rect('halo_right', haloRightX, haloWingY, haloWingW, haloWingH),
    rect('north_apse', northX, northY, northW, northH),
  ];

  const bridges = [
    rect('bridge_south', (coreX + southX) * 0.5, (coreY + southY) * 0.5, spokeW, southLinkH),
    rect('bridge_west', (coreX + westX) * 0.5, (coreY + westY) * 0.5, westLinkW, lateralBridgeH),
    rect('bridge_east', (coreX + eastX) * 0.5, (coreY + eastY) * 0.5, eastLinkW, lateralBridgeH),
    rect('bridge_north', (coreX + haloCapX) * 0.5, (coreY + haloCapY) * 0.5, spokeW, northLinkH),
    rect('bridge_halo_left', (haloCapX + haloLeftX) * 0.5, (haloCapY + haloWingY) * 0.5, haloLeftLinkW, haloBridgeH),
    rect('bridge_halo_right', (haloCapX + haloRightX) * 0.5, (haloCapY + haloWingY) * 0.5, haloRightLinkW, haloBridgeH),
    rect('bridge_apse', (haloCapX + northX) * 0.5, (haloCapY + northY) * 0.5, haloBridgeW, northApexLinkH),
  ];

  const decorAnchors = useV2
    ? [
        { x: northX, y: northY, kind: 'sun_lens', size: 24 },
        { x: haloLeftX, y: haloWingY, kind: 'radiant_pylon', size: 22 },
        { x: haloRightX, y: haloWingY, kind: 'radiant_pylon', size: 22 },
        { x: westX, y: westY, kind: 'light_prism', size: 22 },
        { x: eastX, y: eastY, kind: 'light_prism', size: 22 },
        { x: coreX, y: coreY, kind: 'sun_dais', size: 18 },
      ]
    : [
        { x: northX, y: northY, kind: 'sun_lens', size: 22 },
        { x: haloLeftX, y: haloWingY, kind: 'radiant_pylon', size: 20 },
        { x: haloRightX, y: haloWingY, kind: 'radiant_pylon', size: 20 },
        { x: westX, y: westY, kind: 'light_prism', size: 20 },
        { x: eastX, y: eastY, kind: 'light_prism', size: 20 },
        { x: coreX, y: coreY - coreH * 0.10, kind: 'altar', size: 16 },
      ];

  const coverAnchors = useV2
    ? [
        { x: coreX - coreW * 0.18, y: coreY + coreH * 0.02, size: clamp(side * 0.024, 16, 28) },
        { x: coreX + coreW * 0.18, y: coreY + coreH * 0.02, size: clamp(side * 0.024, 16, 28) },
        { x: southX, y: southY - southH * 0.06, size: clamp(side * 0.022, 16, 26) },
      ]
    : [
        { x: coreX - coreW * 0.16, y: coreY, size: clamp(side * 0.024, 16, 28) },
        { x: coreX + coreW * 0.16, y: coreY, size: clamp(side * 0.024, 16, 28) },
      ];

  const gateAnchors = [
    { side: 'W', x: centerX - side * 0.5, y: westY, tag: 'west_ray' },
    { side: 'E', x: centerX + side * 0.5, y: eastY, tag: 'east_ray' },
    { side: 'S', x: southX, y: centerY + side * 0.5, tag: 'south_nave' },
  ];

  const spawnAnchors = useV2
    ? [
        { x: northX, y: northY, tag: 'north_apse' },
        { x: haloLeftX, y: haloWingY, tag: 'halo_left' },
        { x: haloRightX, y: haloWingY, tag: 'halo_right' },
        { x: westX, y: westY, tag: 'west_ray' },
        { x: eastX, y: eastY, tag: 'east_ray' },
        { x: haloCapX, y: haloCapY, tag: 'halo_cap' },
      ]
    : [
        { x: northX, y: northY, tag: 'north_apse' },
        { x: westX, y: westY, tag: 'west_ray' },
        { x: eastX, y: eastY, tag: 'east_ray' },
        { x: haloLeftX, y: haloWingY, tag: 'halo_left' },
        { x: haloRightX, y: haloWingY, tag: 'halo_right' },
      ];

  const hazardAnchors = [
    { x: westX, y: westY, kind: 'radiant_node', r: lateralBridgeH * 0.92 },
    { x: eastX, y: eastY, kind: 'radiant_node', r: lateralBridgeH * 0.92 },
    { x: northX, y: northY, kind: 'prism_lane', r: haloBridgeW * 0.88 },
    { x: haloCapX, y: haloCapY, kind: 'blessing_field', r: haloCapW * 0.42 },
  ];

  const navZones = [
    rect('core_nav', coreX, coreY, coreW - 10, coreH - 10),
    rect('south_nav', southX, southY, southW - 10, southH - 10),
    rect('west_nav', westX, westY, westW - 10, westH - 10),
    rect('east_nav', eastX, eastY, eastW - 10, eastH - 10),
    rect('halo_cap_nav', haloCapX, haloCapY, haloCapW - 8, haloCapH - 8),
    rect('halo_left_nav', haloLeftX, haloWingY, haloWingW - 8, haloWingH - 8),
    rect('halo_right_nav', haloRightX, haloWingY, haloWingW - 8, haloWingH - 8),
    rect('north_nav', northX, northY, northW - 8, northH - 8),
    rect('bridge_s_nav', (coreX + southX) * 0.5, (coreY + southY) * 0.5, spokeW - 4, southLinkH - 4),
    rect('bridge_w_nav', (coreX + westX) * 0.5, (coreY + westY) * 0.5, westLinkW - 4, lateralBridgeH - 4),
    rect('bridge_e_nav', (coreX + eastX) * 0.5, (coreY + eastY) * 0.5, eastLinkW - 4, lateralBridgeH - 4),
    rect('bridge_n_nav', (coreX + haloCapX) * 0.5, (coreY + haloCapY) * 0.5, spokeW - 4, northLinkH - 4),
    rect('bridge_hl_nav', (haloCapX + haloLeftX) * 0.5, (haloCapY + haloWingY) * 0.5, haloLeftLinkW - 4, haloBridgeH - 4),
    rect('bridge_hr_nav', (haloCapX + haloRightX) * 0.5, (haloCapY + haloWingY) * 0.5, haloRightLinkW - 4, haloBridgeH - 4),
    rect('bridge_apse_nav', (haloCapX + northX) * 0.5, (haloCapY + northY) * 0.5, haloBridgeW - 4, northApexLinkH - 4),
  ];

  const playerStart = { x: southX, y: southY + southH * 0.04 };
  const bossRadius = side * 0.18;

  return {
    layoutId: `${useV2 ? 'light_temple_v2' : 'light_temple_v1'}_r${roomIndex | 0}`,
    profileId: profile?.biomeId || 'light',
    visualPreset: profile?.visualPreset || 'light_radiant_temple',
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
      bossSpawn: { x: coreX, y: coreY - side * 0.04 },
      bossMoveNodes: [
        { x: coreX, y: coreY },
        { x: coreX - bossRadius, y: coreY },
        { x: coreX + bossRadius, y: coreY },
        { x: northX, y: northY },
        { x: westX, y: westY },
        { x: eastX, y: eastY },
        { x: haloCapX, y: haloCapY },
      ],
    },
    hazardZones: [
      { type: 'radiant_node', shape: 'circle', x: westX, y: westY, r: lateralBridgeH * 0.64, interval: 7.2, duration: 1.45, damageScale: 0.06 },
      { type: 'radiant_node', shape: 'circle', x: eastX, y: eastY, r: lateralBridgeH * 0.64, interval: 7.2, duration: 1.45, damageScale: 0.06 },
      { type: 'prism_lane', shape: 'circle', x: northX, y: northY, r: haloBridgeW * 0.62, interval: 8.4, duration: 1.20, damageScale: 0.08 },
      { type: 'blessing_field', shape: 'circle', x: haloCapX, y: haloCapY, r: haloCapW * 0.30, interval: 9.0, duration: 1.30, damageScale: 0.05 },
    ],
    bossArena: {
      arenaType: 'light_crown',
      center: { x: coreX, y: coreY },
      safeLanes: [
        { x: coreX, y: coreY, r: spokeW * 1.34 },
        { x: southX, y: southY, r: spokeW * 1.02 },
      ],
      pressureZones: [
        { x: westX, y: westY, r: lateralBridgeH * 0.84 },
        { x: eastX, y: eastY, r: lateralBridgeH * 0.84 },
        { x: northX, y: northY, r: haloBridgeW * 0.82 },
      ],
      phaseNodes: [
        { x: northX, y: northY },
        { x: haloLeftX, y: haloWingY },
        { x: haloRightX, y: haloWingY },
        { x: westX, y: westY },
        { x: eastX, y: eastY },
        { x: southX, y: southY },
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
      templeSymmetry: true,
    },
  };
}
