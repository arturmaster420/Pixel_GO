import { saveProgression } from './progression.js';
import { ESSENCE_META, applyHubProgressionLoot, ensureHubProgression, getHubGearDef, getMaterialMeta } from './hubBuild.js';

export function summarizeProgPayload(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const lines = [];
  const spGain = Math.max(0, Number(payload.sp || 0) | 0);
  if (spGain > 0) lines.push(`+${spGain} SP`);
  const essences = payload.essences && typeof payload.essences === 'object' ? payload.essences : {};
  for (const [key, raw] of Object.entries(essences)) {
    const amount = Math.max(0, Number(raw || 0) | 0);
    if (amount <= 0) continue;
    const meta = ESSENCE_META[String(key || '').toLowerCase()] || ESSENCE_META.mecha;
    lines.push(`+${amount} ${meta.short || meta.label}`);
  }
  const materials = payload.materials && typeof payload.materials === 'object' ? payload.materials : {};
  for (const [key, raw] of Object.entries(materials)) {
    const amount = Math.max(0, Number(raw || 0) | 0);
    if (amount <= 0) continue;
    const meta = getMaterialMeta(key);
    lines.push(`+${amount} ${meta.short || meta.label}`);
  }
  const gearParts = payload.gearParts && typeof payload.gearParts === 'object' ? payload.gearParts : {};
  for (const [key, raw] of Object.entries(gearParts)) {
    const amount = Math.max(0, Number(raw || 0) | 0);
    if (amount <= 0) continue;
    const def = getHubGearDef(key);
    if (def) lines.push(`+${amount} ${def.short || def.name} Part`);
  }
  const gearItems = payload.gearItems && typeof payload.gearItems === 'object' ? payload.gearItems : {};
  for (const [key, raw] of Object.entries(gearItems)) {
    const amount = Math.max(0, Number(raw || 0) | 0);
    if (amount <= 0) continue;
    const def = getHubGearDef(key);
    if (def) lines.push(`DROP: ${def.name}`);
  }
  return lines.join(' • ');
}

export function isDirectResourceOrbKind(kind) {
  return kind === 'essence' || kind === 'material' || kind === 'gearPart' || kind === 'gearItem';
}

export function getDirectResourcePayloadFromOrb(orb) {
  if (!orb || !isDirectResourceOrbKind(String(orb.kind || ''))) return null;
  const amount = Math.max(0, Number(orb.amount || 0) | 0) || 1;
  const kind = String(orb.kind || '');
  if (kind === 'essence') {
    const key = String(orb.essenceKey || 'mecha').toLowerCase();
    return { essences: { [key]: amount } };
  }
  if (kind === 'material') {
    const key = String(orb.materialKey || 'salvage');
    return { materials: { [key]: amount } };
  }
  if (kind === 'gearPart') {
    const key = String(orb.gearKey || '');
    if (!key) return null;
    return { gearParts: { [key]: amount } };
  }
  if (kind === 'gearItem') {
    const key = String(orb.gearKey || '');
    if (!key) return null;
    return { gearItems: { [key]: amount } };
  }
  return null;
}

