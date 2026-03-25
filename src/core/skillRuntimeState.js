import { ACTIVE_SKILL_KEYS, PASSIVE_KEYS } from "./hub/hubShared.js";
import { getStarterLoadoutDef, normalizeStarterLoadoutKey } from "./starterLoadouts.js";

function clampTier(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.max(1, Math.min(6, Number(fallback || 1) | 0 || 1));
  return Math.max(1, Math.min(6, n | 0));
}

function sanitizeRuntimeKeyArray(raw, allowed = null) {
  const allow = Array.isArray(allowed) && allowed.length ? new Set(allowed) : null;
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const value of raw) {
    const key = String(value || '').trim();
    if (!key || seen.has(key)) continue;
    if (allow && !allow.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function getCanonicalHeroRuntimeProfile(heroCombatProfile = null, fallbackRace = 'mecha') {
  const profile = heroCombatProfile && typeof heroCombatProfile === 'object' ? heroCombatProfile : null;
  const race = normalizeStarterLoadoutKey(profile?.race || fallbackRace || 'mecha');
  const coreSkillKey = String(profile?.coreSkillKey || getStarterLoadoutDef(race)?.skillKey || '').trim();

  let runtimeSkillKeys = sanitizeRuntimeKeyArray(profile?.runtimeSkillKeys, ACTIVE_SKILL_KEYS);
  if (!runtimeSkillKeys.length && profile?.skillTiers && typeof profile.skillTiers === 'object') {
    runtimeSkillKeys = sanitizeRuntimeKeyArray(Object.keys(profile.skillTiers), ACTIVE_SKILL_KEYS);
  }
  if (coreSkillKey && profile?.coreSkillEquipped !== false && !runtimeSkillKeys.includes(coreSkillKey)) {
    runtimeSkillKeys = [coreSkillKey, ...runtimeSkillKeys];
  }

  let runtimePassiveKeys = sanitizeRuntimeKeyArray(profile?.runtimePassiveKeys, PASSIVE_KEYS);
  if (!runtimePassiveKeys.length && profile?.passiveTiers && typeof profile.passiveTiers === 'object') {
    runtimePassiveKeys = sanitizeRuntimeKeyArray(Object.keys(profile.passiveTiers), PASSIVE_KEYS);
  }

  const skillTiers = {};
  for (const key of runtimeSkillKeys) skillTiers[key] = clampTier(profile?.skillTiers?.[key] || 1, 1);

  const passiveTiers = {};
  for (const key of runtimePassiveKeys) passiveTiers[key] = clampTier(profile?.passiveTiers?.[key] || 1, 1);

  return {
    race,
    coreSkillKey,
    coreSkillEquipped: profile?.coreSkillEquipped !== false,
    runtimeSkillKeys,
    runtimePassiveKeys,
    skillTiers,
    passiveTiers,
  };
}

export function getProjectedSkillTier(key, { player = null, heroCombatProfile = null, fallbackRace = 'mecha', isCore = false } = {}) {
  const skillKey = String(key || '').trim();
  if (!skillKey) return 0;
  const live = Math.max(0, (player?.runSkills?.[skillKey] | 0) || 0);
  if (live > 0) return live;
  const runtime = getCanonicalHeroRuntimeProfile(heroCombatProfile, fallbackRace);
  if (runtime.runtimeSkillKeys.includes(skillKey)) return Math.max(1, runtime.skillTiers?.[skillKey] || 1);
  if (isCore && runtime.coreSkillKey === skillKey && runtime.coreSkillEquipped !== false) return Math.max(1, runtime.skillTiers?.[skillKey] || 1);
  return 0;
}

export function getProjectedPassiveTier(key, { player = null, heroCombatProfile = null, fallbackRace = 'mecha' } = {}) {
  const passiveKey = String(key || '').trim();
  if (!passiveKey) return 0;
  const live = Math.max(0, (player?.runPassives?.[passiveKey] | 0) || 0);
  if (live > 0) return live;
  const runtime = getCanonicalHeroRuntimeProfile(heroCombatProfile, fallbackRace);
  if (runtime.runtimePassiveKeys.includes(passiveKey)) return Math.max(1, runtime.passiveTiers?.[passiveKey] || 1);
  return 0;
}
