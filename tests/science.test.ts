/**
 * Scientific regression tests for LunaNav's production calculations (src/science), run against the
 * shipped data in public/data and portable fixtures in tests/fixtures (no network, no git history).
 *
 *   npm run test:science
 *
 * What is tested, and what is not:
 *  - Direction accuracy: app Sun/Earth azimuth and elevation vs JPL Horizons topocentric values
 *    (fixture). This tests the ephemeris interpolation and geometry only.
 *  - Data integrity: ephemeris dates, time step, Earth distances; all nine regions' coordinates,
 *    horizon coverage and terrain files.
 *  - Logic: horizon interpolation, visibility decisions at horizon crossings, interval boundaries
 *    and lower-bound flags. Terrain accuracy (LOLA, 80 m) and rendering are NOT tested here.
 */
import { readFileSync, statSync } from 'node:fs';
import { Ephemeris } from '../src/science/ephemeris';
import { computeSeries, horizonAt, runs, scenarioMetrics, siteConditions, type SeriesPoint } from '../src/science/visibility';
import { lonLatToVec } from '../src/science/geometry';

let failed = 0;
let passed = 0;
const ok = (cond: boolean, label: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log('FAIL', label);
  }
};
const section = (s: string) => console.log(`-- ${s}`);
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const sites = read('public/data/sites.json');
const ephFile = read('public/data/ephemeris.json');
const eph = new Ephemeris(ephFile);
const regions: any[] = sites.regions;
const H = 3_600_000;
const angle = (a: number[], b: number[]) => Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * (180 / Math.PI);
const azDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

section('ephemeris dates, step and distances');
ok(ephFile.startUtc === '2026-07-01T00:00:00Z', 'starts 2026-07-01 00:00 UTC');
ok(ephFile.stepSeconds === 3600, 'hourly step');
ok(ephFile.count === 21960, '21,960 epochs');
ok(new Date(eph.endMs).toISOString() === '2028-12-31T23:00:00.000Z', 'ends 2028-12-31 23:00 UTC');
for (const k of ['subEarthLonDeg', 'subEarthLatDeg', 'subSolarLonDeg', 'subSolarLatDeg', 'earthRangeKm'])
  ok(ephFile[k].length === ephFile.count && ephFile[k].every(Number.isFinite), `${k}: one finite value per epoch`);
const range = ephFile.earthRangeKm as number[];
ok(Math.min(...range) > 350_000 && Math.max(...range) < 410_000, 'Earth–Moon distance stays within 350,000–410,000 km');
ok((ephFile.subSolarLatDeg as number[]).every((v) => Math.abs(v) < 2), 'sub-solar latitude within ±2° (Moon axis ~1.5° from the ecliptic normal)');
ok((ephFile.subEarthLatDeg as number[]).every((v) => Math.abs(v) < 8), 'sub-Earth latitude within ±8° (libration)');
ok(eph.sample(eph.startMs - 1) === null && eph.sample(eph.endMs + 1) === null, 'no extrapolation outside coverage');

section('interpolation');
{
  let worstEpoch = 0;
  let worstMid = 0;
  for (let i = 0; i < ephFile.count - 1; i += 97) {
    const t = eph.startMs + i * H;
    const s = eph.sample(t)!;
    worstEpoch = Math.max(worstEpoch, angle(s.sun.dir, lonLatToVec(ephFile.subSolarLatDeg[i], ephFile.subSolarLonDeg[i])));
    const a = lonLatToVec(ephFile.subEarthLatDeg[i], ephFile.subEarthLonDeg[i]);
    const b = lonLatToVec(ephFile.subEarthLatDeg[i + 1], ephFile.subEarthLonDeg[i + 1]);
    const m = eph.sample(t + H / 2)!.earth.dir;
    worstMid = Math.max(worstMid, Math.abs(angle(a, m) + angle(m, b) - angle(a, b)));
  }
  ok(worstEpoch < 1e-5, `at table epochs the sample equals the table (worst ${worstEpoch.toExponential(1)}°)`);
  ok(worstMid < 1e-6, `half-hour samples lie on the arc between neighbouring epochs (worst ${worstMid.toExponential(1)}°)`);
}

section('direction accuracy against JPL Horizons (fixture)');
{
  const fx = read('tests/fixtures/horizons-topocentric.json');
  let worstEl = 0;
  let worstAz = 0;
  for (const row of fx.rows) {
    const r = regions.find((x) => x.id === row.site);
    const c = siteConditions(r, eph, Date.parse(row.utc))!;
    const b = c[row.body as 'sun' | 'earth'];
    worstEl = Math.max(worstEl, Math.abs(b.elDeg - row.elDeg));
    worstAz = Math.max(worstAz, azDiff(b.azDeg, row.azDeg) * Math.cos((row.elDeg * Math.PI) / 180));
  }
  console.log(`   worst elevation error ${worstEl.toFixed(4)}°, worst azimuth error × cos(el) ${worstAz.toFixed(4)}° over ${fx.rows.length} rows`);
  ok(worstEl < 0.01, 'elevation within 0.01° of Horizons');
  ok(worstAz < 0.01, 'azimuth (× cos el) within 0.01° of Horizons');
}

