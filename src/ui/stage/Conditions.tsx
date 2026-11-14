import { t } from '../../i18n';
import { useConditions } from '../../data/useConditions';
import { useApp } from '../../state/store';
import { useData } from '../../data/DataContext';
import { compass, fmtDate, fmtDeg, fmtLat, fmtLon } from '../../utils/format';
import { EarthGlyph, Readout, SunGlyph } from '../primitives';
import type { TopocentricBody } from '../../data/types';
import { STATE_LABEL } from '../../science/visibility';
import { Listen } from '../../audio/ui';
import { useSettings } from '../../state/settings';
import type { NarrationItem } from '../../audio/engine';

/**
 * The essential answer, always on screen: can you see the Sun and Earth from
 * the observation point right now, and by how much do they clear the measured
 * skyline? Everything else is one tap away in the Details drawer.
 */

function plain(b: TopocentricBody) {
  const s = b.state === 'visible' ? 'Clears the terrain horizon' : b.state === 'below-horizontal' ? 'Below the local horizontal' : 'Hidden by terrain';
  return (
    <>
      <span>{t(s)}</span>
      <span>
        {t('elevation')} <bdi dir="ltr" className="num">{fmtDeg(b.elDeg, 2)}</bdi>
      </span>
    </>
  );
}

function Body({ which, b }: { which: 'sun' | 'earth'; b: TopocentricBody }) {
  const up = b.state === 'visible';
  return (
    <div className={`cond__body cond__body--${which}${up ? ' is-up' : ' is-down'}`}>
      <div className="cond__name">
        {which === 'sun' ? <SunGlyph size={13} /> : <EarthGlyph size={13} />}
        {t(which === 'sun' ? 'Sun' : 'Earth')}
        <span className="cond__state">{t(up ? 'Visible' : 'Not visible')}</span>
      </div>
      <div className="cond__value num">
        {Math.abs(b.marginDeg).toFixed(1)}°<span className="cond__unit">{t(b.marginDeg > 0 ? 'above horizon' : 'below horizon')}</span>
      </div>
      <div className="cond__plain">{plain(b)}</div>
    </div>
  );
}

