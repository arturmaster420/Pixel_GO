import { getControlMode } from "../core/mouseController.js";
import { biomeByKey } from "../world/biomes.js";
import { MAX_RUN_ACTIVE_SKILLS, RUN_SKILLS, getVisibleOwnedRunSkills } from "../core/runUpgrades.js";
import { getStarterLoadoutDef } from "../core/starterLoadouts.js";
import { getSkillDetailRows, getSkillTags, getSkillTypeColor, getSkillTypeLabel } from "../weapons/skillPresentation.js";
import { BIOME_ESSENCE_KEYS, ESSENCE_META } from "../core/hubBuild.js";


const SKILL_NAME_BY_KEY = (() => {
  const out = Object.create(null);
  for (const def of RUN_SKILLS || []) {
    if (!def || !def.key) continue;
    out[def.key] = String(def.name || def.key);
  }
  return out;
})();

function getSkillName(key) {
  return SKILL_NAME_BY_KEY[String(key || "")] || String(key || "EMPTY");
}

function drawCrystalIcon(ctx, x, y, size, color) {
  const half = size * 0.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI * 0.25);
  ctx.fillStyle = color;
  ctx.fillRect(-half, -half, size, size);
  ctx.restore();
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.strokeRect(x - half * 0.72, y - half * 0.72, size * 0.72, size * 0.72);
}

function drawEssenceWallet(ctx, progression, infoX0, infoX1, infoY) {
  const essenceEntries = BIOME_ESSENCE_KEYS.map((key) => ({
    key,
    count: Math.max(0, progression?.essences?.[key] | 0),
    meta: ESSENCE_META[key] || ESSENCE_META.mecha,
  }));
  const cols = 3;
  const cellW = 42;
  const cellH = 18;
  const gridW = cols * cellW;
  const startX = Math.max(infoX0 + 92, infoX1 - gridW);
  const startY = infoY + 18;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "11px sans-serif";
  for (let i = 0; i < essenceEntries.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * cellW;
    const y = startY + row * cellH;
    const { count, meta } = essenceEntries[i];
    drawCrystalIcon(ctx, x + 6, y + 7, 8, meta.accent);
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.fillText(String(count), x + 14, y + 7);
  }
}

function getBuildSlots(state) {
  const player = state?.player || null;
  const selectedKey = String(player?._selectedStarterLoadout || state?.progression?.selectedStarterLoadout || "mecha");
  const starterDef = getStarterLoadoutDef(selectedKey);
  const starterSkillKey = String(starterDef?.skillKey || "bullets");
  const visible = getVisibleOwnedRunSkills(player, { coreKey: starterSkillKey, maxSlots: MAX_RUN_ACTIVE_SKILLS });
  const slots = visible.map((entry) => ({
    key: entry.key,
    name: getSkillName(entry.key),
    level: Math.max(0, entry.level | 0),
    typeLabel: getSkillTypeLabel(entry.key),
    isCore: !!entry.isCore,
    empty: false,
  }));

  while (slots.length < MAX_RUN_ACTIVE_SKILLS) {
    slots.push({ key: '', name: 'EMPTY SLOT', level: 0, isCore: false, empty: true });
  }

  return slots.slice(0, MAX_RUN_ACTIVE_SKILLS);
}

function formatStatValue(value, digits = 0, suffix = '') {
  if (!Number.isFinite(Number(value))) return '0' + suffix;
  const n = Number(value);
  const fixed = digits > 0 ? n.toFixed(digits) : Math.round(n).toString();
  return fixed + suffix;
}


function wrapTextLines(ctx, text, maxWidth, maxLines = 3) {
  const raw = String(text || '').split(/\n+/);
  const out = [];
  for (const part of raw) {
    const words = String(part || '').split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        out.push(line);
        line = word;
        if (out.length >= maxLines) break;
      } else {
        line = next;
      }
    }
    if (out.length >= maxLines) break;
    if (line) out.push(line);
    if (out.length >= maxLines) break;
  }
  if (out.length > maxLines) return out.slice(0, maxLines);
  return out;
}

function pickDefaultBuildSkillKey(slots) {
  if (!Array.isArray(slots) || !slots.length) return '';
  const firstFilled = slots.find((s) => s && !s.empty && s.key);
  return String(firstFilled?.key || slots[0]?.key || '');
}

