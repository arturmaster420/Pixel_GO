import assert from 'node:assert/strict';
import { ensureAccountProgression, getActiveHero, createHeroForRace, setActiveHeroId, syncHeroLoadoutToLegacyBridge, applyActiveHeroToLegacyProgression, getHeroCombatProfile } from '../src/core/accountProfile.js';
import { getCardIdForSkill, getStarterCardIdForRace } from '../src/core/cards/cardDefs.js';
import { Player } from '../src/core/player.js';
import { applyHubBuildToPlayer } from '../src/core/hub/hubApplyToPlayer.js';
import { getHubCoreKey, setHubSkillLevel } from '../src/core/hub/hubBuildState.js';
import { buildNetMetaPayload } from '../src/net/metaPayload.js';
import { buildProjectedProgFromMeta } from '../src/core/netPlayerRuntime.js';
import { restoreRunCheckpointIntoState } from '../src/core/checkpointRuntime.js';
import { getCanonicalHeroRuntimeProfile } from '../src/core/skillRuntimeState.js';

function makeProg() {
  const prog = {
    nickname: 'Tester',
    selectedStarterLoadout: 'mecha',
    hubBuild: { coreKey: 'mecha', skills: {}, passives: {} },
    hubGear: { modules: [], relic: '', coreItem: '' },
    gearInventory: {},
    skillMeta: {},
    sp: 99,
    limits: {},
    materials: {},
    essences: {},
    gearParts: {},
  };
  ensureAccountProgression(prog);
  return prog;
}

function configureHeroLoadout(prog, hero = null, skillKeys = ['fireball', 'lightning']) {
  const targetHero = hero || getActiveHero(prog);
  const heroId = String(targetHero?.heroId || getActiveHero(prog)?.heroId || '').trim();
  const race = String(targetHero?.race || 'mecha').trim() || 'mecha';
  targetHero.equippedSkillCards = [
    getStarterCardIdForRace(race),
    ...skillKeys.map((key) => getCardIdForSkill(key)).filter(Boolean),
  ];
  syncHeroLoadoutToLegacyBridge(prog, targetHero);
  if ((getActiveHero(prog)?.heroId || '') === heroId) applyActiveHeroToLegacyProgression(prog);
  return (prog.heroes || []).find((entry) => String(entry?.heroId || '') === heroId) || targetHero;
}

function testCanonicalCombatProfile() {
  const prog = makeProg();
  configureHeroLoadout(prog);
  const profile = getHeroCombatProfile(prog);
  const runtime = getCanonicalHeroRuntimeProfile(profile, 'mecha');
  assert(runtime.runtimeSkillKeys.includes('bullets'), 'core skill missing from canonical runtime');
  assert(runtime.runtimeSkillKeys.includes('fireball'), 'fireball missing from canonical runtime');
  assert(runtime.runtimeSkillKeys.includes('lightning'), 'lightning missing from canonical runtime');
}

function testProgressionProjectionStaysCanonical() {
  const prog = makeProg();
  configureHeroLoadout(prog);
  assert.equal(prog.activeHeroId, getActiveHero(prog)?.heroId, 'progression activeHeroId drifted from hero roster');
  assert.equal(prog.activeHeroRace, getActiveHero(prog)?.race, 'progression activeHeroRace drifted from active hero race');
  assert(prog.activeHeroRuntime?.runtimeSkillKeys?.includes('fireball'), 'progression activeHeroRuntime lost fireball');
  assert(prog.activeHeroLoadoutSummary?.skills?.some((entry) => entry?.key === 'fireball'), 'progression activeHeroLoadoutSummary lost fireball');
  assert.equal(Number(prog.heroCombatSummary?.totalCardPower || 0), Number(prog.heroCombatProfile?.summary?.totalCardPower || 0), 'hero combat summary drifted from combat profile');
}

