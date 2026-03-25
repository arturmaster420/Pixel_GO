import { getCoreIdentity, getPassiveRouteMeta, getSkillRouteMeta } from "../../core/starterLoadouts.js";
import { RUN_PASSIVES, RUN_SKILLS } from "../../core/runUpgrades.js";
import { BIOME_ESSENCE_KEYS, ESSENCE_META, getBiomeAccentColor } from "../../core/hubBuild.js";
import { getTotalCardShardCount } from "../../core/cards/cardRewards.js";
import { getCharacterSelection, sameCharacterSelection, setCharacterSelection } from "./hubUiState.js";

let make = null;

export function configureHubViewShared(deps = {}) {
  if (typeof deps.make === 'function') make = deps.make;
}

export function formatCorePassiveBonuses(def) {
  const parts = [];
  const bonuses = def?.passiveBonuses && typeof def.passiveBonuses === "object" ? def.passiveBonuses : {};
  for (const [key, rawAmt] of Object.entries(bonuses)) {
    const amt = Number.isFinite(Number(rawAmt)) ? Math.max(0, Number(rawAmt) | 0) : 0;
    if (amt <= 0) continue;
    const passiveDef = (RUN_PASSIVES || []).find((it) => it && it.key === key);
    parts.push(`+${amt} ${String(passiveDef?.name || key)}`);
  }
  return parts.join(" • ");
}

export function getCoreSkillAffinity(coreKey, skillDef) {
  const core = getCoreIdentity(coreKey);
  const favored = Array.isArray(core?.favoredSkillKeys) ? core.favoredSkillKeys : [];
  const skillKey = String(skillDef?.key || "");
  const skillBiome = String(skillDef?.biome || "neutral");
  const coreBiome = String(core?.biomeKey || "neutral");
  if (favored.includes(skillKey)) return 3;
  if (coreBiome === "neutral" || coreKey === "mecha") return skillBiome === "neutral" ? 2 : 0;
  if (skillBiome === coreBiome) return 2;
  return 0;
}

export function getCorePassiveAffinity(coreKey, passiveKey) {
  const core = getCoreIdentity(coreKey);
  const favored = Array.isArray(core?.favoredPassiveKeys) ? core.favoredPassiveKeys : [];
  if (favored.includes(String(passiveKey || ""))) return 3;
  return 0;
}


export function getGearIconMeta(def) {
  const key = String(def?.key || '');
  const slot = String(def?.slot || 'module');
  const icon = { glyph: slot === 'relic' ? '✦' : (slot === 'coreItem' ? '◉' : '⬡'), accent: '#9fd6ff' };
  if (key.includes('flame')) return { glyph: '△', accent: ESSENCE_META.fire.accent };
  if (key.includes('cryo')) return { glyph: '❄', accent: ESSENCE_META.ice.accent };
  if (key.includes('chain')) return { glyph: '⚡', accent: ESSENCE_META.electric.accent };
  if (key.includes('overclock') || key.includes('reactor')) return { glyph: '⚙', accent: ESSENCE_META.mecha.accent };
  if (key.includes('void') || key.includes('twilight')) return { glyph: '◈', accent: ESSENCE_META.dark.accent };
  if (key.includes('prism') || key.includes('sanctuary') || key.includes('conduit')) return { glyph: '✧', accent: ESSENCE_META.light.accent };
  if (slot === 'relic') return { glyph: '✦', accent: '#ffe08c' };
  if (slot === 'coreItem') return { glyph: '◉', accent: '#b7deff' };
  return icon;
}

export function renderGearIcon(def, size = 34) {
  const meta = getGearIconMeta(def);
  const node = make('div', {
    title: String(def?.name || 'Item'),
    style: {
      width: `${size}px`,
      height: `${size}px`,
      minWidth: `${size}px`,
      borderRadius: '10px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: `${meta.accent}18`,
      border: `1px solid ${meta.accent}66`,
      boxShadow: `0 0 0 1px ${meta.accent}22 inset, 0 6px 14px rgba(0,0,0,0.24)`,
      color: meta.accent,
      fontSize: `${Math.max(14, Math.round(size * 0.48))}px`,
      fontWeight: '700',
      textShadow: '0 1px 0 rgba(0,0,0,0.35)',
    },
  });
  node.textContent = meta.glyph;
  return node;
}

