import { lazy, Suspense } from 'react';
import { DataProvider } from './data/DataContext';
import { useApp } from './state/store';
import { Viewport } from './ui/Viewport';
import { Masthead } from './ui/stage/Masthead';
import { RegionDeck } from './ui/stage/Regions';
import { ConditionsCard } from './ui/stage/Conditions';
import { TimePill } from './ui/stage/TimePill';
import { Drawer, HeadingReadout, LookTools } from './ui/stage/Stage';
import { CameraStack, ScaleBar } from './ui/ScaleBar';
import { Compass } from './ui/Compass';
import { SurfacePanorama } from './ui/SurfaceOverlay';
import { Intro } from './ui/stage/Intro';
import { LoadingChip } from './ui/stage/LoadingChip';
import { AudioPlayer, Welcome } from './audio/ui';

const AnalysisView = lazy(() => import('./ui/analysis/AnalysisView'));

function Boot({ state }: { state: { status: 'loading' } | { status: 'error'; message: string } }) {
  return (
    <div className="boot" role="status" aria-live="polite">
      <svg className="boot__mark" width="44" height="44" viewBox="0 0 26 26" aria-hidden="true">
        <circle cx="13" cy="13" r="8.5" fill="#F1F5F9" opacity="0.94" />
        <path d="M13 4.5a8.5 8.5 0 0 0 0 17 10.4 10.4 0 0 1 0-17z" fill="#05080F" opacity="0.6" />
      </svg>
      <div className="boot__title">Lunar Landing Site Navigator</div>
      {state.status === 'loading' ? (
        <div className="boot__line">Loading JPL ephemeris and LOLA terrain…</div>
      ) : (
        <div className="boot__line boot__line--error">
          Could not load scientific data ({state.message}). Check your connection and reload.
        </div>
      )}
    </div>
  );
}

/**
 * Exploration layout: the scene fills the window and every control floats over
 * it in the four corners, so the Moon (or the terrain) always has the room.
 *   top     masthead · mode navigation          (surface: heading tape)
 *   right   live Sun/Earth conditions · camera or look tools
 *   left    the selected region, told through its own LROC imagery
 *   bottom  observation time (surface: 360° skyline above it)
 */
function Explore() {
  const mode = useApp((s) => s.mode);
  const drawer = useApp((s) => s.drawer);
  const focus = useApp((s) => s.focus);
  const intro = useApp((s) => s.intro);
  const side = drawer === 'atlas' ? ' has-drawer-left' : drawer ? ' has-drawer-right' : '';
  return (
    <div className={`app app--${mode}${side}${focus ? ' is-focus' : ''}${intro ? ' is-intro' : ''}`}>
      <Viewport />
      <div className="scrim" aria-hidden="true" />
      <Masthead />
      <main className="hud" aria-label={mode === 'orbital' ? 'Orbital view' : 'Surface view'}>
        {mode === 'surface' && (
          <div className="hud__top">
            <Compass />
          </div>
        )}
        <div className="hud__right">
          <ConditionsCard />
          {mode === 'orbital' ? <CameraStack /> : <LookTools />}
        </div>
        <div className="hud__left">
          <RegionDeck />
        </div>
        <div className="hud__bottom">
          {mode === 'surface' && <SurfacePanorama />}
          <LoadingChip />
          <TimePill />
        </div>
        <div className="hud__corner">{mode === 'orbital' ? <ScaleBar /> : <HeadingReadout />}</div>
        <div className="hud__intro">
          <Intro />
        </div>
        <div className="hud__audio">
          <AudioPlayer />
        </div>
      </main>
      <Welcome />
      <Drawer />
    </div>
  );
}

function Workspace() {
  const mode = useApp((s) => s.mode);
  if (mode === 'analysis') {
    return (
      <div className="app app--analysis">
        <Masthead />
        <Suspense fallback={<div className="analysis-loading">Preparing analysis…</div>}>
          <AnalysisView />
        </Suspense>
        <div className="analysis-audio">
          <AudioPlayer />
        </div>
        <Drawer />
      </div>
    );
  }
  return <Explore />;
}

export function App() {
  return (
    <DataProvider fallback={(s) => <Boot state={s as never} />}>
      <Workspace />
    </DataProvider>
  );
}