function testHeroSwitchReprojectsCanonicalRuntime() {
  const prog = makeProg();
  const hero1 = configureHeroLoadout(prog);
  const hero2 = createHeroForRace(prog, 'light', { name: 'Lux' });
  assert(hero2, 'failed to create second hero for switch regression');
  configureHeroLoadout(prog, hero2, ['holyNova', 'sanctuary']);
  const switched = setActiveHeroId(prog, hero2.heroId);
  assert.equal(switched, true, 'setActiveHeroId should switch to second hero');
  assert.equal(prog.activeHeroId, hero2.heroId, 'progression activeHeroId did not switch');
  assert(prog.activeHeroRuntime?.runtimeSkillKeys?.includes('holyNova'), 'switched activeHeroRuntime lost holyNova');
  assert(!prog.activeHeroRuntime?.runtimeSkillKeys?.includes('fireball'), 'switched activeHeroRuntime kept stale fireball from previous hero');
  const player = new Player({ x: 0, y: 0 }, 1);
  applyHubBuildToPlayer(player, prog);
  assert((player.runSkills.holyNova | 0) > 0, 'switched runtime lost holyNova on player');
  assert((player.runSkills.sanctuary | 0) > 0, 'switched runtime lost sanctuary on player');
  assert.equal(player.runSkills.fireball | 0, 0, 'previous hero fireball leaked after hero switch');
  const meta = buildNetMetaPayload(prog);
  assert.equal(String(meta?.activeHeroId || ''), hero2.heroId, 'net meta activeHeroId stale after hero switch');
  assert(meta?.activeHeroRuntime?.runtimeSkillKeys?.includes('holyNova'), 'net meta lost switched runtime holyNova');
  assert(!meta?.activeHeroRuntime?.runtimeSkillKeys?.includes('fireball'), 'net meta kept stale runtime from previous hero');
  assert.equal(String(meta?.activeHeroRuntime?.signature || ''), String(prog?.activeHeroRuntime?.signature || ''), 'net meta signature drifted from progression runtime');
}

function testApplyHubBuildUsesCanonicalRuntime() {
  const prog = makeProg();
  configureHeroLoadout(prog);
  prog.hubBuild.skills = { iceWall: 6, blackhole: 4 };
  const player = new Player({ x: 0, y: 0 }, 1);
  applyHubBuildToPlayer(player, prog);
  assert((player.runSkills.fireball | 0) > 0, 'equipped fireball did not reach runtime');
  assert((player.runSkills.lightning | 0) > 0, 'equipped lightning did not reach runtime');
  assert.equal(player.runSkills.iceWall | 0, 0, 'stale legacy iceWall leaked into runtime');
  assert.equal(player.runSkills.blackhole | 0, 0, 'stale legacy blackhole leaked into runtime');
}

function testDamageTypeMultsDoNotStack() {
  const prog = makeProg();
  configureHeroLoadout(prog);
  const player = new Player({ x: 0, y: 0 }, 1);
  applyHubBuildToPlayer(player, prog);
  const first = { ...player.runDamageTypeMults };
  applyHubBuildToPlayer(player, prog);
  const second = { ...player.runDamageTypeMults };
  assert.deepEqual(second, first, 'damage type multipliers stacked on repeated applyHubBuildToPlayer');
}

function testNetMetaCarriesRuntimeWithoutExplicitArrays() {
  const prog = makeProg();
  configureHeroLoadout(prog);
  const broken = JSON.parse(JSON.stringify(prog.heroCombatProfile || {}));
  delete broken.runtimeSkillKeys;
  delete broken.runtimePassiveKeys;
  prog.heroCombatProfile = broken;
  const meta = buildNetMetaPayload(prog);
  assert(meta?.activeHeroRuntime?.runtimeSkillKeys?.includes('fireball'), 'meta payload lost fireball runtime');
  assert(meta?.activeHeroRuntime?.runtimeSkillKeys?.includes('lightning'), 'meta payload lost lightning runtime');
}

function testProjectedProgFromMetaPreservesRuntime() {
  const prog = makeProg();
  configureHeroLoadout(prog);
  const meta = buildNetMetaPayload(prog);
  const projected = buildProjectedProgFromMeta({}, meta, meta.skillMeta, meta.selectedStarterLoadout);
  const player = new Player({ x: 0, y: 0 }, 1);
  applyHubBuildToPlayer(player, projected);
  assert((player.runSkills.fireball | 0) > 0, 'projected meta prog lost fireball');
  assert((player.runSkills.lightning | 0) > 0, 'projected meta prog lost lightning');
}

