import { t } from '../../i18n';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../state/store';
import { useData } from '../../data/DataContext';
import { TimeInputs, VisibilityStrip } from '../TimeControls';
import { Listen } from '../../audio/ui';
import { TZ_LABEL, zoned } from '../../utils/format';

const H = 3_600_000;
const D = 24 * H;
const SPEEDS = [
  { hPerS: 1, label: '1 h/s', name: 'one hour per second' },
  { hPerS: 6, label: '6 h/s', name: 'six hours per second' },
  { hPerS: 24, label: '1 d/s', name: 'one day per second' },
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fmtDay = (ms: number) => {
  const d = zoned(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

function parts(ms: number) {
  const d = zoned(ms);
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
  const [speed, setSpeed] = useState(1);
  const host = useRef<HTMLDivElement>(null);

  // Playback in simulated hours per real second, updated ~20 times a second and snapped to
  // whole minutes, so readings change steadily without flicker.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      acc += ((now - last) / 1000) * SPEEDS[speed].hPerS * H;
      last = now;
      if (acc >= 60_000 && now - lastSet.current > 45) {
        const step = Math.floor(acc / 60_000) * 60_000;
        acc -= step;
        lastSet.current = now;
        const t = useApp.getState().timeMs + step;
        if (t > ephemeris.endMs) {
          setTime(ephemeris.endMs);
          setPlaying(false);
          return;
        }
        setTime(t);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, ephemeris, setTime]);
  const lastSet = useRef(0);

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

  const step = (dt: number) => {
    setPlaying(false);
    setTime(ephemeris.clamp(timeMs + dt));
  };
  const { date, time } = parts(timeMs);

  return (
    <div className={`timepill${open ? ' is-open' : ''}`} ref={host} data-obstacle>
      {open && (
        <section className="timesheet" aria-label={t('Observation time')}>
          <div className="timesheet__head">
            <span className="timesheet__title">
              Observation time · {TZ_LABEL} <Listen id="view-time" />
            </span>
            <span className="timesheet__sub">
              When the Sun (gold) and Earth (cyan) clear the skyline at {regionName}. Drag or use the arrow keys.
            </span>
          </div>
          <VisibilityStrip />
          <TimeInputs steps={false} />
          <p className="timesheet__range">
            JPL Horizons ephemeris: {fmtDay(ephemeris.startMs)} – {fmtDay(ephemeris.endMs)}
          </p>
        </section>
      )}
      <div className="timepill__bar" role="group" aria-label={t('Observation time')}>
        <button type="button" className="timepill__step" onClick={() => step(-D)} aria-label={t('Back one day')} title={t('Back one day')}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 3.5 3.5 7 7 10.5M11 3.5 7.5 7l3.5 3.5" stroke="currentColor" fill="none" strokeWidth="1.4" /></svg>
        </button>
        <button type="button" className="timepill__step" onClick={() => step(-H)} aria-label={t('Back one hour')} title={t('Back one hour')}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M8.5 3.5 5 7l3.5 3.5" stroke="currentColor" fill="none" strokeWidth="1.4" /></svg>
        </button>
        <button type="button" className="timepill__when" aria-expanded={open} onClick={() => setOpen(!open)} title={t('Change observation time')}>
          <span className="timepill__date">{date}</span>
          <span className="timepill__time num">{time}</span>
          <span className="timepill__utc">{TZ_LABEL}</span>
          <svg className="timepill__chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 6.5 5 3.5l3 3" stroke="currentColor" fill="none" strokeWidth="1.4" /></svg>
        </button>
        <button type="button" className="timepill__step" onClick={() => step(H)} aria-label={t('Forward one hour')} title={t('Forward one hour')}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M5.5 3.5 9 7l-3.5 3.5" stroke="currentColor" fill="none" strokeWidth="1.4" /></svg>
        </button>
        <button type="button" className="timepill__step" onClick={() => step(D)} aria-label={t('Forward one day')} title={t('Forward one day')}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 3.5 10.5 7 7 10.5M3 3.5 6.5 7 3 10.5" stroke="currentColor" fill="none" strokeWidth="1.4" /></svg>
        </button>
        <button
          type="button"
          className={`timepill__play${playing ? ' is-on' : ''}`}
          onClick={() => setPlaying((p) => !p)}
          aria-pressed={playing}
          aria-label={playing ? 'Pause' : `Play forward at ${SPEEDS[speed].name}`}
          title={playing ? 'Pause' : 'Play forward'}
        >
          {playing ? (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="2" width="2.5" height="8" rx=".5" fill="currentColor" /><rect x="7" y="2" width="2.5" height="8" rx=".5" fill="currentColor" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 2v8l6.5-4z" fill="currentColor" /></svg>
          )}
        </button>
        <button
          type="button"
          className="timepill__speed num"
          onClick={() => setSpeed((v) => (v + 1) % SPEEDS.length)}
          aria-label={`Playback speed: ${SPEEDS[speed].name}. Change speed.`}
          title={t('Playback speed')}
        >
          {SPEEDS[speed].label}
        </button>
      </div>
    </div>
  );
}
