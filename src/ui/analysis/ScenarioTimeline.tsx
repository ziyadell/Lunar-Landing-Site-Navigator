import { useMemo, useRef, useState } from 'react';
import { runs } from '../../science/visibility';
import { fmtDate, fmtDeg, fmtUtc } from '../../utils/format';
import { useApp } from '../../state/store';
import type { ScenarioResult } from './AnalysisView';

const W = 1000;
const LANES = [
  { key: 'sun', label: 'Sun', cls: 'is-sun' },
  { key: 'earth', label: 'Earth', cls: 'is-earth' },
  { key: 'both', label: 'Both', cls: 'is-both' },
] as const;

/**
 * Visibility lanes plus Sun clearance (elevation − skyline) for one scenario.
 * Explorable: hover / arrow keys move a cursor with exact values at that sample;
 * click pins the moment and offers to open it in the 3D views.
 */
export function ScenarioTimeline({ res }: { res: ScenarioResult }) {
  const { series, startMs, endMs, stepMin } = res;
  const span = endMs - startMs;
  const x = (t: number) => ((t - startMs) / span) * W;
  const step = stepMin * 60_000;
  const [cursor, setCursor] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const setTime = useApp((s) => s.setTime);
  const selectRegion = useApp((s) => s.selectRegion);
  const setMode = useApp((s) => s.setMode);

  const lanes = useMemo(
    () => ({
      sun: runs(series, (p) => p.sunVis, step),
      earth: runs(series, (p) => p.earthVis, step),
      both: runs(series, (p) => p.sunVis && p.earthVis, step),
    }),
    [series, step],
  );

  const clearance = useMemo(() => {
    if (!series.length) return { d: '', lo: -5, hi: 5, zero: 30 };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, startMs, span]);

  const ticks = useMemo(() => {
    const days = span / 86_400_000;
    const every = days <= 14 ? 1 : days <= 60 ? 5 : days <= 180 ? 30 : 60;
    const out: number[] = [];
    for (let t = startMs; t <= endMs; t += every * 86_400_000) out.push(t);
    return out;
  }, [startMs, endMs, span]);

  const idxAt = (clientX: number) => {
    const b = svgRef.current?.getBoundingClientRect();
    if (!b || !series.length) return null;
    const f = Math.min(1, Math.max(0, (clientX - b.left) / b.width));
    return Math.min(series.length - 1, Math.max(0, Math.round((f * span) / step)));
  };
  const active = cursor ?? pinned;
  const p = active !== null ? series[active] : null;
  const leftPct = p ? (x(p.t) / W) * 100 : 0;

  return (
    <figure className={`timeline timeline--${res.key}`}>
      <figcaption className="timeline__cap">
        <span className="timeline__key">{res.key}</span> {res.region.name} · {fmtDate(startMs)} → {fmtDate(endMs)}
        <span className="timeline__hint"> · hover to inspect, click to pin</span>
      </figcaption>
      <div className="timeline__grid">
        <div className="timeline__labels" aria-hidden="true">
          {LANES.map((l) => (
            <span key={l.key}>{l.label}</span>
          ))}
          <span className="timeline__labels--tall">Sun clearance</span>
        </div>
        <div className="timeline__plot">
          <svg
            ref={svgRef}
            className="timeline__svg"
            viewBox={`0 0 ${W} 128`}
            preserveAspectRatio="none"
            role="slider"
            tabIndex={0}
            aria-label={`Timeline for scenario ${res.key}. Use arrow keys to move the cursor; Enter pins the time.`}
            aria-valuemin={startMs}
            aria-valuemax={endMs}
            aria-valuenow={p?.t ?? startMs}
            aria-valuetext={p ? `${fmtUtc(p.t)}: Sun ${p.sunVis ? 'visible' : 'not visible'}, Earth ${p.earthVis ? 'visible' : 'not visible'}` : 'No cursor'}
            onPointerMove={(e) => setCursor(idxAt(e.clientX))}
            onPointerLeave={() => setCursor(null)}
            onClick={(e) => setPinned(idxAt(e.clientX))}
            onKeyDown={(e) => {
              const cur = active ?? 0;
              const k = e.shiftKey ? Math.round(86_400_000 / step) : 1;
              const day = Math.round(86_400_000 / step);
              if (e.key === 'ArrowRight') setPinned(Math.min(series.length - 1, cur + k));
              else if (e.key === 'ArrowLeft') setPinned(Math.max(0, cur - k));
              else if (e.key === 'PageUp') setPinned(Math.min(series.length - 1, cur + day));
              else if (e.key === 'PageDown') setPinned(Math.max(0, cur - day));
              else if (e.key === 'Home') setPinned(0);
              else if (e.key === 'End') setPinned(series.length - 1);
              else if (e.key === 'Enter' || e.key === ' ') setPinned(active ?? 0);
              else if (e.key === 'Escape') setPinned(null);
              else return;
              e.preventDefault();
            }}
          >
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
              <line x1="0" x2={W} y1={clearance.zero} y2={clearance.zero} className="timeline__zero" />
              <path d={clearance.d} className="timeline__line" vectorEffect="non-scaling-stroke" />
            </g>
            {ticks.map((t) => (
              <line key={t} x1={x(t)} x2={x(t)} y1="0" y2="122" className="timeline__tick" vectorEffect="non-scaling-stroke" />
            ))}
            {p && <line x1={x(p.t)} x2={x(p.t)} y1="0" y2="124" className="timeline__cursor" vectorEffect="non-scaling-stroke" />}
          </svg>
          {p && (
            <div className={`timeline__tip${leftPct > 60 ? ' is-left' : ''}`} style={{ left: `${leftPct}%` }} aria-hidden="true">
              <div className="timeline__tip-time num">{fmtUtc(p.t)}</div>
              <div className={p.sunVis ? 'is-sun' : 'is-off'}>
                {p.sunVis ? '●' : '○'} Sun <span className="num">{fmtDeg(p.sunEl, 2)}</span> · clearance{' '}
                <span className="num">{fmtDeg(p.sunEl - p.sunHz, 2)}</span>
              </div>
              <div className={p.earthVis ? 'is-earth' : 'is-off'}>
                {p.earthVis ? '●' : '○'} Earth <span className="num">{fmtDeg(p.earthEl, 2)}</span> · clearance{' '}
                <span className="num">{fmtDeg(p.earthEl - p.earthHz, 2)}</span>
              </div>
            </div>
          )}
        </div>
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
      {pinned !== null && series[pinned] && (
        <div className="timeline__pin" role="status">
          <span>
            Pinned <span className="num">{fmtUtc(series[pinned].t)}</span> at {res.region.name}
          </span>
          <button
            type="button"
            className="btn-chip"
            onClick={() => {
              selectRegion(res.region.id);
              setTime(series[pinned].t);
              setMode('surface');
            }}
          >
            Open in Surface View
          </button>
          <button
            type="button"
            className="btn-chip"
            onClick={() => {
              selectRegion(res.region.id);
              setTime(series[pinned].t);
              setMode('orbital');
            }}
          >
            Open in Orbital View
          </button>
          <button type="button" className="btn-text" onClick={() => setPinned(null)}>
            Clear
          </button>
        </div>
      )}
    </figure>
  );
}
