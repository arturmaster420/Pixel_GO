import { Player } from './player.js';
import { Camera } from './camera.js';
import { RoomSpawnSystem } from '../world/roomSpawnSystem.js';
import { RoomDirector } from '../world/roomDirector.js';
import { saveProgression, applyLimitsToPlayer } from './progression.js';
import { applyHubBuildToPlayer, applyProgressionSpToPlayer, bankPlayerSpToProgression, ensureHubProgression, getHubBuildSpentPoints, importPlayerSnapshotIntoHubBuild } from './hubBuild.js';
import { ensureShopMeta } from '../meta/shopMeta.js';
import { ensureStarterLoadoutProgression } from './starterLoadouts.js';
import { hideFloorShopOverlay } from '../ui/floorShopDom.js';
import { applyRunDerivedStats } from './runUpgrades.js';
import { restoreEvolutionSnapshot } from './skillEvolutionDefs.js';
import {
  applyActiveHeroToLegacyProgression,
  clearAllHeroExpeditionStates,
  createHeroProfile,
  getActiveHero,
  getActiveHeroSummary,
  getHeroById,
  setHeroExpeditionState,
  syncHeroLoadoutToLegacyBridge,
} from './accountProfile.js';

export const RUN_CHECKPOINT_STORAGE_KEY = 'pixelgo_run_checkpoint_v1';

export function cloneJsonSafe(value, fallback = null) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}


function normalizeCheckpointCardArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : String(entry || '').trim()))
    .filter(Boolean);
}

