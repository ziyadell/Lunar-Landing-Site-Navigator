import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Ephemeris } from '../../src/science/ephemeris';
import { azElToLocal, discFractionAbove, lonLatToVec, topocentric, vecToLonLat, wrap360 } from '../../src/science/geometry';
import {
  assessScenario,
  computeSeries,
  horizonAt,
  runs,
  scenarioMetrics,
  siteConditions,
  type SeriesPoint,
} from '../../src/science/visibility';

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const sites = read('public/data/sites.json');
const eph = new Ephemeris(read('public/data/ephemeris.json'));
const H = 3_600_000;

/** A synthetic series: one sample per hour, Sun/Earth visibility from two strings ('1' = visible). */
function series(sun: string, earth = sun): SeriesPoint[] {
  return [...sun].map((c, i) => ({
    t: i * H,
    sunEl: c === '1' ? 2 : -2,
    sunHz: 0,
    sunAz: 0,
    earthEl: earth[i] === '1' ? 3 : -3,
    earthHz: 0,
    earthAz: 0,
    sunVis: c === '1',
    earthVis: earth[i] === '1',
  }));
}

describe('geometry', () => {
  it('wraps azimuths into [0, 360)', () => {
    expect(wrap360(-10)).toBeCloseTo(350);
    expect(wrap360(720)).toBe(0);
    expect(wrap360(359.5)).toBeCloseTo(359.5);
  });

  it('round-trips latitude/longitude through a unit vector', () => {
    for (const [lat, lon] of [[-85.91, -4.16], [-88.6, 68.5], [0, 179.9], [45, -120]]) {
      const v = lonLatToVec(lat, lon);
      expect(Math.hypot(...v)).toBeCloseTo(1, 12);
      const back = vecToLonLat(v);
      expect(back.latDeg).toBeCloseTo(lat, 9);
      expect(wrap360(back.lonDeg)).toBeCloseTo(wrap360(lon), 9);
    }
  });

  it('puts a body straight overhead at +90° and the antipode at −90°', () => {
    const up = lonLatToVec(-86, 20);
    expect(topocentric(-86, 20, 1737.4, up, Infinity).elDeg).toBeCloseTo(90, 9);
    expect(topocentric(-86, 20, 1737.4, [-up[0], -up[1], -up[2]], Infinity).elDeg).toBeCloseTo(-90, 9);
  });

  it('measures azimuth clockwise from north', () => {
    const [x, y, z] = azElToLocal(90, 0); // due east, on the horizon: +X in the local frame
    expect(x).toBeCloseTo(1, 12);
    expect(y).toBeCloseTo(0, 12);
    expect(z).toBeCloseTo(0, 12);
    expect(azElToLocal(0, 0)[2]).toBeCloseTo(-1, 12); // north is −Z
  });

  it('gives the visible fraction of a disc against a flat skyline', () => {
    expect(discFractionAbove(0, 0.27)).toBeCloseTo(0.5, 12);
    expect(discFractionAbove(1, 0.27)).toBe(1);
    expect(discFractionAbove(-1, 0.27)).toBe(0);
    expect(discFractionAbove(0.1, 0.27)).toBeGreaterThan(0.5);
  });
});

