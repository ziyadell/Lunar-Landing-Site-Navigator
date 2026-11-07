import { lazy, Suspense } from 'react';
import { DataProvider } from './data/DataContext';
import { useApp } from './state/store';
import { TopBar } from './ui/TopBar';
import { SitePanel } from './ui/SitePanel';
import { SciencePanel } from './ui/SciencePanel';
import { TimeDock } from './ui/TimeDock';
import { Viewport } from './ui/Viewport';
import { MobileSheet } from './ui/MobileSheet';
import { useMedia } from './utils/useMedia';

const AnalysisView = lazy(() => import('./ui/analysis/AnalysisView'));

function Boot({ state }: { state: { status: 'loading' } | { status: 'error'; message: string } }) {
  return (
    <div className="boot" role="status" aria-live="polite">
      <div className="boot__title">Lunar Landing Site Navigator</div>
      {state.status === 'loading' ? (
        <div className="boot__line">Loading ephemeris and LOLA site data…</div>
      ) : (
        <div className="boot__line boot__line--error">
          Could not load scientific data ({state.message}). Check your connection and reload.
        </div>
      )}
    </div>
  );
}

function Workspace() {
  const mode = useApp((s) => s.mode);
  const compact = useMedia('(max-width: 899px)');

  if (mode === 'analysis') {
    return (
      <div className="shell shell--analysis">
        <TopBar />
        <Suspense fallback={<div className="analysis-loading">Preparing analysis workspace…</div>}>
          <AnalysisView />
        </Suspense>
      </div>
    );
  }

  return (
    <div className={`shell ${compact ? 'shell--compact' : 'shell--deck'}`}>
      <TopBar />
      <main className="deck" aria-label={mode === 'orbital' ? 'Orbital view' : 'Surface view'}>
        <Viewport />
        {!compact && (
          <>
            <SitePanel />
            <SciencePanel />
          </>
        )}
      </main>
      {compact ? <MobileSheet /> : <TimeDock />}
    </div>
  );
}

export function App() {
  return (
    <DataProvider fallback={(s) => <Boot state={s as never} />}>
      <Workspace />
    </DataProvider>
  );
}
