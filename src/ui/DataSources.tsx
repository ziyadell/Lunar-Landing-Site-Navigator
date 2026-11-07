import { useData } from '../data/DataContext';

export function DataSources({ open = false }: { open?: boolean }) {
  const { sites, ephemeris, validation } = useData();
  const worst = validation
    ? Math.max(...validation.sites.flatMap((s) => [s.sun.maxElevErrDeg, s.earth.maxElevErrDeg, s.sun.maxAzErrDeg, s.earth.maxAzErrDeg]))
    : null;
  return (
    <details className="disclose disclose--section sources" open={open}>
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
