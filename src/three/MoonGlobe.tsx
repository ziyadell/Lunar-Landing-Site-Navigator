import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createMoonMaterial } from './moonMaterial';
import { assetUrl, useData } from '../data/DataContext';

export type TextureTier = 'high' | 'standard';

export function pickTextureTier(maxTextureSize: number): TextureTier {
  const small = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 700;
  return maxTextureSize >= 4096 && !small ? 'high' : 'standard';
}

/**
 * Level-of-detail texturing.
 * The globe is built from 8 × 4 sphere patches (45° × 45°). Every patch starts with
 * its slice of the always-loaded 4K base map; when the camera is close enough that
 * 4K would be magnified, the visible patches stream in their 2048² slice of the 16K
 * LROC mosaic (effective 16384 × 8192). Loaded tiles are kept for the session.
 */
const COLS = 8;
const ROWS = 4;
const TILE_DISTANCE = 2.9; // camera distance (Moon radii) below which 16K tiles load
const MAX_PARALLEL = 4;

interface Patch {
  i: number;
  j: number;
  geometry: THREE.SphereGeometry;
  material: THREE.MeshStandardMaterial;
  center: THREE.Vector3;
  state: 'base' | 'loading' | 'tile';
}

function sliceOf(tex: THREE.Texture, i: number, j: number) {
  const t = tex.clone();
  t.repeat.set(1 / COLS, 1 / ROWS);
  t.offset.set(i / COLS, 1 - (j + 1) / ROWS);
  t.needsUpdate = true;
  return t;
}

/** The global Moon: radius 1 scene unit = 1737.4 km, fixed in the Moon-fixed frame. */
export function MoonGlobe({ tier }: { tier: TextureTier }) {
  const { gl, camera, invalidate } = useThree();
  const { sites } = useData();
  const colorUrl = assetUrl('textures/moon_color_4k.jpg');
  const normalUrl = assetUrl(tier === 'high' ? 'textures/moon_normal_4k.jpg' : 'textures/moon_normal_2k.jpg');
  const capUrl = assetUrl(sites.polarCap?.texture ?? 'textures/southpole_normal.jpg');
  const [map, normalMap, capNormal] = useLoader(THREE.TextureLoader, [colorUrl, normalUrl, capUrl]);
  const aniso = gl.capabilities.getMaxAnisotropy();

  const patches = useMemo<Patch[]>(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    normalMap.colorSpace = THREE.NoColorSpace;
    capNormal.colorSpace = THREE.NoColorSpace;
    capNormal.anisotropy = aniso;
    capNormal.wrapS = capNormal.wrapT = THREE.ClampToEdgeWrapping;
    const out: Patch[] = [];
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const phiStart = (i * 2 * Math.PI) / COLS;
        const thetaStart = (j * Math.PI) / ROWS;
        const geometry = new THREE.SphereGeometry(1, 64, 64, phiStart, (2 * Math.PI) / COLS, thetaStart, Math.PI / ROWS);
        const cMap = sliceOf(map, i, j);
        const nMap = sliceOf(normalMap, i, j);
        cMap.anisotropy = nMap.anisotropy = aniso;
        const material = createMoonMaterial({
          map: cMap,
          normalMap: nMap,
          capNormal,
          capExtentKm: sites.polarCap?.extentKm ?? 300,
        });
        const phi = phiStart + Math.PI / COLS;
        const theta = thetaStart + Math.PI / (2 * ROWS);
        const center = new THREE.Vector3(
          -Math.cos(phi) * Math.sin(theta),
          Math.cos(theta),
          Math.sin(phi) * Math.sin(theta),
        );
        out.push({ i, j, geometry, material, center, state: 'base' });
      }
    }
    return out;
  }, [map, normalMap, capNormal, aniso, sites]);

  useEffect(
    () => () => {
      patches.forEach((p) => {
        p.geometry.dispose();
        p.material.map?.dispose();
        p.material.normalMap?.dispose();
        p.material.dispose();
      });
    },
    [patches],
  );

  // Stream 16K tiles for patches facing the camera when zoomed in.
  const loader = useMemo(() => new THREE.TextureLoader(), []);
  const inFlight = useRef(0);
  useFrame(() => {
    const d = camera.position.length();
    if (d > TILE_DISTANCE) return;
    const camDir = camera.position.clone().normalize();
    // Visible cap: points whose angle from the sub-camera point is below acos(1/d).
    const horizonCos = 1 / d - 0.35;
    const wanted = patches
      .filter((p) => p.state === 'base' && p.center.dot(camDir) > horizonCos)
      .sort((a, b) => b.center.dot(camDir) - a.center.dot(camDir));
    for (const p of wanted) {
      if (inFlight.current >= MAX_PARALLEL) break;
      p.state = 'loading';
      inFlight.current++;
      loader.load(
        assetUrl(`textures/tiles/c_${p.j}_${p.i}.jpg`),
        (tex) => {
          inFlight.current--;
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = aniso;
          tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
          const old = p.material.map;
          p.material.map = tex;
          old?.dispose();
          p.state = 'tile';
          invalidate();
        },
        undefined,
        () => {
          inFlight.current--;
          p.state = 'base'; // retry on a later frame
        },
      );
    }
  });

  return (
    <group name="moon">
      {patches.map((p) => (
        <mesh key={`${p.j}-${p.i}`} geometry={p.geometry} material={p.material} />
      ))}
    </group>
  );
}
