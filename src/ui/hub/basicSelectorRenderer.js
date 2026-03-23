import { STARTER_LOADOUTS, ensureStarterLoadoutProgression, getCoreIdentity, normalizeStarterLoadoutKey } from '../../core/starterLoadouts.js';
import { setHubCoreKey } from '../../core/hubBuild.js';

let basicRenderKey = '';

export function resetBasicSelectorRenderKey() {
  basicRenderKey = '';
}

export function renderBasicSelectorView(state, deps) {
  const { el, make, persistHubState, renderBuildLab } = deps;
  const prog = state?.progression;
  if (!prog || !el?.basicGrid) return;
  ensureStarterLoadoutProgression(prog);
  const selected = normalizeStarterLoadoutKey(prog.selectedStarterLoadout);
  const key = `${selected}|${STARTER_LOADOUTS.map((d) => d.key).join(',')}`;
  if (key === basicRenderKey) return;
  basicRenderKey = key;
  el.basicGrid.innerHTML = '';
  for (const def of STARTER_LOADOUTS) {
    const coreIdentity = getCoreIdentity(def.key);
    const card = make('button', {
      type: 'button',
      className: 'shopCard' + (def.key === selected ? ' sel' : ''),
      style: {
        textAlign: 'left',
        cursor: 'pointer',
        border: def.key === selected ? '2px solid rgba(160,235,255,0.95)' : '1px solid rgba(255,255,255,0.20)',
        background: def.key === selected ? 'linear-gradient(180deg, rgba(24,44,64,0.98), rgba(10,18,28,0.98))' : 'rgba(16,22,34,0.96)',
        color: '#eef8ff',
        boxShadow: def.key === selected ? '0 0 0 1px rgba(255,245,180,0.35), 0 12px 28px rgba(0,0,0,0.35)' : '0 8px 22px rgba(0,0,0,0.26)',
      },
    });
    card.appendChild(make('div', { className: 'top' }, [
      make('div', { className: 'name', text: `${def.name} — ${def.skillName}`, style: { color: '#f4fbff', textShadow: '0 1px 0 rgba(0,0,0,0.35)' } }),
      make('div', { className: 'lvl', text: def.key === selected ? 'SELECTED' : 'Pick', style: { color: def.key === selected ? '#ffe79a' : '#bfe9ff', fontWeight: '700' } }),
    ]));
    card.appendChild(make('div', { className: 'muted', text: def.desc, style: { marginTop: '8px', fontSize: '12px', lineHeight: '1.4', color: 'rgba(232,245,255,0.9)', opacity: '1' } }));
    card.appendChild(make('div', { className: 'muted', text: `Route: ${String(def.routeLabel || 'general')} • ${String(coreIdentity?.summary || def.summary || '')}`, style: { marginTop: '6px', fontSize: '11px', lineHeight: '1.45', color: 'rgba(216,238,255,0.88)', opacity: '1' } }));
    card.appendChild(make('div', { className: 'muted', text: `Favored skills: ${(def.favoredSkillKeys || []).join(', ') || '—'}`, style: { marginTop: '6px', fontSize: '11px', lineHeight: '1.4', color: 'rgba(202,230,255,0.84)', opacity: '1' } }));
    card.appendChild(make('div', { className: 'muted', text: `Favored passives: ${(def.favoredPassiveKeys || []).join(', ') || '—'}`, style: { marginTop: '4px', fontSize: '11px', lineHeight: '1.4', color: 'rgba(202,230,255,0.84)', opacity: '1' } }));
    card.addEventListener('click', () => {
      setHubCoreKey(prog, def.key);
      persistHubState(state, `Core ready: ${def.skillName}`);
      resetBasicSelectorRenderKey();
      renderBasicSelectorView(state, deps);
      renderBuildLab(state, true);
    });
    el.basicGrid.appendChild(card);
  }
}
