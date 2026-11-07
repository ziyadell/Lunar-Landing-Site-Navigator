import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { loadTerrain, useData } from '../data/DataContext';
import { useConditions } from '../data/useConditions';
import { useApp, useLook } from '../state/store';
import { azElToLocal, DEG } from '../science/geometry';
import type { LandingRegion } from '../data/types';
import { RadialTerrain, type TerrainAlbedo, type TerrainTiles } from './surface/RadialTerrain';
import { assetUrl } from '../data/DataContext';
import { GroundRings, SkyGrid, SkyLabelProjector, Stars } from './surface/SkyObjects';
import { DrawerFrame } from './DrawerFrame';

/**
 * Local scene frame: 1 unit = 1 m. +X east, +Y up, −Z north (local north = toward
 * the lunar north pole). The observer stands at the origin, eye at observerHeightM.
 */

const BODY_DIST = 300_000; // m — beyond the 150 km terrain

/** LROC WAC polar mosaic textures for the terrain drape (site window at 100 m + polar cap). */
function useAlbedo(region: LandingRegion, enabled: boolean): TerrainAlbedo | null {
  const { sites } = useData();
  const [alb, setAlb] = useState<{ id: string; a: TerrainAlbedo } | null>(null);
  useEffect(() => {
    const d = region.detail;
    const capUrl = sites.polarImagery?.cap.standard;
    if (!enabled || !d || !capUrl) return;
    let alive = true;
    const load = (u: string) =>
      new Promise<THREE.Texture>((res, rej) =>
        new THREE.TextureLoader().load(assetUrl(u), (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 8;
          t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
          res(t);
        }, undefined, rej),
      );
    Promise.all([load(d.imagery), load(capUrl)])
      .then(([detail, cap]) => {
        if (!alive) {
          detail.dispose();
          cap.dispose();
          return;
        }
        setAlb((prev) => {
          prev?.a.detail.dispose();
          prev?.a.cap.dispose();
          return { id: region.id, a: { detail, detailCenter: d.centerKm, detailHalf: d.halfExtentKm, cap, capExtent: sites.polarImagery!.cap.extentKm } };
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [region, enabled, sites]);
  return enabled && alb?.id === region.id ? alb.a : null;
}

function useTerrain(region: LandingRegion) {
  const [data, setData] = useState<{ id: string; tiles: TerrainTiles } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setError(null);
    const opt = (f?: { file: string }) => (f ? loadTerrain(f.file).catch(() => null) : Promise.resolve(null));
    Promise.all([loadTerrain(region.terrain.file), opt(region.terrain.far), opt(region.terrain.regional)])
      .then(([near, far, regional]) => alive && setData({ id: region.id, tiles: { near, far, regional } }))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [region]);
  return { tiles: data?.id === region.id ? data.tiles : null, error };
}

/**
 * The ray-traced LOLA skyline (150 km), drawn as a thin annotation line on a far
 * sphere. The terrain mesh itself reaches the same 150 km, so the rendered
 * horizon and this line coincide; the line makes the computed values visible.
 */
function SkylineLine({ region }: { region: LandingRegion }) {
  const eye = region.observationPoint.observerHeightM;
  const line = useMemo(() => {
    const prof = region.horizon.elevationDeg;
    const k = prof.length;
    const R = 200_000;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= k; i++) {
      const az = (i % k) * region.horizon.azStepDeg * DEG;
      const el = prof[i % k] * DEG;
      pts.push(new THREE.Vector3(Math.sin(az) * Math.cos(el) * R, eye + Math.sin(el) * R, -Math.cos(az) * Math.cos(el) * R));
    }
    return new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: '#4DDCF4', transparent: true, opacity: 0.75, depthTest: false }),
    );
  }, [region, eye]);
  useEffect(() => () => {
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
  }, [line]);
  return <primitive object={line} />;
}

/**
 * Earth as seen from the Moon: a 1.9° disc lit by the Sun at the true phase angle.
 * No surface geography is drawn (the app does not model Earth's rotation), only what
 * holds for any epoch: a bright blue-white sunlit side with limb darkening, a soft
 * terminator, a thin atmospheric rim, and a dark night side.
 */
const earthMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: new THREE.Vector3(1, 0, 0) } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      varying vec3 vN;
      varying vec3 vV;
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vN);
        float mu = clamp(dot(n, normalize(vV)), 0.0, 1.0);
        float d = dot(n, normalize(sunDir));
        float lit = smoothstep(-0.06, 0.18, d);
        vec3 day = mix(vec3(0.30, 0.50, 0.82), vec3(0.86, 0.91, 0.98), 0.38) * (0.55 + 0.45 * pow(mu, 0.45));
        float rim = pow(1.0 - mu, 3.0) * smoothstep(-0.1, 0.3, d);
        vec3 col = mix(vec3(0.012, 0.016, 0.026), day * 1.35, lit) + vec3(0.35, 0.6, 1.0) * rim * 0.9;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });

