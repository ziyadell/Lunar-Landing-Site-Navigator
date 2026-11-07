import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import gsap from 'gsap';
import { MoonGlobe, type TextureTier } from './MoonGlobe';
import { useApp } from '../state/store';
import { useData } from '../data/DataContext';
import { lonLatToVec, meToThree } from '../science/geometry';
import type { LandingRegion } from '../data/types';
import { prefersReducedMotion } from '../utils/motion';

const toThree = (latDeg: number, lonDeg: number, r = 1) => {
  const v = meToThree(lonLatToVec(latDeg, lonDeg));
  return new THREE.Vector3(v[0] * r, v[1] * r, v[2] * r);
};

/**
 * Camera poses (all looking at the Moon's centre). Lighting is the real Sun
 * direction at the epoch, so poses lean toward the Sun: the viewer sees the lit
 * side of the south polar region rather than an arbitrary (possibly dark) face.
 */
function sunThree(timeMs: number, eph: ReturnType<typeof useData>['ephemeris']) {
  const s = eph.sample(timeMs);
  return s ? new THREE.Vector3(...meToThree(s.sun.dir)).normalize() : new THREE.Vector3(1, 0, 0);
}
function focusPose(r: LandingRegion, sun: THREE.Vector3) {
  const p = r.observationPoint;
  const up = toThree(p.latDeg, p.lonDeg).normalize();
  const t = sun.clone().sub(up.clone().multiplyScalar(sun.dot(up)));
  if (t.lengthSq() < 1e-6) t.set(0, 1, 0);
  // ~3.5° toward the Sun keeps the region near frame centre (the camera aims at the Moon's centre).
  return { dir: up.add(t.normalize().multiplyScalar(0.06)).normalize(), dist: 1.72 };
}
function globalPose(sun: THREE.Vector3) {
  const flat = new THREE.Vector3(sun.x, 0, sun.z).normalize();
  return { dir: flat.multiplyScalar(0.72).add(new THREE.Vector3(0, -0.69, 0)).normalize(), dist: 3.7 };
}

function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, invalidate } = useThree();
  const { region, ephemeris } = useData();
  const cmd = useApp((s) => s.cameraCommand);
  const regionId = useApp((s) => s.regionId);
  const tween = useRef<gsap.core.Tween | null>(null);
  const first = useRef(true);
  if (import.meta.env.DEV) (window as unknown as { __camera: THREE.Camera }).__camera = camera;

  useEffect(() => {
    const r = region(regionId);
    const sun = sunThree(useApp.getState().timeMs, ephemeris);
    let pose = globalPose(sun);
    if (cmd.kind === 'focus') pose = focusPose(r, sun);
    if (cmd.kind === 'dive') {
      const p = r.observationPoint;
      pose = { dir: toThree(p.latDeg + 3, p.lonDeg).normalize(), dist: 1.035 };
    }
    // Portrait screens: the vertical FOV is fixed, so back off to keep the same horizontal coverage.
    const aspect = (camera as THREE.PerspectiveCamera).aspect || 1;
    if (aspect < 1) pose = { ...pose, dist: 1 + (pose.dist - 1) / Math.max(0.5, aspect) };
    const fromDir = camera.position.clone().normalize();
    const fromDist = camera.position.length();
    const q0 = new THREE.Quaternion();
    const q1 = new THREE.Quaternion().setFromUnitVectors(fromDir, pose.dir);
    const state = { t: 0 };
    tween.current?.kill();
    // Hidden tabs throttle animation frames; jump straight to the pose there.
    const instant = first.current || prefersReducedMotion() || document.visibilityState === 'hidden';
    first.current = false;
    const apply = () => {
      const q = q0.clone().slerp(q1, state.t);
      const d = fromDist + (pose.dist - fromDist) * state.t;
      camera.position.copy(fromDir.clone().applyQuaternion(q).multiplyScalar(d));
      camera.lookAt(0, 0, 0);
      controls.current?.update();
      invalidate();
    };
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      // Only switch if the dive wasn't cancelled by another mode choice;
      // `transitioning` is cleared by the surface scene once it has rendered.
      if (cmd.kind === 'dive' && useApp.getState().transitioning) useApp.setState({ mode: 'surface' });
    };
    if (instant) {
      state.t = 1;
      apply();
      done();
      return;
    }
    tween.current = gsap.to(state, {
      t: 1,
      duration: cmd.kind === 'dive' ? 1.25 : 1.1,
      ease: cmd.kind === 'dive' ? 'power2.in' : 'power3.inOut',
      onUpdate: apply,
      onComplete: done,
    });
    // Animation frames can be throttled (background tab); never leave a dive hanging.
    const fallback = cmd.kind === 'dive' ? window.setTimeout(done, 2500) : 0;
    return () => {
      window.clearTimeout(fallback);
      tween.current?.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmd.seq]);

  // Slower rotation when close to the surface; low inertia.
  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    const d = camera.position.length();
    c.rotateSpeed = THREE.MathUtils.clamp((d - 1) * 0.55, 0.06, 0.9);
    c.zoomSpeed = THREE.MathUtils.clamp((d - 1) * 0.9, 0.25, 1.0);
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.18}
      minDistance={1.035}
      maxDistance={7}
      onStart={() => tween.current?.kill()}
    />
  );
}

