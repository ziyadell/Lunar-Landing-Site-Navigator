import { lazy, Suspense } from 'react';
import { DataProvider } from './data/DataContext';
import { useApp } from './state/store';
import { Viewport } from './ui/Viewport';
import { Masthead } from './ui/stage/Masthead';
import { RegionDeck } from './ui/stage/Regions';
import { ConditionsCard, SunDownNote } from './ui/stage/Conditions';
import { SiteRanking } from './ui/stage/Ranking';
import { t } from './i18n';
import { TimePill } from './ui/stage/TimePill';
import { Drawer, HeadingReadout, LookTools } from './ui/stage/Stage';
import { CameraStack, ScaleBar } from './ui/ScaleBar';
import { Compass } from './ui/Compass';
import { SurfacePanorama } from './ui/SurfaceOverlay';
import { Intro } from './ui/stage/Intro';
import { LoadingChip } from './ui/stage/LoadingChip';
import { MissionGuide, Welcome, WelcomeCaption } from './audio/ui';
import type { DataProblem } from './data/DataContext';
import { useRelease } from './data/release';
import { useSettings } from './state/settings';

/** Shown when an open tab discovers that a newer release is live (instead of mixing data). */
function UpdateNotice() {
  const on = useRelease((s) => s.updateAvailable);
  if (!on) return null;
  return (
    <div className="update-notice" role="alert">
      LunaNav has been updated.
      <button type="button" className="vp-note__btn" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}

const AnalysisView = lazy(() => import('./ui/analysis/AnalysisView'));

type BootState = { status: 'loading' } | { status: 'error'; problem: DataProblem; detail: string; retry: () => void };
const PROBLEM: Record<DataProblem, { title: string; text: string; action: string }> = {
  network: {
    title: 'The scientific data did not load.',
    text: 'Check your connection, then try again.',
    action: 'Try again',
  },
  incompatible: {
    title: 'The data does not match this version of the app.',
    text: 'An older copy was probably kept by a cache. Trying again fetches a fresh copy; nothing is shown from mismatched data.',
    action: 'Try again',
  },
  updated: {
    title: 'LunaNav has been updated.',
    text: 'Reload to continue with the latest version.',
    action: 'Reload',
  },
};

function Boot({ state }: { state: BootState }) {
  return (
    <div className="boot" role="status" aria-live="polite">
      <svg className="boot__mark" width="44" height="44" viewBox="0 0 22 22" aria-hidden="true">
        <circle cx="11" cy="11" r="7.5" fill="#F1F5F9" opacity="0.92" />
        <path d="M11 3.5a7.5 7.5 0 0 0 0 15 9 9 0 0 1 0-15z" fill="#05080F" opacity="0.55" />
        <circle cx="11" cy="11" r="10.25" fill="none" stroke="#4DDCF4" strokeWidth="1" strokeDasharray="2 2.6" />
      </svg>
      <div className="boot__title">LunaNav · Lunar Landing Site Navigator</div>
      {state.status === 'loading' ? (
        <>
          <div className="boot__line boot__about">{t('LunaNav compares nine candidate landing sites near the lunar south pole: when each one sees the Sun and the Earth.')}</div>
          <div className="boot__line boot__busy"><i className="loadchip__ring" aria-hidden="true" />{t('Loading JPL ephemeris and LOLA terrain…')}</div>
        </>
      ) : (
        <div className="boot__error" role="alert">
          <div className="boot__line boot__line--error">{t(PROBLEM[state.problem].title)}</div>
          <div className="boot__line">{t(PROBLEM[state.problem].text)}</div>
          <button type="button" className="cta boot__retry" onClick={state.retry}>
            {t(PROBLEM[state.problem].action)}
          </button>
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
  const welcomeSeen = useSettings((s) => s.welcomeSeen);
  const outro = useApp((s) => s.outro);
  const reveal = useApp((s) => s.reveal);
  // First visit: only the Moon and "Enter mission" until the welcome has played.
  const pre = mode === 'orbital' && !welcomeSeen && !intro;
  const side = drawer === 'atlas' ? ' has-drawer-left' : drawer ? ' has-drawer-right' : '';
  return (
    <div className={`app app--${mode}${side}${focus ? ' is-focus' : ''}${intro ? ' is-intro' : ''}${pre ? ' is-prewelcome' : ''}${outro ? ' is-outro' : ''}${reveal ? ' is-reveal' : ''}`} data-tour-spot={tourSpot ?? undefined}>
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
          <div className="hud__stack">
            <ConditionsCard />
            {mode === 'orbital' && <SiteRanking />}
          </div>
          {mode === 'orbital' ? <CameraStack /> : <LookTools />}
        </div>
        <div className="hud__left">
          <RegionDeck />
        </div>
        <div className="hud__bottom">
          {mode === 'surface' && <SunDownNote />}
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
      <WelcomeCaption />
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
        <Suspense fallback={<div className="analysis-loading">{t('Preparing analysis…')}</div>}>
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
    <DataProvider fallback={(s) => <Boot state={s as BootState} />}>
      <Workspace />
      <UpdateNotice />
    </DataProvider>
  );
}
