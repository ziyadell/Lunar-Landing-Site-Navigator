import type { EphemerisFile, EphemerisSample, Vec3 } from '../data/types';
import { AU_KM, lonLatToVec } from './geometry';

/**
 * Time-indexed access to the precomputed JPL Horizons table.
 * Between hourly epochs, sub-point unit vectors are linearly interpolated and
 * re-normalised (the sub-solar point moves ~0.5°/h; the error of this
 * interpolation is far below the DEM-limited horizon accuracy).
 */
export class Ephemeris {
  readonly startMs: number;
  readonly stepMs: number;
  readonly count: number;
  readonly endMs: number;
  private sun: Float64Array;
  private earth: Float64Array;
  private range: Float64Array;

  constructor(readonly file: EphemerisFile) {
    this.startMs = Date.parse(file.startUtc);
    this.stepMs = file.stepSeconds * 1000;
    this.count = file.count;
    this.endMs = this.startMs + (this.count - 1) * this.stepMs;
    this.sun = new Float64Array(this.count * 3);
    this.earth = new Float64Array(this.count * 3);
    this.range = Float64Array.from(file.earthRangeKm);
    for (let i = 0; i < this.count; i++) {
      this.sun.set(lonLatToVec(file.subSolarLatDeg[i], file.subSolarLonDeg[i]), i * 3);
      this.earth.set(lonLatToVec(file.subEarthLatDeg[i], file.subEarthLonDeg[i]), i * 3);
    }
  }

  covers(timeMs: number): boolean {
    return timeMs >= this.startMs && timeMs <= this.endMs;
  }

  clamp(timeMs: number): number {
    return Math.min(this.endMs, Math.max(this.startMs, timeMs));
  }

  private lerpVec(buf: Float64Array, i: number, f: number): Vec3 {
    const a = i * 3;
    const b = Math.min(i + 1, this.count - 1) * 3;
    const x = buf[a] + (buf[b] - buf[a]) * f;
    const y = buf[a + 1] + (buf[b + 1] - buf[a + 1]) * f;
    const z = buf[a + 2] + (buf[b + 2] - buf[a + 2]) * f;
    const n = Math.hypot(x, y, z);
    return [x / n, y / n, z / n];
  }

  /** Returns null outside the precomputed range — never extrapolates. */
  sample(timeMs: number): EphemerisSample | null {
    if (!this.covers(timeMs)) return null;
    const t = (timeMs - this.startMs) / this.stepMs;
    const i = Math.min(Math.floor(t), this.count - 1);
    const f = t - i;
    const r0 = this.range[i];
    const r1 = this.range[Math.min(i + 1, this.count - 1)];
    return {
      timeMs,
      sun: { dir: this.lerpVec(this.sun, i, f), distanceKm: AU_KM },
      earth: { dir: this.lerpVec(this.earth, i, f), distanceKm: r0 + (r1 - r0) * f },
    };
  }
}
