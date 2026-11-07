import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../state/store';
import { useData } from '../../data/DataContext';
import { TimeInputs, VisibilityStrip } from '../TimeControls';

const H = 3_600_000;
const D = 24 * H;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(ms: number) {
  const d = new Date(ms);
  return {
    date: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
    time: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
  };
}

/**
 * Observation time as one compact pill: step, play, and the date itself.
 * Opening it reveals the precise inputs and the 30-day visibility scrubber,
 * so time control never needs a permanent strip.
 */
export function TimePill() {
  const { ephemeris } = useData();
  const timeMs = useApp((s) => s.timeMs);
  const setTime = useApp((s) => s.setTime);
  const open = useApp((s) => s.timeOpen);
  const setOpen = useApp((s) => s.setTimeOpen);
  const regionName = useData().region(useApp((s) => s.regionId)).name;
  const [playing, setPlaying] = useState(false);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const t = useApp.getState().timeMs + 2 * H;
      if (t > ephemeris.endMs) return setPlaying(false);
      setTime(t);
    }, 120);
    return () => window.clearInterval(id);
  }, [playing, ephemeris, setTime]);

  // Close on Escape or a click outside.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const down = (e: PointerEvent) => host.current && !host.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener('keydown', key);
    window.addEventListener('pointerdown', down);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('pointerdown', down);
    };
  }, [open, setOpen]);

  const step = (dt: number) => setTime(ephemeris.clamp(timeMs + dt));
  const { date, time } = parts(timeMs);

  return (
    <div className={`timepill${open ? ' is-open' : ''}`} ref={host} data-obstacle>
      {open && (
        <section className="timesheet" aria-label="Observation time">
          <div className="timesheet__head">
            <span className="timesheet__title">Observation time</span>
            <span className="timesheet__sub">Bars show when the Sun and Earth clear the LOLA skyline at {regionName} · drag to scrub</span>
          </div>
          <VisibilityStrip />
          <TimeInputs steps={false} />
        </section>
      )}
      <div className="timepill__bar" role="group" aria-label="Observation time">
        <button type="button" className="timepill__step" onClick={() => step(-D)} aria-label="Back one day" title="Back one day">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 3.5 3.5 7 7 10.5M11 3.5 7.5 7l3.5 3.5" stroke="currentColor" fill="none" strokeWidth="1.4" /></svg>
        </button>
        <button type="button" className="timepill__step" onClick={() => step(-H)} aria-label="Back one hour" title="Back one hour">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M8.5 3.5 5 7l3.5 3.5" stroke="currentColor" fill="none" strokeWidth="1.4" /></svg>
        </button>
        <button type="button" className="timepill__when" aria-expanded={open} onClick={() => setOpen(!open)} title="Change observation time">
          <span className="timepill__date">{date}</span>
          <span className="timepill__time num">{time}</span>
          <span className="timepill__utc">UTC</span>
          <svg className="timepill__chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 6.5 5 3.5l3 3" stroke="currentColor" fill="none" strokeWidth="1.4" /></svg>
        </button>
        <button type="button" className="timepill__step" onClick={() => step(H)} aria-label="Forward one hour" title="Forward one hour">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M5.5 3.5 9 7l-3.5 3.5" stroke="currentColor" fill="none" strokeWidth="1.4" /></svg>
        </button>
        <button type="button" className="timepill__step" onClick={() => step(D)} aria-label="Forward one day" title="Forward one day">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 3.5 10.5 7 7 10.5M3 3.5 6.5 7 3 10.5" stroke="currentColor" fill="none" strokeWidth="1.4" /></svg>
        </button>
        <button
          type="button"
          className={`timepill__play${playing ? ' is-on' : ''}`}
          onClick={() => setPlaying((p) => !p)}
          aria-pressed={playing}
          aria-label={playing ? 'Pause' : 'Play forward, 2 hours per step'}
          title={playing ? 'Pause' : 'Play forward'}
        >
          {playing ? (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="2" width="2.5" height="8" rx=".5" fill="currentColor" /><rect x="7" y="2" width="2.5" height="8" rx=".5" fill="currentColor" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 2v8l6.5-4z" fill="currentColor" /></svg>
          )}
        </button>
      </div>
    </div>
  );
}
