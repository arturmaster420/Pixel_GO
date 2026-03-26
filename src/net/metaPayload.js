import { getActiveHero, getActiveHeroSummary } from "../core/accountProfile.js";
import { buildHeroCombatProfile } from "../core/cards/cardCombatProjection.js";
import { ensureCardCollectionState, getCardDefById, getOwnedCardState, normalizeCardIdArray } from "../core/cards/cardDefs.js";
import { getStarterLoadoutDef, normalizeStarterLoadoutKey } from "../core/starterLoadouts.js";
import { getCanonicalHeroRuntimeProfile } from "../core/skillRuntimeState.js";


function clampTier(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(6, n | 0));
}

function buildLoadoutSignature(activeHero) {
  if (!activeHero || typeof activeHero !== 'object') return '';
  const heroId = String(activeHero?.heroId || '').trim();
  const skills = normalizeCardIdArray(activeHero?.equippedSkillCards, 'skill').join(',');
  const passives = normalizeCardIdArray(activeHero?.equippedPassiveCards, 'passive').join(',');
  return `${heroId}|${skills}|${passives}`;
}

function buildActiveHeroRuntime(activeHero, activeHeroSummary, heroCombatProfile) {
  if (!activeHero) return null;
  const race = normalizeStarterLoadoutKey(activeHeroSummary?.race || activeHero?.race || heroCombatProfile?.race || 'mecha');
  const runtime = getCanonicalHeroRuntimeProfile(heroCombatProfile, race);
  const skillTiers = {};
  const passiveTiers = {};
  for (const key of runtime.runtimeSkillKeys) skillTiers[key] = clampTier(runtime.skillTiers?.[key] || 1);
  for (const key of runtime.runtimePassiveKeys) passiveTiers[key] = clampTier(runtime.passiveTiers?.[key] || 1);
  return {
    version: 1,
    signature: buildLoadoutSignature(activeHero),
    heroId: String(activeHero?.heroId || ''),
    race,
    coreSkillKey: String(runtime.coreSkillKey || getStarterLoadoutDef(race)?.skillKey || ''),
    coreSkillEquipped: runtime.coreSkillEquipped !== false,
    runtimeSkillKeys: [...runtime.runtimeSkillKeys],
    runtimePassiveKeys: [...runtime.runtimePassiveKeys],
    skillTiers,
    passiveTiers,
  };
}
function buildCompactCardEntry(collection, cardId) {
  const id = String(cardId || '').trim();
  if (!id) return null;
  const def = getCardDefById(id);
  const state = getOwnedCardState(collection, id);
  if (!def || !state || Math.max(0, Number(state.copiesOwned || 0) | 0) <= 0) return null;
  return {
    id,
    key: String(def.sourceKey || ''),
    kind: String(def.kind || ''),
    race: String(def.race || 'mecha'),
    lv: Math.max(1, Number(state.level || 1) | 0),
    st: Math.max(1, Number(state.currentStars || def.baseStars || 1) | 0),
  };
}

function buildActiveHeroLoadoutSummary(prog, activeHero, heroCombatProfile) {
  if (!activeHero) return null;
  const collection = ensureCardCollectionState(prog?.accountProfile?.cardCollection);
  const skills = [];
  const passives = [];
  for (const cardId of normalizeCardIdArray(activeHero?.equippedSkillCards, 'skill')) {
    const entry = buildCompactCardEntry(collection, cardId);
    if (entry) skills.push(entry);
  }
  for (const cardId of normalizeCardIdArray(activeHero?.equippedPassiveCards, 'passive')) {
    const entry = buildCompactCardEntry(collection, cardId);
    if (entry) passives.push(entry);
  }
  const summary = heroCombatProfile?.summary && typeof heroCombatProfile.summary === 'object' ? heroCombatProfile.summary : {};
  return {
    version: 1,
    heroId: String(activeHero?.heroId || ''),
    name: String(activeHero?.name || 'Hero').slice(0, 24),
    race: String(activeHero?.race || prog?.selectedStarterLoadout || 'mecha'),
    skills,
    passives,
    totals: {
      skillCount: skills.length,
      passiveCount: passives.length,
      totalCardPower: Math.max(0, Number(summary.totalCardPower || 0) | 0),
      sameRaceCards: Math.max(0, Number(summary.sameRaceCards || 0) | 0),
      starBonusTotal: Math.max(0, Number(summary.starBonusTotal || 0) | 0),
      masteryLevel: Math.max(1, Number(summary.masteryLevel || 1) | 0),
    },
  };
}

