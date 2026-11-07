import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createMoonMaterial, createMoonUniforms } from './moonMaterial';
import { assetUrl, loadTerrain, useData } from '../data/DataContext';
import { useApp } from '../state/store';
import { useCameraInfo } from './GlobeCamera';
import { markOnce, regionSwitchEnd } from '../utils/perf';
import { track } from '../state/loading';

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

/**
 * Off-main-thread image decoding where the browser supports ImageBitmap options correctly
 * (not Safari < 17 or Firefox < 98, as in three's GLTFLoader); otherwise the plain loader.
 */
const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const safari = /^((?!chrome|android).)*safari/i.test(ua) ? Number((ua.match(/version\/(\d+)/i) ?? [])[1] ?? 0) : -1;
const firefox = /firefox/i.test(ua) ? Number((ua.match(/firefox\/(\d+)/i) ?? [])[1] ?? 0) : -1;
const useBitmaps = typeof createImageBitmap !== 'undefined' && (safari < 0 || safari >= 17) && (firefox < 0 || firefox >= 98);
const bitmapLoader = new THREE.ImageBitmapLoader();
bitmapLoader.setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
const loader = new THREE.TextureLoader();
export const loadTex = (url: string, srgb: boolean, aniso: number) =>
  new Promise<THREE.Texture>((res, rej) => {
    const done = (t: THREE.Texture) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = aniso;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.needsUpdate = true;
      res(t);
    };
    if (useBitmaps)
      bitmapLoader.load(
        assetUrl(url),
        (bmp) => {
          const t = new THREE.Texture(bmp as unknown as HTMLImageElement);
          t.flipY = false; // already flipped while decoding
          const close = () => {
            (bmp as ImageBitmap).close?.();
            t.removeEventListener('dispose', close);
          };
          t.addEventListener('dispose', close);
          done(t);
        },
        undefined,
        rej,
      );
    else loader.load(assetUrl(url), done, undefined, rej);
  });

/** Warm the HTTP cache for a file (no decode, no GPU work). */
export const prefetch = (url: string) => {
  fetch(assetUrl(url), { priority: 'low' } as RequestInit).catch(() => undefined);
};
const idle = (f: () => void) =>
  'requestIdleCallback' in window
    ? (window as unknown as { requestIdleCallback: (f: () => void, o?: object) => void }).requestIdleCallback(f, { timeout: 3000 })
    : setTimeout(f, 1500);

