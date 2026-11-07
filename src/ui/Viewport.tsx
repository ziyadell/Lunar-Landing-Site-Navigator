import { Component, useCallback, useMemo, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitalScene } from '../three/OrbitalScene';
import { SurfaceScene } from '../three/SurfaceScene';
import { renderSettings, useSettings } from '../state/settings';
import { useApp } from '../state/store';
import { webglAvailable } from '../utils/motion';
import { GlobeLabels } from './GlobeLabels';
import { SkyLabels } from './SurfaceOverlay';


class SceneBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    if (this.state.error)
      return (
        <div className="viewport__fallback" role="alert">
          <strong>3D view unavailable.</strong> {this.state.error}. Readings, time controls and Mission Analysis remain
          available.
        </div>
      );
    return this.props.children;
  }
}

export function Viewport() {
  const mode = useApp((s) => s.mode);
  const transitioning = useApp((s) => s.transitioning);
  const hasGL = useMemo(webglAvailable, []);
  // Quality (Auto / Performance / High) decides pixel density, texture tier, shadow map and
  // mesh density before the GL context exists. Changing it re-creates the scene once.
  const quality = useSettings((s) => s.quality);
  const rs = useMemo(() => renderSettings(quality), [quality]);
  const tier = rs.tier;
  const DPR = rs.dpr;
  const [terrainError, setTerrainError] = useState<string | null>(null);
  const onTerrainError = useCallback((m: string | null) => {
    setTerrainError(m);
    if (m) useApp.getState().setTransitioning(false); // don't leave the fade covering an error
  }, []);

  if (!hasGL) {
    return (
      <section className="viewport" aria-label="3D viewport">
        <div className="viewport__fallback" role="alert">
          <strong>WebGL is not available in this browser.</strong> The 3D Moon and Surface View need WebGL. All
          readings, time controls and Mission Analysis still work.
        </div>
      </section>
    );
  }

  return (
    <section className={`viewport viewport--${mode}`} aria-label={mode === 'orbital' ? '3D Moon' : 'Local surface'}>
      <SceneBoundary key={`${mode}-${quality}`}>
        {mode === 'orbital' ? (
          <Canvas
            className="viewport__canvas"
            frameloop="demand"
            dpr={DPR}
            camera={{ fov: 32, near: 0.01, far: 100, position: [0, -1, 3] }}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
            onCreated={({ gl }) => {
              if (import.meta.env.DEV) (window as unknown as { __gl: unknown }).__gl = gl;
              // Let the browser restore the context after a GPU reset instead of blocking the page.
              gl.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 1.05;
            }}
          >
            <OrbitalScene tier={tier} />
          </Canvas>
        ) : (
          <Canvas
            className="viewport__canvas viewport__canvas--surface"
            frameloop="demand"
            dpr={DPR}
            shadows={{ type: THREE.PCFSoftShadowMap }}
            camera={{ fov: 55, near: 0.5, far: 600_000, position: [0, 2, 0] }}
            gl={{ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' }}
            onCreated={({ gl }) => {
              if (import.meta.env.DEV) (window as unknown as { __gl: unknown }).__gl = gl;
              gl.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 1.0;
            }}
          >
            <SurfaceScene shadowMapSize={rs.shadowMap} segments={rs.terrainSegments} onError={onTerrainError} />
          </Canvas>
        )}
      </SceneBoundary>

      {mode === 'orbital' && <GlobeLabels />}
      {mode === 'surface' && <SkyLabels />}
      {mode === 'surface' && terrainError && <div className="vp-note is-warn" role="alert">Terrain tile failed to load: {terrainError}</div>}
      <div className={`vp-fade${transitioning ? ' is-on' : ''}`} aria-hidden={!transitioning} role="status">
        {transitioning && <span className="vp-fade__label">Loading LOLA terrain…</span>}
      </div>
    </section>
  );
}
