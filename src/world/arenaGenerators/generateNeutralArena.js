function makeRect(id, x, y, w, h) {
  return { id, type: 'rect', x, y, w, h };
}

function insetRectNav(id, x, y, w, h, inset = 18) {
  return { id: `${id}_nav`, type: 'rect', x: x + inset, y: y + inset, w: Math.max(28, w - inset * 2), h: Math.max(28, h - inset * 2) };
}

function addRect(list, navZones, id, x, y, w, h, inset = 18) {
  const rect = makeRect(id, x, y, w, h);
  list.push(rect);
  navZones.push(insetRectNav(id, x, y, w, h, inset));
  return rect;
}

function connectVertical(list, navZones, id, upperRect, lowerRect, width, overlap = 24, inset = 2) {
  const top = upperRect.y + upperRect.h - overlap;
  const bottom = lowerRect.y + overlap;
  return addRect(list, navZones, id, upperRect.x + upperRect.w * 0.5 - width * 0.5, top, width, Math.max(24, bottom - top), inset);
}

function connectHorizontal(list, navZones, id, leftRect, rightRect, height, overlap = 24, inset = 2, yBias = 0) {
  const left = leftRect.x + leftRect.w - overlap;
  const right = rightRect.x + overlap;
  const y = ((leftRect.y + leftRect.h * 0.5) + (rightRect.y + rightRect.h * 0.5)) * 0.5 - height * 0.5 + yBias;
  return addRect(list, navZones, id, left, y, Math.max(24, right - left), height, inset);
}