function testEnsureAccountDoesNotReanimateStaleLegacy() {
  const prog = makeProg();
  const hero = configureHeroLoadout(prog);
  const before = [...hero.equippedSkillCards];
  prog.hubBuild.skills = { iceWall: 6, blackhole: 4 };
  ensureAccountProgression(prog);
  assert.deepEqual(hero.equippedSkillCards, before, 'ensureAccountProgression reanimated stale legacy hubBuild into hero loadout');
}


function installLocalStorageStub() {
  if (typeof globalThis.localStorage !== 'undefined') return;
  const store = new Map();
  globalThis.localStorage = {
    getItem(key) { return store.has(key) ? String(store.get(key)) : null; },
    setItem(key, value) { store.set(String(key), String(value)); },
    removeItem(key) { store.delete(String(key)); },
  };
}

function testCheckpointRestoreRespectsChangedLoadout() {
  installLocalStorageStub();
  const prog = makeProg();
  const hero = configureHeroLoadout(prog, null, ['fireball']);
  const checkpoint = {
    version: 4,
    savedAt: Date.now(),
    nextFloor: 2,
    lastBiomeKey: 'fire',
    savedPlan: { floorNumber: 2, biomeKey: 'fire', rooms: [{ arenaSpec: { anchors: { playerStart: { x: 0, y: 0 } } } }] },
    flags: {},
    runScore: 0,
    deathContinueCount: 0,
    player: {
      activeHeroId: hero.heroId,
      activeHeroName: hero.name,
      activeHeroRace: hero.race,
      level: 3,
      xp: 10,
      skillPoints: 5,
      hp: 90,
      nickname: 'Tester',
      avatarIndex: 0,
      auraId: 0,
      selectedStarterLoadout: 'mecha',
      hubBuild: { coreKey: 'mecha', skills: { iceWall: 3 }, passives: {} },
      hubGear: { modules: [], relic: '', coreItem: '' },
      gearInventory: {},
      heroCombatProfile: prog.heroCombatProfile,
      equippedSkillCards: [getStarterCardIdForRace('mecha'), getCardIdForSkill('iceWall')],
      equippedPassiveCards: [],
      checkpointLoadout: { heroId: hero.heroId, equippedSkillCards: [getStarterCardIdForRace('mecha'), getCardIdForSkill('iceWall')], equippedPassiveCards: [] },
      spTotal: 20,
      runSkills: { iceWall: 3 },
      runPassives: {},
      runSkillStages: {},
      runEvolutions: {},
    },
  };
  const state = {
    progression: prog,
    canvas: { width: 1280, height: 720 },
    enemies: [], projectiles: [], rockets: [], iceWalls: [], blackholes: [], healPulses: [], _explosions: [], xpOrbs: [], summons: [], buffs: [], floatingTexts: [], popups: [], flags: {},
  };
  const ok = restoreRunCheckpointIntoState(state, checkpoint);
  assert.equal(ok, true, 'checkpoint restore should succeed for changed-loadout regression');
  assert.deepEqual(getActiveHero(prog).equippedSkillCards, [getStarterCardIdForRace('mecha'), getCardIdForSkill('fireball')], 'checkpoint restore overwrote current hero cards on loadout mismatch');
  assert.equal(state.player.runSkills.fireball | 0, 1, 'checkpoint restore lost current canonical fireball runtime');
  assert.equal(state.player.runSkills.iceWall | 0, 0, 'checkpoint restore leaked stale checkpoint iceWall into runtime after loadout change');
  assert.deepEqual(prog.hubBuild.skills, { fireball: 1 }, 'checkpoint restore polluted progression hubBuild with stale checkpoint skills');
  assert.equal(state.player.skillPoints | 0, 5, 'checkpoint restore should preserve unspent snapshot skill points on mismatch');
}

