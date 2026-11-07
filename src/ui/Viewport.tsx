import { Component, Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { checkForUpdate } from '../data/release';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitalScene } from '../three/OrbitalScene';
import { SurfaceScene } from '../three/SurfaceScene';
import { renderSettings, useSettings } from '../state/settings';
import { useApp } from '../state/store';
import { webglAvailable } from '../utils/motion';
import { GlobeLabels } from './GlobeLabels';
import { SkyLabels } from './SurfaceOverlay';


/**
 * A rendering failure in the 3D scene stays inside the scene: a short, plain explanation
 * and a Retry, never the raw exception (it goes to the console). Readings, time and
 * Mission Analysis keep working.
 */
class SceneBoundary extends Component<{ children: ReactNode; onState: (failed: boolean) => void }, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: Error) {
    console.error('3D scene failed:', e);
    this.props.onState(true);
    void checkForUpdate();
  }
  render() {
    if (this.state.failed)
      return (
        <div className="viewport__fallback viewport__fallback--compact" role="alert">
          <strong>The 3D view could not start.</strong> Readings, time controls and Mission Analysis still work.
          <button
            type="button"
            className="vp-note__btn"
            onClick={() => {
              this.props.onState(false);
              this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));
            }}
          >
            Try again
          </button>
        </div>
      );
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
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
  // Recovery: if Surface View has not drawn its first frame after 25 s, lift the fade and say so.
  const sceneReady = useApp((s) => s.sceneReady);
  const terrainRetry = useApp((s) => s.terrainRetry);
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    setStalled(false);
    if (mode !== 'surface' || sceneReady === 'surface') return;
    const t = window.setTimeout(() => {
      setStalled(true);
      useApp.getState().setTransitioning(false);
    }, 25_000);
    return () => window.clearTimeout(t);
  }, [mode, sceneReady, terrainRetry]);
  // GPU context loss (driver reset, memory pressure): wait briefly for the browser to restore
  // it; otherwise rebuild the 3D view with a fresh context, at most twice, then explain.
  const [glLost, setGlLost] = useState(false);
  const [glGen, setGlGen] = useState(0);
  const [glFailed, setGlFailed] = useState(false);
  const [renderFailed, setRenderFailed] = useState(false);
  // Camera and look controls are hidden while there is no working scene to control.
  useEffect(() => {
    useApp.setState({ sceneUnavailable: !hasGL || glFailed || renderFailed });
  }, [hasGL, glFailed, renderFailed]);
  useEffect(() => setRenderFailed(false), [mode, quality]);
  useEffect(() => {
    if (!glLost) return;
    const t = window.setTimeout(() => {
      if (glGen >= 2) return setGlFailed(true);
      setGlLost(false);
      setGlGen((g) => g + 1);
    }, 2500);
    return () => window.clearTimeout(t);
  }, [glLost, glGen]);
  // Only the canvas on screen counts: switching views unmounts the previous canvas, which
  // releases its context on purpose and must not be mistaken for a GPU failure.
  const activeCanvas = useRef<HTMLCanvasElement | null>(null);
  const watchContext = (el: HTMLCanvasElement) => {
    activeCanvas.current = el;
    el.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); // allow the browser to restore it
      window.setTimeout(() => {
        if (el.isConnected && activeCanvas.current === el) setGlLost(true);
      }, 200);
    });
    el.addEventListener('webglcontextrestored', () => setGlLost(false));
  };
  useEffect(() => setGlLost(false), [mode]);
  const retry = () => {
    setTerrainError(null);
    setStalled(false);
    useApp.getState().retryTerrain();
  };

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
      <SceneBoundary key={`${mode}-${quality}-${glGen}`} onState={setRenderFailed}>
        {mode === 'orbital' ? (
          <Canvas
            className="viewport__canvas"
            frameloop="demand"
            dpr={DPR}
            camera={{ fov: 32, near: 0.01, far: 100, position: [0, -1, 3] }}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
            onCreated={({ gl }) => {
              if (import.meta.env.DEV) (window as unknown as { __gl: unknown }).__gl = gl;
              watchContext(gl.domElement);
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
              watchContext(gl.domElement);
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 1.0;
            }}
          >
            <SurfaceScene shadowMapSize={rs.shadowMap} segments={rs.terrainSegments} onError={onTerrainError} />
          </Canvas>
        )}
      </SceneBoundary>

      {glFailed && (
        <div className="viewport__fallback" role="alert">
          <strong>The 3D view stopped: the graphics processor reset.</strong> This usually means the device is short of graphics
          memory. Readings, time controls and Mission Analysis still work.{' '}
          <button type="button" className="vp-note__btn" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      )}
      {glLost && !glFailed && (
        <div className="vp-note" role="status">
          Restoring the 3D view…
        </div>
      )}
      {mode === 'orbital' && <GlobeLabels />}
      {mode === 'surface' && <SkyLabels />}
      {mode === 'surface' && (terrainError || (stalled && sceneReady !== 'surface')) && (
        <div className="vp-note is-warn" role="alert">
          {terrainError ? `LOLA terrain failed to load (${terrainError}).` : 'Surface View is taking longer than expected to load.'}{' '}
          <button type="button" className="vp-note__btn" onClick={retry}>
            Retry
          </button>
        </div>
      )}
      <div className={`vp-fade${transitioning ? ' is-on' : ''}`} aria-hidden={!transitioning} role="status">
        {transitioning && <span className="vp-fade__label">Loading LOLA terrain…</span>}
      </div>
    </section>
  );
}