export function generateNeutralArena({ roomIndex = 0, centerX = 0, centerY = 0, side = 1200, isHub = false, profile = null, selectedLayoutId = '' }) {
  const useV2 = !isHub && String(selectedLayoutId || '').includes('_v2');
  const layoutId = isHub ? 'hub_v2_station' : (useV2 ? 'station_grid_v2_rooms' : 'station_grid_v1_rooms');
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

  const addPlatform = (id, x, y, w, h, inset = 10) => addRect(platforms, navZones, id, x, y, w, h, inset);

  let playerStart = { x: centerX, y: centerY };
  let bossSpawn = { x: centerX, y: centerY - side * 0.04 };
  let shopAnchor = { x: centerX, y: centerY + side * 0.08 };
  let bossMoveNodes = [];
  let bossArena = { arenaType: isHub ? 'hub_none' : 'neutral_core', center: { x: centerX, y: centerY }, safeLanes: [], pressureZones: [], phaseNodes: [] };

  if (isHub) {
    const hallW = side * 0.30;
    const hallH = side * 0.20;
    const roomW = side * 0.18;
    const roomH = side * 0.13;
    const dockW = side * 0.20;
    const dockH = side * 0.12;
    const corW = Math.max(54, side * 0.085);
    const corH = Math.max(50, side * 0.082);

    const hall = addPlatform('hub_hall', centerX - hallW * 0.5, centerY - hallH * 0.5, hallW, hallH);
    const northReactor = addPlatform('hub_north_reactor', centerX - roomW * 0.5, centerY - side * 0.27 - roomH * 0.5, roomW, roomH);
    const southLift = addPlatform('hub_south_lift', centerX - roomW * 0.5, centerY + side * 0.27 - roomH * 0.5, roomW, roomH);
    const westDock = addPlatform('hub_west_dock', centerX - side * 0.30 - dockW * 0.5, centerY - dockH * 0.5, dockW, dockH);
    const eastDock = addPlatform('hub_east_dock', centerX + side * 0.30 - dockW * 0.5, centerY - dockH * 0.5, dockW, dockH);
    const nwControl = addPlatform('hub_nw_control', centerX - side * 0.18 - roomW * 0.5, centerY - side * 0.14 - roomH * 0.5, roomW, roomH);
    const neControl = addPlatform('hub_ne_control', centerX + side * 0.18 - roomW * 0.5, centerY - side * 0.14 - roomH * 0.5, roomW, roomH);

    connectVertical(bridges, navZones, 'hub_north_corridor', northReactor, hall, corW, 14, 5);
    connectVertical(bridges, navZones, 'hub_south_corridor', hall, southLift, corW, 14, 5);
    connectHorizontal(bridges, navZones, 'hub_west_corridor', westDock, hall, corH, 14, 5);
    connectHorizontal(bridges, navZones, 'hub_east_corridor', hall, eastDock, corH, 14, 5);
    connectHorizontal(bridges, navZones, 'hub_nw_corridor', nwControl, hall, corH * 0.82, 12, 5, -side * 0.01);
    connectHorizontal(bridges, navZones, 'hub_ne_corridor', hall, neControl, corH * 0.82, 12, 5, -side * 0.01);

    decorAnchors.push(
      { x: centerX, y: centerY, kind: 'reactor', size: 48 },
      { x: centerX, y: centerY - side * 0.27, kind: 'reactor', size: 30 },
      { x: centerX - side * 0.30, y: centerY, kind: 'dock', size: 24 },
      { x: centerX + side * 0.30, y: centerY, kind: 'dock', size: 24 },
      { x: centerX - side * 0.18, y: centerY - side * 0.14, kind: 'relay', size: 24 },
      { x: centerX + side * 0.18, y: centerY - side * 0.14, kind: 'relay', size: 24 },
      { x: centerX, y: centerY + side * 0.27, kind: 'lift', size: 24 },
    );
    coverAnchors.push(
      { x: centerX - hallW * 0.30, y: centerY, size: 18 },
      { x: centerX + hallW * 0.30, y: centerY, size: 18 },
      { x: centerX, y: centerY - hallH * 0.30, size: 18 },
    );
    spawnAnchors.push(
      { x: centerX - side * 0.30, y: centerY, tag: 'west_dock' },
      { x: centerX + side * 0.30, y: centerY, tag: 'east_dock' },
      { x: centerX, y: centerY - side * 0.27, tag: 'north_reactor' },
      { x: centerX, y: centerY + side * 0.27, tag: 'south_lift' },
    );

    playerStart = { x: centerX, y: southLift.y + southLift.h * 0.30 };
    shopAnchor = { x: centerX, y: centerY + side * 0.22 };
    bossSpawn = { x: centerX, y: centerY };
    bossMoveNodes = [
      { x: centerX, y: centerY },
      { x: centerX - side * 0.13, y: centerY },
      { x: centerX + side * 0.13, y: centerY },
      { x: centerX, y: centerY - side * 0.11 },
      { x: centerX, y: centerY + side * 0.11 },
    ];
    bossArena = {
      arenaType: 'hub_none',
      center: { x: centerX, y: centerY },
      safeLanes: [{ x: centerX, y: centerY, r: side * 0.11 }],
      pressureZones: [],
      phaseNodes: [],
    };
  } else if (useV2) {
    const hallW = side * 0.24;
    const hallH = side * 0.17;
    const wingW = side * 0.15;
    const wingH = side * 0.11;
    const cargoW = side * 0.18;
    const cargoH = side * 0.12;
    const corW = Math.max(64, side * 0.070);
    const corH = Math.max(58, side * 0.068);

    const hall = addPlatform('core_hall', centerX - hallW * 0.5, centerY - hallH * 0.5, hallW, hallH);
    const northControl = addPlatform('north_control', centerX - wingW * 0.5, centerY - side * 0.26 - wingH * 0.5, wingW, wingH);
    const southCargo = addPlatform('south_cargo', centerX - cargoW * 0.5, centerY + side * 0.28 - cargoH * 0.5, cargoW, cargoH);
    const westRoom = addPlatform('west_room', centerX - side * 0.25 - wingW * 0.5, centerY - side * 0.04 - wingH * 0.5, wingW, wingH);
    const eastRoom = addPlatform('east_room', centerX + side * 0.25 - wingW * 0.5, centerY + side * 0.06 - wingH * 0.5, wingW, wingH);
    const southwestStorage = addPlatform('southwest_storage', centerX - side * 0.16 - wingW * 0.46, centerY + side * 0.18 - wingH * 0.45, wingW * 0.92, wingH * 0.84);
    const northeastNode = addPlatform('northeast_node', centerX + side * 0.16 - wingW * 0.46, centerY - side * 0.14 - wingH * 0.45, wingW * 0.92, wingH * 0.84);

    connectVertical(bridges, navZones, 'north_corridor', northControl, hall, corW, 18, 6);
    connectVertical(bridges, navZones, 'south_corridor', hall, southCargo, corW, 18, 6);
    connectHorizontal(bridges, navZones, 'west_corridor', westRoom, hall, corH, 18, 6);
    connectHorizontal(bridges, navZones, 'east_corridor', hall, eastRoom, corH, 18, 6);
    connectHorizontal(bridges, navZones, 'storage_link', southwestStorage, hall, corH * 0.84, 14, 6, side * 0.01);
    connectHorizontal(bridges, navZones, 'node_link', hall, northeastNode, corH * 0.84, 14, 6, -side * 0.01);

    gateAnchors.push(
      { side: 'W', x: centerX - side * 0.33, y: centerY - side * 0.04, tag: 'west_airlock' },
      { side: 'E', x: centerX + side * 0.33, y: centerY + side * 0.06, tag: 'east_airlock' },
      { side: 'S', x: centerX, y: centerY + side * 0.34, tag: 'south_breach' },
    );
    spawnAnchors.push(
      { x: centerX - side * 0.25, y: centerY - side * 0.04, tag: 'west_room' },
      { x: centerX + side * 0.25, y: centerY + side * 0.06, tag: 'east_room' },
      { x: centerX, y: centerY - side * 0.26, tag: 'north_control' },
      { x: centerX, y: centerY + side * 0.28, tag: 'south_cargo' },
    );
    decorAnchors.push(
      { x: centerX, y: centerY - side * 0.26, kind: 'reactor', size: 22 },
      { x: centerX, y: centerY + side * 0.28, kind: 'cargo', size: 24 },
      { x: centerX - side * 0.25, y: centerY - side * 0.04, kind: 'relay', size: 22 },
      { x: centerX + side * 0.25, y: centerY + side * 0.06, kind: 'relay', size: 22 },
      { x: centerX - side * 0.16, y: centerY + side * 0.18, kind: 'cargo', size: 18 },
      { x: centerX + side * 0.16, y: centerY - side * 0.14, kind: 'relay', size: 18 },
    );
    coverAnchors.push(
      { x: centerX - hallW * 0.32, y: centerY - hallH * 0.04, size: 18 },
      { x: centerX + hallW * 0.32, y: centerY - hallH * 0.04, size: 18 },
      { x: centerX, y: centerY - hallH * 0.30, size: 18 },
      { x: centerX - side * 0.25, y: centerY - side * 0.04, size: 18 },
      { x: centerX + side * 0.25, y: centerY + side * 0.06, size: 18 },
    );
    hazardAnchors.push(
      { x: centerX - side * 0.07, y: centerY + side * 0.12, tag: 'vent_left' },
      { x: centerX + side * 0.08, y: centerY - side * 0.08, tag: 'vent_right' },
    );
    hazardZones.push(
      { type: 'station_vent', shape: 'circle', x: centerX - side * 0.10, y: centerY + side * 0.16, r: side * 0.034, interval: 6.0, duration: 1.2, damageScale: 0.18 },
      { type: 'station_vent', shape: 'circle', x: centerX + side * 0.10, y: centerY - side * 0.12, r: side * 0.032, interval: 6.8, duration: 1.0, damageScale: 0.16 },
    );

    playerStart = { x: centerX, y: southCargo.y + southCargo.h * 0.28 };
    shopAnchor = { x: centerX, y: centerY + side * 0.24 };
    bossSpawn = { x: centerX, y: centerY - side * 0.05 };
    bossMoveNodes = [
      { x: centerX, y: centerY },
      { x: centerX - side * 0.12, y: centerY + side * 0.02 },
      { x: centerX + side * 0.12, y: centerY + side * 0.02 },
      { x: centerX, y: centerY - side * 0.18 },
      { x: centerX, y: centerY + side * 0.18 },
    ];
    bossArena = {
      arenaType: 'neutral_core',
      center: { x: centerX, y: centerY },
      safeLanes: [
        { x: centerX, y: centerY, r: side * 0.075 },
        { x: centerX - side * 0.12, y: centerY + side * 0.02, r: side * 0.05 },
        { x: centerX + side * 0.12, y: centerY + side * 0.02, r: side * 0.05 },
      ],
      pressureZones: hazardZones.map((z) => ({ x: z.x, y: z.y, r: z.r * 1.08 })),
      phaseNodes: [{ x: centerX, y: centerY - side * 0.18 }],
    };
  } else {
    const hallW = side * 0.26;
    const hallH = side * 0.18;
    const roomW = side * 0.15;
    const roomH = side * 0.11;
    const corW = Math.max(62, side * 0.068);
    const corH = Math.max(58, side * 0.068);

    const hall = addPlatform('core_hall', centerX - hallW * 0.5, centerY - hallH * 0.5, hallW, hallH);
    const northRoom = addPlatform('north_room', centerX - roomW * 0.5, centerY - side * 0.24 - roomH * 0.5, roomW, roomH);
    const southRoom = addPlatform('south_room', centerX - roomW * 0.5, centerY + side * 0.24 - roomH * 0.5, roomW, roomH);
    const westRoom = addPlatform('west_room', centerX - side * 0.24 - roomW * 0.5, centerY - roomH * 0.5, roomW, roomH);
    const eastRoom = addPlatform('east_room', centerX + side * 0.24 - roomW * 0.5, centerY - roomH * 0.5, roomW, roomH);
    const southwestCoverRoom = addPlatform('southwest_cover_room', centerX - side * 0.13 - roomW * 0.42, centerY + side * 0.13 - roomH * 0.42, roomW * 0.84, roomH * 0.84);

    connectVertical(bridges, navZones, 'north_corridor', northRoom, hall, corW, 18, 6);
    connectVertical(bridges, navZones, 'south_corridor', hall, southRoom, corW, 18, 6);
    connectHorizontal(bridges, navZones, 'west_corridor', westRoom, hall, corH, 18, 6);
    connectHorizontal(bridges, navZones, 'east_corridor', hall, eastRoom, corH, 18, 6);
    connectHorizontal(bridges, navZones, 'sw_corridor', southwestCoverRoom, hall, corH * 0.82, 14, 6, side * 0.01);

    gateAnchors.push(
      { side: 'W', x: centerX - side * 0.32, y: centerY, tag: 'west_airlock' },
      { side: 'E', x: centerX + side * 0.32, y: centerY, tag: 'east_airlock' },
      { side: 'S', x: centerX, y: centerY + side * 0.29, tag: 'south_breach' },
    );
    spawnAnchors.push(
      { x: centerX, y: centerY - side * 0.24, tag: 'north_room' },
      { x: centerX, y: centerY + side * 0.24, tag: 'south_room' },
      { x: centerX - side * 0.24, y: centerY, tag: 'west_room' },
      { x: centerX + side * 0.24, y: centerY, tag: 'east_room' },
    );
    decorAnchors.push(
      { x: centerX, y: centerY - side * 0.24, kind: 'relay', size: 22 },
      { x: centerX, y: centerY + side * 0.24, kind: 'cargo', size: 22 },
      { x: centerX - side * 0.24, y: centerY, kind: 'dock', size: 20 },
      { x: centerX + side * 0.24, y: centerY, kind: 'dock', size: 20 },
    );
    coverAnchors.push(
      { x: centerX - hallW * 0.32, y: centerY, size: 18 },
      { x: centerX + hallW * 0.32, y: centerY, size: 18 },
      { x: centerX - side * 0.13, y: centerY + side * 0.13, size: 18 },
    );
    hazardAnchors.push({ x: centerX + side * 0.10, y: centerY + side * 0.16, tag: 'center_vent' });
    hazardZones.push({ type: 'station_vent', shape: 'circle', x: centerX + side * 0.10, y: centerY + side * 0.16, r: side * 0.030, interval: 6.5, duration: 1.0, damageScale: 0.15 });

    playerStart = { x: centerX, y: southRoom.y + southRoom.h * 0.28 };
    shopAnchor = { x: centerX, y: centerY + side * 0.18 };
    bossSpawn = { x: centerX, y: centerY - side * 0.04 };
    bossMoveNodes = [
      { x: centerX, y: centerY },
      { x: centerX - side * 0.13, y: centerY },
      { x: centerX + side * 0.13, y: centerY },
      { x: centerX, y: centerY - side * 0.17 },
      { x: centerX, y: centerY + side * 0.17 },
    ];
    bossArena = {
      arenaType: 'neutral_core',
      center: { x: centerX, y: centerY },
      safeLanes: [
        { x: centerX, y: centerY, r: side * 0.078 },
        { x: centerX, y: centerY - side * 0.17, r: side * 0.05 },
      ],
      pressureZones: [{ x: centerX, y: centerY + side * 0.11, r: side * 0.042 }],
      phaseNodes: [],
    };
  }

  // Thin visual wall markers around the central hall so the layout reads as a station rather than flat tiles.
  walls.push(
    { type: 'segment', x1: centerX - side * 0.09, y1: centerY - side * 0.05, x2: centerX - side * 0.09, y2: centerY + side * 0.05 },
    { type: 'segment', x1: centerX + side * 0.09, y1: centerY - side * 0.05, x2: centerX + side * 0.09, y2: centerY + side * 0.05 },
  );

  return {
    layoutId,
    profileId: profile?.biomeId || (isHub ? 'hub' : 'neutral'),
    visualPreset: profile?.visualPreset || (isHub ? 'hub_core_station' : 'space_station_platform'),
    geometry: { platforms, bridges, walls, voidZones: [], navZones },
    anchors: {
      playerStart,
      spawnAnchors,
      gateAnchors,
      decorAnchors,
      coverAnchors,
      hazardAnchors,
      shopAnchor,
      bossSpawn,
      bossMoveNodes,
    },
    hazardZones,
    bossArena,
    rules: {
      supportsBridges: true,
      prefersRangedPressure: false,
      slipZones: false,
      fogZones: false,
      radiantBuffNodes: false,
      isHub,
      gateAnchorDriven: !isHub,
      floorLayoutV2: true,
    },
  };
}
