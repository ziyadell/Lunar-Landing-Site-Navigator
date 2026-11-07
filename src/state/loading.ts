import { create } from 'zustand';

/** What is streaming right now, for the loading indicator. Labels are user-facing. */
interface Loading {
  items: { id: number; label: string }[];
  begin: (label: string) => number;
  end: (id: number) => void;
}
let n = 0;
export const useLoading = create<Loading>((set) => ({
  items: [],
  begin: (label) => {
    const id = ++n;
    set((s) => ({ items: [...s.items, { id, label }] }));
    return id;
  },
  end: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

/** Track a promise under a label. */
export function track<T>(label: string, p: Promise<T>): Promise<T> {
  const id = useLoading.getState().begin(label);
  const done = () => useLoading.getState().end(id);
  p.then(done, done);
  return p;
}

/**
 * Real readiness of the orbital scene (no timers, no fake progress): the full-resolution
 * global maps and the selected region's 100 m imagery. "failed" keeps the usable fallback.
 */
type Ready = 'pending' | 'ready' | 'failed' | 'none';
interface Readiness {
  globe: Ready;
  region: Ready;
  set: (p: Partial<Pick<Readiness, 'globe' | 'region'>>) => void;
}
export const useReadiness = create<Readiness>((set) => ({ globe: 'pending', region: 'pending', set: (p) => set(p) }));

/** Assets that failed to load, each with a retry, for the loading indicator. */
interface Failures {
  items: { key: string; label: string; retry: () => void }[];
}
export const useFailures = create<Failures>(() => ({ items: [] }));
export function reportFailure(key: string, label: string, retry: () => void) {
  useFailures.setState((s) => ({ items: [...s.items.filter((i) => i.key !== key), { key, label, retry }] }));
}
export function clearFailure(key: string) {
  useFailures.setState((s) => ({ items: s.items.filter((i) => i.key !== key) }));
}

if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __readinessState: () => { const { globe, region } = useReadiness.getState(); return { globe, region }; } });
