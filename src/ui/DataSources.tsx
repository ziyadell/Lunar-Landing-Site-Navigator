import { useData } from '../data/DataContext';

export function DataSources({ open = false }: { open?: boolean }) {
  const { sites, ephemeris, validation } = useData();
  const worst = validation
    ? Math.max(...validation.sites.flatMap((s) => [s.sun.maxElevErrDeg, s.earth.maxElevErrDeg, s.sun.maxAzErrDeg, s.earth.maxAzErrDeg]))
    : null;
  // Libration is not modelled separately: it is the motion of the sub-Earth point itself.
  const span = (v: number[], wrap: boolean) => {
    const x = wrap ? v.map((d) => ((d + 540) % 360) - 180) : v;
    return `${Math.min(...x).toFixed(1)}° to ${Math.max(...x).toFixed(1)}`;
  };
  const lib = { lon: span(ephemeris.file.subEarthLonDeg, true), lat: span(ephemeris.file.subEarthLatDeg, false) };
  return (
    <details className="disclose disclose--section sources" open={open}>
      <summary>Data &amp; method</summary>
      <dl className="kv kv--tight">
        <div>
          <dt>Regions</dt>
          <dd>
            NASA&rsquo;s nine candidate landing regions for the Artemis campaign (announced 28 Oct 2024). Outlines digitised from{' '}
            {sites.nasaRegionMap ? (
              <a href={sites.nasaRegionMap.url} target="_blank" rel="noreferrer">
                NASA&rsquo;s official map
              </a>
            ) : (
              "NASA's official map"
            )}{' '}
            by registering it to the LROC mosaic (≈0.5 km); one rule-based observation point per region
          </dd>
        </div>
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
          <dt>Stars</dt>
          <dd>Yale Bright Star Catalogue (V &lt; 5.5), placed with the IAU Moon rotation model</dd>
        </div>
        <div>
          <dt>Visibility</dt>
          <dd>Terrain-corrected: disc centre above the LOLA skyline (rays to 150 km)</dd>
        </div>
        <div>
          <dt>Libration</dt>
          <dd>{`Included. Earth’s direction follows the hourly sub-Earth point, which moves ${lib.lon}° in longitude and ${lib.lat}° in latitude over the covered period.`}</dd>
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
      <p className="fineprint">Made for landing-site planning: the question behind NASA’s CLPS deliveries and Artemis III alike is when a site sees the Sun and the Earth, and what changes if the date slips.</p>
      <p className="fineprint">Earth visibility is a geometric line of sight only, not a guaranteed communication link.</p>
      <p className="fineprint">LunaNav, the Lunar Landing Site Navigator, by Team AFUQ. A Space Apps 2026 project using NASA data; not an official NASA product or endorsed by NASA.</p>
    </details>
  );
}
