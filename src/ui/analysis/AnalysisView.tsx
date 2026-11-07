import { useMemo } from 'react';
import { useApp, type Scenario } from '../../state/store';
import { useData } from '../../data/DataContext';
import { computeSeries, scenarioMetrics, type SeriesPoint } from '../../science/visibility';
import type { LandingRegion, ScenarioMetrics } from '../../data/types';
import { fmtDate, fmtDeg, fmtHours, fmtLat, fmtLon } from '../../utils/format';
import { thumbUrl } from '../stage/Regions';
import { ScenarioTimeline } from './ScenarioTimeline';
import { useMedia } from '../../utils/useMedia';
import { HorizonPanorama } from './HorizonPanorama';

const DURATIONS = [7, 14, 30, 60, 90, 180, 365];
const DAY = 86_400_000;

export interface ScenarioResult {
  key: 'A' | 'B';
  scenario: Scenario;
  region: LandingRegion;
  startMs: number;
  endMs: number;
  stepMin: number;
  series: SeriesPoint[];
  metrics: ScenarioMetrics | null;
  clipped: boolean;
}

function useScenario(i: 0 | 1): ScenarioResult {
  const s = useApp((st) => st.scenarios[i]);
  const { ephemeris, region } = useData();
  return useMemo(() => {
    const r = region(s.regionId);
    const want = s.startMs + s.durationDays * DAY;
    const startMs = ephemeris.clamp(s.startMs);
    const endMs = ephemeris.clamp(want);
    const stepMin = s.durationDays <= 60 ? 15 : 60;
    const series = computeSeries(r, ephemeris, startMs, endMs - stepMin * 60_000, stepMin);
    return {
      key: i === 0 ? 'A' : 'B',
      scenario: s,
      region: r,
      startMs,
      endMs,
      stepMin,
      series,
      metrics: scenarioMetrics(series, stepMin),
      clipped: startMs !== s.startMs || endMs !== want,
    };
  }, [s, ephemeris, region, i]);
}

const PERIODS = [7, 30, 90, 365];

