import { useMemo } from 'react';
import { useApp } from '../state/store';
import { useData } from '../data/DataContext';
import { fmtDeg, fmtLat, fmtLon } from '../utils/format';
import { CollapseButton } from './PanelRails';
import { siteConditions } from '../science/visibility';

/** Live Sun / Earth status for every region at the selected time (shape + text, not colour alone). */
function useAllConditions() {
  const { sites, ephemeris } = useData();
  const timeMs = useApp((s) => s.timeMs);
  return useMemo(
    () => Object.fromEntries(sites.regions.map((r) => [r.id, siteConditions(r, ephemeris, timeMs)])),
    [sites, ephemeris, timeMs],
  );
}

export function SiteList({ onPick }: { onPick?: () => void }) {
  const { sites } = useData();
  const regionId = useApp((s) => s.regionId);
  const selectRegion = useApp((s) => s.selectRegion);
  const all = useAllConditions();
  return (
    <ul className="site-list" aria-label="Candidate landing regions">
      {sites.regions.map((r, i) => {
        const sel = r.id === regionId;
        const p = r.observationPoint;
        const c = all[r.id];
        const sunUp = c?.sun.state === 'visible';
        const earthUp = c?.earth.state === 'visible';
        return (
          <li key={r.id}>
            <button
              type="button"
              className={`site-row${sel ? ' is-selected' : ''}`}
              aria-pressed={sel}
              aria-label={`${r.name}. ${c ? `Sun ${sunUp ? 'visible' : 'not visible'}, Earth ${earthUp ? 'visible' : 'not visible'} at the selected time.` : ''}`}
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
              {c && (
                <span className="site-row__status" aria-hidden="true">
                  <span className={`pip pip--sun${sunUp ? ' is-on' : ''}`} title={`Sun ${fmtDeg(c.sun.elDeg, 1)}${sunUp ? '' : ', not visible'}`}>
                    {sunUp ? '●' : '○'} Sun
                  </span>
                  <span className={`pip pip--earth${earthUp ? ' is-on' : ''}`} title={`Earth ${fmtDeg(c.earth.elDeg, 1)}${earthUp ? '' : ', not visible'}`}>
                    {earthUp ? '●' : '○'} Earth
                  </span>
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function RegionDetail() {
  const { region, sites } = useData();
  const regionId = useApp((s) => s.regionId);
  const r = region(regionId);
  const f = r.referenceFeature;
  const p = r.observationPoint;
  const missing = sites.notRepresented;
  return (
    <div className="region-detail">
      <p className="region-detail__listing">{r.nasaListing}.</p>
      <dl className="kv">
        <div>
          <dt>Reference</dt>
          <dd>
            <a href={f.url} target="_blank" rel="noreferrer">
              {f.name}
            </a>{' '}
            <span className="muted">
              ({f.type.toLowerCase()}, IAU) · {fmtLat(f.latDeg, 2)} {fmtLon(f.lonDeg, 2)}
            </span>
          </dd>
        </div>
        {p.sunVisibleFraction2027 !== undefined && (
          <div>
            <dt>Sun in 2027</dt>
            <dd>
              <span className="num">{(p.sunVisibleFraction2027 * 100).toFixed(1)}%</span>{' '}
              <span className="muted">of hours above the LOLA skyline</span>
            </dd>
          </div>
        )}
      </dl>
      <details className="disclose">
        <summary>How this point was chosen</summary>
        <p className="disclose__text">
          NASA candidate regions span roughly 15 × 15 km and are not published as coordinates. Readings use one representative
          observation point — not a NASA-designated landing site.
        </p>
        <p className="disclose__text disclose__text--strong">{p.selectionRule}</p>
      </details>
      {missing && (
        <details className="disclose">
          <summary>NASA regions not shown</summary>
          <ul className="disclose__list">
            {Object.entries(missing).map(([k, v]) => (
              <li key={k}>
                <strong>{k}</strong> — {v}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function SitePanel() {
  const { sites } = useData();
  return (
    <aside className="panel panel--left" aria-label="Landing regions">
      <div className="panel__head">
        <div>
          <div className="eyebrow">Artemis III candidates</div>
          <h2 className="panel__title">Regions</h2>
        </div>
        <CollapseButton side="left" />
      </div>
      <SiteList />
      <p className="site-list__note">{sites.regions.length} of NASA's 9 candidate regions (Oct 2024) · status at the selected time</p>
      <RegionDetail />
    </aside>
  );
}
