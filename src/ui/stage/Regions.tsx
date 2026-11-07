import { useMemo } from 'react';
import { useApp } from '../../state/store';
import { useData } from '../../data/DataContext';
import { siteConditions } from '../../science/visibility';
import { fmtDeg, fmtLat, fmtLon } from '../../utils/format';
import type { LandingRegion, SiteConditions } from '../../data/types';

/**
 * Region discovery. Each region is shown by its own ground: a 24 × 24 km crop
 * of the LROC WAC South Pole Summer Mosaic (100 m/px, native pixels, centred
 * on the observation point). See preprocess/build_thumbnails.py.
 */

export const thumbUrl = (id: string) => `${import.meta.env.BASE_URL}textures/polar/thumbs/${id}.jpg`;

export function useAllConditions() {
  const { sites, ephemeris } = useData();
  const timeMs = useApp((s) => s.timeMs);
  return useMemo(
    () => Object.fromEntries(sites.regions.map((r) => [r.id, siteConditions(r, ephemeris, timeMs)])) as Record<string, SiteConditions | null>,
    [sites, ephemeris, timeMs],
  );
}

/** Two small status lights: shape and word, never colour alone. */
export function BodyLights({ c, compact = false }: { c: SiteConditions | null; compact?: boolean }) {
  if (!c) return null;
  const sun = c.sun.state === 'visible';
  const earth = c.earth.state === 'visible';
  return (
    <span className={`lights${compact ? ' lights--compact' : ''}`}>
      <span className={`light light--sun${sun ? ' is-on' : ''}`}>
        <i aria-hidden="true" />
        {compact ? 'Sun' : sun ? 'Sunlit' : 'Sun hidden'}
      </span>
      <span className={`light light--earth${earth ? ' is-on' : ''}`}>
        <i aria-hidden="true" />
        {compact ? 'Earth' : earth ? 'Earth in view' : 'Earth hidden'}
      </span>
    </span>
  );
}

function SunYear({ r }: { r: LandingRegion }) {
  const f = r.observationPoint.sunVisibleFraction2027;
  if (f === undefined) return null;
  return (
    <span className="sunyear" title="Share of 2027 hours with the Sun's centre above the LOLA skyline">
      <span className="sunyear__bar" aria-hidden="true">
        <span style={{ width: `${f * 100}%` }} />
      </span>
      <span className="num">{(f * 100).toFixed(0)}%</span> sunlit in 2027
    </span>
  );
}

