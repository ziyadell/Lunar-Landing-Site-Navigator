import { useApp, type Mode } from '../state/store';
import { useData } from '../data/DataContext';
import { fmtUtc } from '../utils/format';

const MODES: { id: Mode; idx: string; label: string; short: string }[] = [
  { id: 'orbital', idx: '01', label: 'Orbital View', short: 'Orbital' },
  { id: 'surface', idx: '02', label: 'Surface View', short: 'Surface' },
  { id: 'analysis', idx: '03', label: 'Mission Analysis', short: 'Analysis' },
];

export function TopBar() {
  const mode = useApp((s) => s.mode);
  const setMode = useApp((s) => s.setMode);
  const enterSurface = useApp((s) => s.enterSurface);
  const timeMs = useApp((s) => s.timeMs);
  const transitioning = useApp((s) => s.transitioning);
  const { ephemeris } = useData();
  const covered = ephemeris.covers(timeMs);

  return (
    <header className="topbar">
      <div className="topbar__id">
        <svg className="topbar__mark" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <circle cx="11" cy="11" r="7.5" fill="#F1F5F9" opacity="0.92" />
          <path d="M11 3.5a7.5 7.5 0 0 0 0 15 9 9 0 0 1 0-15z" fill="#05080F" opacity="0.55" />
          <circle cx="11" cy="11" r="10.25" fill="none" stroke="#4DDCF4" strokeWidth="1" strokeDasharray="2 2.6" />
        </svg>
        <div className="topbar__titles">
          <h1 className="topbar__title">Lunar Landing Site Navigator</h1>
          <span className="topbar__sub">South polar candidate regions · Space Apps 2026</span>
        </div>
      </div>

      <nav className="modes" aria-label="Application mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`modes__btn${mode === m.id ? ' is-active' : ''}`}
            aria-current={mode === m.id ? 'page' : undefined}
            disabled={transitioning && m.id === 'surface'}
            onClick={() => (m.id === 'surface' ? enterSurface() : setMode(m.id))}
          >
            <span className="modes__idx">{m.idx}</span>
            <span className="modes__label">{m.label}</span>
            <span className="modes__short">{m.short}</span>
          </button>
        ))}
      </nav>

      <div className="topbar__status">
        <div className="status-cell">
          <span className="status-cell__k">Epoch</span>
          <span className="status-cell__v num">{fmtUtc(timeMs)}</span>
        </div>
        <div className="status-cell status-cell--src">
          <span className="status-cell__k">Ephemeris</span>
          <span className={`status-cell__v ${covered ? '' : 'is-warn'}`}>
            {covered ? 'JPL Horizons · DE441' : 'Outside coverage'}
          </span>
        </div>
      </div>
    </header>
  );
}
