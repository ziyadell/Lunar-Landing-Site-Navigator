import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { assetUrl } from '../data/release';
import { useData } from '../data/DataContext';
import { useApp } from '../state/store';
import { icrfToMoon } from '../science/moonOrientation';
import { EARTH_RADIUS_KM, MOON_RADIUS_KM, SUN_RADIUS_KM, meToThree } from '../science/geometry';

type Vec3 = [number, number, number];

/**
 * The Sun and the Earth in Orbital View, in their real directions at the selected time
 * (JPL Horizons, the same ephemeris as every reading) and at their true apparent sizes:
 * from the Moon, Earth spans about 1.9° and the Sun about 0.5°.
 *
 * They are drawn just behind the Moon's far side along the true line of sight, scaled to
 * keep their angular size, so the Moon hides them exactly when it should and the camera's
 * depth range stays tight for the lunar surface. The Earth is lit by the scene's sunlight,
 * so it shows its real phase, and turns with Earth's rotation (Earth Rotation Angle, J2000
 * pole) so the side facing the Moon is the real one.
 */

const KM = 1 / MOON_RADIUS_KM; // scene unit = one lunar radius

const apply = (m: number[][], v: Vec3): Vec3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];

/** Earth's body axes in the scene frame: Greenwich meridian, 90° W, north pole. */
function earthBasis(timeMs: number) {
  const d = timeMs / 86_400_000 + 2440587.5 - 2451545.0;
  const era = 2 * Math.PI * ((0.779057273264 + 1.00273781191135448 * d) % 1); // Earth Rotation Angle
  const m = icrfToMoon(timeMs) as unknown as number[][];
  const toScene = (v: Vec3) => new THREE.Vector3(...meToThree(apply(m, v)));
  const greenwich = toScene([Math.cos(era), Math.sin(era), 0]);
  const east90 = toScene([-Math.sin(era), Math.cos(era), 0]);
  const pole = toScene([0, 0, 1]);
  // SphereGeometry: +X = longitude 0, +Y = north, −Z = 90° E (equirectangular map, −180° at u = 0).
  return new THREE.Matrix4().makeBasis(greenwich, pole, east90.negate());
}

const sunMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { core: { value: 0.18 } }, // disc radius as a fraction of the quad half-size
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vUv = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float core;
      varying vec2 vUv;
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        float r = length(vUv);
        if (r > 1.0) discard;
        float x = r / core;                                  // 1.0 at the solar limb
        float disc = 1.0 - smoothstep(0.92, 1.04, x);        // crisp photosphere
        float limb = mix(0.78, 1.0, sqrt(max(0.0, 1.0 - min(x, 1.0) * min(x, 1.0)))); // limb darkening
        float glow = exp(-1.6 * max(0.0, x - 1.0)) * 0.5 + exp(-0.5 * max(0.0, x - 1.0)) * 0.16; // inner corona + wide halo
        glow *= 1.0 - smoothstep(0.75, 1.0, r);               // fade out before the quad edge
        vec3 col = vec3(1.0, 0.97, 0.9) * disc * limb + vec3(1.0, 0.82, 0.55) * glow * (1.0 - disc);
        gl_FragColor = vec4(col, 1.0); // additive: colour already carries the falloff
      }`,
  });

const atmosphereMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    uniforms: { sunDir: { value: new THREE.Vector3(1, 0, 0) } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      varying vec3 vNormal;
      varying vec3 vView;
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        float rim = pow(1.0 - abs(dot(vNormal, vView)), 2.2);
        float lit = smoothstep(-0.25, 0.35, dot(-vNormal, sunDir));
        gl_FragColor = vec4(vec3(0.35, 0.62, 1.0) * rim * lit * 0.9, rim * lit);
      }`,
  });

export function SkyBodies() {
  const { ephemeris } = useData();
  const timeMs = useApp((s) => s.timeMs);
  const sample = ephemeris.sample(timeMs);
  const earthMap = useLoader(THREE.TextureLoader, assetUrl('textures/earth_2k.jpg'));
  useMemo(() => {
    earthMap.colorSpace = THREE.SRGBColorSpace;
    earthMap.anisotropy = 4;
  }, [earthMap]);

  const sunRef = useRef<THREE.Mesh>(null);
  const earthRef = useRef<THREE.Group>(null);
  const sunMat = useMemo(sunMaterial, []);
  const atmoMat = useMemo(atmosphereMaterial, []);
  useEffect(() => () => {
    sunMat.dispose();
    atmoMat.dispose();
  }, [sunMat, atmoMat]);

  const basis = useMemo(() => earthBasis(timeMs), [timeMs]);
  const sunDir = useMemo(() => (sample ? new THREE.Vector3(...meToThree(sample.sun.dir)).normalize() : null), [sample]);
  const earthPos = useMemo(
    () => (sample ? new THREE.Vector3(...meToThree(sample.earth.dir)).normalize().multiplyScalar(sample.earth.distanceKm * KM) : null),
    [sample],
  );
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }) => {
    const cam = camera.position;
    const behind = cam.length() + 1.5; // past the Moon's far side, inside the camera's far plane
    if (sunRef.current && sunDir) {
      const ang = Math.asin(SUN_RADIUS_KM / (sample?.sun.distanceKm ?? 149_597_870.7));
      const s = sunRef.current;
      s.position.copy(cam).addScaledVector(sunDir, behind);
      s.quaternion.copy(camera.quaternion);
      s.scale.setScalar((behind * Math.tan(ang)) / 0.18); // the disc is 18% of the quad
    }
    if (earthRef.current && earthPos) {
      tmp.copy(earthPos).sub(cam);
      const dist = tmp.length();
      const ang = Math.asin(Math.min(1, (EARTH_RADIUS_KM * KM) / dist));
      const e = earthRef.current;
      e.position.copy(cam).addScaledVector(tmp.normalize(), behind);
      e.scale.setScalar(behind * Math.tan(ang));
    }
    if (sunDir) atmoMat.uniforms.sunDir.value.copy(sunDir);
  });

  if (!sample) return null;
  return (
    <>
      <mesh ref={sunRef} material={sunMat} renderOrder={-1} frustumCulled={false}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      <group ref={earthRef}>
        <mesh matrixAutoUpdate={false} matrix={basis} frustumCulled={false}>
          <sphereGeometry args={[1, 96, 64]} />
          <meshStandardMaterial map={earthMap} roughness={0.85} metalness={0} />
        </mesh>
        <mesh material={atmoMat} scale={1.035} frustumCulled={false}>
          <sphereGeometry args={[1, 64, 48]} />
        </mesh>
      </group>
    </>
  );
}
