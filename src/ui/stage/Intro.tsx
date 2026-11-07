import { useEffect, useState } from 'react';
import { useApp } from '../../state/store';

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
  if (!open || mode !== 'orbital' || focus) return null;
  return (
    <aside className="intro" aria-label="Getting started" data-obstacle>
      <ol className="intro__steps">
        <li>
          <span>
            <b>Drag</b> to turn the Moon, scroll to zoom
          </span>
        </li>
        <li>
          <span>
            <b>Pick a region</b> on the map, bottom left
          </span>
        </li>
        <li>
          <span>
            <b>Explore the surface</b> to stand there
          </span>
        </li>
        <li>
          <span>
            <b>Analysis</b> compares two sites over time
          </span>
        </li>
      </ol>
      <button type="button" className="intro__close" onClick={close}>
        Got it
      </button>
    </aside>
  );
}
