import { useApp, type Mode, type Scenario } from './store';

/**
 * Shareable state in the query string: ?mode=surface&site=haworth&t=2027-01-10T06:00Z
 * Read once at start-up; written back (replaceState) when mode, site or time change.
 */
const MODES: Mode[] = ['orbital', 'surface', 'analysis'];
const DURATIONS = [7, 14, 30, 60, 90, 180, 365];
const SCN_KEY = 'lsn.scenarios.v1';
/** Mission Analysis scenario as "region,YYYY-MM-DD,days" (URL parameters a and b). */
const encodeScenario = (s: Scenario) => `${s.regionId},${new Date(s.startMs).toISOString().slice(0, 10)},${s.durationDays}`;
function decodeScenario(v: string | null | undefined, validSites: string[]): Scenario | null {
  if (!v) return null;
  const [regionId, date, days] = v.split(',');
  const startMs = Date.parse(`${date}T00:00:00Z`);
  const durationDays = Number(days);
  if (!validSites.includes(regionId) || Number.isNaN(startMs) || !DURATIONS.includes(durationDays)) return null;
  return { regionId, startMs, durationDays };
}

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
  // Analysis scenarios: the URL wins; otherwise the last ones used in this browser.
  let saved: string[] = [];
  try {
    saved = JSON.parse(localStorage.getItem(SCN_KEY) ?? '[]');
  } catch {
    /* storage unavailable */
  }
  const cur = useApp.getState().scenarios;
  const a = decodeScenario(q.get('a'), validSites) ?? decodeScenario(saved[0], validSites);
  const b = decodeScenario(q.get('b'), validSites) ?? decodeScenario(saved[1], validSites);
  if (a || b) patch.scenarios = [a ?? cur[0], b ?? cur[1]];
  if (Object.keys(patch).length) useApp.setState(patch);

  let timer = 0;
  const unsubscribe = useApp.subscribe((s, prev) => {
    if (s.mode === prev.mode && s.regionId === prev.regionId && s.timeMs === prev.timeMs && s.scenarios === prev.scenarios) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const p = new URLSearchParams();
      p.set('mode', s.mode);
      p.set('site', s.regionId);
      p.set('t', new Date(s.timeMs).toISOString().slice(0, 16) + 'Z');
      const enc = s.scenarios.map(encodeScenario);
      p.set('a', enc[0]);
      p.set('b', enc[1]);
      try {
        localStorage.setItem(SCN_KEY, JSON.stringify(enc));
      } catch {
        /* storage unavailable */
      }
      window.history.replaceState(null, '', `${window.location.pathname}?${p}`);
    }, 250);
  });
  return () => {
    unsubscribe();
    window.clearTimeout(timer);
  };
}