function SiteMarkers() {
  const { sites } = useData();
  const regionId = useApp((s) => s.regionId);
  const showLabels = useApp((s) => s.layers.labels);
  const selectRegion = useApp((s) => s.selectRegion);
  const { camera } = useThree();

  const items = useMemo(
    () =>
      sites.regions.map((r) => {
        const p = r.observationPoint;
        const pos = toThree(p.latDeg, p.lonDeg, 1 + (p.elevationM / 1737400) + 0.0003);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), pos.clone().normalize());
        return { r, pos, q };
      }),
    [sites],
  );

  // Labels live in a DOM layer outside the canvas (see ui/GlobeLabels). Each frame
  // we project the marker positions and hide labels on the far hemisphere; from far
  // away only the selected label shows (the regions are within ~6° of the pole).
  const { size } = useThree();
  const markerRefs = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    // Keep markers a near-constant size on screen: scale with altitude.
    const k = THREE.MathUtils.clamp((camera.position.length() - 1) / 0.72, 0.04, 1.6);
    markerRefs.current.forEach((g) => g?.scale.setScalar(k));
    const far = camera.position.length() > 2.4;
    const cam = camera.position.clone().normalize();
    items.forEach((it) => {
      const el = document.getElementById(`globe-label-${it.r.id}`);
      if (!el) return;
      const visible =
        showLabels && it.pos.clone().normalize().dot(cam) > 0.12 && (!far || it.r.id === regionId);
      const p = it.pos.clone().project(camera);
      const x = (p.x * 0.5 + 0.5) * size.width;
      const y = (-p.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      el.style.opacity = visible ? '1' : '0';
      el.style.visibility = visible ? 'visible' : 'hidden';
    });
  });

  return (
    <group>
      {items.map((it, idx) => {
        const selected = it.r.id === regionId;
        return (
          <group
            key={it.r.id}
            position={it.pos}
            quaternion={it.q}
            ref={(g) => {
              markerRefs.current[idx] = g;
            }}
          >
            <mesh
              onClick={(e) => {
                e.stopPropagation();
                selectRegion(it.r.id);
              }}
              onPointerOver={() => (document.body.style.cursor = 'pointer')}
              onPointerOut={() => (document.body.style.cursor = '')}
            >
              <ringGeometry args={[selected ? 0.0075 : 0.0055, selected ? 0.0098 : 0.0072, 48]} />
              <meshBasicMaterial
                color={selected ? '#4DDCF4' : '#F1F5F9'}
                transparent
                opacity={selected ? 1 : 0.75}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
            <mesh>
              <circleGeometry args={[0.0018, 16]} />
              <meshBasicMaterial color={selected ? '#4DDCF4' : '#F1F5F9'} side={THREE.DoubleSide} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

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
    const o = toThree(p.latDeg, p.lonDeg, 1.001);
    const mk = (dir: [number, number, number]) => {
      const d = new THREE.Vector3(...meToThree(dir)).normalize();
      return new THREE.BufferGeometry().setFromPoints([o, o.clone().add(d.multiplyScalar(0.16))]);
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
  if (!geo) return null;
  return (
    <group>
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
      <ambientLight intensity={0.035} color="#b8c4d8" />
      <SunLight />
      <Suspense fallback={null}>
        <MoonGlobe tier={tier} />
        <SiteMarkers />
        <BodyVectors />
      </Suspense>
      <CameraRig />
    </>
  );
}
