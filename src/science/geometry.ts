import type { Vec3 } from '../data/types';

export const MOON_RADIUS_KM = 1737.4;
export const SUN_RADIUS_KM = 695_700;
export const EARTH_RADIUS_KM = 6_371.0;
export const AU_KM = 149_597_870.7;
export const DEG = Math.PI / 180;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const wrap360 = (a: number) => ((a % 360) + 360) % 360;

/** Unit vector in the Moon-fixed frame for a planetocentric lat/lon (deg, east-positive). */
export function lonLatToVec(latDeg: number, lonDeg: number): Vec3 {
  const la = latDeg * DEG;
  const lo = lonDeg * DEG;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

export function vecToLonLat(v: Vec3): { latDeg: number; lonDeg: number } {
  const n = Math.hypot(v[0], v[1], v[2]);
  return { latDeg: Math.asin(v[2] / n) / DEG, lonDeg: Math.atan2(v[1], v[0]) / DEG };
}

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (a: Vec3): Vec3 => {
  const n = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / n, a[1] / n, a[2] / n];
};

/**
 * Moon-fixed frame → three.js world frame used by every 3D scene.
 * three: +Y = lunar north, +X = (0°N, 0°E), −Z = (0°N, 90°E).
 */
export function meToThree(v: Vec3): [number, number, number] {
  return [v[0], v[2], -v[1]];
}

/** Local east/north/up basis at a surface point. */
export function enuBasis(latDeg: number, lonDeg: number) {
  const la = latDeg * DEG;
  const lo = lonDeg * DEG;
  const up: Vec3 = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const east: Vec3 = [-Math.sin(lo), Math.cos(lo), 0];
  const north: Vec3 = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  return { up, east, north };
}

/**
 * Topocentric azimuth/elevation of a body seen from a surface point.
 * Azimuth: degrees clockwise from local north (direction of the lunar north pole).
 * Elevation: degrees above the local horizontal plane (sphere normal).
 * `distanceKm = Infinity` treats the body as infinitely far (parallax ignored).
 */
export function topocentric(
  latDeg: number,
  lonDeg: number,
  siteRadiusKm: number,
  bodyDir: Vec3,
  distanceKm: number,
): { azDeg: number; elDeg: number } {
  const { up, east, north } = enuBasis(latDeg, lonDeg);
  let v: Vec3;
  if (Number.isFinite(distanceKm)) {
    v = [
      bodyDir[0] * distanceKm - up[0] * siteRadiusKm,
      bodyDir[1] * distanceKm - up[1] * siteRadiusKm,
      bodyDir[2] * distanceKm - up[2] * siteRadiusKm,
    ];
  } else {
    v = bodyDir;
  }
  const n = Math.hypot(v[0], v[1], v[2]);
  const elDeg = Math.asin(clamp(dot(v, up) / n, -1, 1)) / DEG;
  const azDeg = wrap360(Math.atan2(dot(v, east), dot(v, north)) / DEG);
  return { azDeg, elDeg };
}

/** Direction in the local frame (three.js surface scene: +X east, +Y up, −Z north) for az/el. */
export function azElToLocal(azDeg: number, elDeg: number): [number, number, number] {
  const a = azDeg * DEG;
  const e = elDeg * DEG;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)];
}

/**
 * Fraction of a circular disc of angular radius r (deg) lying above a flat skyline,
 * when the disc centre is `margin` degrees above it.
 */
export function discFractionAbove(marginDeg: number, radiusDeg: number): number {
  const d = clamp(marginDeg / radiusDeg, -1, 1);
  return 1 - (Math.acos(d) - d * Math.sqrt(1 - d * d)) / Math.PI;
}