function testExplicitEmptyRuntimeDoesNotFallbackToLegacyBuild() {
  const prog = makeProg();
  const hero = getActiveHero(prog);
  hero.equippedSkillCards = [];
  hero.equippedPassiveCards = [];
  syncHeroLoadoutToLegacyBridge(prog, hero);
  applyActiveHeroToLegacyProgression(prog);
  prog.hubBuild.skills = { iceWall: 6, blackhole: 4 };
  prog.hubBuild.passives = { critChance: 3, lifeSteal: 2 };
  const player = new Player({ x: 0, y: 0 }, 1);
  applyHubBuildToPlayer(player, prog);
  const activeSkills = Object.entries(player.runSkills || {}).filter(([, lv]) => (lv | 0) > 0).map(([key]) => key);
  assert.deepEqual(activeSkills, [], 'explicit empty hero runtime fell back to stale hubBuild skills');
  assert.equal(player.runPassives.critChance | 0, 0, 'explicit empty hero runtime fell back to stale hubBuild critChance');
  assert.equal(player.runPassives.lifeSteal | 0, 0, 'explicit empty hero runtime fell back to stale hubBuild lifeSteal');
}

function testProjectedMetaPrefersCanonicalHeroRace() {
  const prog = makeProg();
  const hero2 = createHeroForRace(prog, 'light', { name: 'Lux' });
  configureHeroLoadout(prog, hero2, ['holyNova', 'sanctuary']);
  const switched = setActiveHeroId(prog, hero2.heroId);
  assert.equal(switched, true, 'failed to switch to light hero for meta race regression');
  const meta = buildNetMetaPayload(prog);
  meta.selectedStarterLoadout = 'mecha';
  const projected = buildProjectedProgFromMeta({}, meta, meta.skillMeta, 'mecha');
  assert.equal(projected.activeHeroRace, 'light', 'projected prog lost canonical active hero race');
  assert.equal(getHubCoreKey(projected), 'light', 'projected prog kept stale selectedStarterLoadout instead of hero race');
  const player = new Player({ x: 0, y: 0 }, 1);
  applyHubBuildToPlayer(player, projected);
  assert.equal(player.activeHeroRace, 'light', 'player runtime lost canonical hero race from projected meta');
  assert((player.runSkills.holyNova | 0) > 0, 'projected meta runtime lost holyNova after stale selectedStarterLoadout override');
}

function testSetHubSkillLevelDoesNotOverwriteHeroCards() {
  const prog = makeProg();
  const hero = configureHeroLoadout(prog);
  const before = [...hero.equippedSkillCards];
  prog.skillMeta['skill:iceWall'] = 3;
  const ok = setHubSkillLevel(prog, 'iceWall', 1);
  assert.equal(ok, true, 'setHubSkillLevel should still mutate legacy mirror state');
  assert.deepEqual(hero.equippedSkillCards, before, 'legacy hub skill edit overwrote canonical hero cards');
  const player = new Player({ x: 0, y: 0 }, 1);
  applyHubBuildToPlayer(player, prog);
  assert.equal(player.runSkills.iceWall | 0, 0, 'legacy hub skill edit leaked into runtime over hero cards');
  assert((player.runSkills.fireball | 0) > 0, 'canonical hero runtime was lost after legacy hub skill edit');
}

function main() {
  testCanonicalCombatProfile();
  testProgressionProjectionStaysCanonical();
  testHeroSwitchReprojectsCanonicalRuntime();
  testApplyHubBuildUsesCanonicalRuntime();
  testDamageTypeMultsDoNotStack();
  testNetMetaCarriesRuntimeWithoutExplicitArrays();
  testProjectedProgFromMetaPreservesRuntime();
  testEnsureAccountDoesNotReanimateStaleLegacy();
  testCheckpointRestoreRespectsChangedLoadout();
  testExplicitEmptyRuntimeDoesNotFallbackToLegacyBuild();
  testProjectedMetaPrefersCanonicalHeroRace();
  testSetHubSkillLevelDoesNotOverwriteHeroCards();
  console.log('skill-system-regression: OK');
}

main();
