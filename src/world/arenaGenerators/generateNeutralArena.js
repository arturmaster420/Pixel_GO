import { generateTemplateRoomArena } from './generateTemplateRoomArena.js';
import { generateNeutralArena as generateNeutralArenaLegacy } from './generateNeutralArena.legacy.js';

export function generateNeutralArena(input = {}) {
  const templated = generateTemplateRoomArena(input);
  if (templated) return templated;
  return generateNeutralArenaLegacy(input);
}
