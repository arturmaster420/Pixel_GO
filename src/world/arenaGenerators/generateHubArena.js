import { generateNeutralArena } from './generateNeutralArena.js';

export function generateHubArena(input = {}) {
  return generateNeutralArena({ ...input, isHub: true });
}
