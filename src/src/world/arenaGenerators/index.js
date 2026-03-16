import { generateNeutralArena } from './generateNeutralArena.js';
import { generateHubArena } from './generateHubArena.js';
import { generateElectricArena } from './generateElectricArena.js';
import { generateFireArena } from './generateFireArena.js';
import { generateIceArena } from './generateIceArena.js';
import { generateDarkArena } from './generateDarkArena.js';
import { generateLightArena } from './generateLightArena.js';

export function runArenaGenerator(profile, input) {
  const id = String(profile?.generatorId || 'orbital_atrium');
  if (id === 'hub_core') return generateHubArena({ ...input, profile });
  if (id === 'storm_spire' || id === 'electric_chain') return generateElectricArena({ ...input, profile });
  if (id === 'ember_throne' || id === 'fire_crater') return generateFireArena({ ...input, profile });
  if (id === 'crystal_fjord' || id === 'ice_field') return generateIceArena({ ...input, profile });
  if (id === 'dark_void') return generateDarkArena({ ...input, profile });
  if (id === 'light_temple') return generateLightArena({ ...input, profile });
  if (id === 'orbital_atrium' || id === 'station_grid') return generateNeutralArena({ ...input, profile, isHub: false });
  return generateNeutralArena({ ...input, profile, isHub: false });
}
