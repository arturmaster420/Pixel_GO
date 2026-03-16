import { generateTemplateRoomArena } from './generateTemplateRoomArena.js';
import { generateLightArena as generateLightArenaLegacy } from './generateLightArena.legacy.js';

export function generateLightArena(input = {}) {
  const templated = generateTemplateRoomArena(input);
  if (templated) return templated;
  return generateLightArenaLegacy(input);
}