function areCardLoadoutsEqual(a, b) {
  const left = normalizeCheckpointCardArray(a);
  const right = normalizeCheckpointCardArray(b);
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function getCheckpointLoadoutSnapshot(playerData = {}) {
  const explicit = playerData?.checkpointLoadout && typeof playerData.checkpointLoadout === 'object' ? playerData.checkpointLoadout : null;
  return {
    heroId: String(explicit?.heroId || playerData.activeHeroId || '').trim(),
    equippedSkillCards: normalizeCheckpointCardArray(explicit?.equippedSkillCards ?? playerData.equippedSkillCards),
    equippedPassiveCards: normalizeCheckpointCardArray(explicit?.equippedPassiveCards ?? playerData.equippedPassiveCards),
  };
}

function getHeroLoadoutSnapshot(hero = null) {
  return {
    heroId: String(hero?.heroId || '').trim(),
    equippedSkillCards: normalizeCheckpointCardArray(hero?.equippedSkillCards),
    equippedPassiveCards: normalizeCheckpointCardArray(hero?.equippedPassiveCards),
  };
}

function shouldHydrateHeroLoadoutFromCheckpoint(hero, checkpointLoadout, key) {
  if (!hero || !checkpointLoadout) return true;
  const current = normalizeCheckpointCardArray(hero?.[key]);
  return current.length <= 0;
}

function ensureCheckpointHeroInProgression(prog, playerData = {}) {
  if (!prog || typeof prog !== 'object') return null;
  const heroId = String(playerData.activeHeroId || '').trim();
  if (!heroId) return getActiveHero(prog);
  let hero = getHeroById(prog, heroId);
  if (!hero) {
    const race = String(playerData.activeHeroRace || playerData.selectedStarterLoadout || prog.selectedStarterLoadout || 'mecha');
    hero = createHeroProfile({
      heroId,
      name: String(playerData.activeHeroName || playerData.nickname || 'Hero'),
      race,
      legacyBridge: {
        selectedStarterLoadout: race,
        hubBuild: cloneJsonSafe(playerData.hubBuild || null, null),
        hubGear: cloneJsonSafe(playerData.hubGear || null, null),
        skillMeta: {},
        heroCombatProfile: cloneJsonSafe(playerData.heroCombatProfile || null, null),
        equippedSkillCards: Array.isArray(playerData.equippedSkillCards) ? playerData.equippedSkillCards : [],
        equippedPassiveCards: Array.isArray(playerData.equippedPassiveCards) ? playerData.equippedPassiveCards : [],
      },
    });
    if (!Array.isArray(prog.heroes)) prog.heroes = [];
    prog.heroes.push(hero);
    if (!Array.isArray(prog.accountProfile?.heroOrder)) prog.accountProfile.heroOrder = [];
    if (!prog.accountProfile.heroOrder.includes(hero.heroId)) prog.accountProfile.heroOrder.push(hero.heroId);
  }
  return hero;
}

function bindCheckpointToHeroProgression(prog, playerData = {}, checkpoint = null) {
  if (!prog || typeof prog !== 'object') return null;
  const existingHero = getHeroById(prog, playerData.activeHeroId);
  const hero = ensureCheckpointHeroInProgression(prog, playerData);
  if (!hero) return null;
  const race = String(playerData.activeHeroRace || playerData.selectedStarterLoadout || hero.race || 'mecha');
  const checkpointLoadout = getCheckpointLoadoutSnapshot(playerData);
  hero.name = String(playerData.activeHeroName || playerData.nickname || hero.name || 'Hero').slice(0, 24) || 'Hero';
  hero.race = race;
  if (Array.isArray(playerData.equippedSkillCards) && shouldHydrateHeroLoadoutFromCheckpoint(existingHero, checkpointLoadout, 'equippedSkillCards')) {
    hero.equippedSkillCards = cloneJsonSafe(playerData.equippedSkillCards, []);
  }
  if (Array.isArray(playerData.equippedPassiveCards) && shouldHydrateHeroLoadoutFromCheckpoint(existingHero, checkpointLoadout, 'equippedPassiveCards')) {
    hero.equippedPassiveCards = cloneJsonSafe(playerData.equippedPassiveCards, []);
  }
  hero.legacyBridge = {
    ...(hero.legacyBridge && typeof hero.legacyBridge === 'object' ? hero.legacyBridge : {}),
    selectedStarterLoadout: race,
    hubBuild: cloneJsonSafe(playerData.hubBuild || hero.legacyBridge?.hubBuild || null, hero.legacyBridge?.hubBuild || null),
    hubGear: cloneJsonSafe(playerData.hubGear || hero.legacyBridge?.hubGear || null, hero.legacyBridge?.hubGear || null),
    skillMeta: cloneJsonSafe(hero.legacyBridge?.skillMeta || {}, {}),
    heroCombatProfile: cloneJsonSafe(playerData.heroCombatProfile || hero.legacyBridge?.heroCombatProfile || null, null),
  };
  if (playerData.gearInventory && typeof playerData.gearInventory === 'object') {
    prog.gearInventory = cloneJsonSafe(playerData.gearInventory, prog.gearInventory || {});
  }
  if (typeof hero.heroVersion !== 'number') hero.heroVersion = 2;
  prog.activeHeroId = hero.heroId;
  syncHeroLoadoutToLegacyBridge(prog, hero);
  clearAllHeroExpeditionStates(prog);
  setHeroExpeditionState(prog, hero, {
    hasCheckpoint: !!checkpoint,
    resumeFloor: Math.max(0, (checkpoint?.nextFloor | 0) || 0),
    lastBiomeKey: String(checkpoint?.lastBiomeKey || checkpoint?.savedPlan?.biomeKey || ''),
    savedAt: Math.max(0, Number(checkpoint?.savedAt || Date.now()) || 0),
    checkpointVersion: Math.max(0, (checkpoint?.version | 0) || 0),
  });
  applyActiveHeroToLegacyProgression(prog);
  return hero;
}

export function clearSavedRunCheckpoint(state = null) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(RUN_CHECKPOINT_STORAGE_KEY);
  } catch {}
  if (state?.progression) {
    try {
      clearAllHeroExpeditionStates(state.progression);
      saveProgression(state.progression);
    } catch {}
  }
  if (state) {
    state._savedRunResumeAvailable = false;
    state._savedRunCheckpointLoaded = false;
    state._savedRunResumePlan = null;
    state._hubResumeRunActive = false;
    state._hubResumeNextFloor = 0;
  }
}