function Vantage({ i, res }: { i: 0 | 1; res: ScenarioResult }) {
  const { sites, ephemeris } = useData();
  const set = useApp((st) => st.setScenario);
  const id = `scn-${res.key}`;
  const p = res.region.observationPoint;
  const periods = [...new Set([...PERIODS, res.scenario.durationDays])].sort((x, y) => x - y);
  return (
    <section className={`vantage vantage--${res.key}`} aria-labelledby={`${id}-title`}>
      <div className="vantage__head">
        <img className="vantage__img" src={thumbUrl(res.region.id)} alt={`LROC WAC 100 m image, 24 km square, centred on the ${res.region.name} observation point`} width={120} height={120} />
        <div className="vantage__title">
          <span className="vantage__key">Scenario {res.key}</span>
          <h3 id={`${id}-title`} className="vantage__name">{res.region.name}</h3>
          <span className="vantage__coord num">
            {fmtLat(p.latDeg, 2)} {fmtLon(p.lonDeg, 2)} · {p.elevationM.toFixed(0)} m
          </span>
        </div>
      </div>
      <div className="vantage__pick" role="radiogroup" aria-label={`Region for scenario ${res.key}`}>
        {sites.regions.map((r) => (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={r.id === res.region.id}
            className={`vantage__chip${r.id === res.region.id ? ' is-on' : ''}`}
            title={r.name}
            aria-label={r.name}
            onClick={() => set(i, { regionId: r.id })}
          >
            <img src={thumbUrl(r.id)} alt="" width={40} height={40} loading="lazy" />
          </button>
        ))}
      </div>
      <div className="vantage__when">
        <div className="field">
          <label htmlFor={`${id}-start`}>Starting (UTC)</label>
          <input
            id={`${id}-start`}
            type="date"
            value={fmtDate(res.scenario.startMs)}
            min={fmtDate(ephemeris.startMs)}
            max={fmtDate(ephemeris.endMs - DAY)}
            onChange={(e) => {
              const v = Date.parse(`${e.target.value}T00:00:00Z`);
              if (!Number.isNaN(v)) set(i, { startMs: v });
            }}
          />
        </div>
        <div className="field field--grow">
          <span className="field__label" id={`${id}-dur`}>For</span>
          <div className="seg seg--period" role="radiogroup" aria-labelledby={`${id}-dur`}>
            {periods.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={res.scenario.durationDays === d}
                className={`seg__btn${res.scenario.durationDays === d ? ' is-active' : ''}`}
                onClick={() => set(i, { durationDays: d })}
              >
                {d === 365 ? '1 yr' : `${d} d`}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${id}-dur-all`}>Other</label>
          <select id={`${id}-dur-all`} value={res.scenario.durationDays} onChange={(e) => set(i, { durationDays: +e.target.value })}>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </div>
      </div>
      {res.clipped && (
        <div className="notice notice--warn">
          Period clipped to ephemeris coverage ({fmtDate(ephemeris.startMs)} – {fmtDate(ephemeris.endMs)}).
        </div>
      )}
    </section>
  );
}

/** Headline comparison: one row per question, two bars, one plain difference. */
type Headline = {
  key: string;
  q: string;
  note: string;
  tone: 'sun' | 'earth' | 'both' | 'dark';
  get: (m: ScenarioMetrics) => number;
  pct: boolean;
  better: 'higher' | 'lower';
  trunc?: (m: ScenarioMetrics) => boolean;
};
const HEADLINES: Headline[] = [
  { key: 'sun', q: 'Sun above the skyline', note: 'share of the period', tone: 'sun', get: (m) => m.sunVisiblePct, pct: true, better: 'higher' },
  { key: 'earth', q: 'Earth above the skyline', note: 'share of the period', tone: 'earth', get: (m) => m.earthVisiblePct, pct: true, better: 'higher' },
  { key: 'both', q: 'Sun and Earth together', note: 'share of the period', tone: 'both', get: (m) => m.bothVisiblePct, pct: true, better: 'higher' },
  { key: 'dark', q: 'Longest stretch without Sun', note: 'shorter is easier on power', tone: 'dark', get: (m) => m.longestNoSunHours, pct: false, better: 'lower', trunc: (m) => m.noSunTruncated },
];

function Headlines({ a, b }: { a: ScenarioResult; b: ScenarioResult }) {
  if (!a.metrics || !b.metrics) return null;
  const A = a.metrics;
  const B = b.metrics;
  return (
    <div className="glance">
      {HEADLINES.map((h) => {
        const va = h.get(A);
        const vb = h.get(B);
        const max = h.pct ? 100 : Math.max(va, vb, 1);
        const d = vb - va;
        const fmt = (v: number, m: ScenarioMetrics) => (h.pct ? `${v.toFixed(1)}%` : `${h.trunc?.(m) ? '≥ ' : ''}${fmtHours(v)}`);
        const even = Math.abs(d) < 0.05;
        const winner = even ? null : d > 0 === (h.better === 'higher') ? 'B' : 'A';
        const rows = [
          { k: 'A', v: va, m: A, r: a },
          { k: 'B', v: vb, m: B, r: b },
        ];
        return (
          <div key={h.key} className={`glance__row glance__row--${h.tone}`}>
            <div className="glance__q">
              {h.q}
              <span className="glance__unit">{h.note}</span>
            </div>
            <div className="glance__bars">
              {rows.map((x) => (
                <div key={x.k} className={`glance__bar glance__bar--${x.k}`}>
                  <span className="glance__k" aria-hidden="true">{x.k}</span>
                  <span className="glance__track" aria-hidden="true">
                    <span style={{ width: `${Math.max(0.6, (x.v / max) * 100)}%` }} />
                  </span>
                  <span className="glance__v num">
                    <span className="sr-only">
                      {x.k}, {x.r.region.name}:{' '}
                    </span>
                    {fmt(x.v, x.m)}
                  </span>
                </div>
              ))}
            </div>
            <div className={`glance__verdict${winner ? '' : ' is-even'}`}>
              {winner ? (
                <>
                  <strong>{winner}</strong> {h.better === 'higher' ? 'higher' : 'shorter'} by{' '}
                  <span className="num">{h.pct ? `${Math.abs(d).toFixed(1)} pp` : fmtHours(Math.abs(d))}</span>
                </>
              ) : (
                'No difference'
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Row = {
  label: string;
  unit: string;
  get: (m: ScenarioMetrics) => number;
  fmt: (v: number) => string;
  better?: 'higher' | 'lower';
  truncated?: (m: ScenarioMetrics) => boolean;
  group: string;
};

const ROWS: Row[] = [
  { group: 'Solar', label: 'Sun above terrain horizon', unit: '% of period', get: (m) => m.sunVisiblePct, fmt: (v) => v.toFixed(1), better: 'higher' },
  { group: 'Solar', label: 'Longest continuous sunlight', unit: '', get: (m) => m.longestSunHours, fmt: fmtHours, better: 'higher' },
  { group: 'Solar', label: 'Longest period without Sun', unit: '', get: (m) => m.longestNoSunHours, fmt: fmtHours, better: 'lower', truncated: (m) => m.noSunTruncated },
  { group: 'Solar', label: 'Sun elevation range', unit: '', get: (m) => m.sunElevRange[1], fmt: (v) => fmtDeg(v, 2) },
  { group: 'Earth', label: 'Earth above terrain horizon', unit: '% of period', get: (m) => m.earthVisiblePct, fmt: (v) => v.toFixed(1), better: 'higher' },
  { group: 'Earth', label: 'Longest period without Earth', unit: '', get: (m) => m.longestNoEarthHours, fmt: fmtHours, better: 'lower', truncated: (m) => m.noEarthTruncated },
  { group: 'Earth', label: 'Earth elevation range', unit: '', get: (m) => m.earthElevRange[1], fmt: (v) => fmtDeg(v, 2) },
  { group: 'Combined', label: 'Sun and Earth both visible', unit: '% of period', get: (m) => m.bothVisiblePct, fmt: (v) => v.toFixed(1), better: 'higher' },
  { group: 'Combined', label: 'Neither visible', unit: '% of period', get: (m) => m.neitherVisiblePct, fmt: (v) => v.toFixed(1), better: 'lower' },
  { group: 'Combined', label: 'Longest period with neither', unit: '', get: (m) => m.longestNeitherHours, fmt: fmtHours, better: 'lower' },
];

function cell(m: ScenarioMetrics | null, row: Row) {
  if (!m) return '—';
  if (row.label.endsWith('elevation range')) {
    const r = row.label.startsWith('Sun') ? m.sunElevRange : m.earthElevRange;
    return `${fmtDeg(r[0], 1)} … ${fmtDeg(r[1], 1)}`;
  }
  const v = row.fmt(row.get(m));
  return row.truncated?.(m) ? `≥ ${v}` : v;
}

function deltaText(row: Row, a: ScenarioResult, b: ScenarioResult) {
  const range = row.label.endsWith('range');
  const d = !range && a.metrics && b.metrics ? row.get(b.metrics) - row.get(a.metrics) : null;
  const isPct = row.unit.startsWith('%');
  return d === null || Math.abs(d) < 1e-9 ? '—' : `${d > 0 ? '+' : '−'}${isPct ? Math.abs(d).toFixed(1) + ' pp' : fmtHours(Math.abs(d))}`;
}

/** Narrow screens: one card per metric with A / B / difference side by side. */
function MetricsStack({ a, b }: { a: ScenarioResult; b: ScenarioResult }) {
  const groups = [...new Set(ROWS.map((r) => r.group))];
  return (
    <div className="mstack">
      {groups.map((g) => (
        <section key={g} className="mstack__group" aria-label={g}>
          <h4 className="mstack__head">{g}</h4>
          {ROWS.filter((r) => r.group === g).map((row) => (
            <div key={row.label} className="mstack__row">
              <div className="mstack__label">
                {row.label}
                {row.unit && <span className="metrics__unit"> {row.unit}</span>}
              </div>
              <dl className="mstack__vals">
                <div>
                  <dt>A</dt>
                  <dd className="num">{cell(a.metrics, row)}</dd>
                </div>
                <div className="is-b">
                  <dt>B</dt>
                  <dd className="num">{cell(b.metrics, row)}</dd>
                </div>
                <div className="is-d">
                  <dt>B − A</dt>
                  <dd className="num">{deltaText(row, a, b)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function MetricsTable({ a, b }: { a: ScenarioResult; b: ScenarioResult }) {
  const narrow = useMedia('(max-width: 640px)');
  if (narrow) return <MetricsStack a={a} b={b} />;
  let lastGroup = '';
  return (
    <div className="table-wrap">
      <table className="metrics">
        <caption className="sr-only">Comparison of terrain-corrected visibility metrics for scenarios A and B</caption>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col" className="is-a">A · {a.region.name}</th>
            <th scope="col" className="is-b">B · {b.region.name}</th>
            <th scope="col">B − A</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const head = row.group !== lastGroup;
            lastGroup = row.group;
            const range = row.label.endsWith('range');
            const d = !range && a.metrics && b.metrics ? row.get(b.metrics) - row.get(a.metrics) : null;
            const isPct = row.unit.startsWith('%');
            return [
              head ? (
                <tr key={`${row.group}-h`} className="metrics__group">
                  <th colSpan={4} scope="colgroup">{row.group}</th>
                </tr>
              ) : null,
              <tr key={row.label}>
                <th scope="row">
                  {row.label}
                  {row.unit && <span className="metrics__unit"> {row.unit}</span>}
                </th>
                <td className="num">{cell(a.metrics, row)}</td>
                <td className="num">{cell(b.metrics, row)}</td>
                <td className="num metrics__delta">
                  {d === null || Math.abs(d) < 1e-9 ? '—' : `${d > 0 ? '+' : '−'}${isPct ? Math.abs(d).toFixed(1) + ' pp' : fmtHours(Math.abs(d))}`}
                </td>
              </tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

function Observations({ a, b }: { a: ScenarioResult; b: ScenarioResult }) {
  if (!a.metrics || !b.metrics) return null;
  const out: string[] = [];
  const A = a.metrics;
  const B = b.metrics;
  const same = a.region.id === b.region.id;
  const nameA = `A (${a.region.name})`;
  const nameB = `B (${b.region.name})`;
  const cmp = (va: number, vb: number, what: string, unit: 'pp' | 'h', threshold: number) => {
    const d = vb - va;
    if (Math.abs(d) < threshold) return `${what}: no material difference (${Math.abs(d).toFixed(1)} ${unit}).`;
    const hi = d > 0 ? nameB : nameA;
    return `${what}: ${hi} is higher by ${Math.abs(d).toFixed(1)} ${unit === 'pp' ? 'percentage points' : 'hours'}.`;
  };
  out.push(cmp(A.sunVisiblePct, B.sunVisiblePct, 'Sun above terrain horizon', 'pp', 1));
  out.push(cmp(A.earthVisiblePct, B.earthVisiblePct, 'Earth above terrain horizon', 'pp', 1));
  out.push(cmp(A.longestNoSunHours, B.longestNoSunHours, 'Longest period without Sun', 'h', 1));
  if (A.earthVisiblePct === 0 || B.earthVisiblePct === 0)
    out.push('One scenario never has Earth above the terrain horizon during its period — direct-to-Earth line of sight would need a relay or a different point.');
  if (!same && (a.startMs !== b.startMs || a.scenario.durationDays !== b.scenario.durationDays))
    out.push('Scenarios cover different periods; differences mix location and season effects.');
  return (
    <ul className="observations">
      {out.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

function downloadCsv(res: ScenarioResult) {
  const lines = ['utc,sun_az_deg,sun_el_deg,sun_horizon_deg,sun_visible,earth_az_deg,earth_el_deg,earth_horizon_deg,earth_visible'];
  for (const p of res.series)
    lines.push(
      [new Date(p.t).toISOString(), p.sunAz.toFixed(3), p.sunEl.toFixed(3), p.sunHz.toFixed(3), p.sunVis ? 1 : 0, p.earthAz.toFixed(3), p.earthEl.toFixed(3), p.earthHz.toFixed(3), p.earthVis ? 1 : 0].join(','),
    );
  const meta = `# ${res.region.name} observation point ${res.region.observationPoint.latDeg},${res.region.observationPoint.lonDeg}; ephemeris JPL Horizons; horizon LOLA LDEM_80S_80M; step ${res.stepMin} min\n`;
  const blob = new Blob([meta + lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${res.region.id}_${fmtDate(res.startMs)}_${res.scenario.durationDays}d.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function AnalysisView() {
  const a = useScenario(0);
  const b = useScenario(1);
  const step = a.stepMin === b.stepMin ? `${a.stepMin}` : `${a.stepMin}/${b.stepMin}`;
  return (
    <main className="study" aria-label="Mission analysis">
      <header className="study__hero">
        <span className="study__eyebrow">Mission analysis</span>
        <h2 className="study__title">How much sunlight and Earth contact does each site get?</h2>
        <p className="study__lede">
          Choose two observation points and periods. Every {step} minutes the Sun and Earth are checked against the measured LOLA
          skyline, from 2 m above the surface.
        </p>
      </header>

      <section className="matchup" aria-label="Scenarios">
        <Vantage i={0} res={a} />
        <span className="matchup__vs" aria-hidden="true">
          vs
        </span>
        <Vantage i={1} res={b} />
      </section>

      <section className="study__block">
        <div className="study__head">
          <h3>At a glance</h3>
          <p>Bars take the colour of what they measure. A is solid, B is lighter.</p>
        </div>
        <div className="glance-wrap">
          <Headlines a={a} b={b} />
          <aside className="glance-notes">
            <h4>What this means</h4>
            <Observations a={a} b={b} />
          </aside>
        </div>
      </section>

      <section className="study__block">
        <div className="study__head">
          <h3>Through time</h3>
          <p>Bars mark when each body clears the skyline. Hover for exact values; click to pin a moment and open it in 3D.</p>
        </div>
        <div className="study__card">
          <ScenarioTimeline res={a} />
          <ScenarioTimeline res={b} />
        </div>
      </section>

      <section className="study__block">
        <div className="study__head">
          <h3>From the ground</h3>
          <p>The measured skyline all the way around each point, with the Sun and Earth paths over the period. Hollow dots are hidden by terrain.</p>
        </div>
        <div className="study__panos">
          {[a, b].map((r) => (
            <figure key={r.key} className="study__card pano-card">
              <figcaption className="pano-card__cap">
                <span>
                  <span className={`pano-card__key pano-card__key--${r.key}`}>{r.key}</span> {r.region.name}
                </span>
                <button type="button" className="text-btn" onClick={() => downloadCsv(r)}>
                  Export CSV
                </button>
              </figcaption>
              <HorizonPanorama res={r} />
            </figure>
          ))}
        </div>
      </section>

      <section className="study__block">
        <details className="study__all">
          <summary>
            <span className="study__all-title">Every metric</span>
            <span className="study__all-hint">Ten measures side by side, with the difference</span>
          </summary>
          <MetricsTable a={a} b={b} />
        </details>
      </section>

      <footer className="study__method">
        <h3>Method and limits</h3>
        <ul>
          <li>Sun and Earth directions: NASA/JPL Horizons hourly sub-solar and sub-Earth points, interpolated; validated against Horizons topocentric Az/El to better than 0.01°.</li>
          <li>Skyline: LOLA LDEM_80S_80M (80 m/px) ray-traced to 150 km on a 1737.4 km sphere. Features smaller than about two DEM pixels, and terrain beyond 150 km or outside 80°S, are not represented.</li>
          <li>“Visible” means the disc centre is above the skyline. Partial-disc illumination is reported under Measurements, not in these percentages.</li>
          <li>Observation points follow a documented selection rule and are not NASA-designated landing sites. Results apply to that point only, at 2 m height.</li>
          <li>Earth visibility is geometric line of sight; it does not model antennas, link budgets or ground-station availability.</li>
          <li>No suitability score is computed. Landing decisions also depend on slope, hazards, thermal and operational constraints not modelled here.</li>
        </ul>
      </footer>
    </main>
  );
}
