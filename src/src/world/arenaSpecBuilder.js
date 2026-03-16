import { getArenaProfile } from './biomeArenaProfiles.js';
import { runArenaGenerator } from './arenaGenerators/index.js';
import { validateArenaSpec } from './arenaValidator.js';

const _lastLayoutByProfile = new Map();

function pickLayoutId(profile, roomIndex) {
  const pool = Array.isArray(profile?.layoutPool) ? profile.layoutPool.filter(Boolean) : [];
  if (!pool.length) return '';
  if (pool.length === 1) {
    _lastLayoutByProfile.set(String(profile?.biomeId || ''), pool[0]);
    return pool[0];
  }
  const profileId = String(profile?.biomeId || '');
  const last = _lastLayoutByProfile.get(profileId) || '';
  let idx = Math.abs((roomIndex | 0)) % pool.length;
  let picked = pool[idx] || pool[0];
  if (picked === last) {
    idx = (idx + 1) % pool.length;
    picked = pool[idx] || pool[0];
  }
  _lastLayoutByProfile.set(profileId, picked);
  return picked;
}

function makeFallback({ roomIndex = 0, biomeKey = '', side = 1200, centerX = 0, centerY = 0, profile = null, reasons = [] }) {
  const half = side * 0.5;
  return {
    biome: biomeKey || '',
    roomIndex: roomIndex | 0,
    profileId: roomIndex <= 0 ? 'hub' : 'neutral',
    requestedProfileId: profile?.biomeId || '',
    layoutId: roomIndex <= 0 ? 'hub_fallback_v1' : 'neutral_fallback_v1',
    visualPreset: roomIndex <= 0 ? 'hub_core_station' : 'space_station_platform',
    geometry: {
      platforms: [{ id: 'main', type: 'rect', x: centerX - half, y: centerY - half, w: side, h: side }],
      bridges: [], walls: [], voidZones: [], navZones: [{ id: 'main_nav', type: 'rect', x: centerX - half, y: centerY - half, w: side, h: side }],
    },
    anchors: {
      playerStart: { x: centerX, y: centerY }, spawnAnchors: [], gateAnchors: [], decorAnchors: [], coverAnchors: [], hazardAnchors: [], bossSpawn: { x: centerX, y: centerY }, bossMoveNodes: [],
    },
    hazardZones: [],
    bossArena: { arenaType: 'neutral_core', center: { x: centerX, y: centerY }, safeLanes: [], pressureZones: [], phaseNodes: [] },
    rules: { supportsBridges: true, isHub: roomIndex <= 0 },
    validation: { ok: true, issues: Array.isArray(reasons) ? reasons.slice(0, 8) : [], usedFallback: true, safeFallbackProfile: roomIndex <= 0 ? 'hub' : 'neutral' },
  };
}

export function buildArenaSpec({ roomIndex = 0, biomeKey = '', templateKey = '', encounterType = '', roomOrdinal = 0, totalRooms = 0, side = 1200, centerX = 0, centerY = 0, entrySocket = '', exitSocket = '', portalSocket = '', templateRole = '', routeStyle = '', lateralOffset = 0 } = {}) {
  const profile = getArenaProfile(roomIndex, biomeKey);
  const selectedLayoutId = pickLayoutId(profile, roomIndex);
  try {
    const generated = runArenaGenerator(profile, { roomIndex, biomeKey, templateKey, encounterType, roomOrdinal, totalRooms, side, centerX, centerY, selectedLayoutId, entrySocket, exitSocket, portalSocket, templateRole, routeStyle, lateralOffset });
    const arenaSpec = {
      biome: String(biomeKey || ''),
      roomIndex: roomIndex | 0,
      profileId: profile.biomeId,
      generatorId: profile.generatorId,
      layoutPool: Array.isArray(profile.layoutPool) ? profile.layoutPool.slice() : [],
      selectedLayoutId,
      visualPreset: profile.visualPreset || '',
      ...generated,
    };
    const validation = validateArenaSpec(arenaSpec);
    arenaSpec.validation = { ...validation, usedFallback: false };
    if (!validation.ok) {
      const fb = makeFallback({ roomIndex, biomeKey, side, centerX, centerY, profile, reasons: validation.issues });
      return fb;
    }
    return arenaSpec;
  } catch (err) {
    const fb = makeFallback({ roomIndex, biomeKey, side, centerX, centerY, profile, reasons: [String(err?.message || err || 'arena build failed')] });
    return fb;
  }
}
