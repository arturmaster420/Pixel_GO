const SKILL_INFO = {
  bullets: {
    type: 'mecha',
    tags: ['CORE', 'MECHA', 'SHOT'],
    what: 'Fast forward shots. Reliable single-target core.',
    look: 'Small blue bullets fired straight ahead at your target.',
    scales: 'More damage, better shot power, and extra projectiles on some levels.',
  },
  bombs: {
    type: 'mecha',
    tags: ['MECHA', 'AOE', 'BURST'],
    what: 'Lobs explosive bombs that burst on impact.',
    look: 'Round cyan bombs with a splash explosion.',
    scales: 'More damage, larger blast radius, and faster throws.',
  },
  rockets: {
    type: 'mecha',
    tags: ['RANK 2', 'MECHA', 'AOE'],
    what: 'Fusion upgrade: explosive rockets instead of basic gun+bombs.',
    look: 'Heavier explosive shots with a bigger boom.',
    scales: 'More damage, larger explosion radius, and faster launches.',
  },
  energyBomb: {
    type: 'electric',
    tags: ['RANK 2', 'ELECTRIC', 'AOE'],
    what: 'Fusion bomb that explodes and chains bonus zap damage.',
    look: 'Electric blast with cyan shock flashes and follow-up zaps.',
    scales: 'More damage, more zap damage, larger blast radius, and faster casts.',
  },
  fireBomb: {
    type: 'fire',
    tags: ['RANK 2', 'FIRE', 'BURN'],
    what: 'Fusion bomb that explodes and leaves strong burn damage.',
    look: 'Orange-red explosion with lingering burn effect.',
    scales: 'More damage, stronger burn, larger blast radius, and faster casts.',
  },
  iceBomb: {
    type: 'ice',
    tags: ['RANK 2', 'ICE', 'SLOW'],
    what: 'Fusion bomb that explodes and heavily slows nearby enemies.',
    look: 'Pale-blue icy burst with frost slow on enemies.',
    scales: 'More damage, larger blast radius, stronger slow, and faster casts.',
  },
  satellites: {
    type: 'ice',
    tags: ['ICE', 'ORBIT', 'AUTO'],
    what: 'Orbiting shards circle around you and hit nearby enemies.',
    look: 'Icy satellites spinning around the hero.',
    scales: 'More satellites, faster orbit speed, more damage, and wider orbit.',
  },
  energyBarrier: {
    type: 'light',
    tags: ['LIGHT', 'DEFENSE', 'AUTO'],
    what: 'Protective ring that absorbs hits and pulses damage around you.',
    look: 'Shield-like ring around the hero with periodic pulses.',
    scales: 'More absorb, more pulse damage, and larger ring radius.',
  },
  spirit: {
    type: 'dark',
    tags: ['DARK', 'SUMMON', 'AUTO'],
    what: 'Shadow spirits auto-fire at enemies around you.',
    look: 'Dark floating spirits that shoot on their own.',
    scales: 'More range, faster attacks, more damage, and extra spirits later.',
  },
  summon: {
    type: 'light',
    tags: ['LIGHT', 'SUMMON', 'TANK'],
    what: 'Light wardens soak pressure and help control enemies.',
    look: 'Summoned light units near the hero that hold the line.',
    scales: 'More HP, better defense, faster respawn, and extra wardens later.',
  },
  electricZone: {
    type: 'electric',
    tags: ['ELECTRIC', 'AURA', 'AOE'],
    what: 'Electric ring pulses around you and shocks nearby enemies.',
    look: 'A circular electric aura expanding from the hero.',
    scales: 'Larger radius and stronger pulse damage.',
  },
  laser: {
    type: 'fire',
    tags: ['FIRE', 'BEAM', 'RANGE'],
    what: 'Continuous beam weapon for strong focused damage.',
    look: 'Bright beam line reaching toward enemies.',
    scales: 'More DPS and longer range.',
  },
  lightning: {
    type: 'electric',
    tags: ['CORE', 'ELECTRIC', 'CHAIN'],
    what: 'Electric chain jumps from one enemy to others nearby.',
    look: 'Cyan lightning arcs between targets.',
    scales: 'More damage and more chain targets.',
  },
  fireball: {
    type: 'fire',
    tags: ['CORE', 'FIRE', 'BURN'],
    what: 'Fire projectile that explodes and burns enemies.',
    look: 'Orange fireball with a small fiery blast on hit.',
    scales: 'More damage, bigger splash, stronger burn, and faster casts.',
  },
  iceWall: {
    type: 'ice',
    tags: ['CORE', 'ICE', 'SLOW'],
    what: 'Ice ball that bursts and slows enemies in the hit area.',
    look: 'Pale-blue ice orb with a frost burst on impact.',
    scales: 'More damage, bigger splash, and stronger slow.',
  },
  blackhole: {
    type: 'dark',
    tags: ['DARK', 'DOT', 'ZONE'],
    what: 'Dark singularity that damages enemies inside its area.',
    look: 'Purple-black void zone around the impact point.',
    scales: 'Larger zone, stronger pull/damage, and better uptime.',
  },
  lightHeal: {
    type: 'light',
    tags: ['LIGHT', 'HEAL', 'SUPPORT'],
    what: 'Healing pulse that restores HP around you.',
    look: 'Soft light pulse around the hero.',
    scales: 'More heal, larger radius, and faster pulses.',
  },
  stormStrike: {
    type: 'electric',
    tags: ['ELECTRIC', 'BURST', 'RANGE'],
    what: 'Targeted lightning blast onto enemies at range.',
    look: 'Short electric strike and burst at the target point.',
    scales: 'More damage, larger blast, and faster casts.',
  },
  flameNova: {
    type: 'fire',
    tags: ['FIRE', 'NOVA', 'BURN'],
    what: 'Close-range fire nova around the hero.',
    look: 'Orange-red nova ring erupting from the hero.',
    scales: 'More damage, larger radius, and stronger burn.',
  },
  iceShards: {
    type: 'ice',
    tags: ['ICE', 'VOLLEY', 'RANGE'],
    what: 'Spread volley of icy shards toward enemies.',
    look: 'Fan-shaped pale-blue shard shots.',
    scales: 'More shards, more damage, and faster firing.',
  },
  voidBurst: {
    type: 'dark',
    tags: ['DARK', 'BURST', 'CURSE'],
    what: 'Dark curse blast that damages and weakens enemies.',
    look: 'Purple burst around the target area.',
    scales: 'More damage, larger radius, and faster casts.',
  },
  holyNova: {
    type: 'light',
    tags: ['LIGHT', 'NOVA', 'HEAL'],
    what: 'Holy nova that damages enemies and heals allies.',
    look: 'Bright radial burst centered on the hero.',
    scales: 'More damage, more heal, and larger radius.',
  },
  shrapnelBurst: {
    type: 'mecha',
    tags: ['MECHA', 'NOVA', 'NEW'],
    what: 'Close-range mecha blast around the hero. Great when enemies get near.',
    look: 'Compact cyan shrapnel burst centered on your hero.',
    scales: 'More damage, wider burst radius, and shorter cooldown.',
  },
  railVolley: {
    type: 'mecha',
    tags: ['MECHA', 'BURST', 'NEW'],
    what: 'Heavy ranged rail shot into one target with splash around it.',
    look: 'A hard-hitting cyan strike on the nearest enemy with a small blast.',
    scales: 'More damage, more splash radius, higher splash share, and shorter cooldown.',
  },
  arcSpark: {
    type: 'electric',
    tags: ['ELECTRIC', 'CHAIN', 'NEW'],
    what: 'Hits one enemy, then chains into nearby enemies.',
    look: 'Sharp cyan zap that jumps target to target.',
    scales: 'More damage, longer chain range, more chain targets, and shorter cooldown.',
  },
  staticPulse: {
    type: 'electric',
    tags: ['ELECTRIC', 'NOVA', 'NEW'],
    what: 'Close electric shockwave around the hero that also slows.',
    look: 'A circular cyan pulse exploding out from the hero.',
    scales: 'More damage, larger pulse radius, longer slow, stronger slow, and shorter cooldown.',
  },
  meteorRain: {
    type: 'fire',
    tags: ['FIRE', 'AOE', 'NEW'],
    what: 'Calls several meteors around the nearest pack. Each hit burns.',
    look: 'Multiple fiery impacts raining near enemies.',
    scales: 'More damage, more meteors, larger impact radius, stronger burn, and shorter cooldown.',
  },
  magmaLance: {
    type: 'fire',
    tags: ['FIRE', 'BURST', 'NEW'],
    what: 'Heavy fire strike into one target with burning splash around it.',
    look: 'A focused fiery spear hit with an orange blast around the target.',
    scales: 'More damage, larger splash, stronger burn, better splash share, and shorter cooldown.',
  },
  frostNova: {
    type: 'ice',
    tags: ['ICE', 'NOVA', 'NEW'],
    what: 'Close frost wave around the hero that slows and applies frost.',
    look: 'A pale-blue icy pulse centered on the hero.',
    scales: 'More damage, larger radius, longer frost, stronger slow, and shorter cooldown.',
  },
  crystalSpear: {
    type: 'ice',
    tags: ['ICE', 'BURST', 'NEW'],
    what: 'Heavy ice strike into one target with frost splash around it.',
    look: 'A crystal hit on the target with a small icy detonation.',
    scales: 'More damage, larger splash, longer frost, stronger slow, and shorter cooldown.',
  },
  soulDrain: {
    type: 'dark',
    tags: ['DARK', 'DRAIN', 'NEW'],
    what: 'Single-target dark burst that curses the enemy and heals you.',
    look: 'Purple dark hit on the target with a short drain pulse.',
    scales: 'More damage, more self-heal, longer curse, higher curse level, and shorter cooldown.',
  },
  dreadRing: {
    type: 'dark',
    tags: ['DARK', 'NOVA', 'NEW'],
    what: 'Close curse wave around the hero that damages groups.',
    look: 'Dark-purple ring expanding from the hero.',
    scales: 'More damage, larger ring radius, longer curse, higher curse level, and shorter cooldown.',
  },
  prismRay: {
    type: 'light',
    tags: ['LIGHT', 'BURST', 'NEW'],
    what: 'Light strike into one target with splash damage and a heal pulse.',
    look: 'Bright light hit on the target plus a soft heal pulse around the hero.',
    scales: 'More damage, larger splash, more heal, bigger heal radius, and shorter cooldown.',
  },
  sanctuary: {
    type: 'light',
    tags: ['LIGHT', 'AURA', 'NEW'],
    what: 'Holy zone around the hero that damages nearby enemies and heals allies.',
    look: 'Bright circular sanctuary around the hero.',
    scales: 'More damage, more heal, larger zone/heal radius, and shorter cooldown.',
  },
};

