import { t } from '../../i18n';
import { useMemo } from 'react';
import { useApp } from '../../state/store';
import { useData } from '../../data/DataContext';
import { siteConditions } from '../../science/visibility';
import { fmtDeg, fmtLat, fmtLon } from '../../utils/format';
import type { LandingRegion, SiteConditions } from '../../data/types';
import { Listen } from '../../audio/ui';
import { assetUrl } from '../../data/release';
import { FoldButton } from '../Fold';
import { RegionPicker } from './RegionPicker';
import { useSettings } from '../../state/settings';

/**
 * Region discovery, told through real geography:
 *  - a locator map of the south-polar cap (LROC WAC mosaic) with NASA's nine region
 *    outlines (digitised from the agency's map) as buttons;
 *  - per-region pictures of the outline area at 100 m/px with the observation point marked.
 * See preprocess/build_thumbnails.py and register_nasa_regions.py.
 */

export const thumbUrl = (id: string) => assetUrl(`textures/polar/thumbs/${id}.jpg`);

const R_KM = 1737.4;
/** South-polar stereographic km (0° longitude toward +y). */
export function stereo(latDeg: number, lonDeg: number): [number, number] {
  const rho = 2 * R_KM * Math.tan(Math.PI / 4 + (latDeg * Math.PI) / 360);
  return [rho * Math.sin((lonDeg * Math.PI) / 180), rho * Math.cos((lonDeg * Math.PI) / 180)];
}

/** Position of the observation point in a region picture, as CSS percentages. */
export function obsInThumb(r: LandingRegion): { left: string; top: string } | null {
  if (!r.thumb) return null;
  const [x, y] = stereo(r.observationPoint.latDeg, r.observationPoint.lonDeg);
  const h = r.thumb.halfExtentKm;
  return {
    left: `${(((x - r.thumb.centerKm[0]) / (2 * h) + 0.5) * 100).toFixed(2)}%`,
    top: `${((0.5 - (y - r.thumb.centerKm[1]) / (2 * h)) * 100).toFixed(2)}%`,
  };
}

/** A region picture with its observation point marked. */
export function RegionImage({ r, size, className = '' }: { r: LandingRegion; size: number; className?: string }) {
  const o = obsInThumb(r);
  const km = r.thumb ? Math.round(r.thumb.halfExtentKm * 2) : 24;
  return (
    <span className={`rimg ${className}`} style={{ width: size, height: size }}>
      <img src={thumbUrl(r.id)} alt={`${r.name}: LROC WAC image, ${km} km across, covering NASA's region outline`} width={size} height={size} loading="lazy" />
      {o && <i className="rimg__obs" style={o} aria-hidden="true" />}
    </span>
  );
}

/**
 * Locator: the south-polar cap with NASA's nine region outlines. Each outline is a
 * button; the selected one is lit and shows its observation point.
 */