export function getStatsData(state) {
  const player = state?.player || null;
  if (!player) return null;
  const critChanceFrac = (player.metaCritChance || 0) + (player.runCritChanceAdd || 0);
  const critChance = critChanceFrac * 100;
  const critDamageBonusFrac = ((player.metaCritDamageMult || 1) * (player.runCritDamageMult || 1) - 1);
  const critDamage = critDamageBonusFrac * 100;
  const lifeSteal = ((player.metaLifeSteal || 0) + (player.runLifeSteal || 0)) * 100;
  const hpRegen = (player.metaHpRegen || 0) + (player.runHpRegen || 0);
  const pickupRadius = (state?.meta?.pickupBonusRadius || 0) + (player.runPickupBonusRadius || 0);
  const xpGain = ((state?.meta?.xpGainMult || 1) * (player.runXpGainMult || 1) - 1) * 100;
  const isLocalPlayer = !!(state?.player && player === state.player);
  const levelXpNeed = isLocalPlayer && typeof player.xpToNext === 'function'
    ? Math.round(player.xpToNext())
    : (Number.isFinite(player.nextLevelXp) && player.nextLevelXp > 0
      ? Math.round(player.nextLevelXp)
      : (typeof player.xpToNext === 'function' ? Math.round(player.xpToNext()) : 0));

  const starterDef = getStarterLoadoutDef(player?._selectedStarterLoadout || state?.progression?.selectedStarterLoadout || 'mecha');
  const coreName = String(starterDef?.name || 'Mecha Core');
  const coreSkillName = String(starterDef?.skillName || getSkillName(starterDef?.skillKey || 'bullets'));
  const coreType = String(player?._starterDamageType || starterDef?.damageType || 'mecha');
  const baseDamage = Number.isFinite(player.damage) ? Number(player.damage) : Number(player.baseDamage || 4);
  const attackSpeed = Number.isFinite(player.attackSpeed) ? Number(player.attackSpeed) : 0;
  const damageTypeMults = player?.runDamageTypeMults && typeof player.runDamageTypeMults === 'object' ? player.runDamageTypeMults : {};
  const passives = player?.runPassives && typeof player.runPassives === 'object' ? player.runPassives : {};
  const coreTypeMult = Number.isFinite(damageTypeMults[coreType]) && damageTypeMults[coreType] > 0 ? Number(damageTypeMults[coreType]) : 1;
  const critFactor = 1 + Math.max(0, critChanceFrac) * Math.max(0, critDamageBonusFrac);
  const dps = Math.max(0, baseDamage) * Math.max(0, coreTypeMult) * Math.max(0, attackSpeed) * critFactor;

  const damageTypes = [
    { key: 'mecha', label: 'Mecha ATK' },
    { key: 'electric', label: 'Electric ATK' },
    { key: 'fire', label: 'Fire ATK' },
    { key: 'ice', label: 'Ice ATK' },
    { key: 'light', label: 'Light ATK' },
    { key: 'dark', label: 'Dark ATK' },
  ];
  const affinities = [
    { key: 'affElectric', label: 'Electric Affinity' },
    { key: 'affFire', label: 'Fire Affinity' },
    { key: 'affIce', label: 'Ice Affinity' },
    { key: 'affLight', label: 'Light Affinity' },
    { key: 'affDark', label: 'Dark Affinity' },
  ];

  const typeRows = damageTypes.map(({ key, label }) => {
    const mult = Number.isFinite(damageTypeMults[key]) && damageTypeMults[key] > 0 ? Number(damageTypeMults[key]) : 1;
    const effective = baseDamage * mult;
    return { label, value: `${formatStatValue(effective, 1)} (x${mult.toFixed(2)})` };
  });
  const affinityRows = affinities.map(({ key, label }) => ({
    label,
    value: `Lv ${Math.max(0, passives[key] | 0)}`,
  }));

  const mainRows = [
    { label: 'Level', value: String(Math.max(0, player.level | 0)) },
    { label: 'Skill Points', value: String(Math.max(0, player.skillPoints | 0)) },
    { label: 'HP', value: `${Math.max(0, Math.round(player.hp || 0))}/${Math.max(1, Math.round(player.maxHP || 1))}` },
    { label: 'DPS', value: formatStatValue(dps, 1) },
    { label: 'HP/s', value: formatStatValue(hpRegen, 2) },
    { label: 'Damage', value: formatStatValue(baseDamage, 1) },
    { label: 'Attack Speed', value: formatStatValue(attackSpeed, 2, '/s') },
    { label: 'Move Speed', value: formatStatValue(player.moveSpeed || 0, 0) },
    { label: 'Range', value: formatStatValue(player.range || 0, 2, 'x') },
    { label: 'Crit Chance', value: formatStatValue(critChance, 1, '%') },
    { label: 'Crit Damage', value: formatStatValue(critDamage, 0, '%') },
  ];

  const allRows = [
    ...mainRows,
    { label: 'Life Steal', value: formatStatValue(lifeSteal, 1, '%') },
    { label: 'Pickup Radius', value: formatStatValue(pickupRadius, 0) },
    { label: 'XP Gain', value: formatStatValue(xpGain, 1, '%') },
    { label: 'XP', value: levelXpNeed > 0 ? `${Math.max(0, Math.round(player.xp || 0))}/${levelXpNeed}` : String(Math.max(0, Math.round(player.xp || 0))) },
    { section: 'CORE & TYPE' },
    { label: 'Hero Core', value: coreName },
    { label: 'Hero Signature', value: coreSkillName },
    { label: 'Race Type', value: coreType.toUpperCase() },
    ...typeRows,
    { section: 'AFFINITIES' },
    ...affinityRows,
  ];

  return { mainRows, allRows };
}

function getCurrentStatsRows(state, expanded = false) {
  const data = getStatsData(state);
  if (!data) return [];
  return expanded ? data.allRows : data.mainRows;
}

function drawHudButton(ctx, active, label, x, y, width, height, uiScale, rectFieldName, accent = 'rgba(126,194,255,0.88)') {
  ctx.save();
  ctx.fillStyle = active ? accent : 'rgba(10,14,22,0.82)';
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = active ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.28)';
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.font = width < 100 ? 'bold 11px sans-serif' : 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + width * 0.5, y + height * 0.5 + 0.5);
  ctx.restore();
  return { x: x * uiScale, y: y * uiScale, w: width * uiScale, h: height * uiScale };
}

function isHubHudNavState(state) {
  const room = state?.player?.room || null;
  const spec = room?.arenaSpec || null;
  return !!(spec?.rules?.isHub) || String(room?.biomeKey || '').toLowerCase() === 'hub' || ((room?.index | 0) === 0);
}

