import { useApp, type Mode } from './store';

/**
 * Shareable state in the query string: ?mode=surface&site=haworth&t=2027-01-10T06:00Z
 * Read once at start-up; written back (replaceState) when mode, site or time change.
 */
const MODES: Mode[] = ['orbital', 'surface', 'analysis'];

export function initUrlSync(validSites: string[]) {
  const q = new URLSearchParams(window.location.search);
  const patch: Partial<ReturnType<typeof useApp.getState>> = {};
  const mode = q.get('mode') as Mode | null;
  if (mode && MODES.includes(mode)) patch.mode = mode;
  const site = q.get('site');
  if (site && validSites.includes(site)) patch.regionId = site;
  const t = q.get('t');
  if (t) {
    const v = Date.parse(t);
    if (!Number.isNaN(v)) patch.timeMs = v;
  }
  // Optional camera deep link: view=pole | focus, range=<km> (site focus distance).
  const view = q.get('view');
  const range = Number(q.get('range'));
  if (view === 'pole' || view === 'focus')
    patch.cameraCommand = { kind: view, seq: 1, ...(Number.isFinite(range) && range > 0 ? { rangeKm: range } : {}) };
  if (Object.keys(patch).length) useApp.setState(patch);

  let timer = 0;
  const unsubscribe = useApp.subscribe((s, prev) => {
    if (s.mode === prev.mode && s.regionId === prev.regionId && s.timeMs === prev.timeMs) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const p = new URLSearchParams();
      p.set('mode', s.mode);
      p.set('site', s.regionId);
      p.set('t', new Date(s.timeMs).toISOString().slice(0, 16) + 'Z');
      window.history.replaceState(null, '', `${window.location.pathname}?${p}`);
    }, 250);
  });
  return () => {
    unsubscribe();
    window.clearTimeout(timer);
  };
}
