import { createBasicMob } from '../enemies/mobBasic.js';
import { createEliteMob } from '../enemies/mobElite.js';
import { createRoamingBoss } from '../enemies/roamingBoss.js';
import { createBiomeMob, createBiomeEliteMob } from '../enemies/biomeMobs.js';
import { randomPointInRoomWalkable } from './floorCollision.js';
import { resolveSocketPoint } from './roomRoute.js';

function clamp(n, a, b) {
  return n < a ? a : (n > b ? b : n);
}

function clamp01(n) {
  return n < 0 ? 0 : (n > 1 ? 1 : n);
}

function distance2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function distanceToSegmentSq(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 <= 1e-6) return distance2(px, py, ax, ay);
  const t = clamp(((px - ax) * abx + (py - ay) * aby) / len2, 0, 1);
  const sx = ax + abx * t;
  const sy = ay + aby * t;
  return distance2(px, py, sx, sy);
}

function weightedPick(weights = {}, fallback = 'herdPassive') {
  const entries = Object.entries(weights).filter(([, v]) => (Number(v) || 0) > 0);
  if (!entries.length) return fallback;
  const total = entries.reduce((sum, [, v]) => sum + Number(v || 0), 0);
  let roll = Math.random() * total;
  for (const [key, weight] of entries) {
    roll -= Number(weight || 0);
    if (roll <= 0) return key;
  }
  return entries[0]?.[0] || fallback;
}

function getPlayers(state) {
  const arr = (state?.players && state.players.length) ? state.players : (state?.player ? [state.player] : []);
  return arr.filter((p) => p && (p.hp || 0) > 0);
}

function getPartyCount(state) {
  const ps = (state?.players && state.players.length) ? state.players : (state?.player ? [state.player] : []);
  const ids = new Set(ps.filter(Boolean).map((p) => String(p.id || 'local')));
  return Math.max(1, ids.size || ps.length || 1);
}

function getPartyScale(state) {
  const extra = Math.max(0, getPartyCount(state) - 1);
  return 1 + extra * 0.8;
}

function getEncounterProfile(room) {
  const encounter = String(room?.encounterType || '').toLowerCase();
  switch (encounter) {
    case 'warmup':
      return {
        encounterType: 'warmup',
        quotaMul: 0.72,
        aliveAdd: -1,
        waveDelta: -1,
        eliteChanceMul: 0.45,
        spawnIntervalMul: 1.08,
        spawnBatchCap: 2,
        minDistMul: 0.92,
        biomeChance: 0.40,
        forcedElites: 0,
      };
    case 'swarm':
      return {
        encounterType: 'swarm',
        quotaMul: 1.34,
        aliveAdd: 2,
        waveDelta: 1,
        eliteChanceMul: 0.65,
        spawnIntervalMul: 0.88,
        spawnBatchCap: 5,
        minDistMul: 0.86,
        biomeChance: 0.62,
        forcedElites: 0,
      };
    case 'elite':
      return {
        encounterType: 'elite',
        quotaMul: 0.78,
        aliveAdd: -2,
        waveDelta: 0,
        eliteChanceMul: 2.8,
        spawnIntervalMul: 1.06,
        spawnBatchCap: 2,
        minDistMul: 1.08,
        biomeChance: 0.74,
        forcedElites: 1,
      };
    case 'boss':
      return {
        encounterType: 'boss',
        quotaMul: 1.0,
        aliveAdd: 1,
        waveDelta: 0,
        eliteChanceMul: 1.0,
        spawnIntervalMul: 1.0,
        spawnBatchCap: 3,
        minDistMul: 1.0,
        biomeChance: 0.62,
        forcedElites: 0,
      };
    default:
      return {
        encounterType: 'gauntlet',
        quotaMul: 1.08,
        aliveAdd: 0,
        waveDelta: 1,
        eliteChanceMul: 1.15,
        spawnIntervalMul: 0.95,
        spawnBatchCap: 4,
        minDistMul: 1.0,
        biomeChance: 0.58,
        forcedElites: 0,
      };
  }
}

function getRoomRole(room) {
  return String(room?.templateRole || room?.arenaSpec?.rules?.templateRole || '').toLowerCase();
}

