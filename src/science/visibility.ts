import type {
  BodyGeometry,
  HorizonProfile,
  LandingRegion,
  ScenarioMetrics,
  SiteConditions,
  TopocentricBody,
} from '../data/types';
import type { Ephemeris } from './ephemeris';
import {
  AU_KM,
  EARTH_RADIUS_KM,
  MOON_RADIUS_KM,
  SUN_RADIUS_KM,
  discFractionAbove,
  topocentric,
  wrap360,
} from './geometry';

/** Skyline elevation (deg) at an azimuth, linear interpolation of the profile. */
export function horizonAt(h: HorizonProfile, azDeg: number): number {
  const n = h.elevationDeg.length;
  const x = wrap360(azDeg) / h.azStepDeg;
  const i = Math.floor(x) % n;
  const f = x - Math.floor(x);
  return h.elevationDeg[i] * (1 - f) + h.elevationDeg[(i + 1) % n] * f;
}

function evaluateBody(region: LandingRegion, body: BodyGeometry, bodyRadiusKm: number): TopocentricBody {
  const p = region.observationPoint;
  const siteR = MOON_RADIUS_KM + (p.elevationM + p.observerHeightM) / 1000;
  const { azDeg, elDeg } = topocentric(p.latDeg, p.lonDeg, siteR, body.dir, body.distanceKm);
  const horizonDeg = horizonAt(region.horizon, azDeg);
  const marginDeg = elDeg - horizonDeg;
  const dist = Number.isFinite(body.distanceKm) ? body.distanceKm : AU_KM;
  const angRadiusDeg = (Math.asin(bodyRadiusKm / dist) * 180) / Math.PI;
  const discFraction = discFractionAbove(marginDeg, angRadiusDeg);
  const state = marginDeg > 0 ? 'visible' : elDeg > 0 ? 'terrain-blocked' : 'below-horizontal';
  return { azDeg, elDeg, horizonDeg, marginDeg, discFraction, state };
}

export function siteConditions(region: LandingRegion, eph: Ephemeris, timeMs: number): SiteConditions | null {
  const s = eph.sample(timeMs);
  if (!s) return null;
  return {
    timeMs,
    sun: evaluateBody(region, s.sun, SUN_RADIUS_KM),
    earth: evaluateBody(region, s.earth, EARTH_RADIUS_KM),
  };
}

/** The next time a body's centre crosses the measured skyline (sets or rises). */
export interface Crossing {
  /** 'set' = visible now, goes behind the skyline; 'rise' = hidden now, clears it. */
  kind: 'set' | 'rise';
  /** Crossing time, refined to about one minute. null when none was found. */
  timeMs: number | null;
  /** Why there is no time: nothing within the search window, or the ephemeris ends first. */
  none?: 'window' | 'coverage';
  /** The search covered [fromMs, scannedToMs]. */
  fromMs: number;
  scannedToMs: number;
}

export const CROSSING_STEP_MS = 10 * 60_000;
export const CROSSING_WINDOW_DAYS = 90;

/**
 * Time of the next sunset/sunrise or Earthset/Earthrise at the observation point: the first
 * change of sign of (elevation − skyline) after timeMs, found by stepping forward every
 * 10 minutes and refining by bisection to under a minute. Events shorter than one step can be
 * missed. The search stops after `windowDays` or at the end of the ephemeris, whichever is first.
 * `resume` continues an earlier search that found nothing (same region and body).
 */
export function nextCrossing(
  region: LandingRegion,
  eph: Ephemeris,
  timeMs: number,
  body: 'sun' | 'earth',
  windowDays = CROSSING_WINDOW_DAYS,
  resume?: Crossing,
): Crossing | null {
  const now = siteConditions(region, eph, timeMs);
  if (!now) return null;
  const up = now[body].marginDeg > 0;
  const kind = up ? 'set' : 'rise';
  const isUp = (t: number) => siteConditions(region, eph, t)![body].marginDeg > 0;
  const limit = Math.min(timeMs + windowDays * 86_400_000, eph.endMs);
  const canResume = resume && resume.timeMs === null && resume.kind === kind && timeMs >= resume.fromMs && timeMs <= resume.scannedToMs;
  const fromMs = canResume ? resume.fromMs : timeMs;
  let prev = canResume ? Math.min(resume.scannedToMs, limit) : timeMs;
  while (prev < limit) {
    const t = Math.min(prev + CROSSING_STEP_MS, limit);
    if (isUp(t) !== up) {
      let lo = prev;
      let hi = t;
      while (hi - lo > 30_000) {
        const mid = (lo + hi) / 2;
        if (isUp(mid) === up) lo = mid;
        else hi = mid;
      }
      return { kind, timeMs: Math.round(hi / 60_000) * 60_000, fromMs, scannedToMs: hi };
    }
    prev = t;
  }
  return { kind, timeMs: null, none: limit >= eph.endMs ? 'coverage' : 'window', fromMs, scannedToMs: Math.max(prev, limit) };
}

