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
