import { generateTemplateRoomArena } from './generateTemplateRoomArena.js';
import { generateIceArena as generateIceArenaLegacy } from './generateIceArena.legacy.js';

export function generateIceArena(input = {}) {
  const templated = generateTemplateRoomArena(input);
  if (templated) return templated;
  return generateIceArenaLegacy(input);
}