section('all nine regions: coordinates, horizon coverage, terrain files');
ok(regions.length === 9, 'nine regions');
for (const r of regions) {
  const p = r.observationPoint;
  ok(p.latDeg < -80 && p.latDeg > -90 && Math.abs(p.lonDeg) <= 180, `${r.id}: observation point inside 80–90°S`);
  ok(p.elevationM > -10_000 && p.elevationM < 11_000 && p.observerHeightM === 2, `${r.id}: plausible elevation, 2 m observer`);
  const n = r.nasaRegion;
  const lats = n.corners.map((c: number[]) => c[0]);
  ok(Math.abs(p.latDeg - n.centreLatDeg) < 1 && p.latDeg >= Math.min(...lats) - 0.2 && p.latDeg <= Math.max(...lats) + 0.2, `${r.id}: point lies within the NASA outline's latitude band`);
  const h = r.horizon;
  ok(h.azStepDeg === 0.5 && h.elevationDeg.length === 720, `${r.id}: horizon covers 360° in 720 steps`);
  ok(h.elevationDeg.every((v: number) => Number.isFinite(v) && v > -15 && v < 30), `${r.id}: horizon values finite and plausible`);
  ok(h.maxDistanceKm === 150, `${r.id}: horizon traced to 150 km`);
  for (const t of [r.terrain, r.terrain.far, r.terrain.regional]) {
    const bytes = statSync(`public/${t.file}`).size;
    ok(bytes === t.n * t.n * 4, `${r.id}: ${t.file.split('/').pop()} has ${t.n}×${t.n} float32 samples`);
  }
  const sp = [r.terrain.spacingM, r.terrain.far.spacingM, r.terrain.regional.spacingM];
  ok(sp[0] === 80 && sp[1] === 400 && sp[2] === 1000, `${r.id}: terrain spacing 80 m / 400 m / 1 km`);
}

section('horizon interpolation and crossings');
{
  const h = regions[0].horizon;
  ok(Math.abs(horizonAt(h, 0) - h.elevationDeg[0]) < 1e-12, 'horizon at a sample azimuth equals the sample');
  const mid = horizonAt(h, 0.25);
  ok(Math.abs(mid - (h.elevationDeg[0] + h.elevationDeg[1]) / 2) < 1e-12, 'horizon halfway between samples is their mean');
  ok(Math.abs(horizonAt(h, 359.75) - (h.elevationDeg[719] + h.elevationDeg[0]) / 2) < 1e-12, 'horizon wraps across north (359.75°)');
  ok(Math.abs(horizonAt(h, -0.5) - h.elevationDeg[719]) < 1e-12, 'negative azimuths wrap');
  let checked = 0;
  let crossings = 0;
  for (const r of regions) {
    const s = computeSeries(r, eph, Date.UTC(2027, 0, 1), Date.UTC(2027, 1, 1), 60);
    for (let i = 0; i < s.length; i++) {
      const p = s[i];
      checked++;
      if (p.sunVis !== p.sunEl > p.sunHz || p.earthVis !== p.earthEl > p.earthHz) ok(false, `${r.id}: visibility disagrees with elevation vs horizon at ${new Date(p.t).toISOString()}`);
      if (i && p.sunVis !== s[i - 1].sunVis) {
        crossings++;
        // across a crossing, clearance changes sign
        ok(Math.sign(p.sunEl - p.sunHz) !== Math.sign(s[i - 1].sunEl - s[i - 1].sunHz), `${r.id}: clearance changes sign at a Sun crossing`);
      }
    }
  }
  ok(checked === 9 * (31 * 24 + 1) && crossings > 0, `visibility equals "elevation above horizon" for ${checked} hourly samples (${crossings} Sun crossings)`);
}

section('interval boundaries and lower bounds');
{
  const pt = (t: number, sun: boolean): SeriesPoint => ({ t, sunEl: 0, sunHz: 0, sunAz: 0, earthEl: 0, earthHz: 0, earthAz: 0, sunVis: sun, earthVis: true });
  const mk = (pattern: string) => [...pattern].map((c, i) => pt(i * H, c === '1'));
  const r = runs(mk('0011100'), (p) => p.sunVis, H);
  ok(r.length === 1 && r[0].endMs - r[0].startMs === 3 * H && !r[0].atStart && !r[0].atEnd, 'interior run: 3 samples long, not at an edge');
  const m1 = scenarioMetrics(mk('0001110'), 60)!;
  ok(m1.longestNoSunHours === 3 && m1.noSunTruncated, 'dark run touching the start is a lower bound');
  const m2 = scenarioMetrics(mk('1100011'), 60)!;
  ok(m2.longestNoSunHours === 3 && !m2.noSunTruncated, 'interior dark run is complete');
  const m3 = scenarioMetrics(mk('1100000'), 60)!;
  ok(m3.longestNoSunHours === 5 && m3.noSunTruncated, 'dark run touching the end is a lower bound');
  ok(Math.abs(m2.sunVisiblePct - (400 / 7)) < 1e-9, 'percentage = visible samples / all samples');
  const s15 = computeSeries(regions[2], eph, Date.UTC(2027, 0, 1), Date.UTC(2027, 0, 2) - 15 * 60_000, 15);
  ok(s15.length === 96 && s15.every((p, i) => p.t === Date.UTC(2027, 0, 1) + i * 15 * 60_000), '15-minute series: 96 samples per day at exact steps');
  const clipped = computeSeries(regions[2], eph, Date.UTC(2028, 11, 31, 20), Date.UTC(2029, 0, 2), 60);
  ok(clipped.length === 4 && clipped[3].t === eph.endMs, 'series is clipped at the end of the ephemeris');
}

section('recorded validation summary');
{
  const v = read('public/data/validation.json');
  ok(v.sites.length === 9 && v.sites.every((s: any) => regions.some((r) => r.id === s.id)), 'validation.json covers the nine current regions');
  const worst = Math.max(...v.sites.flatMap((s: any) => [s.sun.maxElevErrDeg, s.earth.maxElevErrDeg, s.sun.maxAzErrDeg, s.earth.maxAzErrDeg]));
  ok(worst < 0.01, `recorded worst direction error ${worst}° < 0.01°`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