/** Spoken summary of the current readings (calculated from app state, never invented). */
function nowItem(regionName: string, timeMs: number, c: NonNullable<ReturnType<typeof useConditions>['conditions']>): NarrationItem {
  const d = new Date(timeMs);
  const when = `${d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
  const say = (name: string, b: TopocentricBody) => {
    const el = `${Math.abs(b.elDeg).toFixed(1)} degrees ${b.elDeg >= 0 ? 'above' : 'below'} the horizontal`;
    if (b.state === 'visible') return `${name} is visible, ${el}, clearing the skyline by ${b.marginDeg.toFixed(1)} degrees.`;
    if (b.state === 'below-horizontal') return `${name} is not visible: it is ${el}.`;
    return `${name} is hidden by terrain: it is ${el}, ${Math.abs(b.marginDeg).toFixed(1)} degrees below the skyline.`;
  };
  return {
    id: `now-${timeMs}`,
    title: 'Conditions now',
    calculated: true,
    text: `Calculated for ${regionName}, ${when}. ${say('The Sun', c.sun)} ${say('The Earth', c.earth)} Earth visibility is a geometric line of sight, not a guaranteed communication link.`,
  };
}

/** Surface view in darkness: say why it is dark and what to do about it. */
export function SunDownNote() {
  const { conditions } = useConditions();
  if (!conditions || conditions.sun.state === 'visible') return null;
  return (
    <div className="loadchip sundown" role="status">
      <SunGlyph size={12} />
      <span>{t(conditions.sun.state === 'below-horizontal' ? 'Sun is below the horizon — advance time.' : 'Sun is hidden behind terrain — advance time.')}</span>
    </div>
  );
}

export function ConditionsCard() {
  const { conditions, region } = useConditions();
  const timeMs = useApp((s) => s.timeMs);
  const { ephemeris } = useData();
  const drawer = useApp((s) => s.drawer);
  const openDrawer = useApp((s) => s.openDrawer);
  const folded = useSettings((s) => s.readingsFolded);
  const setS = useSettings((s) => s.set);
  if (folded)
    return (
      <section className="cond cond--folded" aria-label={t('Conditions at the observation point')} data-obstacle>
        {conditions ? (
          <div className="cond__mini">
            {(['sun', 'earth'] as const).map((w) => {
              const b = conditions[w];
              const up = b.state === 'visible';
              return (
                <span key={w} className={`cond__mini-body cond__mini-body--${w}${up ? ' is-up' : ''}`}>
                  {w === 'sun' ? <SunGlyph size={12} /> : <EarthGlyph size={12} />}
                  <span className="num">{fmtDeg(b.marginDeg, 1)}</span>
                  <span className="cond__mini-state">{t(up ? 'Visible' : 'Hidden')}</span>
                </span>
              );
            })}
          </div>
        ) : (
          <span className="cond__mini">{t('No ephemeris for this time')}</span>
        )}
        <button type="button" className="cond__fold" aria-expanded={false} aria-label={t('Show Sun and Earth readings')} title={t('Show readings')} onClick={() => setS({ readingsFolded: false })}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>
        </button>
      </section>
    );
  return (
    <section className="cond" aria-label={t('Conditions at the observation point')} aria-live="polite" data-obstacle>
      {conditions ? (
        <div className="cond__pair">
          <Body which="sun" b={conditions.sun} />
          <Body which="earth" b={conditions.earth} />
        </div>
      ) : (
        <p className="cond__none">
          No ephemeris for this time. Coverage {fmtDate(ephemeris.startMs)} – {fmtDate(ephemeris.endMs)} UTC.
        </p>
      )}
      <div className="cond__foot">
        <button type="button" className="cond__more" aria-expanded={drawer === 'details'} onClick={() => openDrawer('details')}>
          {t(drawer === 'details' ? 'Hide measurements' : 'All measurements')}
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 2 6.5 5l-3 3" stroke="currentColor" fill="none" strokeWidth="1.4" /></svg>
        </button>
        {conditions && <Listen item={nowItem(region.name, timeMs, conditions)} />}
        <button type="button" className="cond__fold" aria-expanded={true} aria-label={t('Hide Sun and Earth readings')} title={t('Hide readings')} onClick={() => setS({ readingsFolded: true })}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 7.5 6 4l3.5 3.5" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>
        </button>
      </div>
    </section>
  );
}

function BodyTable({ which, b, range }: { which: 'sun' | 'earth'; b: TopocentricBody; range?: number }) {
  return (
    <section className={`mtable mtable--${which}`}>
      <h3 className="mtable__head">
        {which === 'sun' ? <SunGlyph size={13} /> : <EarthGlyph size={13} />}
        {which === 'sun' ? 'Sun' : 'Earth'}
        <span className="mtable__state">{t(STATE_LABEL[b.state])}</span>
      </h3>
      <dl className="readouts">
        <Readout label={t('Elevation')} value={fmtDeg(b.elDeg)} hint={t('Above the local horizontal plane')} />
        <Readout label={t('Azimuth')} value={`${b.azDeg.toFixed(2)}°`} unit={compass(b.azDeg)} hint={t('Clockwise from local north')} />
        <Readout label={t('Terrain skyline')} value={fmtDeg(b.horizonDeg)} hint={t('LOLA skyline elevation at this azimuth')} />
        <Readout label={t('Clearance')} value={fmtDeg(b.marginDeg)} hint={t('Elevation minus skyline')} />
        <Readout label={t('Disc above skyline')} value={(b.discFraction * 100).toFixed(0)} unit="%" hint={t('Flat-skyline approximation')} />
        {range !== undefined && <Readout label={t('Range')} value={Math.round(range).toLocaleString('en-US')} unit="km" />}
      </dl>
    </section>
  );
}

/** Drawer: the full measurement set and how the point was chosen. */
export function DetailsDrawer() {
  const { region, conditions, sample } = useConditions();
  const p = region.observationPoint;
  const f = region.referenceFeature;
  return (
    <div className="details">
      <p className="drawer__lede">
        Topocentric positions at the observation point, {p.observerHeightM.toFixed(0)} m above the surface, against the skyline ray-traced
        through LOLA terrain to 150 km.
      </p>
      {conditions && sample && (
        <div className="details__bodies">
          <BodyTable which="sun" b={conditions.sun} />
          <BodyTable which="earth" b={conditions.earth} range={sample.earth.distanceKm} />
        </div>
      )}
      <p className="details__terms">
        <span>{t('Listen:')}</span>
        <Listen id="term-elevation" /> Elevation <Listen id="term-azimuth" /> Azimuth <Listen id="term-skyline" /> Skyline{' '}
        <Listen id="term-clearance" /> Clearance <Listen id="term-coordinates" /> Coordinates
      </p>
      <section className="mtable">
        <h3 className="mtable__head">{t('Observation point')}</h3>
        <dl className="readouts">
          <Readout label={t('Position')} value={`${fmtLat(p.latDeg)} ${fmtLon(p.lonDeg)}`} />
          <Readout label={t('Elevation')} value={p.elevationM.toFixed(0)} unit="m" hint="Relative to the 1737.4 km reference sphere (LOLA)" />
          {p.sunVisibleFraction2027 !== undefined && <Readout label={t('Sun in 2027')} value={(p.sunVisibleFraction2027 * 100).toFixed(1)} unit="% of hours" />}
        </dl>
        <p className="details__ref">
          {region.nasaRegion && (
            <>
              NASA region outline about {region.nasaRegion.sizeKm[0].toFixed(0)} × {region.nasaRegion.sizeKm[1].toFixed(0)} km, centred{' '}
              {fmtLat(region.nasaRegion.centreLatDeg, 2)} {fmtLon(region.nasaRegion.centreLonDeg, 2)}.{' '}
            </>
          )}
          Named after{' '}
          {f.url ? (
            <a href={f.url} target="_blank" rel="noreferrer">
              {f.name}
            </a>
          ) : (
            f.name
          )}{' '}
          ({f.type.toLowerCase()}).
        </p>
      </section>
      <details className="disclose">
        <summary>{t('How this point was chosen')}</summary>
        <p className="disclose__text">
          NASA has published its candidate regions only as outlines on a map. The outline here was digitised from that map by
          registering it to the LROC mosaic (about 0.5 km accuracy). Readings use one representative point inside it, not a
          NASA-designated landing site.
        </p>
        <p className="disclose__text disclose__text--strong">{p.selectionRule}</p>
      </details>
    </div>
  );
}
