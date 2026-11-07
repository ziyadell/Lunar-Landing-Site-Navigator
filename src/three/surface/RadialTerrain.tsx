import { useApp } from '../../state/store';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import type { LandingRegion } from '../../data/types';
import { regolithAlbedoMap, regolithNormalMap } from './regolith';
import { buildRadialMesh, type TerrainMesh, type TerrainTiles } from './terrainMesh';
import { markOnce } from '../../utils/perf';

export type { TerrainTiles };

/**
 * One continuous terrain mesh centred on the observer, out to 150 km — the same
 * range used for the horizon calculation, so the rendered skyline is the
 * measured skyline (no silhouette wall).
 *
 * Rings are spaced geometrically (spacing ≈ r·Δθ), giving ~uniform on-screen
 * triangle size from metres to 150 km. Heights are sampled from three LOLA
 * products and cross-faded in overlap bands so there are no seams:
 *    r < 11 km      near tile    80 m   (±12 km)
 *    11–55 km       far tile     400 m  (±60 km; its inner 60 m offset is removed)
 *    > 55 km        regional     1 km   (±150 km, 12×12 block mean)
 * All heights are metres above the observation point's tangent plane
 * (curvature included).
 */

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (r: { mesh?: TerrainMesh; error?: string }) => void>();
function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./terrainWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
    worker.onerror = () => {
      pending.forEach((f) => f({ error: 'worker failed' }));
      pending.clear();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** Builds the mesh in a Web Worker (falls back to the main thread if workers are unavailable). */
function buildMesh(region: LandingRegion, tiles: TerrainTiles, segments: number): Promise<TerrainMesh> {
  const w = getWorker();
  const local = () => buildRadialMesh(region, tiles, segments);
  if (!w) return Promise.resolve().then(local);
  const id = ++seq;
  return new Promise<TerrainMesh>((res, rej) => {
    // A worker that errors, or never answers, falls back to building on the main thread.
    const timer = window.setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      fallback();
    }, 20_000);
    const fallback = () => {
      try {
        res(local());
      } catch (e) {
        rej(e);
      }
    };
    pending.set(id, (r) => {
      window.clearTimeout(timer);
      if (r.mesh) res(r.mesh);
      else fallback();
    });
    try {
      w.postMessage({ id, region: { terrain: region.terrain, observationPoint: region.observationPoint }, tiles, segments });
    } catch {
      pending.delete(id);
      window.clearTimeout(timer);
      fallback();
    }
  });
}

function toGeometry(m: TerrainMesh) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
  g.setAttribute('stereo', new THREE.BufferAttribute(m.stereo, 2));
  g.setAttribute('color', new THREE.BufferAttribute(m.color, 3));
  g.setIndex(new THREE.BufferAttribute(m.index, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), m.radius);
  return g;
}

/** Terrain geometry for a region, built off the main thread; null while building. */
export function useTerrainGeometry(region: LandingRegion, tiles: TerrainTiles, segments: number) {
  const [g, setG] = useState<{ key: string; geometry: THREE.BufferGeometry } | null>(null);
  const key = `${region.id}:${segments}`;
  useEffect(() => {
    let alive = true;
    buildMesh(region, tiles, segments)
      .then((m) => {
        markOnce('surface-mesh');
        if (!alive) return;
        setG((prev) => {
          prev?.geometry.dispose();
          return { key, geometry: toGeometry(m) };
        });
      })
      .catch((e: unknown) => {
        // Neither the worker nor the main thread could build it: release the loading fade.
        console.error('Terrain mesh failed', e);
        if (alive) useApp.getState().setTransitioning(false);
      });
    return () => {
      alive = false;
    };
  }, [region, tiles, segments, key]);
  useEffect(() => () => setG((prev) => (prev?.geometry.dispose(), null)), []);
  return g?.key === key ? g.geometry : null;
}

export interface TerrainAlbedo {
  detail: THREE.Texture;
  detailCenter: [number, number];
  detailHalf: number;
  cap: THREE.Texture;
  capExtent: number;
}

