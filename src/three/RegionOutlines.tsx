import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useData } from '../data/DataContext';
import { useApp } from '../state/store';
import { lonLatToVec, meToThree } from '../science/geometry';

const R_KM = 1737.4;
const stereo = (la: number, lo: number): [number, number] => {
  const rho = 2 * R_KM * Math.tan(Math.PI / 4 + (la * Math.PI) / 360);
  return [rho * Math.sin((lo * Math.PI) / 180), rho * Math.cos((lo * Math.PI) / 180)];
};
const fromStereo = (x: number, y: number) => {
  const rho = Math.hypot(x, y);
  return { lat: (2 * Math.atan(rho / (2 * R_KM)) * 180) / Math.PI - 90, lon: (Math.atan2(x, y) * 180) / Math.PI };
};

/**
 * NASA's official region outlines on the globe (digitised from the agency's map; edges
 * are straight in polar-stereographic coordinates, as drawn on that map). The selected
 * region is lit; the others are faint. They fade in as the camera approaches the pole.
 */
export function RegionOutlines() {
  const { sites } = useData();
  const regionId = useApp((s) => s.regionId);
  const labels = useApp((s) => s.layers.labels);
  const { camera } = useThree();
  const lines = useMemo(
    () =>
      sites.regions.map((r) => {
        const c = r.nasaRegion.corners.map(([la, lo]) => stereo(la, lo));
        const pts: THREE.Vector3[] = [];
        for (let e = 0; e < 4; e++) {
          const [ax, ay] = c[e];
          const [bx, by] = c[(e + 1) % 4];
          for (let k = 0; k < 16; k++) {
            const t = k / 16;
            const { lat, lon } = fromStereo(ax + (bx - ax) * t, ay + (by - ay) * t);
            pts.push(new THREE.Vector3(...meToThree(lonLatToVec(lat, lon))).multiplyScalar(1.00008));
          }
        }
        pts.push(pts[0].clone());
        const mat = new THREE.LineBasicMaterial({ transparent: true, depthWrite: false, color: '#F1F5F9', opacity: 0 });
        return { id: r.id, line: new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat), mat };
      }),
    [sites],
  );
  useEffect(
    () => () =>
      lines.forEach((l) => {
        l.line.geometry.dispose();
        l.mat.dispose();
      }),
    [lines],
  );
  useFrame(() => {
    // Camera distance from the Moon's centre (radii): outlines appear below ~2.6 and are full by ~1.6.
    const d = camera.position.length();
    const k = THREE.MathUtils.clamp((2.6 - d) / 1.0, 0, 1) * (labels ? 1 : 0);
    for (const l of lines) {
      const sel = l.id === regionId;
      l.mat.color.set(sel ? '#4DDCF4' : '#F1F5F9');
      l.mat.opacity = k * (sel ? 0.95 : 0.32);
      l.line.visible = l.mat.opacity > 0.01;
      l.line.renderOrder = sel ? 2 : 1;
    }
  });
  return (
    <group>
      {lines.map((l) => (
        <primitive key={l.id} object={l.line} />
      ))}
    </group>
  );
}