function drawBuildButton(ctx, state, scaledW, topPanelH, uiScale) {
  if (isHubHudNavState(state)) { state._buildButtonRect = null; return; }
  const width = scaledW < 900 ? 96 : 112;
  const height = scaledW < 900 ? 28 : 30;
  const x = scaledW - width - 14;
  const y = topPanelH + 10;
  const active = !!state?._buildPanelOpen;

  ctx.save();
  ctx.fillStyle = active ? 'rgba(76, 150, 255, 0.88)' : 'rgba(10,14,22,0.82)';
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = active ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.28)';
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);

  const dot = 5;
  const gap = 3;
  const iconX = x + 10;
  const iconY = y + (height - (dot * 2 + gap)) * 0.5;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      ctx.fillRect(iconX + col * (dot + gap), iconY + row * (dot + gap), dot, dot);
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.font = scaledW < 900 ? 'bold 11px sans-serif' : 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('BUILD', x + 34, y + height * 0.5 + 0.5);
  ctx.restore();

  state._buildButtonRect = { x: x * uiScale, y: y * uiScale, w: width * uiScale, h: height * uiScale };
}

function drawStatsButton(ctx, state, scaledW, topPanelH, uiScale) {
  if (isHubHudNavState(state)) { state._statsButtonRect = null; return; }
  const width = scaledW < 900 ? 96 : 112;
  const height = scaledW < 900 ? 28 : 30;
  const x = scaledW - width - 14;
  const y = topPanelH + 46;
  const active = !!state?._statsPanelOpen;
  state._statsButtonRect = drawHudButton(ctx, active, 'HERO', x, y, width, height, uiScale, '_statsButtonRect', 'rgba(123, 104, 238, 0.88)');
}

function drawBuildPanel(ctx, state, scaledW, scaledH, topPanelH, uiScale) {
  if (!state?._buildPanelOpen) {
    state._buildPanelRect = null;
    state._buildPanelCloseRect = null;
    state._buildSlotRects = null;
    return;
  }

  const slots = getBuildSlots(state);
  const panelW = Math.min(430, Math.max(320, scaledW * 0.32));
  const panelH = 454;
  const x = scaledW - panelW - 14;
  const y = topPanelH + 48;
  const closeSize = 26;

  const currentSelected = String(state._buildPanelSelectedKey || '');
  const slotKeys = new Set(slots.filter((s) => s && !s.empty && s.key).map((s) => String(s.key)));
  if (!currentSelected || !slotKeys.has(currentSelected)) {
    state._buildPanelSelectedKey = pickDefaultBuildSkillKey(slots);
  }
  const selectedKey = String(state._buildPanelSelectedKey || '');
  const selectedSlot = slots.find((s) => s && String(s.key || '') === selectedKey) || slots[0] || null;
  const detail = getSkillDetailRows(selectedKey, selectedSlot?.level || 0);

  ctx.save();
  ctx.fillStyle = 'rgba(7,10,16,0.94)';
  ctx.fillRect(x, y, panelW, panelH);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.strokeRect(x + 0.5, y + 0.5, panelW - 1, panelH - 1);
  ctx.fillStyle = 'rgba(126,194,255,0.95)';
  ctx.fillRect(x, y, panelW, 4);

  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('CURRENT BUILD', x + 16, y + 14);

  ctx.fillStyle = 'rgba(255,255,255,0.58)';
  ctx.font = '12px sans-serif';
  ctx.fillText('Tap a slot to inspect what it does, how it looks, and what levels improve.', x + 16, y + 38);

  const closeX = x + panelW - closeSize - 10;
  const closeY = y + 10;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(closeX, closeY, closeSize, closeSize);
  ctx.strokeStyle = 'rgba(255,255,255,0.26)';
  ctx.strokeRect(closeX + 0.5, closeY + 0.5, closeSize - 1, closeSize - 1);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('×', closeX + closeSize * 0.5, closeY + closeSize * 0.5 + 0.5);

  const slotX = x + 16;
  const slotW = panelW - 32;
  const slotH = 28;
  const slotGap = 6;
  let slotY = y + 68;
  const slotRects = [];

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const isCore = !!slot.isCore;
    const label = isCore ? 'CORE' : `SLOT ${i}`;
    const selected = !!selectedKey && !slot.empty && String(slot.key || '') === selectedKey;
    const accent = slot.empty ? 'rgba(255,255,255,0.18)' : getSkillTypeColor(slot.key, isCore ? 'rgba(126,194,255,0.95)' : 'rgba(255,255,255,0.55)');

    ctx.fillStyle = selected ? 'rgba(255,255,255,0.11)' : (slot.empty ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)');
    ctx.fillRect(slotX, slotY, slotW, slotH);
    ctx.strokeStyle = selected ? accent : (isCore ? 'rgba(126,194,255,0.45)' : 'rgba(255,255,255,0.14)');
    ctx.strokeRect(slotX + 0.5, slotY + 0.5, slotW - 1, slotH - 1);

    ctx.fillStyle = accent;
    ctx.fillRect(slotX, slotY, 4, slotH);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = slot.empty ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.92)';
    ctx.font = isCore ? 'bold 12px sans-serif' : '12px sans-serif';
    ctx.fillText(slot.name, slotX + 14, slotY + slotH * 0.5);

    ctx.fillStyle = 'rgba(255,255,255,0.50)';
    ctx.font = '10px sans-serif';
    ctx.fillText(slot.empty ? label : `${label} · ${String(slot.typeLabel || 'MISC')}`, slotX + slotW - 126, slotY + slotH * 0.5);

    if (!slot.empty) {
      ctx.textAlign = 'right';
      ctx.fillStyle = selected ? accent : 'rgba(255,255,255,0.88)';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`Lv ${Math.max(1, slot.level | 0)}`, slotX + slotW - 10, slotY + slotH * 0.5);
      slotRects.push({ x: slotX * uiScale, y: slotY * uiScale, w: slotW * uiScale, h: slotH * uiScale, key: slot.key });
    }

    slotY += slotH + slotGap;
  }

  const detailX = x + 16;
  const detailY = slotY + 10;
  const detailW = panelW - 32;
  const detailH = panelH - (detailY - y) - 16;
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(detailX, detailY, detailW, detailH);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.strokeRect(detailX + 0.5, detailY + 0.5, detailW - 1, detailH - 1);

  ctx.fillStyle = detail.color || 'rgba(255,255,255,0.92)';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(selectedSlot?.name || 'Skill Info', detailX + 12, detailY + 12);

  const tags = Array.isArray(detail.tags) ? detail.tags : [];
  let tagX = detailX + 12;
  let tagY = detailY + 34;
  ctx.font = '10px sans-serif';
  for (const tag of tags) {
    const txt = String(tag || '').trim();
    if (!txt) continue;
    const tw = Math.ceil(ctx.measureText(txt).width) + 14;
    if (tagX + tw > detailX + detailW - 12) { tagX = detailX + 12; tagY += 18; }
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(tagX, tagY, tw, 16);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.strokeRect(tagX + 0.5, tagY + 0.5, tw - 1, 15);
    ctx.fillStyle = detail.color || 'rgba(255,255,255,0.92)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, tagX + tw * 0.5, tagY + 8.5);
    tagX += tw + 6;
  }

  let infoY = tagY + 26;
  const valueX = detailX + 78;
  for (const row of (detail.rows || [])) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = detail.color || 'rgba(255,255,255,0.92)';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(String(row.label || ''), detailX + 12, infoY);

    ctx.fillStyle = 'rgba(255,255,255,0.84)';
    ctx.font = '12px sans-serif';
    const lines = wrapTextLines(ctx, row.value || '', detailW - (valueX - detailX) - 12, 3);
    for (let li = 0; li < lines.length; li++) {
      ctx.fillText(lines[li], valueX, infoY + li * 14);
    }
    infoY += Math.max(20, lines.length * 14 + 6);
  }

  ctx.restore();

  state._buildPanelRect = { x: x * uiScale, y: y * uiScale, w: panelW * uiScale, h: panelH * uiScale };
  state._buildPanelCloseRect = { x: closeX * uiScale, y: closeY * uiScale, w: closeSize * uiScale, h: closeSize * uiScale };
  state._buildSlotRects = slotRects;
}


