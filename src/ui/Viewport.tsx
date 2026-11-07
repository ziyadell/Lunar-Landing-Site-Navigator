import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitalScene } from '../three/OrbitalScene';
import { SurfaceScene } from '../three/SurfaceScene';
import { probeTextureTier } from '../three/MoonGlobe';
import { ScaleBar } from './ScaleBar';
import { useApp, useLook } from '../state/store';
import { useConditions } from '../data/useConditions';
import { webglAvailable } from '../utils/motion';
import { Compass } from './Compass';
import { GlobeLabels } from './GlobeLabels';
import { SkyLabels, SurfaceInfo, SurfacePanorama } from './SurfaceOverlay';
import { EarthGlyph, SunGlyph } from './primitives';
import { fmtDeg } from '../utils/format';

// Full device resolution (capped at 2×). No adaptive down-scaling: it softened the
// Moon's limb and fine detail while interacting.
const DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

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

function OrbitalTools() {
  const focus = useApp((s) => s.focusRegion);
  const reset = useApp((s) => s.resetCamera);
  const enterSurface = useApp((s) => s.enterSurface);
  const transitioning = useApp((s) => s.transitioning);
  return (
    <div className="vp-tools" role="toolbar" aria-label="Camera">
      <button type="button" className="tool" onClick={focus} disabled={transitioning}>
        Focus region
      </button>
      <button type="button" className="tool" onClick={reset} disabled={transitioning}>
        Global view
      </button>
      <button type="button" className="tool tool--primary" onClick={enterSurface} disabled={transitioning}>
        Enter Surface View
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5h6M5.5 2.5 8 5 5.5 7.5" stroke="currentColor" fill="none" strokeWidth="1.3" /></svg>
      </button>
    </div>
  );
}

function SurfaceTools() {
  const { conditions } = useConditions();
  const look = useLook();
  const setMode = useApp((s) => s.setMode);
  const focus = useApp((s) => s.focusRegion);
  // Body slightly above frame centre: skyline and sky both in view.
  const aim = (az: number, el: number) => look.set({ yaw: az, pitch: el - look.fov * 0.08 });

  // On entering (or switching region): face the Sun if it is up, otherwise Earth.
  const regionId = useApp((s) => s.regionId);
  const hasConditions = !!conditions;
  useEffect(() => {
    if (!conditions) return;
    const b = conditions.sun.state === 'visible' ? conditions.sun : conditions.earth;
    aim(b.azDeg, b.elDeg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionId, hasConditions]);
  return (
    <>
      <div className="vp-tools vp-tools--surface" role="toolbar" aria-label="Surface view">
        <button
          type="button"
          className="tool"
          onClick={() => conditions && aim(conditions.sun.azDeg, conditions.sun.elDeg)}
          disabled={!conditions}
        >
          <SunGlyph /> Face Sun
        </button>
        <button
          type="button"
          className="tool"
          onClick={() => conditions && aim(conditions.earth.azDeg, conditions.earth.elDeg)}
          disabled={!conditions}
        >
          <EarthGlyph /> Face Earth
        </button>
        <button type="button" className="tool" onClick={() => look.set({ yaw: 0, pitch: 4 })}>
          Face north
        </button>
        <div className="tool-group" role="group" aria-label="Field of view">
          <button type="button" className="tool tool--sq" aria-label="Zoom in" onClick={() => look.set({ fov: look.fov / 1.4 })}>+</button>
          <span className="tool-readout num">{look.fov.toFixed(0)}°</span>
          <button type="button" className="tool tool--sq" aria-label="Zoom out" onClick={() => look.set({ fov: look.fov * 1.4 })}>−</button>
        </div>
        <button
          type="button"
          className="tool tool--primary"
          onClick={() => {
            setMode('orbital');
            focus();
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M8 5H2M4.5 2.5 2 5l2.5 2.5" stroke="currentColor" fill="none" strokeWidth="1.3" /></svg>
          Return to orbit
        </button>
      </div>
      <div className="vp-heading num" aria-live="off">
        HDG {look.yaw.toFixed(0).padStart(3, '0')}° · EL {fmtDeg(look.pitch, 0)}
      </div>
    </>
  );
}

export function Viewport() {
  const mode = useApp((s) => s.mode);
  const transitioning = useApp((s) => s.transitioning);
  const hasGL = useMemo(webglAvailable, []);
  // Decided before the GL context exists so only one set of base textures loads.
  const tier = useMemo(probeTextureTier, []);
  const [shadowSize, setShadowSize] = useState(4096);
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
      <SceneBoundary key={mode}>
        {mode === 'orbital' ? (
          <Canvas
            className="viewport__canvas"
            frameloop="demand"
            dpr={DPR}
            camera={{ fov: 32, near: 0.01, far: 100, position: [0, -1, 3] }}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
            onCreated={({ gl }) => {
              if (import.meta.env.DEV) (window as unknown as { __gl: unknown }).__gl = gl;
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
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 1.0;
              const small = Math.min(window.innerWidth, window.innerHeight) < 700;
              setShadowSize(small || gl.capabilities.maxTextureSize < 8192 ? 2048 : 4096);
            }}
          >
            <SurfaceScene shadowMapSize={shadowSize} onError={onTerrainError} />
          </Canvas>
        )}
      </SceneBoundary>

      {mode === 'orbital' && <GlobeLabels />}
      {mode === 'surface' && <Compass />}
      {mode === 'orbital' ? <OrbitalTools /> : <SurfaceTools />}
      {mode === 'surface' && (
        <>
          <SkyLabels />
          <SurfaceInfo error={terrainError} />
          <SurfacePanorama />
        </>
      )}
      {mode === 'orbital' && <ScaleBar />}
      <div className={`vp-fade${transitioning ? ' is-on' : ''}`} aria-hidden="true" />
    </section>
  );
}