export function MoonGlobe({ tier }: { tier: TextureTier }) {
  const { gl, camera, invalidate } = useThree();
  const { sites, region } = useData();
  const regionId = useApp((s) => s.regionId);
  // First frame: 1K maps (~110 KB each), so the globe appears at once. The full-resolution
  // global maps and the polar relief stream in afterwards without blocking.
  const [map, normalMap] = useLoader(THREE.TextureLoader, [assetUrl('textures/moon_color_1k.jpg'), assetUrl('textures/moon_normal_1k.jpg')]);
  const hiColor = tier === 'high' && (window.devicePixelRatio || 1) >= 1.5 ? 'textures/moon_color_8k.jpg' : 'textures/moon_color_4k.jpg';
  const hiNormal = tier === 'high' ? 'textures/moon_normal_4k.jpg' : 'textures/moon_normal_2k.jpg';
  const capNormalUrl = sites.polarCap?.standard ?? 'textures/polar/nrm_cap_2048.webp';
  const aniso = gl.capabilities.getMaxAnisotropy();
  const maxTiles = tier === 'high' ? 10 : 4; // 2048² RGBA + mips ≈ 22 MB each

  const uniforms = useMemo(() => {
    const blankN = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
    blankN.needsUpdate = true;
    return createMoonUniforms(blankN, sites.polarCap?.extentKm ?? 300);
  }, [sites]);

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

  // --- Progressive upgrade: polar relief first (it shapes the hero area), then the
  // full-resolution global colour and normal maps. Each swaps in once decoded.
  useEffect(() => {
    let alive = true;
    track('Polar relief (LOLA)', loadTex(capNormalUrl, false, aniso))
      .then((t) => {
        if (!alive || capHiState.current === 'done') return t.dispose();
        const old = uniforms.capNormal.value;
        uniforms.capNormal.value = t;
        uniforms.capNrmOn.value = 1;
        old.dispose();
        invalidate();
      })
      .catch(() => undefined);
    track('Full-resolution Moon imagery', Promise.all([loadTex(hiColor, true, aniso), loadTex(hiNormal, false, aniso)]))
      .then(([c, n]) => {
        if (!alive) {
          c.dispose();
          n.dispose();
          return;
        }
        for (const p of patches) {
          const b = sliceOf(c, p.i, p.j);
          const nm = sliceOf(n, p.i, p.j);
          b.anisotropy = nm.anisotropy = aniso;
          if (p.state !== 'tile') p.material.map = b;
          p.base.dispose();
          p.base = b;
          p.material.normalMap?.dispose();
          p.material.normalMap = nm;
        }
        markOnce('moon-base-hires');
        invalidate();
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [patches, uniforms, hiColor, hiNormal, capNormalUrl, aniso, invalidate]);

  // --- Polar cap imagery: load once the south pole is in view and close enough.
  const capState = useRef<'idle' | 'loading' | 'done'>('idle');
  const capHiState = useRef<'idle' | 'loading' | 'done'>('idle');
  const capHiImg = useRef<'idle' | 'loading' | 'done'>('idle');
  useEffect(() => () => {
    if (uniforms.capImgOn.value) uniforms.capImg.value.dispose();
  }, [uniforms]);

  // --- Site detail window: native 100 m imagery + LOLA normals around the selected point.
  // The last three regions stay on the GPU, so going back is instant; a newer selection
  // always wins over a slower, older request; neighbours are prefetched into the HTTP cache.
  type Det = { img: THREE.Texture; nrm: THREE.Texture };
  const detailCache = useRef(new Map<string, Det>());
  const detailFor = useRef<string | null>(null);
  useEffect(() => {
    const cache = detailCache.current;
    return () => {
      cache.forEach((d) => {
        d.img.dispose();
        d.nrm.dispose();
      });
      cache.clear();
    };
  }, []);
  useEffect(() => {
    const r = region(regionId);
    const d = r.detail;
    if (!d) {
      uniforms.detailOn.value = 0;
      return;
    }
    if (detailFor.current === r.id && uniforms.detailOn.value === 1) return;
    let alive = true;
    const cache = detailCache.current;
    const remember = (id: string, det: Det) => {
      cache.delete(id);
      cache.set(id, det);
      while (cache.size > 3) {
        const [k, v] = cache.entries().next().value as [string, Det];
        cache.delete(k);
        if (uniforms.detailImg.value === v.img) uniforms.detailOn.value = 0;
        v.img.dispose();
        v.nrm.dispose();
      }
    };
    const apply = (det: Det) => {
      remember(r.id, det);
      uniforms.detailImg.value = det.img;
      uniforms.detailNrm.value = det.nrm;
      uniforms.detailCenter.value.set(d.centerKm[0], d.centerKm[1]);
      uniforms.detailHalf.value = d.halfExtentKm;
      uniforms.detailOn.value = 1;
      detailFor.current = r.id;
      regionSwitchEnd();
      if (uniforms.capImgOn.value) markOnce('moon-hires');
      invalidate();
      // Prefetch the neighbours in list order (what "previous / next" will ask for).
      idle(() => {
        // Surface View for this region: fetch its LOLA tiles now (cached promises), so
        // "Explore the surface" starts with the data already in memory.
        for (const f of [r.terrain.file, r.terrain.far?.file, r.terrain.regional?.file]) if (f) loadTerrain(f).catch(() => undefined);
        const all = sites.regions;
        const i = all.findIndex((x) => x.id === r.id);
        for (const k of [1, -1]) {
          const nb = all[(i + k + all.length) % all.length];
          if (nb.detail && !cache.has(nb.id)) {
            prefetch(nb.detail.imagery);
            prefetch(nb.detail.normals);
          }
        }
      });
    };
    const hit = cache.get(r.id);
    if (hit) {
      apply(hit);
      return;
    }
    // The previous window stays visible until the new one is ready (no flash to coarse data).
    track(`${r.name} imagery (100 m)`, Promise.all([loadTex(d.imagery, true, aniso), loadTex(d.normals, false, aniso)]))
      .then(([img, nrm]) => {
        if (alive) return apply({ img, nrm });
        // A newer selection exists: keep this result for later rather than throw it away.
        if (cache.has(r.id)) {
          img.dispose();
          nrm.dispose();
        } else remember(r.id, { img, nrm });
      })
      .catch(() => {
        detailFor.current = null;
      });
    return () => {
      alive = false;
    };
  }, [regionId, region, sites, uniforms, aniso, invalidate]);

  // --- Per-frame: visibility, 16K tile streaming with LRU eviction, polar cap trigger.
  const inFlight = useRef(0);
  const frustum = useMemo(() => new THREE.Frustum(), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame(() => {
    markOnce('moon-first-frame');
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
          uniforms.capNrmOn.value = 1;
          old.dispose();
          capHiState.current = 'done';
          invalidate();
        })
        .catch(() => (capHiState.current = 'idle'));
    }

    // Polar WAC mosaic: the 293 m/px cap as soon as the south pole faces the camera (it is far
    // sharper there than the global map), upgraded to 146 m/px on the high tier when closer.
    const setCap = (t: THREE.Texture) => {
      const old = uniforms.capImgOn.value ? uniforms.capImg.value : null;
      uniforms.capImg.value = t;
      uniforms.capImgOn.value = 1;
      old?.dispose();
      invalidate();
    };
    if (capState.current === 'idle' && camDir.y < -0.2) {
      capState.current = 'loading';
      const url = sites.polarImagery?.cap.standard;
      if (url)
        loadTex(url, true, aniso)
          .then((t) => {
            if (capHiImg.current === 'done') return t.dispose();
            setCap(t);
            capState.current = 'done';
            if (uniforms.detailOn.value) markOnce('moon-hires');
          })
          .catch(() => (capState.current = 'idle'));
    }
    if (tier === 'high' && capHiImg.current === 'idle' && d < 2.8 && camDir.y < -0.35 && sites.polarImagery?.cap.high) {
      capHiImg.current = 'loading';
      loadTex(sites.polarImagery.cap.high, true, aniso)
        .then((t) => {
          setCap(t);
          capHiImg.current = 'done';
        })
        .catch(() => (capHiImg.current = 'idle'));
    }

    // 16K tiles only help when one screen pixel covers less than ~2 km of ground (4K base ≈ 2.7 km/px).
    const needTiles = useCameraInfo.getState().metersPerPixel / Math.min(window.devicePixelRatio || 1, 2) < 2400 || d < 2.2;
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