function drawStatsPanel(ctx, state, scaledW, scaledH, topPanelH, uiScale) {
  if (!state?._statsPanelOpen) {
    state._statsPanelRect = null;
    state._statsPanelCloseRect = null;
    state._statsPanelToggleRect = null;
    return;
  }

  const expanded = !!state?._statsPanelExpanded;
  const rows = getCurrentStatsRows(state, expanded);
  const dense = rows.length >= 18;
  const panelW = Math.min(430, Math.max(320, scaledW * 0.33));
  const rowH = dense ? 18 : 22;
  const rowGap = dense ? 2 : 4;
  const headerH = 102;
  const panelH = Math.min(scaledH - (topPanelH + 64), Math.max(expanded ? 360 : 320, headerH + rows.length * (rowH + rowGap)));
  const x = scaledW - panelW - 14;
  const y = topPanelH + 84;
  const closeSize = 26;

  ctx.save();
  ctx.fillStyle = 'rgba(7,10,16,0.94)';
  ctx.fillRect(x, y, panelW, panelH);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.strokeRect(x + 0.5, y + 0.5, panelW - 1, panelH - 1);
  ctx.fillStyle = 'rgba(160,132,255,0.95)';
  ctx.fillRect(x, y, panelW, 4);

  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('CURRENT STATS', x + 16, y + 14);

  ctx.fillStyle = 'rgba(255,255,255,0.58)';
  ctx.font = '12px sans-serif';
  ctx.fillText(expanded ? 'Main stats + full breakdown' : 'Main stats only', x + 16, y + 38);

  const closeX = x + panelW - closeSize - 10;
  const closeY = y + 10;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(closeX, closeY, closeSize, closeSize);
  ctx.strokeStyle = 'rgba(255,255,255,0.26)';
  ctx.strokeRect(closeX + 0.5, closeY + 0.5, closeSize - 1, closeSize - 1);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('×', closeX + closeSize * 0.5, closeY + closeSize * 0.5 + 0.5);

  const toggleW = 88;
  const toggleH = 24;
  const toggleX = closeX - toggleW - 10;
  const toggleY = y + 11;
  ctx.fillStyle = expanded ? 'rgba(160,132,255,0.88)' : 'rgba(255,255,255,0.08)';
  ctx.fillRect(toggleX, toggleY, toggleW, toggleH);
  ctx.strokeStyle = expanded ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.26)';
  ctx.strokeRect(toggleX + 0.5, toggleY + 0.5, toggleW - 1, toggleH - 1);
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(expanded ? 'SHOW MAIN' : 'SHOW ALL', toggleX + toggleW * 0.5, toggleY + toggleH * 0.5 + 0.5);

  let rowY = y + headerH;
  const rowX = x + 16;
  const rowW = panelW - 32;
  let stripeIndex = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const isSection = !!row.section;
    const drawH = isSection ? (dense ? 16 : 20) : rowH;
    if (rowY + drawH > y + panelH - 12) break;
    if (isSection) {
      ctx.fillStyle = 'rgba(160,132,255,0.16)';
      ctx.fillRect(rowX, rowY - 1, rowW, drawH + 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(194,176,255,0.94)';
      ctx.font = dense ? 'bold 10px sans-serif' : 'bold 11px sans-serif';
      ctx.fillText(String(row.section || ''), rowX + 10, rowY + drawH * 0.5);
      rowY += drawH + rowGap;
      continue;
    }
    if ((stripeIndex % 2) === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(rowX, rowY - 2, rowW, rowH + 4);
    }
    stripeIndex += 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.66)';
    ctx.font = dense ? '11px sans-serif' : '12px sans-serif';
    ctx.fillText(String(row.label || ''), rowX + 10, rowY + rowH * 0.5);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = dense ? 'bold 11px sans-serif' : 'bold 12px sans-serif';
    ctx.fillText(String(row.value || ''), rowX + rowW - 10, rowY + rowH * 0.5);
    rowY += rowH + rowGap;
  }

  ctx.restore();

  state._statsPanelRect = { x: x * uiScale, y: y * uiScale, w: panelW * uiScale, h: panelH * uiScale };
  state._statsPanelCloseRect = { x: closeX * uiScale, y: closeY * uiScale, w: closeSize * uiScale, h: closeSize * uiScale };
  state._statsPanelToggleRect = { x: toggleX * uiScale, y: toggleY * uiScale, w: toggleW * uiScale, h: toggleH * uiScale };
}