const glows: Record<string, THREE.Texture> = {};
/** Radial falloff sprite. `core` = relative size of the bright centre. */
function glowTexture(core = 0.12) {
  const key = core.toFixed(3);
  if (glows[key]) return glows[key];
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(core, 'rgba(255,255,255,0.35)');
  grd.addColorStop(Math.min(0.9, core * 3.2), 'rgba(255,255,255,0.06)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  glows[key] = t;
  return t;
}

/**
 * Sun and Earth at their true directions and angular sizes (Sun 0.53°, Earth ≈1.9°).
 * A restrained glow is added around each so they read as bodies at any field of view;
 * the glows are depth-tested, so terrain hides them exactly where it hides the body.
 */
function SkyBodies() {
  const { conditions } = useConditions();
  const earthMat = useMemo(earthMaterial, []);
  useEffect(() => () => earthMat.dispose(), [earthMat]);
  if (!conditions) return null;
  const s = azElToLocal(conditions.sun.azDeg, conditions.sun.elDeg);
  const e = azElToLocal(conditions.earth.azDeg, conditions.earth.elDeg);
  earthMat.uniforms.sunDir.value.set(s[0], s[1], s[2]);
  const sunR = BODY_DIST * Math.tan(0.2666 * DEG);
  const earthR = BODY_DIST * Math.tan(0.95 * DEG);
  const at = (v: number[], k = 1) => [v[0] * BODY_DIST * k, v[1] * BODY_DIST * k, v[2] * BODY_DIST * k] as [number, number, number];
  return (
    <group>
      <mesh position={at(s)}>
        <sphereGeometry args={[sunR, 32, 16]} />
        <meshBasicMaterial color="#fffaf0" toneMapped={false} />
      </mesh>
      {/* Inner halo (scattered light in optics / the eye), then a faint wide corona. */}
      <sprite position={at(s, 0.998)} scale={[sunR * 5, sunR * 5, 1]}>
        <spriteMaterial map={glowTexture(0.2)} color="#fff1cf" transparent opacity={0.85} depthWrite={false} toneMapped={false} />
      </sprite>
      <sprite position={at(s, 0.997)} scale={[sunR * 26, sunR * 26, 1]}>
        <spriteMaterial map={glowTexture(0.04)} color="#FFCA68" transparent opacity={0.32} depthWrite={false} toneMapped={false} />
      </sprite>
      <mesh position={at(e)} material={earthMat}>
        <sphereGeometry args={[earthR, 64, 32]} />
      </mesh>
      <sprite position={at(e, 1.002)} scale={[earthR * 4.2, earthR * 4.2, 1]}>
        <spriteMaterial map={glowTexture(0.24)} color="#7fb4ff" transparent opacity={0.16} depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  );
}

function SunLight({ mapSize }: { mapSize: number }) {
  const { conditions } = useConditions();
  const light = useRef<THREE.DirectionalLight>(null);
  const { scene } = useThree();
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    scene.add(l.target);
    // Cast shadows within ±80 km (~39 m per texel at 4096²); beyond that terrain is shaded but casts no shadows.
    const cam = l.shadow.camera as THREE.OrthographicCamera;
    cam.left = cam.bottom = -80_000;
    cam.right = cam.top = 80_000;
    cam.near = 1_000;
    cam.far = 400_000;
    cam.updateProjectionMatrix();
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 40;
    return () => {
      scene.remove(l.target);
    };
  }, [scene]);
  if (!conditions) return null;
  const s = azElToLocal(conditions.sun.azDeg, conditions.sun.elDeg);
  // Only 120 km of terrain is in the scene; when the Sun is hidden by more distant
  // terrain the observer is in shadow, so direct light scales with the visible
  // fraction of the solar disc at the observation point.
  const k = conditions.sun.discFraction;
  return (
    <directionalLight
      ref={light}
      position={[s[0] * 200_000, Math.max(s[1], -0.2) * 200_000, s[2] * 200_000]}
      intensity={3.4 * k}
      color="#fff8ec"
      castShadow
      shadow-mapSize-width={mapSize}
      shadow-mapSize-height={mapSize}
    />
  );
}

/**
 * Earthshine (direction = Earth, strength ∝ Earth's illuminated fraction (1 − cos θ)/2)
 * plus, in "enhanced visibility" mode, a labelled hemisphere fill so terrain in
 * shadow remains readable. Physical mode keeps only the dim Earthshine.
 */
function FillLights({ enhanced }: { enhanced: boolean }) {
  const { conditions, sample } = useConditions();
  if (!conditions || !sample) return null;
  const s = sample.sun.dir;
  const e = sample.earth.dir;
  const lit = (1 - (s[0] * e[0] + s[1] * e[1] + s[2] * e[2])) / 2;
  const d = azElToLocal(conditions.earth.azDeg, conditions.earth.elDeg);
  const k = conditions.earth.discFraction;
  // Display aid ("enhanced visibility"): a soft key from the Sun's true azimuth, raised to at
  // least 7° so relief reads even when the Sun is behind terrain. Weaker when real sunlight lands.
  const key = azElToLocal(conditions.sun.azDeg, Math.max(conditions.sun.elDeg, 7));
  const keyI = 0.95 - 0.7 * conditions.sun.discFraction;
  return (
    <>
      <directionalLight
        position={[d[0] * 50_000, Math.max(d[1], 0.02) * 50_000, d[2] * 50_000]}
        intensity={(enhanced ? 0.6 : 0.12) * lit * k}
        color="#cbd7ec"
      />
      {enhanced ? (
        <>
          <directionalLight position={[key[0] * 50_000, key[1] * 50_000, key[2] * 50_000]} intensity={keyI} color="#f6efe2" />
          <hemisphereLight args={['#aab2c0', '#2c2a26', 0.4]} />
        </>
      ) : (
        <ambientLight intensity={0.015} color="#c5d3ea" />
      )}
    </>
  );
}

