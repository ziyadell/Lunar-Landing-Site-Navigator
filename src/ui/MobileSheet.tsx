import { useState } from 'react';
import { useConditions } from '../data/useConditions';
import { useApp } from '../state/store';
import { fmtDeg, fmtUtc } from '../utils/format';
import { RegionDetail, SiteList } from './SitePanel';
import { DataSources, ScienceReadings } from './SciencePanel';
import { TimeInputs, VisibilityStrip } from './TimeControls';
import { LayerToggles } from './TimeDock';
import { EarthGlyph, SunGlyph } from './primitives';

type Tab = 'sites' | 'readings' | 'time';

/** Compact layout: a collapsible bottom sheet that leaves the Moon visible. */
export function MobileSheet() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('readings');
  const { region, conditions } = useConditions();
  const timeMs = useApp((s) => s.timeMs);

  const pick = (t: Tab) => {
    setTab(t);
    setOpen(true);
  };

  return (
    <section className={`sheet${open ? ' is-open' : ''}`} aria-label="Controls and readings">
      <button type="button" className="sheet__summary" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="sheet__site">{region.name}</span>
        <span className="sheet__time num">{fmtUtc(timeMs)}</span>
        {conditions && (
          <span className="sheet__vals num">
            <span className={conditions.sun.state === 'visible' ? 'is-sun' : 'is-off'}>
              <SunGlyph size={11} /> {fmtDeg(conditions.sun.elDeg, 1)}
              {conditions.sun.state === 'visible' ? '' : ' blocked'}
            </span>
            <span className={conditions.earth.state === 'visible' ? 'is-earth' : 'is-off'}>
              <EarthGlyph size={11} /> {fmtDeg(conditions.earth.elDeg, 1)}
              {conditions.earth.state === 'visible' ? '' : ' blocked'}
            </span>
          </span>
        )}
        <svg className="sheet__chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 7.5 6 4l3.5 3.5" stroke="currentColor" fill="none" strokeWidth="1.4" />
        </svg>
      </button>
      <div className="sheet__tabs" role="tablist" aria-label="Panels">
        {(
          [
            ['sites', 'Regions'],
            ['readings', 'Readings'],
            ['time', 'Time'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={open && tab === id}
            className={`sheet__tab${open && tab === id ? ' is-active' : ''}`}
            onClick={() => pick(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {open && (
        <div className="sheet__body" role="tabpanel">
          {tab === 'sites' && (
            <>
              <SiteList onPick={() => setTab('readings')} />
              <RegionDetail />
            </>
          )}
          {tab === 'readings' && (
            <>
              <ScienceReadings />
              <DataSources />
            </>
          )}
          {tab === 'time' && (
            <>
              <TimeInputs compact />
              <div className="sheet__strip">
                <span className="dock__label">Visibility · 30 days · terrain-corrected</span>
                <VisibilityStrip />
              </div>
              <LayerToggles />
            </>
          )}
        </div>
      )}
    </section>
  );
}
