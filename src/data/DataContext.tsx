import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { EphemerisFile, LandingRegion, SitesFile } from './types';
import { Ephemeris } from '../science/ephemeris';
import { initUrlSync } from '../state/urlSync';
import { useApp } from '../state/store';
import { assetUrl as versioned, checkForUpdate, fetchReleaseJson, ReleaseMismatch } from './release';
import { DataIncompatible, validateEphemeris, validateSites } from './validate';

export interface ValidationFile {
  method: string;
  period: string;
  note: string;
  retrievedUtc: string;
  sites: { id: string; sun: { maxElevErrDeg: number; maxAzErrDeg: number }; earth: { maxElevErrDeg: number; maxAzErrDeg: number } }[];
}

export interface AppData {
  sites: SitesFile;
  ephemeris: Ephemeris;
  validation: ValidationFile | null;
  region: (id: string) => LandingRegion;
}

/** Why the essential data could not be used (each has its own recovery). */
export type DataProblem = 'network' | 'incompatible' | 'updated';
type LoadState = { status: 'loading' } | { status: 'error'; problem: DataProblem; detail: string; retry: () => void } | { status: 'ready'; data: AppData };

const Ctx = createContext<AppData | null>(null);

const url = versioned;

async function getJson<T>(p: string): Promise<T> {
  return fetchReleaseJson<T>(p);
}

/**
 * Essential data (regions + ephemeris) is fetched once per page, even when React StrictMode
 * mounts the provider twice; a failed attempt is forgotten so a reload of the provider retries.
 */
let core: Promise<[SitesFile, EphemerisFile]> | null = null;
function loadCore() {
  core ??= Promise.all([
    getJson<unknown>('data/sites.json').then((raw) => {
      const { sites, dropped } = validateSites(raw);
      if (dropped.length) console.warn('LunaNav data check:', dropped);
      return sites;
    }),
    getJson<unknown>('data/ephemeris.json').then(validateEphemeris),
  ]).catch((e) => {
    core = null;
    throw e;
  });
  return core;
}

/** Optional validation metadata: never blocks the workspace; fetched once it is interactive. */
let validationP: Promise<ValidationFile | null> | null = null;
function loadValidation() {
  validationP ??= getJson<ValidationFile>('data/validation.json').catch(() => {
    validationP = null;
    return null;
  });
  return validationP;
}

const idle = (f: () => void) => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(f, { timeout: 2500 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(f, 800);
  return () => window.clearTimeout(id);
};

export function DataProvider({ children, fallback }: { children: ReactNode; fallback: (s: LoadState) => ReactNode }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const ready = state.status === 'ready';
  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | null = null;
    loadCore()
      .then(([sites, eph]) => {
        if (!alive) return;
        const ephemeris = new Ephemeris(eph);
        const byId = new Map(sites.regions.map((r) => [r.id, r]));
        unsubscribe = initUrlSync(sites.regions.map((r) => r.id));
        // Default epoch: now, clamped to the precomputed coverage.
        const t = useApp.getState().timeMs;
        if (!ephemeris.covers(t)) useApp.setState({ timeMs: ephemeris.clamp(t) });
        setState({
          status: 'ready',
          data: { sites, ephemeris, validation: null, region: (id) => byId.get(id) ?? sites.regions[0] },
        });
      })
      .catch(async (e: unknown) => {
        console.error('LunaNav could not load its data:', e);
        // A mismatch or incompatible file usually means the site was updated while this
        // tab was open (or a cache kept an old file): check before blaming the network.
        const mismatch = e instanceof ReleaseMismatch || e instanceof DataIncompatible;
        const updated = await checkForUpdate();
        if (!alive) return;
        const retry = () => {
          setState({ status: 'loading' });
          setAttempt((a) => a + 1);
        };
        setState({
          status: 'error',
          problem: updated ? 'updated' : mismatch ? 'incompatible' : 'network',
          detail: e instanceof Error ? e.message : String(e),
          retry: updated ? () => window.location.reload() : retry,
        });
      });
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [attempt]);
  // Validation record: after the workspace is interactive, when the browser is idle.
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const cancel = idle(() =>
      void loadValidation().then((validation) => {
        if (alive && validation) setState((s) => (s.status === 'ready' ? { status: 'ready', data: { ...s.data, validation } } : s));
      }),
    );
    return () => {
      alive = false;
      cancel();
    };
  }, [ready]);
  if (state.status !== 'ready') return <>{fallback(state)}</>;
  return <Ctx.Provider value={state.data}>{children}</Ctx.Provider>;
}

export function useData(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData outside DataProvider');
  return v;
}

const terrainCache = new Map<string, Promise<Float32Array>>();
export function loadTerrain(file: string): Promise<Float32Array> {
  let p = terrainCache.get(file);
  if (!p) {
    p = fetch(url(file))
      .then((r) => {
        if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((b) => new Float32Array(b))
      .catch((e) => {
        void checkForUpdate(); // a missing file may mean this tab predates a new release
        // Forget failures so a retry fetches again; successes stay cached.
        if (terrainCache.get(file) === p) terrainCache.delete(file);
        throw e;
      });
    terrainCache.set(file, p);
  }
  return p;
}

export const assetUrl = url;
