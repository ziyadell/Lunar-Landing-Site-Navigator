import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/store';
import { useData } from '../data/DataContext';
import { computeSeries, runs } from '../science/visibility';
import { fmtDate, fmtTime, fmtUtc, parseUtc } from '../utils/format';

const H = 3_600_000;
const D = 24 * H;

/** Date + time inputs (UTC), step buttons, playback. */
export function TimeInputs({ compact = false }: { compact?: boolean }) {
  const { ephemeris } = useData();
  const timeMs = useApp((s) => s.timeMs);
  const setTime = useApp((s) => s.setTime);
  const [playing, setPlaying] = useState(false);
  const [date, setDate] = useState(fmtDate(timeMs));
  const [time, setTimeStr] = useState(fmtTime(timeMs));

  useEffect(() => {
    setDate(fmtDate(timeMs));
    setTimeStr(fmtTime(timeMs));
  }, [timeMs]);

  // Playback through the precomputed ephemeris: 2 hours of lunar time per frame-tick.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const t = useApp.getState().timeMs + 2 * H;
      if (t > ephemeris.endMs) {
        setPlaying(false);
        return;
      }
      setTime(t);
    }, 120);
    return () => window.clearInterval(id);
  }, [playing, ephemeris, setTime]);

  const commit = (d: string, t: string) => {
    const v = parseUtc(d, t);
    if (v !== null) setTime(v);
  };
  const step = (dt: number) => setTime(ephemeris.clamp(timeMs + dt));
  const min = fmtDate(ephemeris.startMs);
  const max = fmtDate(ephemeris.endMs);

  return (
    <div className={`time-inputs${compact ? ' time-inputs--compact' : ''}`}>
      <div className="field">
        <label htmlFor="obs-date">Date (UTC)</label>
        <input
          id="obs-date"
          type="date"
          value={date}
          min={min}
          max={max}
          onChange={(e) => {
            setDate(e.target.value);
            commit(e.target.value, time);
          }}
        />
      </div>
      <div className="field field--time">
        <label htmlFor="obs-time">Time (UTC)</label>
        <input
          id="obs-time"
          type="text"
          inputMode="numeric"
          pattern="[0-2][0-9]:[0-5][0-9]"
          maxLength={5}
          placeholder="HH:MM"
          aria-describedby="obs-time-hint"
          value={time}
          onChange={(e) => {
            setTimeStr(e.target.value);
            if (/^([01]\d|2[0-3]):[0-5]\d$/.test(e.target.value)) commit(date, e.target.value);
          }}
          onBlur={() => setTimeStr(fmtTime(timeMs))}
        />
        <span id="obs-time-hint" className="sr-only">24-hour UTC, for example 14:30</span>
      </div>
      <div className="stepper" role="group" aria-label="Step observation time">
        <button type="button" onClick={() => step(-D)} aria-label="Back one day">−1d</button>
        <button type="button" onClick={() => step(-H)} aria-label="Back one hour">−1h</button>
        <button
          type="button"
          className={`stepper__play${playing ? ' is-on' : ''}`}
          onClick={() => setPlaying((p) => !p)}
          aria-pressed={playing}
          aria-label={playing ? 'Pause playback' : 'Play through ephemeris, 2 hours per step'}
        >
          {playing ? (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x="1.5" y="1" width="2.5" height="8" fill="currentColor" /><rect x="6" y="1" width="2.5" height="8" fill="currentColor" /></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1v8l7-4z" fill="currentColor" /></svg>
          )}
        </button>
        <button type="button" onClick={() => step(H)} aria-label="Forward one hour">+1h</button>
        <button type="button" onClick={() => step(D)} aria-label="Forward one day">+1d</button>
      </div>
      <button
        type="button"
        className="btn-text"
        onClick={() => setTime(ephemeris.clamp(Math.floor(Date.now() / H) * H))}
      >
        Now
      </button>
    </div>
  );
}

/**
 * 30-day visibility strip for the selected observation point, centred on the
 * current epoch. Computed from the ephemeris + LOLA horizon (1-hour samples).
 * Works as a slider: click/drag or arrow keys to move the epoch.
 */
export function VisibilityStrip() {
  const { ephemeris, region } = useData();
  const regionId = useApp((s) => s.regionId);
  const timeMs = useApp((s) => s.timeMs);
  const setTime = useApp((s) => s.setTime);
  const r = region(regionId);
  const ref = useRef<HTMLDivElement>(null);

  // Window snaps to whole days so it doesn't recompute every hour step.
  const center = Math.floor(timeMs / D) * D;
  const start = ephemeris.clamp(center - 15 * D);
  const end = ephemeris.clamp(start + 30 * D);
  const span = end - start;

  const { sun, earth } = useMemo(() => {
    const s = computeSeries(r, ephemeris, start, end, 60);
    return { sun: runs(s, (p) => p.sunVis, H), earth: runs(s, (p) => p.earthVis, H) };
  }, [r, ephemeris, start, end]);

  const xOf = (t: number) => ((t - start) / span) * 100;
  const fromEvent = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const b = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - b.left) / b.width));
    setTime(Math.round((start + f * span) / H) * H);
  };

  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let t = Math.ceil(start / D) * D; t <= end; t += 5 * D) out.push(t);
    return out;
  }, [start, end]);

  const inWindow = timeMs >= start && timeMs <= end;

  return (
    <div className="vstrip">
      <div className="vstrip__legend" aria-hidden="true">
        <span className="vstrip__key vstrip__key--sun">Sun</span>
        <span className="vstrip__key vstrip__key--earth">Earth</span>
      </div>
      <div
        ref={ref}
        className="vstrip__track"
        role="slider"
        tabIndex={0}
        aria-label={`Observation epoch. Bars show when the Sun and Earth are above the terrain horizon at ${r.name}.`}
        aria-valuemin={start}
        aria-valuemax={end}
        aria-valuenow={timeMs}
        aria-valuetext={fmtUtc(timeMs)}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          fromEvent(e.clientX);
        }}
        onPointerMove={(e) => e.buttons === 1 && fromEvent(e.clientX)}
        onKeyDown={(e) => {
          const k = e.shiftKey ? D : H;
          if (e.key === 'ArrowRight') setTime(ephemeris.clamp(timeMs + k));
          else if (e.key === 'ArrowLeft') setTime(ephemeris.clamp(timeMs - k));
          else if (e.key === 'PageUp') setTime(ephemeris.clamp(timeMs + D));
          else if (e.key === 'PageDown') setTime(ephemeris.clamp(timeMs - D));
          else return;
          e.preventDefault();
        }}
      >
        <div className="vstrip__lane vstrip__lane--sun">
          {sun.map((s) => (
            <span key={s.startMs} style={{ left: `${xOf(s.startMs)}%`, width: `${xOf(s.endMs) - xOf(s.startMs)}%` }} />
          ))}
        </div>
        <div className="vstrip__lane vstrip__lane--earth">
          {earth.map((s) => (
            <span key={s.startMs} style={{ left: `${xOf(s.startMs)}%`, width: `${xOf(s.endMs) - xOf(s.startMs)}%` }} />
          ))}
        </div>
        {ticks.map((t) => (
          <span key={t} className="vstrip__tick" style={{ left: `${xOf(t)}%` }}>
            <span className="num">{fmtDate(t).slice(5)}</span>
          </span>
        ))}
        {inWindow && <span className="vstrip__cursor" style={{ left: `${xOf(timeMs)}%` }} aria-hidden="true" />}
      </div>
    </div>
  );
}
