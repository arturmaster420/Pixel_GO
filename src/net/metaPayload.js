export function buildNetMetaPayload(prog) {
  if (!prog) return null;
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
  };
}
