import { useId, useMemo, useState } from 'react';
import { assessScenario, type Assessment as Result } from '../../science/visibility';
import { fmtHours } from '../../utils/format';
import type { ScenarioResult } from './AnalysisView';

const MASKS = [0, 1, 2, 5];

const span = (h: number, lowerBound: boolean) => `${lowerBound ? '≥ ' : ''}${fmtHours(h)}`;
const energy = (kwh: number, lowerBound: boolean) => `${lowerBound ? '≥ ' : ''}${kwh >= 100 ? kwh.toFixed(0) : kwh.toFixed(1)} kWh`;

/**
 * Power and communication assessment: what the visibility geometry implies for an electrical
 * load and for a direct view of Earth. Every number follows from the series above plus the two
 * inputs shown; nothing here is a hardware model.
 */
export function AssessmentPanel({ a, b }: { a: ScenarioResult; b: ScenarioResult }) {
  const id = useId();
  const [loadW, setLoadW] = useState(100);
  const [maskDeg, setMaskDeg] = useState(0);
  const ra = useMemo(() => assessScenario(a.series, a.stepMin, loadW, maskDeg), [a.series, a.stepMin, loadW, maskDeg]);
  const rb = useMemo(() => assessScenario(b.series, b.stepMin, loadW, maskDeg), [b.series, b.stepMin, loadW, maskDeg]);
  const cell = (r: Result | null, f: (r: Result) => string) => (r ? f(r) : '–');
  const rows: [string, string, (r: Result) => string][] = [
    ['Power', 'Sun above the skyline', (r) => `${r.sunPct.toFixed(1)} %`],
    ['Power', 'Longest time without the Sun', (r) => span(r.darkHours, r.darkLowerBound)],
    ['Power', `Stored energy to run ${loadW} W through it`, (r) => energy(r.storageKWh, r.darkLowerBound)],
    ['Communication', maskDeg ? `Earth at least ${maskDeg}° above the skyline` : 'Earth above the skyline', (r) => `${r.linkPct.toFixed(1)} %`],
    ['Communication', 'Longest time without that view of Earth', (r) => span(r.outageHours, r.outageLowerBound)],
  ];
  let group = '';
  return (
    <div className="study__card assess">
      <div className="assess__inputs">
        <div className="field">
          <label htmlFor={`${id}-load`}>Electrical load to keep running</label>
          <div className="assess__num">
            <span className="nstep">
              <button type="button" className="nstep__btn" aria-label="Lower the load" disabled={loadW <= 10} onClick={() => setLoadW(Math.max(1, loadW - 10))}>
                −
              </button>
            <input
              className="delay__n num"
              id={`${id}-load`}
              type="number"
              inputMode="numeric"
              min={1}
              max={100000}
              step={10}
              value={loadW}
              onChange={(e) => {
                const v = Math.round(Number(e.target.value));
                if (Number.isFinite(v)) setLoadW(Math.min(100000, Math.max(1, v)));
              }}
            />
              <button type="button" className="nstep__btn" aria-label="Raise the load" disabled={loadW >= 100000} onClick={() => setLoadW(Math.min(100000, loadW + 10))}>
                +
              </button>
            </span>
            <span>W</span>
          </div>
        </div>
        <div className="field">
          <span className="field__label" id={`${id}-mask`}>
            Clearance Earth needs above the skyline
          </span>
          <div className="seg seg--period assess__seg" role="radiogroup" aria-labelledby={`${id}-mask`}>
            {MASKS.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={maskDeg === m} className={`seg__btn${maskDeg === m ? ' is-active' : ''}`} onClick={() => setMaskDeg(m)}>
                {m}°
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="table-wrap">
        <table className="metrics assess__table">
          <caption className="sr-only">Power and communication assessment for scenarios A and B</caption>
          <thead>
            <tr>
              <th scope="col">Assessment</th>
              <th scope="col" className="is-a">A · {a.region.name}</th>
              <th scope="col" className="is-b">B · {b.region.name}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([g, label, f]) => {
              const head = g !== group;
              group = g;
              return [
                head ? (
                  <tr key={`${g}-h`} className="metrics__group">
                    <th colSpan={3} scope="colgroup">{g}</th>
                  </tr>
                ) : null,
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td className="num">{cell(ra, f)}</td>
                  <td className="num">{cell(rb, f)}</td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
      <p className="metrics__note">
        This is an estimate from geometry, for one observation point per region. Power: the load is assumed to run from storage for the
        whole time the Sun&rsquo;s centre is below the skyline, so stored energy = load × longest time without the Sun. It does not size
        solar panels or model temperature, heaters, battery losses or partial sunlight. Communication: a direct line of sight to Earth&rsquo;s
        centre with the chosen clearance. It does not model antennas, link budgets, ground stations or relay satellites. ≥ marks a
        lower bound, where the dark or blocked time runs past the edge of the period.
      </p>
    </div>
  );
}