function LookCamera({ eye }: { eye: number }) {
  const { camera, gl, invalidate } = useThree();
  const look = useLook();
  useEffect(() => {
    const c = camera as THREE.PerspectiveCamera;
    c.position.set(0, eye, 0);
    c.near = 0.5;
    c.far = 1_000_000;
    c.fov = look.fov;
    c.rotation.order = 'YXZ';
    c.rotation.y = -look.yaw * DEG;
    c.rotation.x = look.pitch * DEG;
    c.updateProjectionMatrix();
    invalidate();
  }, [camera, eye, look.yaw, look.pitch, look.fov, invalidate]);

  // Pointer drag to look around; wheel / pinch for field of view; arrow keys when focused.
  useEffect(() => {
    const el = gl.domElement;
    el.tabIndex = 0;
    el.setAttribute('aria-label', 'Surface view. Drag or use arrow keys to look around; + and − to zoom.');
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch0 = 0;
    let fov0 = 0;
    const down = (e: PointerEvent) => {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* best-effort */
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
        fov0 = useLook.getState().fov;
      }
    };
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const s = useLook.getState();
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0) s.set({ fov: fov0 * (pinch0 / d) });
        return;
      }
      const degPerPx = s.fov / el.clientHeight;
      s.set({ yaw: s.yaw - (e.clientX - prev.x) * degPerPx, pitch: s.pitch + (e.clientY - prev.y) * degPerPx });
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      pinch0 = 0;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = useLook.getState();
      s.set({ fov: s.fov * Math.exp(e.deltaY * 0.001) });
    };
    const key = (e: KeyboardEvent) => {
      const s = useLook.getState();
      const step = e.shiftKey ? 15 : 3;
      if (e.key === 'ArrowLeft') s.set({ yaw: s.yaw - step });
      else if (e.key === 'ArrowRight') s.set({ yaw: s.yaw + step });
      else if (e.key === 'ArrowUp') s.set({ pitch: s.pitch + step });
      else if (e.key === 'ArrowDown') s.set({ pitch: s.pitch - step });
      else if (e.key === '+' || e.key === '=') s.set({ fov: s.fov / 1.25 });
      else if (e.key === '-') s.set({ fov: s.fov * 1.25 });
      else return;
      e.preventDefault();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('keydown', key);
    el.style.touchAction = 'none';
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('keydown', key);
    };
  }, [gl]);
  return null;
}

function ReadySignal() {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    requestAnimationFrame(() => useApp.getState().setTransitioning(false));
  });
  return null;
}

export function SurfaceScene({ shadowMapSize, onError }: { shadowMapSize: number; onError: (m: string | null) => void }) {
  const { region } = useData();
  const regionId = useApp((s) => s.regionId);
  const timeMs = useApp((s) => s.timeMs);
  const layers = useApp((s) => s.layers);
  const { conditions } = useConditions();
  const r = region(regionId);
  const p = r.observationPoint;
  const { tiles, error } = useTerrain(r);
  const albedo = useAlbedo(r, layers.albedo);
  const segments = useMemo(() => (Math.min(window.innerWidth, window.innerHeight) < 700 ? 240 : 360), []);
  useEffect(() => onError(error), [error, onError]);
  useEffect(() => {
    if (error) useApp.getState().setTransitioning(false);
  }, [error]);
  return (
    <>
      <color attach="background" args={['#020306']} />
      <SunLight mapSize={shadowMapSize} />
      <FillLights enhanced={layers.enhancedLight} />
      <LookCamera eye={p.observerHeightM} />
      {tiles && <RadialTerrain region={r} tiles={tiles} detail={layers.regolith} segments={segments} albedo={albedo} />}
      {tiles && layers.rings && <GroundRings region={r} heights={tiles.near} />}
      {layers.horizonLine && <SkylineLine region={r} />}
      {layers.stars && <Stars timeMs={timeMs} latDeg={p.latDeg} lonDeg={p.lonDeg} />}
      {layers.skyGrid && <SkyGrid />}
      <SkyBodies />
      {conditions && (
        <SkyLabelProjector
          sun={[conditions.sun.azDeg, conditions.sun.elDeg]}
          earth={[conditions.earth.azDeg, conditions.earth.elDeg]}
        />
      )}
      {tiles && <ReadySignal />}
      <DrawerFrame />
    </>
  );
}
