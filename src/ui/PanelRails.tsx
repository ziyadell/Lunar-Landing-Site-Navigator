import { useApp } from '../state/store';
import { useData } from '../data/DataContext';
import { useConditions } from '../data/useConditions';
import { fmtDeg } from '../utils/format';
import { EarthGlyph, SunGlyph } from './primitives';

const Chevron = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path d={dir === 'left' ? 'M7.5 2.5 4 6l3.5 3.5' : 'M4.5 2.5 8 6l-3.5 3.5'} stroke="currentColor" fill="none" strokeWidth="1.4" />
  </svg>
);

/** Collapse / expand a side panel. */
export function CollapseButton({ side }: { side: 'left' | 'right' }) {
  const open = useApp((s) => s.panels[side]);
  const toggle = useApp((s) => s.togglePanel);
  const name = side === 'left' ? 'region panel' : 'readings panel';
  const pointsLeft = (side === 'left') === open;
  return (
    <button
      type="button"
      className="collapse-btn"
      aria-expanded={open}
      aria-label={open ? `Collapse ${name}` : `Expand ${name}`}
      title={open ? `Collapse ${name}` : `Expand ${name}`}
      onClick={() => toggle(side)}
    >
      <Chevron dir={pointsLeft ? 'left' : 'right'} />
    </button>
  );
}

/** Collapsed left panel: region selection stays one click away. */
export function SiteRail() {
  const { sites } = useData();
  const regionId = useApp((s) => s.regionId);
  const selectRegion = useApp((s) => s.selectRegion);
  return (
    <aside className="rail rail--left" aria-label="Landing regions (collapsed)">
      <CollapseButton side="left" />
      <div className="rail__items" role="group" aria-label="Select region">
        {sites.regions.map((r, i) => (
          <button
            key={r.id}
            type="button"
            className={`rail__site${r.id === regionId ? ' is-selected' : ''}`}
            aria-pressed={r.id === regionId}
            aria-label={r.name}
            title={r.name}
            onClick={() => selectRegion(r.id)}
          >
            {String(i + 1).padStart(2, '0')}
          </button>
        ))}
      </div>
    </aside>
  );
}

/** Collapsed right panel: Sun / Earth status remains visible as text, not colour alone. */
export function ScienceRail() {
  const { conditions } = useConditions();
  const vis = (b: 'sun' | 'earth') => conditions?.[b].state === 'visible';
  return (
    <aside className="rail rail--right" aria-label="Readings (collapsed)">
      <CollapseButton side="right" />
      {conditions && (
        <div className="rail__items">
          <div className={`rail__body ${vis('sun') ? 'is-sun' : 'is-off'}`} title={`Sun elevation ${fmtDeg(conditions.sun.elDeg)}${vis('sun') ? '' : ', blocked'}`}>
            <SunGlyph size={14} />
            <span className="num">{fmtDeg(conditions.sun.elDeg, 1)}</span>
            <span className="rail__state">{vis('sun') ? 'up' : 'off'}</span>
          </div>
          <div className={`rail__body ${vis('earth') ? 'is-earth' : 'is-off'}`} title={`Earth elevation ${fmtDeg(conditions.earth.elDeg)}${vis('earth') ? '' : ', blocked'}`}>
            <EarthGlyph size={14} />
            <span className="num">{fmtDeg(conditions.earth.elDeg, 1)}</span>
            <span className="rail__state">{vis('earth') ? 'up' : 'off'}</span>
          </div>
        </div>
      )}
    </aside>
  );
}
