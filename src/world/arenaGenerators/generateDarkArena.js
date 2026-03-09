import { generateTemplateRoomArena } from './generateTemplateRoomArena.js';
import { generateDarkArena as generateDarkArenaLegacy } from './generateDarkArena.legacy.js';

export function generateDarkArena(input = {}) {
  const templated = generateTemplateRoomArena(input);
  if (templated) return templated;
  return generateDarkArenaLegacy(input);
}