export function buildNetMetaPayload(prog) {
  if (!prog) return null;
  const activeHero = getActiveHero(prog);
  const activeHeroSummary = getActiveHeroSummary(prog);
  const heroCombatProfile = (prog.heroCombatProfile && typeof prog.heroCombatProfile === "object")
    ? prog.heroCombatProfile
    : buildHeroCombatProfile(activeHero, prog?.accountProfile?.cardCollection);
  const activeHeroLoadoutSummary = (prog.activeHeroLoadoutSummary && typeof prog.activeHeroLoadoutSummary === 'object')
    ? prog.activeHeroLoadoutSummary
    : buildActiveHeroLoadoutSummary(prog, activeHero, heroCombatProfile);
  const heroCombatSummary = (prog.heroCombatSummary && typeof prog.heroCombatSummary === 'object')
    ? prog.heroCombatSummary
    : (heroCombatProfile?.summary && typeof heroCombatProfile.summary === 'object'
      ? {
          totalCardPower: Math.max(0, Number(heroCombatProfile.summary.totalCardPower || 0) | 0),
          sameRaceCards: Math.max(0, Number(heroCombatProfile.summary.sameRaceCards || 0) | 0),
          starBonusTotal: Math.max(0, Number(heroCombatProfile.summary.starBonusTotal || 0) | 0),
          equippedSkillCards: Math.max(0, Number(heroCombatProfile.summary.equippedSkillCards || 0) | 0),
          equippedPassiveCards: Math.max(0, Number(heroCombatProfile.summary.equippedPassiveCards || 0) | 0),
          masteryLevel: Math.max(1, Number(heroCombatProfile.summary.masteryLevel || 1) | 0),
        }
      : null);
  const activeHeroRuntime = (prog.activeHeroRuntime && typeof prog.activeHeroRuntime === 'object')
    ? prog.activeHeroRuntime
    : buildActiveHeroRuntime(activeHero, activeHeroSummary, heroCombatProfile);
  return {
    nickname: prog.nickname || "Player",
    avatarIndex: prog.avatarIndex || 0,
    auraId: prog.auraId || 0,
    resurrectedTier: prog.resurrectedTier || 1,
    totalScore: prog.totalScore || 0,
    upgradePoints: (typeof prog.deathPoints === "number" ? prog.deathPoints : prog.upgradePoints) || 0,
    deathPoints: (typeof prog.deathPoints === "number" ? prog.deathPoints : prog.upgradePoints) || 0,
    limits: prog.limits || {},
    skillMeta: prog.skillMeta || {},
    selectedStarterLoadout: prog.selectedStarterLoadout || "mecha",
    sp: Math.max(0, (prog.sp | 0) || 0),
    materials: prog.materials || {},
    essences: prog.essences || {},
    gearParts: prog.gearParts || {},
    hubBuild: prog.hubBuild || null,
    hubGear: prog.hubGear || null,
    gearInventory: prog.gearInventory || {},
    activeHeroId: activeHeroSummary?.heroId || prog.activeHeroId || "hero_1",
    activeHeroName: activeHeroSummary?.name || "Hero 1",
    activeHeroRace: activeHeroSummary?.race || prog.selectedStarterLoadout || "mecha",
    activeHeroLoadoutSummary,
    activeHeroRuntime,
    heroCombatProfile: (heroCombatProfile && typeof heroCombatProfile === "object") ? heroCombatProfile : null,
    heroCombatSummary,
  };
}
