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

  const addPlatform = (id, x, y, w, h, inset = 10) => addRect(platforms, navZones, id, x, y, w, h, inset);
  const addBridge = (id, x, y, w, h, inset = 1) => addRect(bridges, navZones, id, x, y, w, h, inset);

  const coreW = side * 0.22;
  const coreH = side * 0.20;
  const ringW = side * 0.15;
  const ringH = side * 0.12;
  const diagW = side * 0.11;
  const diagH = side * 0.094;
  const concourseW = side * 0.14;
  const concourseH = side * 0.15;
  const wingW = side * 0.26;
  const wingH = side * 0.17;
  const balconyW = side * 0.12;
  const balconyH = side * 0.09;
  const bayW = side * 0.24;
  const bayH = side * 0.14;
  const railW = Math.max(38, side * 0.05);
  const railH = Math.max(34, side * 0.04);

  const core = addPlatform('hub_core_plaza', centerX - coreW * 0.5, centerY - coreH * 0.5, coreW, coreH, 8);
  const northRing = addPlatform('hub_ring_n', centerX - ringW * 0.5, centerY - coreH * 0.62 - ringH * 0.5, ringW, ringH, 8);
  const southRing = addPlatform('hub_ring_s', centerX - ringW * 0.5, centerY + coreH * 0.62 - ringH * 0.5, ringW, ringH, 8);
  const westRing = addPlatform('hub_ring_w', centerX - coreW * 0.62 - ringH * 0.5, centerY - ringW * 0.5, ringH, ringW, 8);
  const eastRing = addPlatform('hub_ring_e', centerX + coreW * 0.62 - ringH * 0.5, centerY - ringW * 0.5, ringH, ringW, 8);

  const nw = addPlatform('hub_ring_nw', centerX - coreW * 0.48 - diagW * 0.5, centerY - coreH * 0.48 - diagH * 0.5, diagW, diagH, 8);
  const ne = addPlatform('hub_ring_ne', centerX + coreW * 0.48 - diagW * 0.5, centerY - coreH * 0.48 - diagH * 0.5, diagW, diagH, 8);
  const sw = addPlatform('hub_ring_sw', centerX - coreW * 0.48 - diagW * 0.5, centerY + coreH * 0.48 - diagH * 0.5, diagW, diagH, 8);
  const se = addPlatform('hub_ring_se', centerX + coreW * 0.48 - diagW * 0.5, centerY + coreH * 0.48 - diagH * 0.5, diagW, diagH, 8);
  const nwPod = addPlatform('hub_pod_nw', nw.x - balconyW * 0.46, nw.y - balconyH * 0.60, balconyW, balconyH, 8);
  const nePod = addPlatform('hub_pod_ne', ne.x + diagW - balconyW * 0.54, ne.y - balconyH * 0.60, balconyW, balconyH, 8);
  const swPod = addPlatform('hub_pod_sw', sw.x - balconyW * 0.46, sw.y + diagH - balconyH * 0.40, balconyW, balconyH, 8);
  const sePod = addPlatform('hub_pod_se', se.x + diagW - balconyW * 0.54, se.y + diagH - balconyH * 0.40, balconyW, balconyH, 8);

  connectHorizontal(bridges, navZones, 'hub_link_nw', nw, northRing, railH, 12, 1);
  connectHorizontal(bridges, navZones, 'hub_link_ne', northRing, ne, railH, 12, 1);
  connectHorizontal(bridges, navZones, 'hub_link_sw', sw, southRing, railH, 12, 1);
  connectHorizontal(bridges, navZones, 'hub_link_se', southRing, se, railH, 12, 1);
  connectVertical(bridges, navZones, 'hub_link_wn', nw, westRing, railW, 12, 1);
  connectVertical(bridges, navZones, 'hub_link_ws', westRing, sw, railW, 12, 1);
  connectVertical(bridges, navZones, 'hub_link_en', ne, eastRing, railW, 12, 1);
  connectVertical(bridges, navZones, 'hub_link_es', eastRing, se, railW, 12, 1);
  connectVertical(bridges, navZones, 'hub_pod_link_nw', nwPod, nw, Math.max(24, side * 0.03), 8, 1);
  connectVertical(bridges, navZones, 'hub_pod_link_ne', nePod, ne, Math.max(24, side * 0.03), 8, 1);
  connectVertical(bridges, navZones, 'hub_pod_link_sw', sw, swPod, Math.max(24, side * 0.03), 8, 1);
  connectVertical(bridges, navZones, 'hub_pod_link_se', se, sePod, Math.max(24, side * 0.03), 8, 1);

  const northConcourse = addBridge('hub_north_concourse', centerX - concourseW * 0.5, northRing.y - concourseH + 18, concourseW, concourseH + 18, 1);
  const southConcourse = addBridge('hub_south_concourse', centerX - concourseW * 0.5, southRing.y + southRing.h - 18, concourseW, concourseH + 18, 1);
  const westConcourse = addBridge('hub_west_concourse', westRing.x - concourseH + 18, centerY - concourseW * 0.5, concourseH + 18, concourseW, 1);
  const eastConcourse = addBridge('hub_east_concourse', eastRing.x + eastRing.w - 18, centerY - concourseW * 0.5, concourseH + 18, concourseW, 1);

  const shopWing = addPlatform('hub_shop_wing', westConcourse.x - wingW + 22, centerY - wingH * 0.5, wingW, wingH, 8);
  const tierWing = addPlatform('hub_tier_wing', eastConcourse.x + eastConcourse.w - 22, centerY - wingH * 0.5, wingW, wingH, 8);
  const shopBalTop = addPlatform('hub_shop_balcony_top', shopWing.x + wingW * 0.14, shopWing.y - balconyH * 0.85, balconyW, balconyH, 8);
  const shopBalBot = addPlatform('hub_shop_balcony_bot', shopWing.x + wingW * 0.54, shopWing.y + wingH - balconyH * 0.15, balconyW, balconyH, 8);
  const tierBalTop = addPlatform('hub_tier_balcony_top', tierWing.x + wingW * 0.54, tierWing.y - balconyH * 0.85, balconyW, balconyH, 8);
  const tierBalBot = addPlatform('hub_tier_balcony_bot', tierWing.x + wingW * 0.14, tierWing.y + wingH - balconyH * 0.15, balconyW, balconyH, 8);
  connectVertical(bridges, navZones, 'hub_shop_bal_link_t', shopBalTop, shopWing, Math.max(28, side * 0.035), 10, 1);
  connectVertical(bridges, navZones, 'hub_shop_bal_link_b', shopWing, shopBalBot, Math.max(28, side * 0.035), 10, 1);
  connectVertical(bridges, navZones, 'hub_tier_bal_link_t', tierBalTop, tierWing, Math.max(28, side * 0.035), 10, 1);
  connectVertical(bridges, navZones, 'hub_tier_bal_link_b', tierWing, tierBalBot, Math.max(28, side * 0.035), 10, 1);

  const portalBay = addPlatform('hub_portal_bay', centerX - bayW * 0.5, northConcourse.y - bayH + 18, bayW, bayH, 8);
  const portalLeft = addPlatform('hub_portal_left', portalBay.x - balconyW * 0.74, portalBay.y + bayH * 0.18, balconyW, balconyH, 8);
  const portalRight = addPlatform('hub_portal_right', portalBay.x + bayW - balconyW * 0.26, portalBay.y + bayH * 0.18, balconyW, balconyH, 8);
  connectHorizontal(bridges, navZones, 'hub_portal_link_l', portalLeft, portalBay, Math.max(26, side * 0.034), 8, 1);
  connectHorizontal(bridges, navZones, 'hub_portal_link_r', portalBay, portalRight, Math.max(26, side * 0.034), 8, 1);
  const portalApron = addBridge('hub_portal_apron', centerX - bayW * 0.20, portalBay.y - side * 0.095, bayW * 0.40, side * 0.088, 1);

  const arrivalBay = addPlatform('hub_arrival_bay', centerX - bayW * 0.5, southConcourse.y + southConcourse.h - 18, bayW, bayH, 8);
  const arrivalLeft = addPlatform('hub_arrival_left', arrivalBay.x - balconyW * 0.70, arrivalBay.y + bayH * 0.26, balconyW, balconyH, 8);
  const arrivalRight = addPlatform('hub_arrival_right', arrivalBay.x + bayW - balconyW * 0.30, arrivalBay.y + bayH * 0.26, balconyW, balconyH, 8);
  connectHorizontal(bridges, navZones, 'hub_arrival_link_l', arrivalLeft, arrivalBay, Math.max(24, side * 0.032), 8, 1);
  connectHorizontal(bridges, navZones, 'hub_arrival_link_r', arrivalBay, arrivalRight, Math.max(24, side * 0.032), 8, 1);
  const arrivalApron = addBridge('hub_arrival_apron', centerX - bayW * 0.20, arrivalBay.y + arrivalBay.h, bayW * 0.40, side * 0.058, 1);

  const shopPos = { x: shopWing.x + shopWing.w * 0.5, y: shopWing.y + shopWing.h * 0.5 };
  const tierPos = { x: tierWing.x + tierWing.w * 0.5, y: tierWing.y + tierWing.h * 0.5 };
  const portalPos = { x: portalBay.x + portalBay.w * 0.5, y: portalBay.y + portalBay.h * 0.48 };
  const spawnPos = { x: arrivalBay.x + arrivalBay.w * 0.5, y: arrivalBay.y + arrivalBay.h * 0.44 };
  const playerStart = { x: spawnPos.x, y: arrivalBay.y + arrivalBay.h * 0.68 };
  const apronX = portalApron.x + portalApron.w * 0.5;
  const apronY = portalApron.y + portalApron.h * 0.18;

  gateAnchors.push(
    { side: 'N', x: apronX, y: apronY, socket: 'N', tag: 'portal_main' },
    { side: 'N', x: apronX + portalApron.w * 0.18, y: apronY, socket: 'upper_offset', tag: 'portal_offset' },
    { side: 'S', x: spawnPos.x, y: arrivalBay.y + arrivalBay.h * 0.16, socket: 'S', tag: 'arrival_entry' },
  );

  decorAnchors.push(
    { x: centerX, y: centerY, kind: 'hub_core', size: 48 },
    { x: shopPos.x, y: shopPos.y, kind: 'shop_terminal', size: 30 },
    { x: tierPos.x, y: tierPos.y, kind: 'tier_terminal', size: 30 },
    { x: portalPos.x, y: portalPos.y, kind: 'portal_gate', size: 40 },
    { x: spawnPos.x, y: spawnPos.y, kind: 'spawn_pad', size: 26 },
    { x: centerX, y: centerY - side * 0.17, kind: 'hologrid_pylon', size: 24 },
    { x: centerX - side * 0.22, y: centerY - side * 0.03, kind: 'transit_rail', size: 22 },
    { x: centerX + side * 0.22, y: centerY - side * 0.03, kind: 'transit_rail', size: 22 },
    { x: nwPod.x + nwPod.w * 0.5, y: nwPod.y + nwPod.h * 0.5, kind: 'observation_deck', size: 18 },
    { x: nePod.x + nePod.w * 0.5, y: nePod.y + nePod.h * 0.5, kind: 'observation_deck', size: 18 },
    { x: swPod.x + swPod.w * 0.5, y: swPod.y + swPod.h * 0.5, kind: 'relay_balcony', size: 18 },
    { x: sePod.x + sePod.w * 0.5, y: sePod.y + sePod.h * 0.5, kind: 'relay_balcony', size: 18 },
    { x: shopBalTop.x + shopBalTop.w * 0.5, y: shopBalTop.y + shopBalTop.h * 0.5, kind: 'relay_balcony', size: 20 },
    { x: tierBalTop.x + tierBalTop.w * 0.5, y: tierBalTop.y + tierBalTop.h * 0.5, kind: 'relay_balcony', size: 20 },
    { x: centerX, y: centerY + side * 0.16, kind: 'observation_deck', size: 26 },
    { x: portalLeft.x + portalLeft.w * 0.5, y: portalLeft.y + portalLeft.h * 0.5, kind: 'relay_balcony', size: 18 },
    { x: portalRight.x + portalRight.w * 0.5, y: portalRight.y + portalRight.h * 0.5, kind: 'relay_balcony', size: 18 },
  );

  coverAnchors.push(
    { x: centerX - coreW * 0.28, y: centerY - coreH * 0.12, size: 14 },
    { x: centerX + coreW * 0.28, y: centerY - coreH * 0.12, size: 14 },
    { x: centerX - coreW * 0.22, y: centerY + coreH * 0.18, size: 12 },
    { x: centerX + coreW * 0.22, y: centerY + coreH * 0.18, size: 12 },
  );

  spawnAnchors.push(
    { x: shopPos.x, y: shopPos.y, tag: 'west_wing' },
    { x: tierPos.x, y: tierPos.y, tag: 'east_wing' },
    { x: portalPos.x, y: portalPos.y, tag: 'portal_bay' },
    { x: spawnPos.x, y: spawnPos.y, tag: 'arrival_bay' },
  );

  const bossCenter = { x: centerX, y: centerY };

  return {
    layoutId: `hub_core_station_v4_r${roomIndex | 0}`,
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
        { x: centerX - side * 0.13, y: centerY + side * 0.04 },
        { x: centerX + side * 0.13, y: centerY + side * 0.04 },
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
        { x: centerX, y: centerY, r: side * 0.13 },
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
