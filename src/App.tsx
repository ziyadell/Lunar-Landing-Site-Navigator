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
import { MissionGuide, Welcome } from './audio/ui';

const AnalysisView = lazy(() => import('./ui/analysis/AnalysisView'));

function Boot({ state }: { state: { status: 'loading' } | { status: 'error'; message: string } }) {
  return (
    <div className="boot" role="status" aria-live="polite">
      <svg className="boot__mark" width="44" height="44" viewBox="0 0 22 22" aria-hidden="true">
        <circle cx="11" cy="11" r="7.5" fill="#F1F5F9" opacity="0.92" />
        <path d="M11 3.5a7.5 7.5 0 0 0 0 15 9 9 0 0 1 0-15z" fill="#05080F" opacity="0.55" />
        <circle cx="11" cy="11" r="10.25" fill="none" stroke="#4DDCF4" strokeWidth="1" strokeDasharray="2 2.6" />
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
  const tourSpot = useApp((s) => s.tourSpot);
  const side = drawer === 'atlas' ? ' has-drawer-left' : drawer ? ' has-drawer-right' : '';
  return (
    <div className={`app app--${mode}${side}${focus ? ' is-focus' : ''}${intro ? ' is-intro' : ''}`} data-tour-spot={tourSpot ?? undefined}>
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
          <MissionGuide />
        </div>
      </main>
      <Welcome />
      <Drawer />
    </div>
  );
}

function Workspace() {
  const mode = useApp((s) => s.mode);
  const tourSpot = useApp((s) => s.tourSpot);
  if (mode === 'analysis') {
    return (
      <div className="app app--analysis" data-tour-spot={tourSpot ?? undefined}>
        <Masthead />
        <Suspense fallback={<div className="analysis-loading">Preparing analysis…</div>}>
          <AnalysisView />
        </Suspense>
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
