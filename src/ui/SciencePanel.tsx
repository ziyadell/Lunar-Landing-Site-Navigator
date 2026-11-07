import { useConditions } from '../data/useConditions';
import { useData } from '../data/DataContext';
import { compass, fmtDate, fmtDeg, fmtLat, fmtLon, fmtUtc } from '../utils/format';
import { EarthGlyph, Readout, SectionHead, StateTag, SunGlyph } from './primitives';
import { CollapseButton } from './PanelRails';
import type { TopocentricBody } from '../data/types';

function BodyBlock({ body, b, extra }: { body: 'sun' | 'earth'; b: TopocentricBody; extra?: React.ReactNode }) {
  return (
    <>
      <div className="body-state">
        <StateTag state={b.state} body={body} />
      </div>
      <dl className="readouts">
        <Readout label="Elevation" value={fmtDeg(b.elDeg)} hint="Above the local horizontal plane (geometric)" emphasis />
        <Readout label="Azimuth" value={`${b.azDeg.toFixed(2)}°`} unit={compass(b.azDeg)} hint="Clockwise from local north" />
        <Readout label="Terrain horizon" value={fmtDeg(b.horizonDeg)} hint="LOLA skyline elevation at this azimuth" />
        <Readout label="Clearance" value={fmtDeg(b.marginDeg)} hint="Elevation minus terrain horizon" />
        <Readout
          label="Disc above skyline"
          value={(b.discFraction * 100).toFixed(0)}
          unit="%"
          hint="Flat-skyline approximation of the visible fraction of the disc"
        />
        {extra}
      </dl>
    </>
  );
}

export function ScienceReadings() {
  const { region, conditions, sample, timeMs } = useConditions();
  const { ephemeris } = useData();
  const p = region.observationPoint;

  return (
    <div className="science">
      <SectionHead aside={<span className="num">{fmtUtc(timeMs)}</span>}>Lunar Observation</SectionHead>
      <dl className="readouts">
        <Readout label="Region" value={<span className="plain">{region.name}</span>} />
        <Readout label="Point" value={`${fmtLat(p.latDeg)} ${fmtLon(p.lonDeg)}`} />
        <Readout label="Elevation" value={p.elevationM.toFixed(0)} unit="m" hint="Relative to the 1737.4 km reference sphere (LOLA)" />
        <Readout label="Observer height" value={p.observerHeightM.toFixed(1)} unit="m" />
      </dl>

      {!conditions || !sample ? (
        <div className="notice notice--warn" role="status">
          No ephemeris for this epoch. Precomputed coverage: {fmtDate(ephemeris.startMs)} – {fmtDate(ephemeris.endMs)} UTC.
        </div>
      ) : (
        <>
          <SectionHead tone="sun" aside={<SunGlyph />}>
            Solar Conditions
          </SectionHead>
          <BodyBlock body="sun" b={conditions.sun} />
          <SectionHead tone="earth" aside={<EarthGlyph />}>
            Earth Geometry
          </SectionHead>
          <BodyBlock
            body="earth"
            b={conditions.earth}
            extra={<Readout label="Range" value={Math.round(sample.earth.distanceKm).toLocaleString('en-US')} unit="km" />}
          />
        </>
      )}
    </div>
  );
}

export function DataSources() {
  const { sites, ephemeris, validation } = useData();
  const worst = validation
    ? Math.max(...validation.sites.flatMap((s) => [s.sun.maxElevErrDeg, s.earth.maxElevErrDeg, s.sun.maxAzErrDeg, s.earth.maxAzErrDeg]))
    : null;
  return (
    <div className="sources">
      <SectionHead>Data Source &amp; Method</SectionHead>
      <dl className="kv kv--tight">
        <div>
          <dt>Ephemeris</dt>
          <dd>
            NASA/JPL Horizons, hourly sub-solar &amp; sub-Earth points, retrieved {ephemeris.file.retrievedUtc.slice(0, 10)}
          </dd>
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
      <p className="fineprint">
        Earth visibility is a geometric line of sight only, not a guaranteed communication link.
      </p>
      <p className="fineprint">
        Space Apps 2026 project using NASA data. Not an official NASA product or endorsed by NASA.
      </p>
    </div>
  );
}

export function SciencePanel() {
  return (
    <aside className="panel panel--right" aria-label="Scientific readings">
      <div className="panel__collapse"><CollapseButton side="right" /></div>
      <ScienceReadings />
      <DataSources />
    </aside>
  );
}