describe('visibility', () => {
  const h = { azStepDeg: 90, elevationDeg: [0, 4, 8, 4] };

  it('interpolates the skyline linearly and wraps through north', () => {
    expect(horizonAt(h as never, 45)).toBeCloseTo(2);
    expect(horizonAt(h as never, 180)).toBeCloseTo(8);
    expect(horizonAt(h as never, 315)).toBeCloseTo(2); // between 4 (270°) and 0 (360° = 0°)
    expect(horizonAt(h as never, -45)).toBeCloseTo(2);
  });

  it('classifies a body by its margin above the measured skyline', () => {
    const region = sites.regions[0];
    const c = siteConditions(region, eph, Date.UTC(2026, 10, 20, 12))!;
    for (const b of [c.sun, c.earth]) {
      expect(b.marginDeg).toBeCloseTo(b.elDeg - b.horizonDeg, 12);
      const expected = b.marginDeg > 0 ? 'visible' : b.elDeg > 0 ? 'terrain-blocked' : 'below-horizontal';
      expect(b.state).toBe(expected);
    }
  });

  it('reports the published reading for Malapert Massif on 20 Nov 2026 12:00 UTC', () => {
    const region = sites.regions.find((r: { id: string }) => r.id === 'malapert-massif');
    const c = siteConditions(region, eph, Date.UTC(2026, 10, 20, 12))!;
    expect(c.sun.state).toBe('visible');
    expect(c.sun.elDeg).toBeCloseTo(4.07, 2); // as shown on the site and in the report
    expect(c.earth.elDeg).toBeCloseTo(7.88, 2);
  });

  it('returns nothing outside the ephemeris coverage', () => {
    expect(siteConditions(sites.regions[0], eph, eph.startMs - H)).toBeNull();
    expect(siteConditions(sites.regions[0], eph, eph.endMs + H)).toBeNull();
  });

  it('clips a series to the ephemeris coverage', () => {
    const s = computeSeries(sites.regions[0], eph, eph.endMs - 3 * H, eph.endMs + 10 * H, 60);
    expect(s.length).toBe(4);
    expect(s.at(-1)!.t).toBe(eph.endMs);
  });
});

describe('dark periods', () => {
  it('measures runs as [first sample, last sample + one step)', () => {
    const r = runs(series('110011'), (p) => !p.sunVis, H);
    expect(r).toEqual([{ startMs: 2 * H, endMs: 4 * H, atStart: false, atEnd: false }]);
  });

  it('a fully observed dark run is exact, not a lower bound', () => {
    const m = scenarioMetrics(series('1100011'), 60)!;
    expect(m.longestNoSunHours).toBe(3);
    expect(m.noSunTruncated).toBe(false);
  });

  it('a dark run touching the start or end is only a lower bound', () => {
    expect(scenarioMetrics(series('0001111'), 60)!.noSunTruncated).toBe(true);
    expect(scenarioMetrics(series('1111000'), 60)!.noSunTruncated).toBe(true);
  });

  it('a boundary run tying the longest inner run is still flagged as a lower bound', () => {
    const m = scenarioMetrics(series('0011001'), 60)!;
    expect(m.longestNoSunHours).toBe(2);
    expect(m.noSunTruncated).toBe(true);
  });

  it('a boundary run shorter than an inner run does not flag it', () => {
    const m = scenarioMetrics(series('0110001'), 60)!;
    expect(m.longestNoSunHours).toBe(3);
    expect(m.noSunTruncated).toBe(false);
  });

  it('never dark: zero hours, no flag; always dark: whole period, flagged', () => {
    const lit = scenarioMetrics(series('11111'), 60)!;
    expect(lit.longestNoSunHours).toBe(0);
    expect(lit.noSunTruncated).toBe(false);
    const dark = scenarioMetrics(series('00000'), 60)!;
    expect(dark.longestNoSunHours).toBe(5);
    expect(dark.noSunTruncated).toBe(true);
    expect(dark.sunVisiblePct).toBe(0);
  });

  it('needs at least two samples', () => {
    expect(scenarioMetrics(series('1'), 60)).toBeNull();
    expect(assessScenario(series('1'), 60, 100, 0)).toBeNull();
  });

  it('sizes storage from the longest dark run and applies the Earth clearance mask', () => {
    const s = series('1100011', '1111111');
    const a = assessScenario(s, 60, 100, 0)!;
    expect(a.darkHours).toBe(3);
    expect(a.storageKWh).toBeCloseTo(0.3);
    expect(a.linkPct).toBe(100);
    const masked = assessScenario(s, 60, 100, 5)!; // Earth is only 3° clear: no link at a 5° mask
    expect(masked.linkPct).toBe(0);
    expect(masked.outageHours).toBe(7);
    expect(masked.outageLowerBound).toBe(true);
  });
});
