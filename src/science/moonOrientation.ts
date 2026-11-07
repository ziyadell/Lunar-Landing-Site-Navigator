import type { Vec3 } from '../data/types';
import { DEG, enuBasis } from './geometry';

/**
 * IAU 2009 rotation model for the Moon (Archinal et al. 2011, Celest. Mech. Dyn. Astr. 109).
 * Gives the orientation of the Moon-fixed frame relative to ICRF/J2000.
 * Validated in preprocess/build_stars.py against JPL Horizons (Sun direction):
 * max difference 0.008° over 2026–2028.
 */
const TT_MINUS_UTC_S = 69.184; // 37 leap seconds + 32.184 s (TDB ≈ TT to < 2 ms)

export function iauMoon(timeMsUtc: number) {
  const d = (timeMsUtc / 1000 + TT_MINUS_UTC_S) / 86400 + 2440587.5 - 2451545.0;
  const T = d / 36525;
  const E = [
    0,
    125.045 - 0.0529921 * d,
    250.089 - 0.1059842 * d,
    260.008 + 13.0120009 * d,
    176.625 + 13.3407154 * d,
    357.529 + 0.9856003 * d,
    311.589 + 26.4057084 * d,
    134.963 + 13.064993 * d,
    276.617 + 0.3287146 * d,
    34.226 + 1.7484877 * d,
    15.134 - 0.1589763 * d,
    119.743 + 0.0036096 * d,
    239.961 + 0.1643573 * d,
    25.053 + 12.9590088 * d,
  ];
  const s = (i: number) => Math.sin(E[i] * DEG);
  const c = (i: number) => Math.cos(E[i] * DEG);
  const a0 = 269.9949 + 0.0031 * T - 3.8787 * s(1) - 0.1204 * s(2) + 0.07 * s(3) - 0.0172 * s(4) + 0.0072 * s(6) - 0.0052 * s(10) + 0.0043 * s(13);
  const d0 = 66.5392 + 0.013 * T + 1.5419 * c(1) + 0.0239 * c(2) - 0.0278 * c(3) + 0.0068 * c(4) - 0.0029 * c(6) + 0.0009 * c(7) + 0.0008 * c(10) - 0.0009 * c(13);
  const W =
    38.3213 + 13.17635815 * d - 1.4e-12 * d * d + 3.561 * s(1) + 0.1208 * s(2) - 0.0642 * s(3) + 0.0158 * s(4) + 0.0252 * s(5) -
    0.0066 * s(6) - 0.0047 * s(7) - 0.0046 * s(8) + 0.0028 * s(9) + 0.0052 * s(10) + 0.004 * s(11) + 0.0019 * s(12) - 0.0044 * s(13);
  return { a0, d0, W };
}

type M3 = number[][];
const mul = (a: M3, b: M3): M3 => a.map((r) => [0, 1, 2].map((j) => r[0] * b[0][j] + r[1] * b[1][j] + r[2] * b[2][j]));
const rz = (deg: number): M3 => {
  const a = deg * DEG;
  return [[Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
};
const rx = (deg: number): M3 => {
  const a = deg * DEG;
  return [[1, 0, 0], [0, Math.cos(a), Math.sin(a)], [0, -Math.sin(a), Math.cos(a)]];
};

/** Matrix taking a J2000 unit vector to the Moon-fixed frame. */
export function icrfToMoon(timeMsUtc: number): M3 {
  const { a0, d0, W } = iauMoon(timeMsUtc);
  return mul(rz(W), mul(rx(90 - d0), rz(90 + a0)));
}

/**
 * Matrix taking a J2000 unit vector to the local Surface View frame at a site
 * (+x east, +y up, −z north).
 */
export function icrfToLocal(timeMsUtc: number, latDeg: number, lonDeg: number): M3 {
  const m = icrfToMoon(timeMsUtc);
  const { up, east, north } = enuBasis(latDeg, lonDeg);
  const row = (v: Vec3) => [0, 1, 2].map((j) => v[0] * m[0][j] + v[1] * m[1][j] + v[2] * m[2][j]);
  const n = row(north);
  return [row(east), row(up), [-n[0], -n[1], -n[2]]];
}
