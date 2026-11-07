import { useEffect, type ReactNode } from 'react';
import { useApp, type Mode } from '../../state/store';
import { useData } from '../../data/DataContext';

/**
 * Floating masthead: identity (left), the three ways of looking at the site
 * (centre) and secondary surfaces (right). Nothing here spans the screen, so the
 * Moon and terrain run edge to edge behind it.
 */

const MODES: { id: Mode; label: string; hint: string; icon: ReactNode }[] = [
  {
    id: 'orbital',
    label: 'Orbit',
    hint: 'The Moon from orbit',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <ellipse cx="8" cy="8" rx="7.2" ry="2.6" fill="none" stroke="currentColor" strokeWidth="1" opacity=".55" transform="rotate(-18 8 8)" />
      </svg>
    ),
  },
  {
    id: 'surface',
    label: 'Surface',
    hint: 'Stand at the observation point',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M1 12.5 5 8l2.6 2.4L10.5 6l4.5 6.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <circle cx="12.2" cy="3.4" r="1.3" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'analysis',
    label: 'Analysis',
    hint: 'Compare sites over time',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2 13.5h12M3.5 11V7.5M7 11V4M10.5 11V6M14 11V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function Brand() {
  return (
    <div className="brand">
      <svg className="brand__mark" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <circle cx="13" cy="13" r="8.5" fill="#F1F5F9" opacity="0.94" />
        <path d="M13 4.5a8.5 8.5 0 0 0 0 17 10.4 10.4 0 0 1 0-17z" fill="#05080F" opacity="0.6" />
        <circle cx="13" cy="21.5" r="1.5" fill="#4DDCF4" />
      </svg>
      <div className="brand__text">
        <h1 className="brand__name">Lunar Landing Site Navigator</h1>
        <span className="brand__sub">Artemis south-polar regions</span>
      </div>
    </div>
  );
}

export function ModeNav() {
  const mode = useApp((s) => s.mode);
  const setMode = useApp((s) => s.setMode);
  const enterSurface = useApp((s) => s.enterSurface);
  const transitioning = useApp((s) => s.transitioning);
  const idx = MODES.findIndex((m) => m.id === mode);
  return (
    <nav className="modenav" aria-label="View" data-obstacle>
      <span className="modenav__glide" style={{ transform: `translateX(${idx * 100}%)` }} aria-hidden="true" />
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`modenav__btn${mode === m.id ? ' is-active' : ''}`}
          aria-current={mode === m.id ? 'page' : undefined}
          title={m.hint}
          disabled={transitioning && m.id === 'surface'}
          onClick={() => (m.id === 'surface' ? enterSurface() : setMode(m.id))}
        >
          {m.icon}
          <span>{m.label}</span>
        </button>
      ))}
    </nav>
  );
}

/** Focus mode: hides everything but the scene and time. Button, or the F key anywhere. */
export function FocusToggle() {
  const focus = useApp((s) => s.focus);
  const setFocus = useApp((s) => s.setFocus);
  const mode = useApp((s) => s.mode);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest('input, select, textarea, [contenteditable]')) return;
      const st = useApp.getState();
      if (st.mode === 'analysis') return;
      if (e.key === 'f' || e.key === 'F') {
        st.setFocus(!st.focus);
        e.preventDefault();
      } else if (e.key === 'Escape' && st.focus && !st.drawer && !st.timeOpen) st.setFocus(false);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  if (mode === 'analysis') return null;
  return (
    <button
      type="button"
      className={`ghost-btn focus-btn${focus ? ' is-on' : ''}`}
      aria-pressed={focus}
      onClick={() => setFocus(!focus)}
      title={focus ? 'Show controls (F)' : 'Focus on the scene (F)'}
      data-obstacle
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        {focus ? (
          <path d="M5 1.5v3.5H1.5M9 1.5v3.5h3.5M5 12.5V9H1.5M9 12.5V9h3.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        ) : (
          <path d="M1.5 5V1.5H5M12.5 5V1.5H9M1.5 9v3.5H5M12.5 9v3.5H9" fill="none" stroke="currentColor" strokeWidth="1.3" />
        )}
      </svg>
      <span className="ghost-btn__long">{focus ? 'Show controls' : 'Focus'}</span>
      <kbd className="ghost-btn__kbd" aria-hidden="true">F</kbd>
    </button>
  );
}

export function Masthead() {
  const mode = useApp((s) => s.mode);
  const drawer = useApp((s) => s.drawer);
  const openDrawer = useApp((s) => s.openDrawer);
  const timeMs = useApp((s) => s.timeMs);
  const { ephemeris } = useData();
  const covered = ephemeris.covers(timeMs);
  return (
    <header className={`masthead masthead--${mode}`}>
      <Brand />
      <ModeNav />
      <div className="masthead__aside">
        {!covered && <span className="masthead__warn">Outside ephemeris coverage</span>}
        <FocusToggle />
        <button
          type="button"
          className={`ghost-btn${drawer === 'about' ? ' is-on' : ''}`}
          aria-expanded={drawer === 'about'}
          onClick={() => openDrawer('about')}
          aria-label="Data and method"
          data-obstacle
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M7 6.2v3.9M7 3.9v.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="ghost-btn__long">Data &amp; method</span>
        </button>
      </div>
    </header>
  );
}
