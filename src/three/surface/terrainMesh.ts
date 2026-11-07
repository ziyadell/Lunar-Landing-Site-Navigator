/**
 * Surface View terrain mesh, as plain typed arrays (no three.js), so it can be built in a
 * Web Worker off the main thread. Same LOLA sampling as before; see RadialTerrain.tsx.
 */
import type { LandingRegion } from '../../data/types';

export type TerrainRegion = Pick<LandingRegion, 'terrain' | 'observationPoint'>;

export interface TerrainMesh {
  position: Float32Array;
  uv: Float32Array;
  stereo: Float32Array;
  color: Float32Array;
  normal: Float32Array;
  index: Uint32Array;
  radius: number;
}

/** Area-weighted vertex normals (same result as BufferGeometry.computeVertexNormals). */
function vertexNormals(pos: Float32Array, index: Uint32Array) {
  const n = new Float32Array(pos.length);
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i] * 3, b = index[i + 1] * 3, c = index[i + 2] * 3;
    const abx = pos[b] - pos[a], aby = pos[b + 1] - pos[a + 1], abz = pos[b + 2] - pos[a + 2];
    const acx = pos[c] - pos[a], acy = pos[c + 1] - pos[a + 1], acz = pos[c + 2] - pos[a + 2];
    // cb × ab as in three.js (cross of (c-b) and (a-b)) gives the same orientation as ab × ac.
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    for (const k of [a, b, c]) {
      n[k] += nx;
      n[k + 1] += ny;
      n[k + 2] += nz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l;
    n[i + 1] /= l;
    n[i + 2] /= l;
  }
  return n;
}

export interface TerrainTiles {
  near: Float32Array;
  far: Float32Array | null;
  regional: Float32Array | null;
}

