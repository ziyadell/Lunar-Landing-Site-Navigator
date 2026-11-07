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
  /** LROC WAC polar mosaic draped on Surface View terrain (measured imagery). */
  albedo: boolean;
}

export type SurfacePreset = 'scientific' | 'clean' | 'realistic';

/**
 * Surface View display presets. Each has one purpose:
 *  - scientific: every measurement annotation; enhanced visibility so shadowed terrain stays readable.
 *  - clean:      the landscape without overlays, for orientation and presentation.
 *  - realistic:  physical lighting only (Sun + faint Earthshine) plus the illustrative fine texture.
 */
export const SURFACE_PRESETS: Record<SurfacePreset, { label: string; hint: string; layers: Partial<Layers> }> = {
  scientific: {
    label: 'Survey',
    hint: 'Every annotation: LOLA skyline, azimuth/elevation grid, range rings.',
    layers: { enhancedLight: true, horizonLine: true, stars: true, skyGrid: true, rings: true, regolith: false, albedo: true },
  },
  clean: {
    label: 'Landscape',
    hint: 'Terrain, Sun, Earth and stars with the measured skyline. Shadowed ground lifted for readability.',
    layers: { enhancedLight: true, horizonLine: true, stars: true, skyGrid: false, rings: false, regolith: true, albedo: true },
  },
  realistic: {
    label: 'Physical',
    hint: 'Sunlight and faint Earthshine only: what an observer would see.',
    layers: { enhancedLight: false, horizonLine: false, stars: true, skyGrid: false, rings: false, regolith: true, albedo: true },
  },
};

export function activePreset(l: Layers): SurfacePreset | null {
  for (const [k, p] of Object.entries(SURFACE_PRESETS) as [SurfacePreset, (typeof SURFACE_PRESETS)[SurfacePreset]][])
    if (Object.entries(p.layers).every(([kk, v]) => l[kk as keyof Layers] === v)) return k;
  return null;
}

const readPanels = (): { left: boolean; right: boolean } => {
  const narrow = typeof window !== 'undefined' && window.innerWidth < 1280;
  try {
    const v = JSON.parse(localStorage.getItem('lsn.panels') ?? 'null');
    if (v && typeof v.left === 'boolean' && typeof v.right === 'boolean') return v;
  } catch {
    /* storage unavailable */
  }
  return { left: !narrow, right: true };
};

/** Secondary surfaces: one contextual drawer at a time. */
export type Drawer = null | 'atlas' | 'details' | 'about';

interface AppState {
  /** Focus mode: only the scene, the time and a way back. */
  focus: boolean;
  setFocus: (v: boolean) => void;
  drawer: Drawer;
  openDrawer: (d: Drawer) => void;
  /** Expanded time sheet (scrubber + visibility strip). */
  timeOpen: boolean;
  setTimeOpen: (v: boolean) => void;
  /** Side panels expanded (true) or collapsed to rails (false). */
  panels: { left: boolean; right: boolean };
  togglePanel: (side: 'left' | 'right') => void;
  mode: Mode;
  regionId: string;
  timeMs: number;
  /** Incremented to ask the orbital camera to re-run a focus/reset tween. */
  cameraCommand: { kind: 'focus' | 'global' | 'dive' | 'pole' | 'point'; seq: number; latDeg?: number; lonDeg?: number; rangeKm?: number };
  transitioning: boolean;
  layers: Layers;
  scenarios: [Scenario, Scenario];
  setMode: (m: Mode) => void;
  selectRegion: (id: string) => void;
  setTime: (t: number) => void;
  focusRegion: () => void;
  resetCamera: () => void;
  /** Regional view of the south-polar cluster. */
  poleCamera: () => void;
  /** Zoom toward an arbitrary surface point (double-click). */
  pointCamera: (latDeg: number, lonDeg: number) => void;
  /** Button / keyboard zoom: factor < 1 zooms in. */
  zoomCommand: { factor: number; seq: number };
  zoomCamera: (factor: number) => void;
  /** Orbital → dive animation → Surface (instant from other modes). */
  enterSurface: () => void;
  setTransitioning: (v: boolean) => void;
  toggleLayer: (k: keyof Layers) => void;
  applyPreset: (p: SurfacePreset) => void;
  setScenario: (i: 0 | 1, s: Partial<Scenario>) => void;
}

const DAY = 86_400_000;
const nowHour = () => Math.floor(Date.now() / 3_600_000) * 3_600_000;

export const useApp = create<AppState>((set) => ({
  focus: false,
  setFocus: (focus) => set(focus ? { focus, drawer: null, timeOpen: false } : { focus }),
  drawer: null,
  openDrawer: (drawer) => set((s) => ({ drawer: s.drawer === drawer ? null : drawer, focus: drawer ? false : s.focus })),
  timeOpen: false,
  setTimeOpen: (timeOpen) => set({ timeOpen }),
  panels: readPanels(),
  togglePanel: (side) =>
    set((s) => {
      const panels = { ...s.panels, [side]: !s.panels[side] };
      try {
        localStorage.setItem('lsn.panels', JSON.stringify(panels));
      } catch {
        /* ignore */
      }
      return { panels };
    }),
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
    skyGrid: false,
    rings: false,
    regolith: true,
    albedo: true,
  },
  scenarios: [
    { regionId: 'malapert-massif', startMs: Date.UTC(2027, 0, 1), durationDays: 30 },
    { regionId: 'nobile-rim-1', startMs: Date.UTC(2027, 0, 1), durationDays: 30 },
  ],
  // Choosing a mode explicitly cancels any running Orbital → Surface dive.
  setMode: (mode) => set({ mode, transitioning: false, timeOpen: false }),
  selectRegion: (regionId) =>
    set((s) => ({ regionId, cameraCommand: { kind: 'focus', seq: s.cameraCommand.seq + 1 } })),
  setTime: (timeMs) => set({ timeMs }),
  focusRegion: () => set((s) => ({ cameraCommand: { kind: 'focus', seq: s.cameraCommand.seq + 1 } })),
  resetCamera: () => set((s) => ({ cameraCommand: { kind: 'global', seq: s.cameraCommand.seq + 1 } })),
  poleCamera: () => set((s) => ({ cameraCommand: { kind: 'pole', seq: s.cameraCommand.seq + 1 } })),
  zoomCommand: { factor: 1, seq: 0 },
  zoomCamera: (factor) => set((s) => ({ zoomCommand: { factor, seq: s.zoomCommand.seq + 1 } })),
  pointCamera: (latDeg, lonDeg) => set((s) => ({ cameraCommand: { kind: 'point', seq: s.cameraCommand.seq + 1, latDeg, lonDeg } })),
  enterSurface: () =>
    set((s) =>
      s.mode === 'orbital'
        ? { transitioning: true, cameraCommand: { kind: 'dive', seq: s.cameraCommand.seq + 1 } }
        : { mode: 'surface' },
    ),
  setTransitioning: (transitioning) => set({ transitioning }),
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  applyPreset: (p) => set((s) => ({ layers: { ...s.layers, ...SURFACE_PRESETS[p].layers } })),
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

if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __app: typeof useApp }).__app = useApp;
