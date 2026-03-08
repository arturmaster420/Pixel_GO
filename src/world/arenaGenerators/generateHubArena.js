function makeRect(id, x, y, w, h) {
  return { id, type: 'rect', x, y, w, h };
}

function insetRectNav(id, x, y, w, h, inset = 18) {
  return {
    id: `${id}_nav`,
    type: 'rect',
    x: x + inset,
    y: y + inset,
    w: Math.max(28, w - inset * 2),
    h: Math.max(28, h - inset * 2),
  };
}

function addRect(list, navZones, id, x, y, w, h, inset = 18) {
  const rect = makeRect(id, x, y, w, h);
  list.push(rect);
  navZones.push(insetRectNav(id, x, y, w, h, inset));
  return rect;
}

function connectVertical(list, navZones, id, upperRect, lowerRect, width, overlap = 22, inset = 2) {
  const top = upperRect.y + upperRect.h - overlap;
  const bottom = lowerRect.y + overlap;
  return addRect(list, navZones, id, upperRect.x + upperRect.w * 0.5 - width * 0.5, top, width, Math.max(24, bottom - top), inset);
}

function connectHorizontal(list, navZones, id, leftRect, rightRect, height, overlap = 22, inset = 2) {
  const left = leftRect.x + leftRect.w - overlap;
  const right = rightRect.x + overlap;
  return addRect(list, navZones, id, left, leftRect.y + leftRect.h * 0.5 - height * 0.5, Math.max(24, right - left), height, inset);
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

  const addPlatform = (id, x, y, w, h) => addRect(platforms, navZones, id, x, y, w, h, 8);
  const addBridge = (id, x, y, w, h, inset = 1) => addRect(bridges, navZones, id, x, y, w, h, inset);

  // Hub must feel different from combat floors:
  // - South = arrival / player spawn pad
  // - Center = main hub / circulation
  // - West = shop wing
  // - East = tier / progression wing
  // - North = portal concourse leading to the run floors
  const plazaW = side * 0.36;
  const plazaH = side * 0.26;
  const wingW = side * 0.22;
  const wingH = side * 0.18;
  const northW = side * 0.28;
  const northH = side * 0.17;
  const southW = side * 0.28;
  const southH = side * 0.18;
  const corW = Math.max(72, side * 0.12);
  const corH = Math.max(60, side * 0.10);

  const core = addPlatform('hub_core_plaza', centerX - plazaW * 0.5, centerY - plazaH * 0.5, plazaW, plazaH);
  const shopWing = addPlatform('hub_shop_wing', centerX - side * 0.28 - wingW * 0.5, centerY - wingH * 0.5, wingW, wingH);
  const tierWing = addPlatform('hub_tier_wing', centerX + side * 0.28 - wingW * 0.5, centerY - wingH * 0.5, wingW, wingH);
  const portalBay = addPlatform('hub_portal_bay', centerX - northW * 0.5, centerY - side * 0.30 - northH * 0.5, northW, northH);
  const arrivalBay = addPlatform('hub_arrival_bay', centerX - southW * 0.5, centerY + side * 0.30 - southH * 0.5, southW, southH);

  connectVertical(bridges, navZones, 'hub_corridor_north', portalBay, core, corW, 32, 1);
  connectVertical(bridges, navZones, 'hub_corridor_south', core, arrivalBay, corW, 32, 1);
  connectHorizontal(bridges, navZones, 'hub_corridor_west', shopWing, core, corH, 30, 1);
  connectHorizontal(bridges, navZones, 'hub_corridor_east', core, tierWing, corH, 30, 1);
  addBridge('hub_portal_apron', portalBay.x + northW * 0.12, portalBay.y - side * 0.08, northW * 0.76, side * 0.07, 1);

  const shopPos = { x: shopWing.x + shopWing.w * 0.5, y: shopWing.y + shopWing.h * 0.5 };
  const tierPos = { x: tierWing.x + tierWing.w * 0.5, y: tierWing.y + tierWing.h * 0.5 };
  const portalPos = { x: portalBay.x + portalBay.w * 0.5, y: portalBay.y + portalBay.h * 0.5 };
  const spawnPos = { x: arrivalBay.x + arrivalBay.w * 0.5, y: arrivalBay.y + arrivalBay.h * 0.5 };
  const playerStart = { x: spawnPos.x, y: arrivalBay.y + arrivalBay.h * 0.58 };

  decorAnchors.push(
    { x: centerX, y: centerY, kind: 'hub_core', size: 42 },
    { x: shopPos.x, y: shopPos.y, kind: 'shop_terminal', size: 26 },
    { x: tierPos.x, y: tierPos.y, kind: 'tier_terminal', size: 26 },
    { x: portalPos.x, y: portalPos.y, kind: 'portal_gate', size: 34 },
    { x: spawnPos.x, y: spawnPos.y, kind: 'spawn_pad', size: 24 },
  );

  coverAnchors.push(
    { x: centerX - plazaW * 0.24, y: centerY - plazaH * 0.12, size: 14 },
    { x: centerX + plazaW * 0.24, y: centerY - plazaH * 0.12, size: 14 },
  );

  spawnAnchors.push(
    { x: shopPos.x, y: shopPos.y, tag: 'west_wing' },
    { x: tierPos.x, y: tierPos.y, tag: 'east_wing' },
    { x: portalPos.x, y: portalPos.y, tag: 'portal_bay' },
    { x: spawnPos.x, y: spawnPos.y, tag: 'arrival_bay' },
  );

  const bossCenter = { x: centerX, y: centerY };

  return {
    layoutId: `hub_core_station_v2_r${roomIndex | 0}`,
    profileId: profile?.biomeId || 'hub',
    visualPreset: profile?.visualPreset || 'hub_core_station',
    geometry: {
      platforms,
      bridges,
      walls,
      voidZones: [],
      navZones,
    },
    anchors: {
      playerStart,
      shopAnchor: shopPos,
      spawnAnchors,
      gateAnchors,
      decorAnchors,
      coverAnchors,
      hazardAnchors,
      bossSpawn: bossCenter,
      bossMoveNodes: [
        bossCenter,
        { x: centerX, y: centerY - side * 0.10 },
        { x: centerX - side * 0.12, y: centerY + side * 0.03 },
        { x: centerX + side * 0.12, y: centerY + side * 0.03 },
      ],
      hubNpcAnchors: {
        shop: shopPos,
        tier: tierPos,
        portal: portalPos,
        spawn: spawnPos,
      },
    },
    hazardZones,
    bossArena: {
      arenaType: 'hub_none',
      center: bossCenter,
      safeLanes: [
        { x: centerX, y: centerY, r: side * 0.12 },
      ],
      pressureZones: [],
      phaseNodes: [portalPos],
    },
    rules: {
      supportsBridges: true,
      prefersRangedPressure: false,
      slipZones: false,
      fogZones: false,
      radiantBuffNodes: false,
      isHub: true,
      gateAnchorDriven: false,
    },
  };
}
