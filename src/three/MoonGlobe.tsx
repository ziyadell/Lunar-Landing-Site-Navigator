import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createMoonMaterial, createMoonUniforms } from './moonMaterial';
import { assetUrl, useData } from '../data/DataContext';
import { useApp } from '../state/store';
import { useCameraInfo } from './GlobeCamera';

export type TextureTier = 'high' | 'standard';

/** Decide the texture tier once, before any GL context exists (avoids loading two normal maps). */
export function probeTextureTier(): TextureTier {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    const max = gl ? (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) : 2048;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    return max >= 4096 && !small ? 'high' : 'standard';
  } catch {
    return 'standard';
  }
}

/**
 * Multi-resolution texturing.
 *  1. Global: 8 × 4 sphere patches; each starts with its slice of the 4K base map and
 *     streams its 2048² slice of the 16K mosaic (0.67 km/px) when the on-screen
 *     ground resolution needs it. Tiles are kept in an LRU set bounded by a GPU
 *     budget and evicted back to the base slice.
 *  2. South polar cap (> 80.6°S): LROC WAC South Pole Summer Mosaic (cap texture
 *     146 m/px high tier, 293 m/px standard) + LOLA normals, loaded when the pole is in view.
 *  3. Selected site: native-resolution 100 m imagery + LOLA normals in a 204.8 km window.
 */
const COLS = 8;
const ROWS = 4;
const MAX_PARALLEL = 3;

interface Patch {
  i: number;
  j: number;
  geometry: THREE.SphereGeometry;
  material: THREE.MeshStandardMaterial;
  base: THREE.Texture;
  tile: THREE.Texture | null;
  sphere: THREE.Sphere;
  state: 'base' | 'loading' | 'tile';
  lastSeen: number;
}

function sliceOf(tex: THREE.Texture, i: number, j: number) {
  const t = tex.clone();
  t.repeat.set(1 / COLS, 1 / ROWS);
  t.offset.set(i / COLS, 1 - (j + 1) / ROWS);
  t.needsUpdate = true;
  return t;
}

const loader = new THREE.TextureLoader();
const loadTex = (url: string, srgb: boolean, aniso: number) =>
  new Promise<THREE.Texture>((res, rej) =>
    loader.load(
      assetUrl(url),
      (t) => {
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.anisotropy = aniso;
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        res(t);
      },
      undefined,
      rej,
    ),
  );

