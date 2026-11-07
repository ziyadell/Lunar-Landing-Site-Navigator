import { useMemo, useRef, useState } from 'react';
import { useApp } from '../state/store';
import { useData } from '../data/DataContext';
import { fmtDeg, fmtLat, fmtLon } from '../utils/format';
import { siteConditions } from '../science/visibility';

/**
 * DOM layer for the orbital markers. Every element is positioned each frame by
 * `MarkerProjector` (three/OrbitalScene.tsx) via its id. Markers sit exactly at
 * the projected coordinates; only labels are offset (with leader lines) to avoid
 * collisions. All markers are real buttons: mouse, touch and keyboard select.
 */
export function GlobeLabels() {
  const { sites, region } = useData();
  const regionId = useApp((s) => s.regionId);
  const selectRegion = useApp((s) => s.selectRegion);
  const poleCamera = useApp((s) => s.poleCamera);
  const sel = region(regionId);
  const { ephemeris } = useData();
  const timeMs = useApp((s) => s.timeMs);
  const host = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const hoverRegion = hover ? region(hover.id) : null;
  const hc = useMemo(() => (hoverRegion ? siteConditions(hoverRegion, ephemeris, timeMs) : null), [hoverRegion, ephemeris, timeMs]);
  const showTip = (id: string, el: HTMLElement) => {
    const hb = host.current?.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    if (hb) setHover({ id, x: b.left - hb.left, y: b.bottom - hb.top + 6 });
  };
  return (
    <div className="gm" ref={host}>
      <svg className="gm__leaders" aria-hidden="true">
        {sites.regions.map((r) => (
          <line key={r.id} id={`gm-lead-${r.id}`} />
        ))}
      </svg>

      <button type="button" id="gm-cluster" className="gm-cluster" style={{ visibility: 'hidden' }} onClick={poleCamera}
        aria-label={`${sites.regions.length} candidate regions near the south pole. Selected: ${sel.name}. Zoom to the south polar region.`}>
        <i className="gm-cluster__dot" aria-hidden="true" />
        <span className="gm-cluster__chip" aria-hidden="true">
          <b className="gm-cluster__n num">{sites.regions.length}</b>
          <span className="gm-cluster__sel">{sel.name}</span>
        </span>
      </button>

      {sites.regions.map((r, i) => {
        const selected = r.id === regionId;
        const label = `${r.name}, observation point ${fmtLat(r.observationPoint.latDeg, 2)} ${fmtLon(r.observationPoint.lonDeg, 2)}`;
        return (
          <div key={r.id}>
            <button type="button" id={`gm-dot-${r.id}`} className={`gm-dot${selected ? ' is-selected' : ''}`} style={{ visibility: 'hidden' }}
              onClick={() => selectRegion(r.id)} aria-label={label} aria-pressed={selected} tabIndex={-1} />
            <button type="button" id={`gm-lbl-${r.id}`} className={`gm-label${selected ? ' is-selected' : ''}`} style={{ visibility: 'hidden' }}
              onClick={() => selectRegion(r.id)} aria-label={label} aria-pressed={selected}
              onPointerEnter={(e) => e.pointerType === 'mouse' && showTip(r.id, e.currentTarget)}
              onPointerLeave={() => setHover(null)}
              onFocus={(e) => showTip(r.id, e.currentTarget)}
              onBlur={() => setHover(null)}>
              <span className="gm-label__idx">{String(i + 1).padStart(2, '0')}</span>
              <span className="gm-label__name">{r.name}</span>
            </button>
          </div>
        );
      })}

      {hover && hoverRegion && hc && (
        <div className="gm-tip" style={{ transform: `translate(${hover.x}px, ${hover.y}px)` }} role="tooltip">
          <div className="gm-tip__name">{hoverRegion.name}</div>
          <div className={`gm-tip__row ${hc.sun.state === 'visible' ? 'is-sun' : 'is-off'}`}>
            {hc.sun.state === 'visible' ? '●' : '○'} Sun {fmtDeg(hc.sun.elDeg, 1)}
            <span>{hc.sun.state === 'visible' ? 'visible' : 'not visible'}</span>
          </div>
          <div className={`gm-tip__row ${hc.earth.state === 'visible' ? 'is-earth' : 'is-off'}`}>
            {hc.earth.state === 'visible' ? '●' : '○'} Earth {fmtDeg(hc.earth.elDeg, 1)}
            <span>{hc.earth.state === 'visible' ? 'visible' : 'not visible'}</span>
          </div>
          {hoverRegion.id !== regionId && <div className="gm-tip__hint">Click to select</div>}
        </div>
      )}

      <div id="gm-obs" className="gm-note" style={{ visibility: 'hidden' }} aria-hidden="true">
        Observation point used for the readings
      </div>
      <div id="gm-ref" className="gm-ref gm-ref--outline" style={{ visibility: 'hidden' }} aria-hidden="true">
        <span className="gm-ref__text">NASA region outline</span>
      </div>
    </div>
  );
}
