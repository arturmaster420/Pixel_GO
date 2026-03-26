import {
  ESSENCE_EXCHANGE_RATE,
  clampInt,
  getEssenceMeta,
  getMaterialMeta,
  normalizeEssenceKey,
  normalizeMaterialKey,
  toPositiveInt,
} from "./hubShared.js";
import { ensureHubProgression } from "./hubBuildState.js";

export const RACE_DUST_EXCHANGE_RATE = ESSENCE_EXCHANGE_RATE;

export { getEssenceMeta, getMaterialMeta, normalizeEssenceKey, normalizeMaterialKey };

export function getMaterialCount(prog, key) {
  ensureHubProgression(prog);
  const materialKey = normalizeMaterialKey(key);
  return Math.max(0, clampInt(prog?.materials?.[materialKey], 0, 9999999));
}

export function addMaterial(prog, key, amount) {
  ensureHubProgression(prog);
  const materialKey = normalizeMaterialKey(key);
  const delta = toPositiveInt(amount, 9999999);
  const current = Math.max(0, Number.isFinite(Number(prog?.materials?.[materialKey])) ? Math.trunc(Number(prog.materials[materialKey])) : 0);
  if (delta <= 0) return current;
  const next = Math.min(9999999, current + delta);
  prog.materials[materialKey] = next;
  return next | 0;
}

export function getEssenceCount(prog, key) {
  ensureHubProgression(prog);
  const essenceKey = normalizeEssenceKey(key);
  return Math.max(0, clampInt(prog?.essences?.[essenceKey], 0, 9999999));
}

export function addEssence(prog, key, amount) {
  ensureHubProgression(prog);
  const essenceKey = normalizeEssenceKey(key);
  const delta = toPositiveInt(amount, 9999999);
  const current = Math.max(0, Number.isFinite(Number(prog?.essences?.[essenceKey])) ? Math.trunc(Number(prog.essences[essenceKey])) : 0);
  if (delta <= 0) return current;
  const next = Math.min(9999999, current + delta);
  prog.essences[essenceKey] = next;
  return next | 0;
}

export function canExchangeEssence(prog, fromKey, toKey, rate = ESSENCE_EXCHANGE_RATE) {
  ensureHubProgression(prog);
  const from = normalizeEssenceKey(fromKey);
  const to = normalizeEssenceKey(toKey);
  const exchangeRate = Math.max(1, clampInt(rate, 1, 999));
  if (!from || !to || from === to) return false;
  return getEssenceCount(prog, from) >= exchangeRate;
}

export function exchangeEssence(prog, fromKey, toKey, rate = ESSENCE_EXCHANGE_RATE) {
  ensureHubProgression(prog);
  const from = normalizeEssenceKey(fromKey);
  const to = normalizeEssenceKey(toKey);
  const exchangeRate = Math.max(1, clampInt(rate, 1, 999));
  if (!from || !to || from === to) return false;
  if (getEssenceCount(prog, from) < exchangeRate) return false;
  prog.essences[from] = Math.max(0, getEssenceCount(prog, from) - exchangeRate);
  prog.essences[to] = Math.max(0, getEssenceCount(prog, to) + 1);
  return true;
}



export function getRaceDustCount(prog, key) {
  ensureHubProgression(prog);
  const dustKey = normalizeEssenceKey(key);
  const wallet = prog?.accountProfile?.sharedResources?.raceDust && typeof prog.accountProfile.sharedResources.raceDust === 'object'
    ? prog.accountProfile.sharedResources.raceDust
    : null;
  return Math.max(0, clampInt(wallet?.[dustKey], 0, 9999999));
}

function ensureRaceDustWallet(prog) {
  ensureHubProgression(prog);
  if (!prog.accountProfile || typeof prog.accountProfile !== 'object') prog.accountProfile = {};
  if (!prog.accountProfile.sharedResources || typeof prog.accountProfile.sharedResources !== 'object') prog.accountProfile.sharedResources = {};
  const wallet = prog.accountProfile.sharedResources.raceDust && typeof prog.accountProfile.sharedResources.raceDust === 'object'
    ? prog.accountProfile.sharedResources.raceDust
    : {};
  prog.accountProfile.sharedResources.raceDust = { fire: 0, ice: 0, electric: 0, mecha: 0, dark: 0, light: 0, ...wallet };
  return prog.accountProfile.sharedResources.raceDust;
}

export function addRaceDust(prog, key, amount) {
  ensureHubProgression(prog);
  const dustKey = normalizeEssenceKey(key);
  const delta = Math.trunc(Number(amount || 0));
  const wallet = ensureRaceDustWallet(prog);
  const current = Math.max(0, clampInt(wallet?.[dustKey], 0, 9999999));
  if (!Number.isFinite(delta) || delta === 0) return current;
  const next = Math.max(0, Math.min(9999999, current + delta));
  wallet[dustKey] = next;
  return next | 0;
}

export function canExchangeRaceDust(prog, fromKey, toKey, rate = RACE_DUST_EXCHANGE_RATE) {
  ensureHubProgression(prog);
  const from = normalizeEssenceKey(fromKey);
  const to = normalizeEssenceKey(toKey);
  const exchangeRate = Math.max(1, clampInt(rate, 1, 999));
  if (!from || !to || from === to) return false;
  return getRaceDustCount(prog, from) >= exchangeRate;
}

export function exchangeRaceDust(prog, fromKey, toKey, rate = RACE_DUST_EXCHANGE_RATE) {
  ensureHubProgression(prog);
  const from = normalizeEssenceKey(fromKey);
  const to = normalizeEssenceKey(toKey);
  const exchangeRate = Math.max(1, clampInt(rate, 1, 999));
  if (!from || !to || from === to) return false;
  if (getRaceDustCount(prog, from) < exchangeRate) return false;
  addRaceDust(prog, from, -exchangeRate);
  addRaceDust(prog, to, 1);
  return true;
}