const TYPE_COLORS = {
  mecha: 'rgba(126,194,255,0.95)',
  electric: 'rgba(116,232,255,0.95)',
  fire: 'rgba(255,150,92,0.96)',
  ice: 'rgba(162,220,255,0.96)',
  dark: 'rgba(192,132,255,0.96)',
  light: 'rgba(255,221,122,0.96)',
};

export function getSkillPresentation(key) {
  const k = String(key || '').trim();
  return SKILL_INFO[k] || null;
}

export function getSkillTypeColor(key, fallback = 'rgba(255,255,255,0.92)') {
  const info = getSkillPresentation(key);
  return TYPE_COLORS[String(info?.type || '').toLowerCase()] || fallback;
}

export function getSkillTypeLabel(key) {
  const info = getSkillPresentation(key);
  return String(info?.type || 'misc').toUpperCase();
}

export function getSkillTags(key) {
  const info = getSkillPresentation(key);
  return Array.isArray(info?.tags) ? info.tags.slice() : [];
}

export function getSkillDetailRows(key, level = 0) {
  const info = getSkillPresentation(key);
  if (!info) {
    return {
      title: String(key || 'Skill'),
      typeLabel: 'MISC',
      tags: [],
      color: 'rgba(255,255,255,0.92)',
      rows: [
        { label: 'DOES', value: 'Skill active in current build.' },
        { label: 'LOOK', value: 'Use it in combat to learn its pattern.' },
        { label: 'LEVELS', value: level > 0 ? `Current level ${level}.` : 'Unlock to start leveling it.' },
      ],
    };
  }
  return {
    title: String(key || 'Skill'),
    typeLabel: String(info.type || 'misc').toUpperCase(),
    tags: Array.isArray(info.tags) ? info.tags.slice() : [],
    color: getSkillTypeColor(key),
    rows: [
      { label: 'DOES', value: info.what },
      { label: 'LOOK', value: info.look },
      { label: 'LEVELS', value: info.scales + (level > 0 ? ` Current level: Lv ${Math.max(1, level | 0)}.` : '') },
    ],
  };
}

export function composeSkillUpgradeDescription(key, from = 0, to = 0) {
  const info = getSkillPresentation(key);
  if (!info) return '';
  const lvlText = (from | 0) <= 0
    ? 'Unlocks this skill.'
    : `Lv ${from | 0} → ${Math.max(1, to | 0)}.`;
  return `${lvlText}\nDoes: ${info.what}\nLook: ${info.look}\nLevels: ${info.scales}`;
}