function getRoleEncounterProfile(role = '') {
  switch (String(role || '').toLowerCase()) {
    case 'vestibule':
      return {
        quotaMul: 0.88,
        aliveAdd: -1,
        waveDelta: -1,
        eliteChanceMul: 0.78,
        spawnIntervalMul: 1.06,
        spawnBatchAdd: -1,
        minDistMul: 0.96,
        biomeChanceAdd: -0.04,
        forcedElites: 0,
        waveRestMul: 0.92,
        scoreWeights: { entryFar: 0.45, exitFar: 0.72, flank: 0.12, centerNear: 0.12, centerFar: 0.10, pressureNear: 0.0, nodeNear: 0.0 },
        aiWeights: { herdPassive: 0.72, patrol: 0.18, camp: 0.10 },
        aggroRangeAdd: 0,
        hpMul: 0.98,
        speedMul: 1.0,
        damageMul: 1.0,
        campRadiusMul: 0.92,
        patrolRadiusMul: 0.96,
        herdRadiusMul: 1.0,
        spawnJitter: 36,
      };
    case 'hall':
      return {
        quotaMul: 1.06,
        aliveAdd: 1,
        waveDelta: 0,
        eliteChanceMul: 1.0,
        spawnIntervalMul: 0.96,
        spawnBatchAdd: 0,
        minDistMul: 1.02,
        biomeChanceAdd: 0.02,
        forcedElites: 0,
        waveRestMul: 0.96,
        scoreWeights: { entryFar: 0.60, exitFar: 0.95, flank: 0.18, centerNear: 0.12, centerFar: 0.18, pressureNear: 0.08, nodeNear: 0.0 },
        aiWeights: { herdPassive: 0.40, patrol: 0.40, camp: 0.20 },
        aggroRangeAdd: 16,
        hpMul: 1.02,
        speedMul: 1.0,
        damageMul: 1.0,
        campRadiusMul: 1.0,
        patrolRadiusMul: 1.05,
        herdRadiusMul: 1.04,
        spawnJitter: 34,
      };
    case 'split':
      return {
        quotaMul: 1.02,
        aliveAdd: 1,
        waveDelta: 0,
        eliteChanceMul: 1.08,
        spawnIntervalMul: 0.95,
        spawnBatchAdd: 0,
        minDistMul: 1.04,
        biomeChanceAdd: 0.02,
        forcedElites: 0,
        waveRestMul: 0.95,
        scoreWeights: { entryFar: 0.54, exitFar: 0.62, flank: 1.08, centerNear: 0.02, centerFar: 0.30, pressureNear: 0.14, nodeNear: 0.10 },
        aiWeights: { herdPassive: 0.34, patrol: 0.42, camp: 0.24 },
        aggroRangeAdd: 10,
        hpMul: 1.0,
        speedMul: 1.03,
        damageMul: 1.0,
        campRadiusMul: 1.0,
        patrolRadiusMul: 1.10,
        herdRadiusMul: 1.10,
        spawnJitter: 34,
      };
    case 'pocket':
      return {
        quotaMul: 0.92,
        aliveAdd: -1,
        waveDelta: 0,
        eliteChanceMul: 1.22,
        spawnIntervalMul: 1.00,
        spawnBatchAdd: -1,
        minDistMul: 1.02,
        biomeChanceAdd: 0.04,
        forcedElites: 0,
        waveRestMul: 1.00,
        scoreWeights: { entryFar: 0.36, exitFar: 0.42, flank: 1.12, centerNear: 0.0, centerFar: 0.48, pressureNear: 0.30, nodeNear: 0.36 },
        aiWeights: { herdPassive: 0.18, patrol: 0.20, camp: 0.62 },
        aggroRangeAdd: -24,
        hpMul: 1.03,
        speedMul: 1.02,
        damageMul: 1.03,
        campRadiusMul: 0.86,
        patrolRadiusMul: 0.92,
        herdRadiusMul: 0.94,
        spawnJitter: 32,
      };
    case 'ring':
      return {
        quotaMul: 1.08,
        aliveAdd: 1,
        waveDelta: 0,
        eliteChanceMul: 0.96,
        spawnIntervalMul: 0.92,
        spawnBatchAdd: 0,
        minDistMul: 1.08,
        biomeChanceAdd: 0.04,
        forcedElites: 0,
        waveRestMul: 0.94,
        scoreWeights: { entryFar: 0.42, exitFar: 0.44, flank: 0.62, centerNear: -0.12, centerFar: 1.22, pressureNear: 0.22, nodeNear: 0.14 },
        aiWeights: { herdPassive: 0.16, patrol: 0.70, camp: 0.14 },
        aggroRangeAdd: 22,
        hpMul: 1.0,
        speedMul: 1.08,
        damageMul: 1.0,
        campRadiusMul: 0.94,
        patrolRadiusMul: 1.18,
        herdRadiusMul: 1.08,
        spawnJitter: 30,
      };
    case 'arena':
      return {
        quotaMul: 1.14,
        aliveAdd: 2,
        waveDelta: 0,
        eliteChanceMul: 1.0,
        spawnIntervalMul: 0.92,
        spawnBatchAdd: 1,
        minDistMul: 1.00,
        biomeChanceAdd: 0.03,
        forcedElites: 0,
        waveRestMul: 0.94,
        scoreWeights: { entryFar: 0.56, exitFar: 0.70, flank: 0.34, centerNear: 0.34, centerFar: 0.44, pressureNear: 0.20, nodeNear: 0.10 },
        aiWeights: { herdPassive: 0.30, patrol: 0.34, camp: 0.36 },
        aggroRangeAdd: 10,
        hpMul: 1.06,
        speedMul: 1.02,
        damageMul: 1.02,
        campRadiusMul: 1.02,
        patrolRadiusMul: 1.04,
        herdRadiusMul: 1.04,
        spawnJitter: 34,
      };
    case 'shrine':
      return {
        quotaMul: 0.96,
        aliveAdd: -1,
        waveDelta: 0,
        eliteChanceMul: 1.28,
        spawnIntervalMul: 1.02,
        spawnBatchAdd: -1,
        minDistMul: 1.04,
        biomeChanceAdd: 0.08,
        forcedElites: 1,
        waveRestMul: 0.98,
        scoreWeights: { entryFar: 0.36, exitFar: 0.40, flank: 0.72, centerNear: 0.18, centerFar: 0.40, pressureNear: 0.82, nodeNear: 1.06 },
        aiWeights: { herdPassive: 0.12, patrol: 0.16, camp: 0.72 },
        aggroRangeAdd: -10,
        hpMul: 1.08,
        speedMul: 0.99,
        damageMul: 1.04,
        campRadiusMul: 0.78,
        patrolRadiusMul: 0.92,
        herdRadiusMul: 0.90,
        spawnJitter: 28,
      };
    case 'bridge':
      return {
        quotaMul: 0.94,
        aliveAdd: -1,
        waveDelta: 0,
        eliteChanceMul: 1.10,
        spawnIntervalMul: 0.90,
        spawnBatchAdd: -1,
        minDistMul: 0.96,
        biomeChanceAdd: 0.04,
        forcedElites: 0,
        waveRestMul: 0.88,
        scoreWeights: { entryFar: 0.72, exitFar: 1.08, flank: -0.12, centerNear: 0.08, centerFar: 0.16, pressureNear: 0.08, nodeNear: 0.0 },
        aiWeights: { herdPassive: 0.18, patrol: 0.56, camp: 0.26 },
        aggroRangeAdd: 14,
        hpMul: 0.98,
        speedMul: 1.05,
        damageMul: 1.02,
        campRadiusMul: 0.82,
        patrolRadiusMul: 1.00,
        herdRadiusMul: 0.94,
        spawnJitter: 24,
      };
    case 'crucible':
      return {
        quotaMul: 1.06,
        aliveAdd: 0,
        waveDelta: 0,
        eliteChanceMul: 1.42,
        spawnIntervalMul: 0.86,
        spawnBatchAdd: 0,
        minDistMul: 0.98,
        biomeChanceAdd: 0.08,
        forcedElites: 1,
        waveRestMul: 0.90,
        scoreWeights: { entryFar: 0.54, exitFar: 0.56, flank: 0.20, centerNear: 0.86, centerFar: 0.06, pressureNear: 1.12, nodeNear: 0.44 },
        aiWeights: { herdPassive: 0.18, patrol: 0.18, camp: 0.64 },
        aggroRangeAdd: 10,
        hpMul: 1.08,
        speedMul: 1.01,
        damageMul: 1.06,
        campRadiusMul: 0.74,
        patrolRadiusMul: 0.88,
        herdRadiusMul: 0.88,
        spawnJitter: 24,
      };
    case 'crown':
      return {
        quotaMul: 1.08,
        aliveAdd: 1,
        waveDelta: 0,
        eliteChanceMul: 1.10,
        spawnIntervalMul: 0.92,
        spawnBatchAdd: 0,
        minDistMul: 1.00,
        biomeChanceAdd: 0.08,
        forcedElites: 1,
        waveRestMul: 1.00,
        scoreWeights: { entryFar: 0.48, exitFar: 0.56, flank: 0.56, centerNear: 0.48, centerFar: 0.54, pressureNear: 0.90, nodeNear: 0.52 },
        aiWeights: { herdPassive: 0.18, patrol: 0.28, camp: 0.54 },
        aggroRangeAdd: 12,
        hpMul: 1.08,
        speedMul: 1.02,
        damageMul: 1.06,
        campRadiusMul: 0.82,
        patrolRadiusMul: 0.96,
        herdRadiusMul: 0.92,
        spawnJitter: 26,
      };
    default:
      return {
        quotaMul: 1,
        aliveAdd: 0,
        waveDelta: 0,
        eliteChanceMul: 1,
        spawnIntervalMul: 1,
        spawnBatchAdd: 0,
        minDistMul: 1,
        biomeChanceAdd: 0,
        forcedElites: 0,
        waveRestMul: 1,
        scoreWeights: { entryFar: 0.45, exitFar: 0.55, flank: 0.24, centerNear: 0.10, centerFar: 0.18, pressureNear: 0.12, nodeNear: 0.06 },
        aiWeights: { herdPassive: 0.34, patrol: 0.33, camp: 0.33 },
        aggroRangeAdd: 0,
        hpMul: 1,
        speedMul: 1,
        damageMul: 1,
        campRadiusMul: 1,
        patrolRadiusMul: 1,
        herdRadiusMul: 1,
        spawnJitter: 36,
      };
  }
}

