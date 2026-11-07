import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { EphemerisFile, LandingRegion, SitesFile } from './types';
import { Ephemeris } from '../science/ephemeris';
import { initUrlSync } from '../state/urlSync';
import { useApp } from '../state/store';

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

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: AppData };

const Ctx = createContext<AppData | null>(null);

const url = (p: string) => `${import.meta.env.BASE_URL}${p}`;

async function getJson<T>(p: string): Promise<T> {
  const r = await fetch(url(p));
  if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

export function DataProvider({ children, fallback }: { children: ReactNode; fallback: (s: LoadState) => ReactNode }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    Promise.all([
      getJson<SitesFile>('data/sites.json'),
      getJson<EphemerisFile>('data/ephemeris.json'),
      getJson<ValidationFile>('data/validation.json').catch(() => null),
    ])
      .then(([sites, eph, validation]) => {
        if (!alive) return;
        const ephemeris = new Ephemeris(eph);
        const byId = new Map(sites.regions.map((r) => [r.id, r]));
        initUrlSync(sites.regions.map((r) => r.id));
        // Default epoch: now, clamped to the precomputed coverage.
        const t = useApp.getState().timeMs;
        if (!ephemeris.covers(t)) useApp.setState({ timeMs: ephemeris.clamp(t) });
        setState({
          status: 'ready',
          data: { sites, ephemeris, validation, region: (id) => byId.get(id) ?? sites.regions[0] },
        });
      })
      .catch((e: unknown) => alive && setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, []);
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
      .then((b) => new Float32Array(b));
    terrainCache.set(file, p);
  }
  return p;
}

export const assetUrl = url;