export function loadSavedRunCheckpoint() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(RUN_CHECKPOINT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const plan = (parsed.savedPlan && typeof parsed.savedPlan === 'object') ? parsed.savedPlan : null;
    const player = (parsed.player && typeof parsed.player === 'object') ? parsed.player : null;
    const nextFloor = Math.max(1, Number(parsed.nextFloor || plan?.floorNumber || 1) || 1);
    if (!plan || !Array.isArray(plan.rooms) || !plan.rooms.length || !player) return null;
    return {
      version: Number(parsed.version || 1) || 1,
      savedAt: Number(parsed.savedAt || 0) || 0,
      nextFloor,
      savedPlan: cloneJsonSafe(plan, null),
      lastBiomeKey: String(parsed.lastBiomeKey || plan.biomeKey || ''),
      flags: (parsed.flags && typeof parsed.flags === 'object') ? parsed.flags : {},
      runScore: (parsed.runScore | 0) || 0,
      deathContinueCount: Math.max(0, (parsed.deathContinueCount | 0) || 0),
      player: {
        activeHeroId: String(player.activeHeroId || 'hero_1'),
        activeHeroName: String(player.activeHeroName || 'Hero 1'),
        activeHeroRace: String(player.activeHeroRace || player.selectedStarterLoadout || 'mecha'),
        level: Math.max(1, (player.level | 0) || 1),
        xp: Math.max(0, Number(player.xp || 0) || 0),
        skillPoints: Math.max(0, (player.skillPoints | 0) || 0),
        hp: Math.max(1, Number(player.hp || player.maxHP || 1) || 1),
        nickname: String(player.nickname || ''),
        avatarIndex: (player.avatarIndex | 0) || 0,
        auraId: (player.auraId | 0) || 0,
        selectedStarterLoadout: String(player.selectedStarterLoadout || 'mecha'),
        hubBuild: (player.hubBuild && typeof player.hubBuild === 'object') ? player.hubBuild : null,
        hubGear: (player.hubGear && typeof player.hubGear === 'object') ? player.hubGear : null,
        gearInventory: (player.gearInventory && typeof player.gearInventory === 'object') ? player.gearInventory : null,
        heroCombatProfile: (player.heroCombatProfile && typeof player.heroCombatProfile === 'object') ? player.heroCombatProfile : null,
        equippedSkillCards: Array.isArray(player.equippedSkillCards) ? player.equippedSkillCards : [],
        equippedPassiveCards: Array.isArray(player.equippedPassiveCards) ? player.equippedPassiveCards : [],
        checkpointLoadout: player.checkpointLoadout && typeof player.checkpointLoadout === 'object'
          ? {
            heroId: String(player.checkpointLoadout.heroId || player.activeHeroId || 'hero_1'),
            equippedSkillCards: Array.isArray(player.checkpointLoadout.equippedSkillCards) ? player.checkpointLoadout.equippedSkillCards : [],
            equippedPassiveCards: Array.isArray(player.checkpointLoadout.equippedPassiveCards) ? player.checkpointLoadout.equippedPassiveCards : [],
          }
          : {
            heroId: String(player.activeHeroId || 'hero_1'),
            equippedSkillCards: Array.isArray(player.equippedSkillCards) ? player.equippedSkillCards : [],
            equippedPassiveCards: Array.isArray(player.equippedPassiveCards) ? player.equippedPassiveCards : [],
          },
        spTotal: Math.max(0, (player.spTotal | 0) || 0),
        runSkills: (player.runSkills && typeof player.runSkills === 'object') ? player.runSkills : {},
        runPassives: (player.runPassives && typeof player.runPassives === 'object') ? player.runPassives : {},
        runSkillStages: (player.runSkillStages && typeof player.runSkillStages === 'object') ? player.runSkillStages : {},
        runEvolutions: (player.runEvolutions && typeof player.runEvolutions === 'object') ? player.runEvolutions : {},
      },
    };
  } catch {
    return null;
  }
}