export function applyDirectResourceGrantToLocal(state, orb) {
  if (!state?.progression || !orb || !isDirectResourceOrbKind(String(orb.kind || ''))) return { changed: false, lines: [] };
  if (!state._appliedProgGrantIds) state._appliedProgGrantIds = new Set();
  const grantId = typeof orb?.grantId === 'string' ? orb.grantId.trim() : '';
  if (grantId && state._appliedProgGrantIds.has(grantId)) return { changed: false, lines: [], duplicate: true };
  try { ensureHubProgression(state.progression); } catch {}
  let changed = false;
  const lines = [];
  const kind = String(orb.kind || '');
  const amount = Math.max(1, Number(orb.amount || 0) | 0);
  if (kind === 'essence') {
    const key = String(orb.essenceKey || 'mecha').toLowerCase();
    const meta = ESSENCE_META[key] || ESSENCE_META.mecha;
    state.progression.essences[key] = Math.max(0, (state.progression.essences?.[key] | 0) + amount);
    changed = true;
    lines.push(`+${amount} ${meta.short || meta.label}`);
  } else if (kind === 'material') {
    const key = String(orb.materialKey || 'salvage');
    const meta = getMaterialMeta(key);
    state.progression.materials[key] = Math.max(0, (state.progression.materials?.[key] | 0) + amount);
    changed = true;
    lines.push(`+${amount} ${meta.short || meta.label}`);
  } else if (kind === 'gearPart') {
    const key = String(orb.gearKey || '');
    const def = getHubGearDef(key);
    if (def) {
      state.progression.gearParts[key] = Math.max(0, (state.progression.gearParts?.[key] | 0) + amount);
      changed = true;
      lines.push(`+${amount} ${def.short || def.name} Part`);
    }
  } else if (kind === 'gearItem') {
    const key = String(orb.gearKey || '');
    const def = getHubGearDef(key);
    if (def) {
      const owned = Math.max(0, state.progression.gearInventory?.[key] | 0);
      if (owned > 0) {
        const bonusParts = Math.max(2, amount);
        state.progression.gearParts[key] = Math.max(0, (state.progression.gearParts?.[key] | 0) + bonusParts);
        lines.push(`DUPLICATE ${def.short || def.name} → +${bonusParts} Parts`);
      } else {
        state.progression.gearInventory[key] = Math.max(1, owned + amount);
        lines.push(`DROP: ${def.name}`);
      }
      changed = true;
    }
  }
  if (grantId && changed) state._appliedProgGrantIds.add(grantId);
  if (!changed) return { changed: false, lines, duplicate: false };
  try { saveProgression(state.progression); } catch {}
  try {
    const txt = lines.join(' • ');
    const fx = orb ? { x: orb.x, y: orb.y } : (state.player ? { x: state.player.x, y: state.player.y - 40 } : null);
    if (fx && state.floatingTexts && txt) state.floatingTexts.push({ x: fx.x, y: fx.y, text: txt, time: 1.15 });
  } catch {}
  return { changed: true, lines, duplicate: false };
}

export function applyProgressionPayloadToLocal(state, payload, orb = null) {
  if (!state?.progression || !payload || typeof payload !== 'object') return { changed: false, lines: [] };
  const grantId = typeof payload._grantId === 'string' ? payload._grantId.trim() : '';
  if (!state._appliedProgGrantIds) state._appliedProgGrantIds = new Set();
  if (grantId && state._appliedProgGrantIds.has(grantId)) return { changed: false, lines: [], duplicate: true };
  try { ensureHubProgression(state.progression); } catch {}
  const spGain = Number(payload.sp || 0);
  let changed = false;
  const lines = [];
  if (Number.isFinite(spGain) && spGain > 0) {
    state.progression.sp = Math.max(0, (state.progression.sp | 0) + (spGain | 0));
    changed = true;
    lines.push(`+${spGain | 0} SP`);
  }
  const loot = applyHubProgressionLoot(state.progression, payload);
  if (loot?.changed) {
    changed = true;
    lines.push(...(loot.lines || []));
  }
  if (grantId) state._appliedProgGrantIds.add(grantId);
  if (!changed) return { changed: false, lines, duplicate: false };
  try { saveProgression(state.progression); } catch {}
  try {
    const txt = lines.length ? lines.join(' • ') : summarizeProgPayload(payload);
    const fx = orb ? { x: orb.x, y: orb.y } : (state.player ? { x: state.player.x, y: state.player.y - 40 } : null);
    if (fx && state.floatingTexts && txt) state.floatingTexts.push({ x: fx.x, y: fx.y, text: txt, time: 1.15 });
  } catch {}
  return { changed: true, lines, duplicate: false };
}

export function getLocalProgressionAliases(state) {
  const ids = [];
  if (state?.net?.playerId != null) ids.push(String(state.net.playerId));
  if (state?.player?.id != null) ids.push(String(state.player.id));
  ids.push('local');
  return [...new Set(ids.map((v) => String(v || '').trim()).filter(Boolean))];
}
