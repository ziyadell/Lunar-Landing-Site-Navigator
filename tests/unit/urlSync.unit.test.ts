import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useApp } from '../../src/state/store';
import { decodeScenario, encodeScenario, initUrlSync } from '../../src/state/urlSync';

const SITES = ['malapert-massif', 'nobile-rim-1', 'mons-mouton'];
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Minimal browser globals: the sync module only touches location, history and localStorage. */
function browser(search: string, stored?: string) {
  const store = new Map<string, string>(stored ? [['lsn.scenarios.v1', stored]] : []);
  const loc = { pathname: '/', search };
  vi.stubGlobal('window', {
    location: loc,
    history: { replaceState: (_: unknown, __: string, url: string) => { loc.search = url.slice(url.indexOf('?')); } },
    setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
    clearTimeout: (id: number) => clearTimeout(id),
  });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  return { loc, store };
}

describe('scenario URL encoding', () => {
  it('round-trips region, start date and duration', () => {
    const s = { regionId: 'nobile-rim-1', startMs: day('2027-03-15'), durationDays: 90 };
    expect(encodeScenario(s)).toBe('nobile-rim-1,2027-03-15,90');
    expect(decodeScenario(encodeScenario(s), SITES)).toEqual(s);
  });

  it('rejects unknown regions, bad dates and durations the app does not offer', () => {
    expect(decodeScenario('atlantis,2027-01-01,30', SITES)).toBeNull();
    expect(decodeScenario('mons-mouton,not-a-date,30', SITES)).toBeNull();
    expect(decodeScenario('mons-mouton,2027-01-01,45', SITES)).toBeNull();
    expect(decodeScenario('', SITES)).toBeNull();
    expect(decodeScenario(null, SITES)).toBeNull();
  });
});

describe('URL hydration and serialisation', () => {
  let initial: ReturnType<typeof useApp.getState>;
  beforeEach(() => {
    vi.useFakeTimers();
    initial = useApp.getState();
  });
  afterEach(() => {
    useApp.setState(initial, true);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('restores both scenarios from a shared link', () => {
    browser('?mode=analysis&a=mons-mouton,2027-02-01,7&b=malapert-massif,2027-06-10,365');
    const stop = initUrlSync(SITES);
    const [a, b] = useApp.getState().scenarios;
    expect(useApp.getState().mode).toBe('analysis');
    expect(a).toEqual({ regionId: 'mons-mouton', startMs: day('2027-02-01'), durationDays: 7 });
    expect(b).toEqual({ regionId: 'malapert-massif', startMs: day('2027-06-10'), durationDays: 365 });
    stop();
  });

  it('falls back to the last scenarios saved in this browser when the link has none', () => {
    browser('', JSON.stringify(['nobile-rim-1,2027-04-01,30', 'mons-mouton,2027-05-01,90']));
    const stop = initUrlSync(SITES);
    expect(useApp.getState().scenarios.map(encodeScenario)).toEqual(['nobile-rim-1,2027-04-01,30', 'mons-mouton,2027-05-01,90']);
    stop();
  });

  it('keeps the current scenario where a link value is invalid', () => {
    browser('?a=atlantis,2027-01-01,30&b=mons-mouton,2027-05-01,90');
    const before = useApp.getState().scenarios[0];
    const stop = initUrlSync(SITES);
    expect(useApp.getState().scenarios[0]).toEqual(before);
    expect(useApp.getState().scenarios[1].regionId).toBe('mons-mouton');
    stop();
  });

  it('writes a scenario change back to the URL and to storage', () => {
    const { loc, store } = browser('');
    const stop = initUrlSync(SITES);
    useApp.getState().setScenario(1, { regionId: 'mons-mouton', durationDays: 90 });
    vi.advanceTimersByTime(300);
    const q = new URLSearchParams(loc.search);
    expect(q.get('b')).toMatch(/^mons-mouton,\d{4}-\d{2}-\d{2},90$/);
    expect(q.get('a')).toBe(encodeScenario(useApp.getState().scenarios[0]));
    expect(JSON.parse(store.get('lsn.scenarios.v1')!)[1]).toBe(q.get('b'));
    stop();
  });
});