export function saveRunCheckpointFromState(state, { savedPlan = null, nextFloor = 0 } = {}) {
  try {
    if (!state?.player) return false;
    if (typeof localStorage === 'undefined') return false;
    const planSrc = savedPlan || state._savedRunResumePlan || state.roomDirector?._activeFloorPlan || null;
    const plan = cloneJsonSafe(planSrc, null);
    if (!plan || !Array.isArray(plan.rooms) || !plan.rooms.length) return false;
    const p = state.player;
    const savedAt = Date.now();
    const heroSummary = getActiveHeroSummary(state.progression) || {};
    const activeHero = getActiveHero(state.progression);
    const checkpointNextFloor = Math.max(1, Number(nextFloor || plan.floorNumber || state._hubResumeNextFloor || 1) || 1);
    try {
      ensureHubProgression(state.progression);
      bankPlayerSpToProgression(p, state.progression);
      bindCheckpointToHeroProgression(state.progression, {
        activeHeroId: String(state.progression?.activeHeroId || activeHero?.heroId || 'hero_1'),
        activeHeroName: String(heroSummary?.name || activeHero?.name || 'Hero 1'),
        activeHeroRace: String(heroSummary?.race || activeHero?.race || state.progression?.selectedStarterLoadout || 'mecha'),
        selectedStarterLoadout: String(p._selectedStarterLoadout || state.progression?.selectedStarterLoadout || 'mecha'),
        hubBuild: cloneJsonSafe(state.progression?.hubBuild || activeHero?.legacyBridge?.hubBuild || null, null),
        hubGear: cloneJsonSafe(state.progression?.hubGear || activeHero?.gearLoadout || null, null),
        gearInventory: cloneJsonSafe(state.progression?.gearInventory || null, null),
        heroCombatProfile: cloneJsonSafe(state.progression?.heroCombatProfile || activeHero?.legacyBridge?.heroCombatProfile || null, null),
        equippedSkillCards: cloneJsonSafe(activeHero?.equippedSkillCards || [], []),
        equippedPassiveCards: cloneJsonSafe(activeHero?.equippedPassiveCards || [], []),
      }, {
        version: 4,
        savedAt,
        nextFloor: checkpointNextFloor,
        savedPlan: plan,
        lastBiomeKey: String(state.roomDirector?._lastBiomeKey || plan.biomeKey || ''),
      });
      saveProgression(state.progression);
    } catch {}
    const checkpointLoadout = {
      heroId: String(state.progression?.activeHeroId || activeHero?.heroId || 'hero_1'),
      equippedSkillCards: cloneJsonSafe(activeHero?.equippedSkillCards || [], []),
      equippedPassiveCards: cloneJsonSafe(activeHero?.equippedPassiveCards || [], []),
    };
    const payload = {
      version: 4,
      savedAt,
      nextFloor: checkpointNextFloor,
      lastBiomeKey: String(state.roomDirector?._lastBiomeKey || plan.biomeKey || ''),
      savedPlan: plan,
      flags: {
        resGuardianKilledThisRun: !!(state.flags && state.flags.resGuardianKilledThisRun),
      },
      runScore: (state.runScore | 0) || 0,
      deathContinueCount: Math.max(0, (p._deathContinueCount | 0) || (state._deathContinueCount | 0) || 0),
      player: {
        activeHeroId: String(state.progression?.activeHeroId || activeHero?.heroId || 'hero_1'),
        activeHeroName: String(heroSummary?.name || activeHero?.name || 'Hero 1'),
        activeHeroRace: String(heroSummary?.race || activeHero?.race || state.progression?.selectedStarterLoadout || 'mecha'),
        level: Math.max(1, (p.level | 0) || 1),
        xp: Math.max(0, Number(p.xp || 0) || 0),
        skillPoints: Math.max(0, (p.skillPoints | 0) || 0),
        hp: Math.max(1, Number(p.hp || p.maxHP || 1) || 1),
        nickname: String(p.nickname || state.progression?.nickname || 'Player'),
        avatarIndex: (p.avatarIndex | 0) || 0,
        auraId: (p.auraId | 0) || 0,
        selectedStarterLoadout: String(p._selectedStarterLoadout || state.progression?.selectedStarterLoadout || 'mecha'),
        hubBuild: cloneJsonSafe(state.progression?.hubBuild || activeHero?.legacyBridge?.hubBuild || null, null),
        hubGear: cloneJsonSafe(state.progression?.hubGear || activeHero?.gearLoadout || null, null),
        gearInventory: cloneJsonSafe(state.progression?.gearInventory || null, null),
        heroCombatProfile: cloneJsonSafe(state.progression?.heroCombatProfile || activeHero?.legacyBridge?.heroCombatProfile || null, null),
        equippedSkillCards: cloneJsonSafe(activeHero?.equippedSkillCards || [], []),
        equippedPassiveCards: cloneJsonSafe(activeHero?.equippedPassiveCards || [], []),
        checkpointLoadout,
        spTotal: Math.max(0, (state.progression?.sp | 0) || 0),
        runSkills: cloneJsonSafe(p.runSkills || {}, {}),
        runPassives: cloneJsonSafe(p.runPassives || {}, {}),
        runSkillStages: cloneJsonSafe(p.runSkillStages || {}, {}),
        runEvolutions: cloneJsonSafe(p.runEvolutions || {}, {}),
      },
    };
    localStorage.setItem(RUN_CHECKPOINT_STORAGE_KEY, JSON.stringify(payload));
    state._savedRunResumePlan = cloneJsonSafe(plan, null);
    state._savedRunResumeAvailable = true;
    state._savedRunCheckpointLoaded = true;
    state._hubResumeRunActive = true;
    state._hubResumeNextFloor = checkpointNextFloor;
    return true;
  } catch {
    return false;
  }
}