function sampler(h: Float32Array, n: number, spacing: number) {
  const half = ((n - 1) / 2) * spacing;
  return (x: number, z: number): number | null => {
    const gx = (x + half) / spacing;
    const gy = (z + half) / spacing;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    if (x0 < 0 || y0 < 0 || x0 >= n - 1 || y0 >= n - 1) return null;
    const fx = gx - x0, fy = gy - y0;
    const c00 = h[y0 * n + x0], c01 = h[y0 * n + x0 + 1], c10 = h[(y0 + 1) * n + x0], c11 = h[(y0 + 1) * n + x0 + 1];
    // No-data (NaN or the -20 km sentinel) anywhere in the cell: no measurement here.
    if (!(c00 > -19_000 && c01 > -19_000 && c10 > -19_000 && c11 > -19_000)) return null;
    const a = h[y0 * n + x0] * (1 - fx) + h[y0 * n + x0 + 1] * fx;
    const b = h[(y0 + 1) * n + x0] * (1 - fx) + h[(y0 + 1) * n + x0 + 1] * fx;
    return a * (1 - fy) + b * fy;
  };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const R_KM = 1737.4;
const D2R = Math.PI / 180;
/** South-polar stereographic km for a point `distM` metres from the site along bearing `az` (rad). */
function stereoAt(lat0: number, lon0: number, az: number, distM: number): [number, number] {
  const d = distM / 1000 / R_KM;
  const la1 = lat0 * D2R, lo1 = lon0 * D2R;
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(az));
  const lo2 = lo1 + Math.atan2(Math.sin(az) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  const rho = 2 * R_KM * Math.tan(Math.PI / 4 + la2 / 2);
  return [rho * Math.sin(lo2), rho * Math.cos(lo2)];
}

export function buildRadialMesh(region: TerrainRegion, tiles: TerrainTiles, azSegments: number): TerrainMesh {
  const t = region.terrain;
  const near = sampler(tiles.near, t.n, t.spacingM);
  const farMeta = t.far;
  const farRaw = tiles.far && farMeta ? sampler(tiles.far, farMeta.n, farMeta.spacingM) : null;
  // The far tile was lowered 60 m inside the near tile's footprint (to avoid z-fighting
  // in the old two-mesh scene); undo that so both products agree.
  const innerFar = ((t.n - 1) / 2) * t.spacingM - (farMeta?.spacingM ?? 400);
  const far = farRaw
    ? (x: number, z: number) => {
        const v = farRaw(x, z);
        if (v === null) return null;
        return Math.abs(x) < innerFar && Math.abs(z) < innerFar ? v + 60 : v;
      }
    : null;
  const regMeta = t.regional;
  const reg = tiles.regional && regMeta ? sampler(tiles.regional, regMeta.n, regMeta.spacingM) : null;

  const heightAt = (x: number, z: number, r: number) => {
    let h = near(x, z);
    if (far && r > 10_000) {
      const f = far(x, z);
      if (f !== null) h = h === null ? f : h + (f - h) * smooth(10_000, 11_000, r);
    }
    if (reg && r > 50_000) {
      const g = reg(x, z);
      if (g !== null) h = h === null ? g : h + (g - h) * smooth(50_000, 55_000, r);
    }
    return h;
  };

  const dTheta = (2 * Math.PI) / azSegments;
  const radii: number[] = [0];
  let r = 6;
  const R_MAX = 150_000;
  while (r < R_MAX) {
    radii.push(r);
    r = Math.max(r + 4, r * (1 + dTheta * 1.15));
  }
  radii.push(R_MAX);

  const rings = radii.length;
  const verts = 1 + (rings - 1) * azSegments;
  const pos = new Float32Array(verts * 3);
  const uv = new Float32Array(verts * 2);
  const stereo = new Float32Array(verts * 2);
  const op = region.observationPoint;
  const s0 = stereoAt(op.latDeg, op.lonDeg, 0, 0);
  stereo[0] = s0[0];
  stereo[1] = s0[1];
  pos[1] = 0;
  // Beyond LOLA coverage (outside 80°S) there is no measured relief: the mesh continues
  // from the last measured height as a smooth sphere (curvature drop only), never invented terrain.
  const lastH = new Float64Array(azSegments);
  const lastR = new Float64Array(azSegments);
  const R_M = R_KM * 1000;
  let k = 1;
  for (let i = 1; i < rings; i++) {
    const rr = radii[i];
    for (let j = 0; j < azSegments; j++) {
      const a = j * dTheta;
      const x = Math.sin(a) * rr;
      const z = -Math.cos(a) * rr;
      let hv = heightAt(x, z, rr);
      if (hv === null) hv = lastH[j] - (rr * rr - lastR[j] * lastR[j]) / (2 * R_M);
      else {
        lastH[j] = hv;
        lastR[j] = rr;
      }
      pos[k * 3] = x;
      pos[k * 3 + 1] = hv;
      pos[k * 3 + 2] = z;
      uv[k * 2] = x;
      uv[k * 2 + 1] = z;
      const st = stereoAt(op.latDeg, op.lonDeg, a, rr);
      stereo[k * 2] = st[0];
      stereo[k * 2 + 1] = st[1];
      k++;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < azSegments; j++) idx.push(0, 1 + ((j + 1) % azSegments), 1 + j);
  for (let i = 1; i < rings - 1; i++) {
    const a0 = 1 + (i - 1) * azSegments;
    const b0 = 1 + i * azSegments;
    for (let j = 0; j < azSegments; j++) {
      const j1 = (j + 1) % azSegments;
      idx.push(a0 + j, a0 + j1, b0 + j, a0 + j1, b0 + j1, b0 + j);
    }
  }
  const index = new Uint32Array(idx);
  const normal = vertexNormals(pos, index);

  // DEM-derived occlusion shading: compare each vertex with the mean height of a ring of
  // samples at ~3× the local mesh spacing (darker in hollows, slightly brighter on crests).
  const col = new Float32Array(verts * 3);
  col[0] = col[1] = col[2] = 1;
  for (let v = 1; v < verts; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const rr = Math.hypot(x, z);
    const s = Math.max(160, rr * dTheta * 3);
    let m = 0;
    for (let q = 0; q < 6; q++) {
      const a = (q / 6) * Math.PI * 2;
      const xx = x + Math.cos(a) * s, zz = z + Math.sin(a) * s;
      m += heightAt(xx, zz, Math.hypot(xx, zz)) ?? y;
    }
    m /= 6;
    const c = (m - y) / s;
    const shade = Math.min(1.1, Math.max(0.55, 1 - 2.0 * c));
    col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = shade;
  }
  let r2 = 0;
  for (let v = 0; v < verts; v++) r2 = Math.max(r2, pos[v * 3] ** 2 + pos[v * 3 + 1] ** 2 + pos[v * 3 + 2] ** 2);
  return { position: pos, uv, stereo, color: col, normal, index, radius: Math.sqrt(r2) };
}
