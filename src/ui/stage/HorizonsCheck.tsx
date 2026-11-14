import { useEffect, useState } from 'react';
import type { ObservationPoint, TopocentricBody } from '../../data/types';

interface AzEl {
  azDeg: number;
  elDeg: number;
}
type State = { s: 'idle' } | { s: 'loading' } | { s: 'failed' } | { s: 'done'; sun: AzEl; earth: AzEl };

/** Smallest angle between two azimuths, on the sky (scaled by cos elevation). */
const azDiff = (a: number, b: number, elDeg: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180) * Math.cos((elDeg * Math.PI) / 180);

function Row({ name, app, live }: { name: string; app: TopocentricBody; live: AzEl }) {
  return (
    <tr>
      <th scope="row">{name}</th>
      <td className="num">{app.elDeg.toFixed(3)}°</td>
      <td className="num">{live.elDeg.toFixed(3)}°</td>
      <td className="num">{Math.abs(app.elDeg - live.elDeg).toFixed(3)}°</td>
      <td className="num">{azDiff(app.azDeg, live.azDeg, live.elDeg).toFixed(3)}°</td>
    </tr>
  );
}

/**
 * One live question to NASA/JPL Horizons for this point and minute, shown beside LunaNav's own
 * numbers. It checks the Sun and Earth directions only: Horizons knows nothing about terrain.
 */
export function HorizonsCheck({ p, timeMs, sun, earth }: { p: ObservationPoint; timeMs: number; sun: TopocentricBody; earth: TopocentricBody }) {
  const [st, setSt] = useState<State>({ s: 'idle' });
  const minute = Math.floor(timeMs / 60_000) * 60_000;
  // A result belongs to one point and one minute.
  useEffect(() => setSt({ s: 'idle' }), [p.latDeg, p.lonDeg, minute]);

  const run = async () => {
    setSt({ s: 'loading' });
    try {
      const q = new URLSearchParams({
        lat: p.latDeg.toFixed(4),
        lon: p.lonDeg.toFixed(4),
        alt: ((p.elevationM + p.observerHeightM) / 1000).toFixed(4),
        t: new Date(minute).toISOString().slice(0, 16) + 'Z',
      });
      const r = await fetch(`/api/horizons?${q}`);
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { sun: AzEl; earth: AzEl };
      setSt({ s: 'done', sun: j.sun, earth: j.earth });
    } catch {
      setSt({ s: 'failed' });
    }
  };

  return (
    <section className="mtable hzcheck" aria-label="Live check against JPL Horizons">
      <h3 className="mtable__head">Live check · NASA/JPL Horizons</h3>
      {st.s === 'done' ? (
        <table className="hzcheck__table">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Body</span>
              </th>
              <th scope="col">LunaNav elevation</th>
              <th scope="col">Horizons elevation</th>
              <th scope="col">Elevation difference</th>
              <th scope="col">Azimuth difference</th>
            </tr>
          </thead>
          <tbody>
            <Row name="Sun" app={sun} live={st.sun} />
            <Row name="Earth" app={earth} live={st.earth} />
          </tbody>
        </table>
      ) : (
        <button type="button" className="btn-chip" onClick={run} disabled={st.s === 'loading'}>
          {st.s === 'loading' ? 'Asking Horizons…' : st.s === 'failed' ? 'Try again' : 'Check this moment against Horizons'}
        </button>
      )}
      <p className="hzcheck__note" role="status">
        {st.s === 'failed'
          ? 'Horizons did not answer. LunaNav’s own readings are unaffected.'
          : 'Asks NASA/JPL Horizons for the Sun and Earth directions at this point and minute. It checks directions only: Horizons does not know the terrain, so the skyline is not part of this check.'}
      </p>
    </section>
  );
}
