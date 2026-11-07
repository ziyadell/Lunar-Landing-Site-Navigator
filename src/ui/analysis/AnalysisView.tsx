import { useMemo } from 'react';
import { useApp, type Scenario } from '../../state/store';
import { useData } from '../../data/DataContext';
import { computeSeries, scenarioMetrics, type SeriesPoint } from '../../science/visibility';
import type { LandingRegion, ScenarioMetrics } from '../../data/types';
import { fmtDate, fmtDeg, fmtHours, fmtLat, fmtLon } from '../../utils/format';
import { SectionHead } from '../primitives';
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

function ScenarioConfig({ i, res }: { i: 0 | 1; res: ScenarioResult }) {
  const { sites, ephemeris } = useData();
  const set = useApp((st) => st.setScenario);
  const id = `scn-${res.key}`;
  return (
    <div className={`scn-config scn-config--${res.key}`}>
      <div className="scn-config__badge">Scenario {res.key}</div>
      <div className="field">
        <label htmlFor={`${id}-site`}>Region</label>
        <select id={`${id}-site`} value={res.scenario.regionId} onChange={(e) => set(i, { regionId: e.target.value })}>
          {sites.regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${id}-start`}>Start (UTC, 00:00)</label>
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
      <div className="field">
        <label htmlFor={`${id}-dur`}>Period</label>
        <select id={`${id}-dur`} value={res.scenario.durationDays} onChange={(e) => set(i, { durationDays: +e.target.value })}>
          {DURATIONS.map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
      </div>
      <div className="scn-config__point num">
        {fmtLat(res.region.observationPoint.latDeg)} {fmtLon(res.region.observationPoint.lonDeg)}
      </div>
      {res.clipped && (
        <div className="notice notice--warn">
          Period clipped to ephemeris coverage ({fmtDate(ephemeris.startMs)} – {fmtDate(ephemeris.endMs)}).
        </div>
      )}
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
  return (
    <main className="analysis" aria-label="Mission analysis">
      <div className="analysis__intro">
        <h2 className="analysis__title">Mission Analysis</h2>
        <p>
          Compare terrain-corrected Sun and Earth visibility for two site-and-period scenarios. Each sample checks whether
          the body's centre is above the LOLA skyline at the observation point (2 m above the surface).
        </p>
      </div>

      <div className="analysis__configs">
        <ScenarioConfig i={0} res={a} />
        <ScenarioConfig i={1} res={b} />
      </div>

      <section className="analysis__block">
        <SectionHead aside={`Samples every ${a.stepMin === b.stepMin ? a.stepMin : `${a.stepMin}/${b.stepMin}`} min · durations ± one sample`}>
          Comparison
        </SectionHead>
        <MetricsTable a={a} b={b} />
        <Observations a={a} b={b} />
      </section>

      <section className="analysis__block">
        <SectionHead aside="Bars = above terrain horizon">Visibility Timeline</SectionHead>
        <ScenarioTimeline res={a} />
        <ScenarioTimeline res={b} />
      </section>

      <section className="analysis__block analysis__panos">
        <div>
          <SectionHead aside={<button type="button" className="btn-text" onClick={() => downloadCsv(a)}>Export CSV</button>}>
            Horizon · A · {a.region.name}
          </SectionHead>
          <HorizonPanorama res={a} />
        </div>
        <div>
          <SectionHead aside={<button type="button" className="btn-text" onClick={() => downloadCsv(b)}>Export CSV</button>}>
            Horizon · B · {b.region.name}
          </SectionHead>
          <HorizonPanorama res={b} />
        </div>
      </section>

      <section className="analysis__block analysis__limits">
        <SectionHead>Method &amp; Limitations</SectionHead>
        <ul>
          <li>Sun/Earth directions: NASA/JPL Horizons hourly sub-solar and sub-Earth points, interpolated; validated against Horizons topocentric Az/El to better than 0.01°.</li>
          <li>Skyline: LOLA LDEM_80S_80M (80 m/px) ray-traced to 150 km on a 1737.4 km sphere; features smaller than ~2 DEM pixels and terrain beyond 150 km or outside 80°S are not represented.</li>
          <li>"Visible" means the disc centre is above the skyline. Partial-disc illumination is reported in the readings panel, not in these percentages.</li>
          <li>Observation points follow a documented selection rule and are not NASA-designated landing sites. Results apply to that point only, at 2 m height.</li>
          <li>Earth visibility is geometric line of sight; it does not model antennas, link budgets, or ground-station availability.</li>
          <li>No suitability score is computed. Landing-site decisions also depend on slope, hazards, thermal and operational constraints not modelled here.</li>
        </ul>
      </section>
    </main>
  );
}