export function renderCharacterChip(label, value, accent = 'rgba(255,255,255,0.16)') {
  return make('div', {
    style: {
      padding: '8px 10px',
      borderRadius: '12px',
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${accent}`,
      minWidth: '110px',
    },
  }, [
    make('div', { text: label, style: { fontSize: '11px', color: 'rgba(210,230,255,0.74)', textTransform: 'uppercase', letterSpacing: '0.06em' } }),
    make('div', { text: value, style: { marginTop: '4px', fontSize: '14px', fontWeight: '700', color: '#f6fbff' } }),
  ]);
}

export function renderCharacterSectionTitle(title, subtitle = '') {
  const wrap = make('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' } });
  wrap.appendChild(make('div', { text: title, style: { fontSize: '14px', fontWeight: '800', color: '#f7f7ff', textTransform: 'uppercase', letterSpacing: '0.08em' } }));
  if (subtitle) wrap.appendChild(make('div', { text: subtitle, style: { fontSize: '12px', lineHeight: '1.4', color: 'rgba(220,228,255,0.76)' } }));
  return wrap;
}

export function renderHeroEquipmentSlot(label, def = null, opts = {}) {
  const accent = opts.accent || 'rgba(255,210,122,0.22)';
  const box = make('div', {
    style: {
      minHeight: '92px',
      borderRadius: '16px',
      padding: '10px',
      border: `1px solid ${def ? 'rgba(255,215,122,0.48)' : 'rgba(255,255,255,0.12)'}`,
      background: def ? 'linear-gradient(180deg, rgba(36,30,18,0.98), rgba(16,19,28,0.98))' : 'linear-gradient(180deg, rgba(16,20,29,0.96), rgba(10,13,20,0.98))',
      boxShadow: `0 0 0 1px ${accent} inset`,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: '8px',
    },
  });
  box.appendChild(make('div', { text: label, style: { fontSize: '11px', color: 'rgba(219,226,255,0.72)', textTransform: 'uppercase', letterSpacing: '0.07em' } }));
  const row = make('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } });
  row.appendChild(def ? renderGearIcon(def, 30) : make('div', { text: '◻', style: { width: '30px', height: '30px', display: 'grid', placeItems: 'center', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.32)', fontSize: '16px' } }));
  const txt = make('div', { style: { flex: '1 1 auto' } });
  txt.appendChild(make('div', { text: def ? def.name : 'Empty Slot', style: { fontSize: '13px', fontWeight: '700', color: def ? '#fff6dd' : 'rgba(232,240,255,0.72)' } }));
  txt.appendChild(make('div', { text: def ? String(def.style || '') : 'Equip at the matching hub wing', style: { marginTop: '3px', fontSize: '11px', color: 'rgba(214,232,255,0.72)', lineHeight: '1.35' } }));
  row.appendChild(txt);
  box.appendChild(row);
  return box;
}


const SKILL_DEF_BY_KEY = Object.fromEntries((RUN_SKILLS || []).filter(Boolean).map((def) => [String(def.key || ''), def]));
const PASSIVE_DEF_BY_KEY = Object.fromEntries((RUN_PASSIVES || []).filter(Boolean).map((def) => [String(def.key || ''), def]));

export function normalizeBiomeFrameKey(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (!key || key === 'neutral' || key === 'station' || key === 'space' || key === 'hub') return 'mecha';
  return ESSENCE_META[key] ? key : 'mecha';
}

export function getFrameAccent(key, fallback = '#b8d9ff') {
  return String(getBiomeAccentColor(normalizeBiomeFrameKey(key), fallback) || fallback);
}

export function getFrameCss(accent, opts = {}) {
  const empty = !!opts.empty;
  const selected = !!opts.selected;
  return {
    border: `1px solid ${empty ? 'rgba(255,255,255,0.12)' : `${accent}${selected ? 'ff' : '88'}`}`,
    background: empty
      ? 'linear-gradient(180deg, rgba(14,18,27,0.96), rgba(9,12,18,0.98))'
      : `linear-gradient(180deg, ${accent}18, rgba(12,16,24,0.98))`,
    boxShadow: selected
      ? `0 0 0 1px ${accent} inset, 0 0 22px ${accent}55`
      : `0 0 0 1px ${empty ? 'rgba(255,255,255,0.04)' : `${accent}33`} inset`,
  };
}

export function getSkillDefByKey(key) {
  return SKILL_DEF_BY_KEY[String(key || '')] || null;
}

export function getPassiveDefByKey(key) {
  return PASSIVE_DEF_BY_KEY[String(key || '')] || null;
}

export function getSkillBiomeKey(key) {
  const def = getSkillDefByKey(key);
  if (def?.biome) return normalizeBiomeFrameKey(def.biome);
  const routeMeta = getSkillRouteMeta(key);
  return normalizeBiomeFrameKey(routeMeta?.route || 'mecha');
}

export function getPassiveBiomeKey(key) {
  const routeMeta = getPassiveRouteMeta(key);
  return normalizeBiomeFrameKey(routeMeta?.route || 'mecha');
}

export function getSkillIconMeta(defOrKey) {
  const def = typeof defOrKey === 'string' ? getSkillDefByKey(defOrKey) : defOrKey;
  const key = String(def?.key || defOrKey || '');
  const biomeKey = getSkillBiomeKey(key);
  const accent = getFrameAccent(biomeKey);
  const glyphMap = {
    bullets: '✦', bombs: '⬢', rockets: '➤', energyBarrier: '🛡', satellites: '❄', spirit: '☾', summon: '✧',
    electricZone: '⚡', laser: '☄', lightning: '↯', fireball: '🔥', iceWall: '❅', blackhole: '◉', lightHeal: '✚',
    stormStrike: '⚡', flameNova: '☀', iceShards: '❄', voidBurst: '◈', holyNova: '✦', shrapnelBurst: '✸',
    railVolley: '➠', arcSpark: '⚡', staticPulse: '⌁', meteorRain: '☄', magmaLance: '△', frostNova: '✷',
    crystalSpear: '◇', soulDrain: '☽', dreadRing: '◎', prismRay: '✧', sanctuary: '⬡', energyBomb: '⚡',
    fireBomb: '🔥', iceBomb: '❄'
  };
  return { accent, glyph: glyphMap[key] || '✦' };
}

export function renderSkillIcon(defOrKey, size = 34) {
  const meta = getSkillIconMeta(defOrKey);
  return make('div', {
    style: {
      width: `${size}px`,
      height: `${size}px`,
      minWidth: `${size}px`,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '12px',
      border: `1px solid ${meta.accent}88`,
      background: `${meta.accent}1c`,
      color: meta.accent,
      fontSize: `${Math.max(14, Math.round(size * 0.46))}px`,
      fontWeight: '800',
      boxShadow: `0 0 0 1px ${meta.accent}22 inset`,
      textShadow: '0 1px 0 rgba(0,0,0,0.35)',
    },
  }, [document.createTextNode(meta.glyph)]);
}

function selectCharacterEntry(state, selection) {
  if (!state) return false;
  const prev = getCharacterSelection(state);
  if (sameCharacterSelection(prev, selection)) return false;
  setCharacterSelection(state, selection);
  return true;
}

export function renderMenuSlot({ label = '', title = '', subtitle = '', accent = '#9fd6ff', icon = null, empty = false, selected = false, onClick = null, badge = '', size = 58, showLabel = true }) {
  const frame = getFrameCss(accent, { empty, selected });
  const hasLabel = !!(showLabel && label);
  const btn = make('button', {
    type: 'button',
    title: title || label || '',
    style: {
      width: `${size}px`,
      minWidth: `${size}px`,
      height: `${size + (hasLabel ? 14 : 0)}px`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: hasLabel ? '4px' : '0',
      borderRadius: '14px',
      cursor: 'pointer',
      padding: hasLabel ? '6px 4px' : '4px',
      position: 'relative',
      color: empty ? 'rgba(220,232,255,0.54)' : '#f6fbff',
      ...frame,
    },
  });
  if (typeof onClick === 'function') btn.addEventListener('click', onClick);
  btn.appendChild(icon || make('div', { text: empty ? '◻' : '⬡', style: { fontSize: '18px', opacity: empty ? '0.42' : '0.92' } }));
  if (hasLabel) btn.appendChild(make('div', { text: label, style: { maxWidth: '100%', fontSize: '10px', lineHeight: '1.05', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.02em' } }));
  if (badge) {
    btn.appendChild(make('div', { text: badge, style: { position: 'absolute', top: '4px', right: '5px', minWidth: '18px', height: '18px', padding: '0 4px', display: 'grid', placeItems: 'center', borderRadius: '999px', background: 'rgba(0,0,0,0.58)', color: '#fff7dc', fontSize: '10px', fontWeight: '800', border: '1px solid rgba(255,255,255,0.08)' } }));
  }
  if (subtitle) btn.appendChild(make('div', { text: subtitle, style: { display: 'none' } }));
  return btn;
}


export function renderWalletBar(container, prog, opts = {}) {
  if (!container) return;
  container.innerHTML = "";
  const compact = !!opts.compact;
  const hideCoins = !!opts.hideCoins;
  const showCardEconomy = !!opts.showCardEconomy;
  const wrap = make("div", { className: "row", style: { gap: compact ? "6px" : "8px", flexWrap: "wrap", alignItems: "center", justifyContent: opts.align === 'right' ? 'flex-end' : 'flex-start' } });
  const coinChip = make("div", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: compact ? "6px" : "8px",
      padding: compact ? "6px 10px" : "8px 12px",
      borderRadius: "999px",
      border: "1px solid rgba(255,215,90,0.34)",
      background: "rgba(255,215,90,0.10)",
      color: "#fff4c7",
      fontSize: compact ? "12px" : "13px",
      boxShadow: "0 0 0 1px rgba(255,215,90,0.08) inset",
    },
  }, [
    make("span", { text: "🪙" }),
    make("span", { text: `${Math.max(0, prog?.coins | 0)}` }),
  ]);
  if (!hideCoins) wrap.appendChild(coinChip);
  for (const key of BIOME_ESSENCE_KEYS) {
    const meta = ESSENCE_META[key] || ESSENCE_META.mecha;
    const count = Math.max(0, prog?.essences?.[key] | 0);
    const chip = make("div", {
      title: meta.label,
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? "6px" : "7px",
        padding: compact ? "6px 9px" : "7px 10px",
        borderRadius: "999px",
        border: `1px solid ${meta.accent}66`,
        background: `${meta.accent}18`,
        color: "#eef8ff",
        fontSize: compact ? "11px" : "12px",
        boxShadow: `0 0 0 1px ${meta.accent}18 inset`,
      },
    });
    const crystal = make("span", {
      style: {
        width: compact ? "10px" : "12px",
        height: compact ? "10px" : "12px",
        display: "inline-block",
        transform: "rotate(45deg)",
        borderRadius: "2px",
        background: meta.accent,
        boxShadow: `0 0 12px ${meta.accent}88`,
      },
    });
    const countEl = make("span", { text: `${count}` });
    chip.appendChild(crystal);
    chip.appendChild(countEl);
    wrap.appendChild(chip);
  }
  if (showCardEconomy) {
    const totalDust = Object.values(prog?.accountProfile?.sharedResources?.raceDust || {}).reduce((sum, value) => sum + Math.max(0, Number(value || 0) || 0), 0);
    const totalShards = getTotalCardShardCount(prog?.accountProfile?.cardCollection);
    const chipStyle = {
      display: "inline-flex",
      alignItems: "center",
      gap: compact ? "6px" : "7px",
      padding: compact ? "6px 9px" : "7px 10px",
      borderRadius: "999px",
      color: "#eef8ff",
      fontSize: compact ? "11px" : "12px",
    };
    wrap.appendChild(make("div", {
      title: "Race Dust",
      style: {
        ...chipStyle,
        border: "1px solid rgba(255,170,122,0.45)",
        background: "rgba(255,170,122,0.12)",
        boxShadow: "0 0 0 1px rgba(255,170,122,0.10) inset",
      },
    }, [make("span", { text: "✹" }), make("span", { text: `${Math.max(0, totalDust | 0)}` })]));
    wrap.appendChild(make("div", {
      title: "Card Shards",
      style: {
        ...chipStyle,
        border: "1px solid rgba(159,214,255,0.45)",
        background: "rgba(159,214,255,0.12)",
        boxShadow: "0 0 0 1px rgba(159,214,255,0.10) inset",
      },
    }, [make("span", { text: "◈" }), make("span", { text: `${Math.max(0, totalShards | 0)}` })]));
  }
  container.appendChild(wrap);
}