export function restoreRunCheckpointIntoState(state, checkpoint, { showPopup = false } = {}) {
  if (!state || !checkpoint?.player || !checkpoint?.savedPlan) return false;
  try { ensureShopMeta(state.progression); } catch {}
  try { ensureStarterLoadoutProgression(state.progression); } catch {}
  try { ensureHubProgression(state.progression); } catch {}

  const cp = checkpoint;
  const playerData = cp.player || {};
  const checkpointLoadout = getCheckpointLoadoutSnapshot(playerData);
  const currentHeroBeforeRestore = getHeroById(state.progression, checkpointLoadout.heroId || playerData.activeHeroId) || null;
  const currentLoadoutBeforeRestore = getHeroLoadoutSnapshot(currentHeroBeforeRestore);
  const canRestoreFullRunSnapshot = !currentHeroBeforeRestore
    || (checkpointLoadout.heroId === currentLoadoutBeforeRestore.heroId
      && areCardLoadoutsEqual(checkpointLoadout.equippedSkillCards, currentLoadoutBeforeRestore.equippedSkillCards)
      && areCardLoadoutsEqual(checkpointLoadout.equippedPassiveCards, currentLoadoutBeforeRestore.equippedPassiveCards));

  try {
    bindCheckpointToHeroProgression(state.progression, playerData, cp);
    try { ensureHubProgression(state.progression); } catch {}
  } catch {}

  const snapshotAvailableSp = Math.max(0, (playerData.skillPoints | 0) || 0);
  const snapshotTotalSp = Math.max(0, (playerData.spTotal | 0) || 0);
  try {
    const snapshotHasBuild = !!Object.keys(playerData.runSkills || {}).some((k) => ((playerData.runSkills?.[k] | 0) > 0))
      || !!Object.keys(playerData.runPassives || {}).some((k) => ((playerData.runPassives?.[k] | 0) > 0));
    if (canRestoreFullRunSnapshot && snapshotHasBuild && getHubBuildSpentPoints(state.progression) <= 0) {
      importPlayerSnapshotIntoHubBuild(state.progression, playerData);
    }
    if (canRestoreFullRunSnapshot && playerData.hubBuild && typeof playerData.hubBuild === 'object') state.progression.hubBuild = cloneJsonSafe(playerData.hubBuild, state.progression.hubBuild || null);
    if (canRestoreFullRunSnapshot && playerData.hubGear && typeof playerData.hubGear === 'object') state.progression.hubGear = cloneJsonSafe(playerData.hubGear, state.progression.hubGear || null);
    if (playerData.gearInventory && typeof playerData.gearInventory === 'object') state.progression.gearInventory = cloneJsonSafe(playerData.gearInventory, state.progression.gearInventory || {});
    if (canRestoreFullRunSnapshot) {
      state.progression.sp = Math.max(0, snapshotTotalSp || (getHubBuildSpentPoints(state.progression) + snapshotAvailableSp));
    }
    saveProgression(state.progression);
  } catch {}

  const startPos = { x: 0, y: 0 };
  const player = new Player(startPos, Math.max(1, (playerData.level | 0) || 1));
  if (!player.id) player.id = state.net?.playerId ? String(state.net.playerId) : 'local';
  player.nickname = playerData.nickname || state.progression?.nickname || 'Player';
  player.avatarIndex = (playerData.avatarIndex | 0) || (state.progression?.avatarIndex | 0) || 0;
  player.auraId = (playerData.auraId | 0) || (state.progression?.auraId | 0) || 0;
  player._metaSkillMeta = state.progression?.skillMeta || {};
  player._selectedStarterLoadout = String(state.progression?.hubBuild?.coreKey || playerData.selectedStarterLoadout || state.progression?.selectedStarterLoadout || 'mecha');
  state.progression.selectedStarterLoadout = player._selectedStarterLoadout;

  const meta = applyLimitsToPlayer(player, state.progression.limits);
  applyHubBuildToPlayer(player, state.progression);
  applyProgressionSpToPlayer(player, state.progression);
  if (!canRestoreFullRunSnapshot) player.skillPoints = snapshotAvailableSp;
  player.level = Math.max(1, (playerData.level | 0) || player.level || 1);
  player.xp = Math.max(0, Number(playerData.xp || 0) || 0);
  player.nextLevelXp = player.xpToNext();
  player.hp = Math.max(1, Math.min(Number(playerData.hp || player.maxHP || 1) || 1, player.maxHP | 0));

  if (canRestoreFullRunSnapshot) {
    player.runSkills = { ...(player.runSkills || {}), ...cloneJsonSafe(playerData.runSkills || {}, {}) };
    player.runPassives = { ...(player.runPassives || {}), ...cloneJsonSafe(playerData.runPassives || {}, {}) };
    restoreEvolutionSnapshot(player, playerData);
  } else {
    player.runSkills = cloneJsonSafe(player.runSkills || {}, {});
    player.runPassives = cloneJsonSafe(player.runPassives || {}, {});
    player.runSkillStages = {};
    player.runEvolutions = {};
    restoreEvolutionSnapshot(player, { runSkillStages: {}, runEvolutions: {} });
  }
  applyRunDerivedStats(player);
  player._deathContinueCount = Math.max(0, (cp.deathContinueCount | 0) || 0);

  state.player = player;
  state.players = [player];
  state.meta = {
    xpGainMult: meta?.xpGainMult ?? 1,
    scoreMult: meta?.scoreMult ?? 1,
    pickupBonusRadius: meta?.pickupBonusRadius ?? 0,
  };

  state._hubResumeRunActive = true;
  state._hubResumeNextFloor = Math.max(1, (cp.nextFloor | 0) || (cp.savedPlan?.floorNumber | 0) || 1);
  state._savedRunResumeAvailable = true;
  state._savedRunCheckpointLoaded = true;
  state._savedRunResumePlan = cloneJsonSafe(cp.savedPlan, null);
  state._savedRunLoadoutMismatch = !canRestoreFullRunSnapshot;
  state._deathContinueCount = Math.max(0, (cp.deathContinueCount | 0) || 0);
  state._deathHandled = false;
  state._waitingRespawnAck = false;
  state.overlayMode = null;
  state.currentZone = 0;
  state.runScore = (cp.runScore | 0) || 0;
  state.lastRunSummary = null;
  state.flags = { ...(state.flags || {}), resGuardianKilledThisRun: !!cp.flags?.resGuardianKilledThisRun };

  state.enemies = [];
  state.projectiles = [];
  state.rockets = [];
  state.iceWalls = [];
  state.blackholes = [];
  state.healPulses = [];
  state._explosions = [];
  state.xpOrbs = [];
  state.summons = [];
  state.buffs = [];
  state.floatingTexts = [];
  state.popups = [];
  state._laserVisual = null;
  state._lightningVisual = null;
  state._runUpgradeActive = false;
  state._runUpgradeChoices = null;
  state._floorShopActive = false;
  state._buildPanelOpen = false;
  state._buildPanelSelectedKey = '';
  state._statsPanelOpen = false;
  state._statsPanelExpanded = false;
  try { hideFloorShopOverlay(); } catch {}

  state.camera = new Camera(state.canvas);
  state.roomDirector = new RoomDirector(state);
  try { state.roomDirector.forceSetCurrent(0); } catch {}
  state.roomDirector._activeFloorPlan = cloneJsonSafe(cp.savedPlan, null);
  state.roomDirector._lastBiomeKey = String(cp.lastBiomeKey || cp.savedPlan?.biomeKey || '');
  state.roomDirector._waitForParty = false;
  try { if (typeof state.roomDirector._ensureNextSpawned === 'function') state.roomDirector._ensureNextSpawned(); } catch {}
  try { if (typeof state.roomDirector._ensureBridge === 'function') state.roomDirector._ensureBridge(); } catch {}
  try { if (typeof state.roomDirector._applyDynamicBounds === 'function') state.roomDirector._applyDynamicBounds(); } catch {}

  const roomStart = state.roomDirector?.current?.arenaSpec?.anchors?.playerStart;
  if (roomStart && Number.isFinite(Number(roomStart.x)) && Number.isFinite(Number(roomStart.y))) {
    player.x = Number(roomStart.x);
    player.y = Number(roomStart.y);
  }

  state.spawnSystem = new RoomSpawnSystem(state);
  try {
    const ss = state.spawnSystem;
    if (ss && typeof ss.onRoomChanged === 'function') ss.onRoomChanged(state.roomDirector?.current || null);
  } catch {}

  if (showPopup && Array.isArray(state.popups)) {
    const heroName = String(playerData.activeHeroName || getActiveHeroSummary(state.progression)?.name || 'Hero');
    const suffix = canRestoreFullRunSnapshot ? '' : ' • current loadout applied';
    state.popups.push({ text: `Saved run restored • ${heroName} • Floor ${state._hubResumeNextFloor}${suffix}`, time: 2.6 });
  }
  return true;
}
