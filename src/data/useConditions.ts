import { useMemo } from 'react';
import { useApp } from '../state/store';
import { useData } from './DataContext';
import { nextCrossing, siteConditions, type Crossing } from '../science/visibility';

/** Conditions at the selected region's observation point and the selected time. */
export function useConditions() {
  const { ephemeris, region } = useData();
  const regionId = useApp((s) => s.regionId);
  const timeMs = useApp((s) => s.timeMs);
  const r = region(regionId);
  const conditions = useMemo(() => siteConditions(r, ephemeris, timeMs), [r, ephemeris, timeMs]);
  const sample = useMemo(() => ephemeris.sample(timeMs), [ephemeris, timeMs]);
  return { region: r, conditions, sample, timeMs };
}

const crossingCache = new Map<string, Crossing>();

/**
 * Next skyline crossing (set or rise) of the Sun and Earth for the selected region and time.
 * A found crossing stays valid until the clock passes it, so playback does not search again
 * on every frame.
 */
export function useNextCrossings(): { sun: Crossing | null; earth: Crossing | null } {
  const { ephemeris, region } = useData();
  const regionId = useApp((s) => s.regionId);
  const timeMs = useApp((s) => s.timeMs);
  const r = region(regionId);
  return useMemo(() => {
    const one = (body: 'sun' | 'earth') => {
      const key = `${r.id}:${body}`;
      const c = crossingCache.get(key);
      if (c && c.timeMs !== null && timeMs >= c.fromMs && timeMs < c.timeMs - 60_000) return c;
      const next = nextCrossing(r, ephemeris, timeMs, body, undefined, c);
      if (next) crossingCache.set(key, next);
      else crossingCache.delete(key);
      return next;
    };
    return { sun: one('sun'), earth: one('earth') };
  }, [r, ephemeris, timeMs]);
}