function getBiomeEncounterProfile(biomeKey = '') {
  switch (String(biomeKey || '').toLowerCase()) {
    case 'electric':
      return {
        quotaMul: 1.00,
        aliveAdd: 0,
        waveDelta: 0,
        eliteChanceMul: 1.04,
        spawnIntervalMul: 0.90,
        spawnBatchAdd: 0,
        minDistMul: 1.06,
        biomeChanceAdd: 0.18,
        forcedElites: 0,
        waveRestMul: 0.92,
        scoreWeights: { entryFar: 0.08, exitFar: 0.08, flank: 0.30, centerNear: -0.04, centerFar: 0.34, pressureNear: 0.18, nodeNear: 0.10 },
        aiWeights: { herdPassive: 0.10, patrol: 0.74, camp: 0.16 },
        aggroRangeAdd: 22,
        hpMul: 1.00,
        speedMul: 1.08,
        damageMul: 1.02,
        campRadiusMul: 0.92,
        patrolRadiusMul: 1.12,
        herdRadiusMul: 1.06,
        spawnJitter: 30,
      };
    case 'fire':
      return {
        quotaMul: 1.02,
        aliveAdd: 0,
        waveDelta: 0,
        eliteChanceMul: 1.16,
        spawnIntervalMul: 0.95,
        spawnBatchAdd: 0,
        minDistMul: 0.98,
        biomeChanceAdd: 0.14,
        forcedElites: 0,
        waveRestMul: 0.96,
        scoreWeights: { entryFar: 0.02, exitFar: 0.02, flank: -0.04, centerNear: 0.18, centerFar: 0.04, pressureNear: 0.64, nodeNear: 0.18 },
        aiWeights: { herdPassive: 0.18, patrol: 0.18, camp: 0.64 },
        aggroRangeAdd: 6,
        hpMul: 1.06,
        speedMul: 1.01,
        damageMul: 1.08,
        campRadiusMul: 0.82,
        patrolRadiusMul: 0.94,
        herdRadiusMul: 0.94,
        spawnJitter: 30,
      };
    case 'ice':
      return {
        quotaMul: 0.98,
        aliveAdd: 0,
        waveDelta: 0,
        eliteChanceMul: 1.02,
        spawnIntervalMul: 1.04,
        spawnBatchAdd: 0,
        minDistMul: 1.16,
        biomeChanceAdd: 0.12,
        forcedElites: 0,
        waveRestMul: 1.04,
        scoreWeights: { entryFar: 0.18, exitFar: 0.18, flank: -0.08, centerNear: -0.10, centerFar: 0.48, pressureNear: 0.16, nodeNear: 0.12 },
        aiWeights: { herdPassive: 0.10, patrol: 0.74, camp: 0.16 },
        aggroRangeAdd: 44,
        hpMul: 1.00,
        speedMul: 0.98,
        damageMul: 1.02,
        campRadiusMul: 0.94,
        patrolRadiusMul: 1.20,
        herdRadiusMul: 1.08,
        spawnJitter: 28,
      };
    case 'dark':
      return {
        quotaMul: 1.00,
        aliveAdd: 0,
        waveDelta: 0,
        eliteChanceMul: 1.12,
        spawnIntervalMul: 0.96,
        spawnBatchAdd: 0,
        minDistMul: 0.94,
        biomeChanceAdd: 0.16,
        forcedElites: 0,
        waveRestMul: 0.95,
        scoreWeights: { entryFar: 0.04, exitFar: 0.10, flank: 0.72, centerNear: -0.16, centerFar: 0.24, pressureNear: 0.28, nodeNear: 0.20 },
        aiWeights: { herdPassive: 0.34, patrol: 0.18, camp: 0.48 },
        aggroRangeAdd: -36,
        hpMul: 0.98,
        speedMul: 1.04,
        damageMul: 1.04,
        campRadiusMul: 0.76,
        patrolRadiusMul: 0.90,
        herdRadiusMul: 0.86,
        spawnJitter: 24,
      };
    case 'light':
      return {
        quotaMul: 1.00,
        aliveAdd: 0,
        waveDelta: 0,
        eliteChanceMul: 1.08,
        spawnIntervalMul: 1.02,
        spawnBatchAdd: 0,
        minDistMul: 1.06,
        biomeChanceAdd: 0.16,
        forcedElites: 0,
        waveRestMul: 1.02,
        scoreWeights: { entryFar: 0.00, exitFar: 0.04, flank: -0.06, centerNear: 0.28, centerFar: 0.14, pressureNear: 0.68, nodeNear: 0.92 },
        aiWeights: { herdPassive: 0.10, patrol: 0.16, camp: 0.74 },
        aggroRangeAdd: 10,
        hpMul: 1.04,
        speedMul: 0.99,
        damageMul: 1.02,
        campRadiusMul: 0.74,
        patrolRadiusMul: 0.90,
        herdRadiusMul: 0.90,
        spawnJitter: 26,
      };
    default:
      return {
        quotaMul: 1,
        aliveAdd: 0,
        waveDelta: 0,
        eliteChanceMul: 1,
        spawnIntervalMul: 1,
        spawnBatchAdd: 0,
        minDistMul: 1,
        biomeChanceAdd: 0,
        forcedElites: 0,
        waveRestMul: 1,
        scoreWeights: { entryFar: 0, exitFar: 0, flank: 0, centerNear: 0, centerFar: 0, pressureNear: 0, nodeNear: 0 },
        aiWeights: { herdPassive: 0.34, patrol: 0.33, camp: 0.33 },
        aggroRangeAdd: 0,
        hpMul: 1,
        speedMul: 1,
        damageMul: 1,
        campRadiusMul: 1,
        patrolRadiusMul: 1,
        herdRadiusMul: 1,
        spawnJitter: 36,
      };
  }
}

