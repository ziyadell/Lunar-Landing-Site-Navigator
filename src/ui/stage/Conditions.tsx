import { useConditions } from '../../data/useConditions';
import { useApp } from '../../state/store';
import { useData } from '../../data/DataContext';
import { compass, fmtDate, fmtDeg, fmtLat, fmtLon } from '../../utils/format';
import { EarthGlyph, Readout, SunGlyph } from '../primitives';
import type { TopocentricBody } from '../../data/types';
import { STATE_LABEL } from '../../science/visibility';
import { Listen } from '../../audio/ui';
import type { NarrationItem } from '../../audio/engine';

/**
 * The essential answer, always on screen: can you see the Sun and Earth from
 * the observation point right now, and by how much do they clear the measured
 * skyline? Everything else is one tap away in the Details drawer.
 */

function plain(b: TopocentricBody) {
  if (b.state === 'visible') return `${b.marginDeg.toFixed(1)}° above the skyline`;
  if (b.state === 'below-horizontal') return 'Below the horizon';
  return `Hidden by terrain · ${Math.abs(b.marginDeg).toFixed(1)}° short`;
}

function Body({ which, b }: { which: 'sun' | 'earth'; b: TopocentricBody }) {
  const up = b.state === 'visible';
  return (
    <div className={`cond__body cond__body--${which}${up ? ' is-up' : ' is-down'}`}>
      <div className="cond__name">
        {which === 'sun' ? <SunGlyph size={13} /> : <EarthGlyph size={13} />}
        {which === 'sun' ? 'Sun' : 'Earth'}
        <span className="cond__state">{up ? 'Visible' : 'Not visible'}</span>
      </div>
      <div className="cond__value num">
        {fmtDeg(b.elDeg, 2)}
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

export function ConditionsCard() {
  const { conditions, region } = useConditions();
  const timeMs = useApp((s) => s.timeMs);
  const { ephemeris } = useData();
  const drawer = useApp((s) => s.drawer);
  const openDrawer = useApp((s) => s.openDrawer);
  return (
    <section className="cond" aria-label="Conditions at the observation point" aria-live="polite" data-obstacle>
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
      {conditions && <Listen item={nowItem(region.name, timeMs, conditions)} className="listen--cond" />}
      <button type="button" className="cond__more" aria-expanded={drawer === 'details'} onClick={() => openDrawer('details')}>
        {drawer === 'details' ? 'Hide measurements' : 'All measurements'}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 2 6.5 5l-3 3" stroke="currentColor" fill="none" strokeWidth="1.4" /></svg>
      </button>
    </section>
  );
}

function BodyTable({ which, b, range }: { which: 'sun' | 'earth'; b: TopocentricBody; range?: number }) {
  return (
    <section className={`mtable mtable--${which}`}>
      <h3 className="mtable__head">
        {which === 'sun' ? <SunGlyph size={13} /> : <EarthGlyph size={13} />}
        {which === 'sun' ? 'Sun' : 'Earth'}
        <span className="mtable__state">{STATE_LABEL[b.state]}</span>
      </h3>
      <dl className="readouts">
        <Readout label="Elevation" value={fmtDeg(b.elDeg)} hint="Above the local horizontal plane" />
        <Readout label="Azimuth" value={`${b.azDeg.toFixed(2)}°`} unit={compass(b.azDeg)} hint="Clockwise from local north" />
        <Readout label="Terrain skyline" value={fmtDeg(b.horizonDeg)} hint="LOLA skyline elevation at this azimuth" />
        <Readout label="Clearance" value={fmtDeg(b.marginDeg)} hint="Elevation minus skyline" />
        <Readout label="Disc above skyline" value={(b.discFraction * 100).toFixed(0)} unit="%" hint="Flat-skyline approximation" />
        {range !== undefined && <Readout label="Range" value={Math.round(range).toLocaleString('en-US')} unit="km" />}
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
        <span>Listen:</span>
        <Listen id="term-elevation" /> Elevation <Listen id="term-azimuth" /> Azimuth <Listen id="term-skyline" /> Skyline{' '}
        <Listen id="term-clearance" /> Clearance <Listen id="term-coordinates" /> Coordinates
      </p>
      <section className="mtable">
        <h3 className="mtable__head">Observation point</h3>
        <dl className="readouts">
          <Readout label="Position" value={`${fmtLat(p.latDeg)} ${fmtLon(p.lonDeg)}`} />
          <Readout label="Elevation" value={p.elevationM.toFixed(0)} unit="m" hint="Relative to the 1737.4 km reference sphere (LOLA)" />
          {p.sunVisibleFraction2027 !== undefined && <Readout label="Sun in 2027" value={(p.sunVisibleFraction2027 * 100).toFixed(1)} unit="% of hours" />}
        </dl>
        <p className="details__ref">
          NASA region outline about {region.nasaRegion.sizeKm[0].toFixed(0)} × {region.nasaRegion.sizeKm[1].toFixed(0)} km, centred{' '}
          {fmtLat(region.nasaRegion.centreLatDeg, 2)} {fmtLon(region.nasaRegion.centreLonDeg, 2)}. Named after{' '}
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
        <summary>How this point was chosen</summary>
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
