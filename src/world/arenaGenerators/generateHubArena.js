ateHubArena({ roomIndex = 0, centerX = 0, centerY = 0, side = 600, profile = null }) {
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
function makeRect(id, x, y, w, h) {
  return { id, type: 'rect', x, y, w, h };
}

function insetRectNav(id, x, y, w, h, inset = 12) {
  return {
    id: `${id}_nav`,
    type: 'rect',
    x: x + inset,
    y: y + inset,
    w: Math.max(32, w - inset * 2),
    h: Math.max(32, h - inset * 2),
  };
}

function addRect(list, navZones, id, x, y, w, h, inset = 12) {
  const rect = makeRect(id, x, y, w, h);
  list.push(rect);
  navZones.push(insetRectNav(id, x, y, w, h, inset));
  return rect;
}

function centerOf(r) {
  return { x: r.x + r.w * 0.5, y: r.y + r.h * 0.5 };
}

function clamp(n, a, b) {
  return n < a ? a : (n > b ? b : n);
}

function connectRects(list, navZones, id, a, b, thickness = 34, inset = 8) {
  if (!a || !b) return null;
  const ca = centerOf(a);
  const cb = centerOf(b);
  if (Math.abs(ca.x - cb.x) >= Math.abs(ca.y - cb.y)) {
    const x = Math.min(ca.x, cb.x);
    const w = Math.max(24, Math.abs(ca.x - cb.x));
    return addRect(list, navZones, id, x, ca.y - thickness * 0.5, w, thickness, inset);
  }
  const y = Math.min(ca.y, cb.y);
  const h = Math.max(24, Math.abs(ca.y - cb.y));
  return addRect(list, navZones, id, ca.x - thickness * 0.5, y, thickness, h, inset);
}

function addCentered(platforms, navZones, id, cx, cy, w, h, inset = 10) {
  return addRect(platforms, navZones, id, cx - w * 0.5, cy - h * 0.5, w, h, inset);
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

  const module = (id, cx, cy, w, h, inset = 10) => addCentered(platforms, navZones, id, cx, cy, w, h, inset);
  const span = (id, a, b, thickness = 34, inset = 8) => connectRects(bridges, navZones, id, a, b, thickness, inset);

  const laneW = clamp(side * 0.050, 30, 42);
  const spineW = clamp(side * 0.058, 34, 48);
  const micro = clamp(side * 0.070, 42, 62);
  const small = clamp(side * 0.090, 58, 86);
  const medium = clamp(side * 0.115, 76, 104);
  const large = clamp(side * 0.150, 98, 134);
  const wingW = clamp(side * 0.180, 116, 154);
  const wingH = clamp(side * 0.112, 74, 102);
  const bayW = clamp(side * 0.132, 86, 118);
  const bayH = clamp(side * 0.090, 58, 84);
  const ringLift = side * 0.12;
  const sideSpread = side * 0.26;

  // Central orbital core assembled from many modules rather than one big block.
  const coreCenter = module('hub_core_center', centerX, centerY + 2, large, large * 0.84, 10);
  const coreNorth = module('hub_core_north', centerX, centerY - ringLift, medium, small * 0.90, 9);
  const coreSouth = module('hub_core_south', centerX, centerY + ringLift, medium, small * 0.90, 9);
  const coreWest = module('hub_core_west', centerX - sideSpread * 0.36, centerY, small * 0.98, medium * 0.92, 9);
  const coreEast = module('hub_core_east', centerX + sideSpread * 0.36, centerY, small * 0.98, medium * 0.92, 9);
  const innerNorthL = module('hub_inner_nl', centerX - large * 0.28, centerY - ringLift * 0.55, micro * 0.82, micro * 0.76, 8);
  const innerNorthR = module('hub_inner_nr', centerX + large * 0.28, centerY - ringLift * 0.55, micro * 0.82, micro * 0.76, 8);
  const innerSouthL = module('hub_inner_sl', centerX - large * 0.28, centerY + ringLift * 0.55, micro * 0.82, micro * 0.76, 8);
  const innerSouthR = module('hub_inner_sr', centerX + large * 0.28, centerY + ringLift * 0.55, micro * 0.82, micro * 0.76, 8);
  const westBal = module('hub_balcony_w', centerX - sideSpread * 0.86, centerY - ringLift * 0.20, small * 0.95, micro * 0.82, 8);
  const eastBal = module('hub_balcony_e', centerX + sideSpread * 0.86, centerY + ringLift * 0.18, small * 0.95, micro * 0.82, 8);

  span('hub_core_n', coreCenter, coreNorth, spineW);
  span('hub_core_s', coreCenter, coreSouth, spineW);
  span('hub_core_w', coreWest, coreCenter, spineW);
  span('hub_core_e', coreCenter, coreEast, spineW);
  span('hub_inner_nl_link', innerNorthL, coreCenter, laneW);
  span('hub_inner_nr_link', coreCenter, innerNorthR, laneW);
  span('hub_inner_sl_link', innerSouthL, coreCenter, laneW);
  span('hub_inner_sr_link', coreCenter, innerSouthR, laneW);
  span('hub_bal_w_link', westBal, coreWest, laneW);
  span('hub_bal_e_link', coreEast, eastBal, laneW);

  // West command / merchant wing built from gallery modules.
  const westSpineA = module('hub_w_spine_a', centerX - sideSpread, centerY, medium, small * 0.86, 9);
  const westSpineB = module('hub_w_spine_b', centerX - sideSpread - wingW * 0.72, centerY, medium, small * 0.86, 9);
  const shopWing = module('hub_shop_wing', centerX - sideSpread - wingW * 1.36, centerY, wingW, wingH, 10);
  const shopPodTop = module('hub_shop_pod_top', centerX - sideSpread - wingW * 1.36, centerY - wingH * 0.88, small, bayH * 0.82, 8);
  const shopPodBot = module('hub_shop_pod_bot', centerX - sideSpread - wingW * 1.10, centerY + wingH * 0.88, micro * 1.05, bayH * 0.74, 8);
  const shopLookout = module('hub_shop_lookout', centerX - sideSpread - wingW * 1.84, centerY - wingH * 0.22, micro, bayH * 0.72, 8);
  span('hub_w_a', coreWest, westSpineA, laneW);
  span('hub_w_b', westSpineA, westSpineB, laneW);
  span('hub_w_c', westSpineB, shopWing, laneW);
  span('hub_shop_top', shopPodTop, shopWing, laneW);
  span('hub_shop_bot', shopWing, shopPodBot, laneW);
  span('hub_shop_look', shopLookout, shopWing, laneW);

  // East command / tier wing.
  const eastSpineA = module('hub_e_spine_a', centerX + sideSpread, centerY, medium, small * 0.86, 9);
  const eastSpineB = module('hub_e_spine_b', centerX + sideSpread + wingW * 0.72, centerY, medium, small * 0.86, 9);
  const tierWing = module('hub_tier_wing', centerX + sideSpread + wingW * 1.36, centerY, wingW, wingH, 10);
  const tierPodTop = module('hub_tier_pod_top', centerX + sideSpread + wingW * 1.14, centerY - wingH * 0.88, micro * 1.04, bayH * 0.74, 8);
  const tierPodBot = module('hub_tier_pod_bot', centerX + sideSpread + wingW * 1.36, centerY + wingH * 0.88, small, bayH * 0.82, 8);
  const tierLookout = module('hub_tier_lookout', centerX + sideSpread + wingW * 1.84, centerY + wingH * 0.18, micro, bayH * 0.72, 8);
  span('hub_e_a', coreEast, eastSpineA, laneW);
  span('hub_e_b', eastSpineA, eastSpineB, laneW);
  span('hub_e_c', eastSpineB, tierWing, laneW);
  span('hub_tier_top', tierPodTop, tierWing, laneW);
  span('hub_tier_bot', tierWing, tierPodBot, laneW);
  span('hub_tier_look', tierWing, tierLookout, laneW);

  // North run gate stack.
  const northVest = module('hub_north_vest', centerX, centerY - side * 0.27, medium * 1.02, small * 0.88, 9);
  const northSpine = module('hub_north_spine', centerX, centerY - side * 0.42, bayW * 0.72, bayH * 0.74, 8);
  const portalBay = module('hub_portal_bay', centerX, centerY - side * 0.58, bayW, bayH, 9);
  const portalPodL = module('hub_portal_pod_l', centerX - bayW * 0.90, centerY - side * 0.42, micro, bayH * 0.72, 8);
  const portalPodR = module('hub_portal_pod_r', centerX + bayW * 0.90, centerY - side * 0.42, micro, bayH * 0.72, 8);
  const portalApron = module('hub_portal_apron', centerX, portalBay.y - bayH * 0.74, bayW * 0.62, bayH * 0.68, 8);
  span('hub_north_a', coreNorth, northVest, spineW);
  span('hub_north_b', northVest, northSpine, laneW);
  span('hub_north_c', northSpine, portalBay, laneW);
  span('hub_north_pod_l', portalPodL, northSpine, laneW);
  span('hub_north_pod_r', northSpine, portalPodR, laneW);
  span('hub_north_apron', portalApron, portalBay, laneW);

  // South arrival stack.
  const southVest = module('hub_south_vest', centerX, centerY + side * 0.27, medium * 1.02, small * 0.88, 9);
  const southSpine = module('hub_south_spine', centerX, centerY + side * 0.42, bayW * 0.72, bayH * 0.74, 8);
  const arrivalBay = module('hub_arrival_bay', centerX, centerY + side * 0.58, bayW, bayH, 9);
  const arrivalPodL = module('hub_arrival_pod_l', centerX - bayW * 0.90, centerY + side * 0.42, micro, bayH * 0.72, 8);
  const arrivalPodR = module('hub_arrival_pod_r', centerX + bayW * 0.90, centerY + side * 0.42, micro, bayH * 0.72, 8);
  const arrivalApron = module('hub_arrival_apron', centerX, arrivalBay.y + arrivalBay.h + bayH * 0.34, bayW * 0.62, bayH * 0.68, 8);
  span('hub_south_a', coreSouth, southVest, spineW);
  span('hub_south_b', southVest, southSpine, laneW);
  span('hub_south_c', southSpine, arrivalBay, laneW);
  span('hub_south_pod_l', arrivalPodL, southSpine, laneW);
  span('hub_south_pod_r', southSpine, arrivalPodR, laneW);
  span('hub_south_apron', arrivalBay, arrivalApron, laneW);

  const shopPos = centerOf(shopWing);
  const tierPos = centerOf(tierWing);
  const portalPos = centerOf(portalBay);
  const spawnPos = centerOf(arrivalBay);
  const playerStart = { x: spawnPos.x, y: arrivalApron.y + arrivalApron.h * 0.40 };

  gateAnchors.push(
    { side: 'N', x: centerOf(portalApron).x, y: portalApron.y - 12, socket: 'N', tag: 'portal_main' },
    { side: 'S', x: centerOf(arrivalApron).x, y: arrivalApron.y + arrivalApron.h + 12, socket: 'S', tag: 'arrival_entry' },
  );

  decorAnchors.push(
    { x: centerX, y: centerY, kind: 'hub_core', size: 58 },
    { x: shopPos.x, y: shopPos.y, kind: 'shop_terminal', size: 32 },
    { x: tierPos.x, y: tierPos.y, kind: 'tier_terminal', size: 32 },
    { x: portalPos.x, y: portalPos.y, kind: 'portal_gate', size: 44 },
    { x: spawnPos.x, y: spawnPos.y, kind: 'spawn_pad', size: 28 },
    { x: centerX, y: centerY - side * 0.08, kind: 'hologrid_pylon', size: 26 },
    { x: centerOf(westBal).x, y: centerOf(westBal).y, kind: 'observation_deck', size: 20 },
    { x: centerOf(eastBal).x, y: centerOf(eastBal).y, kind: 'relay_balcony', size: 20 },
    { x: centerOf(shopPodTop).x, y: centerOf(shopPodTop).y, kind: 'relay_balcony', size: 18 },
    { x: centerOf(tierPodBot).x, y: centerOf(tierPodBot).y, kind: 'relay_balcony', size: 18 },
    { x: centerOf(portalPodL).x, y: centerOf(portalPodL).y, kind: 'observation_deck', size: 18 },
    { x: centerOf(arrivalPodR).x, y: centerOf(arrivalPodR).y, kind: 'relay_balcony', size: 18 },
  );

  coverAnchors.push(
    { x: centerX - large * 0.20, y: centerY - large * 0.08, size: 14 },
    { x: centerX + large * 0.20, y: centerY - large * 0.08, size: 14 },
    { x: centerX - large * 0.18, y: centerY + large * 0.16, size: 12 },
    { x: centerX + large * 0.18, y: centerY + large * 0.16, size: 12 },
  );

  spawnAnchors.push(
    { x: shopPos.x, y: shopPos.y, tag: 'west_wing' },
    { x: tierPos.x, y: tierPos.y, tag: 'east_wing' },
    { x: portalPos.x, y: portalPos.y, tag: 'portal_bay' },
    { x: spawnPos.x, y: spawnPos.y, tag: 'arrival_bay' },
  );

  const bossCenter = { x: centerX, y: centerY };

  return {
    layoutId: `hub_core_station_v6_r${roomIndex | 0}`,
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
        centerOf(coreNorth),
        centerOf(coreSouth),
        centerOf(coreWest),
        centerOf(coreEast),
        centerOf(shopWing),
        centerOf(tierWing),
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
        { x: shopPos.x, y: shopPos.y, r: side * 0.06 },
        { x: tierPos.x, y: tierPos.y, r: side * 0.06 },
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
      gateAnchorDriven: true,
      sceneAssembler: 'station_modules_v1',
      moduleFamily: 'orbital_hub',
    },
  };
}
