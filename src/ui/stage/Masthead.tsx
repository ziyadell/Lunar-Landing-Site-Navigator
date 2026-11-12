import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp, type Mode } from '../../state/store';
import { Listen } from '../../audio/ui';
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
      {/* The project's original logo (first release), unchanged. */}
      <svg className="brand__mark" width="26" height="26" viewBox="0 0 22 22" aria-hidden="true">
        <circle cx="11" cy="11" r="7.5" fill="#F1F5F9" opacity="0.92" />
        <path d="M11 3.5a7.5 7.5 0 0 0 0 15 9 9 0 0 1 0-15z" fill="#05080F" opacity="0.55" />
        <circle cx="11" cy="11" r="10.25" fill="none" stroke="#4DDCF4" strokeWidth="1" strokeDasharray="2 2.6" />
      </svg>
      <div className="brand__text">
        <h1 className="brand__name">LunaNav</h1>
        <span className="brand__sub">
          Lunar Landing Site Navigator <Listen id="orbit-intro" />
        </span>
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

/**
 * Phones: Focus, Settings and Data & method share one labelled menu so the three view
 * buttons keep readable, separate touch targets. (Wider screens show them inline.)
 */
function MoreMenu() {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const mode = useApp((s) => s.mode);
  const focus = useApp((s) => s.focus);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        btn.current?.focus();
      }
    };
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', down, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', down, true);
    };
  }, [open]);
  const pick = (f: () => void) => {
    setOpen(false);
    f();
  };
  return (
    <div className="more">
      <button ref={btn} type="button" className={`ghost-btn ghost-btn--icon more__btn${open ? ' is-on' : ''}`} aria-haspopup="menu" aria-expanded={open} aria-label="More: focus, settings, crew, data and method" onClick={() => setOpen((o) => !o)}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="3.5" cy="8" r="1.4" fill="currentColor" />
          <circle cx="8" cy="8" r="1.4" fill="currentColor" />
          <circle cx="12.5" cy="8" r="1.4" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div ref={menu} className="more__menu" role="menu">
          {mode !== 'analysis' && (
            <button type="button" role="menuitem" className="more__item" onClick={() => pick(() => useApp.getState().setFocus(!focus))}>
              {focus ? 'Show controls' : 'Focus on the scene'}
            </button>
          )}
          <button type="button" role="menuitem" className="more__item" onClick={() => pick(() => useApp.getState().openDrawer('settings'))}>
            Settings
          </button>
          <button type="button" role="menuitem" className="more__item" onClick={() => pick(() => useApp.getState().openDrawer('crew'))}>
            Artemis III crew
          </button>
          <button type="button" role="menuitem" className="more__item" onClick={() => pick(() => useApp.getState().openDrawer('about'))}>
            Data &amp; method
          </button>
        </div>
      )}
    </div>
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
        <MoreMenu />
        <FocusToggle />
        <button
          type="button"
          className={`ghost-btn ghost-btn--icon${drawer === 'settings' ? ' is-on' : ''}`}
          aria-expanded={drawer === 'settings'}
          onClick={() => openDrawer('settings')}
          aria-label="Settings: quality, audio guide, tour"
          title="Settings"
          data-obstacle
        >
          <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <circle cx="10.5" cy="4.5" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="5.5" cy="11.5" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
        <button
          type="button"
          className={`ghost-btn ghost-btn--crew${drawer === 'crew' ? ' is-on' : ''}`}
          aria-expanded={drawer === 'crew'}
          onClick={() => openDrawer('crew')}
          aria-label="Artemis III crew"
          title="Artemis III crew"
          data-obstacle
        >
          <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="6" cy="5.4" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M1.8 13.2c.5-2.4 2.1-3.7 4.2-3.7s3.7 1.3 4.2 3.7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M10.6 3.3a2.3 2.3 0 0 1 0 4.3M12.3 9.9c1 .6 1.7 1.7 2 3.3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span className="ghost-btn__long">Crew</span>
        </button>
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
