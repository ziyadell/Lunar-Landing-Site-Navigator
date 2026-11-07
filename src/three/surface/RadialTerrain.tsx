import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { LandingRegion } from '../../data/types';
import { regolithNormalMap } from './regolith';

/**
 * One continuous terrain mesh centred on the observer, out to 150 km — the same
 * range used for the horizon calculation, so the rendered skyline is the
 * measured skyline (no silhouette wall).
 *
 * Rings are spaced geometrically (spacing ≈ r·Δθ), giving ~uniform on-screen
 * triangle size from metres to 150 km. Heights are sampled from three LOLA
 * products and cross-faded in overlap bands so there are no seams:
 *    r < 11 km      near tile    80 m   (±12 km)
 *    11–55 km       far tile     400 m  (±60 km; its inner 60 m offset is removed)
 *    > 55 km        regional     1 km   (±150 km, 12×12 block mean)
 * All heights are metres above the observation point's tangent plane
 * (curvature included).
 */

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

export function buildRadialGeometry(region: LandingRegion, tiles: TerrainTiles, azSegments: number) {
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
      if (g !== null && g > -19_000) h = h === null ? g : h + (g - h) * smooth(50_000, 55_000, r);
    }
    return h ?? -20_000;
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
  let k = 1;
  for (let i = 1; i < rings; i++) {
    const rr = radii[i];
    for (let j = 0; j < azSegments; j++) {
      const a = j * dTheta;
      const x = Math.sin(a) * rr;
      const z = -Math.cos(a) * rr;
      pos[k * 3] = x;
      pos[k * 3 + 1] = heightAt(x, z, rr);
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
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('stereo', new THREE.BufferAttribute(stereo, 2));
  g.setIndex(verts > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeVertexNormals();

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
      m += heightAt(xx, zz, Math.hypot(xx, zz));
    }
    m /= 6;
    const c = (m - y) / s;
    const shade = THREE.MathUtils.clamp(1 - 2.0 * c, 0.55, 1.1);
    col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

export interface TerrainAlbedo {
  detail: THREE.Texture;
  detailCenter: [number, number];
  detailHalf: number;
  cap: THREE.Texture;
  capExtent: number;
}

export function RadialTerrain({
  region,
  tiles,
  detail,
  segments,
  albedo,
}: {
  region: LandingRegion;
  tiles: TerrainTiles;
  detail: boolean;
  segments: number;
  /** LROC WAC polar mosaic draped by polar-stereographic coordinate (null = uniform albedo). */
  albedo: TerrainAlbedo | null;
}) {
  const geometry = useMemo(() => buildRadialGeometry(region, tiles, segments), [region, tiles, segments]);
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#a29e97', roughness: 1, metalness: 0, vertexColors: true });
    const patches: ((sh: THREE.WebGLProgramParametersWithUniforms) => void)[] = [];
    if (albedo) {
      // Real albedo from the LROC WAC South Pole Summer Mosaic. Pixels in 2010 shadow carry
      // no albedo, so they fall back to the regional mean; current lighting decides darkness.
      patches.push((sh) => {
        sh.uniforms.albDetail = { value: albedo.detail };
        sh.uniforms.albDetailCenter = { value: new THREE.Vector2(...albedo.detailCenter) };
        sh.uniforms.albDetailHalf = { value: albedo.detailHalf };
        sh.uniforms.albCap = { value: albedo.cap };
        sh.uniforms.albCapExtent = { value: albedo.capExtent };
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', `#include <common>
attribute vec2 stereo;
varying vec2 vStereo;`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>
vStereo = stereo;`);
        sh.fragmentShader = sh.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
             varying vec2 vStereo;
             uniform sampler2D albDetail; uniform vec2 albDetailCenter; uniform float albDetailHalf;
             uniform sampler2D albCap; uniform float albCapExtent;`,
          )
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
             {
               vec2 ud = (vStereo - albDetailCenter) / (2.0 * albDetailHalf) + 0.5;
               vec2 e = min(ud, 1.0 - ud);
               float wd = smoothstep(0.0, 0.03, min(e.x, e.y));
               float L = mix(texture2D(albCap, vStereo / (2.0 * albCapExtent) + 0.5).r, texture2D(albDetail, ud).r, wd);
               float lit = smoothstep(0.012, 0.045, L);
               float a = mix(0.36, L, lit);
               // Compressed response: the 2010 mosaic also carries its own slope shading.
               diffuseColor.rgb *= clamp(pow(a / 0.36, 0.6), 0.6, 1.4);
             }`,
          );
      });
    }
    if (detail) {
      // ILLUSTRATIVE sub-resolution texture (not measured), repeating every 24 m and faded
      // out with distance so it never aliases into moiré bands.
      const tex = regolithNormalMap().clone();
      tex.repeat.set(1 / 24, 1 / 24);
      tex.anisotropy = 16;
      tex.needsUpdate = true;
      m.normalMap = tex;
      m.normalScale.set(0.32, 0.32);
      patches.push((sh) => {
        sh.fragmentShader = sh.fragmentShader.replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
           normal = normalize(mix(normal, nonPerturbedNormal, smoothstep(60.0, 320.0, length(vViewPosition))));`,
        );
      });
    }
    m.onBeforeCompile = (sh) => patches.forEach((f) => f(sh));
    m.customProgramCacheKey = () => `terrain-${detail ? 'd' : ''}${albedo ? 'a' : ''}`;
    return m;
  }, [detail, albedo]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => {
    material.normalMap?.dispose();
    material.dispose();
  }, [material]);
  return <mesh geometry={geometry} material={material} castShadow receiveShadow />;
}