function clamp01(n) {
  return n < 0 ? 0 : (n > 1 ? 1 : n);
}

function biomeAccentColor(key) {
  const biome = biomeByKey(key);
  return biome?.accent || "#7ec2ff";
}

function biomeNameUpper(key, fallback = "NEUTRAL") {
  const biome = biomeByKey(key);
  return biome ? String(biome.name || fallback).toUpperCase() : fallback;
}

function encounterLabelUpper(state) {
  return String(state?._roomEncounterLabel || '').toUpperCase();
}

function ensureRoomBannerState(state) {
  if (!state) return null;
  const roomIdx = (state.currentRoomIndex != null ? (state.currentRoomIndex | 0) : 0);
  const floorNo = (state._floorNumber | 0) || 0;
  const roomOrd = (state._floorRoomOrdinal | 0) || 0;
  const roomsTot = (state._floorRoomsTotal | 0) || 0;
  const rd = state.roomDirector || null;
  const currentBiomeKey = String(state._floorBiome || state._roomBiome || rd?.current?.biomeKey || "").toLowerCase();
  const key = `${roomIdx}:${floorNo}:${roomOrd}:${currentBiomeKey}`;
  if (state._hudRoomBannerKey !== key) {
    state._hudRoomBannerKey = key;
    const nextBiomeKey = String(state._nextRoomBiome || rd?.next?.biomeKey || currentBiomeKey || "").toLowerCase();
    const isHub = roomIdx <= 0 || floorNo <= 0;
    state._hudRoomBannerUntil = (state.time || 0) + (isHub ? 2.0 : 2.4);
    state._hudRoomBanner = {
      title: isHub ? "HUB" : `ЭТАЖ ${floorNo}`,
      subtitle: isHub ? "CENTRAL STATION" : `${biomeNameUpper(currentBiomeKey)} • ${encounterLabelUpper(state) || 'ВОЛНЫ'} • КОМНАТА ${roomOrd}/${Math.max(roomOrd, roomsTot)}`,
      detail: isHub
        ? "Портал запускает новый ран"
        : (state._floorExitActive ? "ПЕРЕХОД НА СЛЕДУЮЩИЙ ЭТАЖ ОТКРЫТ" : (nextBiomeKey ? `ДАЛЬШЕ → ${Math.min((roomOrd || 1) + 1, Math.max(roomOrd, roomsTot))}/${Math.max(roomOrd, roomsTot)} • ${biomeNameUpper(nextBiomeKey, 'NEUTRAL')}` : "")),
      accent: biomeAccentColor(currentBiomeKey),
    };
  }
  return state._hudRoomBanner || null;
}


function roundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(Number(r) || 0, w * 0.5, h * 0.5));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fillRoundedRect(ctx, x, y, w, h, r, fillStyle, strokeStyle = null, lineWidth = 1) {
  ctx.save();
  roundedRectPath(ctx, x, y, w, h, r);
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
  }
  ctx.restore();
}

function measureTopHudChip(ctx, text, { font = 'bold 11px sans-serif', padX = 10, minW = 0, accent = false } = {}) {
  ctx.save();
  ctx.font = font;
  const textW = ctx.measureText(String(text || '')).width;
  ctx.restore();
  return Math.max(minW, Math.ceil(textW + padX * 2 + (accent ? 10 : 0)));
}

function drawTopHudChip(ctx, x, y, w, h, text, {
  fill = 'rgba(255,255,255,0.08)',
  stroke = 'rgba(255,255,255,0.14)',
  textColor = 'rgba(255,255,255,0.94)',
  font = 'bold 11px sans-serif',
  accent = '',
} = {}) {
  fillRoundedRect(ctx, x, y, w, h, Math.min(12, h * 0.5), fill, stroke, 1);
  if (accent) {
    ctx.save();
    ctx.fillStyle = accent;
    fillRoundedRect(ctx, x + 3, y + 3, 5, h - 6, 3, accent, null, 0);
    ctx.restore();
  }
  ctx.save();
  ctx.fillStyle = textColor;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text || ''), x + w * 0.5 + (accent ? 3 : 0), y + h * 0.5 + 0.5);
  ctx.restore();
}

function drawCompactEssenceWalletInline(ctx, progression, x, y, { compact = false, draw = true } = {}) {
  const entries = BIOME_ESSENCE_KEYS.map((key) => ({
    key,
    count: Math.max(0, progression?.essences?.[key] | 0),
    meta: ESSENCE_META[key] || ESSENCE_META.mecha,
  }));

  if (compact) {
    const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.count | 0), 0);
    const text = `Σ ${total}`;
    ctx.save();
    ctx.font = 'bold 10px sans-serif';
    const textW = ctx.measureText(text).width;
    ctx.restore();
    const width = 12 + 6 + textW;
    if (draw) {
      drawCrystalIcon(ctx, x + 4, y + 8, 8, 'rgba(126,194,255,0.96)');
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + 12, y + 8);
      ctx.restore();
    }
    return width;
  }

  let cursor = x;
  for (const entry of entries) {
    ctx.save();
    ctx.font = 'bold 10px sans-serif';
    const countText = String(entry.count);
    const textW = ctx.measureText(countText).width;
    ctx.restore();
    const width = 12 + 4 + textW;
    if (draw) {
      drawCrystalIcon(ctx, cursor + 4, y + 8, 8, entry.meta.accent);
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.90)';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(countText, cursor + 12, y + 8);
      ctx.restore();
    }
    cursor += width + 6;
  }
  return Math.max(0, cursor - x - 6);
}

