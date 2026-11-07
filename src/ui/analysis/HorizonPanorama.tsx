import { useMemo } from 'react';
import type { ScenarioResult } from './AnalysisView';

const W = 720;
const H = 220;
const PAD = { l: 34, r: 8, t: 10, b: 22 };

/**
 * Azimuth–elevation panorama: LOLA skyline (filled), and the Sun / Earth
 * positions sampled across the scenario period. Points above the skyline are
 * solid; points behind terrain are hollow.
 */
export function HorizonPanorama({ res }: { res: ScenarioResult }) {
  const prof = res.region.horizon.elevationDeg;
  const step = res.region.horizon.azStepDeg;

  const { lo, hi } = useMemo(() => {
    let lo = Math.min(...prof);
    let hi = Math.max(...prof);
    for (const p of res.series) {
      lo = Math.min(lo, p.sunEl, p.earthEl);
      hi = Math.max(hi, p.sunEl, p.earthEl);
    }
    return { lo: Math.floor(lo - 1), hi: Math.ceil(hi + 1) };
  }, [prof, res.series]);

  const x = (az: number) => PAD.l + (az / 360) * (W - PAD.l - PAD.r);
  const y = (el: number) => PAD.t + (1 - (el - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  const skyline = useMemo(() => {
    let d = `M${x(0)},${y(lo)}`;
    prof.forEach((e, i) => (d += `L${x(i * step).toFixed(1)},${y(e).toFixed(1)}`));
    d += `L${x(360)},${y(prof[0]).toFixed(1)}L${x(360)},${y(lo)}Z`;
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prof, step, lo, hi]);

  const pts = useMemo(() => {
    const stride = Math.max(1, Math.floor(res.series.length / 600));
    return res.series.filter((_, i) => i % stride === 0);
  }, [res.series]);

  const yTicks: number[] = [];
  const yStep = hi - lo > 12 ? 4 : 2;
  for (let v = Math.ceil(lo / yStep) * yStep; v <= hi; v += yStep) yTicks.push(v);

  return (
    <svg className="pano" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Horizon panorama for ${res.region.name}: terrain skyline elevation by azimuth with Sun and Earth positions over the scenario period.`}>
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'pano__zero' : 'pano__grid'} />
          <text x={PAD.l - 5} y={y(v) + 3} className="pano__ylab">{v}°</text>
        </g>
      ))}
      {[0, 90, 180, 270, 360].map((a) => (
        <g key={a}>
          <line x1={x(a)} x2={x(a)} y1={PAD.t} y2={H - PAD.b} className="pano__grid" />
          <text x={x(a)} y={H - 6} className="pano__xlab">{['N', 'E', 'S', 'W', 'N'][a / 90]}</text>
        </g>
      ))}
      {pts.map((p) => (
        <circle key={`e${p.t}`} cx={x(p.earthAz)} cy={y(p.earthEl)} r="1.8" className={p.earthVis ? 'pano__earth' : 'pano__earth is-hidden'} />
      ))}
      {pts.map((p) => (
        <circle key={`s${p.t}`} cx={x(p.sunAz)} cy={y(p.sunEl)} r="1.8" className={p.sunVis ? 'pano__sun' : 'pano__sun is-hidden'} />
      ))}
      <path d={skyline} className="pano__terrain" />
      <text x={W - PAD.r - 4} y={PAD.t + 10} className="pano__note">LOLA skyline · obs. 2 m</text>
    </svg>
  );
}
