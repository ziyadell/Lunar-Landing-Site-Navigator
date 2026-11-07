import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { bvColor, loadStars, type StarsFile } from './surface/SkyObjects';
import { icrfToMoon } from '../science/moonOrientation';
import { DEG, meToThree } from '../science/geometry';
import { useApp } from '../state/store';

/**
 * Background sky for Orbital View: the same Yale Bright Star Catalogue (V < 5.5) used in
 * Surface View, rotated from J2000 into the Moon-fixed frame with the IAU model at the
 * selected time, so the constellations behind the Moon are the real ones.
 *
 * Restrained: drawn at infinity (no parallax), small points, and no brighter than the
 * sunlit Moon. Brightness is a display mapping for legibility on screens.
 */
export function OrbitalStars() {
  const [file, setFile] = useState<StarsFile | null>(null);
  const { invalidate } = useThree();
  // Re-orient once per (UTC) day: the sky turns 13° a day relative to the Moon-fixed frame;
  // finer steps would only cost work.
  const day = useApp((s) => Math.floor(s.timeMs / 86_400_000));
  useEffect(() => {
    let alive = true;
    loadStars()
      .then((f) => alive && setFile(f))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    if (!file) return g;
    const m = icrfToMoon(day * 86_400_000 + 43_200_000);
    const n = file.stars.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    file.stars.forEach(([ra, dec, v, bv], i) => {
      const x = Math.cos(dec * DEG) * Math.cos(ra * DEG);
      const y = Math.cos(dec * DEG) * Math.sin(ra * DEG);
      const z = Math.sin(dec * DEG);
      const me: [number, number, number] = [
        m[0][0] * x + m[0][1] * y + m[0][2] * z,
        m[1][0] * x + m[1][1] * y + m[1][2] * z,
        m[2][0] * x + m[2][1] * y + m[2][2] * z,
      ];
      pos.set(meToThree(me), i * 3);
      const [r, gg, b] = bvColor(bv);
      // Compressed Pogson falloff (a display mapping, not a naked-eye claim):
      // V=0 → 1.0, V=3 → 0.63, V=5.5 → 0.40. Catalogue order and positions are unchanged.
      const k = THREE.MathUtils.clamp(1.1 * Math.pow(10, -0.08 * v), 0.4, 1.0);
      col.set([r * k, gg * k, b * k], i * 3);
      size[i] = THREE.MathUtils.clamp(3.4 - v * 0.3, 1.9, 3.6);
    });
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    return g;
  }, [file, day]);
  useEffect(() => {
    invalidate();
    return () => geometry.dispose();
  }, [geometry, invalidate]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending, // light adds to the black sky; no double alpha falloff
        vertexColors: true,
        toneMapped: false,
        uniforms: { dpr: { value: Math.min(window.devicePixelRatio || 1, 2) } },
        vertexShader: /* glsl */ `
          attribute float size;
          uniform float dpr;
          varying vec3 vColor;
          void main() {
            vColor = color;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * dpr;
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vColor;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            // Small, crisp disc with a soft edge (no halo, no bloom, no twinkle).
            float a = 1.0 - smoothstep(0.2, 0.5, d);
            gl_FragColor = vec4(vColor * a, 1.0);
          }`,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  // Point sizes follow the canvas's actual pixel ratio (it is capped by the quality setting).
  const { gl } = useThree();
  useEffect(() => {
    material.uniforms.dpr.value = gl.getPixelRatio();
    invalidate();
  }, [gl, material, invalidate]);
  // A unit sphere of directions that travels with the camera (no parallax), scaled to just
  // inside the far plane, which the globe camera keeps behind the Moon.
  const grp = useRef<THREE.Group>(null);
  const { camera } = useThree();
  useFrame(() => {
    const g = grp.current;
    if (!g) return;
    g.position.copy(camera.position);
    g.scale.setScalar((camera as THREE.PerspectiveCamera).far * 0.92);
  }, -2);
  return (
    <group ref={grp}>
      <points geometry={geometry} material={material} frustumCulled={false} renderOrder={-1} />
    </group>
  );
}
