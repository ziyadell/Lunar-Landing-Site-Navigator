import { useApp } from '../state/store';
import { useData } from '../data/DataContext';
import { fmtLat, fmtLon } from '../utils/format';

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
  const f = sel.referenceFeature;
  return (
    <div className="gm">
      <svg className="gm__leaders" aria-hidden="true">
        {sites.regions.map((r) => (
          <line key={r.id} id={`gm-lead-${r.id}`} />
        ))}
      </svg>

      <button type="button" id="gm-cluster" className="gm-cluster" style={{ visibility: 'hidden' }} onClick={poleCamera}
        aria-label={`${sites.regions.length} candidate regions near the south pole. Selected: ${sel.name}. Zoom to the south polar region.`}>
        <span className="gm-cluster__pin" aria-hidden="true">{sites.regions.length}</span>
        <span className="gm-cluster__text">
          <span className="gm-cluster__k">South-polar candidate regions</span>
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
              onClick={() => selectRegion(r.id)} aria-label={label} aria-pressed={selected}>
              <span className="gm-label__idx">{String(i + 1).padStart(2, '0')}</span>
              <span className="gm-label__name">{r.name}</span>
            </button>
          </div>
        );
      })}

      <div id="gm-obs" className="gm-note" style={{ visibility: 'hidden' }} aria-hidden="true">
        Representative observation point · not a NASA-designated landing site
      </div>
      <div id="gm-ref" className="gm-ref" style={{ visibility: 'hidden' }} aria-hidden="true">
        <span className="gm-ref__mark" />
        <span className="gm-ref__text">{f.name} · IAU feature centre</span>
      </div>
    </div>
  );
}