export interface SeriesPoint {
  t: number;
  sunEl: number;
  sunHz: number;
  sunAz: number;
  earthEl: number;
  earthHz: number;
  earthAz: number;
  sunVis: boolean;
  earthVis: boolean;
}

export function computeSeries(
  region: LandingRegion,
  eph: Ephemeris,
  startMs: number,
  endMs: number,
  stepMinutes: number,
): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  const step = stepMinutes * 60_000;
  const a = Math.max(startMs, eph.startMs);
  const b = Math.min(endMs, eph.endMs);
  for (let t = a; t <= b; t += step) {
    const c = siteConditions(region, eph, t);
    if (!c) continue;
    out.push({
      t,
      sunEl: c.sun.elDeg,
      sunHz: c.sun.horizonDeg,
      sunAz: c.sun.azDeg,
      earthEl: c.earth.elDeg,
      earthHz: c.earth.horizonDeg,
      earthAz: c.earth.azDeg,
      sunVis: c.sun.marginDeg > 0,
      earthVis: c.earth.marginDeg > 0,
    });
  }
  return out;
}

/** Contiguous runs where `pred` holds. Each sample represents [t, t+step). */
export function runs(series: SeriesPoint[], pred: (p: SeriesPoint) => boolean, stepMs: number) {
  const out: { startMs: number; endMs: number; atStart: boolean; atEnd: boolean }[] = [];
  let s = -1;
  for (let i = 0; i <= series.length; i++) {
    const ok = i < series.length && pred(series[i]);
    if (ok && s < 0) s = i;
    if (!ok && s >= 0) {
      out.push({
        startMs: series[s].t,
        endMs: series[i - 1].t + stepMs,
        atStart: s === 0,
        atEnd: i === series.length,
      });
      s = -1;
    }
  }
  return out;
}

export function scenarioMetrics(series: SeriesPoint[], stepMinutes: number): ScenarioMetrics | null {
  if (series.length < 2) return null;
  const stepMs = stepMinutes * 60_000;
  const n = series.length;
  const pct = (f: (p: SeriesPoint) => boolean) => (100 * series.filter(f).length) / n;
  // Longest run, and whether that value is only a lower bound: true when the longest
  // run touches the start or end of the period, including a boundary run that ties the
  // longest fully observed run (its real length may extend beyond the period).
  const longest = (f: (p: SeriesPoint) => boolean) => {
    const r = runs(series, f, stepMs);
    let h = 0;
    for (const x of r) h = Math.max(h, (x.endMs - x.startMs) / 3_600_000);
    const truncated = h > 0 && r.some((x) => (x.atStart || x.atEnd) && Math.abs((x.endMs - x.startMs) / 3_600_000 - h) < 1e-9);
    return { h, truncated };
  };
  const noSun = longest((p) => !p.sunVis);
  const noEarth = longest((p) => !p.earthVis);
  const neither = longest((p) => !p.sunVis && !p.earthVis);
  const sun = longest((p) => p.sunVis);
  let sMin = Infinity, sMax = -Infinity, eMin = Infinity, eMax = -Infinity;
  for (const p of series) {
    sMin = Math.min(sMin, p.sunEl); sMax = Math.max(sMax, p.sunEl);
    eMin = Math.min(eMin, p.earthEl); eMax = Math.max(eMax, p.earthEl);
  }
  return {
    periodHours: (n * stepMs) / 3_600_000,
    sampleMinutes: stepMinutes,
    sunVisiblePct: pct((p) => p.sunVis),
    earthVisiblePct: pct((p) => p.earthVis),
    bothVisiblePct: pct((p) => p.sunVis && p.earthVis),
    neitherVisiblePct: pct((p) => !p.sunVis && !p.earthVis),
    longestNoSunHours: noSun.h,
    longestNoEarthHours: noEarth.h,
    longestNeitherHours: neither.h,
    longestSunHours: sun.h,
    sunElevRange: [sMin, sMax],
    earthElevRange: [eMin, eMax],
    noSunTruncated: noSun.truncated,
    noEarthTruncated: noEarth.truncated,
    neitherTruncated: neither.truncated,
    sunTruncated: sun.truncated,
  };
}

export const STATE_LABEL = {
  visible: 'Above terrain horizon',
  'terrain-blocked': 'Blocked by terrain',
  'below-horizontal': 'Below local horizontal',
} as const;