export function MoonGlobe({ tier }: { tier: TextureTier }) {
  const { gl, camera, invalidate } = useThree();
  const { sites, region } = useData();
  const regionId = useApp((s) => s.regionId);
  // Start with the 2048² (293 m/px) polar relief for every tier; the high tier upgrades to
  // 4096² (146 m/px, 18 MB lossless) only when zoomed in near the pole.
  const capNormalUrl = sites.polarCap?.standard ?? sites.polarCap?.texture ?? 'textures/southpole_normal.png';
  const [map, normalMap, capNormal] = useLoader(THREE.TextureLoader, [
    assetUrl('textures/moon_color_4k.jpg'),
    assetUrl(tier === 'high' ? 'textures/moon_normal_4k.jpg' : 'textures/moon_normal_2k.jpg'),
    assetUrl(capNormalUrl),
  ]);
  const aniso = gl.capabilities.getMaxAnisotropy();
  const maxTiles = tier === 'high' ? 10 : 4; // 2048² RGBA + mips ≈ 22 MB each

  const uniforms = useMemo(() => {
    capNormal.colorSpace = THREE.NoColorSpace;
    capNormal.anisotropy = aniso;
    capNormal.wrapS = capNormal.wrapT = THREE.ClampToEdgeWrapping;
    return createMoonUniforms(capNormal, sites.polarCap?.extentKm ?? 300);
  }, [capNormal, aniso, sites]);

  const patches = useMemo<Patch[]>(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    normalMap.colorSpace = THREE.NoColorSpace;
    const out: Patch[] = [];
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const phiStart = (i * 2 * Math.PI) / COLS;
        const thetaStart = (j * Math.PI) / ROWS;
        const geometry = new THREE.SphereGeometry(1, 64, 64, phiStart, (2 * Math.PI) / COLS, thetaStart, Math.PI / ROWS);
        geometry.computeBoundingSphere();
        const base = sliceOf(map, i, j);
        const nMap = sliceOf(normalMap, i, j);
        base.anisotropy = nMap.anisotropy = aniso;
        const material = createMoonMaterial({ map: base, normalMap: nMap, uniforms });
        out.push({ i, j, geometry, material, base, tile: null, sphere: geometry.boundingSphere!.clone(), state: 'base', lastSeen: 0 });
      }
    }
    return out;
  }, [map, normalMap, aniso, uniforms]);

  useEffect(
    () => () => {
      patches.forEach((p) => {
        p.geometry.dispose();
        p.tile?.dispose();
        p.base.dispose();
        p.material.normalMap?.dispose();
        p.material.dispose();
      });
    },
    [patches],
  );

  // --- Polar cap imagery: load once the south pole is in view and close enough.
  const capState = useRef<'idle' | 'loading' | 'done'>('idle');
  const capHiState = useRef<'idle' | 'loading' | 'done'>('idle');
  useEffect(() => () => {
    if (uniforms.capImgOn.value) uniforms.capImg.value.dispose();
  }, [uniforms]);

  // --- Site detail window: native 100 m imagery + LOLA normals around the selected point.
  const detailFor = useRef<string | null>(null);
  useEffect(() => {
    const r = region(regionId);
    const d = (r as { detail?: { imagery: string; normals: string; centerKm: [number, number]; halfExtentKm: number } }).detail;
    if (!d) {
      uniforms.detailOn.value = 0;
      return;
    }
    if (detailFor.current === r.id && uniforms.detailOn.value === 1) return;
    let alive = true;
    uniforms.detailOn.value = 0;
    Promise.all([loadTex(d.imagery, true, aniso), loadTex(d.normals, false, aniso)])
      .then(([img, nrm]) => {
        if (!alive) {
          img.dispose();
          nrm.dispose();
          return;
        }
        const oldI = uniforms.detailImg.value;
        const oldN = uniforms.detailNrm.value;
        uniforms.detailImg.value = img;
        uniforms.detailNrm.value = nrm;
        uniforms.detailCenter.value.set(d.centerKm[0], d.centerKm[1]);
        uniforms.detailHalf.value = d.halfExtentKm;
        uniforms.detailOn.value = 1;
        detailFor.current = r.id;
        oldI.dispose();
        oldN.dispose();
        invalidate();
      })
      .catch(() => {
        detailFor.current = null;
      });
    return () => {
      alive = false;
    };
  }, [regionId, region, uniforms, aniso, invalidate]);

  // --- Per-frame: visibility, 16K tile streaming with LRU eviction, polar cap trigger.
  const inFlight = useRef(0);
  const frustum = useMemo(() => new THREE.Frustum(), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame(() => {
    const now = performance.now();
    m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(m);
    const camPos = camera.position;
    const d = camPos.length();
    const camDir = camPos.clone().normalize();

    if (
      tier === 'high' &&
      capHiState.current === 'idle' &&
      sites.polarCap?.texture &&
      camDir.y < -0.5 &&
      useCameraInfo.getState().metersPerPixel < 350
    ) {
      capHiState.current = 'loading';
      loadTex(sites.polarCap.texture, false, aniso)
        .then((t) => {
          const old = uniforms.capNormal.value;
          uniforms.capNormal.value = t;
          if (old !== capNormal) old.dispose();
          capHiState.current = 'done';
          invalidate();
        })
        .catch(() => (capHiState.current = 'idle'));
    }

    if (capState.current === 'idle' && d < 2.8 && camDir.y < -0.35) {
      capState.current = 'loading';
      const url = tier === 'high' ? sites.polarImagery?.cap.high : sites.polarImagery?.cap.standard;
      if (url)
        loadTex(url, true, aniso)
          .then((t) => {
            uniforms.capImg.value = t;
            uniforms.capImgOn.value = 1;
            capState.current = 'done';
            invalidate();
          })
          .catch(() => (capState.current = 'idle'));
    }

    // 16K tiles only help when one screen pixel covers less than ~2 km of ground (4K base ≈ 2.7 km/px).
    const needTiles = useCameraInfo.getState().metersPerPixel < 2000 || d < 2.2;
    const visible: Patch[] = [];
    for (const p of patches) {
      // Facing test: the patch's nearest point must be on the camera-side hemisphere.
      const facing = p.sphere.center.clone().normalize().dot(camDir) > -p.sphere.radius;
      if (facing && frustum.intersectsSphere(p.sphere)) {
        p.lastSeen = now;
        visible.push(p);
      }
    }
    if (!needTiles) return;
    visible.sort((a, b) => b.sphere.center.clone().normalize().dot(camDir) - a.sphere.center.clone().normalize().dot(camDir));
    for (const p of visible) {
      if (p.state !== 'base' || inFlight.current >= MAX_PARALLEL) continue;
      // Respect the GPU budget: evict the least-recently-seen tile that is not visible.
      const resident = patches.filter((q) => q.state === 'tile');
      if (resident.length >= maxTiles) {
        const victim = resident.filter((q) => q.lastSeen < now).sort((a, b) => a.lastSeen - b.lastSeen)[0];
        if (!victim) break;
        victim.material.map = victim.base;
        victim.tile?.dispose();
        victim.tile = null;
        victim.state = 'base';
      }
      p.state = 'loading';
      inFlight.current++;
      loadTex(`textures/tiles/c_${p.j}_${p.i}.jpg`, true, aniso)
        .then((tex) => {
          inFlight.current--;
          p.tile = tex;
          p.material.map = tex;
          p.state = 'tile';
          invalidate();
        })
        .catch(() => {
          inFlight.current--;
          p.state = 'base';
        });
    }
    if (import.meta.env.DEV) (window as unknown as { __moonU: unknown }).__moonU = uniforms;
    if (import.meta.env.DEV)
      (window as unknown as { __tiles: unknown }).__tiles = {
        resident: patches.filter((q) => q.state === 'tile').length,
        textures: gl.info.memory.textures,
      };
  });

  return (
    <group name="moon">
      {patches.map((p) => (
        <mesh key={`${p.j}-${p.i}`} geometry={p.geometry} material={p.material} />
      ))}
    </group>
  );
}