export function RadialTerrain({
  region,
  tiles,
  detail,
  segments,
  albedo,
  ready,
}: {
  region: LandingRegion;
  tiles: TerrainTiles;
  detail: boolean;
  segments: number;
  /** LROC WAC polar mosaic draped by polar-stereographic coordinate (null = uniform albedo). */
  albedo: TerrainAlbedo | null;
  /** Rendered once the mesh exists (signals that Surface View is ready). */
  ready?: ReactNode;
}) {
  const geometry = useTerrainGeometry(region, tiles, segments);
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#a29e97', roughness: 1, metalness: 0, vertexColors: true });
    const patches: ((sh: THREE.WebGLProgramParametersWithUniforms) => void)[] = [];
    if (albedo) {
      // Real albedo from the LROC WAC South Pole Summer Mosaic. Pixels in 2010 shadow carry
      // no albedo, so they fall back to the regional mean; current lighting decides darkness.
      patches.push((sh) => {
        sh.uniforms.albDetail = { value: albedo.detail };
        sh.uniforms.albDetailCenter = { value: new THREE.Vector2(...albedo.detailCenter) };
        sh.uniforms.albDetailHalf = { value: albedo.detailHalf };
        sh.uniforms.albCap = { value: albedo.cap };
        sh.uniforms.albCapExtent = { value: albedo.capExtent };
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', `#include <common>
attribute vec2 stereo;
varying vec2 vStereo;`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>
vStereo = stereo;`);
        sh.fragmentShader = sh.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
             varying vec2 vStereo;
             uniform sampler2D albDetail; uniform vec2 albDetailCenter; uniform float albDetailHalf;
             uniform sampler2D albCap; uniform float albCapExtent;`,
          )
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
             {
               vec2 ud = (vStereo - albDetailCenter) / (2.0 * albDetailHalf) + 0.5;
               vec2 e = min(ud, 1.0 - ud);
               float wd = smoothstep(0.0, 0.03, min(e.x, e.y));
               float L = mix(texture2D(albCap, vStereo / (2.0 * albCapExtent) + 0.5).r, texture2D(albDetail, ud).r, wd);
               float lit = smoothstep(0.012, 0.045, L);
               float a = mix(0.36, L, lit);
               // Compressed response: the 2010 mosaic also carries its own slope shading.
               diffuseColor.rgb *= clamp(pow(a / 0.36, 0.6), 0.6, 1.4);
             }`,
          );
      });
    }
    if (detail) {
      // ILLUSTRATIVE sub-resolution texture (not measured), repeating every 24 m and faded
      // out with distance so it never aliases into moiré bands.
      const tex = regolithNormalMap().clone();
      tex.repeat.set(1 / 24, 1 / 24);
      tex.anisotropy = 16;
      tex.needsUpdate = true;
      m.normalMap = tex;
      m.normalScale.set(0.32, 0.32);
      const alb = regolithAlbedoMap();
      patches.push((sh) => {
        sh.uniforms.regAlb = { value: alb };
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform sampler2D regAlb;')
          .replace(
            '#include <normal_fragment_maps>',
            `#ifdef USE_NORMALMAP_TANGENTSPACE
               {
                 float dist = length(vViewPosition);
                 // Two samples of the tile, the second rotated and at a non-integer scale, so the
                 // 24 m repeat does not read as a pattern.
                 vec2 uvR = mat2(0.8, -0.6, 0.6, 0.8) * vNormalMapUv * 0.437 + 0.21;
                 vec3 mapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
                 vec3 mapR = texture2D(normalMap, uvR).xyz * 2.0 - 1.0;
                 mapN.xy = (mapN.xy + mapR.xy) * 0.8;
                 // Second octave at ~3.3 m, only within a few tens of metres of the eye.
                 vec3 mapN2 = texture2D(normalMap, vNormalMapUv * 7.31 + 0.37).xyz * 2.0 - 1.0;
                 mapN.xy += mapN2.xy * 0.55 * (1.0 - smoothstep(5.0, 45.0, dist));
                 mapN.xy *= normalScale;
                 normal = normalize(tbn * mapN);
               }
             #endif
             normal = normalize(mix(normal, nonPerturbedNormal, smoothstep(60.0, 320.0, length(vViewPosition))));`,
          )
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
             {
               float dist = length(vViewPosition);
               vec2 uvR = mat2(0.8, -0.6, 0.6, 0.8) * vNormalMapUv * 0.437 + 0.21;
               float a1 = (texture2D(regAlb, vNormalMapUv).r + texture2D(regAlb, uvR).r) * 0.5 - 0.5;
               float a2 = texture2D(regAlb, vNormalMapUv * 7.31 + 0.37).r - 0.5;
               float a0 = texture2D(regAlb, vNormalMapUv * 0.061 + 0.11).r - 0.5;
               diffuseColor.rgb *= 1.0
                 + a1 * 0.26 * (1.0 - smoothstep(80.0, 700.0, dist))
                 + a2 * 0.2 * (1.0 - smoothstep(5.0, 45.0, dist))
                 + a0 * 0.14 * (1.0 - smoothstep(1500.0, 8000.0, dist));
             }`,
          );
      });
    }
    m.onBeforeCompile = (sh) => patches.forEach((f) => f(sh));
    m.customProgramCacheKey = () => `terrain3-${detail ? 'd' : ''}${albedo ? 'a' : ''}`;
    return m;
  }, [detail, albedo]);
  useEffect(() => () => {
    material.normalMap?.dispose();
    material.dispose();
  }, [material]);
  if (!geometry) return null;
  return (
    <>
      <mesh geometry={geometry} material={material} castShadow receiveShadow />
      {ready}
    </>
  );
}
