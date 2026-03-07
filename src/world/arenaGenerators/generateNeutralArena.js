function clamp(n, a, b) {
  return n < a ? a : (n > b ? b : n);
}

export function generateNeutralArena({ roomIndex = 0, centerX = 0, centerY = 0, side = 1200, isHub = false, profile = null, selectedLayoutId = '' }) {
  const useV2 = !isHub && String(selectedLayoutId || '').includes('_v2');
  const ringR = side * (isHub ? 0.20 : (useV2 ? 0.18 : 0.17));
  const layoutId = isHub ? 'hub_core_v2' : (useV2 ? 'station_grid_v2' : 'station_grid_v1');
  const platforms = [];
  const bridges = [];
  const navZones = [];
  const decorAnchors = [];
  const coverAnchors = [];
  const spawnAnchors = [];
  const gateAnchors = [];

  const addPlatform = (id, x, y, w, h) => {
    const p = { id, type: 'rect', x, y, w, h };
    platforms.push(p);
    navZones.push({ id: `${id}_nav`, type: 'rect', x: x + 18, y: y + 18, w: Math.max(32, w - 36), h: Math.max(32, h - 36) });
    return p;
  };
  const addBridge = (id, x, y, w, h) => {
    const b = { id, type: 'rect', x, y, w, h };
    bridges.push(b);
    navZones.push({ id: `${id}_nav`, type: 'rect', x: x + 10, y: y + 10, w: Math.max(20, w - 20), h: Math.max(20, h - 20) });
    return b;
  };

  if (isHub) {
    const coreW = side * 0.34;
    const coreH = side * 0.24;
    const podW = side * 0.17;
    const podH = side * 0.12;
    const wingW = side * 0.16;
    const wingH = side * 0.11;
    const bridgeW = side * 0.06;
    const bridgeH = side * 0.08;
    addPlatform('core', centerX - coreW * 0.5, centerY - coreH * 0.5, coreW, coreH);
    addPlatform('north_pod', centerX - podW * 0.5, centerY - side * 0.28 - podH * 0.5, podW, podH);
    addPlatform('south_pod', centerX - podW * 0.5, centerY + side * 0.28 - podH * 0.5, podW, podH);
    addPlatform('west_wing', centerX - side * 0.28 - wingW * 0.5, centerY - wingH * 0.5, wingW, wingH);
    addPlatform('east_wing', centerX + side * 0.28 - wingW * 0.5, centerY - wingH * 0.5, wingW, wingH);
    addPlatform('northwest_reactor', centerX - side * 0.18 - podW * 0.45, centerY - side * 0.18 - podH * 0.5, podW * 0.9, podH * 0.82);
    addPlatform('northeast_reactor', centerX + side * 0.18 - podW * 0.45, centerY - side * 0.18 - podH * 0.5, podW * 0.9, podH * 0.82);
    addBridge('north_link', centerX - bridgeW * 0.5, centerY - side * 0.18, bridgeW, side * 0.16);
    addBridge('south_link', centerX - bridgeW * 0.5, centerY + side * 0.02, bridgeW, side * 0.16);
    addBridge('west_link', centerX - side * 0.20, centerY - bridgeH * 0.5, side * 0.12, bridgeH);
    addBridge('east_link', centerX + side * 0.08, centerY - bridgeH * 0.5, side * 0.12, bridgeH);
    addBridge('northwest_link', centerX - side * 0.15, centerY - side * 0.13, side * 0.08, side * 0.05);
    addBridge('northeast_link', centerX + side * 0.07, centerY - side * 0.13, side * 0.08, side * 0.05);

    spawnAnchors.push(
      { x: centerX, y: centerY - side * 0.24, tag: 'north' },
      { x: centerX - side * 0.22, y: centerY, tag: 'west' },
      { x: centerX + side * 0.22, y: centerY, tag: 'east' },
      { x: centerX, y: centerY + side * 0.24, tag: 'south' },
    );
    decorAnchors.push(
      { x: centerX, y: centerY, kind: 'reactor', size: 46 },
      { x: centerX - side * 0.18, y: centerY - side * 0.18, kind: 'relay', size: 30 },
      { x: centerX + side * 0.18, y: centerY - side * 0.18, kind: 'relay', size: 30 },
      { x: centerX - side * 0.26, y: centerY, kind: 'dock', size: 24 },
      { x: centerX + side * 0.26, y: centerY, kind: 'dock', size: 24 },
      { x: centerX, y: centerY + side * 0.28, kind: 'lift', size: 24 },
    );
    coverAnchors.push(
      { x: centerX - side * 0.08, y: centerY, size: 28 },
      { x: centerX + side * 0.08, y: centerY, size: 28 },
      { x: centerX, y: centerY - side * 0.08, size: 26 },
      { x: centerX, y: centerY + side * 0.08, size: 26 },
    );
  } else if (useV2) {
    const coreW = side * 0.30;
    const coreH = side * 0.22;
    const podW = side * 0.18;
    const podH = side * 0.12;
    const bridgeW = side * 0.055;
    const bridgeH = side * 0.06;
    addPlatform('core', centerX - coreW * 0.5, centerY - coreH * 0.5, coreW, coreH);
    addPlatform('northwest', centerX - side * 0.24 - podW * 0.5, centerY - side * 0.18 - podH * 0.5, podW, podH);
    addPlatform('northeast', centerX + side * 0.24 - podW * 0.5, centerY - side * 0.18 - podH * 0.5, podW, podH);
    addPlatform('southwest', centerX - side * 0.24 - podW * 0.5, centerY + side * 0.18 - podH * 0.5, podW, podH);
    addPlatform('southeast', centerX + side * 0.24 - podW * 0.5, centerY + side * 0.18 - podH * 0.5, podW, podH);
    addPlatform('north_spine', centerX - podW * 0.36, centerY - side * 0.30 - podH * 0.5, podW * 0.72, podH * 0.88);
    addPlatform('south_spine', centerX - podW * 0.36, centerY + side * 0.30 - podH * 0.5, podW * 0.72, podH * 0.88);
    addBridge('nw_link', centerX - side * 0.17, centerY - side * 0.12, side * 0.11, bridgeH);
    addBridge('ne_link', centerX + side * 0.06, centerY - side * 0.12, side * 0.11, bridgeH);
    addBridge('sw_link', centerX - side * 0.17, centerY + side * 0.06, side * 0.11, bridgeH);
    addBridge('se_link', centerX + side * 0.06, centerY + side * 0.06, side * 0.11, bridgeH);
    addBridge('north_link', centerX - bridgeW * 0.5, centerY - side * 0.24, bridgeW, side * 0.11);
    addBridge('south_link', centerX - bridgeW * 0.5, centerY + side * 0.13, bridgeW, side * 0.11);
    spawnAnchors.push(
      { x: centerX - side * 0.24, y: centerY - side * 0.18, tag: 'north_west' },
      { x: centerX + side * 0.24, y: centerY - side * 0.18, tag: 'north_east' },
      { x: centerX - side * 0.24, y: centerY + side * 0.18, tag: 'south_west' },
      { x: centerX + side * 0.24, y: centerY + side * 0.18, tag: 'south_east' },
    );
    gateAnchors.push(
      { side: 'W', x: centerX - side * 0.36, y: centerY - side * 0.02, tag: 'west' },
      { side: 'E', x: centerX + side * 0.36, y: centerY + side * 0.02, tag: 'east' },
      { side: 'S', x: centerX, y: centerY + side * 0.42, tag: 'south' },
    );
    decorAnchors.push(
      { x: centerX - side * 0.24, y: centerY - side * 0.18, kind: 'relay', size: 22 },
      { x: centerX + side * 0.24, y: centerY - side * 0.18, kind: 'relay', size: 22 },
      { x: centerX - side * 0.24, y: centerY + side * 0.18, kind: 'relay', size: 22 },
      { x: centerX + side * 0.24, y: centerY + side * 0.18, kind: 'relay', size: 22 },
      { x: centerX, y: centerY - side * 0.30, kind: 'dock', size: 20 },
      { x: centerX, y: centerY + side * 0.30, kind: 'dock', size: 20 },
    );
    coverAnchors.push(
      { x: centerX - side * 0.11, y: centerY, size: 24 },
      { x: centerX + side * 0.11, y: centerY, size: 24 },
      { x: centerX, y: centerY - side * 0.10, size: 22 },
      { x: centerX, y: centerY + side * 0.10, size: 22 },
    );
  } else {
    const coreW = side * 0.36;
    const coreH = side * 0.24;
    const podW = side * 0.18;
    const podH = side * 0.13;
    const bridgeW = side * 0.06;
    const bridgeH = side * 0.07;
    addPlatform('core', centerX - coreW * 0.5, centerY - coreH * 0.5, coreW, coreH);
    addPlatform('north_pod', centerX - podW * 0.5, centerY - side * 0.28 - podH * 0.5, podW, podH);
    addPlatform('south_pod', centerX - podW * 0.5, centerY + side * 0.28 - podH * 0.5, podW, podH);
    addPlatform('west_pod', centerX - side * 0.28 - podW * 0.5, centerY - podH * 0.5, podW, podH);
    addPlatform('east_pod', centerX + side * 0.28 - podW * 0.5, centerY - podH * 0.5, podW, podH);
    addBridge('north_link', centerX - bridgeW * 0.5, centerY - side * 0.20, bridgeW, side * 0.16);
    addBridge('south_link', centerX - bridgeW * 0.5, centerY + side * 0.04, bridgeW, side * 0.16);
    addBridge('west_link', centerX - side * 0.20, centerY - bridgeH * 0.5, side * 0.12, bridgeH);
    addBridge('east_link', centerX + side * 0.08, centerY - bridgeH * 0.5, side * 0.12, bridgeH);
    spawnAnchors.push(
      { x: centerX, y: centerY - side * 0.28, tag: 'north' },
      { x: centerX - side * 0.28, y: centerY, tag: 'west' },
      { x: centerX + side * 0.28, y: centerY, tag: 'east' },
      { x: centerX, y: centerY + side * 0.28, tag: 'south' },
    );
    gateAnchors.push(
      { side: 'W', x: centerX - side * 0.38, y: centerY, tag: 'west' },
      { side: 'E', x: centerX + side * 0.38, y: centerY, tag: 'east' },
    );
    decorAnchors.push(
      { x: centerX, y: centerY - side * 0.28, kind: 'dock', size: 24 },
      { x: centerX - side * 0.28, y: centerY, kind: 'dock', size: 24 },
      { x: centerX + side * 0.28, y: centerY, kind: 'dock', size: 24 },
      { x: centerX, y: centerY + side * 0.28, kind: 'dock', size: 24 },
    );
    coverAnchors.push(
      { x: centerX - side * 0.12, y: centerY - side * 0.08, size: 24 },
      { x: centerX + side * 0.12, y: centerY - side * 0.08, size: 24 },
      { x: centerX - side * 0.12, y: centerY + side * 0.08, size: 24 },
      { x: centerX + side * 0.12, y: centerY + side * 0.08, size: 24 },
    );
  }

  return {
    layoutId,
    profileId: profile?.biomeId || (isHub ? 'hub' : 'neutral'),
    visualPreset: profile?.visualPreset || (isHub ? 'hub_core_station' : 'space_station_platform'),
    geometry: { platforms, bridges, walls: [], voidZones: [], navZones },
    anchors: {
      playerStart: { x: centerX, y: centerY },
      spawnAnchors,
      gateAnchors,
      decorAnchors,
      coverAnchors,
      hazardAnchors: [],
      bossSpawn: { x: centerX, y: centerY - side * (isHub ? 0.02 : 0.06) },
      bossMoveNodes: [
        { x: centerX, y: centerY },
        { x: centerX - ringR, y: centerY },
        { x: centerX + ringR, y: centerY },
        { x: centerX, y: centerY - ringR },
        { x: centerX, y: centerY + ringR },
      ],
    },
    hazardZones: [],
    bossArena: {
      arenaType: isHub ? 'hub_none' : 'neutral_core',
      center: { x: centerX, y: centerY },
      safeLanes: [{ x: centerX, y: centerY, r: ringR * 0.9 }],
      pressureZones: !isHub && useV2 ? [
        { x: centerX - side * 0.17, y: centerY, r: side * 0.05 },
        { x: centerX + side * 0.17, y: centerY, r: side * 0.05 },
      ] : [],
      phaseNodes: [],
    },
    rules: {
      supportsBridges: true,
      prefersRangedPressure: false,
      slipZones: false,
      fogZones: false,
      radiantBuffNodes: false,
      isHub,
      gateAnchorDriven: !isHub,
    },
  };
}
