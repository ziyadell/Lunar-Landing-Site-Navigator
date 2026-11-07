import { useApp } from '../state/store';
import { useData } from '../data/DataContext';
import { fmtLat, fmtLon } from '../utils/format';
import { SectionHead } from './primitives';

export function SiteList({ onPick }: { onPick?: () => void }) {
  const { sites } = useData();
  const regionId = useApp((s) => s.regionId);
  const selectRegion = useApp((s) => s.selectRegion);
  return (
    <ul className="site-list" aria-label="Candidate landing regions">
      {sites.regions.map((r, i) => {
        const sel = r.id === regionId;
        const p = r.observationPoint;
        return (
          <li key={r.id}>
            <button
              type="button"
              className={`site-row${sel ? ' is-selected' : ''}`}
              aria-pressed={sel}
              onClick={() => {
                selectRegion(r.id);
                onPick?.();
              }}
            >
              <span className="site-row__idx num">{String(i + 1).padStart(2, '0')}</span>
              <span className="site-row__main">
                <span className="site-row__name">{r.name}</span>
                <span className="site-row__coord num">
                  {fmtLat(p.latDeg, 2)} {fmtLon(p.lonDeg, 2)}
                </span>
              </span>
              <span className="site-row__elev num">{(p.elevationM / 1000).toFixed(2)} km</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function RegionDetail() {
  const { region } = useData();
  const regionId = useApp((s) => s.regionId);
  const r = region(regionId);
  const f = r.referenceFeature;
  return (
    <div className="region-detail">
      <p className="region-detail__listing">{r.nasaListing}.</p>
      <dl className="kv">
        <div>
          <dt>Reference feature</dt>
          <dd>
            <a href={f.url} target="_blank" rel="noreferrer">
              {f.name}
            </a>{' '}
            <span className="muted">({f.type}, IAU)</span>
          </dd>
        </div>
        <div>
          <dt>Feature centre</dt>
          <dd className="num">
            {fmtLat(f.latDeg, 2)} {fmtLon(f.lonDeg, 2)} · ⌀ {f.diameterKm.toFixed(0)} km
          </dd>
        </div>
      </dl>
      <div className="callout">
        <span className="callout__k">Region vs. point</span>
        <p>
          NASA candidate regions span roughly 15 × 15 km and are not published as coordinates. Readings use one
          representative observation point:
        </p>
        <p className="callout__rule">{r.observationPoint.selectionRule}</p>
      </div>
    </div>
  );
}

export function SitePanel() {
  return (
    <aside className="panel panel--left" aria-label="Landing regions">
      <SectionHead aside="4 selected">Candidate Regions</SectionHead>
      <SiteList />
      <SectionHead>Selected Region</SectionHead>
      <RegionDetail />
    </aside>
  );
}
