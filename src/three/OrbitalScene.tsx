import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MoonGlobe, type TextureTier } from './MoonGlobe';
import { GlobeCamera } from './GlobeCamera';
import { MarkerProjector } from './MarkerProjector';
import { OrbitalStars } from './OrbitalStars';
import { DrawerFrame } from './DrawerFrame';
import { RegionOutlines } from './RegionOutlines';
import { useApp } from '../state/store';
import { useData } from '../data/DataContext';
import { lonLatToVec, meToThree } from '../science/geometry';

const toThree = (latDeg: number, lonDeg: number, r = 1) => {
  const v = meToThree(lonLatToVec(latDeg, lonDeg));
  return new THREE.Vector3(v[0] * r, v[1] * r, v[2] * r);
};

/** Short direction rays from the selected observation point toward the Sun and Earth. */
function BodyVectors() {
  const { region, ephemeris } = useData();
  const regionId = useApp((s) => s.regionId);
  const timeMs = useApp((s) => s.timeMs);
  const layers = useApp((s) => s.layers);
  const r = region(regionId);
  const sample = ephemeris.sample(timeMs);
  const geo = useMemo(() => {
    if (!sample) return null;
    const p = r.observationPoint;
    const mk = (dir: [number, number, number]) => {
      const d = new THREE.Vector3(...meToThree(dir)).normalize();
      return new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), d.multiplyScalar(0.16)]);
    };
    const earthVec: [number, number, number] = [
      sample.earth.dir[0] * sample.earth.distanceKm / 1737.4 - Math.cos(p.latDeg * Math.PI / 180) * Math.cos(p.lonDeg * Math.PI / 180),
      sample.earth.dir[1] * sample.earth.distanceKm / 1737.4 - Math.cos(p.latDeg * Math.PI / 180) * Math.sin(p.lonDeg * Math.PI / 180),
      sample.earth.dir[2] * sample.earth.distanceKm / 1737.4 - Math.sin(p.latDeg * Math.PI / 180),
    ];
    return { sun: mk(sample.sun.dir), earth: mk(earthVec) };
  }, [sample, r]);
  useEffect(() => () => {
    geo?.sun.dispose();
    geo?.earth.dispose();
  }, [geo]);
  // Anchored at the observation point; length scales with camera distance so the
  // rays stay readable from orbit and do not swamp close views.
  const grp = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const anchor = useMemo(() => {
    const p = r.observationPoint;
    return toThree(p.latDeg, p.lonDeg, 1 + p.elevationM / 1_737_400 + 0.0002);
  }, [r]);
  useFrame(() => {
    const d = camera.position.distanceTo(anchor);
    grp.current?.scale.setScalar(THREE.MathUtils.clamp(d * 0.45, 0.004, 1));
  });
  if (!geo) return null;
  return (
    <group ref={grp} position={anchor}>
      {layers.sunVector && (
        <lineSegments geometry={geo.sun}>
          <lineBasicMaterial color="#FFCA68" transparent opacity={0.95} />
        </lineSegments>
      )}
      {layers.earthVector && (
        <lineSegments geometry={geo.earth}>
          <lineBasicMaterial color="#4DDCF4" transparent opacity={0.95} />
        </lineSegments>
      )}
    </group>
  );
}

/** frameloop="demand": re-render when app state that affects the globe changes. */
function InvalidateOnState() {
  const { invalidate, scene, camera } = useThree();
  if (import.meta.env.DEV) Object.assign(window as object, { __scene: scene, __cam: camera });
  useEffect(() => useApp.subscribe(() => invalidate()), [invalidate]);
  return null;
}

function SunLight() {
  const { ephemeris } = useData();
  const timeMs = useApp((s) => s.timeMs);
  const s = ephemeris.sample(timeMs);
  const dir = s ? meToThree(s.sun.dir) : ([1, 0, 0] as const);
  return <directionalLight position={[dir[0] * 10, dir[1] * 10, dir[2] * 10]} intensity={3.1} color="#fffaf2" />;
}

export function OrbitalScene({ tier }: { tier: TextureTier }) {
  return (
    <>
      <color attach="background" args={['#05080F']} />
      <OrbitalStars />
      <ambientLight intensity={0.035} color="#b8c4d8" />
      <SunLight />
      <Suspense fallback={null}>
        <MoonGlobe tier={tier} />
        <BodyVectors />
        <RegionOutlines />
      </Suspense>
      <GlobeCamera />
      <MarkerProjector />
      <InvalidateOnState />
      <DrawerFrame />
    </>
  );
}