function mergeEncounterProfile(base, roleProfile, biomeProfile) {
  const bw = base || {};
  const rw = roleProfile || {};
  const tw = biomeProfile || {};
  const scoreWeights = {};
  for (const key of ['entryFar', 'exitFar', 'flank', 'centerNear', 'centerFar', 'pressureNear', 'nodeNear']) {
    scoreWeights[key] = Number(rw?.scoreWeights?.[key] || 0) + Number(tw?.scoreWeights?.[key] || 0);
  }
  const aiWeights = {};
  for (const key of ['herdPassive', 'patrol', 'camp']) {
    aiWeights[key] = Math.max(0.01, Number(rw?.aiWeights?.[key] || 0) + Number(tw?.aiWeights?.[key] || 0));
  }
  return {
    encounterType: bw.encounterType || 'gauntlet',
    quotaMul: (bw.quotaMul || 1) * (rw.quotaMul || 1) * (tw.quotaMul || 1),
    aliveAdd: (bw.aliveAdd || 0) + (rw.aliveAdd || 0) + (tw.aliveAdd || 0),
    waveDelta: (bw.waveDelta || 0) + (rw.waveDelta || 0) + (tw.waveDelta || 0),
    eliteChanceMul: (bw.eliteChanceMul || 1) * (rw.eliteChanceMul || 1) * (tw.eliteChanceMul || 1),
    spawnIntervalMul: (bw.spawnIntervalMul || 1) * (rw.spawnIntervalMul || 1) * (tw.spawnIntervalMul || 1),
    spawnBatchCap: clamp((bw.spawnBatchCap || 4) + (rw.spawnBatchAdd || 0) + (tw.spawnBatchAdd || 0), 1, 6),
    minDistMul: (bw.minDistMul || 1) * (rw.minDistMul || 1) * (tw.minDistMul || 1),
    biomeChance: clamp((bw.biomeChance || 0.55) + (rw.biomeChanceAdd || 0) + (tw.biomeChanceAdd || 0), 0.16, 0.96),
    forcedElites: Math.max(0, (bw.forcedElites || 0) + (rw.forcedElites || 0) + (tw.forcedElites || 0)),
    waveRestMul: (rw.waveRestMul || 1) * (tw.waveRestMul || 1),
    scoreWeights,
    aiWeights,
    aggroRangeAdd: (rw.aggroRangeAdd || 0) + (tw.aggroRangeAdd || 0),
    hpMul: (rw.hpMul || 1) * (tw.hpMul || 1),
    speedMul: (rw.speedMul || 1) * (tw.speedMul || 1),
    damageMul: (rw.damageMul || 1) * (tw.damageMul || 1),
    campRadiusMul: (rw.campRadiusMul || 1) * (tw.campRadiusMul || 1),
    patrolRadiusMul: (rw.patrolRadiusMul || 1) * (tw.patrolRadiusMul || 1),
    herdRadiusMul: (rw.herdRadiusMul || 1) * (tw.herdRadiusMul || 1),
    spawnJitter: clamp(Math.round(((rw.spawnJitter || 36) + (tw.spawnJitter || 36)) * 0.5), 20, 42),
  };
}

function roomSocketPoint(room, socket = '', fallbackX = 0, fallbackY = 0) {
  if (room?.bounds) {
    return resolveSocketPoint(room.bounds, room.centerX, room.centerY, socket || 'S', { outside: -22, offsetScale: 0.22 });
  }
  return { x: fallbackX, y: fallbackY };
}

