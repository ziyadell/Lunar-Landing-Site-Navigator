import { create } from 'zustand';
import { useApp } from '../state/store';
import { narrationItem, play, stop, pause, resume, usePlayer } from './engine';

/**
 * Guided tour: twelve steps, each an app action plus its narration. User-started only;
 * pause, next, replay and exit work at any time, and the scene stays interactive.
 *
 * Each step waits for the interface it talks about to be ready (a view's first frame, a
 * lazily loaded page, an element on screen) instead of assuming a fixed delay; a step that
 * cannot get ready within its limit narrates anyway rather than stalling the tour.
 * Every callback carries the tour's run number, so Next, Replay, Stop and Exit cancel
 * anything an earlier step had scheduled. Pausing never advances.
 */
type Step = {
  id: string;
  /** Interface element to outline while the step plays (CSS hook). */
  spot?: string;
  act: () => void;
  ready?: () => boolean;
  /** Longest wait for `ready` (ms). */
  limit?: number;
};

const app = () => useApp.getState();
const ensureOrbital = () => {
  if (app().mode !== 'orbital') app().setMode('orbital');
};
const el = (sel: string) => document.querySelector<HTMLElement>(sel);
const scrollTo = (sel: string) => {
  const e = el(sel);
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  e?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
};
const orbitalReady = () => app().mode === 'orbital' && app().sceneReady === 'orbital' && !app().transitioning;

const STEPS: Step[] = [
  {
    id: 'tour-moon',
    act: () => {
      ensureOrbital();
      app().openDrawer(null);
      app().resetCamera();
    },
    ready: orbitalReady,
    limit: 12_000,
  },
  { id: 'tour-nav', spot: 'camera', act: ensureOrbital, ready: orbitalReady },
  {
    id: 'tour-pole',
    act: () => {
      ensureOrbital();
      app().poleCamera();
    },
    ready: orbitalReady,
  },
  {
    id: 'tour-region',
    spot: 'region',
    act: () => {
      ensureOrbital();
      if (app().regionId !== 'malapert-massif') app().selectRegion('malapert-massif');
      else app().focusRegion();
    },
    ready: orbitalReady,
  },
  { id: 'tour-time', spot: 'time', act: ensureOrbital, ready: () => !!el('.timepill') },
  { id: 'tour-measure', spot: 'conditions', act: ensureOrbital, ready: () => !!el('.cond') },
  {
    id: 'tour-surface',
    act: () => {
      app().openDrawer(null);
      app().enterSurface();
    },
    // Wait for the first complete terrain frame (or the recovery message), up to 30 s.
    ready: () => app().mode === 'surface' && (app().sceneReady === 'surface' || !!el('.vp-note.is-warn')),
    limit: 30_000,
  },
  {
    id: 'tour-surface-controls',
    spot: 'look',
    act: () => {
      if (app().mode !== 'surface') app().enterSurface();
    },
    ready: () => app().mode === 'surface' && !app().transitioning,
    limit: 30_000,
  },
  {
    id: 'tour-analysis',
    act: () => {
      app().openDrawer(null);
      app().setMode('analysis');
      window.scrollTo?.(0, 0);
    },
    ready: () => !!el('.matchup'), // the page is loaded lazily
    limit: 15_000,
  },
  {
    id: 'tour-compare',
    spot: 'glance',
    act: () => {
      if (app().mode !== 'analysis') app().setMode('analysis');
    },
    ready: () => !!el('.glance'),
    limit: 15_000,
  },
  {
    id: 'tour-csv',
    spot: 'csv',
    act: () => {
      if (app().mode !== 'analysis') app().setMode('analysis');
    },
    ready: () => !!el('.pano-card__cap .text-btn'),
    limit: 15_000,
  },
  {
    id: 'tour-sources',
    act: () => {
      if (app().drawer !== 'about') app().openDrawer('about');
    },
    ready: () => !!el('.drawer'),
  },
];
const SCROLL: Record<string, string> = { glance: '.glance', csv: '.study__panos' };

interface Tour {
  step: number; // -1 = not running
  paused: boolean;
  /** Waiting for the interface before narrating. */
  waiting: boolean;
}
export const useTour = create<Tour>(() => ({ step: -1, paused: false, waiting: false }));
export const TOUR_LENGTH = STEPS.length;
if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __tour: useTour, __player: usePlayer });

let run = 0; // incremented by every go / exit: stale callbacks compare against it
let timer = 0;

function narrate(i: number, r: number) {
  if (r !== run) return;
  useTour.setState({ waiting: false });
  const item = narrationItem(STEPS[i].id)!;
  const spot = STEPS[i].spot;
  if (spot && SCROLL[spot]) scrollTo(SCROLL[spot]);
  if (useTour.getState().paused) return; // resume() narrates
  void play(item, {
    onEnd: () => {
      if (r !== run || useTour.getState().paused) return;
      timer = window.setTimeout(() => r === run && !useTour.getState().paused && go(i + 1), 900);
    },
  });
}

function go(i: number) {
  window.clearTimeout(timer);
  const r = ++run;
  if (i >= STEPS.length) return exitTour();
  const s = STEPS[i];
  stop(); // the previous step's narration and its callbacks
  useTour.setState({ step: i, paused: false, waiting: true });
  useApp.setState({ tourSpot: s.spot ?? null });
  s.act();
  // Wait for the view, then a short beat for the camera to start moving.
  const t0 = performance.now();
  const limit = s.limit ?? 6000;
  const check = () => {
    if (r !== run) return;
    const ok = !s.ready || s.ready();
    if (ok || performance.now() - t0 > limit) {
      timer = window.setTimeout(() => narrate(i, r), ok ? 600 : 0);
      return;
    }
    timer = window.setTimeout(check, 150); // a timer, not animation frames: works in background tabs
  };
  check();
}

export function startTour() {
  go(0);
}
export function nextStep() {
  const s = useTour.getState().step;
  if (s >= 0) go(s + 1);
}
export function prevStep() {
  const s = useTour.getState().step;
  if (s > 0) go(s - 1);
}
/** Replay the current step's narration from the start (does not repeat its camera move). */
export function replayStep() {
  const s = useTour.getState().step;
  if (s < 0) return;
  window.clearTimeout(timer);
  const r = ++run;
  useTour.setState({ paused: false, waiting: false });
  narrate(s, r);
}
export function toggleTourPause() {
  const t = useTour.getState();
  if (t.step < 0) return;
  if (t.paused) {
    useTour.setState({ paused: false });
    const p = usePlayer.getState();
    if (t.waiting) return; // the pending check narrates when ready
    if (!p.item || p.progress >= 1) {
      // Paused between steps or before narration began: narrate this step now.
      const r = ++run;
      window.clearTimeout(timer);
      if (!p.item) narrate(t.step, r);
      else go(t.step + 1);
    } else resume();
  } else {
    useTour.setState({ paused: true });
    // Cancel a pending auto-advance; keep a pending readiness check (it narrates paused-aware).
    if (!t.waiting) window.clearTimeout(timer);
    pause();
  }
}
export function exitTour() {
  window.clearTimeout(timer);
  run++;
  useTour.setState({ step: -1, paused: false, waiting: false });
  useApp.setState({ tourSpot: null });
  stop();
}