/** Bottom-left: the selected region, told through its terrain, plus a strip of the others. */
export function RegionDeck() {
  const { sites, region } = useData();
  const regionId = useApp((s) => s.regionId);
  const selectRegion = useApp((s) => s.selectRegion);
  const mode = useApp((s) => s.mode);
  const enterSurface = useApp((s) => s.enterSurface);
  const setMode = useApp((s) => s.setMode);
  const focus = useApp((s) => s.focusRegion);
  const transitioning = useApp((s) => s.transitioning);
  const openDrawer = useApp((s) => s.openDrawer);
  const drawer = useApp((s) => s.drawer);
  const all = useAllConditions();
  const r = region(regionId);
  const i = sites.regions.findIndex((x) => x.id === regionId);
  const n = sites.regions.length;
  const go = (d: number) => selectRegion(sites.regions[(i + d + n) % n].id);
  const p = r.observationPoint;

  return (
    <section className="deck-card" aria-label="Selected region" data-obstacle>
      <div className="deck-card__main">
        <img className="deck-card__img" src={thumbUrl(r.id)} alt={`LROC WAC 100 m image, 24 km square, centred on the ${r.name} observation point`} width={120} height={120} />
        <div className="deck-card__body">
          <div className="deck-card__eyebrow">
            <span className="num">
              {String(i + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}
            </span>
            <span>Candidate region</span>
          </div>
          <h2 className="deck-card__name">{r.name}</h2>
          <div className="deck-card__coord num">
            {fmtLat(p.latDeg, 2)} {fmtLon(p.lonDeg, 2)}
          </div>
          <BodyLights c={all[r.id]} />
        </div>
        <div className="deck-card__step">
          <button type="button" className="round-btn" aria-label="Previous region" onClick={() => go(-1)}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 2.5 4 6l3.5 3.5" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>
          </button>
          <button type="button" className="round-btn" aria-label="Next region" onClick={() => go(1)}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>
          </button>
        </div>
      </div>

      <div className="deck-card__foot">
        <SunYear r={r} />
        <div className="deck-card__actions">
          <button type="button" className={`text-btn${drawer === 'atlas' ? ' is-on' : ''}`} aria-expanded={drawer === 'atlas'} onClick={() => openDrawer('atlas')}>
            Compare all
          </button>
          {mode === 'orbital' ? (
            <button type="button" className="cta" onClick={enterSurface} disabled={transitioning}>
              Descend
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2v8M2.5 6.5 6 10l3.5-3.5" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>
            </button>
          ) : (
            <button
              type="button"
              className="cta cta--quiet"
              onClick={() => {
                setMode('orbital');
                focus();
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10V2M2.5 5.5 6 2l3.5 3.5" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>
              Back to orbit
            </button>
          )}
        </div>
      </div>

      <ul className="strip" aria-label="Choose a region">
        {sites.regions.map((x) => {
          const c = all[x.id];
          const sel = x.id === regionId;
          return (
            <li key={x.id}>
              <button
                type="button"
                className={`strip__item${sel ? ' is-selected' : ''}`}
                aria-pressed={sel}
                aria-label={`${x.name}. Sun ${c?.sun.state === 'visible' ? 'visible' : 'not visible'}, Earth ${c?.earth.state === 'visible' ? 'visible' : 'not visible'}.`}
                title={x.name}
                onClick={() => selectRegion(x.id)}
              >
                <img src={thumbUrl(x.id)} alt="" width={44} height={44} loading="lazy" />
                <span className="strip__lights" aria-hidden="true">
                  <i className={c?.sun.state === 'visible' ? 'is-sun' : ''} />
                  <i className={c?.earth.state === 'visible' ? 'is-earth' : ''} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Drawer: every region side by side, with the facts that make them differ. */
export function RegionAtlas() {
  const { sites } = useData();
  const regionId = useApp((s) => s.regionId);
  const selectRegion = useApp((s) => s.selectRegion);
  const all = useAllConditions();
  const ranked = [...sites.regions];
  const missing = sites.notRepresented;
  return (
    <div className="atlas">
      <p className="drawer__lede">
        {sites.regions.length} of the nine regions NASA named for Artemis III in October 2024. Each is shown at one representative
        observation point, with live conditions at the selected time.
      </p>
      <ul className="atlas__grid">
        {ranked.map((r) => {
          const c = all[r.id];
          const sel = r.id === regionId;
          const f = r.observationPoint.sunVisibleFraction2027;
          return (
            <li key={r.id}>
              <button type="button" className={`atlas-card${sel ? ' is-selected' : ''}`} aria-pressed={sel} onClick={() => selectRegion(r.id)}>
                <img src={thumbUrl(r.id)} alt="" width={240} height={240} loading="lazy" />
                <span className="atlas-card__body">
                  <span className="atlas-card__name">{r.name}</span>
                  <span className="atlas-card__coord num">
                    {fmtLat(r.observationPoint.latDeg, 2)} {fmtLon(r.observationPoint.lonDeg, 2)}
                  </span>
                  <BodyLights c={c} compact />
                  {c && (
                    <span className="atlas-card__els num">
                      Sun {fmtDeg(c.sun.elDeg, 1)} · Earth {fmtDeg(c.earth.elDeg, 1)}
                    </span>
                  )}
                  {f !== undefined && (
                    <span className="atlas-card__year">
                      <span className="sunyear__bar" aria-hidden="true">
                        <span style={{ width: `${f * 100}%` }} />
                      </span>
                      <span className="num">{(f * 100).toFixed(1)}%</span> of 2027 sunlit
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="fineprint">Images: LROC WAC South Pole Summer Mosaic (2010), 100 m/px, 24 km square, up = toward 0° longitude. Black areas were in shadow when imaged.</p>
      {missing && (
        <details className="disclose">
          <summary>Regions not shown</summary>
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