function collectUniquePoints(list = [], kind = '') {
  const out = [];
  const seen = new Set();
  for (const p of list) {
    if (!p || !Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.y))) continue;
    const x = Math.round(Number(p.x));
    const y = Math.round(Number(p.y));
    const pointKind = String(p.kind || kind || 'spawn');
    const key = `${pointKind}:${x}:${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      x: Number(p.x),
      y: Number(p.y),
      kind: pointKind,
      tag: String(p.tag || p.kind || p.socket || p.side || kind),
    });
  }
  return out;
}

function makeSpawnContext(room) {
  const anchors = room?.arenaSpec?.anchors || {};
  const hazards = Array.isArray(anchors.hazardAnchors) ? anchors.hazardAnchors : [];
  const gates = Array.isArray(anchors.gateAnchors) ? anchors.gateAnchors : [];
  const spawns = Array.isArray(anchors.spawnAnchors) ? anchors.spawnAnchors : [];
  const bossArena = room?.arenaSpec?.bossArena || {};
  const entryPoint = roomSocketPoint(room, room?.entrySocket || 'S', room?.centerX || 0, (room?.centerY || 0) + (room?.side || 0) * 0.18);
  const exitPoint = roomSocketPoint(room, room?.exitSocket || room?.portalSocket || 'N', room?.centerX || 0, (room?.centerY || 0) - (room?.side || 0) * 0.18);
  const center = { x: Number(room?.centerX) || 0, y: Number(room?.centerY) || 0 };
  const pressurePoints = collectUniquePoints([
    ...hazards,
    ...(Array.isArray(bossArena.pressureZones) ? bossArena.pressureZones : []),
  ], 'pressure');
  const nodePoints = collectUniquePoints([
    ...(Array.isArray(bossArena.phaseNodes) ? bossArena.phaseNodes : []),
    ...(Array.isArray(bossArena.safeLanes) ? bossArena.safeLanes : []),
    ...hazards,
  ], 'node');
  const candidates = [
    ...collectUniquePoints(spawns, 'spawn'),
    ...collectUniquePoints(gates, 'gate'),
    ...pressurePoints,
    ...nodePoints,
  ];
  return {
    entryPoint,
    exitPoint,
    center,
    pressurePoints,
    nodePoints,
    candidates: collectUniquePoints(candidates),
  };
}

function nearestDistanceScore(x, y, points = [], scale = 240) {
  if (!Array.isArray(points) || !points.length) return 0;
  let best = Infinity;
  for (const p of points) {
    const d = distance(x, y, Number(p.x) || 0, Number(p.y) || 0);
    if (d < best) best = d;
  }
  return 1 - clamp(best / Math.max(80, scale), 0, 1);
}

function chooseSpawnCandidate(room, players, minDist = 220, tuning = null, anchorUse = null) {
  const context = makeSpawnContext(room);
  let candidates = Array.isArray(context.candidates) ? context.candidates.slice() : [];
  if (room?.arenaSpec?.rules?.spawnAnchorsOutside) {
    const outerOnly = candidates.filter((c) => String(c?.kind || '') === 'spawn');
    if (outerOnly.length) candidates = outerOnly;
  }
  const side = Math.max(420, Number(room?.side) || 840);
  const weights = tuning?.scoreWeights || {};
  const jitter = clamp(Number(tuning?.spawnJitter) || 36, 20, 42);
  const minD2 = minDist * minDist;
  const lineScale = Math.max(120, side * 0.34);
  const centerScale = Math.max(180, side * 0.36);
  const nodeScale = Math.max(150, side * 0.26);

  const variants = [];
  for (const c of candidates) {
    variants.push({ ...c, x: c.x, y: c.y, variant: 0 });
    variants.push({ ...c, x: c.x + (Math.random() - 0.5) * jitter * 1.4, y: c.y + (Math.random() - 0.5) * jitter * 1.4, variant: 1 });
  }
  if (!variants.length) {
    for (let i = 0; i < 8; i++) {
      const p = randomPointInRoomWalkable(room);
      variants.push({ x: p.x, y: p.y, kind: 'random', tag: `random_${i}`, variant: 0 });
    }
  }

  let best = null;
  let bestScore = -1e9;
  for (const c of variants) {
    const px = Number(c.x) || Number(room?.centerX) || 0;
    const py = Number(c.y) || Number(room?.centerY) || 0;
    const farEnough = players.every((p) => distance2(px, py, p.x, p.y) >= minD2);
    const entryFar = clamp(distance(px, py, context.entryPoint.x, context.entryPoint.y) / centerScale, 0, 1.25);
    const exitFar = clamp(distance(px, py, context.exitPoint.x, context.exitPoint.y) / centerScale, 0, 1.25);
    const centerNear = 1 - clamp(distance(px, py, context.center.x, context.center.y) / centerScale, 0, 1);
    const centerFar = clamp(distance(px, py, context.center.x, context.center.y) / centerScale, 0, 1.25);
    const flank = clamp(Math.sqrt(distanceToSegmentSq(px, py, context.entryPoint.x, context.entryPoint.y, context.exitPoint.x, context.exitPoint.y)) / lineScale, 0, 1.25);
    const pressureNear = nearestDistanceScore(px, py, context.pressurePoints, nodeScale);
    const nodeNear = nearestDistanceScore(px, py, context.nodePoints, nodeScale);
    const useKey = `${Math.round(px / 18)}:${Math.round(py / 18)}`;
    const used = anchorUse ? (anchorUse.get(useKey) || 0) : 0;
    const kindBias = c.kind === 'spawn' ? 0.10 : c.kind === 'gate' ? 0.08 : c.kind === 'pressure' ? 0.14 : c.kind === 'node' ? 0.14 : 0.0;
    const score =
      entryFar * Number(weights.entryFar || 0) +
      exitFar * Number(weights.exitFar || 0) +
      flank * Number(weights.flank || 0) +
      centerNear * Number(weights.centerNear || 0) +
      centerFar * Number(weights.centerFar || 0) +
      pressureNear * Number(weights.pressureNear || 0) +
      nodeNear * Number(weights.nodeNear || 0) +
      kindBias - used * 0.14 + (Math.random() - 0.5) * 0.08 + (farEnough ? 0.26 : -1.9);
    if (score > bestScore) {
      bestScore = score;
      best = { x: px, y: py, kind: c.kind || 'spawn', tag: c.tag || '', useKey, context };
    }
  }

  if (anchorUse && best?.useKey) anchorUse.set(best.useKey, (anchorUse.get(best.useKey) || 0) + 1);
  return best || { x: Number(room?.centerX) || 0, y: Number(room?.centerY) || 0, kind: 'random', tag: '', useKey: '', context };
}

function applyEnemyEncounterBehavior(enemy, room, choice, tuning) {
  if (!enemy || !room) return;
  const aiMode = weightedPick(tuning?.aiWeights || {}, 'herdPassive');
  const side = Math.max(420, Number(room?.side) || 840);
  const context = choice?.context || makeSpawnContext(room);
  const anchor = { x: Number(choice?.x) || enemy.x || room.centerX, y: Number(choice?.y) || enemy.y || room.centerY };
  const campFocus = context.nodePoints[0] || context.pressurePoints[0] || context.center;
  enemy.aiMode = aiMode;
  enemy.aggroed = true;
  enemy.aggroRange = clamp((enemy.aggroRange || 450) + (tuning?.aggroRangeAdd || 0) + (enemy.isElite ? 18 : 0), 260, 700);
  enemy._encounterRole = getRoomRole(room);
  enemy._encounterBiome = String(room?.biomeKey || '').toLowerCase();
  enemy._encounterSpawnKind = String(choice?.kind || 'spawn');
  enemy._encounterSpawnTag = String(choice?.tag || '');

  const roomPressure = Math.max(0, (Number(tuning?.roomDifficultyScale) || 1) - 1);
  const hpMul = clamp(Number(tuning?.hpMul || 1) * (enemy.isElite ? 1.06 : 1) * (1 + roomPressure * 0.10), 0.84, 1.85);
  const speedMul = clamp(Number(tuning?.speedMul || 1) * (enemy.isElite ? 1.01 : 1) * (1 + roomPressure * 0.03), 0.88, 1.34);
  const damageMul = clamp(Number(tuning?.damageMul || 1) * (enemy.isElite ? 1.04 : 1) * (1 + roomPressure * 0.09), 0.90, 1.70);
  enemy.hp = (enemy.hp || 0) * hpMul;
  enemy.maxHp = (enemy.maxHp || enemy.maxHP || enemy.hp || 0) * hpMul;
  if (enemy.maxHP != null) enemy.maxHP = enemy.maxHp;
  enemy.speed = (enemy.speed || 0) * speedMul;
  enemy.damage = (enemy.damage || 0) * damageMul;

  if (aiMode === 'camp') {
    const focus = (enemy._encounterBiome === 'light' || enemy._encounterRole === 'shrine' || enemy._encounterRole === 'crucible') ? campFocus : anchor;
    enemy.campCenter = { x: Number(focus?.x) || anchor.x, y: Number(focus?.y) || anchor.y };
    enemy.campRadius = clamp(side * 0.16 * Number(tuning?.campRadiusMul || 1), 150, 360);
  } else if (aiMode === 'patrol') {
    const focus = (enemy._encounterRole === 'bridge' || enemy._encounterRole === 'hall') ? {
      x: (anchor.x + context.exitPoint.x) * 0.5,
      y: (anchor.y + context.exitPoint.y) * 0.5,
    } : anchor;
    enemy.patrolCenter = { x: Number(focus?.x) || anchor.x, y: Number(focus?.y) || anchor.y };
    enemy.patrolRadius = clamp(side * 0.14 * Number(tuning?.patrolRadiusMul || 1), 120, 340);
    enemy._patrolAngle = Math.random() * Math.PI * 2;
  } else {
    const focus = (enemy._encounterBiome === 'dark' || enemy._encounterRole === 'split') ? anchor : context.center;
    enemy.herdCenter = { x: Number(focus?.x) || anchor.x, y: Number(focus?.y) || anchor.y };
    enemy.herdRadius = clamp(side * 0.18 * Number(tuning?.herdRadiusMul || 1), 150, 380);
    enemy._idleAngle = Math.random() * Math.PI * 2;
  }
}

function pickSpawnPos(room, players, minDist = 220, tries = 14, tuning = null, anchorUse = null) {
  const picked = chooseSpawnCandidate(room, players, minDist, tuning, anchorUse);
  if (picked) return picked;

  const anchors = Array.isArray(room?.arenaSpec?.anchors?.spawnAnchors) ? room.arenaSpec.anchors.spawnAnchors : [];
  const minD2 = minDist * minDist;

  const tryPos = () => {
    if (anchors.length) {
      const a = anchors[(Math.random() * anchors.length) | 0];
      const jitter = 38;
      return {
        x: (Number(a?.x) || room.centerX) + (Math.random() - 0.5) * jitter * 2,
        y: (Number(a?.y) || room.centerY) + (Math.random() - 0.5) * jitter * 2,
        kind: 'spawn',
        tag: String(a?.tag || 'spawn'),
      };
    }
    const p = randomPointInRoomWalkable(room);
    return { x: p.x, y: p.y, kind: 'random', tag: 'random' };
  };

  let best = tryPos();
  for (let i = 0; i < tries; i++) {
    const pos = tryPos();
    const ok = players.every((p) => distance2(pos.x, pos.y, p.x, p.y) >= minD2);
    best = pos;
    if (ok) return pos;
  }
  return best;
}

function countAliveInRoom(state, roomIndex) {
  let alive = 0;
  for (const e of (state?.enemies || [])) {
    if (!e || e.dead || (e.hp || 0) <= 0) continue;
    if ((e._roomIndex | 0) !== (roomIndex | 0)) continue;
    alive++;
  }
  return alive;
}

function getRoomPressureFlags(room, roomDifficultyScale = 1) {
  const floorNo = Math.max(1, room?.floorNumber || 1);
  const roomOrd = Math.max(1, room?.roomOrdinal || 1);
  const totalRooms = Math.max(roomOrd, room?.totalRooms || roomOrd || 1);
  const isFinal = !!room?.isFloorFinal;
  const nonBossRooms = Math.max(1, totalRooms - 1);
  const combatOrdinal = Math.min(roomOrd, nonBossRooms);
  const combatProgress = Math.max(0, combatOrdinal - 1) / Math.max(1, nonBossRooms - 1);
  const pressure = Math.max(0, Number(roomDifficultyScale) - 1);
  return {
    floorNo,
    roomOrd,
    totalRooms,
    isFinal,
    combatProgress,
    pressure,
    secondRoomSpike: floorNo >= 2 && roomOrd >= 2,
    evenRoomSpike: floorNo >= 2 && !isFinal && roomOrd >= 2 && (roomOrd % 2 === 0),
    lateFloorSpike: floorNo >= 5 && !isFinal && combatProgress >= 0.66,
  };
}

export class RoomSpawnSystem {
  constructor(state) {
    this.state = state;
    this.roomIndex = 0;
    this.roomId = 'room_0';
    this.floorNumber = 0;
    this.roomOrdinal = 0;
    this.totalRooms = 0;
    this.killed = 0;
    this.spawned = 0;
    this.quotaTotal = 0;
    this.aliveCap = 0;
    this.wavesTotal = 0;
    this.waveIndex = 0;
    this.waveSpawned = 0;
    this.waveTarget = 0;
    this._waveSizes = [];
    this._waveRestLeft = 0;
    this._pendingWaveAdvance = false;
    this._spawnTimer = 0;
    this._bossSpawned = false;
    this._bossId = null;
    this.isBossRoom = false;
    this.encounterType = 'warmup';
    this.encounterLabel = '';
    this.roomDifficultyScale = 1;
    this._encounterProfile = getEncounterProfile({ encounterType: 'warmup' });
    this._forcedElitesLeft = 0;
    this._roleProfile = getRoleEncounterProfile('vestibule');
    this._biomeProfile = getBiomeEncounterProfile('');
    this._spawnAnchorUse = new Map();
    this._roomPressureFlags = getRoomPressureFlags(null, 1);

    const rd = state?.roomDirector;
    if (rd?.current) this.onRoomChanged(rd.current);
  }

  onZoneChanged() {}

  onRoomChanged(room) {
    if (!room) return;
    this.roomIndex = room.index | 0;
    this.roomId = room.id || `room_${this.roomIndex}`;
    this.floorNumber = room.floorNumber | 0;
    this.roomOrdinal = room.roomOrdinal | 0;
    this.totalRooms = room.totalRooms | 0;
    this.encounterType = String(room.encounterType || (room.isFloorFinal ? 'boss' : 'gauntlet'));
    this.encounterLabel = String(room.encounterLabel || '');
    this.roomDifficultyScale = Math.max(0.6, Number(room.difficultyScale) || 1);
    this._roomPressureFlags = getRoomPressureFlags(room, this.roomDifficultyScale);
    this._roleProfile = getRoleEncounterProfile(getRoomRole(room));
    this._biomeProfile = getBiomeEncounterProfile(room?.biomeKey || '');
    this._encounterProfile = mergeEncounterProfile(getEncounterProfile(room), this._roleProfile, this._biomeProfile);
    this._forcedElitesLeft = (this._encounterProfile.forcedElites | 0)
      + (this._roomPressureFlags.secondRoomSpike ? 1 : 0)
      + (this._roomPressureFlags.evenRoomSpike && this._roomPressureFlags.floorNo >= 4 ? 1 : 0)
      + (this._roomPressureFlags.lateFloorSpike && this._roomPressureFlags.floorNo >= 6 ? 1 : 0);
    this.killed = 0;
    this.spawned = 0;
    this._spawnTimer = 0;
    this._bossSpawned = false;
    this._bossId = null;
    this.waveIndex = 0;
    this.waveSpawned = 0;
    this._waveRestLeft = this.roomIndex > 0 ? (1.2 * (this._encounterProfile?.waveRestMul || 1)) : 0;
    this._spawnAnchorUse = new Map();
    this._pendingWaveAdvance = false;

    this.isBossRoom = !!room.isFloorFinal;
    if (this.roomIndex <= 0) {
      this.quotaTotal = 0;
      this.aliveCap = 0;
      this.wavesTotal = 0;
      this._waveSizes = [];
      this.waveTarget = 0;
    } else {
      const floorNo = Math.max(1, this.floorNumber || 1);
      const roomOrd = Math.max(1, this.roomOrdinal || 1);
      const partyScale = getPartyScale(this.state);
      const ep = this._encounterProfile || getEncounterProfile(room);
      const pressure = Math.max(0, this.roomDifficultyScale - 1);
      const pressureFlags = this._roomPressureFlags || getRoomPressureFlags(room, this.roomDifficultyScale);
      const base = 3.8 + floorNo * 1.30 + roomOrd * 1.28 + (this.isBossRoom ? 3.0 : 0);
      this.quotaTotal = clamp(Math.round(base * partyScale * this.roomDifficultyScale * (ep.quotaMul || 1)), 4, this.isBossRoom ? 72 : 60);
      this.aliveCap = clamp(Math.round(4 + floorNo * 0.42 + roomOrd * 0.18 + (this.isBossRoom ? 2 : 0) + (ep.aliveAdd || 0) + pressure * 1.85 + (pressureFlags.secondRoomSpike ? 0.5 : 0) + (pressureFlags.evenRoomSpike ? 0.4 : 0)), 3, 22);
      this.wavesTotal = this.isBossRoom
        ? clamp(2 + Math.floor(floorNo / 4) + Math.round(pressure * 0.55), 2, 5)
        : clamp(1 + Math.floor((floorNo - 1) / 4) + (ep.waveDelta || 0) + (pressureFlags.secondRoomSpike ? 1 : 0) + (pressureFlags.lateFloorSpike ? 1 : 0) + (pressureFlags.evenRoomSpike && floorNo >= 6 ? 1 : 0), 1, 6);
      let left = this.quotaTotal;
      this._waveSizes = [];
      for (let i = 0; i < this.wavesTotal; i++) {
        const remainWaves = this.wavesTotal - i;
        const size = i === this.wavesTotal - 1 ? left : Math.max(1, Math.round(left / remainWaves));
        this._waveSizes.push(size);
        left -= size;
      }
      this.waveTarget = this._waveSizes[0] || 0;
    }

    const st = this.state;
    if (st) {
      st._roomQuota = this.quotaTotal | 0;
      st._roomKilled = 0;
      st._roomAliveCap = this.aliveCap | 0;
      st._roomIsBoss = !!this.isBossRoom;
      st._roomIsMiniBoss = false;
      st._roomBossAlive = false;
      st._roomBossArenaType = String(room?.arenaSpec?.bossArena?.arenaType || '');
      st._roomWavesTotal = this.wavesTotal | 0;
      st._roomWaveIndex = 0;
      st._roomEncounter = this.encounterType;
      st._roomEncounterLabel = this.encounterLabel;
    }
  }

  update(dt) {
    const state = this.state;
    const rd = state?.roomDirector;
    const room = rd?.current;
    if (!room) return;
    if ((room.index | 0) !== (this.roomIndex | 0)) this.onRoomChanged(room);

    if ((room.index | 0) <= 0) {
      room.cleared = true;
      return;
    }
    if (room.cleared) return;

    const players = getPlayers(state);
    const aliveInRoom = countAliveInRoom(state, this.roomIndex);

    if (this.waveSpawned >= this.waveTarget && aliveInRoom === 0) {
      if (this.waveIndex < this.wavesTotal - 1) {
        this._pendingWaveAdvance = true;
        if (this._waveRestLeft <= 0) this._waveRestLeft = 2.0 * (this._encounterProfile?.waveRestMul || 1);
      } else {
        this.waveIndex = this.wavesTotal;
        this.waveSpawned = 0;
        this.waveTarget = 0;
        if (state) state._roomWaveIndex = this.waveIndex | 0;
      }
    }

    if (this._waveRestLeft > 0) {
      this._waveRestLeft -= dt;
      if (this._waveRestLeft <= 0) {
        this._waveRestLeft = 0;
        if (this._pendingWaveAdvance) {
          this._pendingWaveAdvance = false;
          this.waveIndex++;
          this.waveSpawned = 0;
          this.waveTarget = this._waveSizes[this.waveIndex] || 0;
          if (state) state._roomWaveIndex = this.waveIndex | 0;
        }
      }
      return;
    }

    if (this.waveIndex >= this.wavesTotal) {
      if (this.isBossRoom && !this._bossSpawned && aliveInRoom === 0) {
        const floorNo = Math.max(1, room.floorNumber || 1);
        const zone = 1 + Math.floor((floorNo - 1) / 3);
        const arenaBossSpawn = room?.arenaSpec?.anchors?.bossSpawn;
        const pos = arenaBossSpawn ? { x: Number(arenaBossSpawn.x) || room.centerX, y: Number(arenaBossSpawn.y) || room.centerY } : { x: room.centerX, y: room.centerY };
        const boss = createRoamingBoss(zone, pos, {
          floorIndex: floorNo,
          biomeKey: room.biomeKey || '',
          bossArena: room?.arenaSpec?.bossArena || null,
          bossMoveNodes: room?.arenaSpec?.anchors?.bossMoveNodes || [],
          hazardZones: room?.arenaSpec?.hazardZones || [],
        });
        boss._roomIndex = this.roomIndex;
        boss._roomId = this.roomId;
        boss._isRoomBoss = true;
        boss.id = boss.id || `boss_${this.roomIndex}_${Math.floor(Math.random() * 1e9)}`;
        this._bossId = boss.id;
        this._bossSpawned = true;
        state.enemies.push(boss);
        state._roomBossAlive = true;
        return;
      }
      this._checkClearCondition();
      return;
    }

    const remainingInWave = (this.waveTarget | 0) - (this.waveSpawned | 0);
    if (remainingInWave <= 0) return;
    const freeSlots = this.aliveCap - aliveInRoom;
    if (freeSlots <= 0) return;

    const floorNo = Math.max(1, room.floorNumber || 1);
    const zone = 1 + Math.floor((floorNo - 1) / 3);
    const ep = this._encounterProfile || getEncounterProfile(room);
    const pressureFlags = this._roomPressureFlags || getRoomPressureFlags(room, this.roomDifficultyScale);
    const pressure = Math.max(0, this.roomDifficultyScale - 1);
    const minDist = clamp((200 + floorNo * 8) * (ep.minDistMul || 1) * (1 - Math.min(0.12, pressure * 0.04)), 150, 320);
    const spawnInterval = clamp((0.92 - floorNo * 0.018) * (ep.spawnIntervalMul || 1) * (1 - Math.min(0.30, pressure * 0.07 + (pressureFlags.secondRoomSpike ? 0.03 : 0) + (pressureFlags.evenRoomSpike ? 0.03 : 0))), 0.22, 1.05);
    this._spawnTimer += dt;
    if (this._spawnTimer < spawnInterval) return;
    this._spawnTimer = 0;

    const dynamicBatchCap = this.isBossRoom
      ? 3
      : clamp((this._encounterProfile?.spawnBatchCap || 4) + Math.floor(pressure * 0.6) + (pressureFlags.secondRoomSpike && floorNo >= 3 ? 1 : 0) + (pressureFlags.lateFloorSpike ? 1 : 0), 1, 7);
    const batch = Math.min(remainingInWave, freeSlots, dynamicBatchCap);
    for (let i = 0; i < batch; i++) {
      const choice = pickSpawnPos(room, players, minDist, 16, ep, this._spawnAnchorUse);
      const pos = { x: Number(choice?.x) || room.centerX, y: Number(choice?.y) || room.centerY };
      const biomeKey = String(room.biomeKey || '').toLowerCase();
      const eliteChance = clamp((0.04 + floorNo * 0.01) * (ep.eliteChanceMul || 1) + pressure * 0.07 + (pressureFlags.secondRoomSpike ? 0.03 : 0) + (pressureFlags.evenRoomSpike ? 0.03 : 0), 0.03, 0.78);
      const useElite = (this._forcedElitesLeft > 0) || (Math.random() < eliteChance);
      if (useElite && this._forcedElitesLeft > 0) this._forcedElitesLeft--;
      const useBiome = biomeKey && Math.random() < clamp((ep.biomeChance || 0.55) + pressure * 0.08 + (floorNo >= 2 ? 0.04 : 0) + (pressureFlags.lateFloorSpike ? 0.03 : 0), 0.18, 0.98);
      const enemy = useElite
        ? (biomeKey ? createBiomeEliteMob(biomeKey, zone, pos) : createEliteMob(zone, pos))
        : (useBiome ? createBiomeMob(biomeKey, zone, pos) : createBasicMob(zone, pos));
      if (biomeKey && !useElite && !useBiome) enemy.kind = `${biomeKey}Basic`;
      if (biomeKey && !enemy._biomeKey) enemy._biomeKey = biomeKey;
      applyEnemyEncounterBehavior(enemy, room, choice, { ...ep, roomDifficultyScale: this.roomDifficultyScale });
      enemy._roomIndex = this.roomIndex;
      enemy._roomId = this.roomId;
      enemy.id = enemy.id || `e_${this.roomIndex}_${this.spawned}_${Math.floor(Math.random() * 1e6)}`;
      state.enemies.push(enemy);
      this.spawned++;
      this.waveSpawned++;
    }

    if (state) {
      state._roomKilled = this.killed | 0;
      state._roomQuota = this.quotaTotal | 0;
      state._roomWavesTotal = this.wavesTotal | 0;
      state._roomWaveIndex = this.waveIndex | 0;
    }
  }

  onEnemyRemoved(enemy) {
    if (!enemy || enemy._roomCleanup) return;
    if ((enemy._roomIndex | 0) !== (this.roomIndex | 0)) return;
    if ((enemy.hp || 0) <= 0) {
      this.killed++;
      if (this.state) this.state._roomKilled = this.killed | 0;
    }
    if (this.isBossRoom && enemy._isRoomBoss && this.state) this.state._roomBossAlive = false;
    this._checkClearCondition();
  }

  _checkClearCondition() {
    const state = this.state;
    const rd = state?.roomDirector;
    const room = rd?.current;
    if (!room || room.cleared) return;
    if ((room.index | 0) !== (this.roomIndex | 0)) return;
    if (this.killed < this.quotaTotal) return;
    if (this.isBossRoom) {
      if (!this._bossSpawned) return;
      const bossAlive = (state.enemies || []).some((e) => e && !e.dead && (e.hp || 0) > 0 && (e._roomIndex | 0) === this.roomIndex && e._isRoomBoss);
      if (bossAlive) return;
    }
    const anyAlive = (state.enemies || []).some((e) => e && !e.dead && (e.hp || 0) > 0 && (e._roomIndex | 0) === this.roomIndex);
    if (anyAlive) return;
    try { rd.markCurrentCleared(); } catch {}
  }
}
