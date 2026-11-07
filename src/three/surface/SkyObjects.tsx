import { useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { assetUrl } from '../../data/DataContext';
import { icrfToLocal } from '../../science/moonOrientation';
import { DEG, azElToLocal } from '../../science/geometry';
import type { LandingRegion } from '../../data/types';

const STAR_R = 400_000; // m — behind the 90 km skyline ring
const GRID_R = 380_000;

interface StarsFile {
  stars: [number, number, number, number][];
}

let starsPromise: Promise<StarsFile> | null = null;
export type { StarsFile };
export const loadStars = () =>
  (starsPromise ??= fetch(assetUrl('data/stars.json')).then((r) => {
    if (!r.ok) throw new Error(`stars.json HTTP ${r.status}`);
    return r.json() as Promise<StarsFile>;
  }));

/** Approximate star colour from B−V (blue-white → orange). */
export function bvColor(bv: number): [number, number, number] {
  const t = THREE.MathUtils.clamp((bv + 0.3) / 2.0, 0, 1);
  const c = new THREE.Color().setHSL(0.6 - t * 0.52, 0.25 + 0.35 * Math.abs(t - 0.3), 0.85);
  return [c.r, c.g, c.b];
}

/**
 * Yale Bright Star Catalogue (V < 5.5), rotated from J2000 into the local frame with
 * the IAU Moon rotation model at the selected epoch. Positions are real; sizes are
 * a display mapping of visual magnitude.
 */
export function Stars({ timeMs, latDeg, lonDeg }: { timeMs: number; latDeg: number; lonDeg: number }) {
  const [file, setFile] = useState<StarsFile | null>(null);
  const { invalidate } = useThree();
  useEffect(() => {
    let alive = true;
    loadStars().then((f) => alive && setFile(f)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const { geometry, unit } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    if (!file) return { geometry: g, unit: new Float32Array(0) };
    const n = file.stars.length;
    const unit = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    file.stars.forEach(([ra, dec, v, bv], i) => {
      unit[i * 3] = Math.cos(dec * DEG) * Math.cos(ra * DEG);
      unit[i * 3 + 1] = Math.cos(dec * DEG) * Math.sin(ra * DEG);
      unit[i * 3 + 2] = Math.sin(dec * DEG);
      const [r, gg, b] = bvColor(bv);
      const k = THREE.MathUtils.clamp(1.15 - v * 0.16, 0.25, 1.4);
      col.set([r * k, gg * k, b * k], i * 3);
      size[i] = THREE.MathUtils.clamp(4.2 - v * 0.62, 1.1, 5.5);
    });
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    return { geometry: g, unit };
  }, [file]);

  useEffect(() => {
    if (!unit.length) return;
    const m = icrfToLocal(timeMs, latDeg, lonDeg);
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < unit.length / 3; i++) {
      const x = unit[i * 3], y = unit[i * 3 + 1], z = unit[i * 3 + 2];
      pos.setXYZ(
        i,
        (m[0][0] * x + m[0][1] * y + m[0][2] * z) * STAR_R,
        (m[1][0] * x + m[1][1] * y + m[1][2] * z) * STAR_R,
        (m[2][0] * x + m[2][1] * y + m[2][2] * z) * STAR_R,
      );
    }
    pos.needsUpdate = true;
    geometry.computeBoundingSphere();
    invalidate();
  }, [unit, geometry, timeMs, latDeg, lonDeg, invalidate]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexColors: true,
        uniforms: { dpr: { value: Math.min(window.devicePixelRatio || 1, 2) } },
        vertexShader: /* glsl */ `
          attribute float size;
          uniform float dpr;
          varying vec3 vColor;
          #include <common>
          #include <logdepthbuf_pars_vertex>
          void main() {
            vColor = color;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = size * dpr;
            #include <logdepthbuf_vertex>
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vColor;
          #include <logdepthbuf_pars_fragment>
          void main() {
            #include <logdepthbuf_fragment>
            vec2 p = gl_PointCoord - 0.5;
            float a = 1.0 - smoothstep(0.0, 0.5, length(p));
            gl_FragColor = vec4(vColor, a);
          }`,
      }),
    [],
  );
  useEffect(() => () => {
    geometry.dispose();
  }, [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

/** Altitude circles (every 10°) and azimuth spokes (every 30°) on the sky. */
export function SkyGrid() {
  const geometry = useMemo(() => {
    const pts: number[] = [];
    const seg = (a: [number, number, number], b: [number, number, number]) => pts.push(...a, ...b);
    const p = (az: number, el: number) => azElToLocal(az, el).map((v) => v * GRID_R) as [number, number, number];
    for (const el of [0, 10, 20, 30, 45, 60, 75]) for (let az = 0; az < 360; az += 2) seg(p(az, el), p(az + 2, el));
    for (let az = 0; az < 360; az += 30) for (let el = -2; el < 88; el += 2) seg(p(az, el), p(az, el + 2));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial color="#4DDCF4" transparent opacity={0.16} depthWrite={false} />
    </lineSegments>
  );
}

/**
 * Ground range rings (100 m, 250 m, 500 m, 1 km) draped on the near LOLA tile. From a 2 m
 * eye height, rings beyond ~1 km collapse to within 0.1° of the horizon, so none are drawn there.
 */
export function GroundRings({ region, heights }: { region: LandingRegion; heights: Float32Array }) {
  const { n, spacingM } = region.terrain;
  const geometry = useMemo(() => {
    const half = ((n - 1) / 2) * spacingM;
    const hAt = (x: number, z: number) => {
      const gx = (x + half) / spacingM;
      const gy = (z + half) / spacingM;
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      if (x0 < 0 || y0 < 0 || x0 >= n - 1 || y0 >= n - 1) return 0;
      const fx = gx - x0, fy = gy - y0;
      const a = heights[y0 * n + x0] * (1 - fx) + heights[y0 * n + x0 + 1] * fx;
      const b = heights[(y0 + 1) * n + x0] * (1 - fx) + heights[(y0 + 1) * n + x0 + 1] * fx;
      return a * (1 - fy) + b * fy;
    };
    const pts: number[] = [];
    for (const r of [100, 250, 500, 1000]) {
      const steps = 360;
      for (let i = 0; i < steps; i++) {
        const a0 = (i / steps) * Math.PI * 2;
        const a1 = ((i + 1) / steps) * Math.PI * 2;
        const x0 = Math.sin(a0) * r, z0 = -Math.cos(a0) * r;
        const x1 = Math.sin(a1) * r, z1 = -Math.cos(a1) * r;
        // Small lift only: the eye is 2 m up, so a larger lift would raise the rings to eye level.
        const lift = 0.25 + r * 0.0005;
        pts.push(x0, hAt(x0, z0) + lift, z0, x1, hAt(x1, z1) + lift, z1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [heights, n, spacingM]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#4DDCF4" transparent opacity={0.7} depthWrite={false} />
    </lineSegments>
  );
}

/** Projects the Sun and Earth positions to the DOM labels rendered by ui/SkyLabels. */
export function SkyLabelProjector({ sun, earth }: { sun: [number, number]; earth: [number, number] }) {
  const { camera, size } = useThree();
  useFrame(() => {
    const place = (id: string, az: number, el: number) => {
      const el2 = document.getElementById(id);
      if (!el2) return;
      const v = new THREE.Vector3(...azElToLocal(az, el)).multiplyScalar(STAR_R).add(camera.position);
      const p = v.project(camera);
      const vis = p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05;
      el2.style.visibility = vis ? 'visible' : 'hidden';
      if (vis)
        el2.style.transform = `translate(${((p.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-p.y * 0.5 + 0.5) * size.height).toFixed(1)}px)`;
    };
    place('sky-label-sun', sun[0], sun[1]);
    place('sky-label-earth', earth[0], earth[1]);
  });
  return null;
}
