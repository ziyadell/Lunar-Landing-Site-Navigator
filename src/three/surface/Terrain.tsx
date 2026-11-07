import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { regolithNormalMap } from './regolith';

/**
 * Ambient-occlusion-like shading derived from the DEM itself: cells lower than
 * their surroundings (crater floors, gullies) are darkened, crests slightly
 * brightened. Two scales (≈2 and ≈8 cells). Purely a function of LOLA heights.
 */
function demShading(h: Float32Array, n: number, spacing: number): Float32Array {
  // Summed-area table for fast box means.
  const S = new Float64Array((n + 1) * (n + 1));
  for (let y = 0; y < n; y++) {
    let row = 0;
    for (let x = 0; x < n; x++) {
      row += h[y * n + x];
      S[(y + 1) * (n + 1) + x + 1] = S[y * (n + 1) + x + 1] + row;
    }
  }
  const box = (x: number, y: number, r: number) => {
    const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r);
    const x1 = Math.min(n, x + r + 1), y1 = Math.min(n, y + r + 1);
    const sum = S[y1 * (n + 1) + x1] - S[y0 * (n + 1) + x1] - S[y1 * (n + 1) + x0] + S[y0 * (n + 1) + x0];
    return sum / ((x1 - x0) * (y1 - y0));
  };
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const v = h[y * n + x];
      const c1 = (box(x, y, 2) - v) / (2 * spacing);
      const c2 = (box(x, y, 8) - v) / (8 * spacing);
      out[y * n + x] = THREE.MathUtils.clamp(1 - 2.2 * c1 - 1.6 * c2, 0.5, 1.12);
    }
  return out;
}

export function Terrain({
  heights,
  n,
  spacingM,
  detail,
  detailRepeatM,
}: {
  heights: Float32Array;
  n: number;
  spacingM: number;
  detail: boolean;
  /** Size of one repeat of the illustrative regolith texture, metres. */
  detailRepeatM: number;
}) {
  const size = (n - 1) * spacingM;
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(size, size, n - 1, n - 1);
    g.rotateX(-Math.PI / 2); // XZ plane; row 0 at z = −size/2 (north)
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, heights[i]);
    const shade = demShading(heights, n, spacingM);
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = shade[i];
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }, [heights, n, spacingM, size]);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#a19d96', roughness: 1, metalness: 0, vertexColors: true });
    if (detail) {
      const t = regolithNormalMap().clone();
      t.repeat.set(size / detailRepeatM, size / detailRepeatM);
      t.anisotropy = 16;
      t.needsUpdate = true;
      m.normalMap = t;
      m.normalScale.set(0.55, 0.55);
    }
    return m;
  }, [detail, size, detailRepeatM]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => {
    material.normalMap?.dispose();
    material.dispose();
  }, [material]);

  return <mesh geometry={geometry} material={material} castShadow receiveShadow />;
}
