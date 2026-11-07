import { create } from 'zustand';

export type Mode = 'orbital' | 'surface' | 'analysis';

export interface Scenario {
  regionId: string;
  startMs: number;
  durationDays: number;
}

export interface Layers {
  labels: boolean;
  sunVector: boolean;
  earthVector: boolean;
  horizonLine: boolean;
  /** Surface View display aids */
  enhancedLight: boolean;
  stars: boolean;
  skyGrid: boolean;
  rings: boolean;
  regolith: boolean;
}

interface AppState {
  mode: Mode;
  regionId: string;
  timeMs: number;
  /** Incremented to ask the orbital camera to re-run a focus/reset tween. */
  cameraCommand: { kind: 'focus' | 'global' | 'dive'; seq: number };
  transitioning: boolean;
  layers: Layers;
  scenarios: [Scenario, Scenario];
  setMode: (m: Mode) => void;
  selectRegion: (id: string) => void;
  setTime: (t: number) => void;
  focusRegion: () => void;
  resetCamera: () => void;
  /** Orbital → dive animation → Surface (instant from other modes). */
  enterSurface: () => void;
  setTransitioning: (v: boolean) => void;
  toggleLayer: (k: keyof Layers) => void;
  setScenario: (i: 0 | 1, s: Partial<Scenario>) => void;
}

const DAY = 86_400_000;
const nowHour = () => Math.floor(Date.now() / 3_600_000) * 3_600_000;

export const useApp = create<AppState>((set) => ({
  mode: 'orbital',
  regionId: 'malapert-massif',
  timeMs: nowHour(),
  cameraCommand: { kind: 'global', seq: 0 },
  transitioning: false,
  layers: {
    labels: true,
    sunVector: true,
    earthVector: true,
    horizonLine: true,
    enhancedLight: true,
    stars: true,
    skyGrid: true,
    rings: true,
    regolith: true,
  },
  scenarios: [
    { regionId: 'malapert-massif', startMs: Date.UTC(2027, 0, 1), durationDays: 30 },
    { regionId: 'nobile-rim-1', startMs: Date.UTC(2027, 0, 1), durationDays: 30 },
  ],
  // Choosing a mode explicitly cancels any running Orbital → Surface dive.
  setMode: (mode) => set({ mode, transitioning: false }),
  selectRegion: (regionId) =>
    set((s) => ({ regionId, cameraCommand: { kind: 'focus', seq: s.cameraCommand.seq + 1 } })),
  setTime: (timeMs) => set({ timeMs }),
  focusRegion: () => set((s) => ({ cameraCommand: { kind: 'focus', seq: s.cameraCommand.seq + 1 } })),
  resetCamera: () => set((s) => ({ cameraCommand: { kind: 'global', seq: s.cameraCommand.seq + 1 } })),
  enterSurface: () =>
    set((s) =>
      s.mode === 'orbital'
        ? { transitioning: true, cameraCommand: { kind: 'dive', seq: s.cameraCommand.seq + 1 } }
        : { mode: 'surface' },
    ),
  setTransitioning: (transitioning) => set({ transitioning }),
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  setScenario: (i, patch) =>
    set((s) => {
      const next = [...s.scenarios] as [Scenario, Scenario];
      next[i] = { ...next[i], ...patch };
      return { scenarios: next };
    }),
}));

export { DAY };

/** Surface View look direction (degrees). Kept apart from the main store: it changes while dragging. */
interface LookState {
  yaw: number;
  pitch: number;
  fov: number;
  set: (p: Partial<Pick<LookState, 'yaw' | 'pitch' | 'fov'>>) => void;
}
export const useLook = create<LookState>((set) => ({
  yaw: 0,
  pitch: 4,
  fov: 55,
  set: (p) =>
    set((s) => ({
      yaw: p.yaw !== undefined ? ((p.yaw % 360) + 360) % 360 : s.yaw,
      pitch: p.pitch !== undefined ? Math.max(-30, Math.min(80, p.pitch)) : s.pitch,
      fov: p.fov !== undefined ? Math.max(8, Math.min(80, p.fov)) : s.fov,
    })),
}));
