/**
 * Lightweight performance marks (always on, negligible cost). Read in the console or by the
 * benchmark script via `window.__perf`:
 *   moon-first-frame   first frame in which the globe is drawn with imagery
 *   moon-hires         polar mosaic + selected-site 100 m imagery on the GPU
 *   surface-ready      first Surface View frame with terrain
 *   region-switch      selection → site imagery ready (ms, list)
 *   longTasks          main-thread tasks > 50 ms (count, total ms)
 */
type PerfState = {
  marks: Record<string, number>;
  regionSwitch: number[];
  surfaceEnter: number[];
  longTasks: { count: number; totalMs: number; maxMs: number };
};

const state: PerfState = { marks: {}, regionSwitch: [], surfaceEnter: [], longTasks: { count: 0, totalMs: 0, maxMs: 0 } };

if (typeof window !== 'undefined') {
  (window as unknown as { __perf: PerfState }).__perf = state;
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        state.longTasks.count++;
        state.longTasks.totalMs += e.duration;
        state.longTasks.maxMs = Math.max(state.longTasks.maxMs, e.duration);
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    /* longtask not supported */
  }
}

/** Record the first occurrence of a named milestone (ms since navigation start). */
export function markOnce(name: string) {
  if (state.marks[name] === undefined) state.marks[name] = Math.round(performance.now());
}

let switchStart = 0;
export function regionSwitchStart() {
  switchStart = performance.now();
}
export function regionSwitchEnd() {
  if (switchStart) state.regionSwitch.push(Math.round(performance.now() - switchStart));
  switchStart = 0;
}

let surfaceStart = 0;
export function surfaceEnterStart() {
  surfaceStart = performance.now();
  state.marks['surface-start'] = Math.round(surfaceStart);
}
export function surfaceEnterEnd() {
  if (surfaceStart) state.surfaceEnter.push(Math.round(performance.now() - surfaceStart));
  surfaceStart = 0;
}
