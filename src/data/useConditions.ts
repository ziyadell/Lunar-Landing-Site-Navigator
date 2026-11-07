import { useMemo } from 'react';
import { useApp } from '../state/store';
import { useData } from './DataContext';
import { siteConditions } from '../science/visibility';

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
