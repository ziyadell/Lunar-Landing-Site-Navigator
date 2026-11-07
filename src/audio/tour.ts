import { create } from 'zustand';
import { useApp } from '../state/store';
import { narrationItem, play, stop, pause, resume, usePlayer } from './engine';

/**
 * Guided exploration: five steps, each a real camera/app action plus its narration.
 * User-started only; pause, next and exit work at any time, and the user can keep
 * interacting with the scene throughout (the tour never locks input).
 */
const STEPS: { id: string; act: () => void }[] = [
  {
    id: 'tour-moon',
    act: () => {
      const a = useApp.getState();
      if (a.mode !== 'orbital') a.setMode('orbital');
      a.openDrawer(null);
      a.resetCamera();
    },
  },
  { id: 'tour-pole', act: () => useApp.getState().poleCamera() },
  {
    id: 'tour-region',
    act: () => {
      const a = useApp.getState();
      if (a.regionId !== 'malapert-massif') a.selectRegion('malapert-massif');
      else a.focusRegion();
    },
  },
  { id: 'tour-surface', act: () => useApp.getState().enterSurface() },
  { id: 'tour-analysis', act: () => useApp.getState().setMode('analysis') },
];

interface Tour {
  step: number; // -1 = not running
  paused: boolean;
}
export const useTour = create<Tour>(() => ({ step: -1, paused: false }));
export const TOUR_LENGTH = STEPS.length;
if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __tour: useTour, __player: usePlayer });

let timer = 0;
function go(i: number) {
  window.clearTimeout(timer);
  if (i >= STEPS.length) return exitTour();
  useTour.setState({ step: i, paused: false });
  STEPS[i].act();
  const item = narrationItem(STEPS[i].id)!;
  // Let the camera move first; then narrate. Advance when the narration ends.
  timer = window.setTimeout(() => {
    void play(item, {
      onEnd: () => {
        if (useTour.getState().step === i && !useTour.getState().paused) timer = window.setTimeout(() => go(i + 1), 900);
      },
    });
  }, 700);
}

export function startTour() {
  go(0);
}
export function nextStep() {
  const s = useTour.getState().step;
  if (s >= 0) go(s + 1);
}
export function toggleTourPause() {
  const t = useTour.getState();
  if (t.step < 0) return;
  if (t.paused) {
    useTour.setState({ paused: false });
    if (usePlayer.getState().progress >= 1) go(t.step + 1);
    else resume();
  } else {
    useTour.setState({ paused: true });
    window.clearTimeout(timer);
    pause();
  }
}
export function exitTour() {
  window.clearTimeout(timer);
  useTour.setState({ step: -1, paused: false });
  stop();
}
