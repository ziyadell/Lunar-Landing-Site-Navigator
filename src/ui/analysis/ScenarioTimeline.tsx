import { useMemo } from 'react';
import { runs } from '../../science/visibility';
import { fmtDate } from '../../utils/format';
import type { ScenarioResult } from './AnalysisView';

const W = 1000;
const LANES = [
  { key: 'sun', label: 'Sun', cls: 'is-sun' },
  { key: 'earth', label: 'Earth', cls: 'is-earth' },
  { key: 'both', label: 'Both', cls: 'is-both' },
] as const;

/** Visibility lanes plus Sun clearance (elevation − skyline) for one scenario. */
export function ScenarioTimeline({ res }: { res: ScenarioResult }) {
  const { series, startMs, endMs, stepMin } = res;
  const span = endMs - startMs;
  const x = (t: number) => ((t - startMs) / span) * W;
  const step = stepMin * 60_000;

  const lanes = useMemo(
    () => ({
      sun: runs(series, (p) => p.sunVis, step),
      earth: runs(series, (p) => p.earthVis, step),
      both: runs(series, (p) => p.sunVis && p.earthVis, step),
    }),
    [series, step],
  );

  const clearance = useMemo(() => {
    if (!series.length) return { d: '', lo: -5, hi: 5 };
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of series) {
      const v = p.sunEl - p.sunHz;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    lo = Math.min(lo, -1);
    hi = Math.max(hi, 1);
    const y = (v: number) => 4 + (1 - (v - lo) / (hi - lo)) * 52;
    const stride = Math.max(1, Math.floor(series.length / 1400));
    let d = '';
    for (let i = 0; i < series.length; i += stride) {
      const p = series[i];
      d += `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.sunEl - p.sunHz).toFixed(1)}`;
    }
    return { d, lo, hi, zero: y(0) };
  }, [series, startMs, span]);

  const ticks = useMemo(() => {
    const days = span / 86_400_000;
    const every = days <= 14 ? 1 : days <= 60 ? 5 : days <= 180 ? 30 : 60;
    const out: number[] = [];
    for (let t = startMs; t <= endMs; t += every * 86_400_000) out.push(t);
    return out;
  }, [startMs, endMs, span]);

  return (
    <figure className={`timeline timeline--${res.key}`}>
      <figcaption className="timeline__cap">
        <span className="timeline__key">{res.key}</span> {res.region.name} · {fmtDate(startMs)} → {fmtDate(endMs)}
      </figcaption>
      <div className="timeline__grid">
        <div className="timeline__labels" aria-hidden="true">
          {LANES.map((l) => (
            <span key={l.key}>{l.label}</span>
          ))}
          <span className="timeline__labels--tall">Sun clearance</span>
        </div>
        <svg className="timeline__svg" viewBox={`0 0 ${W} 128`} preserveAspectRatio="none" role="img"
          aria-label={`Visibility timeline for scenario ${res.key}: lanes show when the Sun, Earth, and both are above the terrain horizon; the line shows Sun elevation minus skyline.`}>
          {LANES.map((l, i) => (
            <g key={l.key} className={`timeline__lane ${l.cls}`}>
              <rect x="0" y={i * 18 + 2} width={W} height="12" className="timeline__bg" />
              {lanes[l.key].map((r) => (
                <rect key={r.startMs} x={x(r.startMs)} y={i * 18 + 2} width={Math.max(0.6, x(r.endMs) - x(r.startMs))} height="12" />
              ))}
            </g>
          ))}
          <g transform="translate(0,62)">
            <rect x="0" y="0" width={W} height="60" className="timeline__bg" />
            {'zero' in clearance && <line x1="0" x2={W} y1={clearance.zero} y2={clearance.zero} className="timeline__zero" />}
            <path d={clearance.d} className="timeline__line" vectorEffect="non-scaling-stroke" />
          </g>
          {ticks.map((t) => (
            <line key={t} x1={x(t)} x2={x(t)} y1="0" y2="122" className="timeline__tick" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        <div className="timeline__axis" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} style={{ left: `${(x(t) / W) * 100}%` }} className="num">
              {fmtDate(t).slice(5)}
            </span>
          ))}
        </div>
        <div className="timeline__range num" aria-hidden="true">
          {clearance.hi.toFixed(1)}° / {clearance.lo.toFixed(1)}°
        </div>
      </div>
    </figure>
  );
}
