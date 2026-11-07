import { useEffect, useState } from 'react';
import { useApp } from '../../state/store';
import { useSettings } from '../../state/settings';

const KEY = 'lsn.intro.v1';
const seen = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * First-visit hint: four ways in, one glance, one dismissal. Never a tour, never
 * blocking: the scene stays usable, and the hint leaves for good once dismissed,
 * once a region is chosen, or once the user leaves Orbit.
 */
export function Intro() {
  const [open, setOpen] = useState(() => !seen());
  const mode = useApp((s) => s.mode);
  const focus = useApp((s) => s.focus);
  const welcomeSeen = useSettings((s) => s.welcomeSeen);
  const intro = useApp((s) => s.intro);
  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* storage unavailable: the hint simply returns next visit */
    }
  };
  useEffect(() => {
    if (!open) return;
    const first = useApp.getState().regionId;
    return useApp.subscribe((s) => {
      if (s.regionId !== first || s.mode !== 'orbital') close();
    });
  }, [open]);
  if (!open || mode !== 'orbital' || focus || !welcomeSeen || intro) return null;
  return (
    <aside className="intro" aria-label="Getting started" data-obstacle>
      <ul className="intro__steps">
        <li>
          <b>Drag</b> to turn · <b>scroll</b> to zoom
        </li>
        <li>
          <b>Pick a region</b> on the map
        </li>
        <li>
          <b>Explore the surface</b> to stand there
        </li>
        <li>
          <b>Analysis</b> compares sites
        </li>
      </ul>
      <button type="button" className="intro__close" onClick={close} aria-label="Dismiss tips">
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.6" /></svg>
      </button>
    </aside>
  );
}
