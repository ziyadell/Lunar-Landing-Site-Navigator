/**
 * Regression checks for network data validation (run: npm run test:data).
 * Covers the production incident of 2026-11-08: a cached four-region sites.json from the
 * previous release reached the nine-region bundle and crashed on nasaRegion.corners.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { DataIncompatible, validateEphemeris, validateSites } from '../src/data/validate';

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`${c ? 'PASS' : 'FAIL'} ${m}`);
  if (!c) fail++;
};
const throwsIncompatible = (f: () => unknown) => {
  try {
    f();
    return false;
  } catch (e) {
    return e instanceof DataIncompatible;
  }
};
const current = JSON.parse(readFileSync('public/data/sites.json', 'utf8'));
const clone = () => JSON.parse(JSON.stringify(current));

// 1. Current release: accepted unchanged.
const cur = validateSites(clone());
ok(cur.sites.regions.length === 9 && cur.dropped.length === 0, 'current nine-region file is accepted with nothing dropped');

// 2. The real legacy four-region file (git main) is rejected, not mixed with this bundle.
let legacy: unknown = null;
try {
  legacy = JSON.parse(execSync('git show 866ee68:public/data/sites.json', { encoding: 'utf8', maxBuffer: 1 << 24 }));
} catch {
  /* history unavailable */
}
if (legacy) ok(throwsIncompatible(() => validateSites(legacy)), 'legacy four-region file (866ee68) is rejected as incompatible');

// 3. One malformed outline: only that overlay is dropped; the region and the others remain.
for (const [label, bad] of [
  ['missing corners', (r: Record<string, any>) => delete r.nasaRegion.corners],
  ['two corners', (r: Record<string, any>) => (r.nasaRegion.corners = r.nasaRegion.corners.slice(0, 2))],
  ['non-numeric corner', (r: Record<string, any>) => (r.nasaRegion.corners[1] = ['x', 3])],
  ['nasaRegion null', (r: Record<string, any>) => (r.nasaRegion = null)],
  ['nasaRegion absent', (r: Record<string, any>) => delete r.nasaRegion],
] as const) {
  const d = clone();
  bad(d.regions[2]);
  const v = validateSites(d);
  ok(
    v.sites.regions.length === 9 && v.sites.regions[2].nasaRegion === undefined && v.sites.regions.filter((r) => r.nasaRegion).length === 8,
    `malformed outline (${label}): overlay omitted for that region only`,
  );
}

// 4. Required scientific data missing or malformed: the dataset is rejected.
for (const [label, bad] of [
  ['observation point latitude', (r: Record<string, any>) => delete r.observationPoint.latDeg],
  ['horizon profile', (r: Record<string, any>) => (r.horizon.elevationDeg = [1, 2, 3])],
  ['terrain file', (r: Record<string, any>) => delete r.terrain.file],
] as const) {
  const d = clone();
  bad(d.regions[0]);
  ok(throwsIncompatible(() => validateSites(d)), `missing required ${label}: dataset rejected`);
}
ok(throwsIncompatible(() => validateSites({ regions: [] })), 'empty region list rejected');
ok(throwsIncompatible(() => validateSites('nonsense')), 'non-object rejected');

// 5. Ephemeris shape.
const eph = JSON.parse(readFileSync('public/data/ephemeris.json', 'utf8'));
ok(!!validateEphemeris(eph), 'current ephemeris accepted');
const e2 = { ...eph, earthRangeKm: eph.earthRangeKm.slice(1) };
ok(throwsIncompatible(() => validateEphemeris(e2)), 'ephemeris with a short series rejected');

process.exit(fail ? 1 : 0);
