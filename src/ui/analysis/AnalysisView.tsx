import { t } from '../../i18n';
import { useMemo, useState } from 'react';
import { Listen, MissionGuide } from '../../audio/ui';
import { useApp, type Scenario } from '../../state/store';
import { useData } from '../../data/DataContext';
import { computeSeries, scenarioMetrics, type SeriesPoint } from '../../science/visibility';
import type { LandingRegion, ScenarioMetrics } from '../../data/types';
import { fmtDate, fmtDeg, fmtHours, fmtLat, fmtLon } from '../../utils/format';
import { thumbUrl } from '../stage/Regions';
import { ScenarioTimeline } from './ScenarioTimeline';
import { useMedia } from '../../utils/useMedia';
import { HorizonPanorama } from './HorizonPanorama';
import { Select } from '../Select';
import { DateField } from '../DateField';

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
const durLabel = (d: number) => (d === 365 ? '1 year' : `${d} days`);

function Vantage({ i, res }: { i: 0 | 1; res: ScenarioResult }) {
  const { sites, ephemeris } = useData();
  const set = useApp((st) => st.setScenario);
  const id = `scn-${res.key}`;
  const p = res.region.observationPoint;
  const dur = res.scenario.durationDays;
  const minDate = fmtDate(ephemeris.startMs);
  const maxDate = fmtDate(ephemeris.endMs - DAY);
  return (
    <section className={`vantage vantage--${res.key}`} aria-labelledby={`${id}-title`}>
      <div className="vantage__head">
        <img className="vantage__img" src={thumbUrl(res.region.id)} alt={`LROC WAC 100 m image of NASA's ${res.region.name} region outline`} width={72} height={72} />
        <div className="vantage__title">
          <span className="vantage__key" id={`${id}-key`}>
            Scenario {res.key}
          </span>
          <Select
            id={`${id}-region`}
            className="sel--region"
            labelledBy={`${id}-key`}
            value={res.region.id}
            options={sites.regions.map((r) => ({ value: r.id, label: r.name }))}
            onChange={(v) => set(i, { regionId: v })}
          />
          <span className="vantage__coord num" id={`${id}-title`}>
            {fmtLat(p.latDeg, 2)} {fmtLon(p.lonDeg, 2)} · {p.elevationM.toFixed(0)} m
          </span>
        </div>
      </div>
      <div className="vantage__when">
        <div className="field field--date">
          <label htmlFor={`${id}-start`}>{t('Start date (UTC)')}</label>
          <DateField
            id={`${id}-start`}
            label={`Scenario ${res.key} start date`}
            value={fmtDate(res.scenario.startMs)}
            min={minDate}
            max={maxDate}
            onChange={(v) => {
              // Dates are UTC days: midnight UTC, whatever the visitor's time zone.
              const ms = Date.parse(`${v}T00:00:00Z`);
              if (!Number.isNaN(ms)) set(i, { startMs: ms });
            }}
          />
        </div>
        <div className="field field--dur">
          <span className="field__label" id={`${id}-dur`}>
            Duration
          </span>
          <div className="seg seg--period" role="radiogroup" aria-labelledby={`${id}-dur`}>
            {PERIODS.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={dur === d}
                className={`seg__btn${dur === d ? ' is-active' : ''}`}
                onClick={() => set(i, { durationDays: d })}
              >
                {d === 365 ? '1 yr' : `${d} d`}
              </button>
            ))}
          </div>
        </div>
        <div className="field field--more">
          <span className="field__label" id={`${id}-dur-all`}>
            More durations
          </span>
          <Select
            id={`${id}-dur-sel`}
            className={`sel--dur${PERIODS.includes(dur) ? '' : ' is-custom'}`}
            labelledBy={`${id}-dur-all`}
            value={dur}
            options={DURATIONS.map((d) => ({ value: d, label: durLabel(d) }))}
            onChange={(v) => set(i, { durationDays: v })}
          />
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
  { key: 'dark', q: 'Longest stretch without Sun', note: 'shorter is easier on power · ≥ is a lower bound', tone: 'dark', get: (m) => m.longestNoSunHours, pct: false, better: 'lower', trunc: (m) => m.noSunTruncated },
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
        // A lower-bound value (interval touching the period's start or end) cannot rank.
        const limited = !!(h.trunc?.(A) || h.trunc?.(B));
        const winner = even || limited ? null : d > 0 === (h.better === 'higher') ? 'B' : 'A';
        const rows = [
          { k: 'A', v: va, m: A, r: a },
          { k: 'B', v: vb, m: B, r: b },
        ];
        return (
          <div key={h.key} className={`glance__row glance__row--${h.tone}`}>
            <div className="glance__q">
              {t(h.q)}
              <span className="glance__unit">{t(h.note)}</span>
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
            <div className={`glance__verdict${winner ? '' : ' is-even'}${limited ? ' is-limited' : ''}`}>
              {limited ? (
                <>Not comparable: reaches the edge of the period</>
              ) : winner ? (
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
  { group: 'Solar', label: 'Longest continuous sunlight', unit: '', get: (m) => m.longestSunHours, fmt: fmtHours, better: 'higher', truncated: (m) => m.sunTruncated },
  { group: 'Solar', label: 'Longest period without Sun', unit: '', get: (m) => m.longestNoSunHours, fmt: fmtHours, better: 'lower', truncated: (m) => m.noSunTruncated },
  { group: 'Solar', label: 'Sun elevation range', unit: '', get: (m) => m.sunElevRange[1], fmt: (v) => fmtDeg(v, 2) },
  { group: 'Earth', label: 'Earth above terrain horizon', unit: '% of period', get: (m) => m.earthVisiblePct, fmt: (v) => v.toFixed(1), better: 'higher' },
  { group: 'Earth', label: 'Longest period without Earth', unit: '', get: (m) => m.longestNoEarthHours, fmt: fmtHours, better: 'lower', truncated: (m) => m.noEarthTruncated },
  { group: 'Earth', label: 'Earth elevation range', unit: '', get: (m) => m.earthElevRange[1], fmt: (v) => fmtDeg(v, 2) },
  { group: 'Combined', label: 'Sun and Earth both visible', unit: '% of period', get: (m) => m.bothVisiblePct, fmt: (v) => v.toFixed(1), better: 'higher' },
  { group: 'Combined', label: 'Neither visible', unit: '% of period', get: (m) => m.neitherVisiblePct, fmt: (v) => v.toFixed(1), better: 'lower' },
  { group: 'Combined', label: 'Longest period with neither', unit: '', get: (m) => m.longestNeitherHours, fmt: fmtHours, better: 'lower', truncated: (m) => m.neitherTruncated },
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

/** A difference involving a lower-bound value is not a measured difference. */
const limitedRow = (row: Row, a: ScenarioResult, b: ScenarioResult) => !!(a.metrics && b.metrics && (row.truncated?.(a.metrics) || row.truncated?.(b.metrics)));

function deltaText(row: Row, a: ScenarioResult, b: ScenarioResult) {
  if (limitedRow(row, a, b)) return 'n/a';
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
            <div key={t(row.label)} className="mstack__row">
              <div className="mstack__label">
                {t(row.label)}
                {row.unit && <span className="metrics__unit"> {t(row.unit)}</span>}
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
      <LowerBoundNote a={a} b={b} />
    </div>
  );
}

function LowerBoundNote({ a, b }: { a: ScenarioResult; b: ScenarioResult }) {
  const any = [a, b].some((r) => r.metrics && ROWS.some((row) => row.truncated?.(r.metrics!)));
  if (!any) return null;
  return (
    <p className="metrics__note">
      ≥ marks a lower bound: the longest interval touches the start or end of the period, so its full length is unknown. Differences
      involving a lower bound are shown as n/a. Choose a longer period to compare complete intervals.
    </p>
  );
}

function MetricsTable({ a, b }: { a: ScenarioResult; b: ScenarioResult }) {
  const narrow = useMedia('(max-width: 640px)');
  if (narrow) return <MetricsStack a={a} b={b} />;
  let lastGroup = '';
  return (
    <div className="table-wrap">
      <table className="metrics">
        <caption className="sr-only">{t('Comparison of terrain-corrected visibility metrics for scenarios A and B')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('Metric')}</th>
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
                <tr key={`${t(row.group)}-h`} className="metrics__group">
                  <th colSpan={4} scope="colgroup">{t(row.group)}</th>
                </tr>
              ) : null,
              <tr key={t(row.label)}>
                <th scope="row">
                  {t(row.label)}
                  {row.unit && <span className="metrics__unit"> {t(row.unit)}</span>}
                </th>
                <td className="num">{cell(a.metrics, row)}</td>
                <td className="num">{cell(b.metrics, row)}</td>
                <td className="num metrics__delta" title={limitedRow(row, a, b) ? 'Not comparable: at least one value is a lower bound' : undefined}>
                  {limitedRow(row, a, b) ? 'n/a' : d === null || Math.abs(d) < 1e-9 ? '—' : `${d > 0 ? '+' : '−'}${isPct ? Math.abs(d).toFixed(1) + ' pp' : fmtHours(Math.abs(d))}`}
                </td>
              </tr>,
            ];
          })}
        </tbody>
      </table>
      <LowerBoundNote a={a} b={b} />
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
  if (A.noSunTruncated || B.noSunTruncated) {
    const which = A.noSunTruncated && B.noSunTruncated ? 'both scenarios' : A.noSunTruncated ? nameA : nameB;
    out.push(
      `Longest period without Sun: not compared. In ${which} it touches the start or end of the period, so the value is a lower bound. A longer period may be needed to compare complete intervals.`,
    );
  } else {
    const d = B.longestNoSunHours - A.longestNoSunHours;
    out.push(
      Math.abs(d) < 1
        ? `Longest period without Sun: no material difference (${Math.abs(d).toFixed(1)} hours).`
        : `Longest period without Sun: ${d > 0 ? nameA : nameB} is shorter by ${Math.abs(d).toFixed(1)} hours.`,
    );
  }
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
  const m = res.metrics;
  const lb = (v: number, t: boolean) => `${v.toFixed(2)} h${t ? ' (lower bound: touches the period start or end)' : ''}`;
  const meta =
    `# ${res.region.name} observation point ${res.region.observationPoint.latDeg},${res.region.observationPoint.lonDeg}; ephemeris JPL Horizons; horizon LOLA LDEM_80S_80M; step ${res.stepMin} min\n` +
    (m
      ? `# longest without Sun: ${lb(m.longestNoSunHours, m.noSunTruncated)}; longest without Earth: ${lb(m.longestNoEarthHours, m.noEarthTruncated)}; longest with neither: ${lb(m.longestNeitherHours, m.neitherTruncated)}; longest continuous sunlight: ${lb(m.longestSunHours, m.sunTruncated)}\n`
      : '');
  const blob = new Blob([meta + lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${res.region.id}_${fmtDate(res.startMs)}_${res.scenario.durationDays}d.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * The planner's question when a launch slips: same site, later date. Scenario B becomes
 * Scenario A's site and duration, starting the given number of days later.
 */
function LaunchDelay() {
  const [days, setDays] = useState(14);
  const a = useApp((st) => st.scenarios[0]);
  const set = useApp((st) => st.setScenario);
  const { ephemeris } = useData();
  const late = a.startMs + days * DAY;
  const fits = days >= 1 && late + a.durationDays * DAY <= ephemeris.endMs;
  return (
    <form
      className="delay"
      onSubmit={(e) => {
        e.preventDefault();
        if (fits) set(1, { regionId: a.regionId, startMs: late, durationDays: a.durationDays });
      }}
    >
      <strong className="delay__q">Launch delayed?</strong>
      <label className="delay__field">
        <span>Delay by</span>
        <span className="stepper">
          <button type="button" className="stepper__btn" aria-label="Fewer days" disabled={days <= 1} onClick={() => setDays(Math.max(1, days - 1))}>
            −
          </button>
          <input className="delay__n num" type="number" inputMode="numeric" min={1} max={365} value={days} onChange={(e) => setDays(Math.min(365, Math.max(0, Math.round(Number(e.target.value) || 0))))} />
          <button type="button" className="stepper__btn" aria-label="More days" disabled={days >= 365} onClick={() => setDays(Math.min(365, days + 1))}>
            +
          </button>
        </span>
        <span>days</span>
      </label>
      <button type="submit" className="cta" disabled={!fits}>
        Compare the same site, later
      </button>
      <span className="delay__hint">{fits ? 'Scenario B becomes Scenario A’s site and duration, starting that many days later.' : 'That date is outside the period covered by the ephemeris.'}</span>
    </form>
  );
}

export default function AnalysisView() {
  const a = useScenario(0);
  const b = useScenario(1);
  const step = a.stepMin === b.stepMin ? `${a.stepMin}` : `${a.stepMin}/${b.stepMin}`;
  return (
    <main className="study" aria-label={t('Mission analysis')}>
      <header className="study__hero">
        <span className="study__eyebrow">{t('Mission analysis')}</span>
        <h2 className="study__title">
          How much sunlight and Earth contact does each site get? <Listen id="analysis-intro" />
        </h2>
        <p className="study__lede">
          Pick two regions and periods; every {step} minutes the Sun and Earth are checked against the measured LOLA skyline.{' '}
          <Listen id="analysis-scenarios" />
        </p>
        <div className="study__guide">
          <MissionGuide placement="flow" />
        </div>
      </header>

      <section className="matchup" aria-label={t('Scenarios')}>
        <Vantage i={0} res={a} />
        <span className="matchup__vs" aria-hidden="true">
          vs
        </span>
        <Vantage i={1} res={b} />
      </section>
      <LaunchDelay />

      <section className="study__block">
        <div className="study__head">
          <h3>
            At a glance <Listen id="analysis-glance" />
          </h3>
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
          <h3>
            Through time <Listen id="analysis-timeline" />
          </h3>
          <p>Bars mark when each body clears the skyline. Hover for exact values; click to pin a moment and open it in 3D.</p>
        </div>
        <div className="study__card">
          <ScenarioTimeline res={a} />
          <ScenarioTimeline res={b} />
        </div>
      </section>

      <section className="study__block">
        <div className="study__head">
          <h3>
            From the ground <Listen id="analysis-ground" />
          </h3>
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
            <span className="study__all-title">
              Every metric <Listen id="analysis-metrics" />
            </span>
            <span className="study__all-hint">{t('Ten measures side by side, with the difference')}</span>
          </summary>
          <MetricsTable a={a} b={b} />
        </details>
      </section>

      <footer className="study__method">
        <details>
          <summary>
            <span className="study__method-title">
              Method and limits <Listen id="analysis-method" />
            </span>
            <span className="study__all-hint">{t('Data sources, validation, and what is not modeled')}</span>
          </summary>
        <ul>
          <li>Sun and Earth directions: NASA/JPL Horizons hourly sub-solar and sub-Earth points, interpolated; validated against Horizons topocentric Az/El to better than 0.01°.</li>
          <li>Skyline: LOLA LDEM_80S_80M (80 m/px) ray-traced to 150 km on a 1737.4 km sphere. Features smaller than about two DEM pixels, and terrain beyond 150 km or outside 80°S, are not represented.</li>
          <li>“Visible” means the disc centre is above the skyline. Partial-disc illumination is reported under Measurements, not in these percentages.</li>
          <li>Region outlines are digitised from NASA&rsquo;s official map. Observation points follow a documented rule inside each outline and are not NASA-designated landing sites. Results apply to that point only, at 2 m height.</li>
          <li>Earth visibility is geometric line of sight; it does not model antennas, link budgets or ground-station availability.</li>
          <li>No suitability score is computed. Landing decisions also depend on slope, hazards, thermal and operational constraints not modelled here.</li>
        </ul>
        </details>
      </footer>
    </main>
  );
}
