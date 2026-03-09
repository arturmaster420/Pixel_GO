import { generateTemplateRoomArena } from './generateTemplateRoomArena.js';
import { generateFireArena as generateFireArenaLegacy } from './generateFireArena.legacy.js';

function patchFinalFireArena(spec, input = {}) {
  if (!spec || String(input?.templateKey || '').toLowerCase() !== 'final_room') return spec;
  const start = spec?.anchors?.playerStart;
  const hazards = Array.isArray(spec?.hazardZones) ? spec.hazardZones : [];
  if (start && hazards.length) {
    let safeY = Number(start.y) || 0;
    for (const h of hazards) {
      if (!h) continue;
      const hx = Number(h.x) || 0;
      const hy = Number(h.y) || 0;
      const hr = Math.max(42, (Number(h.r) || 42) * 0.60);
      const dx = (Number(start.x) || 0) - hx;
      const dy = (Number(start.y) || 0) - hy;
      const d = Math.hypot(dx, dy);
      if (d < hr + 18) {
        safeY = Math.max(safeY, hy + hr + 26);
      }
    }
    spec.anchors.playerStart = { x: Number(start.x) || 0, y: safeY };
  }
  return spec;
}

export function generateFireArena(input = {}) {
  const templated = generateTemplateRoomArena(input);
  if (templated) return templated;
  return patchFinalFireArena(generateFireArenaLegacy(input), input);
}