function drawRoomEntryBanner(ctx, state, scaledW, topPanelH) {
  const banner = ensureRoomBannerState(state);
  const until = Number(state?._hudRoomBannerUntil) || 0;
  const now = Number(state?.time) || 0;
  if (!banner || until <= now) return;

  const remain = until - now;
  const fade = remain > 0.55 ? 1 : Math.max(0, Math.min(1, remain / 0.55));
  const width = Math.min(420, Math.max(260, scaledW * 0.34));
  const height = banner.detail ? 84 : 68;
  const x = (scaledW - width) * 0.5;
  const y = topPanelH + 18;

  ctx.save();
  ctx.globalAlpha = 0.94 * fade;
  ctx.fillStyle = "rgba(8,12,18,0.78)";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);

  ctx.fillStyle = banner.accent || "#7ec2ff";
  ctx.fillRect(x, y, width, 4);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.font = "bold 20px sans-serif";
  ctx.fillText(String(banner.title || ""), x + width * 0.5, y + 12);

  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = "12px sans-serif";
  ctx.fillText(String(banner.subtitle || ""), x + width * 0.5, y + 40);

  if (banner.detail) {
    ctx.fillStyle = "rgba(255,255,255,0.60)";
    ctx.font = "11px sans-serif";
    ctx.fillText(String(banner.detail), x + width * 0.5, y + 58);
  }
  ctx.restore();
}