export function Locator() {
  const { sites } = useData();
  const regionId = useApp((s) => s.regionId);
  const selectRegion = useApp((s) => s.selectRegion);
  const all = useAllConditions();
  const loc = sites.locator;
  if (!loc) return null;
  const [x0, x1] = loc.xKm;
  const [y0, y1] = loc.yKm;
  const L = (x: number) => ((x - x0) / (x1 - x0)) * 100;
  const T = (y: number) => ((y1 - y) / (y1 - y0)) * 100;
  return (
    <div className="locator" role="group" aria-label="NASA candidate regions on the south-polar map">
      <Listen id="view-locator" className="listen--locator" />
      <img className="locator__img" src={assetUrl(loc.file)} alt="" />
      <span className="locator__pole" style={{ left: `${L(0)}%`, top: `${T(0)}%` }} aria-hidden="true">
        <i />
        <span>{t('South Pole')}</span>
      </span>
      {sites.regions.map((r) => {
        if (!r.nasaRegion) return null; // no valid outline: no box on the locator
        const xy = r.nasaRegion.corners.map(([la, lo]) => stereo(la, lo));
        const xs = xy.map((v) => v[0]);
        const ys = xy.map((v) => v[1]);
        const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
        const sel = r.id === regionId;
        const c = all[r.id];
        const [ox, oy] = stereo(r.observationPoint.latDeg, r.observationPoint.lonDeg);
        return (
          <button
            key={r.id}
            type="button"
            className={`locator__box${sel ? ' is-selected' : ''}`}
            style={{ left: `${L(bx0)}%`, top: `${T(by1)}%`, width: `${L(bx1) - L(bx0)}%`, height: `${T(by0) - T(by1)}%` }}
            aria-pressed={sel}
            aria-label={`${r.name}. Sun ${c?.sun.state === 'visible' ? 'visible' : 'not visible'}, Earth ${c?.earth.state === 'visible' ? 'visible' : 'not visible'}.`}
            title={r.name}
            onClick={() => selectRegion(r.id)}
          >
            {sel && (
              <i
                className="locator__obs"
                style={{ left: `${((ox - bx0) / (bx1 - bx0)) * 100}%`, top: `${((by1 - oy) / (by1 - by0)) * 100}%` }}
                aria-hidden="true"
              />
            )}
            <span className="locator__lights" aria-hidden="true">
              <i className={c?.sun.state === 'visible' ? 'is-sun' : ''} />
              <i className={c?.earth.state === 'visible' ? 'is-earth' : ''} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

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
        {t(compact ? 'Sun' : sun ? 'Sunlit' : 'Sun hidden')}
      </span>
      <span className={`light light--earth${earth ? ' is-on' : ''}`}>
        <i aria-hidden="true" />
        {t(compact ? 'Earth' : earth ? 'Earth in view' : 'Earth hidden')}
      </span>
    </span>
  );
}

/** Bottom-left: the selected region and the map to choose another. */
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
  const orbital = mode === 'orbital';
  const folded = useSettings((st) => st.regionFolded);

  return (
    <section className={`deck-card${orbital ? '' : ' deck-card--surface'}${folded ? ' is-folded' : ''}`} aria-label="Selected region" data-obstacle>
      <header className="deck-card__head">
        <div className="deck-card__titles">
          <div className="deck-card__eyebrow">
            <RegionPicker />
          </div>
          <h2 className="deck-card__name" aria-live="polite">
            {r.name}
            <Listen id={`region-${r.id}`} />
          </h2>
          {!folded && <div className="deck-card__meta">
            <span className="num">
              {fmtLat(p.latDeg, 2)} {fmtLon(p.lonDeg, 2)}
            </span>
            <BodyLights c={all[r.id]} />
          </div>}
        </div>
        <div className="deck-card__step">
          <button type="button" className="round-btn" aria-label={t('Previous region')} title={t('Previous region')} onClick={() => go(-1)}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 2.5 4 6l3.5 3.5" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>
          </button>
          <button type="button" className="round-btn" aria-label={t('Next region')} title={t('Next region')} onClick={() => go(1)}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>
          </button>
          <FoldButton k="regionFolded" what="region details" className="deck-card__fold" />
        </div>
      </header>

      {orbital && !folded && <Locator />}

      {!folded && <div className="deck-card__foot">
        <button type="button" className={`text-btn${drawer === 'atlas' ? ' is-on' : ''}`} aria-expanded={drawer === 'atlas'} onClick={() => openDrawer('atlas')}>
          {t('Compare all')}
        </button>
        {orbital ? (
          <button type="button" className="cta" onClick={enterSurface} disabled={transitioning}>
            {t(transitioning ? 'Descending…' : 'Explore the surface')}
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
            {t('Back to orbit')}
          </button>
        )}
      </div>}
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
  return (
    <div className="atlas">
      <p className="drawer__lede">
        The nine candidate landing regions NASA announced in October 2024 for its Artemis campaign. Each picture covers NASA&rsquo;s outline; the dot is the point
        used for the measurements.
      </p>
      <ul className="atlas__grid">
        {ranked.map((r) => {
          const c = all[r.id];
          const sel = r.id === regionId;
          const f = r.observationPoint.sunVisibleFraction2027;
          return (
            <li key={r.id}>
              <button type="button" className={`atlas-card${sel ? ' is-selected' : ''}`} aria-pressed={sel} onClick={() => selectRegion(r.id)}>
                <RegionImage r={r} size={240} className="atlas-card__img" />
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
      <details className="disclose">
        <summary>About these pictures and points</summary>
        <p className="disclose__text">
          LROC WAC South Pole Summer Mosaic (2010), 100 m/px; up is toward 0° longitude; black areas were in shadow when
          imaged. Region outlines are digitised from NASA&rsquo;s official map, because NASA has not published coordinates. The dot
          is a representative observation point chosen by a fixed rule, not a landing site.
        </p>
      </details>
    </div>
  );
}
