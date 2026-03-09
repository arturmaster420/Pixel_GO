import { generateTemplateRoomArena } from './generateTemplateRoomArena.js';
import { generateElectricArena as generateElectricArenaLegacy } from './generateElectricArena.legacy.js';

export function generateElectricArena(input = {}) {
  const templated = generateTemplateRoomArena(input);
  if (templated) return templated;
  return generateElectricArenaLegacy(input);
}