export function renderHUD(ctx, state) {
  const canvas = state.canvas;
  const player = state.player;
  const progression = state.progression;
  const buffs = state.buffs || [];

  const w = canvas.width;
  const h = canvas.height;

  ctx.save();

  const minSide = Math.min(w, h);
  const uiScale = minSide < 700 ? 0.7 : 1.0;
  ctx.scale(uiScale, uiScale);

  const invScale = 1 / uiScale;
  const scaledW = w * invScale;
  const scaledH = h * invScale;

  const btnSize = scaledW < 900 ? 36 : 40;
  const margin = scaledW < 900 ? 10 : 14;
  const stripY = 8;
  const stripH = scaledW < 900 ? 28 : 32;
  const stripX = margin;
  const pauseX = scaledW - btnSize - margin;
  const pauseY = stripY;
  const stripW = Math.max(220, pauseX - stripX - 8);
  const chipH = Math.max(18, stripH - 8);
  const chipY = stripY + Math.round((stripH - chipH) * 0.5);
  const stripInnerX = stripX + 8;
  const stripInnerRight = stripX + stripW - 8;

  const barsY = stripY + stripH + 8;
  const hpH = scaledW < 900 ? 18 : 20;
  const xpH = scaledW < 900 ? 16 : 18;
  const barGap = 5;
  const topPanelH = barsY + hpH + barGap + xpH + 4;

  const coins = progression && typeof progression.coins === "number" ? Math.floor(progression.coins) : 0;
  const coinText = `${coins}`;
  const iconR = 6;

  let roomState = "SOLO";
  try {
    const net = state.net;
    const rc = (
      (net && net.roomCode) ? net.roomCode :
      (progression && progression.roomCode) ? progression.roomCode :
      ""
    ).toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

    if (net && net.status === "connected") {
      if (rc) {
        const count = Array.isArray(net.roomPlayers) ? net.roomPlayers.length : 0;
        roomState = (net.isHost && count <= 1) ? "OPEN" : rc;
      } else {
        roomState = "OPEN";
      }
    } else {
      roomState = "SOLO";
    }
  } catch {}

  const roomIdx = (state.currentRoomIndex != null ? (state.currentRoomIndex | 0) : 0);
  const rd = state.roomDirector || null;
  const floorNo = (state._floorNumber | 0) || 0;
  const roomOrd = (state._floorRoomOrdinal | 0) || 0;
  const roomsTot = (state._floorRoomsTotal | 0) || 0;
  const currentBiomeKey = String(state._floorBiome || state._roomBiome || rd?.current?.biomeKey || '').toLowerCase();
  const currentBiome = biomeByKey(currentBiomeKey);
  const floorLabel = roomIdx <= 0 || floorNo <= 0 ? 'HUB' : `ЭТАЖ ${floorNo}`;
  const roomLabel = roomIdx <= 0 || floorNo <= 0 ? 'СТАНЦИЯ' : `КОМНАТА ${Math.max(1, roomOrd)}/${Math.max(Math.max(1, roomOrd), Math.max(1, roomsTot))}`;
  const biomeLabel = currentBiome ? String(currentBiome.name || '').toUpperCase() : 'NEUTRAL';
  const accent = biomeAccentColor(currentBiomeKey || 'mecha');

  // v0.6.26: remove the old full-width top backdrop.
  // Keep only compact chips so the HUD no longer looks like a thick legacy wallet window.

  const showLobbyChip = stripW >= 620;
  const showBiomeChip = stripW >= 540 && roomIdx > 0;

  const goldChipText = coinText;
  const goldChipW = Math.max(chipH + 24, measureTopHudChip(ctx, goldChipText, { font: 'bold 11px sans-serif', padX: 14 }));
  const roomStateW = showLobbyChip ? measureTopHudChip(ctx, roomState, { font: 'bold 11px sans-serif', padX: 12, accent: true }) : 0;
  const walletW = drawCompactEssenceWalletInline(ctx, progression, 0, 0, { compact: true, draw: false });

  let rightCursor = stripInnerRight;

  if (walletW > 0) {
    const walletChipW = Math.max(walletW + 14, chipH + 24);
    const walletX = rightCursor - walletChipW;
    fillRoundedRect(ctx, walletX, chipY, walletChipW, chipH, Math.min(11, chipH * 0.5), 'rgba(126,194,255,0.10)', 'rgba(126,194,255,0.22)', 1);
    drawCompactEssenceWalletInline(ctx, progression, walletX + 7, chipY + Math.max(0, Math.floor((chipH - 16) * 0.5)), { compact: true, draw: true });
    rightCursor = walletX - 10;
  }

  const goldChipX = rightCursor - goldChipW;
  fillRoundedRect(ctx, goldChipX, chipY, goldChipW, chipH, Math.min(11, chipH * 0.5), 'rgba(255,215,90,0.12)', 'rgba(255,215,90,0.26)', 1);
  ctx.save();
  ctx.fillStyle = 'rgba(255,215,90,0.96)';
  ctx.beginPath();
  ctx.arc(goldChipX + 12, chipY + chipH * 0.5, iconR - 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.32)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(goldChipText, goldChipX + 22, chipY + chipH * 0.5 + 0.5);
  ctx.restore();
  rightCursor = goldChipX - 8;

  if (showLobbyChip) {
    const lobbyX = rightCursor - roomStateW;
    drawTopHudChip(ctx, lobbyX, chipY, roomStateW, chipH, roomState, {
      fill: 'rgba(126,194,255,0.10)',
      stroke: 'rgba(126,194,255,0.22)',
      accent: 'rgba(126,194,255,0.96)',
      font: 'bold 11px sans-serif',
    });
    rightCursor = lobbyX - 8;
  }

  let leftCursor = stripInnerX;
  const floorChipW = measureTopHudChip(ctx, floorLabel, { font: 'bold 11px sans-serif', padX: 12, accent: true });
  drawTopHudChip(ctx, leftCursor, chipY, floorChipW, chipH, floorLabel, {
    fill: 'rgba(255,255,255,0.08)',
    stroke: 'rgba(255,255,255,0.14)',
    accent,
    font: 'bold 11px sans-serif',
  });
  leftCursor += floorChipW + 8;

  if (showBiomeChip) {
    const biomeChipW = measureTopHudChip(ctx, biomeLabel, { font: 'bold 11px sans-serif', padX: 12 });
    if (leftCursor + biomeChipW < rightCursor - 96) {
      drawTopHudChip(ctx, leftCursor, chipY, biomeChipW, chipH, biomeLabel, {
        fill: 'rgba(255,255,255,0.06)',
        stroke: 'rgba(255,255,255,0.10)',
        font: 'bold 11px sans-serif',
      });
      leftCursor += biomeChipW + 8;
    }
  }

  const roomChipW = measureTopHudChip(ctx, roomLabel, { font: 'bold 11px sans-serif', padX: 12 });
  if (leftCursor + roomChipW < rightCursor - 18) {
    drawTopHudChip(ctx, leftCursor, chipY, roomChipW, chipH, roomLabel, {
      fill: 'rgba(255,255,255,0.06)',
      stroke: 'rgba(255,255,255,0.10)',
      font: 'bold 11px sans-serif',
    });
  }

  const hpX = margin;
  const hpY = barsY;
  const hpW = Math.max(100, scaledW - margin * 2);
  const hpRatio = clamp01(player.maxHP > 0 ? (player.hp / player.maxHP) : 0);
  fillRoundedRect(ctx, hpX, hpY, hpW, hpH, Math.min(10, hpH * 0.5), 'rgba(8,11,18,0.78)', 'rgba(255,255,255,0.10)', 1);
  fillRoundedRect(ctx, hpX + 1, hpY + 1, Math.max(0, (hpW - 2) * hpRatio), Math.max(0, hpH - 2), Math.min(9, (hpH - 2) * 0.5), 'rgba(255,75,110,0.28)', null, 0);
  fillRoundedRect(ctx, hpX + 1, hpY + 1, Math.max(14, (hpW - 2) * hpRatio), 3, 2, '#ff4b6e', null, 0);
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const hpNow = Math.max(0, Math.round(player.hp));
  const hpMax = Math.max(1, Math.round(player.maxHP));
  ctx.fillText(`HP ${hpNow}/${hpMax}`, hpX + 10, hpY + hpH * 0.5 + 0.5);
  ctx.restore();

  let xpNeed = 0;
  try {
    const preferLocalCurve = !!(state?.player && player === state.player && typeof player.xpToNext === 'function');
    xpNeed = preferLocalCurve
      ? Math.round(player.xpToNext())
      : (Number.isFinite(player.nextLevelXp) && player.nextLevelXp > 0
        ? Math.round(player.nextLevelXp)
        : (typeof player.xpToNext === 'function' ? Math.round(player.xpToNext()) : 0));
  } catch (e) {
    xpNeed = 0;
  }
  const xpNow = Math.max(0, Math.round(player.xp || 0));
  const xpRatio = clamp01(xpNeed > 0 ? (xpNow / xpNeed) : 0);
  const upMinW = scaledW < 900 ? 112 : 136;
  const upMaxW = scaledW < 900 ? 168 : 220;
  const upW = Math.min(upMaxW, Math.max(upMinW, Math.round(scaledW * 0.18)));
  const upH = xpH;
  const upX = scaledW - upW - margin;
  const upY = hpY + hpH + barGap;
  const xpX = margin;
  const xpY = upY;
  const xpW = Math.max(100, upX - xpX - 8);

  fillRoundedRect(ctx, xpX, xpY, xpW, xpH, Math.min(9, xpH * 0.5), 'rgba(8,11,18,0.76)', 'rgba(255,255,255,0.10)', 1);
  fillRoundedRect(ctx, xpX + 1, xpY + 1, Math.max(0, (xpW - 2) * xpRatio), Math.max(0, xpH - 2), Math.min(8, (xpH - 2) * 0.5), 'rgba(59,209,255,0.24)', null, 0);
  fillRoundedRect(ctx, xpX + 1, xpY + 1, Math.max(14, (xpW - 2) * xpRatio), 3, 2, '#3bd1ff', null, 0);
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const lvlText = `LVL ${player.level}`;
  const xpText = xpNeed > 0 ? ` • ${xpNow}/${xpNeed}` : '';
  ctx.fillText(lvlText + xpText, xpX + 10, xpY + xpH * 0.5 + 0.5);
  ctx.restore();

  const sp = (player.skillPoints | 0) || 0;
  fillRoundedRect(ctx, upX, upY, upW, upH, Math.min(9, upH * 0.5), 'rgba(25,31,49,0.92)', 'rgba(126,194,255,0.26)', 1);
  fillRoundedRect(ctx, upX + 2, upY + 2, 4, Math.max(0, upH - 4), 2, 'rgba(126,194,255,0.96)', null, 0);
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText(`SP ${sp}`, upX + upW * 0.5 + 2, upY + upH * 0.5 + 0.5);
  ctx.restore();

  let bx = scaledW - 32;
  const by = scaledH - 40;
  for (let i = 0; i < buffs.length; i++) {
    const b = buffs[i];
    ctx.fillStyle = getBuffColor(b.type);
    ctx.beginPath();
    ctx.arc(bx, by, 10, 0, Math.PI * 2);
    ctx.fill();
    bx -= 26;
  }

  fillRoundedRect(ctx, pauseX, pauseY, btnSize, btnSize, 12, state.paused ? 'rgba(255,80,80,0.90)' : 'rgba(8,12,18,0.84)', 'rgba(255,255,255,0.20)', 1);
  ctx.fillStyle = '#ffffff';
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (state.paused) {
    ctx.fillText('▶', pauseX + btnSize / 2, pauseY + btnSize / 2 + 1);
  } else {
    const barW = 6;
    const gap = 6;
    const centerX = pauseX + btnSize / 2;
    const topY = pauseY + 10;
    const bottomY = pauseY + btnSize - 10;
    ctx.beginPath();
    ctx.moveTo(centerX - gap / 2 - barW, topY);
    ctx.lineTo(centerX - gap / 2 - barW, bottomY);
    ctx.moveTo(centerX + gap / 2 + barW, topY);
    ctx.lineTo(centerX + gap / 2 + barW, bottomY);
    ctx.stroke();
  }

  state._pauseButtonRect = {
    x: pauseX * uiScale,
    y: pauseY * uiScale,
    w: btnSize * uiScale,
    h: btnSize * uiScale,
  };

  drawBuildButton(ctx, state, scaledW, topPanelH, uiScale);
  drawStatsButton(ctx, state, scaledW, topPanelH, uiScale);
  drawBuildPanel(ctx, state, scaledW, scaledH, topPanelH, uiScale);
  drawStatsPanel(ctx, state, scaledW, scaledH, topPanelH, uiScale);

  state._runUpgradeButtonRect = null;

  if (state.mode === 'playing' && state.paused) {
    const overlayW = scaledW * 0.7;
    const overlayH = 130;
    const overlayX = (scaledW - overlayW) / 2;
    const overlayY = scaledH * 0.2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(overlayX, overlayY, overlayW, overlayH);
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(overlayX, overlayY, overlayW, overlayH);

    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Control System', overlayX + overlayW / 2, overlayY + 10);

    const btnW = overlayW * 0.4;
    const btnH = 36;
    const gap = 12;
    const btnYControls = overlayY + 60;
    const btnX1 = overlayX + overlayW * 0.5 - btnW - gap * 0.5;
    const btnX2 = overlayX + overlayW * 0.5 + gap * 0.5;

    const currentMode = getControlMode ? getControlMode() : 'oneHand';

    function drawModeButton(x, y, label, forMode) {
      const isActive = currentMode === forMode;
      ctx.fillStyle = isActive ? 'rgba(80,160,255,0.9)' : 'rgba(0,0,0,0.6)';
      ctx.fillRect(x, y, btnW, btnH);
      ctx.strokeStyle = '#ffffff';
      ctx.strokeRect(x, y, btnW, btnH);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '16px sans-serif';
      ctx.fillText(label, x + btnW / 2, y + btnH / 2);
    }

    drawModeButton(btnX1, btnYControls, '1-Hand', 'oneHand');
    drawModeButton(btnX2, btnYControls, '2-Hand', 'twoHand');

    state._controlModeClassicRect = {
      x: btnX1 * uiScale,
      y: btnYControls * uiScale,
      w: btnW * uiScale,
      h: btnH * uiScale,
    };
    state._controlModePortraitAutoRect = {
      x: btnX2 * uiScale,
      y: btnYControls * uiScale,
      w: btnW * uiScale,
      h: btnH * uiScale,
    };
  } else {
    state._controlModeClassicRect = null;
    state._controlModePortraitAutoRect = null;
  }

  drawRoomEntryBanner(ctx, state, scaledW, topPanelH);

  ctx.restore();
}


function getBuffColor(type) {
  switch (type) {
    case "damage":
      return "#ff4b7a";
    case "attackSpeed":
      return "#ffdd57";
    case "moveSpeed":
      return "#57ff9b";
    case "regen":
      return "#57c8ff";
    case "shield":
      return "#b857ff";
    case "ghost":
      return "#ffffff";
    default:
      return "#aaaaaa";
  }
}
