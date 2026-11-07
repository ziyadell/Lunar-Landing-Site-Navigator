import { useConditions } from '../data/useConditions';
import { useData } from '../data/DataContext';
import { compass, fmtDate, fmtDeg, fmtLat, fmtLon, fmtUtc } from '../utils/format';
import { EarthGlyph, Readout, SunGlyph } from './primitives';
import { CollapseButton } from './PanelRails';
import type { TopocentricBody } from '../data/types';
import { STATE_LABEL } from '../science/visibility';

/**
 * Right panel. Progressive disclosure:
 *  1. Two instrument cards (Sun, Earth): elevation, state, clearance above the measured skyline.
 *  2. "All readings" (azimuth, horizon, disc fraction, range) — one click away.
 *  3. Location and Data & method — collapsible, never hidden.
 */

function BodyCard({ body, b, range }: { body: 'sun' | 'earth'; b: TopocentricBody; range?: number }) {
  const up = b.state === 'visible';
  const name = body === 'sun' ? 'Sun' : 'Earth';
  // Always state the result against the measured skyline (the chip already gives the category).
  const plain =
    b.marginDeg >= 0
      ? `${fmtDeg(b.marginDeg, 1)} above the LOLA skyline`
      : `${Math.abs(b.marginDeg).toFixed(1)}° below the LOLA skyline (skyline ${fmtDeg(b.horizonDeg, 1)})`;
  return (
    <section className={`body-card body-card--${body}${up ? ' is-up' : ' is-down'}`} aria-label={`${name} conditions`}>
      <header className="body-card__head">
        <span className="body-card__name">
          {body === 'sun' ? <SunGlyph size={14} /> : <EarthGlyph size={14} />} {name}
        </span>
        <span className={`body-card__state ${up ? '' : 'is-warn'}`}>
          <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
            {up ? <circle cx="4" cy="4" r="3.5" fill="currentColor" /> : <path d="M1 1 7 7M7 1 1 7" stroke="currentColor" strokeWidth="1.5" />}
          </svg>
          {up ? 'Visible' : STATE_LABEL[b.state]}
        </span>
      </header>
      {/* key on value: a brief highlight when the reading changes (no motion if reduced). */}
      <div className="body-card__value num" key={b.elDeg.toFixed(2)}>
        {fmtDeg(b.elDeg, 2)}
        <span className="body-card__unit">elevation</span>
      </div>
      <p className="body-card__plain">{plain}</p>
      <details className="disclose">
        <summary>All {name.toLowerCase()} readings</summary>
        <dl className="readouts">
          <Readout label="Azimuth" value={`${b.azDeg.toFixed(2)}°`} unit={compass(b.azDeg)} hint="Clockwise from local north" />
          <Readout label="Terrain horizon" value={fmtDeg(b.horizonDeg)} hint="LOLA skyline elevation at this azimuth" />
          <Readout label="Clearance" value={fmtDeg(b.marginDeg)} hint="Elevation minus terrain horizon" />
          <Readout label="Disc above skyline" value={(b.discFraction * 100).toFixed(0)} unit="%" hint="Flat-skyline approximation" />
          {range !== undefined && <Readout label="Range" value={Math.round(range).toLocaleString('en-US')} unit="km" />}
        </dl>
      </details>
    </section>
  );
}

export function ScienceReadings() {
  const { region, conditions, sample, timeMs } = useConditions();
  const { ephemeris } = useData();
  const p = region.observationPoint;

  return (
    <div className="science">
      <div className="science__head">
        <div>
          <div className="eyebrow">Observation point</div>
          <h2 className="science__title">{region.name}</h2>
        </div>
        <div className="science__time num">{fmtUtc(timeMs)}</div>
      </div>

      {!conditions || !sample ? (
        <div className="notice notice--warn" role="status">
          No ephemeris for this time. Precomputed coverage: {fmtDate(ephemeris.startMs)} – {fmtDate(ephemeris.endMs)} UTC.
        </div>
      ) : (
        <div className="body-cards">
          <BodyCard body="sun" b={conditions.sun} />
          <BodyCard body="earth" b={conditions.earth} range={sample.earth.distanceKm} />
        </div>
      )}

      <details className="disclose disclose--section">
        <summary>Location</summary>
        <dl className="readouts">
          <Readout label="Point" value={`${fmtLat(p.latDeg)} ${fmtLon(p.lonDeg)}`} />
          <Readout label="Elevation" value={p.elevationM.toFixed(0)} unit="m" hint="Relative to the 1737.4 km reference sphere (LOLA)" />
          <Readout label="Observer height" value={p.observerHeightM.toFixed(1)} unit="m" />
        </dl>
      </details>
    </div>
  );
}

export function DataSources() {
  const { sites, ephemeris, validation } = useData();
  const worst = validation
    ? Math.max(...validation.sites.flatMap((s) => [s.sun.maxElevErrDeg, s.earth.maxElevErrDeg, s.sun.maxAzErrDeg, s.earth.maxAzErrDeg]))
    : null;
  return (
    <details className="disclose disclose--section sources">
      <summary>Data &amp; method</summary>
      <dl className="kv kv--tight">
        <div>
          <dt>Ephemeris</dt>
          <dd>NASA/JPL Horizons, hourly sub-solar &amp; sub-Earth points, retrieved {ephemeris.file.retrievedUtc.slice(0, 10)}</dd>
        </div>
        <div>
          <dt>Terrain</dt>
          <dd>{sites.dem.name}, {sites.dem.resolutionM} m/px</dd>
        </div>
        <div>
          <dt>Imagery</dt>
          <dd>LROC WAC global mosaic (NASA SVS); south of 80.6°S the LROC WAC South Pole Summer Mosaic, 100 m/px</dd>
        </div>
        <div>
          <dt>Visibility</dt>
          <dd>Terrain-corrected: disc centre above the LOLA skyline (rays to 150 km)</dd>
        </div>
        {worst !== null && (
          <div>
            <dt>Validated</dt>
            <dd>
              vs Horizons topocentric Az/El: max error <span className="num">{worst.toFixed(3)}°</span>
            </dd>
          </div>
        )}
      </dl>
      <p className="fineprint">Earth visibility is a geometric line of sight only, not a guaranteed communication link.</p>
      <p className="fineprint">Space Apps 2026 project using NASA data. Not an official NASA product or endorsed by NASA.</p>
    </details>
  );
}

export function SciencePanel() {
  return (
    <aside className="panel panel--right" aria-label="Scientific readings">
      <div className="panel__collapse">
        <CollapseButton side="right" />
      </div>
      <ScienceReadings />
      <DataSources />
    </aside>
  );
}
